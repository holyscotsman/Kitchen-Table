# Kitchen Table

Everything Mom cooks, in one place.

**Version 0.9** — the app is feature-complete and live; `GAMEPLAN.md` is the
road to 1.0, and its Waiting-on-you table is what stands between here and
there.

A static family recipe site for ~48 transcribed recipes. The primary user is on
an iPhone with low vision, so legibility beats density everywhere. Plain HTML,
CSS, and vanilla JavaScript on GitHub Pages — no build step, no framework, no
bundler, no server.

**Live:** https://holyscotsman.github.io/Kitchen-Table/

**Status:** `v0.9` — the software is feature-complete: the week planner, the
shared database ([`db/`](db/README.md)), four import paths including video
(the kitchen server, [`backend/`](backend/README.md)), offline support, and
continuous scanning are all live. What remains for 1.0 is the human work —
Joan's sessions, a physical iPhone, the content truth pass (`GAMEPLAN.md`
§11).

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app — one page, hash-routed |
| `app.js` | Router, three screens, scaling, edit mode |
| `tokens.css` | **The palette.** Copied verbatim from the design handoff |
| `style.css` | Layout and components; every colour is a `var(--*)` |
| `recipes.json` | The 48 recipes. Source of truth for Viewer mode |
| `fonts/` | Atkinson Hyperlegible, self-hosted (OFL licence included) — no third-party request on any page load |
| `db/` | The Postgres schema, migration and export — the shared database's tooling ([docs](db/README.md)) |
| `tests/` | Every check the app must pass — see *Checks* below |
| `CLAUDE.md` | Build rules and the colour contract — **read first** |
| `DESIGN.md` | Full screen-by-screen spec from the design handoff |
| `GAMEPLAN.md` | The 1.0 plan: 130 tasks in dependency order, and the loop that works through them |
| `CONTENT.md` | What is known-wrong in the recipe data, awaiting answers from the family |
| [`design/components.md`](design/components.md) | The component reference — build new screens from this vocabulary |
| [`design/a11y-criteria.md`](design/a11y-criteria.md) | The accessibility bar every merged feature must clear |

## Screens

Navigation is hash-based, so back and forward work normally.

- `#` — **Main.** Search, tonight's dinner idea, browse by contributor or course.
  Search reads titles, ingredients and tags; accents don't matter ("creme"
  finds crème) and one mistyped letter is forgiven. When a result matched
  something not visible on its card, the card says so — "matches ingredient".
- `#menu` — **Menu.** All 48 recipes with Filter and Sort. `#menu?who=Mom`,
  `#menu?cat=Desserts` and `#menu?tag=Italian` open it pre-filtered.
- `#<recipe-id>` — **Recipe.** e.g. `#chicken-cordon-bleu`.

## Reading a recipe

Instruction text starts at **24px** and steps through 20 / 24 / 29 / 34 / 40 via
A− / A+. The choice persists. The typeface is Atkinson Hyperlegible, designed by
the Braille Institute for low-vision readers — that is a functional requirement,
not a stylistic one.

Dark is the default theme; the sun/moon button switches to light and remembers it.

**Easy Read** (the "Aa" button on the Menu) adds to the stepper rather than
replacing it: a larger floor, one wide column at every width, thicker borders,
and no faded grey text anywhere. A−/A+ keeps working inside it.

**Servings** rescales the recipe. Pick how many people you're feeding and every
ingredient *and* instruction quantity adjusts with it — "Bake 2 cups of…" scales
in the steps too. Lines with no leading number are left alone, which is correct.

**Tap any ingredient or step to check it off** while you cook. That state is
deliberately per-visit and resets when you leave the recipe.

**Keep screen on while cooking** holds a screen wake lock so the phone doesn't
sleep mid-recipe. The row hides itself on browsers without the API.

**Share** uses the iOS share sheet (Notes is one of the targets), falling back to
clipboard or a `.txt` download. **Download** offers a printable PDF or plain
text — both contain only the recipe, at the currently scaled quantities, and say
so when the amounts have been adjusted.

## Photos and tags

Attach a photo in Edit mode, or while adding a recipe. It's shrunk on the
device and kept in the browser's own database — big enough for a photo on
every recipe — and it shows immediately as the recipe's hero image and as a
thumbnail on the Menu. A recipe without one renders no image at all, never a
placeholder, and a photo that goes missing degrades to the category icon
rather than a broken-image glyph.

**Tap the hero to see the whole photograph.** The hero is a tidy 3:2 crop;
the tap opens the full picture — which matters when the photo is a
handwritten card and the writing is what got cropped. A recipe read from
several cards keeps every card: the first is its face, the rest appear in
full under "Recipe card photos".

To make a photo permanent: **Download photos** saves each as `<id>.jpg`
(`<id>-2.jpg` for later cards). Put them in `images/` and commit them
alongside `recipes.json`, which by then references `images/<id>.jpg` rather
than carrying the picture inline.

**Tags** are free-form and comma-separated — include where a dish is from. They
filter (picking two means both), they're searched, and tapping one on a recipe
opens the Menu filtered to it. The collection ships tagged where the answer is
established — Scottish for the tablet and tattie scones, Cajun for the
étouffée, *air fryer* for everything cooked in the Ninja — and stays untagged
where only Joan would know.

**Category or tag?** The rule: **the category answers "when would you serve
this?" — one per recipe, from the fixed list of ten. Everything else true about
a dish is a tag.** Where it's from (Italian), what's in it (chicken), how it's
made (slow cooker, air fryer), who it suits (vegetarian), occasions
(Christmas) — all tags, as many as are useful. If you're torn between two
categories, pick when it's most often served and add the other as a tag;
"Baking" is for things whose point is the baking (bread, scones), not for
anything that touches an oven.

Three things keep tags from drifting into near-duplicates: **as you type, the
app suggests tags that already exist** (tap the suggestion — it uses the
canonical spelling); **Tag on the All-recipes screen tags many recipes in one
pass**, with the same suggestions; and **Rename or merge** (beside the tag
filters) renames a tag everywhere at once — renaming onto an existing name
merges the two, so "italian" can be folded into "Italian" after the fact.

## Editing

The switch in the mode strip on any recipe turns on Edit mode. Viewer mode shows
no edit affordances at all.

**Edits save to this browser only. Nothing is written back to the repository.**
Change a recipe, press Save, and it persists on that device. To make an edit
real for everyone, press **Download updated recipes.json** and commit that file:

```sh
# replace recipes.json with the downloaded file, then
git add recipes.json && git commit -m "Update recipes" && git push
```

GitHub Pages redeploys within a minute or two.

Once a device has local changes, `kt.recipes` holds the whole recipe set for
that device — including which recipes have been removed. Two consequences worth
knowing:

- Recipes added to the published `recipes.json` by someone else won't show up on
  that device until its own changes are committed or discarded.
- **"Undo all my changes on this phone"** puts everything back to the published
  file. It's in the Edit-mode footer once local changes exist, and in the Menu's
  empty state — because removing every recipe would otherwise leave you with no
  recipe to open Edit mode from, and no way back.

`localStorage` keys are namespaced under `kt.` — `kt.theme`, `kt.fsIndex`,
`kt.easyRead`, `kt.recipes`. Photos live in the browser's IndexedDB
(database `kt`), and a mid-import draft sits in sessionStorage until it's
saved. Nothing else is touched.

## Local preview

Serve over HTTP, not `file://` — the page fetches `recipes.json`:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Checks

Everything the app promises is asserted by the suites in `tests/` — the
functional checks, the WCAG AA contrast audit across both themes and Easy
Read, a first-paint budget on a throttled connection, and the tap-target
floor. One command runs the lot:

```sh
cd tests && npm install && npx playwright install chromium
bash run.sh
```

CI runs the same command on every pull request, so a regression goes red
before it merges. `KT_ONLY="kt feat" bash run.sh` narrows to named suites
while working; `KT_BASE=https://…` points them at a deployed copy instead of
a local server. `tests/measure-quota.js` is a measuring tool rather than a
suite — it reports how many photos this browser's storage can actually hold.

## Planning the week

**Plan the week** (on the front page) opens the planner: seven days, dinner
front and centre, breakfast and lunch one quiet tap away. Tap an empty slot
to pick a recipe — same search as everywhere else — and tap a planned meal to
scale it to that night's headcount, open the recipe, or take it off the plan.
The same dish can appear twice in a week; a recipe that later leaves the book
stays on the plan under the name it was planned by. **Print this week** makes
the fridge-door copy, and the **shopping list (preview)** sums what it can
honestly sum and lists the rest as written. Plans live on the phone that made
them until the database wiring lands.

## Adding a recipe

**The family-facing walkthrough is [`ADDING.md`](ADDING.md)** — written for
someone who has never used GitHub, including how an addition becomes visible
to everyone. The short version for this README:

The **Add recipe** pill on the Menu opens four ways in:

- **Type it in** — a blank form.
- **From a link** — paste a recipe page address. Several free public relays
  are tried in turn — each is named in the UI before anything is sent,
  because the address goes to them — and the page is read for
  `schema.org/Recipe` data. The import records which route answered, so a
  persistently failing relay is diagnosable. If none get through there's a
  paste box right below the field that needs no network at all — that one
  can never break.
- **From a photo** — reads the text out of a picture on the device itself.
  The picture is never uploaded (the library is version-pinned with an
  integrity hash, and a tampered copy refuses to load). A recipe that spans
  two cards can be read as one: add each photo and they're read in
  sequence into a single draft, with every card kept.
- **From a video** — paste a YouTube or Instagram link. This is the one
  import that leaves the page: the link goes to the family's import server
  (`backend/`, on Render — the only part of the app that runs on a server),
  which fetches the video, transcribes any narration (Groq Whisper), reads
  on-screen text from sampled frames, and has Anthropic’s AI write up a draft with
  everything unstated **flagged rather than guessed**. It runs as a
  background job with a progress card (three human stages, a rough ETA that
  says "taking a bit longer than usual…" rather than freezing) — and the
  page can be closed: finished drafts wait at the top of the Add screen
  under **Ready to check over** for whoever returns. Android can share a
  video straight in (`manifest.json` `share_target`); iPhone pastes the
  link or uses the two-minute Shortcut in `ADDING.md`. Failures are plain
  sentences — an Instagram fetch that's blocked says to screen-record and
  use the photo path; videos over 30 minutes are refused; a non-recipe
  video says so instead of producing fiction.

All four land on the same review screen before anything is saved, and
anything a parser had to guess is written into `flagged` so the recipe page
shows it. A half-finished import survives an accidental refresh — the draft
comes back until you save it or start over. And if what you're saving looks
a lot like a recipe already in the book, it says so once and lets you save
anyway — two versions is allowed, it just shouldn't be an accident.

Like every other edit, a new recipe lives in `localStorage` until you press
**Download updated recipes.json** and commit the file. A saved video import
additionally tells the server its draft was accepted, which writes the
reviewed recipe into the shared database — the nightly sync then carries it
into `recipes.json` for everyone.

## Adding a recipe by editing the file

Append an object to `recipes.json` and push. Field order matters for diffs:

```json
{
  "id": "kebab-case-slug",
  "title": "Recipe Title",
  "category": "Breakfast | Brunch | Lunch | Dinner | Sides | Snacks | Baking | Desserts | Cocktails | Drinks",
  "contributor": "Joan | Jason | Jennifer | Lindsay | Siobhan",
  "servings": 4,
  "prepTime": "15 min",
  "cookTime": "30 min",
  "ingredients": ["1 cup flour"],
  "steps": ["Preheat oven to 350°F."],
  "notes": "optional",
  "flagged": ["optional: anything worth double-checking"],
  "source": "optional",
  "image": "optional: images/kebab-case-slug.jpg",
  "tags": ["optional", "Italian", "vegetarian"]
}
```

`servings` is an integer. `prepTime` and `cookTime` are free text and are
displayed verbatim — never parsed for display. `flagged` entries surface on the
recipe page in Viewer mode too, because a reader should know when a transcribed
line is uncertain.

## Contributing changes to the design

`CLAUDE.md` is the build contract and `tokens.css` is the palette. Do not
generate a new palette or substitute a font — both were chosen deliberately, and
the colours are contrast-checked in both themes.
