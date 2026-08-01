# Kitchen Table — build instructions

**Read this file before writing any code. Read `README.md` for the full screen-by-screen spec.**

## The one rule that keeps getting broken

**This app is dark forest green. Do not generate your own color palette.**

`tokens.css` in this folder is the palette. **Copy it into the project verbatim and use
`var(--*)` for every single color.** Do not substitute Tailwind defaults, do not pick "a nice
green," do not invent hex values, do not use `emerald-600` or `green-800` or any framework's
scale. If a color you need is not in `tokens.css`, that is a question to ask — not a value to invent.

Ground truth, in priority order:
1. `tokens.css` — the actual values. Copy it.
2. `styleguide.html` — open it in a browser. The build must match it.
3. `screenshots/` — what the three screens look like. Compare against these.
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

## About the .dc.html files

`Main.dc.html`, `Home.dc.html` (the **Menu** screen), and `Recipe.dc.html` are **design
references** in a proprietary format — a template with `{{ }}` holes plus a logic class. Do not
run them, port them, or copy their markup structure.

**Do read them** to extract exact values: sizes, spacing, the order of elements, the state logic,
the quantity-scaling algorithm. They are the most precise record of intended behavior. Their
`THEMES` object at the top of each logic class is the same palette as `tokens.css` — if the two ever
disagree, `tokens.css` wins.

## Definition of done

- [ ] `tokens.css` copied in verbatim; **zero** hardcoded hex values anywhere else in the CSS
- [ ] Atkinson Hyperlegible loading and applied everywhere
- [ ] Dark mode default; light mode toggles and persists
- [ ] Recipe instruction text is **24px at the default step** (this was raised deliberately — do not lower it)
- [ ] A− / A+ steps 20 → 40px and persists
- [ ] Nothing interactive under 44px; icon buttons 48×48
- [ ] Zero hover-only affordances (iPhone has no hover)
- [ ] Viewer mode shows no edit affordances at all
- [ ] Servings stepper rescales ingredient quantities, opening at each recipe's own count
- [ ] Ingredients and steps tap to check off; state resets on leaving the recipe
- [ ] WCAG AA contrast verified in **both** themes
- [ ] Build compared side by side against `styleguide.html` and `screenshots/`

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
- **`recipe.html` is a redirect stub**, kept only so bookmarks from the previous
  `recipe.html?id=…` build land on the right hash route instead of a 404.

### The one hardcoded-colour exception

The `@media print` block in `style.css` uses literal black, white, and grey.
Printed output must be black on white regardless of the active theme, and
`tokens.css` defines no print palette. Every other colour in the file is a
`var(--*)`.

### Built after the first pass

These were listed as "not yet designed" in the handoff. They were built from the
technical approach `DESIGN.md` already commits to, composed entirely from the
existing component vocabulary — no new colours, type sizes, or patterns.

- **Add / Import** — route `#add`, reached from the Menu's Add-recipe pill.
  Three entry points (type it in / from a link / from a photo), all converging
  on one review screen that reuses the Edit-mode field set. Nothing is saved
  until Save is pressed, and whatever a parser had to guess is written into
  `flagged`, which the recipe page then shows in Viewer mode.
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
  returns focus to the control that opened it. The sort menu also dismisses on
  an outside tap.
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
- **Contributors are Joan, Jason, Jennifer, Lindsay, and Siobhan.** Every one
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
shows the moment it is attached rather than after a commit. localStorage is
only a few megabytes; a quota failure returns a plain message telling the user
to download and commit what they have.

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

### Undo

Edit mode writes only to `kt.recipes`, and there is no other undo — a removed
recipe is otherwise gone from that device for good. "Undo all my changes on this
phone" clears that one key and falls back to the published file. It appears in
the Edit-mode footer once local changes exist, and also in the Menu's empty
state, since removing everything would otherwise leave no recipe to open Edit
mode from.

### Known limits

- **OCR quality is untested against real photographs.** The pipeline is
  verified end to end against a stubbed recogniser, and the parser is tested,
  but the sandbox this was built in cannot reach the Tesseract CDN. Accuracy on
  real pages will be imperfect — the handoff accepts that, and every OCR import
  is flagged for line-by-line checking.
- **`api.allorigins.win` is a third-party dependency** for link import only.
  When it is down, that one path fails with a plain message; nothing else in
  the app touches the network after load.

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

### Verified

81 functional checks in Chromium at iPhone and desktop widths, covering both
themes, the filter and sort behaviour, quantity rescaling, check-off reset,
the font stepper and its persistence, edit-mode save and reload, and the
download outputs. WCAG AA contrast audited across all three screens plus the
filter, sort, and download sheets in **both** themes — zero failures. Nothing
interactive measures under 44px.
