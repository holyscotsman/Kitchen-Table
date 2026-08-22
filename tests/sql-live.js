/* `R127` — run the write endpoint's actual SQL against a real Postgres.
 *
 * Not in the default suite, for the same reason as `live.js` and
 * `ocr-live.js`: it needs something CI does not have. Everything else that
 * checks `putRecipe` reads its source, and source-reading cannot answer the
 * two questions this round turns on —
 *
 *   1. does Postgres accept a PARAMETER in the `on conflict … do update …
 *      where` clause, and infer its type? (If not, the live edit path 500s.)
 *   2. with that parameter set to "this is a create", is the row already
 *      there genuinely left alone — not merely un-returned?
 *
 * The statement is extracted from `backend/server.js` rather than copied, so
 * this cannot quietly go on proving something the server no longer does.
 *
 * Needs a Postgres and `psql` on PATH. Point it at one with KT_TEST_DB, or
 * with the usual PG* variables. To make a scratch one (not as root):
 *
 *   initdb -D /var/tmp/ktpg -U kt --auth=trust
 *   pg_ctl -D /var/tmp/ktpg -o '-p 5433 -k /var/tmp/ktpg -c listen_addresses=' start
 *   PGHOST=/var/tmp/ktpg PGPORT=5433 PGUSER=kt psql -d postgres -c 'create database kt_test'
 *   PGHOST=/var/tmp/ktpg PGPORT=5433 PGUSER=kt PGDATABASE=kt_test node tests/sql-live.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const chk = (name, ok, detail) => {
  if (ok) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')); }
};

const DB = process.env.KT_TEST_DB || '';
function psql(sqlText) {
  const args = DB ? [DB] : [];
  return execFileSync('psql', args.concat(['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-f', '-']),
    { input: sqlText, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

/* Where a Postgres is guaranteed — CI runs one as a service container — a
   skip is not an acceptable outcome. A gate that quietly does nothing is
   worse than no gate: it reports success and nobody looks again. */
const REQUIRED = process.env.KT_SQL_REQUIRED === '1';
try {
  psql('select 1;');
} catch (e) {
  const why = String((e.stderr || e.message) || '').trim().split('\n')[0];
  if (REQUIRED) {
    console.log('\nFAIL sql-live: KT_SQL_REQUIRED is set and no Postgres answered :: ' + why);
    process.exit(1);
  }
  console.log('\nSKIP sql-live: no Postgres reachable (' + why + ')');
  console.log('     Set KT_TEST_DB or the PG* variables — see the header of this file.');
  process.exit(0);
}

/* The shipped statement, with its ${…} holes turned into $1…$n in order. */
const src = fs.readFileSync(path.join(__dirname, '..', 'backend', 'server.js'), 'utf8');
const put = src.slice(src.indexOf('async function putRecipe'));
const stmt = put.slice(put.indexOf('insert into kitchen.recipes'),
                       put.indexOf('returning id`') + 'returning id'.length);
const holes = [];
const prepared = stmt.replace(/\$\{[^}]*\}/g, (m) => { holes.push(m); return '$' + holes.length; });

console.log('\n== The write endpoint’s own SQL, on a real Postgres (R127) ==');
chk('the statement was found in server.js', /insert into kitchen\.recipes/.test(stmt), stmt.slice(0, 40));
chk('and it carries the create-or-edit switch as a parameter',
  holes[holes.length - 1] === '${isNew ? 0 : 1}', holes[holes.length - 1]);
const idHole = holes.indexOf('${rowId}');
chk('and writes the row id it chose, not the one it was handed',
  idHole === 0, String(idHole));

const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
/* Bound by the NAME of each hole, not by counting to fourteen. A hardcoded
   argument list makes any change to the statement fail on arity — which
   looks like a caught mutation and proves nothing about the behaviour. */
const say = (id, title, who, serves, sw) => {
  const lit = {
    '${rowId}': "'" + id + "'",
    '${r.title}': "'" + title.replace(/'/g, "''") + "'",
    '${r.category}': "'Baking'",
    '${r.contributor}': "'" + who + "'",
    '${r.servings}': String(serves),
    '${r.prepTime || null}': 'null',
    '${r.cookTime || null}': 'null',
    '${JSON.stringify(r.ingredients)}': '\'["1 cup butter"]\'',
    '${JSON.stringify(r.steps)}': '\'["Bake."]\'',
    '${r.notes || null}': 'null',
    '${JSON.stringify(r.flagged)}': "'[]'",
    '${r.source || null}': 'null',
    '${r.image || null}': 'null',
    '${isNew ? 0 : 1}': String(sw)
  };
  const args = holes.map((h) => {
    if (!(h in lit)) throw new Error('sql-live does not know what to bind to ' + h);
    return lit[h];
  });
  return 'execute put(' + args.join(',') + ');';
};

let out = '';
try {
  out = psql([
    'drop schema if exists kitchen cascade;',
    schema,
    "insert into kitchen.contributors (name) values ('Jennifer'), ('Lindsay') on conflict do nothing;",
    'prepare put as', prepared, ';',
    /* Jennifer's recipe, already in the family's book. */
    say('shortbread', "Jennifer's Shortbread", 'Jennifer', 12, 1),
    /* Lindsay types in her own shortbread. Her phone minted the same id
       against its own copy of the book, and this is a CREATE. */
    say('shortbread', "Lindsay's Shortbread", 'Lindsay', 6, 0),
    "select 'after-create=' || title || '/' || servings from kitchen.recipes where id = 'shortbread';",
    /* Jennifer fixes a typo in her own recipe. That is an EDIT. */
    say('shortbread', "Jennifer's Shortbread (fixed)", 'Jennifer', 12, 1),
    "select 'after-edit=' || title || '/position=' || position from kitchen.recipes where id = 'shortbread';",
    "select 'rows=' || count(*) from kitchen.recipes;"
  ].join('\n'));
} catch (e) {
  out = 'PSQL FAILED: ' + String((e.stderr || e.message) || '').trim();
}

/* PREPARE is the type-inference test: a parameter Postgres cannot type in
   the conflict clause fails here rather than in the family's kitchen. */
chk('Postgres accepts the statement and can type every parameter',
  !/PSQL FAILED/.test(out), out.slice(0, 300));
chk('a create landing on a taken id leaves the recipe that is there alone',
  /after-create=Jennifer's Shortbread\/12/.test(out), out.replace(/\n/g, ' | '));
chk('so nobody’s recipe is replaced by somebody else’s of the same name',
  !/after-create=Lindsay/.test(out));
chk('while an edit of that row does overwrite it',
  /after-edit=Jennifer's Shortbread \(fixed\)/.test(out), out.replace(/\n/g, ' | '));
chk('and does not move it in "recently added"',
  /after-edit=[^|]*position=0/.test(out), out.replace(/\n/g, ' | '));
chk('and the create wrote no row of its own at that id',
  /rows=1/.test(out), out.replace(/\n/g, ' | '));

console.log('\nsql-live: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
