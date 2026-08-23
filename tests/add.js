const { chromium, devices } = require('playwright');
const { freshContext } = require('./ctx');
const B = process.env.KT_BASE || 'http://127.0.0.1:8899';
let pass=0,fail=0;
const chk=(n,c,e='')=>c?(pass++,console.log('  PASS '+n)):(fail++,console.log('  FAIL '+n+(e?' :: '+e:'')));
(async()=>{
  const br=await chromium.launch(process.env.KT_CHROMIUM ? { executablePath: process.env.KT_CHROMIUM } : {});
  const ctx=await freshContext(br, {...devices['iPhone 13']});
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

  /* `R156` — the warning compares titles after stripping every character
     that is not a-z0-9, which DELETED accents rather than folding them.
     "Crème Brûlée" normalised to "crme brle" and shared not one token with a
     hand-typed "Creme Brulee": overlap 0.00, no warning, two copies in the
     book. It needs every word accented to go wrong — "Jalapeño Poppers"
     still scores 0.50 on its second word — so it is narrow, and the warning
     is advisory either way. Worth one word because the app carries `fold`
     precisely so accents do not matter, and this was the only comparison in
     it that did not use it. */
  await p.evaluate(()=>{try{sessionStorage.removeItem('kt.addDraft')}catch(e){}});
  await p.evaluate(async()=>{
    const l = await (await fetch('recipes.json')).json();
    l[0].title = 'Crème Brûlée';
    localStorage.setItem('kt.recipes', JSON.stringify(l));
  });
  await p.goto(B+'/index.html#add'); await p.reload(); await p.waitForSelector('.pathbtn');
  await p.click('[data-key="review"]'); await p.waitForSelector('#a-title');
  await p.fill('#a-title','Creme Brulee');
  await p.click('[data-act="add-save"]'); await p.waitForTimeout(400);
  /* Asserted the way the checks above assert it — still on #add, with the
     warning naming the recipe. Reading a panel COUNT was the first version
     and it detected the fault only sideways: under the mutation the recipe
     saves, and the count it reported (2) came from the flag panels on the
     recipe page it had navigated to, not from a warning at all. */
  chk('an accented title is recognised as the same recipe',
    p.url().endsWith('#add') &&
    /Cr[eè]me/.test(await p.locator('.panel--flag').first().textContent()),
    p.url());
  /* The floor: folding must not make everything look like everything. */
  await p.evaluate(()=>{try{sessionStorage.removeItem('kt.addDraft')}catch(e){}});
  await p.goto(B+'/index.html#add'); await p.reload(); await p.waitForSelector('.pathbtn');
  await p.click('[data-key="review"]'); await p.waitForSelector('#a-title');
  await p.fill('#a-title','Utterly Unrelated Pie');
  await p.fill('#a-ing-0','1 cup flour');
  await p.click('[data-act="add-save"]'); await p.waitForTimeout(500);
  chk('and an unrelated title still saves without a warning',
    /#utterly-unrelated-pie$/.test(p.url()), p.url());
  await p.evaluate(()=>localStorage.removeItem('kt.recipes'));
  await p.goto(B+'/index.html#add'); await p.reload(); await p.waitForSelector('.pathbtn');

  console.log('\n== Two cards, one recipe (task 066) ==');
  /* A stub recogniser stands in for Tesseract (the real one runs in
     tests/ocr-live.js); what's under test is the multi-photo flow. */
  const ctx2 = await freshContext(br, {...devices['iPhone 13']});
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

  console.log('\n== R170: the suggestion went silent at the one word that needed it ==');
  {
    /* `067`'s own comment names the thing it exists to prevent: existing tags
       surface as you type "so ital becomes the Italian that already exists
       INSTEAD OF A NEW LOWERCASE TWIN". The filter excluded any tag matching
       the segment case-insensitively, so the reader who typed `italian` in
       full — the twin itself — was offered nothing at all.

       Nothing downstream folds a tag: `allTags` keys by the exact string,
       `menuMatches` compares with indexOf, and a chip on a recipe links to
       that exact spelling. So this suggestion is the whole of the defence,
       and it stood down at the only moment it was needed.

       The block above never asked. It types "ital", takes the chip, and then
       types "Italian" into a field that already reads "Italian, " — which is
       excluded by the already-listed rule, not by the folded comparison. So
       the one line this round changes had no check on it in either
       direction. */
    /* Bounded settles rather than gates. The suggestion row is rebuilt
       synchronously by the input handler, so there is nothing to wait for
       once typing has returned — but a version that offers NOTHING must
       fail on the assertion, by name, rather than abort the suite on a
       30-second timeout. The selector is proven to exist by the cases that
       expect a chip, so this is not `R148`'s wait for a selector that never
       was. */
    const settle = async (sel, state) => { try { await p.waitForSelector(sel, state ? {state, timeout:2000} : {timeout:2000}); } catch (e) {} };
    const sug = () => p.evaluate(()=>[...document.querySelectorAll('.sugrow .sugchip')].map(b=>b.textContent));
    /* The shipped book is tagged — 37 of the 48 carry one — so the seed
       clears them and puts back exactly two. The first version of this block
       did not, and measured the file instead of the fixture: `AIR FRYER`
       offered `["air fryer","Air Fryer"]` because the book really holds the
       lower-case one on eight recipes, and `#menu?tag=Italian` drew three
       cards rather than one. The seventh check this session to assume rather
       than read. */
    await p.evaluate(async()=>{const l=await(await fetch('recipes.json')).json();
      l.forEach(r=>{delete r.tags;});
      l[0].tags=['Italian','Air Fryer'];localStorage.setItem('kt.recipes',JSON.stringify(l));});
    const rid2=await p.evaluate(async()=>(await(await fetch('recipes.json')).json())[1].id);
    await p.goto(B+'/index.html#'+rid2); await p.reload(); await p.waitForSelector('.modestrip');
    await p.click('[data-act="toggle-edit"]'); await p.waitForSelector('#e-tags');

    await p.fill('#e-tags',''); await p.type('#e-tags','italian');
    await settle('.sugchip');
    chk('a tag typed out in the wrong case is offered the book’s own spelling',
        JSON.stringify(await sug())==='["Italian"]', JSON.stringify(await sug()));
    await p.click('.sugchip');
    chk('and tapping it replaces what was typed', (await p.inputValue('#e-tags'))==='Italian, ',
        await p.inputValue('#e-tags'));

    await p.fill('#e-tags',''); await p.type('#e-tags','AIR FRYER');
    await settle('.sugchip');
    chk('it folds the other way too — AIR FRYER offers Air Fryer',
        JSON.stringify(await sug())==='["Air Fryer"]', JSON.stringify(await sug()));

    /* The floor, and it has to prove the row is live before it asserts the
       row is empty: `fill('')` empties it too, so a version that had stopped
       suggesting anything would pass an unguarded absence check. */
    await p.fill('#e-tags',''); await p.type('#e-tags','Itali');
    await settle('.sugchip');
    await p.type('#e-tags','an');
    await settle('.sugchip','detached');
    chk('(floor) a tag typed exactly as the book has it is not offered back',
        (await sug()).length===0, JSON.stringify(await sug()));

    /* The stakes, measured rather than argued: a twin that gets past the chip
       is a second tag for good, and the two recipes stop being findable
       together under the spelling the book already uses. */
    await p.fill('#e-tags',''); await p.type('#e-tags','italian');
    await p.click('[data-act="save"]');
    await p.waitForSelector('[data-act="save"]:has-text("Saved")');
    const t1=await p.evaluate(()=>JSON.parse(localStorage.getItem('kt.recipes'))[1].tags);
    chk('(floor) nothing downstream folds it — the twin is stored as typed',
        JSON.stringify(t1)==='["italian"]', JSON.stringify(t1));
    await p.goto(B+'/index.html#menu?tag=Italian'); await p.waitForSelector('.mhead');
    const n=await p.locator('.rcard').count();
    chk('(floor) and the twin is invisible under the book’s own spelling', n===1, String(n));
    await p.goto(B+'/index.html#menu?tag=italian'); await p.waitForSelector('.mhead');
    const n2=await p.locator('.rcard').count();
    chk('(floor) while its own spelling finds only itself', n2===1, String(n2));
    await p.evaluate(()=>localStorage.removeItem('kt.recipes'));

    /* And the same question of the book as it actually ships, with no seed at
       all — the tag is taken FROM the file rather than typed here, so this
       cannot go stale when the content changes. It is reachable today: the
       published book carries `air fryer` in lower case on eight recipes
       beside `Italian`, `American` and `French` in title case, so a reader
       typing `Air Fryer` was minting a twin with nothing said. */
    const shipped=await p.evaluate(async()=>{
      const l=await(await fetch('recipes.json')).json();
      const seen={}; l.forEach(r=>(r.tags||[]).forEach(t=>{seen[t]=(seen[t]||0)+1;}));
      const t=Object.keys(seen).sort((a,b)=>seen[b]-seen[a])[0];
      return {tag:t, id:l.find(r=>(r.tags||[]).indexOf(t)>-1).id};
    });
    chk('(floor) the shipped book really is tagged, or the case below is vacuous',
        !!shipped.tag, JSON.stringify(shipped));
    await p.goto(B+'/index.html#'+shipped.id); await p.reload(); await p.waitForSelector('.modestrip');
    await p.click('[data-act="toggle-edit"]'); await p.waitForSelector('#e-tags');
    await p.fill('#e-tags',''); await p.type('#e-tags', shipped.tag.toUpperCase());
    await settle('.sugchip');
    chk('a shipped tag shouted back at the book is offered as the book spells it',
        (await sug()).indexOf(shipped.tag)>-1, JSON.stringify(await sug())+' want '+shipped.tag);
  }

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
      const ctxA = await freshContext(br, { ...devices['iPhone 13'], serviceWorkers: 'block' });
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


  console.log('\n== Fixing a flagged field on the review screen kept the flag anyway (R123) ==');
  {
    /* `R122` taught Edit mode to take a flag down when its field is answered.
       The review screen — the screen built for exactly that job, which shows
       the flags AND every field they name — still carried all of them through
       verbatim: `addFlags = (d.flagged || []).slice()`.

       So an import that could not find a title flags *"Title — none was found
       on the page; add one."*, the reader types one in the box right under
       the flag, presses Save, and the new recipe is born carrying a flag
       saying no title was found.

       No baseline is needed to know better, which is what keeps this cheap:
       four of the five flag kinds are answerable from what is being saved.
       "None was found" is false if the thing is now there; and the count's
       flag is not carried at all — `R121` re-adds it at save time exactly
       when the field was left blank, so regenerating beats inheriting.

       The course flag is the one real judgement call: it says *Dinner was
       assumed*, and if the category being saved is no longer Dinner the
       reader plainly changed it. If it is still Dinner, they either agreed or
       never looked, and nothing here can tell those apart — so it stands. */
    const ctxR = await freshContext(br, { ...devices['iPhone 13'], serviceWorkers: 'block' });
    const pR = await ctxR.newPage();
    const rErrs = []; pR.on('pageerror', e => rErrs.push(e.message));

    /* A draft as an importer would hand it over: nothing read, everything
       flagged. sessionStorage is where the Add screen keeps a draft. */
    const seedDraft = (patch) => pR.evaluate((p) => {
      /* The shape restoreAddDraft reads: the draft under `draft`, with the
         step that puts the review screen on show. Seeding the bare draft
         leaves the Add screen on its chooser and nothing to measure. */
      sessionStorage.setItem('kt.addDraft', JSON.stringify({ step: 'review',
        draft: Object.assign({
        title: '', category: 'Dinner', contributor: 'Joan', servings: 4,
        prepTime: '', cookTime: '', ingredients: [''], steps: [''],
        notes: '', source: '', tags: '',
        flagged: ['Title — none was found on the page; add one.',
                  'Ingredients — none were found; check the original page.',
                  'Steps — none were found; check the original page.',
                  'Servings — no count was found; 4 was assumed.',
                  'Course — none was given; Dinner was assumed. ' +
                  'Change it above if it belongs somewhere else.']
      }, p) }));
    }, patch);

    const saveReview = async (patch, fills) => {
      await pR.goto(B + '/index.html#add');
      await pR.waitForTimeout(400);
      await seedDraft(patch);
      await pR.goto(B + '/index.html#add');
      await pR.reload();
      await pR.waitForSelector('#a-title', { timeout: 8000 });
      for (const [sel, val] of fills) await pR.fill(sel, val).catch(() => {});
      await pR.evaluate(() => {
        const b = [...document.querySelectorAll('button')]
          .find(x => /^save/i.test(x.innerText.trim()));
        if (b) b.click();
      });
      await pR.waitForTimeout(900);
      return pR.evaluate(() => {
        const rs = JSON.parse(localStorage.getItem('kt.recipes') || '[]');
        const r = rs[rs.length - 1] || {};
        return { flagged: r.flagged || [], title: r.title,
                 category: r.category, servings: r.servings };
      });
    };

    const fixed = await saveReview({}, [
      ['#a-title', 'A Real Name'], ['#a-ing-0', '2 eggs'],
      ['#a-step-0', 'Whisk them.'], ['#a-serves', '6']]);
    chk('the review screen really saved what was typed into it',
      fixed.title === 'A Real Name' && fixed.servings === 6,
      JSON.stringify([fixed.title, fixed.servings]));
    chk('a title supplied on that screen answers the flag asking for one',
      !fixed.flagged.some(f => /^Title —/.test(f)), JSON.stringify(fixed.flagged));
    chk('ingredients supplied answer theirs',
      !fixed.flagged.some(f => /^Ingredients —/.test(f)), JSON.stringify(fixed.flagged));
    chk('steps supplied answer theirs',
      !fixed.flagged.some(f => /^Steps —/.test(f)), JSON.stringify(fixed.flagged));
    chk('and a count typed over the assumption answers its own',
      !fixed.flagged.some(f => /^Servings —/.test(f)), JSON.stringify(fixed.flagged));
    chk('while the course, left on the assumed one, keeps saying so',
      fixed.flagged.some(f => /^Course —/.test(f)), JSON.stringify(fixed.flagged));

    /* Change the course and its flag goes too. */
    const moved = await saveReview({}, [
      ['#a-title', 'Moved Course'], ['#a-ing-0', '2 eggs'], ['#a-step-0', 'Whisk.']]);
    await pR.waitForTimeout(100);
    const movedCat = await saveReview({ category: 'Baking' }, [
      ['#a-title', 'Baked Thing'], ['#a-ing-0', '2 eggs'], ['#a-step-0', 'Whisk.']]);
    chk('a course that is no longer the assumed one answers its flag',
      !movedCat.flagged.some(f => /^Course —/.test(f)), JSON.stringify(movedCat.flagged));

    /* And a reader who fixes nothing keeps every warning they were given. */
    const untouched = await saveReview({}, [['#a-title', 'Still Empty']]);
    chk('leaving the lists empty keeps the flags that say they are',
      untouched.flagged.some(f => /^Ingredients —/.test(f)) &&
      untouched.flagged.some(f => /^Steps —/.test(f)), JSON.stringify(untouched.flagged));
    chk('and leaving the count alone keeps its flag too',
      untouched.flagged.some(f => /^Servings —/.test(f)), JSON.stringify(untouched.flagged));

    /* `R160` — the same save, with the field names in the casing a model or
       a hand-edited recipes.json might actually use. `addAnswered` was keyed
       Title/Ingredients/Steps/Servings/Course while `flagField` handed back
       the word exactly as written, so not one of these could be answered —
       and every fixture in this block capitalises, which is why it never
       showed here either. */
    const lower = await saveReview({ flagged: [
      'title — none was found on the page; add one.',
      'ingredients — none were found; check the original page.',
      'steps — none were found; check the original page.',
      'servings — no count was found; 4 was assumed.'] }, [
      ['#a-title', 'Lower Case Flags'], ['#a-ing-0', '2 eggs'],
      ['#a-step-0', 'Whisk them.'], ['#a-serves', '6']]);
    chk('a flag whose field name is lowercase is answered like any other',
      lower.flagged.length === 0, JSON.stringify(lower.flagged));

    chk('nothing threw', rErrs.length === 0, rErrs.join(' | '));
    await ctxR.close();
  }

  chk('no JS errors', errs.length===0, errs.join(' | '));
  console.log('\n== The Add screen could not say anything (R129) ==');
  {
    /* Every other screen has had a notice slot since `S12` gathered the
       four hand-written `if (S.notice)` blocks into `noticeHtml`. This one
       never did — so `setNotice` on the Add screen wrote to a place nobody
       rendered.

       What that cost: `083` gave every review line a one-tap "send it to
       the other list", because a parser guesses the ingredients/steps split
       and on a photographed card it guesses wrong often. The tap moves the
       line to the bottom of the other list — off screen on any real
       import — and `setNotice("Moved to the instructions.")` was the whole
       confirmation that it went anywhere. It reached `liveMessage`, so a
       screen reader heard it; the eye got nothing at all. The reverse of
       `S12`'s rule, and the wrong way round for a line that just vanished
       from where the reader was looking. */
    const ctxM = await freshContext(br, { ...devices['iPhone 13'] });
    await ctxM.route('**/*.onrender.com/**', (r) => r.abort('failed'));
    const pM = await ctxM.newPage();
    const mErrs = []; pM.on('pageerror', (e) => mErrs.push(e.message));
    await pM.goto(B + '/index.html#add');
    await pM.waitForSelector('.pathbtn');
    await pM.click('[data-act="add-path"][data-key="review"]');
    await pM.waitForSelector('#a-title');
    await pM.fill('#a-ing-0', '1 cup flour');
    const before = await pM.locator('.addscreen .notice').count();
    chk('nothing is said before anything happens', before === 0, String(before));
    await pM.click('[data-act="amove"][data-key="ingredients"][data-i="0"]');
    await pM.waitForTimeout(300);
    const said = await pM.evaluate(() => {
      const n = document.querySelector('.addscreen .notice');
      return n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
    });
    chk('moving a review line to the other list now says so where it can be seen',
      /Moved to the instructions/.test(said), said || '(nothing rendered)');
    chk('and the line really moved',
      (await pM.inputValue('#a-step-0')) === '1 cup flour' ||
      (await pM.inputValue('#a-step-1')) === '1 cup flour',
      await pM.inputValue('#a-step-0'));
    chk('nothing threw', mErrs.length === 0, mErrs.join(' | '));
    await ctxM.close();
  }

  console.log('\n== The photo that would not fit said so to nobody (R130) ==');
  {
    /* `saveAdd` stages a photo under a placeholder key, because the recipe's
       id only exists once the title is known, and moves it across on Save:

         setImage(id, staged).then(function (err) { if (err) setNotice(err); });
         …
         location.hash = "#" + id;

       The comment above it says *"if the persist fails the recipe still
       saves and the failure is said out loud"*. On a phone with IndexedDB
       that holds: `idbPut` rejects on a database error event, which is a
       task, so the sentence lands after the route change and shows on the
       recipe page.

       On the fallback path it does not. With no IndexedDB, `setImage`
       returns `Promise.resolve(IMG_FULL_MSG)` — already resolved — so its
       `.then` is a MICROTASK and runs before the `hashchange` the line
       below queues. `onRoute` then does `S.notice = S.carry || ""` and
       wipes it. The photo is gone and the only sentence that would have
       said so is gone with it.

       That fallback is not hypothetical: CLAUDE.md records localStorage
       holding 12 of the 48 photos before `062` moved them, which is why the
       "no room" message exists at all. */
    /* The same one-pixel JPEG `tests/feat.js` uses for its photo path. */
    const JPG = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKAAAf/Z';

    /* Two shapes of full. `pair` is a phone where ONE copy of the photo
       fits and two do not — which is the state the old write-then-delete
       order manufactured out of a phone that had room. `any` is a phone
       that is genuinely full: nothing more fits at all. */
    const noRoom = async (killIdb, mode) => {
      const ctxQ = await freshContext(br, { ...devices['iPhone 13'] });
      await ctxQ.route('**/*.onrender.com/**', (r) => r.abort('failed'));
      await ctxQ.addInitScript((opt) => {
        const kill = opt.kill, mode = opt.mode;
        if (kill) {
          try {
            Object.defineProperty(window, 'indexedDB',
              { configurable: true, value: undefined });
          } catch (e) {}
        }
        /* Models the quota exactly as `saveAdd` meets it. Attaching writes
           ONE photo and fits. Save writes the same picture under the recipe's
           real id while the staged copy is still there — TWO copies, in one
           `kt.images` blob — and that is what does not fit. Nothing else is
           touched, so the recipe itself saves, which is the case the
           sentence exists for. */
        const set = Storage.prototype.setItem;
        let writes = 0;
        Storage.prototype.setItem = function (k, v) {
          if (k === 'kt.images') {
            let n = 0;
            try { n = Object.keys(JSON.parse(v) || {}).length; } catch (e) {}
            writes++;
            /* `pair`: two pictures at once are what does not fit.
               `any`: the attach fits and nothing after it does — a delete,
               which writes an empty store, still has to be allowed or the
               phone could never make room again. */
            const full = mode === 'pair' ? n >= 2 : (writes > 1 && n >= 1);
            if (full) {
              const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
            }
          }
          return set.call(this, k, v);
        };
      }, { kill: killIdb, mode: mode });
      const pQ = await ctxQ.newPage();
      const qErrs = []; pQ.on('pageerror', (e) => qErrs.push(e.message));
      await pQ.goto(B + '/index.html#add');
      await pQ.waitForSelector('.pathbtn');
      await pQ.click('[data-act="add-path"][data-key="review"]');
      await pQ.waitForSelector('#a-title');
      await pQ.fill('#a-title', 'Photo Quota Probe');
      await pQ.fill('#a-ing-0', '1 cup flour');
      await pQ.fill('#a-step-0', 'Mix it.');
      await pQ.setInputFiles('#a-photo-file',
        { name: 'p.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(JPG, 'base64') });
      await pQ.waitForTimeout(900);
      const atAttach = await pQ.evaluate(() => document.body.innerText);
      await pQ.click('[data-act="add-save"]');
      await pQ.waitForTimeout(1200);
      const out = {
        atAttach: atAttach,
        hash: await pQ.evaluate(() => location.hash),
        text: await pQ.evaluate(() => document.body.innerText),
        saved: await pQ.evaluate(() => {
          const raw = localStorage.getItem('kt.recipes');
          return raw ? JSON.parse(raw).some((r) => r.title === 'Photo Quota Probe') : false;
        }),
        photos: await pQ.evaluate(() => {
          const raw = localStorage.getItem('kt.images');
          try { return Object.keys(JSON.parse(raw) || {}); } catch (e) { return []; }
        }),
        hero: await pQ.locator('.r-hero').count(),
        errs: qErrs
      };
      await ctxQ.close();
      return out;
    };

    const pair = await noRoom(true, 'pair');
    chk('attaching the photo worked — one copy fits',
      !/isn’t room/.test(pair.atAttach),
      pair.atAttach.replace(/\s+/g, ' ').slice(0, 120));
    chk('the recipe saved', pair.saved === true);
    chk('and the reader is on it', /photo-quota-probe/.test(pair.hash), pair.hash);
    /* The picture never needed twice the room; the old order asked for it. */
    chk('and the photo came with it, because the move no longer needs two copies',
      pair.photos.length === 1 && pair.photos[0] === 'photo-quota-probe' && pair.hero === 1,
      JSON.stringify(pair.photos) + ' hero=' + pair.hero);
    chk('so nothing is said, because nothing went wrong',
      !/isn’t room on this phone/.test(pair.text),
      pair.text.replace(/\s+/g, ' ').slice(0, 160));
    chk('nothing threw', pair.errs.length === 0, pair.errs.join(' | '));

    const full = await noRoom(true, 'any');
    chk('on a phone that is genuinely full the recipe still saves',
      full.saved === true);
    chk('the photo is not there', full.photos.length === 0 && full.hero === 0,
      JSON.stringify(full.photos) + ' hero=' + full.hero);
    /* The half that was lost to a microtask: `setImage` resolves through an
       already-resolved promise on this path, so its `.then` ran before the
       hashchange and `onRoute` wiped the sentence. */
    chk('and the reader is told, rather than finding a recipe with no picture',
      /isn’t room on this phone/.test(full.text),
      full.text.replace(/\s+/g, ' ').slice(0, 200));
    chk('nothing threw there either', full.errs.length === 0, full.errs.join(' | '));
  }

  console.log('\n== R159: a staged photo lives exactly as long as its draft ==');
  {
    /* The Add screen stages a photo under `__new__`, because a recipe's id
       does not exist until its title does. The draft lives in
       sessionStorage; the photo lives in IndexedDB. Different lifetimes,
       and nothing reconciled them — so a photo outlived the draft it was
       picked for and was handed to whatever was typed next.

       Measured before the fix, in two taps: attach a photo, press the
       button that says "Start over", choose "Type it in", type a soup —
       and the photo was the soup's, saved under the soup's id. */
    const SHOT = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKAAAf/Z';
    /* Read the real store rather than the screen: a picture the app has
       stopped drawing but still holds is still on the phone, still counting
       against the quota the "no room" message exists for. */
    const keys = (pg) => pg.evaluate(() => new Promise((res) => {
      const rq = indexedDB.open('kt', 1);
      rq.onsuccess = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains('images')) return res([]);
        const all = db.transaction('images').objectStore('images').getAllKeys();
        all.onsuccess = () => res(all.result);
        all.onerror = () => res(['(read failed)']);
      };
      rq.onerror = () => res(['(open failed)']);
    }));
    const stage = async (pg) => {
      await pg.goto(B + '/index.html#add');
      await pg.waitForSelector('.pathbtn');
      await pg.click('[data-act="add-path"][data-key="review"]');
      await pg.waitForSelector('#a-title');
      await pg.fill('#a-title', 'Joan Shortbread Card');
      await pg.setInputFiles('#a-photo-file',
        { name: 'card.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(SHOT, 'base64') });
      await pg.waitForTimeout(900);
    };

    /* A — the two taps, in one session. */
    const ctxS = await freshContext(br, { ...devices['iPhone 13'] });
    const pS = await ctxS.newPage();
    const sErrs = []; pS.on('pageerror', (e) => sErrs.push(e.message));
    await stage(pS);
    chk('a photo attached on the Add screen is staged',
      (await keys(pS)).indexOf('__new__') > -1, JSON.stringify(await keys(pS)));
    await pS.click('[data-act="add-back"]');
    await pS.waitForSelector('.pathbtn');
    await pS.click('[data-act="add-path"][data-key="review"]');
    await pS.waitForSelector('#a-title');
    chk('Start over really starts over — the draft is blank',
      (await pS.inputValue('#a-title')) === '');
    chk('and the photo went with it, on screen',
      (await pS.locator('.photorow__img').count()) === 0);
    chk('and in the store, not just on screen',
      (await keys(pS)).indexOf('__new__') === -1, JSON.stringify(await keys(pS)));
    /* The consequence, end to end: the next recipe typed in must not be
       wearing the last one's picture. */
    await pS.fill('#a-title', 'Totally Different Soup');
    await pS.fill('#a-ing-0', '1 onion');
    await pS.fill('#a-step-0', 'Boil it.');
    await pS.click('[data-act="add-save"]');
    await pS.waitForTimeout(1200);
    chk('so the next recipe typed in is saved with no picture at all',
      (await pS.evaluate(() => location.hash)) === '#totally-different-soup' &&
      (await pS.locator('.r-hero').count()) === 0 &&
      (await keys(pS)).length === 0, JSON.stringify(await keys(pS)));
    chk('and nothing threw across any of it', sErrs.length === 0, sErrs.join(' | '));
    await ctxS.close();

    /* B — the tab was closed. sessionStorage dies with it and IndexedDB
       does not, which is how a photo reached a session that had never
       heard of it. iOS Safari keeps tabs for months; this is not exotic. */
    const ctxT = await freshContext(br, { ...devices['iPhone 13'] });
    const pT = await ctxT.newPage();
    await stage(pT);
    await pT.evaluate(() => sessionStorage.clear());
    /* A same-hash goto is not a navigation and renders nothing, so the tab
       has to boot again — which is what closing it does. */
    await pT.reload();
    await pT.waitForSelector('.pathbtn');
    await pT.click('[data-act="add-path"][data-key="review"]');
    await pT.waitForSelector('#a-title');
    chk('a photo does not survive into a session that never picked it',
      (await pT.locator('.photorow__img').count()) === 0 &&
      (await keys(pT)).indexOf('__new__') === -1, JSON.stringify(await keys(pT)));
    await ctxT.close();

    /* C — THE FLOOR, and the reason this fix is two conditions rather than
       one line. `084` exists so a half-finished import survives an
       accidental refresh, and `onRoute`'s own comment says a detour to
       check a recipe lands back in it. A version that simply threw the
       staged photo away would pass both cases above and lose a picture the
       reader had just chosen — a worse bug than the one being fixed. */
    const ctxR2 = await freshContext(br, { ...devices['iPhone 13'] });
    const pR2 = await ctxR2.newPage();
    await stage(pR2);
    await pR2.reload();
    await pR2.waitForSelector('#a-title');
    chk('but a reload still lands back in the half-finished import',
      (await pR2.inputValue('#a-title')) === 'Joan Shortbread Card');
    chk('with the photo it had picked',
      (await pR2.locator('.photorow__img').count()) === 1 &&
      (await keys(pR2)).indexOf('__new__') > -1, JSON.stringify(await keys(pR2)));
    /* And the same for a detour: navigation never discards. */
    await pR2.goto(B + '/index.html#menu');
    await pR2.waitForSelector('.rcard');
    await pR2.goto(B + '/index.html#add');
    await pR2.waitForSelector('#a-title');
    chk('and so does a detour to look at a recipe',
      (await pR2.inputValue('#a-title')) === 'Joan Shortbread Card' &&
      (await pR2.locator('.photorow__img').count()) === 1);
    await ctxR2.close();

    /* D — the second floor: an ordinary save still moves it across. */
    const ctxV = await freshContext(br, { ...devices['iPhone 13'] });
    const pV = await ctxV.newPage();
    await stage(pV);
    await pV.fill('#a-ing-0', '1 cup flour');
    await pV.fill('#a-step-0', 'Bake it.');
    await pV.click('[data-act="add-save"]');
    await pV.waitForTimeout(1200);
    chk('and saving still moves the photo onto the recipe it was picked for',
      (await pV.evaluate(() => location.hash)) === '#joan-shortbread-card' &&
      (await pV.locator('.r-hero').count()) === 1 &&
      (await keys(pV)).join() === 'joan-shortbread-card', JSON.stringify(await keys(pV)));
    await ctxV.close();
  }

  await br.close();
  console.log('\n'+'='.repeat(50)+'\nPASS: '+pass+'   FAIL: '+fail+'\n'+'='.repeat(50));
  process.exit(fail?1:0);
})();
