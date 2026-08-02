# The import server

This is the only part of Kitchen Table that runs on a server. The site itself
is static files on GitHub Pages and keeps working instantly whether or not
this server is awake — exactly as ruled: *only the video conversion lives on
Render, not the whole app.*

What it does: someone pastes a YouTube or Instagram link on the Add screen,
this server fetches the video, listens to it (Groq Whisper), reads its
on-screen text (frames → Claude), and writes up a draft recipe with anything
uncertain flagged. The draft lands on the same review screen every other
import uses — nothing is ever saved without a person checking it. The phone
can be closed the whole time; the finished draft waits under **Imports**.

## Fixing the Render deploy (one-time, ~2 minutes)

The service already exists (`kitchen-table-5tp6.onrender.com`) and its
**Start Command — `yarn start` — was right all along**; it failed only
because this folder didn't exist yet. With this code on the deployed branch:

1. **Environment tab** → add three variables (values only here, never in
   the repo or in chat):
   - `KT_DB` — the Neon Postgres connection string (Neon console →
     your project → Connect). `DATABASE_URL` works too if you prefer
     Render's convention.
   - `ANTHROPIC_API_KEY` — from console.anthropic.com.
   - `GROQ_API_KEY` — from console.groq.com (free). Optional but wanted:
     without it, videos with no captions get read from on-screen text only.
2. **Settings → Build & Deploy** → confirm **Build Command** is `yarn` and
   **Start Command** is `yarn start`. Leave **Root Directory** empty.
3. **Manual Deploy → Deploy latest commit.** The build fetches yt-dlp and
   ffmpeg (static builds, ~100MB) — first build takes a few minutes.

Check it worked: open `https://kitchen-table-5tp6.onrender.com/api/health` —
you should see `{"ok":true,…}`.

**After this branch merges to `main`:** Settings → Build & Deploy → change
**Branch** to `main`, so the server follows the same code the site serves.

**When rotating the Neon password** (do, since it was pasted in chat once):
Neon console → reset password, then update the value in two places — this
service's `KT_DB` env var, and the GitHub Actions secret `KT_DB`
(repo Settings → Secrets and variables → Actions) used by the nightly sync.

## How the free tier behaves (expected, not broken)

- The instance **spins down after ~15 min idle** and takes ~30–60s to wake.
  The app knows: submitting shows "waking up the kitchen…" rather than an
  error, and for background jobs the wake-up is just part of the processing
  time.
- **Deploys and spin-downs restart the process.** A job caught mid-import is
  marked failed with "The server restarted mid-import — please resubmit the
  link." Queued-but-unstarted jobs simply resume. Nothing gets stuck.
- Cost: **$0.** Imports cost pennies of Anthropic API usage each; Groq's
  free tier covers transcription at family scale.

## Running it anywhere else

Native (needs node ≥20; yt-dlp and ffmpeg on PATH or in `backend/bin/` via
`get-tools.sh`):

    cd backend && npm install
    KT_DB=… ANTHROPIC_API_KEY=… GROQ_API_KEY=… node server.js

Docker (tools baked in; build from the **repo root** — the server applies
`db/schema.sql` at boot, and that file has exactly one home):

    docker build -f backend/Dockerfile -t kt-import .
    docker run -p 8787:8787 -e KT_DB=… -e ANTHROPIC_API_KEY=… kt-import

## The API

| Route | What it does |
|---|---|
| `GET /api/health` | `{ok, uptime_s, queue_pending}` — also the wake-up ping |
| `POST /api/import/video` `{url, contributor?}` | validates YouTube/Instagram, inserts a `queued` job, returns `{job_id}` immediately |
| `GET /api/import/jobs/:id` | status, human stage label, `eta_seconds`, `overrun`, and `result_json` once ready |
| `GET /api/import/jobs?status=ready_for_review` | finished imports awaiting review (the Add screen's badge) |
| `POST /api/import/jobs/:id/accept` `{recipe}` | writes the reviewed recipe into the database, marks the job `imported` |

Job pipeline: `queued → downloading → transcribing → extracting →
ready_for_review → imported`, any failure → `failed` with a plain-language
message. Cheap paths first: a recipe written in the description costs
nothing; captions cost one small fetch; only a video with neither is
downloaded (audio → Groq Whisper; ~40 deduped frames → Claude). Videos over
30 minutes are refused. All media is deleted the moment extraction ends,
success or failure.

## What this API trusts

There is no login anywhere in Kitchen Table, and this server doesn't invent
one. Anyone with the URL can submit a public video link, poll job state, and
accept a finished draft into the database — that is the same trust model as
the site itself (CLAUDE.md: contributor names are labels, not
authentication). What bounds it: the server only does the three things
above, one import runs at a time with a short queue cap, accepted recipes
go through the same validation as `db/migrate.js`, and an id collision
suffixes rather than overwrites, so nothing can be silently replaced. If
real access control is ever wanted, that's the gameplan's backend-gate
conversation, not a patch here.
