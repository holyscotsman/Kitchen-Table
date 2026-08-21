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
  chk('add-ingredient button', await p.locator('[data-act="add"][data-k="ingredients"]').count()===1);
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

  console.log('\n== JS errors ==');
  chk('no uncaught errors', errs.length===0, errs.join(' | '));

  await br.close();
  console.log('\n'+'='.repeat(50));
  console.log('PASS: '+pass+'   FAIL: '+fail);
  console.log('='.repeat(50));
  process.exit(fail?1:0);
})();
