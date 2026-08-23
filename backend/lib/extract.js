/* The extraction call: transcript + frames in, a recipes.json-shaped draft
 * out. One Anthropic API call per import (spec step 3), constrained to the
 * schema below so the answer can't arrive shapeless. The instruction the
 * whole feature leans on is FLAG, DON'T GUESS — a video that never states a
 * quantity must produce a flagged line, not a confident number.
 *
 * buildContent / draftFromResult are pure and tested; callExtractor is the thin
 * network wrapper around them. */
"use strict";

const { CATS } = require("./validate");

const MODEL = "claude-opus-5";

/* Structured-output schema: every property required, absence spelled as ""
 * or [] — the strictest reading of json_schema mode accepts this shape. */
const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_recipe", "not_recipe_reason", "title", "category", "servings",
    "prepTime", "cookTime", "ingredients", "steps", "notes", "tags", "flagged"],
  properties: {
    is_recipe: { type: "boolean" },
    not_recipe_reason: { type: "string" },
    title: { type: "string" },
    category: { type: "string", enum: CATS },
    /* No minimum/maximum here — the structured-outputs schema subset
     * rejects numeric bounds on integers (learned from a live 400);
     * draftFromResult clamps to 1–40 anyway. */
    servings: { type: "integer" },
    prepTime: { type: "string" },
    cookTime: { type: "string" },
    ingredients: { type: "array", items: { type: "string" } },
    steps: { type: "array", items: { type: "string" } },
    notes: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    flagged: { type: "array", items: { type: "string" } }
  }
};

const SYSTEM =
  "You turn cooking videos into recipe records for one family's recipe book. " +
  "You are given whatever the video offered: its title, uploader, description, " +
  "a transcript of the narration (sometimes missing or garbled), and still " +
  "frames (where the recipe may exist only as on-screen text).\n\n" +
  "Rules, in priority order:\n" +
  "1. TRANSCRIBE, NEVER INVENT. Use only what the video actually states or " +
  "shows. If a quantity, time, temperature, or ingredient is unstated, " +
  "inaudible, cut off, or ambiguous, leave it out or mark it — and add an " +
  "entry to `flagged` shaped 'Field — what needs checking' (e.g. " +
  "'Ingredients — the amount of flour was never said out loud'). A recipe " +
  "with many flags is a good extraction of a vague video.\n" +
  "2. If this is not actually a cooking recipe, set is_recipe to false and " +
  "say why in not_recipe_reason; leave the other fields empty.\n" +
  "3. Ingredients are one line each, quantity first when known, exactly as " +
  "stated ('2 cups flour', 'a knob of butter'). Steps are complete " +
  "imperative sentences in the order performed, keeping the cook's own " +
  "wording where it's clear.\n" +
  "4. servings: the stated count; if never stated, use 4 and flag " +
  "'Servings — not stated in the video; defaulted to 4'.\n" +
  "5. category is one of the ten given. Pick the closest and flag it if the " +
  "video made it a coin toss.\n" +
  "6. tags: only what the video clearly evidences — a cuisine it names, a " +
  "method like 'air fryer'. Unsure means empty.\n" +
  "7. prepTime/cookTime/notes: empty string when the video doesn't say. " +
  "Never put the video URL in any field.\n" +
  "8. On-screen text in frames counts as the video stating something; " +
  "narration and text sometimes disagree — prefer the text for quantities " +
  "and flag the disagreement.";

/* Frames first, then the words — the model reads images best when they
 * precede the question (claude-api skill: image blocks before text). */
function buildContent(meta, transcript, framesB64) {
  const content = (framesB64 || []).slice(0, 40).map(data => ({
    type: "image",
    source: { type: "base64", media_type: "image/jpeg", data }
  }));
  let text = "Platform: " + meta.platform +
    "\nVideo title: " + (meta.title || "(none)") +
    "\nUploader: " + (meta.uploader || "(unknown)") +
    "\n\nDescription / caption:\n" + ((meta.description || "").trim() || "(none)") +
    "\n\nTranscript of the audio:\n" +
    ((transcript || "").trim() ||
      "(No usable transcript — the recipe, if there is one, is in the " +
      "frames' on-screen text and the description above.)");
  if (content.length) {
    text += "\n\nThe " + content.length + " images above are frames sampled " +
      "evenly through the video, duplicates removed.";
  }
  text += "\n\nExtract the recipe.";
  content.push({ type: "text", text });
  return content;
}

/* Model output → the draft the review screen edits: recipes.json's exact
 * field shapes, defensively capped (046: trims are disclosed, in `flagged`,
 * never silent). `id` is deliberately absent — the phone assigns it at save,
 * same as every other import path. */
function draftFromResult(parsed, url, platform) {
  if (!parsed || typeof parsed !== "object") throw new Error("extraction returned nothing usable");
  if (parsed.is_recipe === false) {
    const why = String(parsed.not_recipe_reason || "").slice(0, 200);
    const e = new Error("This doesn’t look like a recipe video" + (why ? " — " + why : "") +
      ". Nothing was imported.");
    e.notRecipe = true;
    throw e;
  }
  const d = {
    title: String(parsed.title || "").trim().slice(0, 300),
    category: CATS.includes(parsed.category) ? parsed.category : "Dinner",
    servings: Number.isInteger(parsed.servings)
      ? Math.min(40, Math.max(1, parsed.servings)) : 4,
    ingredients: [], steps: [], flagged: [],
    source: url
  };
  const flags = Array.isArray(parsed.flagged) ? parsed.flagged : [];
  for (const f of flags.slice(0, 20)) {
    if (typeof f === "string" && f.trim()) d.flagged.push(f.trim().slice(0, 400));
  }
  /* `R152` — this used to fall back to the literal string "Untitled recipe",
   * silently. Every other guess in this function is disclosed (the course
   * below, the 60-line truncation further down), and both device-side
   * importers already leave a missing title EMPTY and flag it — the link
   * path says "none was found on the page", the photo path "none was
   * obvious". This was the one path guessing a NAME without saying so, and
   * `R121`'s rule is that one situation has one wording.
   *
   * The placeholder was the wrong thing to reach for besides: it is the
   * app's DISPLAY word for a nameless recipe (`R116`), which `startDraft`
   * keeps out of stored data on purpose so Save cannot bake it in. Saved
   * unchanged it would put a recipe called "Untitled recipe" in the family's
   * book, indistinguishable on every screen from one with no name at all.
   * Empty is safe: `saveNewRecipe` refuses to save a recipe without a title,
   * which is the same stop the other two paths rely on. */
  if (!d.title) {
    d.flagged.push("Title — none was found in the video; add one.");
  }
  /* `R153` — the same fault as the title, one field over, and this one had a
   * false sentence standing over it: CLAUDE.md states that "every import
   * path that cannot read a count defaults to 4 and flags it". The link path
   * does, the Add screen does (`R121` made it), and this one did not — a
   * count the model never gave became a confident 4 with nothing beside it.
   *
   * The sentence is the app's own, character for character: `R121`'s rule is
   * that one situation has one wording, and `R122`/`R123` answer a flag by
   * the field it names, so the wording is machinery rather than prose.
   *
   * An integer outside 1–40 is clamped and stays silent on purpose. The link
   * and photo paths clamp a parsed count the same silent way, and `R119`'s
   * rule that a clamp must be SAID is about a number a reader typed a moment
   * ago — not about a guess nobody made. */
  if (!Number.isInteger(parsed.servings)) {
    d.flagged.push("Servings — no count was found; 4 was assumed.");
  }
  if (!CATS.includes(parsed.category)) {
    d.flagged.push("Course — the extraction didn’t pick a valid course; set to Dinner.");
  }
  for (const k of ["ingredients", "steps"]) {
    const list = Array.isArray(parsed[k]) ? parsed[k] : [];
    d[k] = list.slice(0, 60).map(s => String(s).trim().slice(0, 500)).filter(Boolean);
    const field = k === "ingredients" ? "Ingredients" : "Steps";
    if (list.length > 60) {
      d.flagged.push(field +
        " — the video produced more than 60 lines; only the first 60 were kept.");
    }
    /* `R154` — the third field in this function with `R152`'s fault, and the
     * one with the most to lose. Both device-side importers say when a list
     * came back empty; this one said nothing, so a video that yielded
     * neither produced a draft with blank boxes and no reason given — and
     * `saveNewRecipe` only refuses an empty TITLE, so that draft is
     * saveable: a recipe in the family's book with nothing in it, arrived at
     * in silence.
     *
     * The wording is this path's own rather than a copy of either. The two
     * existing ones already differ because the advice does — "check the
     * original page" means nothing for a photograph — so what carries across
     * is the `Field — ` shape `R122`/`R123` answer by, not the sentence. */
    if (!d[k].length) {
      d.flagged.push(field + " — none were picked up from the video.");
    }
  }
  for (const k of ["prepTime", "cookTime", "notes"]) {
    const v = String(parsed[k] || "").trim();
    if (v) d[k] = v.slice(0, k === "notes" ? 1000 : 100);
  }
  const tags = Array.isArray(parsed.tags) ? parsed.tags : [];
  const cleanTags = tags.slice(0, 8).map(t => String(t).trim().slice(0, 40)).filter(Boolean);
  if (cleanTags.length) d.tags = cleanTags;
  d.flagged.push("Imported from " + (platform === "instagram" ? "an Instagram" : "a YouTube") +
    " video by the kitchen server — video imports are lossy, so check every line against the video.");
  return d;
}

/* The one network call. Streaming because the answer can run long; adaptive
 * thinking because frames + a noisy transcript is genuinely hard; the
 * json_schema output format because a shapeless answer helps nobody. If the
 * API rejects the thinking+format pairing, retry once without thinking
 * rather than failing the whole job over a parameter. */
async function callExtractor(client, meta, transcript, framesB64) {
  const req = {
    model: MODEL,
    max_tokens: 6000,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: RESULT_SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: buildContent(meta, transcript, framesB64) }]
  };
  let msg;
  try {
    msg = await client.messages.stream(req).finalMessage();
  } catch (e) {
    if (e && e.status === 400 && /thinking|output_config|format/i.test(String(e.message))) {
      const bare = Object.assign({}, req);
      delete bare.thinking;
      msg = await client.messages.stream(bare).finalMessage();
    } else { throw e; }
  }
  if (msg.stop_reason === "refusal") {
    throw new Error("The recipe writer declined this video. If it is an ordinary cooking video, try again.");
  }
  if (msg.stop_reason === "max_tokens") {
    throw new Error("The write-up ran too long to finish — try a shorter video.");
  }
  const block = (msg.content || []).find(b => b.type === "text");
  if (!block) throw new Error("The extraction came back empty.");
  return JSON.parse(block.text);
}

module.exports = { MODEL, RESULT_SCHEMA, SYSTEM, buildContent, draftFromResult, callExtractor };
