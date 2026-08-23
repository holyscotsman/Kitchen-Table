# The import server

This is the only part of Kitchen Table that runs on a server. The site itself
is static files on GitHub Pages and keeps working instantly whether or not
this server is awake — exactly as ruled: *only the video conversion lives on
Render, not the whole app.*

What it does: someone pastes a YouTube or Instagram link on the Add screen,
this server fetches the video, listens to it (Groq Whisper), reads its
on-screen text (frames → the Anthropic API), and writes up a draft recipe with anything
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
   - `KT_DAY_CAP` — optional. Video imports allowed in any 24 hours,
     default 40. It exists to bound what the keys above can be made to
     spend; family use never reaches it.
   - `YT_API_KEY` — optional but strongly wanted: **this is what rescues
     YouTube imports the robot wall blocks** (see below). Free, ~2 minutes:
     console.cloud.google.com → create a project (any name) → APIs &
     Services → Library → enable **YouTube Data API v3** → Credentials →
     **Create credentials → API key** → copy it here. No billing account
     needed; the free quota (10,000 lookups/day) is thousands of times
     family scale.
   - `KT_WRITE_KEY` — **the family passphrase.** Set this and an edit made
     on any phone can be saved for everyone; leave it unset and nobody can,
     which is the safe direction for an unset value. Pick something a person
     can type on a phone — three or four words is plenty — and give it to
     the family, not to this chat. Anyone who has it can change any recipe;
     it is a house key, not a login, and it names nobody (`contributor`
     stays a byline, never a credential).
   - `KT_GH_TOKEN` — optional. A GitHub token with **Actions: write** on
     this repo. With it, a saved edit asks `db-sync` to run and the family
     sees the change in a few minutes; without it the change still lands in
     the database and appears at the nightly sync instead. A fine-grained
     token scoped to this one repository is enough.

     A token that later expires does not announce itself — the write still
     succeeds and the change still reaches the family, just overnight
     instead of in minutes. `/api/health` is where to look: `last_publish_s`
     is how long ago a publish actually landed and `last_publish_error` is
     why the most recent one did not. Both `null` on a server that has just
     woken up is normal; an error sitting there is the token to check.
2. **Settings → Build & Deploy** → confirm **Build Command** is `yarn` and
   **Start Command** is `yarn start`. Leave **Root Directory** empty.
3. **Manual Deploy → Deploy latest commit.** The build fetches yt-dlp and
   ffmpeg (static builds, ~100MB) — first build takes a few minutes.

Check it worked: open `https://kitchen-table-5tp6.onrender.com/api/health` —
you should see `{"ok":true,…}`.

**After this branch merges to `main`:** Settings → Build & Deploy → change
**Branch** to `main`, so the server follows the same code the site serves.

## `KT_DB` has two homes, and the order they are filled in matters

This is the one part of the setup where doing half of it is worse than doing
none, so it is written out rather than left to be inferred from the two lists
above.

- **Render's `KT_DB`** lets the import server read and write the database.
- **The GitHub Actions secret `KT_DB`** (repo Settings → Secrets and
  variables → Actions) is what lets the nightly `db-sync` turn the database
  back into `recipes.json` and commit it. It is a *separate* value to set,
  in a different place, and nothing about setting the Render one implies it.

**Set the Actions secret before — or at the same time as — `KT_WRITE_KEY`.**
With `KT_WRITE_KEY` set and the Actions secret missing, every edit a phone
shares lands in the database and stops there: saved, reported saved, and
invisible to the family for as long as it takes somebody to notice. That is
not hypothetical — `db-sync.yml`'s own warning exists because exactly this
went unnoticed for a fortnight while video imports piled up.

**How to tell, in ten seconds, without guessing:**

- `https://kitchen-table-5tp6.onrender.com/api/health` — `accepts_changes`
  is `KT_WRITE_KEY`; `publishes_on_change` is `KT_GH_TOKEN`; anything still
  missing is named in `missing`.
- Actions tab → **db-sync** → the most recent run. A run that never read the
  database still reports **success** — that is the point of the warning, not
  a bug — so open the run and look at its summary. "⚠️ Skipped: `KT_DB`
  secret is not set" and a *Compare database and file* step that finishes in
  under a second both mean the secret is missing.

**And a hazard while the repository's default branch is not `main`.**
Scheduled workflows run on the default branch, so `db-sync` checks out that
branch and commits `recipes.json` to it. The working branch gets
force-pushed to realign after every squash-merge, which would silently
destroy a sync commit that landed in between. Setting the default branch to
`main` (Settings → General → Default branch) removes it, and is the same
change the Render **Branch** note above asks for.

## Whitespace around a pasted value

Every environment variable this server reads is trimmed (`backend/lib/env.js`),
so a value that arrives from the clipboard with a trailing newline or space —
the ordinary way a pasted secret gets mangled — still works. That was worth
fixing rather than warning about: read raw, a `KT_WRITE_KEY` with a stray
newline refuses every phone's correct passphrase forever, with the sentence
written for a *wrong* one, while `/api/health` goes on reporting
`accepts_changes: true`. It is the same half-configured shape as the section
above, and just as quiet.

## Rotating the Neon password

Do — it was pasted in chat once:
Neon console → reset password, then update the value in two places — this
service's `KT_DB` env var, and the GitHub Actions secret `KT_DB`
(repo Settings → Secrets and variables → Actions) used by the nightly sync.

## How the free tier behaves (expected, not broken)

- The instance **spins down after ~15 min idle** and takes ~30–60s to wake.
  The app knows: submitting shows "waking up the kitchen…" rather than an
  error, and for background jobs the wake-up is just part of the processing
  time.
- **YouTube treats datacenter addresses as suspects.** It answers ordinary
  videos with "Sign in to confirm you're not a bot" — about the server,
  never the video. Three layers respond, in order:
  1. The build installs the community
     [PO-token provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider)
     (plugin + token server, pinned to one release tag): the server runs
     as a supervised sibling process on port 4416 (`KT_POT_PORT` to move
     it, `KT_NO_POT=1` to disable), mints YouTube's proof-of-origin
     tokens locally — no login, no cookies — and every yt-dlp call
     presents them. `/api/health` reports it as `pot_provider`.
  2. Calls that still hit the robot check retry as YouTube's TV client
     (which passes many genuine age gates too).
  3. When every disguise is refused, the **official Data API** takes over
     (`YT_API_KEY`, above — the one route YouTube designed for servers):
     title, full description, and duration for any video. Most cooking
     channels write the whole recipe in the description, so this turns a
     blocked import into a finished draft — flagged honestly, since no
     narration or on-screen text was read. Videos with neither captions
     reachable nor a written-out description still fail, with advice
     that names the paste box and the screen-record path.
  What the wall costs, measured live: an ancient video sailed through
  layer 1; a current cooking upload needed layer 3. This is YouTube
  churning its defenses, not a bug in any one part.
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
| `GET /api/health` | `{ok, uptime_s, queue_pending, accepts_changes, publishes_on_change, last_publish_s, last_publish_error}` — also the wake-up ping |
| `POST /api/import/video` `{url, contributor?}` | validates YouTube/Instagram, inserts a `queued` job, returns `{job_id}` immediately — refuses with 429 past 40 imports in 24 hours (`KT_DAY_CAP`) |
| `GET /api/import/jobs/:id` | status, human stage label, `eta_seconds`, `overrun`, and `result_json` once ready |
| `GET /api/import/jobs?status=ready_for_review` | finished imports awaiting review (the Add screen's badge) |
| `GET /api/import/jobs?status=failed` | recent failures (3 days, capped at 20) so an import that died unwatched is still owed a sentence |
| `POST /api/import/jobs/:id/accept` `{recipe}` | claims the job with one conditional update, then writes the reviewed recipe into the database. Two people accepting the same draft is a tie, not a duplicate: the loser gets `{ok:true, id:null}` |

Job pipeline: `queued → downloading → transcribing → extracting →
ready_for_review → imported`, any failure → `failed` with a plain-language
message. Cheap paths first: a recipe written in the description costs
nothing; captions cost one small fetch; only a video with neither is
downloaded (audio → Groq Whisper; ~40 deduped frames → the Anthropic API). Videos over
30 minutes are refused. All media is deleted the moment extraction ends,
success or failure.

## Checked without a database

`tests/backend.js` starts this server for real — no `KT_DB`, no keys, no
network — and talks to it over HTTP. That is possible because of a design
choice worth keeping: **without a database the server boots anyway** and
answers 503 with a sentence, rather than crash-looping a red deploy. So the
router, the status codes, the hardening headers and the rate limiter are
checked by being *used*, not by being read (`R41`).

## What this API trusts

There is no login anywhere in Kitchen Table, and this server doesn't invent
one. Anyone with the URL can submit a public video link, poll job state, and
accept a finished draft into the database — that is the same trust model as
the site itself (CLAUDE.md: contributor names are labels, not
authentication). What bounds it: the server only does the three things
above, one import runs at a time with a short queue cap, accepted recipes
go through the same validation as `db/migrate.js`, and an id collision
suffixes rather than overwrites, so nothing can be silently replaced.
`PUT /api/recipes/:id` is the exception that proves it: an **edit** must
land on the row it names, so it overwrites on purpose — but a recipe being
**created** says `?new=1`, and that takes the same suffixing rule as an
import, because its id was minted by a phone against its own copy of the
book and may belong to somebody else's recipe by now. The reply carries the
id actually used, so the phone can address its next edit at its own row.
Accepting is claim-then-write: the ready-for-review list is shared on
purpose, so two people can be looking at the same finished draft and both
press Save, and one conditional update decides it rather than both
inserting. If the write then fails the claim is handed back, because a job
marked `imported` with no recipe behind it is work quietly lost. If
real access control is ever wanted, that's the gameplan's backend-gate
conversation, not a patch here.

**What bounds the bill** is separate, and worth saying plainly, because
every other limit here bounds a *burst* rather than a total: 120 requests
a minute per address, eight jobs queued at once.

*Per address* means something specific, and it was wrong until `R81`.
`X-Forwarded-For` is a list the **client** can start and every proxy
appends to, so what reaches this server is
`<whatever the caller sent>, <what the proxy actually saw>`. Keying the
limiter on the leftmost entry keys it on the half the caller wrote: a
rotating fake header gave a hostile loop a fresh bucket on every request,
and the wall was never met. The last entry is the one the trusted proxy
appended, and that is what the limiter keys on now. **That assumes exactly
one proxy hop** — browser → Render → here, which is this deployment. Put a
CDN in front and the last entry becomes the CDN's edge address, shared by
everybody, so that change means counting hops rather than taking the end.
Both directions are held by tests: the forged header must not walk around
the wall, and one visitor hitting it must not wall their neighbour (which
is what ignoring the header altogether would do, since behind one proxy
that leaves a single address for the whole family). None of those stops a
patient stranger submitting one link every thirty seconds forever, and
each import spends real money on the keys in Render's dashboard. So a
day's importing is capped — **40 in any 24 hours**, counted in the
database (an in-memory tally would reset on every spin-down and forgive
anyone willing to wait). `KT_DAY_CAP` moves it.

That cap bounds the **money**. It does not, on its own, stop one stranger
spending the whole forty and leaving the family locked out of their own
importer until tomorrow — so since `R91` a single caller may take at most
**15 of the day's 40** (`KT_CALLER_DAY_CAP` moves it), which always leaves
at least 25 for everybody else. That one is a *fairness* valve rather than
a spending wall, so it is counted in memory: a spin-down forgiving someone
costs nothing, because the forty is still counted in the database either
way. It is only worth building because of `R81` — before that the caller
key was the leftmost `X-Forwarded-For` entry, so anyone could rotate a
header and be a new caller on every request. It is deliberately generous,
because a household shares one address. Past the cap the answer
is a plain sentence pointing at the two ways in that never touch the
server at all — typing a recipe in, and importing from a photo — and the
importer opens again as the day rolls forward. A count the server cannot
read lets the import through: this wall is for a stranger's spending, not
for the server's own confusion.
