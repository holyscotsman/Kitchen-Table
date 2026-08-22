"use strict";

/* One free recipe id in the family's book.
 *
 * The phone chose the id against its own copy of the book — `slugify(title)`
 * over whatever recipes that device happens to hold — and another device may
 * have taken it since. The overlay is authoritative on a phone, so a device
 * with any local change stops seeing recipes added to the published file,
 * which makes "I have never heard of that id" the NORMAL state rather than
 * the rare one.
 *
 * Suffix rather than overwrite: a duplicate the family can see and delete
 * beats a recipe silently replaced. `-2`, `-3`, … is the convention this
 * app already uses for the same collision on the phone (`R70`).
 *
 * This exists as one function because two callers need exactly this rule —
 * accepting an import (`acceptJob`) and saving a recipe that was typed in
 * (`putRecipe` with `new`) — and two copies of a rule are two chances for it
 * to drift. `R124` is the standing lesson.
 */
async function freeRecipeId(sql, id) {
  let out = id;
  let n = 2;
  /* Bounded, because a `while` around a database call with no ceiling is a
     hang waiting for a pathological table. Ten copies of one name is far
     past anything a family produces, and the caller's insert still refuses
     to overwrite if the last one is somehow taken too. */
  while (n <= 12 && (await sql`select 1 from kitchen.recipes where id = ${out}`).length) {
    out = id + "-" + n++;
  }
  return out;
}

module.exports = { freeRecipeId };
