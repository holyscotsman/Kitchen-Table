# Handoff: Kitchen Table — family recipe site

> ## This is the original handoff, kept as a record
> **It is not the current spec.** `CLAUDE.md` is, and `README.md` describes the
> app as it stands. Parts of this document were superseded by Jason after the
> handoff and are left here unedited on purpose, so the reasoning behind each
> change stays legible:
>
> | This document says | What is true now |
> |---|---|
> | six categories — Dinner, Breakfast, Side, Dessert, Snack, Drink | **ten**, and `recipes.json` was migrated (`CLAUDE.md`, "Categories are now ten") |
> | contributors Mom, Me, Jennifer | **Joan, Jason, Jennifer, Lindsay, Siobhan, Jessica** — and every one of the 48 recipes is Joan's |
> | *"Open `styleguide.html`"*, *"Compare against `screenshots/`"* | neither was ever committed; `design/components.md` and `design/a11y-criteria.md` are the operative record |
> | sort by "Quickest first" / "Who it's from" | three sorts: Recently added, A–Z, Course |
>
> Everything the palette and the font ask for below still stands, unchanged.

> ## Start here
> **Read `CLAUDE.md` first.** Copy **`tokens.css`** into the project verbatim and reference every
> color as `var(--*)`. **Do not generate a palette** — this app is dark forest green
> (`#0E1712` background, `#1D4234` recipe cards, `#8FD3AC` accent; light mode swaps to
> `#F3F6F3` / `#1B4F39`). One font only: **Atkinson Hyperlegible**, no serif.
> Open `styleguide.html` in a browser and match it. Compare against `screenshots/`.

## Overview
A static recipe website for a family's transcribed recipe collection (~48 recipes). Primary user is
the mother of the family: **iPhone, low vision**. Legibility and simplicity beat density and cleverness
everywhere. Secondary devices (iPad, desktop) are served by the same responsive layout — there is no
separate desktop site.

The app has three screens designed so far:

1. **Main** — the landing screen. Search + guided browse entry points.
2. **Menu** — the full list of all recipes, with Filter and Sort.
3. **Recipe** — a single recipe, with a Viewer / Edit mode switch.

Not yet designed (deliberately out of scope for this handoff): the Import-a-recipe flow (from link
and from photo), the post-import review/fix screen, Add-a-recipe-by-hand, and a dedicated
contributor section view. The Menu's contributor filter covers contributor browsing for now.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes that demonstrate the
intended look, layout, and behavior. **They are not production code to copy directly.**

They are authored in a proprietary streaming-component format (`.dc.html`): a template of HTML with
`{{ }}` value holes plus a companion logic class. Do not try to run or port that format. Read them
for structure, exact values, and behavior, then **recreate the designs in the target codebase's own
environment** using its established patterns.

**"Recreate" means the markup and the CSS architecture — never the design decisions.** Colors,
type, sizes, and spacing are already decided and are not yours to re-choose: take them from
`tokens.css` and from the tables below. A rebuild that invents its own palette is a failed handoff.

For this project the target environment is a **static site: plain HTML + CSS + vanilla JS, hosted on
GitHub Pages, reading recipe data from `recipes.json`.** No build step, no framework, no bundler,
no server. Implement accordingly — a single `index.html` with a small JS router (hash-based) is the
expected shape. If the developer prefers a framework, it must still produce a fully static build.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, tap-target sizes, and interaction behavior are
final and should be reproduced exactly. Every value needed is listed in **Design Tokens** below.

Two things are intentionally *not* final:
- Contributor attributions in `recipes.json` were seeded programmatically as placeholders and are
  mostly guesses. The family will correct them in Edit Mode.
- `servings` was only present on 14 of 48 recipes; the other 34 were inferred (see **Data**).

---

## Data

### Schema
Each object in `recipes.json`:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Slug, unique. Used as the hash route: `#bacon-ranch-chicken-casserole` |
| `title` | string | |
| `category` | string | One of: Dinner, Breakfast, Side, Dessert, Snack, Drink |
| `contributor` | string | **New field added in this design.** One of: Mom, Me, Jennifer |
| `servings` | number | **Changed to an integer** (was an inconsistent string) |
| `prepTime` | string \| absent | Free text, e.g. `"10 min"`. Display verbatim, never parse for display |
| `cookTime` | string \| absent | Free text, e.g. `"44 min (chicken) + 15 min (bake)"` |
| `ingredients` | string[] | One line each, quantity first: `"3/4 cup ranch dressing (Kraft)"` |
| `steps` | string[] | One instruction each |
| `notes` | string \| absent | |
| `flagged` | string[] \| absent | Transcription uncertainties — things a human should double-check |
| `source` | string \| absent | Where the screenshot came from |
| `image` | string \| absent | **Currently empty on every recipe.** Design does not depend on it |

### Changes made to the data in this design phase
1. **Added `contributor`** to all 48 records. Values are placeholders — 25 Mom, 18 Me, 5 Jennifer,
   assigned by keyword heuristics. Expect the family to fix these.
2. **Normalized `servings` to an integer on all 48 records.** 14 had a value (`"4"`, `"9-12"`,
   `"8 to 10"`, `"9 cups"` → took the first integer; `"9 cups"` on `taco-pasta` was not a serving
   count and became 6). The other 34 were inferred: 6 for casseroles/pies/soups, 8 for desserts,
   2 for single-item air-fryer/grill references, 20 for `scottish-tablet`, 4 otherwise.
   **These are guesses and must be editable per recipe.**
3. Field order in each object was normalized to:
   `id, title, category, contributor, servings, prepTime, cookTime, ingredients, steps, notes, flagged, source, image`.

### Persistence model — **Option 1 (chosen)**
- `recipes.json` in the repo is the **source of truth** for Viewer Mode.
- On load: read `recipes.json`, then overlay any locally-saved edits from `localStorage`.
- Edit Mode writes to `localStorage` only. **Nothing is ever written to the repo by the app.**
- A **"Download updated recipes.json"** button serializes the merged current state (2-space indent,
  field order above) and downloads it. The family commits that file to GitHub manually.
- Suggested `localStorage` keys — namespace everything under `kt.`:
  | Key | Value |
  |---|---|
  | `kt.recipes` | JSON array of the full edited recipe set (overlay) |
  | `kt.theme` | `"dark"` \| `"light"` |
  | `kt.fsIndex` | integer index into the font-size scale, 0–4 |
  | `kt.easyRead` | boolean, the Easy Read toggle |
  **Never clear keys the app did not write.**

---

## Design Tokens

Applied as CSS custom properties on a root wrapper element; every other rule references `var(--*)`.
This is what makes the light/dark switch a one-line change.

### Colors — dark theme (default)
| Token | Hex | Used for |
|---|---|---|
| `--bg` | `#0E1712` | Page background |
| `--surf` | `#182620` | Cards, inputs, secondary buttons |
| `--strip` | `#13201A` | The mode strip under the Recipe header |
| `--line` | `#31483D` | All 1.5px borders and dividers |
| `--ink` | `#F1F5F2` | Primary text |
| `--dim` | `#A9BDB1` | Secondary text, labels, placeholders |
| `--acc` | `#8FD3AC` | Accent: primary buttons, links, active states, checkmarks |
| `--accInk` | `#08120D` | Text/icons **on** `--acc` |
| `--tagBg` | `rgba(143,211,172,.15)` | Step-number chips, selected menu rows |
| `--tagInk` | `#9BDCB6` | Text on `--tagBg` |
| `--track` | `#31483D` | Switch track, off |
| `--knob` | `#8A9E92` | Switch knob, off |
| `--card` | `#1D4234` | **Recipe cards and tiles** (the accent surface) |
| `--cardInk` | `#FFFFFF` | Text on `--card` |
| `--cardDim` | `rgba(255,255,255,.74)` | Secondary text on `--card` |
| `--danger` | `#F0846E` | Remove/delete affordances |
| `--scrim` | `rgba(0,0,0,.62)` | Behind bottom sheets |
| `--shadow` | `rgba(0,0,0,.55)` | Shadow color |

### Colors — light theme
| Token | Hex |
|---|---|
| `--bg` | `#F3F6F3` |
| `--surf` | `#FFFFFF` |
| `--strip` | `#E8EEE9` |
| `--line` | `#CFDBD2` |
| `--ink` | `#0D1C15` |
| `--dim` | `#485C51` |
| `--acc` | `#1B4F39` |
| `--accInk` | `#FFFFFF` |
| `--tagBg` | `rgba(27,79,57,.10)` |
| `--tagInk` | `#1B4F39` |
| `--track` | `#CFDBD2` |
| `--knob` | `#FFFFFF` |
| `--card` | `#1B4F39` |
| `--cardInk` | `#FFFFFF` |
| `--cardDim` | `rgba(255,255,255,.78)` |
| `--danger` | `#A8331F` |
| `--scrim` | `rgba(13,28,21,.45)` |
| `--shadow` | `rgba(13,28,21,.22)` |

**Contrast (WCAG AA is the floor; all of these clear it):**
`--ink`/`--bg` ≈ 16:1 dark, 15:1 light. `--dim`/`--bg` ≈ 8.5:1 dark, 6.5:1 light.
`--acc`/`--bg` ≈ 11:1 dark, 8:1 light. `--cardInk`/`--card` ≈ 9.9:1 dark, 8.9:1 light.
`--accInk`/`--acc` ≈ 11:1 dark, 8:1 light. Any new pair must be checked, in **both** themes.

### Typography
- **One family, everywhere: `'Atkinson Hyperlegible', system-ui, sans-serif`.** Chosen deliberately —
  it was designed by the Braille Institute for low-vision readers. Load 400 + 700, plus 400 italic.
  `<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">`
- **No serif anywhere.** This was an explicit requirement.
- Weights used: **400** body, **700** everything emphatic. No 500/600.
- `-webkit-font-smoothing: antialiased` on the root.
- `text-wrap: pretty` on titles, ingredient text, step text, and notes.

**Recipe screen type scale.** The screen sets a root `font-size` in px from the stepper; everything
inside is in `em` so one value scales the whole page:

```
scale (px):  [20, 24, 29, 34, 40]      // A− / A+ steps through these
default:     index 1  →  24px
```

| Element | Size | Weight | Line-height | Letter-spacing |
|---|---|---|---|---|
| Recipe `h1` | `1.75em` (`2.1em` ≥900px) | 700 | 1.1 | `-.02em` |
| Section `h2` | `1.2em` | 700 | — | — |
| **Ingredient / instruction text** | `1.02em` | 400 | 1.45 | — |
| Servings value | `1.15em` | 700 | 1.15 | — |
| Prep/Cook stat value | `.86em` | 700 | 1.3 | — |
| Notes body | `.92em` | 400 | 1.6 | — |
| Small labels (uppercase) | `.62em`–`.72em` | 700 | — | `.1em` |
| Source line | `.72em` | 400 | 1.5 | — |

At the 24px default that puts instructions at ~24.5px. **This was raised deliberately from 19px** —
default instruction text being "much bigger" was a specific request. Do not lower it.

**Main and Menu screens** use fixed px (they are not part of the stepper):
Main `h1` 34px/700/`-.03em` (46px ≥900px) · Main `h2` 21px/700 · search input 19px ·
Menu eyebrow ("KITCHEN TABLE") 12px/700/`.13em`/uppercase · Menu `h1` ("Menu") 26px/700/`-.015em` ·
card title 21px/700/1.2 · card meta 15px/1.3 · count label 15px · chips and buttons 18px/700 ·
sort menu rows 18px.

### Spacing, radii, shadows
- Spacing: multiples of 2 in the 4–40 range. Gaps used: 4, 5, 6, 8, 9, 10, 12, 14, 18, 22, 26, 32, 36.
- Screen edge padding is **responsive**: `16px` under 640px · `28px` 640–899px · `40px` ≥900px.
  (Main uses `18px` at the smallest size.) Derive it once and reuse; do not hardcode per-component.
- Radii: `8` checkbox · `12` inputs, small buttons, icon buttons · `14` list rows, secondary buttons ·
  `16` cards, tiles · `20` hero card, bottom sheets (top corners only: `20px 20px 0 0`) · `999` chips,
  switches, the Add-recipe pill.
- Borders: **`1.5px solid var(--line)`** is the standard. `2px` on form fields and the checkbox, so
  inputs read as inputs. Selected/active states swap the border to `var(--acc)`.
- Shadows: `0 12px 30px var(--shadow)` hero · `0 10px 26px var(--shadow)` floating Add pill ·
  `0 18px 40px var(--shadow)` sort menu · `0 -18px 50px var(--shadow)` bottom sheet.
  Inner top highlight on accent cards: `inset 0 1px 0 rgba(255,255,255,.09)`.

### Tap targets — hard floor
**Nothing interactive is under 44px.** In practice: icon buttons **48×48**; chips and list rows
**min-height 52–60**; primary buttons **60–68**; the servings ± buttons **56×56**; switches
**64×36** with a 26px knob. This applies as much on the Menu and filters as on the recipe page.

---

## Screens

### 1. Main  (`Main.dc.html`)
**Purpose:** the landing screen. Answer *one* question per band so the user never has to scan a list
to begin. Route: `#` / `#main`.

**Layout:** single centered column, `max-width: 760px` (`1040px` ≥900px), responsive edge padding.
Top padding `60px` under 500px wide (clears the iPhone status bar), `26px` above.

Bands, top to bottom:
1. **Title row** — `h1` "Kitchen Table" + subtitle "Everything Mom cooks, in one place." on the left;
   **theme toggle** 52×52 icon button on the right (sun icon in dark mode, moon in light).
2. **Search field** — full width, 64px tall, radius 16, `2px` border, magnifier icon inset 18px left,
   text padding-left 52px. Placeholder "Search 48 recipes".
   `type="search"`, visually-hidden `<label>`.
3. **"Tonight's idea"** — one hero card, radius 20, `--card` background, hero shadow.
   200px-tall image area at the top, then 20px padding, an uppercase meta line
   (`contributor · cookTime`) in `--cardDim`, then the title at 27px/700/1.15/`-.015em`.
   **Which recipe:** `dinners[new Date().getDate() % dinners.length]` where `dinners` is every
   recipe with `category === "Dinner"` — a stable suggestion that changes daily.
4. **"Whose recipe?"** — 3-column grid, gap 12. Each tile: `--card`, radius 16, min-height 118,
   padding 16, content bottom-aligned; the **count** at 38px/700 above the **name** at 19px/700.
   Links to the Menu pre-filtered by contributor.
5. **"What kind of thing?"** — 1 column under 640px, 2 columns above. Rows: `--surf` + `1.5px` border,
   radius 14, min-height 68, name left, count right in `--dim`. Links to the Menu pre-filtered by category.
6. **"See all 48 recipes"** — full-width `--acc` button, min-height 68, radius 16, 20px/700,
   chevron right. → Menu.

**Search behavior:** while the query is non-empty the entire browse stack is **replaced** by results
(not appended) — heading "*N* matches", then result cards, capped at 12. Clearing the field restores
the browse bands. Matches `title` OR any `ingredients` entry, case-insensitive substring.

**Image slot:** the hero image area is a drop target in the prototype (`image-slot.js`, included for
reference only). In production this should be `recipe.image` when present, and the band should fall
back to a flat `--card` panel — never a broken-image icon — when it is absent. **No recipe currently
has an image**, so the fallback is the default state.

### 2. Menu  (`Home.dc.html`)
**Purpose:** the full list of all 48 recipes, filterable and sortable. Route: `#menu`.
Named "Menu" in the UI — not "All recipes", not "Home".

**Header** (`position: sticky; top: 0; z-index: 5`, `--bg`, `1px` bottom border):
- Status-bar spacer: `padding-top: 54px` under 500px, `14px` above.
- Title block: eyebrow "KITCHEN TABLE" (12px/700/`.13em`/uppercase/`--dim`) over `h1` "Menu".
- Right: **search** 48×48 icon button (toggles the field; active state fills with `--acc`),
  **theme** 48×48, **"Aa"** 48×48 text-size button.
- Search field (revealed): 54px tall, radius 12, `2px solid var(--acc)` border.
  Toggling it closed clears the query.
- **Tool row:** `Filter` button (auto width) + `Sort` button (fills remaining width).
  Both min-height 54, radius 12. On screens ≥720px this row is capped at 660px and left-aligned
  rather than stretching across the window.
  - **Filter** shows a 3-line icon + label; when any filter is active it fills with `--acc` and
    appends a count badge (pill, `--accInk` background, `--acc` text, min-width 26, height 26).
  - **Sort** shows "Sort: <current>" + a chevron; border becomes `--acc` while its menu is open.

**There is no Viewer/Edit toggle on this screen.** That was removed deliberately — mode belongs to
the recipe page. The Menu instead has:
- **Add recipe** — a floating pill, bottom-right, `--acc`, min-height 60, padding `0 24px`,
  radius 999, plus icon + label, `0 10px 26px var(--shadow)`. It sits in a `position: sticky;
  bottom: 0` bar with `background: linear-gradient(to top, var(--bg) 58%, transparent)` so list
  content fades out beneath it. → the Add / Import flow.
- **Remove** — a text button in the count row (right side). Toggling it:
  - swaps the count label for "Tap a recipe to remove it",
  - replaces every card with a **remove row**: `--surf` background, `1.5px solid var(--danger)`
    border, same 88px min-height, and a 44px circular `--danger` button with a minus glyph on the right,
  - changes its own label to "Done" and fills itself with `--danger` (text `--bg`).
  A single tap removes. **Consider adding a confirm step** — it was flagged as an open question and
  never resolved. Removal is behind a mode, so the risk is contained, but it is currently undoable.

**Count row:** left, "*N* recipes" at 15px in `--dim`. Right, a "Clear" text button in `--acc`
(only when filters are active) then the Remove/Done button.

**Recipe cards** — a CSS grid, `gap: 12`, **1 column under 720px, 2 columns 720–1179px, 3 columns
≥1180px**, wrapped in a `max-width: 1320px` centered shell.
Each card is an `<a href="#<id>">`: `--card` background, radius 16, padding 16, min-height 88,
`display: flex; align-items: center; gap: 14`. Inside: title 21px/700/1.2 in `--cardInk`, then a
single meta line at 15px/1.3 in `--cardDim` reading `contributor · time` (time = `cookTime` or
`prepTime`, **only when ≤14 characters** — long strings like
"44 min (chicken) + 15 min (bake)" are omitted rather than truncated). A 13×22 chevron on the right
in `--cardInk`.
**Card text was cut back deliberately:** no category tag, no "Serves N" — the filters already answer
those, and the screen was too busy with them.

**Empty state:** "No recipes match. Try a different word, or clear the filters." + a
"Show all recipes" `--acc` button that clears filters *and* the query.

**Filter sheet** — a bottom sheet (`--scrim` behind it; the scrim is a real `<button>` labelled
"Close filters"). Panel: `--bg`, radius `20px 20px 0 0`, `max-height: 82%`, scrollable.
Header "Filter" + a `--acc` "Done" button. Then two groups, "WHO IT'S FROM" and "COURSE"
(14px/700/`.09em`/uppercase/`--dim` headings), each a wrapping row of chips, gap 10.
Chips: min-height 52, padding `0 18px`, radius 999, 18px/700. Unselected `--surf` + `--line` border;
selected `--acc` background + `--accInk` text. Each chip label includes its **live count**, and the
counts are cross-filtered — the course counts reflect the currently selected people and vice versa.
Both groups are **multi-select**. Footer: a full-width "Reset to all recipes" outline button.

**Sort menu** — `role="menu"`, absolutely positioned under the tool row, left-aligned at the edge
padding, `width: min(420px, calc(100% - 2×pad))`, `--surf`, radius 14, `1.5px` border, overflow
hidden, `0 18px 40px var(--shadow)`. Rows are `role="menuitemradio"`, min-height 58, separated by
`1px solid var(--line)`; the selected row gets `--tagBg` background, `--tagInk` text, weight 700,
and a checkmark. Options, in order:
| Key | Label | Comparator |
|---|---|---|
| `recent` | Recently added | file order, unsorted (default) |
| `az` | Name A – Z | `title.localeCompare` |
| `quick` | Quickest first | parsed total minutes ascending; unparseable → `1e6` (sorts last) |
| `course` | Course | `CATS` index, then title |
| `who` | Who it's from | `WHO` index, then title |

Time parsing for `quick` (display never uses this — sorting only): sum every
`(\d+(?:\.\d+)?)\s*(hour|hr|h|minute|min|m)\b` match across `prepTime + " " + cookTime`,
multiplying by 60 for hour units.

### 3. Recipe  (`Recipe.dc.html`)
**Purpose:** read and cook from one recipe; also where a recipe is edited. Route: `#<id>`.

**Header** (sticky, as the Menu's):
- Back link "‹ Menu" in `--acc`, 18px/700, min-height 48.
- Right: theme 48×48, then a **joined A− / A+ pair** in one 12px-radius container with a
  `1.5px` divider between them (A− 16px, A+ 21px, both 48×48, both 700).
  Steps through the 5-value px scale; clamped at both ends.
- Header inner content is capped at `max-width: 1180px` and centered.
- **Mode strip** below, full-bleed `--strip` with a top border: the mode label on the left in
  `--dim`, then the word "Edit" in `--ink`/700, then the switch.
  Label text: `"Viewer mode — read only"` / `"Edit mode — changes save on this phone"`.
  Switch: `role="switch"`, `aria-checked`, 64×36, radius 999, 3px padding, 26px knob; off =
  `--track` + `--knob`, on = `--acc` + `--accInk` knob, knob justified to the end when on.

**Content column:** `max-width: 820px` (`1040px` ≥900px), centered, responsive edge padding,
`padding-bottom: 60px`, and `font-size` set to the current step in px.

**Viewer mode**, top to bottom:
1. **Eyebrow** — `contributor · category`, `.66em`/700/`.12em`/uppercase/`--dim`.
2. **`h1`** — the title.
3. **Top grid** — `display: grid; gap: 12`; single column under 640px, otherwise
   `repeat(auto-fit, minmax(230px, 1fr))`. Contains:
   - **Servings card** — `--card`, radius 16, padding `16px 18px`. Label "SERVINGS", value
     "*N* people" (singular "person" at 1). Then **−** and **+**, each 56×56, radius 14,
     `--cardInk` background with `--card` glyph, 30px/700.
     **Behavior:** initialises to the recipe's own `servings`. Range **1–40**.
     `multiplier = chosen / original`, and **every ingredient and step line is rescaled by it.**
     This replaced an earlier abstract "×2 / ½×" control — the user picks *how many people*, never a
     multiplier.
   - **Prep** and **Cook** cards (only when the field exists) — `--surf` + border, radius 16.
     Values shown **verbatim**, never reformatted.
4. **Scaled note** — only when servings ≠ original:
   "Amounts adjusted from the original *N*. Tap − / + to change." `.78em`/700 in `--acc`.
5. **Keep screen on while cooking** — full-width `--surf` row, `role="switch"`, radius 14,
   label `.85em`/700 + the same switch component. Implement with the **Screen Wake Lock API**
   (`navigator.wakeLock.request('screen')`); release it on toggle-off, on `visibilitychange` to
   hidden, and on navigation away. Hide the row entirely if the API is unavailable.
6. **Body grid** — `display: grid; align-items: start`. Under 900px: 1 column, gap 32.
   At ≥900px: `minmax(280px, .85fr) 1.15fr`, gap 36, and the **ingredients column becomes
   `position: sticky; top: 130px`** so it stays beside the instructions while they scroll.
   - **Ingredients** — `h2` + the hint "Tap to check off as you go" (`.72em`/`--dim`), then a
     `<ul>`, gap 9. Each row is a `<button aria-pressed>`: min-height 60, padding `15px 16px`,
     radius 14, `--surf`, `1.5px` border. A 32×32 radius-8 checkbox with a `2px` border on the left;
     when checked the box fills `--acc` with an `--accInk` checkmark, the row border becomes
     `--acc`, and the text goes `--dim` + `line-through`.
   - **Instructions** — `h2` "Instructions", then an `<ol>`, gap 11. Same row treatment but
     `align-items: flex-start` and a 36×36 circular number chip (`--tagBg`/`--tagInk`, → `--acc`/`--accInk` when checked).
   - **Check state is per-visit** — hold it in memory, keyed by index. Do **not** persist it; it
     should reset when the recipe is left.
7. **Notes** — `h2` + a `--surf` panel with border, radius 14, padding `16px 18px`, `.92em`/1.6.
8. **"Worth double-checking"** — rendered only when `flagged` is non-empty. A panel with a
   `1.5px solid var(--danger)` border (no fill), a `--danger` heading at `.95em`/700, and a
   `<ul>` of the flagged strings. **Visible in Viewer mode too** — it is information, not an edit
   affordance, and the reader should know a line is uncertain.
9. **Action row** — `margin-top: 36px`, `padding-top: 28px`, `1.5px` top border. Two buttons,
   `flex: 1 1 180px` each so they sit side by side and wrap on narrow screens, min-height 64,
   radius 14: **Share** (outline, `--surf`) and **Download** (filled `--acc`), each with an icon.
   **These are deliberately in the page flow at the bottom — not a fixed/sticky bar.**
10. **Source line** — `"From Mom's screenshots · <source>"`, `.72em` in `--dim`.

**Download sheet** — opens from the Download button. Bottom sheet, same construction as the Filter
sheet, content capped at 520px and centered. Heading "Download this recipe", then three full-width
buttons at min-height 64/58: **"PDF — printable page"**, **"Plain text (.txt)"**, and a
`--acc` **Cancel**.
- Both outputs must contain **only the recipe** — title, contributor, servings, times, ingredients,
  steps, notes, source. **No site chrome, no navigation, no theme colors.**
- The PDF path should print from a dedicated print stylesheet (black on white, generous leading),
  *not* screenshot the dark UI.
- Export the **currently scaled** quantities, and say so in the output (e.g. "Serves 8 (adjusted
  from 4)") so a printed sheet is never ambiguous.
- This is **separate from Share.** Share uses the **Web Share API** on iPhone
  (`navigator.share`), falling back to clipboard copy / .txt download elsewhere.

**Edit mode** (same screen, swapped body — the header and mode strip stay put):
- **Title** — labelled text input.
- **Serves** (`type="number"`) and **From** — side by side, `flex: 1 1 120px`, wrapping.
- **Ingredients** and **Instructions** — one `<textarea>` per entry (2 rows / 3 rows), each paired
  with a 56×56 `--danger`-outlined delete button. Below each list, a full-width
  **`+ Add ingredient` / `+ Add step`** button: `2px dashed var(--line)`, transparent background,
  `--acc` text, min-height 58.
- **Notes** — 4-row textarea.
- Footer: **"Save changes"** (`--acc`, min-height 60) — label becomes **"Saved ✓"** after a
  successful save — and **"Download updated recipes.json"** (outline).
- All fields: `--surf` background, **`2px solid var(--line)`** border, radius 12, min-height 58,
  `--ink` text. Every input has a real `<label for>`.
- Edits accumulate in a **draft** object and are only committed to the recipe on Save. Leaving Edit
  mode without saving discards the draft. `saved` resets to `false` on any further keystroke.

---

## Interactions & Behavior

- **No hover dependency, anywhere.** iPhone has no hover. Every state that matters is expressed
  through a pressed/active/selected style or an `aria-*` attribute. Hover may be added as garnish
  on desktop but must never be the only signal.
- **Press feedback:** `transform: scale(.985)` on `:active` for cards and buttons. Keep transitions
  ≤150ms and `ease-out`; respect `prefers-reduced-motion: reduce` by dropping transforms.
- **Navigation** is hash-based: `#` → Main, `#menu` → Menu, `#<recipe-id>` → Recipe.
  Contributor and category tiles on Main link to the Menu with that filter pre-applied
  (the prototype uses `#menu-<name>`; a query-ish form like `#menu?who=Mom` is fine — pick one
  and keep it consistent). Back/forward must work.
- **Responsive breakpoints — three, total:** `640px` (edge padding, 2-up grids), `720px`
  (Menu goes 2-column, tool row stops stretching), `900px` (wider padding, larger `h1`,
  Recipe splits into two columns), plus `1180px` for the Menu's third column.
  The prototypes measure the **container**, not the viewport (they run inside device frames);
  in production plain CSS media queries are correct and simpler.
- **Sheets:** trap focus while open, close on `Escape`, restore focus to the trigger on close,
  and make the scrim a labelled button (as the prototype does) so it is reachable non-visually.
- **Loading:** `recipes.json` is small (~50KB) — render the shell immediately and fill the list when
  it resolves. No spinner needed. Handle fetch failure with a plain readable message, not a silent
  empty list.

## Accessibility — requirements, not suggestions
The primary user has **low vision**. This is the point of the project.

- **WCAG AA minimum** on all text and UI in **both** themes. Figures above.
- **Easy Read mode** — still to be built, and additive to the A−/A+ stepper, not a replacement:
  large text + high contrast + a wide single column, remembered in `localStorage` (`kt.easyRead`).
  The stepper must keep working inside it.
- **Font stepper** persists too (`kt.fsIndex`) and applies across screens.
- Correct heading order — one `h1` per screen, `h2` for sections, no skipped levels.
- Every input has a real `<label>` (visually hidden where the design has no visible label — the
  search fields). Every icon-only button has an `aria-label`. Decorative SVGs get
  `aria-hidden="true"`.
- Toggles are `role="switch"` + `aria-checked`. Filter chips and check-off rows are
  `aria-pressed`. Sort rows are `role="menuitemradio"` + `aria-checked`. Sheets are
  `role="dialog"` + `aria-modal="true"` + `aria-label`.
- Alt text on every recipe image once images exist; empty `alt=""` if purely decorative.
- Visible focus rings — do not remove outlines. `:focus-visible` with a 2px `--acc` ring.
- Full keyboard operability on desktop.

## State Management
Per screen, in one place:
- **Global / persisted:** `theme`, `fsIndex`, `easyRead`, `recipes` overlay.
- **Main:** `q`.
- **Menu:** `q`, `searchOpen`, `filterOpen`, `sortOpen`, `who[]`, `cats[]`, `sort`, `removing`.
- **Recipe:** `editing`, `serves`, `checkedIng{}`, `checkedStep{}`, `awake`, `dlOpen`, `draft`, `saved`.
- Filters are **multi-select arrays**, not single values. An empty array means "all" — do not model
  "All" as a member of the array.

## Quantity scaling — port this exactly
Scaling runs on the **leading quantity of each line only**; the rest of the string is untouched.

```
match:   /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)/     // "1 1/2" | "3/4" | "2" | "0.5"
parse:   mixed → whole + num/den;  fraction → num/den;  else parseFloat
scale:   value × multiplier
format:  whole part + nearest vulgar fraction within 0.03
         (¼ ⅓ ½ ⅔ ¾); no near match → round to 2 decimals
```
Return the line unchanged when the multiplier is 1 (within 0.001). Lines with no leading number
("Salt and pepper to taste") pass through untouched — that is correct behavior, not a bug.
Steps are run through the same function, so "Bake 2 cups of…" scales in the instructions too.

## Assets
- **Font:** Atkinson Hyperlegible, Google Fonts. No local files.
- **Icons:** all hand-written inline SVG, `stroke`-based, `currentColor`,
  `stroke-width` 2–3, `stroke-linecap="round"`. No icon library, no icon font.
  Set: magnifier, sun, moon, chevron-left, chevron-right, chevron-down, filter (3 lines),
  plus, minus, check, X, share (up-arrow-out-of-tray), download (down-arrow-into-tray).
- **Photos: none exist yet.** `image` is empty on all 48 records. This is the single biggest
  visual improvement available — the Main screen hero is built to take one.
  `image-slot.js` is bundled **for reference only**; it is a prototyping drop-target, not
  production code.
- No third-party CSS, JS, or component library is used or needed.

## Import a recipe — not yet designed, but decided
Flagging the agreed technical approach so it is not re-litigated:
- **From a link:** fetch through a **free public CORS proxy** (a static site cannot fetch arbitrary
  origins). Prefer parsing **JSON-LD `schema.org/Recipe`** from the page — most recipe sites emit
  it — and fall back to heuristics. Expect failures; surface them.
- **From a photo:** **in-browser OCR** (e.g. Tesseract.js). No API keys, no server. Accuracy will be
  imperfect and that is accepted.
- **Both paths land on a review/edit screen** — the same field set as Edit mode — and **never
  auto-publish.** Anything ambiguous or unparsed goes into `flagged` rather than being guessed,
  exactly as a careful human transcriber would. Only after confirmation does it join the collection.

## Out of scope — do not add
No accounts, no login, no comments, no ratings, no sharing beyond the Share/Download described
above, no analytics, no service worker, no separate desktop site. The value of this project is that
it opens fast and reads clearly.

## Files in this bundle
| File | What it is |
|---|---|
| `Main.dc.html` | Main screen design reference (template + logic) |
| `Home.dc.html` | **Menu** screen design reference |
| `Recipe.dc.html` | Recipe screen design reference, Viewer + Edit modes |
| `recipes.json` | The 48 recipes, with `contributor` added and `servings` normalized. **Ship this.** |
| `image-slot.js` | Prototype-only image drop target. Reference, do not ship |
| `CLAUDE.md` | **Read first.** Build rules, the color contract, definition of done |
| `tokens.css` | **The palette. Copy verbatim.** Both themes + radii, shadows, type scale |
| `styleguide.html` | Open in a browser — rendered reference for every color and component |
| `screenshots/` | The three screens as built. Visual ground truth |

Read the `.dc.html` files for exact structure and values. Values in this README take precedence if
they ever disagree.
