const { chromium, devices } = require('playwright');
(async () => {
  const br = await chromium.launch({ executablePath: process.env.KT_CHROMIUM });
  const ctx = await br.newContext({ ...devices['iPhone 13'] });
  await ctx.route('**/*.onrender.com/**', r => r.abort('failed'));
  const p = await ctx.newPage();
  for (const [q, why] of [
    ['saute', 'unaccented query -> accented data (the help\'s promise)'],
    ['sauté', 'accented query -> accented data'],
    ['puree', 'unaccented -> purée'],
    ['purée', 'accented -> purée'],
    ['creme', 'the help\'s literal example (no such word in the book)'],
    ['crannachan', 'a control that must work']
  ]) {
    await p.goto('about:blank');
    await p.goto('http://127.0.0.1:8899/index.html');
    await p.waitForSelector('#main-search');
    await p.fill('#main-search', q);
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const cards = [].slice.call(document.querySelectorAll('.cardgrid > *'));
      return cards.map(c => (c.textContent||'').replace(/\s+/g,' ').trim().slice(0,34)).slice(0,4);
    });
    console.log(q.padEnd(12), (r.length ? r.length + ' hits: ' + r.join(' | ') : 'NO HITS').slice(0,96), ' <- ' + why);
  }
  await br.close();
})();
