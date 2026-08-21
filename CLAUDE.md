# Kitchen Table — build instructions

**Read this file before writing any code. Read `README.md` for the full screen-by-screen spec.**

## The one rule that keeps getting broken

**This app is dark forest green. Do not generate your own color palette.**

`tokens.css` in this folder is the palette. **Copy it into the project verbatim and use
`var(--*)` for every single color.** Do not substitute Tailwind defaults, do not pick "a nice
green," do not invent hex values, do not use `emerald-600` or `green-800` or any framework's
scale. If a color you need is not in `tokens.css`, that is a question to ask — not a value to invent.

Ground truth, in priority order:
1. `tokens.css` — the actual values. Use it.
2. `design/components.md` and `design/a11y-criteria.md` — the component
   vocabulary and the accessibility bar the build is held to.
3. `README.md` — the full spec for layout, behavior, and accessibility.
(The original handoff's `styleguide.html`, `screenshots/`, and `*.dc.html`
design references were never committed to this repo; the `design/` documents
above are the operative record of the same intent.)

The four load-bearing colors, so there is no ambiguity:

| | Dark (default) | Light |
|---|---|---|
| Page background | `#0E1712` | `#F3F6F3` |
| Recipe cards | `#1D4234` | `#1B4F39` |
| Accent / primary buttons | `#8FD3AC` | `#1B4F39` |
| Primary text | `#F1F5F2` | `#0D1C15` |

Dark mode is the **default**. Light mode is `[data-theme="light"]` on `<html>`, persisted to
`localStorage` under `kt.theme`.

## Second rule

**One font: Atkinson Hyperlegible.** No serif anywhere, no Inter, no Roboto, no system-ui fallback
as the primary. It was chosen because the user has low vision — it is a functional requirement,
not a stylistic one.

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
```

Weights 400 and 700 only. Never 500 or 600.

## Target environment

Static site: **plain HTML + CSS + vanilla JS on GitHub Pages.** No build step, no framework, no
bundler, no server. Hash routing (`#` → Main, `#menu` → Menu, `#<recipe-id>` → Recipe).
Recipe data is read from `recipes.json`. Ship `recipes.json` from this folder as-is — it already
has the `contributor` field added and `servings` normalized to integers.

## About the original handoff references

The handoff folder carried proprietary design references (`*.dc.html`
templates, `styleguide.html`, `screenshots/`). They were read during the
build for exact sizes, spacing, and state logic, but were never committed
here. Where anything ever disagreed, `tokens.css` won — and still does.

## Definition of done

- [ ] `tokens.css` copied in verbatim; **zero** hardcoded hex values anywhere else in the CSS
- [ ] Atkinson Hyperlegible loading and applied everywhere
- [ ] Dark mode default; light mode toggles and persists
- [ ] Recipe instruction text is **24px at the default step** (this was raised deliberately — do not lower it)
- [ ] A− / A+ steps 20 → 40px and persists
- [ ] Nothing interactive under 44px; icon buttons 48×48 — **with one
      documented exception**: Main's theme button and app mark sit at 44, trimmed
      so "Kitchen Table" fits on one line at 390px. Both are enforced at exactly
      those numbers (`R49`), because an exception allowed to drift is a hole.
- [ ] Zero hover-only affordances (iPhone has no hover)
- [ ] Viewer mode shows no edit affordances at all
- [ ] Servings stepper rescales ingredient quantities, opening at each recipe's own count
- [ ] Ingredients and steps tap to check off; state resets on leaving the recipe
- [ ] WCAG AA contrast verified in **both** themes
- [ ] Build compared against `design/components.md` and the screens it describes

---

## Build state — what was actually implemented

Added after the first build against this handoff. The rules above are unchanged;
this section only records decisions and gaps.

### Decisions taken

- **Persistence: Option 1, as specified.** Edit mode writes to `localStorage`
  only and nothing is ever written to the repo by the app. An earlier version of
  this project committed edits straight to GitHub through the REST API with a
  personal access token; that was removed in favour of this handoff. The
  trade-off is deliberate and worth restating: an edit made on one phone stays
  on that phone until someone downloads `recipes.json` and commits it by hand.
- **`recipes.json` and `tokens.css` are shipped verbatim** from the handoff.
  `tokens.css` is loaded before `style.css`; `style.css` contains no hardcoded
  colours, with one exception noted below.
- **Print is the PDF path.** The download sheet's "PDF" option calls
  `window.print()` against a dedicated print stylesheet — black on white, no
  chrome, currently-scaled quantities — rather than rendering the dark UI.
- **Menu pre-filter links use `#menu?who=Name` / `#menu?cat=Course`**, the
  query-ish form the README allows. Picked once, used consistently.

### The hardcoded-colour exception, retired

The `@media print` block in `style.css` used literal black, white, and grey,
because printed output must be black on white regardless of theme and
`tokens.css` defined no print palette. Gameplan task `054` closed the gap the
sanctioned way: a clearly-marked **print palette block appended to
`tokens.css`** (`--print-ink`, `--print-paper`, `--print-line`) — the first
and only amendment to that file since the handoff. `style.css` now contains
**zero hex values anywhere**. The rule stands stronger than before: any colour
not in `tokens.css` is a question, never a value to invent — and since `R48`
it is **enforced rather than remembered**: no hex, no `rgb()`/`hsl()`, no
named colour outside `tokens.css`, and the two places that genuinely cannot
hold a CSS variable (the `theme-color` meta, the manifest) are checked to
still match the token they stand in for. That check found `app.js` repeating
both theme colours to keep the browser chrome in step; it reads `--bg` now.

### Built after the first pass

These were listed as "not yet designed" in the handoff. They were built from the
technical approach `DESIGN.md` already commits to, composed entirely from the
existing component vocabulary — no new colours, type sizes, or patterns.

- **Add / Import** — route `#add`, reached from the Menu's Add-recipe pill.
  Three entry points (type it in / from a link / from a photo), all converging
  on one review screen that reuses the Edit-mode field set. Nothing is saved
  until Save is pressed, and whatever a parser had to guess is written into
  `flagged`, which the recipe page then shows in Viewer mode.
  - **The course is a guess like any other, and says so** (`R73`). Every
    import that cannot read a course lands on Dinner — and now flags it, in
    the same words as the servings guess it sits beside. A course the source
    actually states is used and is *not* flagged, which is what keeps the
    disclosure from becoming noise on every import. The pasted-text path
    reads a stated `Category:` / `Course:` line too; cuisine is deliberately
    not read, being a tag rather than a course.
  - **From a link** fetches through a free public CORS relay
    (`api.allorigins.win`) and reads `schema.org/Recipe` JSON-LD. The relay is
    disclosed in the UI, since the pasted address is sent to a third party.
  - **From a photo** lazily loads Tesseract.js from a CDN on first use only.
    The OCR runs on the device; the picture is never uploaded.
- **Easy Read mode** — `kt.easyRead`, additive to the stepper exactly as the
  README requires. It raises the font floor to index 2, forces one wide column
  everywhere, thickens borders, and promotes `--dim`/`--card-dim` to full
  strength ink so no faded tier survives. It introduces **no new colours** —
  the token palette already clears AA by a wide margin.
  Reached from the Menu's "Aa" button, which now opens a Text size sheet
  holding both the A−/A+ stepper and the Easy Read switch.
- **Sheet focus management** — every sheet traps Tab, closes on Escape, and
  returns focus to the control that opened it. **Since `R80` the sort menu is
  on that same contract**, which it had never been: it is drawn as a popup
  (no scrim, dismissed by an outside tap) and that was allowed to decide the
  keyboard's behaviour too, so focus never entered it and Tab walked out of an
  open `role="menu"` into the page behind. How a thing is drawn and where the
  keyboard is are two different questions. The outside tap stays outside the
  contract on purpose — it has landed on something the reader meant to use, so
  it dismisses without dragging the caret back.
- **A confirm step on Remove** was flagged as an open question in the README and
  never resolved. A `confirm()` was added, since removal is otherwise undoable.

### Still not built

- **A dedicated contributor section view.** The Menu's contributor filter and
  the Main screen's "Whose recipe?" tiles cover contributor browsing, which is
  what the handoff says they are for.

### Changes requested after the handoff

These came from Jason directly and supersede the corresponding parts of
`DESIGN.md`:

- **Categories are now ten**, not six: Breakfast, Brunch, Lunch, Dinner, Sides,
  Snacks, Baking, Desserts, Cocktails, Drinks — in that order, so the "Course"
  sort reads like a day. `recipes.json` was migrated (`Side`→`Sides`,
  `Dessert`→`Desserts`, `Snack`→`Snacks`, `Drink`→`Drinks`), which means it is
  no longer byte-identical to the handoff copy.
  Jason's own list had eight and omitted Sides and Drinks; the collection has
  10 side dishes and a lemonade, so folding them into Dinner and Cocktails
  would have mislabelled about a fifth of the recipes. Sides and Drinks were
  kept for that reason — worth revisiting if he'd rather they went.
  `CAT_ALIASES` maps the old names so a device holding a pre-rename overlay
  doesn't end up with recipes that match no filter.
- **Sort is three options**: Recently added, A–Z, Course. "Quickest first" and
  "Who it's from" were dropped.
- **Tags**, free-form and comma-separated, including where a dish is from.
  They filter (AND-ed), they are searched, and each one on a recipe links to
  `#menu?tag=…`. Nothing ships pre-tagged.
- **Photos.** See below.
- The Main subtitle is "A Simmonds Styled Menu"; the Add pill is smaller.
- **Contributors are Joan, Jason, Jennifer, Lindsay, Siobhan and Jessica.** Every one
  of the 48 recipes is Joan's — the handoff's 25/18/5 split was a placeholder
  and was wrong. The other four are sections waiting to be filled, drawn as
  outlined tiles so they recede rather than shouting a zero, and hidden from
  the Filter sheet since a chip returning nothing is not a filter.
  `WHO_ALIASES` maps `Mom`→`Joan` and `Me`→`Jason` so a saved overlay resolves.
- **Link import tries several relays, then falls back to text.** One free relay
  is a single point of failure — `api.allorigins.win` was returning 522. The
  chain is: direct fetch, allorigins, corsproxy.io, then `r.jina.ai`, which
  returns readable text the photo parser can still handle. Below the URL field
  there is a paste box that needs no network at all, which is the only path
  that can never break.
- **An app mark sits in Main's top-right**, beside the theme button. Both were
  trimmed (40px and 44px) so "Kitchen Table" still fits on one line at 390px —
  it wraps below about 340px, which is unavoidable at 34px type.
- **A one-line explanation** sits under the Main title.
- **"View all recipes" moved directly under "Whose recipe?"**, ahead of the
  course rows, so the whole list is reachable without scrolling past them.
- **The Menu list is one recipe per line at every width.** The handoff's 2- and
  3-column grids were denser but broke titles across lines; a single column
  keeps them scannable. Card padding and line-height were opened up to match.
- **Each recipe shows a category icon** when it has no photo, in the same 64px
  slot the thumbnail uses, so rows stay aligned either way. The ten icons are
  hand-drawn stroke SVG in `CAT_ICON`, per the assets rule — no icon library.

### Photos live outside the recipe records

`kt.images` maps a recipe id to a downscaled data URL (max 1200px, JPEG 0.72).
They are deliberately *not* stored in `kt.recipes`: "Download updated
recipes.json" is meant to produce a file someone commits, and inlining base64
would add hundreds of kilobytes per photo to it. Instead the download writes
`image: "images/<id>.jpg"`, and **Download photos** saves the actual files to
drop into `images/` alongside it.

`imageFor()` prefers the local photo over the published path, so a picture
shows the moment it is attached rather than after a commit. **Removing a
recipe takes its photo with it** (`R71`), and the confirm says so when there
is one to lose — before that the picture stayed for good, counting against
the quota that produces the no-room message, and *Download photos* handed
the family a file nothing referenced. That download now offers only photos
the book can actually point at, which also covers the orphans a phone may
already be holding. localStorage is
only a few megabytes; a quota failure returns a plain message telling the user
to download and commit what they have. Since `R44` the **recipe overlay** does
the same, and since `R45` so does the **week plan**: a save that could not be
written never says "Saved" or "planned", because a change reported as kept
and silently dropped is the worst thing this app could do to a book of
someone's recipes.

### Stored shapes are coerced at the boundary — and so are the server's

**`R87` extended this rule past storage to the one remote input.** The
kitchen server is deployed separately and can be a version ahead of or
behind the page asking it, so its answers are shapes, not promises.
`normalizeDraft` already guarded the draft that becomes a recipe; the job
*lists* did not, and they are rendered directly — so `{jobs: "none"}` left
a string in `S.videoReady` and the next render called `.map` on it. Not the
render that fetched it: that one throws inside a `.then` with a `.catch`
behind it, so the failure is swallowed and the bad value simply waits, then
takes down the Add screen on the reader's next tap. `normalizeJobs()`
coerces both lists now, and since `R92` the **submit reply** is checked
too — a 200 without a usable job id used to draw the progress card for a
job that did not exist, clear the pasted link, and invite the reader to
close the page because "the finished recipe will be waiting".
**The two halves are not the same rule, and the difference is the point:**
*showing* something the app does not recognise passes through, escaped —
the reader loses nothing by seeing that it exists; *claiming an operation
succeeded* on something it does not recognise is a lie, and is refused
with a sentence. It deliberately does **not** discard an entry whose
id it cannot parse: a boundary that silently drops what it does not
recognise turns a schema change into an empty waiting list with no
explanation, and `R54` renders exactly such an id, escaped, on purpose.



Every key this app reads back — the plan (`R21`), the dismissed imports
(`R40`), and since `R62` **the recipes themselves** — is coerced where it is
read, not trusted. `recipes.json` and `kt.recipes` are hand-editable *by
design*: the download-and-commit workflow depends on it, and `db-sync`
regenerates the file nightly with nobody watching. So a recipe arrives
sooner or later with `"steps": "Mix and bake."`, and before `R62` that threw
mid-render — taking not just that recipe down but **the whole Menu**, while
the recipe's own page fell back to the front screen saying nothing.
`normalizeRecipe()` coerces `ingredients`, `steps`, `flagged`, `tags` and
`servings`. It **coerces, never discards**: a string becomes the one line it
is, so the words a person typed always survive.

The same applies to **two recipes with the same id** (`R70`), which used to be
one recipe: `byId` found the first, the second could never be opened, and
saving the first wrote over both — a whole recipe silently replaced by a copy
of the other. They are suffixed at the boundary now (`twin`, `twin-2`), which
is the convention the kitchen server already uses for the same collision, with
the reason written onto the recipe so nobody has to guess why its address looks
odd. It rides into the next download, where the suffixed id fixes the file.

### The overlay is authoritative

`kt.recipes` holds "the full edited recipe set", so when it exists it replaces
the shipped list entirely — including deciding what is *absent*. An earlier
version merged it id by id over `recipes.json`, which meant a removed recipe
came back on the next load: it was missing from the overlay, so the lookup fell
through to the published copy. Treating the overlay as the complete list is what
makes Remove stick.

The consequence, worth stating: once a device has local changes, recipes added
to the published `recipes.json` will not appear there until those changes are
downloaded and committed, or discarded with "Undo all my changes on this phone".

**The same bug had a second home, found in `R28`.** `db/migrate.js` only ever
upserts, so a recipe removed from `recipes.json` stays in the database — and
the nightly `db-sync` writes it back into the file. Removal now has to be said
in both places: commit the shorter file, then `node db/migrate.js --prune`.
Migrate names the orphans on every run either way, because silence there is
exactly how a removed recipe reappears. Pruning is never automatic: a row in
the database that isn't in the file yet is the *normal* state between
accepting a video import and the next sync.

### Undo

Edit mode writes only to `kt.recipes`, and there is no other undo — a removed
recipe is otherwise gone from that device for good. "Undo all my changes on this
phone" clears that one key and falls back to the published file. It appears in
the Edit-mode footer once local changes exist, and also in the Menu's empty
state, since removing everything would otherwise leave no recipe to open Edit
mode from.

### Known limits

- **OCR accuracy on real photographs is still unmeasured.** The real
  Tesseract now runs end to end (`tests/ocr-live.js` — it reads a synthetic
  card and the network trace confirms the photo never leaves the device), and
  the library is pinned with subresource integrity. What remains untested is
  accuracy against actual photos of Joan's cards — gameplan task `081`. Every
  OCR import stays flagged for line-by-line checking either way.
- **The CORS relays are third-party dependencies** for link import only. All
  are named in the UI before a request is made, the chain falls through them
  in turn, and each imported draft records which one answered. When all are
  down, that one path fails with a plain message and the paste box still
  works; nothing else in the app touches the network after load.

### Contributor names are labels, not authentication

Stated here so nobody builds on the wrong assumption later: **the
`contributor` field is a byline, nothing more.** There is no login, no
identity, and no access control anywhere in this app, and the contributor
name must never quietly become one — no "only Joan can edit Joan's recipes",
no per-person visibility, no trust decisions keyed off that string. Anyone
holding the device can edit anything; that is the designed trade-off of the
no-login model, not an oversight. If real access control is ever wanted, that
is a new architecture conversation (the gameplan's backend gate), not a
feature to hang off this field.

### The gameplan era (v0.9 →)

`GAMEPLAN.md` is now the working plan: all 130 team-plan tasks in dependency
order, worked one at a time, one commit each. Decisions taken while looping
it, each with its task number in the log there:

- **A version stamp** (`VERSION` in `app.js`, rendered bottom-corner) reads
  `0.9`; flipping it to `1.0` is the release checklist's last line.
- **Motion and artwork**: every animation is armed by the action that earned
  it and consumed by one paint; all of it off under reduced-motion. The
  artwork (steam bowl, empty plate) is decorative, aria-hidden, currentColor.
- **Photos live in IndexedDB** (`062`) behind a boot-filled in-memory cache —
  localStorage held only 12 of the 48. Legacy `kt.images` migrates at boot;
  no-IndexedDB browsers fall back to localStorage and its loud quota message.
  A store value is one data URL or an array of pages (`066`).
- **The tests live in `tests/`** and run in CI on every PR (`002`/`003`).
  The suites are hermetic — relays stubbed, full Chromium pinned for the
  wake-lock check, screenshots to a gitignored dir.
- **Tesseract is pinned with SRI** (`048`) and proven local by network trace
  (`047`); the import chain disclosure names every relay (`050`) and each
  import records which answered (`051`). Imported fields are capped, trims
  disclosed (`046`).
- **Reflow at 320px** (200% zoom) + Easy Read + top step is enforced by
  `tests/zoom.js` (`041`); scroll restoration is app-owned
  (`history.scrollRestoration = manual`).
- **`CONTENT.md`** is the known-wrong-data ledger (`013`); nothing on it may
  be resolved by inference — and since `R69` its counts and its named
  recipes are **checked against `recipes.json` on every run**, because a
  ledger not updated the moment a recipe is fixed starts lying about what
  is still outstanding.

### The completion push (Jason's "get the other 101 done")

On 2026-08-01 Jason instructed completion and skipped the direct gate
questions, so the recommended defaults were taken as **provisional PM
rulings — every one reversible, recorded with its basis in `DECISIONS.md`**:
no server for 1.0 (`026`, striking gameplan Phases 11–14), calendar post-1.0
(`030`, striking Phase 15), the ten categories stay (`027`), and the done-bar
is "true text" (`029`). Rules that follow from them — the merge story (`031`),
pull cadence (`032`), the legibility precedent (`033`) — are written there
too. What that unlocked, all verified in the suites:

- **Zero third parties at page load.** Atkinson Hyperlegible is self-hosted
  (`fonts/`, OFL text included, 400/700 preloaded) (`049`), and a meta CSP
  admits scripts only from self, jsdelivr, and two hashed inline snippets
  (the pre-paint theme, and `R29`'s last-resort boot message) —
  which needed `wasm-unsafe-eval` for OCR, proven live either side (`052`).
  Writing that hash exposed a real bug: the pre-paint theme script compared
  raw against JSON-quoted storage and had **never fired** — light-mode users
  had a dark flash from day one. Fixed, proven with app.js blocked.
- **Tag hygiene is machinery, not discipline**: suggestions with canonical
  casing while typing (`067`), a bulk Tag mode on the Menu (`068`), and
  rename-onto-existing-merges with per-recipe dedupe (`069`).
- **Flags name their field** ("Servings — …") and surface beside that field
  as a Double-check chip that scrolls to the panel (`082`); review lines move
  between ingredients and steps in one tap (`083`); a noise photo through the
  real Tesseract yields flags, never fiction, gated in `ocr-live` (`085`).
- **Search folds diacritics and forgives one typo** on 5+ letter terms,
  exact-first, and cards say "matches ingredient/tag" when the hit isn't the
  title (`087`/`088`). The Menu stays deliberately unvirtualised at 48
  recipes (`089`, ruling at `menuMatches`).
- **Design debt paid on paper and in pixels**: print colours are tokens
  (`054`), one measured focus ring (`055`), three icons redrawn after the
  20px strip caught Breakfast reading as an eye (`056`), empty tiles invite
  in words (`058`), Easy Read endorsed (`059`), the chip spec (`060`), all
  bound into `design/components.md` (`061`) and `design/a11y-criteria.md`
  (`034`). `ADDING.md` (`079`) is the family-facing walkthrough.

**The video importer is live and proven** (2026-08-03): all four keys are
in Render, Instagram imports run the full heavy path, and YouTube — which
now walls every anonymous server-side route — comes through the official
Data API when its robot check refuses, writing up the video's own
description with honest flags about what wasn't heard or seen. A blocked
video with no description at all fails plainly and points at the paste
box. Both outcomes verified with live jobs, not fixtures.

What remains is exactly the work only people can do: the iPhone checks, the
VoiceOver pass, the sessions with Joan, the content truth pass, twenty real
photos of her cards — and the family confirmations that turn the provisional
rulings into settled ones. `GAMEPLAN.md` §11 is the authoritative list.

### The video importer (Phase 16, Jason's spec — 2026-08-02)

The fourth way in, and the one deliberate exception to "nothing here runs on
a server": **`backend/` is an import server on Render's free tier, and only
the video conversion lives there** (Jason's ruling, quoted in
`DECISIONS.md V`). The site stays static and instant; no request to the
server is ever on the path to reading a recipe. A YouTube/Instagram link
becomes a background job in `kitchen.import_jobs` (schema v2): metadata via
yt-dlp, then the cheapest sufficient path — a recipe written in the
description costs nothing, captions cost one small fetch, and only a video
with neither is downloaded (audio → Groq Whisper; ~40 deduped frames + the
words → one `claude-opus-5` call, structured output, **flag-don't-guess**).
Drafts land on the standard review screen; Save writes locally as always
*and* tells the server, which inserts the reviewed recipe into the database
(id collisions suffix, never overwrite) for the nightly sync to publish.
The phone can close mid-job; finished drafts wait on the Add screen.
Cold starts read as "waking up the kitchen…", never as errors. The server
holds `KT_DB` server-side — which is what retired the Data-API question
(`096`). Deploy is Jason's existing Render service unchanged (`yarn` /
`yarn start` against the repo root shim) plus three env vars;
`backend/README.md` is the checklist. The API trusts the way the app
trusts: no logins, narrow operations, migration-grade validation —
contributor names stay labels, never keys.

### Verified

The suite after the video arc: **1070 functional checks** across eleven
suites (kt 255, feat 65, add 79, relay 16, quick 76, polish 166, sec 53,
plan 79, video 85, backend 181, zoom 15), plus the perf budget (FCP ~900 ms
median on throttled 3G — *including* the self-hosted fonts — against a
4000 ms gate; CLS 0.0000 with 48 photos against 0.02; and since `R25`
three interaction budgets measured in-page under a 6× CPU throttle —
check-off 33 ms, servings 50 ms, a filter chip re-rendering all 48 cards
158 ms — which are tripwires for an architectural regression, not a grade:
the comment in `tests/perf.js` says exactly what they will and will not
catch; and since `R46` a growth watcher that renders a synthetic 240-recipe
book and reports the filter tap — 440–570 ms, so `089`'s unvirtualised
ruling holds well past the 150 it worried about). WCAG AA contrast:
zero failures across every screen × theme × Easy-Read combination, the
video form included. The route list is the whole app now: `R85` added the
Menu's tag and remove modes — hiding a meta line at **1.00:1 on all 48
rows in light mode** — and `R86` finished the sweep with the sort menu,
an empty search, the planned week, the picker, the meal sheet, the tag
sheet and the photo lightbox, each naming the selector that proves it
opened (the floor immediately caught four routes auditing the screen
behind a sheet that never opened). —
**and since `R82` on paper too**, which the audit
had never looked at: printing under both themes found fourteen failures
the dark palette was leaking onto white, including the shopping list's
own title at 1.10:1 and all seven of `R60`'s "not adjusted" notes, the
ones that tell a cook which amounts did *not* rescale. Nothing interactive measures under 44px — checked on
every screen, not just one (`R16`). All of it
runs on every pull request via `tests/run.sh`, hermetically — the suites
stub the kitchen server and abort the Render origin, so CI never wakes the
real one. Off-CI, the live-OCR gate (`tests/ocr-live.js`) proves that
pipeline device-local and, in its `KT_OCR_NOISE=1` variant, that garbage
flags rather than invents; the video pipeline's own live checklist (real
videos, cold start, restart mid-job) runs once the server has its keys.
