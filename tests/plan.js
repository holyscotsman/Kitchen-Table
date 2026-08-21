/* The week planner — Phase 15 (tasks 122–130).
 * Same harness idiom as every other suite: hermetic, one command, exit 1 on red.
 */
const { chromium, devices } = require('playwright');
const B = process.env.KT_BASE || 'http://127.0.0.1:8899';
let pass = 0, fail = 0;
const chk = (n, c, e = '') => c ? (pass++, console.log('  PASS ' + n))
  : (fail++, console.log('  FAIL ' + n + (e ? ' :: ' + e : '')));

(async () => {
  const br = await chromium.launch(process.env.KT_CHROMIUM ? { executablePath: process.env.KT_CHROMIUM } : {});
  const ctx = await br.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message)));

  console.log('\n== The week renders (122) ==');
  await p.goto(B + '/index.html#plan');
  await p.waitForSelector('.dayblock');
  chk('seven days', await p.locator('.dayblock').count() === 7);
  chk('every day offers dinner', await p.locator('.slotadd').count() === 7);
  chk('breakfast and lunch are one quiet tap away', await p.locator('.quietadds').count() === 7);
  chk('today is marked', await p.locator('.dayblock--today').count() === 1);
  chk('no horizontal scroll at 390px', await p.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth));

  console.log('\n== Easy Read + top step holds (122) ==');
  await p.evaluate(() => {
    localStorage.setItem('kt.easyRead', 'true');
    localStorage.setItem('kt.fsIndex', '4');
  });
  await p.reload(); await p.waitForSelector('.dayblock');
  chk('still no horizontal scroll under Easy Read at 40px', await p.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth));
  await p.evaluate(() => { localStorage.removeItem('kt.easyRead'); localStorage.removeItem('kt.fsIndex'); });
  await p.reload(); await p.waitForSelector('.dayblock');

  console.log('\n== Tap-to-assign (123, 124) ==');
  await p.locator('.slotadd').first().click();
  await p.waitForSelector('#pick-q');
  chk('picker is a modal sheet', await p.getAttribute('.sheet', 'aria-modal') === 'true');
  await p.fill('#pick-q', 'chicken');
  await p.waitForTimeout(250);
  const firstHit = await p.locator('.picklist .mealcard .rcard__title').first().textContent();
  await p.locator('.picklist .mealcard').first().click();
  await p.waitForSelector('.dayblock .mealcard');
  chk('assigning is one tap', (await p.locator('.dayblock .mealcard .rcard__title').first().textContent()) === firstHit);
  chk('assigned card carries icon or thumb', await p.locator('.dayblock .mealcard .rcard__icon, .dayblock .mealcard .rcard__thumb').count() >= 1);
  chk('assignment persisted', await p.evaluate(() => JSON.parse(localStorage.getItem('kt.plan')).length === 1));

  console.log('\n== A meal owns its servings (125) ==');
  await p.locator('.dayblock .mealcard').first().click();
  await p.waitForSelector('[data-act="meal-serv+"]');
  const before = await p.evaluate(() => JSON.parse(localStorage.getItem('kt.plan'))[0].servings);
  await p.click('[data-act="meal-serv+"]');
  await p.click('[data-act="meal-serv+"]');
  const after = await p.evaluate(() => JSON.parse(localStorage.getItem('kt.plan'))[0].servings);
  chk('stepper changes only the planned meal', after === before + 2, before + '->' + after);
  const recipeUnchanged = await p.evaluate(async () => {
    const list = await (await fetch('recipes.json')).json();
    const e = JSON.parse(localStorage.getItem('kt.plan'))[0];
    return list.find(r => r.id === e.recipeId).servings !== e.servings;
  });
  chk('the recipe default is untouched', recipeUnchanged);
  await p.click('.donebtn[data-act="close-meal"]');

  console.log('\n== The same recipe twice in one week (126) ==');
  const rid = await p.evaluate(() => JSON.parse(localStorage.getItem('kt.plan'))[0].recipeId);
  await p.locator('.slotadd').first().click();
  await p.waitForSelector('#pick-q');
  await p.fill('#pick-q', 'chicken');
  await p.waitForTimeout(250);
  await p.locator('.picklist .mealcard').first().click();
  await p.waitForTimeout(300);
  const twice = await p.evaluate(() => {
    const plan = JSON.parse(localStorage.getItem('kt.plan'));
    return plan.length === 2 && plan[0].recipeId === plan[1].recipeId && plan[0].id !== plan[1].id;
  });
  chk('two independent entries, no error', twice);

  console.log('\n== A plan outlives its recipe (127) ==');
  await p.evaluate(rid2 => {
    const list = JSON.parse(localStorage.getItem('kt.recipes') || 'null');
    // build an overlay without the planned recipe
    return fetch('recipes.json').then(r => r.json()).then(base => {
      const overlay = (list || base).filter(r => r.id !== rid2);
      localStorage.setItem('kt.recipes', JSON.stringify(overlay));
    });
  }, rid);
  await p.reload(); await p.waitForSelector('.dayblock');
  chk('slot degrades to the planned-under name', await p.locator('.mealcard--gone').count() === 2);
  chk('says it is no longer in the book', (await p.locator('.mealcard--gone').first().textContent()).includes('No longer in the book'));
  chk('no crash', errs.length === 0, errs.join(' | '));
  await p.evaluate(() => localStorage.removeItem('kt.recipes'));
  await p.reload(); await p.waitForSelector('.dayblock');

  console.log('\n== Week navigation (128) ==');
  const label = await p.locator('.mhead__h1').textContent();
  await p.click('[data-act="week-next"]');
  await p.waitForTimeout(400);
  chk('next week changes the label', (await p.locator('.mhead__h1').textContent()) !== label);
  chk('meals belong to their week — next week is empty', await p.locator('.dayblock .mealcard').count() === 0);
  await p.click('[data-act="week-today"]');
  await p.waitForTimeout(400);
  chk('Today returns', (await p.locator('.mhead__h1').textContent()) === label);
  chk('and the meals are back', await p.locator('.dayblock .mealcard').count() === 2);

  console.log('\n== Shopping list preview (130) ==');
  await p.click('[data-act="toggle-list"]');
  await p.waitForSelector('.shoplist__items');
  chk('summed items render', await p.locator('.shoplist__items li').count() > 0);
  chk('no decimal quantities in the list', !(await p.evaluate(() =>
    [...document.querySelectorAll('.shoplist__items li')].some(li => /\d\.\d/.test(li.textContent)))));
  chk('the preview says what it is', (await p.locator('.shoplist__head').textContent()).toLowerCase().includes('preview'));

  console.log('\n== R79 — the list you read in the shop is recipe text ==');
  {
    /* `R78` fixed the review form and wrote the rule down: recipe text
       scales wherever it appears. This is the other place it appears. The
       shopping list is ingredient lines — the recipe's own words, rescaled
       to the servings planned — and they sat at a hardcoded 17px at every
       step. Someone who set 40px because they cannot read 24px got 17px in
       the shop, at arm's length, holding a phone in one hand.
       There is no A−/A+ on this screen either, so it could not even be
       fixed in place. The check is against the recipe screen: the same
       words, at the same size, on both screens. */
    const sizeOn = async (hash, ready, sel, step) => {
      await p.evaluate((v) => localStorage.setItem('kt.fsIndex', v), step);
      await p.goto('about:blank');
      await p.goto(B + '/index.html' + hash);
      await p.waitForSelector(ready);
      if (hash === '#plan') {
        const open = await p.locator('[data-act="toggle-list"]').count();
        if (open) {
          const expanded = await p.getAttribute('[data-act="toggle-list"]', 'aria-expanded');
          if (expanded !== 'true') await p.click('[data-act="toggle-list"]');
          await p.waitForSelector('.shoplist__items');
        }
      }
      try {
        return await p.evaluate((q) => {
          const el = document.querySelector(q);
          return el ? parseFloat(getComputedStyle(el).fontSize) : -1;
        }, sel);
      } catch (e) { return -1; }
    };
    const seen = {};
    for (const step of ['0', '4']) {
      const shop = await sizeOn('#plan', '.dayblock', '.shoplist__items li', step);
      const ing = await sizeOn('#chicken-cordon-bleu', '.r-title', '.checkrow', step);
      seen[step] = shop;
      chk('a shopping-list line is the size of an ingredient line at step ' + step,
        shop > 0 && Math.abs(shop - ing) < 0.5, 'shop ' + shop + 'px vs recipe ' + ing + 'px');
    }
    /* The floor: both could agree by both being frozen. */
    chk('and the shopping list actually moves when the step does',
      seen['4'] > seen['0'] * 1.5, seen['0'] + ' -> ' + seen['4']);
    await p.evaluate(() => localStorage.removeItem('kt.fsIndex'));
    await p.goto('about:blank');
    await p.goto(B + '/index.html#plan');
    await p.waitForSelector('.dayblock');
    if (await p.locator('[data-act="toggle-list"]').count()) {
      const expanded = await p.getAttribute('[data-act="toggle-list"]', 'aria-expanded');
      if (expanded !== 'true') await p.click('[data-act="toggle-list"]');
      await p.waitForSelector('.shoplist__items');
    }
  }

  console.log('\n== R84 — the picker squashed its own recipes ==');
  {
    /* `.picklist` is a flex column with `max-height: 46vh; overflow-y:
       auto`, which reads as "eight cards, scroll for the rest". It is not
       what happens. Flex items shrink before a container scrolls, and a
       card's automatic minimum is its min-content height — which here is
       the 44px icon, because the title and meta truncate and so contribute
       nothing. So every card was crushed to 44px with its own text drawn
       27-49px OUTSIDE the box, over the top of the card below it. On the
       screen you use to plan a week, at every font step.
       The criterion: a card contains its own words. */
    await p.goto('about:blank');
    await p.goto(B + '/index.html#plan');
    await p.waitForSelector('.slotadd');
    await p.locator('.slotadd').first().click();
    await p.waitForSelector('#pick-q');
    await p.waitForTimeout(400);
    const fit = await p.evaluate(() => {
      const cards = [].slice.call(document.querySelectorAll('.picklist .mealcard'));
      const spill = [];
      const overlap = [];
      let prev = null;
      cards.forEach(c => {
        const cb = c.getBoundingClientRect();
        [].slice.call(c.querySelectorAll('.rcard__title, .rcard__meta')).forEach(t => {
          const tb = t.getBoundingClientRect();
          if (tb.bottom > cb.bottom + 1 || tb.top < cb.top - 1) {
            spill.push((t.textContent || '').trim().slice(0, 18) + ' +' +
              Math.round(Math.max(tb.bottom - cb.bottom, cb.top - tb.top)) + 'px outside');
          }
        });
        if (prev && cb.top < prev.bottom - 1) overlap.push(Math.round(prev.bottom - cb.top) + 'px');
        prev = cb;
      });
      return { n: cards.length, spill: spill.slice(0, 4), overlap: overlap.slice(0, 3) };
    });
    chk('the picker drew a list to measure', fit.n >= 5, String(fit.n));
    chk('every card in the picker contains its own words',
      fit.spill.length === 0, fit.spill.join('; '));
    chk('and no card is drawn over the one below it',
      fit.overlap.length === 0, fit.overlap.join('; '));
    await p.keyboard.press('Escape');
    await p.waitForTimeout(250);
  }

  console.log('\n== R82 — a printed list must not claim a precision it lacks ==');
  {
    /* The list sums what it safely can and lists the rest as written; the
       line between the two is a `<p>` that `@media print` hid along with
       every other `.hint`. On paper the un-summed lines therefore sat in
       the same column as the summed ones with nothing to say so — a list
       that reads as arithmetic when half of it is transcription.
       Checked on paper, because on screen it was always fine. */
    /* Self-sufficient on purpose: `S.listOpen` is in-memory, so any block
       above that navigates leaves the fold shut and this would measure an
       empty list and call it a pass. */
    await p.goto('about:blank');
    await p.goto(B + '/index.html#plan');
    await p.waitForSelector('.dayblock');
    if (await p.locator('[data-act="toggle-list"]').count()) {
      if (await p.getAttribute('[data-act="toggle-list"]', 'aria-expanded') !== 'true') {
        await p.click('[data-act="toggle-list"]');
      }
      await p.waitForSelector('.shoplist__items');
    }
    await p.emulateMedia({ media: 'print' });
    await p.waitForTimeout(200);
    const onPaper = await p.evaluate(() => {
      const els = [].slice.call(document.querySelectorAll('.shoplist p'));
      const shown = els.filter(e => e.offsetParent !== null || e.getClientRects().length);
      return {
        all: els.map(e => e.textContent.trim().slice(0, 30)),
        shown: shown.map(e => e.textContent.trim().slice(0, 30))
      };
    });
    chk('the "as written, not summed" line survives printing',
      onPaper.shown.some(t => /as written/i.test(t)), JSON.stringify(onPaper));
    chk('and the screen-only explanation does not',
      !onPaper.shown.some(t => /^Same wording/i.test(t)), JSON.stringify(onPaper.shown));
    /* A floor: both would pass if the list itself failed to render. */
    chk('and there was a list on the paper at all',
      await p.evaluate(() => document.querySelectorAll('.shoplist__items li').length) > 3);
    await p.emulateMedia({ media: 'screen' });
    await p.waitForTimeout(150);
  }

  console.log('\n== The shopping list had its own parser (R64) ==');
  {
    /* The list sums what it can and lists the rest as written — 130, shipped
       honestly as a preview. It did that with a regex of its own, written
       before R57–R60 taught the recipe screen what a card actually looks
       like, and it never learned any of it. Two consequences, both silent:
         "1 to 2 tablespoons milk"  read as ONE tablespoon of a unit called
           "to", then summed, so a doubled week showed "2 to 2 tablespoons"
         "1 lb (450g) chicken"      summed with the stale metric riding
           along inside the text, where no per-line note could reach it
       One reader for the whole app now: a line is summed only when it is a
       single plain amount with nothing left behind, and everything else is
       listed as written, scaled, and says what it kept. */
    const ctxS = await br.newContext({ ...devices['iPhone 13'] });
    const pS = await ctxS.newPage();
    const sErrs = []; pS.on('pageerror', e => sErrs.push(e.message));
    /* Two meals, planned straight into storage so the search box and the
       picker are not part of what is being measured here. */
    await pS.goto(B + '/index.html');
    await pS.evaluate(() => {
      const today = (function () {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
          '-' + String(d.getDate()).padStart(2, '0');
      })();
      localStorage.setItem('kt.plan', JSON.stringify([
        /* frosting serves 8; twelve is one and a half times it */
        { id: 's1', date: today, slot: 'dinner', recipeId: 'vanilla-frosting',
          titleThen: 'Vanilla Frosting', servings: 16 },
        /* stroganoff serves 4, planned for eight */
        { id: 's2', date: today, slot: 'lunch', recipeId: 'chicken-stroganoff',
          titleThen: 'Chicken Stroganoff', servings: 8 }
      ]));
    });
    await pS.goto(B + '/index.html#plan');
    await pS.reload();
    await pS.waitForSelector('.dayblock');
    await pS.click('[data-act="toggle-list"]');
    await pS.waitForSelector('.shoplist__items');
    const items = await pS.locator('.shoplist__items li').allTextContents();

    chk('the list drew something', items.length > 4, String(items.length));
    const milk = items.find(l => /milk/i.test(l)) || '';
    /* The failure shape exactly: both ends the same number, which is what
       reading "to" as a unit and summing the 1 produced. A correct range
       legitimately contains the word, so the check has to name the fault
       rather than the word. */
    chk('a range is not summed as a unit called "to"',
      !/(\d+)\s+to\s+\1\b/.test(milk), milk);
    chk('and it is listed as the range it is, doubled at both ends',
      /2 to 4 tablespoons/.test(milk), milk);

    const chicken = items.find(l => /chicken breast/i.test(l)) || '';
    chk('a line carrying a second amount says what it kept',
      /450g not adjusted/.test(chicken), chicken);
    chk('and it is not silently merged into a sum',
      /^2 lb \(450g\)/.test(chicken.trim()), chicken);

    /* The half that must not regress: a plain line still sums. */
    await pS.evaluate(() => {
      const today = (function () {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
          '-' + String(d.getDate()).padStart(2, '0');
      })();
      localStorage.setItem('kt.plan', JSON.stringify([
        { id: 'p1', date: today, slot: 'dinner', recipeId: 'chicken-cordon-bleu',
          titleThen: 'A', servings: 4 },
        { id: 'p2', date: today, slot: 'lunch', recipeId: 'chicken-cordon-bleu',
          titleThen: 'B', servings: 4 }
      ]));
    });
    await pS.reload();
    await pS.waitForSelector('.dayblock');
    await pS.click('[data-act="toggle-list"]');
    await pS.waitForSelector('.shoplist__items');
    const twice = await pS.locator('.shoplist__items li').allTextContents();
    const cheese = twice.find(l => /Swiss cheese/i.test(l)) || '';
    chk('the same recipe planned twice still sums into one line',
      /^12 slices Swiss cheese/.test(cheese.trim()), cheese);
    chk('no decimal quantities anywhere in the list',
      !twice.some(l => /\d\.\d/.test(l)), twice.filter(l => /\d\.\d/.test(l)).join(' | '));
    chk('and the list threw nothing', sErrs.length === 0, sErrs.join(' | '));
    await pS.evaluate(() => localStorage.removeItem('kt.plan'));
    await ctxS.close();
  }

  console.log('\n== One unit, two spellings, two lines (R96) ==');
  {
    /* The summing key was the unit exactly as written, so "cups" and "cup"
       were two different units and the same ingredient came out twice —
       "1½ cups water" and "1 cup water", one line apart, on the list you
       read in the shop. Twelve such splits exist in the 48-recipe book;
       four are a bare plural, three are an abbreviation of the same word.
       Doing that arithmetic is the whole job of the list.

       What must NOT merge is the other half of this, and it is why the
       collapse works off a named list rather than a stemmer: "teaspoons
       minced garlic" and "cloves minced garlic" are different units and
       cannot be added, and "large egg" / "medium egg" are not units at all
       — just the first word of the line, where the parser looks. */
    const ctxU = await br.newContext({ ...devices['iPhone 13'] });
    const pU = await ctxU.newPage();
    const uErrs = []; pU.on('pageerror', e => uErrs.push(e.message));
    await pU.goto(B + '/index.html');
    await pU.evaluate(() => {
      const d = new Date();
      const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
        '-' + String(d.getDate()).padStart(2, '0');
      /* Each at its own servings, so nothing rescales and the amounts on the
         list are the amounts in the book. */
      const mk = (n, recipeId, slot, servings) =>
        ({ id: 'u' + n, date: today, slot, recipeId, titleThen: recipeId, servings });
      localStorage.setItem('kt.plan', JSON.stringify([
        mk(1, 'boiled-eggs-in-ninja', 'dinner', 4),        // 1.5 cups water
        mk(2, 'chicken-lasagne', 'lunch', 9),              // 1 cup water
        mk(3, 'chicken-stroganoff', 'breakfast', 4)        // 2 tbsp olive oil
      ]));
    });
    await pU.goto(B + '/index.html#plan');
    await pU.reload();
    await pU.waitForSelector('.dayblock');
    await pU.click('[data-act="toggle-list"]');
    await pU.waitForSelector('.shoplist__items');
    let uItems = await pU.locator('.shoplist__items li').allTextContents();

    const water = uItems.filter(l => /\bwater$/i.test(l.trim()));
    chk('one unit spelled two ways sums into one line', water.length === 1,
        JSON.stringify(water));
    chk('and it carries the whole amount', /^2\u00bd cups water$/.test((water[0]||'').trim()),
        water[0] || '(none)');

    /* The other half of the same fixture: shepherd's pie writes the word out
       where the stroganoff abbreviates it. */
    await pU.evaluate(() => {
      const d = new Date();
      const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
        '-' + String(d.getDate()).padStart(2, '0');
      const plan = JSON.parse(localStorage.getItem('kt.plan'));
      plan.push({ id: 'u4', date: today, slot: 'dinner', recipeId: 'shepherds-pie',
                  titleThen: 'shepherds-pie', servings: 6 });   // 2 tablespoons olive oil
      localStorage.setItem('kt.plan', JSON.stringify(plan));
    });
    await pU.reload();
    await pU.waitForSelector('.dayblock');
    await pU.click('[data-act="toggle-list"]');
    await pU.waitForSelector('.shoplist__items');
    uItems = await pU.locator('.shoplist__items li').allTextContents();
    const oil = uItems.filter(l => /olive oil$/i.test(l.trim()));
    chk('an abbreviation and the word it stands for sum together', oil.length === 1,
        JSON.stringify(oil));
    chk('and the merged line says the unit in full',
        /^4 tablespoons olive oil$/.test((oil[0]||'').trim()), oil[0] || '(none)');

    /* Now the guard. Different units, and words that are not units at all. */
    await pU.evaluate(() => {
      const d = new Date();
      const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
        '-' + String(d.getDate()).padStart(2, '0');
      const mk = (n, recipeId, slot, servings) =>
        ({ id: 'g' + n, date: today, slot, recipeId, titleThen: recipeId, servings });
      localStorage.setItem('kt.plan', JSON.stringify([
        mk(1, 'creamy-chicken-casserole', 'dinner', 6),   // 3 teaspoons minced garlic
        mk(2, 'shrimp-etouffee', 'lunch', 4),             // 4 cloves minced garlic
        mk(3, 'pork-schnitzel', 'breakfast', 2)           // 1 large egg
      ]));
    });
    await pU.reload();
    await pU.waitForSelector('.dayblock');
    await pU.click('[data-act="toggle-list"]');
    await pU.waitForSelector('.shoplist__items');
    uItems = await pU.locator('.shoplist__items li').allTextContents();
    const garlic = uItems.filter(l => /minced garlic$/i.test(l.trim()));
    chk('teaspoons and cloves are never added together', garlic.length === 2,
        JSON.stringify(garlic));
    chk('a word in the unit slot that is not a unit is left alone',
        uItems.some(l => /^1 large egg$/.test(l.trim())),
        JSON.stringify(uItems.filter(l => /egg$/i.test(l))));
    /* Inflecting to agree with the total must not run the other way: a card
       says "½ cup", never "½ cups". Only a BARE fraction counts —
       "1¾ cups" is one and three quarters and is rightly plural, which is
       why this anchors — and it names the plurals rather than matching any
       word ending in s, so an ingredient simply called "chives" cannot be
       mistaken for a unit. */
    const plural = /^[\u00bc\u00bd\u00be\u2153\u2154\u215b\u215c\u215d\u215e]\s+(cups|teaspoons|tablespoons|ounces|pounds|slices|cloves|grams)\b/;
    chk('a fraction of a unit stays singular',
        !uItems.some(l => plural.test(l.trim())),
        JSON.stringify(uItems.filter(l => plural.test(l.trim()))));
    chk('and none of it threw', uErrs.length === 0, uErrs.join(' | '));
    await pU.evaluate(() => localStorage.removeItem('kt.plan'));
    await ctxU.close();
  }

  console.log('\n== A plan that could not be kept must not say it was (R45) ==');
  {
    /* R44's shape, one key over. The plan goes through the same save() that
       swallows a quota error, and the same "it worked" sentence follows it —
       so on a full phone the week says a meal is planned, draws it in the
       day, and loses it on the next load. */
    const ctxP = await br.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const pP = await ctxP.newPage();
    const errsP = []; pP.on('pageerror', e => errsP.push(e.message));
    await pP.goto(B + '/index.html#plan');
    await pP.waitForSelector('.dayblock');
    await pP.evaluate(() => {
      let n = 0;
      for (const size of [64, 8, 1]) {
        const blob = 'x'.repeat(size * 1024);
        try { for (let i = 0; i < 4000; i++, n++) localStorage.setItem('kt.fill.' + n, blob); }
        catch (e) { /* next, smaller */ }
      }
    });
    await pP.click('[data-act="plan-pick"]');
    await pP.waitForSelector('[data-act="plan-assign"]');
    await pP.locator('[data-act="plan-assign"]').first().click();
    await pP.waitForTimeout(400);
    const said = await pP.locator('#main-content').textContent();
    chk('it does not claim the meal is planned',
      !/planned for/i.test(said), said.slice(0, 80));
    chk('and says the phone is full instead',
      /full|no room/i.test(said), said.slice(0, 120));
    chk('the day does not draw a meal it could not keep',
      await pP.locator('.mealcard').count() === 0,
      String(await pP.locator('.mealcard').count()));
    chk('without throwing', errsP.length === 0, errsP.join(' | '));
    /* With room again, planning works exactly as it always did. */
    await pP.evaluate(() => Object.keys(localStorage)
      .filter(k => k.indexOf('kt.fill.') === 0).forEach(k => localStorage.removeItem(k)));
    await pP.click('[data-act="plan-pick"]');
    await pP.waitForSelector('[data-act="plan-assign"]');
    await pP.locator('[data-act="plan-assign"]').first().click();
    await pP.waitForTimeout(400);
    chk('with room again it plans and says so',
      /planned for/i.test(await pP.locator('#main-content').textContent()));
    await pP.reload();
    await pP.waitForSelector('.dayblock');
    chk('and the meal is really there after a reload',
      await pP.locator('.mealcard').count() >= 1);
    await ctxP.close();
  }

  console.log('\n== The week is the reader’s week, not UTC’s (R72) ==');
  {
    /* A week planner has to agree with the calendar on the wall. The app's
       own date code reads local parts — getFullYear/getMonth/getDate — and
       never touches toISOString, which would hand back the UTC day: for a
       family five hours behind, every evening after seven would land on
       tomorrow, and one hour ahead, the first hour after midnight would land
       on yesterday. It was right; nothing said so, and nothing stopped the
       next refactor from reaching for the shorter spelling.
       Checked on two clocks a full day apart. On the same instant, Kiritimati
       (UTC+14) and Niue (UTC-11) are on different dates, so a UTC-based app
       cannot be right in both. The suites had the same assumption in their
       own seeding and now compute the day the way the app does. */
    for (const zone of ['Pacific/Kiritimati', 'Pacific/Niue']) {
      const ctxZ = await br.newContext({ ...devices['iPhone 13'], timezoneId: zone });
      const pZ = await ctxZ.newPage();
      const zErrs = []; pZ.on('pageerror', e => zErrs.push(e.message));
      await pZ.goto(B + '/index.html#plan');
      await pZ.waitForSelector('.dayblock');
      const localToday = await pZ.evaluate(() => {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
          '-' + String(d.getDate()).padStart(2, '0');
      });
      const marked = await pZ.evaluate(() => {
        const el = document.querySelector('.dayblock--today');
        return el ? (el.getAttribute('data-date') || el.textContent.trim().slice(0, 40)) : null;
      });
      chk('exactly one day is marked today in ' + zone,
        await pZ.locator('.dayblock--today').count() === 1,
        String(await pZ.locator('.dayblock--today').count()));

      /* Plan into today's dinner slot and see where it lands. */
      await pZ.locator('.dayblock--today .slotadd').first().click();
      await pZ.waitForSelector('#pick-q');
      await pZ.locator('.picklist .mealcard').first().click();
      await pZ.waitForTimeout(400);
      const stored = await pZ.evaluate(() => {
        const plan = JSON.parse(localStorage.getItem('kt.plan') || '[]');
        return plan.length ? plan[plan.length - 1].date : null;
      });
      chk('a meal planned for today is stored under the local date in ' + zone,
        stored === localToday, stored + ' vs local ' + localToday);
      chk('and it draws on the day marked today in ' + zone,
        await pZ.locator('.dayblock--today .mealcard').count() === 1,
        'marked: ' + marked);
      chk('nothing threw in ' + zone, zErrs.length === 0, zErrs.join(' | '));
      await pZ.evaluate(() => localStorage.removeItem('kt.plan'));
      await ctxZ.close();
    }

    /* And the rule, so the shorter spelling cannot come back: the app writes
       no dates in UTC. Every timestamp it handles comes FROM the server
       already formatted; every date it composes is the reader's. */
    {
      const src = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'app.js'), 'utf8');
      chk('app.js composes no date in UTC',
        src.indexOf('toISOString') === -1 && src.indexOf('toUTCString') === -1,
        'found one');
      chk('and its own date builder reads local parts',
        /function isoDate[\s\S]{0,200}getFullYear\(\)[\s\S]{0,120}getDate\(\)/.test(src));
    }
  }

  console.log('\n== Print view (129) ==');
  await p.emulateMedia({ media: 'print' });
  const printState = await p.evaluate(() => ({
    nav: getComputedStyle(document.querySelector('.weeknav')).display,
    slotadd: getComputedStyle(document.querySelector('.slotadd')).display,
    meal: getComputedStyle(document.querySelector('.dayblock .mealcard')).display
  }));
  chk('print hides the controls, keeps the meals',
    printState.nav === 'none' && printState.slotadd === 'none' && printState.meal !== 'none',
    JSON.stringify(printState));
  await p.emulateMedia({ media: 'screen' });

  console.log('\n== Entry point + tap targets ==');
  await p.goto(B + '/index.html'); await p.waitForSelector('.main__title');
  chk('Main links to the planner, with the count', (await p.evaluate(() =>
    document.querySelector('a[href="#plan"]').textContent)).includes('2 planned'));
  await p.goto(B + '/index.html#plan'); await p.waitForSelector('.dayblock');
  const small = await p.evaluate(() => {
    const bad = [];
    document.querySelectorAll('button, a[href]').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.height < 44) bad.push((el.className || el.id) + ' h=' + r.height.toFixed(1));
    });
    return bad;
  });
  chk('nothing interactive under 44px', small.length === 0, small.join(', '));

  chk('no JS errors anywhere', errs.length === 0, errs.join(' | '));
  await p.evaluate(() => localStorage.clear());
  await br.close();
  console.log('\n' + '='.repeat(50) + '\nPASS: ' + pass + '   FAIL: ' + fail + '\n' + '='.repeat(50));
  process.exit(fail ? 1 : 0);
})();
