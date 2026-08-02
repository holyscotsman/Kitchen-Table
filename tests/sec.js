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
