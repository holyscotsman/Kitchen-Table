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
const { freshContext } = require('./ctx');
const B = process.env.KT_BASE || 'http://127.0.0.1:8899';
const BUDGET = parseInt(process.env.KT_FCP_BUDGET || '4000', 10);

(async () => {
  const br = await chromium.launch(process.env.KT_CHROMIUM ? { executablePath: process.env.KT_CHROMIUM } : {});
  const ctx = await freshContext(br, { ...devices['iPhone 13'] });

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

  /* R25 — a budget for the taps themselves. FCP says the book opens fast and
     CLS says it doesn't jump; neither says anything about what happens once
     someone is using it. Every state change here is a full re-render, which
     is the right architecture at 48 recipes and a wrong one at 4,800 — this
     is the tripwire between the two.
     Measured in-page (a Playwright click adds its own round trip to the
     number) under a 6x CPU throttle, standing in for a phone several years
     older than the machine running CI. As shipped: check-off 33 ms,
     servings 50 ms, filter chip 158 ms.

     What this gate is honestly worth. Of the filter chip's 158 ms, only
     ~30 ms is this app's JavaScript; the rest is the browser laying out and
     painting 48 cards, which no amount of tidying here would change. So the
     budgets catch an ARCHITECTURAL regression — a list that stops fitting in
     one re-render, a route that starts doing real work per tap — and not
     small waste: twelve full JSON round-trips of the whole book per render,
     added deliberately, moved the chip only to 206 ms. Budgets sit ~2.5x over
     measured, the same philosophy as the FCP gate: a tripwire, not a grade. */
  const TAPS = [
    ['ingredient check-off', '#chicken-cordon-bleu', '.checklist li', 120],
    ['servings +', '#chicken-cordon-bleu', '[data-act="serv+"]', 180],
    ['filter chip (48 cards re-render)', '#menu', '[data-act="fc"][data-key="Dinner"]', 450]
  ];
  let tapsOk = true;
  const pTap = await ctx.newPage();
  const tapCdp = await ctx.newCDPSession(pTap);
  await tapCdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  for (const [label, hash, sel, budget] of TAPS) {
    await pTap.goto(B + '/index.html' + hash);
    await pTap.waitForSelector('h1');
    if (hash === '#menu') {
      await pTap.click('[data-act="open-filter"]');
      await pTap.waitForSelector('#filter-sheet');
    }
    const times = await pTap.evaluate(async (s) => {
      const out = [];
      for (let i = 0; i < 5; i++) {
        const el = document.querySelectorAll(s)[i] || document.querySelector(s);
        if (!el) return null;
        const t = performance.now();
        el.click();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        out.push(Math.round(performance.now() - t));
      }
      return out;
    }, sel);
    if (!times) {
      console.log('FAIL: ' + label + ' — the control was not there to tap');
      tapsOk = false;
      continue;
    }
    times.sort((a, b) => a - b);
    const med = times[Math.floor(times.length / 2)];
    console.log(label + ': ' + med + ' ms median of ' + times.join('/') +
      '   Budget: ' + budget + ' ms');
    if (med > budget) {
      console.log('FAIL: ' + label + ' is over its budget');
      tapsOk = false;
    }
  }
  await pTap.close();

  /* R46 — 089 ruled the Menu deliberately unvirtualised at 48 recipes, and
     said to revisit at about 150. A ruling with a trigger nobody watches is a
     ruling that expires quietly: this is the watcher. A synthetic book four
     times the real one renders the Menu and takes a filter tap; over budget
     means the collection has outgrown the decision, and the failure hands
     over the number rather than an opinion. It is not a regression in the
     code — it is a message to whoever is reading it years from now. */
  let growthOk = true;
  {
    const pBig = await ctx.newPage();
    const bigCdp = await ctx.newCDPSession(pBig);
    await bigCdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await pBig.goto(B + '/index.html');
    const seeded = await pBig.evaluate(async () => {
      const base = await (await fetch('recipes.json')).json();
      const out = [];
      for (let copy = 0; copy < 5; copy++) {
        base.forEach((r, i) => {
          const c = JSON.parse(JSON.stringify(r));
          c.id = r.id + (copy ? '-' + copy : '');
          c.title = r.title + (copy ? ' ' + (copy + 1) : '');
          out.push(c);
        });
      }
      localStorage.setItem('kt.recipes', JSON.stringify(out));
      return out.length;
    });
    await pBig.goto(B + '/index.html#menu');
    await pBig.reload();
    await pBig.waitForSelector('.rcard');
    const shown = await pBig.locator('.rcard').count();
    await pBig.click('[data-act="open-filter"]');
    await pBig.waitForSelector('#filter-sheet');
    const times = await pBig.evaluate(async () => {
      const out = [];
      for (let i = 0; i < 5; i++) {
        const el = document.querySelector('[data-act="fc"][data-key="Dinner"]');
        const t = performance.now();
        el.click();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        out.push(Math.round(performance.now() - t));
      }
      return out;
    });
    times.sort((a, b) => a - b);
    const med = times[Math.floor(times.length / 2)];
    /* Loose on purpose. The number is printed every run whatever happens, so
       anyone reading a CI log can see the trend; the gate exists to fire when
       the collection has genuinely outgrown one re-render, not to measure the
       runner. A tripwire that cries wolf teaches people to step over it. */
    const BIG_BUDGET = 1500;
    console.log('Menu with ' + shown + ' recipes, filter tap: ' + med +
      ' ms median of ' + times.join('/') + '   Budget: ' + BIG_BUDGET + ' ms');
    if (shown !== seeded) {
      console.log('FAIL: the big book did not render (' + shown + ' of ' + seeded + ')');
      growthOk = false;
    } else if (med > BIG_BUDGET) {
      console.log('FAIL: at ' + shown + ' recipes the Menu is past what one ' +
        're-render can carry. Task 089 ruled it unvirtualised at 48 and said ' +
        'to revisit near 150 — this is that moment, with the number in hand.');
      growthOk = false;
    }
    await pBig.evaluate(() => localStorage.removeItem('kt.recipes'));
    await pBig.close();
  }

  const ok = fcpOk && clsOk && tapsOk && growthOk;
  if (ok) console.log('PASS');
  await br.close();
  process.exit(ok ? 0 : 1);
})();
