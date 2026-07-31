# Mom's Recipe Book

A family recipe collection, built to be genuinely readable on an iPhone — large
text and high contrast as a real mode, not pinch-zoom — with a one-tap route
into the iOS Notes app.

Plain HTML, CSS, and JavaScript. No build step, no framework, no dependencies.
Every file here is served as-is by GitHub Pages.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Recipe list, search, category and contributor filters |
| `recipe.html` | One recipe, chosen by URL (`recipe.html?id=shepherds-pie`) |
| `style.css` | All styling, including reader mode, edit mode, and print |
| `app.js` | Rendering, filters, reader mode, edit mode, import, publish |
| `recipes.json` | The recipe database — the site's only data source |
| `images/` | Optional recipe photos, referenced by a recipe's `image` field |

## Reading

**Reader mode** switches to large text, pure black on white, and a single wide
column. **A+ / A−** step the text size across seven sizes on top of that. Both
choices are remembered on the device.

Site chrome — the header, the nav, the action buttons — deliberately does *not*
grow with the text setting. Scaling the text makes the recipe bigger, rather
than burying it under a toolbar.

Each recipe page offers **Save to Notes** (the iOS share sheet via the Web Share
API, falling back to copy-to-clipboard elsewhere), **Download** for a clean
single-recipe `.txt`, and **Print**.

## Editing

**Edit mode** is off by default and shows no edit controls until it's turned on
from the header. Everything is staged locally first; nothing reaches the live
site until **Publish changes**.

Publishing commits straight to this repository through the GitHub REST API — no
backend, no server. Each editor pastes in their own fine-grained personal access
token once, which is stored only in their own browser:

- Scope it to **this repository only**
- Give it **Contents: Read and write** — nothing else
- Create one at <https://github.com/settings/personal-access-tokens/new>

The token is never written into `recipes.json`, never committed, and only ever
sent to `api.github.com`. Anyone with that token and access to that browser can
write to this repo. That's an acceptable trade for a family recipe book and not
a pattern to reuse anywhere the stakes are higher.

If someone else published a change to the same recipe while you were editing,
the publish stops and says so instead of overwriting their work. Unrelated
edits merge without complaint.

After a successful publish, GitHub Pages takes about a minute to rebuild before
the change is visible.

## Importing a recipe

Edit mode can start a recipe from a link or from text you paste. A link is
fetched directly and read for standard recipe markup, which works on sites that
allow it; many sites block cross-origin reads, and pasting the recipe text
always works. Either path lands on the normal editing form with anything
uncertain flagged rather than guessed at — nothing is ever published without
someone seeing it first.

## Adding a recipe by hand

Append an object to `recipes.json` and push:

```json
{
  "id": "kebab-case-slug",
  "title": "Recipe Title",
  "category": "Breakfast | Lunch | Dinner | Dessert | Side | Snack | Drink",
  "contributor": "Mom",
  "servings": "4",
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

`id`, `title`, `category`, `contributor`, `ingredients`, and `steps` are
required; the rest are optional and simply don't render when absent. A recipe
with no `image` shows no image — no placeholder, no reserved space.

## Local preview

Open it over HTTP, not `file://` — the pages fetch `recipes.json`:

```sh
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.
