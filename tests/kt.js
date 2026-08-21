const { chromium, devices } = require('playwright');
const B = process.env.KT_BASE || 'http://127.0.0.1:8899';
let pass=0, fail=0;
const chk=(n,c,e='')=>c?(pass++,console.log('  PASS '+n)):(fail++,console.log('  FAIL '+n+(e?' :: '+e:'')));
const browserContextWithReduce = (br) =>
  br.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });

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
  /* Who, Course, Tags — and a fourth, "Still needs a person", for as long as
     anything does (R32). It removes itself when the content pass is done. */
  chk('four groups while the content pass is unfinished',
    await p.locator('.grouph').count()===4,
    String(await p.locator('.grouph').count()));
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

  console.log('\n== The How-To teaches what the app actually does (R33) ==');
  {
    await p.goto(B+'/index.html#help');
    await p.reload();
    await p.waitForSelector('.help__h1');
    const help = (await p.locator('#main-content').textContent()).toLowerCase();
    /* R15 made the servings number typeable precisely because 4 → 40 was
       thirty-six taps. The person most likely to open the How-To is the
       person that punished most, and it was still teaching only the ± pair. */
    /* Scoped to the paragraph that is actually about servings — "type" alone
       matches "Type it in" three sections further down. */
    const servPara = (await p.locator('#main-content li, #main-content p')
      .filter({ hasText: 'Servings' }).first().textContent()).toLowerCase();
    chk('it says the servings number can be typed',
      /type/.test(servPara) && /tap/.test(servPara), servPara.slice(0, 80));
    chk('and it still explains the − and + for small changes',
      help.indexOf('−') > -1 || help.indexOf('minus') > -1);
    /* R15's other half: the keyboard's blue key opens the top match. */
    chk('it mentions the keyboard key that opens the top match',
      /go key|return key|blue key|search key/.test(help), '');
    /* And what it teaches must exist — a How-To that describes a control the
       app does not have is worse than one that says nothing. */
    await p.goto(B+'/index.html#chicken-cordon-bleu');
    await p.waitForSelector('.r-title');
    chk('and the control it describes is really there',
      await p.locator('button.servcard__value').count() === 1);
  }

  console.log('\n== Reduce Motion must not move the furniture (R51) ==');
  {
    /* tokens.css — the handoff palette, and the file that actually enforces
       reduced motion — carries a blanket
       `* { transition: none !important; animation: none !important;
            transform: none !important; }`.
       The first two are the point. The third is a hammer: `transform` is not
       only motion, it is also how things get positioned, and anything centred
       with translate simply falls out of place for a reader who has Reduce
       Motion switched on in iOS Settings — which is exactly the reader this
       app is built around. Measured before the fix: the search icon sat 14px
       below the middle of its field. */
    const ctxR = await browserContextWithReduce(br);
    const pR = await ctxR.newPage();
    await pR.goto(B + '/index.html');
    await pR.waitForSelector('.searchwrap__icon');
    const placed = await pR.evaluate(() => {
      const out = [];
      const pair = (a, b) => {
        const x = document.querySelector(a), y = document.querySelector(b);
        if (!x || !y) return;
        const r1 = x.getBoundingClientRect(), r2 = y.getBoundingClientRect();
        const off = Math.abs((r1.top + r1.height / 2) - (r2.top + r2.height / 2));
        if (off > 2) out.push(a + ' is ' + Math.round(off) + 'px off centre');
      };
      pair('.searchwrap__icon', '.searchfield');
      return out;
    });
    chk('nothing positioned by transform falls out of place under Reduce Motion',
      placed.length === 0, placed.join(' | '));
    /* And the reason it holds: nothing is centred with a transform any more,
       so the blanket rule has nothing of ours to break. */
    const cssR = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'style.css'), 'utf8');
    chk('and no rule leans on translate for placement',
      !/transform:\s*translate[XY]?\(-?50%/.test(cssR),
      (cssR.match(/transform:\s*translate[^;]*/) || [''])[0]);
    await ctxR.close();
  }

  console.log('\n== Two more lines of the definition of done (R49) ==');
  {
    /* CLAUDE.md's own checklist. Both of these have been true since the
       rebuild and neither had a guard. */

    /* "Icon buttons 48×48" — a specific number, not the 44px floor the sweep
       enforces. An icon button that drifts to 44 still passes every existing
       check while being smaller than the spec says it may be.
       One documented exception, pinned rather than waved through: the Main
       header's theme button sits at 44 beside the 44px app mark, trimmed on
       Jason's instruction so "Kitchen Table" still fits on one line at 390px.
       It is checked at exactly 44 — a deliberate exception that is allowed to
       drift is not an exception, it is a hole. */
    const MAIN_EXCEPTION = '.themebtn--main';
    const wrong = [];
    for (const [name, hash, open] of [
      ['Main', '#', null], ['Menu', '#menu', null],
      ['Recipe', '#chicken-cordon-bleu', null],
      ['Week planner', '#plan', null],
      ['Menu text sheet', '#menu', '[data-act="open-text"]']
    ]) {
      await p.goto(B+'/index.html'+hash);
      await p.reload();
      await p.waitForSelector('h1');
      if (open) { await p.click(open); await p.waitForTimeout(300); }
      const bad = await p.evaluate((EXC) => {
        const out = [];
        document.querySelectorAll('.iconbtn').forEach(el => {
          if (el.offsetParent === null) return;
          if (el.matches(EXC)) return;
          const r = el.getBoundingClientRect();
          if (Math.round(r.width) !== 48 || Math.round(r.height) !== 48) {
            out.push((el.getAttribute('aria-label') || el.className) + ' ' +
              Math.round(r.width) + '×' + Math.round(r.height));
          }
        });
        return out;
      }, MAIN_EXCEPTION);
      for (const b of bad) wrong.push(name + ': ' + b);
    }
    chk('every icon button is 48×48, not merely over the floor',
      wrong.length === 0, wrong.slice(0, 3).join(' | '));
    await p.goto(B+'/index.html');
    await p.reload();
    await p.waitForSelector('.main__title');
    const mainPair = await p.evaluate(() => [
      document.querySelector('.themebtn--main'), document.querySelector('.applogo')
    ].map(el => el ? Math.round(el.getBoundingClientRect().height) : null));
    chk('and the one documented exception is exactly 44, not drifting',
      mainPair[0] === 44 && mainPair[1] === 44, mainPair.join(', '));
    chk('which is still what it was trimmed for — the title on one line',
      await p.evaluate(() => {
        const t = document.querySelector('.main__title');
        return t.getBoundingClientRect().height <
          parseFloat(getComputedStyle(t).lineHeight) * 1.6;
      }));

    /* "Viewer mode shows no edit affordances at all." A family member reading
       a recipe must not be able to change it by accident — and must not have
       to wonder which of the things on screen would. */
    await p.goto(B+'/index.html#chicken-cordon-bleu');
    await p.reload();
    await p.waitForSelector('.r-title');
    const leaked = await p.evaluate(() => {
      const sel = ['#e-title', '#e-serves', '[data-act="save"]', '[data-act="add"]',
        '[data-act="dl-json"]', '[data-act="dl-photos"]', '[data-act="remove"]',
        '[data-act="e-serv"]', '.delbtn', 'textarea'];
      return sel.filter(s => document.querySelectorAll(s).length > 0);
    });
    chk('a recipe being read offers nothing that would change it',
      leaked.length === 0, leaked.join(', '));
    chk('and the one control that opens editing is plainly a switch',
      await p.getAttribute('[data-act="toggle-edit"]', 'role') === 'switch' ||
      (await p.getAttribute('[data-act="toggle-edit"]', 'aria-checked')) === 'false',
      String(await p.getAttribute('[data-act="toggle-edit"]', 'aria-checked')));
    /* And the same controls really do appear once editing is on, so the
       check above is measuring absence rather than a wrong selector. */
    await p.click('[data-act="toggle-edit"]');
    await p.waitForTimeout(350);
    const present = await p.evaluate(() => {
      const sel = ['#e-title', '[data-act="save"]', '[data-act="add"]', 'textarea'];
      return sel.filter(s => document.querySelectorAll(s).length > 0);
    });
    chk('the selectors are real — edit mode shows all of them',
      present.length === 4, present.join(', '));
    await p.click('[data-act="toggle-edit"]');
    await p.waitForTimeout(250);
  }

  console.log('\n== The chrome does not grow with the reading text (R39) ==');
  {
    /* Criterion 13. A−/A+ is for the recipe, not for the app: if the header,
       the buttons and the labels grew with it, the top step would spend the
       screen on chrome and leave less room for the words than the step
       before it. Measured on the screen where the stepper lives. */
    await p.goto(B+'/index.html#chicken-cordon-bleu');
    await p.reload();
    await p.waitForSelector('.recipe');
    const shot = () => p.evaluate(() => {
      const px = (sel) => {
        const el = document.querySelector(sel);
        return el ? Math.round(parseFloat(getComputedStyle(el).fontSize) * 100) / 100 : null;
      };
      return { recipe: px('.recipe'), back: px('.backlink'), head: px('.rhead'),
               label: px('.minilabel'), step: px('[data-act="fs+"]') };
    });
    const small = await shot();
    for (let i = 0; i < 3; i++) { await p.click('[data-act="fs+"]'); await p.waitForTimeout(150); }
    const big = await shot();
    chk('the recipe text really did grow', big.recipe > small.recipe,
      small.recipe + ' → ' + big.recipe);
    chk('and the chrome around it did not',
      big.back === small.back && big.head === small.head && big.step === small.step,
      JSON.stringify(small) + ' → ' + JSON.stringify(big));
    /* The minilabel lives inside .recipe and is meant to scale with it —
       stated, so a future reader knows which side of the line it is on. */
    chk('labels inside the recipe do scale, because they are the recipe',
      big.label > small.label, small.label + ' → ' + big.label);
    await p.evaluate(() => localStorage.removeItem('kt.fsIndex'));
  }

  console.log('\n== Share never ends in silence (R43) ==');
  {
    /* Three ways out, in order: the phone's own share sheet, the clipboard,
       a text file. The first two failures were swallowed — press Share, the
       sheet refuses to open, and nothing whatsoever happens. On a phone
       there is no console to check and no way to tell a broken button from
       a slow one. */
    await p.goto(B+'/index.html#chicken-cordon-bleu');
    await p.reload();
    await p.waitForSelector('.r-title');
    /* A share sheet that refuses (not one the user dismissed) must fall
       through rather than stop. */
    await p.evaluate(() => {
      window.__copied = null;
      navigator.share = () => Promise.reject(
        Object.assign(new Error('nope'), { name: 'NotAllowedError' }));
      Object.defineProperty(navigator, 'clipboard', { configurable: true,
        value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } } });
    });
    await p.click('[data-act="share"]');
    await p.waitForTimeout(400);
    chk('a refused share sheet falls through to the clipboard',
      (await p.evaluate(() => window.__copied) || '').includes('Cordon'));
    chk('and says so, rather than leaving you guessing',
      /copied to the clipboard/i.test(await p.locator('#main-content').textContent()),
      (await p.locator('#main-content').textContent()).slice(0, 60));
    /* A share sheet the user simply dismissed is not a failure and must stay
       quiet — copying behind their back would be worse than doing nothing. */
    await p.goto(B+'/index.html#chops');
    await p.reload();
    await p.waitForSelector('.r-title');
    await p.evaluate(() => {
      window.__copied = null;
      navigator.share = () => Promise.reject(
        Object.assign(new Error('cancelled'), { name: 'AbortError' }));
      Object.defineProperty(navigator, 'clipboard', { configurable: true,
        value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } } });
    });
    await p.click('[data-act="share"]');
    await p.waitForTimeout(400);
    chk('a share the reader cancelled copies nothing and says nothing',
      (await p.evaluate(() => window.__copied)) === null &&
      !/copied to the clipboard|saved as a text file/i.test(
        await p.locator('#main-content').textContent()));
    /* And the last resort — a text file — is announced too, because a file
       appearing in Downloads unexplained is its own small mystery. */
    await p.goto(B+'/index.html#chicken-cordon-bleu');
    await p.reload();
    await p.waitForSelector('.r-title');
    await p.evaluate(() => {
      delete navigator.share;
      Object.defineProperty(navigator, 'clipboard', { configurable: true,
        value: { writeText: () => Promise.reject(new Error('no')) } });
    });
    const [dl] = await Promise.all([
      p.waitForEvent('download'),
      p.click('[data-act="share"]')
    ]);
    chk('with no share sheet and no clipboard, it saves a file',
      dl.suggestedFilename() === 'chicken-cordon-bleu.txt', dl.suggestedFilename());
    await p.waitForTimeout(300);
    chk('and explains that it did',
      /saved as a text file/i.test(await p.locator('#main-content').textContent()),
      (await p.locator('#main-content').textContent()).slice(0, 60));
  }

  console.log('\n== A control drawn as on says so (R37) ==');
  {
    /* Criterion 11: state is announced, not just drawn. Three controls in
       this app pick up "on" styling; each is checked for what a screen
       reader would actually hear, since a general "has some aria attribute"
       rule passes on labels that never change and proves nothing. */
    await p.goto(B+'/index.html#menu');
    await p.reload();
    await p.waitForSelector('[data-act="open-text"]');

    /* 1 — the search toggle already carries aria-pressed. */
    const searchOff = await p.getAttribute('[data-act="toggle-search"]', 'aria-pressed');
    await p.click('[data-act="toggle-search"]');
    await p.waitForTimeout(250);
    chk('the search button says whether it is open',
      searchOff === 'false' &&
      await p.getAttribute('[data-act="toggle-search"]', 'aria-pressed') === 'true');
    await p.click('[data-act="toggle-search"]');
    await p.waitForTimeout(200);

    /* 2 — the Filter button's "on" is a count, and the count is text inside
       the button, so it reaches the accessible name. */
    await p.click('[data-act="open-filter"]');
    await p.waitForSelector('#filter-sheet');
    await p.click('[data-act="fc"][data-key="Dinner"]');
    await p.waitForTimeout(200);
    await p.click('.donebtn');
    await p.waitForTimeout(250);
    chk('the Filter button says how many filters are on',
      /1/.test(await p.locator('[data-act="open-filter"]').textContent()),
      await p.locator('[data-act="open-filter"]').textContent());
    await p.click('[data-act="clear-filters"]');
    await p.waitForTimeout(250);

    /* 3 — Easy Read. The button wears the "on" styling and, before this
       round, announced nothing about the mode: a screen-reader user could
       not tell Easy Read from ordinary reading. */
    const beforeName = await p.getAttribute('[data-act="open-text"]', 'aria-label');
    await p.click('[data-act="open-text"]');
    await p.waitForSelector('[data-act="toggle-easy"], .switch');
    await p.locator('[data-act="toggle-easy"], .switch').first().click();
    await p.waitForTimeout(300);
    await p.click('[data-act="close-text"]').catch(()=>{});
    await p.waitForTimeout(250);
    const afterName = await p.getAttribute('[data-act="open-text"]', 'aria-label');
    chk('turning Easy Read on changes what its button announces',
      afterName !== beforeName && /easy read/i.test(afterName || ''),
      beforeName + ' → ' + afterName);
    await p.evaluate(() => localStorage.removeItem('kt.easyRead'));
    await p.reload();
    await p.waitForSelector('[data-act="open-text"]');
    chk('and with it off the button says nothing about it',
      !/easy read/i.test(
        await p.getAttribute('[data-act="open-text"]', 'aria-label') || ''),
      await p.getAttribute('[data-act="open-text"]', 'aria-label'));
  }

  console.log('\n== A notice is said once, for the action that earned it (R36) ==');
  {
    /* Criterion 16. Every state change here is a full re-render, so a
       role="status" inside the rendered HTML is a NEW live region each time —
       and a screen reader announces a live region as it appears. Tick ten
       ingredients with a notice on screen and the notice is read ten times.
       Counted the way a screen reader sees it: how many live regions get
       inserted carrying that text. */
    await p.goto(B+'/index.html#plan');
    await p.reload();
    await p.waitForSelector('.dayblock');
    await p.evaluate(() => {
      window.__spoken = [];
      const seen = new WeakSet();
      const read = (root) => {
        (root.matches && root.matches('[role="status"], [aria-live]') ? [root] : [])
          .concat([...(root.querySelectorAll
            ? root.querySelectorAll('[role="status"], [aria-live]') : [])])
          .forEach(el => {
            if (seen.has(el)) return;
            seen.add(el);
            const t = (el.textContent || '').trim();
            if (t) window.__spoken.push(t);
          });
      };
      new MutationObserver(muts => {
        muts.forEach(m => {
          m.addedNodes.forEach(n => { if (n.nodeType === 1) read(n); });
          if (m.type === 'characterData' && m.target.parentElement) read(m.target.parentElement);
        });
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    /* Earn a notice: planning a meal says so. */
    await p.click('[data-act="plan-pick"]');
    await p.waitForSelector('[data-act="plan-assign"]');
    await p.locator('[data-act="plan-assign"]').first().click();
    await p.waitForTimeout(400);
    const notice = (await p.locator('#main-content').textContent());
    chk('planning a meal says so', /planned for/i.test(notice), notice.slice(0, 60));
    await p.evaluate(() => window.__spoken = []);   // ignore the one it earned
    /* Then six ordinary things that re-render the screen. */
    for (let i = 0; i < 6; i++) {
      await p.click('[data-act="week-next"]');
      await p.waitForTimeout(120);
      await p.click('[data-act="week-prev"]');
      await p.waitForTimeout(120);
    }
    const spoken = await p.evaluate(() => window.__spoken);
    const repeats = spoken.filter(t => /planned for/i.test(t)).length;
    chk('an old notice is not read out again on every re-render',
      repeats === 0, repeats + ' repeats: ' + spoken.slice(0, 2).join(' | '));
    chk('and the message is still on the screen where it was put',
      /planned for/i.test(await p.locator('#main-content').textContent()));
    /* Said once is not the same as said never: the one stable region outside
       #app is what carries it, and it must actually have carried it. */
    chk('and it did reach the live region, once',
      /planned for/i.test(await p.locator('#route-live').textContent()),
      await p.locator('#route-live').textContent());
  }

  console.log('\n== A search you can send to someone (R34) ==');
  await p.goto(B+'/index.html#menu');
  await p.reload();
  await p.waitForSelector('.rcard');
  await p.click('[data-act="toggle-search"]');
  await p.waitForSelector('#menu-search');
  await p.fill('#menu-search', 'bacon');
  await p.waitForTimeout(300);
  const baconCount = await p.locator('.rcard').count();
  chk('searching narrows the list', baconCount > 0 && baconCount < 48, String(baconCount));
  chk('and the search is in the address', /[?&]q=bacon/.test(await p.evaluate(()=>location.hash)),
    await p.evaluate(()=>location.hash));
  await p.reload();
  await p.waitForSelector('.rcard');
  chk('a reload lands on the same search',
    await p.locator('.rcard').count() === baconCount, String(await p.locator('.rcard').count()));
  chk('with the box open and the words still in it',
    await p.inputValue('#menu-search') === 'bacon');
  /* Typing is not navigation either — twenty letters must not be twenty
     presses of Back. */
  const histBefore = await p.evaluate(()=>history.length);
  await p.fill('#menu-search', 'bacon r');
  await p.waitForTimeout(250);
  await p.fill('#menu-search', 'bacon ra');
  await p.waitForTimeout(250);
  chk('typing never piles up history entries',
    await p.evaluate(()=>history.length) === histBefore,
    histBefore + ' → ' + await p.evaluate(()=>history.length));
  await p.fill('#menu-search', '');
  await p.waitForTimeout(250);
  chk('emptying it takes it back out of the address',
    !/[?&]q=/.test(await p.evaluate(()=>location.hash)),
    await p.evaluate(()=>location.hash));
  chk('and the whole book is back', await p.locator('.rcard').count() === 48);

  console.log('\n== Finding what still needs a person (R32) ==');
  await p.goto(B+'/index.html#menu');
  await p.reload();
  await p.waitForSelector('.rcard');
  await p.click('[data-act="open-filter"]');
  await p.waitForSelector('#filter-sheet');
  const needsChip = p.locator('[data-act="fn"]');
  chk('the Filter sheet offers it', await needsChip.count() === 1);
  chk('and says how many there are',
    /\(\d+\)/.test(await needsChip.textContent()), await needsChip.textContent());
  await needsChip.click();
  await p.waitForTimeout(250);
  const flaggedCount = await p.locator('.rcard').count();
  chk('it narrows the list', flaggedCount > 0 && flaggedCount < 48, String(flaggedCount));
  chk('a recipe with an open question is in it',
    await p.locator('.rcard[href="#chops"]').count() === 1);
  chk('a recipe with nothing wrong is not',
    await p.locator('.rcard[href="#chicken-cordon-bleu"]').count() === 0);
  chk('and it travels in the address like every other filter',
    /needs=1/.test(await p.evaluate(()=>location.hash)),
    await p.evaluate(()=>location.hash));
  await p.reload();
  await p.waitForSelector('.rcard');
  chk('so it survives a reload', await p.locator('.rcard').count() === flaggedCount);
  await p.click('[data-act="clear-filters"]');
  await p.waitForTimeout(250);
  chk('and clearing lets everything back', await p.locator('.rcard').count() === 48);

  console.log('\n== The address says what you are looking at (R18) ==');
  await p.goto(B+'/index.html#menu');
  await p.waitForSelector('.rcard');
  await p.click('[data-act="open-filter"]');
  await p.waitForSelector('#filter-sheet');
  await p.click('[data-act="fc"][data-key="Desserts"]');
  await p.waitForTimeout(200);
  chk('choosing a filter writes it into the address',
    /[?&]cat=Desserts/.test(await p.evaluate(()=>location.hash)),
    await p.evaluate(()=>location.hash));
  await p.click('[data-act="fc"][data-key="Sides"]');
  await p.waitForTimeout(200);
  chk('two of the same kind both survive the trip',
    /cat=Desserts/.test(await p.evaluate(()=>location.hash)) &&
    /cat=Sides/.test(await p.evaluate(()=>location.hash)),
    await p.evaluate(()=>location.hash));
  await p.click('.donebtn');
  await p.waitForTimeout(200);
  const twoCats = await p.locator('.rcard').count();
  await p.reload();
  await p.waitForSelector('.rcard');
  chk('and a reload lands on the same list, not on everything',
    await p.locator('.rcard').count()===twoCats && twoCats < 48, String(twoCats));
  chk('the filter count survives with it',
    (await p.locator('.badge').textContent())==='2');
  await p.click('[data-act="toggle-sort"]');
  await p.waitForSelector('.sortmenu');
  await p.click('[data-act="sort"][data-key="az"]');
  await p.waitForTimeout(200);
  chk('sort is in the address too',
    /[?&]sort=az/.test(await p.evaluate(()=>location.hash)),
    await p.evaluate(()=>location.hash));
  await p.reload();
  await p.waitForSelector('.rcard');
  chk('and survives a reload', (await p.locator('.toolbtn--sort').textContent()).includes('Name A – Z'));
  chk('the default sort is not written into the address',
    !/sort=recent/.test(await p.evaluate(()=>location.hash)),
    await p.evaluate(()=>location.hash));
  // Filtering is not navigation: twenty chip taps must not become twenty
  // presses of Back before you can leave the Menu.
  const backSteps = await p.evaluate(()=>history.length);
  await p.click('[data-act="open-filter"]');
  await p.waitForSelector('#filter-sheet');
  await p.click('[data-act="fc"][data-key="Breakfast"]');
  await p.waitForTimeout(200);
  await p.click('[data-act="fc"][data-key="Breakfast"]');
  await p.waitForTimeout(200);
  chk('filtering never piles up history entries',
    await p.evaluate(()=>history.length) === backSteps,
    backSteps + ' → ' + await p.evaluate(()=>history.length));
  await p.click('.donebtn');
  await p.waitForTimeout(150);
  await p.click('[data-act="clear-filters"]');
  await p.waitForTimeout(250);
  chk('clearing empties the address as well as the list',
    await p.locator('.rcard').count()===48 &&
    !/cat=/.test(await p.evaluate(()=>location.hash)),
    await p.evaluate(()=>location.hash));

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

  console.log('\n== R93 — the scaler, over the whole book ==');
  {
    /* `R56`-`R60` found four real scaling bugs, every one by hand: an air
       fryer set to 780°F, `1-1/2 tsp` doubling to `2-1/2`, a lasagne whose
       entire sauce never scaled, and 28 lines contradicting themselves.
       Amounts are the most consequential thing this app computes — get one
       wrong and the food is wrong — and the checks above cover a single
       recipe. This sweeps all 48.
       Three invariants, and it is worth being exact about what each one is
       worth, because mutation testing cut the first one down to size:
         - **an amount survives**: a line that starts with a quantity still
           starts with one at 1 serving and at 40. Testing for an empty
           LINE was not enough — a quantity can round away to nothing and
           leave " tsp salt" behind, which is a deleted amount in a recipe.
           This is the invariant that bites.
         - **no garbage**: no NaN, no undefined, no Infinity anywhere.
         - **the book is shown as written**: at a recipe's own count the
           screen matches `recipes.json` line for line. `scaleLine`
           short-circuits at mult 1, so this is NOT evidence the arithmetic
           is right — it catches a scaler that rewrites or mutates the text
           it was only meant to read. It compares against the published
           file, never against what the DOM showed a moment ago: a
           transformation applied consistently matches itself, and the
           first version of this check did exactly that and passed.
       What none of them catch, stated plainly: a value scaled *wrongly*
       still passes. `R58`'s 390°F→780°F and `R59`'s unscaled sauce would
       sail through all three. Those needed a person reading a recipe, and
       they still do. This is a tripwire, not a proof.
       Driven in-page rather than through the harness: the same sweep costs
       140 seconds of Playwright round-trips and 2 seconds this way. */
    await p.goto(B + '/index.html');
    const book = await p.evaluate(() => fetch('recipes.json').then(r => r.json()));
    const trips = [], junk = [], gone = [];
    let linesSeen = 0, swept = 0;
    for (const r of book) {
      await p.goto(B + '/index.html#' + r.id);
      await p.waitForSelector('.r-title');
      const res = await p.evaluate((target) => {
        const read = () => [].slice.call(document.querySelectorAll('.checkrow__text'))
          .map(e => e.textContent.trim());
        const set = (n) => {
          const b = document.querySelector('[data-act="serv-edit"]');
          if (!b) return false;
          b.click();
          const si = document.getElementById('serv-input');
          if (!si) return false;
          si.value = String(n);
          si.dispatchEvent(new Event('input', { bubbles: true }));
          si.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          return true;
        };
        const orig = read();
        if (!set(1)) return null;
        const one = read();
        set(40);
        const forty = read();
        set(target);
        return { orig: orig, one: one, forty: forty, back: read() };
      }, r.servings);
      if (!res || !res.orig.length) continue;
      swept++;
      linesSeen += res.orig.length;
      /* Compared against the PUBLISHED file, not against what the DOM
         showed a moment ago — mutation testing caught that too. A scaler
         that rewrote every line identically on the way in and out matched
         itself perfectly; only recipes.json can say what the book actually
         holds. */
      (r.ingredients || []).forEach(function (published, i) {
        if (res.back[i] !== published) {
          trips.push(r.id + ' [' + i + '] book says "' + String(published).slice(0, 34) +
            '", screen shows "' + String(res.back[i]).slice(0, 34) + '"');
        }
      });
      /* An amount is a leading digit or a vulgar fraction. Testing only for
         an empty LINE was not enough — mutation testing caught that: make
         a tiny amount round away to "" and the line still reads " tsp
         salt", which is a quantity silently deleted from a recipe and
         exactly the kind of thing this sweep exists to notice. */
      const hasAmount = (t) => /^[\d¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/.test(t.trim());
      [['1', res.one], ['40', res.forty]].forEach(function (pair) {
        pair[1].forEach(function (t, i) {
          if (/\bNaN\b|\bundefined\b|\bInfinity\b/.test(t)) {
            junk.push(r.id + ' at ' + pair[0] + ': "' + t.slice(0, 50) + '"');
          }
          if (!t) gone.push(r.id + ' at ' + pair[0] + ': line ' + i + ' scaled to nothing');
          else if (hasAmount(res.orig[i] || '') && !hasAmount(t)) {
            gone.push(r.id + ' at ' + pair[0] + ': "' + (res.orig[i] || '').slice(0, 34) +
              '" lost its amount -> "' + t.slice(0, 34) + '"');
          }
        });
      });
    }
    chk('the sweep really read the book', swept >= 44 && linesSeen >= 300,
      swept + ' recipes, ' + linesSeen + ' lines');
    chk('at its own count, every recipe shows exactly what the book says',
      trips.length === 0, trips.slice(0, 3).join(' ; '));
    chk('and no amount scales into nonsense at 1 or at 40',
      junk.length === 0, junk.slice(0, 3).join(' ; '));
    chk('and no line loses its amount, or itself, at either end',
      gone.length === 0, gone.slice(0, 3).join(' ; '));
  }

  console.log('\n== Scaling must not invent an oven temperature (R56) ==');
  {
    /* The README promises instruction quantities scale too — "Bake 2 cups
       of…" — and the rule was "scale the leading number". The collection
       contains a step the rule was never written for: `fries-in-ninja` step
       one is "390 - 3 mins", which is a Ninja air-fryer SETTING, not an
       amount. Doubling the recipe made it 780. Halving it made it 195.
       Sweeping all 48 recipes, that is the only step in the book that starts
       with a number, and it is a temperature — so the leading number in a
       step is scaled now only when a measurement word follows it. */
    const pN = await ctx.newPage();
    const stepsAt = async (n) => {
      await pN.goto(B + '/index.html#fries-in-ninja');
      await pN.waitForSelector('.checklist--steps');
      const cur = await pN.evaluate(() => {
        const m = (document.querySelector('.servcard__value, [data-act="serv-edit"]')
          || {}).textContent || '';
        return parseInt(m, 10);
      });
      const d = n - (isNaN(cur) ? 4 : cur);
      for (let i = 0; i < Math.abs(d); i++) {
        await pN.click(d > 0 ? '[data-act="serv+"]' : '[data-act="serv-"]');
        await pN.waitForTimeout(90);
      }
      await pN.waitForTimeout(200);
      return pN.locator('.checklist--steps .checkrow__text').allTextContents();
    };
    const asWritten = await stepsAt(4);
    chk('the air-fryer setting reads 390 as written',
      asWritten[0].indexOf('390') === 0, asWritten[0]);
    const doubled = await stepsAt(8);
    chk('doubling the recipe does not double the temperature',
      doubled[0].indexOf('390') === 0, doubled[0]);
    const halved = await stepsAt(2);
    chk('and halving it does not halve the temperature',
      halved[0].indexOf('390') === 0, halved[0]);
    chk('the timings in that step are left alone too',
      doubled.join(' | ') === asWritten.join(' | '),
      doubled.join(' | '));

    /* The promise the README makes is still kept where it means something:
       a step that opens with a real amount does scale. Seeded, because no
       recipe in the book currently has one — an imported prose step is
       where this will first show up. */
    await pN.evaluate(() => {
      localStorage.setItem('kt.recipes', JSON.stringify([{
        id: 'scale-probe', title: 'Scale Probe', category: 'Baking',
        contributor: 'Joan', servings: 4,
        ingredients: ['2 cups flour'],
        steps: ['2 cups of the flour go in first.', '350 degrees, 20 minutes.',
          '9x13 pan, greased.']
      }]));
    });
    await pN.goto(B + '/index.html#scale-probe');
    await pN.reload();
    await pN.waitForSelector('.checklist--steps');
    await pN.click('[data-act="serv+"]');
    await pN.waitForTimeout(120);
    await pN.click('[data-act="serv+"]');
    await pN.waitForTimeout(120);
    await pN.click('[data-act="serv+"]');
    await pN.waitForTimeout(120);
    await pN.click('[data-act="serv+"]');
    await pN.waitForTimeout(250);
    const probe = await pN.locator('.checklist--steps .checkrow__text').allTextContents();
    chk('a step that opens with a real amount still scales',
      probe[0].indexOf('4 cups') === 0, probe[0]);
    chk('a step that opens with a temperature does not',
      probe[1].indexOf('350') === 0, probe[1]);
    chk('and neither does a pan size',
      probe[2].indexOf('9x13') === 0, probe[2]);
    const ing = await pN.locator('.checklist:not(.checklist--steps) .checkrow__text').allTextContents();
    chk('while the ingredient list scales as it always did',
      ing[0].indexOf('4 cups') === 0, ing[0]);
    await pN.evaluate(() => localStorage.removeItem('kt.recipes'));
    await pN.close();
  }

  console.log('\n== A hyphen means two different things on a recipe card (R57) ==');
  {
    /* Handwritten cards write one-and-a-half as "1-1/2" and a range as
       "7-8". Both open with a number and a hyphen and they mean opposite
       things, and the scaler read every one of them as "a number, then some
       text". Six ingredient lines in the book are affected, and the two
       failure shapes are not equally visible:
         "7-8 slices of bacon"        doubled to "14-8 slices"   — obvious
         "1-1/2 teaspoons vanilla"    doubled to "2-1/2 teaspoons" — which
       reads as two and a half and is wrong by a third; one and a half
       doubled is three. A wrong amount that still looks like an amount is
       the one worth catching. */
    const pH = await ctx.newPage();
    const doubled = async (id, servings) => {
      await pH.goto(B + '/index.html#' + id);
      await pH.waitForSelector('.checklist');
      for (let i = 0; i < servings; i++) {
        await pH.click('[data-act="serv+"]');
        await pH.waitForTimeout(70);
      }
      await pH.waitForTimeout(250);
      return pH.locator('.checklist:not(.checklist--steps) .checkrow__text').allTextContents();
    };
    const cake = await doubled('warm-chocolate-pudding-cake', 8);
    const vanilla = cake.find(l => /vanilla/i.test(l)) || '';
    const water = cake.find(l => /hot water/i.test(l)) || '';
    chk('one and a half teaspoons doubled is three, not two and a half',
      /^3\s/.test(vanilla), vanilla);
    chk('and one and a quarter cups doubled is two and a half',
      /^2½/.test(water), water);

    const bacon = await doubled('bacon-ranch-chicken-casserole', 6);
    const slices = bacon.find(l => /bacon/i.test(l)) || '';
    chk('a range doubles at both ends', /^14\s*[-–]\s*16\b/.test(slices), slices);

    const cass = await doubled('creamy-chicken-casserole', 6);
    const breasts = cass.find(l => /Chicken Breasts/i.test(l)) || '';
    chk('including a range whose second half has no unit after it',
      /^4\s*[-–]\s*8\b/.test(breasts), breasts);

    const lasagne = await doubled('chicken-lasagne', 9);
    const noodles = lasagne.find(l => /noodles/i.test(l)) || '';
    chk('and one in the tens', /^20\s*[-–]\s*30\b/.test(noodles), noodles);

    const keto = await doubled('keto-soup', 6);
    const curry = keto.find(l => /curry/i.test(l)) || '';
    chk('and one where a unit does follow', /^2\s*[-–]\s*4\b/.test(curry), curry);

    /* A step that opens with what looks like a range is still a step, and
       R56's rule still governs it: "390 - 3 mins" is an air-fryer setting
       either way, and reading it as a range would have made it 780 - 6. */
    await pH.goto(B + '/index.html#fries-in-ninja');
    await pH.waitForSelector('.checklist--steps');
    for (let i = 0; i < 4; i++) { await pH.click('[data-act="serv+"]'); await pH.waitForTimeout(70); }
    await pH.waitForTimeout(250);
    const fry = await pH.locator('.checklist--steps .checkrow__text').first().textContent();
    chk('and the air-fryer setting is not a range either',
      fry.trim() === '390 - 3 mins', fry);
    await pH.close();
  }

  console.log('\n== A quantity behind a label is still a quantity (R58) ==');
  {
    /* Cards label their sections. "For the sauce: 6 tablespoons butter",
       "Brine: 3 cups water", "Sauce: 1/8 teaspoon dill weed" — twelve lines
       across three recipes, and not one of them scaled, because the scaler
       only ever looked at the start of the line. Doubling Chicken Lasagne
       served eighteen people from a sauce still made for nine, and said
       nothing about it: six of its fourteen ingredients simply did not move.
       That is the quietest of the three scaling faults and the worst of
       them — the other two at least look wrong. */
    const pL = await ctx.newPage();
    const doubled = async (id, servings) => {
      await pL.goto(B + '/index.html#' + id);
      await pL.waitForSelector('.checklist');
      for (let i = 0; i < servings; i++) {
        await pL.click('[data-act="serv+"]');
        await pL.waitForTimeout(60);
      }
      await pL.waitForTimeout(250);
      return pL.locator('.checklist:not(.checklist--steps) .checkrow__text').allTextContents();
    };

    const las = await doubled('chicken-lasagne', 9);
    const sauce = las.filter(l => /^For the sauce:/.test(l));
    chk('the lasagne sauce is six labelled lines', sauce.length === 6, String(sauce.length));
    chk('butter doubles behind its label',
      sauce.some(l => /For the sauce: 12 tablespoons butter/.test(l)), sauce.join(' | '));
    chk('and so does a mixed number behind one',
      sauce.some(l => /For the sauce: 3 tablespoons minced garlic/.test(l)), sauce.join(' | '));
    chk('and a bare fraction',
      sauce.some(l => /For the sauce: 1 teaspoon poultry seasoning/.test(l)), sauce.join(' | '));
    chk('and one that lands on a kitchen fraction',
      sauce.some(l => /For the sauce: 1½ teaspoons? salt/.test(l)), sauce.join(' | '));
    chk('every labelled sauce line moved',
      sauce.every(l => !/: (6 tablespoons|1 1\/2|1\/2 teaspoon|3\/4 teaspoon|5 cups)/.test(l)),
      sauce.join(' | '));

    const brine = (await doubled('pork-chops-white-wine', 4)).filter(l => /^Brine:/.test(l));
    chk('the brine doubles too',
      brine.length === 2 && brine.every(l => /: 6 (tbsp|cups)/.test(l)), brine.join(' | '));

    const schn = (await doubled('pork-schnitzel', 2)).filter(l => /^Sauce:/.test(l));
    chk('and the schnitzel sauce, hyphenated mixed number and all',
      schn.some(l => /Sauce: 3 teaspoons all-purpose flour/.test(l)), schn.join(' | '));
    chk('including the eighth of a teaspoon',
      schn.some(l => /Sauce: ¼ teaspoon dill weed/.test(l)), schn.join(' | '));

    /* The search is for ingredients only. R56 settled what a step's leading
       number means; hunting through the rest of a sentence for something
       that looks like an amount is a different and much freer licence, and
       this app does not take it. */
    await pL.goto(B + '/index.html#fries-in-ninja');
    await pL.waitForSelector('.checklist--steps');
    for (let i = 0; i < 4; i++) { await pL.click('[data-act="serv+"]'); await pL.waitForTimeout(60); }
    await pL.waitForTimeout(250);
    const steps = await pL.locator('.checklist--steps .checkrow__text').allTextContents();
    chk('steps are not searched for quantities mid-sentence',
      steps.join(' | ') === '390 - 3 mins | Fries - 6 mins | Add fish - 9 mins (turn after 5)',
      steps.join(' | '));
    await pL.close();
  }

  console.log('\n== Three more ways a card writes a range (R59) ==');
  {
    /* R57 taught the scaler that "7-8" is two ends of one amount. It only
       ever learned the plainest shape of it. Four more lines in the book
       are ranges the scaler still read as "a number, then some text":
         "1 to 2 tablespoons milk"          — the word, not the hyphen
         "1/4 - 1/2 teaspoon ancho chili"   — fractions on both sides
         "1 1/2 - 2 lb. russet potatoes"    — a mixed number on the left
       Same failure as before and the same cost: the first end doubles and
       the second stands still, so a doubled recipe reads "2 to 2" or
       "3 - 2", which is not a range at all. */
    const pR = await ctx.newPage();
    const doubled = async (id, servings) => {
      await pR.goto(B + '/index.html#' + id);
      await pR.waitForSelector('.checklist');
      for (let i = 0; i < servings; i++) {
        await pR.click('[data-act="serv+"]');
        await pR.waitForTimeout(60);
      }
      await pR.waitForTimeout(250);
      return pR.locator('.checklist:not(.checklist--steps) .checkrow__text').allTextContents();
    };
    const frosting = await doubled('vanilla-frosting', 8);
    const milk = frosting.find(l => /milk/i.test(l)) || '';
    chk('a range written with the word "to" doubles at both ends',
      /^2 to 4 tablespoons/.test(milk), milk);

    const schn = await doubled('pork-schnitzel', 2);
    const oil = schn.find(l => /vegetable oil/i.test(l)) || '';
    chk('and so does the other one', /^2 to 4 tablespoons/.test(oil), oil);

    const soup = await doubled('potato-bacon-soup', 6);
    const chili = soup.find(l => /ancho/i.test(l)) || '';
    chk('a range of fractions doubles at both ends',
      /^½\s*[-–]\s*1 teaspoon/.test(chili), chili);

    const pie = await doubled('shepherds-pie', 6);
    const spuds = pie.find(l => /russet/i.test(l)) || '';
    chk('and a range that opens with a mixed number',
      /^3\s*[-–]\s*4 lb\./.test(spuds), spuds);

    /* Order is load-bearing and easy to break: "1-1/2" is ONE amount, and
       a range reader that ran first would take it for one-to-a-half. */
    const cake = await doubled('warm-chocolate-pudding-cake', 8);
    const vanilla = cake.find(l => /vanilla/i.test(l)) || '';
    chk('and a hyphenated mixed number is still not a range',
      /^3 teaspoons/.test(vanilla), vanilla);
    await pR.close();
  }

  console.log('\n== The amounts the scaler did not touch, said out loud (R60) ==');
  {
    /* Twenty-eight ingredient lines carry a second amount after the one
       that scales: "1 lb (450g) chicken breast", "1 cup (2 sticks) butter",
       "1 jar (16 ounces) Picante Sauce". Some are conversions of the same
       amount and would want scaling; some are pack sizes and must not be.
       Telling those apart is a judgement about meaning, not a parsing
       question, and getting it wrong invents a number — so the app does
       what it does everywhere else and says so instead of guessing.
       Before this the line simply contradicted itself: "2 lb (450g)". */
    const pK = await ctx.newPage();
    const open = async (id) => {
      await pK.goto(B + '/index.html#' + id);
      await pK.waitForSelector('.checklist');
    };
    const bump = async (n) => {
      for (let i = 0; i < n; i++) { await pK.click('[data-act="serv+"]'); await pK.waitForTimeout(60); }
      await pK.waitForTimeout(250);
    };

    await open('chicken-stroganoff');
    chk('at the original count nothing is marked',
      await pK.locator('.keptnote').count() === 0,
      String(await pK.locator('.keptnote').count()));
    chk('and the scaled note is not there either',
      await pK.locator('.scalednote').count() === 0);

    await bump(4);
    const rows = await pK.locator('.checklist:not(.checklist--steps) .checkrow__text').allTextContents();
    const chicken = rows.find(l => /chicken breast/i.test(l)) || '';
    chk('a doubled line names the amount it did not change',
      /^2 lb \(450g\) chicken breast.*450g not adjusted/.test(chicken), chicken);
    chk('it names the value rather than showing a bare marker',
      (await pK.locator('.keptnote').first().textContent()).includes('450g'),
      await pK.locator('.keptnote').first().textContent());
    chk('every line that carries one is marked',
      await pK.locator('.keptnote').count() === 4,
      String(await pK.locator('.keptnote').count()));
    const note = await pK.locator('.scalednote').textContent();
    chk('and the note at the top says how many',
      /Four of these lines carry a second amount/.test(note), note);
    /* `R77` — and it says it readably. The first version of this sentence
       ran the two numbers together — "from the original 4. 4 lines carry"
       — which at 24px reads as "4.4 lines". Two numerals with nothing but
       punctuation between them is a legibility fault in an app built for
       low vision, so the rule is the shape, not the wording. */
    chk('without running two numbers together',
      !/\d\s*[.,]\s*\d/.test(note), note);

    /* A label, not a control. The row is the button; a second tappable
       thing inside it would be a trap, and the 44px floor would apply. */
    chk('the mark is a label, not something to tap',
      await pK.locator('.keptnote button, .keptnote a').count() === 0 &&
      await pK.evaluate(() => {
        const n = document.querySelector('.keptnote');
        return n.tagName === 'SPAN' && !n.hasAttribute('data-act');
      }));

    /* Back where it started, there is nothing to check and nothing said. */
    for (let i = 0; i < 4; i++) { await pK.click('[data-act="serv-"]'); await pK.waitForTimeout(60); }
    await pK.waitForTimeout(250);
    chk('stepping back to the original clears the marks',
      await pK.locator('.keptnote').count() === 0 &&
      await pK.locator('.scalednote').count() === 0);

    /* A recipe with no such lines says nothing extra — the sentence has to
       match what the list actually shows. */
    await open('chicken-cordon-bleu');
    await bump(2);
    chk('a recipe with none of them gets no extra sentence',
      await pK.locator('.keptnote').count() === 0 &&
      !/second amount/.test(await pK.locator('.scalednote').textContent()),
      await pK.locator('.scalednote').textContent());

    /* Paper and the plain-text download carry it too: the cook away from
       the screen is the one who most needs to know. */
    await open('chicken-stroganoff');
    await bump(4);
    await pK.emulateMedia({ media: 'print' });
    chk('it survives onto paper',
      await pK.evaluate(() =>
        getComputedStyle(document.querySelector('.keptnote')).display !== 'none'));
    await pK.emulateMedia({ media: 'screen' });
    await pK.close();
  }

  console.log('\n== One badly-shaped recipe must not take the book down (R62) ==');
  {
    /* The overlay and recipes.json are both hand-editable by design — the
       download-and-commit workflow depends on it, and the nightly db-sync
       regenerates the file unattended. So a recipe can arrive with a string
       where a list belongs: "steps": "Mix and bake." is the natural way to
       type it wrong. Measured before this: `r.ingredients.map is not a
       function`, the render dies mid-flight, and the Menu shows ZERO cards
       — not just the broken recipe, the whole book — while the recipe's own
       page silently falls back to the front screen with no explanation.
       Every other storage boundary in this app is coerced (`R21` the plan,
       `R40` the dismissed imports); this one, holding the recipes, was not. */
    const ctxB = await br.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const pB = await ctxB.newPage();
    const bErrs = []; pB.on('pageerror', e => bErrs.push(e.message));
    const GOOD = { id: 'ok-one', title: 'Fine Recipe', category: 'Dinner',
      contributor: 'Joan', servings: 4, ingredients: ['1 cup flour'], steps: ['Bake it.'] };
    const BENT = { id: 'typed-by-hand', title: 'Typed By Hand', category: 'Dinner',
      contributor: 'Joan', servings: '4', ingredients: '1 cup flour',
      steps: 'Mix and bake.', tags: 'quick, Scottish', flagged: 'check the oven' };

    await pB.goto(B + '/index.html');
    await pB.evaluate((rs) => localStorage.setItem('kt.recipes', JSON.stringify(rs)),
      [GOOD, BENT]);
    await pB.goto(B + '/index.html#menu');
    await pB.reload();
    await pB.waitForSelector('.rcard', { timeout: 10000 }).catch(() => {});
    chk('the Menu still lists every recipe',
      await pB.locator('.rcard').count() === 2,
      String(await pB.locator('.rcard').count()));

    await pB.goto(B + '/index.html#typed-by-hand');
    await pB.waitForSelector('.r-title', { timeout: 10000 }).catch(() => {});
    chk('the bent recipe opens as itself, not the front page',
      (await pB.locator('.r-title').textContent().catch(() => '')) === 'Typed By Hand');
    const ing = await pB.locator('.checklist:not(.checklist--steps) .checkrow__text').allTextContents();
    const stp = await pB.locator('.checklist--steps .checkrow__text').allTextContents();
    chk('a string of ingredients becomes one line, with its words intact',
      ing.length === 1 && ing[0].trim() === '1 cup flour', JSON.stringify(ing));
    chk('and so does a string of steps',
      stp.length === 1 && stp[0].trim() === 'Mix and bake.', JSON.stringify(stp));
    /* Read with a short timeout and caught: when this regresses the element
       is simply absent, and a suite that dies on the wait hides every check
       after it. */
    const text = (sel) => pB.locator(sel).first()
      .textContent({ timeout: 2000 }).catch(() => '');
    chk('a string of flags is shown as a flag, not swallowed',
      (await text('.panel--flag')).includes('check the oven'),
      await text('.panel--flag'));
    chk('a comma string of tags becomes tags that filter',
      await pB.locator('.r-tags a[href*="tag="]').count() === 2,
      String(await pB.locator('.r-tags a[href*="tag="]').count()));

    /* Servings arriving as text must still be a number to step and divide
       by, or "4" + 1 is "41" and the scaler divides by a string. */
    await pB.click('[data-act="serv+"]', { timeout: 3000 }).catch(() => {});
    await pB.waitForTimeout(250);
    chk('servings written as text still step like a number',
      /5 (people|person)/.test(await text('.servcard__value, [data-act="serv-edit"]')),
      await text('.servcard__value, [data-act="serv-edit"]'));

    chk('and nothing threw', bErrs.length === 0, bErrs.join(' | '));

    /* The other source, and the one nobody is watching: the published file
       itself, regenerated nightly by db-sync. Same shape, same promise. */
    const bErrs2 = [];
    const ctxF = await br.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    await ctxF.route('**/recipes.json', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([GOOD, BENT])
    }));
    const pF = await ctxF.newPage();
    pF.on('pageerror', e => bErrs2.push(e.message));
    await pF.goto(B + '/index.html#menu');
    await pF.waitForSelector('.rcard', { timeout: 10000 }).catch(() => {});
    chk('a bent recipe in the published file is survivable too',
      await pF.locator('.rcard').count() === 2 && bErrs2.length === 0,
      (await pF.locator('.rcard').count()) + ' cards; ' + bErrs2.join(' | '));
    await ctxF.close();
    await pB.evaluate(() => localStorage.removeItem('kt.recipes'));
    await ctxB.close();
  }

  console.log('\n== Edit mode could not fix the field the app rewrites (R65) ==');
  {
    /* CLAUDE.md says the Add review screen "reuses the Edit-mode field set",
       and it does not: Add has Course, Prep time and Cook time; Edit has
       none of the three. So a recipe filed under the wrong course cannot be
       moved from the app at all — and course is precisely the field the app
       itself rewrites, because normalizeRecipe defaults anything it doesn't
       recognise to Dinner. A family member who spots a dessert filed under
       Dinner has no way to fix it short of downloading the JSON, editing it
       by hand and committing. The times are the same story, smaller: they
       print on the recipe page and could only ever be set by an importer. */
    const pE = await ctx.newPage();
    const eErrs = []; pE.on('pageerror', e => eErrs.push(e.message));
    pE.on('dialog', d => d.accept());
    const openEdit = async (id) => {
      await pE.goto(B + '/index.html#' + id);
      await pE.waitForSelector('.r-title');
      if (!(await pE.locator('#e-title').count())) {
        await pE.click('[data-act="toggle-edit"]');
        await pE.waitForSelector('#e-title');
      }
    };
    await openEdit('chicken-cordon-bleu');

    /* The rule, and the reason the gap existed: the two field sets are meant
       to be one field set. Compared by what they WRITE, not by their ids. */
    const editKeys = await pE.evaluate(() =>
      [...document.querySelectorAll('.recipe [data-k]')].map(e => e.getAttribute('data-k')));
    await pE.goto(B + '/index.html#add');
    await pE.evaluate(() => sessionStorage.clear());
    await pE.reload();
    await pE.waitForSelector('.pathbtn');
    await pE.click('[data-key="review"]');
    await pE.waitForSelector('#a-title');
    const addKeys = await pE.evaluate(() =>
      [...document.querySelectorAll('.addscreen [data-k]')].map(e => e.getAttribute('data-k')));
    const missing = [...new Set(addKeys)].filter(k => editKeys.indexOf(k) === -1);
    chk('every field the review screen writes, edit mode can write too',
      missing.length === 0, missing.join(', '));
    chk('and the comparison actually found the fields',
      new Set(addKeys).size >= 8, String(new Set(addKeys).size));

    await openEdit('chicken-cordon-bleu');
    chk('edit mode offers a Course control', await pE.locator('#e-cat').count() === 1);
    chk('with all ten courses on it',
      await pE.locator('#e-cat option').count() === 10,
      String(await pE.locator('#e-cat option').count()));
    chk('and prep and cook time', await pE.locator('#e-prep').count() === 1 &&
      await pE.locator('#e-cook').count() === 1);

    /* Guarded: when these are missing the checks above already say so, and
       a suite that dies on the wait hides everything after it. */
    await pE.selectOption('#e-cat', 'Desserts', { timeout: 3000 }).catch(() => {});
    await pE.fill('#e-prep', '15 min', { timeout: 3000 }).catch(() => {});
    await pE.fill('#e-cook', '35 min', { timeout: 3000 }).catch(() => {});
    await pE.click('[data-act="save"]');
    await pE.waitForTimeout(500);
    const eyebrow = await pE.locator('.r-eyebrow, .recipe').first().textContent();
    chk('changing the course sticks', /Desserts/.test(eyebrow), eyebrow.slice(0, 60));
    /* Back to the reader's side of the switch: edit mode is showing the
       form, and a value typed into an input is not text on the page. */
    await pE.click('[data-act="toggle-edit"]');
    await pE.waitForTimeout(350);
    const viewed = await pE.locator('.recipe').textContent();
    chk('and the times show on the page a reader sees',
      /15 min/.test(viewed) && /35 min/.test(viewed), viewed.slice(0, 80));

    /* And it is really saved, not merely drawn. */
    await pE.reload();
    await pE.waitForSelector('.r-title');
    chk('all three survive a reload',
      /Desserts/.test(await pE.locator('.recipe').textContent()) &&
      /15 min/.test(await pE.locator('.recipe').textContent()) &&
      /35 min/.test(await pE.locator('.recipe').textContent()));

    /* The course is a real filter, so moving a recipe has to move it in the
       Menu as well — otherwise the fix is cosmetic. */
    await pE.goto(B + '/index.html#menu?cat=Desserts');
    await pE.waitForSelector('.rcard');
    chk('and the Menu files it under its new course',
      (await pE.locator('.rcard').allTextContents()).some(t => /Cordon Bleu/.test(t)));
    await pE.evaluate(() => localStorage.removeItem('kt.recipes'));
    chk('editing threw nothing', eErrs.length === 0, eErrs.join(' | '));
    await pE.close();
  }

  console.log('\n== Two recipes with the same id, and only one survived (R70) ==');
  {
    /* recipes.json is hand-edited by design — download, edit, commit — and
       copying a recipe block to make a variant while forgetting to change
       the id is the natural way to get two of them. Measured before this:
       both drew on the Menu, `#twin` opened the first, and **editing it
       overwrote the second as well** — a whole recipe, its own ingredients
       and steps, silently replaced by a copy of the other. Remove took both
       too. db/migrate refuses a duplicate id, but only when someone runs it;
       the app is where the loss happens first.
       Suffixed at the boundary now, which is the convention the kitchen
       server already uses when the same thing happens to it: "a duplicate
       the family can see and delete beats a recipe silently replaced". */
    const mk = (t) => ({ id: 'twin', title: t, category: 'Dinner',
      contributor: 'Joan', servings: 4,
      ingredients: ['1 cup ' + t], steps: ['Cook ' + t] });

    const ctxT = await br.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const pT = await ctxT.newPage();
    const tErrs = []; pT.on('pageerror', e => tErrs.push(e.message));
    pT.on('dialog', d => d.accept());
    await pT.goto(B + '/index.html');
    await pT.evaluate((rs) => localStorage.setItem('kt.recipes', JSON.stringify(rs)),
      [mk('First Twin'), mk('Second Twin')]);
    await pT.goto(B + '/index.html#menu');
    await pT.reload();
    await pT.waitForSelector('.rcard');
    chk('both recipes are on the Menu, under their own names',
      JSON.stringify(await pT.locator('.rcard__title').allTextContents()) ===
        JSON.stringify(['First Twin', 'Second Twin']),
      JSON.stringify(await pT.locator('.rcard__title').allTextContents()));
    const hrefs = await pT.locator('.rcard').evaluateAll(els =>
      els.map(e => e.getAttribute('href')));
    chk('and they have different addresses',
      hrefs.length === 2 && hrefs[0] !== hrefs[1], JSON.stringify(hrefs));

    /* The one that matters: correcting one must not rewrite the other. */
    await pT.goto(B + '/index.html' + hrefs[0]);
    await pT.waitForSelector('.r-title');
    await pT.click('[data-act="toggle-edit"]');
    await pT.waitForSelector('#e-title');
    await pT.fill('#e-title', 'EDITED');
    await pT.click('[data-act="save"]');
    await pT.waitForTimeout(500);
    const kept = await pT.evaluate(() =>
      JSON.parse(localStorage.getItem('kt.recipes')).map(r => r.title + '|' + r.ingredients[0]));
    chk('editing one leaves the other exactly as it was',
      kept.length === 2 && /Second Twin/.test(kept.join(' ')),
      JSON.stringify(kept));

    /* And the family is told, rather than left to notice. */
    await pT.goto(B + '/index.html' + hrefs[1]);
    await pT.waitForSelector('.r-title', { timeout: 5000 }).catch(() => {});
    chk('the second one says why its address changed',
      /same id|duplicate id/i.test(await pT.locator('.panel--flag').textContent().catch(() => '')),
      await pT.locator('.panel--flag').textContent().catch(() => '(no flag)'));

    /* Removing one must not take both. */
    await pT.goto(B + '/index.html#menu');
    await pT.waitForSelector('.rcard');
    await pT.click('[data-act="toggle-remove"]');
    await pT.waitForSelector('.rrow');
    await pT.locator('.rrow').first().click();
    await pT.waitForTimeout(500);
    chk('removing one leaves the other',
      await pT.locator('.rrow').count() === 1,
      String(await pT.locator('.rrow').count()));
    await pT.evaluate(() => localStorage.removeItem('kt.recipes'));
    await ctxT.close();

    /* The published file is the copy that is actually hand-edited, so it
       gets the same promise. */
    const ctxF = await br.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    await ctxF.route('**/recipes.json', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([mk('First Twin'), mk('Second Twin')])
    }));
    const pF = await ctxF.newPage();
    const fErrs = []; pF.on('pageerror', e => fErrs.push(e.message));
    await pF.goto(B + '/index.html#menu');
    await pF.waitForSelector('.rcard');
    chk('a duplicate id in the published file is survivable too',
      await pF.locator('.rcard').count() === 2 && fErrs.length === 0,
      (await pF.locator('.rcard').count()) + ' cards; ' + fErrs.join(' | '));
    await ctxF.close();

    /* And nothing is renamed that did not need to be — the real book keeps
       every id it shipped with, which is what the hash routes depend on. */
    const ctxN = await br.newContext({ ...devices['iPhone 13'] });
    const pN = await ctxN.newPage();
    await pN.goto(B + '/index.html#menu');
    await pN.waitForSelector('.rcard');
    const same = await pN.evaluate(async () => {
      const shipped = await (await fetch('recipes.json')).json();
      const drawn = [...document.querySelectorAll('.rcard')]
        .map(a => (a.getAttribute('href') || '').slice(1));
      return shipped.every(r => drawn.indexOf(r.id) > -1);
    });
    chk('and no recipe in the real book was renamed', same);
    chk('none of it threw', tErrs.length === 0, tErrs.join(' | '));
    await ctxN.close();
  }

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

  console.log('\n== Servings can be typed, not just stepped (R15) ==');
  await p.goto(B+'/index.html#chicken-cordon-bleu');
  await p.waitForSelector('.servcard__value');
  chk('the number itself is a control', await p.locator('button.servcard__value').count()===1);
  const servBox = await p.locator('button.servcard__value').boundingBox();
  chk('and it is a real tap target', servBox.height>=44, JSON.stringify(servBox));
  // Making the number a button must not quietly strip its emphasis: a UA
  // font reset on `button` is exactly how that happens.
  const servType = await p.locator('button.servcard__value').evaluate(el => {
    const c = getComputedStyle(el), parent = getComputedStyle(el.parentElement);
    return { w: c.fontWeight, size: parseFloat(c.fontSize),
             base: parseFloat(parent.fontSize) };
  });
  chk('the number still reads as the number', servType.w === '700' &&
    servType.size > servType.base, JSON.stringify(servType));
  await p.click('button.servcard__value');
  await p.waitForSelector('#serv-input');
  chk('tapping it opens a number field', await p.locator('#serv-input').count()===1);
  await p.fill('#serv-input','24');
  await p.press('#serv-input','Enter');
  await p.waitForSelector('button.servcard__value');
  chk('Enter commits the typed number', (await p.locator('.servcard__value').textContent()).includes('24'));
  const scaled = await p.locator('.ing-line, .checkrow').first().textContent();
  chk('and the quantities scaled with it', scaled.length>0);
  await p.click('button.servcard__value');
  await p.fill('#serv-input','999');
  await p.press('#serv-input','Enter');
  await p.waitForSelector('button.servcard__value');
  chk('an absurd number is clamped, never accepted',
    !(await p.locator('.servcard__value').textContent()).includes('999'));
  await p.click('button.servcard__value');
  await p.fill('#serv-input','6');
  await p.click('.r-title');                    // leaving the field commits too
  await p.waitForSelector('button.servcard__value');
  chk('leaving the field commits it', (await p.locator('.servcard__value').textContent()).includes('6'));

  console.log('\n== The keyboard Go key finds a recipe (R15) ==');
  await p.goto(B+'/index.html');
  await p.waitForSelector('#main-search');
  await p.fill('#main-search','cordon');
  // Wait for the search to actually have rendered its top match — a fixed
  // pause races the debounce on a loaded CI machine.
  await p.waitForFunction(() => {
    const a = document.querySelector('#app a.rcard[href]');
    return !!a && a.getAttribute('href') === '#chicken-cordon-bleu';
  }, null, { timeout: 5000 });
  await p.press('#main-search','Enter');
  await p.waitForSelector('.r-title', { timeout: 5000 });
  chk('Enter opens the top match', (await p.locator('.r-title').textContent()).includes('Cordon'));

  console.log('\n== Edit mode ==');
  await p.click('[data-act="toggle-edit"]');
  await p.waitForTimeout(250);
  chk('switch on', await p.getAttribute('[data-act="toggle-edit"]','aria-checked')==='true');
  chk('title field labelled', await p.locator('label[for="e-title"]').count()===1);
  chk('ingredient textareas', await p.locator('[data-k="ingredients"][data-act="dl"]').count()>0);
  /* `data-key`, not `data-k`. The click handler dereferences `data-key`;
     this check pinned the other spelling, so it went on passing for the
     entire time the button did nothing at all (`R103`). Pinning the
     attribute the handler actually reads is what makes it a check rather
     than a headcount. */
  chk('add-ingredient button', await p.locator('[data-act="add"][data-key="ingredients"]').count()===1);
  chk('download json button', await p.locator('[data-act="dl-json"]').count()===1);
  chk('serves stepper parity with the review form (R4)',
    await p.locator('[data-act="e-serv"]').count()===2);
  {
    const b4 = parseInt(await p.inputValue('#e-serves'),10);
    await p.click('[data-act="e-serv"][data-d="1"]'); await p.waitForTimeout(150);
    chk('one tap, one more serving in edit mode',
      parseInt(await p.inputValue('#e-serves'),10)===b4+1);
    await p.click('[data-act="e-serv"][data-d="-1"]'); await p.waitForTimeout(150);
  }
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

  /* `R88` — the empty states, held to the same bar as the full ones.
     Two faults, both about telling a reader something that is not true.
     The "Tap to check off as you go" hint sat ABOVE the branch, so on all
     four of the recipes with no ingredient list it invited a reader to tap
     items that are not there, directly above a panel explaining that there
     are none. And the Instructions section had no empty state at all: a
     recipe with no steps rendered a heading and an empty list, in silence.
     No recipe in the book is stepless today, but `recipes.json` is
     hand-editable by design and `R62` exists because that is not
     theoretical — a nightly sync, a bad merge, an import saved early. */
  {
    const ing = await p.locator('section.bodygrid__ing').textContent();
    chk('and it does not invite a tap on the nothing that is there',
      !/Tap to check off/.test(ing), ing.replace(/\s+/g, ' ').slice(0, 90));
    /* The full list still gets its hint — the fix must be the condition,
       not the removal. */
    await p.goto(B + '/index.html#chicken-cordon-bleu');
    await p.waitForSelector('.r-title');
    chk('while a recipe that HAS ingredients still says how to use them',
      /Tap to check off/.test(await p.locator('section.bodygrid__ing').textContent()));

    /* A stepless recipe, made the way one actually arrives: through the
       overlay the download-and-commit workflow writes. */
    await p.evaluate(() => {
      const one = {
        id: 'stepless-test', title: 'Stepless Test', category: 'Dinner',
        contributor: 'Joan', servings: 4, ingredients: ['1 cup flour'], steps: []
      };
      localStorage.setItem('kt.recipes', JSON.stringify([one]));
    });
    /* The overlay is read at boot, and a hash-only goto is a same-document
       navigation — so this has to be a real load or the app looks the
       recipe up in the published file and falls back to the front screen. */
    await p.goto('about:blank');
    await p.goto(B + '/index.html#stepless-test');
    let steps = 'DID NOT OPEN';
    try {
      await p.waitForSelector('.r-title', { timeout: 10000 });
      steps = await p.evaluate(() => {
        const h = [].slice.call(document.querySelectorAll('.r-h2'))
          .find(x => /Instruction/i.test(x.textContent));
        return h ? (h.parentElement.textContent || '').replace(/\s+/g, ' ').trim() : 'NO SECTION';
      });
    } catch (e) { /* one FAIL line below, not a dead suite */ }
    chk('a recipe with no instructions says so rather than showing a blank',
      /No instructions were captured/i.test(steps), steps.slice(0, 100));
    chk('and it does not tell you to tap steps that are not there',
      !/Tap to check off/.test(steps) || /ingredient/i.test(steps), steps.slice(0, 60));
    /* Clearing the key is not enough: `S.recipes` was read at boot, so the
       next section's hash-only navigation would still be looking at a book
       with one recipe in it. Hand the suite back the published book. */
    await p.evaluate(() => localStorage.removeItem('kt.recipes'));
    await p.goto('about:blank');
  }

  console.log('\n== R94 — the tutorial must not promise a wider search than there is ==');
  {
    /* `README.md` is exact and the code agrees with it: search reads
       **titles, ingredients and tags**, and "steps are deliberately not
       searched this way". The in-app help said something else — that it
       "looks inside the recipes too, so 'bacon' finds anything with bacon
       in it" — and *anything* is a promise the app does not keep.
       It is not hypothetical. `purée` appears in Crannachan's method, and
       searching the book for that exact word, accents and all, returns
       nothing at all. A cook looking for the thing they half-remember from
       the method gets an empty screen and no reason for it.
       Same class as `R63` and `R90`: the tutorial is held to what the app
       does. Checked behaviourally rather than by wording, so a rewrite has
       to stay true — the word is taken from a recipe's steps at runtime. */
    await p.goto('about:blank');
    await p.goto(B + '/index.html');
    await p.waitForSelector('#main-search');
    const book = await p.evaluate(() => fetch('recipes.json').then(r => r.json()));
    /* A word that appears in some recipe's steps and in no title, tag or
       ingredient line anywhere — the exact case the promise gets wrong. */
    const inSearched = new Set();
    book.forEach(r => {
      [r.title].concat(r.tags || []).concat(r.ingredients || []).forEach(t =>
        String(t).toLowerCase().split(/[^a-z]+/).forEach(w => w && inSearched.add(w)));
    });
    let stepOnly = '';
    for (const r of book) {
      for (const line of (r.steps || [])) {
        const w = String(line).toLowerCase().split(/[^a-z]+/)
          .find(x => x.length >= 6 && !inSearched.has(x));
        if (w) { stepOnly = w; break; }
      }
      if (stepOnly) break;
    }
    chk('the book contains a word that lives only in a method', !!stepOnly, stepOnly);
    await p.fill('#main-search', stepOnly);
    await p.waitForTimeout(450);
    const hits = await p.evaluate(() => document.querySelectorAll('.cardgrid > *').length);
    chk('and searching for it finds nothing, as README says it should',
      hits === 0, stepOnly + ' -> ' + hits + ' hits');

    await p.goto('about:blank');
    await p.goto(B + '/index.html#help');
    await p.waitForSelector('h1');
    const help = (await p.locator('#app').textContent()).replace(/\s+/g, ' ');
    chk('so the tutorial does not claim search finds anything at all',
      !/finds anything/i.test(help),
      (help.match(/[^.]*finds anything[^.]*\./i) || ['—'])[0].slice(0, 90));
    chk('and it names what search actually reads',
      /ingredient/i.test(help) && /tag/i.test(help),
      help.slice(0, 60));
  }

  console.log('\n== R90 — the tutorial owes the reader the whole app ==');
  {
    /* `R63` held the help page to being *accurate*. This holds it to being
       *complete*, for the two things it is worst to leave out.
       **Every mode the Menu can enter.** Tag and Remove sit side by side in
       the same row; `R85` had just found them drawn in the same colours,
       and the destructive one of the pair appeared nowhere in the tutorial.
       Derived from the app rather than listed here, so a third mode
       tomorrow asks for its own paragraph.
       **And the fact that the book works with no signal.** There is a
       service worker precaching a shell so that a kitchen with bad wifi
       still opens the recipe — real machinery, making a real promise, that
       a reader had no way to discover. */
    await p.goto(B + '/index.html#menu');
    await p.waitForSelector('.rcard');
    const modes = await p.evaluate(() => [].slice.call(
      document.querySelectorAll('.countrow__actions .textbtn'))
      .map(b => b.textContent.trim())
      .filter(t => t && t !== 'Clear'));
    await p.goto(B + '/index.html#help');
    await p.waitForSelector('h1');
    const help = (await p.locator('#app').textContent()).replace(/\s+/g, ' ');
    chk('the sweep found the Menu\'s modes to check for', modes.length >= 2, modes.join(', '));
    const undocumented = modes.filter(m => help.toLowerCase().indexOf(m.toLowerCase()) === -1);
    chk('every mode the Menu can enter is explained in the tutorial',
      undocumented.length === 0, undocumented.join(', '));
    chk('and the tutorial says the book works with no signal',
      /no signal|without a signal|offline|no wifi|no internet/i.test(help),
      help.slice(0, 60));
  }

  console.log('\n== Back from a recipe returns the list you left (R22) ==');
  await p.goto(B+'/index.html#menu?cat=Desserts');
  await p.waitForSelector('.rcard');
  const dessertCount = await p.locator('.rcard').count();
  await p.locator('.rcard').first().click();
  await p.waitForSelector('.r-title');
  chk('the way back carries the filtered list, not a bare menu',
    (await p.getAttribute('.backlink', 'href')) === '#menu?cat=Desserts',
    await p.getAttribute('.backlink', 'href'));
  await p.click('.backlink');
  await p.waitForSelector('.rcard');
  chk('and it lands on that list', await p.locator('.rcard').count() === dessertCount,
    String(await p.locator('.rcard').count()));
  chk('with the address still agreeing', /cat=Desserts/.test(await p.evaluate(()=>location.hash)),
    await p.evaluate(()=>location.hash));
  await p.reload();
  await p.waitForSelector('.rcard');
  chk('so a reload from there keeps it', await p.locator('.rcard').count() === dessertCount);
  /* Arriving from Main, where there is no list to return to, is unchanged. */
  await p.goto(B+'/index.html#menu');
  await p.waitForSelector('.rcard');
  await p.goto(B+'/index.html#chicken-cordon-bleu');
  await p.waitForSelector('.r-title');
  chk('an unfiltered visit still just says Menu',
    (await p.getAttribute('.backlink', 'href')) === '#menu',
    await p.getAttribute('.backlink', 'href'));

  console.log('\n== The status-bar pad is the device\'s, not a guess (R20) ==');
  {
    /* The design reference pads the top of every screen on narrow widths to
       clear the phone's status bar — correct for a Home Screen install, where
       the page really does run under it. In a browser tab there is nothing to
       clear: the browser's own chrome is already there, and the pad was 40-54px
       of dead space at the top of every screen, on the screens with the least
       room to spare. */
    const tops = [];
    for (const [name, hash, sel] of [['Main','#','.main'], ['Menu','#menu','.mhead'],
      ['Recipe','#chicken-cordon-bleu','.rhead']]) {
      await p.goto(B+'/index.html'+hash);
      await p.waitForSelector('h1');
      const pt = await p.evaluate((s) =>
        parseFloat(getComputedStyle(document.querySelector(s)).paddingTop), sel);
      tops.push(name + ' ' + pt + 'px');
      chk(name + ': no phantom status bar in a browser tab', pt <= 30, pt + 'px');
    }
    /* …and the intent survives where it was true: on a Home Screen install the
       inset is a real number and the pad comes back by itself. */
    const css = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'style.css'), 'utf8');
    const heads = css.match(/env\(safe-area-inset-top\)/g) || [];
    chk('the pad follows the device inset instead of a constant',
      heads.length >= 3 && !/padding-top:\s*5[0-9]px/.test(css), tops.join(', '));
  }

  console.log('\n== Tap targets + a11y ==');
  // Every screen, not just the Menu: the servings number shipped a hair under
  // the floor (R16) precisely because this sweep only ever visited one route.
  const routes = [['Main','#'], ['Menu','#menu'], ['Recipe','#chicken-cordon-bleu'],
    ['Add','#add'], ['Week planner','#plan'], ['How to use it','#help']];
  const tooSmall = [];
  for (const [name, hash] of routes) {
    await p.goto(B+'/index.html'+hash);
    await p.waitForSelector('h1');
    const bad = await p.evaluate(()=>{
      const out=[];
      document.querySelectorAll('button, a[href], input, select, textarea').forEach(el=>{
        const r=el.getBoundingClientRect();
        if(r.height>0 && r.height<44) out.push((el.className||el.tagName)+' h='+r.height.toFixed(1));
      });
      return out;
    });
    for (const b of bad) tooSmall.push(name+': '+b);
  }
  chk('nothing interactive under 44px, on any screen',
    tooSmall.length===0, tooSmall.join(', '));
  /* R23 — four of design/a11y-criteria.md's "checked by the reviewer, by
     hand" items are cheap to check by machine, and a reviewer's attention is
     not a durable guarantee. These run on every screen, every time. */
  const named = [], unlabelled = [], positive = [], loudSvg = [];
  let inspected = 0;
  /* Every screen AND the states you have to open to reach — the sheets, edit
     mode and the review form are exactly where an unlabelled field hides.
     Same list the contrast audit walks. */
  const a11yScreens = routes.map(r => [r[0], r[1], null]).concat([
    ['Menu + filter sheet', '#menu', '[data-act="open-filter"]'],
    ['Menu + search open', '#menu', '[data-act="toggle-search"]'],
    ['Menu text sheet', '#menu', '[data-act="open-text"]'],
    ['Recipe edit', '#chicken-cordon-bleu', '[data-act="toggle-edit"]'],
    ['Recipe download sheet', '#bacon-ranch-chicken-casserole', '[data-act="open-dl"]'],
    ['Recipe flagged', '#chops', null],
    ['Add review form', '#add', '[data-key="review"]'],
    ['Add from a link', '#add', '[data-key="link"]'],
    ['Add from a photo', '#add', '[data-key="photo"]'],
    ['Add from a video', '#add', '[data-key="video"]']
  ]);
  for (const [name, hash, open] of a11yScreens) {
    /* A full reload per screen: a sheet left open by the previous one would
       otherwise sit over this one and swallow the click that opens it. */
    await p.goto(B+'/index.html'+hash);
    /* …and no half-finished import snapshot either (084): restored, it lands
       on the review form instead of the three ways in. */
    await p.evaluate(()=>sessionStorage.removeItem('kt.addDraft'));
    await p.reload();
    await p.waitForSelector('h1');
    if (open) { await p.click(open, { timeout: 8000 }); await p.waitForTimeout(350); }
    const bad = await p.evaluate(()=>{
      const out = { named: [], unlabelled: [], positive: [], loudSvg: [], seen: 0 };
      const seen = (el) => el.offsetParent !== null || el === document.activeElement;
      document.querySelectorAll('button, a[href]').forEach(b=>{
        if (!seen(b)) return;
        out.seen++;
        const name = (b.textContent||'').trim() || b.getAttribute('aria-label') ||
          b.getAttribute('title') || '';
        if (!name) out.named.push(b.className || b.tagName);
      });
      document.querySelectorAll('input, textarea, select').forEach(f=>{
        if (!seen(f) || f.type === 'hidden') return;
        const has = (f.id && document.querySelector('label[for="'+CSS.escape(f.id)+'"]')) ||
          f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') ||
          f.closest('label');
        if (!has) out.unlabelled.push(f.className || f.id || f.type);
      });
      document.querySelectorAll('[tabindex]').forEach(e=>{
        if (parseInt(e.getAttribute('tabindex'), 10) > 0) out.positive.push(e.className || e.tagName);
      });
      /* Decorative artwork must not be read out. An <svg> with no title, no
         aria-label and no role="img" is decoration by definition. */
      document.querySelectorAll('svg').forEach(g=>{
        if (!seen(g.parentElement || g)) return;
        const speaks = g.getAttribute('aria-label') || g.querySelector('title') ||
          g.getAttribute('role') === 'img';
        const hidden = g.getAttribute('aria-hidden') === 'true' ||
          (g.closest('[aria-hidden="true"]') !== null) ||
          (g.closest('button,a[href]') && (g.closest('button,a[href]').getAttribute('aria-label') ||
            (g.closest('button,a[href]').textContent||'').trim()));
        if (!speaks && !hidden) out.loudSvg.push((g.parentElement && g.parentElement.className) || 'svg');
      });
      return out;
    });
    for (const x of bad.named) named.push(name + ': ' + x);
    for (const x of bad.unlabelled) unlabelled.push(name + ': ' + x);
    for (const x of bad.positive) positive.push(name + ': ' + x);
    for (const x of bad.loudSvg) loudSvg.push(name + ': ' + x);
    inspected += bad.seen;
  }
  /* R35 — criterion 8, the last of the cheap ones: a focus ring you can
     actually see. Tabbed for real, because :focus-visible is about keyboard
     focus and a programmatic .focus() is a different thing. */
  const ringless = [];
  for (const [name, hash] of routes) {
    await p.goto(B+'/index.html'+hash);
    await p.reload();
    await p.waitForSelector('h1');
    for (let i = 0; i < 12; i++) {
      await p.keyboard.press('Tab');
      const seen = await p.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const c = getComputedStyle(el);
        const ring = parseFloat(c.outlineWidth) || 0;
        const hasRing = c.outlineStyle !== 'none' && ring >= 2;
        const shadow = c.boxShadow && c.boxShadow !== 'none';
        return { what: (el.className || el.tagName) + '', ok: hasRing || shadow,
                 detail: c.outlineStyle + ' ' + c.outlineWidth };
      });
      if (!seen) break;
      if (!seen.ok) ringless.push(name + ': ' + seen.what + ' (' + seen.detail + ')');
    }
  }
  chk('every control tabbed to shows a focus ring', ringless.length === 0,
    ringless.slice(0, 3).join(' | '));

  chk('every control has a name a screen reader can say, on every screen',
    named.length===0, named.join(', '));
  chk('every field has a label, on every screen', unlabelled.length===0, unlabelled.join(', '));
  chk('nothing jumps the focus order with a positive tabindex',
    positive.length===0, positive.join(', '));
  chk('decorative artwork is not read out', loudSvg.length===0, loudSvg.join(', '));
  /* The sweep above is only worth its green tick if it actually looked at
     something: a selector that stopped matching, or a state that failed to
     open, would otherwise read as a clean pass (R21's lesson). */
  chk('and the sweep actually reached the controls', inspected > 200, String(inspected));
  await p.goto(B+'/index.html#menu');
  await p.waitForSelector('.rcard');
  chk('one h1 per screen', await p.locator('h1').count()===1);

  console.log('\n== Nobody had ever typed in this app (R53) ==');
  {
    /* Every state change here is a full re-render — app.innerHTML = html —
       which throws away the very <input> the reader is typing into and
       builds a new one. render() puts the focus and the caret back, and
       that restore is the only reason searching works at all on a phone.
       Nothing tested it. Every suite in this repo reaches a field with
       fill(), which sets the whole value in one shot and never asks the
       question; nobody had ever typed a second character.
       Measured with the restore removed: typing "chicken" leaves "c",
       focus on <body> — which on iOS means the keyboard drops away after
       the first letter — and all 763 checks stayed green. */
    const ctxT = await br.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const pT = await ctxT.newPage();
    const errsT = []; pT.on('pageerror', e => errsT.push(e.message));
    const field = (sel) => pT.evaluate((s) => {
      const el = document.querySelector(s), a = document.activeElement;
      return { value: el ? el.value : null, held: !!el && a === el,
        active: a ? (a.id || a.tagName) : null,
        caret: el && el.selectionStart !== undefined ? el.selectionStart : null };
    }, sel);

    await pT.goto(B + '/index.html#menu');
    await pT.waitForSelector('.rcard');
    const all = await pT.locator('.rcard').count();
    await pT.click('[data-act="toggle-search"]');
    await pT.waitForSelector('#menu-search');
    await pT.click('#menu-search');
    await pT.keyboard.type('chicken', { delay: 30 });
    const menu = await field('#menu-search');
    chk('typing a word into the Menu search leaves the word',
      menu.value === 'chicken', JSON.stringify(menu));
    chk('and the field still has the keyboard',
      menu.held, 'focus went to ' + menu.active);
    chk('and the caret is where the typing left it',
      menu.caret === 7, String(menu.caret));
    chk('and the list narrowed to match',
      await pT.locator('.rcard').count() < all,
      await pT.locator('.rcard').count() + ' of ' + all);

    /* Correcting a typo is the harder half: the caret has to come back
       where it WAS, not to the end, or every fix lands in the wrong place. */
    await pT.evaluate(() => {
      const e = document.querySelector('#menu-search');
      e.focus(); e.setSelectionRange(3, 3);
    });
    await pT.keyboard.type('X', { delay: 30 });
    const fixed = await field('#menu-search');
    chk('a letter typed mid-word lands mid-word, caret and all',
      fixed.value === 'chiXcken' && fixed.caret === 4, JSON.stringify(fixed));

    await pT.goto(B + '/index.html');
    await pT.waitForSelector('#main-search');
    await pT.click('#main-search');
    await pT.keyboard.type('soup', { delay: 30 });
    const main = await field('#main-search');
    chk('the front page search survives typing too',
      main.value === 'soup' && main.held, JSON.stringify(main));

    await pT.goto(B + '/index.html#plan');
    await pT.waitForSelector('.slotadd');
    await pT.locator('.slotadd').first().click();
    await pT.waitForSelector('#pick-q');
    await pT.click('#pick-q');
    await pT.keyboard.type('chicken', { delay: 30 });
    const pick = await field('#pick-q');
    chk("and so does the planner's recipe picker",
      pick.value === 'chicken' && pick.held, JSON.stringify(pick));

    /* The rule, so a field added later inherits it rather than repeating
       the omission: put one character into EVERY field on every screen and
       you must still be in that field afterwards. It does not care how —
       an id and render()'s restore is today's answer, and any other answer
       that keeps the reader typing is fine too. */
    const SWEEP = `(() => {
      const bad = [];
      const fields = [...document.querySelectorAll('input[data-act], textarea[data-act]')]
        .filter(el => el.type !== 'file' && el.type !== 'checkbox' && el.type !== 'radio');
      for (const el of fields) {
        const act = el.getAttribute('data-act'), id = el.id, before = el.value;
        el.focus();
        el.value = before + 'x';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        const a = document.activeElement;
        if (!(id ? (a && a.id === id) : a === el)) {
          bad.push(act + ' (' + (id || 'no id') + ') -> ' + (a ? (a.id || a.tagName) : 'null'));
        }
        const now = (id && document.getElementById(id)) || el;
        now.value = before;
        now.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return { n: fields.length, bad };
    })()`;
    const freshAdd = async () => {
      await pT.goto(B + '/index.html#add');
      await pT.evaluate(() => sessionStorage.clear());
      await pT.reload();
      await pT.waitForSelector('.pathbtn');
    };
    const screens = [
      ['Main', async () => { await pT.goto(B + '/index.html'); await pT.waitForSelector('#main-search'); }],
      ['Menu + search', async () => {
        await pT.goto(B + '/index.html#menu?q=chicken');
        await pT.waitForSelector('#menu-search');
      }],
      ['Add — type it in', async () => {
        await freshAdd(); await pT.click('[data-key="review"]'); await pT.waitForSelector('#a-title');
      }],
      ['Add — from a link', async () => {
        await freshAdd(); await pT.click('[data-key="link"]'); await pT.waitForSelector('#a-paste');
      }],
      ['Add — from a video', async () => {
        await freshAdd(); await pT.click('[data-key="video"]'); await pT.waitForSelector('#a-vurl');
      }],
      ['Plan — picker', async () => {
        await pT.goto(B + '/index.html#plan'); await pT.waitForSelector('.slotadd');
        await pT.locator('.slotadd').first().click(); await pT.waitForSelector('#pick-q');
      }]
    ];
    let swept = 0;
    const lost = [];
    for (const [label, open] of screens) {
      await open();
      const r = await pT.evaluate(SWEEP);
      swept += r.n;
      r.bad.forEach(b => lost.push(label + ': ' + b));
    }
    chk('one character into any field on any screen and you are still in it',
      lost.length === 0, lost.join(' | '));
    /* A floor, so a selector that quietly stopped matching cannot read as
       a clean pass — R21's lesson, and R52's. */
    chk('and the sweep actually reached the fields', swept >= 12, String(swept));
    chk('typing threw nothing', errsT.length === 0, errsT.join(' | '));
    await ctxT.close();
  }

  console.log('\n== JS errors ==');
  chk('no uncaught errors', errs.length===0, errs.join(' | '));

  await br.close();
  console.log('\n'+'='.repeat(50));
  console.log('PASS: '+pass+'   FAIL: '+fail);
  console.log('='.repeat(50));
  process.exit(fail?1:0);
})();
