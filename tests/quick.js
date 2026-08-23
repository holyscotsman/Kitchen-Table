const { chromium, devices } = require('playwright');
const { freshContext } = require('./ctx');
const B = process.env.KT_BASE || 'http://127.0.0.1:8899';
let pass=0,fail=0;
const chk=(n,c,e='')=>c?(pass++,console.log('  PASS '+n)):(fail++,console.log('  FAIL '+n+(e?' :: '+e:'')));
(async()=>{
  const br=await chromium.launch(process.env.KT_CHROMIUM ? { executablePath: process.env.KT_CHROMIUM } : {});
  const ctx=await freshContext(br, {...devices['iPhone 13']});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('dialog',d=>d.accept());

  console.log('\n== The app must still parse on the phone it was built for (R164) ==');
  {
    /* `R29` named this failure mode and built the net for it, in its own
       words: "if app.js itself never runs — truncated by a bad deploy, or
       using syntax an older iPhone cannot parse — there is no catch and no
       render, and the page reads 'Loading recipes…' for ever. On the phone
       this book was built for, that looks like a broken phone rather than a
       broken deploy, and there is nothing to do about it."

       It built the last-resort message. Nothing ever kept the app off the
       wire. `app.js` is ~7,000 lines of strictly ES5 syntax — no arrow
       functions, no const/let, no template literals, no spread, no optional
       chaining, no classes — which at that length is a discipline rather
       than an accident, and one keystroke from being broken by a round that
       would pass every browser anybody tests with.

       SYNTAX, not library. A method the engine lacks (`padStart`, which
       this file does use) throws on one line and the rest of the app still
       runs; a syntax error kills the whole file before a single statement
       executes, which is precisely the blank screen `R29` is about. */
    const acorn = require('acorn');
    const fsA = require('fs');
    const pathA = require('path');
    const root = pathA.join(__dirname, '..');
    const es5 = (src) => {
      try { acorn.parse(src, { ecmaVersion: 5 }); return ''; }
      catch (e) { return e.message; }
    };

    /* THE FLOOR, first, because everything below is vacuous without it: the
       parser has to actually be refusing newer syntax. A wrong ecmaVersion
       would make every check here pass on anything. */
    chk('the parser really does refuse post-ES5 syntax',
      es5('const x = () => 1;') !== '' && es5('var x = 1;') === '',
      es5('const x = () => 1;') || '(accepted ES6!)');

    chk('app.js parses as ES5', es5(fsA.readFileSync(pathA.join(root, 'app.js'), 'utf8')) === '',
      es5(fsA.readFileSync(pathA.join(root, 'app.js'), 'utf8')));

    /* The two inline scripts in index.html are the pre-paint theme and
       `R29`'s own last-resort message — the code that has to run when
       everything else has failed. A net written in syntax the engine cannot
       parse is not a net.

       Read out of the DOM rather than out of the file with a regex. The
       first version matched `<script…>…</script>` by hand and CodeQL flagged
       it high severity (`js/bad-tag-filter`) within minutes of the push —
       correctly, and the security label is the least of it: a hand-rolled
       tag matcher that misses a script makes THIS CHECK pass on a file it
       never read, which is the exact fault this round exists to stop. The
       browser is a real HTML parser and is already open. */
    await p.goto(B + '/index.html');
    await p.waitForSelector('.main__title');
    const inline = await p.evaluate(() =>
      [].slice.call(document.querySelectorAll('script:not([src])'))
        .map(function (el) { return el.textContent; }));
    chk('index.html really has inline scripts to check', inline.length >= 2,
      String(inline.length));
    const badInline = inline.map(es5).filter(Boolean);
    chk('every inline script in index.html parses as ES5, R29\'s net included',
      badInline.length === 0, badInline.join(' | '));

    /* sw.js is exempt BY NAME AND REASON, and the exemption is held to being
       real: a service worker only exists in an engine that already has ES6,
       so it may use it — and if it ever stopped, this exemption would be
       carrying nothing and should go (`R149`'s rule about an exemption
       outliving what earned it). */
    chk('sw.js is the one exemption, and it still needs to be one',
      es5(fsA.readFileSync(pathA.join(root, 'sw.js'), 'utf8')) !== '');
  }

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
  const d=await freshContext(br, {viewport:{width:1280,height:900}});
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

  console.log('\n== recipes.json has to be written the way every writer writes it (R74) ==');
  {
    /* Three things write this file: the app's download, `db/export.js` on the
       nightly sync, and a person with an editor. They all produce
       `JSON.stringify(list, null, 2)` plus a newline, in `FIELD_ORDER`. A
       hand-edit with different indentation, or with the keys shuffled, still
       parses to the same recipes — and then the very next write reformats
       every line of a 71KB file.
       `db/export.js --check` compares CONTENT, not bytes — it parses both
       sides first — so a reformatted file does not by itself make the
       nightly sync think anything drifted. The cost lands later and lands
       hard: the moment a recipe genuinely does change, the write is
       canonical, so **one changed line arrives as a 71KB diff** with the
       real change buried in it. The same is true of the app's download,
       which is the file a family member sends to be committed. So the
       format is a contract, and this is where it is written down. */
    const fsx = require('fs');
    const pathx = require('path');
    const ROOT = pathx.join(__dirname, '..');
    const rawFile = fsx.readFileSync(pathx.join(ROOT, 'recipes.json'), 'utf8');
    const book = JSON.parse(rawFile);

    chk('the book parses and holds recipes', Array.isArray(book) && book.length >= 40,
      String(book.length));
    chk('and is byte-identical to the way every writer writes it',
      JSON.stringify(book, null, 2) + '\n' === rawFile,
      'on disk ' + rawFile.length + ' bytes, rewritten ' +
      (JSON.stringify(book, null, 2) + '\n').length);
    chk('with no byte-order mark to confuse a parser',
      rawFile.charCodeAt(0) !== 0xFEFF);

    /* Key order is not preserved by a reformat, so it needs saying on its
       own: both writers emit FIELD_ORDER, and a shuffled file would be
       rewritten wholesale the first time either of them ran. */
    const appSrc = fsx.readFileSync(pathx.join(ROOT, 'app.js'), 'utf8');
    const at = appSrc.indexOf('var FIELD_ORDER');
    const order = (appSrc.slice(appSrc.indexOf('[', at), appSrc.indexOf('];', at))
      .match(/"([a-zA-Z]+)"/g) || []).map(x => x.replace(/"/g, ''));
    chk('FIELD_ORDER was found to compare against', order.length >= 12,
      JSON.stringify(order));
    const outOfOrder = book.filter(r => {
      const keys = Object.keys(r);
      const expect = order.filter(k => Object.prototype.hasOwnProperty.call(r, k));
      return JSON.stringify(keys) !== JSON.stringify(expect);
    }).map(r => r.id);
    chk('every recipe keeps its fields in that order',
      outOfOrder.length === 0, outOfOrder.slice(0, 4).join(', '));
    const strays = [...new Set(book.reduce((a, r) =>
      a.concat(Object.keys(r).filter(k => order.indexOf(k) === -1)), []))];
    chk('and carries no field the writers would drop on the way out',
      strays.length === 0, strays.join(', '));
  }

  console.log('\n== The known-wrong-data ledger, checked against the data (R69) ==');
  {
    /* CONTENT.md is the ledger of what is known to be wrong in the book, and
       `013` made it load-bearing: nothing on it may be resolved by inference,
       only by asking Joan. That cuts both ways. The moment a recipe is fixed
       and the ledger is not updated in the same breath, the ledger starts
       lying about what is still outstanding — and the tasks that depend on
       it (`072` recovering the missing ingredients, `074` confirming the
       guessed servings) are working from a list that no longer describes the
       book. Its counts and its named recipes are checkable, so they are. */
    const fsx = require('fs');
    const pathx = require('path');
    const ROOT = pathx.join(__dirname, '..');
    const md = fsx.readFileSync(pathx.join(ROOT, 'CONTENT.md'), 'utf8');
    const book = JSON.parse(fsx.readFileSync(pathx.join(ROOT, 'recipes.json'), 'utf8'));
    const ids = new Set(book.map(r => r.id));
    /* Backticks in this file hold task numbers and commit hashes as well as
       recipe ids; only the ones the book actually knows are ids. */
    const idsIn = (chunk) => [...new Set((chunk.match(/`([a-z0-9-]+)`/g) || [])
      .map(x => x.replace(/`/g, '')).filter(x => ids.has(x)))].sort();
    const between = (a, b) => {
      const i = md.indexOf(a);
      if (i < 0) return '';
      const j = b ? md.indexOf(b, i) : -1;
      return md.slice(i, j < 0 ? undefined : j);
    };

    chk('the ledger and the book agree on how many recipes there are',
      new RegExp('of ' + book.length + ' recipes').test(md), String(book.length));

    /* `R170` — the same rule one document over. CLAUDE.md said "Nothing ships
       pre-tagged" from the day tags were designed, and it stopped being true
       on 2026-08-02 when the research pass tagged 37 of the 48. Three weeks
       of a present-tense claim about the shipped file that the shipped file
       contradicted — in the document whose first line is "read this file
       before writing any code". `R170`'s own argument turns on which way
       round it is, so the number is bound to the book rather than typed once
       and left.

       Scoped to the tags bullet itself rather than to the whole file, and
       that is load-bearing: the round's own write-up further down QUOTES the
       sentence it corrected, which is what a record is for, so a
       document-wide match fails on the fix. `R149` met this once and split
       CLAUDE.md at `## Build state`; that split does not help here, because
       this bullet lives below it. The sentence a reader is told is the
       sentence to check — `R145`'s rule. Whitespace-tolerant, because the
       file wraps mid-phrase (`R151`). */
    const taggedN = book.filter(r => Array.isArray(r.tags) && r.tags.length).length;
    const claudeMd = fsx.readFileSync(pathx.join(ROOT, 'CLAUDE.md'), 'utf8');
    const tagBullet = (claudeMd.match(/\n- \*\*Tags\*\*,[\s\S]*?(?=\n- \*\*)/) || [''])[0];
    chk('(floor) the book really is tagged, and the tags bullet was found',
      taggedN > 0 && tagBullet.length > 40, taggedN + ' :: ' + tagBullet.length);
    chk('CLAUDE.md’s tags bullet no longer says the book ships untagged',
      !/[Nn]othing ships pre-tagged/.test(tagBullet), tagBullet.slice(0, 160));
    chk('and the count it gives is the book’s own',
      new RegExp('tagged\\s+\\*\\*' + taggedN + ' of the ' + book.length + '\\*\\*').test(tagBullet),
      taggedN + ' of ' + book.length + ' :: ' + tagBullet.slice(0, 200));

    /* §2 — the recipes with nothing to cook from. Named, and counted. */
    const sec2 = between('## 2. Empty ingredient lists', '## 3.');
    const claimedEmpty = idsIn(sec2);
    const actuallyEmpty = book
      .filter(r => !(r.ingredients || []).some(x => String(x).trim()))
      .map(r => r.id).sort();
    chk('the recipes with no ingredients are exactly the ones the ledger names',
      JSON.stringify(claimedEmpty) === JSON.stringify(actuallyEmpty),
      'ledger ' + JSON.stringify(claimedEmpty) + ' vs book ' + JSON.stringify(actuallyEmpty));
    const head2 = sec2.match(/—\s*(\d+)\s*recipes?/);
    chk('and its heading counts them right',
      !!head2 && parseInt(head2[1], 10) === actuallyEmpty.length,
      (head2 ? head2[1] : 'no count') + ' vs ' + actuallyEmpty.length);

    /* §1 — the guessed servings. The claim is about provenance, which the
       book cannot confirm; what it can confirm is that the list is the
       length it says and names recipes that exist. */
    const sec1 = between('## 1. Inferred servings', '## 2.');
    const inferred = idsIn(sec1);
    const head1 = sec1.match(/—\s*(\d+)\s*of\s*(\d+)/);
    chk('the guessed-servings list is as long as its heading claims',
      !!head1 && parseInt(head1[1], 10) === inferred.length,
      (head1 ? head1[1] : 'no count') + ' claimed, ' + inferred.length + ' listed');
    chk('and every recipe it names is still in the book',
      inferred.length > 0 && inferred.every(i => ids.has(i)), String(inferred.length));

    /* §6 — the two collection-wide claims, both of which stop being true the
       day someone acts on them, which is exactly when they must be edited. */
    const contributors = [...new Set(book.map(r => r.contributor))];
    chk('"every recipe is Joan’s" is still true, or the ledger must say otherwise',
      /Every recipe is Joan/.test(md) === (contributors.length === 1 && contributors[0] === 'Joan'),
      JSON.stringify(contributors));
    const withPhotos = book.filter(r => r.image).map(r => r.id);
    chk('"no recipe has a photo" is still true, or the ledger must say otherwise',
      /No recipe has a photo/.test(md) === (withPhotos.length === 0),
      JSON.stringify(withPhotos.slice(0, 4)));
  }

  console.log('\n== The book’s vocabulary, copied into a dozen files (R68) ==');
  {
    /* Ten courses and six contributors are the book's whole vocabulary, and
       they are written out in four code files and several documents. Nothing
       checked they agree, and one had already drifted: **Jessica** was added
       to the app's contributor list and to a test, and README, CLAUDE.md,
       CONTENT.md and the gameplan all still said five names. A course list
       that drifts is worse — the app rewrites an unrecognised course to
       Dinner, the server rejects the accept outright, and db/migrate dies on
       the file — so the same recipe would be filed, refused and fatal
       depending on which copy was consulted. */
    const fsx = require('fs');
    const pathx = require('path');
    const ROOT = pathx.join(__dirname, '..');
    const read = (f) => fsx.readFileSync(pathx.join(ROOT, f), 'utf8');
    const listAfter = (src, marker) => {
      const at = src.indexOf(marker);
      if (at < 0) return null;
      const open = src.indexOf('[', at);
      const close = src.indexOf('];', open);
      if (open < 0 || close < 0) return null;
      return (src.slice(open, close).match(/['"]([A-Za-z-]+)['"]/g) || [])
        .map(x => x.replace(/['"]/g, ''));
    };

    const cats = {
      'app.js': listAfter(read('app.js'), 'var CATS = ['),
      'backend/lib/validate.js': listAfter(read('backend/lib/validate.js'), 'const CATS = ['),
      'db/migrate.js': listAfter(read('db/migrate.js'), 'const CATS = ['),
      'tests/video.js': listAfter(read('tests/video.js'), 'const CATS_OK = [')
    };
    const truth = cats['app.js'];
    chk('the app names ten courses', truth && truth.length === 10,
      JSON.stringify(truth));
    const catDrift = Object.keys(cats).filter(f =>
      JSON.stringify(cats[f]) !== JSON.stringify(truth));
    chk('and every copy of that list agrees, in order',
      catDrift.length === 0,
      catDrift.map(f => f + ': ' + JSON.stringify(cats[f])).join(' | '));

    const who = listAfter(read('app.js'), 'var WHO = [');
    chk('the app names its contributors', who && who.length >= 5, JSON.stringify(who));

    /* The documents state the same two lists as schema, in their own
       punctuation. They are read back rather than trusted. */
    const readme = read('README.md');
    const pipe = (key) => {
      const m = readme.match(new RegExp('"' + key + '":\\s*"([^"]+)"'));
      return m ? m[1].split('|').map(x => x.trim()) : null;
    };
    chk('the README schema lists the same courses',
      JSON.stringify(pipe('category')) === JSON.stringify(truth),
      JSON.stringify(pipe('category')));
    chk('and the same contributors',
      JSON.stringify(pipe('contributor')) === JSON.stringify(who),
      JSON.stringify(pipe('contributor')));

    /* CLAUDE.md states the contributors in a sentence — checked by name, so
       the sentence may be rewritten but nobody can be left out of it. */
    const claude = read('CLAUDE.md');
    const unnamed = (who || []).filter(n =>
      !new RegExp('\\b' + n + '\\b').test(claude));
    chk('and CLAUDE.md names every one of them',
      unnamed.length === 0, unnamed.join(', '));
  }

  console.log('\n== One recipe shape, written down in three places (R66) ==');
  {
    /* A recipe's field list exists three times: `FIELD_ORDER` in app.js (what
       the download writes), `FIELD_ORDER` in db/export.js (what the database
       writes back), and the column list in db/migrate.js (what the database
       stores). Nothing checked that they agree, and the cost of them drifting
       is silent and permanent: a field the app can write but the exporter
       doesn't know about survives on one phone and is gone the moment the
       nightly sync regenerates the file. Same shape as `R64`'s two parsers
       for one job, one layer down.
       `R65` is why this is worth pinning now: it added three fields to a form,
       and if any of them had been missing from FIELD_ORDER the download would
       have dropped them without a word. */
    const fsx = require('fs');
    const pathx = require('path');
    const ROOT = pathx.join(__dirname, '..');
    const listIn = (file, marker) => {
      const src = fsx.readFileSync(pathx.join(ROOT, file), 'utf8');
      const at = src.indexOf(marker);
      if (at < 0) return null;
      const open = src.indexOf('[', at);
      const close = src.indexOf('];', open);
      if (open < 0 || close < 0) return null;
      return (src.slice(open, close).match(/['"]([a-zA-Z]+)['"]/g) || [])
        .map(x => x.replace(/['"]/g, ''));
    };
    const appOrder = listIn('app.js', 'var FIELD_ORDER');
    const dbOrder = listIn('db/export.js', 'const FIELD_ORDER');
    chk('both field orders were found', !!appOrder && !!dbOrder && appOrder.length >= 12,
      JSON.stringify({ app: appOrder && appOrder.length, db: dbOrder && dbOrder.length }));
    chk('the app and the exporter agree on the recipe shape, in order',
      JSON.stringify(appOrder) === JSON.stringify(dbOrder),
      JSON.stringify(appOrder) + ' vs ' + JSON.stringify(dbOrder));

    /* And the database stores every one of them. Tags and id are handled
       apart from the column list on purpose — tags are their own table, and
       the id is the key — so they are named here rather than assumed. */
    const migrate = fsx.readFileSync(pathx.join(ROOT, 'db', 'migrate.js'), 'utf8');
    const snake = (k) => k.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
    const unstored = (appOrder || []).filter(k => {
      if (k === 'id' || k === 'tags' || k === 'contributor') return false;
      return migrate.indexOf(snake(k)) === -1;
    });
    chk('and the database stores every field the app writes',
      unstored.length === 0, unstored.join(', '));

    /* The half that catches tomorrow's field: anything a form can write has
       to be in the list, or the download drops it silently. */
    const pS = await ctx.newPage();
    const writes = new Set();
    await pS.goto(B + '/index.html#add');
    await pS.evaluate(() => sessionStorage.clear());
    await pS.reload();
    await pS.waitForSelector('.pathbtn');
    await pS.click('[data-key="review"]');
    await pS.waitForSelector('#a-title');
    (await pS.evaluate(() => [...document.querySelectorAll('[data-k]')]
      .map(e => e.getAttribute('data-k')))).forEach(k => writes.add(k));
    await pS.goto(B + '/index.html#chicken-cordon-bleu');
    await pS.waitForSelector('.r-title');
    await pS.click('[data-act="toggle-edit"]');
    await pS.waitForSelector('#e-title');
    (await pS.evaluate(() => [...document.querySelectorAll('[data-k]')]
      .map(e => e.getAttribute('data-k')))).forEach(k => writes.add(k));
    await pS.close();
    const dropped = [...writes].filter(k => (appOrder || []).indexOf(k) === -1);
    chk('every field a form can write survives the download',
      dropped.length === 0, dropped.join(', '));
    chk('and the forms really were read', writes.size >= 10, String(writes.size));
  }

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
