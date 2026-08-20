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
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const { parseVideoUrl, validateRecipe } = require("./lib/validate");
const { LABEL, estimate } = require("./lib/eta");
const { serialQueue } = require("./lib/queue");
const { makeLimiter } = require("./lib/ratelimit");
const budget = require("./lib/budget");
const db = require("./lib/db");
const { runJob } = require("./lib/pipeline");

const PORT = parseInt(process.env.PORT, 10) || 8787;
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
if (process.env.ANTHROPIC_API_KEY) {
  const Anthropic = require("@anthropic-ai/sdk");
  anthropic = new Anthropic({ maxRetries: 2 });
}

const ctx = {
  sql,
  anthropic,
  groqKey: process.env.GROQ_API_KEY || "",
  ytKey: process.env.YT_API_KEY || "",
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
  if (process.env.KT_NO_POT || !fs.existsSync(main)) return;
  let tries = 0;
  (function up() {
    const cp = spawn(process.execPath,
      [main, "--port", String(process.env.KT_POT_PORT || 4416)],
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
function callerIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
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

async function postVideo(req, res) {
  const body = await readJson(req);
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
  const body = await readJson(req);
  const v = validateRecipe(body.recipe);
  if (v.error) return send(res, 400, { error: v.error });
  const r = v.recipe;

  /* The phone chose the id against its own copy of the book; another device
   * may have taken it since. Suffix rather than overwrite — a duplicate the
   * family can see and delete beats a recipe silently replaced. */
  let id2 = r.id;
  let n = 2;
  while ((await sql`select 1 from kitchen.recipes where id = ${id2}`).length) {
    id2 = r.id + "-" + n++;
  }

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
  await sql`update kitchen.import_jobs
               set status = 'imported', updated_at = now()
             where id = ${id}`;
  send(res, 200, { ok: true, id: id2 });
}

/* ----------------------------------------------------------------- server */

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const p = u.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
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
        missing: [!sql && "KT_DB", !anthropic && "ANTHROPIC_API_KEY",
          !ctx.groqKey && "GROQ_API_KEY (optional)",
          !ctx.ytKey && "YT_API_KEY (optional — rescues robot-blocked YouTube imports)"].filter(Boolean)
      });
    }
    if (!sql && p.indexOf("/api/import") === 0) {
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
