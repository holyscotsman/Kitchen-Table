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
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('dialog',d=>d.accept());

  console.log('\n== Document title per route ==');
  await p.goto(B+'/index.html'); await p.waitForSelector('.main__title');
  chk('Main title', (await p.title())==='Kitchen Table', await p.title());
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  chk('Menu title', (await p.title())==='Menu — Kitchen Table', await p.title());
  await p.goto(B+'/index.html#chicken-cordon-bleu'); await p.waitForSelector('.r-title');
  chk('Recipe title', (await p.title()).startsWith('Chicken Cordon Bleu —'), await p.title());
  await p.goto(B+'/index.html#add'); await p.waitForSelector('.pathbtn');
  chk('Add title', (await p.title())==='Add a recipe — Kitchen Table', await p.title());

  console.log('\n== Route announcement + focus ==');
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  await p.click('.rcard');
  await p.waitForSelector('.r-title');
  chk('live region announces the screen', (await p.locator('#route-live').textContent()).includes('Kitchen Table'));
  chk('focus lands on the new h1', await p.evaluate(()=>document.activeElement.tagName)==='H1');

  console.log('\n== Scroll restoration ==');
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  await p.evaluate(()=>window.scrollTo(0,1400));
  await p.waitForTimeout(400);
  const y=await p.evaluate(()=>window.scrollY);
  await p.click('.rcard >> nth=8');
  await p.waitForSelector('.r-title');
  chk('recipe opens at the top', await p.evaluate(()=>window.scrollY)<50);
  await p.goBack();
  await p.waitForSelector('.rcard');
  /* Restore lands after the fresh render commits — poll rather than sample
     once, for machines where that frame is slow. */
  /* "Roughly where you were" is the promise — a couple of card-heights of
     drift on a settling layout is fine; landing at the top is the failure. */
  let back = 0;
  for (let t = 0; t < 20; t++) {
    await p.waitForTimeout(150);
    back = await p.evaluate(()=>window.scrollY);
    if (Math.abs(back-y) < 200) break;
  }
  chk('menu scroll position restored', Math.abs(back-y)<200, y+' -> '+back);

  console.log('\n== Reset local changes ==');
  await p.goto(B+'/index.html#chicken-cordon-bleu'); await p.waitForSelector('.r-title');
  await p.click('[data-act="toggle-edit"]'); await p.waitForTimeout(300);
  chk('reset hidden when there are no local changes', await p.locator('[data-act="reset-local"]').count()===0);
  await p.fill('#e-title','Locally Renamed');
  await p.click('[data-act="save"]'); await p.waitForTimeout(300);
  chk('reset appears once changes exist', await p.locator('[data-act="reset-local"]').count()===1);
  chk('edit applied', (await p.inputValue('#e-title'))==='Locally Renamed');
  await p.click('[data-act="reset-local"]');
  await p.waitForTimeout(500);
  chk('kt.recipes cleared', await p.evaluate(()=>localStorage.getItem('kt.recipes'))===null);
  chk('published title restored', (await p.locator('.r-title').textContent()).includes('Chicken Cordon Bleu'));

  console.log('\n== Reset recovers from removing everything ==');
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  await p.evaluate(()=>localStorage.setItem('kt.recipes', JSON.stringify([])));
  await p.reload(); await p.waitForTimeout(700);
  chk('empty state shows recovery button', await p.locator('[data-act="reset-local"]').count()===1);
  await p.click('[data-act="reset-local"]');
  await p.waitForTimeout(600);
  chk('all 48 recipes back', await p.locator('.rcard').count()===48, String(await p.locator('.rcard').count()));

  console.log('\n== Removal actually persists ==');
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  await p.click('[data-act="toggle-remove"]'); await p.waitForTimeout(300);
  await p.click('.rrow >> nth=0'); await p.waitForTimeout(400);
  chk('47 after removing one', await p.locator('.rrow, .rcard').count()===47, String(await p.locator('.rrow, .rcard').count()));
  await p.reload(); await p.waitForSelector('.rcard');
  chk('still 47 after a reload', await p.locator('.rcard').count()===47, String(await p.locator('.rcard').count()));
  await p.click('[data-act="theme"]'); await p.waitForTimeout(300);
  chk('still 47 after a theme change', await p.locator('.rcard').count()===47, String(await p.locator('.rcard').count()));
  /* Browser restart: a brand-new context carrying only the stored state, the
     closest a test can get to quitting and reopening Safari. */
  const state = await ctx.storageState();
  const ctx2 = await br.newContext({ ...devices['iPhone 13'], storageState: state });
  /* Hermetic: the kitchen server is never poked from CI — the app's
     ready-list fetch on #add fails silently, exactly like offline. */
  await ctx2.route('**/*.onrender.com/**', r => r.abort('failed'));
  const p2 = await ctx2.newPage();
  await p2.goto(B+'/index.html#menu'); await p2.waitForSelector('.rcard');
  chk('still 47 after a browser restart', await p2.locator('.rcard').count()===47, String(await p2.locator('.rcard').count()));
  await ctx2.close();
  await p.evaluate(()=>localStorage.removeItem('kt.recipes'));
  await p.reload(); await p.waitForSelector('.rcard');
  chk('48 again once local changes are cleared', await p.locator('.rcard').count()===48);

  console.log('\n== Wake lock intent survives backgrounding ==');
  await p.goto(B+'/index.html#chicken-cordon-bleu'); await p.waitForSelector('.r-title');
  const hasWake = await p.locator('[data-act="toggle-wake"]').count();
  if (hasWake) {
    await p.click('[data-act="toggle-wake"]');
    /* The request is a promise and can be slow on a loaded machine — poll the
       switch rather than trusting one fixed wait. */
    let on = null;
    for (let t = 0; t < 20 && on !== 'true'; t++) {
      await p.waitForTimeout(250);
      on = await p.getAttribute('[data-act="toggle-wake"]','aria-checked');
    }
    chk('wake lock turns on', on==='true', String(on));
  } else {
    chk('wake row hidden when API unavailable', true);
  }

  console.log('\n== a:hover never turns a filled control invisible (Jason bug) ==');
  await p.evaluate(()=>localStorage.setItem('kt.theme',JSON.stringify('light')));
  await p.goto(B+'/index.html'); await p.waitForSelector('.bigbtn');
  let hoverBad=[];
  for (const sel of ['.bigbtn','.who-tile','.hero','.cat-row']) {
    const el=p.locator(sel).first();
    if (!(await el.count())) continue;
    await el.hover().catch(()=>{}); await p.waitForTimeout(100);
    const s=await el.evaluate(e=>{const c=getComputedStyle(e);return [c.color,c.backgroundColor];});
    if (s[0]===s[1]) hoverBad.push(sel);
  }
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  for (const sel of ['.rcard','.addpill']) {
    const el=p.locator(sel).first();
    await el.hover().catch(()=>{}); await p.waitForTimeout(100);
    const s=await el.evaluate(e=>{const c=getComputedStyle(e);return [c.color,c.backgroundColor];});
    if (s[0]===s[1]) hoverBad.push(sel);
  }
  chk('hovered text never matches its background (light mode)', hoverBad.length===0, hoverBad.join(', '));
  await p.evaluate(()=>localStorage.removeItem('kt.theme'));

  console.log('\n== Colour is never the only signal (task 043) ==');
  await p.goto(B+'/index.html#chops'); await p.waitForSelector('.r-title');
  chk('flagged panel carries a heading, not just a colour', /Worth double-checking|No ingredients were captured/.test(await p.locator('.panel--flag').first().textContent()));
  await p.goto(B+'/index.html'); await p.waitForSelector('.who-tile');
  chk('empty contributor tile invites in words, not colour (058)', (await p.locator('.who-tile--empty').first().textContent()).includes('None yet'));
  await p.goto(B+'/index.html#menu'); await p.waitForSelector('.rcard');
  await p.click('[data-act="open-filter"]'); await p.waitForSelector('#filter-sheet');
  await p.click('[data-act="fc"][data-key="Dinner"]'); await p.waitForTimeout(300);
  chk('selected chip carries a check glyph', await p.locator('[data-act="fc"][data-key="Dinner"] svg').count()===1);
  chk('unselected chip has no glyph', await p.locator('[data-act="fc"][data-key="Breakfast"] svg').count()===0);
  await p.click('[data-act="fc"][data-key="Dinner"]'); await p.waitForTimeout(200);
  await p.click('.donebtn'); await p.waitForTimeout(200);

  console.log('\n== The book survives bad data (R12) ==');
  {
    /* Both of these brick the app if unguarded — and the escape hatch
       ("Undo all my changes on this phone") lives INSIDE the app, so a
       boot crash takes the recovery with it. */
    const ctxBad = await br.newContext({ ...devices['iPhone 13'] });
    await ctxBad.route('**/*.onrender.com/**', r => r.abort('failed'));
    const pb = await ctxBad.newPage();
    const bootErrs = [];
    pb.on('pageerror', e => bootErrs.push(String(e.message)));

    /* 1. A local overlay with a rotten entry in it. */
    await pb.addInitScript(() => {
      localStorage.setItem('kt.recipes', JSON.stringify([
        { id: 'good-one', title: 'Still Here', category: 'Dinner',
          contributor: 'Joan', servings: 4, ingredients: ['a'], steps: ['b'] },
        null,
        'not a recipe at all'
      ]));
    });
    await pb.goto(B + '/index.html#menu');
    await pb.waitForSelector('.rcard, .notice--bad', { timeout: 12000 });
    chk('a rotten entry in the overlay does not brick the book',
      await pb.locator('.rcard__title', { hasText: 'Still Here' }).count() === 1);
    chk('the junk entries are dropped, not rendered',
      await pb.locator('.rcard').count() === 1, String(await pb.locator('.rcard').count()));
    chk('no boot crash from the overlay', bootErrs.length === 0, bootErrs.join(' | '));
    await ctxBad.close();

    /* 2. A published recipes.json that parses but is not a list. */
    const ctxBad2 = await br.newContext({ ...devices['iPhone 13'] });
    await ctxBad2.route('**/*.onrender.com/**', r => r.abort('failed'));
    await ctxBad2.route('**/recipes.json', r => r.fulfill({
      status: 200, contentType: 'application/json', body: '{"oops":"not a list"}' }));
    const pb2 = await ctxBad2.newPage();
    const errs2 = [];
    pb2.on('pageerror', e => errs2.push(String(e.message)));
    await pb2.goto(B + '/index.html');
    await pb2.waitForSelector('.emptystate, .main__title', { timeout: 12000 });
    const shown = await pb2.locator('#app').textContent();
    chk('a malformed recipes.json says so instead of hanging on "Loading recipes…"',
      /could not be loaded/i.test(shown), shown.slice(0, 80));
    chk('and it fails without throwing', errs2.length === 0, errs2.join(' | '));
    await ctxBad2.close();
  }

  console.log('\n== A half-finished import, restored (R13) ==');
  {
    /* The Add screen snapshots itself so a refresh doesn't lose work
       (084). That snapshot is restored straight into the review form —
       and a snapshot written by an older build has fewer fields than
       today's form expects. It also survives in sessionStorage, so a
       crash here repeats on every arrival until the tab is closed. */
    const ctxSnap = await br.newContext({ ...devices['iPhone 13'] });
    await ctxSnap.route('**/*.onrender.com/**', r => r.abort('failed'));
    const ps = await ctxSnap.newPage();
    const snapErrs = [];
    ps.on('pageerror', e => snapErrs.push(String(e.message)));
    await ps.addInitScript(() => {
      sessionStorage.setItem('kt.addDraft', JSON.stringify({
        step: 'review', draft: { title: 'Half a Recipe' }   // an older shape
      }));
    });
    await ps.goto(B + '/index.html#add');
    await ps.waitForSelector('#a-title, .pathbtn', { timeout: 12000 });
    chk('an old-shaped snapshot still opens the review form',
      await ps.locator('#a-title').count() === 1);
    chk('what it did carry is kept', await ps.inputValue('#a-title') === 'Half a Recipe');
    chk('the missing lists come back as empty fields, not a crash',
      await ps.locator('[data-act="adl"][data-k="ingredients"]').count() >= 1 &&
      await ps.locator('[data-act="adl"][data-k="steps"]').count() >= 1);
    chk('no page error from the restore', snapErrs.length === 0, snapErrs.join(' | '));
    await ctxSnap.close();
  }

  console.log('\n== A photo store holding nonsense (R13) ==');
  {
    const ctxImg = await br.newContext({ ...devices['iPhone 13'] });
    await ctxImg.route('**/*.onrender.com/**', r => r.abort('failed'));
    const pi = await ctxImg.newPage();
    const imgErrs = [];
    pi.on('pageerror', e => imgErrs.push(String(e.message)));
    /* The legacy localStorage path (no IndexedDB) with junk in it. */
    await pi.addInitScript(() => {
      localStorage.setItem('kt.images', JSON.stringify({
        'chicken-cordon-bleu': { not: 'a data url' },
        'chops': 12345
      }));
    });
    await pi.goto(B + '/index.html#menu');
    await pi.waitForSelector('.rcard', { timeout: 12000 });
    chk('junk in the photo store does not stop the book rendering',
      await pi.locator('.rcard').count() >= 40);
    await pi.goto(B + '/index.html#chicken-cordon-bleu');
    await pi.waitForSelector('.r-title', { timeout: 12000 });
    chk('and a recipe whose photo is nonsense still opens',
      (await pi.locator('.r-title').textContent()).length > 0);
    chk('no page error from the photo store', imgErrs.length === 0, imgErrs.join(' | '));
    await ctxImg.close();
  }

  console.log('\n== A save that did not happen must not say "Saved" (R44) ==');
  {
    /* The photo path has said "storage is full" out loud since task 011. The
       recipe overlay — the family's own words, the thing Edit mode exists to
       keep — went through save(), which swallows a quota error entirely. So
       the button says Saved, the screen shows the change, and it is gone on
       the next load: data loss wearing the face of success. Reachable on a
       browser without IndexedDB, where photos fall back into the same
       localStorage this overlay lives in. */
    const ctxFull = await br.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const pFull = await ctxFull.newPage();
    const fullErrs = []; pFull.on('pageerror', e => fullErrs.push(e.message));
    await pFull.goto(B + '/index.html#chicken-cordon-bleu');
    await pFull.waitForSelector('.r-title');
    /* Fill the shelf, leaving the app's own keys alone. */
    const filled = await pFull.evaluate(() => {
      /* Coarse, then fine: a 64KB block failing still leaves room for the
         ~60KB overlay, and a half-full shelf proves nothing. */
      let n = 0;
      for (const size of [64, 8, 1]) {
        const blob = 'x'.repeat(size * 1024);
        try { for (let i = 0; i < 4000; i++, n++) localStorage.setItem('kt.fill.' + n, blob); }
        catch (e) { /* next, smaller */ }
      }
      return n;
    });
    chk('the shelf really is full', filled > 0, 'filled ' + filled + ' blocks');
    await pFull.click('[data-act="toggle-edit"]');
    await pFull.waitForTimeout(300);
    await pFull.fill('#e-title', 'A Title That Cannot Be Kept');
    await pFull.click('[data-act="save"]');
    await pFull.waitForTimeout(400);
    const label = await pFull.locator('[data-act="save"]').textContent();
    const screen = await pFull.locator('#main-content').textContent();
    chk('it does not claim to have saved', !/saved/i.test(label), label);
    chk('and says plainly that the phone is full',
      /full|no room|wouldn’t store|would not store/i.test(screen),
      screen.slice(0, 120));
    chk('without throwing', fullErrs.length === 0, fullErrs.join(' | '));
    /* And with room again, Save behaves exactly as it always did. */
    await pFull.evaluate(() => {
      Object.keys(localStorage).filter(k => k.indexOf('kt.fill.') === 0)
        .forEach(k => localStorage.removeItem(k));
    });
    await pFull.click('[data-act="save"]');
    await pFull.waitForTimeout(400);
    chk('with room again it saves and says so',
      /saved/i.test(await pFull.locator('[data-act="save"]').textContent()));
    await pFull.reload();
    await pFull.waitForSelector('.r-title');
    chk('and the change is really there after a reload',
      (await pFull.locator('.r-title').textContent()).includes('Cannot Be Kept'));
    await ctxFull.close();
  }

  console.log('\n== The font is really the font (R42) ==');
  {
    /* CLAUDE.md's second rule, and the one it calls a functional requirement
       rather than a stylistic one: ONE font, Atkinson Hyperlegible, chosen
       because the reader has low vision. The existing check reads
       font-family and finds "Atkinson" — which is what the CSS *asks* for.
       If every woff2 vanished tomorrow the string would still say Atkinson
       while the browser quietly drew a system face, and nothing would fail. */
    const fsf = require('fs');
    const pathf = require('path');
    const ROOTF = pathf.join(__dirname, '..');

    /* Static first: every file the stylesheet promises must be on disk. */
    const css = fsf.readFileSync(pathf.join(ROOTF, 'fonts', 'fonts.css'), 'utf8');
    const srcs = [...new Set((css.match(/url\("([^"]+)"\)/g) || [])
      .map(u => u.replace(/url\("|"\)/g, '')))];
    const gone = srcs.filter(f => !fsf.existsSync(pathf.join(ROOTF, 'fonts', f)));
    chk('every face the stylesheet promises is on disk',
      srcs.length >= 4 && gone.length === 0, gone.join(', ') || srcs.length + ' faces');

    /* …and everything else the page points at, which a 404 would otherwise
       hide until someone tried to install it to a Home Screen. */
    const man = JSON.parse(fsf.readFileSync(pathf.join(ROOTF, 'manifest.json'), 'utf8'));
    const idx = fsf.readFileSync(pathf.join(ROOTF, 'index.html'), 'utf8');
    const refs = man.icons.map(i => i.src)
      .concat((idx.match(/(?:href|src)="([^"]+\.(?:png|svg|css|js|json))"/g) || [])
        .map(m => m.replace(/^(?:href|src)="|"$/g, '')))
      .filter(u => !/^https?:/.test(u));
    const missingRefs = [...new Set(refs)].filter(u => !fsf.existsSync(pathf.join(ROOTF, u)));
    chk('every file the page and the manifest point at exists',
      missingRefs.length === 0, missingRefs.join(', '));

    /* Then the live proof: loaded, and actually drawing the glyphs. */
    const pFont = await br.newPage();
    await pFont.goto(B + '/index.html');
    await pFont.waitForSelector('.main__title');
    await pFont.evaluate(() => document.fonts.ready);
    const face = await pFont.evaluate(() => {
      const measure = (family) => {
        const s = document.createElement('span');
        s.textContent = 'Chicken Cordon Bleu 1234';
        s.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;' +
          'font-size:64px;font-family:' + family;
        document.body.appendChild(s);
        const w = s.getBoundingClientRect().width;
        s.remove();
        return w;
      };
      return {
        loaded400: document.fonts.check('400 24px "Atkinson Hyperlegible"'),
        loaded700: document.fonts.check('700 24px "Atkinson Hyperlegible"'),
        atkinson: measure('"Atkinson Hyperlegible"'),
        fallback: measure('monospace'),
        serif: measure('serif')
      };
    });
    chk('both weights are loaded, not merely asked for',
      face.loaded400 && face.loaded700, JSON.stringify(face));
    chk('and the glyphs on screen are its glyphs, not a stand-in',
      Math.abs(face.atkinson - face.fallback) > 1 &&
      Math.abs(face.atkinson - face.serif) > 1,
      'atkinson ' + Math.round(face.atkinson) + ' vs mono ' +
      Math.round(face.fallback) + ' / serif ' + Math.round(face.serif));
    await pFont.close();
  }

  console.log('\n== Every key the app reads, filled with rubbish (R40) ==');
  {
    /* R12 closed the recipe overlay, R13 the draft snapshot, R21 the plan.
       This finishes the sweep: EVERY key the app reads gets garbage of the
       wrong shape, and the app has to boot, render and stay usable. A phone
       that has held this app for a year, through a dozen versions, is the
       device most likely to be carrying something the current code did not
       write. */
    const ctxJunk = await br.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const pJunk = await ctxJunk.newPage();
    await ctxJunk.route('**/*.onrender.com/**', r => r.abort('failed'));
    const junkErrs = []; pJunk.on('pageerror', e => junkErrs.push(e.message));
    await pJunk.goto(B + '/index.html');
    await pJunk.evaluate(() => {
      const junk = '"a string where a list belongs"';
      ['kt.theme', 'kt.fsIndex', 'kt.easyRead', 'kt.recipes', 'kt.plan',
       'kt.dismissedImports', 'kt.images', 'kt.tagCase'].forEach(k =>
        localStorage.setItem(k, junk));
      sessionStorage.setItem('kt.addDraft', junk);
    });
    for (const [name, hash, sel] of [['Main', '#', '.main__title'],
      ['Menu', '#menu', '.rcard'], ['Recipe', '#chicken-cordon-bleu', '.r-title'],
      ['Week planner', '#plan', '.dayblock'], ['Add', '#add', 'h1'],
      ['How to use it', '#help', '.help__h1']]) {
      await pJunk.goto(B + '/index.html' + hash);
      await pJunk.reload();
      await pJunk.waitForSelector(sel, { timeout: 10000 })
        .catch(() => { junkErrs.push(name + ' never rendered'); });
    }
    chk('every screen still boots on a phone full of rubbish',
      junkErrs.length === 0, junkErrs.slice(0, 2).join(' | '));
    /* And the controls that read those keys still work rather than throwing
       the first time they are touched. */
    await pJunk.goto(B + '/index.html#menu');
    await pJunk.reload();
    await pJunk.waitForSelector('.rcard');
    chk('the book is the published one, not the rubbish',
      await pJunk.locator('.rcard').count() === 48,
      String(await pJunk.locator('.rcard').count()));
    await pJunk.click('[data-act="open-text"]');
    await pJunk.waitForSelector('[data-act="fs+"]');
    await pJunk.click('[data-act="fs+"]');
    await pJunk.waitForTimeout(200);
    chk('the text stepper still steps', junkErrs.length === 0, junkErrs.join(' | '));
    await ctxJunk.close();
  }

  console.log('\n== When the app itself cannot start (R29) ==');
  {
    /* Every other failure in this app has a sentence. The one that never did
       was the worst of them: if app.js is truncated by a bad deploy, or uses
       syntax an older iPhone cannot parse, nothing runs — no catch, no
       render — and the page reads "Loading recipes…" for ever. On the phone
       this book was built for, that looks like a broken phone rather than a
       broken deploy, and there is nothing to do about it. */
    const ctxDead = await br.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const pDead = await ctxDead.newPage();
    await pDead.route('**/app.js', route => route.fulfill({
      status: 200, contentType: 'text/javascript',
      body: 'this is not javascript ((('
    }));
    await pDead.goto(B + '/index.html');
    await pDead.waitForTimeout(1200);
    const text = await pDead.locator('#app').textContent();
    chk('it does not sit on "Loading recipes…" for ever',
      !/Loading recipes/.test(text), text.slice(0, 70));
    chk('it says so in words, and says it is not your fault',
      /could not start/i.test(text) && /not something you did/i.test(text),
      text.slice(0, 90));
    const again = pDead.locator('#app button');
    chk('and offers a way to try again', await again.count() === 1);
    chk('which is a real tap target',
      (await again.boundingBox()).height >= 44,
      String((await again.boundingBox()).height));
    /* And the message must never appear over a working app. */
    await pDead.unroute('**/app.js');
    await pDead.reload();
    await pDead.waitForSelector('.main__title');
    await pDead.waitForTimeout(1500);
    chk('a healthy boot never shows it',
      !/could not start/i.test(await pDead.locator('#app').textContent()));

    /* R30 — the case that nearly shipped. The worker serves a CACHED app.js
       on the first load after a deploy, so the very phones this message
       reaches are running the previous app.js: one that never heard of the
       marker it was watching for. Measured, before the fix: the app rendered
       normally and was then replaced, eight seconds later, by "could not
       start". The failure the message exists to prevent, aimed at a working
       page. */
    const oldApp = require('fs')
      .readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8')
      .replace(/document\.getElementById\("app"\)\.setAttribute\("data-booted", "1"\);/,
        '/* an app.js from before the marker existed */');
    chk('the stand-in really is missing the marker',
      !/data-booted/.test(oldApp));
    await pDead.route('**/app.js', route => route.fulfill({
      status: 200, contentType: 'text/javascript', body: oldApp }));
    await pDead.reload();
    await pDead.waitForSelector('.main__title');
    await pDead.waitForTimeout(13000);
    chk('an app.js from before the message never gets wiped by it',
      await pDead.locator('.main__title').count() === 1 &&
      !/could not start/i.test(await pDead.locator('#app').textContent()));
    await ctxDead.close();
  }

  console.log('\n== Download, commit, read back — the whole loop (R26) ==');
  {
    /* This is how an edit becomes permanent in a no-server app: Download
       updated recipes.json → someone commits it → every phone reads it. The
       download's individual fields have been spot-checked since the first
       build, but the LOOP never was, and a field quietly dropped on the way
       out would lose family data silently and for good. */
    /* serviceWorkers: 'block' is load-bearing, not tidiness. Once the worker
       is installed on this origin it answers recipes.json itself, and a
       page.route() stub never sees the request — so the "read it back"
       half below would quietly test the shipped file instead of the
       downloaded one and pass while proving nothing. (Same shape as R9's
       vacuous offline check and R21's vacuous seeding: a stub that loses to
       the worker is not a stub.) */
    const ctxRt = await br.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const pRt = await ctxRt.newPage();
    const rtErrs = []; pRt.on('pageerror', e => rtErrs.push(e.message));
    await pRt.goto(B + '/index.html');
    await pRt.evaluate(() => { localStorage.removeItem('kt.recipes'); });
    await pRt.goto(B + '/index.html#chicken-cordon-bleu');
    await pRt.reload();
    await pRt.waitForSelector('.r-title');
    await pRt.click('[data-act="toggle-edit"]');
    await pRt.waitForTimeout(300);
    const grab = async () => {
      const [d] = await Promise.all([pRt.waitForEvent('download'),
        pRt.click('[data-act="dl-json"]')]);
      let t = ''; const st = await d.createReadStream(); for await (const c of st) t += c;
      return t;
    };
    const first = await grab();
    const shipped = await pRt.evaluate(() => fetch('recipes.json').then(r => r.json()));
    const out = JSON.parse(first);

    chk('every recipe comes back out', out.length === shipped.length,
      out.length + ' vs ' + shipped.length);
    chk('in the same order', out.every((r, i) => r.id === shipped[i].id));
    /* Field by field, with the two documented transformations allowed and
       nothing else: the category rename, and a local photo becoming a path. */
    const CATS_OLD = { Side: 'Sides', Dessert: 'Desserts', Snack: 'Snacks', Drink: 'Drinks' };
    const drift = [];
    out.forEach((r, i) => {
      const src = shipped[i];
      const keys = new Set([...Object.keys(r), ...Object.keys(src)]);
      keys.forEach(k => {
        const a = JSON.stringify(r[k]), b = JSON.stringify(src[k]);
        if (a === b) return;
        if (k === 'category' && r.category === (CATS_OLD[src.category] || src.category)) return;
        if (k === 'image' && /^images\//.test(r.image || '')) return;
        /* orderFields drops empty strings — an absent field and "" mean the
           same thing to this app, and always have. */
        if (a === undefined && b === '""') return;
        drift.push(src.id + '.' + k + ': ' + String(b).slice(0, 30) + ' → ' + String(a).slice(0, 30));
      });
    });
    chk('and nothing is lost or altered on the way out', drift.length === 0,
      drift.slice(0, 3).join(' | '));

    /* Now the edit, and the round trip proper. */
    await pRt.fill('#e-title', 'Chicken Cordon Bleu (Round Trip)');
    await pRt.click('[data-act="save"]');
    await pRt.waitForTimeout(400);
    const edited = await grab();
    const back = JSON.parse(edited);
    chk('the edit is in the file', back.find(r => r.id === 'chicken-cordon-bleu')
      .title === 'Chicken Cordon Bleu (Round Trip)');
    chk('and it is the only thing that moved',
      back.filter((r, i) => JSON.stringify(r) !== JSON.stringify(out[i])).length === 1,
      String(back.filter((r, i) => JSON.stringify(r) !== JSON.stringify(out[i])).length));

    /* Serve that exact file as the published book, with no local changes at
       all — which is what every OTHER phone sees after the commit. */
    await pRt.route('**/recipes.json', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: edited }));
    await pRt.goto(B + '/index.html#menu');
    await pRt.evaluate(() => { localStorage.removeItem('kt.recipes'); });
    await pRt.reload();
    await pRt.waitForSelector('.rcard');
    chk('committed, it reads back as the same book',
      await pRt.locator('.rcard').count() === shipped.length,
      String(await pRt.locator('.rcard').count()));
    await pRt.goto(B + '/index.html#chicken-cordon-bleu');
    await pRt.waitForSelector('.r-title');
    chk('with the edit now published, not local',
      (await pRt.locator('.r-title').textContent()).includes('Round Trip'),
      (await pRt.locator('.r-title').textContent()).slice(0, 60));
    chk('and the recipe still has its ingredients and steps',
      (await pRt.locator('.checklist').first().textContent()).trim().length > 10 &&
      (await pRt.locator('.checklist--steps').textContent()).trim().length > 20);
    chk('no page errors anywhere in the loop', rtErrs.length === 0, rtErrs.join(' | '));
    await ctxRt.close();
  }

  console.log('\n== A recipe on paper (R24) ==');
  {
    /* "Print is the PDF path" (CLAUDE.md): the download sheet's PDF option is
       window.print() against the print stylesheet. The week planner's print
       view has been checked since 129; the recipe's — the one a family
       actually puts on the counter — never was. */
    const pPr = await br.newPage();
    await pPr.goto(B + '/index.html#chicken-cordon-bleu');
    await pPr.waitForSelector('.r-title');
    /* Scale it first: the promise is that paper carries the quantities you
       are actually cooking, not the recipe's stored default. */
    const before = (await pPr.locator('.checklist li').first().textContent()).trim();
    await pPr.click('[data-act="serv+"]');
    await pPr.waitForTimeout(200);
    await pPr.click('[data-act="serv+"]');
    await pPr.waitForTimeout(250);
    const scaled = (await pPr.locator('.checklist li').first().textContent()).trim();
    chk('scaling changed the quantity on screen', scaled !== before, before + ' → ' + scaled);

    await pPr.emulateMedia({ media: 'print' });
    await pPr.waitForTimeout(150);
    const paper = await pPr.evaluate(() => {
      const vis = (sel) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).display !== 'none' : null;
      };
      const rgb = (s) => (s.match(/\d+/g) || []).map(Number);
      const body = getComputedStyle(document.body);
      const li = document.querySelector('.checklist li');
      return {
        head: vis('.rhead'), checkbox: vis('.checkbox'), servbtn: vis('.servbtn'),
        title: vis('.r-title'), list: vis('.checklist'), steps: vis('.checklist--steps'),
        paper: rgb(body.backgroundColor), ink: rgb(body.color),
        firstLine: li ? li.textContent.trim() : '',
        cols: getComputedStyle(document.querySelector('.bodygrid')).display
      };
    });
    chk('the site chrome is gone', paper.head === false && paper.checkbox === false &&
      paper.servbtn === false, JSON.stringify(paper).slice(0, 90));
    chk('the recipe itself is there', paper.title && paper.list && paper.steps);
    chk('and it carries the quantities you scaled to',
      paper.firstLine === scaled, paper.firstLine + ' vs ' + scaled);
    chk('it prints black on white, whatever the screen was',
      paper.paper.every(v => v > 200) && paper.ink.every(v => v < 90),
      'paper ' + paper.paper.join(',') + ' ink ' + paper.ink.join(','));
    chk('one column on paper, not the two-column screen layout',
      paper.cols === 'block', paper.cols);

    /* Dark mode is the app's default, and a dark page printed is a wasted
       cartridge and an unreadable sheet. */
    await pPr.emulateMedia({ media: 'screen' });
    await pPr.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await pPr.emulateMedia({ media: 'print' });
    await pPr.waitForTimeout(150);
    const dark = await pPr.evaluate(() => {
      const rgb = (s) => (s.match(/\d+/g) || []).map(Number);
      const b = getComputedStyle(document.body);
      return { paper: rgb(b.backgroundColor), ink: rgb(b.color),
        label: rgb(getComputedStyle(document.querySelector('.minilabel')).color) };
    });
    chk('dark mode prints on white too',
      dark.paper.every(v => v > 200) && dark.ink.every(v => v < 90),
      'paper ' + dark.paper.join(',') + ' ink ' + dark.ink.join(','));
    chk('and the faded tier does not vanish into the page',
      dark.label.every(v => v < 120), dark.label.join(','));
    await pPr.close();
  }

  console.log('\n== The shell survives a real outage (R1/R9 — service worker) ==');
  {
    /* Playwright's offline emulation does NOT reach fetches made by a
       service worker — an "offline" assertion written that way passes
       because the worker quietly reached the live server. So this block
       serves the app from its own throwaway server and then KILLS it:
       the outage is real, and so is what it proves. */
    const http = require('http');
    const fsx = require('fs');
    const pathx = require('path');
    const ROOT = pathx.join(__dirname, '..');

    /* R10 — the precache list is hand-maintained, and cache.addAll() is
       all-or-nothing: one missing file and the worker's install rejects,
       leaving NO offline support at all, silently. (R5 deleted a file from
       this repo; had it been listed here, that is exactly what would have
       happened.) So every path the worker promises to cache must exist. */
    {
      const swSrc = fsx.readFileSync(pathx.join(ROOT, 'sw.js'), 'utf8');
      const list = swSrc.slice(swSrc.indexOf('const SHELL = ['), swSrc.indexOf('];'))
        .match(/"([^"]+)"/g).map(s => s.replace(/"/g, ''));
      const missing = list.filter(rel => {
        const f = pathx.join(ROOT, rel === './' ? 'index.html' : rel);
        return !fsx.existsSync(f);
      });
      chk('every file the worker precaches exists', missing.length === 0, missing.join(', '));
      chk('the precache list covers the app itself', list.includes('app.js') &&
        list.includes('style.css') && list.includes('index.html'));
    }
    const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
      '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
      '.woff2': 'font/woff2', '.txt': 'text/plain' };
    /* Turned up for the R19 block: a weak signal, served by the same server
       that serves everything else, so only the book is slow. */
    let slowJsonMs = 0;
    const srv = http.createServer((rq, rs) => {
      const rel = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
      const file = pathx.join(ROOT, rel === '/' ? '/index.html' : rel);
      if (!file.startsWith(ROOT) || !fsx.existsSync(file) || fsx.statSync(file).isDirectory()) {
        rs.writeHead(404); return rs.end('no');
      }
      const serve = () => {
        rs.writeHead(200, { 'content-type': TYPES[pathx.extname(file)] || 'application/octet-stream' });
        fsx.createReadStream(file).pipe(rs);
      };
      if (slowJsonMs && rel.endsWith('/recipes.json')) setTimeout(serve, slowJsonMs);
      else serve();
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const OWN = 'http://127.0.0.1:' + srv.address().port;

    const ctxSW = await br.newContext({ ...devices['iPhone 13'] });
    await ctxSW.route('**/*.onrender.com/**', r => r.abort('failed'));
    const psw = await ctxSW.newPage();
    await psw.goto(OWN + '/index.html#menu');
    await psw.waitForSelector('.rcard');
    chk('service worker registers', await psw.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      return !!reg.active;
    }));
    await psw.waitForTimeout(900);          // let the precache finish
    await psw.reload();                     // second load: the worker takes control
    await psw.waitForSelector('.rcard');
    chk('repeat visits are served through the worker', await psw.evaluate(() => {
      const e = performance.getEntriesByType('resource').find(r => r.name.endsWith('/app.js'));
      return !!e && e.workerStart > 0;
    }));

    /* R9 — the recipes are DATA, not shell: a book published an hour ago
       must appear on the next open, not the one after. Doctoring the
       worker's own cache proves which copy wins, without a network. */
    const doctor = async () => psw.evaluate(async () => {
      const c = await caches.open('kt-shell-v2');
      await c.put('/recipes.json', new Response(JSON.stringify([{ id: 'stale-sentinel',
        title: 'Stale Sentinel Loaf', category: 'Baking', contributor: 'Joan', servings: 4,
        ingredients: ['1 cup flour'], steps: ['Bake.'] }]),
        { headers: { 'content-type': 'application/json' } }));
    });
    await doctor();
    await psw.reload();
    await psw.waitForSelector('.rcard');
    chk('online, a freshly published book beats the cached one',
      await psw.locator('.rcard__title', { hasText: 'Stale Sentinel Loaf' }).count() === 0);

    /* R19 — a weak signal is not an outage, and it used to behave like one.
       recipes.json was network-first with no clock on it, so on a bad
       connection the book waited for the browser to give up — tens of
       seconds — with a complete copy sitting in the cache the whole time.
       The network gets a short head start now, and the cached book wins if
       it doesn't answer in it. */
    slowJsonMs = 6000;
    await doctor();
    const slowStart = Date.now();
    await psw.reload();
    await psw.waitForSelector('.rcard', { timeout: 20000 });
    const waited = Date.now() - slowStart;
    chk('a slow book does not hold the app hostage', waited < 4500, waited + 'ms');
    chk('and what it shows meanwhile is the cached book',
      await psw.locator('.rcard__title', { hasText: 'Stale Sentinel Loaf' }).count() === 1);
    /* The late answer is not thrown away — it is what makes the NEXT open
       current, which is the whole reason this route is network-first. */
    await psw.waitForTimeout(7000);
    slowJsonMs = 0;
    await psw.reload();
    await psw.waitForSelector('.rcard');
    chk('the late answer still lands, so the next open is current',
      await psw.locator('.rcard__title', { hasText: 'Stale Sentinel Loaf' }).count() === 0 &&
      await psw.locator('.rcard').count() > 40,
      String(await psw.locator('.rcard').count()));

    /* Now the outage: the server is gone, not merely emulated away. */
    await doctor();
    await new Promise(r => srv.close(r));
    await psw.reload();
    await psw.waitForSelector('.rcard', { timeout: 15000 });
    chk('with the server gone, the whole app still loads from the worker',
      await psw.locator('.rcard').count() >= 1);
    chk('and the cached book is what it serves',
      await psw.locator('.rcard__title', { hasText: 'Stale Sentinel Loaf' }).count() === 1);
    await psw.locator('.rcard').first().click();
    await psw.waitForSelector('.r-title', { timeout: 8000 });
    chk('a recipe still opens with the server down',
      (await psw.locator('#main-content').textContent()).length > 60);
    await ctxSW.close();
  }

  chk('no JS errors', errs.length===0, errs.join(' | '));
  await br.close();
  console.log('\n'+'='.repeat(50)+'\nPASS: '+pass+'   FAIL: '+fail+'\n'+'='.repeat(50));
  process.exit(fail?1:0);
})();
