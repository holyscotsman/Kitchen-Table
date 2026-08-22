/* Kitchen Table backend — input validation, shared constants.
 * Everything here is pure and covered by tests/backend.js without a network.
 */
"use strict";

const CATS = ["Breakfast", "Brunch", "Lunch", "Dinner", "Sides",
  "Snacks", "Baking", "Desserts", "Cocktails", "Drinks"];

/* `R132` — the five words the app answers to itself. A recipe id is the
 * whole address it is read at (`#chicken-fritters`), so an id that IS one
 * of these is a recipe the app can store and list but never open: the
 * screen wins, and it has to, or a recipe called "Plan" would take the week
 * planner away from the family. The app moves one out of the way at its own
 * boundary; refusing it here keeps it out of the database in the first
 * place, so no phone has to keep renaming it at every boot. `db/migrate.js`
 * holds the same line on the file, and the two must not disagree. */
const ROUTE_WORDS = ["main", "menu", "add", "plan", "help"];

/* The two platforms the pipeline knows how to fetch. Everything else is
 * rejected with a message that names what IS supported, so the failure
 * teaches rather than stonewalls. */
function parseVideoUrl(raw) {
  let text = String(raw || "").trim();
  if (text.length > 2000) text = text.slice(0, 2000);
  /* Share sheets often hand over "Watch this! https://… via @someone" —
   * fish the first address out rather than bouncing the whole string. */
  const m = text.match(/https?:\/\/[^\s"'<>]+/i);
  if (!m) return { error: "That doesn’t look like a video link. Paste the address of a YouTube or Instagram video." };
  let url = m[0].replace(/[),.;!?]+$/, "");
  if (url.length > 500) return { error: "That address is too long to be a video link." };

  let host;
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); }
  catch (e) { return { error: "That address couldn’t be read as a link." }; }

  if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) {
    return { url, platform: "youtube" };
  }
  if (host === "instagr.am" || host === "instagram.com" || host.endsWith(".instagram.com")) {
    return { url, platform: "instagram" };
  }
  return { error: "Only YouTube and Instagram links work here. For anything else, try the link importer on the Add screen." };
}

/* The accept endpoint writes a real recipe row, so it holds the same line
 * db/migrate.js holds: fail loudly, never quietly mangle. Returns a clean
 * copy on success, { error } on refusal. */
function validateRecipe(r) {
  if (!r || typeof r !== "object") return { error: "no recipe in the request" };
  const out = {};
  if (!r.id || !/^[a-z0-9-]{1,80}$/.test(r.id)) return { error: "bad recipe id" };
  if (ROUTE_WORDS.indexOf(r.id) > -1) {
    return { error: "“" + r.id + "” is one of the app’s own screens, so a recipe cannot live at that address" };
  }
  out.id = r.id;
  /* `R115` — judge the value this will STORE, not the one it was handed.
   * Every check here used to read the raw string and then `.trim()` it on
   * the way out, which are two different strings: "   " is truthy, is a
   * string, and is under the limit, so a title of three spaces passed the
   * gate and landed in the database empty. A nameless recipe in everyone's
   * book, from the one function whose whole job is to refuse what the app
   * would never send.
   *
   * The contributor mattered more than the title: `putRecipe` inserts it
   * into `kitchen.contributors`, so an empty one mints a blank row that
   * shows up as a blank tile under "Whose recipe?" — and a contributor
   * outlives the recipe that created it. */
  if (!r.title || typeof r.title !== "string" || r.title.length > 300) return { error: "bad title" };
  out.title = r.title.trim();
  if (!out.title) return { error: "bad title" };
  if (!CATS.includes(r.category)) return { error: "unknown category " + JSON.stringify(r.category) };
  out.category = r.category;
  if (!r.contributor || typeof r.contributor !== "string" || r.contributor.length > 60) return { error: "bad contributor" };
  out.contributor = r.contributor.trim();
  if (!out.contributor) return { error: "bad contributor" };
  if (!Number.isInteger(r.servings) || r.servings < 1 || r.servings > 40) return { error: "servings must be a whole number 1–40" };
  out.servings = r.servings;
  for (const k of ["ingredients", "steps", "flagged", "tags"]) {
    const v = r[k] === undefined ? [] : r[k];
    if (!Array.isArray(v) || v.some(x => typeof x !== "string")) return { error: k + " is not a list of strings" };
    if (v.length > 100) return { error: k + " is implausibly long" };
    out[k] = v.map(s => s.trim()).filter(Boolean).map(s => s.slice(0, 1000));
  }
  for (const k of ["prepTime", "cookTime", "notes", "source", "image"]) {
    if (r[k] === undefined || r[k] === null || r[k] === "") continue;
    if (typeof r[k] !== "string" || r[k].length > 2000) return { error: "bad " + k };
    /* `S05` — `image` is the one field the app turns into a URL, and it took
     * any 2,000 characters at all. The app itself only ever writes one shape
     * (`orderFields`: "images/" + id + ".jpg"), and "Download photos" writes
     * the files to match, so anything else is either a mistake or somebody
     * being clever.
     *
     * Nothing catastrophic was reachable through it — the page's CSP is
     * `img-src 'self' data: blob:`, so a remote address never loads, and
     * `R98` clears a broken picture away quietly — but the result is a dead
     * link committed into recipes.json and published to everyone. Since the
     * `S` arc that string arrives from a phone rather than only from an
     * import review, so it is worth being exact about.
     *
     * The shape, not the exact id: recipes.json is hand-editable by design,
     * and two recipes sharing one photo is a reasonable thing for a person
     * to write by hand. `https://…`, `javascript:…`, `../../` and a
     * kilobyte of noise are not. The name allows exactly what an id
     * allows — the same [a-z0-9-]{1,80} the check above enforces — so a
     * recipe the validator accepts can never have a photo path it then
     * refuses. Two rules about the same slug that disagree is a bug
     * waiting for whoever writes the first id starting with a hyphen. */
    if (k === "image" && !/^images\/[a-z0-9-]{1,80}\.jpg$/.test(r[k].trim())) {
      return { error: "image must look like images/<name>.jpg" };
    }
    /* `R115` — and an optional field is absent or it has something in it.
       Storing "" in a column that means "nothing here" gives the schema two
       ways to say the same thing, and the app renders an empty time as
       though it were a value. `r[k] === ""` was already skipped above; a
       string that becomes empty once trimmed is the same thing said less
       obviously. */
    const trimmed = r[k].trim();
    if (!trimmed) continue;
    out[k] = trimmed;
  }
  return { recipe: out };
}

module.exports = { ROUTE_WORDS, CATS, parseVideoUrl, validateRecipe };
