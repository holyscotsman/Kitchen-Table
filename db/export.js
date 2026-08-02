/* Kitchen Table — export the database back to recipes.json (gameplan 101).
 * The project is never locked into Postgres: this reproduces the exact file
 * the static app runs from, same field order, same formatting.
 *
 *   KT_DB='postgres://…' node db/export.js            # writes recipes.json
 *   KT_DB='postgres://…' node db/export.js --check    # compares, changes nothing
 */
const fs = require('fs');
const path = require('path');

const FIELD_ORDER = ['id', 'title', 'category', 'contributor', 'servings',
  'prepTime', 'cookTime', 'ingredients', 'steps', 'notes', 'flagged',
  'source', 'image', 'tags'];

(async () => {
  if (!process.env.KT_DB) { console.error('set KT_DB'); process.exit(1); }
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(process.env.KT_DB);

  const rows = await sql`
    select r.*, c.name as contributor,
           coalesce((select array_agg(t.name order by t.name)
                     from kitchen.recipe_tags rt
                     join kitchen.tags t on t.id = rt.tag_id
                     where rt.recipe_id = r.id), '{}') as tags
    from kitchen.recipes r
    join kitchen.contributors c on c.id = r.contributor_id
    order by r.position`;

  const list = rows.map(r => {
    const out = {};
    const src = {
      id: r.id, title: r.title, category: r.category, contributor: r.contributor,
      servings: r.servings, prepTime: r.prep_time, cookTime: r.cook_time,
      ingredients: r.ingredients, steps: r.steps, notes: r.notes,
      flagged: (r.flagged && r.flagged.length) ? r.flagged : undefined,
      source: r.source, image: r.image,
      tags: (r.tags && r.tags.length) ? r.tags : undefined
    };
    FIELD_ORDER.forEach(k => {
      if (src[k] !== undefined && src[k] !== null) out[k] = src[k];
    });
    return out;
  });

  const text = JSON.stringify(list, null, 2) + '\n';
  const file = path.join(__dirname, '..', 'recipes.json');

  if (process.argv.includes('--check')) {
    const current = fs.readFileSync(file, 'utf8');
    const a = JSON.stringify(JSON.parse(current));
    const b = JSON.stringify(JSON.parse(text));
    console.log(a === b
      ? 'ROUND TRIP CLEAN: database and recipes.json carry identical content.'
      : 'DIFFERS: the database and recipes.json have drifted — inspect before overwriting.');
    process.exit(a === b ? 0 : 2);
  }

  fs.writeFileSync(file, text);
  console.log(`Wrote ${list.length} recipes to recipes.json from the database.`);
})().catch(e => { console.error(String(e)); process.exit(1); });
