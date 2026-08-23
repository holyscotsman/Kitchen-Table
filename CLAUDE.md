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
2. `design/styleguide.html` — every colour, size and component on one page,
   drawn from `tokens.css` itself. **Open it in a browser** before arguing
   about a value; its own subtitle is "The build must match this page."
3. `design/components.md` and `design/a11y-criteria.md` — the component
   vocabulary and the accessibility bar the build is held to.
4. `README.md` — the full spec for layout, behavior, and accessibility.

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

They are in `design/`, and until `R149` this file said twice that they were
not — which is the worst place in the project for a wrong sentence, because
the line above it tells you to read this file before writing any code, and
a reference you are told does not exist is one nobody opens.

What is actually there, and what each is good for:

- **`styleguide.html`** — the one to open. Every colour, size and component,
  rendered from `tokens.css`. `R149` fixed the two links that stopped it:
  they were relative to the handoff folder, so in this repo it 404ed on
  `tokens.css` and rendered black on transparent in **Times New Roman**, on
  the reference page for a project whose second rule is that there is no
  serif anywhere. It now reads the repo's own `tokens.css` and its own
  self-hosted Atkinson, so it needs no network and cannot drift from the
  build's palette.
- **`Home.dc.html`, `Main.dc.html`, `Recipe.dc.html`** — design-tool
  templates, not pages. They carry `{{ … }}` placeholders and reach for a
  `support.js` runtime that is not in the repo, so they cannot be opened in a
  browser; they are **source to read** for exact sizes, spacing
  and state logic, which is what they were read for during the build.
- **`screenshots/`** — four PNGs of the intended Main, Menu and Recipe
  screens in both themes.

Where anything ever disagreed, `tokens.css` won — and still does.

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

- **Persistence: Option 1, as specified — and since the `S` arc, Option 1
  *plus a way out*.** Edit mode writes to `localStorage` and nothing is ever
  written to the repo by the app. That was the whole story for a long time,
  and its trade-off was that an edit made on one phone stayed on that phone
  until someone downloaded `recipes.json` and committed it by hand.
  Jason asked for the other half: *"If someone edits a recipe, can we have
  that change happen on the server, so it is automatically adjusted for
  everyone?"* It now can — see **Sharing an edit** below. The local write is
  still first, still unconditional, and still the thing the reader is told
  about; the server is an addition to it, never a replacement for it. An
  earlier version of this project committed edits straight to GitHub through
  the REST API with a personal access token; that is still not what this
  does, and the token is still not in the app.
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

### A recipe with no name took two whole screens with it

`R116`, and the worst blast radius this loop has found. `R62` coerced
`ingredients`, `steps`, `flagged`, `tags` and `servings` at the storage
boundary, for exactly the reason written above it — the file is hand-editable
by design and `db-sync` rewrites it nightly with nobody watching. It did not
coerce **`title`**, and three places sort by one: the Menu's A–Z, the Menu's
Course, and the week planner's picker, all calling
`a.title.localeCompare(b.title)`. `undefined.localeCompare` throws.

Measured with **one** nameless recipe: A–Z sort drew **0 cards** and `#app`
fell to 205 characters; `#plan` fell to 3 elements. Two entire screens, not
one broken row — and `pageerror` stayed **empty**, so it failed silently and
read as an empty book rather than a bug. Where a name did render, a missing
one reached the reader as the literal word *undefined* in the browser tab.

**The fix is render-time only, and that is the load-bearing part.**
`normalizeRecipe`'s output is what "Download updated recipes.json" writes, so
putting a made-up name in there would commit it to everyone's book as though
a person had typed it — the one thing this app never does. `titleOf(r)`
supplies *"Untitled recipe"* — the app's own existing word for a nameless
thing, already used for a video job that arrives without one — for display,
sorting and matching, while `startDraft` keeps reading the **stored** value
so Edit mode offers an empty box and Save cannot bake the placeholder in.
That distinction has its own check, and reverting it fails by name.

It composes with `R115` the way it should: a nameless recipe on a sharing
phone is refused by the server ("bad title"), queued by `S13`, and the reader
is told — because the recipe genuinely has no name, and refusing is right.

### The copy that leaves the phone must be as honest as the screen

`R117`, found by asking `R116`'s question of the field beside `title`.
`R97` taught every screen to ask whether the book actually says how many a
recipe makes and to print *Not given* when it does not; `R116` did the same
for a missing name. Neither reached `recipeText`, which is **not a screen**:
it is the copy that goes to another person, through Share and through
*Download as text*. On a recipe with no contributor and no count it read

    From: undefined
    Serves 4 (adjusted from undefined)

while the screen beside it correctly said *Not given*. That is the worst
place in the app for it — everywhere else the reader sees the gap and can
judge it; here they hand it to somebody else, in their own name, with the
word *undefined* in it.

The servings guard has to be `hasCount(r)` and not `S.serves ===
r.servings`: a countless recipe still has a working stepper, so `S.serves`
is a real number while `r.servings` is absent, which is precisely how
*adjusted from undefined* was produced. Print was already honest — `dl-pdf`
and `plan-print` render the DOM, so only the two text paths were wrong.

### One dot between two things that are there

`R118`, the visible tail of what `R116` and `R117` chased. Four lines were
built as `a + " · " + b` with both halves taken on trust, so a recipe with
nobody named read **"Dinner ·"** on its card, **"· Dinner"** on its own page,
**"Dinner · · matches ingredient"** when the search had something to add, and
left an empty `<p>` on the front page (measured at zero height, so it cost no
space — simply an element with nothing in it).

Small on a screen and not small in a kitchen: this app exists because someone
reads it with low vision, and a leading middle dot is punctuation noise where
a name should be — and a screen reader says it out loud. `metaLine(parts)`
drops the empties and joins the rest; it deliberately does **not** escape,
because every caller assembles parts that are already escaped and one of them
carries a `<span>` for the search match-note.

### Editing must not quietly rewrite a count nobody touched

`R119`, and `R97`'s principle from the other side. `R97` settled that a
recipe with **no** count must not gain one by being edited; this ran
`Math.min(40, typed)` over whatever the servings field held — including a
value the reader never went near. Measured: a recipe stored as **200** (a
church-hall pot, which people genuinely write), opened in Edit, the title
changed and nothing else, Save pressed → stored servings **40**. No warning,
and on a sharing phone straight into the family's book.

**Three places disagree about the range, and that is what let it hide**:
`normalizeRecipe` accepts 1–999, `saveDraft` clamped to 40, and both
`validateRecipe` and the `kitchen.recipes` column allow 1–40. Making them
agree is a schema change and Jason's call — recorded, not taken. Not
rewriting what a person wrote is not a schema change, so: a count the reader
did not touch survives untouched, and one they **did** type past the limit is
clamped *and said*. This app does not change someone's words behind their
back.

### Typing a recipe in guessed like an import, and never said so

`R121`, and the last of the servings trio. The Add screen's own save read
`Math.min(40, Math.max(1, parseInt(...) || 4))`, so a count left blank became
**4** and one typed past the limit became **40** — both correct values, both
arrived at in silence.

The silence is what was wrong, because this app already knows better: every
import path that cannot read a count defaults to 4 and **flags it** —
*"Servings — no count was found; 4 was assumed."* — which the recipe page
shows as a Double-check chip beside the field (`082`). An import cannot ask;
a person typing can simply leave the box empty, so this was the one path
guessing without disclosing. It now uses the same sentence, so one situation
has one wording.

The clamp is **said** rather than flagged, matching `R119`: a flag is for
something to go back and check, and a number the reader typed a moment ago
needs telling now. That needed `S.carry` — a sentence that outlives one
navigation, since this screen saves and then goes straight to the new recipe
and `onRoute` clears the notice on the way.

### A flag that has been dealt with stops saying it has not

`R122`. `082` gave every flag the name of its field — *"Servings — …"*,
*"Title — …"* — and put a Double-check chip beside that field. **Nothing
ever took one down.** `saveDraft` never mentioned `flagged`, and there is no
dismiss anywhere in the app.

So an import that could not read a count flagged *"Servings — no count was
found; 4 was assumed."*, the reader opened Edit and typed the real number,
and the recipe went on carrying that flag for good — beside a count the
reader had set themselves. A *worth double-checking* list that never empties
is a list nobody reads, which costs the reader the one mechanism built to
tell them what still needs attention. The same fault this project keeps
finding — a sentence that has stopped being true — on the feature whose
whole job is to be true.

The rule is the naming convention itself: **a flag naming a field is
answered when that field changes.** A flag that names no field is left
alone, because nothing can tell whether it was dealt with — inventing a
dismissal for those is a different feature, not a corollary of this one.
Both directions are mutation-tested: never clearing, and clearing
everything, each fail by name.

### The help explains tags, which it had only ever assumed

`R126`. The help page told a reader how to browse by person and by course,
and mentioned tags exactly once — as something the search box reads. It
never said what a tag **is**, that tapping one on a recipe shows everything
else wearing it, or that the Filter sheet lists them.

`S11` then made the omission worse rather than better: keeping the sharing
rule honest, it added *"Tagging several recipes at once, and renaming or
merging a tag, go to everyone the same way"* — naming two controls the page
had never introduced, so a reader met what Tag mode does to the family's
book before being told it exists. `R90` set the precedent when Remove was in
the same position: the page names the control, says where it is, and says
what it is for.

**And the labels it names are checked against the buttons the app draws** —
taken *from the section* rather than a list beside it. A hardcoded list was
written first and the mutation testing killed it: renaming a control in the
prose to a button that does not exist passed, because the list did not
follow the words. `CONCEPTS` is the named exemption in `R114`'s shape, one
entry long, for a bold word that is an idea rather than a button.

### Every rule in the stylesheet is for something the app draws

`R125`. `tokens.css` has been protected since `R48` — no colour may exist
outside it. **Nothing protected the other direction**: a rule for a class the
app stopped emitting stays forever, and the next person reading `style.css`
cannot tell a live rule from a fossil. Three had accumulated — `.form-grid`
(the app draws `.topgrid`/`.bodygrid`), `.main__marks` (never rendered), and
`.sheetbtn--acc` with its entry in the shared focus-ring list. A stylesheet
nobody can trust is one people work around rather than edit.

Removed, and the gap closed the way `R48` closed its own: **enforced rather
than remembered**. The exemption list is present and empty on purpose, with
`R114`'s rule attached — a class built by concatenation could trip this
honestly, and when the first one does it gets a name and a reason there
rather than a loosened check. `tokens.css` is deliberately outside the scan:
it is copied in verbatim from the handoff and is the one file this project
does not get to tidy.

### One reader for a flag's field, and a tolerant one

`R124`. `R122` and `R123` each learned to answer a flag by the field it
names, and each did it with **its own copy** of the same expression. Two
copies of one rule is the drift `R114` exists to stop — and this pair is
worse than most, because the shape being parsed is written by a **language
model**: `backend/lib/extract.js` asks for *"Field — what needs checking"*
and then stores whatever comes back verbatim. Every other field in that
function is coerced; flags alone are taken as typed. A model writing
*"Servings: no count was found"* would produce a flag neither round could
ever answer — `R122`'s permanent stale warning, back through a door nobody
was watching.

Fixed on the **reading** side rather than the writing one, deliberately.
Flags come from four writers — the extraction model, the link parser, the
photo parser, and a hand-edited `recipes.json` — so a list of field names
kept on the server would be a fifth thing to hold in step with the app. One
tolerant reader covers every writer and cannot drift from itself.

The mutation testing earned its place here: dropping the separator entirely
passed every check, because the prose case started with *"The"* and no field
is named that. The gap was real — *"Steps taken after the oven were never
shown"* would have read as an answered `Steps` flag and vanished. That case
is pinned now, and the separator is load-bearing rather than decorative.

### Fixing a flagged field on the review screen kept the flag anyway

`R123`, the sibling of `R122` on the screen built for exactly this job. The
import review shows the flags **and** every field they name, and then carried
all of them through verbatim. So an import that found no title flagged
*"Title — none was found on the page; add one."*, the reader typed one in the
box directly beneath that sentence, and the recipe was born still carrying it.

No baseline was needed, which is what kept it cheap: *"none was found"* is
answerable from what is being saved. **The count was not**, and the first
attempt got that wrong — it assumed `R121`'s save-time logic would regenerate
an inherited assumption, when that logic can only tell a blank field from a
filled one, and a draft holding an assumed 4 looks exactly like a reader
typing 4. The suite caught it. The count takes the course's rule instead: the
flag says *4 was assumed*, so a saved count that is no longer 4 is one the
reader changed.

The course is the one real judgement call and is left standing when the
category is still Dinner — the reader either agreed or never looked, and
nothing there can tell those apart.

### After Save, the fields show what was kept

`R120`. `saveDraft` has always tidied on the way past — a title cleared to
nothing falls back to the old one, blank lines are dropped, and since `R119`
a count typed past the limit comes back to 40. Every one of those is right.
**None of them was ever shown back.**

Measured: type 300 into Serves and press Save. The notice correctly says
*"300 was saved as 40"* — and the field goes on reading **300**. The reader
is told the right thing and shown the wrong thing in the same moment, and
the one they will believe is the box in front of them. Clearing a title was
worse: the field read empty, the book had quietly kept the old name, and
nothing said so at all.

Structural rather than a patch per field: the form is re-seeded from the
recipe that was actually stored, so what is on screen and what is in the
book cannot disagree. It also covers the tidying nobody had thought about —
blank ingredient lines dropped on save now leave the fields too.

### A validator must judge what it stores, not what it was handed

`R115`. `validateRecipe` read the **raw** string for every check and then
stored the **trimmed** one, which are two different strings. A title of
three spaces is truthy, is a string, and is under 300 characters, so every
check passed — and `.trim()` made it empty on the way into the database: a
**nameless recipe in everyone's book**, out of the one function whose whole
job is to refuse what the app would never send. The contributor mattered
more than the title, because `putRecipe` inserts it into
`kitchen.contributors`: an empty one mints a blank row that becomes a blank
tile under "Whose recipe?", and a contributor outlives the recipe that
created it. An optional field of spaces became `""` in a column that means
*nothing here*, giving the schema two ways to say the same thing.

The same gap was in `db/migrate.js`, on the path that reads the
hand-editable `recipes.json` **every night with nobody watching**. Both are
fixed, and the two are checked against each other: they guard the same field
for the same reason and must not disagree about what counts as a name.
`image` is deliberately not on that rule — it has a required shape (`S05`),
so whitespace is malformed rather than absent and is refused by name; the
asymmetry is pinned by a test so it stays a decision rather than an accident
of statement order.

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

### Sharing an edit (the `S` arc — Jason's ask, 2026-08-22)

*"If someone edits a recipe, can we have that change happen on the server?
This way it is automatically adjusted for everyone."*

The pipe already existed: the database is the canonical shared copy, the
video importer already writes recipes into it, and `db-sync` already turns
it back into `recipes.json` and commits. What was missing was a way for an
**edit** to use any of that. Now:

Save in Edit mode writes to `localStorage` exactly as before and says so —
**then**, if the phone holds the family passphrase, it sends the recipe to
`PUT /api/recipes/:id`, which upserts it and asks `db-sync` to republish.

- **Local first, always.** The phone's copy is saved and reported saved
  before a byte goes anywhere. Render's free tier sleeps; that must cost the
  reader nothing they typed.
- **A shared passphrase, `KT_WRITE_KEY`, entered once per phone.** Reading
  needs nothing and must keep needing nothing; changing the book for
  everybody needs the one secret the family shares, because the alternative
  is that anyone who finds the address can rewrite Joan's recipes and nobody
  could say who did. It **fails closed**: unset means nobody writes.
  `contributor` is still a byline and is never consulted — the passphrase
  says *someone in this family is holding the phone*, not *this is Jennifer*.
- **An edit overwrites; an import still suffixes.** `acceptJob` refuses to
  clobber because two people accepting one draft must not replace each
  other. An edit is the opposite instruction — someone opened *this* recipe
  and changed it — so `putRecipe` writes over that row, and takes the id
  from the **path** so a body cannot redirect the write onto another recipe.
  `position` is deliberately never updated: fixing a typo must not jump a
  recipe to the top of "recently added".
  **And a create is neither** — see below (`R127`).
- **Tags are replaced, not merged**, or removing one would never stick.
- **The publish poke never fails the write** (`lib/publish.js`). The recipe
  is already in the database; the nightly run would publish it regardless.
  It is debounced, so four typos fixed in a row cause one publish.
- **`R107`'s rule governs what is said.** A 4xx is a refusal that will never
  clear ("It stays here until that is sorted"); a 503 is Render waking
  ("try Save again in a minute"). Saying "yet" about the first would be a
  promise nobody can keep.

**And the thirty seconds it said nothing** (`S12`). `S04` set `S.sharing`
before each write and `S.shared` after it, and **nothing ever read either
one** — write-only state that was meant to be an indicator and never
became one. So the phone saved the change, the button said *Saved ✓*, and
then a request ran for up to half a minute against a Render free tier that
has to wake up, with the screen saying nothing at all: `shareEdit` passes
`quiet` to `kitchenFetch` on purpose, which suppresses even the *waking up
the kitchen…* card. Somebody who closed the page in that window lost a
change the app had just told them was safe.

The rule it settles: **the eye gets progress, the ear gets one sentence.**
The visible line counts through a burst (*"Sending to the family's book —
3 of 12…"*), while `liveMessage()` returns a deliberately constant
sentence so `announceOnce` drops the repeat and a 48-recipe burst is not
read out forty-eight times. Four hand-written `if (S.notice)` blocks
became one `noticeHtml(cls, style)`: there had been nowhere for a second
line to go, which is part of why the indicator was never built. `S.shared`
is deleted rather than wired — it only ever repeated what the notice said.
And `tests/sec.js` caught the new helper writing a raw `style=` within
minutes of it existing: every caller passes a literal, but the rule is that
an attribute built by concatenation is escaped, so nobody has to re-derive
per call site whether that particular value can be reached by anything a
person typed. `R114` then closed the older half of the same gap: `R54`'s
exemption list calls `id`, `act` and `cls` "literals passed by the caller",
which is an assertion about **call sites** that nothing verified — one
`tagsFieldHtml(r.id, …)` written later would leave the suite green while a
hand-edited id went unescaped into an `id=` and a `for=`. Every such call
site is now checked to pass a real literal, and a local `var cls = …` is
checked to read no property. An exemption allowed to drift is a hole.

**And a way back for a change that did not get through** (`S13`).
`DECISIONS.md S` had recorded this as deliberately not built: a failed
single edit could honestly say *try Save again*, one tap away, but a failed
bulk tag could not — redoing it means re-picking every recipe, and a rename
cannot be redone at all once the old name is gone — so `S11` named the state
and stopped rather than giving an instruction nobody could follow, and wrote
down that the real fix was a queue with a button. `kt.unsent` is that queue.

It holds **ids only, never recipes**: every one is read fresh from the
overlay at the moment it is sent, so a change made after the failure goes
too, and an id whose recipe has since been removed simply drops out. It is
coerced where it is read like every other key (`R21`, `R40`, `R62`) — a
queue that is not a list is no queue, and one holding rubbish keeps the ids
it can use. The offer appears on the Menu only on a phone that shares, only
while something is waiting, and never during a send. Every bulk failure
sentence points at it now that pointing is honest; the single-edit sentence
still says *try Save again in a minute*, because that reader is looking
straight at the Save button and sending them to another screen would be
worse advice.

**One known mismatch, recorded rather than fixed.** The app treats a
serving count as optional — `R97` made sure a recipe without one does not
gain one by being edited — while `kitchen.recipes.servings` is `not null`
and `validateRecipe` refuses anything else. So a recipe with no count could
never be shared: a single edit would come back refused, and a bulk change
would stop dead at it. Nothing in the book lacks a count (all 48 have one,
and every import path defaults and flags rather than omitting), and no path
in the app can remove one, so this is unreachable today. It is written down
because the two models disagree, and the first countless recipe would find
that out the hard way.

Two variables for Jason, both in Render, neither in this repo or in chat:
`KT_WRITE_KEY` (the passphrase) and `KT_GH_TOKEN` (optional — without it a
change waits for the nightly sync instead of arriving in minutes).
`backend/README.md` has the checklist.

**Every way in shares, not just Edit** (`S09`). `S04` wired this into Edit
mode alone, so changing a recipe reached everyone while typing one in did
not — and the video path had been telling the server all along. All three
ways now behave the same; a video draft still goes through `acceptJob` only,
never both.

**And the sentences it falsified.** The help page said *"your changes live
on your phone only"* (`S06`), the family walkthrough `ADDING.md` said it
again and then contradicted itself (`S07`), and *"Undo all my changes on
this phone"* promised an undo it no longer fully delivers (`S08`) — all
true for the whole life of this app until the round before them made them
false. Each now reads the phone rather than describing phones in general,
and is checked from both sides.

Removal's sentence changed too, but the other way (`S10`): removal is
still deliberately local, so both halves of its confirm say **"from this
phone"**, and on a sharing phone one more line names the exception — *it
stays in everyone else's book; removing is the one thing this phone keeps
to itself*. The trap that fixed was the worst shape a wrong sentence can
take here — someone removes a recipe believing the family lost it too, so
it stays live for them **and** their own copy is gone.

**And the changes made to many at once** (`S11`). `S04` wired sharing into
the two places a recipe is written one at a time, and missed the two places
this app writes to **many**: Tag mode's *Add tags*, and renaming or merging
a tag. Both wrote the overlay and stopped, on phones where every single
edit reached the family. That is the worst place for the gap to be — tag
hygiene is the one part of this app built specifically to keep the *whole
book* consistent (`067`–`069`), so a rename landing on one phone only is
exactly how the near-duplicate tags that machinery exists to prevent get
made, and the next ordinary edit from the other phone puts the old spelling
back into the family's copy. `shareEdits` now sends every recipe a bulk
change touched, **stops at the first failure** (one outage is one answer,
not a wasted thirty-second wait per recipe), and reports how far it
actually got.

Every write of a burst but the last carries **`?more=1`**, which tells the
server to hold the publish poke. Without it the *first* row of a
48-recipe burst fires the republish, and the publisher's own 90-second
cooldown guarantees no later row can fire a second one — so whether the
rest reached the file was a race between Neon and a GitHub runner starting
up. A phone that closes mid-burst simply never pokes and the nightly sync
picks the change up: **late, never wrong**, which is the direction this app
errs in.

### A recipe born on one phone landed on top of another's

`R127`. `S09` made every way in share, which was right, and did it by
sending a newly typed recipe through `shareEdit` — the function written for
an **edit**. The two are opposite instructions and the wire could not tell
them apart:

- an edit says *someone opened THIS recipe and changed it*, so `putRecipe`
  overwrites that row on purpose;
- a create says *here is a recipe I just wrote*, and its id came from
  `slugify(title)` against **this phone's** copy of the book.

`acceptJob` had answered this from the day it was built, in words that
transfer whole: *"the phone chose the id against its own copy of the book;
another device may have taken it since. Suffix rather than overwrite — a
duplicate the family can see and delete beats a recipe silently replaced."*

It is most reachable on exactly the phones this app is built for. The
overlay is authoritative, so a phone with any local change **stops seeing
recipes added to the published file** — "I have never heard of that id" is
the normal state, not the rare one. Two people each type in *Shortbread*
and the second save **deletes the first one's recipe out of the family's
book**: no warning, no copy, and the phone that lost it still shows its own.

Proven on a real Postgres, not argued from the source: `tests/sql-live.js`
extracts the shipped statement out of `server.js`, prepares it (which is
also the only way to know Postgres can *type* a parameter in an
`on conflict … do update … where` clause) and runs it. Before the fix the
row at `shortbread` read *Lindsay's Shortbread/6* where Jennifer's had been.

Three parts, and none of them stands alone:

- **`?new=1`** on the write, derived from the recipe rather than passed
  down from the call site — `bornHere(r)` is false when the book has
  confirmed an id for it or when it came from the published file, and true
  otherwise. Derived, so `S13`'s queue re-sending an hour later gets it
  right, and so does anything written next.
- **The suffixing rule moved into `backend/lib/ids.js`**, so the import
  path and the write path cannot drift apart on a question they must answer
  the same way. The conflict clause carries `where ${isNew ? 0 : 1} = 1`,
  which is what stops a create falling through to the overwrite when it
  loses a race; a create that comes back empty looks for a free id again
  rather than pretending.
- **`kt.shared`** — the id the family's book actually used, kept per phone.
  Without it the destruction simply moves one step later: the phone's next
  edit of its own recipe would be addressed at the id it minted, which by
  then is the stranger's row. The recipe goes up wearing the book's id
  (`putRecipe` refuses a body that disagrees with the address, on purpose)
  while this phone's copy keeps the id it was born with — photos, the week
  plan and the queue are all keyed by it.

And **an entry stops being true when the copy it describes is gone**, which
the first version got wrong: Remove and *Undo all my changes on this phone*
both forget, or a stale note would address someone else's edit at this
phone's abandoned row after the next nightly sync. `kt.unsent` needs no
equivalent because it is read through `byId`; this map is read with the
recipe already in hand, so it cannot notice.

The reader is told when it happens — *"someone had already added a recipe
with this name, so yours is in there as “shortbread-2” rather than over
theirs"* — because they are the only person who can say whether those are
two recipes or one.

### The line under a recipe named one provenance for every provenance

`R128`. All 48 recipes in the handoff carry a `source` that is the name of
the note Joan's screenshot came from — *Chicken fritters*, *BBQ steak
times* — and the recipe page printed **"From Joan's screenshots · <name>"**,
which is true of those 48 and of nothing else.

It printed it for every other recipe too, and three import paths write a
`source` of their own: a link import and the video importer store the URL,
the photo path stores *Read from a photo*, the paste box stores *Pasted
text*. So a recipe pulled off a cooking site read **"From Joan's
screenshots · https://cooking.example.com/…"** — Joan credited for somebody
else's recipe, in the one book where whose recipe it is is the entire
point. The contributor split was corrected once for exactly this reason.
There was no field to fix it with either: `source` is written by the import
paths and is not on the Edit form.

The set of writers is **closed**, which is what makes reading the value
safe rather than a guess: a URL, one of two phrases the app writes itself,
or a note name out of the handoff. The phrases are named once
(`SOURCE_SELF`) so the writer and the line that prints them cannot drift,
and a check holds every writer to producing one of the three shapes.

The address is shortened to its site on screen — *From cooking.example.com*
— because a 120-character URL at this size is a wall and is not tappable by
design. The whole address still goes out in Share and *Download as text*,
which is checked rather than asserted: that is where somebody goes to find
their way back to it.

### A shared video named nobody before it was sent

`R129`, and the one screen that could not say anything.

**The consent half.** The video form carries this comment directly above
its disclosure: *"Same disclosure discipline as the link importer (050):
name every service the link touches before anything is sent."* The share
target skipped that form entirely — `V04` had a shared video *submit
itself*, so the boot handler called `submitVideo()` out of
`consumeSharedLink` and the progress card replaced the form. On the app's
**primary** path into the video importer, Render, Groq and Anthropic were
named nowhere: not before the request, not during it, not at all.

It is also the one path where a fumbled share sheet starts a **paid**
pipeline — yt-dlp, Groq, then a `claude-opus-5` call — with no way to say
no first; `backend/lib/budget.js` exists because those cost money.

So the share still lands on the video form with the address already filled
in, which is what `V04` was for, and waits for one tap. The two ways into
the video importer behave the same way now — the `S09` lesson. Provisional
and reversible, with the one-line reversal written down in `DECISIONS.md`.
`ADDING.md`'s *"The link lands in the importer and sends itself"* went the
same way as the sentences `S06`–`S08` corrected.

**The slot half, which is why the first half had somewhere to speak.**
Every other screen has had a notice slot since `S12` gathered four
hand-written `if (S.notice)` blocks into `noticeHtml`. The Add screen never
did — so `setNotice` there wrote to a place nobody rendered. `083` gives
every review line a one-tap *send it to the other list*, because a parser
guesses the ingredients/steps split and on a photographed card it guesses
wrong often; the tap moves the line to the **bottom of the other list**,
off screen on any real import, and `setNotice("Moved to the
instructions.")` was the entire confirmation it went anywhere. It reached
`liveMessage`, so a screen reader heard it and the eye got nothing — the
exact reverse of `S12`'s rule, on a line that had just vanished from where
the reader was looking.

### A photo that needed twice the room, and a sentence a microtask ate

`R130`, in three lines of `saveAdd`.

A photo is staged under `__new__`, because a recipe's id only exists once
the title is known, and moved across on Save. The move **wrote first and
deleted after** — so on the localStorage path (the one a phone without
IndexedDB takes, and the only reason the "no room" message exists) the
store briefly held the same picture twice. A photo that fitted once did not
fit twice: the write failed, `setImage` dropped its copy, and the delete
then took the staged one. **The picture was gone from the phone
altogether**, on a save the reader was told nothing about. Removing first
means one copy at a time, and the same photo now fits — measured, on a
phone stubbed to refuse exactly the two-copy write.

And when a phone is genuinely full, the sentence has to survive the
navigation. `setImage` returns an **already-resolved** promise on that path,
so its `.then` is a microtask and ran before the `hashchange` the next line
queued; `onRoute` then did `S.notice = S.carry || ""` and wiped it. The
reader arrived at a recipe with no picture and no reason. The move is
finished before the route changes now, and its message rides across in
`S.carry` — which is what `R121` built that key for. Both sentences can be
true at once (a clamped serving count and a photo with no room), so they
are joined rather than one swallowing the other.

The comment above those three lines had said, since the day they were
written, *"if the persist fails the recipe still saves and the failure is
said out loud."* On the IndexedDB path it was true — `idbPut` rejects on a
database error event, which is a task, so the sentence lands after the route
change. The fallback path is where it was false, and the fallback path is
the one with the smaller quota.

### Three sweeps, one list, and a comment that said so before it was true

`R131`. The app is walked screen by screen four times over: the contrast
audit, and — in `tests/kt.js` — the 48×48 icon rule, the 44px floor, the
accessible-name sweep and the focus-ring sweep. Each carried its own
hand-typed route list, and they had drifted to **32, 5, 6, 16 and 6**
screens respectively. The accessible-name list's comment said *"Same list
the contrast audit walks"*, which was false by sixteen screens.

The floor sweep's own comment is the argument, one level down:

> Every screen, not just the Menu: the servings number shipped a hair under
> the floor (`R16`) precisely because this sweep only ever visited one route.

`R85` found **192** contrast failures the moment two unswept modes were
added, so *which states are missing* is a question worth answering once, in
one place, rather than five times.

`tests/screens.js` is that place: the list, and the **opening procedure**
with it. Several of these states need more than one tap to exist (the tag
sheet wants Tag mode and a selected recipe first; the refused-link screen
wants a URL typed and submitted), several need a seed planted before boot
(`R101`), one needs the network held and then refused (`R110`), and each
carries the selector that proves it opened rather than silently auditing
the screen behind it (`R86` found four routes doing exactly that). A state
one sweep can reach is now a state all of them can.

Nothing was found: every icon button is 48×48, nothing interactive is under
44px, every control has a name, every field a label, every tab stop a focus
ring, and no decoration speaks — across every screen the app has. The
coverage was fine; the guarantee was not, and it is the guarantee that has
to survive the next screen somebody adds.

One more thing fell out of it. Atkinson is self-hosted (`049`) and arrives
after first paint: measured before it lands, a 44px control reads **43.98**
and a 24px line reads **23.9** — one flips the tap-target floor, the other
flips which AA ratio applies — and both do it at random. Reproduced while
mutation-testing this round, on the Main header's two documented 44px
controls. The shared opener waits for `document.fonts.ready` now, so neither
audit is one sub-pixel from a false alarm.

### A recipe the app would store, show, and never open

`R132`. `parseHash` decides what an address means, and it decided by prefix:

```js
if (raw.indexOf("menu") === 0) …the Menu
```

An id is the whole address a recipe is read at, and ids come from
`slugify(title)`. So *Menu Of The Week* — or a video import called *Menu
Prep Sunday* — minted `menu-of-the-week`, and the recipe was then saveable,
listed, tappable, and **opened the Menu**. The four bare screens took their
words outright: a recipe called *Plan*, *Add*, *Help* or *Main* opened the
week planner, the Add screen, the help page or the front screen.

Measured with seven seeded recipes: six drew a card on the Menu and every
one of those six opened a different screen. Same family as `R70`, where a
recipe *"could never be opened at all"*, and worse in one way — the card is
there, so it is a recipe that vanishes when you tap it.

Two halves, and the order matters:

- **The router is exact** (`raw === "menu" || raw.indexOf("menu?") === 0`),
  which rescues every id that merely begins with a screen's name.
- **The five that ARE a screen's name cannot be rescued that way.** The
  app's own screens have to win, or a recipe called *Plan* would take the
  week planner away from the family. So they are suffixed at the boundary,
  which is exactly what `R70` does with a duplicate id and for the same
  reason — the reason travels on the recipe, and the id rides into the next
  download, where it fixes the file.

`ROUTE_WORDS` is the one list. The router spends those words, the app's
boundary moves recipes out of their way, `saveAdd` mints around them so a
recipe typed in as *Menu* opens the moment it is saved, and both server
boundaries — `validateRecipe` on the wire and `db/migrate.js` on the
nightly file — refuse them outright, so no phone has to keep renaming the
same recipe at every boot. The two server boundaries share the list rather
than each typing it, which is `R115`'s rule about the title applied to the
id.

And the check that will actually matter later: the routes are **derived
from `parseHash`'s own source** and compared to the list, so a sixth screen
added without a word for it fails by name. Reading the code and not the
comments, because `parseHash` quotes the old line to explain itself — a
check a comment can trip is a check that cries wolf.

### The print pass kept its own copy of everything, including a bug

`R133`, and the completion of `R131`. That round unified five hand-typed
screen lists into `tests/screens.js` and left a sixth: the **print** pass,
in the same file, with four names of its own, its own copy of the seed and
its own opener.

The copy had drifted. It planted meals at `today + n days` in **UTC**,
which is precisely what `R113` fixed in the other copy — offsets from today
walk off the end of a Monday-to-Sunday week at the weekend. Measured across
a week: **every Sunday**, the second meal lands in the *next* week, so the
printed shopping list carries one meal instead of two and the audit reports
*AA clean* over half of what it thinks it read. (`toISOString` is a UTC
instant too, which moves the date again for anyone west of it — the reason
`R113`'s note says "in local date parts like the app's own `isoDate`".)

Its opener had drifted the other way: no proof that the state it wanted
ever appeared, which is the fault `R86` found four times in the screen pass.

So printing walks the shared list now, through the shared seed and the
shared opener. **Which screens go on paper is a different question** — nobody
prints a sheet, a popup, or the Add screen — so it is answered beside the
list rather than in another file, as a named set with three floors: every
printable name is a real screen, paper is a smaller question than the
screen list, and nothing that only exists as a sheet is on it.

The first floor earned its keep immediately: *Recipe with a tag* turned out
to exist in the print list and **nowhere else**, so no screen pass had ever
looked at a recipe carrying a tag chip. It is a screen now, audited in all
four theme/Easy-Read combinations, and clean.

And the drift itself is pinned twice: `openScreen` refuses any planner
screen showing fewer meals than the seed planted — the check that would
have caught this by name, in the print pass, on a Sunday — and `seedInit`
is held to the Monday anchor and to local date parts, so the formula cannot
come back.

### Two tabs of the same book, and one of them lost

`R134`. `persistRecipes` wrote `S.recipes` — the list this tab read at boot,
with this tab's change applied. Two tabs of the same site share one
`localStorage`, so the second save wrote a snapshot that had never heard of
the first.

Measured: tab A renamed *Chops* and was told **Saved**; tab B then saved a
change to *Crepes*, and the book held `chops = "Air Fryer Chops"` — the
original. Tab A's change was gone, silently, while tab A still showed it on
screen. A recipe **added** in one tab vanished the same way. CLAUDE.md's own
words for that shape: *a change reported as kept and silently dropped is the
worst thing this app could do to a book of someone's recipes.* And on a
sharing phone it is worse — tab A's save had already reached the family, so
the family's copy and the phone that made the change now disagree, with the
phone's next edit pushing the old version back.

iOS Safari keeps tabs for months, and a home-screen install beside an open
tab is two instances of this app. It is not an exotic state.

`writeRecipes(change)` re-reads the stored book, applies the change to
**that**, and writes it back — so the other tab's work arrives on this
screen in the same moment. All five writes go through it: an edit, an add, a
removal, a tag rename or merge, and a bulk tagging.

Two tabs editing **the same** recipe is still last-write-wins. That is a
different question and an honest one; two tabs editing two different recipes
must not lose either. One case needed a ruling: another tab removing a
recipe while this one is editing it. The edit wins and puts it back —
the reader is about to be told it was saved, so it has to be, and an edit is
typing where a removal is one tap that can be made again.

### The other two stores were written whole as well

`R135`. `R134` fixed `kt.recipes`; the app owns two more stores and both had
the same hole.

**The week.** `persistPlan()` wrote `S.plan` from three call sites —
planning a meal, changing its servings, removing it. Measured with two tabs
planning two *different* days: one meal survived. `writePlan(change)` reads
the stored week, applies the change to that, and writes it back, coerced on
the way in through the same `planFrom` the boot read uses, because a plan
written by another tab is a stored shape like any other.

**The photos, on one path only.** `setImage` serialises the whole in-memory
map. On IndexedDB that is per-key and was never in the way; the
**localStorage fallback** — the path a phone without IndexedDB takes, and
the only reason the "no room" message exists — wrote the whole map from this
tab's boot-time copy. Measured with two tabs attaching to two different
recipes: one picture survived. Reading the stored map back also lets a tab
*see* the other's photos, so the entries are folded into the in-memory cache
rather than only into the write.

**Two stores already had the rule**, which is what made the omission in the
other three worth naming: `queueUnsent` reads `unsentIds()` fresh and
`noteSharedId` reads `sharedIds()` fresh, and always have. The rule existed;
it had simply never reached the two biggest stores.

So the fix is pinned where a new call site could go round it: `persistRecipes`
and `persistPlan` are reachable from their re-reading wrapper and from
nowhere else, and both writes of the photo map start from `storedImages()`.

And the check that nearly did not check anything: `/function queueUnsent\(
[\s\S]*?unsentIds\(\)/` matches `unsentIds()` in the *next* function, so it
passed for a body that had stopped reading. Found by mutating the queue and
watching nothing fail. The bodies are sliced now, with a floor that the
slices found them — the second time this session a cross-file lazy match
produced a check that could not fail.

### The undo left a queue pointing at changes it had just undone

`R136`. `R127` wrote the rule: **an entry stops being true when the copy it
describes is gone.** It applied that to `kt.shared` and then reasoned that
`kt.unsent` needed no equivalent, *"because it is read through `byId` and an
id with nothing behind it simply drops out"*.

Half of that is right. Remove takes the recipe out of the overlay, so `byId`
finds nothing and the id really does drop out with no bookkeeping at all —
that half stands, and is pinned now so it stays a decision. **The undo takes
the overlay out instead**, and then `byId` stops finding this phone's changed
copy and starts finding the *published* one: an id with something behind it,
and not the thing that was queued.

So "Undo all my changes on this phone" — the control whose own comment says
*this is the control somebody reaches for when they are worried, so its
sentence has to be the most honest one in the app* — told the reader every
local change was undone, and the Menu went on offering **"Send 1 change to
the family's book"**, with `kt.unsent` still holding the id. Measured, with
an id the published book really holds; an invented one drops out on its own
and hides the whole thing, which is why the test takes its id **from
`recipes.json`** rather than typing one.

And tapping that button is not a no-op. `bornHere` is false for anything in
the published file, so the send goes up as an **edit**, and `putRecipe`
overwrites the family's row on purpose. What it overwrites it with is this
phone's copy of the published file — which is the same content on a good day,
and somebody else's newer edit on a bad one, because the database is ahead of
`recipes.json` between nightly syncs. A phone told it had undone everything
reaching out and writing an old copy over a newer one is the wrong direction
for this app to err in.

It **forgets rather than flushes**, and that is the one judgement call: the
reader asked for those changes to be undone, not delivered. Clearing is
unconditional too — the queue outlives the passphrase, so a phone that shares
nothing today would meet the same stale offer the day somebody puts the
passphrase back in, with no undo left to blame.

And **which stores the undo must take with it is decided once** rather than
remembered at each new one. Every key in `K` is either cleared by the undo or
named with its reason — a preference, the photos it keeps on purpose and says
so, the week, the passphrase — in `R114`'s shape, so a sixth store added later
fails by name instead of quietly inheriting whichever answer its author
assumed. That is the check that would have caught this one.

### A poke that never happened still spent the ninety seconds

`R137`, and the first thing this loop has found on the path that publishes
to everyone.

An edit lands in the database and then asks `db-sync` to run, so the family
sees it in minutes rather than overnight. That ask is **debounced** — and
the debounce is not a rate limit. Its whole justification, written at the
top of `backend/lib/publish.js`, is that *"the sync regenerates the whole
file, so a single run covers everything that landed before it"*: it is a
**promise that a run is already covering this**.

`lastAt = now` was set before the request and never given back, so a poke
GitHub refused — an expired token, a 5xx, a name that would not resolve —
held the window for ninety seconds exactly as though it had succeeded.
Measured: two edits twenty seconds apart with GitHub unreachable make
**one** API call, and the second writer is told **"debounced"** — *a run is
already on its way for you* — when there is none. Both changes then wait
for the nightly sync.

Late-never-wrong is the direction this app errs in, and that is the point:
it is meant to be the cost of a phone closing mid-burst, not the cost of one
unlucky request. The claim stays **before** the request, because that is
what stops two writes landing together from both calling GitHub; it is
**given back** when the request did not land. A failure after a success
restores the success rather than clearing it, so the window a real publish
earned is not reopened.

Every existing failure test passed `cooldownMs: 0`, which is exactly why the
seam between *failing* and *debouncing* had never been looked at.

**And the accessor that named a lie nothing read.** `lastSentAt()` was set
for pokes that were never sent, its comment said *"for the tests and the
health endpoint"*, and neither used it — so there was nowhere for the fault
above to show. Health reported `publishes_on_change`, which only ever meant
*a token is set*: a `KT_GH_TOKEN` that has stopped working reads exactly
like one that works, while every change quietly waits for morning. It now
also says when a publish last **landed** and why the most recent one did
not, so a token that expires is discoverable instead of silent. The reason
carries a status code and never the token, which is checked — health is a
public page.

### Four sentences that never learned the app's word for a nameless recipe

`R138`, and the completion of `R116`. That round gave the app one word —
*"Untitled recipe"* — and taught the Menu, both sorts, the recipe page, the
search and the browser tab to use it. Four places that **name** a recipe went
on reading `.title` raw, and all four are places where the reader is being
asked to decide something.

- **The week planner's meal sheet**, and this is the worst of them: the
  heading is also the dialog's `aria-labelledby`, so a nameless recipe
  planned for a meal opened a `role="dialog"` with **no accessible name at
  all**. An empty `<h2>` has no box either, so there was nothing on screen
  to notice — Playwright reported it as *"14 × locator resolved to hidden
  `<h2 id="meal-title" class="sheet__title"></h2>`"*, which is why the first
  version of the test timed out waiting for a heading to be visible and
  measured the bug instead of the fix. `R131`'s accessible-name sweep cannot
  see this: every recipe it seeds has a name.
- **The Remove confirm**, the app's one irreversible dialog, asked
  `Remove "undefined" from this phone?`.
- **The duplicate warning** read *"It looks a lot like ."* — a bold nothing
  and a full stop — and **its link**, whose whole text is the recipe's name,
  read *"Open "*.

Fixing four call sites is one word each. The part that makes it stick is the
rule, in `R114`'s shape: **a recipe from the book is named through
`titleOf`**, and every other `.title` in `app.js` names something that is not
a recipe yet and says which — the draft `R116` deliberately keeps raw so Save
cannot bake the placeholder into the family's file, a parser's own input, a
video job with its own fallback, the import size caps, the browser tab. Three
functions may read a book recipe's title raw and are named with why. A fifth
site fails by name.

The scan's own stripper needed the same discipline. Blanking comments so the
prose above a fix cannot trip it is right — the `R116` comment quotes
`a.title.localeCompare(b.title)` — but the file also contains
`accept="image/*"`, and that `/*` opened a comment that ran on and swallowed
`function startDraft(`, silently mis-attributing every line after it. Found
because a floor said an excused name no longer appeared. Both directions are
pinned now: the stripper must keep `image/*`, must drop the quoted comment,
and `startDraft`'s declaration must survive.

### The one failure nobody wrote a sentence for said too much

`R139`. Every failure path in `backend/lib/pipeline.js` writes a
**hand-written sentence** — *"That video is private, so it can't be
fetched."*, *"This video is about 40 minutes long…"*, the whole of
`friendlyDownloadError`. The one place that stores machine text on purpose,
`failDownload`'s debug tail, runs it through `media.scrubInternal()` first,
whose very first rule strips absolute filesystem paths, because raw tool
output leaks internals.

The catch-all did not — and the catch-all is the one that handles everything
nobody predicted: an SDK error, an `fs` error, a `sql` error. It stored

    Something went wrong while importing — please try the link again.
    (ENOENT: no such file or directory, open
    '/tmp/kt-job-9f2a/frames/frame-003.jpg' while reaching
    http://127.0.0.1:5432)

and `import_jobs.error_message` is rendered to the reader in **two** places —
the failed-imports list on the Add screen, and `S.addError`. So the server's
own temp paths reached the family's screen through the single path whose text
nobody can predict, on a page where every other sentence was written for a
person.

The rule is the simple one, and it is `R124`'s lesson again — one tolerant
reader beats a list of writers: **text this server did not write itself is
scrubbed before a reader sees it.** That takes in the model's
`not_recipe_reason` too, which is prose about the video rather than
internals; scrubbing it costs nothing and means there is no exception to
remember. A `fail()` built only from the app's own words needs nothing, and
most of them are exactly that — so the check is written that way: every
`fail(...)` whose argument carries a caught value must pass through
`scrubInternal`, with floors under both the argument reader and the test that
decides which arguments carry one.

**And one claim that did not survive being checked.** The first version of
this said the scrub must run *before* the 200-character cap "so a path cannot
survive by being cut in half" — and the mutation that swapped the order
passed every check. `scrubInternal`'s path rule matches a truncated path as
happily as a whole one, so the ordering changes nothing today. The order is
kept, because the next rule added may not be as forgiving, and the comment
now says that instead of the thing that sounded better.

### By eye the two modes could not be confused; by ear they were one list

`R140`. `R85` asked whether Remove mode and Tag mode can be told apart **by
eye**, found that they were drawn in the same colours, and settled it with
the danger outline — checked ever since. Nobody asked the same question of
the other channel, and this app exists because someone reads it with low
vision.

Measured. A row in the ordinary list is a link named *"Bacon Ranch Chicken
Casserole, Dinner · Joan American"*. **The same row in Remove mode is a
button named "Bacon Ranch Chicken Casserole Joan"** — the recipe's name, and
nothing whatever about removing it. The only difference a screen reader can
perceive is link-versus-button, which is not a warning. Tag mode was already
right: its rows carry `aria-pressed`, so they announce as toggles. Remove —
the one action that cannot be undone — announced nothing.

It is exactly what `R131`'s sweep cannot catch. That sweep asks whether every
control **has** a name; this is the next question, whether the name says what
the control **does**.

The sentence is the app's own, twice over: the planner's delete button has
always read *"Remove <name> from the plan"*, and `S10` settled that Menu
removal says *"from this phone"* because that is the truth about its scope —
so the row that starts the removal now says the same words as the confirm
that finishes it, which `R138` had just taught to name the recipe properly.
The contributor drops out of the name and stays on the screen: in this mode
it is decoration, and the action and the recipe are what a reader needs.

**The mode buttons are left alone, and that is a decision rather than an
oversight.** They convey themselves by relabelling — "Remove" becomes
"Done" — which is weak, because "Done" alone does not say what is being
finished. Giving them `aria-pressed` while the label also changes is
double-signalling; giving them a stable label instead would change what the
screen says, which is a design question and Jason's call, not a bug fix.
With the rows now naming the action, the mode's meaning is carried where the
reader actually is.

### The app knew the rescale was easy to miss, and told only the eye

`R141`, and `R140`'s question asked one screen over. The ingredient list has
carried this comment since it was written:

> A rescale changes the numbers in place, which is easy to miss at any font
> size and very easy to miss at 40px. The list flashes once so the change is
> seen rather than merely made.

So the app knows, and solved it — **for the eye**. `S12`'s rule is *the eye
gets progress, the ear gets one sentence*, and `liveMessage()` covers
sharing, a notice, the Add screen's busy line, the kitchen waking and a
video's stage. It said nothing about the recipe screen at all: the screen
someone is standing at a hob reading.

Measured, on a recipe that serves 6. Press **+** twice — the count goes to 8,
every quantity in the list moves — and the live region still reads *"Bacon
Ranch Chicken Casserole — Kitchen Table"*, the sentence it announced on
arrival. Not silence: **a stale sentence**, unchanged through two rescales.

It has to be the live region rather than the control. `R106` restores the
caret to the button that was pressed, so a reader stays on *"More servings"*
and the new count is never spoken from anywhere. And the app already
announces the smaller thing — planning a meal says *"… planned for Monday
17"* out loud.

The sentence is armed and consumed exactly like the flash: `S.pulseScale` is
set only when the count actually moved (`S.serves !== before`) and cleared by
the paint that reads it. Two different counts are not a repeat, so
`announceOnce` lets each through; ticking a line off stays silent, because
the row's own `aria-pressed` carries that and a sentence per tap would be
noise in a kitchen.

**And a check that could not fail, again.** The first version of this round
tested the tick only *after* a rescale — so a version that announced on every
recipe paint, regardless of whether anything changed, passed everything.
The check that kills it ticks a line on an **untouched** recipe and requires
the arrival sentence to still be there. That is the second time this session
a mutation has found my own check hollow, and both are recorded rather than
quietly fixed.

### Two taps on Save were two writes, and one of them made a duplicate

`R142`. Render's free tier sleeps, so a write can hang for the best part of
half a minute — `S12` built the *"Sending to the family's book…"* line for
exactly that window. Nothing stopped a reader tapping Save again inside it,
and `shareEdit` set `S.sharing` and fired without ever asking whether one was
already in the air.

Measured, with the write held open for three seconds.

**An edit** sent twice. The first reply cleared `S.sharing`, so the screen
changed to *"Saved, and sent to the family's book"* **while the second
request was still running** — `S12`'s own fault, back through a door nobody
was watching.

**A create was worse.** Two writes, both carrying `?new=1`. The server does
what `R127` tells it to and suffixes rather than overwrites, so the family's
book ends up holding **two copies of one recipe because one person tapped
twice** — and `kt.shared` records the second, which leaves the first orphaned
in everyone's book, edited by nobody. The reader is even shown `R127`'s
disclosure — *"someone had already added a recipe with this name"* — blaming
a stranger for a collision this phone made with itself.

One send at a time now, in `shareEdit` and `shareEdits` both, because a bulk
change started on top of a running one interleaves its writes and clears
`S.sharing` when the **first** of the two finishes. Saving a recipe and then
going off to tag things while the write is still in the air is an ordinary
thing to do on a phone, and it is checked.

The refused change is not dropped: it goes on `S13`'s queue, which exists for
exactly *"this one did not get through"*, and the Menu offers it. Late, never
wrong.

**And the part that needed a second look.** `clearUnsent` at the end of a send
means *what I sent has landed* — which is not true of anything queued **after**
it started. Without that distinction the in-flight send's success cleared the
very id the second tap had just queued, and the change was dropped after all,
silently. `S.reshare` records what was re-queued mid-flight and `clearSent`
skips it. The first version of this fix did not have it, and the queue check
failed by name.

### The one attribute standing between a double tap and a second paid job

`R143`, and the round that did not find the bug it went looking for.

`R142` found an indicator that was never a guard on the write path, so the
obvious next question was whether `S.addBusy` — the Add screen's busy flag —
had the same fault on the path that spends money. It is read in exactly two
places, one that renders a notice line and one that announces it, and
**nothing consults it before starting work**. The busy line is a `<p>` added
above the form rather than a card replacing it, so the form is still there.

All of that is true, and the conclusion drawn from it was wrong. The submit
button reads `S.addBusy` **in the render and disables itself**, which stops
the second tap just as well and is the visible way to do it. Measured: with
the request held open, the button is present and `disabled`, and a click on
it times out rather than posting.

**What was actually missing is the check.** A video job is yt-dlp, then Groq
Whisper, then a `claude-opus-5` call — `backend/lib/budget.js` exists because
those cost money, and a duplicate also spends one of the family's forty
imports a day and leaves two drafts for one video. The link importer walks up
to four relays, every one a third party the reader was told about once. The
only thing standing between a double tap and either of those was one
attribute in one template line, and no suite had ever looked at it.

Both are pinned now, in the two files where each path's network is already
stubbed, and both mutations bite: delete either `disabled` and the second tap
lands — **two POSTs for one video**, or a second walk of the relay chain.

Both halves of each check matter and are asserted separately: the button stays
**present**, so a reader still sees where they are, and is **disabled**, so
the tap costs nothing. A version that removed the button entirely would pass
"no second job" and fail the reader.

### A phone with no signal was told the kitchen might be waking up

`R144`. Nothing in `app.js` or `sw.js` had ever consulted `navigator.onLine`.
So a share that could not go said the same thing whatever stopped it, and one
of the two things it said was wrong.

Measured, the same edit saved twice:

| | what the reader is told |
|---|---|
| kitchen unreachable, phone online | *"…couldn't be reached just now… **try Save again in a minute**."* |
| phone offline, no signal at all | the identical sentence |

*Try Save again in a minute* is right for a sleeping Render and useless in a
kitchen with no bars: pressing it again in a minute fails again, and again,
and the sentence never suggests the one thing that would help. This app
precaches its whole shell so the book opens with no signal — the service
worker's own comment says *"in a kitchen with one bar"* — and then the one
place it matters, telling somebody why their change did not reach the family,
never asked the question the browser answers for free.

`R107`'s design is the shape of the fix. `kitchenFetch` carries **facts** and
the caller words the sentence: `answered` governs retrying, `status` governs
what a caller may say, and `offline` is a third fact in the same shape. It can
only ever **improve** a sentence — `navigator.onLine === false` means
definitely offline, while `true` guarantees nothing — so the request is still
attempted and still retried exactly as before. This changes what is said,
never what is done, and the mutation that says it for *every* failure fails by
name.

Both halves are corrected, because leaving one is the fault `S11` named. The
single write pointed at Save, which is the wrong button with no signal, so it
now points at the queue `S13` built — where the change is already waiting. The
bulk write already ended with *"Send them again from the All recipes screen"*,
so only its cause was wrong: naming the kitchen for the phone's own connection.

### The ground-truth document nobody had ever read

`R145`. CLAUDE.md names the ground truth in priority order: `tokens.css`,
then `design/components.md` and `design/a11y-criteria.md`, then `README.md`.
The first is enforced by `R48` — no colour may exist outside it — and the
last is read by `tests/quick.js`. **Nothing in any suite had ever opened
`design/`**: five documents, 413 lines, including the one that says what
accessibility bar every feature is held to.

So `R131` moved five hand-typed screen lists into `tests/screens.js`, updated
the code and CLAUDE.md, and left the criteria document saying two things that
had stopped being true:

- **the contrast route list is in `tests/contrast.js`** — it holds no list at
  all any more, it requires `./screens`, so a contributor told to add their
  new screen there opens the file and finds nothing to add it to;
- **the accessible-name sweep covers "sixteen surfaces"** — the exact number
  `R131` had already named as the drift, when it now walks the whole shared
  list.

The second is the worse one, and it is the opposite of the usual fault: it
**understates** the guarantee. Someone reading it to learn what is already
enforced is told less is covered than really is, and does the work twice. The
count is not written down any more, because the list it describes is meant to
grow.

**And the mutation that mattered most survived the first version of the
check.** Requiring the document to name `tests/screens.js` *somewhere* passed
happily with the old pointer put back in criterion 1, because criterion 8
mentions the file too. The check is scoped to the sentence that actually
tells a contributor where to add a screen — the fourth time this session a
mutation has found a check of mine hollow, and the fourth recorded rather
than quietly fixed.

### The hermetic promise was kept by hand in ninety places

`R146`. This file has said since the video arc that the suites run
*"hermetically — the suites stub the kitchen server and abort the Render
origin, so CI never wakes the real one."* That was kept one
`ctx.route(...)` at a time, per context, and counting what hand-keeping had
produced:

| suite | contexts | Render aborts |
|---|---|---|
| `tests/kt.js` | 19 | **2** |
| `tests/polish.js` | 36 | 21 |
| `tests/plan.js` | 6 | **0** |
| `tests/quick.js` | 2 | **0** |

**What is measured**: a context made the way `kt.js`'s typing sweep made one
*reaches for* the family's real Render origin on `#add` — four requests per
`freshAdd` cycle, three cycles in that one sweep, because `onRoute` asks the
kitchen for the waiting and failed import lists.

**What is not measured, and was claimed anyway before being corrected**:
whether a CI runner *answers* them. The sandbox this was measured in has no
route to that host, so an aborted request and an unreachable one look
identical from here — and `page.on('request')` fires **before routing and
before any network attempt**, which is exactly how the wrong claim was made.
A runner has open egress, so they very likely would be answered; *very
likely* is why this is written down rather than asserted. The 30-second
`.pathbtn` timeout that failed the suite on `d76fb31` stays **unexplained**
rather than pinned on it.

Reaching for a third party at all, from suites that claim to be hermetic, is
the fault worth fixing either way. `tests/ctx.js` is one maker — 92 contexts
across twelve suites come through it — so a new context cannot be born
without the rule, which is `R131`'s answer to five drifting screen lists
applied to the drift underneath the suites themselves. The two suites whose
whole job is to touch something real, `live.js` and `ocr-live.js`, are
excused by name with their reasons, in `R114`'s shape.

The abort is at the **origin**, not a path: a suite that wants to answer for
the kitchen points `kt.importApi` at its own stub host and routes that, which
never meets this rule. `video.js` already did.

### The one number the app refused without saying so

`R147`, and it was found by counting rather than by hunch: of the 98
`data-act` values in `app.js`, **twenty are never named by any suite**, and
`serv-set` was the one among them that takes free text from the reader and
turns it into a scaling factor. Tapping the servings number and typing one
exists because *"stepping from 4 to 40 is thirty-six taps, which is not a
serving stepper, it is a punishment"*.

Measured on a recipe that serves 6:

| typed | what happened |
|---|---|
| `12` | works — the card and every quantity move |
| `100` | **discarded in silence**, the number snaps back to 12 |
| `0` | discarded in silence |
| *(cleared)* | discarded in silence |

The data was safe — `R120`'s rule held, the field showed what was kept — but
the app had already settled what to say here **twice**: `R119` in Edit mode
and `R121` on the Add screen both clamp **and say** *"This book keeps serving
counts up to 40, so 300 was saved as 40."* `R121`'s own rule is that one
situation has one wording. And since `R141` this very screen speaks when the
count changes, so a rescale announced while a **refused** rescale said nothing
at all.

It clamps and says so now, in the app's own sentence. Clearing the field stays
silent, because nothing was typed.

**And Escape became a real cancel.** Typing changes the count as it goes — the
field deliberately does not re-render — so without putting the old number back,
this round's own change would have left a half-typed count behind on the
keystroke that means *no*. That is `R80`'s sheet contract applied to a control
that had never had one.

**One line came out because a mutation proved it was doing nothing.** There
was an `if (!raw) return;` guarding the empty field; mutating it away changed
nothing any check could see, because `parseInt("")` is `NaN` and the guard
below already catches it. Removing `that` one instead puts **"NaN people"** on
screen, which is how a live guard behaves. A line that cannot be missed is a
line that is not there.

### An address the app could not read — or write — took the whole book

`R148`. `parseHash` is the only thing in this app that reads an address, and
it decoded with `decodeURIComponent` — which **throws** on a malformed
escape: a lone `%`, a `%zz`, a stray `%e9`. It is called twice there, on the
recipe id and on every query value.

Both throws landed in the boot chain's own catch, whose sentence is

    The recipes could not be loaded (URI malformed).
    Check the connection and reload.

Every clause of that is wrong here. The book **had** loaded — the fetch
succeeded and `S.base` was already filled — the connection is perfect, and
reloading reproduces it exactly, forever. Measured: `#app` falls from ~43,000
characters to **157**, and `S.error` is never cleared, so navigating to a good
address afterwards goes on showing it. The reader is left with one sentence
where their book was, told to do the one thing that cannot help.

**`#menu?q=50%` does it to the shipped book with no bad data anywhere** — no
seeded recipe, no hand-edited file, just an address somebody typed,
bookmarked, or had mangled by a messaging app on the way. Nothing the app
*writes* is malformed (`menuHash` percent-encodes every value), which is
exactly why nothing had ever tested what it does with one that is.

The fix is `R62`'s rule applied to the address: **coerce, never discard.** An
address that will not decode is used as written. That is not merely a crash
averted — a recipe stored at `100%-loaf` then **opens**, because the raw text
is exactly its id. Same family as `R70` and `R132`, and the third way this app
has found to list a recipe it cannot open.

Two silences, not one, and they are different: the boot throw is **swallowed**
by the promise chain into the wrong sentence above, while the tap throw is
genuinely uncaught — which is why a mutation reverting only the query call
site leaves `pageerror` empty and only the sentence wrong. Both are checked.

The floor under the fix is the check that a decodable address still decodes:
a tolerant reader that has quietly stopped decoding passes every other check
here and breaks every ordinary address, because the browser percent-encodes a
space on the way out and the id only matches if the way back in undoes it.
Four mutations fail by name, one per call site.

**The two server boundaries are left refusing, on purpose.** `validateRecipe`
and `db/migrate.js` both hold an id to `[a-z0-9-]`, so no such id can reach
the database or the published file — a hand-edited `recipes.json` is loud at
the nightly run and names the recipe. The app is tolerant where it must be,
because it is downstream of a file this project edits by hand on purpose and
serves to phones before any check ever runs. The consequence is recorded
rather than fixed: a recipe with an id like that works perfectly on the phone
and can never be shared, since the wire refuses it by name and `S13`'s queue
holds it. Loosening the id rule or renaming the recipe are both changes to an
address the family may have bookmarked, and that is Jason's call, not a bug
fix.

**And the same fault writing one.** `encodeURIComponent` throws too — on a
**lone surrogate**, the broken half of a character a mangled emoji or a paste
leaves behind. `menuHash` runs it over the search box's own text, and the
recipe page runs it over every tag chip, so the outcome measured **identical**
to the reading half: a recipe whose tag held one fell to the same 157
characters and the same sentence about the connection, because the render
throws inside the boot chain and lands in the very same catch.

The reader-facing half is quieter and worse. `syncMenuHash` builds the address
**before** it renders, so a half character typed into the search froze the
list where it stood — the address never moved, nothing filtered, and nothing
was said. Its neighbouring `try` had guarded `replaceState` alone, under a
comment promising that *"a browser that won't rewrite the address still
filters"*: the sentence was already right, the guard was one line too narrow.

There is no *use it as written* on this side — an unpaired surrogate is not a
character and cannot be in an address at all — so the broken half becomes the
standard replacement character and the address still goes somewhere. A link
that finds nothing beats a screen that is not drawn. Whole characters are
matched **first** and kept, so an emoji in a tag encodes exactly as it always
did. All fifteen sites go through the pair with **no exemption list**, for
`R124`'s reason: one tolerant reader and one tolerant writer cannot drift from
themselves, while a list of the call sites that "cannot be reached" is a list
somebody has to keep true. A sixteenth fails by name.

**Two of this round's own checks could not do their job, and both are recorded
rather than quietly fixed.** The search check reached for
`[aria-label*="Search" i]` with a `.catch(() => {})` behind it, so the click
never landed and the field never opened — a check that read FAIL before the
fix and FAIL after it, for a reason belonging to neither; `R143`'s lesson,
met again. And the floor under *whole characters are kept* seeded a tag
holding only an emoji, which **never throws** and so never reaches the catch
where that rule lives: the mutation replacing every surrogate walked straight
past it. The rule only has an effect on a string that both throws **and**
carries a whole character, so that is the string the check uses now, and the
mutation fails by name.

### The ground truth this file said was not here

`R149`, and `R145` asked one level down from it. That round read
`design/a11y-criteria.md` and found two sentences that had stopped being
true. It never asked whether the ground truth **this file describes** is the
ground truth the repo **holds**.

It is not. CLAUDE.md said twice — in the rule block at the top and in a
section of its own — that the handoff's `styleguide.html`, `screenshots/`
and `*.dc.html` references *"were never committed to this repo"*. All eight
of those files are tracked in git, and have been since the commit that
brought the handoff in.

**It came out of this loop.** `R5` was a cleanup round whose commit message
states its job plainly: *"CLAUDE.md's ground-truth list points only at files
that exist in this repo."* It went looking for phantom files, found these,
and got them backwards — and in the same edit it **deleted a live
instruction**:

> **Do read them** to extract exact values: sizes, spacing, the order of
> elements, the state logic, the quantity-scaling algorithm. They are the
> most precise record of intended behavior.

That is the guidance every round since has been missing, removed by a round
that set out to strike references to files that are not there and struck a
reference to files that are.

That is the worst place in the project for a wrong sentence. The first line
of this file is **"Read this file before writing any code"**, and a
reference somebody is told does not exist is a reference nobody opens. Every
round after `R5` that argued a size or a spacing from `tokens.css` alone did
so having been told the page that draws all of them was not here.

**And the one that could be opened could not render.** `styleguide.html`
links `tokens.css` relative to the folder it came from, where the two sat
side by side. In this repo `tokens.css` is at the root, so the page 404ed
on it. Measured: every token **unset**, body transparent with black
text, and the whole thing in **Times New Roman** — a serif, on the reference
page for a project whose second rule is *"One font: Atkinson Hyperlegible.
No serif anywhere"*, a rule that exists because the reader has low vision.
Its own subtitle reads *"Every color, size and component in the app. The
build must match this page."*

Two links fixed. The token path is a **correction** rather than a change:
the two files were siblings in the handoff, so this restores what the page
was written to do rather than editing what its author wrote — the deference
`tokens.css` is owed does not extend to a link broken by where the file was
put. The font is a **change**, and a deliberate one: it was fetched from
Google, as the app's was until `049` self-hosted it, and it comes from the
repo's own copy now for that same reason. A reference that renders in a
different font from the build is a reference that misleads, and this one
needs no network at all.

**The `.dc.html` files are templates, and saying so is the point.** They
carry `{{ … }}` placeholders and reach for a `support.js` runtime that is
not in the repo, so they cannot be opened in a browser — they are
source to *read* for exact sizes and state logic, which is what they were
read for during the build. "Not here" and "here, but not a page you open"
are different facts, and only one of them is true.

**`DESIGN.md` said it too, and there it did more damage.** That file is the
original handoff, kept unedited on purpose, with an editorial preamble at the
top listing what has changed since. The handoff's own text says *"Open
`styleguide.html` in a browser and match it. Compare against
`screenshots/`."* — and the preamble overruled it with *"neither was ever
committed"*. So this project wrote a correction to the handoff that was
itself wrong, and used it to strike out an instruction that was right. Five
hundred lines further down, the handoff's own file table still said *"Open in
a browser — rendered reference for every color and component"*, so the
document disagreed with itself. Only the preamble row is changed: the body
stays unedited, which is the whole point of keeping it.

**And the check had to survive its own record.** The first version read the
whole of each document, and the paragraph you are reading tripped it within
minutes of being written — it quotes the sentence it corrected, which is what
a record is for. `R138` met this exactly once before, with a comment quoting
the code its own scan looked for. So the rule is scoped to what a reader is
**told**: CLAUDE.md is two documents in one file, the contract above
`## Build state` and the log of rounds below it, and the harm was entirely in
the contract — the half whose first line says to read it before writing any
code. The log is past-tense by construction and has to be able to quote what
it fixed. A floor holds the split to a real boundary, since a renamed heading
would otherwise make it read everything or nothing.

The detector reads a **window** around the claim rather than a paragraph or a
line, and that is not fussiness: the original wrapped `` `*.dc.html` `` onto
one line and *"were never committed to this repo"* onto the next, while a
markdown table has no blank line between its rows — so a line split misses
CLAUDE.md's version and a paragraph split swallows DESIGN.md's whole table.
A window is indifferent to how the text happens to be laid out, which is the
only thing that matters here.

The check is `R114`'s shape on both halves: a file the repo holds is never
described as absent — scoped to the paragraphs that name these files, so an
unrelated sentence about something genuinely uncommitted is not this bug —
and every local thing the style guide links to exists, with no third party,
with the three templates exempted **by name and reason** and each held to
still carrying `{{`, so an exemption cannot outlive what earned it.

### The one fix worth asking the real deployment about

`R150`, and the smallest round in a while — which is the finding as much as
the change is.

Five scouts came back empty first, and they are worth recording so nobody
spends the afternoon on them again: `design/components.md` names 24 classes
and every one exists; its numbers — the FS scale, `kt.fsIndex`, `.switch`
64×36, `.iconbtn` 48, `.chip` 52, `.minitag` 13, `.rcard__thumb` 64,
`.hero__img` 200, the 3/2/4 focus ring, the stagger's cap at the tenth card,
and every animation duration — all match `style.css`; `improvised-values.md`
is accurate row for row; `planFrom` clamps a plan entry's servings to 1–40 so
the shopping list can never divide by nothing; and the summed-line `mixed`
flag is read where it is written.

Two of those five nearly became write-ups. The "Not covered by the styleguide
at all" list names `.minitag` while the document carries a full tag-chip spec,
which reads as self-contradiction until the sentence is read to the end — it
is about `styleguide.html`, and it points at this document as the answer. And
the Motion section's inventory omits two of the eight keyframes, which looks
like drift until you find the wisps and the scrim described a paragraph
earlier. Both were killed by reading rather than by assuming.

**A third was killed by measurement, after it had already been built.** The
reduced-motion sweep in `tests/polish.js` walks its own hand-typed list of
seven screens while `tests/screens.js` holds 33 — the exact `R131`/`R133`
fault, a seventh list. It was widened, it passed, and then the mutation that
should have caught it — an animation on the sort menu, a screen the seven
never visited — **passed too**. `tokens.css` carries a blanket
`* { animation: none !important }` under reduced motion, so no screen can
animate whatever the selector list says. `tests/quick.js` already records
this in as many words: *"it was a decoy for a whole arc."* Widening the sweep
would have bought 26 browser contexts of CI time and no detection power at
all, so it was reverted. A check that cannot fail is not a check, and that
holds for one that costs three minutes a run.

What was left is one thing, and it is the right one. `R148` fixed the worst
failure this app has had — an address that could not be decoded replaced the
whole book with *"The recipes could not be loaded (URI malformed). Check the
connection and reload"*, measured at 157 characters where 43,000 had been,
on a perfect connection, with a reload that reproduced it forever. It needed
no bad data: `#menu?q=50%` did it to the shipped book. That is exactly the
kind of address a person is handed — typed, bookmarked, or mangled by a
messaging app on the way — so it is now asked of the **deployed** book in
`tests/live.js`, which is the suite that asks the real host real questions
(`R112`). `about:blank` first, so it is a real boot rather than a
same-document fragment change: the boot path is where the false sentence came
from. Proven to bite by pointing `KT_LIVE` at a local copy with `decodeSafe`
reverted — both checks fail there, with the 157-character screen in the
message. Live 14 → 16, and off CI, so it costs the gate nothing.

### Half of this setup is worse than none of it, and nothing said so

`R151`. `R150` ended by asking the deployed book a question; this one asks
the deployment itself, and the answer was worth writing down.

Measured on 2026-08-23, from primary sources rather than inferred:
`/api/health` reports `accepts_changes: false` and
`publishes_on_change: false` — so `KT_WRITE_KEY` and `KT_GH_TOKEN` are unset
— and the db-sync run log contains, in as many words, `KT_DB:` followed by
nothing and the workflow's own warning that *"the database was never read."*
**Twenty-two scheduled runs, every one reporting success, every one a
no-op** — which is the designed behaviour of that warning rather than a bug
in it, and exactly why it was written.

Nothing is broken today, and only because all three are off together. The
danger is the half-configured state: with `KT_WRITE_KEY` set and the Actions
secret missing, every edit a phone shares lands in the database and stops
there — saved, reported saved, and invisible to the family. `db-sync.yml`'s
warning exists because that went unnoticed for a fortnight once.

So the ordering is now written where the person doing the setup will be
standing: **the Actions secret goes in before — or with — `KT_WRITE_KEY`.**
`KT_DB` has two unrelated homes, Render's Environment tab and a GitHub
Actions secret, and setting the first implies nothing about the second; the
README said both, in two different lists, and never that they are two.

**And a hazard that only appears once the secret is set.** Scheduled
workflows run on the **default branch**, which is this project's working
branch and not `main`. So `db-sync` would commit `recipes.json` there — the
branch that gets force-pushed to realign after every squash-merge, which
would silently destroy a sync commit that landed in between. Recorded and
recommended rather than done: changing a repository's default branch is
Jason's call, and it is the same change the Render **Branch** note already
asks for.

The check binds the prose to what actually emits it, which is `R126`'s rule
about the help page applied to a setup note: every health field the note
tells a reader to look at must be one the server really reports, and the
summary line it quotes must be the one the workflow really writes. Rename
`accepts_changes` in `server.js`, or reword the workflow's skip message, and
the instructions fail by name instead of quietly sending somebody hunting
for something that is not there.

**Three of this round's own checks needed correcting, each caught by a
mutation, and all three are recorded rather than quietly fixed.** The first
matched a quoted phrase literally, and the README wraps mid-phrase — the
layout-sensitivity `R149` had finished writing up one round earlier, walked
straight into. The second asked whether the file mentioned the Actions
secret *anywhere*, and the rotation note further down always had, so
deleting it from the new section left the check green: `R145`'s lesson,
met again. The third was not a check fault at all but a document one — the
new section's slice ran to the next `##` and swallowed the rotation
paragraph, which is what kept feeding it the phrase. Giving that paragraph
its own heading fixed the boundary and the document at once.

### The one import path that guessed a name and never said so

`R152`. Every guess `draftFromResult` makes is disclosed: a course the model
could not pick falls to Dinner **and is flagged**, a list past sixty lines is
truncated **and flagged**. A title it could not find became the literal
string *"Untitled recipe"* — silently, with nothing beside it.

Both device-side importers already had the answer and had had it for a long
time. The link path leaves a missing title **empty** and flags *"Title —
none was found on the page; add one."*; the photo path leaves it empty and
flags *"Title — none was obvious; add one."* So the video importer was the
one path in the app that guessed a **name** without saying so, which is
exactly the shape `R121` settled for the servings count: one situation has
one wording.

**And the placeholder was the wrong thing to reach for.** *"Untitled
recipe"* is the app's own **display** word for a nameless recipe (`R116`),
and `startDraft` deliberately keeps it out of stored data so Save cannot
bake it in. Writing it into a draft does at the server what `R116` forbids
at the phone: saved unchanged, the family's book gets a recipe actually
called *Untitled recipe*, indistinguishable on every screen from one that
has no name at all — which is precisely the state that word exists to
describe.

Empty is safe, and safe for a reason already in the code rather than a new
one: `saveNewRecipe` refuses to save a recipe with no title (*"Give the
recipe a title before saving."*, focusing the field), which is the same stop
the link and photo paths have always relied on.

The `Title — ` prefix is load-bearing rather than decorative, and a mutation
proves it: `R122` and `R123` answer a flag by the field it names, so a flag
worded *"The video never gave a title"* would name nothing, could never be
cleared, and would follow the recipe for good — `R122`'s permanent stale
warning, arriving through the one door that had no flag at all.

### The same fault one field over, with a false sentence standing over it

`R153`, and it should have been found in the same breath as `R152`. That
round fixed a title the video importer guessed without saying so; the field
directly beneath it did the same thing, and this one had the contract
claiming otherwise.

CLAUDE.md's own `R121` section says, as a statement of fact, that *"every
import path that cannot read a count defaults to 4 and flags it — 'Servings
— no count was found; 4 was assumed.'"* The link path does. The Add screen
does, because `R121` made it. **The video path did not.** Measured: a count
the model never gave came out as a confident **4 with nothing beside it**,
and so did one it gave as something that is not a number.

So the sentence in the file that says *read me before writing any code* was
false about a third of the paths it described — the same shape as `R149`,
arrived at from the other direction. It is true now because the code
changed, not because the sentence was softened.

**The clamp stays silent, and that is a decision rather than an omission.**
An integer outside 1–40 is brought into range without a word, exactly as the
link and photo paths bring a parsed count into range without a word.
`R119`'s rule that a clamp must be *said* is about a number a reader typed a
moment ago and can still see; it does not transfer to a guess nobody made.
Both halves are checked, so neither can drift into the other.

**The wording is machinery, not prose**, and a mutation is what proves it:
rewording the flag to *"Servings — the video never said; 4 was assumed."*
reads better and fails by name, because `R122` and `R123` answer a flag by
the field it names and the reader's Double-check chip (`082`) is keyed to
the same shape. And since three places now assume a count, the app and the
server are held to **one sentence** rather than each to a copy of it —
`R115`'s rule for `validateRecipe` and `db/migrate.js`, which guard the same
field for the same reason and must not disagree about it.

### Every field this function could come up empty on, now says so

`R154` finishes what `R152` started. Three rounds, three fields, one
function — and the third is the one with the most to lose.

`draftFromResult` flags what it truncates and what it substitutes for a bad
course, and said nothing at all when a **list** came back empty. Both
device-side importers already did: the link path flags *"Ingredients — none
were found; check the original page."*, the photo path *"Ingredients — none
were picked up."*

Measured: `ingredients: []` and `steps: []` produced a draft with both lists
empty and **zero flags** — a review screen of blank boxes with no reason
given. And `saveNewRecipe` refuses only an empty **title**, so that draft is
saveable: a recipe in the family's book with nothing in it, arrived at in
silence. The app has a *"No ingredients listed"* panel for that state
(task `071`) because four handoff recipes genuinely came that way; landing
there from an import is a different thing entirely.

**The wording is this path's own rather than a copy of either**, and that is
the point worth keeping. The two existing sentences already differ, because
the advice differs — *"check the original page"* means nothing for a
photograph. What carries across between paths is the `Field — ` **shape**
that `R122` and `R123` answer by, not the sentence; `R153`'s servings flag is
identical across three writers because there the situation and the remedy
are identical, and this one is not. One rule, applied honestly in both
directions.

**And a check of mine measured nothing until I watched which case failed.**
The shared fixture already carries a model flag reading *"Ingredients —
mumbled"*, which begins with the exact prefix the check looks for, so two of
its three cases passed before the fix on text that was always there — only
the steps case failed, and that discrepancy is what exposed it. `R145`'s
trap, met in a fixture rather than a document. The model's own flags are
cleared before the assertion now, so what is measured is what this function
added.

### Two words in the wrong order found nothing at all

`R155`. The search treated the whole query as **one term**: `fieldMatches`
asks whether the text contains it, then whether any single word is within one
typo of it. A word never contains a space, so a two-word query could only
ever match as a contiguous phrase, in the order it was typed.

Measured on the shipped book:

| typed | found | | typed | found |
|---|---|---|---|---|
| `potato bacon` | 1 | | `bacon potato` | **0** |
| `cordon bleu` | 1 | | `bleu cordon` | **0** |
| `chicken casserole` | 2 | | `casserole chicken` | **0** |
| `air fryer` | 11 | | `fryer air` | **0** |

A reader who typed the two words in whichever order they thought of them was
told **"no recipes match"**, which is false — the recipe is right there. It
is the same shape as every other sentence this app has had to stop telling,
and it costs most exactly where this book is read: on a phone, by someone
who would rather type two words than scroll forty-eight cards.

Nothing chose this. `README.md` specifies the folding and the one forgiven
typo and says nothing about order, so it was emergent — the behaviour of one
`indexOf` nobody had asked a two-word question.

Terms are AND-ed now, which is what the Filter sheet already does with tags
(*"picking Italian and Vegetarian means both"*), so every result still
contains every word that was typed and **nothing widens**. Each term keeps
the behaviour it always had — substring first, then one forgiven typo on five
letters or more — so a single-word search is unchanged, and that is a check
rather than a claim.

**The obvious wrong fix is OR, and the floor is what catches it.** With
terms OR-ed, `chicken zzzzqqq` returns all forty-eight and the pre-existing
*"garbage still finds nothing"* check fails too — a search that stops
narrowing is worse than one that misses, because the reader cannot tell it
has stopped working.

One change covers all three places that search — Main, the Menu, and the week
planner's picker all go through `matchesQuery` — which is what keeps
`README.md`'s *"same search as everywhere else"* true rather than quietly
making it false.

### The one comparison that did not fold, and the address nothing checked

`R156`, two small things `R155` left behind.

**The duplicate warning deleted accents instead of folding them.**
`findDuplicate` normalises a title by stripping everything that is not
`a-z0-9`, so *"Crème Brûlée"* became `crme brle` and shared **not one token**
with a hand-typed *"Creme Brulee"*: overlap 0.00, no warning, two copies in
the book.

It is narrow and says so. It needs **every** word accented to go wrong —
*"Jalapeño Poppers"* still scores 0.50 on its second word and is flagged —
no shipped recipe has an accented title, and the warning is advisory in any
case, since it never blocks and "Save anyway" is one tap. Worth the one word
because the app carries `fold` precisely so that accents do not matter
(`README.md`: *"accents don't matter — 'creme' finds crème"*), and this was
the only comparison in it that did not use them. The floor is that folding
must not make everything look like everything: an unrelated title still
saves without a warning.

**And the address `R155` changed the meaning of.** A filtered list being
shareable and bookmarkable is a documented feature, and `R155` changed what a
two-word `q` *means* — so the round-trip was verified by hand and checked by
nothing, which is the half that rots. It is checked now in both orders: the
list is restored identically and the words go back into the search box.

**One of those checks was wrong in a way worth keeping.** Restoring the Menu
afterwards, it clicked the search toggle blind — but arriving at a `?q=`
address opens the search box already, exactly as the README promises, so the
blind toggle **closed** it and the next wait timed out. The app was right and
the check was wrong; a test that assumes a control's state instead of reading
it is the same fault as a check that matches text that was already there.

### Escaping is the wrong tool for one attribute

`R157`, and a guarantee rather than a fix — the property held, and the round
is about pinning it where breaking it would be reasonable.

`R54` proves every attribute the app writes passes through `esc()`. For one
attribute that is not the right test: `esc()` neutralises quotes, and
`javascript:alert(1)` needs none. Put a recipe's own text into an `href` and
the escaping is beside the point.

The invariant, verified from both sides. Every `href` the app writes is a
`#` fragment — a literal, or `menuHash()`, which returns one. The only
`.href =` in the file is the `blob:` URL `downloadBlob` makes for itself.
There is no `window.open` and no `location.href =`. Behaviourally, a recipe
carrying `source: "javascript:window.__pwned=1"` renders as inert text in a
`<p>` and `#app` holds no off-page link at all.

**Why pin something that is already true.** The plausible way to break it is
a change somebody would make for good reasons. `R128` settled that a
recipe's source is deliberately not tappable — but on presentation grounds,
that a 120-character URL is a wall at this size and is not a tap target.
Someone could reopen that on its merits and never meet the other half:
`source` has four writers, one of them a hand-edited `recipes.json`, and
`esc()` would not save it. This is the opposite of the reduced-motion sweep
`R150` reverted, which a blanket `!important` had made unfalsifiable.

**And the check that could not catch the one thing it was written for.**
The first version scanned `href=["']([^"']*)` and skipped any empty capture.
An href built entirely by concatenation — `href="' + esc(from) + '"`, which
is exactly the shape of the mutation that makes the source tappable —
produces an empty literal run, so it was excused. The mutation walked
straight past the check written to catch it. It reads the text that
*follows* the quote now, the way `R54`'s neighbouring block already read
concatenation, and both the tappable source and a plain off-page link fail
by name with the offending text in the message.

That is the fifth check of mine this session that could not do its job, and
they have one shape: **it assumed rather than read.** A fixture already
carrying the string, a control already in the state it wanted to set, a
matcher that expected the layout it happened to see, and now a scan that
expected the quoting it happened to have.

### The dashboard would have looked perfect and worked nowhere

`R158`. The phone settled this question a long time ago and settled it
twice: the family passphrase is trimmed where it is typed
(`el.value.trim()`) and trimmed again every time it is read back. The
server read every environment value **raw** — `process.env.KT_WRITE_KEY ||
""` — and the two ends have to agree about what the passphrase *is*.

A value pasted into Render's Environment tab, or into a GitHub Actions
secret, arrives with a trailing newline or a trailing space more often than
anyone would like. It is the ordinary way a pasted secret is mangled, and
it is invisible in the dashboard. Read raw, here is what each one costs:

| | what a stray newline does |
|---|---|
| `KT_WRITE_KEY` | every phone's **correct** passphrase refused, forever, with the sentence written for a *wrong* key — while `/api/health` reports `accepts_changes: true` and does not list it as missing |
| `YT_API_KEY` | Google answers 400 *"API key not valid"* to every salvage, so a robot-blocked YouTube import never recovers; health again says the key is there |
| `GROQ_API_KEY`, `KT_GH_TOKEN`, `ANTHROPIC_API_KEY` | the request does not go out at all — Node refuses to write a header value containing a newline |

The first row is `R151`'s hazard arriving through a different door: **the
half-configured state, reported as configured.** That round wrote the
setup ordering down precisely because a `KT_WRITE_KEY` set without its
Actions secret means every shared edit lands in the database and stops
there, saved and invisible. This is the same silence one step earlier —
the edit never even reaches the database, and every phone is told its
passphrase is wrong.

**One reader, and no exemption list.** `backend/lib/env.js` is the only
place `process.env` is touched across `backend/` and `db/` — nineteen
sites in seven files, and `R124`'s lesson is that a rule kept in seven
places is a rule that drifts. The numbers come through it too
(`parseInt(envStr("PORT"), 10)`), so there is no second rule about which
reads need it. A twentieth read fails by name, and two floors sit under
that scan because one that walked no files would pass vacuously.

`ANTHROPIC_API_KEY` needed one extra line and is worth naming: the SDK
reads that variable out of the environment **itself**, so trimming it in
`server.js` and then letting the client find its own would have undone the
fix silently. The trimmed value is passed in.

**And the salvage key came out of the URL.** `salvageYouTube` put it in the
query string, and `why` — which lands in a job row's public debug field,
readable at `/api/import/jobs/:id` with no login and an id anyone can count
to — was kept clean by a `scrub` that split on the **raw** key while the
URL carried `encodeURIComponent(apiKey)`. Measured: a key holding
`+`, `/` or `=` leaked in escaped form. Unreachable with a real Google key,
which is 39 URL-safe characters — but the file's own comment states the
posture it was failing at: *"the key must never ride along, however an
error message chooses to phrase itself."*

Fixed structurally rather than by widening the scrub alone. Google reads
`X-goog-api-key` as readily as `?key=` — **measured against the live
endpoint** rather than assumed: with that header a bad key comes back *"API
key not valid"*, while with no key at all the answer is a 403 about
unregistered callers. Out of the URL, the secret is not in the string an
error message is most likely to quote back, which is a better guarantee
than remembering to take it out again. The scrub stays and now covers both
forms, because a message quoting a URL quotes the escaped one and nobody
should have to work out per message which form it could be carrying.

**The two mechanisms are pinned separately, on purpose.** With both in
place, reverting either one alone still produces no leak — which is what
defence in depth is for, and also how a single check over the pair would
have been a check that cannot fail. The header move and the widened scrub
each have their own, and each mutation fails by name.

### A button that said Start over left the photo behind

`R159`. A photo attached on the Add screen is staged under `__new__`,
because a recipe's id does not exist until its title does; `saveAdd` moves
it across. **The draft lives in `sessionStorage` and the photo lives in
IndexedDB**, and nothing ever reconciled those two lifetimes.

Measured, in two taps, on the shipped app:

| | |
|---|---|
| attach a photo of Joan's shortbread card, press **Start over**, choose *Type it in* | the draft is blank — and the photo is still in the field |
| type a soup and save | `#totally-different-soup`, hero image present, stored under `totally-different-soup` |

The card became the soup's picture. Nothing said so, and *Download photos*
would then hand the family `totally-different-soup.jpg` with a shortbread
card in it, to commit. The button is labelled **Start over** — that is the
word the review screen uses for `add-back` — and it started over with
everything except the one thing nobody would think to check.

**And a second way in, with no taps at all.** `sessionStorage` dies with
the tab; IndexedDB does not. So a phone that closed the tab mid-import
comes back with no draft and the picture still there, and the next recipe
typed in wears it. CLAUDE.md already leans on that fact in `R134` — *iOS
Safari keeps tabs for months, and a home-screen install beside an open tab
is two instances of this app* — which is why this is an ordinary state
rather than an exotic one.

`R136`'s rule, one store over: **an entry stops being true when the copy it
describes is gone.** The staged photo's lifetime is the draft's lifetime,
so it is discarded where the draft is — `add-back`, and a restore that
found nothing to restore.

**What makes this two conditions rather than one line is the floor.** Task
`084` exists so a half-finished import survives an accidental refresh, and
`onRoute`'s own comment says a detour to check a recipe lands back in it.
A version that simply threw the staged photo away passes both cases above
and loses a picture the reader chose a moment ago — a worse bug than the
one being fixed. That mutation is pinned by name, along with the one that
discards on save.

**One line of the fix is not about this bug at all**, and the suite is what
found it. `removeImage` on the localStorage path serialises and writes the
**whole** map, so an unguarded discard spent a write on every arrival at
the Add screen — on exactly the phones with the smallest quota, which are
the only reason the *no room* message exists. `R130`'s quota check failed
by name within minutes: its stub counts writes, and the extra one moved
the refusal from save-time to attach-time. Guarded with `pagesOf`, the
app's own way of asking whether a photo is staged.

### The one reader read the word, and then looked it up as written

`R160`, and the completion of `R124`. That round made one tolerant reader
for a flag's field, because the shape is written by a **language model**
and by a hand-edited `recipes.json`. It taught the reader four separators.
It did not teach it a **normal form** — `flagField` handed back the word
exactly as written, and both callers then looked it up in a table keyed
`Title` / `Servings` / `Ingredients` / `Steps` / `Course`.

Measured, on all four fields:

| a flag reading… | chip beside the field | answered by editing it |
|---|---|---|
| `Servings — no count was found; 4 was assumed.` | yes | **yes** |
| `servings — no count was found; 4 was assumed.` | yes | **no** |
| `SERVINGS — no count was found; 4 was assumed.` | yes | **no** |
| `title — none was found on the page; add one.` | yes | **no** |
| `ingredients — none were picked up.` | yes | **no** |

So a flag whose field name is not capitalised can never be taken down —
`R122`'s permanent stale warning, in the reader built to stop it — and it
wears a **Double-check chip** the whole time, because `fieldOfFlag`
lowercases and `flagField` did not. The badge built to announce a problem
outliving the problem is the same fault with a nicer face on it.

**The suite hid it, and that is the part worth keeping.** `tests/kt.js`'s
R124 block exists to prove the reader is tolerant, and all six of its
fixtures capitalise the field name — colon, hyphen, en dash, prose, every
axis but the one. A reader is only as tolerant as the questions it is
asked.

**And the two readers are now one parse.** `fieldOfFlag` carried its own
expression, accepting an em dash only, with `082`'s keyword fallback
behind it. It reads `flagField` first now. That is load-bearing rather
than tidy, and a mutation proves it: the fallback is checked in a fixed
order — servings, ingredients, steps, title — so on its own, a flag
reading *"title — the ingredient list was cut"* chips beside
**Ingredients**. The field a flag **names** has to beat the field it
merely **mentions**.

The keyword fallback itself stays exactly as `082` wrote it, and with it
the one case where a chip cannot be cleared: a free-text flag that merely
mentions a field earns a chip but is never an answerable claim, because
`R124` settled that prose is not one. Both halves are deliberate, and both
are now written down rather than discovered again.

**Three of this round's own checks were wrong before they were right**,
all in the same check and all recorded rather than quietly fixed. It asked
whether the chips came down with the flags: first with a same-hash `goto`,
which is not a navigation, so the page never re-rendered and sat in Edit
mode where no chip is drawn at all — **0 chips, a pass for the wrong
reason**, and the very mistake `R159` had documented one round earlier.
Then with a reload, which re-runs the context's `addInitScript` and put
the original four-flag fixture back — **4 chips, a failure for the wrong
reason**, the harness cross-contamination that block already warns about.
Then with a `.catch(() => {})` behind a wait for a selector that does not
exist, which is a wait that cannot fail. It closes Edit mode and waits for
the form to detach, with nothing swallowing it.

### The one field the app rewrites, and never mentioned

`R161`, and `R160`'s lesson at the boundary next door, found the same day.
`R65`'s comment has said it plainly since it was written:

> course is exactly the field the app itself rewrites, since
> `normalizeRecipe` defaults anything it doesn't recognise to Dinner.

That round gave the reader a control to correct it with. **Nothing ever
told them there was anything to correct.** Measured, on a recipe
hand-edited in `recipes.json` — which is hand-editable *by design*, and
which `db-sync` rewrites nightly with nobody watching:

| stored course | the recipe page reads | says why |
|---|---|---|
| `Baking` | BAKING | — |
| `baking` | **DINNER** | no |
| ` Baking ` | **DINNER** | no |
| `BAKING` | **DINNER** | no |
| `side` | **DINNER** | no |
| `Supper` | **DINNER** | no |

Two faults in one line. **Casing is not a different course** — and `side`
is the sharper one, because `CAT_ALIASES` exists precisely so an older name
still resolves, and it was matched by exact key. `canonCat` folds case and
whitespace across both tables now, so all four spellings of Baking are
Baking and `side` is Sides.

**And a course that really is not one of the ten is a substitution, so it
says so.** Every sibling substitution in this app is loud: `settleIds`
writes a flag onto a recipe whose id it moved, and every import path flags
a course it had to guess (`R73`). This was the quiet exception, on the one
field a reader cannot see was changed. A missing course gets the imports'
own sentence — one situation, one wording (`R121`) — while a course that
was *given* and is not one of ours gets its own, naming what was there,
because *"none was given"* would be false and a reader cannot fix a value
they are not shown (`R154`'s rule: the `Field — ` shape carries between
paths, the words do not). Both are answerable by editing the course, which
is `R160`'s fix one hour old and already load-bearing.

Flagged rather than refused, deliberately. The app is downstream of a file
edited by hand and served to phones before any check runs, so it is
tolerant here; `validateRecipe` and `db/migrate.js` both refuse an unknown
course **by name**, and still do. `R148` settled that asymmetry for ids and
it holds for courses.

**Two floors, and the first version of the second one could not fail.** A
course that is already right must be left entirely alone, flag and all —
the over-eager version puts a warning on all 48 recipes and is pinned by
name. The book-scale floor first read `recipes.json` and checked its
categories were valid: true, a *precondition* rather than a guarantee, and
it passes happily while the app rewrites every one of them. It opens a real
recipe filed somewhere other than Dinner and reads what the reader would.

**And the third round running to trip over the same two harness traps**, so
the note went where it will actually be read — `tests/ctx.js`, the one file
every suite opens. A `goto` to the hash the page is already on is not a
navigation and renders nothing; `addInitScript` accumulates, so a second
fixture never replaces the first. Together they made one course's answer
stand for four cases: BAKING four times running, three of them passing for
entirely the wrong reason.

### A byline that belonged to nobody

`R162`, on the line **directly above** the one `R161` fixed, and it is the
same fault. `WHO_ALIASES` exists so a file predating the rename keeps
resolving (`Mom`→`Joan`, `Me`→`Jason`), and it was matched by exact key.
Every contributor comparison in this app is `===`: the *"Whose recipe?"*
tiles and their counts, the Filter sheet's chips and their cross-counts,
and `#menu?who=Name`.

Measured — and the last column is what makes it worth a round:

| stored | Joan's tile | in `#menu?who=Joan` | the recipe page reads |
|---|---|---|---|
| `Joan` | 1 | 1 | JOAN |
| `joan` | **0** | **0** | **JOAN** |
| `JOAN` | **0** | **0** | **JOAN** |
| ` Joan ` | **0** | **0** | **JOAN** |
| `Mom` | 1 | 1 | JOAN |
| `mom` | **0** | **0** | MOM |

**The recipe page uppercases the byline in CSS**, so three of those four
broken spellings render as *JOAN*, identical to a correctly filed recipe.
The reader cannot see the difference. What they get is a recipe that looks
like Joan's, is off her tile, out of her filter, and reachable only through
the Menu — in the one book where whose recipe it is is the entire point,
and whose contributor split was corrected once already for exactly that
reason.

`canonWho` folds case and whitespace across `WHO` and `WHO_ALIASES`, the
same shape `canonCat` took an hour earlier.

**It resolves; it does not police.** A name that is not one of the six is
left exactly as written, because the contributor is a label — CLAUDE.md's
own *"a byline, nothing more"* — and *Auntie Pat* is a perfectly good one.
The mutation that forces every contributor into `WHO` passes every other
check here and quietly renames somebody's aunt; it fails by name, and
trips `R117`'s *"a recipe with nobody named simply does not claim one"*
on the way past.

No flag, and that is the difference from `R161`. A course that is not one
of the ten is a **substitution** — the recipe is filed somewhere its author
did not choose — so it says so. `joan` → `Joan` changes nothing about whose
recipe it is; it is the same person, spelled the way the book spells her,
exactly as `baking` → `Baking` is the same course.

### Three promises the help page makes, and nothing checked

`R163`, and a guarantee rather than a fix: all three hold today. `R126`
bound the help page's **control names** to the buttons the app actually
draws — rename a control in the prose to a button that does not exist and
the check fails. It did not bind its **behavioural** promises to anything,
and three of them had no check at all:

| the help page says | covered before |
|---|---|
| *"picking more than one narrows to the recipes that have all of them"* | no |
| *"It doesn't read the method — searching for a word you remember from the steps won't find it"* | no |
| *"the keyboard's **go key** opens it — from either box"* | no |

The last one is the sharpest. Two search boxes are named in the reader's own
words, the whole point is *"with no need to put the keyboard away and aim at
the card"*, and the entire mechanism is one `document.querySelector("#app
a.rcard[href]")`. Rename that class, or let anything else render a card
above the results, and the promise goes silent — no error, no symptom, just
a key that stops doing anything.

**Each mutation is a change somebody would plausibly make for good reasons**,
which is `R157`'s bar. AND-ing tags to OR reads as more helpful and is not
what the page says; a search that also read the method would look like an
improvement until you notice the page promises it does not; and the
`querySelector` is a line anybody refactoring the card markup would touch.

**The method check needed a floor, or it could not tell a limit from a
corpse.** *"Not found"* passes just as well when the search is broken
entirely, so the same invented word is planted in another recipe's
**ingredients**: exactly one match, and the card says *matches ingredient*.
That is what makes the miss a documented limit rather than a dead search.

**And one thing this could not answer, recorded rather than glossed.** The
scout that found these also asked what `Escape` does to an
`<input type="search">`, since a browser that clears the field without
telling the app would leave the box empty and the list filtered. In
Chromium the field clears **and** fires `input`, so the app re-renders and
the two agree. WebKit is the engine that matters here — this is a book
read on an iPhone — and it is **not installed in this environment**, so
that question stays open rather than answered. Every suite in this project
runs Chromium with an iPhone viewport, which is a device profile and not an
engine.

### R29 built the net and nothing kept the app off the wire

`R164`. That round named this failure mode in its own words:

> if `app.js` itself never runs — truncated by a bad deploy, **or using
> syntax an older iPhone cannot parse** — there is no catch and no render,
> and the page reads *"Loading recipes…"* for ever. On the phone this book
> was built for, that looks like a broken phone rather than a broken
> deploy, and there is nothing to do about it.

It built the last-resort message, admitted it by its own CSP hash, and
made that hash self-guarding. **Nothing ever checked the syntax.**

`app.js` is about 7,000 lines of strictly ES5 — measured with a real
parser, not a regex: **zero** arrow functions, `const`/`let`, template
literals, spread, optional chaining, nullish coalescing, classes, `async`
or `for…of`. At that length that is a discipline, not an accident. It is
also one keystroke from being broken by a round that would pass every
browser anybody here tests with, every suite, and CI — and blank the app
on the one phone that matters.

**Syntax, not library**, and the distinction is the whole point. A method
the engine lacks — `padStart`, which this file does use — throws on one
line and the rest of the app still runs. A syntax error kills the file
before a single statement executes, which is exactly the blank screen
`R29` is about. So the check is a parse at `ecmaVersion: 5`, and nothing
about which methods are called.

**The two inline scripts in `index.html` are checked too**, because they
are the pre-paint theme and `R29`'s own last-resort message: the code that
has to run when everything else has failed. A net written in syntax the
engine cannot parse is not a net.

**`sw.js` is the one exemption, by name and with its reason** — a service
worker only exists in an engine that already has ES6 — and the exemption
is held to still being one: if `sw.js` ever became ES5 the exemption would
be carrying nothing and should go. That is `R149`'s rule about an
exemption outliving what earned it, and it fails by name.

**The floor first, because everything else is vacuous without it**: the
parser must actually refuse post-ES5 syntax. A wrong `ecmaVersion` would
make every check in the block pass on anything at all, and the mutation
that sets it to 2020 fails by name.

**And this round's own check was wrong first, caught by CodeQL within
minutes of the push.** The inline scripts were pulled out of `index.html`
by a hand-rolled `<script…>…</script>` regex, which is `js/bad-tag-filter`
— flagged **high severity**, and correctly, naming the exact evasion:
*"This regular expression does not match upper case `<SCRIPT>` tags."*
The security label is the least of it: a tag matcher that misses a script makes *this check* pass on
a file it never read, which is the exact fault the round exists to stop.
They are read out of the **DOM** now — the browser is a real HTML parser
and `quick.js` already has one open. The mutation still fails by name, and
a floor requires both scripts to have actually been found.

One cost, stated plainly: this adds `acorn` to `tests/` — one package,
no transitive dependencies. The app itself still has none, which is the
promise `tests/package.json`'s own description makes. It does change
`tests/package-lock.json`, which is the CI Playwright cache key, so the
next run re-downloads Chromium once.

### The one tag box that did not read commas

`R165`. Every tag input in this app splits on commas, and the app has
taught its readers so: the hint under each one says *"Separate with
commas."* The rename box did its own `trim().replace(/\s+/g, " ")`, which
is `parseTags` **minus the split**.

Measured, end to end:

| | |
|---|---|
| rename `italian` → `italian, quick` | stored as **one** tag, `italian, quick` |
| the Manage tags screen | lists it as a single chip among the real ones |
| Edit mode's tags field | shows `italian, quick` — indistinguishable from two tags |
| change the **title** and nothing else, save | tags become `["italian", "quick"]` |

So a rename mints a compound pseudo-tag, and the next ordinary edit of an
**unrelated field** silently turns it into two. That is `R119`'s rule —
*editing must not quietly rewrite a field nobody touched* — on the tags,
and a near-duplicate generator sitting inside the machinery built to stop
near-duplicates (`067`–`069`). The recipe's filter membership changes with
it: before the edit it matches neither `italian` nor `quick`, after it
matches both.

**Refused rather than split**, and that is the judgement call. Making
"Rename" mean *replace with several* needs its own merge story and its own
confirm — a feature, and Jason's call. One name is what the label (*"New
name for …"*) promises, and **Add tags** is the control for the other
thing, so the sentence names it.

**The refusal keeps what was typed on screen**, which is `R120`'s rule:
the box stays open with `italian, quick` still in it, so the reader can
fix the name rather than start again. The mutation that clears it fails by
name.

Clearing the box, or typing the same name back, stays **silent** — `R147`
settled that: nothing was typed, so there is nothing to say.

### Planning a meal spoke; taking one off did not

`R166`, and `R141`'s finding on the other side of the same feature.
`plan-remove` was named by **no suite at all** — 79 checks about the
planner and not one of them removed a meal.

Planning a meal calls `setNotice(titleOf(pr) + " planned for " +
prettyDate(date))`, which both draws the sentence and announces it. Taking
one off called nothing — so *that* sentence stayed exactly where it was.
Measured, after the meal was gone:

| | |
|---|---|
| spoken | *"Air Fryer Chops planned for Monday 17."* |
| visible | *"Air Fryer Chops planned for Monday 17."* |

**Not silence — a sentence that had stopped being true**, in the app's own
words, about the very thing the reader had just undone. It now reads
*"Air Fryer Chops taken off Monday 17."*, which is the planning sentence's
own shape (`R121`: one situation, one wording).

**The name comes from the same two rules the card beside it uses.** A
recipe still in the book is named through `titleOf` (`R138`); a slot the
plan outlived keeps the name it was planned under (`127`). The mutation
that drops the second says *"Untitled recipe taken off Sunday 23"* —
`R116`'s placeholder in a sentence where the real name was sitting right
there — and fails by name.

**And one thing measured and deliberately not fixed here**, because it is a
different mechanism: after the removal the caret lands on `<body>`.
`restoreSheetFocus` looks up the control that opened the sheet and, finding
it gone — the meal card removed itself — quietly does nothing. That is
`R80`'s contract with a hole in it for *any* sheet whose opener
disappears, not just this one, and closing it properly means giving every
screen's `#main-content` a `tabindex="-1"`, which also repairs the skip
link that already points there. Its own round, next.

### The first control on every screen said Skip to content, and went to "That recipe isn't here"

`R167`, and the half `R166` deferred turned out to be the smaller one.

*"Skip to content"* is the first thing in the tab order on **every screen**,
and it is the one affordance built specifically for somebody using a
keyboard or a screen reader. It is written in `index.html` as
`<a href="#main-content">` — which in a hash-routed app is not an anchor,
it is an **address**. `parseHash` read `main-content` as a recipe id, found
no such recipe, and rendered:

> That recipe isn't here.

Measured from the Menu, the week planner and the help page alike, with the
caret left on `<body>` afterwards. The control that promises to take a
reader to the content took them off the screen instead, and has since
`index.html` was written.

`R131`'s accessible-name sweep cannot see this. That sweep asks whether
every control **has** a name; `R140` asked whether the name says what the
control **does**; this is the third question — whether the control does
what its name says.

Three parts, one mechanism: **there is always somewhere for the caret to
land, and the control that says it will take you there does.**

- **The skip link is handled by the app's own delegated listener**
  (`data-act="skip"`), so the hash never changes and the caret goes where
  the words promise. The `href` stays, because that is what a skip link is
  and what assistive tech expects. It also degrades the right way: if
  `app.js` never runs (`R29`), the link does nothing rather than navigating
  wrongly.
- **`#main-content` gets `tabindex="-1"`** on all six screens — it had none,
  so it could not receive the caret at all. Not `0`: that would add a
  spurious tab stop to every screen, and the mutation fails by name.
- **`restoreSheetFocus` falls back to `#main-content`** when the opener is
  gone, which is `R80`'s contract with a hole in it for *any* sheet whose
  opener removes itself — `R166` measured it on the week planner, where
  deleting a meal deletes the card that opened the sheet. `preventScroll`
  on that path only: scroll restoration is app-owned, so the caret moves
  without yanking the reader back to the top of the week. The skip link
  wants the scroll and does not pass it.

**The floor is that the fallback must not replace the normal path.** A
sheet whose opener survives still hands the caret back to it; the mutation
that always falls back fails by name and takes two pre-existing `R80`
checks with it.

### Verified

The suite after the video arc: **1839 functional checks** across eleven
suites (kt 368, feat 98, add 127, relay 21, quick 81, polish 378, sec 62,
plan 85, video 276, backend 328, zoom 15), plus `R127`'s nine-check SQL
gate — CI runs the shipped write statement against a throwaway Postgres
service container, and `KT_SQL_REQUIRED` turns a skip there into a failure,
because a gate that quietly does nothing is worse than no gate — plus the
perf budget (FCP ~900 ms
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
behind a sheet that never opened). **`R110` finished the sweep** with five: a
plan that outlived its recipe, a recipe with nothing written down, a
photo that failed *while the lightbox was open*, the **waiting card** a
reader sits in front of for minutes while a video is written up, and
the sentence shown when a link is one the server cannot take. The last
three needed the audit to reach past `R101`'s seed, which answers
"which recipe" and not "what did the wire do" or "what was half-done
when the page reloaded": a route may now stub the **network**, and seed
**sessionStorage** as well as local. All clean; and the floor caught
the first attempt at the lightbox route auditing the screen behind a
lightbox that never opened. **`R101` made it able to reach the
rest**: every route had been given the same seeded data, so a state that
only exists for a particular recipe was structurally unreachable and went
unmeasured — which is why `R97`'s "Not given" servings card was argued
from its tokens rather than measured. A route may now carry its own
`localStorage` seed, and that card is the first to use it. —
**and since `R82` on paper too**, which the audit
had never looked at: printing under both themes found fourteen failures
the dark palette was leaking onto white, including the shopping list's
own title at 1.10:1 and all seven of `R60`'s "not adjusted" notes, the
ones that tell a cook which amounts did *not* rescale. Nothing interactive measures under 44px — checked on
every screen, not just one (`R16`). All of it
runs on every pull request via `tests/run.sh`, hermetically — the suites
stub the kitchen server and abort the Render origin, so CI never wakes the
real one. Off-CI, `tests/live.js` drives the **deployed** book — the one the
family opens — in a real browser and checks it renders, holds every
recipe in the published file, opens one with its method, steps its
servings and ticks a line off, with no missing file and a clean
console (`R112`; 16 checks, all green against Pages). The live-OCR
gate (`tests/ocr-live.js`) proves that
pipeline device-local and, in its `KT_OCR_NOISE=1` variant, that garbage
flags rather than invents; the video pipeline's own live checklist (real
videos, cold start, restart mid-job) runs once the server has its keys.
