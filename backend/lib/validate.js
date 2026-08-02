/* Kitchen Table backend — input validation, shared constants.
 * Everything here is pure and covered by tests/backend.js without a network.
 */
"use strict";

const CATS = ["Breakfast", "Brunch", "Lunch", "Dinner", "Sides",
  "Snacks", "Baking", "Desserts", "Cocktails", "Drinks"];

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
  out.id = r.id;
  if (!r.title || typeof r.title !== "string" || r.title.length > 300) return { error: "bad title" };
  out.title = r.title.trim();
  if (!CATS.includes(r.category)) return { error: "unknown category " + JSON.stringify(r.category) };
  out.category = r.category;
  if (!r.contributor || typeof r.contributor !== "string" || r.contributor.length > 60) return { error: "bad contributor" };
  out.contributor = r.contributor.trim();
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
    out[k] = r[k].trim();
  }
  return { recipe: out };
}

module.exports = { CATS, parseVideoUrl, validateRecipe };
