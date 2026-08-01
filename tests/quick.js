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

  console.log('\n== Main: app icon + intro sentence ==');
  await p.goto(B+'/index.html'); await p.waitForSelector('.main__title');
  chk('app icon in the upper right', await p.locator('.main__marks .appmark svg').count()===1);
  const marks=await p.locator('.main__marks').boundingBox();
  const vw=await p.evaluate(()=>window.innerWidth);
  chk('icon sits on the right half', marks.x > vw/2, 'x='+marks.x.toFixed(0)+' of '+vw);
  chk('intro sentence present', (await p.locator('.main__intro').textContent()).length>40);
  chk('subtitle unchanged', (await p.locator('.main__sub').textContent()).trim()==='A Simmonds Styled Menu');

  console.log('\n== Jason, not Me ==');
  const tiles=await p.locator('.who-tile__name').allTextContents();
  chk('sections read Joan / Jason / Jennifer / Lindsay / Siobhan', tiles.join(',')==='Joan,Jason,Jennifer,Lindsay,Siobhan', tiles.join(','));
  const counts=await p.locator('.who-tile__count').allTextContents();
  chk('Joan has all 48, others empty', counts.join(',')==='48,0,0,0,0', counts.join(','));
  chk('no "Me" or "Mom" on Main', !(await p.locator('.main').textContent()).match(/\bMe\b|\bMom\b/));

  console.log('\n== View all recipes sits below Whose recipe ==');
  const order=await p.evaluate(()=>{
    const els=[...document.querySelectorAll('.band__h, .bigbtn')];
    return els.map(e=>e.textContent.trim().replace(/\s+/g,' '));
  });
  console.log('   order:', order.join('  |  '));
  const iWho=order.findIndex(t=>/Whose recipe/.test(t));
  const iAll=order.findIndex(t=>/View all/.test(t));
  const iKind=order.findIndex(t=>/What kind/.test(t));
  chk('labelled "View all recipes"', iAll>-1 && /View all 48 recipes/.test(order[iAll]), order[iAll]);
  chk('directly after Whose recipe', iAll===iWho+1, 'who='+iWho+' all='+iAll);
  chk('before What kind of thing', iAll<iKind, 'all='+iAll+' kind='+iKind);

  console.log('\n== Category icons on Main rows ==');
  chk('every course row has an icon', await p.locator('.cat-row__icon svg').count()===await p.locator('.cat-row').count());

  console.log('\n== Recipe list: one per line, icon, spacing ==');
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  chk('single column on phone', await p.evaluate(()=>getComputedStyle(document.querySelector('.cardgrid')).gridTemplateColumns.split(' ').length)===1);
  const boxes=await p.evaluate(()=>[...document.querySelectorAll('.rcard')].slice(0,4).map(e=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x),w:Math.round(r.width)};}));
  chk('all cards share one column', new Set(boxes.map(b=>b.x)).size===1, JSON.stringify(boxes));
  chk('every card carries a category icon', await p.locator('.rcard__icon svg').count()===48, String(await p.locator('.rcard__icon svg').count()));
  chk('meta names the course', (await p.locator('.rcard__meta').first().textContent()).includes('·'));
  const lh=await p.evaluate(()=>getComputedStyle(document.querySelector('.rcard__title')).lineHeight);
  chk('title line-height loosened', parseFloat(lh)>=27, lh);
  chk('contributor shows Joan', (await p.locator('.menubody').textContent()).includes('Joan'));

  console.log('\n== Desktop still one per line ==');
  const d=await br.newContext({viewport:{width:1280,height:900}});
  const dp=await d.newPage();
  await dp.goto(B+'/index.html#menu'); await dp.waitForSelector('.rcard');
  chk('one column at 1280px too', await dp.evaluate(()=>getComputedStyle(document.querySelector('.cardgrid')).gridTemplateColumns.split(' ').length)===1);

  console.log('\n== Filter still uses Jason ==');
  await p.click('[data-act="open-filter"]'); await p.waitForSelector('#filter-sheet');
  const who=(await p.locator('[data-act="fw"]').allTextContents()).map(t=>t.replace(/\s*\(\d+\)$/,''));
  chk('filter offers only people with recipes', who.join(',')==='Joan', who.join(','));
  await p.click('.donebtn'); await p.waitForTimeout(300);

  console.log('\n== Tap targets ==');
  const small=await p.evaluate(()=>{const bad=[];document.querySelectorAll('button,a[href],input,select,textarea').forEach(el=>{const r=el.getBoundingClientRect();if(r.height>0&&r.height<44)bad.push((el.id||el.className)+' h='+r.height.toFixed(1));});return bad;});
  chk('nothing under 44px', small.length===0, small.join(', '));
  chk('no JS errors', errs.length===0, errs.join(' | '));

  await p.goto(B+'/index.html'); await p.waitForSelector('.main__title'); await p.waitForTimeout(300);
  await p.screenshot({path:'q1-main.png'});
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard'); await p.waitForTimeout(300);
  await p.screenshot({path:'q2-menu.png'});

  await br.close();
  console.log('\n'+'='.repeat(50)+'\nPASS: '+pass+'   FAIL: '+fail+'\n'+'='.repeat(50));
  process.exit(fail?1:0);
})();
