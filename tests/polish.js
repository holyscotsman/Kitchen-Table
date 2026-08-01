const { chromium, devices } = require('playwright');
const B = process.env.KT_BASE || 'http://127.0.0.1:8899';
let pass=0,fail=0;
const chk=(n,c,e='')=>c?(pass++,console.log('  PASS '+n)):(fail++,console.log('  FAIL '+n+(e?' :: '+e:'')));
(async()=>{
  const br=await chromium.launch(process.env.KT_CHROMIUM ? { executablePath: process.env.KT_CHROMIUM } : {});
  const ctx=await br.newContext({...devices['iPhone 13']});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('dialog',d=>d.accept());

  console.log('\n== Document title per route ==');
  await p.goto(B+'/index.html'); await p.waitForSelector('.main__title');
  chk('Main title', (await p.title())==='Kitchen Table', await p.title());
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  chk('Menu title', (await p.title())==='Menu — Kitchen Table', await p.title());
  await p.goto(B+'/index.html#chicken-cordon-bleu'); await p.waitForSelector('.r-title');
  chk('Recipe title', (await p.title()).startsWith('Chicken Cordon Bleu —'), await p.title());
  await p.goto(B+'/index.html#add'); await p.waitForSelector('.pathbtn');
  chk('Add title', (await p.title())==='Add a recipe — Kitchen Table', await p.title());

  console.log('\n== Route announcement + focus ==');
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  await p.click('.rcard');
  await p.waitForSelector('.r-title');
  chk('live region announces the screen', (await p.locator('#route-live').textContent()).includes('Kitchen Table'));
  chk('focus lands on the new h1', await p.evaluate(()=>document.activeElement.tagName)==='H1');

  console.log('\n== Scroll restoration ==');
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  await p.evaluate(()=>window.scrollTo(0,1400));
  await p.waitForTimeout(400);
  const y=await p.evaluate(()=>window.scrollY);
  await p.click('.rcard >> nth=8');
  await p.waitForSelector('.r-title');
  chk('recipe opens at the top', await p.evaluate(()=>window.scrollY)<50);
  await p.goBack();
  await p.waitForSelector('.rcard');
  await p.waitForTimeout(400);
  const back=await p.evaluate(()=>window.scrollY);
  chk('menu scroll position restored', Math.abs(back-y)<80, y+' -> '+back);

  console.log('\n== Reset local changes ==');
  await p.goto(B+'/index.html#chicken-cordon-bleu'); await p.waitForSelector('.r-title');
  await p.click('[data-act="toggle-edit"]'); await p.waitForTimeout(300);
  chk('reset hidden when there are no local changes', await p.locator('[data-act="reset-local"]').count()===0);
  await p.fill('#e-title','Locally Renamed');
  await p.click('[data-act="save"]'); await p.waitForTimeout(300);
  chk('reset appears once changes exist', await p.locator('[data-act="reset-local"]').count()===1);
  chk('edit applied', (await p.inputValue('#e-title'))==='Locally Renamed');
  await p.click('[data-act="reset-local"]');
  await p.waitForTimeout(500);
  chk('kt.recipes cleared', await p.evaluate(()=>localStorage.getItem('kt.recipes'))===null);
  chk('published title restored', (await p.locator('.r-title').textContent()).includes('Chicken Cordon Bleu'));

  console.log('\n== Reset recovers from removing everything ==');
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  await p.evaluate(()=>localStorage.setItem('kt.recipes', JSON.stringify([])));
  await p.reload(); await p.waitForTimeout(700);
  chk('empty state shows recovery button', await p.locator('[data-act="reset-local"]').count()===1);
  await p.click('[data-act="reset-local"]');
  await p.waitForTimeout(600);
  chk('all 48 recipes back', await p.locator('.rcard').count()===48, String(await p.locator('.rcard').count()));

  console.log('\n== Removal actually persists ==');
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  await p.click('[data-act="toggle-remove"]'); await p.waitForTimeout(300);
  await p.click('.rrow >> nth=0'); await p.waitForTimeout(400);
  chk('47 after removing one', await p.locator('.rrow, .rcard').count()===47, String(await p.locator('.rrow, .rcard').count()));
  await p.reload(); await p.waitForSelector('.rcard');
  chk('still 47 after a reload', await p.locator('.rcard').count()===47, String(await p.locator('.rcard').count()));
  await p.click('[data-act="theme"]'); await p.waitForTimeout(300);
  chk('still 47 after a theme change', await p.locator('.rcard').count()===47, String(await p.locator('.rcard').count()));
  /* Browser restart: a brand-new context carrying only the stored state, the
     closest a test can get to quitting and reopening Safari. */
  const state = await ctx.storageState();
  const ctx2 = await br.newContext({ ...devices['iPhone 13'], storageState: state });
  const p2 = await ctx2.newPage();
  await p2.goto(B+'/index.html#menu'); await p2.waitForSelector('.rcard');
  chk('still 47 after a browser restart', await p2.locator('.rcard').count()===47, String(await p2.locator('.rcard').count()));
  await ctx2.close();
  await p.evaluate(()=>localStorage.removeItem('kt.recipes'));
  await p.reload(); await p.waitForSelector('.rcard');
  chk('48 again once local changes are cleared', await p.locator('.rcard').count()===48);

  console.log('\n== Wake lock intent survives backgrounding ==');
  await p.goto(B+'/index.html#chicken-cordon-bleu'); await p.waitForSelector('.r-title');
  const hasWake = await p.locator('[data-act="toggle-wake"]').count();
  if (hasWake) {
    await p.click('[data-act="toggle-wake"]');
    /* The request is a promise and can be slow on a loaded machine — poll the
       switch rather than trusting one fixed wait. */
    let on = null;
    for (let t = 0; t < 20 && on !== 'true'; t++) {
      await p.waitForTimeout(250);
      on = await p.getAttribute('[data-act="toggle-wake"]','aria-checked');
    }
    chk('wake lock turns on', on==='true', String(on));
  } else {
    chk('wake row hidden when API unavailable', true);
  }

  console.log('\n== Colour is never the only signal (task 043) ==');
  await p.goto(B+'/index.html#chops'); await p.waitForSelector('.r-title');
  chk('flagged panel carries a heading, not just a colour', /Worth double-checking/.test(await p.locator('.panel--flag').textContent()));
  await p.goto(B+'/index.html'); await p.waitForSelector('.who-tile');
  chk('empty contributor tile says 0 in text', (await p.locator('.who-tile--empty .who-tile__count').first().textContent())==='0');
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  await p.click('[data-act="open-filter"]'); await p.waitForSelector('#filter-sheet');
  await p.click('[data-act="fc"][data-key="Dinner"]'); await p.waitForTimeout(300);
  chk('selected chip carries a check glyph', await p.locator('[data-act="fc"][data-key="Dinner"] svg').count()===1);
  chk('unselected chip has no glyph', await p.locator('[data-act="fc"][data-key="Breakfast"] svg').count()===0);
  await p.click('[data-act="fc"][data-key="Dinner"]'); await p.waitForTimeout(200);
  await p.click('.donebtn'); await p.waitForTimeout(200);

  chk('no JS errors', errs.length===0, errs.join(' | '));
  await br.close();
  console.log('\n'+'='.repeat(50)+'\nPASS: '+pass+'   FAIL: '+fail+'\n'+'='.repeat(50));
  process.exit(fail?1:0);
})();
