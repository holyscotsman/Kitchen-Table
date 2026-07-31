# Kitchen Table

Everything Mom cooks, in one place.

A static family recipe site for ~48 transcribed recipes. The primary user is on
an iPhone with low vision, so legibility beats density everywhere. Plain HTML,
CSS, and vanilla JavaScript on GitHub Pages — no build step, no framework, no
bundler, no server.

**Live:** https://holyscotsman.github.io/Kitchen-Table/

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app — one page, hash-routed |
| `app.js` | Router, three screens, scaling, edit mode |
| `tokens.css` | **The palette.** Copied verbatim from the design handoff |
| `style.css` | Layout and components; every colour is a `var(--*)` |
| `recipes.json` | The 48 recipes. Source of truth for Viewer mode |
| `recipe.html` | Redirect stub for bookmarks from the previous build |
| `CLAUDE.md` | Build rules and the colour contract — **read first** |
| `DESIGN.md` | Full screen-by-screen spec from the design handoff |
| `design/` | Styleguide, screenshots, and the `.dc.html` design references |

## Screens

Navigation is hash-based, so back and forward work normally.

- `#` — **Main.** Search, tonight's dinner idea, browse by contributor or course.
- `#menu` — **Menu.** All 48 recipes with Filter and Sort. `#menu?who=Mom` and
  `#menu?cat=Dessert` open it pre-filtered.
- `#<recipe-id>` — **Recipe.** e.g. `#chicken-cordon-bleu`.

## Reading a recipe

Instruction text starts at **24px** and steps through 20 / 24 / 29 / 34 / 40 via
A− / A+. The choice persists. The typeface is Atkinson Hyperlegible, designed by
the Braille Institute for low-vision readers — that is a functional requirement,
not a stylistic one.

Dark is the default theme; the sun/moon button switches to light and remembers it.

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

`localStorage` keys are namespaced under `kt.` — `kt.theme`, `kt.fsIndex`,
`kt.easyRead`, `kt.recipes`.

## Local preview

Serve over HTTP, not `file://` — the page fetches `recipes.json`:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Adding a recipe by hand

Append an object to `recipes.json` and push. Field order matters for diffs:

```json
{
  "id": "kebab-case-slug",
  "title": "Recipe Title",
  "category": "Dinner | Breakfast | Side | Dessert | Snack | Drink",
  "contributor": "Mom | Me | Jennifer",
  "servings": 4,
  "prepTime": "15 min",
  "cookTime": "30 min",
  "ingredients": ["1 cup flour"],
  "steps": ["Preheat oven to 350°F."],
  "notes": "optional",
  "flagged": ["optional: anything worth double-checking"],
  "source": "optional",
  "image": "optional: images/kebab-case-slug.jpg"
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
