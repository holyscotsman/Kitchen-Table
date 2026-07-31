# Mom's Recipe Book — Project Instructions for Claude Code

This file is the project brief for the Claude Code session that builds this site. Read this before writing any code.

## What we're doing

Turning Mom's recipe collection (originally screenshots saved in Apple Notes) into a website she can open on her iPhone and actually read — genuine large-text/high-contrast reader mode, not just pinch-zoom — with a one-tap way to save a recipe into the iOS Notes app. The recipe data has already been fully transcribed to text; this session's job is to build the site around it.

Beyond the original "just let Mom read her recipes" goal, the site is expanding into a small family cookbook: multiple family members can contribute and browse recipes, someone can flip into an Edit Mode to add a new recipe (typed, pasted from a link, or photographed), and any recipe can be downloaded standalone.

## How we're doing it — hosting decision

**Host on GitHub Pages for now.** This is a firm decision, not a placeholder — the site is plain static HTML/CSS/JS with no backend, and GitHub Pages serves that for free with zero maintenance. It also means Jason can reach the live site from any device immediately, which is the point of moving off "files on one Mac."

Migrating to a personally-owned server is a planned future step, not part of this build. Don't architect around a specific future host — just don't do anything that would make a plain static-file export hard later (e.g., no server-only logic, no server-side includes, no framework that requires a Node server to run in production). A future migration should be "copy the files to the new host," not a rewrite.

## Design references — READ THIS BEFORE TOUCHING THE DESIGN FILES

The design files (including `dc.html`) in the project folder are **visual/UX references only — not code to port.** They exist to show layout, spacing, and component ideas. Do not copy their HTML/CSS/JS into the actual site, extract snippets from them, or treat them as a starting scaffold. Look at them, understand the intent (layout, hierarchy, what a card/toggle/button should look like), then build the real site's markup and styles from scratch to match that intent while following the technical constraints in this document (mobile-first, accessible, static-file-only, matching the existing `recipes.json` schema). If a reference file conflicts with something in this document (e.g., it assumes a backend, or a login), this document wins — flag the conflict rather than silently following the mockup.

## What already exists in this repo

- **`recipes.json`** — the full recipe database, 48 recipes, one object per recipe. This is the site's only data source; nothing here should be hardcoded into HTML.
- **`All Recipes/All Recipes Combined.md`** — a human-readable version of the same data, useful for a quick proofread but not something the site reads from directly.
- **`claude-design-prompt.md`** — the full feature spec for Edit Mode, family sections, import-from-link/image, download, and accessibility. Treat it as the source of truth for those features; this file summarizes the highlights below.
- **Per-recipe folders with `Attachments/`** — the original screenshots each recipe was transcribed from. These are source material, not site assets. Most recipes do **not** yet have a clean hero photo wired up — the `image` field is absent from most `recipes.json` entries. Build the recipe card/detail view to work gracefully with no image (don't leave a broken image icon or reserve awkward blank space).

## Recipe data schema

```json
{
  "id": "kebab-case-slug",
  "title": "Recipe Title",
  "category": "Breakfast | Lunch | Dinner | Dessert | Side | Snack | Drink",
  "contributor": "Mom",
  "servings": "4",
  "prepTime": "15 min",
  "cookTime": "30 min",
  "ingredients": ["1 cup flour", "..."],
  "steps": ["Preheat oven to 350°F.", "..."],
  "notes": "optional",
  "flagged": ["optional: transcription issues to be aware of"],
  "source": "optional: where the recipe came from",
  "image": "optional: images/kebab-case-slug.jpg"
}
```

`contributor` is new for the family-sections feature (see below) — it isn't populated in the current `recipes.json` yet. Add it to the schema and default existing recipes to `"Mom"` when you wire this up, rather than leaving it undefined and having to special-case missing values everywhere.

## Site architecture

```
/ (repo root)
├── index.html          → recipe list / home screen
├── recipe.html          → recipe detail view (recipe chosen via URL param, e.g. ?id=shepherds-pie)
├── style.css            → all styling, incl. reader-mode + edit-mode styles
├── app.js                → rendering, filters, reader mode, edit mode, import, download logic
├── recipes.json          → recipe data (source of truth)
├── images/               → optional recipe photos, referenced by the `image` field
└── CLAUDE.md             → this file
```

No build step, no framework, no `node_modules` in production — plain files GitHub Pages can serve as-is. If you use any tooling during development (a local dev server, a linter), it shouldn't produce anything the deployed site depends on at runtime.

## Feature requirements

Full detail lives in `claude-design-prompt.md`; this is the condensed version so the shape of the work is clear up front.

**1. Viewer Mode / Edit Mode toggle.** Default is Viewer Mode — read-only, zero edit affordances visible, this is what Mom sees. A visible toggle (e.g., top-right of the header) switches to Edit Mode for adding/changing/removing recipes. No password needed — this is trusted-family-use, not public-use — but the switch should be deliberate, not something someone lands on by accident.

**2. Edit persistence — commit directly to GitHub via the REST API, no custom backend.** Edits made in Edit Mode should land on the live site for everyone, not just the device that made them. There's still no server to build or host — the browser calls the GitHub REST API directly and GitHub Pages redeploys automatically. Full implementation details are in "GitHub-backed persistence" below; the short version:
   - Each editor pastes in a personal access token (scoped to just this repo) once, stored only in their own browser.
   - Edits are staged locally in the page first (never auto-published keystroke-by-keystroke); a single **"Publish changes"** action commits the updated `recipes.json` (and any new images) straight to the `main` branch.
   - The live site updates within roughly a minute, once GitHub Pages finishes redeploying — say so in the UI so it doesn't look broken.

**3. Family member sections.** Add the `contributor` field described above. On the home screen, let people filter/browse by contributor the same way they can by category — tabs, a dropdown, or a segmented control, whatever fits the layout best. No login required to view any section.

**4. Import a recipe from a link or an image (Edit Mode only).**
   - From a link: fetch the page, extract title/ingredients/steps/servings/times into the schema.
   - From an image: OCR/transcribe a photo into the same schema.
   - Both paths land on an editable review screen before anything is saved — never auto-publish silently. Flag anything ambiguous rather than guessing, same standard used for the original transcription work.

**5. Download a recipe.** Every recipe detail page gets a "Download" button producing a clean, single-recipe file (plain text or PDF) with no site chrome — separate from the "Save to Notes" share flow, which still uses the Web Share API with a copy/download fallback.

**6. Accessibility, on top of the existing reader-mode spec** (large text/high-contrast toggle, remembered via `localStorage`, single wide column, no gray-on-white text):
   - Font-size stepper (A+/A−) if a single toggle proves too coarse — worth testing with Mom directly rather than guessing.
   - WCAG AA contrast minimum, including in Edit Mode's forms and buttons.
   - Large tap targets everywhere, not just the reader-mode view.
   - No functionality that depends on hover (iPhone has none).
   - Proper heading structure, labeled inputs/buttons, alt text on any images.

## GitHub-backed persistence — implementation notes

This is how Edit Mode should actually write to the live site. No serverless function, no OAuth app, no secrets embedded in the site's code — just the GitHub REST API called from the browser with a token the editor supplies themselves.

**Auth: a fine-grained personal access token, entered client-side, stored client-side only.**
- In Edit Mode, before any edit can be published, show a one-time "Connect to GitHub" step: a field to paste a token, plus a plain-language explainer and a link to `https://github.com/settings/personal-access-tokens/new`.
- The token must be a **fine-grained PAT**, scoped to **this one repository only**, with **Contents: Read and write** permission and nothing else. Say this explicitly in the UI instructions so whoever generates one doesn't grant broader access by default.
- Store the token in `localStorage` on that device only. Never write it into `recipes.json`, never commit it, never send it anywhere except `api.github.com` over HTTPS.
- Each family member who wants to edit generates their own token on their own device — this isn't a single shared secret baked into the site.
- Trade-off worth stating plainly in the UI: anyone with that token (and access to that browser/device) can write to the repo. That's an acceptable risk for trusted-family recipe editing, not for anything more sensitive — don't let this pattern quietly get reused for a future project with higher stakes.

**Publishing flow:**
1. On loading Edit Mode, `GET /repos/{owner}/{repo}/contents/recipes.json` to fetch the current file content and its `sha`.
2. Let the person make changes in the UI (add/edit/delete a recipe) against a local, in-memory copy — nothing is sent to GitHub until they hit "Publish changes."
3. On publish, `PUT /repos/{owner}/{repo}/contents/recipes.json` with the updated JSON (base64-encoded), a commit message (e.g. `Update recipes.json via Edit Mode`), and the `sha` from step 1, using `Authorization: Bearer <token>`.
4. If the PUT fails because the `sha` is stale (someone else published in the meantime), refetch the latest version, show a clear "this was changed since you started editing" message, and let them redo/merge their edit rather than silently overwriting someone else's change.
5. If a new recipe image was added via the import flow, commit it the same way to `images/<slug>.jpg` before or alongside the `recipes.json` update.
6. After a successful publish, tell the person the live site will update in about a minute (GitHub Pages redeploy time) — don't imply it's instant.

**What this does and doesn't need:**
- No backend server, no database, no OAuth app registration — this stays within "static site on GitHub Pages," just with the browser talking to GitHub's API instead of only rendering local files.
- Doesn't require anything from Jason at build time — no token needs to exist until someone actually wants to publish an edit, which happens after the site is live.
- Keep repo write scope as narrow as technically possible (fine-grained PAT, single repo, Contents only) since this is the actual security boundary here.

## Non-goals

- No accounts, logins, comments, or social features. (The GitHub token used to publish edits isn't a site login — it's a per-device credential for talking to GitHub's API directly; there's still no username/password/account system on the site itself.)
- No framework/build pipeline unless there's a concrete reason plain HTML/CSS/JS can't do the job — this site does not need one.
- Don't redesign the base recipe list/detail visual style beyond what's needed to support the features above; this is additive to the existing plan, not a rebuild.

## Getting it running on GitHub

**Prerequisites (check before starting):** `git` installed, and either the GitHub CLI (`gh`) installed and authenticated (`gh auth login`) so the repo can be created and pushed to directly, or an empty repository already created manually on github.com with its remote URL on hand. Nothing else is needed up front — the personal access token for Edit Mode's publish feature isn't generated until later, by whoever first wants to publish an edit, once the site already exists.

1. **Create the repo.** From this project folder: `git init`, then create a new repository on GitHub (e.g., `moms-recipe-book`) and add it as the remote. Keep it **public** unless Jason says otherwise — no personal data lives in it, just recipes — but flag this choice rather than assuming it silently.
2. **Add a `.gitignore`** for anything not meant to be published (OS files like `.DS_Store`, editor configs, etc). The per-recipe source folders and `Attachments/` screenshots don't need to ship with the live site — consider excluding them from the repo, or at least from what gets linked to, since they're multi-hundred files of source material, not site assets.
3. **First commit and push** — `index.html`, `recipe.html`, `style.css`, `app.js`, `recipes.json`, `images/` (if populated), and this `CLAUDE.md`.
4. **Enable GitHub Pages**: repo Settings → Pages → Deploy from a branch → `main` branch, root folder. GitHub will publish at `https://<username>.github.io/moms-recipe-book/`.
5. **Hardcode the repo owner/name into `app.js`** wherever the GitHub API calls are made (`{owner}/{repo}` in the endpoints described above) — the site only ever talks to this one repo, so this doesn't need to be configurable.
6. **Verify on an actual iPhone**, not just a desktop browser at a resized window — check the reader mode toggle, the category/contributor filters, the Notes share flow, and a real end-to-end Edit Mode publish (generate a test fine-grained PAT, edit a recipe, confirm it shows up live after the redeploy) all work as expected on real mobile Safari.
7. **Every future change** — new recipes, feature updates, or a recipe edit published through Edit Mode — is a commit to `main`; GitHub Pages redeploys automatically within a minute or two. No separate deploy step.
