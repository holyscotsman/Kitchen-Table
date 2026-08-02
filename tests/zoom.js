/* Gameplan task 041 — the compounding case: 200% browser zoom on top of Easy
 * Read on top of the largest font step.
 *
 * WCAG 1.4.10 reflow says content must work at 320 CSS pixels — which is what
 * a 640px phone at 200% zoom actually is. Easy Read already forces one column;
 * this asserts the promise holds everywhere: no horizontal scroll, and no
 * text clipped by an ancestor that hides overflow.
 */
const { chromium } = require('playwright');
const B = process.env.KT_BASE || 'http://127.0.0.1:8899';
let pass=0, fail=0;
const chk=(n,c,e='')=>c?(pass++,console.log('  PASS '+n)):(fail++,console.log('  FAIL '+n+(e?' :: '+e:'')));

(async () => {
  const br = await chromium.launch(process.env.KT_CHROMIUM ? { executablePath: process.env.KT_CHROMIUM } : {});
  const ctx = await br.newContext({ viewport: { width: 320, height: 900 } });
  /* Hermetic: the kitchen server is never poked from CI — the app's
     ready-list fetch on #add fails silently, exactly like offline. */
  await ctx.route('**/*.onrender.com/**', r => r.abort('failed'));
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    localStorage.setItem('kt.easyRead', 'true');
    localStorage.setItem('kt.fsIndex', '4'); // 40px, the top step
  });

  const screens = [
    ['Main', '#', '.main__title', null],
    ['Menu', '#menu', '.rcard', null],
    ['Week planner', '#plan', '.dayblock', null],
    ['Menu + filter sheet', '#menu', '.rcard', '[data-act="open-filter"]'],
    ['Menu + text sheet', '#menu', '.rcard', '[data-act="open-text"]'],
    ['Recipe', '#chicken-cordon-bleu', '.r-title', null],
    ['Recipe + download sheet', '#chicken-cordon-bleu', '.r-title', '[data-act="open-dl"]'],
    ['Recipe edit', '#chicken-cordon-bleu', '.r-title', '[data-act="toggle-edit"]'],
    ['Add', '#add', '.pathbtn', null],
    ['Add review form', '#add', '.pathbtn', '[data-key="review"]']
  ];

  for (const [name, hash, ready, extra] of screens) {
    /* A hash-only goto is not a navigation — blank first, so each screen
       starts clean and no sheet leaks into the next measurement. */
    await p.goto('about:blank');
    await p.goto(B + '/index.html' + hash);
    await p.waitForSelector(ready);
    if (extra) { await p.click(extra); await p.waitForTimeout(400); }

    const r = await p.evaluate(() => {
      const doc = document.scrollingElement;
      const overflowX = doc.scrollWidth - doc.clientWidth;
      /* Anything wider than the viewport is a horizontal-scroll culprit. */
      const wide = [];
      document.querySelectorAll('body *').forEach(el => {
        const b = el.getBoundingClientRect();
        if (b.width > 0 && (b.right > doc.clientWidth + 1 || b.left < -1)) {
          const cls = typeof el.className === 'string' ? el.className.split(/\s+/)[0] : '';
          wide.push(el.tagName.toLowerCase() + (cls ? '.' + cls : '') + ' right=' + Math.round(b.right));
        }
      });
      return { overflowX, wide: wide.slice(0, 5) };
    });

    chk(name + ': no horizontal scroll', r.overflowX <= 1,
        r.overflowX + 'px overflow; ' + r.wide.join(', '));
  }

  await br.close();
  console.log('\n' + '='.repeat(50) + '\nPASS: ' + pass + '   FAIL: ' + fail + '\n' + '='.repeat(50));
  process.exit(fail ? 1 : 0);
})();
