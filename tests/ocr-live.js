/* Gameplan task 047 — prove the OCR runs on the device and uploads nothing.
 *
 * Not in the default suite: it needs the real CDN, and third-party uptime
 * must not gate CI. It loads the app's actual photo-import path, feeds it a
 * synthetic recipe-card image, lets the real Tesseract run, and records every
 * network request the page makes: method, host, and whether any request body
 * could be carrying the image. The verdict is printed as evidence.
 *
 * KT_OCR_NOISE=1 runs the task-085 variant instead: the photo is pure random
 * noise — the worst photograph possible — and the assertion flips. A terrible
 * photo must produce flags and empty-ish fields, never plausible-looking
 * fiction: no invented quantities, no imagined steps.
 */
const NOISE = process.env.KT_OCR_NOISE === '1';
const { chromium, devices } = require('playwright');
const B = process.env.KT_BASE || 'http://127.0.0.1:8899';

(async () => {
  const br = await chromium.launch(process.env.KT_CHROMIUM ? { executablePath: process.env.KT_CHROMIUM } : {});
  const ctx = await br.newContext({ ...devices['iPhone 13'] });
  /* Hermetic: the kitchen server is never poked from CI — the app's
     ready-list fetch on #add fails silently, exactly like offline. */
  await ctx.route('**/*.onrender.com/**', r => r.abort('failed'));

  /* Sandboxed environments route egress through a proxy the browser can't
     use. The CDN fetches are bridged: the request is observed exactly as the
     page made it (that observation is the whole point of this tool), then
     satisfied from node via curl, cached so the ~15 MB of wasm and language
     data downloads once. On an open network the bridge is a passthrough. */
  const { execFileSync } = require('child_process');
  const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
  const cacheDir = path.join(__dirname, 'shots', 'cdn-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const TYPES = { js: 'text/javascript', wasm: 'application/wasm', gz: 'application/gzip', json: 'application/json' };
  await ctx.route(/cdn\.jsdelivr\.net|tessdata\.projectnaptha\.com|unpkg\.com/, route => {
    const url = route.request().url();
    const key = crypto.createHash('sha1').update(url).digest('hex') +
      '.' + (url.split('?')[0].split('.').pop() || 'bin');
    const file = path.join(cacheDir, key);
    try {
      if (!fs.existsSync(file)) execFileSync('curl', ['-sSfL', '--max-time', '120', '-o', file, url]);
      route.fulfill({
        status: 200, body: fs.readFileSync(file),
        contentType: TYPES[file.split('.').pop()] || 'application/octet-stream'
      });
    } catch (e) {
      route.abort('failed');
    }
  });
  const p = await ctx.newPage();

  const requests = [];
  p.on('request', r => {
    const u = new URL(r.url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return;
    requests.push({
      method: r.method(),
      host: u.hostname,
      path: u.pathname.slice(0, 60),
      bodyBytes: r.postData() ? r.postData().length : 0
    });
  });

  await p.goto(B + '/index.html#add');
  await p.waitForSelector('.pathbtn');
  await p.click('[data-key="photo"]');
  await p.waitForSelector('#a-photo');

  /* A synthetic recipe card (white canvas, black text) — or, in the 085
     variant, pure noise: what a pocket photo of the inside of a bag reads. */
  await p.evaluate(async (noise) => {
    const c = document.createElement('canvas');
    c.width = 800; c.height = 500;
    const g = c.getContext('2d');
    if (noise) {
      const img = g.createImageData(800, 500);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.floor(Math.random() * 256);
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    } else {
      g.fillStyle = '#fff'; g.fillRect(0, 0, 800, 500);
      g.fillStyle = '#000'; g.font = 'bold 40px sans-serif';
      g.fillText('Test Scones', 40, 70);
      g.font = '28px sans-serif';
      g.fillText('Ingredients', 40, 140);
      g.fillText('2 cups flour', 60, 185);
      g.fillText('1 cup milk', 60, 225);
      g.fillText('Instructions', 40, 300);
      g.fillText('1. Mix everything.', 60, 345);
      g.fillText('2. Bake at 400 for 15 minutes.', 60, 385);
    }
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.9));
    const input = document.getElementById('a-photo');
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'card.jpg', { type: 'image/jpeg' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, NOISE);
  await p.waitForTimeout(400);

  /* Kick the OCR and wait for the review form or an error, up to 3 minutes —
     first run downloads the wasm core and language data. */
  await p.click('[data-act="add-ocr"]').catch(() => {});
  const outcome = await Promise.race([
    p.waitForSelector('#a-title', { timeout: 180000 }).then(() => 'review'),
    p.waitForSelector('.notice--bad', { timeout: 180000 }).then(() => 'error')
  ]).catch(() => 'timeout');

  const title = outcome === 'review' ? await p.inputValue('#a-title') : '';
  const errText = outcome === 'error' ? await p.locator('.notice--bad').textContent() : '';

  console.log('Outcome:', outcome, title ? '· title read: "' + title + '"' : '', errText.slice(0, 80));

  /* 085 — the noise verdict: flags, not fiction. */
  let noiseOk = true;
  if (NOISE && outcome === 'review') {
    const state = await p.evaluate(() => {
      const val = id => (document.getElementById(id) || {}).value || '';
      const list = prefix => [...document.querySelectorAll('[id^=' + prefix + ']')].map(e => e.value);
      const flags = [...document.querySelectorAll('.panel--flag li')].map(e => e.textContent);
      return { title: val('a-title'), ings: list('a-ing-'), steps: list('a-step-'), flags };
    });
    const realIngs = state.ings.filter(s => /\d+\s*(cup|tbsp|tsp|g|kg|ml|oz|lb)/i.test(s));
    const realSteps = state.steps.filter(s => /(preheat|bake|mix|stir|cook|whisk|simmer)/i.test(s));
    console.log('\n085 · noise import:', JSON.stringify({
      flags: state.flags.length, ings: state.ings.length, steps: state.steps.length,
      plausibleIngs: realIngs.length, plausibleSteps: realSteps.length
    }));
    noiseOk = state.flags.length >= 1 && realIngs.length === 0 && realSteps.length === 0;
    console.log(noiseOk
      ? '085 VERDICT: the unreadable photo produced flags and no plausible-looking fiction.'
      : '085 VERDICT: FICTION DETECTED — the parser invented content from noise. INVESTIGATE.');
  } else if (NOISE && outcome === 'error') {
    console.log('\n085 VERDICT: the unreadable photo was refused outright with a plain message — also a pass.');
  }
  console.log('\nExternal requests during the whole import:');
  const hosts = {};
  let uploads = 0;
  for (const r of requests) {
    hosts[r.host] = (hosts[r.host] || 0) + 1;
    if (r.method !== 'GET' || r.bodyBytes > 0) {
      uploads++;
      console.log('  NON-GET/BODY:', r.method, r.host + r.path, r.bodyBytes + 'B');
    }
  }
  for (const h of Object.keys(hosts)) console.log('  ' + h + ' × ' + hosts[h]);
  console.log(uploads === 0
    ? '\nVERDICT: every external request is a bodyless GET — the photo never leaves the device.'
    : '\nVERDICT: ' + uploads + ' request(s) carried a body — INVESTIGATE.');
  await br.close();
  process.exit(outcome === 'timeout' || uploads > 0 || !noiseOk ? 1 : 0);
})();
