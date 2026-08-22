/* Loop R112 — is the book that is actually deployed a healthy book?
 *
 * Every other suite runs against a local copy served from the repo root.
 * That is the right way to test the code, and it cannot see the things only
 * a deploy has: GitHub Pages serves the site from a SUBPATH
 * (/Kitchen-Table/, not /), with its own headers, its own MIME types and a
 * service worker that was installed by whatever was published last.
 *
 * Not in the default suite. CI must not be gated on a third party's uptime,
 * and this asks a real host a real question. Run it after a deploy:
 *
 *     node tests/live.js                    the published book
 *     KT_LIVE=http://127.0.0.1:8899/ node tests/live.js     a local copy
 *
 * Sandboxed environments route egress through a proxy the browser cannot
 * use — `tests/ocr-live.js` hit this first and solved it, and this borrows
 * its answer: every request the page makes is satisfied from node via curl,
 * which can reach the network. The page is still driven exactly as a phone
 * would drive it; only the transport is bridged.
 */
const { chromium, devices } = require('playwright');
const { execFileSync } = require('child_process');
const LIVE = (process.env.KT_LIVE || 'https://holyscotsman.github.io/Kitchen-Table/').replace(/\/?$/, '/');

let pass = 0, fail = 0;
const chk = (n, c, e = '') => c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (e ? ' :: ' + e : '')));

const TYPES = { html:'text/html', js:'text/javascript', css:'text/css', json:'application/json',
  svg:'image/svg+xml', woff2:'font/woff2', png:'image/png', jpg:'image/jpeg',
  webmanifest:'application/manifest+json', ico:'image/x-icon' };

(async () => {
  console.log('\nKitchen Table — the deployed book: ' + LIVE);
  const origin = new URL(LIVE).origin;

  const br = await chromium.launch(process.env.KT_CHROMIUM ? { executablePath: process.env.KT_CHROMIUM } : {});
  const ctx = await br.newContext({ ...devices['iPhone 13'] });
  const fetched = [], missed = [];
  await ctx.route(u => u.origin === origin, route => {
    const url = route.request().url();
    try {
      /* -i so the status line comes back with the body: a 404 fulfilled as
         a 200 would let a missing file read as a healthy one.

         Header blocks come in PLURAL, and getting that wrong is silent: a
         CONNECT proxy answers "HTTP/1.1 200 Connection Established" before
         the origin says anything, and every redirect adds another block.
         Splitting on the first blank line then hands the page a file whose
         first line is `HTTP/2 200` — app.js becomes a syntax error and the
         screen simply never renders. Consume blocks until what is left
         stops looking like a response, and the last one read is the real
         one. (A local run has exactly one block, which is why this only
         showed up against the real host.) */
      const raw = execFileSync('curl', ['-sSL', '-i', '--max-time', '60', url],
        { maxBuffer: 64 * 1024 * 1024 });
      let rest = raw, head = '';
      while (rest.slice(0, 5).toString() === 'HTTP/') {
        const i = rest.indexOf('\r\n\r\n');
        if (i === -1) break;
        head = rest.slice(0, i).toString();
        rest = rest.slice(i + 4);
      }
      const body = rest;
      const status = parseInt((head.split('\n')[0].match(/\s(\d{3})\s/) || [])[1], 10) || 200;
      const ext = (url.split('?')[0].split('/').pop() || '').split('.').pop();
      fetched.push({ url: url.slice(origin.length), status, bytes: body.length });
      if (status >= 400) missed.push(url.slice(origin.length) + ' -> ' + status);
      route.fulfill({ status, body, contentType: TYPES[ext] || 'text/html; charset=utf-8' });
    } catch (e) {
      missed.push(url.slice(origin.length) + ' -> ' + String(e.message).split('\n')[0].slice(0, 40));
      route.abort('failed');
    }
  });

  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message)));
  const consoleErrs = [];
  p.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 140)); });

  console.log('\n== It is there, and it is the book ==');
  await p.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.main__title', { timeout: 30000 });
  chk('the front page renders its title',
    /kitchen table/i.test(await p.locator('.main__title').textContent()));
  chk('and the one-line explanation under it',
    (await p.evaluate(() => (document.querySelector('#app') || {}).innerText || '')).length > 80);
  chk('Atkinson Hyperlegible is the face in use',
    /atkinson/i.test(await p.evaluate(() => getComputedStyle(document.body).fontFamily)),
    await p.evaluate(() => getComputedStyle(document.body).fontFamily));
  chk('and it is served from the deploy, not a fallback',
    fetched.some(f => /atkinson-400\.woff2$/.test(f.url) && f.status === 200 && f.bytes > 1000),
    JSON.stringify(fetched.filter(f => /woff2/.test(f.url)).slice(0, 3)));

  console.log('\n== The whole book opens ==');
  const bookCount = JSON.parse(execFileSync('curl',
    ['-sSL', '--max-time', '60', LIVE + 'recipes.json'], { maxBuffer: 32 * 1024 * 1024 })).length;
  await p.goto(LIVE + '#menu', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.rcard', { timeout: 30000 });
  const shown = await p.locator('.rcard').count();
  chk('every recipe in the published file is on the Menu',
    shown === bookCount, shown + ' shown, ' + bookCount + ' in recipes.json');
  await p.click('.rcard');
  await p.waitForSelector('.r-title', { timeout: 20000 });
  chk('a recipe opens', (await p.locator('.r-title').textContent()).trim().length > 2);
  chk('with its ingredients', await p.locator('.bodygrid__ing li').count() > 0);
  chk('and its method', await p.locator('.checklist--steps li, .bodygrid__steps li').count() > 0);

  console.log('\n== It still works, not just renders ==');
  const serves = () => p.evaluate(() => (document.querySelector('.servcard__value') || {}).textContent || '');
  const before = await serves();
  await p.evaluate(() => document.querySelector('[data-act="serv+"]').click());
  await p.waitForTimeout(500);
  chk('the servings stepper moves', (await serves()).trim() !== before.trim(),
    before.trim() + ' -> ' + (await serves()).trim());
  await p.evaluate(() => document.querySelectorAll('.bodygrid__ing .checkrow')[0].click());
  await p.waitForTimeout(300);
  chk('an ingredient ticks off',
    await p.evaluate(() => document.querySelectorAll('.bodygrid__ing [aria-pressed="true"]').length) === 1);

  console.log('\n== Nothing is broken underneath ==');
  chk('the deploy carries a version stamp',
    /v\d+\.\d+/.test(await p.evaluate(() => document.body.innerText)),
    (await p.evaluate(() => (document.body.innerText.match(/v\d+\.\d+/) || ['none'])[0])));
  chk('no file the page asked for was missing', missed.length === 0, missed.join(' | '));
  chk('nothing threw', errs.length === 0, errs.join(' | '));
  chk('and the console is clean', consoleErrs.length === 0, consoleErrs.join(' | '));

  console.log('\n  (' + fetched.length + ' files fetched from the deploy; ' +
    fetched.filter(f => f.status === 200).length + ' answered 200)');
  await br.close();
  console.log('\n' + '='.repeat(50) + '\nPASS: ' + pass + '   FAIL: ' + fail + '\n' + '='.repeat(50));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('LIVE CHECK CRASHED:', e); process.exit(1); });
