# The database

Kitchen Table's recipes now have a second home: a Postgres database on Neon
(Jason's decision, 2026-08-02, superseding the earlier no-server default).
Everything lives in the `kitchen` schema so the database can be shared with
Sift later without either app touching the other's tables.

**The connection string is a secret.** It is never committed to this
repository — every script here reads it from the `KT_DB` environment
variable, and in CI it belongs in a GitHub Actions secret. If it has ever
been pasted somewhere a third party could read (a chat, an email), rotate
the password in the Neon console.

## Commands

```sh
npm install @neondatabase/serverless      # once

# Push recipes.json into the database (idempotent — re-run to sync edits in)
KT_DB='postgres://…' node db/migrate.js

# Compare the two without changing anything
KT_DB='postgres://…' node db/export.js --check

# Regenerate recipes.json from the database (the way back out — the project
# is never locked in)
KT_DB='postgres://…' node db/export.js
```

`migrate.js` fails loudly on malformed data and reports every recipe with an
empty ingredient list — it doubles as the content audit. `export.js --check`
exits 0 only when database and file carry identical content, which makes it
a one-line drift detector.

## What the database is, and isn't, today

- **It is the canonical shared copy**: the file in this repo and the static
  site are generated from it (or reconciled into it) with the two commands
  above.
- **The live site does not talk to it yet.** GitHub Pages is static — there
  is nowhere to keep a credential. Wiring the app itself to the database
  needs one of: Neon's Data API switched on in the console (browser-safe
  keys + row-level security), or a small worker holding the secret. That is
  the next architecture step and is tracked in `GAMEPLAN.md`.
- The schema already includes `kitchen.menu_plan` for the calendar, with
  per-meal servings and survival of recipe deletion designed in.
