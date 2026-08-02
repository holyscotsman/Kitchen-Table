/* Kitchen Table — one-shot import of recipes.json into Postgres.
 * Gameplan 098 (fail loudly), 099 (report empty ingredient lists),
 * 100 (preserve flagged).
 *
 *   KT_DB='postgres://…' node db/migrate.js
 *
 * The connection string comes only from the environment — never from a file
 * in this repository. Requires @neondatabase/serverless (or set KT_PG=1 to
 * use a stock `pg` Pool over a direct connection).
 *
 * Idempotent: re-running upserts every recipe by id, so pulling fresh edits
 * into the database is this same command again.
 */
const fs = require('fs');
const path = require('path');

const CATS = ['Breakfast', 'Brunch', 'Lunch', 'Dinner', 'Sides',
  'Snacks', 'Baking', 'Desserts', 'Cocktails', 'Drinks'];

function die(msg) { console.error('MIGRATION STOPPED: ' + msg); process.exit(1); }

function validate(list) {
  if (!Array.isArray(list)) die('recipes.json is not an array');
  const seen = new Set();
  const emptyIng = [];
  list.forEach((r, i) => {
    const at = `recipe #${i} (${r && r.id ? r.id : 'no id'})`;
    if (!r || typeof r !== 'object') die(`${at} is not an object`);
    if (!r.id || !/^[a-z0-9-]+$/.test(r.id)) die(`${at}: bad id`);
    if (seen.has(r.id)) die(`${at}: duplicate id`);
    seen.add(r.id);
    if (!r.title || typeof r.title !== 'string') die(`${at}: missing title`);
    if (!CATS.includes(r.category)) die(`${at}: unknown category "${r.category}"`);
    if (!r.contributor || typeof r.contributor !== 'string') die(`${at}: missing contributor`);
    if (!Number.isInteger(r.servings) || r.servings < 1 || r.servings > 40)
      die(`${at}: servings must be an integer 1–40, got ${JSON.stringify(r.servings)}`);
    ['ingredients', 'steps', 'flagged', 'tags'].forEach(k => {
      if (r[k] !== undefined && !Array.isArray(r[k])) die(`${at}: ${k} is not a list`);
    });
    if (!(r.ingredients || []).filter(x => String(x).trim()).length) emptyIng.push(r.id);
  });
  return { emptyIng };
}

(async () => {
  if (!process.env.KT_DB) die('set KT_DB to the Postgres connection string');
  const file = path.join(__dirname, '..', 'recipes.json');
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));

  const { emptyIng } = validate(list);

  const { neon } = require('@neondatabase/serverless');
  const sql = neon(process.env.KT_DB);

  /* Schema first — idempotent by construction. */
  const ddl = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const stmts = ddl.split(/;\s*\n/)
    .map(s => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').trim())
    .filter(Boolean);
  for (const stmt of stmts) await sql.query(stmt);
  await sql`insert into kitchen.schema_version (version, notes)
            values (1, 'initial schema + recipes.json import')
            on conflict (version) do nothing`;

  /* Contributors (the app's WHO list may exceed who has recipes — that's fine,
     sections exist ahead of content). */
  const names = [...new Set(list.map(r => r.contributor))];
  for (const n of names) {
    await sql`insert into kitchen.contributors (name) values (${n})
              on conflict (name) do nothing`;
  }

  let upserts = 0, tagLinks = 0;
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    await sql`
      insert into kitchen.recipes
        (id, title, category, contributor_id, servings, prep_time, cook_time,
         ingredients, steps, notes, flagged, source, image, position)
      values
        (${r.id}, ${r.title}, ${r.category},
         (select id from kitchen.contributors where name = ${r.contributor}),
         ${r.servings}, ${r.prepTime || null}, ${r.cookTime || null},
         ${JSON.stringify(r.ingredients || [])}, ${JSON.stringify(r.steps || [])},
         ${r.notes || null}, ${JSON.stringify(r.flagged || [])},
         ${r.source || null}, ${r.image || null}, ${i})
      on conflict (id) do update set
        title = excluded.title, category = excluded.category,
        contributor_id = excluded.contributor_id, servings = excluded.servings,
        prep_time = excluded.prep_time, cook_time = excluded.cook_time,
        ingredients = excluded.ingredients, steps = excluded.steps,
        notes = excluded.notes, flagged = excluded.flagged,
        source = excluded.source, image = excluded.image,
        position = excluded.position, updated_at = now()`;
    upserts++;

    await sql`delete from kitchen.recipe_tags where recipe_id = ${r.id}`;
    for (const t of (r.tags || [])) {
      await sql`insert into kitchen.tags (name) values (${t}) on conflict (name) do nothing`;
      await sql`insert into kitchen.recipe_tags (recipe_id, tag_id)
                values (${r.id}, (select id from kitchen.tags where name = ${t}))
                on conflict do nothing`;
      tagLinks++;
    }
  }

  const [{ count }] = await sql`select count(*)::int as count from kitchen.recipes`;
  console.log(`Imported/updated ${upserts} recipes; database now holds ${count}.`);
  console.log(`Tag links written: ${tagLinks}.`);

  /* 099 — the audit the migration doubles as. When the content pass (072)
     lands, this line reads "none" and that is its proof. */
  console.log(emptyIng.length
    ? `Empty ingredient lists (${emptyIng.length}): ${emptyIng.join(', ')} — the 072 worklist.`
    : 'Empty ingredient lists: none.');
})().catch(e => die(String(e)));
