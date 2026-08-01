const { chromium, devices } = require('playwright');
const B = process.env.KT_BASE || 'http://127.0.0.1:8899';
let pass=0,fail=0;
const chk=(n,c,e='')=>c?(pass++,console.log('  PASS '+n)):(fail++,console.log('  FAIL '+n+(e?' :: '+e:'')));
(async()=>{
  const br=await chromium.launch(process.env.KT_CHROMIUM ? { executablePath: process.env.KT_CHROMIUM } : {});
  const ctx=await br.newContext({...devices['iPhone 13']});
  /* Hermetic: every relay in the chain is stubbed to fail fast, so the suite
     never waits out a real network timeout. Individual cases re-route
     allorigins with the response they need — later routes win. */
  for (const host of ['**/api.allorigins.win/**','**/corsproxy.io/**','**/r.jina.ai/**','https://example.com/**'])
    await ctx.route(host, route => route.abort('failed'));
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));

  console.log('\n== Add screen entry ==');
  await p.goto(B+'/index.html#menu');
  await p.waitForSelector('.addpill');
  chk('Add pill links to #add', await p.getAttribute('.addpill','href')==='#add');
  await p.click('.addpill');
  await p.waitForSelector('.addscreen');
  chk('route is #add', p.url().endsWith('#add'));
  chk('three entry paths', await p.locator('.pathbtn').count()===3);
  chk('one h1', await p.locator('h1').count()===1);

  console.log('\n== Type it in ==');
  await p.click('[data-key="review"]');
  await p.waitForSelector('#a-title');
  chk('review form appears', true);
  chk('title labelled', await p.locator('label[for="a-title"]').count()===1);
  chk('course select', await p.locator('#a-cat').count()===1);
  chk('serves numeric', await p.getAttribute('#a-serves','type')==='number');
  await p.click('[data-act="add-save"]');
  await p.waitForTimeout(300);
  chk('empty title is refused', (await p.locator('.notice--bad').textContent()).includes('title'));

  await p.fill('#a-title','Test Flapjacks');
  await p.selectOption('#a-cat','Desserts');
  await p.fill('#a-from','Jennifer');
  await p.fill('#a-serves','12');
  await p.fill('#a-prep','10 min');
  await p.locator('#a-ing-0').fill('250 g oats');
  await p.click('[data-key="ingredients"][data-act="aadd"]');
  await p.waitForTimeout(150);
  await p.locator('#a-ing-1').fill('1/2 cup golden syrup');
  await p.locator('#a-step-0').fill('Melt the butter and syrup, stir in the oats, bake 25 minutes.');
  await p.click('[data-act="add-save"]');
  await p.waitForTimeout(500);
  chk('navigates to the new recipe', p.url().includes('#test-flapjacks'), p.url());
  chk('title rendered', (await p.locator('.r-title').textContent()).includes('Test Flapjacks'));
  chk('servings honoured', (await p.locator('.servcard__value').textContent()).includes('12'));
  chk('eyebrow shows contributor + course', (await p.locator('.r-eyebrow').textContent()).toLowerCase().includes('jennifer'));
  const ls=await p.evaluate(()=>JSON.parse(localStorage.getItem('kt.recipes')||'[]'));
  chk('persisted to kt.recipes', ls.some(r=>r.id==='test-flapjacks'));
  chk('servings stored as integer', ls.find(r=>r.id==='test-flapjacks').servings===12);

  console.log('\n== New recipe scales like any other ==');
  const before=await p.locator('.checkrow__text').first().textContent();
  await p.click('[data-act="serv+"]'); await p.waitForTimeout(200);
  const after=await p.locator('.checkrow__text').first().textContent();
  chk('quantity rescales', before!==after, before+' -> '+after);

  console.log('\n== It appears in Menu and search ==');
  await p.goto(B+'/index.html#menu');
  await p.waitForSelector('.rcard');
  chk('49 recipes now', await p.locator('.rcard').count()===49, String(await p.locator('.rcard').count()));
  await p.goto(B+'/index.html');
  await p.waitForSelector('#main-search');
  await p.fill('#main-search','flapjack');
  await p.waitForTimeout(250);
  chk('findable by search', await p.locator('.rcard').count()===1);

  console.log('\n== Survives reload ==');
  await p.reload(); await p.waitForSelector('.main__title');
  await p.goto(B+'/index.html#test-flapjacks');
  await p.waitForSelector('.r-title');
  chk('still there after reload', (await p.locator('.r-title').textContent()).includes('Flapjacks'));

  console.log('\n== Link import: bad input ==');
  await p.goto(B+'/index.html#add');
  await p.waitForSelector('.pathbtn');
  await p.click('[data-key="link"]');
  await p.waitForSelector('#a-url');
  await p.fill('#a-url','not a url');
  await p.click('[data-act="add-fetch"]');
  await p.waitForTimeout(400);
  chk('rejects a non-URL clearly', (await p.locator('.notice--bad').textContent()).includes('web address'));
  const disclosure = await p.locator('.addscreen__note').textContent();
  chk('every relay is named in the disclosure, pre-request',
      ['allorigins.win','corsproxy.io','r.jina.ai'].every(n=>disclosure.includes(n)), disclosure.slice(0,80));

  console.log('\n== Link import: JSON-LD parsing (mocked relay) ==');
  await ctx.route('**/api.allorigins.win/**', route => route.fulfill({
    status:200, contentType:'text/html',
    body:`<html><head><script type="application/ld+json">${JSON.stringify({
      "@context":"https://schema.org","@type":"Recipe",
      name:"Mock Lemon Cake", recipeYield:"8 servings",
      prepTime:"PT20M", cookTime:"PT1H10M", recipeCategory:"Dessert",
      recipeIngredient:["2 cups flour","1 1/2 cups sugar","3 lemons"],
      recipeInstructions:[{"@type":"HowToStep",text:"Cream the butter and sugar."},{"@type":"HowToStep",text:"Bake for 70 minutes."}],
      description:"A tart, sticky loaf."
    })}<\/script></head><body></body></html>`
  }));
  await p.fill('#a-url','https://example.com/lemon-cake');
  await p.click('[data-act="add-fetch"]');
  await p.waitForSelector('#a-title',{timeout:15000});
  chk('title extracted', (await p.inputValue('#a-title'))==='Mock Lemon Cake');
  chk('servings from recipeYield', (await p.inputValue('#a-serves'))==='8');
  chk('ISO duration made readable', (await p.inputValue('#a-cook'))==='1 hr 10 min', await p.inputValue('#a-cook'));
  chk('category mapped from JSON-LD', (await p.inputValue('#a-cat'))==='Desserts', await p.inputValue('#a-cat'));
  chk('3 ingredients', await p.locator('[data-k="ingredients"][data-act="adl"]').count()===3);
  chk('2 steps', await p.locator('[data-k="steps"][data-act="adl"]').count()===2);
  chk('flagged for review', (await p.locator('.panel--flag').textContent()).includes('check it against the original'));
  chk('names which relay answered', (await p.locator('.panel--flag').textContent()).includes('allorigins.win'), (await p.locator('.panel--flag').textContent()).slice(0,90));

  console.log('\n== Link import: page without recipe data ==');
  await p.evaluate(()=>{try{sessionStorage.removeItem('kt.addDraft')}catch(e){}});
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  await p.click('.addpill');
  await p.waitForSelector('.pathbtn');
  await p.click('[data-key="link"]');
  await ctx.route('**/api.allorigins.win/**', route => route.fulfill({status:200,contentType:'text/html',body:'<html><body>nothing here</body></html>'}));
  await p.fill('#a-url','https://example.com/blog');
  await p.click('[data-act="add-fetch"]');
  await p.waitForTimeout(1200);
  chk('explains the failure, offers alternatives', /Paste the recipe text below/.test(await p.locator('.notice--bad').textContent()), (await p.locator('.notice--bad').textContent()).slice(0,60));

  console.log('\n== Photo path UI ==');
  await p.evaluate(()=>{try{sessionStorage.removeItem('kt.addDraft')}catch(e){}});
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  await p.click('.addpill');
  await p.waitForSelector('.pathbtn');
  await p.click('[data-key="photo"]');
  await p.waitForSelector('#a-photo');
  chk('read button disabled with no photo', await p.locator('[data-act="add-ocr"]').isDisabled());
  chk('says the photo stays on device', (await p.locator('.addscreen__note').textContent()).includes('never uploaded'));
  await p.click('[data-act="add-back"]');
  await p.waitForTimeout(250);
  chk('back works', await p.locator('.pathbtn').count()===3);

  console.log('\n== Likely duplicates warn, never block (task 070) ==');
  await p.evaluate(()=>{try{sessionStorage.removeItem('kt.addDraft')}catch(e){}});
  await p.goto(B+'/index.html#add'); await p.waitForSelector('.pathbtn');
  await p.click('[data-key="review"]'); await p.waitForSelector('#a-title');
  await p.fill('#a-title','Scottish Tablet');
  await p.click('[data-act="add-save"]'); await p.waitForTimeout(400);
  chk('warning names the existing recipe', /Scottish Tablet/.test(await p.locator('.panel--flag').textContent()));
  chk('not saved yet', p.url().endsWith('#add'));
  chk('offers to open the existing one', await p.locator('.panel--flag a[href="#scottish-tablet"]').count()===1);
  await p.click('[data-act="add-save-anyway"]'); await p.waitForTimeout(500);
  chk('save anyway saves', /#scottish-tablet-2$/.test(p.url()), p.url());
  await p.evaluate(()=>localStorage.removeItem('kt.recipes'));
  await p.goto(B+'/index.html#add'); await p.reload(); await p.waitForSelector('.pathbtn');

  console.log('\n== Two cards, one recipe (task 066) ==');
  /* A stub recogniser stands in for Tesseract (the real one runs in
     tests/ocr-live.js); what's under test is the multi-photo flow. */
  const ctx2 = await br.newContext({...devices['iPhone 13']});
  const p2 = await ctx2.newPage();
  await p2.addInitScript(() => {
    window.Tesseract = {
      recognize: (file) => new Promise(res => {
        const fr = new FileReader();
        fr.onload = () => res({ data: { text:
          file.name === 'card1.jpg'
            ? 'Two Card Scones\nIngredients\n2 cups flour\n1 cup milk'
            : 'Instructions\nMix everything.\nBake at 400 for 15 minutes.'
        } });
        fr.readAsArrayBuffer(file);
      })
    };
  });
  await p2.goto(B+'/index.html#add');
  await p2.waitForSelector('.pathbtn');
  await p2.click('[data-key="photo"]');
  await p2.waitForSelector('#a-photo');
  const addCard = name => p2.evaluate(async n => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 300;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 400, 300);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
    const input = document.getElementById('a-photo');
    const dt = new DataTransfer();
    dt.items.add(new File([blob], n, { type: 'image/jpeg' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, name);
  await addCard('card1.jpg'); await p2.waitForTimeout(300);
  chk('first photo listed', await p2.locator('.pagelist__row').count()===1);
  chk('label flips to "Add another photo"', (await p2.locator('.field__label').first().textContent())==='Add another photo');
  await addCard('card2.jpg'); await p2.waitForTimeout(300);
  chk('second photo listed', await p2.locator('.pagelist__row').count()===2);
  chk('read button says photos', (await p2.locator('[data-act="add-ocr"]').textContent()).includes('photos'));
  await p2.click('[data-act="add-ocr"]');
  await p2.waitForSelector('#a-title', { timeout: 20000 });
  chk('title from card 1', (await p2.inputValue('#a-title'))==='Two Card Scones', await p2.inputValue('#a-title'));
  chk('steps from card 2', await p2.locator('[data-k="steps"][data-act="adl"]').count()===2, String(await p2.locator('[data-k="steps"][data-act="adl"]').count()));
  chk('flag names both photos', (await p2.locator('.panel--flag').textContent()).includes('2 photos'));
  await p2.click('[data-act="add-save"]');
  await p2.waitForTimeout(700);
  chk('recipe page opens', await p2.locator('.r-title').count()===1);
  chk('hero from page one', await p2.locator('.herobtn .r-hero').count()===1);
  chk('second card shown whole', await p2.locator('.r-page').count()===1, String(await p2.locator('.r-page').count()));
  const pages = await p2.evaluate(() => new Promise(res => {
    const r = indexedDB.open('kt', 1);
    r.onsuccess = () => {
      const g = r.result.transaction('images').objectStore('images').get('two-card-scones');
      g.onsuccess = () => res(Array.isArray(g.result) ? g.result.length : (g.result ? 1 : 0));
    };
  }));
  chk('both pages retained in the store', pages===2, String(pages));
  await ctx2.close();

  console.log('\n== A half-finished import survives a refresh (task 084) ==');
  await p.click('[data-key="review"]'); await p.waitForSelector('#a-title');
  await p.fill('#a-title','Half Finished Pie');
  await p.fill('#a-ing-0','3 apples');
  await p.waitForTimeout(300);
  await p.reload(); await p.waitForSelector('#a-title', {timeout: 10000});
  chk('title survives the refresh', (await p.inputValue('#a-title'))==='Half Finished Pie', await p.inputValue('#a-title'));
  chk('ingredient survives the refresh', (await p.inputValue('#a-ing-0'))==='3 apples');
  chk('still not saved', await p.evaluate(()=>localStorage.getItem('kt.recipes')===null));
  await p.click('[data-act="add-save"]'); await p.waitForTimeout(500);
  chk('saving clears the snapshot', await p.evaluate(()=>sessionStorage.getItem('kt.addDraft')===null));
  await p.evaluate(()=>localStorage.removeItem('kt.recipes'));

  console.log('\n== Every relay dead, paste still saves (task 086) ==');
  await p.goto(B+'/index.html#add'); await p.reload(); await p.waitForSelector('.pathbtn');
  await p.click('[data-key="link"]'); await p.waitForSelector('#a-url');
  await p.fill('#a-url','https://example.com/unreachable');
  await p.click('[data-act="add-fetch"]');
  await p.waitForSelector('.notice--bad', {timeout: 20000});
  chk('failure points at the paste box', /Paste the recipe text/i.test(await p.locator('.notice--bad').textContent()));
  await p.fill('#a-paste','Offline Flapjacks\nIngredients\n1 cup oats\n2 tbsp syrup\nInstructions\nMix.\nBake for 20 minutes.');
  await p.waitForTimeout(200);
  await p.click('[data-act="add-paste"]');
  await p.waitForSelector('#a-title', {timeout: 10000});
  chk('paste parsed with no network at all', (await p.inputValue('#a-title'))==='Offline Flapjacks');
  await p.click('[data-act="add-save"]'); await p.waitForTimeout(500);
  chk('saved end to end', /#offline-flapjacks$/.test(p.url()), p.url());
  chk('recipe is real', (await p.locator('.r-title').textContent())==='Offline Flapjacks');
  await p.evaluate(()=>localStorage.removeItem('kt.recipes'));
  await p.goto(B+'/index.html#add'); await p.reload(); await p.waitForSelector('.pathbtn');

  console.log('\n== Tap targets on the add screen ==');
  await p.click('[data-key="review"]');
  await p.waitForSelector('#a-title');
  const small=await p.evaluate(()=>{const bad=[];document.querySelectorAll('button,a[href],input,select,textarea').forEach(el=>{const r=el.getBoundingClientRect();if(r.height>0&&r.height<44)bad.push((el.id||el.className)+' h='+r.height.toFixed(1));});return bad;});
  chk('nothing under 44px', small.length===0, small.join(', '));

  chk('no JS errors', errs.length===0, errs.join(' | '));
  await br.close();
  console.log('\n'+'='.repeat(50)+'\nPASS: '+pass+'   FAIL: '+fail+'\n'+'='.repeat(50));
  process.exit(fail?1:0);
})();
