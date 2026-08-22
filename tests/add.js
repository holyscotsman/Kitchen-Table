const { chromium, devices } = require('playwright');
const B = process.env.KT_BASE || 'http://127.0.0.1:8899';
let pass=0,fail=0;
const chk=(n,c,e='')=>c?(pass++,console.log('  PASS '+n)):(fail++,console.log('  FAIL '+n+(e?' :: '+e:'')));
(async()=>{
  const br=await chromium.launch(process.env.KT_CHROMIUM ? { executablePath: process.env.KT_CHROMIUM } : {});
  const ctx=await br.newContext({...devices['iPhone 13']});
  /* Hermetic: the kitchen server is never poked from CI — the app's
     ready-list fetch on #add fails silently, exactly like offline. */
  await ctx.route('**/*.onrender.com/**', r => r.abort('failed'));
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
  chk('four entry paths', await p.locator('.pathbtn').count()===4);
  chk('one h1', await p.locator('h1').count()===1);

  console.log('\n== Type it in ==');
  await p.click('[data-key="review"]');
  await p.waitForSelector('#a-title');
  chk('review form appears', true);
  chk('title labelled', await p.locator('label[for="a-title"]').count()===1);
  chk('course select', await p.locator('#a-cat').count()===1);
  chk('serves numeric', await p.getAttribute('#a-serves','type')==='number');
  {
    /* R3 — servings are taps, not a number-pad wrestle: the recipe screen's
       stepper grammar beside the field, typing still allowed. */
    chk('serves has a one-tap stepper', await p.locator('[data-act="ad-serv"]').count()===2);
    const bb = await p.locator('[data-act="ad-serv"][data-d="1"]').boundingBox();
    chk('stepper meets the 44px floor', bb.width>=44 && bb.height>=44, JSON.stringify(bb));
    const before = parseInt(await p.inputValue('#a-serves'),10);
    await p.click('[data-act="ad-serv"][data-d="1"]');
    chk('one tap, one more serving', parseInt(await p.inputValue('#a-serves'),10)===before+1);
    await p.click('[data-act="ad-serv"][data-d="-1"]');
    chk('and back down', parseInt(await p.inputValue('#a-serves'),10)===before);
    await p.fill('#a-serves','1'); await p.dispatchEvent('#a-serves','input');
    await p.click('[data-act="ad-serv"][data-d="-1"]');
    chk('never steps below one person', parseInt(await p.inputValue('#a-serves'),10)===1);
  }
  await p.fill('#a-serves','4'); await p.dispatchEvent('#a-serves','input');
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
  chk('back works', await p.locator('.pathbtn').count()===4);

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
  /* Hermetic: the kitchen server is never poked from CI — the app's
     ready-list fetch on #add fails silently, exactly like offline. */
  await ctx2.route('**/*.onrender.com/**', r => r.abort('failed'));
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

  console.log('\n== The screenshot parser survives OCR reality (Jason bug) ==');
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  await p.evaluate(()=>sessionStorage.clear());
  await p.goto(B+'/index.html#add'); await p.reload(); await p.waitForSelector('.pathbtn');
  await p.click('[data-key="link"]'); await p.waitForSelector('#a-paste');
  const nasty=['9:41','< Back',"Granny's Shortbread",'Serves 8','Prep: 10 min',
    '1NGRED1ENTS','e 250 g butter','e 125 g caster sugar','e 375 g plain flour',
    'D1RECT1ONS','1. Preheat the oven to 160C.','2. Cream butter and sugar.',
    '3. Work in the flour and press into a tin.','4. Bake 40 minutes until pale gold.'].join('\n');
  await p.fill('#a-paste', nasty);
  await p.click('[data-act="add-paste"]'); await p.waitForSelector('#a-title');
  chk('title skips the screenshot chrome', (await p.inputValue('#a-title'))==="Granny's Shortbread");
  chk('Serves 8 claimed from the text', (await p.inputValue('#a-serves'))==='8');
  chk('prep time claimed', (await p.inputValue('#a-prep'))==='10 min');
  const nIngs=await p.locator('[id^=a-ing-]').count();
  chk('bullet ghosts (e-as-•) stripped; 3 clean ingredients', nIngs===3 && (await p.inputValue('#a-ing-0'))==='250 g butter', String(nIngs));
  chk('digit-substituted headings recognised; 4 steps', await p.locator('[id^=a-step-]').count()===4);
  chk('clock and Back never became ingredients', !(await p.evaluate(()=>[...document.querySelectorAll('[id^=a-ing-]')].some(e=>/9:41|Back/.test(e.value)))));
  await p.click('[data-act="add-back"]');

  console.log('\n== 067: tag autocomplete ==');
  await p.evaluate(async()=>{const l=await(await fetch('recipes.json')).json();l[0].tags=['Italian','comfort food'];localStorage.setItem('kt.recipes',JSON.stringify(l));});
  const rid=await p.evaluate(async()=>(await(await fetch('recipes.json')).json())[1].id);
  await p.goto(B+'/index.html#'+rid); await p.reload(); await p.waitForSelector('.modestrip');
  await p.click('[data-act="toggle-edit"]'); await p.waitForSelector('#e-tags');
  await p.fill('#e-tags',''); await p.type('#e-tags','ital');
  await p.waitForSelector('.sugchip');
  chk('typing "ital" offers the existing Italian, canonical case', (await p.locator('.sugchip').first().textContent())==='Italian');
  await p.click('.sugchip');
  chk('tap completes the segment with the existing tag', (await p.inputValue('#e-tags'))==='Italian, ');
  chk('suggestion row clears once the segment is taken', await p.evaluate(()=>document.querySelector('.sugrow').innerHTML===''));
  await p.type('#e-tags','Italian');
  chk('an exact, already-present tag is not re-offered', await p.evaluate(()=>document.querySelector('.sugrow').innerHTML===''));
  await p.click('[data-act="save"]');
  chk('saved through the normal path', JSON.stringify(await p.evaluate(()=>JSON.parse(localStorage.getItem('kt.recipes'))[1].tags))==='["Italian"]');
  await p.evaluate(()=>localStorage.removeItem('kt.recipes'));

  console.log('\n== The course was the one guess the app never owned up to (R73) ==');
  {
    /* Every other guess an import makes says so. Servings that weren't
       found are flagged; a split between the two lists that had no headings
       to go on is flagged; a missing title is flagged. The **course** was
       not: `guessCategory` falls through to "Dinner" for anything it cannot
       read, and nothing said a word — so shortbread and tomato soup both
       arrive filed under Dinner, quietly, and `082` explicitly says a guess
       is flagged rather than silent. `R65` made the field editable because
       the app rewrites it; this is the other half — admitting that it did.
       Where the course IS given, nothing changes: a stated course is not a
       guess and must not be flagged, which is the check that stops this
       becoming noise on every import. */
    const paste = async (text) => {
      await p.goto(B + '/index.html#add');
      await p.evaluate(() => sessionStorage.clear());
      await p.reload();
      await p.waitForSelector('.pathbtn');
      await p.click('[data-key="link"]');
      await p.waitForSelector('#a-paste');
      await p.fill('#a-paste', text);
      await p.waitForTimeout(250);
      await p.click('[data-act="add-paste"]');
      await p.waitForSelector('#a-title', { timeout: 8000 }).catch(() => {});
      return p.evaluate(() => ({
        cat: (document.querySelector('#a-cat') || {}).value,
        flags: [...document.querySelectorAll('.panel--flag li')].map(e => e.textContent.trim())
      }));
    };

    const shortbread = await paste(
      "Granny's Shortbread\nIngredients:\n250g butter\n110g caster sugar\n" +
      "Method:\nCream the butter and sugar.\nBake 45 minutes.");
    chk('a pasted recipe with no course still lands somewhere',
      shortbread.cat === 'Dinner', shortbread.cat);
    chk('and says the course was assumed',
      shortbread.flags.some(f => /^Course —/.test(f)), JSON.stringify(shortbread.flags));
    chk('in the same words as the servings guess beside it',
      shortbread.flags.some(f => /Course — .*assumed/i.test(f)) &&
      shortbread.flags.some(f => /Servings — .*assumed/i.test(f)),
      JSON.stringify(shortbread.flags));

    /* And the counterpart, so this cannot become noise: a course the source
       actually states is not a guess. */
    const stated = await paste(
      "Sticky Toffee Pudding\nCategory: Dessert\nIngredients:\n200g dates\n" +
      "Method:\nSteam for an hour.");
    chk('a course the source states is used',
      stated.cat === 'Desserts', stated.cat);
    chk('and is not flagged as a guess',
      !stated.flags.some(f => /^Course —/.test(f)), JSON.stringify(stated.flags));
  }


  console.log('\n== Typing a recipe in guesses like an import, but never said so (R121) ==');
  {
    /* The Add screen's own save read
       `Math.min(40, Math.max(1, parseInt(d.servings, 10) || 4))`, so a
       serving count left blank silently became **4** and one typed past the
       limit silently became **40**. Measured: both, with an empty `flagged`
       list and nothing said.

       What makes it wrong rather than merely terse is that this app already
       knows how to do it properly. Every import path that cannot read a
       count defaults to 4 and **flags it** — "Servings — no count was found;
       4 was assumed." — which the recipe page then shows as a Double-check
       chip beside the field (`082`). An import cannot ask; a person typing
       can simply leave the box empty, and this is the one path where the
       guess was made in silence.

       So: a blank count is still 4, because the schema needs one, but it is
       disclosed in the words the app already uses; and a count typed past
       the limit is clamped and said, exactly as `R119` settled for Edit. */
    const aErrs = [];
    /* A fresh context per case: these save real recipes into the overlay, and
       a draft or a book left over from the last one is not the thing under
       test. */
    const typeIn = async (servesValue) => {
      const ctxA = await br.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
      const pA = await ctxA.newPage();
      pA.on('pageerror', e => aErrs.push(e.message));
      await pA.goto(B + '/index.html#add');
      await pA.waitForTimeout(500);
      await pA.click('[data-act="add-path"][data-key="review"]', { timeout: 5000 }).catch(() => {});
      await pA.waitForSelector('#a-title', { timeout: 5000 }).catch(() => {});
      await pA.fill('#a-title', 'Typed Recipe ' + (servesValue || 'blank'));
      await pA.fill('#a-ing-0', '1 cup flour').catch(() => {});
      await pA.fill('#a-step-0', 'Bake it.').catch(() => {});
      await pA.fill('#a-serves', servesValue).catch(() => {});
      /* If the field did not take the value there is nothing to measure, and
         a silent miss would read as a pass. */
      const inField = await pA.inputValue('#a-serves').catch(() => 'MISSING');
      await pA.evaluate(() => {
        const b = [...document.querySelectorAll('button')]
          .find(x => /^save/i.test(x.innerText.trim()));
        if (b) b.click();
      });
      await pA.waitForTimeout(900);
      const out = await pA.evaluate(() => {
        const rs = JSON.parse(localStorage.getItem('kt.recipes') || '[]');
        const r = rs[rs.length - 1] || {};
        /* The visible notice, not the live region: a save on this screen
           ends in a navigation, and the route announcement rightly owns the
           ear at that moment — the reader needs to know where they landed.
           What must survive is the sentence on the page they landed on. */
        const seen = [...document.querySelectorAll('#app .notice, #app .hint')]
          .map(x => x.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ~ ');
        return { servings: r.servings, flagged: r.flagged || [], said: seen };
      });
      out.inField = inField;
      await ctxA.close();
      return out;
    };

    const blank = await typeIn('');
    chk('a count left blank still gets one, because the book needs one',
      blank.servings === 4, String(blank.servings));
    chk('but it is written down as an assumption, not passed off as typed',
      blank.flagged.some(f => /^Servings —/.test(f)), JSON.stringify(blank.flagged));
    chk('in the same words every other guessed count uses',
      blank.flagged.some(f => /no count was found/.test(f)), JSON.stringify(blank.flagged));

    const over = await typeIn('300');
    chk('the field really held the count being tested', over.inField === '300',
      JSON.stringify(over.inField));
    chk('a count typed past the limit comes back to the highest allowed',
      over.servings === 40, String(over.servings));
    chk('and the reader is told it was, on the page they land on',
      /40/.test(over.said) && /serv/i.test(over.said), over.said || '(nothing shown)');
    chk('while an ordinary save lands with nothing to explain',
      !/saved as/i.test((await typeIn('6')).said));

    const fine = await typeIn('6');
    chk('an ordinary count is saved exactly as typed', fine.servings === 6,
      String(fine.servings));
    chk('with nothing assumed and nothing flagged about it',
      !fine.flagged.some(f => /^Servings —/.test(f)), JSON.stringify(fine.flagged));

    chk('nothing threw', aErrs.length === 0, aErrs.join(' | '));
  }

  chk('no JS errors', errs.length===0, errs.join(' | '));
  await br.close();
  console.log('\n'+'='.repeat(50)+'\nPASS: '+pass+'   FAIL: '+fail+'\n'+'='.repeat(50));
  process.exit(fail?1:0);
})();
