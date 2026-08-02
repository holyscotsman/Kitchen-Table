/* The extraction call: transcript + frames in, a recipes.json-shaped draft
 * out. One Anthropic API call per import (spec step 3), constrained to the
 * schema below so the answer can't arrive shapeless. The instruction the
 * whole feature leans on is FLAG, DON'T GUESS — a video that never states a
 * quantity must produce a flagged line, not a confident number.
 *
 * buildContent / draftFromResult are pure and tested; callClaude is the thin
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
    servings: { type: "integer", minimum: 1, maximum: 40 },
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
    title: String(parsed.title || "").trim().slice(0, 300) || "Untitled recipe",
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
  if (!CATS.includes(parsed.category)) {
    d.flagged.push("Course — the extraction didn’t pick a valid course; set to Dinner.");
  }
  for (const k of ["ingredients", "steps"]) {
    const list = Array.isArray(parsed[k]) ? parsed[k] : [];
    d[k] = list.slice(0, 60).map(s => String(s).trim().slice(0, 500)).filter(Boolean);
    if (list.length > 60) {
      d.flagged.push((k === "ingredients" ? "Ingredients" : "Steps") +
        " — the video produced more than 60 lines; only the first 60 were kept.");
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
async function callClaude(client, meta, transcript, framesB64) {
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

module.exports = { MODEL, RESULT_SCHEMA, SYSTEM, buildContent, draftFromResult, callClaude };
