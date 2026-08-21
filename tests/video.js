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
  const o = Object.assign({ polls: [], ready: [], failed: [], accepted: [], posts: [], failPost: null, postDelayMs: 0 }, opts);
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
    if (req.method() === 'POST' && /\/accept$/.test(u.pathname)) {
      o.accepted.push({ path: u.pathname, body: req.postDataJSON() });
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

  console.log('\nvideo: ' + pass + ' passed, ' + fail + ' failed');
  await br.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SUITE CRASH:', e); process.exit(1); });
