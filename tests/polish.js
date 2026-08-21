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

  console.log('\n== Reduced motion, proven by the browser (R51) ==');
  {
    /* The static half — every `animation:` rule is named in the
       prefers-reduced-motion block — has been checked since the motion arc.
       That is the CSS being self-consistent, not the motion actually
       stopping: a selector that no longer matches, a rule that arrives later
       with higher specificity, and the list still reads complete while the
       page still moves. This asks the browser. */
    const ctxM = await br.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
    const pM = await ctxM.newPage();
    await pM.goto(B + '/index.html');
    await pM.waitForSelector('.main__title');
    const still = async (page) => page.evaluate(() => {
      const moving = [];
      document.querySelectorAll('*').forEach(el => {
        const c = getComputedStyle(el);
        if (c.animationName && c.animationName !== 'none') {
          moving.push((el.className || el.tagName) + ' ' + c.animationName);
        }
      });
      return moving;
    });
    /* Every screen, and the two states that arm an animation on purpose. */
    const moving = [];
    for (const [name, hash, open] of [
      ['Main', '#', null], ['Menu', '#menu', null],
      ['Recipe', '#chicken-cordon-bleu', null],
      ['Week planner', '#plan', null], ['Add', '#add', null],
      ['Menu + filter sheet', '#menu', '[data-act="open-filter"]'],
      ['Recipe + download sheet', '#bacon-ranch-chicken-casserole', '[data-act="open-dl"]']
    ]) {
      await pM.goto(B + '/index.html' + hash);
      await pM.reload();
      await pM.waitForSelector('h1');
      if (open) { await pM.click(open); await pM.waitForTimeout(250); }
      for (const m of await still(pM)) moving.push(name + ': ' + m);
    }
    chk('with reduced motion asked for, nothing on any screen animates',
      moving.length === 0, moving.slice(0, 3).join(' | '));
    /* Ticking an ingredient arms a tick animation; under reduce it must arm
       nothing. */
    await pM.goto(B + '/index.html#chicken-cordon-bleu');
    await pM.reload();
    await pM.waitForSelector('.checkrow');
    await pM.locator('.checkrow').first().click();
    await pM.waitForTimeout(150);
    chk('and neither does ticking something off', (await still(pM)).length === 0,
      (await still(pM)).slice(0, 2).join(' | '));
    await ctxM.close();

    /* The counterpart, so the check above is measuring the media query and
       not an app that simply never animates: with motion allowed, the same
       actions do move something. */
    const ctxA = await br.newContext({ ...devices['iPhone 13'], reducedMotion: 'no-preference' });
    const pA = await ctxA.newPage();
    await pA.goto(B + '/index.html#chicken-cordon-bleu');
    await pA.waitForSelector('.checkrow');
    await pA.locator('.checkrow').first().click();
    const movedSomewhere = await pA.evaluate(() => {
      const seen = [];
      document.querySelectorAll('*').forEach(el => {
        const c = getComputedStyle(el);
        if (c.animationName && c.animationName !== 'none') seen.push(c.animationName);
      });
      return seen;
    });
    chk('and with motion allowed, something really does animate',
      movedSomewhere.length > 0, movedSomewhere.slice(0, 3).join(', '));
    await ctxA.close();
  }

  console.log('\n== Keep screen on, across a text message (R50) ==');
  {
    /* iOS drops a wake lock whenever the tab is backgrounded and never
       restores it, so the app re-requests on return — otherwise the switch
       silently stops working the first time someone answers a text
       mid-recipe, which is the exact moment a kitchen needs it.
       Honest about what this proves: the handler, not the platform. Chromium
       here does not fire a real visibilitychange for a backgrounded tab
       (measured), so the event is dispatched with visibilityState overridden.
       The browser firing it at all is a platform guarantee; what could
       actually regress is what this app does when it arrives — including the
       two cases where it must do NOTHING. */
    const ctxW = await br.newContext({ ...devices['iPhone 13'] });
    const pW = await ctxW.newPage();
    await pW.goto(B + '/index.html#chicken-cordon-bleu');
    await pW.waitForSelector('.r-title');
    const hasWake = await pW.locator('[data-act="toggle-wake"]').count();
    if (!hasWake) {
      chk('wake control absent in this browser — nothing to prove', true);
    } else {
      await pW.evaluate(() => {
        window.__asked = 0;
        const real = navigator.wakeLock.request.bind(navigator.wakeLock);
        navigator.wakeLock.request = (t) => { window.__asked++; return real(t); };
        window.__vis = 'visible';
        Object.defineProperty(document, 'visibilityState',
          { configurable: true, get: () => window.__vis });
        window.__background = async () => {
          window.__vis = 'hidden';
          document.dispatchEvent(new Event('visibilitychange'));
          await new Promise(r => setTimeout(r, 100));
          window.__vis = 'visible';
          document.dispatchEvent(new Event('visibilitychange'));
          await new Promise(r => setTimeout(r, 300));
        };
      });
      await pW.click('[data-act="toggle-wake"]');
      await pW.waitForTimeout(500);
      const onFirst = await pW.getAttribute('[data-act="toggle-wake"]', 'aria-checked');
      const askedAfterTap = await pW.evaluate(() => window.__asked);
      chk('the switch turns on', onFirst === 'true', String(onFirst));

      await pW.evaluate(() => window.__background());
      chk('answering a text and coming back re-takes the lock',
        (await pW.evaluate(() => window.__asked)) > askedAfterTap,
        askedAfterTap + ' → ' + await pW.evaluate(() => window.__asked));
      chk('and the switch still reads on',
        await pW.getAttribute('[data-act="toggle-wake"]', 'aria-checked') === 'true');

      /* The two silences. An over-eager re-acquire would either overrule the
         reader or keep a phone awake on a screen that is not a recipe. */
      await pW.click('[data-act="toggle-wake"]');
      await pW.waitForTimeout(300);
      const askedAfterOff = await pW.evaluate(() => window.__asked);
      await pW.evaluate(() => window.__background());
      chk('turned off, it stays off through a backgrounding',
        (await pW.evaluate(() => window.__asked)) === askedAfterOff &&
        await pW.getAttribute('[data-act="toggle-wake"]', 'aria-checked') === 'false',
        askedAfterOff + ' → ' + await pW.evaluate(() => window.__asked));

      await pW.click('[data-act="toggle-wake"]');
      await pW.waitForTimeout(400);
      await pW.click('.backlink');
      await pW.waitForSelector('.rcard');
      const askedOnMenu = await pW.evaluate(() => window.__asked);
      await pW.evaluate(() => window.__background());
      chk('and it never wakes a screen that is not a recipe',
        (await pW.evaluate(() => window.__asked)) === askedOnMenu,
        askedOnMenu + ' → ' + await pW.evaluate(() => window.__asked));
    }
    await ctxW.close();
  }

  console.log('\n== Paper carries the size the reader chose (R47) ==');
  {
    /* R24 checked what prints and in what colour, never at what size — and
       the print stylesheet carried `.recipe { font-size: 12pt }`, a rule that
       has never once applied. The renderer sets the reading size as an inline
       style, and inline beats a stylesheet, so paper has always come out at
       whatever the A−/A+ stepper was showing. That turns out to be the right
       behaviour for this reader (DECISIONS §033: when preference and
       legibility collide, legibility wins) — a recipe printed at 12pt for
       someone who chose 40px on screen is a wasted sheet of paper. The rule
       was removed rather than enforced, because a stylesheet that states an
       intent it does not deliver misleads whoever reads it next. */
    const pPaper = await br.newPage();
    await pPaper.goto(B + '/index.html#chicken-cordon-bleu');
    await pPaper.waitForSelector('.recipe');
    const sizes = [];
    for (const step of [0, 4]) {
      await pPaper.evaluate((i) => localStorage.setItem('kt.fsIndex', String(i)), step);
      await pPaper.reload();
      await pPaper.waitForSelector('.recipe');
      await pPaper.emulateMedia({ media: 'print' });
      await pPaper.waitForTimeout(120);
      sizes.push(await pPaper.evaluate(() =>
        parseFloat(getComputedStyle(document.querySelector('.recipe')).fontSize)));
      await pPaper.emulateMedia({ media: 'screen' });
    }
    chk('the smallest step prints small and the largest prints large',
      sizes[0] === 20 && sizes[1] === 40, sizes.join(' → '));
    chk('and nothing on paper is smaller than the screen floor',
      Math.min.apply(null, sizes) >= 20, sizes.join(', '));
    /* The dead rule must not come back, or the next reader believes it. */
    const printCss = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'style.css'), 'utf8');
    const printBlock = printCss.slice(printCss.indexOf('@media print'));
    chk('the print stylesheet no longer claims a size it cannot set',
      !/\.recipe\s*\{[^}]*font-size/.test(printBlock),
      (printBlock.match(/\.recipe\s*\{[^}]*\}/) || [''])[0].slice(0, 60));
    await pPaper.evaluate(() => localStorage.removeItem('kt.fsIndex'));
    await pPaper.close();
  }

  console.log('\n== Easy Read promised plainer and left the italics (R67) ==');
  {
    /* Easy Read raises the ink, forces one column, thickens the borders and
       bolds a few labels. It never touched font-style — and the app has
       three italics, every one of them an explanatory note: "matches
       ingredient" under a search result, "— 450g not adjusted" on a rescaled
       line, and one emphasis in the help. Slanted small print is the exact
       shape of text this reader has the most trouble with, and it is the
       text carrying the explanation. Upright and bold under Easy Read now —
       the same treatment Easy Read already gives .hint and .rcard__meta —
       so the distinction survives without the slant. */
    const SCREENS = [
      ['Menu, searched', '#menu?q=chick', null, '.matchnote'],
      ['Recipe, rescaled', '#chicken-stroganoff', '[data-act="serv+"]', '.keptnote'],
      ['How to use it', '#help', null, 'em']
    ];
    const italicsOn = async (pg) => pg.evaluate(() => {
      const bad = [];
      document.querySelectorAll('#app *').forEach(el => {
        if (getComputedStyle(el).fontStyle === 'italic' && (el.textContent || '').trim()) {
          bad.push((el.className || el.tagName) + ' "' + el.textContent.trim().slice(0, 30) + '"');
        }
      });
      return bad;
    });

    for (const easy of [true, false]) {
      const ctxI = await br.newContext({ ...devices['iPhone 13'] });
      const pI = await ctxI.newPage();
      await pI.addInitScript((on) => {
        if (on) { localStorage.setItem('kt.easyRead', 'true'); localStorage.setItem('kt.fsIndex', '4'); }
      }, easy);
      const found = [];
      const slanted = [];
      for (const [name, hash, extra, sel] of SCREENS) {
        await pI.goto('about:blank');
        await pI.goto(B + '/index.html' + hash);
        await pI.waitForTimeout(600);
        if (extra) { await pI.click(extra, { timeout: 4000 }).catch(() => {}); await pI.waitForTimeout(400); }
        if (await pI.locator(sel).count()) found.push(name);
        (await italicsOn(pI)).forEach(x => slanted.push(name + ': ' + x));
      }
      /* The floor first, and it matters in both directions: if the notes
         never rendered, "no italics" is a pass on an empty page. */
      chk('the three noted screens all drew their note, easy read ' + (easy ? 'on' : 'off'),
        found.length === 3, found.join(', '));
      if (easy) {
        chk('nothing is set in italics under Easy Read',
          slanted.length === 0, slanted.slice(0, 4).join(' | '));
      } else {
        /* The counterpart: without Easy Read the italics are still there, so
           the check above is measuring the setting and not an app that
           simply has no italics in it. */
        chk('and with Easy Read off they are still italic, so the rule is real',
          slanted.length >= 3, slanted.length + ' found');
      }
      await ctxI.close();
    }

    /* Upright is only half of it: the note still has to read as a note. */
    {
      const ctxW = await br.newContext({ ...devices['iPhone 13'] });
      const pW = await ctxW.newPage();
      await pW.addInitScript(() => {
        localStorage.setItem('kt.easyRead', 'true');
        localStorage.setItem('kt.fsIndex', '4');
      });
      await pW.goto(B + '/index.html#chicken-stroganoff');
      await pW.waitForSelector('.r-title');
      await pW.click('[data-act="serv+"]');
      await pW.waitForTimeout(400);
      const w = await pW.evaluate(() => {
        const n = document.querySelector('.keptnote');
        const row = n.closest('.checkrow__text');
        return { note: getComputedStyle(n).fontWeight,
          around: getComputedStyle(row).fontWeight,
          colour: getComputedStyle(n).color,
          rowColour: getComputedStyle(row).color };
      });
      chk('and it still stands apart from the line it sits on',
        w.note !== w.around || w.colour !== w.rowColour, JSON.stringify(w));
      await ctxW.close();
    }
  }

  console.log('\n== The way out of a sheet must stay on screen (R55) ==');
  {
    /* Every sheet has a Done button in its head and a full-screen scrim
       behind it, and both close it. The scrim is the invisible one — a bare
       button with an aria-label and nothing drawn — so Done is the whole of
       what a reader can SEE to get out. And Done scrolls: measured on the
       Filter sheet, 1134px of content in a 544px window, Done sitting 590px
       above the fold once you reach the tags. A reader who scrolls down to
       find "Scottish" has, at that moment, no visible way back out of the
       sheet at all — on a phone with no Escape key, for the reader this app
       is built around. Landscape is the same fault, worse: the sheet is
       320px tall there. */
    const sheets = [
      ['Filter', async (pg) => {
        await pg.goto(B + '/index.html#menu'); await pg.waitForSelector('.rcard');
        await pg.click('[data-act="open-filter"]'); await pg.waitForSelector('#filter-sheet');
      }],
      ['Text size', async (pg) => {
        await pg.goto(B + '/index.html#menu'); await pg.waitForSelector('.rcard');
        await pg.click('[data-act="open-text"]'); await pg.waitForSelector('.sheet');
      }],
      ['Download', async (pg) => {
        await pg.goto(B + '/index.html#chicken-cordon-bleu'); await pg.waitForSelector('.r-title');
        await pg.click('[data-act="open-dl"]'); await pg.waitForSelector('.sheet');
      }],
      ['Recipe picker', async (pg) => {
        await pg.goto(B + '/index.html#plan'); await pg.waitForSelector('.slotadd');
        await pg.locator('.slotadd').first().click(); await pg.waitForSelector('#pick-q');
      }]
    ];
    /* Measured at the bottom of the scroll, which is the only place the
       fault shows. The question is not "is Done pinned" — two shapes are in
       use here and both are fine: a Done in the head (Filter, Text size) and
       a big Cancel at the end of a short sheet (Download). The question is
       whether ANY control that closes this sheet, and that a person can
       actually see, is fully on screen from down there. The scrim closes it
       too and is deliberately excluded: it is drawn as nothing. */
    const wayOut = (pg) => pg.evaluate(() => {
      const s = document.querySelector('.sheet');
      if (!s) return null;
      s.scrollTop = s.scrollHeight;
      return new Promise(res => requestAnimationFrame(() => {
        const vh = window.innerHeight;
        const outs = [...s.querySelectorAll('[data-act]')]
          .filter(el => /^close-/.test(el.getAttribute('data-act')) &&
            !el.classList.contains('scrim'))
          .map(el => {
            const b = el.getBoundingClientRect();
            /* On screen is not the same as reachable. A pinned bar with no
               background and no stacking order sits exactly where this
               measurement wants it while the chips scroll over the top of
               it — so ask the browser what is actually at that point. */
            const hit = document.elementFromPoint(
              Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
            return { text: el.textContent.trim().slice(0, 12),
              top: Math.round(b.top), bottom: Math.round(b.bottom),
              h: Math.round(b.height),
              hit: hit ? (hit === el || el.contains(hit) ? 'self'
                : (hit.className || hit.tagName) + '') : 'nothing',
              onScreen: b.top >= 0 && b.bottom <= vh && b.height >= 44 };
          });
        /* A bar that is pinned over scrolling content has to be opaque, or
           the chips travel visibly through the words. Sticky alone already
           wins the hit test — it is a positioned element — so this is the
           half elementFromPoint cannot see. */
        const head = s.querySelector('.sheet__head');
        const hs = head ? getComputedStyle(head) : null;
        const pinned = !!hs && hs.position === 'sticky';
        const bg = hs ? hs.backgroundColor : '';
        const alpha = /rgba?\(([^)]+)\)/.test(bg)
          ? parseFloat((bg.match(/rgba?\(([^)]+)\)/)[1].split(',')[3] || '1'))
          : (bg && bg !== 'transparent' ? 1 : 0);
        res({ vh, outs, scrolled: s.scrollTop,
          scrollable: s.scrollHeight - s.clientHeight,
          pinned, bg, seeThrough: pinned && !(alpha > 0.99),
          onScreen: outs.some(o => o.onScreen) });
      }));
    });

    for (const [label, size] of [['upright', devices['iPhone 13'].viewport],
      ['on its side', { width: 844, height: 390 }]]) {
      const ctxS = await br.newContext({ ...devices['iPhone 13'], viewport: size });
      const pS = await ctxS.newPage();
      const bad = [];
      const covered = [];
      let scrolledSomething = 0;
      for (const [name, open] of sheets) {
        /* Sheets survive a same-hash goto — that is a same-document
           navigation, so nothing re-renders. Close the last one first. */
        if (await pS.locator('.sheet').count()) {
          await pS.keyboard.press('Escape');
          await pS.waitForTimeout(250);
        }
        await open(pS);
        await pS.waitForTimeout(650);          // let the slide-up settle
        const r = await wayOut(pS);
        if (!r || !r.outs.length) { bad.push(name + ': nothing visible closes it'); continue; }
        if (r.scrolled > 0) scrolledSomething++;
        if (!r.onScreen) bad.push(name + ' ' + label + ': ' +
          r.outs.map(o => '"' + o.text + '" @' + o.top + '-' + o.bottom +
            ' h' + o.h).join(', ') + ' — screen is ' + r.vh);
        else if (!r.outs.some(o => o.onScreen && o.hit === 'self')) {
          covered.push(name + ' ' + label + ': ' +
            r.outs.filter(o => o.onScreen)
              .map(o => '"' + o.text + '" is under ' + o.hit).join(', '));
        }
        if (r.seeThrough) {
          covered.push(name + ' ' + label + ': pinned but see-through (' + r.bg + ')');
        }
      }
      chk('every sheet keeps its way out on screen, ' + label,
        bad.length === 0, bad.join(' | '));
      /* The floor: if nothing actually scrolled, the check above is asking a
         question no sheet was in a position to fail. */
      chk('and nothing scrolls over or through it, ' + label,
        covered.length === 0, covered.join(' | '));
      chk('and at least one sheet really was scrolled, ' + label,
        scrolledSomething > 0, String(scrolledSomething));
      await ctxS.close();
    }

    /* Painted in the right place is not the same as working there. */
    {
      const ctxT = await br.newContext({ ...devices['iPhone 13'] });
      const pT = await ctxT.newPage();
      await sheets[0][1](pT);
      await pT.waitForTimeout(650);
      await pT.evaluate(() => {
        const s = document.querySelector('.sheet');
        s.scrollTop = s.scrollHeight;
      });
      await pT.waitForTimeout(200);
      await pT.locator('.sheet__head .donebtn').click({ timeout: 3000 });
      await pT.waitForTimeout(400);
      chk('and tapping it from down there really does close the sheet',
        await pT.locator('.sheet').count() === 0);
      await ctxT.close();
    }
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
    /* `R76` — the shell list was only ever checked in one direction. `R10`
       proves every file the worker promises to cache exists, because
       `cache.addAll` is all-or-nothing and one missing path leaves NO
       offline support at all. Nothing proved the other way round: that
       everything the app actually reaches for on a cold boot is on the
       list. Add a stylesheet, an icon, a second script — forget the list —
       and the outage test above still passes, because recipes still render;
       the app is just quietly wrong offline, in the typeface or the layout,
       for exactly the reader it was built for. */
    {
      const ctxCold = await br.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
      const pCold = await ctxCold.newPage();
      const asked = new Set();
      pCold.on('request', r => {
        try {
          const u = new URL(r.url());
          if (u.origin === new URL(B).origin) asked.add(u.pathname);
        } catch (e) {}
      });
      await pCold.goto(B + '/index.html');
      await pCold.waitForSelector('.main__title');
      await pCold.waitForTimeout(1200);
      const swSrc2 = fsx.readFileSync(pathx.join(ROOT, 'sw.js'), 'utf8');
      const at2 = swSrc2.indexOf('const SHELL = [');
      const shell = (swSrc2.slice(at2, swSrc2.indexOf('];', at2)).match(/"([^"]+)"/g) || [])
        .map(x => x.replace(/"/g, ''))
        .map(x => (x === './' ? '/index.html' : (x.charAt(0) === '/' ? x : '/' + x)));
      const unlisted = [...asked].filter(x => shell.indexOf(x) === -1);
      chk('everything a cold boot asks for is in the offline shell',
        unlisted.length === 0, unlisted.join(', '));
      /* A floor, or a boot that fetched nothing would read as a clean pass —
         and the reverse rule is deliberately NOT asserted: the manifest is
         on the list and a browser may never ask for it. */
      chk('and the cold boot really was watched', asked.size >= 6,
        [...asked].sort().join(', '));
      await ctxCold.close();
    }

    const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
      '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
      '.woff2': 'font/woff2', '.txt': 'text/plain' };
    /* Turned up for the R19 block: a weak signal, served by the same server
       that serves everything else, so only the book is slow. */
    let slowJsonMs = 0;
    /* Turned up for the R52 block: the deploy that goes wrong (docStatus),
       and the deploy that goes right but ships a different page (docBody).
       Both apply only to the document, which is the one thing the worker
       fetches network-first. */
    let docStatus = 0;
    let docBody = null;
    const MARKER = 'fresh-deploy-marker';
    const handler = (rq, rs) => {
      const rel = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
      const isDoc = rel === '/' || rel.endsWith('/index.html');
      if (isDoc && docStatus) {
        /* Shaped like what a host actually sends: a complete, well-formed
           HTML page that happens to contain no app. */
        rs.writeHead(docStatus, { 'content-type': 'text/html' });
        return rs.end('<!doctype html><html><body><h1>404</h1>' +
          '<p>There isn\'t a GitHub Pages site here.</p></body></html>');
      }
      if (isDoc && docBody) {
        rs.writeHead(200, { 'content-type': 'text/html' });
        return rs.end(docBody);
      }
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
    };
    const srv = http.createServer(handler);
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const PORT = srv.address().port;
    const OWN = 'http://127.0.0.1:' + PORT;

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

    /* R52 — a deploy that goes wrong must not delete the book from the
       phone. Everything above proves the worker keeps the app alive through
       an outage; none of it asks what the worker WRITES when the network
       answers, and the document branch was the one that never checked.
       A failed deploy is not a network failure: the host answers, promptly
       and successfully as far as fetch is concerned, with a well-formed
       page carrying no app. That page went straight over the offline copy,
       and from then on the phone's fallback WAS the apology page — the book
       gone until a good load happened to land, which on a bad signal is
       precisely when it doesn't. */
    console.log('\n== A failed deploy must not delete the book (R52) ==');
    {
      const cachedDoc = () => psw.evaluate(async (marker) => {
        const c = await caches.open('kt-shell-v2');
        const r = await c.match('index.html');
        const t = r ? await r.text() : '';
        return { has: !!r, app: t.indexOf('id="app"') > -1,
          err: /Pages site/.test(t), marker: t.indexOf(marker) > -1 };
      }, MARKER);

      const srv2 = http.createServer(handler);
      await new Promise(r => srv2.listen(PORT, '127.0.0.1', r));

      /* First the ordinary case, so nothing below can pass by the worker
         simply never caching a page again — which is what a too-eager fix
         would do, and it would look identical from the poisoning side. */
      docBody = '<!doctype html><html><body><div id="app"></div><p>' +
        MARKER + '</p></body></html>';
      await psw.goto(OWN + '/index.html', { waitUntil: 'load' });
      await psw.waitForTimeout(500);
      chk('a good page is still written to the offline copy',
        (await cachedDoc()).marker, JSON.stringify(await cachedDoc()));

      /* Back to the real app, and cached again, so the outage below is
         measured against the book rather than against that marker. */
      docBody = null;
      await psw.goto(OWN + '/index.html');
      await psw.waitForSelector('.main__title');
      await psw.waitForTimeout(500);
      chk('and the real app is what the offline copy holds again',
        (await cachedDoc()).app);

      /* Now the deploy that goes wrong, with the reader opening the app in
         the middle of it. */
      docStatus = 404;
      await psw.goto(OWN + '/index.html', { waitUntil: 'load' });
      const shown = await psw.evaluate(() => document.body.textContent || '');
      chk('during a bad deploy the reader sees what the server actually said',
        /Pages site/.test(shown), shown.slice(0, 80));
      const after = await cachedDoc();
      chk('the offline copy survives it', after.has && !after.err, JSON.stringify(after));
      chk('and it is still the app', after.app, JSON.stringify(after));

      /* The proof that matters. The signal goes — the ordinary kitchen, not
         a laboratory — and the book is still on the phone. */
      await new Promise(r => srv2.close(r));
      docStatus = 0;
      await psw.reload();
      /* Caught rather than awaited bare: when this regresses the phone shows
         the apology page, and a suite that dies on the timeout hides every
         check after it. The failure belongs on one line, like the rest. */
      let opened = '';
      try {
        await psw.waitForSelector('.main__title', { timeout: 15000 });
        opened = await psw.locator('#main-content').textContent();
      } catch (e) {
        opened = 'DID NOT OPEN :: ' + (await psw.evaluate(
          () => (document.body.textContent || '').trim().slice(0, 60)));
      }
      chk('offline after a failed deploy, the book still opens',
        opened.length > 40 && opened.indexOf('DID NOT OPEN') !== 0, opened.slice(0, 90));
    }

    /* And the rule, so the NEXT branch someone adds to sw.js inherits it
       rather than repeating the same omission: no cache write without a
       status check first. The count floor stops this passing vacuously if
       the writes are ever renamed out from under it. */
    {
      const swSrc = fsx.readFileSync(pathx.join(ROOT, 'sw.js'), 'utf8');
      const guarded = [];
      let at = -1;
      while ((at = swSrc.indexOf('.put(', at + 1)) > -1) {
        guarded.push(/res\s*&&\s*res\.ok/.test(swSrc.slice(Math.max(0, at - 300), at)));
      }
      chk('every cache write in sw.js is guarded by a status check',
        guarded.length >= 3 && guarded.every(Boolean),
        JSON.stringify(guarded));
    }
    await ctxSW.close();
  }

  console.log('\n== R85 — the danger colour belongs to the destructive mode only ==');
  {
    /* The Menu has two modes behind two buttons sitting side by side in the
       same row: **Tag**, which adds a word to a recipe, and **Remove**,
       which deletes it. Tag mode was drawn in Remove mode's clothes — the
       rows carry `.rrow`, whose own comment reads "Remove mode swaps every
       card for a danger-outlined row", and the Done button carried
       `.textbtn--removing`, a danger fill. So the harmless mode and the
       irreversible one looked the same, and the only thing telling them
       apart was one sentence of grey text.
       Two things are wrong with that and the second is the serious one:
       a danger colour that also means "you are adding tags" stops meaning
       careful, and someone who believes they are tagging is one tap away
       from removing. The check is that the two modes do not look alike, and
       that the danger colour appears only in the destructive one. */
    const modeLook = async (act) => {
      await p.goto('about:blank');
      await p.goto(B + '/index.html#menu');
      await p.waitForSelector('.rcard');
      await p.click('[data-act="' + act + '"]');
      await p.waitForTimeout(350);
      return p.evaluate(() => {
        const norm = (c) => { const d = document.createElement('span');
          d.style.color = c; document.body.appendChild(d);
          const v = getComputedStyle(d).color; d.remove(); return v; };
        const danger = norm(getComputedStyle(document.documentElement)
          .getPropertyValue('--danger').trim());
        const uses = [];
        [].slice.call(document.querySelectorAll('#app *')).forEach(el => {
          const cs = getComputedStyle(el);
          const hit = [];
          if (cs.backgroundColor === danger) hit.push('fill');
          if ([cs.borderTopColor, cs.borderLeftColor].indexOf(danger) > -1 &&
              parseFloat(cs.borderTopWidth) > 0) hit.push('border');
          if (cs.color === danger) hit.push('ink');
          if (hit.length) uses.push((typeof el.className === 'string'
            ? el.className.split(/\s+/)[0] : el.tagName) + ':' + hit.join('+'));
        });
        const row = document.querySelector('.rrow, .cardgrid > button');
        const rs = row ? getComputedStyle(row) : null;
        return { danger: uses.slice(0, 6), dangerCount: uses.length,
                 rowBorder: rs ? rs.borderTopColor : '',
                 rows: document.querySelectorAll('.cardgrid > button').length };
      });
    };
    const tag = await modeLook('toggle-tagging');
    const rem = await modeLook('toggle-remove');
    chk('both modes drew their list', tag.rows > 5 && rem.rows > 5,
      JSON.stringify([tag.rows, rem.rows]));
    chk('remove mode still says danger', rem.dangerCount > 0, JSON.stringify(rem.danger));
    chk('tag mode does not borrow it', tag.dangerCount === 0, JSON.stringify(tag.danger));
    chk('and the two modes cannot be mistaken for each other',
      tag.rowBorder !== rem.rowBorder, tag.rowBorder + ' vs ' + rem.rowBorder);
  }

  console.log('\n== R83 — the accent fill marks the action you came for ==');
  {
    /* One colour carries one meaning in this app: an accent fill is the
       thing you opened the screen to press. Every sheet's head or foot
       carries one — and in three of them the word on it was **Cancel**.
       The recipe picker is the clearest: "Dinner · Monday 17", a list of
       48 recipes, and the brightest control on the sheet says don't. For a
       reader with low vision, who goes to the biggest highest-contrast
       target, the app was pointing at the exit.
       "Done" wearing it is right — that is finishing the task. "Cancel"
       wearing it is the same pixels meaning the opposite thing.
       The rule is about the word, so the check reads the word. */
    const NEGATION = /^(cancel|never mind|discard|not now|forget it)$/i;
    const sheets = [
      ['Filter', async () => {
        await p.goto(B + '/index.html#menu'); await p.waitForSelector('.rcard');
        await p.click('[data-act="open-filter"]'); await p.waitForSelector('#filter-sheet');
      }],
      ['Text size', async () => {
        await p.goto(B + '/index.html#menu'); await p.waitForSelector('.rcard');
        await p.click('[data-act="open-text"]'); await p.waitForSelector('.sheet');
      }],
      ['Download', async () => {
        await p.goto(B + '/index.html#chicken-cordon-bleu'); await p.waitForSelector('.r-title');
        await p.click('[data-act="open-dl"]'); await p.waitForSelector('.sheet');
      }],
      ['Recipe picker', async () => {
        await p.goto(B + '/index.html#plan'); await p.waitForSelector('.slotadd');
        await p.locator('.slotadd').first().click(); await p.waitForSelector('#pick-q');
      }],
      ['Bulk tag', async () => {
        await p.goto(B + '/index.html#menu'); await p.waitForSelector('.rcard');
        await p.click('[data-act="toggle-tagging"]');
        await p.locator('.rrow, .rcard').first().click();
        await p.click('[data-act="open-bulk"]'); await p.waitForSelector('.sheet');
      }]
    ];
    const shouting = [];
    const tooSmall = [];
    let opened = 0;
    for (const [name, open] of sheets) {
      await p.goto('about:blank');
      let ok = true;
      try { await open(); await p.waitForTimeout(450); } catch (e) { ok = false; }
      if (!ok) { shouting.push(name + ': never opened'); continue; }
      opened++;
      const found = await p.evaluate(() => {
        const acc = getComputedStyle(document.documentElement)
          .getPropertyValue('--acc').trim();
        const norm = (c) => {
          const d = document.createElement('span');
          d.style.color = c; document.body.appendChild(d);
          const v = getComputedStyle(d).color; d.remove(); return v;
        };
        const accRGB = norm(acc);
        const sheet = document.querySelector('.sheet');
        if (!sheet) return null;
        return [].slice.call(sheet.querySelectorAll('button, a')).map(el => {
          const cs = getComputedStyle(el);
          const b = el.getBoundingClientRect();
          return { label: (el.textContent || '').trim(),
                   accent: cs.backgroundColor === accRGB,
                   h: Math.round(b.height), w: Math.round(b.width) };
        });
      });
      if (!found) { shouting.push(name + ': no sheet'); continue; }
      found.filter(f => f.accent && NEGATION.test(f.label))
        .forEach(f => shouting.push(name + ': "' + f.label + '" wears the accent fill'));
      /* The fix must not be to shrink or hide the way out — R55 settled
         that a visible exit is not optional. */
      found.filter(f => NEGATION.test(f.label) && (f.h < 44 || f.w < 44))
        .forEach(f => tooSmall.push(name + ': "' + f.label + '" ' + f.w + 'x' + f.h));
    }
    chk('every sheet opened for the sweep', opened === sheets.length, String(opened));
    chk('no sheet gives the accent fill to a control that abandons the task',
      shouting.length === 0, shouting.join('; '));
    chk('and the way out is still a full-size target everywhere',
      tooSmall.length === 0, tooSmall.join('; '));
  }

  console.log('\n== R80 — the sort menu keeps the app\'s own focus contract ==');
  {
    /* Every sheet in this app traps Tab, closes on Escape and hands focus
       back to the control that opened it — that contract is written down in
       CLAUDE.md and enforced by `openSheet`/`closeSheet`. The sort menu was
       built as "a popup, not a sheet" (no scrim, dismisses on an outside
       tap), and it took none of it: opening left focus on <body>, Tab
       walked straight out of an open `role="menu"` into the page behind,
       and closing dropped the caret at the top of the document because the
       re-render destroyed the element focus was on.
       For a VoiceOver reader that means activating "Sort" announces
       nothing and leaves the cursor where it was. The popup styling is
       fine; the focus contract is not optional. */
    const state = () => p.evaluate(() => {
      const menu = document.querySelector('.sortmenu');
      const a = document.activeElement;
      return {
        open: !!menu,
        inMenu: !!(menu && a && menu.contains(a)),
        onTrigger: !!(a && a.getAttribute && a.getAttribute('data-act') === 'toggle-sort'),
        checked: !!(a && a.getAttribute && a.getAttribute('aria-checked') === 'true'),
        active: a ? (a.tagName + (a.getAttribute && a.getAttribute('data-act')
          ? '[' + a.getAttribute('data-act') + ']' : '')) : 'none'
      };
    });
    await p.goto('about:blank');
    await p.goto(B + '/index.html#menu');
    await p.waitForSelector('.rcard');

    await p.click('[data-act="toggle-sort"]');
    await p.waitForTimeout(300);
    let st = await state();
    chk('opening the sort menu moves focus into it', st.open && st.inMenu, JSON.stringify(st));
    chk('and onto the option that is currently chosen', st.checked, JSON.stringify(st));

    for (let i = 0; i < 5; i++) await p.keyboard.press('Tab');
    st = await state();
    chk('Tab stays inside the open menu', st.open && st.inMenu, JSON.stringify(st));

    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    st = await state();
    chk('Escape closes it and hands focus back to the Sort button',
      !st.open && st.onTrigger, JSON.stringify(st));

    /* And the path people actually take: choose a sort. */
    await p.click('[data-act="toggle-sort"]');
    await p.waitForTimeout(300);
    await p.click('[data-act="sort"][data-key="az"]');
    await p.waitForTimeout(350);
    st = await state();
    chk('choosing a sort closes it and hands focus back too',
      !st.open && st.onTrigger, JSON.stringify(st));
    chk('and the sort actually changed',
      /A – Z|A - Z|A–Z/.test(await p.locator('[data-act="toggle-sort"]').textContent()),
      await p.locator('[data-act="toggle-sort"]').textContent());

    /* An outside tap stays a plain outside tap: it dismisses, and it does
       NOT drag focus back to the Sort button, because the tap usually
       landed on something the reader meant to use. */
    await p.click('[data-act="toggle-sort"]');
    await p.waitForTimeout(300);
    await p.locator('.mhead__h1').click();
    await p.waitForTimeout(300);
    st = await state();
    chk('an outside tap dismisses without stealing focus back',
      !st.open && !st.onTrigger, JSON.stringify(st));
  }

  console.log('\n== R78 — a number field can show its own number ==');
  {
    /* Found by looking at a screenshot of edit mode. The Serves box between
       the − and + buttons measured 41px, of which 32px was `.input`'s side
       padding and 4px its border: five pixels of window for a fifteen-pixel
       digit. The number being edited was a sliver.
       Three fields share that row, and `flex: 1 1 120px` crushed the one
       whose field also has to carry two 48px buttons. It clipped at every
       font step; only Easy Read's wrap to one column saved it, and Easy
       Read is the mode most readers never turn on.
       The criterion is deliberately not about servings: a number input must
       be able to show the largest value it will accept. Narrower than that
       is a field you cannot read while you type into it. */
    const steps = [['default step', null], ['top step', '4']];
    const forms = [
      ['Edit mode', '#chicken-cordon-bleu', '.r-title', '[data-act="toggle-edit"]'],
      ['Add review', '#add', '.pathbtn', '[data-key="review"]']
    ];
    /* Seed, then load. Both halves matter: a draft survives in
       sessionStorage and #add resumes it rather than showing the path
       picker, and a goto that only changes the hash is a same-document
       navigation — the app keeps the step it booted with, so a storage
       write followed by a hash goto measures the PREVIOUS iteration's
       size. The blank page in between forces the real load. */
    const openForm = async (hash, ready, open, fsIndex) => {
      await p.goto(B + '/index.html');
      await p.evaluate((v) => {
        if (v === null) localStorage.removeItem('kt.fsIndex');
        else localStorage.setItem('kt.fsIndex', v);
        sessionStorage.removeItem('kt.addDraft');
      }, fsIndex);
      await p.goto('about:blank');
      await p.goto(B + '/index.html' + hash);
      await p.waitForSelector(ready);
      await p.click(open);
    };
    for (const [stepName, fsIndex] of steps) {
      for (const [where, hash, ready, open] of forms) {
        await openForm(hash, ready, open, fsIndex);
        const label = where + ' at the ' + stepName;
        let nums = [];
        /* Caught, not awaited bare: if the form stops rendering, that is one
           FAIL line, not a dead suite. */
        try {
          await p.waitForSelector('input[type="number"]', { timeout: 8000 });
          nums = await p.evaluate(() => {
            const cvs = document.createElement('canvas').getContext('2d');
            return [].slice.call(document.querySelectorAll('input[type="number"]')).map(el => {
              const cs = getComputedStyle(el);
              cvs.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
              const room = el.clientWidth
                - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
              const widest = el.getAttribute('max') || el.value || '';
              return { id: el.id || el.name || '(unnamed)', widest,
                       room: Math.round(room),
                       need: Math.round(cvs.measureText(widest).width) };
            });
          });
        } catch (e) { nums = []; }
        chk(label + ': there is a number field to measure', nums.length > 0);
        const tight = nums.filter(n => n.room < n.need);
        chk(label + ': every number field can show its largest value',
          tight.length === 0,
          tight.map(n => n.id + ' "' + n.widest + '" needs ' + n.need
                         + 'px, has ' + n.room).join('; '));
      }
    }
    /* The root cause, asserted directly rather than through its symptom.
       Edit mode puts the stepper's px on `.recipe`; the review form never
       carried it, so its inputs were 0.85em of body 16px — 13.6px at the
       top step as readily as at the bottom. The two forms are the same
       field set and they have to be the same size. */
    for (const [stepName, fsIndex] of steps) {
      const sizes = {};
      for (const [where, hash, ready, open, probe] of [
        ['edit', '#chicken-cordon-bleu', '.r-title', '[data-act="toggle-edit"]', '#e-title'],
        ['add', '#add', '.pathbtn', '[data-key="review"]', '#a-title']
      ]) {
        await openForm(hash, ready, open, fsIndex);
        try {
          await p.waitForSelector(probe, { timeout: 8000 });
          sizes[where] = await p.evaluate(
            (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize),
            probe);
        } catch (e) { sizes[where] = -1; }
      }
      chk('the review form is the same size as edit mode at the ' + stepName,
        sizes.add > 0 && Math.abs(sizes.add - sizes.edit) < 0.5,
        'edit ' + sizes.edit + 'px vs add ' + sizes.add + 'px');
    }
    /* A floor, so the pair above cannot pass by both being wrong: the top
       step really is bigger than the default. */
    {
      const seen = [];
      for (const v of ['0', '4']) {
        await openForm('#add', '.pathbtn', '[data-key="review"]', v);
        await p.waitForSelector('#a-title');
        seen.push(await p.evaluate(
          () => parseFloat(getComputedStyle(document.getElementById('a-title')).fontSize)));
      }
      chk('and the review form actually moves when the step does',
        seen[1] > seen[0] * 1.5, seen.join(' -> '));
    }
    await p.goto(B + '/index.html');
    await p.evaluate(() => localStorage.removeItem('kt.fsIndex'));
  }

  chk('no JS errors', errs.length===0, errs.join(' | '));
  await br.close();
  console.log('\n'+'='.repeat(50)+'\nPASS: '+pass+'   FAIL: '+fail+'\n'+'='.repeat(50));
  process.exit(fail?1:0);
})();
