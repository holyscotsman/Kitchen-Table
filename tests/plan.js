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
