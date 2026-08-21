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

  console.log('\n== Main: logo lockup + intro sentence ==');
  await p.goto(B+'/index.html'); await p.waitForSelector('.main__title');
  /* Jason moved the mark: it is a logo now — left of the name, and it works. */
  chk('logo mark beside the name', await p.locator('.main__brand .applogo svg').count()===1);
  const logoBox=await p.locator('.applogo').boundingBox();
  const vw=await p.evaluate(()=>window.innerWidth);
  chk('logo sits on the left', logoBox.x < vw/4, 'x='+logoBox.x.toFixed(0)+' of '+vw);
  chk('logo is a home link, not a dead tile', (await p.getAttribute('.applogo','href'))==='#');
  chk('theme button keeps the right', (await p.locator('.themebtn--main').boundingBox()).x > vw/2);
  chk('intro sentence present', (await p.locator('.main__intro').textContent()).length>40);
  chk('subtitle unchanged', (await p.locator('.main__sub').textContent()).trim()==='A Simmonds Styled Menu');

  console.log('\n== Jason, not Me ==');
  const tiles=await p.locator('.who-tile__name').allTextContents();
  chk('sections read Joan / Jason / Jennifer / Lindsay / Siobhan / Jessica', tiles.join(',')==='Joan,Jason,Jennifer,Lindsay,Siobhan,Jessica', tiles.join(','));
  const counts=await p.locator('.who-tile__count').allTextContents();
  chk('Joan has all 48, others invite (058)', counts.join(',')==='48' && await p.locator('.who-tile--empty').count()===5, counts.join(','));
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
  console.log('\n== Who actually turns the motion off (R51) ==');
  {
    /* Worth writing down, because it was a decoy for a whole arc: the
       `@media (prefers-reduced-motion: reduce)` block in style.css can never
       have any effect. tokens.css — the handoff file — carries a blanket
       `* { transition: none !important; animation: none !important;
            transform: none !important; }`
       which wins over all of it. The style.css block is defence in depth for
       the day that blanket is ever narrowed, and that is fine; what is not
       fine is a check that reads the redundant list and reports on the
       motion. The live proof lives in polish.js (R51); this only records
       where the enforcement really is. */
    const fsm = require('fs');
    const pm = require('path');
    const tk = fsm.readFileSync(pm.join(__dirname, '..', 'tokens.css'), 'utf8');
    chk('tokens.css is what actually stops the motion',
      /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,200}animation:\s*none\s*!important/.test(tk));
    chk('and it stops transforms with the same hammer — which is why nothing here centres with one',
      /transform:\s*none\s*!important/.test(tk));
  }

  console.log('\n== The palette rule, enforced (R48) ==');
  {
    /* CLAUDE.md opens with this and calls it "the one rule that keeps getting
       broken": the palette is tokens.css, every colour is a var(--*), and a
       colour that is not in tokens.css is a question rather than a value to
       invent. It has been kept by discipline since the rebuild — style.css
       carries zero hex today — and by nothing else. This is the guard. */
    const fsq = require('fs');
    const pq = require('path');
    const ROOTQ = pq.join(__dirname, '..');
    const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
    const NAMED = /(^|[\s:,(])(red|blue|green|white|black|gray|grey|yellow|orange|purple|pink|brown|silver|gold|navy|teal|olive|lime|aqua|fuchsia|maroon)\s*(;|,|\)|$)/im;

    const style = strip(fsq.readFileSync(pq.join(ROOTQ, 'style.css'), 'utf8'));
    const hex = style.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    chk('style.css invents no colour of its own', hex.length === 0, hex.slice(0, 4).join(' '));
    const funcs = style.match(/\b(rgba?|hsla?)\s*\(/g) || [];
    chk('and reaches for no rgb() or hsl() either', funcs.length === 0, funcs.slice(0, 3).join(' '));
    const named = style.match(NAMED);
    chk('and names none by name', !named, named ? named[0].trim() : '');

    /* The palette itself is allowed hex — it is the palette. */
    const tokens = strip(fsq.readFileSync(pq.join(ROOTQ, 'tokens.css'), 'utf8'));
    chk('tokens.css is where the colours actually live',
      (tokens.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length >= 20);

    /* Two documented exceptions, because a manifest and a meta tag cannot
       read a CSS variable — and both must still agree with the token they
       stand in for, or the phone's chrome is a different green from the page. */
    const bgDark = (tokens.match(/--bg:\s*(#[0-9a-fA-F]{6})/) || [])[1];
    chk('the dark page colour is readable from the palette', !!bgDark, String(bgDark));
    const html = fsq.readFileSync(pq.join(ROOTQ, 'index.html'), 'utf8');
    const meta = (html.match(/name="theme-color"\s+content="(#[0-9a-fA-F]{6})"/) || [])[1];
    chk('the theme-color meta mirrors it exactly',
      !!meta && meta.toUpperCase() === String(bgDark).toUpperCase(), meta + ' vs ' + bgDark);
    const man = JSON.parse(fsq.readFileSync(pq.join(ROOTQ, 'manifest.json'), 'utf8'));
    chk('and so do both colours in the manifest',
      man.theme_color.toUpperCase() === String(bgDark).toUpperCase() &&
      man.background_color.toUpperCase() === String(bgDark).toUpperCase(),
      man.theme_color + ' / ' + man.background_color);
    /* Nothing else in the repo may carry a colour literal. */
    const appjs = fsq.readFileSync(pq.join(ROOTQ, 'app.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const appHex = appjs.match(/#[0-9a-fA-F]{6}\b/g) || [];
    chk('and app.js paints nothing itself', appHex.length === 0, appHex.slice(0, 3).join(' '));

    /* The live proof: the browser chrome follows the palette in both themes,
       reading it rather than repeating it. */
    await p.goto(B + '/index.html');
    await p.waitForSelector('.main__title');
    const chrome = await p.evaluate(async () => {
      const read = () => ({
        meta: document.querySelector('meta[name="theme-color"]').getAttribute('content').trim(),
        token: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
      });
      const dark = read();
      document.querySelector('[data-act="theme"]').click();
      await new Promise(r => setTimeout(r, 250));
      const light = read();
      return { dark, light };
    });
    chk('the browser chrome matches the palette in dark',
      chrome.dark.meta.toUpperCase() === chrome.dark.token.toUpperCase(),
      JSON.stringify(chrome.dark));
    chk('and follows it into light',
      chrome.light.meta.toUpperCase() === chrome.light.token.toUpperCase() &&
      chrome.light.meta !== chrome.dark.meta, JSON.stringify(chrome.light));
  }

  console.log('\n== How to use it (the help screen) ==');
  await p.goto(B+'/index.html');
  await p.waitForSelector('.main__title');
  chk('the front page offers help', await p.locator('.main__help').count()===1);
  await p.click('.main__help');
  await p.waitForSelector('.help');
  chk('route is #help', p.url().endsWith('#help'), p.url());
  chk('one h1', await p.locator('.help h1').count()===1);
  chk('document title names the screen', (await p.title())==='How to use it — Kitchen Table', await p.title());
  chk('it covers the six things people actually do',
    await p.locator('.help__sec').count()===6, String(await p.locator('.help__sec').count()));
  chk('no horizontal scroll at 390px', await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  const helpSmall = await p.evaluate(()=>{
    const bad=[];
    document.querySelectorAll('.help a[href], .help button, header a[href], header button').forEach(el=>{
      const r=el.getBoundingClientRect();
      if (r.height>0 && r.height<44) bad.push((el.className||el.id)+' h='+r.height.toFixed(1));
    });
    return bad;
  });
  chk('nothing interactive under 44px', helpSmall.length===0, helpSmall.join(', '));
  chk('a way back to the recipes', await p.locator('.help a[href="#"]').count()>=1);
  /* It must grow with the reader like every other screen. */
  await p.evaluate(()=>{localStorage.setItem('kt.easyRead','true');localStorage.setItem('kt.fsIndex','4');});
  await p.reload(); await p.waitForSelector('.help');
  chk('survives Easy Read at the largest text', await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await p.evaluate(()=>{localStorage.removeItem('kt.easyRead');localStorage.removeItem('kt.fsIndex');});
  await p.reload(); await p.waitForSelector('.help');

  console.log('\n== The tutorial has to be true (R63) ==');
  {
    /* The Help screen is the one page written for someone who has never been
       shown the app. It names controls in bold and tells the reader where to
       find them — and nothing checked that those controls still exist or
       still say that. A renamed button turns the tutorial into a wild goose
       chase, silently, for exactly the reader least able to recover from it.
       Two lies were found writing this: the front page's button says
       "View all 48 recipes", not "View all recipes"; and the servings
       paragraph promised that "every amount changes with it", which R56–R60
       made deliberately untrue — a step's number only scales when a
       measurement follows it, and 36 ingredient lines carry a second amount
       the app now explicitly leaves alone. */
    const NAMED = [
      ['View all', '#', null],
      ['Plan the week', '#', null],
      ['Aa', '#menu', null],
      ['Add recipe', '#menu', null],
      ['A−', '#menu', '[data-act="open-text"]'],
      ['A+', '#menu', '[data-act="open-text"]'],
      ['Easy Read', '#menu', '[data-act="open-text"]'],
      ['Servings', '#chicken-cordon-bleu', null],
      ['Keep screen on while cooking', '#chicken-cordon-bleu', null],
      ['Share', '#chicken-cordon-bleu', null],
      ['Download', '#chicken-cordon-bleu', null],
      ['Edit', '#chicken-cordon-bleu', null],
      ['Worth double-checking', '#chops', null],
      ['Type it in', '#add', null],
      ['From a link', '#add', null],
      ['From a photo', '#add', null],
      ['From a video', '#add', null]
    ];
    const pH = await ctx.newPage();
    await pH.goto(B + '/index.html#help');
    await pH.waitForSelector('.help');
    const bold = await pH.evaluate(() =>
      [...document.querySelectorAll('.help strong')].map(e => e.textContent.trim()));
    chk('the help names controls in bold', bold.length > 12, String(bold.length));
    /* Every control the table promises is a name the help actually uses —
       so the table cannot quietly drift away from the page it guards. */
    const unclaimed = NAMED.filter(n => !bold.includes(n[0])).map(n => n[0]);
    chk('and the list below is drawn from those names',
      unclaimed.length === 0, unclaimed.join(', '));

    const missing = [];
    for (const [name, hash, extra] of NAMED) {
      await pH.goto('about:blank');
      await pH.goto(B + '/index.html' + hash);
      await pH.waitForTimeout(500);
      if (extra) { await pH.click(extra, { timeout: 4000 }).catch(() => {}); await pH.waitForTimeout(350); }
      /* Every element's text, not only the leaves: a button that holds an
         icon and a label has element children, and its words would drop out
         of a leaf-only sweep — which is how six controls that are plainly
         on the screen first read as missing. */
      const found = await pH.evaluate((n) => {
        const app = document.getElementById('app');
        if (app && (app.textContent || '').indexOf(n) > -1) return true;
        return [...document.querySelectorAll('#app [aria-label]')]
          .some(el => el.getAttribute('aria-label').indexOf(n) > -1);
      }, name);
      if (!found) missing.push('"' + name + '" not on ' + hash);
    }
    chk('every control the help names is where it says it is',
      missing.length === 0, missing.join(' | '));

    /* And the claim R56–R60 made untrue, guarded by the words the app
       itself puts on the line. */
    await pH.goto(B + '/index.html#help');
    await pH.waitForSelector('.help');
    const help = await pH.locator('.help').textContent();
    chk('the help does not promise that every amount changes',
      !/every amount changes/i.test(help));
    chk('and it explains the amounts that do not',
      /not adjusted/.test(help));
    await pH.close();
  }

  console.log('\n== The record keeps its own arithmetic (R52) ==');
  {
    /* CLAUDE.md states a running total and then lists the suites it is made
       of, and for several rounds the total sat one ahead of the sum of its
       own parts — nobody adds eleven numbers by hand twice. It is a small
       thing to be wrong about, but it is a number this file uses to tell
       anyone reading it how much of the app is actually proven, and a
       figure that drifts is worth less than no figure at all. Now it has to
       add up, and the suite count has to match the word in front of it. */
    const md = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'CLAUDE.md'), 'utf8');
    const m = md.match(/\*\*(\d+) functional checks\*\*\s+across\s+(\w+)\s+suites\s*\(([^)]*)\)/);
    chk('CLAUDE.md still states a battery total', !!m);
    if (m) {
      const stated = parseInt(m[1], 10);
      const parts = [...m[3].matchAll(/([a-z]+)\s+(\d+)/g)].map(x => [x[1], parseInt(x[2], 10)]);
      const sum = parts.reduce((a, x) => a + x[1], 0);
      const WORDS = { eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
        thirteen: 13, fourteen: 14, fifteen: 15 };
      chk('the stated total is the sum of the suites it lists',
        sum === stated, stated + ' stated, ' + sum + ' listed (' +
        parts.map(x => x.join(' ')).join(', ') + ')');
      chk('and it names as many suites as it lists',
        WORDS[m[2]] === parts.length,
        m[2] + ' = ' + WORDS[m[2]] + ', listed ' + parts.length);
    }
  }

  chk('no JS errors', errs.length===0, errs.join(' | '));

  await p.goto(B+'/index.html'); await p.waitForSelector('.main__title'); await p.waitForTimeout(300);
  await p.screenshot({path:require('path').join(__dirname,'shots','q1-main.png')});
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard'); await p.waitForTimeout(300);
  await p.screenshot({path:require('path').join(__dirname,'shots','q2-menu.png')});

  await br.close();
  console.log('\n'+'='.repeat(50)+'\nPASS: '+pass+'   FAIL: '+fail+'\n'+'='.repeat(50));
  process.exit(fail?1:0);
})();
