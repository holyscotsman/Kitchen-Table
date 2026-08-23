/* Kitchen Table — export the database back to recipes.json (gameplan 101).
 * The project is never locked into Postgres: this reproduces the exact file
 * the static app runs from, same field order, same formatting.
 *
 *   KT_DB='postgres://…' node db/export.js            # writes recipes.json
 *   KT_DB='postgres://…' node db/export.js --check    # compares, changes nothing
 *   KT_DB='postgres://…' node db/export.js --force    # writes past the guard
 *
 * The pure parts are exported so tests can exercise them without a database;
 * the script only runs when it is the thing being run.
 */
const fs = require('fs');
const path = require('path');
const { envStr } = require('../backend/lib/env');

const FIELD_ORDER = ['id', 'title', 'category', 'contributor', 'servings',
  'prepTime', 'cookTime', 'ingredients', 'steps', 'notes', 'flagged',
  'source', 'image', 'tags'];

/* One database row → one recipe, in the app's field order. Empty is absent:
 * the app's own writer (orderFields in app.js) drops "" as well as missing,
 * and an exporter that kept them would report drift on every run for a
 * difference nothing can see. */
function rowToRecipe(r) {
  const src = {
    id: r.id, title: r.title, category: r.category, contributor: r.contributor,
    servings: r.servings, prepTime: r.prep_time, cookTime: r.cook_time,
    ingredients: r.ingredients, steps: r.steps, notes: r.notes,
    flagged: (r.flagged && r.flagged.length) ? r.flagged : undefined,
    source: r.source, image: r.image,
    tags: (r.tags && r.tags.length) ? r.tags : undefined
  };
  const out = {};
  FIELD_ORDER.forEach(k => {
    if (src[k] !== undefined && src[k] !== null && src[k] !== '') out[k] = src[k];
  });
  return out;
}

/* The stop that stands between an unattended 06:17 workflow and the family's
 * book. db-sync commits whatever this writes, with nobody watching, so the
 * one outcome that must be impossible is a database answering with little or
 * nothing — empty, half-migrated, pointed at the wrong branch of a fork —
 * quietly replacing 48 recipes with none.
 *
 * Returns null to go ahead, or the sentence explaining the refusal. Growth is
 * always fine, and so is ordinary shrinkage: someone removing a recipe on
 * purpose must not need a flag. Losing more than a third of the book in one
 * night is not ordinary, and --force exists for the day it genuinely is.
 *
 * Fails OPEN when the current file can't be read or parsed: this guard
 * compares against a known-good book, and with no such book to compare
 * against it has nothing to say. */
function refuseToWrite(list, currentText) {
  let current;
  try { current = JSON.parse(currentText); }
  catch (e) { return null; }
  if (!Array.isArray(current) || !current.length) return null;

  if (!list.length) {
    return 'REFUSED: the database returned no recipes, and recipes.json holds ' +
      current.length + '. Refusing to replace the book with an empty file — ' +
      'check KT_DB points at the right database and that the schema is ' +
      'migrated. Pass --force if you really mean to empty it.';
  }
  if (list.length < current.length * (2 / 3)) {
    return 'REFUSED: the database has ' + list.length + ' recipes and ' +
      'recipes.json has ' + current.length + '. That is more than a third of ' +
      'the book disappearing in one sync, which is far more likely to be a ' +
      'pointing error than a decision. Pass --force if it is a decision.';
  }
  return null;
}

async function main() {
  const url = envStr('KT_DB');
  if (!url) { console.error('set KT_DB'); process.exit(1); }
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(url);

  const rows = await sql`
    select r.*, c.name as contributor,
           coalesce((select array_agg(t.name order by t.name)
                     from kitchen.recipe_tags rt
                     join kitchen.tags t on t.id = rt.tag_id
                     where rt.recipe_id = r.id), '{}') as tags
    from kitchen.recipes r
    join kitchen.contributors c on c.id = r.contributor_id
    order by r.position`;

  const list = rows.map(rowToRecipe);
  const text = JSON.stringify(list, null, 2) + '\n';
  const file = path.join(__dirname, '..', 'recipes.json');
  const currentText = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';

  if (process.argv.includes('--check')) {
    const a = JSON.stringify(JSON.parse(currentText));
    const b = JSON.stringify(JSON.parse(text));
    console.log(a === b
      ? 'ROUND TRIP CLEAN: database and recipes.json carry identical content.'
      : 'DIFFERS: the database and recipes.json have drifted — inspect before overwriting.');
    process.exit(a === b ? 0 : 2);
  }

  const refusal = process.argv.includes('--force')
    ? null : refuseToWrite(list, currentText);
  if (refusal) { console.error(refusal); process.exit(3); }

  fs.writeFileSync(file, text);
  console.log(`Wrote ${list.length} recipes to recipes.json from the database.`);
}

module.exports = { FIELD_ORDER, rowToRecipe, refuseToWrite };

if (require.main === module) {
  main().catch(e => { console.error(String(e)); process.exit(1); });
}
