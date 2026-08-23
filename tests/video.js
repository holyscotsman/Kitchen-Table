/* From a video — the fourth import path and the only one that leaves the
 * page. The kitchen server is stubbed by route interception on a fake https
 * origin (kt.importApi points there), so the suite is hermetic: nothing here
 * touches the network, Render, or a real video.
 */
const { chromium, devices } = require('playwright');
const { freshContext } = require('./ctx');
const B = process.env.KT_BASE || 'http://127.0.0.1:8899';
let pass = 0, fail = 0;
const chk = (n, c, e = '') => c ? (pass++, console.log('  PASS ' + n))
  : (fail++, console.log('  FAIL ' + n + (e ? ' :: ' + e : '')));

const API = 'https://kt-kitchen.test';
const CATS_OK = ['Breakfast','Brunch','Lunch','Dinner','Sides','Snacks','Baking','Desserts','Cocktails','Drinks'];

const READY_RESULT = {
  title: 'Video Test Soup', category: 'Dinner', servings: 4,
  ingredients: ['2 cups broth', '1 carrot'], steps: ['Simmer everything.'],
  flagged: ['Servings — not stated in the video; defaulted to 4'],
  source: 'https://youtu.be/vid1', tags: ['soup', 'Scottish']
};

/* One knob per context: script[i] answers the i-th poll of job 7. */
function stubKitchen(ctx, opts) {
  const o = Object.assign({ polls: [], ready: [], failed: [], accepted: [], posts: [], failPost: null, failAccept: null, puts: [], failPut: null, failPutAfter: null, putId: null, publishing: true, postDelayMs: 0, putDelayMs: 0 }, opts);
  let pollN = -1;
  ctx.route(API + '/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (status, body) => route.fulfill({
      status, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(body)
    });
    if (req.method() === 'POST' && u.pathname === '/api/import/video') {
      o.posts.push(req.postDataJSON());
      if (o.postDelayMs) await new Promise(r => setTimeout(r, o.postDelayMs));
      if (o.failPost) return json(o.failPost.status, { error: o.failPost.error });
      return json(202, { job_id: 7 });
    }
    if (req.method() === 'GET' && u.pathname === '/api/import/jobs') {
      return json(200, { jobs: u.searchParams.get('status') === 'failed' ? o.failed : o.ready });
    }
    if (req.method() === 'GET' && /^\/api\/import\/jobs\/\d+$/.test(u.pathname)) {
      pollN = Math.min(pollN + 1, o.polls.length - 1);
      return json(200, o.polls[pollN] || { id: 7, status: 'queued', eta_seconds: 60, overrun: false });
    }
    if (req.method() === 'PUT' && /^\/api\/recipes\//.test(u.pathname)) {
      o.puts.push({ path: u.pathname, key: req.headers()['x-kitchen-key'] || null,
                    more: u.searchParams.get('more') === '1',
                    isNew: u.searchParams.get('new') === '1',
                    body: req.postDataJSON() });
      /* Holds each write open, so the in-flight window is long enough to
         look at. A cold Render does this for real, for about 30 seconds. */
      if (o.putDelayMs) await new Promise(r => setTimeout(r, o.putDelayMs));
      if (o.failPut) return json(o.failPut.status, { error: o.failPut.error || '' });
      /* Lets a burst succeed part-way and then hit one answer, which is the
         only way to measure "N of M reached it before ...". */
      if (o.failPutAfter && o.puts.length > o.failPutAfter.after) {
        return json(o.failPutAfter.status, { error: o.failPutAfter.error || '' });
      }
      /* `R127` — the family's book may already hold that id, in which case
         the server suffixes rather than overwrites and answers with the id
         it actually used. `putId` plays that back. */
      return json(200, { ok: true,
                         id: o.putId || decodeURIComponent(u.pathname.split('/').pop()),
                         publishing: o.publishing !== false });
    }
    if (req.method() === 'POST' && /\/accept$/.test(u.pathname)) {
      o.accepted.push({ path: u.pathname, body: req.postDataJSON() });
      if (o.failAccept) return json(o.failAccept.status, { error: o.failAccept.error });
      return json(200, { ok: true, id: 'video-test-soup' });
    }
    return json(404, { error: 'not found' });
  });
  return o;
}

async function freshPage(br, opts) {
  const ctx = await freshContext(br, { ...devices['iPhone 13'] });
  const stub = stubKitchen(ctx, opts);
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e.message)));
  await p.addInitScript((api) => localStorage.setItem('kt.importApi', JSON.stringify(api)), API);
  return { ctx, p, stub };
}

(async () => {
  const br = await chromium.launch(process.env.KT_CHROMIUM ? { executablePath: process.env.KT_CHROMIUM } : {});

  console.log('\n== The fourth path ==');
  {
    const { ctx, p } = await freshPage(br, {});
    await p.goto(B + '/index.html#add');
    await p.waitForSelector('.pathbtn');
    chk('From a video offered', await p.locator('.pathbtn[data-key="video"]').count() === 1);
    const box = await p.locator('.pathbtn[data-key="video"]').boundingBox();
    chk('tap target ≥44px', box.height >= 44, JSON.stringify(box));
    await p.click('.pathbtn[data-key="video"]');
    await p.waitForSelector('#a-vurl');
    chk('disclosure names Render, Groq and Anthropic before anything is sent',
      /Render/.test(await p.textContent('.addscreen')) &&
      /Groq/.test(await p.textContent('.addscreen')) &&
      /Anthropic/.test(await p.textContent('.addscreen')));
    chk('no horizontal scroll at 390px', await p.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth));
    await ctx.close();
  }

  console.log('\n== Validation refuses before the network ==');
  {
    const { ctx, p, stub } = await freshPage(br, {});
    await p.goto(B + '/index.html#add');
    await p.click('.pathbtn[data-key="video"]');
    await p.fill('#a-vurl', 'https://vimeo.com/12345');
    await p.click('[data-act="video-submit"]');
    await p.waitForSelector('.notice--bad');
    chk('non-YouTube/Instagram link refused in words', /YouTube or Instagram/.test(await p.textContent('.notice--bad')));
    chk('nothing was sent', stub.posts.length === 0);
    await ctx.close();
  }

  console.log('\n== Submit → progress card → review ==');
  {
    const { ctx, p, stub } = await freshPage(br, {
      polls: [
        { id: 7, status: 'downloading', eta_seconds: 95, overrun: false },
        { id: 7, status: 'transcribing', eta_seconds: 50, overrun: false },
        { id: 7, status: 'extracting', eta_seconds: 20, overrun: false },
        { id: 7, status: 'ready_for_review', result_json: READY_RESULT }
      ]
    });
    await p.goto(B + '/index.html#add');
    await p.click('.pathbtn[data-key="video"]');
    await p.fill('#a-vurl', 'https://youtu.be/vid1');
    await p.click('[data-act="video-submit"]');
    await p.waitForSelector('.vprog');
    chk('three human stages', await p.locator('.vprog__s').count() === 3);
    chk('the close-this-page promise is stated', /close this page/.test(await p.textContent('.vprog')));
    await p.waitForSelector('.vprog__s--now:has-text("Listening to it")', { timeout: 12000 });
    chk('stage advances as the job moves', true);
    chk('an ETA is shown, roughly', /minute|Working out/.test(await p.textContent('.vprog__eta')));
    await p.waitForSelector('#a-title', { timeout: 15000 });
    chk('review reached without a tap', await p.inputValue('#a-title') === 'Video Test Soup');
    chk('flags landed on the review screen', /Servings — not stated/.test(await p.textContent('.panel--flag')));
    chk('tags arrive as the review string', await p.inputValue('#a-tags') === 'soup, Scottish');
    await p.click('[data-act="add-save"]');
    await p.waitForURL(/#video-test-soup/, { timeout: 5000 });
    await p.waitForTimeout(500);
    chk('save told the kitchen (accept)', stub.accepted.length === 1 && /jobs\/7\/accept/.test(stub.accepted[0].path));
    /* `S09` — and told it ONCE. Accept already writes that recipe, so a
       video draft must not also go down the ordinary sharing path: two
       writes for one Save is one of them arguing with the other. */
    chk('and told it exactly once, not twice',
      stub.puts.length === 0, 'also PUT ' + stub.puts.length + ' time(s)');
    const sent = stub.accepted[0].body.recipe;
    chk('accept carries the reviewed recipe, id chosen by the phone',
      sent && sent.id === 'video-test-soup' && sent.title === 'Video Test Soup');
    chk('accept carries source and tags', sent.source === 'https://youtu.be/vid1' && sent.tags.join(',') === 'soup,Scottish');
    chk('the job id never enters the saved recipe', !('videoJobId' in sent));
    const overlay = await p.evaluate(() => JSON.parse(localStorage.getItem('kt.recipes')));
    const savedLocal = overlay.find(r => r.id === 'video-test-soup');
    chk('saved locally too — the phone never waits on the server',
      savedLocal && !('videoJobId' in savedLocal));
    chk('no page errors through the whole flow', p.errs.length === 0, p.errs.join(' | '));
    await ctx.close();
  }

  console.log('\n== Overrun and failure speak like people ==');
  {
    const { ctx, p } = await freshPage(br, {
      polls: [{ id: 7, status: 'extracting', eta_seconds: 0, overrun: true }]
    });
    await p.goto(B + '/index.html#add');
    await p.click('.pathbtn[data-key="video"]');
    await p.fill('#a-vurl', 'https://youtu.be/slow');
    await p.click('[data-act="video-submit"]');
    await p.waitForSelector('.vprog__eta:has-text("longer than usual")', { timeout: 12000 });
    chk('2× overrun switches to "taking a bit longer", never a frozen countdown', true);
    await ctx.close();
  }
  {
    const { ctx, p } = await freshPage(br, {
      polls: [{ id: 7, status: 'failed', error_message: 'Instagram wouldn’t let us fetch this video. Try screen-recording it and importing that as a photo instead.' }]
    });
    await p.goto(B + '/index.html#add');
    await p.click('.pathbtn[data-key="video"]');
    await p.fill('#a-vurl', 'https://www.instagram.com/reel/Cxyz/');
    await p.click('[data-act="video-submit"]');
    await p.waitForSelector('.notice--bad', { timeout: 12000 });
    chk('failure surfaces the server’s plain words (Instagram advice intact)',
      /screen-recording/.test(await p.textContent('.notice--bad')));
    chk('back on the video form to try again', await p.locator('#a-vurl').count() === 1);
    await ctx.close();
  }

  console.log('\n== The kitchen is busy / waking ==');
  {
    const { ctx, p } = await freshPage(br, { failPost: { status: 429, error: 'The kitchen is busy right now — try again in a few minutes.' } });
    await p.goto(B + '/index.html#add');
    await p.click('.pathbtn[data-key="video"]');
    await p.fill('#a-vurl', 'https://youtu.be/busy');
    await p.click('[data-act="video-submit"]');
    await p.waitForSelector('.notice--bad');
    chk('a served error is relayed, not retried into duplicates', /busy/.test(await p.textContent('.notice--bad')));
    await ctx.close();
  }
  {
    const { ctx, p } = await freshPage(br, { postDelayMs: 6000, polls: [{ id: 7, status: 'queued', eta_seconds: 100, overrun: false }] });
    await p.goto(B + '/index.html#add');
    await p.click('.pathbtn[data-key="video"]');
    await p.fill('#a-vurl', 'https://youtu.be/cold');
    await p.click('[data-act="video-submit"]');
    await p.waitForSelector('.notice:has-text("Waking up the kitchen")', { timeout: 5500 });
    chk('a slow first answer reads as waking, not as an error', true);
    await p.waitForSelector('.vprog', { timeout: 10000 });
    chk('and the submission still lands', true);
    await ctx.close();
  }

  console.log('\n== Finished imports wait for whoever returns ==');
  {
    const { ctx, p, stub } = await freshPage(br, {
      ready: [{ id: 9, title: 'Waiting Pie', platform: 'youtube', url: 'https://youtu.be/w',
        created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString() }],
      polls: [{ id: 9, status: 'ready_for_review', result_json: Object.assign({}, READY_RESULT, { title: 'Waiting Pie' }) }]
    });
    await p.goto(B + '/index.html#add');
    await p.waitForSelector('.vready');
    chk('the waiting list greets arrival', /Waiting Pie/.test(await p.textContent('.vready')));
    chk('a waiting draft says how long it has waited (R6)',
      /2 hours ago/.test(await p.textContent('.vready')));
    await p.click('.vready .pathbtn');
    await p.waitForSelector('#a-title', { timeout: 12000 });
    chk('opening one lands on the standard review screen', await p.inputValue('#a-title') === 'Waiting Pie');
    await ctx.close();
  }

  console.log('\n== A refresh mid-wait resumes the watch ==');
  {
    const { ctx, p } = await freshPage(br, {
      polls: [{ id: 7, status: 'transcribing', eta_seconds: 40, overrun: false }]
    });
    await p.goto(B + '/index.html#add');
    await p.click('.pathbtn[data-key="video"]');
    await p.fill('#a-vurl', 'https://youtu.be/refr');
    await p.click('[data-act="video-submit"]');
    await p.waitForSelector('.vprog');
    await p.reload();
    await p.waitForSelector('.vprog', { timeout: 12000 });
    chk('progress card survives refresh (the job kept cooking)', true);
    await ctx.close();
  }

  console.log('\n== Share sheet → the video form, ready to send ==');
  {
    /* `V04` had a shared video submit itself. `R129` stopped it one tap
       short, because that tap is the only place the three services the link
       touches are ever named — see the R129 block below for the measurement. */
    const { ctx, p, stub } = await freshPage(br, {
      polls: [{ id: 7, status: 'downloading', eta_seconds: 60, overrun: false }]
    });
    await p.goto(B + '/index.html?url=' + encodeURIComponent('https://youtu.be/shared1'));
    /* Tolerant on purpose: if this ever auto-submits again the form never
       appears, and a timeout that kills the suite hides the checks that say
       WHY. They report instead. */
    await p.waitForSelector('#a-vurl', { timeout: 12000 }).catch(() => {});
    chk('a shared video link arrives ready to send, and not yet sent',
      stub.posts.length === 0 && (await p.inputValue('#a-vurl')) === 'https://youtu.be/shared1',
      JSON.stringify(stub.posts));
    chk('the query is consumed from the address bar', await p.evaluate(() => location.search) === '');
    chk('and the app is on #add', await p.evaluate(() => location.hash) === '#add');
    await p.click('[data-act="video-submit"]', { timeout: 6000 }).catch(() => {});
    await p.waitForSelector('.vprog', { timeout: 12000 }).catch(() => {});
    chk('and one tap sends it', stub.posts.length === 1 && stub.posts[0].url === 'https://youtu.be/shared1',
      JSON.stringify(stub.posts));
    await ctx.close();
  }
  {
    const { ctx, p, stub } = await freshPage(br, {});
    await p.goto(B + '/index.html?text=' + encodeURIComponent('Look! https://youtu.be/intext via app'));
    await p.waitForSelector('#a-vurl, .notice--bad', { timeout: 12000 }).catch(() => {});
    chk('the url is fished out of shared text',
      (await p.locator('#a-vurl').count()) === 1 &&
      (await p.inputValue('#a-vurl')) === 'https://youtu.be/intext' && stub.posts.length === 0,
      JSON.stringify(stub.posts));
    await p.click('[data-act="video-submit"]', { timeout: 6000 }).catch(() => {});
    await p.waitForSelector('.vprog', { timeout: 12000 }).catch(() => {});
    chk('and that one sends on a tap too',
      stub.posts.length === 1 && stub.posts[0].url === 'https://youtu.be/intext');
    await ctx.close();
  }
  {
    const { ctx, p, stub } = await freshPage(br, {});
    await p.goto(B + '/index.html?url=' + encodeURIComponent('https://www.seriouseats.com/some-recipe'));
    await p.waitForSelector('#a-url', { timeout: 12000 });
    chk('a non-video link pre-fills the link importer instead',
      (await p.inputValue('#a-url')) === 'https://www.seriouseats.com/some-recipe' && stub.posts.length === 0);
    await ctx.close();
  }

  {
    /* `R99` — the manifest asks for `text`, and the check just below proves
       it. Shared text with no address in it was then thrown away: the query
       is stripped from the address bar before the URL match runs, so a
       recipe someone selected in Notes and shared into the app arrived at
       the front screen with nothing on it and no way back to what they
       sent. The words themselves are exactly what the paste box takes —
       the one import path that needs no network at all. */
    const { ctx, p, stub } = await freshPage(br, {});
    const typed = "Granny's Shortbread\n\n225g butter\n110g caster sugar\n" +
                  "340g plain flour\n\nCream the butter and sugar, work in " +
                  "the flour, press into a tin, bake at 150C for 45 minutes.";
    await p.goto(B + '/index.html?text=' + encodeURIComponent(typed));
    await p.waitForTimeout(1200);
    const got = await p.evaluate(() => {
      const t = document.querySelector('#a-paste');
      return { hash: location.hash, search: location.search,
               paste: t ? t.value : null,
               heading: (document.querySelector('#app h1') || {}).textContent };
    });
    chk('shared text with no link still opens the importer',
        got.hash === '#add', got.hash + ' / ' + got.heading);
    chk('and the words arrive in the paste box',
        !!got.paste && got.paste.indexOf('Shortbread') > -1,
        JSON.stringify((got.paste || '').slice(0, 40)));
    chk('every line of it, not just the first',
        !!got.paste && got.paste.indexOf('45 minutes') > -1);
    chk('the query is consumed either way', got.search === '');
    chk('and nothing was sent anywhere', stub.posts.length === 0);
    await ctx.close();
  }
  {
    /* A share carrying neither an address nor any words is still nothing to
       act on, and must not open an empty importer. */
    const { ctx, p } = await freshPage(br, {});
    await p.goto(B + '/index.html?text=' + encodeURIComponent('   '));
    await p.waitForTimeout(800);
    chk('an empty share leaves the app on the front screen',
        await p.evaluate(() => location.hash) !== '#add');
    await ctx.close();
  }

  console.log('\n== Manifest carries the share target ==');
  {
    const res = await (await br.newPage()).request.get(B + '/manifest.json');
    const man = await res.json();
    chk('share_target is GET with url/text params',
      man.share_target && man.share_target.method === 'GET' &&
      man.share_target.params.url === 'url' && man.share_target.params.text === 'text');
    const p2 = await br.newPage();
    const i192 = await p2.request.get(B + '/images/icon-192.png');
    const i512 = await p2.request.get(B + '/images/icon-512.png');
    chk('both manifest icons exist', i192.ok() && i512.ok());
    chk('index links the manifest', /rel="manifest"/.test(await (await p2.request.get(B + '/index.html')).text()));
    await p2.close();
  }

  console.log('\n== A draft that arrives malformed (R11) ==');
  {
    /* The kitchen server is ours, but it is still a network boundary: a
       truncated body, a proxy's error page, a row written by an older
       schema. The review screen must survive whatever comes back — a
       crash here would lose the import AND the screen. */
    const JUNK = {
      title: { not: 'a string' }, category: 'Nonsense', servings: 'four',
      ingredients: '2 cups flour', steps: null, flagged: 'check this',
      tags: 'soup', notes: 42, source: ['https://youtu.be/x']
    };
    const { ctx, p } = await freshPage(br, {
      ready: [{ id: 21, title: 'Junk Draft', platform: 'youtube',
        created_at: new Date().toISOString() }],
      polls: [{ id: 21, status: 'ready_for_review', result_json: JUNK }]
    });
    await p.goto(B + '/index.html#add');
    await p.waitForSelector('.vready', { timeout: 12000 });
    await p.click('.vready .pathbtn');
    await p.waitForSelector('#a-title', { timeout: 12000 });
    chk('a malformed draft still reaches the review screen', true);
    chk('no page errors from the junk', p.errs.length === 0, p.errs.join(' | '));
    chk('a string ingredient list becomes one editable line',
      await p.locator('[data-act="adl"][data-k="ingredients"]').count() >= 1);
    chk('a string tag list is readable, not [object Object]',
      !/\[object/.test(await p.inputValue('#a-tags')));
    chk('an unknown course falls back to a real one',
      CATS_OK.includes(await p.inputValue('#a-cat')), await p.inputValue('#a-cat'));
    chk('a non-numeric servings becomes a number',
      /^\d+$/.test(await p.inputValue('#a-serves')), await p.inputValue('#a-serves'));
    chk('the screen is still usable — Save is there',
      await p.locator('[data-act="add-save"]').count() === 1);
    await ctx.close();
  }

  console.log('\n== A failure that happened while nobody watched (R8) ==');
  {
    const FAILED = [{
      id: 12, url: 'https://youtu.be/gone', platform: 'youtube',
      created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      error_message: 'That video is private, so it can’t be fetched.'
    }];
    const { ctx, p } = await freshPage(br, { failed: FAILED });
    await p.goto(B + '/index.html#add');
    await p.waitForSelector('.vfailed', { timeout: 12000 });
    const txt = await p.textContent('.vfailed');
    chk('the failure is surfaced, not swallowed', /didn’t work/.test(txt));
    chk('with the server’s own reason', /private/.test(txt));
    chk('and when it happened', /3 hours ago/.test(txt));
    chk('both actions meet the tap floor', await (async () => {
      for (const sel of ['[data-act="video-retry"]', '[data-act="video-dismiss"]']) {
        const b = await p.locator(sel).boundingBox();
        if (!b || b.height < 44) return false;
      }
      return true;
    })());
    await p.click('[data-act="video-retry"]');
    await p.waitForSelector('#a-vurl');
    chk('Try again pre-fills the link rather than resubmitting behind you',
      await p.inputValue('#a-vurl') === 'https://youtu.be/gone');
    await ctx.close();
  }
  {
    const FAILED = [{
      id: 13, url: 'https://youtu.be/nope', platform: 'youtube',
      created_at: new Date().toISOString(), error_message: 'It didn’t work.'
    }];
    const { ctx, p } = await freshPage(br, { failed: FAILED });
    await p.goto(B + '/index.html#add');
    await p.waitForSelector('.vfailed', { timeout: 12000 });
    await p.click('[data-act="video-dismiss"]');
    await p.waitForTimeout(200);
    chk('Dismiss clears it', await p.locator('.vfailed').count() === 0);
    await p.reload();
    await p.waitForSelector('.pathbtn');
    await p.waitForTimeout(1200);
    chk('and it stays dismissed across a reload', await p.locator('.vfailed').count() === 0);
    await ctx.close();
  }

  console.log('\n== Dismiss on a phone carrying rubbish (R40) ==');
  {
    /* The last unguarded storage key. kt.dismissedImports is a list of ids;
       a value of the wrong shape reaches .push and throws, so the Dismiss
       button breaks the first time it is pressed — on the one screen whose
       whole job is to make a failure go away quietly. */
    const FAILED = [{
      id: 77, url: 'https://youtu.be/junk', platform: 'youtube',
      created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      error_message: 'That video is private, so it can’t be fetched.'
    }];
    const { ctx, p } = await freshPage(br, { failed: FAILED });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(B + '/index.html#add');
    await p.evaluate(() =>
      localStorage.setItem('kt.dismissedImports', '"not a list at all"'));
    await p.reload();
    await p.waitForSelector('.vfailed', { timeout: 12000 });
    chk('the failure still shows with a rotten dismissed-list',
      await p.locator('.vfailed').count() === 1);
    await p.click('[data-act="video-dismiss"]');
    await p.waitForTimeout(300);
    chk('Dismiss works rather than throwing',
      await p.locator('.vfailed').count() === 0 && errs.length === 0,
      errs.join(' | '));
    chk('and the key is a list again afterwards',
      await p.evaluate(() => Array.isArray(JSON.parse(
        localStorage.getItem('kt.dismissedImports') || 'null'))));
    await ctx.close();
  }

  console.log('\n== R92 — a submission is only sent if the server said what it did with it ==');
  {
    /* `R87` coerced the job LISTS at the boundary. The submit reply was
       never checked at all: `S.videoJob = { id: r.job_id, ... }` trusts
       that a 200 carries a job id.
       A 200 that does not — a renamed field, a half-done deploy, a proxy's
       own cheerful JSON — therefore produced the worst outcome this app is
       capable of. The progress card appears and starts stepping through
       "Waiting its turn… Fetching the video… Listening to it". The pasted
       link is cleared, so there is nothing left to retry. The card says
       **"you can close this page, the finished recipe will be waiting"** —
       a promise that cannot be kept, because there is no job. And the poll
       runs forever against `/api/import/jobs/undefined`, every 404
       swallowed as transient.
       CLAUDE.md's own line for this: a change reported as kept and
       silently dropped is the worst thing this app could do. */
    const SHAPES = [
      ['a 200 with no job id at all', { ok: true }],
      ['a job id that is null', { job_id: null }],
      ['a job id that is an object', { job_id: { n: 7 } }],
      ['an empty body', {}]
    ];
    for (const [what, body] of SHAPES) {
      const ctx = await freshContext(br, { ...devices['iPhone 13'] });
      const polled = [];
      await ctx.route(API + '/**', (route) => {
        const u = new URL(route.request().url());
        if (route.request().method() === 'POST' && u.pathname === '/api/import/video') {
          return route.fulfill({ status: 200, contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
        }
        if (/^\/api\/import\/jobs\//.test(u.pathname)) polled.push(u.pathname);
        return route.fulfill({ status: 200, contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' }, body: '{"jobs":[]}' });
      });
      const p = await ctx.newPage();
      const errs = [];
      p.on('pageerror', e => errs.push(String(e.message)));
      await p.addInitScript((api) => localStorage.setItem('kt.importApi', JSON.stringify(api)), API);
      await p.goto(B + '/index.html#add');
      await p.waitForSelector('.pathbtn');
      await p.click('.pathbtn[data-key="video"]');
      await p.waitForSelector('#a-vurl');
      await p.fill('#a-vurl', 'https://youtu.be/abc123');
      await p.click('[data-act="video-submit"]');
      await p.waitForTimeout(1200);

      const r = await p.evaluate(() => {
        const t = ((document.querySelector('#app') || {}).textContent || '').replace(/\s+/g, ' ');
        const v = document.querySelector('#a-vurl');
        return {
          promised: /you can close this page|Waiting its turn/i.test(t),
          said: /couldn|could not|didn|oddly|try again|again/i.test(t),
          link: v ? v.value : null
        };
      });
      chk('no progress is claimed for ' + what, !r.promised);
      chk('and the reader is told, for ' + what, r.said);
      chk('and the link survives so it can be sent again, for ' + what,
        r.link === 'https://youtu.be/abc123', String(r.link));
      chk('and nothing is polled for a job that does not exist, for ' + what,
        polled.length === 0, polled.slice(0, 3).join(', '));
      chk('and it threw nothing, for ' + what, errs.length === 0, errs.join(' | ').slice(0, 60));
      await ctx.close();
    }

    /* The floor: a real 202 must still be accepted, or the fix is just a
       wall across the feature. */
    {
      const { ctx, p } = await freshPage(br, { polls: [
        { id: 7, status: 'queued', eta_seconds: 60, overrun: false }] });
      await p.goto(B + '/index.html#add');
      await p.waitForSelector('.pathbtn');
      await p.click('.pathbtn[data-key="video"]');
      await p.waitForSelector('#a-vurl');
      await p.fill('#a-vurl', 'https://youtu.be/abc123');
      await p.click('[data-act="video-submit"]');
      await p.waitForTimeout(1200);
      const t = ((await p.locator('#app').textContent()) || '').replace(/\s+/g, ' ');
      chk('a real job id is still accepted and still shows its progress',
        /Waiting its turn|Fetching the video/i.test(t), t.slice(0, 80));
      await ctx.close();
    }
  }

  console.log('\n== R87 — the server\'s answers are shapes, not promises ==');
  {
    /* `R62` established the rule for stored data: every key this app reads
       back is coerced where it is read, never trusted. The kitchen server
       is the same kind of input and more so — it is remote, it is deployed
       separately, and it can be a version ahead of or behind the page
       asking. `normalizeDraft` already guards the draft that becomes a
       recipe. The **job lists** did not: `S.videoReady = jobs` took
       whatever arrived, and the Add screen then called `.map` on it and
       read `.id` and `.title` off each entry.
       So a server that answered `{jobs: "none"}` — a rename, a half-done
       deploy, an error body — did not produce an empty list. It threw
       inside render, and the Add screen, the way into the book for every
       new recipe, went blank. The failure mode `R62` was written to end.
       Each shape below is checked against the same bar: the screen still
       draws, and the four ways in are still on it. */
    const SHAPES = [
      ['a string where the list should be', { jobs: 'none' }],
      ['a number', { jobs: 7 }],
      ['an object', { jobs: { id: 7 } }],
      ['no jobs key at all', { total: 0 }],
      ['a list with holes in it', { jobs: [null, 3, 'x'] }],
      ['entries with no fields', { jobs: [{}, {}] }],
      ['a body that is not an object', 'not json at all'],
      ['entries whose fields are the wrong types',
        { jobs: [{ id: { n: 1 }, title: [1, 2], platform: 9, created_at: 'soon' }] }]
    ];
    for (const [what, body] of SHAPES) {
      const ctx = await freshContext(br, { ...devices['iPhone 13'] });
      await ctx.route(API + '/**', (route) => {
        const u = new URL(route.request().url());
        if (u.pathname === '/api/import/jobs') {
          return route.fulfill({ status: 200, contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
        }
        return route.fulfill({ status: 404, contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' }, body: '{"error":"not found"}' });
      });
      const p = await ctx.newPage();
      const errs = [];
      p.on('pageerror', e => errs.push(String(e.message)));
      await p.addInitScript((api) => localStorage.setItem('kt.importApi', JSON.stringify(api)), API);
      let drew = 0;
      try {
        await p.goto(B + '/index.html#add');
        await p.waitForSelector('.pathbtn', { timeout: 8000 });
        await p.waitForTimeout(600);
        /* The screen being up is not the question. The list arrives AFTER
           the first render, and `fetchVideoReady` has a `.catch` on it — so
           a throw inside that render is swallowed and the bad value simply
           stays in `S.videoReady`, waiting. What it takes down is the NEXT
           render, which is the reader's next tap. So tap something. */
        await p.click('[data-act="theme"]');
        await p.waitForTimeout(350);
        drew = await p.locator('.pathbtn[data-key]').count();
      } catch (e) { drew = -1; }
      chk('the Add screen survives ' + what,
        drew >= 4 && errs.length === 0,
        'paths ' + drew + (errs.length ? ' :: ' + errs[0].slice(0, 70) : ''));
      await ctx.close();
    }

    /* And the other half of the rule, which cost a broken suite to learn:
       a boundary that DROPS what it cannot parse is worse than one that
       passes it through. The first version of the normalizer required a
       numeric id — reasonable, since every handler reads ids with
       `parseInt` — and it silently swallowed a job whose id was a string.
       That turns a future schema change into an empty waiting list with no
       explanation. A job the server says is ready gets shown. */
    {
      const ctx = await freshContext(br, { ...devices['iPhone 13'] });
      await ctx.route(API + '/**', (route) => {
        const u = new URL(route.request().url());
        const body = u.pathname === '/api/import/jobs' &&
          u.searchParams.get('status') === 'ready_for_review'
          ? { jobs: [{ id: 'uuid-not-a-number', title: 'Soup From The Future',
                       platform: 'youtube', created_at: new Date().toISOString() }] }
          : { jobs: [] };
        return route.fulfill({ status: 200, contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      });
      const p = await ctx.newPage();
      const errs = [];
      p.on('pageerror', e => errs.push(String(e.message)));
      await p.addInitScript((api) => localStorage.setItem('kt.importApi', JSON.stringify(api)), API);
      await p.goto(B + '/index.html#add');
      await p.waitForSelector('.pathbtn');
      let shown = 0;
      try {
        await p.waitForSelector('.vready', { timeout: 8000 });
        shown = await p.locator('.vready .pathbtn').count();
      } catch (e) { shown = 0; }
      chk('a job with an id this build did not expect is still shown, not swallowed',
        shown === 1, String(shown));
      chk('and showing it threw nothing', errs.length === 0, errs.join(' | ').slice(0, 80));
      await ctx.close();
    }
  }

  console.log('\n== A refusal is not an outage (R107) ==');
  {
    /* Save on a video draft writes to this phone and then tells the server,
       so the database gets the reviewed recipe and the job leaves the
       waiting list. That call can fail two ways, and they are not the same
       thing: the server could not be REACHED, or the server LOOKED at the
       recipe and said no. `validateRecipe` refuses a contributor over 60
       characters, a notes field over 2000, a list over 100 items, a
       servings outside 1-40 — every one of them reachable from the review
       screen.

       Both got the same sentence: "couldn't be told YET ... stays in the
       waiting list FOR NOW". For a refusal that is a promise of a retry
       that is never coming. The job sits in the waiting list forever, the
       server said exactly what was wrong, and the app threw the words away
       — the error was not even bound in the catch.

       kitchenFetch has always known the difference: it marks an answered
       error so it will not retry one. It then built a fresh Error and
       dropped the flag on the floor, so no caller could act on it. */
    const stages = [
      { id: 7, status: 'downloading', eta_seconds: 95, overrun: false },
      { id: 7, status: 'ready_for_review', result_json: READY_RESULT }
    ];
    const saveThrough = async (opts) => {
      const { ctx, p, stub } = await freshPage(br, opts);
      await p.goto(B + '/index.html#add');
      await p.waitForSelector('.pathbtn');
      await p.click('.pathbtn[data-key="video"]');
      await p.fill('#a-vurl', 'https://youtu.be/vid1');
      await p.click('[data-act="video-submit"]');
      await p.waitForSelector('#a-title', { timeout: 20000 });
      await p.click('[data-act="add-save"]');
      await p.waitForTimeout(2200);
      const notice = await p.evaluate(() => {
        const n = document.querySelector('.notice');
        return n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
      });
      const saved = await p.evaluate(() => {
        const raw = localStorage.getItem('kt.recipes');
        return raw ? !!JSON.parse(raw).find(r => r.id === 'video-test-soup') : false;
      });
      await ctx.close();
      return { notice, saved, stub, errs: p.errs };
    };

    const refused = await saveThrough({
      polls: stages,
      failAccept: { status: 400, error: 'servings must be a whole number 1–40' }
    });
    chk('a refusal repeats what the server actually said',
      /servings must be a whole number/.test(refused.notice), refused.notice);
    chk('and does not promise a retry that is not coming',
      !/\byet\b|for now/i.test(refused.notice), refused.notice);
    chk('and still says the recipe is safe on this phone',
      /saved on this phone/i.test(refused.notice) && refused.saved === true,
      refused.notice + ' | stored=' + refused.saved);
    chk('the refusal was not retried', refused.stub.accepted.length === 1,
      String(refused.stub.accepted.length));

    const unreachable = await saveThrough({
      polls: stages,
      failAccept: { status: 503, error: '' }
    });
    chk('an outage still says it will keep waiting',
      /yet|for now/i.test(unreachable.notice), unreachable.notice);
    chk('and the two failures no longer read identically',
      unreachable.notice !== refused.notice,
      JSON.stringify([refused.notice.slice(0, 40), unreachable.notice.slice(0, 40)]));

    const fine = await saveThrough({ polls: stages });
    chk('a save the server accepts says nothing about failing',
      !/would not accept|couldn.t be told/i.test(fine.notice), fine.notice);
    chk('nothing threw across all three', refused.errs.length === 0 &&
      unreachable.errs.length === 0 && fine.errs.length === 0,
      refused.errs.concat(unreachable.errs, fine.errs).join(' | '));
  }

  console.log('\n== An edit can reach the whole family now (S04) ==');
  {
    /* Until this arc an edit stopped at the phone that made it, and the only
       way to everyone was to download recipes.json and hand it over. That
       path still exists and still cannot break — this is what makes it
       optional.

       The ORDER is the point. The phone's copy is saved, and reported saved,
       before a byte goes anywhere: a server asleep on Render's free tier
       must cost the reader nothing they typed. */
    const edit = async (opts, key, title) => {
      const { ctx, p, stub } = await freshPage(br, opts);
      if (key) await p.addInitScript(k =>
        localStorage.setItem('kt.kitchenKey', JSON.stringify(k)), key);
      await p.goto(B + '/index.html#ninja-cookies');
      await p.waitForSelector('.r-title');
      await p.click('[data-act="toggle-edit"]');
      await p.waitForSelector('#e-title');
      await p.fill('#e-title', title);
      await p.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => /^save/i.test(x.innerText.trim()));
        if (b) b.click();
      });
      await p.waitForTimeout(1300);
      const out = {
        puts: stub.puts,
        notice: await p.evaluate(() => {
          const n = document.querySelector('.notice');
          return n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
        }),
        stored: await p.evaluate(() => {
          const raw = localStorage.getItem('kt.recipes');
          return raw ? (JSON.parse(raw).find(r => r.id === 'ninja-cookies') || {}).title : null;
        }),
        errs: p.errs.slice()
      };
      await ctx.close();
      return out;
    };

    /* No passphrase is the behaviour the app has always had, and it has to
       survive untouched: nothing sent, nothing claimed, saved here. */
    const quiet = await edit({}, '', 'Ninja Cookies Local');
    chk('with no passphrase nothing is sent anywhere', quiet.puts.length === 0);
    chk('and the edit is still saved on the phone',
      quiet.stored === 'Ninja Cookies Local', String(quiet.stored));
    chk('and nothing is claimed about the family seeing it',
      !/famil/i.test(quiet.notice), quiet.notice);

    const sent = await edit({}, 'family-secret', 'Ninja Cookies Shared');
    chk('with one, the edit is sent to the kitchen', sent.puts.length === 1,
      String(sent.puts.length));
    chk('to that recipe\'s own address',
      /\/api\/recipes\/ninja-cookies$/.test(sent.puts[0].path), sent.puts[0].path);
    chk('carrying the passphrase in the header the gate reads',
      sent.puts[0].key === 'family-secret', String(sent.puts[0].key));
    chk('and the edited recipe, not the old one',
      sent.puts[0].body.recipe.title === 'Ninja Cookies Shared',
      sent.puts[0].body.recipe.title);
    chk('the passphrase never travels inside the recipe itself',
      !JSON.stringify(sent.puts[0].body.recipe).includes('family-secret'));
    chk('it is saved here too, not only there', sent.stored === 'Ninja Cookies Shared');
    chk('a single edit still publishes straight away (no S11 burst flag)',
      !/[?&]more=/.test(sent.puts[0].path + (sent.puts[0].more ? '?more=1' : '')) &&
      sent.puts[0].more !== true, String(sent.puts[0].more));
    chk('and the reader is told everyone will see it',
      /famil/i.test(sent.notice) && /few minutes/i.test(sent.notice), sent.notice);

    /* A kitchen that took the recipe but cannot republish is a different
       sentence from one that can — "in a few minutes" would be a promise
       nobody kept. */
    const slow = await edit({ publishing: false }, 'family-secret', 'Ninja Cookies Nightly');
    chk('a kitchen that cannot republish says when it will instead',
      /nightly/i.test(slow.notice) && !/few minutes/i.test(slow.notice), slow.notice);

    /* `R107`'s rule, on the path it was written for. */
    const refused = await edit(
      { failPut: { status: 401, error: 'That passphrase is not the family’s one.' } },
      'wrong-one', 'Ninja Cookies Refused');
    chk('a refused passphrase still saves on the phone',
      refused.stored === 'Ninja Cookies Refused' && /saved on this phone/i.test(refused.notice),
      refused.notice);
    chk('and repeats what the kitchen actually said',
      /not the family/i.test(refused.notice), refused.notice);
    chk('and does not promise it will go through later',
      !/try save again/i.test(refused.notice), refused.notice);

    const asleep = await edit({ failPut: { status: 503 } }, 'family-secret', 'Ninja Cookies Asleep');
    chk('a sleeping kitchen saves on the phone too',
      asleep.stored === 'Ninja Cookies Asleep', String(asleep.stored));
    chk('and says it is worth trying again, because it is',
      /again/i.test(asleep.notice) && !/would not take/i.test(asleep.notice), asleep.notice);
    chk('nothing threw across any of it',
      [].concat(quiet.errs, sent.errs, slow.errs, refused.errs, asleep.errs).length === 0,
      [].concat(quiet.errs, sent.errs, slow.errs, refused.errs, asleep.errs).join(' | '));
  }

  console.log('\n== The help page had to change with it (S06) ==');
  {
    /* "Your changes live on your phone only" was true for the whole life of
       this app, and `S04` made it false for any phone holding the family
       passphrase. That is the same fault `R94`, `R102`, `R108` and `R109`
       each found — a sentence that has stopped being true — except this
       time the round that broke it was the one before this.

       So the page reads the phone rather than describing phones in general,
       and this is checked from BOTH sides: a claim that is right only half
       the time is what got us here. */
    const helpWith = async (key) => {
      const ctx = await freshContext(br, { ...devices['iPhone 13'] });
      await ctx.route(API + '/**', r => r.abort('failed'));
      if (key) await ctx.addInitScript(k =>
        localStorage.setItem('kt.kitchenKey', JSON.stringify(k)), key);
      const p = await ctx.newPage();
      const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto(B + '/index.html#help');
      await p.waitForSelector('.help__h1');
      const text = await p.evaluate(() => document.querySelector('#app').innerText);
      await ctx.close();
      return { text, errs };
    };

    const off = await helpWith('');
    chk('with no passphrase the page still says changes stay on this phone',
      /live on your phone only/i.test(off.text), off.text.slice(0, 120));
    chk('and says how to change that',
      /Family passphrase/i.test(off.text));

    const on = await helpWith('family-secret');
    chk('with one, it no longer claims they stay here',
      !/live on your phone only/i.test(on.text),
      (on.text.match(/[^.]*phone only[^.]*\./) || [''])[0]);
    chk('it says they reach everyone', /everyone’s copy|everyone/i.test(on.text));
    chk('and it does not promise a speed the server may not manage',
      !/instantly|immediately/i.test(on.text));
    chk('the passphrase itself is never printed on the page',
      !on.text.includes('family-secret'));
    /* `S11` — Save is not the only thing that reaches everyone now. A page
       naming only Save would leave a reader guessing about the two actions
       that change the most recipes at once. */
    chk('and it names the bulk changes that reach everyone too',
      /Tagging several recipes at once/i.test(on.text) && /renaming/i.test(on.text),
      (on.text.match(/[^.]*Tagging[^.]*\./) || [''])[0]);
    chk('which the phone without a passphrase is not told, having nothing to tell',
      !/Tagging several recipes at once/i.test(off.text));
    /* `S13` — and the way back is on the page too, so a reader who finds a
       change stuck knows where to look without being told by a notice they
       have already scrolled past. */
    chk('and the help page names where a stuck change can be sent again',
      /All recipes/.test(on.text) && /send it again/i.test(on.text),
      (on.text.match(/[^.]*send it again[^.]*\./) || [''])[0]);

    /* The path that cannot break is still offered in both states — it is
       what the whole download-and-commit workflow rests on. */
    for (const [name, r] of [['without', off], ['with', on]]) {
      chk('the download still appears ' + name + ' a passphrase',
        /Download updated recipes\.json/.test(r.text));
    }
    /* Removal is deliberately still local-only (DECISIONS S), so that
       sentence must NOT have been swept along with the others. */
    chk('and removal is still described as this phone only',
      /takes a recipe off this phone/i.test(on.text.replace(/\s+/g, ' ')),
      (on.text.match(/Remove[^.]*\./) || [''])[0].slice(0, 90));
    chk('nothing threw', off.errs.length === 0 && on.errs.length === 0);
  }

  console.log('\n== The panic button had to stop over-promising (S08) ==');
  {
    /* "Undo all my changes on this phone" is what somebody presses when they
       are worried, so its sentence has to be the most honest in the app.

       It drops the local overlay and falls back to the published book. That
       was the whole story until `S04`: a change sent to everyone IS the
       published book now, so pressing this RESTORES it rather than removing
       it. Someone could press the panic button believing a shared mistake
       was gone while it sat on the website and on everyone else's phone.

       Read from the dialog itself rather than from the source, because what
       matters is the sentence a person is actually shown. */
    const askedWith = async (key) => {
      const ctx = await freshContext(br, { ...devices['iPhone 13'] });
      await ctx.route(API + '/**', r => r.abort('failed'));
      await ctx.addInitScript((k) => {
        /* The undo only appears once this phone has local changes. */
        localStorage.setItem('kt.recipes', JSON.stringify([{
          id: 'ninja-cookies', title: 'Ninja Cookies', category: 'Desserts',
          contributor: 'Joan', servings: 12, ingredients: ['1 cup butter'],
          steps: ['Bake.'] }]));
        if (k) localStorage.setItem('kt.kitchenKey', JSON.stringify(k));
      }, key);
      const p = await ctx.newPage();
      let asked = '';
      p.on('dialog', d => { asked = d.message(); d.dismiss(); });
      await p.goto(B + '/index.html#ninja-cookies');
      await p.waitForSelector('.r-title');
      await p.click('[data-act="toggle-edit"]');
      await p.waitForSelector('#e-title');
      await p.evaluate(() => {
        const b = document.querySelector('[data-act="reset-local"]');
        if (b) b.click();
      });
      await p.waitForTimeout(500);
      const stillThere = await p.evaluate(() => !!localStorage.getItem('kt.recipes'));
      await ctx.close();
      return { asked, stillThere };
    };

    const alone = await askedWith('');
    chk('the undo still asks before doing anything', alone.asked.length > 40, alone.asked.slice(0, 60));
    chk('and dismissing it changes nothing', alone.stillThere === true);
    chk('on a phone that shares nothing, it promises what it always did',
      /undoes everything changed, added, or removed on this phone/i.test(alone.asked));
    chk('and says nothing about everyone, because there is no everyone',
      !/sent to everyone/i.test(alone.asked), alone.asked.slice(-90));

    const shares = await askedWith('family-secret');
    chk('on a phone that shares, it warns what it cannot take back',
      /will NOT take those back/i.test(shares.asked), shares.asked.slice(-160));
    chk('and says what to do about those instead',
      /Save again/i.test(shares.asked), shares.asked.slice(-90));
    chk('while still saying what it DOES undo',
      /undoes everything changed, added, or removed on this phone/i.test(shares.asked));
    chk('and it never prints the passphrase into a dialog',
      !shares.asked.includes('family-secret'));
  }

  console.log('\n== Typing a new recipe in shares it too (S09) ==');
  {
    /* `S04` wired sharing into Edit mode only, which left the family a rule
       nobody could have guessed: change a recipe and everyone sees it, type
       a new one in and only you do. The video path had told the server
       since the day it was built, so two of the three ways in already
       shared — and the quiet one was the one somebody uses to add Joan's
       card off the counter. */
    const addOne = async (opts, key, title) => {
      const { ctx, p, stub } = await freshPage(br, opts);
      if (key) await p.addInitScript(k =>
        localStorage.setItem('kt.kitchenKey', JSON.stringify(k)), key);
      await p.goto(B + '/index.html#add');
      await p.waitForSelector('.pathbtn');
      await p.click('[data-act="add-path"][data-key="review"]');
      await p.waitForSelector('#a-title');
      await p.fill('#a-title', title);
      await p.fill('#a-ing-0', '2 cups flour');
      await p.fill('#a-step-0', 'Mix it.');
      await p.click('[data-act="add-save"]');
      await p.waitForTimeout(1400);
      const out = {
        puts: stub.puts, accepted: stub.accepted,
        notice: await p.evaluate(() => {
          const n = document.querySelector('.notice');
          return n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
        }),
        stored: await p.evaluate(() => {
          const raw = localStorage.getItem('kt.recipes');
          return raw ? JSON.parse(raw).some(r => /S09/.test(r.title)) : false;
        }),
        errs: p.errs.slice()
      };
      await ctx.close();
      return out;
    };

    const quiet = await addOne({}, '', 'Typed In S09 Local');
    chk('with no passphrase a new recipe goes nowhere', quiet.puts.length === 0);
    chk('and is still saved on the phone', quiet.stored === true);

    const sent = await addOne({}, 'family-secret', 'Typed In S09 Shared');
    chk('with one, a typed-in recipe reaches the family too',
      sent.puts.length === 1, String(sent.puts.length));
    chk('at its own address', /\/api\/recipes\/typed-in-s09-shared$/.test(sent.puts[0].path),
      sent.puts[0].path);
    chk('carrying the passphrase', sent.puts[0].key === 'family-secret');
    chk('and the recipe as typed', sent.puts[0].body.recipe.title === 'Typed In S09 Shared');
    chk('it is on the phone as well', sent.stored === true);
    chk('and the reader is told', /famil/i.test(sent.notice), sent.notice);
    chk('nothing threw', quiet.errs.length === 0 && sent.errs.length === 0,
      quiet.errs.concat(sent.errs).join(' | '));
  }


  console.log('\n== A shared video named nobody before it was sent (R129) ==');
  {
    /* The video form carries this comment, directly above its disclosure:
       *"Same disclosure discipline as the link importer (050): name every
       service the link touches before anything is sent."* And `tests/video.js`
       has asserted since the day it was written that the form "names Render,
       Groq and Anthropic before anything is sent".

       The share target skips that form. `V04` decided a shared video
       "submits itself", and the boot handler calls `submitVideo()` straight
       out of `consumeSharedLink` — so on the app's PRIMARY path for the
       video importer, the three services the link touches are named
       **nowhere**: not before the request, not on the progress card that
       replaces the form, not at all.

       It is also the one path where a fumbled share sheet starts a paid
       pipeline — yt-dlp, Groq, then a `claude-opus-5` call — with no way to
       say no first. `backend/lib/budget.js` exists because those cost money.

       So the share still lands on the video screen with the address already
       filled, which is what `V04` was for; it just does not send until
       somebody says so. One tap, and the two ways into the video importer
       behave the same way — the `S09` lesson. Recorded as reversible in
       DECISIONS.md. */
    const shareIn = async (query) => {
      const { ctx, p, stub } = await freshPage(br, {});
      await p.goto(B + '/index.html' + query);
      await p.waitForTimeout(900);
      const out = {
        posts: stub.posts.slice(),
        url: await p.evaluate(() => {
          const f = document.querySelector('#a-vurl');
          return f ? f.value : null;
        }),
        text: await p.evaluate(() => document.body.innerText),
        errs: p.errs.slice(), page: p, ctx: ctx, stub: stub
      };
      return out;
    };

    const shared = await shareIn('?url=' + encodeURIComponent('https://www.youtube.com/watch?v=abc123'));
    chk('a shared video lands on the video screen with the address already there',
      shared.url === 'https://www.youtube.com/watch?v=abc123', String(shared.url));
    chk('and nothing has been sent anywhere yet',
      shared.posts.length === 0, JSON.stringify(shared.posts));
    chk('while every service the link would touch is named on screen',
      /Render/.test(shared.text) && /Groq/.test(shared.text) && /Anthropic/.test(shared.text),
      shared.text.replace(/\s+/g, ' ').slice(0, 160));
    chk('and it says why it is waiting rather than looking broken',
      /shared/i.test(shared.text) && /send/i.test(shared.text),
      shared.text.replace(/\s+/g, ' ').slice(0, 200));

    await shared.page.click('[data-act="video-submit"]', { timeout: 6000 }).catch(() => {});
    await shared.page.waitForTimeout(700);
    chk('one tap sends it, and only then',
      shared.stub.posts.length === 1, JSON.stringify(shared.stub.posts));
    chk('with the address that was shared',
      (shared.stub.posts[0] || {}).url === 'https://www.youtube.com/watch?v=abc123',
      JSON.stringify(shared.stub.posts[0]));
    chk('nothing threw', shared.errs.length === 0, shared.errs.join(' | '));
    await shared.ctx.close();

    /* The other two share shapes were already a tap away, and must stay so. */
    const link = await shareIn('?url=' + encodeURIComponent('https://cooking.example.com/soup'));
    chk('a shared web page still waits for the reader too',
      link.posts.length === 0 &&
      (await link.page.evaluate(() => {
        const f = document.querySelector('#a-url');
        return f ? f.value : null;
      })) === 'https://cooking.example.com/soup', JSON.stringify(link.posts));
    await link.ctx.close();
  }

  console.log('\n== A recipe born on this phone must not land on somebody else’s (R127) ==');
  {
    /* `S09` routed a newly typed recipe through `shareEdit`, the function
       written for an EDIT. The two are opposite instructions and the wire
       could not tell them apart:

         - an edit says "someone opened THIS recipe and changed it", so
           `putRecipe` overwrites the row on purpose (`S04`);
         - a create says "here is a recipe I just wrote", and its id was
           minted by `slugify(title)` against THIS PHONE'S copy of the book.

       `acceptJob` already had the second case and wrote the rule down —
       "the phone chose the id against its own copy of the book; another
       device may have taken it since. Suffix rather than overwrite — a
       duplicate the family can see and delete beats a recipe silently
       replaced." Sharing an add went the other way.

       It is reachable, and most reachable on exactly the phones this app
       is built for: the overlay is authoritative, so once a phone has any
       local change it stops seeing recipes added to the published file.
       Two people each type in "Shortbread" and the second one's save
       DELETES the first one's recipe out of the family's book — no
       warning, no copy, and the phone that lost it still shows its own. */
    const shareOne = async (opts, seed, hash, edit) => {
      const { ctx, p, stub } = await freshPage(br, opts);
      await p.addInitScript(k =>
        localStorage.setItem('kt.kitchenKey', JSON.stringify(k)), 'family-secret');
      if (seed) await p.addInitScript(s =>
        localStorage.setItem('kt.recipes', s), JSON.stringify(seed));
      await p.goto(B + '/index.html' + hash);
      await edit(p);
      const out = {
        puts: stub.puts,
        notice: await p.evaluate(() => {
          const n = document.querySelector('.notice');
          return n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
        }),
        shared: await p.evaluate(() => {
          const raw = localStorage.getItem('kt.shared');
          return raw ? JSON.parse(raw) : null;
        }),
        errs: p.errs.slice()
      };
      await ctx.close();
      return out;
    };

    const typeItIn = (title) => async (p) => {
      await p.waitForSelector('.pathbtn');
      await p.click('[data-act="add-path"][data-key="review"]');
      await p.waitForSelector('#a-title');
      await p.fill('#a-title', title);
      await p.fill('#a-ing-0', '2 cups flour');
      await p.fill('#a-step-0', 'Mix it.');
      await p.click('[data-act="add-save"]');
      await p.waitForTimeout(1400);
    };
    const editIt = async (p) => {
      await p.waitForSelector('.r-title');
      await p.click('[data-act="toggle-edit"]');
      await p.waitForSelector('#e-title');
      await p.fill('#e-notes', 'A note.');
      await p.click('[data-act="save"]');
      await p.waitForTimeout(1400);
    };

    /* The edit case uses a recipe out of the PUBLISHED file, with no
       overlay seeded — which is what "a recipe the family's book already
       has" means on a phone. Seeding one into the overlay instead would
       have tested the opposite thing: a recipe that exists only on this
       device is exactly what typing one in produces. */
    const SHIPPED = JSON.parse(require('fs').readFileSync(
      require('path').join(__dirname, '..', 'recipes.json'), 'utf8'))[0].id;

    const born = await shareOne({}, null, '#add', typeItIn('Shortbread'));
    chk('typing a new recipe in still reaches the family', born.puts.length === 1,
      String(born.puts.length));
    chk('and the write says it is a NEW recipe, not an edit of one',
      born.puts[0].isNew === true,
      'PUT ' + born.puts[0].path + ' — nothing on the wire tells create from edit');

    const changed = await shareOne({}, null, '#' + SHIPPED, editIt);
    chk('while editing a recipe the book already has does not', changed.puts.length === 1 &&
      changed.puts[0].isNew === false, JSON.stringify(changed.puts.map(x => x.path + (x.isNew ? '?new=1' : ''))));
    chk('so the two opposite instructions are distinguishable on the wire',
      born.puts[0].isNew !== changed.puts[0].isNew);

    /* The half that makes the first half safe. If the id WAS taken, the
       server suffixes and answers with the id it used — and the phone has
       to remember that, or the reader's next edit walks straight onto the
       stranger's row and destroys it one step later. */
    const taken = await shareOne({ putId: 'shortbread-2' }, null, '#add',
      typeItIn('Shortbread'));
    chk('when the family’s book had that name already, the phone remembers where its copy went',
      taken.shared && taken.shared['shortbread'] === 'shortbread-2',
      JSON.stringify(taken.shared));
    chk('and says so, rather than leaving the reader to find out',
      /already/i.test(taken.notice) && /shortbread-2/.test(taken.notice), taken.notice);

    /* Second write, same phone, same recipe: it must go to the address the
       family's book actually used. */
    const after = await shareOne({ putId: 'shortbread-2' }, null, '#add',
      async (p) => {
        await typeItIn('Shortbread')(p);
        await p.goto(B + '/index.html#shortbread');
        await editIt(p);
      });
    chk('and the next edit of it is addressed there, not at the stranger’s recipe',
      after.puts.length === 2 && /\/api\/recipes\/shortbread-2$/.test(after.puts[1].path),
      JSON.stringify(after.puts.map(x => x.path)));
    chk('as an edit this time, because the book has confirmed that row',
      after.puts.length === 2 && after.puts[1].isNew === false,
      JSON.stringify(after.puts.map(x => x.isNew)));
    /* `putRecipe` refuses a body whose id disagrees with the address, on
       purpose. So addressing the moved row is only half of it — the recipe
       has to go up wearing the id the book gave it, or the write comes back
       400 and the reader is told their edit was rejected. */
    chk('and the recipe goes up wearing the id the book gave it',
      after.puts.length === 2 && after.puts[1].body.recipe.id === 'shortbread-2',
      after.puts.length === 2 ? String(after.puts[1].body.recipe.id) : 'no second write');
    chk('while this phone’s own copy keeps the id it was born with',
      after.puts.length === 2 && after.puts[0].body.recipe.id === 'shortbread',
      after.puts.length ? String(after.puts[0].body.recipe.id) : 'no write');

    /* `S13`'s queue re-sends by id and reads the recipe fresh. A create
       that failed and is sent again is still a create — sending it as an
       edit would put the destruction back on the slowest path, which is
       the one a sleeping Render makes ordinary. */
    const requeued = await shareOne({ failPut: { status: 503, error: 'waking' } },
      null, '#add', async (p) => {
        await typeItIn('Shortbread')(p);
        await p.goto(B + '/index.html#menu');
        await p.waitForSelector('.rcard');
        await p.evaluate(() => {
          const b = document.querySelector('[data-act="send-unsent"]');
          if (b) b.click();
        });
        await p.waitForTimeout(1400);
      });
    chk('a create that failed is offered again', requeued.puts.length === 2,
      JSON.stringify(requeued.puts.map(x => x.path)));
    chk('and is still sent as a create the second time',
      requeued.puts.length === 2 && requeued.puts[1].isNew === true,
      JSON.stringify(requeued.puts.map(x => x.isNew)));

    /* Found by asking what the map means once the recipe it describes is
       gone. `kt.shared` says "the family's book holds THIS PHONE'S copy of
       `shortbread` at `shortbread-2`". Drop that copy — Remove, or the undo
       — and the entry stops being true, because `shortbread` now means
       whatever the published file says it means. Which, after a nightly
       sync, is the OTHER person's recipe: their edit would be addressed at
       this phone's old row, land on the wrong recipe, and report success. */
    const dropIt = async (how) => {
      const { ctx, p, stub } = await freshPage(br, { putId: 'shortbread-2' });
      await p.addInitScript(k =>
        localStorage.setItem('kt.kitchenKey', JSON.stringify(k)), 'family-secret');
      p.on('dialog', d => d.accept());
      await p.goto(B + '/index.html#add');
      await typeItIn('Shortbread')(p);
      const before = await p.evaluate(() => localStorage.getItem('kt.shared'));
      await how(p);
      await p.waitForTimeout(500);
      const out = { before, after: await p.evaluate(() => localStorage.getItem('kt.shared')),
                    errs: p.errs.slice() };
      await ctx.close();
      return out;
    };

    const removed = await dropIt(async (p) => {
      await p.goto(B + '/index.html#menu');
      await p.waitForSelector('.rcard');
      await p.click('[data-act="toggle-remove"]');
      await p.waitForTimeout(300);
      await p.evaluate(() => {
        const b = document.querySelector('[data-act="remove"][data-id="shortbread"]');
        if (b) b.click();
      });
    });
    chk('the phone did record where its copy went', /shortbread-2/.test(removed.before || ''),
      String(removed.before));
    chk('and removing the recipe forgets it, so nothing points at that row any more',
      !/"shortbread"/.test(removed.after || ''), String(removed.after));

    const undone = await dropIt(async (p) => {
      await p.goto(B + '/index.html#shortbread');
      await p.waitForSelector('.r-title');
      await p.click('[data-act="toggle-edit"]');
      await p.waitForSelector('#e-title');
      await p.evaluate(() => {
        const b = document.querySelector('[data-act="reset-local"]');
        if (b) b.click();
      });
    });
    chk('and the undo, which throws every local copy away, forgets all of them',
      !undone.after || undone.after === '{}' || undone.after === 'null',
      String(undone.after));

    chk('nothing threw anywhere in the sweep',
      [born, changed, taken, after, requeued, removed, undone]
        .every(x => x.errs.length === 0),
      [born, changed, taken, after, requeued, removed, undone]
        .map(x => x.errs.join(' ')).join(' | '));
  }

  console.log('\n== Removing says which book it means (S10) ==');
  {
    /* One action, one scope, said the same way both times. `R71` wrote the
       photo half as "from this phone" because that is what it does; the
       other half said "from the collection", which is a bigger-sounding
       place and was already vague.

       The `S` arc made the vagueness a trap. On a phone that shares, "the
       collection" reads as everyone's book — and removal is deliberately
       local. Someone who removes a recipe believing it is gone for the
       family leaves it live for them AND loses their own copy, so they
       cannot even open it to put it right. */
    const removeAsk = async (key, recipeId) => {
      const ctx = await freshContext(br, { ...devices['iPhone 13'] });
      await ctx.route(API + '/**', r => r.abort('failed'));
      if (key) await ctx.addInitScript(k =>
        localStorage.setItem('kt.kitchenKey', JSON.stringify(k)), key);
      const p = await ctx.newPage();
      let asked = '';
      p.on('dialog', d => { asked = d.message(); d.dismiss(); });
      await p.goto(B + '/index.html#menu');
      await p.waitForSelector('.rcard');
      await p.click('[data-act="toggle-remove"]');
      await p.waitForTimeout(400);
      await p.evaluate(() => {
        const b = document.querySelector('[data-act="remove"]');
        if (b) b.click();
      });
      await p.waitForTimeout(500);
      const gone = await p.evaluate(() => !!localStorage.getItem('kt.recipes'));
      await ctx.close();
      return { asked, wroteAnything: gone };
    };

    const alone = await removeAsk('');
    chk('removing asks first', alone.asked.length > 10, alone.asked);
    chk('and dismissing it removes nothing', alone.wroteAnything === false);
    chk('it names this phone, not "the collection"',
      /from this phone\?/.test(alone.asked) && !/from the collection/.test(alone.asked),
      alone.asked);
    chk('and says nothing about everyone, because there is no everyone',
      !/everyone/i.test(alone.asked), alone.asked);

    const shares = await removeAsk('family-secret');
    chk('on a phone that shares it still names this phone',
      /from this phone\?/.test(shares.asked), shares.asked.split('\n')[0]);
    chk('and says the recipe stays in everyone else’s book',
      /stays in everyone else/i.test(shares.asked), shares.asked.slice(-90));
    chk('so nobody removes a recipe believing the family lost it too',
      /keeps to itself|stays in everyone/i.test(shares.asked));
    chk('and the passphrase is never printed in that dialog',
      !shares.asked.includes('family-secret'));
  }

  console.log('\n== The change made to twenty at once reached nobody (S11) ==');
  {
    /* `S04` wired sharing into the two places a recipe is written one at a
       time — Save in Edit mode, and Save on the Add screen (`S09`). It
       missed the two places the app writes to MANY recipes at once: Tag
       mode's "Add tags", and renaming or merging a tag in the Tags sheet.
       Both wrote the overlay and stopped.

       That is the worst place for this gap to be, because tag hygiene is
       the one part of the app built specifically to keep the whole book
       consistent (`067`–`069`). A rename that lands on one phone only is
       how the near-duplicate tags that machinery exists to prevent get
       made: phone A calls it "Scottish", phone B still says "scottish",
       and the next single edit from B puts the old spelling back into the
       family's book. Divergence with a slow leak.

       And both told the reader it was done — "Tagged 20 recipes.",
       "Renamed to X — 14 recipes updated." — with nothing to say that on
       this phone, "updated" had stopped meaning everyone. */
    const BOOK = [
      { id: 'aaa-one', title: 'Aaa One', category: 'Dinner', servings: 4,
        contributor: 'Joan', ingredients: ['1 onion'], steps: ['Cook it.'], tags: ['soup'] },
      { id: 'bbb-two', title: 'Bbb Two', category: 'Dinner', servings: 4,
        contributor: 'Joan', ingredients: ['2 onions'], steps: ['Cook them.'], tags: ['soup'] },
      { id: 'ccc-three', title: 'Ccc Three', category: 'Baking', servings: 4,
        contributor: 'Joan', ingredients: ['flour'], steps: ['Bake it.'] }
    ];

    const open = async (opts, key) => {
      const { ctx, p, stub } = await freshPage(br, opts);
      await p.addInitScript(b => localStorage.setItem('kt.recipes', JSON.stringify(b)), BOOK);
      if (key) await p.addInitScript(k =>
        localStorage.setItem('kt.kitchenKey', JSON.stringify(k)), key);
      await p.goto(B + '/index.html#menu');
      await p.waitForSelector('.rrow, .rcard, .cardgrid');
      return { ctx, p, stub };
    };
    const readOut = async (p, stub) => ({
      puts: stub.puts,
      /* The Menu renders its notice as a .hint paragraph; #route-live is the
         one stable live region and is what a screen reader actually gets.
         Both are read, and every assertion below is made against the spoken
         one — a sentence the reader can see but never hears is half a fix. */
      notice: await p.evaluate(() => {
        const n = document.getElementById('route-live');
        return n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
      }),
      seen: await p.evaluate(() => [...document.querySelectorAll('#app .hint, #app .notice')]
        .map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' ~ ')),
      stored: await p.evaluate(() => {
        const raw = localStorage.getItem('kt.recipes');
        return raw ? JSON.parse(raw).reduce((m, r) => (m[r.id] = (r.tags || []).join(','), m), {}) : {};
      }),
      errs: p.errs.slice()
    });

    /* ---- Tag mode: add a tag to two recipes at once ---- */
    const bulk = async (opts, key) => {
      const { ctx, p, stub } = await open(opts, key);
      await p.click('[data-act="toggle-tagging"]');
      await p.click('[data-act="tag-pick"][data-id="aaa-one"]');
      await p.click('[data-act="tag-pick"][data-id="ccc-three"]');
      await p.click('[data-act="open-bulk"]');
      await p.waitForSelector('#bulk-tags');
      await p.fill('#bulk-tags', 'Scottish');
      await p.click('[data-act="bulk-apply"]');
      await p.waitForTimeout(1800);
      const out = await readOut(p, stub);
      await ctx.close();
      return out;
    };

    const bQuiet = await bulk({}, '');
    chk('with no passphrase a bulk tag still goes nowhere', bQuiet.puts.length === 0,
      String(bQuiet.puts.length));
    chk('and is still applied on the phone',
      /Scottish/.test(bQuiet.stored['aaa-one']) && /Scottish/.test(bQuiet.stored['ccc-three']),
      JSON.stringify(bQuiet.stored));
    chk('and claims nothing about the family', !/famil/i.test(bQuiet.notice), bQuiet.notice);

    const bSent = await bulk({}, 'family-secret');
    chk('with one, every recipe it touched is sent', bSent.puts.length === 2,
      String(bSent.puts.length));
    chk('each to its own address, and only the ones picked',
      bSent.puts.map(x => x.path.split('/').pop()).sort().join(',') === 'aaa-one,ccc-three',
      bSent.puts.map(x => x.path).join(' '));
    chk('carrying the passphrase',
      bSent.puts.length === 2 && bSent.puts.every(x => x.key === 'family-secret'));
    chk('and the new tag, not the old record',
      bSent.puts.length === 2 &&
      bSent.puts.every(x => (x.body.recipe.tags || []).indexOf('Scottish') > -1),
      JSON.stringify(bSent.puts.map(x => x.body.recipe.tags)));
    chk('the untouched recipe is not sent',
      bSent.puts.length === 2 && !bSent.puts.some(x => /bbb-two/.test(x.path)));
    chk('and the reader is told both halves happened',
      /2 recipes/.test(bSent.notice) && /famil/i.test(bSent.notice), bSent.notice);
    chk('and can see the same sentence, not only hear it',
      bSent.seen.indexOf(bSent.notice) > -1, bSent.seen);
    /* The republish has to read a database holding the WHOLE change. Every
       write but the last says "more coming", so the poke fires once, after
       the last row is in — rather than on the first, racing the rest. */
    chk('every write but the last says more is coming',
      bSent.puts.length === 2 && bSent.puts[0].more === true, JSON.stringify(bSent.puts.map(x => x.more)));
    chk('and the last one does not, so the republish fires there',
      bSent.puts[bSent.puts.length - 1].more === false,
      JSON.stringify(bSent.puts.map(x => x.more)));

    /* A sleeping kitchen refuses all of them the same way, so asking
       twenty times is twenty pointless waits. One is the measurement. */
    const bAsleep = await bulk({ failPut: { status: 503 } }, 'family-secret');
    chk('a sleeping kitchen is asked once, not once per recipe',
      bAsleep.puts.length === 1, String(bAsleep.puts.length));
    chk('the tags are still applied here', /Scottish/.test(bAsleep.stored['aaa-one']),
      JSON.stringify(bAsleep.stored));
    chk('and the notice does not claim the family has them',
      !/sent to the famil/i.test(bAsleep.notice) && /only on this phone|couldn/i.test(bAsleep.notice),
      bAsleep.notice);
    /* `S13` — and now points at the way back, which `S11` had no right to
       promise because it did not exist yet. */
    chk('and now says how to send it again',
      /send them again from the all recipes screen/i.test(bAsleep.notice), bAsleep.notice);

    /* A rate limit is the one answer a burst can actually provoke, and it is
       neither a refusal nor an outage. Half the change landing is the case
       the sentence has to survive. */
    const bBreak = await bulk({ failPutAfter: { after: 1, status: 429 } }, 'family-secret');
    chk('a kitchen asking for a break says so, not that it stopped answering',
      /asked for a break/i.test(bBreak.notice) && !/stopped answering/i.test(bBreak.notice),
      bBreak.notice);
    chk('and counts what did get through',
      /1 of 2/.test(bBreak.notice), bBreak.notice);
    chk('while still saying the rest are only here',
      /only on this phone/i.test(bBreak.notice), bBreak.notice);
    chk('and pointing at the button that sends them',
      /send them again/i.test(bBreak.notice), bBreak.notice);
    chk('and both recipes are tagged here regardless',
      /Scottish/.test(bBreak.stored['aaa-one']) && /Scottish/.test(bBreak.stored['ccc-three']),
      JSON.stringify(bBreak.stored));

    const bRefused = await bulk(
      { failPut: { status: 401, error: 'That passphrase is not the family’s one.' } },
      'wrong-one');
    chk('a refused passphrase repeats what the kitchen said',
      /not the family/i.test(bRefused.notice), bRefused.notice);
    chk('and does not invite a retry that would fail the same way',
      !/try again/i.test(bRefused.notice), bRefused.notice);
    chk('but does say what to do once it is sorted',
      /until that is sorted, and then send them again/i.test(bRefused.notice),
      bRefused.notice);

    /* ---- The Tags sheet: rename one tag across the book ---- */
    const rename = async (opts, key, to) => {
      const { ctx, p, stub } = await open(opts, key);
      await p.click('[data-act="open-filter"]');
      await p.waitForSelector('[data-act="tag-manage"]');
      await p.click('[data-act="tag-manage"]');
      await p.waitForSelector('[data-act="tag-edit"][data-key="soup"]');
      await p.click('[data-act="tag-edit"][data-key="soup"]');
      await p.waitForSelector('#tag-rename');
      await p.fill('#tag-rename', to);
      await p.click('[data-act="tag-rename-apply"]');
      await p.waitForTimeout(1800);
      const out = await readOut(p, stub);
      await ctx.close();
      return out;
    };

    const rQuiet = await rename({}, '', 'Broth');
    chk('with no passphrase a rename goes nowhere', rQuiet.puts.length === 0,
      String(rQuiet.puts.length));
    chk('and is still done on the phone',
      rQuiet.stored['aaa-one'] === 'Broth' && rQuiet.stored['bbb-two'] === 'Broth',
      JSON.stringify(rQuiet.stored));

    const rSent = await rename({}, 'family-secret', 'Broth');
    chk('with one, every renamed recipe is sent', rSent.puts.length === 2,
      String(rSent.puts.length));
    chk('carrying the new name, so two phones cannot drift apart',
      rSent.puts.length === 2 &&
      rSent.puts.every(x => (x.body.recipe.tags || []).join(',') === 'Broth'),
      JSON.stringify(rSent.puts.map(x => x.body.recipe.tags)));
    chk('the recipe that never had the tag is left alone',
      rSent.puts.length === 2 && !rSent.puts.some(x => /ccc-three/.test(x.path)));
    chk('and the reader is told the family got it too',
      /famil/i.test(rSent.notice), rSent.notice);
    chk('while still saying what happened here',
      /Broth/.test(rSent.notice) && /2 recipes/.test(rSent.notice), rSent.notice);

    const rAsleep = await rename({ failPut: { status: 503 } }, 'family-secret', 'Broth');
    chk('a rename the kitchen never took is not claimed as shared',
      !/sent to the famil/i.test(rAsleep.notice), rAsleep.notice);
    chk('and the rename still stands on this phone',
      rAsleep.stored['bbb-two'] === 'Broth', JSON.stringify(rAsleep.stored));

    chk('nothing threw across any of it',
      [].concat(bQuiet.errs, bSent.errs, bAsleep.errs, bBreak.errs, bRefused.errs,
                rQuiet.errs, rSent.errs, rAsleep.errs).length === 0,
      [].concat(bQuiet.errs, bSent.errs, bAsleep.errs, bBreak.errs, bRefused.errs,
                rQuiet.errs, rSent.errs, rAsleep.errs).join(' | '));
  }

  console.log('\n== The thirty seconds after "Saved" said nothing (S12) ==');
  {
    /* `S04` set `S.sharing` before the write and cleared it after, and
       `S.shared` on success — and NOTHING ever read either one. Write-only
       state that was meant to be an indicator and never became one.
       Measured: the phone's copy is saved, the button says "Saved ✓", and
       then a request runs for up to thirty seconds against a Render free
       tier that has to wake up. In that window the screen says nothing at
       all, and `shareEdit` passes `quiet` to `kitchenFetch` on purpose, so
       even the "waking up the kitchen…" card is suppressed. Somebody who
       closes the page there loses a change they had every reason to think
       was finished — the app had told them it was saved and then gone
       silent while it was still working.

       The split this fixes: **the eye gets progress, the ear gets one
       sentence.** A 48-recipe burst must not speak forty-eight times. */
    const BOOK2 = [
      { id: 'aaa-one', title: 'Aaa One', category: 'Dinner', servings: 4,
        contributor: 'Joan', ingredients: ['1 onion'], steps: ['Cook it.'], tags: ['soup'] },
      { id: 'bbb-two', title: 'Bbb Two', category: 'Dinner', servings: 4,
        contributor: 'Joan', ingredients: ['2 onions'], steps: ['Cook them.'], tags: ['soup'] }
    ];
    const onScreen = (p) => p.evaluate(() =>
      [...document.querySelectorAll('#app .notice, #app .hint')]
        .map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' ~ '));
    const spoken = (p) => p.evaluate(() => {
      const n = document.getElementById('route-live');
      return n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
    });

    /* ---- one recipe: the window between "Saved" and the answer ---- */
    const single = async (key, delay) => {
      const { ctx, p, stub } = await freshPage(br, { putDelayMs: delay });
      if (key) await p.addInitScript(k =>
        localStorage.setItem('kt.kitchenKey', JSON.stringify(k)), key);
      await p.goto(B + '/index.html#ninja-cookies');
      await p.waitForSelector('.r-title');
      await p.click('[data-act="toggle-edit"]');
      await p.waitForSelector('#e-title');
      await p.fill('#e-title', 'Ninja Cookies Waiting');
      await p.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => /^save/i.test(x.innerText.trim()));
        if (b) b.click();
      });
      await p.waitForTimeout(700);                       // mid-flight
      const midSeen = await onScreen(p), midSaid = await spoken(p);
      await p.waitForTimeout(delay + 1200);              // settled
      const endSeen = await onScreen(p), endSaid = await spoken(p);
      const errs = p.errs.slice();
      await ctx.close();
      return { midSeen, midSaid, endSeen, endSaid, puts: stub.puts, errs };
    };

    const waiting = await single('family-secret', 2500);
    chk('while the write is in flight the screen says so',
      /sending/i.test(waiting.midSeen) && /famil/i.test(waiting.midSeen), waiting.midSeen);
    chk('and it is still clear the phone already has it',
      /saved/i.test(waiting.midSeen), waiting.midSeen);
    chk('the reader is told out loud once, not left silent',
      /sending/i.test(waiting.midSaid), waiting.midSaid);
    chk('and when it lands the waiting line is gone',
      !/sending/i.test(waiting.endSeen), waiting.endSeen);
    chk('replaced by what actually happened',
      /famil/i.test(waiting.endSeen) && /few minutes|nightly/i.test(waiting.endSeen),
      waiting.endSeen);

    /* A phone with no passphrase has nothing in flight and must not be told
       to wait for anything. */
    const quiet2 = await single('', 2500);
    chk('a phone that shares nothing never shows a waiting line',
      !/sending/i.test(quiet2.midSeen + ' ' + quiet2.endSeen),
      quiet2.midSeen + ' | ' + quiet2.endSeen);
    chk('and sends nothing, as before', quiet2.puts.length === 0);

    /* ---- many recipes: progress for the eye, one sentence for the ear ---- */
    const burst = async () => {
      const { ctx, p, stub } = await freshPage(br, { putDelayMs: 1500 });
      await p.addInitScript(b => localStorage.setItem('kt.recipes', JSON.stringify(b)), BOOK2);
      await p.addInitScript(k =>
        localStorage.setItem('kt.kitchenKey', JSON.stringify(k)), 'family-secret');
      await p.goto(B + '/index.html#menu');
      await p.waitForSelector('.cardgrid, .rrow, .rcard');
      await p.click('[data-act="toggle-tagging"]');
      await p.click('[data-act="tag-pick"][data-id="aaa-one"]');
      await p.click('[data-act="tag-pick"][data-id="bbb-two"]');
      await p.click('[data-act="open-bulk"]');
      await p.waitForSelector('#bulk-tags');
      await p.fill('#bulk-tags', 'Scottish');
      await p.click('[data-act="bulk-apply"]');
      await p.waitForTimeout(700);                       // inside recipe 1
      const a = { seen: await onScreen(p), said: await spoken(p) };
      await p.waitForTimeout(1600);                      // inside recipe 2
      const b2 = { seen: await onScreen(p), said: await spoken(p) };
      await p.waitForTimeout(2200);                      // settled
      const c = { seen: await onScreen(p), said: await spoken(p) };
      const errs = p.errs.slice();
      await ctx.close();
      return { a, b: b2, c, puts: stub.puts, errs };
    };

    const many = await burst();
    chk('a burst shows how far it has got', /1 of 2/.test(many.a.seen), many.a.seen);
    chk('and the count moves as it goes', /2 of 2/.test(many.b.seen), many.b.seen);
    chk('while the spoken sentence stays put, so it is not read out per recipe',
      many.a.said === many.b.said && /sending/i.test(many.a.said),
      many.a.said + ' -> ' + many.b.said);
    chk('and the local half is on screen the whole time',
      /2 recipes/.test(many.a.seen) && /2 recipes/.test(many.b.seen), many.a.seen);
    chk('when it finishes the progress line goes', !/sending/i.test(many.c.seen), many.c.seen);
    chk('and the ear is told the outcome', /famil/i.test(many.c.said), many.c.said);
    chk('both recipes really went', many.puts.length === 2, String(many.puts.length));
    chk('nothing threw across any of it',
      [].concat(waiting.errs, quiet2.errs, many.errs).length === 0,
      [].concat(waiting.errs, quiet2.errs, many.errs).join(' | '));
  }

  console.log('\n== A phone with no signal is not a sleeping server (R144) ==');
  {
    /* Nothing in the app or the service worker has ever consulted
       `navigator.onLine`. So a failed share says the same thing whatever
       stopped it, and one of the two things it says is wrong.

       Measured, with the same edit saved twice:

         kitchen unreachable, phone online → "…couldn't be reached just now,
                                             so this change is still only
                                             here — try Save again in a
                                             minute."
         phone offline, no signal at all  → the identical sentence.

       "Try Save again in a minute" is good advice for a sleeping Render and
       useless in a kitchen with no bars: pressing it again in a minute fails
       again, and again, and the sentence never suggests the one thing that
       would help. This app precaches its whole shell so the book opens with
       no signal — the service worker's own comment says "in a kitchen with
       one bar" — and then the one place it matters, telling somebody why
       their change did not reach the family, never asks the question the
       browser answers for free.

       `R107`'s design is the shape of the fix: `kitchenFetch` carries FACTS
       — `answered` governs retrying, `status` governs what a caller may say
       — and the caller words it. `offline` is a third fact in the same
       shape. It only ever improves the sentence: `navigator.onLine === false`
       means definitely offline, while `true` guarantees nothing, so the
       request is still attempted and still retried exactly as before. */
    const saveOne = async (offline) => {
      const { ctx, p, stub } = await freshPage(br, { failPut: null });
      await p.addInitScript(k =>
        localStorage.setItem('kt.kitchenKey', JSON.stringify(k)), 'family-secret');
      await p.goto(B + '/index.html#bacon-ranch-chicken-casserole');
      await p.waitForSelector('[data-act="toggle-edit"]');
      /* The kitchen is unreachable either way; what differs is whether the
         PHONE knows it is offline. */
      await ctx.route(API + '/**', (route) => route.abort('failed'));
      if (offline) await ctx.setOffline(true);
      await p.click('[data-act="toggle-edit"]');
      await p.waitForSelector('#e-notes');
      await p.fill('#e-notes', 'A note.');
      await p.click('[data-act="save"]');
      await p.waitForTimeout(9000);
      const out = await p.evaluate(() => ({
        online: navigator.onLine,
        notice: (document.querySelector('.notice') || {}).textContent
          .replace(/\s+/g, ' ').trim(),
        unsent: (function () {
          try { return JSON.parse(localStorage.getItem('kt.unsent') || '[]'); }
          catch (e) { return []; }
        })()
      }));
      out.errs = p.errs.slice();
      await ctx.close();
      return out;
    };

    const asleep = await saveOne(false);
    const noSignal = await saveOne(true);

    chk('the two states really are different to the browser',
      asleep.online === true && noSignal.online === false,
      JSON.stringify([asleep.online, noSignal.online]));
    chk('a sleeping kitchen still says to try again in a minute',
      /try save again in a minute/i.test(asleep.notice), asleep.notice);
    chk('but a phone with no signal is not told to keep pressing Save',
      !/try save again in a minute/i.test(noSignal.notice), noSignal.notice);
    chk('it is told the connection is the problem',
      /online|connection|signal/i.test(noSignal.notice), noSignal.notice);
    chk('and both keep the change waiting rather than losing it',
      asleep.unsent.indexOf('bacon-ranch-chicken-casserole') > -1 &&
      noSignal.unsent.indexOf('bacon-ranch-chicken-casserole') > -1,
      JSON.stringify([asleep.unsent, noSignal.unsent]));
    chk('and both still say the phone has it',
      /saved on this phone/i.test(asleep.notice) && /saved on this phone/i.test(noSignal.notice),
      JSON.stringify([asleep.notice, noSignal.notice]));
    /* The bulk half. `S11` ended its sentences at "still only on this
       phone" until `S13` gave them somewhere to point, so this one already
       carried advice that works with no signal — only the CAUSE was wrong,
       and naming the kitchen for the phone's own connection is the same
       fault one size up. */
    const bulkOffline = async () => {
      const TWO = [
        { id: 'mine-one', title: 'Mine One', category: 'Baking', contributor: 'Jason',
          servings: 4, ingredients: ['a'], steps: ['b'] },
        { id: 'mine-two', title: 'Mine Two', category: 'Baking', contributor: 'Jason',
          servings: 4, ingredients: ['c'], steps: ['d'] }
      ];
      const { ctx, p } = await freshPage(br, {});
      await p.addInitScript(k =>
        localStorage.setItem('kt.kitchenKey', JSON.stringify(k)), 'family-secret');
      await p.addInitScript(v => localStorage.setItem('kt.recipes', v), JSON.stringify(TWO));
      await p.goto(B + '/index.html#menu');
      await p.waitForSelector('.rcard');
      await ctx.route(API + '/**', (route) => route.abort('failed'));
      await ctx.setOffline(true);
      await p.click('[data-act="toggle-tagging"]');
      await p.waitForSelector('[data-act="tag-pick"][data-id="mine-one"]');
      await p.click('[data-act="tag-pick"][data-id="mine-one"]');
      await p.click('[data-act="open-bulk"]');
      await p.waitForSelector('#bulk-tags');
      await p.fill('#bulk-tags', 'Scottish');
      await p.click('[data-act="bulk-apply"]');
      await p.waitForTimeout(9000);
      const out = await p.evaluate(() => {
        /* The Menu draws its notice slot as `.hint`, not `.notice` —
           `noticeHtml` takes the class from the screen that calls it. */
        const n = document.querySelector('.notice, .hint');
        return {
          notice: n ? n.textContent.replace(/\s+/g, ' ').trim() : '',
          screen: (document.querySelector('#app') || {}).innerText
            .replace(/\s+/g, ' ').trim().slice(0, 120)
        };
      });
      out.errs = p.errs.slice();
      await ctx.close();
      return out;
    };
    const bulk = await bulkOffline();
    chk('the bulk change really reported something',
      bulk.notice.length > 0, JSON.stringify(bulk.screen));
    chk('a bulk change with no signal blames the phone, not the kitchen',
      /isn’t online|not online/i.test(bulk.notice) &&
      !/book couldn’t be reached/i.test(bulk.notice), bulk.notice);
    chk('and still points at the way to send them later',
      /all recipes screen/i.test(bulk.notice), bulk.notice);

    chk('nothing threw either way',
      [].concat(asleep.errs, noSignal.errs, bulk.errs).length === 0,
      [].concat(asleep.errs, noSignal.errs, bulk.errs).join(' | '));
  }

  console.log('\n== The disabling that stops a second paid job (R143) ==');
  {
    /* `R142` found an indicator that was never a guard on the write path,
       so this round went looking for the same fault on the path that spends
       money — and did not find it. `S.addBusy` is read in only two places
       and neither is a guard, but the SUBMIT BUTTON reads it in the render
       and disables itself, which stops the second tap just as well and is
       the visible way to do it.

       What was missing is the check. A job is yt-dlp, then Groq Whisper,
       then a `claude-opus-5` call — `backend/lib/budget.js` exists because
       those cost money, and a duplicate also spends one of the family's
       forty imports a day and leaves two drafts for one video. The only
       thing standing between a double tap and that was one attribute, and
       nothing in any suite looked at it.

       Measured before this was written: with the write held open, the
       button is present and `disabled`, and a click on it times out rather
       than posting. Both halves matter — present, so the reader can still
       see where they are, and disabled, so the tap costs nothing. */
    const { ctx, p, stub } = await freshPage(br, { postDelayMs: 9000 });
    await p.goto(B + '/index.html#add');
    await p.waitForSelector('.pathbtn');
    await p.click('.pathbtn[data-key="video"]');
    await p.waitForSelector('#a-vurl');
    chk('the Start button is live before anything is sent',
      !(await p.locator('[data-act="video-submit"]').isDisabled()));
    await p.fill('#a-vurl', 'https://youtu.be/abc12345678');
    await p.click('[data-act="video-submit"]');
    await p.waitForTimeout(600);

    chk('while the kitchen is being reached the busy line says so',
      /sending the link/i.test(await p.evaluate(() =>
        (document.querySelector('.notice') || {}).textContent || '')));
    chk('the button is still there, so the reader can see where they are',
      await p.locator('[data-act="video-submit"]').count() === 1);
    chk('but it is disabled, which is what stops a second paid job',
      await p.locator('[data-act="video-submit"]').isDisabled());
    let tapped = 'landed';
    try { await p.click('[data-act="video-submit"]', { timeout: 2500 }); }
    catch (e) { tapped = 'refused'; }
    chk('so a second tap cannot land at all', tapped === 'refused', tapped);
    chk('and one link is one job', stub.posts.length === 1,
      JSON.stringify(stub.posts.map(x => x.url)));
    chk('nothing threw', p.errs.length === 0, p.errs.join(' | '));
    await ctx.close();
  }

  console.log('\n== Two taps on Save must not be two writes (R142) ==');
  {
    /* Render's free tier sleeps, so a write can hang for the best part of
       half a minute — `S12` built the "Sending to the family's book…" line
       for exactly that window. Nothing stopped a reader tapping Save again
       inside it, and `shareEdit` set `S.sharing` and fired without ever
       asking whether one was already in the air.

       Measured, with the write held open for three seconds:

         an EDIT   two taps → two writes. The first reply cleared `S.sharing`
                   and the notice changed to "Saved, and sent to the family's
                   book" while the second request was still running — `S12`'s
                   fault back through a door nobody was watching.

         a CREATE  two taps → two writes, both carrying `?new=1`. The server
                   does what `R127` tells it to and suffixes rather than
                   overwrites, so the family's book ends up holding TWO
                   copies of one recipe because one person tapped twice —
                   and `kt.shared` records the second, so this phone's next
                   edit addresses the duplicate and the original is orphaned
                   in everyone's book, edited by nobody. The reader is even
                   shown `R127`'s disclosure, which blames a stranger for a
                   collision this phone made with itself.

       One send at a time, and the change that could not go now rides the
       queue `S13` built for exactly "this did not get through". */
    const MINE = [{ id: 'my-own-shortbread', title: 'My Own Shortbread',
      category: 'Baking', contributor: 'Jason', servings: 6,
      ingredients: ['200g butter'], steps: ['Bake it.'] }];
    let midNotice = '';
    const tapTwice = (firstNote, secondNote) => async (p) => {
      await p.waitForSelector('.r-title');
      await p.click('[data-act="toggle-edit"]');
      await p.waitForSelector('#e-notes');
      await p.fill('#e-notes', firstNote);
      await p.click('[data-act="save"]');
      await p.waitForTimeout(300);
      /* A second, genuinely different change, saved while the first write
         is still in the air — so "was it lost?" is a real question. */
      await p.fill('#e-notes', secondNote);
      await p.click('[data-act="save"]');
      await p.waitForTimeout(300);
      midNotice = await p.evaluate(() => {
        const n = document.querySelector('.notice');
        return n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
      });
      await p.waitForTimeout(3400);
    };
    /* `shareOne` lives inside `R127`'s block, so this keeps its own. */
    const oneShare = async (opts, seed, hash, act) => {
      const { ctx, p, stub } = await freshPage(br, opts);
      await p.addInitScript(k =>
        localStorage.setItem('kt.kitchenKey', JSON.stringify(k)), 'family-secret');
      if (seed) await p.addInitScript(v =>
        localStorage.setItem('kt.recipes', v), JSON.stringify(seed));
      await p.goto(B + '/index.html' + hash);
      await act(p);
      const out = {
        puts: stub.puts,
        shared: await p.evaluate(() => {
          const raw = localStorage.getItem('kt.shared');
          return raw ? JSON.parse(raw) : null;
        }),
        unsent: await p.evaluate(() => {
          try { return JSON.parse(localStorage.getItem('kt.unsent') || '[]'); }
          catch (e) { return 'UNPARSEABLE'; }
        }),
        notes: await p.evaluate(() => {
          const f = document.querySelector('#e-notes');
          return f ? f.value : (document.querySelector('.r-notes') || {}).textContent || '';
        }),
        errs: p.errs.slice()
      };
      await ctx.close();
      return out;
    };

    const dblEdit = await oneShare({ putDelayMs: 3000 }, null,
      '#bacon-ranch-chicken-casserole', tapTwice('One.', 'Two.'));
    chk('a second tap while the first write is in the air is not a second write',
      dblEdit.puts.length === 1, JSON.stringify(dblEdit.puts.map(x => x.path)));
    chk('and the reader is told the change is waiting rather than sent',
      /still|waiting|already sending|when the current/i.test(midNotice), JSON.stringify(midNotice));
    /* The second change was a different one. Skipping its send must not lose
       it — `S13`'s queue is exactly where "this did not get through" goes. */
    chk('and the change that could not go is queued rather than dropped',
      Array.isArray(dblEdit.unsent) &&
      dblEdit.unsent.indexOf('bacon-ranch-chicken-casserole') > -1,
      JSON.stringify(dblEdit.unsent));

    const dblNew = await oneShare({ putDelayMs: 3000 }, MINE,
      '#my-own-shortbread', tapTwice('One.', 'Two.'));
    chk('a recipe this phone made is created once, not twice',
      dblNew.puts.length === 1 && dblNew.puts[0].isNew === true,
      JSON.stringify(dblNew.puts.map(x => ({ p: x.path, n: x.isNew }))));
    /* And the bulk path, which is the one `S13` says matters most: redoing a
       bulk tag means re-picking every recipe, and a rename cannot be redone
       at all. Saving a recipe and then going off to tag things while the
       write is still in the air is an ordinary thing to do on a phone. */
    const TWO = [
      { id: 'mine-one', title: 'Mine One', category: 'Baking', contributor: 'Jason',
        servings: 4, ingredients: ['a'], steps: ['b'] },
      { id: 'mine-two', title: 'Mine Two', category: 'Baking', contributor: 'Jason',
        servings: 4, ingredients: ['c'], steps: ['d'] }
    ];
    const bulkMid = await oneShare({ putDelayMs: 3000 }, TWO, '#mine-one',
      async (p) => {
        await p.waitForSelector('.r-title');
        await p.click('[data-act="toggle-edit"]');
        await p.waitForSelector('#e-notes');
        await p.fill('#e-notes', 'A note.');
        await p.click('[data-act="save"]');
        await p.waitForTimeout(300);
        await p.evaluate(() => { location.hash = '#menu'; });
        await p.waitForSelector('.rcard');
        await p.click('[data-act="toggle-tagging"]');
        await p.waitForSelector('[data-act="tag-pick"][data-id="mine-two"]');
        await p.click('[data-act="tag-pick"][data-id="mine-two"]');
        await p.click('[data-act="open-bulk"]');
        await p.waitForSelector('#bulk-tags');
        await p.fill('#bulk-tags', 'Scottish');
        await p.click('[data-act="bulk-apply"]');
        await p.waitForTimeout(3400);
      });
    chk('a bulk change started mid-send is not interleaved with it',
      bulkMid.puts.length === 1, JSON.stringify(bulkMid.puts.map(x => x.path)));
    chk('and every recipe it touched is waiting rather than lost',
      Array.isArray(bulkMid.unsent) && bulkMid.unsent.indexOf('mine-two') > -1,
      JSON.stringify(bulkMid.unsent));

    chk('and nothing threw across any of it',
      [].concat(dblEdit.errs, dblNew.errs, bulkMid.errs).length === 0,
      [].concat(dblEdit.errs, dblNew.errs, bulkMid.errs).join(' | '));
  }

  console.log('\n== A change the kitchen could not take can be sent again (S13) ==');
  {
    /* `DECISIONS.md S` left this open on purpose. A single edit that failed
       said *try Save again in a minute*, which is one tap; a bulk tag change
       could not honestly say the same, because redoing it means re-picking
       every recipe and a rename cannot be redone at all once the old name is
       gone. So `S11` named the state and stopped — *the rest are still only
       on this phone* — rather than giving an instruction nobody could
       follow. The ruling said the real fix is a queue with a button, and
       that it is a feature rather than a sentence. This is the feature.

       What it must not become: a second copy of the recipes. The queue holds
       ids only, and every recipe it sends is read fresh from the overlay at
       the moment it sends — so a change made after the failure goes too, and
       an id whose recipe has since been removed simply drops out. */
    const BOOK3 = [
      { id: 'aaa-one', title: 'Aaa One', category: 'Dinner', servings: 4,
        contributor: 'Joan', ingredients: ['1 onion'], steps: ['Cook it.'], tags: ['soup'] },
      { id: 'bbb-two', title: 'Bbb Two', category: 'Dinner', servings: 4,
        contributor: 'Joan', ingredients: ['2 onions'], steps: ['Cook them.'], tags: ['soup'] }
    ];
    const openMenu = async (opts, key, seed, book) => {
      const { ctx, p, stub } = await freshPage(br, opts);
      await p.addInitScript(b => localStorage.setItem('kt.recipes', JSON.stringify(b)),
        book || BOOK3);
      if (key) await p.addInitScript(k =>
        localStorage.setItem('kt.kitchenKey', JSON.stringify(k)), key);
      if (seed !== undefined) await p.addInitScript(
        v => localStorage.setItem('kt.unsent', JSON.stringify(v)), seed);
      await p.goto(B + '/index.html#menu');
      await p.waitForSelector('.cardgrid, .rrow, .rcard');
      return { ctx, p, stub };
    };
    const outbox = (p) => p.evaluate(() => {
      const b = document.querySelector('[data-act="send-unsent"]');
      return b ? b.innerText.replace(/\s+/g, ' ').trim() : '';
    });
    const stored = (p) => p.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('kt.unsent') || 'null'); }
      catch (e) { return 'UNPARSEABLE'; }
    });

    /* A bulk tag the kitchen refused leaves both recipes queued. */
    const failed = await openMenu({ failPut: { status: 503 } }, 'family-secret');
    await failed.p.click('[data-act="toggle-tagging"]');
    await failed.p.click('[data-act="tag-pick"][data-id="aaa-one"]');
    await failed.p.click('[data-act="tag-pick"][data-id="bbb-two"]');
    await failed.p.click('[data-act="open-bulk"]');
    await failed.p.waitForSelector('#bulk-tags');
    await failed.p.fill('#bulk-tags', 'Scottish');
    await failed.p.click('[data-act="bulk-apply"]');
    await failed.p.waitForTimeout(1800);
    const queued = await stored(failed.p);
    chk('a bulk change the kitchen would not take is remembered',
      Array.isArray(queued) && queued.length === 2, JSON.stringify(queued));
    chk('and the screen offers to send it again',
      /send 2 changes/i.test(await outbox(failed.p)), await outbox(failed.p));
    await failed.ctx.close();

    /* The button sends what is queued, and clears it when it lands. */
    const retry = await openMenu({}, 'family-secret', ['aaa-one', 'bbb-two']);
    chk('a phone opened with a queue still offers to send it',
      /send 2 changes/i.test(await outbox(retry.p)), await outbox(retry.p));
    await retry.p.click('[data-act="send-unsent"]');
    await retry.p.waitForTimeout(1800);
    chk('tapping it sends every queued recipe', retry.stub.puts.length === 2,
      String(retry.stub.puts.length));
    chk('reading each one fresh from the phone, not from the queue',
      retry.stub.puts.every(x => x.body.recipe.title), 
      JSON.stringify(retry.stub.puts.map(x => x.body.recipe.title)));
    chk('and the queue is empty afterwards',
      (await stored(retry.p) || []).length === 0, JSON.stringify(await stored(retry.p)));
    chk('so the offer is gone', (await outbox(retry.p)) === '', await outbox(retry.p));
    await retry.ctx.close();

    /* A queued recipe that has since been removed is not a recipe any more. */
    const gone = await openMenu({}, 'family-secret', ['aaa-one', 'no-such-recipe']);
    chk('an id whose recipe is gone drops out of the count',
      /send 1 change\b/i.test(await outbox(gone.p)), await outbox(gone.p));
    await gone.p.click('[data-act="send-unsent"]');
    await gone.p.waitForTimeout(1500);
    chk('and is never sent', gone.stub.puts.length === 1 &&
      /aaa-one$/.test(gone.stub.puts[0].path),
      JSON.stringify(gone.stub.puts.map(x => x.path)));
    await gone.ctx.close();

    /* A phone that shares nothing has nothing to offer, whatever it holds. */
    const noKey = await openMenu({}, '', ['aaa-one', 'bbb-two']);
    chk('a phone with no passphrase is offered nothing',
      (await outbox(noKey.p)) === '', await outbox(noKey.p));
    await noKey.ctx.close();

    /* Coerced where it is read, like every other key this app reads back. */
    const junk = await openMenu({}, 'family-secret', { nope: 1 });
    chk('a queue that is not a list does not take the screen down',
      (await outbox(junk.p)) === '' && junk.p.errs.length === 0,
      junk.p.errs.join(' | '));
    const junk2 = await openMenu({}, 'family-secret', ['aaa-one', 7, null, 'aaa-one']);
    chk('and one holding rubbish keeps only the ids it can use',
      /send 1 change\b/i.test(await outbox(junk2.p)), await outbox(junk2.p));
    chk('nothing threw', junk2.p.errs.length === 0, junk2.p.errs.join(' | '));
    await junk.ctx.close(); await junk2.ctx.close();

    /* `R136` — and the undo has to take the queue with it.
     *
     * `R127` wrote the rule this breaks: an entry stops being true when the
     * copy it describes is gone. It then reasoned that `kt.unsent` needed no
     * equivalent, "because it is read through `byId` and an id with nothing
     * behind it simply drops out". That is true of Remove and false of the
     * undo: the undo drops the OVERLAY, so `byId` stops finding this phone's
     * changed copy and starts finding the PUBLISHED one — an id with
     * something behind it, and not the thing that was queued.
     *
     * So the reader presses the most honest button in the app, is told every
     * change on this phone is undone, and the Menu goes on offering to send
     * one to everyone. Tapping it sends the published copy back over the
     * family's row, which is a no-op on a good day and an overwrite of
     * somebody else's newer edit on a bad one.
     *
     * The id has to be one the published book really holds, because that is
     * the whole mechanism: an invented id drops out on its own and the
     * screen check goes quiet with the bug still in place — measured. So it
     * is TAKEN FROM the shipped file rather than typed here, which is the
     * only version of this test that cannot be hollowed out by an edit to
     * recipes.json. */
    const PUBLISHED = JSON.parse(require('fs').readFileSync(
      require('path').join(__dirname, '..', 'recipes.json'), 'utf8'));
    const REAL_ID = PUBLISHED[0].id;
    chk('the published book has an id to test the undo with', !!REAL_ID, REAL_ID);
    const REAL = [{ id: REAL_ID, title: PUBLISHED[0].title + ' (my way)',
      category: 'Dinner', servings: 4, contributor: 'Joan',
      ingredients: ['1 steak'], steps: ['Grill it.'] }];
    const undone = await openMenu({}, 'family-secret', [REAL_ID], REAL);
    chk('a queued change is offered before the undo',
      /send 1 change\b/i.test(await outbox(undone.p)), await outbox(undone.p));
    undone.p.on('dialog', d => d.accept());
    await undone.p.evaluate((id) => { location.hash = '#' + id; }, REAL_ID);
    await undone.p.waitForSelector('[data-act="toggle-edit"]');
    await undone.p.click('[data-act="toggle-edit"]');
    await undone.p.waitForSelector('[data-act="reset-local"]');
    await undone.p.click('[data-act="reset-local"]');
    await undone.p.waitForTimeout(400);
    await undone.p.evaluate(() => { location.hash = '#menu'; });
    await undone.p.waitForSelector('.cardgrid, .rrow, .rcard');
    chk('the undo takes the queue with it',
      (await outbox(undone.p)) === '', await outbox(undone.p));
    chk('and the queue is empty in storage, not just on screen',
      ((await stored(undone.p)) || []).length === 0,
      JSON.stringify(await stored(undone.p)));
    chk('and the undo sends nothing \u2014 it undoes, it does not flush',
      undone.stub.puts.length === 0,
      JSON.stringify(undone.stub.puts.map(x => x.path)));
    chk('and nothing threw across the undo', undone.p.errs.length === 0,
      undone.p.errs.join(' | '));
    await undone.ctx.close();

    /* And on a phone that shares nothing, where the offer was never on
       screen to give it away. The queue outlives the passphrase — someone
       who clears that box and later puts it back would meet the same stale
       offer, with no undo left to blame. */
    const quietUndo = await openMenu({}, '', [REAL_ID], REAL);
    quietUndo.p.on('dialog', d => d.accept());
    await quietUndo.p.evaluate((id) => { location.hash = '#' + id; }, REAL_ID);
    await quietUndo.p.waitForSelector('[data-act="toggle-edit"]');
    await quietUndo.p.click('[data-act="toggle-edit"]');
    await quietUndo.p.waitForSelector('[data-act="reset-local"]');
    await quietUndo.p.click('[data-act="reset-local"]');
    await quietUndo.p.waitForTimeout(400);
    chk('the undo empties the queue whether or not this phone shares',
      ((await stored(quietUndo.p)) || []).length === 0,
      JSON.stringify(await stored(quietUndo.p)));
    await quietUndo.ctx.close();

    /* The other half of `R127`'s sentence, which is still true and is left
       alone on purpose: Remove takes the recipe out of the overlay, so `byId`
       finds nothing and the id drops out with no bookkeeping at all. Pinned
       so the asymmetry stays a decision rather than an accident. */
    const removed = await openMenu({}, 'family-secret', ['aaa-one', 'bbb-two']);
    removed.p.on('dialog', d => d.accept());
    await removed.p.click('[data-act="toggle-remove"]');
    await removed.p.waitForSelector('[data-act="remove"][data-id="aaa-one"]');
    await removed.p.click('[data-act="remove"][data-id="aaa-one"]');
    await removed.p.waitForTimeout(400);
    await removed.p.evaluate(() => { location.hash = '#menu'; });
    await removed.p.waitForTimeout(200);
    chk('a removed recipe drops out of the queue with no bookkeeping',
      /send 1 change\b/i.test(await outbox(removed.p)), await outbox(removed.p));
    await removed.ctx.close();
  }

  console.log('\n== R173: a video draft met neither of the two tag defences ==');
  {
    /* Tags enter this book three ways. Bulk tagging IMPOSES the book's
       spelling (`067`: "bulk tagging must not mint near-duplicates"); typing
       is OFFERED it (`R170`); a video draft met neither, so a model
       answering `scottish` against a book that already says `Scottish`
       minted the twin both of those exist to prevent. The extractor's own
       prompt steers it that way — its example tag is `air fryer`, lower
       case, beside a book whose cuisines are all title case.

       The tag is taken FROM `recipes.json` so this cannot go stale when the
       content changes, with a floor in case the book is ever untagged. */
    const shipped = JSON.parse(require('fs').readFileSync(
      require('path').join(__dirname, '..', 'recipes.json'), 'utf8'));
    const counts = {};
    shipped.forEach(r => (r.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
    const known = Object.keys(counts).filter(t => t !== t.toLowerCase())
      .sort((a, b) => counts[b] - counts[a])[0];
    chk('(floor) the shipped book holds a tag that is not all lower case',
      !!known, JSON.stringify(Object.keys(counts)));

    const { ctx, p } = await freshPage(br, {
      polls: [{ id: 7, status: 'ready_for_review', result_json:
        Object.assign({}, READY_RESULT, { tags: [known.toLowerCase(), 'weeknight'] }) }]
    });
    await p.goto(B + '/index.html#add');
    await p.click('.pathbtn[data-key="video"]');
    await p.fill('#a-vurl', 'https://youtu.be/vid1');
    await p.click('[data-act="video-submit"]');
    await p.waitForSelector('#a-tags', { timeout: 15000 });
    const got = await p.inputValue('#a-tags');
    chk('a tag the book already has arrives spelled the way the book spells it',
      got.indexOf(known) > -1 && got.indexOf(known.toLowerCase() + ',') !== 0, got + ' want ' + known);
    chk('(floor) and one the book has never seen is left exactly as written',
      /\bweeknight\b/.test(got) && !/Weeknight/.test(got), got);

    /* The distinction that decides WHERE the fix goes. `normalizeDraft` is
       also the restore path (task `084`), and a restored draft's tags are
       the reader's own words coming back from a refresh — rewriting those is
       exactly what `R170` decided not to do. */
    await p.fill('#a-tags', known.toLowerCase() + ', weeknight');
    await p.waitForTimeout(600);
    await p.reload();
    await p.waitForSelector('#a-tags');
    chk('but a reader’s own casing survives a refresh untouched',
      (await p.inputValue('#a-tags')).indexOf(known.toLowerCase()) === 0,
      await p.inputValue('#a-tags'));
    chk('nothing threw', p.errs.length === 0, p.errs.join(' | '));
    await ctx.close();
  }

  console.log('\nvideo: ' + pass + ' passed, ' + fail + ' failed');
  await br.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SUITE CRASH:', e); process.exit(1); });
