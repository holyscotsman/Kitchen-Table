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

## 120 — The calendar's meal slots: dinner-first, all three available

**Decision: every day shows its Dinner slot; Breakfast and Lunch exist on
every day but sit behind a quiet "+ Breakfast / + Lunch" until used.**

The evidence for dinner-first is already in the product: the Main screen's
one planning feature is "Tonight's idea", the collection is 23 dinners
against 7 breakfasts, and family planning conversations are dinner
conversations. Making all three slots always-visible would triple the grid's
height with mostly-empty boxes — exactly what collapses at Easy Read sizes.
The database schema and the plan entries carry all three slots identically,
so promoting breakfast/lunch to always-visible later is a UI change, not a
migration. Weeks start on Monday.

## 130 — Ingredient summing: shipped as a preview, with its failure modes named

The week view carries a **"Shopping list (preview)"**. What it does honestly:
sums lines whose leading quantity and unit parse and whose remaining text
matches exactly (case- and accent-folded), scaled to each meal's own
servings; everything else appears under "as written, not summed" — nothing
is guessed. The measured failure modes, for the record: unit synonyms are
not converted (2 tbsp + 1 tablespoon stay separate), containers don't
reconcile ("1 can" + "400 g"), prose quantities don't parse ("a knob of
butter"), and ingredient phrasing must match exactly ("chicken breast" ≠
"chicken breasts"). Fixing those means a units-and-synonyms table and a
singulariser — worth doing only if the preview earns use. **Shipping it as
more than a preview is a separate decision, per the task's own warning.**

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

## V — The video importer lives on Render, and nowhere else touches a server

**Jason's ruling, in his words: "I only want the video conversion to live on
the Render, not the whole app. This way the app still works instantly while
the video conversion can run in the background without the user seeing it."**

So the boundary is drawn exactly there. The site stays static files on
GitHub Pages — no request to the import server is ever on the path to
reading a recipe, and the app behaves identically with the server asleep,
awake, or gone. The server does three things only: turn a YouTube/Instagram
link into a draft (background job), report job state, and write an accepted
draft into the database. Its cold starts are absorbed by design: submitting
shows "waking up the kitchen…", and for the job itself a cold start is just
processing time. Cost stands at $0 (Render free + Groq free + pennies of
Anthropic usage per import).

Two consequences worth naming:

- **`096` is superseded.** The question "enable Neon's Data API or ask for a
  small worker?" answered itself — the import server *is* the small worker,
  holding `KT_DB` server-side where a browser key never has to exist.
- **The trust model is unchanged, and that is deliberate.** The API is
  unauthenticated like the site itself (contributor names are labels, not
  authentication — CLAUDE.md). What bounds it: three narrow operations,
  validation identical to the migration's, a short queue, and id collisions
  suffixing rather than overwriting. Real access control remains the
  backend-gate conversation, not a patch.

## 031/032 — refreshed for the live-write era (the one-paragraph update they were owed)

The merge story gains one new writer: accepting a video import inserts the
reviewed recipe into the database directly, and the nightly `db-sync`
carries it into `recipes.json` — so a recipe can now appear in the published
file that no phone ever downloaded-and-committed. Conflict handling follows
the file era's rule (nothing is ever silently replaced): an id already taken
in the database gets a suffix, and the duplicate is left visible for the
family to resolve. Pull cadence is unchanged — devices still refresh from
the published file, so an accepted import reaches other phones after the
nightly sync commits, or sooner if someone runs the workflow by hand.

## R20 — The status-bar pad is the device's number, not the reference's constant

**Provisional; Jason can reverse it in one line.** The design references pad
the top of all three screens on narrow widths — `statusPad`, a flat 60px on
Main and 54px on the Menu and Recipe headers — to clear the phone's status
bar. That is right for a Home Screen install, where the page genuinely runs
under it. It is wrong in a browser tab, which is how the family actually
opens this today: the browser's own chrome already occupies that space, so
the pad is dead, charged at the top of every screen and — on the two sticky
headers — at every scroll position, on the devices with the least room.

The ruling: keep the *intent* and drop the *constant*. All three read
`calc(base + env(safe-area-inset-top))` now, the same technique the sheets
and the lightbox already used. In a tab the inset is 0 and the space comes
back; added to the Home Screen on a notched phone the inset supplies the
exact number the constant was guessing at. The Menu's sticky header goes
208px → 168px, a quarter of an iPhone viewport down to a fifth.

**What it costs if reversed:** one media-query value per screen. **Why it
was taken without asking:** it is the design's own intent expressed
accurately, on the axis this app exists to serve — a low-vision reader at
200% zoom gets a third of the viewport back on the Menu rather than losing
41% of it to chrome. If Jason wants the reference's literal spacing on
phones in a tab, say so and it goes back.

## R47 — Paper carries the size the reader chose

**Provisional; one line to reverse.** The print stylesheet carried
`.recipe { font-size: 12pt }` — a rule that had never once applied. The
renderer sets the reading size as an inline style, and inline beats a
stylesheet, so a printed recipe has always come out at whatever the A−/A+
stepper was showing: 20px at the bottom step, 40px at the top.

Two ways to resolve a rule that lies about itself. Enforce it (`!important`,
paper always 12pt), or delete it and state what actually happens.

**Deleted.** The behaviour it was hiding is the one §033 would have ruled
anyway: when preference and legibility collide, legibility wins. Someone who
set 40px on screen did so because they need it, and a recipe printed at 12pt
for that reader is a wasted sheet of paper. The stepper's own floor is 20px,
so nothing prints unreadably small either.

**What it costs if reversed:** one declaration, plus `!important` to make it
bite. **Why it was taken without asking:** the alternative was leaving a line
in the stylesheet that states an intent it cannot deliver, which misleads
whoever reads it next — and choosing 12pt over the reader's own setting is
the one direction §033 rules out. If Jason wants paper at a fixed size
regardless of the screen, that is a different ruling and easy to make.

## R56 — A step's number scales only when a measurement follows it

**Provisional; the gate is one argument to remove.** The README documented
"scale the leading number" in steps as well as ingredients, with a worked
example — *"Bake 2 cups of…" scales in the steps too* — and the rule was
written for a step that opens with an amount.

`recipes.json` contains a step it was never written for. *Fries in Ninja*
step one is `390 - 3 mins`: an air-fryer setting, not an amount. Doubling the
recipe rendered **780 - 3 mins**. Halving it rendered **195 - 3 mins**.
Sweeping all 48 recipes, it is the only step in the whole book that starts
with a number, and it is a temperature.

Three ways out. Stop scaling steps entirely — simplest, but deletes a
documented feature and would silently break `Bake 2 cups of…` if an imported
prose step ever opens that way, which is exactly what video imports produce.
Special-case temperatures — a blocklist, so every unit nobody thought of
fails open, in the wrong direction. Or **require a measurement word after the
number**, which is what shipped: an allowlist, so anything unrecognised is
left as written.

**The list is deliberately short and unambiguous.** A unit that fails to
match costs a step that doesn't scale; a unit that matches wrongly costs an
invented number in a book of someone's recipes. Those are not the same price,
so bare single letters that could be words (`c`, `t`, `l`) were left out even
though handwritten cards use them.

**What it costs if reversed:** delete the `unitsOnly` argument at the two
step call sites. **Why it was taken without asking:** the alternative was
shipping a recipe book that tells someone to run an air fryer at 780°F, and
no reading of the spec asks for that — CLAUDE.md's own definition of done
says the stepper "rescales **ingredient** quantities".

## R60 — A second amount is disclosed, never guessed at

**Provisional; the disclosure is one helper to delete.** Twenty-eight
ingredient lines carry a second amount after the one that scales. Doubling
rendered `2 lb (450g) chicken breast` — a line that now contradicts itself,
because the metric is still the amount for four people.

Scaling it too is right for some of them and wrong for others, and the
difference is meaning, not syntax:

| Line | The parenthetical is | Scale it? |
|---|---|---|
| `1 lb (450g) chicken breast` | the same amount, converted | yes |
| `1 cup (2 sticks) butter` | the same amount, converted | yes |
| `1 jar (16 ounces) Picante Sauce` | the size of one jar | **no** |
| `2 pork cutlets (about 5 ounces each)` | the size of one cutlet | **no** |

A rule could be written — outer unit is a measure, scale; outer unit is a
container, don't — but `1 medium onion, chopped (about 1.5 cup/200g)` and
`4 boneless 8 ounce pork chops` do not fit either side of it, and a rule that
is right most of the time still invents a number the rest of the time.

**So the app says what it left alone**: `— 450g not adjusted`, on the line, only
while the recipe is rescaled, with a count in the sentence at the top. That is
the same answer this app gives everywhere else it cannot be certain — the
importer flags rather than guesses, OCR flags rather than invents — and it is
the answer that costs a cook a glance instead of an ingredient.

**What it costs if reversed:** delete `unscaledExtra()` and its three call
sites. **Why it was taken without asking:** the alternative was leaving lines
that contradict themselves on screen, and the only other alternative was
guessing at meaning in a book of someone's recipes.

---

## S — Edits reach everyone, and what stands between them and a stranger

**Asked for directly**, 2026-08-22: *"If someone edits a recipe, can we have
that change happen on the server? This way it is automatically adjusted for
everyone."* That reverses the part of ruling 026 that kept edits local, and
it reverses it on request rather than by default — which is the difference
between a decision and a drift.

### What was already true

Most of this was built. The database is the canonical shared copy, the video
importer already writes recipes into it, and `db-sync` already regenerates
`recipes.json` and commits, which is what makes Pages republish. The missing
piece was small: nothing let an **edit** use any of it.

### The two questions that were not mine to answer

Both were put to Jason with a recommendation, and both recommendations were
taken.

**1. What stands between an edit and a stranger?** This is the question the
feature turns on. Today the blast radius of someone who finds the Render
address is a bill: they can spend imports, and the rate limiter, the caller
day cap and the URL allowlist bound that. A write endpoint changes the worst
case from *money* to *Joan's recipes* — silently, with no way to tell who
did it and nothing to roll back to but a nightly commit.

Chosen: **one shared family passphrase**, `KT_WRITE_KEY`, held in Render's
environment and entered once per phone. No accounts, no logins, no identity —
which keeps faith with the rule that has governed this app from the start:
**`contributor` is a byline, never a credential.** The passphrase says
*someone in this family is holding the phone*. It does not say who, and
nothing in the app may ever start deciding anything from the name.

It **fails closed**. With no key set, every write is refused — the
unconfigured state is the dangerous one, so it is the locked one. Wrong
answers are walled at ten an hour per caller, because a family passphrase is
not attacked by flooding but by patience; correct ones are never counted, so
ordinary saving never walks toward the wall. The refusal for a near-miss is
byte-identical to the refusal for no attempt at all.

**2. How fast should a change reach everyone?** Chosen: **poke `db-sync` on
write** — minutes, not overnight. The rejected option was letting the app
read from the server, which would have put a sleeping Render service between
the family and their recipes, and ruling V is explicit that no request to
that server is ever on the path to *reading* a recipe. That still holds:
this arc adds a server on the **write** path only.

### What is deliberately not built

- **Removal.** Deleting a recipe for everyone is a bigger, sharper action
  than changing one, and `db/migrate.js --prune` exists precisely because
  pruning is never automatic. Remove is still local-only. If that should
  change it is its own decision, not a corollary of this one.
- **Conflict resolution.** `ADDING.md` says that when two people change the
  same recipe Jason asks which is right rather than picking silently. Server
  writes make last-write-wins the default for anyone holding the passphrase,
  and this arc does not solve that — it narrows it (both edits land in the
  database, and the file is regenerated from it) without pretending to.
  Worth revisiting if two people ever actually collide.

**What it costs if reversed:** unset `KT_WRITE_KEY` and every write is
refused again, with no code change and no redeploy — the app falls back to
saving locally and saying so, which is exactly what it did before.
