/* Database access. Same driver and same env-only rule as db/migrate.js:
 * the connection string is KT_DB (DATABASE_URL accepted as an alias for
 * Render's convention) and appears nowhere in this repository.
 * db/schema.sql stays the single source of DDL truth — the backend applies
 * that file at boot, idempotently, exactly like the migration does. */
"use strict";

const fs = require("fs");
const path = require("path");
const { envStr } = require("./env");

function connString() {
  return envStr("KT_DB") || envStr("DATABASE_URL");
}

function getSql() {
  const cs = connString();
  if (!cs) throw new Error("Set KT_DB (or DATABASE_URL) to the Postgres connection string.");
  const { neon } = require("@neondatabase/serverless");
  return neon(cs);
}

async function ensureSchema(sql) {
  const file = path.join(__dirname, "..", "..", "db", "schema.sql");
  const ddl = fs.readFileSync(file, "utf8");
  const stmts = ddl.split(/;\s*\n/)
    .map(s => s.split("\n").filter(l => !l.trim().startsWith("--")).join("\n").trim())
    .filter(Boolean);
  for (const stmt of stmts) await sql.query(stmt);
  await sql`insert into kitchen.schema_version (version, notes)
            values (2, 'import_jobs — video import runs as a server-side job')
            on conflict (version) do nothing`;
}

/* Render free restarts on deploy and after spin-down. A job caught
 * mid-flight fails cleanly with the resubmit message (spec step 3); a job
 * still 'queued' never started, so it is safe to just run. */
async function recoverStuckJobs(sql) {
  const failed = await sql`
    update kitchen.import_jobs
       set status = 'failed',
           error_message = 'The server restarted mid-import — please resubmit the link.',
           updated_at = now()
     where status in ('downloading','transcribing','extracting')
     returning id`;
  const queued = await sql`
    select id from kitchen.import_jobs where status = 'queued' order by id`;
  return { failedIds: failed.map(r => r.id), queuedIds: queued.map(r => r.id) };
}

/* Finished business doesn't accumulate forever: accepted and failed jobs
 * older than a week go. ready_for_review rows are someone's waiting work
 * and are never pruned. */
async function pruneOldJobs(sql) {
  const gone = await sql`
    delete from kitchen.import_jobs
     where status in ('imported','failed')
       and updated_at < now() - interval '7 days'
     returning id`;
  return gone.length;
}

module.exports = { connString, getSql, ensureSchema, recoverStuckJobs, pruneOldJobs };
