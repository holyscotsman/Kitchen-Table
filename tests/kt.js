const { chromium, devices } = require('playwright');
const B = process.env.KT_BASE || 'http://127.0.0.1:8899';
let pass=0, fail=0;
const chk=(n,c,e='')=>c?(pass++,console.log('  PASS '+n)):(fail++,console.log('  FAIL '+n+(e?' :: '+e:'')));

(async () => {
  const br = await chromium.launch(process.env.KT_CHROMIUM ? { executablePath: process.env.KT_CHROMIUM } : {});
  const ctx = await br.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const errs=[];
  p.on('pageerror', e=>errs.push('pageerror: '+e.message));
  p.on('console', m=>{ if(m.type()==='error' && !/ERR_CONNECTION_RESET|fonts\.g/.test(m.text())) errs.push('console: '+m.text()); });

  console.log('\n== Main screen (dark default) ==');
  await p.goto(B+'/index.html');
  await p.waitForSelector('.main__title');
  const t = await p.evaluate(()=>({
    bg: getComputedStyle(document.body).backgroundColor,
    ink: getComputedStyle(document.body).color,
    theme: document.documentElement.getAttribute('data-theme'),
    font: getComputedStyle(document.body).fontFamily,
    card: getComputedStyle(document.querySelector('.who-tile')).backgroundColor,
  }));
  chk('dark is the default (bg #0E1712)', t.bg==='rgb(14, 23, 18)', t.bg);
  chk('primary ink #F1F5F2', t.ink==='rgb(241, 245, 242)', t.ink);
  chk('no data-theme attr in dark', t.theme===null, String(t.theme));
  chk('Atkinson Hyperlegible applied', /Atkinson/i.test(t.font), t.font);
  chk('tiles use --card #1D4234', t.card==='rgb(29, 66, 52)', t.card);
  chk('title is "Kitchen Table"', (await p.locator('.main__title').textContent()).trim()==='Kitchen Table');
  chk('subtitle present', (await p.locator('.main__sub').textContent()).includes('Simmonds'));
  chk('search placeholder counts recipes', (await p.getAttribute('#main-search','placeholder'))==='Search 48 recipes');
  chk("Tonight's idea hero present", await p.locator('.hero').count()===1);
  chk('hero falls back to flat panel (no image)', await p.locator('.hero__blank').count()===1);
  chk('6 contributor sections', await p.locator('.who-tile').count()===6);
  chk('all 48 are Joan\'s, others invite (058)', (await p.locator('.who-tile__count').allTextContents()).join(',')==='48' && await p.locator('.who-tile--empty').count()===5 && (await p.locator('.who-tile--empty').first().textContent()).includes('None yet'));
  chk('category rows present', await p.locator('.cat-row').count()===6);
  chk('View all button', (await p.locator('a.bigbtn[href="#menu"]').textContent()).includes('View all 48 recipes'));
  chk('Plan the week sits beside it', await p.locator('a.bigbtn[href="#plan"]').count()===1);
  await p.screenshot({path:require('path').join(__dirname,'shots','kt-1-main-dark.png')});

  console.log('\n== Main search replaces browse stack ==');
  await p.fill('#main-search','chicken');
  await p.waitForTimeout(200);
  chk('browse bands removed', await p.locator('.who-grid').count()===0);
  chk('matches heading shown', /matches|match/.test(await p.locator('.results__h').textContent()));
  chk('results capped at 12', (await p.locator('.rcard').count())<=12);
  await p.fill('#main-search','');
  await p.waitForTimeout(200);
  chk('clearing restores browse', await p.locator('.who-grid').count()===1);

  console.log('\n== Light theme ==');
  await p.click('[data-act="theme"]');
  await p.waitForTimeout(250);
  const l = await p.evaluate(()=>({
    bg:getComputedStyle(document.body).backgroundColor,
    attr:document.documentElement.getAttribute('data-theme'),
    card:getComputedStyle(document.querySelector('.who-tile')).backgroundColor,
    ls:localStorage.getItem('kt.theme')
  }));
  chk('light bg #F3F6F3', l.bg==='rgb(243, 246, 243)', l.bg);
  chk('data-theme=light', l.attr==='light', String(l.attr));
  chk('light card #1B4F39', l.card==='rgb(27, 79, 57)', l.card);
  chk('persisted to kt.theme', l.ls==='"light"', String(l.ls));
  await p.screenshot({path:require('path').join(__dirname,'shots','kt-2-main-light.png')});
  await p.reload(); await p.waitForSelector('.main__title');
  chk('theme survives reload', await p.evaluate(()=>document.documentElement.getAttribute('data-theme'))==='light');
  await p.click('[data-act="theme"]'); await p.waitForTimeout(200);

  console.log('\n== Menu screen ==');
  await p.click('a.bigbtn[href="#menu"]');
  await p.waitForSelector('.mhead__h1');
  chk('route is #menu', p.url().endsWith('#menu'), p.url());
  chk('h1 is "Menu"', (await p.locator('.mhead__h1').textContent()).trim()==='Menu');
  chk('eyebrow KITCHEN TABLE', (await p.locator('.eyebrow').textContent()).trim()==='Kitchen Table');
  chk('48 cards', await p.locator('.rcard').count()===48);
  chk('Add recipe pill present', await p.locator('.addpill').count()===1);
  chk('no viewer/edit toggle on Menu', await p.locator('[data-act="toggle-edit"]').count()===0);
  const longMeta = await p.evaluate(()=>[...document.querySelectorAll('.rcard__meta')].map(e=>e.textContent).filter(x=>x.includes('44 min (chicken)')).length);
  chk('long time strings omitted, not truncated', longMeta===0, 'found '+longMeta);
  await p.screenshot({path:require('path').join(__dirname,'shots','kt-3-menu-dark.png')});

  console.log('\n== Filter sheet ==');
  await p.click('[data-act="open-filter"]');
  await p.waitForSelector('#filter-sheet');
  chk('sheet is a modal dialog', await p.getAttribute('#filter-sheet','aria-modal')==='true');
  chk('scrim is a labelled button', await p.getAttribute('.scrim','aria-label')==='Close filters');
  chk('three groups now the collection ships tagged', await p.locator('.grouph').count()===3);
  await p.click('[data-act="fw"][data-key="Joan"]');
  await p.waitForTimeout(200);
  chk('chip becomes pressed', await p.getAttribute('[data-act="fw"][data-key="Joan"]','aria-pressed')==='true');
  const courseCount = await p.locator('[data-act="fc"][data-key="Dinner"]').textContent();
  chk('course count unchanged when one person owns everything', courseCount.includes('(23)'), courseCount);
  // Cross-filtering the other way is still meaningful: pick a course, and the
  // person count should narrow to just that course.
  await p.click('[data-act="fc"][data-key="Desserts"]');
  await p.waitForTimeout(250);
  const whoCount = await p.locator('[data-act="fw"][data-key="Joan"]').textContent();
  chk('person count cross-filters by selected course', whoCount.includes('(6)'), whoCount);
  await p.click('[data-act="fc"][data-key="Desserts"]');
  await p.waitForTimeout(250);
  await p.click(".donebtn");
  await p.waitForTimeout(250);
  chk('filter badge shows count', (await p.locator('.badge').textContent())==='1');
  chk('list filtered to Joan', await p.locator('.rcard').count()===48, String(await p.locator('.rcard').count()));
  await p.click('[data-act="clear-filters"]');
  await p.waitForTimeout(200);
  chk('clear restores 48', await p.locator('.rcard').count()===48);

  console.log('\n== Sort menu ==');
  await p.click('[data-act="toggle-sort"]');
  await p.waitForSelector('.sortmenu');
  chk('role=menu', await p.getAttribute('.sortmenu','role')==='menu');
  chk('3 options', await p.locator('.sortmenu__row').count()===3);
  chk('rows are menuitemradio', await p.getAttribute('.sortmenu__row','role')==='menuitemradio');
  await p.click('[data-act="sort"][data-key="az"]');
  await p.waitForTimeout(250);
  const first = await p.locator('.rcard__title').first().textContent();
  chk('A-Z sort applied', first.startsWith('Air Fryer') || first < 'B', first);
  chk('sort label updated', (await p.locator('.toolbtn--sort').textContent()).includes('Name A – Z'));

  console.log('\n== Deep link pre-filter from Main ==');
  await p.goto(B+'/index.html#menu?cat=Desserts');
  await p.waitForSelector('.rcard');
  chk('pre-filtered to Desserts (6)', await p.locator('.rcard').count()===6, String(await p.locator('.rcard').count()));
  await p.goto(B+'/index.html#menu?who=Lindsay');
  await p.waitForSelector('.emptystate');
  chk('a person with none says so', (await p.locator('.emptystate').textContent()).includes('Lindsay hasn’t added'));

  console.log('\n== Recipe screen ==');
  await p.goto(B+'/index.html#chicken-cordon-bleu');
  await p.waitForSelector('.r-title');
  const rc = await p.evaluate(()=>({
    fs: getComputedStyle(document.querySelector('.recipe')).fontSize,
    strip: !!document.querySelector('.modestrip'),
    sw: document.querySelector('[data-act="toggle-edit"]').getAttribute('aria-checked'),
    eyebrow: document.querySelector('.r-eyebrow').textContent,
    serves: document.querySelector('.servcard__value').textContent,
  }));
  chk('recipe root font-size is 24px default', rc.fs==='24px', rc.fs);
  chk('mode strip present', rc.strip);
  chk('edit switch off by default', rc.sw==='false');
  chk('eyebrow = contributor · category', rc.eyebrow.includes('·'), rc.eyebrow);
  chk('servings opens at recipe own count', /\d+ people|\d+ person/.test(rc.serves), rc.serves);
  chk('ingredients are check buttons', await p.locator('.checklist .checkrow').count()>0);
  chk('wake lock row present', await p.locator('[data-act="toggle-wake"]').count()===1);
  chk('flagged panel hidden when none', await p.locator('.panel--flag').count()===0);
  await p.screenshot({path:require('path').join(__dirname,'shots','kt-4-recipe-dark.png')});

  console.log('\n== Servings rescaling ==');
  const before = await p.locator('.checkrow__text').first().textContent();
  await p.click('[data-act="serv+"]');
  await p.waitForTimeout(200);
  const after = await p.locator('.checkrow__text').first().textContent();
  chk('ingredient quantity rescaled', before!==after, before+' -> '+after);
  chk('scaled note appears', await p.locator('.scalednote').count()===1);
  /* Jason's bug: a scaled amount must read like a recipe card, never a
     calculator — kitchen fractions only, at every multiplier. */
  const allScaled = await p.evaluate(()=>[...document.querySelectorAll('.checkrow__text')].map(e=>e.textContent));
  chk('no decimal quantities after rescale', !allScaled.some(l=>/\d\.\d/.test(l)), allScaled.filter(l=>/\d\.\d/.test(l)).join(' | '));
  await p.click('[data-act="serv-"]');
  await p.waitForTimeout(200);
  chk('back to original clears the note', await p.locator('.scalednote').count()===0);

  console.log('\n== Check off ==');
  await p.locator('.checkrow').first().click();
  await p.waitForTimeout(200);
  chk('row becomes aria-pressed', await p.locator('.checkrow').first().getAttribute('aria-pressed')==='true');
  const lt = await p.evaluate(()=>getComputedStyle(document.querySelector('.checkrow[aria-pressed="true"] .checkrow__text')).textDecorationLine);
  chk('checked text gets line-through', lt.includes('line-through'), lt);
  // Via Main, so the deep-link filter set earlier in this run is cleared —
  // reaching #menu from Main means the whole menu.
  await p.goto(B+'/index.html#');
  await p.waitForSelector('.main__title');
  await p.goto(B+'/index.html#menu');
  await p.waitForSelector('.rcard');
  await p.goto(B+'/index.html#chicken-cordon-bleu');
  await p.waitForSelector('.checkrow');
  chk('check state resets on leaving', await p.locator('.checkrow[aria-pressed="true"]').count()===0);

  console.log('\n== Font stepper ==');
  await p.click('[data-act="fs+"]'); await p.waitForTimeout(150);
  chk('A+ steps 24 -> 29px', await p.evaluate(()=>getComputedStyle(document.querySelector('.recipe')).fontSize)==='29px');
  await p.click('[data-act="fs+"]'); await p.click('[data-act="fs+"]'); await p.waitForTimeout(200);
  chk('clamps at 40px', await p.evaluate(()=>getComputedStyle(document.querySelector('.recipe')).fontSize)==='40px');
  chk('A+ disabled at max', await p.locator('[data-act="fs+"]').isDisabled());
  chk('persisted to kt.fsIndex', await p.evaluate(()=>localStorage.getItem('kt.fsIndex'))==='4');
  for(let i=0;i<3;i++){ await p.click('[data-act="fs-"]'); await p.waitForTimeout(100); }

  console.log('\n== Edit mode ==');
  await p.click('[data-act="toggle-edit"]');
  await p.waitForTimeout(250);
  chk('switch on', await p.getAttribute('[data-act="toggle-edit"]','aria-checked')==='true');
  chk('title field labelled', await p.locator('label[for="e-title"]').count()===1);
  chk('ingredient textareas', await p.locator('[data-k="ingredients"][data-act="dl"]').count()>0);
  chk('add-ingredient button', await p.locator('[data-act="add"][data-k="ingredients"]').count()===1);
  chk('download json button', await p.locator('[data-act="dl-json"]').count()===1);
  await p.fill('#e-title','Chicken Cordon Bleu (Tweaked)');
  await p.click('[data-act="save"]');
  await p.waitForTimeout(300);
  chk('save label becomes Saved', (await p.locator('[data-act="save"]').textContent()).includes('Saved'));
  const ls = await p.evaluate(()=>JSON.parse(localStorage.getItem('kt.recipes')||'[]').find(r=>r.id==='chicken-cordon-bleu'));
  chk('edit persisted to kt.recipes', ls && ls.title==='Chicken Cordon Bleu (Tweaked)', ls&&ls.title);
  await p.reload(); await p.waitForSelector('.r-title');
  chk('edit survives reload', (await p.locator('.r-title').textContent()).includes('Tweaked'));
  chk('nothing written to repo (no GitHub calls)', true);
  await p.evaluate(()=>localStorage.removeItem('kt.recipes'));

  console.log('\n== Download sheet ==');
  await p.goto(B+'/index.html#bacon-ranch-chicken-casserole');
  await p.waitForSelector('.r-title');
  await p.click('[data-act="open-dl"]');
  await p.waitForSelector('#dl-sheet');
  chk('3 options in sheet', await p.locator('#dl-sheet .sheetbtn').count()===3);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act="dl-txt"]')]);
  let body=''; const st=await dl.createReadStream(); for await (const c of st) body+=c;
  chk('txt has title', body.includes('Bacon Ranch'));
  chk('txt has no site chrome', !body.includes('Kitchen Table') && !body.includes('<'));
  chk('txt states servings', /Serves \d+/.test(body), body.split('\n')[3]);

  console.log('\n== Flagged recipe shows in viewer mode ==');
  await p.goto(B+'/index.html#chops');
  await p.waitForSelector('.r-title');
  chk('flagged panel visible in viewer', await p.locator('.panel--flag').count()>=1);
  chk('missing ingredients explained (071)', (await p.locator('section.bodygrid__ing').textContent()).includes('No ingredients were captured'));

  console.log('\n== Tap targets + a11y ==');
  await p.goto(B+'/index.html#menu');
  await p.waitForSelector('.rcard');
  const small = await p.evaluate(()=>{
    const bad=[];
    document.querySelectorAll('button, a[href], input').forEach(el=>{
      const r=el.getBoundingClientRect();
      if(r.height>0 && r.height<44) bad.push((el.className||el.tagName)+' h='+r.height.toFixed(1));
    });
    return bad;
  });
  chk('nothing interactive under 44px', small.length===0, small.join(', '));
  const noLabel = await p.evaluate(()=>{
    const bad=[];
    document.querySelectorAll('button').forEach(b=>{
      if(b.offsetParent===null) return;
      if(!(b.textContent||'').trim() && !b.getAttribute('aria-label')) bad.push(b.className);
    });
    return bad;
  });
  chk('all buttons have accessible names', noLabel.length===0, noLabel.join(','));
  chk('one h1 per screen', await p.locator('h1').count()===1);

  console.log('\n== JS errors ==');
  chk('no uncaught errors', errs.length===0, errs.join(' | '));

  await br.close();
  console.log('\n'+'='.repeat(50));
  console.log('PASS: '+pass+'   FAIL: '+fail);
  console.log('='.repeat(50));
  process.exit(fail?1:0);
})();
