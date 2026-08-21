const { chromium, devices } = require('playwright');
(async () => {
  const br = await chromium.launch({ executablePath: process.env.KT_CHROMIUM });
  const ctx = await br.newContext({ ...devices['iPhone 13'] });
  await ctx.route('**/*.onrender.com/**', r => r.abort('failed'));
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message)));
  const queries = ['(', '[', '\\', '*', '+?', '.*', 'a)b', '^$', '(?:', '[a-',
                   'chicken', 'crème', 'CHICKEN', '  bacon  ', '🙂'];
  for (const q of queries) {
    await p.goto('about:blank');
    await p.goto('http://127.0.0.1:8899/index.html');
    await p.waitForSelector('#main-search');
    const before = errs.length;
    await p.fill('#main-search', q);
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => ({
      results: document.querySelectorAll('.rcard, .searchhit, .cardgrid > *').length,
      body: (document.querySelector('#app').textContent || '').replace(/\s+/g,' ').slice(0,60)
    }));
    console.log(JSON.stringify(q).padEnd(12), 'results=' + String(r.results).padStart(3),
      errs.length > before ? ('*** THREW: ' + errs[errs.length-1].slice(0,60)) : '');
  }
  await br.close();
})();
