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
     this repo ships, on every machine the same. The Google Fonts stylesheet is
     render-blocking in real life — that cost is task 049's evidence, not this
     budget's noise. Atkinson falls back to the system font for the run. */
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
  if (median === null || median > BUDGET) {
    console.log('FAIL: first contentful paint over budget');
    process.exit(1);
  }
  console.log('PASS');
  await br.close();
  process.exit(0);
})();
