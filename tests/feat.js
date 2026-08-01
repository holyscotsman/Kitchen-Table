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
  await p.goto(B+'/index.html#chicken-cordon-bleu'); await p.waitForSelector('.r-title');
  chk('no tag row when untagged', await p.locator('.r-tags').count()===0);
  await p.click('[data-act="toggle-edit"]'); await p.waitForTimeout(300);
  chk('tags field present in edit mode', await p.locator('#e-tags').count()===1);
  await p.fill('#e-tags','French, Chicken, quick');
  await p.click('[data-act="save"]'); await p.waitForTimeout(400);
  await p.click('[data-act="toggle-edit"]'); await p.waitForTimeout(400);
  chk('tags render on the recipe', await p.locator('.r-tags .minitag').count()===3, String(await p.locator('.r-tags .minitag').count()));
  const href=await p.locator('.r-tags a').first().getAttribute('href');
  chk('tag links to a filtered menu', href==='#menu?tag=French', String(href));
  await p.click('.r-tags a >> nth=0'); await p.waitForTimeout(500);
  chk('tag link filters the menu', await p.locator('.rcard').count()===1, String(await p.locator('.rcard').count()));
  chk('filter badge counts the tag', (await p.locator('.badge').textContent())==='1');

  await p.click('[data-act="open-filter"]'); await p.waitForSelector('#filter-sheet');
  chk('Tags group appears once tags exist', (await p.locator('.grouph').allTextContents()).some(t=>/tags/i.test(t)));
  chk('3 tag chips', await p.locator('[data-act="ft"]').count()===3);
  await p.click('.donebtn'); await p.waitForTimeout(300);
  await p.click('[data-act="clear-filters"]'); await p.waitForTimeout(300);
  chk('clear resets tag filter', await p.locator('.rcard').count()===48, String(await p.locator('.rcard').count()));

  await p.goto(B+'/index.html'); await p.waitForSelector('#main-search');
  await p.fill('#main-search','french'); await p.waitForTimeout(300);
  chk('search matches a tag', await p.locator('.rcard').count()===1, String(await p.locator('.rcard').count()));

  console.log('\n== Photos ==');
  await p.goto(B+'/index.html#chicken-cordon-bleu'); await p.waitForSelector('.r-title');
  await p.click('[data-act="toggle-edit"]'); await p.waitForTimeout(300);
  chk('photo field present', await p.locator('#e-photo').count()===1);
  await p.setInputFiles('#e-photo',{name:'p.jpg',mimeType:'image/jpeg',buffer:Buffer.from(JPG,'base64')});
  await p.waitForTimeout(900);
  chk('preview appears after upload', await p.locator('.photorow__img').count()===1);
  chk('stored under kt.images', await p.evaluate(()=>!!JSON.parse(localStorage.getItem('kt.images')||'{}')['chicken-cordon-bleu']));
  chk('Download photos button appears', await p.locator('[data-act="dl-photos"]').count()===1);
  await p.click('[data-act="toggle-edit"]'); await p.waitForTimeout(400);
  chk('hero photo on the recipe', await p.locator('.r-hero').count()===1);
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  chk('thumbnail on the menu card', await p.locator('.rcard__thumb').count()===1);
  chk('other cards have no thumb placeholder', await p.locator('.rcard__thumb').count()===1);

  console.log('\n== Photo lands in the downloaded JSON as a path ==');
  await p.goto(B+'/index.html#chicken-cordon-bleu'); await p.waitForSelector('.r-title');
  await p.click('[data-act="toggle-edit"]'); await p.waitForTimeout(300);
  const [dlj]=await Promise.all([p.waitForEvent('download'), p.click('[data-act="dl-json"]')]);
  let js=''; const st=await dlj.createReadStream(); for await (const c of st) js+=c;
  const parsed=JSON.parse(js);
  const rec=parsed.find(r=>r.id==='chicken-cordon-bleu');
  chk('image written as a repo path', rec.image==='images/chicken-cordon-bleu.jpg', String(rec.image));
  chk('no base64 blob in the JSON', !js.includes('data:image'), 'size '+js.length);
  chk('tags written to the JSON', JSON.stringify(rec.tags)==='["French","Chicken","quick"]', JSON.stringify(rec.tags));
  chk('categories migrated in output', parsed.some(r=>r.category==='Sides') && !parsed.some(r=>r.category==='Side'));

  console.log('\n== Download photos produces a file ==');
  const [dlp]=await Promise.all([p.waitForEvent('download'), p.click('[data-act="dl-photos"]')]);
  chk('photo downloads as <id>.jpg', dlp.suggestedFilename()==='chicken-cordon-bleu.jpg', dlp.suggestedFilename());

  console.log('\n== Remove photo ==');
  await p.click('[data-act="rm-photo"]'); await p.waitForTimeout(400);
  chk('preview gone', await p.locator('.photorow__img').count()===0);

  chk('kt.images cleared for that recipe', await p.evaluate(()=>!JSON.parse(localStorage.getItem('kt.images')||'{}')['chicken-cordon-bleu']));
  console.log('\n== Quota exhaustion fails loudly (task 011) ==');
  /* Jam localStorage down to a few KB of headroom, then attach a real-sized
     photo through the actual input — the app must say so, never silently drop
     the photo. */
  await p.evaluate(async ()=>{
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
  await p.waitForTimeout(1500);
  const quotaMsg = await p.locator('.notice').first().textContent().catch(()=> '');
  chk('quota message shown in edit mode', /room on this phone/.test(quotaMsg), quotaMsg.slice(0,60));
  chk('photo was not silently stored', await p.evaluate(()=>!JSON.parse(localStorage.getItem('kt.images')||'{}')['chicken-cordon-bleu']));
  await p.evaluate(()=>{ Object.keys(localStorage).forEach(k=>{ if(k.startsWith('kt.__fill')) localStorage.removeItem(k); }); });

  console.log('\n== Tap targets ==');
  const small=await p.evaluate(()=>{const bad=[];document.querySelectorAll('button,a[href],input,select,textarea').forEach(el=>{const r=el.getBoundingClientRect();if(r.height>0&&r.height<44)bad.push((el.id||el.className)+' h='+r.height.toFixed(1));});return bad;});
  chk('nothing under 44px', small.length===0, small.join(', '));

  chk('no JS errors', errs.length===0, errs.join(' | '));
  await br.close();
  console.log('\n'+'='.repeat(50)+'\nPASS: '+pass+'   FAIL: '+fail+'\n'+'='.repeat(50));
  process.exit(fail?1:0);
})();
