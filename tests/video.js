/* From a video — the fourth import path and the only one that leaves the
 * page. The kitchen server is stubbed by route interception on a fake https
 * origin (kt.importApi points there), so the suite is hermetic: nothing here
 * touches the network, Render, or a real video.
 */
const { chromium, devices } = require('playwright');
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
  const o = Object.assign({ polls: [], ready: [], failed: [], accepted: [], posts: [], failPost: null, failAccept: null, puts: [], failPut: null, publishing: true, postDelayMs: 0 }, opts);
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
                    body: req.postDataJSON() });
      if (o.failPut) return json(o.failPut.status, { error: o.failPut.error || '' });
      return json(200, { ok: true, id: u.pathname.split('/').pop(),
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
  const ctx = await br.newContext({ ...devices['iPhone 13'] });
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

  console.log('\n== Share sheet → auto-submit ==');
  {
    const { ctx, p, stub } = await freshPage(br, {
      polls: [{ id: 7, status: 'downloading', eta_seconds: 60, overrun: false }]
    });
    await p.goto(B + '/index.html?url=' + encodeURIComponent('https://youtu.be/shared1'));
    await p.waitForSelector('.vprog', { timeout: 12000 });
    chk('a shared video link submits itself', stub.posts.length === 1 && stub.posts[0].url === 'https://youtu.be/shared1');
    chk('the query is consumed from the address bar', await p.evaluate(() => location.search) === '');
    chk('and the app is on #add', await p.evaluate(() => location.hash) === '#add');
    await ctx.close();
  }
  {
    const { ctx, p, stub } = await freshPage(br, {});
    await p.goto(B + '/index.html?text=' + encodeURIComponent('Look! https://youtu.be/intext via app'));
    await p.waitForSelector('.vprog, .notice--bad', { timeout: 12000 });
    chk('the url is fished out of shared text', stub.posts.length === 1 && stub.posts[0].url === 'https://youtu.be/intext');
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
      const ctx = await br.newContext({ ...devices['iPhone 13'] });
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
      const ctx = await br.newContext({ ...devices['iPhone 13'] });
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
      const ctx = await br.newContext({ ...devices['iPhone 13'] });
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
      const ctx = await br.newContext({ ...devices['iPhone 13'] });
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
      const ctx = await br.newContext({ ...devices['iPhone 13'] });
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

  console.log('\nvideo: ' + pass + ' passed, ' + fail + ' failed');
  await br.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SUITE CRASH:', e); process.exit(1); });
