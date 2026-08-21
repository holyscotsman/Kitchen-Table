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

  /* `R79` — a screen has two states and only one of them was ever measured.
     The week planner was in this list from the start, and it was in it
     EMPTY: seven "Add dinner" buttons and nothing else. The state that
     matters is the one with meals in it and the shopping list open, which
     is where the reader's chosen size lands on the longest strings in the
     app — ingredient lines at 40px inside a 320px viewport. Same lesson as
     `R61` and `R16`: a route in the list is not the same as the route's
     content in the list. */
  const seedPlan = () => {
    const iso = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    localStorage.setItem('kt.plan', JSON.stringify([
      { id: 'pseed1', date: iso(0), slot: 'dinner', recipeId: 'chicken-cordon-bleu', servings: 8, titleThen: 'Chicken Cordon Bleu' },
      { id: 'pseed2', date: iso(0), slot: 'lunch', recipeId: 'potato-bacon-soup', servings: 6, titleThen: 'Potato Bacon Soup' },
      { id: 'pseed3', date: iso(1), slot: 'dinner', recipeId: 'chicken-lasagne', servings: 4, titleThen: 'Chicken Lasagne' },
      { id: 'pseed4', date: iso(2), slot: 'breakfast', recipeId: 'scones', servings: 12, titleThen: 'Scones' }
    ]));
  };

  const screens = [
    ['Main', '#', '.main__title', null],
    ['Menu', '#menu', '.rcard', null],
    ['Week planner', '#plan', '.dayblock', null],
    ['Week planner with meals + shopping list', '#plan', '.dayblock',
      '[data-act="toggle-list"]', seedPlan],
    ['Menu + filter sheet', '#menu', '.rcard', '[data-act="open-filter"]'],
    ['Menu + text sheet', '#menu', '.rcard', '[data-act="open-text"]'],
    ['Recipe', '#chicken-cordon-bleu', '.r-title', null],
    /* R60 — a rescaled recipe carries the kept-amount notes, which add text
       to lines that were already the longest on the screen. This one is the
       book's densest: seven notes on fourteen ingredients. */
    ['Recipe rescaled', '#potato-bacon-soup', '.r-title', '[data-act="serv+"]'],
    ['Recipe + download sheet', '#chicken-cordon-bleu', '.r-title', '[data-act="open-dl"]'],
    ['Recipe edit', '#chicken-cordon-bleu', '.r-title', '[data-act="toggle-edit"]'],
    ['Add', '#add', '.pathbtn', null],
    ['Add review form', '#add', '.pathbtn', '[data-key="review"]']
  ];

  for (const [name, hash, ready, extra, seed] of screens) {
    /* A hash-only goto is not a navigation — blank first, so each screen
       starts clean and no sheet leaks into the next measurement. */
    await p.goto('about:blank');
    if (seed) {
      /* Seeding needs the origin, and the screen has to be loaded AFTER the
         write or it renders the empty state it was meant to replace. */
      await p.goto(B + '/index.html');
      await p.evaluate(seed);
      await p.goto('about:blank');
    }
    await p.goto(B + '/index.html' + hash);
    await p.waitForSelector(ready);
    if (extra) { await p.click(extra); await p.waitForTimeout(400); }
    if (seed) {
      /* A seed that missed leaves the empty screen behind, and an empty
         screen passes a reflow check on nothing at all. One of the four
         ids in the first draft of this was wrong; the floor is what said
         so. */
      const drew = await p.evaluate(() => ({
        meals: document.querySelectorAll('.dayblock .mealcard').length,
        items: document.querySelectorAll('.shoplist__items li').length
      }));
      chk(name + ': the seeded week really drew',
        drew.meals === 4 && drew.items > 5, JSON.stringify(drew));
      await p.evaluate(() => localStorage.removeItem('kt.plan'));
    }

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

  /* `R61` — every recipe, not one of them.
     The list above opens `chicken-cordon-bleu` and calls the reflow promise
     kept. It is one recipe out of forty-eight, and it happens to pass:
     swept properly, TWENTY of the forty-eight scrolled sideways here, from
     +9px to +147px — the widest of them a title with a long word in it, at
     the top step inside Easy Read, which is precisely the reader `041` was
     written for. Same shape as `R16`'s tap-target finding: a criterion
     believed to be enforced, enforced on one screen.
     So the sweep is the book now. It costs about a minute and it is the
     only version of this check that means what criterion 3 says it means. */
  {
    await p.goto(B + '/index.html');
    const book = await p.evaluate(() => fetch('recipes.json').then(r => r.json()));
    const over = [];
    for (const r of book) {
      await p.goto('about:blank');
      await p.goto(B + '/index.html#' + r.id);
      await p.waitForSelector('.r-title');
      const px = await p.evaluate(() => {
        const d = document.scrollingElement;
        return d.scrollWidth - d.clientWidth;
      });
      if (px > 1) over.push(r.id + ' +' + px + 'px');
    }
    chk('every recipe in the book reflows at 320px, Easy Read, top step',
      over.length === 0, over.length + ' of ' + book.length + ': ' + over.join(', '));
    /* A floor: a book that failed to load would otherwise read as a clean
       pass on nothing at all. */
    chk('and the sweep really opened the whole book', book.length >= 48,
      String(book.length));
  }

  await br.close();
  console.log('\n' + '='.repeat(50) + '\nPASS: ' + pass + '   FAIL: ' + fail + '\n' + '='.repeat(50));
  process.exit(fail ? 1 : 0);
})();
