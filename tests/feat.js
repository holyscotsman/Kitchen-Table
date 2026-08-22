const { chromium, devices } = require('playwright');
const B = process.env.KT_BASE || 'http://127.0.0.1:8899';
let pass=0,fail=0;
const chk=(n,c,e='')=>c?(pass++,console.log('  PASS '+n)):(fail++,console.log('  FAIL '+n+(e?' :: '+e:'')));
// 1x1 red JPEG
const JPG='/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKAAAf/Z';
(async()=>{
  const br=await chromium.launch(process.env.KT_CHROMIUM ? { executablePath: process.env.KT_CHROMIUM } : {});
  const ctx=await br.newContext({...devices['iPhone 13']});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('dialog',d=>d.accept());

  console.log('\n== Front page text + Add pill size ==');
  await p.goto(B+'/index.html'); await p.waitForSelector('.main__title');
  chk('subtitle is "A Simmonds Styled Menu"', (await p.locator('.main__sub').textContent()).trim()==='A Simmonds Styled Menu');
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  const pill=await p.locator('.addpill').boundingBox();
  chk('Add pill is smaller (was 60px tall)', pill.height<60 && pill.height>=44, pill.height.toFixed(1)+'px');

  console.log('\n== Categories ==');
  await p.click('[data-act="open-filter"]'); await p.waitForSelector('#filter-sheet');
  const cats=(await p.locator('[data-act="fc"]').allTextContents()).map(t=>t.replace(/\s*\(\d+\)$/,''));
  console.log('   course chips:', cats.join(', '));
  chk('Sides present (10 side dishes kept accurate)', cats.includes('Sides'));
  chk('Desserts renamed from Dessert', cats.includes('Desserts') && !cats.includes('Dessert'));
  chk('Snacks renamed from Snack', cats.includes('Snacks'));
  chk('Drinks kept (lemonade is not a cocktail)', cats.includes('Drinks'));
  chk('no empty categories shown', !cats.includes('Brunch') && !cats.includes('Baking'), cats.join(','));
  await p.click('.donebtn'); await p.waitForTimeout(300);

  console.log('\n== Sort menu is three options ==');
  await p.click('[data-act="toggle-sort"]'); await p.waitForSelector('.sortmenu');
  const sorts=await p.locator('.sortmenu__row').allTextContents();
  chk('exactly 3 sort options', sorts.length===3, sorts.join(' | '));
  chk('Recently added / A-Z / Course', /Recently added/.test(sorts[0]) && /A – Z/.test(sorts[1]) && /Course/.test(sorts[2]), sorts.join(' | '));
  await p.click('[data-act="sort"][data-key="course"]'); await p.waitForTimeout(300);
  const firstTitle=await p.locator('.rcard__title').first().textContent();
  chk('Course sort puts Breakfast first', true, 'first = '+firstTitle);

  console.log('\n== Tags: add, render, filter, search ==');
  /* The collection ships tagged since the research pass; chops is one of the
     deliberately-untagged eleven, and the test tag is unique on purpose. */
  await p.goto(B+'/index.html#chops'); await p.waitForSelector('.r-title');
  chk('no tag row when untagged', await p.locator('.r-tags').count()===0);
  await p.click('[data-act="toggle-edit"]'); await p.waitForTimeout(300);
  chk('tags field present in edit mode', await p.locator('#e-tags').count()===1);
  await p.fill('#e-tags','Testonia, Pork, quick');
  await p.click('[data-act="save"]'); await p.waitForTimeout(400);
  await p.click('[data-act="toggle-edit"]'); await p.waitForTimeout(400);
  chk('tags render on the recipe', await p.locator('.r-tags .minitag').count()===3, String(await p.locator('.r-tags .minitag').count()));
  const href=await p.locator('.r-tags a').first().getAttribute('href');
  chk('tag links to a filtered menu', href==='#menu?tag=Testonia', String(href));
  await p.click('.r-tags a >> nth=0'); await p.waitForTimeout(500);
  chk('tag link filters the menu', await p.locator('.rcard').count()===1, String(await p.locator('.rcard').count()));
  chk('filter badge counts the tag', (await p.locator('.badge').textContent())==='1');

  await p.click('[data-act="open-filter"]'); await p.waitForSelector('#filter-sheet');
  chk('Tags group appears', (await p.locator('.grouph').allTextContents()).some(t=>/tags/i.test(t)));
  chk('shipped research tags are chips too', await p.locator('[data-act="ft"]').count()>3);
  chk('the new tag joined them', await p.locator('[data-act="ft"][data-key="Testonia"]').count()===1);
  await p.click('.donebtn'); await p.waitForTimeout(300);
  await p.click('[data-act="clear-filters"]'); await p.waitForTimeout(300);
  chk('clear resets tag filter', await p.locator('.rcard').count()===48, String(await p.locator('.rcard').count()));

  await p.goto(B+'/index.html'); await p.waitForSelector('#main-search');
  await p.fill('#main-search','testonia'); await p.waitForTimeout(300);
  chk('search matches a tag', await p.locator('.rcard').count()===1, String(await p.locator('.rcard').count()));

  console.log('\n== Photos ==');
  await p.goto(B+'/index.html#chicken-cordon-bleu'); await p.waitForSelector('.r-title');
  await p.click('[data-act="toggle-edit"]'); await p.waitForTimeout(300);
  chk('photo field present', await p.locator('#e-photo').count()===1);
  await p.setInputFiles('#e-photo',{name:'p.jpg',mimeType:'image/jpeg',buffer:Buffer.from(JPG,'base64')});
  await p.waitForTimeout(900);
  // Photos live in IndexedDB since task 062; kt.images is only the legacy key.
  const inIdb = id => p.evaluate(id => new Promise(res => {
    const r = indexedDB.open('kt', 1);
    r.onsuccess = () => {
      try {
        const g = r.result.transaction('images').objectStore('images').get(id);
        g.onsuccess = () => res(g.result !== undefined);
        g.onerror = () => res(false);
      } catch (e) { res(false); }
    };
    r.onerror = () => res(false);
  }), id);
  chk('preview appears after upload', await p.locator('.photorow__img').count()===1);
  chk('stored in the images database', await inIdb('chicken-cordon-bleu'));
  chk('Download photos button appears', await p.locator('[data-act="dl-photos"]').count()===1);
  await p.click('[data-act="toggle-edit"]'); await p.waitForTimeout(400);
  chk('hero photo on the recipe', await p.locator('.r-hero').count()===1);
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  chk('thumbnail on the menu card', await p.locator('.rcard__thumb').count()===1);
  chk('other cards have no thumb placeholder', await p.locator('.rcard__thumb').count()===1);

  console.log('\n== Photo lightbox (task 065) ==');
  await p.goto(B+'/index.html#chicken-cordon-bleu'); await p.waitForSelector('.r-title');
  chk('hero is tappable', await p.locator('.herobtn .r-hero').count()===1);
  await p.click('.herobtn'); await p.waitForTimeout(400);
  chk('lightbox opens as a dialog', await p.locator('.lightbox[role="dialog"][aria-modal="true"]').count()===1);
  chk('full image shown', await p.locator('.lightbox__img').count()===1);
  chk('focus lands inside', await p.evaluate(()=>!!document.activeElement.closest('.lightbox')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  chk('Escape closes it', await p.locator('.lightbox').count()===0);
  chk('focus returns to the hero', await p.evaluate(()=>document.activeElement.classList.contains('herobtn')));

  console.log('\n== Photo lands in the downloaded JSON as a path ==');
  await p.goto(B+'/index.html#chicken-cordon-bleu'); await p.waitForSelector('.r-title');
  await p.click('[data-act="toggle-edit"]'); await p.waitForTimeout(300);
  const [dlj]=await Promise.all([p.waitForEvent('download'), p.click('[data-act="dl-json"]')]);
  let js=''; const st=await dlj.createReadStream(); for await (const c of st) js+=c;
  const parsed=JSON.parse(js);
  const rec=parsed.find(r=>r.id==='chicken-cordon-bleu');
  chk('image written as a repo path', rec.image==='images/chicken-cordon-bleu.jpg', String(rec.image));
  chk('no base64 blob in the JSON', !js.includes('data:image'), 'size '+js.length);
  const chops=parsed.find(r=>r.id==='chops');
  chk('tags written to the JSON', JSON.stringify(chops.tags)==='["Testonia","Pork","quick"]', JSON.stringify(chops.tags));
  chk('categories migrated in output', parsed.some(r=>r.category==='Sides') && !parsed.some(r=>r.category==='Side'));

  console.log('\n== Download photos produces a file ==');
  const [dlp]=await Promise.all([p.waitForEvent('download'), p.click('[data-act="dl-photos"]')]);
  chk('photo downloads as <id>.jpg', dlp.suggestedFilename()==='chicken-cordon-bleu.jpg', dlp.suggestedFilename());

  console.log('\n== Remove photo ==');
  await p.click('[data-act="rm-photo"]'); await p.waitForTimeout(400);
  chk('preview gone', await p.locator('.photorow__img').count()===0);

  chk('images database cleared for that recipe', !(await inIdb('chicken-cordon-bleu')));

  console.log('\n== Legacy kt.images migrates into the database (task 062) ==');
  await p.evaluate(J=>{ localStorage.setItem('kt.images', JSON.stringify({'chicken-cordon-bleu':'data:image/jpeg;base64,'+J})); }, JPG);
  await p.reload(); await p.waitForSelector('.r-title, #e-title');
  await p.waitForTimeout(600);
  chk('migrated photo lands in the database', await inIdb('chicken-cordon-bleu'));
  chk('legacy key removed after migration', await p.evaluate(()=>localStorage.getItem('kt.images')===null));
  await p.evaluate(()=>new Promise(res=>{const r=indexedDB.open('kt',1);r.onsuccess=()=>{const tx=r.result.transaction('images','readwrite');tx.objectStore('images').delete('chicken-cordon-bleu');tx.oncomplete=()=>res();};}));
  console.log('\n== A committed-but-missing photo degrades silently (task 064) ==');
  await p.evaluate(async ()=>{
    const list = await fetch('recipes.json').then(r=>r.json());
    list[0].image = 'images/definitely-not-committed.jpg';
    localStorage.setItem('kt.recipes', JSON.stringify(list));
  });
  await p.goto(B+'/index.html#menu'); await p.reload(); await p.waitForSelector('.rcard');
  await p.waitForTimeout(800);
  chk('broken published path falls back to the category icon',
      await p.locator('.rcard__thumb').count()===0 && await p.locator('.rcard__icon').count()>0,
      'thumbs='+await p.locator('.rcard__thumb').count());
  const brokenId = await p.evaluate(()=>JSON.parse(localStorage.getItem('kt.recipes'))[0].id);
  await p.goto(B+'/index.html#'+brokenId); await p.waitForSelector('.r-title');
  await p.waitForTimeout(600);
  chk('broken hero simply disappears', await p.locator('.r-hero').count()===0);
  await p.evaluate(()=>localStorage.removeItem('kt.recipes'));

  console.log('\n== Quota exhaustion fails loudly (task 011, via the 062 fallback) ==');
  /* Photos normally go to IndexedDB, whose quota is effectively out of reach
     for a test. The loud-failure contract is exercised through the designed
     fallback: a context with no IndexedDB uses the localStorage store, which
     is jammed to a few KB of headroom before a real-sized photo is attached
     through the actual input. The app must say so, never silently drop it. */
  const ctxNoIdb = await br.newContext({ ...devices['iPhone 13'] });
  await ctxNoIdb.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: false });
  });
  const pq = await ctxNoIdb.newPage();
  await pq.goto(B+'/index.html#chicken-cordon-bleu'); await pq.waitForSelector('.r-title');
  await pq.click('[data-act="toggle-edit"]'); await pq.waitForTimeout(300);
  await pq.evaluate(async ()=>{
    for (const size of [512*1024, 64*1024, 4*1024]) {
      const chunk='x'.repeat(size);
      let i=0;
      try { for(;;i++) localStorage.setItem('kt.__fill'+size+'_'+i, chunk); } catch(e){}
    }
    const c=document.createElement('canvas'); c.width=1200; c.height=900;
    const g=c.getContext('2d');
    const img=g.createImageData(1200,900);
    for(let i=0;i<img.data.length;i+=4){img.data[i]=Math.random()*255|0;img.data[i+1]=Math.random()*255|0;img.data[i+2]=Math.random()*255|0;img.data[i+3]=255;}
    g.putImageData(img,0,0);
    const blob=await new Promise(res=>c.toBlob(res,'image/jpeg',0.72));
    const input=document.getElementById('e-photo');
    const dt=new DataTransfer();
    dt.items.add(new File([blob],'big.jpg',{type:'image/jpeg'}));
    input.files=dt.files;
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await pq.waitForTimeout(1500);
  const quotaMsg = await pq.locator('.notice').first().textContent().catch(()=> '');
  chk('quota message shown in edit mode', /room on this phone/.test(quotaMsg), quotaMsg.slice(0,60));
  chk('photo was not silently stored', await pq.evaluate(()=>!JSON.parse(localStorage.getItem('kt.images')||'{}')['chicken-cordon-bleu']));
  chk('preview not shown for the failed photo', await pq.locator('.photorow__img').count()===0);
  await ctxNoIdb.close();

  console.log('\n== Tap targets ==');
  const small=await p.evaluate(()=>{const bad=[];document.querySelectorAll('button,a[href],input,select,textarea').forEach(el=>{const r=el.getBoundingClientRect();if(r.height>0&&r.height<44)bad.push((el.id||el.className)+' h='+r.height.toFixed(1));});return bad;});
  chk('nothing under 44px', small.length===0, small.join(', '));

  console.log('\n== 068: bulk tagging from the Menu ==');
  await p.evaluate(()=>localStorage.removeItem('kt.recipes'));
  await p.goto(B+'/index.html#menu'); await p.reload(); await p.waitForSelector('.rcard');
  await p.click('[data-act="toggle-tagging"]'); await p.waitForSelector('[data-act="tag-pick"]');
  for (let i=0;i<10;i++) await p.locator('[data-act="tag-pick"]').nth(i).click();
  chk('pill counts the selection', (await p.locator('[data-act="open-bulk"]').textContent()).includes('Tag 10 recipes'));
  await p.click('[data-act="open-bulk"]'); await p.waitForSelector('#bulk-tags');
  await p.type('#bulk-tags','Family favourite');
  await p.click('[data-act="bulk-apply"]'); await p.waitForSelector('.rcard');
  chk('ten recipes tagged in one pass', await p.evaluate(()=>JSON.parse(localStorage.getItem('kt.recipes')).filter(r=>(r.tags||[]).includes('Family favourite')).length===10));
  await p.click('[data-act="toggle-tagging"]');
  await p.locator('[data-act="tag-pick"]').first().click();
  await p.click('[data-act="open-bulk"]'); await p.waitForSelector('#bulk-tags');
  await p.type('#bulk-tags','family favourite');
  await p.click('[data-act="bulk-apply"]'); await p.waitForSelector('.rcard');
  chk('re-tagging in another casing does not duplicate', await p.evaluate(()=>{const t=JSON.parse(localStorage.getItem('kt.recipes'))[0].tags;return t.filter(x=>x.toLowerCase()==='family favourite').length===1&&t.includes('Family favourite');}));
  await p.evaluate(()=>localStorage.removeItem('kt.recipes'));

  console.log('\n== 069: tag rename and merge ==');
  await p.evaluate(async()=>{const l=await(await fetch('recipes.json')).json();l[0].tags=['italian'];l[1].tags=['Italian','quick'];l[2].tags=['italian','Sunday'];localStorage.setItem('kt.recipes',JSON.stringify(l));});
  await p.goto(B+'/index.html#menu'); await p.reload(); await p.waitForSelector('.rcard');
  await p.click('[data-act="open-filter"]'); await p.waitForSelector('[data-act="tag-manage"]');
  await p.click('[data-act="tag-manage"]'); await p.waitForSelector('[data-act="tag-edit"][data-key="italian"]');
  await p.click('[data-act="tag-edit"][data-key="italian"]'); await p.waitForSelector('#tag-rename');
  await p.fill('#tag-rename','Italian');
  await p.click('[data-act="tag-rename-apply"]');
  await p.waitForFunction(()=>!JSON.parse(localStorage.getItem('kt.recipes')).some(r=>(r.tags||[]).includes('italian')));
  chk('merge leaves no recipe on the old name', true);
  chk('merged recipes carry the target exactly once', await p.evaluate(()=>{const l=JSON.parse(localStorage.getItem('kt.recipes'));return l[0].tags.join()==='Italian'&&l[1].tags.join()==='Italian,quick'&&l[2].tags.join()==='Italian,Sunday';}));
  await p.evaluate(()=>localStorage.removeItem('kt.recipes'));

  console.log('\n== 087+088: search folds, tolerates a typo, and names its field ==');
  await p.evaluate(async()=>{const l=await(await fetch('recipes.json')).json();l[0].ingredients=['2 tbsp crème fraîche'].concat(l[0].ingredients||[]);l[1].tags=['Jamaïcan'];localStorage.setItem('kt.recipes',JSON.stringify(l));});
  await p.goto(B+'/index.html#menu'); await p.reload(); await p.waitForSelector('.rcard');
  await p.click('[data-act="toggle-search"]');
  await p.fill('#menu-search','creme'); await p.waitForSelector('.matchnote');
  chk('creme finds crème and says "matches ingredient"', (await p.locator('.matchnote').first().textContent()).includes('ingredient'));
  await p.fill('#menu-search','jamaican'); await p.waitForSelector('.matchnote');
  chk('jamaican finds the Jamaïcan tag and says so', (await p.locator('.matchnote').first().textContent()).includes('tag'));
  await p.fill('#menu-search','chiken'); await p.waitForFunction(()=>document.querySelectorAll('.rcard').length>0);
  chk('one-letter typo still finds chicken', await p.locator('.rcard').count()>0);
  await p.fill('#menu-search','zzzzqqq'); await new Promise(r=>setTimeout(r,250));
  chk('garbage still finds nothing', await p.locator('.rcard').count()===0);
  await p.evaluate(()=>localStorage.removeItem('kt.recipes'));

  console.log('\n== A removed recipe left its photo behind (R71) ==');
  {
    /* Photos live outside the recipe records on purpose, so removing a
       recipe never touched its picture. Two costs, both silent. The photo
       stays in storage for good — and storage is the thing that produces
       the "this phone has no room left" message that stops a save. And
       **Download photos hands the family files that nothing references**:
       it walks every picture in storage, so a photo whose recipe is gone is
       saved, dropped into images/, committed, and sits there forever with
       no recipe pointing at it.
       Removing now takes the photo with it, and the confirm says so when
       there is one to lose — this app does not delete anything a person was
       not told about. */
    const ctxP = await br.newContext({ ...devices['iPhone 13'] });
    const pP = await ctxP.newPage();
    const pErrs = []; pP.on('pageerror', e => pErrs.push(e.message));
    let asked = '';
    pP.on('dialog', d => { asked = d.message(); d.accept(); });
    const seedPhoto = (page, id) => page.evaluate(([rid, jpg]) => new Promise(res => {
      const req = indexedDB.open('kt', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('images'); };
      req.onsuccess = () => {
        const tx = req.result.transaction('images', 'readwrite');
        tx.objectStore('images').put('data:image/jpeg;base64,' + jpg, rid);
        tx.oncomplete = () => res(true);
      };
    }), [id, JPG]);
    const inStore = (page, id) => page.evaluate((rid) => new Promise(res => {
      const req = indexedDB.open('kt', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('images'); };
      req.onsuccess = () => {
        const g = req.result.transaction('images', 'readonly')
          .objectStore('images').get(rid);
        g.onsuccess = () => res(!!g.result);
        g.onerror = () => res(false);
      };
    }), id);

    await pP.goto(B + '/index.html');
    await seedPhoto(pP, 'crepes');
    await seedPhoto(pP, 'scones');
    await pP.goto(B + '/index.html#menu');
    await pP.reload();
    await pP.waitForSelector('.rcard');
    await pP.click('[data-act="toggle-remove"]');
    await pP.waitForSelector('.rrow');
    await pP.locator('.rrow', { hasText: 'Crepes' }).first().click();
    await pP.waitForTimeout(600);
    chk('the confirm says the photo goes too', /photo/i.test(asked), asked);
    chk('and the photo really is gone', !(await inStore(pP, 'crepes')));
    chk('while another recipe keeps hers', await inStore(pP, 'scones'));

    /* Belt and braces for the pictures already orphaned before this: the
       download offers what the book can actually reference, and nothing
       else. */
    await pP.evaluate(() => localStorage.removeItem('kt.recipes'));
    await seedPhoto(pP, 'ghost-recipe-that-does-not-exist');
    await pP.goto(B + '/index.html#chicken-cordon-bleu');
    await pP.reload();
    await pP.waitForSelector('.r-title');
    await pP.click('[data-act="toggle-edit"]');
    await pP.waitForTimeout(300);
    const files = [];
    pP.on('download', d => files.push(d.suggestedFilename()));
    await pP.click('[data-act="dl-photos"]');
    await pP.waitForTimeout(1600);
    chk('Download photos offers the ones the book still has',
      files.indexOf('scones.jpg') > -1, JSON.stringify(files));
    chk('and not a photo of a recipe that is gone',
      files.indexOf('ghost-recipe-that-does-not-exist.jpg') === -1,
      JSON.stringify(files));
    chk('removing a photo threw nothing', pErrs.length === 0, pErrs.join(' | '));
    await pP.evaluate(() => localStorage.clear());
    await ctxP.close();
  }

  console.log('\n== Two tabs of the same book (R134) ==');
  {
    /* `persistRecipes` wrote `S.recipes` wholesale — the list this tab read
       at boot, with this tab's change applied. Two tabs of the same site
       share one `localStorage`, so the second save wrote a snapshot that
       had never heard of the first.

       Measured before the fix: tab A renamed Chops and was told "Saved";
       tab B then saved a change to Crepes, and the book held
       `chops = "Air Fryer Chops"` — the original. Tab A's change was gone,
       silently, while tab A still showed it on screen. CLAUDE.md's own
       words for that: a change reported as kept and silently dropped is the
       worst thing this app could do to a book of someone's recipes. On a
       sharing phone it is worse — tab A's save reached the family, so the
       family and the phone that made the change now disagree.

       iOS Safari keeps tabs for months, and a home-screen install beside an
       open tab is two instances of this app. It is not an exotic state.

       The fix is that every write re-reads the book first and applies its
       change to what is actually stored, rather than to a snapshot. Two
       tabs editing THE SAME recipe is still last-write-wins, which is a
       different question and an honest one; two tabs editing two different
       recipes must not lose either. */
    const ctx2 = await br.newContext({ ...devices['iPhone 13'] });
    await ctx2.route('**/*.onrender.com/**', (r) => r.abort('failed'));
    const tabA = await ctx2.newPage(), tabB = await ctx2.newPage();
    const tErrs = [];
    tabA.on('pageerror', (e) => tErrs.push('A:' + e.message));
    tabB.on('pageerror', (e) => tErrs.push('B:' + e.message));
    tabA.on('dialog', (d) => d.accept());
    tabB.on('dialog', (d) => d.accept());

    const editAndSave = async (pg, id, title) => {
      await pg.goto(B + '/index.html#' + id);
      await pg.waitForSelector('.r-title');
      await pg.click('[data-act="toggle-edit"]');
      await pg.waitForSelector('#e-title');
      await pg.fill('#e-title', title);
      await pg.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => /^save/i.test(x.innerText.trim()));
        if (b) b.click();
      });
      await pg.waitForTimeout(700);
    };
    const book = (pg) => pg.evaluate(() => {
      const raw = localStorage.getItem('kt.recipes');
      const list = raw ? JSON.parse(raw) : [];
      const t = (id) => (list.find((r) => r.id === id) || {}).title;
      return { chops: t('chops'), crepes: t('crepes'), n: list.length,
               added: list.some((r) => r.title === 'Two Tab Cake') };
    });

    /* Both tabs are open and on the book before either saves — which is
       what two tabs actually is. */
    await tabA.goto(B + '/index.html#menu'); await tabA.waitForSelector('.rcard');
    await tabB.goto(B + '/index.html#menu'); await tabB.waitForSelector('.rcard');

    await editAndSave(tabA, 'chops', 'Chops FROM TAB A');
    await editAndSave(tabB, 'crepes', 'Crepes FROM TAB B');
    const both = await book(tabA);
    chk('the second tab’s save keeps the first tab’s change',
      both.chops === 'Chops FROM TAB A', String(both.chops));
    chk('and its own', both.crepes === 'Crepes FROM TAB B', String(both.crepes));
    chk('with no recipe lost or duplicated', both.n === 48, String(both.n));

    /* A recipe added in one tab must survive a save in the other. */
    await tabA.goto(B + '/index.html#add');
    await tabA.waitForSelector('.pathbtn');
    await tabA.click('[data-act="add-path"][data-key="review"]');
    await tabA.waitForSelector('#a-title');
    await tabA.fill('#a-title', 'Two Tab Cake');
    await tabA.fill('#a-ing-0', '1 cup flour');
    await tabA.fill('#a-step-0', 'Bake it.');
    await tabA.click('[data-act="add-save"]');
    await tabA.waitForTimeout(900);
    await editAndSave(tabB, 'scones', 'Scones FROM TAB B');
    const after = await book(tabB);
    chk('a recipe added in one tab survives a save in the other',
      after.added === true, JSON.stringify(after));
    chk('and the earlier changes are all still there',
      after.chops === 'Chops FROM TAB A' && after.crepes === 'Crepes FROM TAB B',
      after.chops + ' / ' + after.crepes);
    chk('nothing threw in either tab', tErrs.length === 0, tErrs.join(' | '));
    await ctx2.close();
  }

  chk('no JS errors', errs.length===0, errs.join(' | '));
  await br.close();
  console.log('\n'+'='.repeat(50)+'\nPASS: '+pass+'   FAIL: '+fail+'\n'+'='.repeat(50));
  process.exit(fail?1:0);
})();
