/* Gameplan tasks 045 + 046 — untrusted content stays text, and stays small.
 *
 * Imported pages and OCR output flow into storage and back onto every screen.
 * This suite imports a page that is actively hostile — script tags, onerror
 * handlers, a title that is an XSS payload — and asserts it renders as inert
 * text in the review form, the recipe page, the menu card, and the edit
 * field. Then it feeds a page with absurdly long fields and asserts the caps
 * hold and say so.
 */
const { chromium, devices } = require('playwright');
const B = process.env.KT_BASE || 'http://127.0.0.1:8899';
let pass=0, fail=0;
const chk=(n,c,e='')=>c?(pass++,console.log('  PASS '+n)):(fail++,console.log('  FAIL '+n+(e?' :: '+e:'')));

const XSS_TITLE = '<img src=x onerror="window.__pwned=1"> Cake';
const XSS_ING = '2 cups <script>window.__pwned2=1</script> flour';
const XSS_STEP = 'Bake it <svg onload="window.__pwned3=1"> well.';

const hostile = JSON.stringify({
  '@context': 'https://schema.org', '@type': 'Recipe',
  name: XSS_TITLE,
  recipeYield: '4',
  recipeCategory: 'Dessert',
  recipeIngredient: [XSS_ING],
  recipeInstructions: [{ '@type': 'HowToStep', text: XSS_STEP }]
});

(async () => {
  const br = await chromium.launch(process.env.KT_CHROMIUM ? { executablePath: process.env.KT_CHROMIUM } : {});
  const ctx = await br.newContext({ ...devices['iPhone 13'] });
  /* Hermetic: the kitchen server is never poked from CI — the app's
     ready-list fetch on #add fails silently, exactly like offline. */
  await ctx.route('**/*.onrender.com/**', r => r.abort('failed'));
  for (const host of ['**/corsproxy.io/**','**/r.jina.ai/**','https://example.com/**'])
    await ctx.route(host, route => route.abort('failed'));
  /* Real pages escape closing tags inside JSON-LD as <\/ so the script
     element survives — the parsed value still contains a literal </script>. */
  const embed = json => '<html><head><script type="application/ld+json">' +
    json.replace(/<\//g, '<\\/') + '<\/script></head><body></body></html>';
  await ctx.route('**/api.allorigins.win/**', route => route.fulfill({
    status: 200, contentType: 'text/html', body: embed(hostile)
  }));
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  let dialogs = 0; p.on('dialog', d => { dialogs++; d.accept(); });

  console.log('\n== A hostile page is imported ==');
  await p.goto(B + '/index.html#add');
  await p.waitForSelector('.pathbtn');
  await p.click('[data-key="link"]');
  await p.fill('#a-url', 'https://example.com/cake');
  await p.click('[data-act="add-fetch"]');
  await p.waitForSelector('#a-title', { timeout: 15000 });

  const pwned = () => p.evaluate(() => [window.__pwned, window.__pwned2, window.__pwned3]);
  chk('review form holds the payload as text', (await p.inputValue('#a-title')).includes('onerror'), await p.inputValue('#a-title'));
  chk('nothing executed on review', (await pwned()).every(v => v === undefined));

  await p.click('[data-act="add-save"]');
  await p.waitForTimeout(600);

  console.log('\n== And is inert on every surface ==');
  chk('recipe page shows the title as text', (await p.locator('.r-title').textContent()).includes('<img'), (await p.locator('.r-title').textContent()).slice(0,40));
  chk('ingredient line shows script tag as text', (await p.locator('.checklist').first().textContent()).includes('<script>'));
  chk('step shows svg payload as text', (await p.locator('.checklist--steps').textContent()).includes('<svg'));
  chk('nothing executed on the recipe page', (await pwned()).every(v => v === undefined));

  await p.goto(B + '/index.html#menu');
  await p.waitForSelector('.rcard');
  const card = await p.locator('.rcard', { hasText: 'onerror' }).first().textContent();
  chk('menu card shows the payload as text', card.includes('<img'), card.slice(0, 40));
  chk('nothing executed on the menu', (await pwned()).every(v => v === undefined));

  const cakeHref = await p.locator('.rcard', { hasText: 'onerror' }).first().getAttribute('href');
  await p.goto(B + '/index.html' + cakeHref);
  await p.waitForSelector('.r-title');
  await p.click('[data-act="toggle-edit"]');
  await p.waitForTimeout(400);
  chk('edit field holds the payload as its value', (await p.inputValue('#e-title')).includes('onerror'));
  chk('nothing executed in edit mode', (await pwned()).every(v => v === undefined));
  chk('no dialogs popped', dialogs === 0);
  chk('no uncaught page errors', errs.length === 0, errs.join(' | '));

  console.log('\n== Oversized fields are capped (task 046) ==');
  await p.evaluate(() => { localStorage.removeItem('kt.recipes'); });
  const huge = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Recipe',
    name: 'Big ' + 'x'.repeat(9000),
    description: 'y'.repeat(60000),
    recipeYield: '4',
    recipeIngredient: Array.from({ length: 300 }, (_, i) => i + ' cup ' + 'z'.repeat(3000)),
    recipeInstructions: [{ '@type': 'HowToStep', text: 'w'.repeat(50000) }]
  });
  await ctx.route('**/api.allorigins.win/**', route => route.fulfill({
    status: 200, contentType: 'text/html', body: embed(huge)
  }));
  await p.goto(B + '/index.html#add');
  await p.waitForSelector('.pathbtn');
  await p.click('[data-key="link"]');
  await p.fill('#a-url', 'https://example.com/huge');
  await p.click('[data-act="add-fetch"]');
  await p.waitForSelector('#a-title', { timeout: 15000 });

  chk('title capped', (await p.inputValue('#a-title')).length <= 300, String((await p.inputValue('#a-title')).length));
  const ingCount = await p.locator('[data-k="ingredients"][data-act="adl"]').count();
  chk('ingredient list capped', ingCount <= 100, String(ingCount));
  const firstIng = await p.locator('[data-k="ingredients"][data-act="adl"]').first().inputValue();
  chk('ingredient line capped', firstIng.length <= 500, String(firstIng.length));
  chk('truncation is disclosed in flagged', (await p.locator('.panel--flag').textContent()).toLowerCase().includes('trimmed'));

  console.log('\n== Hostile data on the surfaces the sweep never reached (R21) ==');
  {
    /* The block above proves the import path is inert on the title, the
       ingredients and the steps. It never touched the fields an importer can
       also fill — tags, contributor, notes, the times, the flags, the id
       itself — and it never opened the Week planner at all. This puts a
       payload in every one of them and walks every screen. */
    const pX = await ctx.newPage();
    let xDialogs = 0; pX.on('dialog', d => { xDialogs++; d.accept(); });
    const xErrs = []; pX.on('pageerror', e => xErrs.push(e.message));
    await pX.goto(B + '/index.html');
    await pX.evaluate(() => {
      const boom = (n) => '<img src=x onerror="window.__x' + n + '=1">';
      const id = 'evil" onmouseover="window.__xid=1';
      localStorage.setItem('kt.recipes', JSON.stringify([{
        id: id,
        title: 'Evil Cake ' + boom('title'),
        category: boom('cat'),
        contributor: boom('who'),
        servings: 4,
        prepTime: boom('prep'), cookTime: boom('cook'),
        ingredients: ['1 cup ' + boom('ing')],
        steps: ['Stir ' + boom('step')],
        notes: boom('notes'),
        tags: [boom('tag'), '"><script>window.__xtag2=1<\/script>'],
        flagged: ['Servings — ' + boom('flag')],
        source: 'javascript:window.__xsrc=1',
        image: 'javascript:window.__ximg=1'
      }]));
      /* And the planner, whose entries carry their own copies. */
      const today = (function () {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
          '-' + String(d.getDate()).padStart(2, '0');
      })();
      localStorage.setItem('kt.plan', JSON.stringify([
        { id: 'p1', date: today, slot: 'dinner', recipeId: id,
          titleThen: 'Evil Cake', servings: '4' + boom('serv') },
        { id: 'p2' + boom('pid'), date: today, slot: 'lunch',
          recipeId: 'gone-' + boom('gone'), titleThen: 'Gone ' + boom('then'),
          servings: 2 }
      ]));
    });
    /* The seeding only counts if the app BOOTS with it: a goto that changes
       nothing but the hash is a same-document navigation, and the overlay is
       read once, at boot. Without this reload every check below passes
       against the shipped book and proves nothing. */
    await pX.reload();
    await pX.waitForSelector('.main__title');
    const fired = () => pX.evaluate(() =>
      Object.keys(window).filter(k => k.indexOf('__x') === 0));
    /* Executed is not the only failure. The CSP refuses inline handlers, so a
       payload can be built into the DOM as a real element and still never
       run — defence in depth working, and a hole all the same. Count the
       elements, not just the handlers that fired. */
    const injected = () => pX.evaluate(() =>
      document.querySelectorAll('#app img[src="x"], #app script').length);
    for (const [name, hash, sel] of [['Main', '#', '.main__title'],
      ['Menu', '#menu', '.rcard'], ['Recipe', '#' + 'evil" onmouseover="window.__xid=1', '.r-title'],
      ['Week planner', '#plan', '.dayblock']]) {
      await pX.goto(B + '/index.html' + hash);
      await pX.waitForSelector(sel, { timeout: 10000 });
      await pX.waitForTimeout(250);
      chk(name + ': nothing hostile ran', (await fired()).length === 0,
        (await fired()).join(', '));
      chk(name + ': and nothing hostile was even built',
        (await injected()) === 0, String(await injected()));
    }
    /* The payloads must be VISIBLE as text — inert is not the same as
       swallowed, and a family reading an imported recipe needs to see what
       actually came in. */
    await pX.goto(B + '/index.html#' + encodeURIComponent('evil" onmouseover="window.__xid=1'));
    await pX.waitForSelector('.r-title');
    chk('the tag is shown as text, not as markup',
      (await pX.locator('.r-tags').textContent()).includes('<img'));
    chk('the notes are shown as text',
      (await pX.locator('#main-content').textContent()).includes('onerror'));
    /* The meal sheet carries its own copy of the servings number, and is only
       reachable by opening a planned meal. */
    await pX.goto(B + '/index.html#plan');
    await pX.waitForSelector('.dayblock');
    await pX.click('.mealcard');
    await pX.waitForSelector('#meal-sheet, .sheet', { timeout: 8000 });
    chk('the meal sheet builds nothing hostile either',
      (await injected()) === 0 && (await fired()).length === 0,
      String(await injected()));
    chk('no dialogs anywhere in the sweep', xDialogs === 0);
    chk('and no screen threw', xErrs.length === 0, xErrs.join(' | '));
    await pX.evaluate(() => { localStorage.removeItem('kt.recipes');
      localStorage.removeItem('kt.plan'); });
    await pX.close();
  }

  console.log('\n== The one screen that renders someone else’s server (R54) ==');
  {
    /* Every hostile-data check above seeds localStorage — data this device
       wrote, however it got here. The Add screen is different: its waiting
       list and its failed-import rows are drawn from JSON the kitchen server
       sends, and no suite had ever handed that server a hostile answer. The
       CSP blocks inline handlers, so this is not a script-execution story;
       it is a "the server can write markup into the family's phone" story,
       which on a screen someone is reading is enough. */
    const API = 'https://kt-hostile.test';
    /* The slash is deliberate: this id has to be wrong in both ways at once
       — markup when it is drawn, a second path segment when it is fetched. */
    const BOOM = (n) => 'j' + n + '/x"><img src=x onerror="window.__k' + n + '=1">';
    const ctxK = await br.newContext({ ...devices['iPhone 13'] });
    const now = new Date().toISOString();
    const asked = [];
    await ctxK.route(API + '/**', (route) => {
      const req = route.request();
      const u = new URL(req.url());
      asked.push(req.method() + ' ' + u.pathname);
      const json = (body) => route.fulfill({
        status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(body)
      });
      /* A submission is answered with an id that is itself a path. */
      if (req.method() === 'POST' && u.pathname === '/api/import/video') {
        return json({ job_id: 'a/b' });
      }
      if (u.pathname.indexOf('/api/import/jobs/') === 0) {
        return json({ id: 'a/b', status: 'queued', eta_seconds: 60, overrun: false });
      }
      const failed = u.searchParams.get('status') === 'failed';
      return json({ jobs: failed
        ? [{ id: BOOM(2), url: 'https://e.test/v', platform: 'youtube',
             error_message: 'It did not work.', created_at: now }]
        : [{ id: BOOM(1), title: 'Hostile Server Soup', platform: 'youtube',
             created_at: now }] });
    });
    const pK = await ctxK.newPage();
    const kErrs = []; pK.on('pageerror', e => kErrs.push(e.message));
    let kDialogs = 0; pK.on('dialog', d => { kDialogs++; d.accept(); });
    await pK.addInitScript((api) =>
      localStorage.setItem('kt.importApi', JSON.stringify(api)), API);
    await pK.goto(B + '/index.html#add');
    await pK.waitForSelector('.pathbtn');
    await pK.waitForSelector('.vready', { timeout: 10000 });

    /* The floor first: if the lists never drew, everything below is vacuous. */
    chk('the waiting list and the failed row both drew',
      await pK.locator('.vready .pathbtn').count() === 1 &&
      await pK.locator('.vfailed__row').count() === 1,
      (await pK.locator('.vready .pathbtn').count()) + '/' +
      (await pK.locator('.vfailed__row').count()));
    const kFired = () => pK.evaluate(() =>
      Object.keys(window).filter(k => k.indexOf('__k') === 0));
    const kBuilt = () => pK.evaluate(() =>
      document.querySelectorAll('#app img[src="x"], #app script').length);
    chk('nothing the server sent ran', (await kFired()).length === 0,
      (await kFired()).join(', '));
    chk('and nothing the server sent was even built into the page',
      (await kBuilt()) === 0, String(await kBuilt()));
    /* Inert is not the same as swallowed — the reader still has to be able
       to see what the server called this thing. */
    chk('the draft is still offered by name',
      (await pK.locator('.vready').textContent()).includes('Hostile Server Soup'));
    chk('and the failed import still says what happened',
      (await pK.locator('.vfailed').textContent()).includes('It did not work.'));
    chk('no dialogs', kDialogs === 0);
    chk('the Add screen did not throw', kErrs.length === 0, kErrs.join(' | '));

    /* An id does not only get drawn — it rides into the URL of the next
       request, where a slash in it would address a DIFFERENT endpoint on
       that server: the app quietly doing the wrong thing rather than
       failing, which is the failure this book least wants.
       Two ways in, and they are guarded differently. Ids read back off the
       page go through parseInt, so a hostile one arrives as a number or as
       NaN — that has always been true and is worth pinning. */
    const onePath = (list) => list.length >= 1 &&
      list.every(x => /^(GET|POST) \/api\/import\/jobs\/[^/]+$/.test(x));
    asked.length = 0;
    await pK.locator('.vready .pathbtn').first().click();
    await pK.waitForTimeout(600);
    chk('opening a listed draft asks for exactly one job',
      onePath(asked.filter(x => x.indexOf(' /api/import/jobs/') > -1)),
      JSON.stringify(asked));

    /* The other way in has no parseInt anywhere near it: the id handed back
       by a submission is polled straight from the server's own answer. */
    asked.length = 0;
    await pK.goto(B + '/index.html#add');
    await pK.evaluate(() => sessionStorage.clear());
    await pK.reload();
    await pK.waitForSelector('.pathbtn[data-key="video"]');
    await pK.click('.pathbtn[data-key="video"]');
    await pK.waitForSelector('#a-vurl');
    await pK.fill('#a-vurl', 'https://youtu.be/hostile');
    await pK.click('[data-act="video-submit"]');
    /* The poll runs on a 3.5s tick, so one full turn plus a margin. */
    await pK.waitForTimeout(5000);
    const polls = asked.filter(x => x.indexOf('GET /api/import/jobs/') === 0);
    chk('and the id a submission hands back is polled as one job, whatever it holds',
      onePath(polls), JSON.stringify(asked));
    await ctxK.close();
  }

  console.log('\n== Every attribute the app writes is escaped (R54) ==');
  {
    /* The rule behind the case. app.js builds its HTML by concatenation, so
       an attribute is one missing esc() away from being an element. Every
       `="' + X +` in the file must pass X through esc(), unless X is on the
       named list below — booleans, loop indices, and strings this app itself
       composes, each one checked by hand when it was added here. A new
       expression is not assumed safe: it fails until someone looks at it. */
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'app.js'), 'utf8');
    const SAFE = new Set([
      'i',                                  // loop index
      'on', 'done', 'S.searchOpen', 'S.sortOpen', 'S.needsLook',
      'S.easyRead', 'S.editing', 'S.awake', 'S.listOpen',   // booleans
      '(w || 22)', '(h || 22)',             // svg sizes, numbers
      'id', 'act', 'cls', 's.key',          // literals passed by the caller
      'iso',                                // YYYY-MM-DD, built here
      'menuHash()',                         // built here, values encodeURIComponent'd
      'trigger.getAttribute("data-act")'    // a selector, never innerHTML
    ]);
    const found = [...src.matchAll(/="'\s*\+\s*([^+]{1,60}?)\s*\+/g)]
      .map(m => m[1].trim());
    const raw = [...new Set(found.filter(x => !x.startsWith('esc(') && !SAFE.has(x)))];
    chk('no attribute is written without esc() or a named exemption',
      raw.length === 0, raw.join(' | '));
    /* And the floor, so a changed quoting style cannot empty this check. */
    chk('and the scan actually found the attributes', found.length > 40,
      String(found.length));
  }

  console.log('\n== What the workflows are allowed to do (R38) ==');
  {
    /* A workflow that runs the repository's own code with a write-capable
       token is the ordinary shape of a supply-chain problem: `checks` runs on
       every pull request, installs npm dependencies and drives a browser, and
       inherited whatever the repository's default token permissions happen to
       be. Nothing it does needs write. Stated per workflow, because a default
       that is safe today can be changed in a settings page by someone who has
       never read this file. */
    const fsw = require('fs');
    const pw = require('path');
    const dir = pw.join(__dirname, '..', '.github', 'workflows');
    const files = fsw.readdirSync(dir).filter(f => /\.ya?ml$/.test(f));
    chk('there are workflows to check', files.length >= 3, files.join(', '));
    const noPerms = [], writers = [];
    for (const f of files) {
      const src = fsw.readFileSync(pw.join(dir, f), 'utf8');
      const block = (src.match(/^permissions:\n((?:[ \t]+.*\n)+)/m) || [])[1];
      if (!block) { noPerms.push(f); continue; }
      /* Only db-sync commits, and only contents. Anything else claiming a
         write scope is a question, not a default. */
      const scopes = block.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of scopes) {
        if (/:\s*write\b/.test(line) && f !== 'db-sync.yml' &&
            !/security-events/.test(line)) writers.push(f + ': ' + line);
      }
    }
    chk('every workflow says what it is allowed to do', noPerms.length === 0,
      noPerms.join(', '));
    chk('and only the one that commits may write',
      writers.length === 0, writers.join(' | '));
    /* The checkout credential outlives the step that fetched the code — with
       a read-only token that is bounded, but CI has no reason to keep it. */
    const ci = fsw.readFileSync(pw.join(dir, 'ci.yml'), 'utf8');
    chk('CI does not leave a git credential lying about for later steps',
      /persist-credentials:\s*false/.test(ci));
    chk('and CI itself is read-only',
      /^permissions:\n\s+contents:\s+read\s*$/m.test(ci), 'see ci.yml');
  }

  /* 052 — the CSP must exist and keep its load-bearing lines. The exact
     policy lives in index.html; this guards against it being weakened or
     dropped in a refactor, not against every possible retune. */
  console.log('\n== Content-Security-Policy ==');
  const pCsp = await ctx.newPage();
  await pCsp.goto(B + '/index.html');
  const csp = await pCsp.evaluate(() => {
    const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return m ? m.getAttribute('content') : '';
  });
  chk('CSP meta present', csp.length > 0);
  chk('CSP: default-src self', /default-src 'self'/.test(csp));
  chk('CSP: no unsafe-inline scripts (hash only)', /script-src [^;]*'sha256-/.test(csp) && !/script-src [^;]*'unsafe-inline'/.test(csp));
  chk('CSP: wasm allowed for OCR', /'wasm-unsafe-eval'/.test(csp));
  chk('CSP: objects blocked', /object-src 'none'/.test(csp));
  chk('CSP: fonts self only', /font-src 'self'(;|$)/.test(csp));
  /* And the page must actually boot under it — a wrong hash would strand the
     pre-paint script and log a violation. */
  const viol = [];
  const pBoot = await ctx.newPage();
  pBoot.on('console', m => { if (/Refused/i.test(m.text())) viol.push(m.text()); });
  await pBoot.goto(B + '/index.html');
  await pBoot.waitForSelector('.main__title');
  chk('no CSP violations booting the app', viol.length === 0, viol[0] || '');

  await br.close();
  console.log('\n' + '='.repeat(50) + '\nPASS: ' + pass + '   FAIL: ' + fail + '\n' + '='.repeat(50));
  process.exit(fail ? 1 : 0);
})();
