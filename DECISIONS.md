# Decisions

The rulings the gameplan asked for, each one written down so it can be cited —
or reversed — later. Newest at the bottom. Every decision here that was taken
as a **provisional default** says so, names who can overturn it, and what
overturning it costs.

> **2026-08-02 — Jason answered.** The provisional era is over for four of
> these: `026` is **reversed** (a database, on Neon), `030` is **reversed**
> (calendar ships in 1.0), `027` is **settled as ruled** (he delegated;
> the ten stay), and `029` is **settled with his own bar** (ingredients +
> steps + original source). Each section below carries its update in place.

---

## 026 — The backend question: no server for 1.0

**⟲ REVERSED by Jason, 2026-08-02** — he supplied a Neon Postgres instance
("the database I was using for Sift") and asked for the recipes stored
there, with shared logins as a later possibility. The reversal cost exactly
what this file predicted: nothing. Landed the same day: the `kitchen` schema
(recipes, contributors, tags as a join table, menu_plan), all 48 recipes
migrated with a clean round-trip back to `recipes.json`, and `db/` tooling
reading the credential from the environment only. Open architecture
question, his to make in the Neon console: **Data API (browser-safe keys +
row-level security) versus a small worker holding the secret** — until one
of those exists, the static site still runs from `recipes.json` and the
database is the canonical shared copy, synced by the two `db/` commands.
The paragraphs below record the original default and its basis, kept for
the reasoning.

*Original (superseded): Kitchen Table ships 1.0 as a static site. No
Express, no SQLite, no hosting bill. Phases 11–14 of the gameplan (30
tasks) are struck. Provisional default, taken 2026-08-01 on Jason's
instruction to proceed to completion.*

### What breaks today without a server

- An edit made on one phone stays on that phone until someone downloads
  `recipes.json` and commits it. Two phones can drift apart.
- A meal plan (if the calendar is ever built) is visible only to the phone
  that made it.
- Photos attached on a phone live in that phone's browser until the files
  are downloaded and committed to `images/`.

### What a server would cost

- **Money:** roughly $5–10/month (Railway/Render/Fly with a persistent disk),
  forever.
- **Risk:** the SQLite file becomes the only live copy of 48 irreplaceable
  recipes, on a host whose disk-persistence behaviour the gameplan itself
  flags as the first thing to distrust (task `091`).
- **Upkeep:** someone — realistically Jason — owns deploys, backups, restores,
  monitoring, and the bill, forever. The moment updating the site needs a
  runbook, updates stop happening.

### Why the default is "no"

The audience is five people. The friction the server removes (download-and-
commit) falls on exactly one step that one person — Jason — can do on request,
and the app already produces the exact file to commit. Against that stands a
monthly bill, a second copy of truth, and an operations burden with no owner.
The static site has also just been verified end to end: 278 automated checks,
a 720 ms first paint on throttled 3G, and zero AA contrast failures.

**The honest caveat:** gameplan tasks `021`/`022`/`025` — watching a real
family member try the download step and asking whether it is acceptable
friction — have not happened. If that session shows the commit step kills
adoption, this decision should be reopened. That is the one input that would
change the answer.

---

## 027 — Categories: the ten stay

**Decision: Breakfast, Brunch, Lunch, Dinner, Sides, Snacks, Baking,
Desserts, Cocktails, Drinks — final for 1.0.**

*✓ Settled 2026-08-02: Jason delegated ("whatever you think is best") and
the ruling stands as written.* Jason's original list had eight;
Sides and Drinks were added because the collection holds ten side dishes and a
lemonade, and folding those into Dinner and Cocktails would mislabel about a
fifth of the recipes. `CAT_ALIASES` already maps the old names, so reversing
this later costs one small migration and nothing else. Task `023` (Joan's own
words for the categories) remains open and is the strongest reason this could
still change.

## 029 — What "done" means for a recipe: Jason's bar

**✓ Settled by Jason, 2026-08-02, in his words: a recipe is done when its
ingredients are listed properly, its steps are listed properly, and it
carries its original source — a link or a screenshot.**

Where the collection stands against that bar today: sources — all 48 have
one already; ingredients — four are empty (`chops`, `parsnips`,
`fries-in-ninja`, `steak-time-to-cook`); steps — one truncation
(`parsnips`) plus the smaller oddities in `CONTENT.md`. Servings
confirmation (the old draft bar) is no longer *required* for done, but the
34 inferred counts stay flagged on their recipes until checked — a flag is
information, not a blocker.

*Original draft bar (superseded): true text — real ingredients and steps,
servings confirmed or marked unknown.* The alternatives (requiring tags, or tags + photos)
make the content pass with Joan longer, and 1.0 should not be hostage to 48
photographs. The app treats the missing pieces gently either way: no
placeholder images, no empty-tag nagging.

Consequence for the data as it stands: the four recipes with no ingredient
list (`chops`, `parsnips`, `fries-in-ninja`, `steak-time-to-cook`) and the 34
with inferred servings are the 1.0 content blockers, and nothing else is.

## 030 — The calendar: stretch goal, not 1.0

**⟲ REVERSED by Jason, 2026-08-02: the calendar ships in 1.0.** Phase 15
is un-struck and is now the active build queue. The original objection — a
plan only one phone can see — dissolves once the database wiring lands,
which is why the `kitchen.menu_plan` table already exists with per-meal
servings and deletion-survival designed in.

*Original (superseded): not part of 1.0; Phase 15 struck.* Without a server a meal plan is visible only on the
phone that made it, which guts most of its value; building it anyway would put
eleven tasks between the family and 1.0. The tasks are struck, not deleted —
the phase reads intact in the gameplan for whenever it is picked back up.

## 031 — Two people edit the same recipe

**Decision: last committed file wins, and the committer is responsible for
looking.** Concretely: edits live per-phone until someone sends Jason their
downloaded `recipes.json` (or commits it themselves). Whoever commits diffs
the incoming file against what is published first — `git diff` shows exactly
which recipes changed. If two phones changed the *same recipe*, the committer
does not pick silently: the two versions go to Joan (or the two editors), the
chosen one is committed, and the loser is noted in `CONTENT.md` so it is never
silently lost. No timestamps, no merge tooling — at five users the honest
answer is a conversation, not an algorithm.

## 032 — Cadence for pulling local edits in

**Decision: on request, with a monthly nudge. Owner: Jason.** Anyone can send
their downloaded file whenever they like and it gets committed within a day
or two. Independent of that, once a month Jason asks the family group whether
anyone has edits sitting on a phone. Weekly was considered and rejected: at
the current editing rate it would be 52 empty check-ins a year.

## 033 — The accessibility-versus-feature precedent

A real conflict already arose and was ruled on; recording it here makes it
the precedent the gameplan asked for.

**The conflict:** the design handoff specified a 2–3 column recipe grid on
the Menu at tablet and desktop widths — denser, more visible at once. Built
that way, recipe titles broke across lines and scanning suffered, most of all
at large font steps and in Easy Read, where multi-column layouts collapse
into fragments.

**The ruling: legibility beat density.** The Menu is one recipe per line at
every width, with padding and line-height opened up to match. The same logic
later forced Easy Read to one wide column everywhere.

**The precedent, stated generally:** when a visual-design preference and a
legibility/accessibility requirement collide, legibility wins, because the
primary user reads at 24–40px and the app exists for her. A denser or
prettier treatment is acceptable only when it survives the largest font step
and Easy Read without loss. Future conflicts get argued against this line.

## 059 — Easy Read endorsed as built

**Decision: Easy Read stays as implemented — the dim tier is removed, the
floor rises to the 29px step, one wide column everywhere, borders thickened.**

The design intent ("high contrast") was implemented as *promotion of the
faded tier to full-strength ink* rather than new, hotter colours. Endorsed on
the evidence: the token palette already clears WCAG AA with a wide margin in
both themes (the audit runs 48 screen × theme × Easy-Read combinations with
zero failures), and the zoom suite proves the layout survives 200% zoom at
the top font step with no horizontal scroll. No redraw needed. If Joan's
sessions (`017`, `020`) show otherwise, this reopens.
