/* Gameplan task 012 — first contentful paint on a throttled connection.
 *
 * Emulates a fast-3G profile (1.6 Mb/s down, 150 ms RTT — the classic
 * "kitchen with bad signal") over CDP and fails if first contentful paint
 * blows the budget. The budget is deliberately loose: it exists to catch a
 * regression like an accidental megabyte of JS, not to grade CI hardware.
 *
 *   KT_FCP_BUDGET=4000 node tests/perf.js
 */
const { chromium, devices } = require('playwright');
const B = process.env.KT_BASE || 'http://127.0.0.1:8899';
const BUDGET = parseInt(process.env.KT_FCP_BUDGET || '4000', 10);

(async () => {
  const br = await chromium.launch(process.env.KT_CHROMIUM ? { executablePath: process.env.KT_CHROMIUM } : {});
  const ctx = await br.newContext({ ...devices['iPhone 13'] });

  /* Hermetic: third-party hosts are dropped so the number measures the bytes
     this repo ships, on every machine the same. Since 049 the fonts are
     self-hosted, so — unlike the Google Fonts era — the face is part of the
     measured payload, not an aborted third-party request. */
  await ctx.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net/,
    route => route.abort('failed'));

  /* Median of three runs — one throttled run is noise, not a number. */
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8
    });
    await page.goto(B + '/index.html', { waitUntil: 'load' });
    await page.waitForSelector('.main__title');
    const fcp = await page.evaluate(() => {
      const e = performance.getEntriesByType('paint')
        .find(x => x.name === 'first-contentful-paint');
      return e ? Math.round(e.startTime) : null;
    });
    runs.push(fcp);
    await page.close();
  }
  runs.sort((a, b) => a - b);
  const median = runs[1];

  console.log('FCP on fast-3G, three runs (ms):', runs.join(', '));
  console.log('Median: ' + median + ' ms   Budget: ' + BUDGET + ' ms');
  const fcpOk = median !== null && median <= BUDGET;
  if (!fcpOk) console.log('FAIL: first contentful paint over budget');

  /* Task 063 — the list must not reflow as photos decode. Every recipe gets
     a photo, then the Menu loads under a layout-shift observer. Boxes are
     fixed (64×64 attrs + CSS) so the score should be ~0; the gate is 0.02
     to allow browser noise, far under the 0.1 "good" threshold. */
  const p2 = await ctx.newPage();
  await p2.goto(B + '/index.html');
  await p2.waitForSelector('.main__title');
  await p2.evaluate(() => new Promise(res => {
    function photo(hue) {
      var c = document.createElement('canvas');
      c.width = 300; c.height = 200;
      var g = c.getContext('2d');
      g.fillStyle = 'hsl(' + hue + ',40%,45%)';
      g.fillRect(0, 0, 300, 200);
      return c.toDataURL('image/jpeg', 0.7);
    }
    var req = indexedDB.open('kt', 1);
    req.onupgradeneeded = function () { req.result.createObjectStore('images'); };
    req.onsuccess = function () {
      fetch('recipes.json').then(r => r.json()).then(list => {
        var tx = req.result.transaction('images', 'readwrite');
        list.forEach((r, i) => tx.objectStore('images').put(photo(i * 7), r.id));
        tx.oncomplete = () => res();
      });
    };
  }));
  /* The cache is filled at boot, so the seeded photos need a fresh boot. */
  await p2.goto(B + '/index.html#menu');
  await p2.reload();
  await p2.evaluate(() => {
    window.__cls = 0;
    new PerformanceObserver(l => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await p2.waitForSelector('.rcard__thumb');
  /* The claim under test is "the list does not reflow as photos decode" —
     zero the counter once the list exists, so the boot transition (loading
     text → app, a legitimate one-time swap) stays out of the score. */
  await p2.evaluate(() => { window.__cls = 0; });
  await p2.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p2.waitForTimeout(1500);
  const cls = await p2.evaluate(() => window.__cls);
  await p2.evaluate(() => new Promise(res => {
    const r = indexedDB.open('kt', 1);
    r.onsuccess = () => {
      const tx = r.result.transaction('images', 'readwrite');
      tx.objectStore('images').clear();
      tx.oncomplete = () => res();
    };
  }));
  console.log('CLS with 48 thumbnails, full scroll: ' + cls.toFixed(4) + '   Gate: 0.02');
  const clsOk = cls < 0.02;
  if (!clsOk) console.log('FAIL: the list reflows as photos decode');

  if (fcpOk && clsOk) console.log('PASS');
  await br.close();
  process.exit(fcpOk && clsOk ? 0 : 1);
})();
