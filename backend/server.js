/* Kitchen Table — the import server. The only part of the app that lives on
 * Render: the static site stays on GitHub Pages and works without this
 * process existing; everything here is the video-import path and nothing
 * else. Vanilla node http, same no-framework ethos as the site — four
 * routes don't need Express.
 *
 * Env (set in Render's dashboard, never in this repo):
 *   KT_DB (or DATABASE_URL)  Neon Postgres connection string
 *   ANTHROPIC_API_KEY        recipe extraction
 *   GROQ_API_KEY             audio transcription (optional but wanted —
 *                            without it, caption-less videos are read from
 *                            frames only)
 */
"use strict";

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const { parseVideoUrl, validateRecipe } = require("./lib/validate");
const { LABEL, estimate } = require("./lib/eta");
const { serialQueue } = require("./lib/queue");
const { makeLimiter } = require("./lib/ratelimit");
const budget = require("./lib/budget");
const db = require("./lib/db");
const { makePublisher } = require("./lib/publish");
const { makeWriteGate } = require("./lib/writegate");
const { runJob } = require("./lib/pipeline");
const { freeRecipeId } = require("./lib/ids");
const { envStr } = require("./lib/env");

const PORT = parseInt(envStr("PORT"), 10) || 8787;
const MAX_QUEUE = 8;

/* Boot without the database rather than crash-looping the deploy: a service
 * waiting on its env vars shows a green deploy and a health endpoint that
 * says exactly what's missing, instead of a red dashboard and a stack
 * trace. Every import route answers 503 with the same plain sentence. */
let sql = null;
try { sql = db.getSql(); }
catch (e) { console.error("boot: " + e.message + " Imports are off until it is set."); }
const queue = serialQueue();

let anthropic = null;
if (envStr("ANTHROPIC_API_KEY")) {
  const Anthropic = require("@anthropic-ai/sdk");
  /* Passed rather than left to the SDK, which would read the raw variable
     back out of the environment and undo the trim (`R158`). */
  anthropic = new Anthropic({ apiKey: envStr("ANTHROPIC_API_KEY"), maxRetries: 2 });
}

const ctx = {
  sql,
  anthropic,
  groqKey: envStr("GROQ_API_KEY"),
  ytKey: envStr("YT_API_KEY"),
  uptimeS: () => process.uptime()
};

/* The PO-token server (see get-tools.sh): a sibling node process that mints
 * the proof-of-origin tokens which stop YouTube treating this datacenter
 * address as a robot. Supervised simply — a crash respawns with backoff,
 * and if it keeps dying, imports continue without tokens (the client-
 * rotation fallback still applies). KT_NO_POT=1 turns it all off. */
let potUp = false;
function startPotServer() {
  const main = path.join(__dirname, "potserver", "server", "build", "main.js");
  if (envStr("KT_NO_POT") || !fs.existsSync(main)) return;
  let tries = 0;
  (function up() {
    const cp = spawn(process.execPath,
      [main, "--port", envStr("KT_POT_PORT") || "4416"],
      { stdio: ["ignore", "inherit", "inherit"] });
    potUp = true;
    cp.on("exit", (code) => {
      potUp = false;
      tries++;
      if (tries <= 5) setTimeout(up, 2000 * tries);
      else console.error("pot server kept dying (last code " + code +
        ") — imports continue without PO tokens");
    });
  })();
}

/* ---------------------------------------------------------------- helpers */

function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    /* The API is open to the family's static site wherever it's viewed
     * from; there are no cookies and no credentials to protect. What the
     * API can DO is bounded instead: submit a public video link, read job
     * state, accept a finished draft. */
    "access-control-allow-origin": "*",
    /* Hardening that costs nothing: answers are JSON and say so firmly,
     * carry no referrer anywhere, and never linger in a shared cache —
     * a finished draft is the family's, not an intermediary's. */
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cache-control": "no-store"
  });
  res.end(text);
}

/* One request budget per caller address: generous against the app's own
 * polling, a wall against loops. Render terminates TLS in front of us, so
 * the caller is the first hop of x-forwarded-for. */
const limiter = makeLimiter(120, 60000);

/* `R91` — the same key, a longer window. The day cap in the database bounds
 * what a day can COST; this bounds what one caller can take of it, so a
 * stranger cannot spend the whole forty and leave the family locked out of
 * their own importer. Counted in memory on purpose: a spin-down forgiving
 * someone costs nothing here, because the money is still walled by the cap
 * that is counted in the database. */
const callerDay = makeLimiter(budget.CALLER_DAY_CAP, 24 * 60 * 60 * 1000);
/* The comment above stale-guards itself: this must stay the trusted key
 * from callerIp(), which R81 moved to the proxy-appended hop. */
/* The RIGHTMOST entry, not the leftmost (`R81`). X-Forwarded-For is a list
 * the *client* can start and every proxy appends to, so what arrives here is
 * `<whatever the caller sent>, <what the proxy actually saw>`. The leftmost
 * entry is therefore written by the caller: keying the rate limiter on it
 * hands a hostile loop a fresh bucket for every forged header, and the wall
 * — the only thing between a script and a paid Whisper call plus a paid
 * model call, per video — is never met.
 *
 * The last entry is the one the trusted proxy in front of this server
 * appended, which makes it the only one worth keying on. That assumes
 * exactly one such hop, which is this deployment: the browser talks to
 * Render and Render talks to us. Putting a CDN in front would add a hop and
 * make the last entry the CDN's edge rather than the visitor, at which point
 * this needs to count hops instead of taking the end.
 *
 * With no header at all, the socket address is the truth. */
function callerIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) {
    const hops = String(fwd).split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return (req.socket && req.socket.remoteAddress) || "?";
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 300 * 1024) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); }
      catch (e) { reject(new Error("bad JSON")); }
    });
    req.on("error", reject);
  });
}

function jobPublic(row, uptimeS) {
  const { eta, overrun } = estimate(
    row.status, row.stage_started_at, row.video_duration_s, uptimeS, Date.now());
  const out = {
    id: row.id,
    status: row.status,
    stage: LABEL[row.status] || row.status,
    eta_seconds: eta,
    overrun,
    platform: row.platform,
    url: row.url,
    video_duration_s: row.video_duration_s,
    created_at: row.created_at
  };
  if (row.status === "failed") {
    out.error_message = row.error_message;
    /* The tool's own last words, for diagnosing YouTube-defense shifts
     * from the job row. The app ignores this field. */
    if (row.result_json && row.result_json.debug) out.debug = row.result_json.debug;
  }
  if (row.status === "ready_for_review") out.result_json = row.result_json;
  return out;
}

/* ----------------------------------------------------------------- routes */

/* A body the server cannot read is the caller's mistake, not a server
 * error: 400 with the reason, never a 500 that reads like the kitchen fell
 * over. Returns null when it has already answered. */
async function bodyOr400(req, res) {
  try { return await readJson(req); }
  catch (e) {
    send(res, 400, { error: "That request body could not be read (" + e.message + ")." });
    return null;
  }
}

async function postVideo(req, res) {
  const body = await bodyOr400(req, res);
  if (!body) return;
  const parsed = parseVideoUrl(body.url);
  if (parsed.error) return send(res, 400, { error: parsed.error });
  if (!anthropic) {
    return send(res, 503, { error: "The kitchen server isn’t fully set up yet — its recipe-writing key is missing." });
  }
  if (queue.size() >= MAX_QUEUE) {
    return send(res, 429, { error: "The kitchen is busy right now — try again in a few minutes." });
  }
  /* The queue bounds how much runs at once; this bounds what a day can
   * cost. Counted in the database because the free tier spins down, and an
   * in-memory tally would forgive anyone patient enough to wait it out. */
  const usedToday = await sql`
    select count(*)::int as n from kitchen.import_jobs
     where created_at > now() - interval '24 hours'`;
  const capped = budget.dayCapMessage(usedToday[0] && usedToday[0].n);
  if (capped) return send(res, 429, { error: capped });
  /* And the caller's own share of that day (`R91`). Asked after the day cap
   * so that when the kitchen really is closed, everybody hears the same
   * sentence — being told "this phone is resting" while the whole importer
   * is down would be a lie by omission. */
  if (!callerDay.hit(callerIp(req), Date.now())) {
    return send(res, 429, {
      error: budget.callerDayMessage(budget.CALLER_DAY_CAP, budget.CALLER_DAY_CAP)
    });
  }
  const contributor = typeof body.contributor === "string"
    ? body.contributor.trim().slice(0, 60) : null;
  const rows = await sql`
    insert into kitchen.import_jobs (url, platform, contributor)
    values (${parsed.url}, ${parsed.platform}, ${contributor || null})
    returning id`;
  const id = rows[0].id;
  queue.push(() => runJob(ctx, id));
  send(res, 202, { job_id: id });
}

async function getJob(req, res, id) {
  const rows = await sql`select * from kitchen.import_jobs where id = ${id}`;
  if (!rows[0]) return send(res, 404, { error: "no such import" });
  send(res, 200, jobPublic(rows[0], ctx.uptimeS()));
}

async function listJobs(req, res, query) {
  /* Two filters, both the app's own — this is not a general query API.
   * `failed` exists because an import that dies while the phone is away
   * would otherwise be invisible: the Add screen surfaces it with its
   * plain-language reason instead of silently losing the submission. */
  const status = query.get("status");
  if (status !== "ready_for_review" && status !== "failed") {
    return send(res, 400, { error: "only status=ready_for_review or status=failed can be listed" });
  }
  if (status === "failed") {
    const rows = await sql`
      select id, url, platform, created_at, error_message
        from kitchen.import_jobs
       where status = 'failed'
         and updated_at > now() - interval '3 days'
       order by created_at desc
       limit 20`;
    return send(res, 200, { jobs: rows });
  }
  const rows = await sql`
    select id, url, platform, created_at, result_json->>'title' as title
      from kitchen.import_jobs
     where status = 'ready_for_review'
     order by created_at desc
     limit 50`;
  send(res, 200, { jobs: rows });
}

async function acceptJob(req, res, id) {
  const rows = await sql`select * from kitchen.import_jobs where id = ${id}`;
  const job = rows[0];
  if (!job) return send(res, 404, { error: "no such import" });
  if (job.status === "imported") return send(res, 200, { ok: true, id: null });
  if (job.status !== "ready_for_review") {
    return send(res, 409, { error: "that import isn’t ready to accept (status: " + job.status + ")" });
  }
  const body = await bodyOr400(req, res);
  if (!body) return;
  const v = validateRecipe(body.recipe);
  if (v.error) return send(res, 400, { error: v.error });
  const r = v.recipe;

  /* Claim the job before writing anything. The ready-for-review list is
   * shared on purpose — someone else's finished import is family news — so
   * two people can be looking at the same draft and both press Save. Reading
   * the status and then inserting lets both through: both see
   * ready_for_review, both insert, and the id collision below suffixes
   * rather than overwrites, leaving the family a duplicate to find and
   * delete. One conditional update decides it instead. */
  const claimed = await sql`
    update kitchen.import_jobs
       set status = 'imported', updated_at = now()
     where id = ${id} and status = 'ready_for_review'
     returning id`;
  if (!claimed.length) {
    /* Someone else got there first, which is not an error: the recipe they
     * accepted is the same one, and it is already in. */
    return send(res, 200, { ok: true, id: null });
  }

  try {
    /* The phone chose the id against its own copy of the book; another device
     * may have taken it since. Suffix rather than overwrite — a duplicate the
     * family can see and delete beats a recipe silently replaced.
     *
     * `R127` moved that rule into `lib/ids` so the write endpoint could
     * follow it too, for a recipe typed in rather than imported. It is the
     * same situation and must not be answered two different ways. */
    const id2 = await freeRecipeId(sql, r.id);

    await sql`insert into kitchen.contributors (name) values (${r.contributor})
              on conflict (name) do nothing`;
    await sql`
      insert into kitchen.recipes
        (id, title, category, contributor_id, servings, prep_time, cook_time,
         ingredients, steps, notes, flagged, source, image, position)
      values
        (${id2}, ${r.title}, ${r.category},
         (select id from kitchen.contributors where name = ${r.contributor}),
         ${r.servings}, ${r.prepTime || null}, ${r.cookTime || null},
         ${JSON.stringify(r.ingredients)}, ${JSON.stringify(r.steps)},
         ${r.notes || null}, ${JSON.stringify(r.flagged)},
         ${r.source || null}, ${r.image || null},
         (select coalesce(max(position), -1) + 1 from kitchen.recipes))`;
    for (const t of r.tags) {
      await sql`insert into kitchen.tags (name) values (${t}) on conflict (name) do nothing`;
      await sql`insert into kitchen.recipe_tags (recipe_id, tag_id)
                values (${id2}, (select id from kitchen.tags where name = ${t}))
                on conflict do nothing`;
    }
    send(res, 200, { ok: true, id: id2 });
  } catch (e) {
    /* The claim is only good if the write follows it. Hand the draft back to
     * the review screen rather than eating it — a job stuck on 'imported'
     * with no recipe behind it is work quietly lost. */
    await sql`update kitchen.import_jobs
                 set status = 'ready_for_review', updated_at = now()
               where id = ${id}`.catch(() => {});
    throw e;
  }
}

/* The write gate lives in lib/writegate.js so it can be proved rather than
 * trusted. Ten wrong answers an hour per caller; no key configured means no
 * writes from anybody, which is the safe direction for the unset state. */
const writeGate = makeWriteGate(envStr("KT_WRITE_KEY"),
  makeLimiter(10, 60 * 60 * 1000));

/* What turns a write into something everyone can see. See lib/publish.js:
 * a failed poke never fails the write, because the recipe is already in the
 * database and the nightly run will publish it either way. */
const publisher = makePublisher({
  token: envStr("KT_GH_TOKEN"),
  repo: envStr("KT_REPO") || "holyscotsman/Kitchen-Table",
  log: (m) => console.log(m)
});

/* --------------------------------------------------------------- an edit
 *
 * The one thing the import path deliberately will not do. `acceptJob`
 * suffixes on an id collision because two people accepting the same draft
 * must not silently replace each other's work — there, a duplicate the
 * family can see beats a recipe quietly gone.
 *
 * An edit is the opposite instruction. Someone opened THIS recipe, changed
 * it and pressed Save; writing it anywhere but over that row would be the
 * bug. So this overwrites by id, and the id is taken from the PATH — the
 * body may not redirect the write somewhere else, which is how an edit to
 * one recipe would land on another.
 *
 * `R127` — and BOTH instructions arrive here. `S09` routed a newly typed
 * recipe through the same call as an edit, and a create is `acceptJob`'s
 * situation, not this one: its id was minted by the phone against its own
 * copy of the book, so an id already in use belongs to somebody else's
 * recipe and overwriting it destroys one. `?new=1` says which of the two
 * this is; a create suffixes through the same `freeRecipeId` the import
 * path uses, and answers with the id it actually used so the phone can
 * address the NEXT write at its own row rather than the stranger's.
 *
 * Upsert rather than update: a recipe that only lives in recipes.json and
 * has never been through the database is the normal state of all 48 of
 * them, and editing one is not a reason to fail.
 */
/* `more` means "this write is one of a burst — do not publish yet". The
   app sets it on every recipe of a bulk tag change except the last, so the
   republish that follows reads a database holding the WHOLE change. Without
   it the first write of a 48-recipe burst fires the poke, and whether the
   other 47 made it into the file depends on a race between Neon and a
   GitHub runner starting up. A phone that closes mid-burst simply never
   pokes, and the nightly sync picks the change up — late, never wrong,
   which is the direction this app errs in. */
async function putRecipe(req, res, id, more, isNew) {
  const refusal = writeGate.refusalFor(req.headers, callerIp(req), Date.now());
  if (refusal) return send(res, refusal.status, { error: refusal.error });

  const body = await bodyOr400(req, res);
  if (!body) return;
  const v = validateRecipe(body.recipe);
  if (v.error) return send(res, 400, { error: v.error });
  const r = v.recipe;
  if (r.id !== id) {
    return send(res, 400, { error: "that recipe says it is " + r.id + ", but the address says " + id });
  }

  await sql`insert into kitchen.contributors (name) values (${r.contributor})
            on conflict (name) do nothing`;

  /* A create takes a free id; an edit takes the one in the address. The
     `where ... = 1` on the conflict clause is what makes that binding: with
     0 the row already there is left exactly as it is and nothing comes back
     from `returning`, which is the only way a create can be certain it did
     not overwrite. A create that comes back empty lost a race — someone
     else took the id in the milliseconds since the check — so it looks for
     a free one again rather than pretending. */
  let rowId = r.id;
  let landed = false;
  for (let tries = 0; tries < 6 && !landed; tries++) {
    if (isNew) rowId = await freeRecipeId(sql, r.id);
    landed = (await sql`
    insert into kitchen.recipes
      (id, title, category, contributor_id, servings, prep_time, cook_time,
       ingredients, steps, notes, flagged, source, image, position)
    values
      (${rowId}, ${r.title}, ${r.category},
       (select id from kitchen.contributors where name = ${r.contributor}),
       ${r.servings}, ${r.prepTime || null}, ${r.cookTime || null},
       ${JSON.stringify(r.ingredients)}, ${JSON.stringify(r.steps)},
       ${r.notes || null}, ${JSON.stringify(r.flagged)},
       ${r.source || null}, ${r.image || null},
       (select coalesce(max(position), -1) + 1 from kitchen.recipes))
    on conflict (id) do update set
      title = excluded.title, category = excluded.category,
      contributor_id = excluded.contributor_id, servings = excluded.servings,
      prep_time = excluded.prep_time, cook_time = excluded.cook_time,
      ingredients = excluded.ingredients, steps = excluded.steps,
      notes = excluded.notes, flagged = excluded.flagged,
      source = excluded.source, image = excluded.image,
      updated_at = now()
    where ${isNew ? 0 : 1} = 1
    returning id`).length;
  }
  if (!landed) {
    return send(res, 409, { error: "that name kept being taken while this was saving — try Save again" });
  }
  /* position is deliberately NOT in the update list: it is what "recently
     added" sorts on, and editing a recipe is not adding it. Fixing a typo
     must not jump a recipe to the top of the family's list. */

  /* Tags are a join table, so the edit is a replace: a tag someone took off
     has to come off here too, or removing one would never stick. */
  await sql`delete from kitchen.recipe_tags where recipe_id = ${rowId}`;
  for (const t of r.tags) {
    await sql`insert into kitchen.tags (name) values (${t}) on conflict (name) do nothing`;
    await sql`insert into kitchen.recipe_tags (recipe_id, tag_id)
              values (${rowId}, (select id from kitchen.tags where name = ${t}))
              on conflict do nothing`;
  }
  /* Deliberately not awaited into the response: the write is done and the
     family's copy is safe. Whether the publish fires now or the nightly run
     picks it up changes when they see it, not whether. */
  const poked = more ? { sent: false, why: "more-coming" } : await publisher.poke();
  send(res, 200, { ok: true, id: rowId, publishing: poked.sent });
}

/* ----------------------------------------------------------------- server */

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const p = u.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
      "access-control-allow-headers": "content-type, x-kitchen-key",
      "access-control-max-age": "86400"
    });
    return res.end();
  }

  const route = (async () => {
    if (!limiter.hit(callerIp(req), Date.now())) {
      return send(res, 429, { error: "Too many requests from this connection — give it a minute." });
    }
    if (req.method === "GET" && (p === "/" || p === "/api/health")) {
      return send(res, 200, {
        ok: !!(sql && anthropic),
        service: "kitchen-table import server",
        uptime_s: Math.round(process.uptime()),
        queue_pending: queue.size(),
        pot_provider: potUp,
        accepts_changes: writeGate.configured,
        publishes_on_change: publisher.configured,
        /* `R137` — `publishes_on_change` only ever meant "a token is set".
           A token that has stopped working reads exactly the same while
           every change quietly waits for the nightly sync, so say when a
           poke last landed and why the most recent one did not. Both null
           after a restart is normal: this server sleeps. */
        last_publish_s: publisher.lastSentAt() === null ? null
          : Math.round((Date.now() - publisher.lastSentAt()) / 1000),
        last_publish_error: publisher.lastError(),
        missing: [!sql && "KT_DB", !anthropic && "ANTHROPIC_API_KEY",
          !ctx.groqKey && "GROQ_API_KEY (optional)",
          !ctx.ytKey && "YT_API_KEY (optional — rescues robot-blocked YouTube imports)",
          !writeGate.configured && "KT_WRITE_KEY (optional — until it is set, nobody can change a recipe for everyone)",
          !publisher.configured && "KT_GH_TOKEN (optional — without it a change waits for the nightly sync)"].filter(Boolean)
      });
    }
    if (!sql && (p.indexOf("/api/import") === 0 || p.indexOf("/api/recipes") === 0)) {
      return send(res, 503, { error: "The kitchen server isn’t fully set up yet — its database connection (KT_DB) is missing." });
    }
    let m;
    if (req.method === "POST" && p === "/api/import/video") return postVideo(req, res);
    if (req.method === "GET" && p === "/api/import/jobs") return listJobs(req, res, u.searchParams);
    if ((m = p.match(/^\/api\/import\/jobs\/(\d+)$/)) && req.method === "GET") {
      return getJob(req, res, parseInt(m[1], 10));
    }
    if ((m = p.match(/^\/api\/import\/jobs\/(\d+)\/accept$/)) && req.method === "POST") {
      return acceptJob(req, res, parseInt(m[1], 10));
    }
    if ((m = p.match(/^\/api\/recipes\/([a-z0-9-]{1,80})$/)) && req.method === "PUT") {
      return putRecipe(req, res, m[1], u.searchParams.get("more") === "1",
                        u.searchParams.get("new") === "1");
    }
    send(res, 404, { error: "not found" });
  })();

  route.catch((e) => {
    console.error(req.method + " " + p + " →", e);
    try { send(res, 500, { error: "server error: " + String(e && e.message || e).slice(0, 200) }); }
    catch (e2) { /* headers already sent */ }
  });
});

process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));

(async () => {
  startPotServer();
  if (sql) {
    await db.ensureSchema(sql);
    const { failedIds, queuedIds } = await db.recoverStuckJobs(sql);
    if (failedIds.length) console.log("boot: failed mid-flight jobs " + failedIds.join(", "));
    for (const id of queuedIds) queue.push(() => runJob(ctx, id));
    if (queuedIds.length) console.log("boot: re-queued jobs " + queuedIds.join(", "));
    const pruned = await db.pruneOldJobs(sql);
    if (pruned) console.log("boot: pruned " + pruned + " old finished jobs");
  }
  server.listen(PORT, () => {
    console.log("kitchen-table import server listening on :" + PORT +
      (sql ? "" : "  (WARNING: no KT_DB — imports are off until it is set)") +
      (anthropic ? "" : "  (WARNING: no ANTHROPIC_API_KEY — imports will be refused)") +
      (ctx.groqKey ? "" : "  (note: no GROQ_API_KEY — caption-less videos will be frames-only)"));
  });
})().catch((e) => { console.error("boot failed:", e); process.exit(1); });
