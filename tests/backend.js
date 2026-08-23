/* The import server's logic, no network and no browser: URL validation, ETA
 * math, VTT cleanup, frame dedupe, extraction shaping — and the whole
 * pipeline walked once with yt-dlp/ffmpeg faked by shell scripts and the
 * database and the extraction API stubbed in-process. Run directly: node tests/backend.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const chk = (n, c, e = '') => c ? (pass++, console.log('  PASS ' + n))
  : (fail++, console.log('  FAIL ' + n + (e ? ' :: ' + e : '')));

/* The PO-token pair may or may not be fetched in the environment running
 * this suite (get-tools.sh puts it in backend/bin). Every yt-dlp arg
 * assertion below expects the bare calls, so tokens are switched off for
 * the whole suite and switched on only inside their own shape check. */
process.env.KT_NO_POT = '1';

const lib = p => require(path.join(__dirname, '..', 'backend', 'lib', p));
const { parseVideoUrl, validateRecipe } = lib('validate');
const { LABEL, estimate } = lib('eta');
const { serialQueue } = lib('queue');
const media = lib('media');
const extract = lib('extract');
const { runJob, computeFps } = lib('pipeline');

(async () => {
  console.log('\n== parseVideoUrl ==');
  chk('youtube watch', parseVideoUrl('https://www.youtube.com/watch?v=abc').platform === 'youtube');
  chk('youtu.be', parseVideoUrl('https://youtu.be/abc').platform === 'youtube');
  chk('shorts', parseVideoUrl('https://youtube.com/shorts/xyz').platform === 'youtube');
  chk('m.youtube', parseVideoUrl('https://m.youtube.com/watch?v=a').platform === 'youtube');
  chk('instagram reel', parseVideoUrl('https://www.instagram.com/reel/Cabc/').platform === 'instagram');
  chk('instagr.am', parseVideoUrl('https://instagr.am/p/Cabc/').platform === 'instagram');
  const shared = parseVideoUrl('Watch this! https://youtu.be/QQ7 via someone');
  chk('url fished out of share text', shared.url === 'https://youtu.be/QQ7');
  chk('trailing punctuation stripped', parseVideoUrl('https://youtu.be/abc.').url === 'https://youtu.be/abc');
  chk('tiktok refused, by name', /YouTube and Instagram/.test(parseVideoUrl('https://tiktok.com/@x/video/1').error));
  chk('fake suffix host refused', parseVideoUrl('https://youtube.com.evil.example/x').error !== undefined);
  chk('no url refused', parseVideoUrl('mac and cheese').error !== undefined);
  chk('empty refused', parseVideoUrl('').error !== undefined);

  console.log('\n== validateRecipe (the accept gate) ==');
  const good = {
    id: 'stub-stew', title: 'Stub Stew', category: 'Dinner', contributor: 'Joan',
    servings: 4, ingredients: ['1 cup stub'], steps: ['Stir.'],
    flagged: [], tags: ['soup'], source: 'https://youtu.be/x'
  };
  chk('good recipe passes', validateRecipe(good).recipe.id === 'stub-stew');
  chk('empty lines cleaned', validateRecipe(Object.assign({}, good, { ingredients: ['a', '  ', 'b'] })).recipe.ingredients.length === 2);
  chk('bad id refused', validateRecipe(Object.assign({}, good, { id: 'Bad Id!' })).error !== undefined);

  /* `R115` — this validator checks the RAW value and stores the TRIMMED one,
     which are not the same string. A title of three spaces is truthy, is a
     string, and is under 300 characters, so every check passed — and then
     `.trim()` made it empty on the way into the database. A nameless recipe
     in everyone's book, from a boundary whose entire job is to refuse what
     the app would never send.

     The contributor is worse than the title: `putRecipe` inserts it into
     `kitchen.contributors`, so an empty one mints a blank row that becomes a
     blank tile under "Whose recipe?" — and contributors are the one thing in
     this schema that outlive the recipe that created them.

     Reachable by anyone holding the family passphrase, which is the whole
     point of validating rather than trusting: the app trims before it sends
     (`saveDraft`), and this boundary must not depend on that. */
  const blank = (patch) => validateRecipe(Object.assign({}, good, patch));
  chk('a title of nothing but spaces is refused',
    /title/.test(blank({ title: '   ' }).error || ''), JSON.stringify(blank({ title: '   ' })));
  chk('and so is a contributor of nothing but spaces',
    /contributor/.test(blank({ contributor: '\t \n' }).error || ''),
    JSON.stringify(blank({ contributor: '\t \n' })));
  chk('a recipe whose name is real still passes with the spaces gone',
    blank({ title: '  Real Name  ' }).recipe.title === 'Real Name',
    JSON.stringify(blank({ title: '  Real Name  ' }).recipe));
  /* An optional field is absent or it has something in it. Writing "" into a
     column that means "nothing here" makes two ways to say the same thing,
     and the app then renders an empty time as though it were a value. */
  chk('an optional field of only spaces is dropped, not stored empty',
    blank({ prepTime: '   ' }).recipe.prepTime === undefined,
    JSON.stringify(blank({ prepTime: '   ' }).recipe));
  chk('while a real one survives trimmed',
    blank({ prepTime: ' 10 min ' }).recipe.prepTime === '10 min',
    JSON.stringify(blank({ prepTime: ' 10 min ' }).recipe));
  chk('and an empty string is still simply absent, as before',
    blank({ notes: '' }).recipe.notes === undefined);
  /* One field is deliberately not on that rule. `image` has a required shape
     (`S05`), so whitespace is malformed rather than absent, and it is refused
     with the sentence that names the shape. Pinned here so the asymmetry is a
     decision rather than an accident of statement order. */
  chk('a whitespace image is refused, not quietly dropped',
    /image must look like/.test(blank({ image: '   ' }).error || ''),
    JSON.stringify(blank({ image: '   ' })));
  chk('unknown category refused', validateRecipe(Object.assign({}, good, { category: 'Tea' })).error !== undefined);
  chk('fraction servings refused', validateRecipe(Object.assign({}, good, { servings: 2.5 })).error !== undefined);
  chk('non-list steps refused', validateRecipe(Object.assign({}, good, { steps: 'stir' })).error !== undefined);
  chk('non-string tag refused', validateRecipe(Object.assign({}, good, { tags: [1] })).error !== undefined);
  chk('missing contributor refused', validateRecipe(Object.assign({}, good, { contributor: '' })).error !== undefined);

  console.log('\n== ETA (rough is fine, precision is fake) ==');
  const now = Date.now();
  chk('queued sums every stage', estimate('queued', null, 120, 999, now).eta === 15 + 30 + 25);
  chk('cold start adds the wake allowance', estimate('queued', null, 120, 30, now).eta === 60 + 30 + 25);
  chk('mid-stage subtracts elapsed', estimate('downloading', new Date(now - 10000).toISOString(), 120, 999, now).eta === 5 + 30 + 25);
  chk('never negative', estimate('extracting', new Date(now - 90000).toISOString(), 120, 999, now).eta === 0);
  chk('overrun at 2x, not before', estimate('extracting', new Date(now - 51000).toISOString(), 120, 999, now).overrun === true
    && estimate('extracting', new Date(now - 49000).toISOString(), 120, 999, now).overrun === false);
  chk('done means nothing left to wait for', estimate('ready_for_review', null, 120, 999, now).eta === null);
  chk('unknown duration still answers', typeof estimate('transcribing', null, null, 999, now).eta === 'number');
  chk('every status has a human label', ['queued', 'downloading', 'transcribing', 'extracting', 'ready_for_review', 'imported', 'failed'].every(s => LABEL[s]));

  console.log('\n== serial queue ==');
  {
    const q = serialQueue();
    const order = [];
    q.push(async () => { await new Promise(r => setTimeout(r, 30)); order.push(1); });
    q.push(async () => { order.push(2); throw new Error('boom'); });
    const done = q.push(async () => { order.push(3); });
    chk('two pending mid-run', q.size() >= 2);
    await done;
    chk('strictly in order', order.join(',') === '1,2,3');
    chk('a throw does not stop the line', order.includes(3) && q.size() === 0);
  }

  console.log('\n== VTT → text ==');
  const vtt = 'WEBVTT\nKind: captions\nLanguage: en\n\n1\n00:00:00.000 --> 00:00:02.000\nAdd <c>two cups</c> of flour\n\n2\n00:00:02.000 --> 00:00:04.000\nAdd two cups of flour\n\n3\n00:00:04.000 --> 00:00:06.000\nAdd two cups of flour then mix well\n';
  const text = media.vttToText(vtt);
  chk('timing and headers stripped', !/-->|WEBVTT|Language/.test(text));
  chk('tags stripped', !/<c>/.test(text));
  chk('rolling repeats collapsed to the longest line', text === 'Add two cups of flour then mix well');
  chk('empty in, empty out', media.vttToText('') === '');

  console.log('\n== description-recipe detection ==');
  chk('a written-out recipe is spotted', media.looksLikeRecipeText('INGREDIENTS\n2 cups flour\n1 egg\n½ cup milk\nMix and bake.'));
  chk('a chatty caption is not', !media.looksLikeRecipeText('Best pasta I ever made!! Recipe on my blog, link in bio'));
  chk('bulleted quantities count', media.looksLikeRecipeText('- 1 cup a\n- 2 tbsp b\n- 3 c\n- 4 d\n- 5 e\n- 6 f'));
  chk('empty is not a recipe', !media.looksLikeRecipeText(''));

  console.log('\n== caption track pick ==');
  chk('uploaded subs beat auto', media.pickCaptionTrack({ subtitles: { en: [{}] }, automatic_captions: { en: [{}] } }).auto === false);
  chk('auto en-US accepted', media.pickCaptionTrack({ automatic_captions: { 'en-US': [{}] } }).lang === 'en-US');
  chk('no english → null', media.pickCaptionTrack({ subtitles: { fr: [{}] } }) === null);
  chk('nothing → null', media.pickCaptionTrack({}) === null);

  console.log('\n== frame dedupe ==');
  {
    const F = 4; // tiny "frames" of 4 bytes for the math
    const buf = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 200, 200, 200, 200, 201, 201, 201, 201]);
    const keep = media.frameKeepIndices(buf, F, 8);
    chk('identical run keeps first only', keep[0] === 0 && !keep.includes(1));
    chk('a real change is kept', keep.includes(2));
    chk('a near-identical follower is dropped', !keep.includes(3));
    chk('empty buffer keeps nothing', media.frameKeepIndices(Buffer.alloc(0), F, 8).length === 0);
  }
  chk('short reel samples every ~2s', computeFps(20) === 0.5);
  chk('long video stays under the frame cap', Math.abs(computeFps(1600) - 40 / 1600) < 1e-9);

  console.log('\n== friendly failures ==');
  chk('private video named', /private/.test(media.friendlyDownloadError('ERROR: Private video', 'youtube')));
  chk('deleted video named', /unavailable or deleted/.test(media.friendlyDownloadError('ERROR: Video unavailable', 'youtube')));
  chk('instagram gets the screen-record advice', /screen-record/.test(media.friendlyDownloadError('some login wall nonsense', 'instagram')));
  chk('youtube default is plain', /couldn’t be fetched/.test(media.friendlyDownloadError('???', 'youtube')));
  /* The robot check is about the SERVER, and must never read as a fact
     about the video — the first live import hit exactly this mislabel. */
  const botErr = "ERROR: [youtube] abc: Sign in to confirm you’re not a bot. Use --cookies for the authentication.";
  chk('the robot check is named as a robot check, not age restriction',
    /treats cloud servers as robots/.test(media.friendlyDownloadError(botErr, 'youtube')) &&
    !/age-restricted/.test(media.friendlyDownloadError(botErr, 'youtube')));
  chk('a real age gate still reads as one',
    /age-restricted/.test(media.friendlyDownloadError('ERROR: Sign in to confirm your age. This video may be inappropriate', 'youtube')));
  chk('isBotCheck spots both quote spellings',
    media.isBotCheck("Sign in to confirm you're not a bot") && media.isBotCheck('confirm that you’re not a bot'));

  console.log('\n== runYtdlp retries the robot check as other clients ==');
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-bot-'));
    const log = path.join(dir, 'log');
    /* Fails as the web client, succeeds the moment the TV client is asked. */
    fs.writeFileSync(path.join(dir, 'yt'),
      '#!/usr/bin/env bash\necho "$@" >> ' + JSON.stringify(log) + '\n' +
      'if [[ " $* " == *"player_client=tv"* ]]; then echo OK; exit 0; fi\n' +
      'echo "ERROR: Sign in to confirm you’re not a bot" >&2; exit 1\n');
    fs.chmodSync(path.join(dir, 'yt'), 0o755);
    const res = await media.runYtdlp(path.join(dir, 'yt'), ['-J', 'https://youtu.be/x'], {});
    const calls = fs.readFileSync(log, 'utf8').trim().split('\n');
    chk('bot check falls through to the tv client and succeeds', res.ok && /OK/.test(res.stdout));
    chk('exactly one retry was needed', calls.length === 2 && /player_client=tv/.test(calls[1]));
    chk('the retry keeps the original arguments', /-J https:\/\/youtu\.be\/x$/.test(calls[1]));

    fs.writeFileSync(path.join(dir, 'yt'),
      '#!/usr/bin/env bash\necho "$@" >> ' + JSON.stringify(log) + '\n' +
      'echo "ERROR: Private video" >&2; exit 1\n');
    fs.writeFileSync(log, '');
    const res2 = await media.runYtdlp(path.join(dir, 'yt'), ['-J', 'u'], {});
    chk('a non-bot failure never retries', !res2.ok &&
      fs.readFileSync(log, 'utf8').trim().split('\n').length === 1);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log('\n== YouTube salvage (the Data-API rescue) ==');
  {
    const salvage = lib('salvage');
    chk('watch?v= id', salvage.youtubeId('https://www.youtube.com/watch?v=F5C6UcmyPxc') === 'F5C6UcmyPxc');
    chk('youtu.be id', salvage.youtubeId('https://youtu.be/F5C6UcmyPxc?t=10') === 'F5C6UcmyPxc');
    chk('shorts id', salvage.youtubeId('https://youtube.com/shorts/abcABC12345') === 'abcABC12345');
    chk('no id → null', salvage.youtubeId('https://youtube.com/@somechannel') === null);
    chk('PT13M5S → 785', salvage.isoDurationS('PT13M5S') === 785);
    chk('PT1H2M3S → 3723', salvage.isoDurationS('PT1H2M3S') === 3723);
    chk('garbage → 0', salvage.isoDurationS('whenever') === 0);
    const api = {
      items: [{
        snippet: { title: 'Mushroom Pasta', channelTitle: 'Babish', description: 'INGREDIENTS\n2 cups x\n1 tbsp y\n3 z\nMix.' },
        contentDetails: { duration: 'PT9M30S' }
      }]
    };
    const meta = salvage.parseApiSnippet(api);
    chk('snippet → the pipeline meta shape',
      meta.title === 'Mushroom Pasta' && meta.uploader === 'Babish' && meta.duration_s === 570);
    chk('empty answer → null', salvage.parseApiSnippet({ items: [] }) === null);
    const okFetch = async () => ({ ok: true, json: async () => api });
    const happy = await salvage.salvageYouTube(okFetch, 'key', 'F5C6UcmyPxc');
    chk('salvage happy path', happy.meta.title === 'Mushroom Pasta');
    chk('the happy path still reports what it got', /^ok \(description \d+ chars\)$/.test(happy.why), happy.why);
    const noKey = await salvage.salvageYouTube(async () => { throw new Error('must not be called'); }, '', 'x');
    chk('no key → no request, and says so', noKey.meta === null && /no YT_API_KEY/.test(noKey.why));
    const netDown = await salvage.salvageYouTube(async () => { throw new Error('net down'); }, 'key', 'x');
    chk('a failing fetch → null, never a throw, with the reason', netDown.meta === null && /unreachable: net down/.test(netDown.why));
    const refused = await salvage.salvageYouTube(async () => ({ ok: false, status: 403, text: async () => 'API not enabled' }), 'key', 'x');
    chk('a refused key names the status and body', refused.meta === null && /HTTP 403 API not enabled/.test(refused.why), refused.why);
  }

  console.log('\n== R2 hardening: the key never leaks, loops hit a wall ==');
  {
    const salvage = lib('salvage');
    const leaky = async () => { throw new Error('fetch to ...key=SECRET123... failed'); };
    const r = await salvage.salvageYouTube(leaky, 'SECRET123', 'AAAAAAAAAAA');
    chk('the API key is scrubbed from public diagnostics',
      !r.why.includes('SECRET123') && r.why.includes('[key]'), r.why);
    const refusing = async () => ({ ok: false, status: 400, text: async () => 'bad request for key=SECRET123 given' });
    const r2 = await salvage.salvageYouTube(refusing, 'SECRET123', 'AAAAAAAAAAA');
    chk('…including when Google echoes it in an error body', !r2.why.includes('SECRET123'), r2.why);

    const { makeLimiter } = lib('ratelimit');
    const lim = makeLimiter(3, 60000);
    const t0 = 1000000;
    chk('under the limit flows', lim.hit('a', t0) && lim.hit('a', t0 + 1) && lim.hit('a', t0 + 2));
    chk('over the limit refuses', lim.hit('a', t0 + 3) === false);
    chk('addresses are independent', lim.hit('b', t0 + 4) === true);
    chk('the window forgives', lim.hit('a', t0 + 60001) === true);
  }

  console.log('\n== R8: the failed-jobs listing is bounded, not a query API ==');
  {
    /* The endpoint's contract, asserted where it is cheapest: exactly two
       statuses are listable, and nothing else — a failed import must be
       visible to the family without opening the API to arbitrary reads. */
    const src = fs.readFileSync(path.join(__dirname, '..', 'backend', 'server.js'), 'utf8');
    const fn = src.slice(src.indexOf('async function listJobs'), src.indexOf('async function acceptJob'));
    chk('ready_for_review and failed are the only listable statuses',
      /status !== "ready_for_review" && status !== "failed"/.test(fn) &&
      !/status\s*\)\s*;?\s*$/.test(fn.split('\n')[3] || ''));
    chk('failed rows carry their reason', /error_message/.test(fn));
    chk('failed listing is time-bounded and capped',
      /interval '3 days'/.test(fn) && /limit 20/.test(fn));
    chk('a raw status string never reaches SQL',
      !/status = \$\{status\}/.test(fn) && !/\$\{status\}/.test(fn));
  }

  console.log('\n== R15: internals never reach a public job field ==');
  {
    const dirty = "ERROR: plugin dir /opt/render/project/src/backend/bin/plugins missing; " +
      "token server http://127.0.0.1:4416 refused; temp /tmp/kt-job-abc123/media.mp4 gone; " +
      "see https://github.com/yt-dlp/yt-dlp/wiki/FAQ";
    const clean = media.scrubInternal(dirty);
    chk('server paths are reduced to their last part', !/\/opt\/render/.test(clean) && /plugins/.test(clean));
    chk('temp directories do not leak', !/\/tmp\/kt-job/.test(clean));
    chk('the local token service is not advertised', !/127\.0\.0\.1:4416/.test(clean));
    chk('the public help link survives — it is the useful part',
      /github\.com\/yt-dlp/.test(clean), clean);
    chk('empty in, empty out', media.scrubInternal('') === '');
  }

  console.log('\n== R17: a day of importing has a ceiling ==');
  {
    const budget = lib('budget');
    chk('an ordinary day is never touched', budget.dayCapMessage(3, 40) === null);
    chk('one below the cap still flows', budget.dayCapMessage(39, 40) === null);
    chk('the cap itself refuses', typeof budget.dayCapMessage(40, 40) === 'string');
    chk('and everything past it', typeof budget.dayCapMessage(400, 40) === 'string');
    const msg = budget.dayCapMessage(40, 40);
    chk('the refusal names the ways in that cost nothing',
      /photo/i.test(msg) && /(typ|by hand)/i.test(msg), msg);
    chk('the refusal never blames the person', !/abuse|banned|blocked/i.test(msg), msg);
    /* Fail open, on purpose: if the count query ever answers with nonsense,
       the family keeps their importer. The wall is against a patient
       stranger, not against the server's own confusion. */
    chk('a count it cannot read lets the import through',
      budget.dayCapMessage(NaN, 40) === null && budget.dayCapMessage(undefined, 40) === null);
    chk('the default ceiling is generous but real',
      budget.DAY_CAP >= 20 && budget.DAY_CAP <= 100, String(budget.DAY_CAP));

    const src = fs.readFileSync(path.join(__dirname, '..', 'backend', 'server.js'), 'utf8');
    const fn = src.slice(src.indexOf('async function postVideo'), src.indexOf('async function getJob'));
    chk('the route counts the day before it spends the day',
      fn.indexOf('dayCapMessage') > -1 &&
      fn.indexOf('dayCapMessage') < fn.indexOf('insert into kitchen.import_jobs'));
    chk('the count is bounded to one day, not the whole table',
      /interval '24 hours'/.test(fn) && /count\(\*\)/.test(fn));
    chk('a refused import is a 429, the same language as the other walls',
      /send\(res, 429/.test(fn));

    /* `R91` — the ceiling above is a ceiling on the DAY, not on a caller,
       and those are different promises. It bounds the money, which is what
       it was written for. It does not stop one stranger spending the whole
       forty and leaving the family locked out of their own importer until
       tomorrow — at no cost to the stranger, since the API has no login by
       design and its address ships in the page.
       `R81` is what makes a per-caller wall worth building: before it, the
       caller key was the leftmost `X-Forwarded-For` entry, so anyone could
       rotate a header and be a new caller on every request. Now the key is
       the hop the trusted proxy appended, and a per-caller count means
       something.
       This one is a FAIRNESS valve, not a spending wall — the spending wall
       is the database-backed day cap, which is unchanged. So it may live in
       memory: a spin-down forgiving a stranger costs nothing, because the
       forty still holds. */
    chk('a caller\'s own day has a ceiling too',
      typeof budget.CALLER_DAY_CAP === 'number' &&
      budget.CALLER_DAY_CAP > 0 && budget.CALLER_DAY_CAP < budget.DAY_CAP,
      String(budget.CALLER_DAY_CAP));
    chk('and it leaves real room for everybody else',
      budget.DAY_CAP - budget.CALLER_DAY_CAP >= 10,
      budget.DAY_CAP + ' - ' + budget.CALLER_DAY_CAP);
    chk('an ordinary caller never meets it',
      budget.callerDayMessage(3, 15) === null &&
      budget.callerDayMessage(14, 15) === null);
    chk('the caller who takes too much is stopped',
      typeof budget.callerDayMessage(15, 15) === 'string' &&
      typeof budget.callerDayMessage(99, 15) === 'string');
    {
      const m = budget.callerDayMessage(15, 15);
      chk('and that refusal, like the other, leaves them somewhere to go',
        /photo/i.test(m) && /(typ|by hand)/i.test(m), m);
      chk('it never blames the person', !/abuse|banned|blocked/i.test(m), m);
      chk('and it says the wall is theirs alone, not the kitchen closing',
        /you|your/i.test(m), m);
    }
    chk('a count it cannot read lets the caller through, like the other wall',
      budget.callerDayMessage(NaN, 15) === null &&
      budget.callerDayMessage(undefined, 15) === null);
    chk('the route asks before it queues',
      fn.indexOf('callerDayMessage') > -1 &&
      fn.indexOf('callerDayMessage') < fn.indexOf('insert into kitchen.import_jobs'));
    chk('and it counts the caller the trusted way R81 established',
      /callerIp\(req\)/.test(fn));
  }

  console.log('\n== R27: the nightly sync cannot quietly empty the book ==');
  {
    /* db-sync runs unattended at 06:17 and commits whatever export.js writes.
       An empty or half-migrated database returns zero rows, which used to
       mean: write [], commit it, and the family's 48 recipes are gone from
       the published file with nobody watching. */
    const xp = require(path.join(__dirname, '..', 'db', 'export.js'));
    const book = (n) => Array.from({ length: n }, (_, i) =>
      ({ id: 'r' + i, title: 'R' + i, category: 'Dinner', contributor: 'Joan',
         servings: 4, ingredients: ['a'], steps: ['b'] }));
    const asText = (l) => JSON.stringify(l, null, 2) + '\n';

    chk('an empty database is refused, never written',
      xp.refuseToWrite(book(0), asText(book(48))) !== null);
    chk('and the refusal says what it is protecting',
      /48/.test(xp.refuseToWrite(book(0), asText(book(48)))),
      xp.refuseToWrite(book(0), asText(book(48))));
    chk('losing most of the book is refused too',
      xp.refuseToWrite(book(10), asText(book(48))) !== null);
    chk('a normal night writes without comment',
      xp.refuseToWrite(book(48), asText(book(48))) === null);
    chk('so does the book growing',
      xp.refuseToWrite(book(53), asText(book(48))) === null);
    chk('and shrinking a little — a recipe was removed on purpose',
      xp.refuseToWrite(book(45), asText(book(48))) === null);
    chk('an unreadable current file never blocks a write',
      xp.refuseToWrite(book(48), 'not json at all') === null);
    chk('the first write of all, with no file yet, is allowed',
      xp.refuseToWrite(book(48), '') === null);
    /* The app drops empty strings when it writes the file (orderFields), so
       the exporter must too or --check reports drift that isn't there. */
    const withBlank = xp.rowToRecipe({ id: 'x', title: 'X', category: 'Dinner',
      contributor: 'Joan', servings: 4, ingredients: ['a'], steps: ['b'],
      notes: '', source: '', prep_time: null });
    chk('empty strings are dropped, exactly as the app drops them',
      !('notes' in withBlank) && !('source' in withBlank) && !('prepTime' in withBlank),
      JSON.stringify(withBlank));
    chk('and the real fields survive in the app\'s own order',
      Object.keys(withBlank).join(',') ===
      'id,title,category,contributor,servings,ingredients,steps',
      Object.keys(withBlank).join(','));
    /* Two hand-maintained copies of the same list, in two languages, that
       must agree or the nightly sync rewrites the whole file on field order
       alone. */
    const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const appOrder = appSrc.slice(appSrc.indexOf('var FIELD_ORDER = ['),
      appSrc.indexOf(']', appSrc.indexOf('var FIELD_ORDER = [')))
      .match(/"([^"]+)"/g).map(x => x.replace(/"/g, ''));
    chk('the exporter and the app agree on the field order',
      appOrder.join(',') === xp.FIELD_ORDER.join(','),
      appOrder.join(',') + ' vs ' + xp.FIELD_ORDER.join(','));
  }

  console.log('\n== R28: a removed recipe must not walk back in ==');
  {
    /* The bug CLAUDE.md records fixing once at the overlay layer, waiting one
       layer up for the database era: migrate.js only ever upserts, so a
       recipe removed from recipes.json stays in the database — and the
       nightly sync writes it straight back into the file. */
    const mg = require(path.join(__dirname, '..', 'db', 'migrate.js'));
    chk('a recipe dropped from the file is reported as an orphan',
      mg.orphanIds(['a', 'b'], ['a', 'b', 'gone']).join(',') === 'gone');
    chk('a database with nothing extra reports nothing',
      mg.orphanIds(['a', 'b'], ['a', 'b']).length === 0);
    chk('and a file with something new is not an orphan in either direction',
      mg.orphanIds(['a', 'b', 'fresh'], ['a', 'b']).length === 0);
    chk('several at once, in the database\'s own order',
      mg.orphanIds(['b'], ['a', 'b', 'c']).join(',') === 'a,c');
    const src = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrate.js'), 'utf8');
    chk('pruning is never the default — it is a flag someone types',
      /--prune/.test(src) && /argv\.includes\('--prune'\)/.test(src));
    chk('and the orphans are named out loud whether or not they are pruned',
      /orphan/i.test(src) && /console\.log/.test(src));

    /* `R115` — the same gap, on the other boundary. `recipes.json` is
       hand-editable by design and this is what reads it every night with
       nobody watching, so a title of three spaces must not become a
       nameless recipe in the database and then in everyone's book. The
       server's validator and this one guard the same field for the same
       reason; they must not disagree about what counts as a name. */
    const okRow = {
      id: 'a', title: 'A', category: 'Dinner', contributor: 'Joan', servings: 4,
      ingredients: ['x'], steps: ['y']
    };
    /* `die` stops the process rather than throwing — which is right for a
       nightly job nobody is watching, and means this has to be measured the
       way the job actually behaves, in a child. Asserting on a refactored
       shape would be testing something else. */
    const dies = (patch) => {
      const r = require('child_process').spawnSync(process.execPath, ['-e',
        'const m=require(process.argv[1]);m.validate([JSON.parse(process.argv[2])]);' +
        'console.log("ACCEPTED")',
        path.join(__dirname, '..', 'db', 'migrate.js'),
        JSON.stringify(Object.assign({}, okRow, patch))], { encoding: 'utf8' });
      return r.status === 0 ? '' : (r.stderr || '').trim();
    };
    chk('a title of nothing but spaces stops the nightly run',
      /title/i.test(dies({ title: '   ' })), dies({ title: '   ' }) || 'accepted');
    chk('and so does a contributor of nothing but spaces',
      /contributor/i.test(dies({ contributor: ' \t ' })), dies({ contributor: ' \t ' }) || 'accepted');
    chk('a real recipe still passes', dies({}) === '', dies({}));
    chk('a delete only ever happens inside the prune branch',
      (src.match(/delete from kitchen\.recipes\b/g) || []).length === 1 &&
      src.indexOf('delete from kitchen.recipes\n') === -1 ||
      /prune/.test(src.slice(Math.max(0, src.indexOf('delete from kitchen.recipes') - 600),
        src.indexOf('delete from kitchen.recipes'))));
  }

  console.log('\n== R31: accepting the same import twice ==');
  {
    /* The ready-for-review list is shared on purpose — "someone else's
       finished import is family news" — so two people can be looking at the
       same finished draft, and both can press Save. The old order read the
       job, inserted the recipe, then marked the job imported: two accepts
       that overlap both pass the status check and both insert, and the id
       collision suffixes rather than overwrites, so the family gets a
       duplicate they then have to find and delete. */
    const src = fs.readFileSync(path.join(__dirname, '..', 'backend', 'server.js'), 'utf8');
    const fn = src.slice(src.indexOf('async function acceptJob'),
      src.indexOf('/* ----------------------------------------------------------------- server */'));
    chk('the job is claimed with a conditional update, not a blind one',
      /update kitchen\.import_jobs[\s\S]*?where id = \$\{id\} and status = 'ready_for_review'/.test(fn) &&
      /returning id/.test(fn));
    chk('and the claim happens BEFORE the recipe is inserted',
      fn.indexOf('returning id') < fn.indexOf('insert into kitchen.recipes'));
    chk('losing the race is not an error — the recipe is already in',
      /if \(!claimed\.length\)[\s\S]{0,300}?send\(res, 200, \{ ok: true, id: null \}\)/.test(fn),
      'see acceptJob');
    chk('and a failed insert hands the draft back rather than eating it',
      /catch \(e\)[\s\S]*?set status = 'ready_for_review'/.test(
        fn.slice(fn.indexOf('insert into kitchen.recipes'))));
    /* A body the server cannot read is the caller's mistake. It used to
       reach the route's catch-all and come back as "server error: bad
       JSON", which reads like the kitchen fell over. */
    chk('a body that is not JSON is the caller\'s fault, not a server error',
      /function bodyOr400/.test(src) && /send\(res, 400/.test(
        src.slice(src.indexOf('function bodyOr400'), src.indexOf('async function postVideo'))));
    /* Every route that reads a body reads it that way. Pinned to the COUNT
       of writing routes at first, which made adding one (`S02`'s edit
       endpoint) look like a regression: the rule is "nobody bypasses the
       helper", not "there are exactly two of them". Stated as the rule, it
       survives the next route and still catches the bypass. */
    /* Call sites only — `function readJson(req)` is the declaration, and
       counting that as a caller made this fail against correct code. */
    const callSites = [...src.matchAll(/(^|[^\w])readJson\(req\)/g)]
      .filter(m => !/function\s*$/.test(src.slice(Math.max(0, m.index - 10), m.index + 1)))
      .map(m => m.index);
    const helperFrom = src.indexOf('function bodyOr400');
    const helperTo = src.indexOf('\n}', helperFrom);
    chk('every route that reads a body goes through the one helper',
      callSites.length === 1 && callSites[0] > helperFrom && callSites[0] < helperTo,
      callSites.length + ' call site(s); only bodyOr400 may make one');
    chk('and more than one route actually uses it',
      (src.match(/await bodyOr400\(req, res\)/g) || []).length >= 2,
      String((src.match(/await bodyOr400\(req, res\)/g) || []).length));
  }

  console.log('\n== The server answered, over real HTTP (R41) ==');
  {
    /* Everything above reads the server's source or calls its pure parts.
       This starts the actual process and talks to it — no database, no
       network, no keys — because a router, a status code and a header are
       claims about behaviour, and reading them is not the same as seeing
       them. Without KT_DB the server is designed to boot anyway and answer
       503 with a sentence, which makes this the one configuration that can
       be exercised hermetically. */
    const { spawn } = require('child_process');
    const PORT = 8891;
    const srv = spawn(process.execPath,
      [path.join(__dirname, '..', 'backend', 'server.js')],
      { env: Object.assign({}, process.env, {
          PORT: String(PORT), KT_NO_POT: '1', KT_DB: '', DATABASE_URL: '',
          ANTHROPIC_API_KEY: '', GROQ_API_KEY: '', YT_API_KEY: '' }),
        stdio: ['ignore', 'pipe', 'pipe'] });
    const base = 'http://127.0.0.1:' + PORT;
    const up = async () => {
      for (let i = 0; i < 60; i++) {
        try { await fetch(base + '/api/health'); return true; }
        catch (e) { await new Promise(r => setTimeout(r, 100)); }
      }
      return false;
    };
    const ready = await up();
    chk('it boots with no database at all, rather than crash-looping', ready);

    if (ready) {
      const health = await fetch(base + '/api/health');
      const body = await health.json();
      chk('health answers 200 and says what is missing',
        health.status === 200 && body.ok === false &&
        body.missing.indexOf('KT_DB') > -1, JSON.stringify(body.missing || []));
      /* `R137` — `publishes_on_change` only ever meant "a token is set", so
         a token that had stopped working looked exactly like one that
         worked while every change waited for the nightly sync. Both null on
         a server that has never poked is the honest answer, and is what
         makes a later non-null one mean something. */
      chk('health says when a publish last landed, and why one did not',
        'last_publish_s' in body && 'last_publish_error' in body &&
        body.last_publish_s === null && body.last_publish_error === null,
        JSON.stringify({ s: body.last_publish_s, e: body.last_publish_error }));
      chk('and still says whether it could publish at all',
        body.publishes_on_change === false, String(body.publishes_on_change));
      chk('and every answer carries its hardening headers',
        health.headers.get('x-content-type-options') === 'nosniff' &&
        health.headers.get('referrer-policy') === 'no-referrer' &&
        health.headers.get('cache-control') === 'no-store',
        [...health.headers].map(h => h[0]).join(','));

      const missing = await fetch(base + '/api/nothing-here');
      chk('an unknown path is a plain 404, not a stack trace',
        missing.status === 404 && (await missing.json()).error === 'not found');

      const noDb = await fetch(base + '/api/import/jobs?status=failed');
      const noDbBody = await noDb.json();
      chk('import routes say the database is missing, in words',
        noDb.status === 503 && /KT_DB/.test(noDbBody.error), noDbBody.error);

      const pre = await fetch(base + '/api/import/video', { method: 'OPTIONS' });
      chk('the preflight answers without touching the database',
        pre.status === 204 &&
        pre.headers.get('access-control-allow-methods').indexOf('POST') > -1);

      const wrongWay = await fetch(base + '/api/health', { method: 'POST' });
      chk('a POST to a GET route is a 404, never an accident',
        wrongWay.status === 404 || wrongWay.status === 503,
        String(wrongWay.status));

      /* The limiter is 120 a minute per address; the app's own polling is
         about 17. Proven by exceeding it rather than by reading it. */
      let sawLimit = 0;
      for (let i = 0; i < 130; i++) {
        const r = await fetch(base + '/api/health');
        if (r.status === 429) { sawLimit = i; break; }
      }
      chk('a loop hits the wall, and not before it should',
        sawLimit >= 110 && sawLimit <= 129, 'first 429 at request ' + sawLimit);
      const walled = await fetch(base + '/api/health');
      chk('and the wall says something a person could act on',
        walled.status === 429 && /minute/i.test((await walled.json()).error));

      /* `R81` — a wall you can walk around is scenery.
         X-Forwarded-For is a list the CLIENT can start and every proxy
         appends to: what arrives is `<whatever the client sent>, <what the
         proxy saw>`. Keying the limiter on the leftmost entry keys it on
         the half the caller wrote, so rotating a fake header gives a
         hostile loop a fresh bucket on every request and it never meets
         the wall at all — with a paid Whisper call and a paid Opus call
         sitting behind it, per video.
         Simulated the way it actually arrives: a forged prefix, then the
         address the trusted proxy in front of this server appended. */
      let spoofWall = -1;
      for (let i = 0; i < 130; i++) {
        const r = await fetch(base + '/api/health', {
          headers: { 'x-forwarded-for': '10.9.8.' + (i % 250) + ', 203.0.113.7' }
        });
        if (r.status === 429) { spoofWall = i; break; }
      }
      chk('a forged X-Forwarded-For cannot walk around the wall',
        spoofWall >= 110 && spoofWall <= 129,
        spoofWall < 0 ? 'never walled in 130 requests' : 'walled at ' + spoofWall);

      /* And the floor, which matters just as much: the cheap "fix" is to
         ignore the header and key everything on the socket — which behind
         one proxy is a single address, so the first person to poll would
         wall the whole family. A different visitor must still get through. */
      const neighbour = await fetch(base + '/api/health', {
        headers: { 'x-forwarded-for': '198.51.100.4' } });
      chk('and one visitor hitting the wall does not wall their neighbour',
        neighbour.status === 200, String(neighbour.status));
    }
    srv.kill('SIGKILL');
  }

  console.log('\n== PO-token plumbing ==');
  chk('KT_NO_POT forces bare calls', media.potArgs().length === 0);
  {
    delete process.env.KT_NO_POT;
    const a = media.potArgs();
    chk('when installed, exactly the plugin dir + provider address (else nothing)',
      a.length === 0 ||
      (a.length === 4 && a[0] === '--plugin-dirs' && /bin[\\/]plugins$/.test(a[1]) &&
        a[2] === '--extractor-args' && /^youtubepot-bgutilhttp:base_url=http:\/\/127\.0\.0\.1:\d+$/.test(a[3])),
      JSON.stringify(a));
    process.env.KT_NO_POT = '1';
  }

  console.log('\n== extraction shaping ==');
  {
    const content = extract.buildContent(
      { platform: 'youtube', title: 'T', uploader: 'U', description: 'D' }, 'hello world',
      ['AAAA', 'BBBB']);
    chk('frames precede the words', content[0].type === 'image' && content[content.length - 1].type === 'text');
    chk('frames are base64 jpeg blocks', content[0].source.media_type === 'image/jpeg' && content[0].source.data === 'AAAA');
    const noT = extract.buildContent({ platform: 'youtube' }, '', []);
    chk('missing transcript says so', /No usable transcript/.test(noT[0].text));
    const many = extract.buildContent({ platform: 'youtube' }, 'x', Array(60).fill('A'));
    chk('frames capped at 40', many.filter(b => b.type === 'image').length === 40);

    const parsed = {
      is_recipe: true, not_recipe_reason: '', title: '  Stub Stew  ', category: 'Dinner',
      servings: 2, prepTime: '', cookTime: '20 min', ingredients: ['1 cup stub', ''],
      steps: ['Stir.'], notes: '', tags: ['soup'], flagged: ['Ingredients — mumbled']
    };
    const d = extract.draftFromResult(parsed, 'https://youtu.be/x', 'youtube');
    chk('title trimmed', d.title === 'Stub Stew');
    chk('source is the video url', d.source === 'https://youtu.be/x');
    chk('empty lines dropped', d.ingredients.length === 1);
    chk('empty optionals absent', !('prepTime' in d) && d.cookTime === '20 min');
    chk('model flags kept', d.flagged[0] === 'Ingredients — mumbled');
    chk('provenance flag appended', /Imported from a YouTube video/.test(d.flagged[d.flagged.length - 1]));
    chk('no id — the phone assigns it', !('id' in d));
    const badCat = extract.draftFromResult(Object.assign({}, parsed, { category: 'Metaphysics' }), 'u', 'youtube');
    chk('invalid course falls to Dinner, flagged', badCat.category === 'Dinner' && badCat.flagged.some(f => /Course —/.test(f)));
    let notRecipe = null;
    try { extract.draftFromResult({ is_recipe: false, not_recipe_reason: 'it is a cat video' }, 'u', 'youtube'); }
    catch (e) { notRecipe = e; }
    chk('not-a-recipe throws the friendly refusal', notRecipe && notRecipe.notRecipe && /cat video/.test(notRecipe.message));

    /* `R152` — a title the extraction could not find used to become the
       literal string "Untitled recipe", silently, with no flag.

       Every other guess in this function is disclosed: an unusable course
       falls to Dinner AND is flagged, a list past 60 lines is truncated AND
       flagged. Both of the device-side importers do the same for a missing
       title — the link path leaves it empty and flags "Title — none was
       found on the page; add one.", the photo path leaves it empty and flags
       "Title — none was obvious; add one." — so this was the one path
       guessing a NAME without saying so. `R121`'s rule: one situation has
       one wording.

       And the placeholder is the app's display word for a nameless recipe
       (`R116`), which `startDraft` deliberately keeps out of stored data so
       Save cannot bake it in. Baking it in here does at the server what
       `R116` forbids at the phone: a recipe saved unchanged would be titled
       "Untitled recipe" in the family's book, indistinguishable on every
       screen from one that has no name at all.

       Leaving it empty is safe because `saveNewRecipe` already refuses to
       save a recipe with no title — the same stop the other two paths rely
       on. */
    const noTitle = extract.draftFromResult(
      Object.assign({}, parsed, { title: '   ' }), 'u', 'youtube');
    chk('a title the video never gave is left empty, not invented',
      noTitle.title === '', JSON.stringify(noTitle.title));
    chk('and it is flagged, the way every other guess here is',
      noTitle.flagged.some(f => /^Title — /.test(f)),
      JSON.stringify(noTitle.flagged.slice(0, 3)));
    /* The floor that keeps disclosure from becoming noise on every import —
       `R123`'s reason for caring whether a flag is answerable. */
    chk('and a title the video did give is not flagged',
      !d.flagged.some(f => /^Title — /.test(f)),
      JSON.stringify(d.flagged));
  }

  /* ---- the whole pipeline, tools faked, network stubbed ---- */
  console.log('\n== runJob: captions path end to end ==');
  const toolDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-fake-tools-'));
  const argLog = path.join(toolDir, 'calls.log');
  const info = {
    title: 'Fake Video', uploader: 'Fake Cook', duration: 120,
    description: 'just vibes',
    automatic_captions: { en: [{ ext: 'vtt' }] }
  };
  fs.writeFileSync(path.join(toolDir, 'yt-dlp'),
    '#!/usr/bin/env bash\n' +
    'echo "$@" >> ' + JSON.stringify(argLog) + '\n' +
    'if [[ " $* " == *" -J "* ]]; then cat ' + JSON.stringify(path.join(toolDir, 'info.json')) + '; exit 0; fi\n' +
    'if [[ " $* " == *"--write-auto-subs"* ]]; then printf "WEBVTT\\n\\n1\\n00:00:00.000 --> 00:00:02.000\\nAdd two cups of flour to the bowl\\n\\n2\\n00:00:02.000 --> 00:00:05.000\\nthen mix in one egg and a half cup of milk\\n" > sub.en.vtt; exit 0; fi\n' +
    'exit 1\n');
  fs.writeFileSync(path.join(toolDir, 'info.json'), JSON.stringify(info));
  fs.writeFileSync(path.join(toolDir, 'ffmpeg'), '#!/usr/bin/env bash\nexit 0\n');
  fs.chmodSync(path.join(toolDir, 'yt-dlp'), 0o755);
  fs.chmodSync(path.join(toolDir, 'ffmpeg'), 0o755);
  process.env.YTDLP_PATH = path.join(toolDir, 'yt-dlp');
  process.env.FFMPEG_PATH = path.join(toolDir, 'ffmpeg');

  function sqlStub(jobRow) {
    const state = { statuses: [], result: null, error: null, durationSet: null };
    const fn = (strings, ...vals) => {
      const text = strings.join('¤');
      if (/select \* from kitchen\.import_jobs/.test(text)) return Promise.resolve([jobRow]);
      if (/set status = ¤,/.test(text)) state.statuses.push(vals[0]);
      if (/'ready_for_review'/.test(text)) { state.statuses.push('ready_for_review'); state.result = JSON.parse(vals[0]); }
      if (/'failed'/.test(text)) {
        state.statuses.push('failed');
        state.error = vals[0];
        if (vals.length > 1) { try { state.debug = JSON.parse(vals[1]).debug; } catch (e) {} }
      }
      if (/video_duration_s/.test(text)) state.durationSet = vals[0];
      return Promise.resolve([]);
    };
    fn.state = state;
    return fn;
  }
  const claudeStub = {
    messages: {
      stream: () => ({
        finalMessage: async () => ({
          stop_reason: 'end_turn',
          content: [{
            type: 'text', text: JSON.stringify({
              is_recipe: true, not_recipe_reason: '', title: 'Fake Flour Cake', category: 'Baking',
              servings: 8, prepTime: '', cookTime: '', ingredients: ['2 cups flour'],
              steps: ['Mix.'], notes: '', tags: [], flagged: []
            })
          }]
        })
      })
    }
  };

  {
    const sql = sqlStub({ id: 1, status: 'queued', url: 'https://youtu.be/fake', platform: 'youtube', contributor: 'Jason' });
    await runJob({ sql, anthropic: claudeStub, groqKey: '', uptimeS: () => 999 }, 1);
    const st = sql.state;
    chk('walks downloading straight to extracting (captions skip the media)',
      st.statuses.join(',') === 'downloading,extracting,ready_for_review', st.statuses.join(','));
    chk('duration recorded for the ETA', st.durationSet === 120);
    chk('draft stored in the recipes.json shape', st.result && st.result.title === 'Fake Flour Cake' && Array.isArray(st.result.ingredients));
    chk('submitter carried onto the draft', st.result && st.result.contributor === 'Jason');
    chk('provenance flag present', st.result && st.result.flagged.some(f => /Imported from a YouTube video/.test(f)));
    const calls = fs.readFileSync(argLog, 'utf8');
    chk('no media was downloaded', !/ -f /.test(calls));
  }

  console.log('\n== runJob: the catch-all says nothing a reader should not see (R139) ==');
  {
    /* Every failure path in `pipeline.js` writes a HAND-WRITTEN SENTENCE.
       The one place that stores machine text — `failDownload`'s debug tail —
       runs it through `media.scrubInternal()` first, whose very first rule
       strips absolute filesystem paths, because raw tool output leaks
       internals.

       The catch-all does not, and the catch-all is the one that handles
       everything nobody predicted: an SDK error, an `fs` error, a `sql`
       error. `String(e.message).slice(0, 200)` goes into
       `import_jobs.error_message`, which the app renders to the reader in
       two places — the failed-imports list on the Add screen, and
       `S.addError`. So the server's own temp paths reach the family's
       screen through the single path whose text nobody can predict. */
    const boom = { messages: { stream: () => {
      throw new Error("ENOENT: no such file or directory, open " +
        "'/tmp/kt-job-9f2a/frames/frame-003.jpg' while reaching " +
        "http://127.0.0.1:5432");
    } } };
    const sql = sqlStub({ id: 9, status: 'queued', url: 'https://youtu.be/fake',
      platform: 'youtube', contributor: null });
    await runJob({ sql, anthropic: boom, groqKey: '', uptimeS: () => 999 }, 9);
    const said = String(sql.state.error || '');
    chk('an unexpected failure still fails the job', /failed/.test(sql.state.statuses.join(',')),
      sql.state.statuses.join(','));
    chk('and still leads with the sentence written for a person',
      /^Something went wrong while importing/.test(said), said);
    chk('but the server\u2019s own paths never reach the reader',
      said.indexOf('/tmp/kt-job-9f2a') === -1, said);
    chk('nor an address only the server can reach',
      said.indexOf('127.0.0.1') === -1, said);
    /* A floor: dropping the tail entirely would pass all three above, and
       lose the one clue anybody has when something unexpected breaks. */
    chk('while what is left still says what went wrong',
      /frame-003\.jpg/.test(said) && /ENOENT/.test(said), said);

    /* A path in a message long enough to be cut short is still scrubbed,
       wherever in it the cut falls. The scrub runs before the cap so it
       reads the whole message — which, measured, changes nothing today
       (`scrubInternal` matches a half path as happily as a whole one) and
       is kept for the next rule that may not be so forgiving. */
    const pad = 'x'.repeat(170);
    const long = { messages: { stream: () => {
      throw new Error(pad + " /tmp/kt-job-1c3d/frames/frame-0042.jpg");
    } } };
    const sqlLong = sqlStub({ id: 10, status: 'queued', url: 'https://youtu.be/fake',
      platform: 'youtube', contributor: null });
    await runJob({ sql: sqlLong, anthropic: long, groqKey: '', uptimeS: () => 999 }, 10);
    const longSaid = String(sqlLong.state.error || '');
    chk('and a path in a message long enough to be cut short is still gone',
      longSaid.indexOf('/tmp/kt-job') === -1, longSaid.slice(-90));

    /* And the rule, in `R114`'s shape, so the next failure path cannot go
       round it: every `fail(...)` whose message carries a value this server
       did not write — a caught error, a tool's stderr — passes through
       `scrubInternal`. A `fail()` built only from the app's own words needs
       nothing, and most of them are exactly that. */
    const pipeSrc = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'backend', 'lib', 'pipeline.js'), 'utf8');
    const argOf = (from) => {
      let i = pipeSrc.indexOf('(', from), depth = 0, out = '';
      for (; i < pipeSrc.length; i++) {
        const c = pipeSrc[i];
        if (c === '(') { depth++; if (depth === 1) continue; }
        if (c === ')') { depth--; if (depth === 0) break; }
        out += c;
      }
      return out;
    };
    const calls = [];
    let at = pipeSrc.indexOf('fail(');
    while (at > -1) {
      /* `failDownload(` ends in `fail` + `Download(`, so anchor on the word. */
      if (!/[\w.]/.test(pipeSrc[at - 1] || '')) calls.push(argOf(at + 4));
      at = pipeSrc.indexOf('fail(', at + 1);
    }
    const carries = (a) => /\be\b|\berr\b|stderr|run\./.test(a);
    const unscrubbed = calls.filter((a) => carries(a) && a.indexOf('scrubInternal') === -1);
    chk('every fail() carrying a value this server did not write scrubs it',
      unscrubbed.length === 0,
      unscrubbed.map((a) => a.replace(/\s+/g, ' ').slice(0, 70)).join(' | '));
    /* And the download path, which stores the tool's own last words on
       purpose so the next YouTube-defence shift can diagnose from the row. */
    chk('and the debug tail kept for diagnosis is scrubbed too',
      /debug:\s*media\.scrubInternal\(/.test(pipeSrc),
      (/debug:[^,\n]*/.exec(pipeSrc) || ['MISSING'])[0]);
    /* Floors: a scan that found no calls, or an argument reader that
       returned nothing, would read as a clean pass for both checks above. */
    chk('and the scan really read the failure paths',
      calls.length >= 4 && calls.every((a) => a.length > 0) &&
      calls.filter(carries).length >= 2,
      calls.length + ' fail() calls, ' + calls.filter(carries).length + ' carrying a caught value');
  }

  console.log('\n== runJob: failure paths ==');
  {
    fs.writeFileSync(path.join(toolDir, 'yt-dlp'),
      '#!/usr/bin/env bash\necho "ERROR: Private video" >&2\nexit 1\n');
    const sql = sqlStub({ id: 2, status: 'queued', url: 'https://youtu.be/priv', platform: 'youtube', contributor: null });
    await runJob({ sql, anthropic: claudeStub, groqKey: '', uptimeS: () => 999 }, 2);
    chk('metadata failure fails plainly', sql.state.statuses.includes('failed') && /private/.test(sql.state.error));
  }
  {
    fs.writeFileSync(path.join(toolDir, 'yt-dlp'),
      '#!/usr/bin/env bash\nif [[ " $* " == *" -J "* ]]; then cat ' + JSON.stringify(path.join(toolDir, 'info.json')) + '; exit 0; fi\nexit 1\n');
    fs.writeFileSync(path.join(toolDir, 'info.json'), JSON.stringify(Object.assign({}, info, { duration: 2400 })));
    const sql = sqlStub({ id: 3, status: 'queued', url: 'https://youtu.be/long', platform: 'youtube', contributor: null });
    await runJob({ sql, anthropic: claudeStub, groqKey: '', uptimeS: () => 999 }, 3);
    chk('the 30-minute cap refuses politely', /capped at 30 minutes/.test(sql.state.error), sql.state.error);
  }
  {
    const sql = sqlStub({ id: 4, status: 'ready_for_review', url: 'u', platform: 'youtube' });
    await runJob({ sql, anthropic: claudeStub, groqKey: '', uptimeS: () => 999 }, 4);
    chk('a non-queued job is left alone', sql.state.statuses.length === 0);
  }
  delete process.env.YTDLP_PATH;
  delete process.env.FFMPEG_PATH;
  fs.rmSync(toolDir, { recursive: true, force: true });

  console.log('\n== runJob: robot-blocked YouTube is rescued by the description ==');
  {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-salv-'));
    fs.writeFileSync(path.join(dir2, 'yt-dlp'),
      '#!/usr/bin/env bash\necho "ERROR: Sign in to confirm you’re not a bot" >&2\nexit 1\n');
    fs.writeFileSync(path.join(dir2, 'ffmpeg'), '#!/usr/bin/env bash\nexit 0\n');
    fs.chmodSync(path.join(dir2, 'yt-dlp'), 0o755);
    fs.chmodSync(path.join(dir2, 'ffmpeg'), 0o755);
    process.env.YTDLP_PATH = path.join(dir2, 'yt-dlp');
    process.env.FFMPEG_PATH = path.join(dir2, 'ffmpeg');
    const apiAnswer = {
      items: [{
        snippet: { title: 'Rescue Ragu', channelTitle: 'Chef', description: 'Ingredients\n1 cup a\n2 tbsp b\n3 c\nSimmer.' },
        contentDetails: { duration: 'PT5M' }
      }]
    };
    const sql = sqlStub({ id: 9, status: 'queued', url: 'https://youtu.be/AAAAAAAAAAA', platform: 'youtube', contributor: null });
    await runJob({
      sql, anthropic: claudeStub, groqKey: '', ytKey: 'test-key',
      fetch: async () => ({ ok: true, json: async () => apiAnswer }),
      uptimeS: () => 999
    }, 9);
    const st = sql.state;
    chk('rescued job reaches ready_for_review',
      st.statuses.join(',') === 'downloading,extracting,ready_for_review', st.statuses.join(','));
    chk('duration carried from the API', st.durationSet === 300);
    chk('the salvage is disclosed on the draft',
      st.result && st.result.flagged.some(f => /official description only/.test(f)));

    const sql2 = sqlStub({ id: 10, status: 'queued', url: 'https://youtu.be/BBBBBBBBBBB', platform: 'youtube', contributor: null });
    await runJob({
      sql: sql2, anthropic: claudeStub, groqKey: '', ytKey: 'test-key',
      fetch: async () => ({ ok: true, json: async () => ({ items: [{ snippet: { title: 'T', channelTitle: 'C', description: 'subscribe to my channel!!' }, contentDetails: { duration: 'PT2M' } }] }) }),
      uptimeS: () => 999
    }, 10);
    chk('a promo-only description still fails honestly, with the paste advice',
      sql2.state.statuses.includes('failed') && /copy that text|paste box/.test(sql2.state.error), sql2.state.error);
    chk('and the job records WHY the salvage did not help',
      /SALVAGE: ok \(description \d+ chars\) — but no recipe is written in it/.test(sql2.state.debug || ''),
      sql2.state.debug);
    delete process.env.YTDLP_PATH;
    delete process.env.FFMPEG_PATH;
    fs.rmSync(dir2, { recursive: true, force: true });
  }


  console.log('\n== The exit codes db-sync reads are the ones export.js writes (R75) ==');
  {
    /* The nightly publish turns entirely on a number. `db/export.js --check`
       exits 0 for "identical", 2 for "genuinely drifted", 3 for "refused to
       write a book that lost most of itself", and 1 for anything that went
       wrong; `db-sync.yml` branches on exactly those, and only the 2 branch
       ever commits. Nobody checks the two files still agree. Change the 2 to
       a 1 and the workflow reads it as "could not read the database" — the
       sync errors out every night and **no video-imported recipe ever
       reaches the family again**, with a red cross nobody is watching as the
       only sign. */
    const cp = require('child_process');
    const root = path.join(__dirname, '..');
    const wf = fs.readFileSync(
      path.join(root, '.github', 'workflows', 'db-sync.yml'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'db', 'export.js'), 'utf8');

    /* Run it for real in the one state that needs no database: unconfigured.
       This is the case that has to look like a failure and not like "nothing
       to do", because an unconfigured sync reporting success is precisely
       how it once went unnoticed for a fortnight. */
    const env = Object.assign({}, process.env);
    delete env.KT_DB;
    const run = cp.spawnSync(process.execPath, ['db/export.js', '--check'],
      { cwd: root, env, encoding: 'utf8' });
    chk('unconfigured, --check exits 1 — not 0, and not "drifted"',
      run.status === 1, 'exit ' + run.status + ' :: ' + (run.stderr || '').trim());

    /* Every literal inside a process.exit(...), including the two that live
       in a ternary — `process.exit(a === b ? 0 : 2)` — which is exactly the
       spelling a grep for `exit(2)` would walk straight past. */
    const writes = [...new Set((script.match(/process\.exit\(([^)]*)\)/g) || [])
      .reduce((acc, call) => acc.concat(call.match(/\d/g) || []), []))].sort();
    const reads = [...new Set((wf.match(/"\$code"\s+-eq\s+(\d)/g) || [])
      .map(x => x.replace(/\D/g, '')))].sort();
    chk('export.js states its codes and db-sync reads some',
      writes.length >= 3 && reads.length >= 2,
      'writes ' + JSON.stringify(writes) + ' reads ' + JSON.stringify(reads));
    const unknown = reads.filter(c => writes.indexOf(c) === -1);
    chk('every code the workflow branches on is one the script can produce',
      unknown.length === 0, unknown.join(', '));
    chk('including the one that means "go ahead and publish"',
      reads.indexOf('2') > -1 && writes.indexOf('2') > -1);
    chk('and the one that means "refused to write"',
      reads.indexOf('3') > -1 && writes.indexOf('3') > -1);

    /* Anything the workflow does not name must still be loud. A code it has
       never heard of has to reach the else branch and stop the run, not fall
       through to a commit. */
    chk('an unrecognised code errors rather than committing',
      /else\s*\n\s*echo "::error title=db-sync could not read the database/.test(wf) &&
      /exit "\$code"/.test(wf));
    /* And the commit itself is reachable only from the drifted branch. */
    const commitAt = wf.indexOf('git commit');
    const gate = wf.lastIndexOf("steps.check.outputs.drift == 'yes'", commitAt);
    chk('the commit step is gated on the drifted branch alone',
      commitAt > -1 && gate > -1 && gate < commitAt,
      'commit at ' + commitAt + ', gate at ' + gate);
  }

  console.log('\n== The one field that becomes a URL (S05) ==');
  {
    /* `image` is the only recipe field the app turns into an address, and it
       took any 2,000 characters at all. Nothing catastrophic was reachable
       through it — the page's CSP is `img-src 'self' data: blob:` so a
       remote address never loads, and `R98` clears a broken picture away
       quietly — but the result is a dead link committed into recipes.json
       and published to everyone. Since `S04` that string arrives from a
       phone rather than only from an import review, which is reason enough
       to be exact about it. */
    const { validateRecipe } = require('../backend/lib/validate');
    const base = { id: 'x', title: 'T', category: 'Dinner', contributor: 'Joan',
      servings: 4, ingredients: ['a'], steps: ['b'] };
    const withImage = (v) => validateRecipe(Object.assign({}, base, { image: v }));

    chk('the shape the app itself writes is accepted',
      withImage('images/x.jpg').recipe.image === 'images/x.jpg');
    chk('and a recipe with no photo is still fine',
      !validateRecipe(base).error && validateRecipe(base).recipe.image === undefined);
    for (const [v, why] of [
      ['https://evil.example/x.jpg', 'a remote address'],
      ['//evil.example/x.jpg', 'a protocol-relative one'],
      ['javascript:alert(1)', 'a script URL'],
      ['../../etc/passwd', 'a path climbing out'],
      ['images/../x.jpg', 'one climbing out halfway'],
      ['images/x.png', 'a type the download never writes'],
      ['x'.repeat(1500), 'a kilobyte of noise']
    ]) chk(why + ' is refused', !!withImage(v).error, v.slice(0, 40));

    /* Two rules about the same slug that disagree is a bug waiting for
       whoever writes the first id starting with a hyphen. */
    const ids = ['x', 'a-b-c', '-lead', 'trail-', '9', 'warm-chocolate-pudding-cake'];
    const mismatched = ids.filter(id => validateRecipe(
      Object.assign({}, base, { id, image: 'images/' + id + '.jpg' })).error);
    chk('every id the validator accepts can have a photo path it also accepts',
      mismatched.length === 0, mismatched.join(', '));

    /* And the app's own writer must never produce something the server
       refuses — the two live in different files and drifted before (`R100`). */
    const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const writes = appSrc.match(/out\.image = ([^;]+);/);
    chk('the app writes the photo path in exactly that shape',
      !!writes && /"images\/" \+ recipe\.id \+ "\.jpg"/.test(writes[1]),
      writes ? writes[1] : 'no writer found');
  }

  console.log('\n== Who may change the book for everybody (S01) ==');
  {
    /* The single most dangerous thing in this arc. Until now a stranger who
       found the Render address could spend money on imports; the wall for
       that was the rate limiter and the day cap. A write endpoint changes
       the worst case from a bill to Joan's recipes, so it gets a gate, and
       the gate gets proved rather than trusted. */
    const { makeWriteGate } = require('../backend/lib/writegate');
    const { makeLimiter } = require('../backend/lib/ratelimit');
    const KEY = 'a-family-passphrase';

    const open = makeWriteGate('', makeLimiter(10, 3600000));
    chk('with no key configured, the gate reports itself unconfigured', open.configured === false);
    const unset = open.refusalFor({ 'x-kitchen-key': KEY }, '1.1.1.1', 0);
    chk('and refuses even the right passphrase — unset fails CLOSED',
      unset && unset.status === 503, JSON.stringify(unset));

    const g = makeWriteGate(KEY, makeLimiter(10, 3600000));
    chk('the right passphrase is let through',
      g.refusalFor({ 'x-kitchen-key': KEY }, '1.1.1.1', 0) === null);
    chk('a wrong one is not',
      (g.refusalFor({ 'x-kitchen-key': 'nope' }, '1.1.1.1', 0) || {}).status === 401);
    chk('and no passphrase at all is not',
      (g.refusalFor({}, '1.1.1.1', 0) || {}).status === 401);

    /* A refusal that describes the key is a refusal that helps guess it. */
    const wrong = g.refusalFor({ 'x-kitchen-key': 'a-family-passphras' }, '1.1.1.1', 0);
    const missing = g.refusalFor({}, '1.1.1.1', 0);
    chk('a near-miss reads exactly like no attempt at all',
      wrong.error === missing.error, wrong.error + ' | ' + missing.error);
    chk('and the refusal never contains the key, or any part of it',
      wrong.error.indexOf(KEY) === -1 && !/passphras[^e]/.test(wrong.error), wrong.error);

    /* Length is the first thing a stranger would like to learn. */
    chk('a key of a different length is refused, not crashed on',
      (g.refusalFor({ 'x-kitchen-key': 'x' }, '1.1.1.1', 0) || {}).status === 401);
    chk('and a very long one is too',
      (g.refusalFor({ 'x-kitchen-key': 'x'.repeat(5000) }, '1.1.1.1', 0) || {}).status === 401);

    /* Patience, not flooding, is the shape of an attack on a family
       passphrase — so the wall is per hour, and only wrong answers walk
       toward it. */
    const g2 = makeWriteGate(KEY, makeLimiter(10, 3600000));
    let last = null;
    for (let i = 0; i < 12; i++) last = g2.refusalFor({ 'x-kitchen-key': 'guess' + i }, '9.9.9.9', 1000);
    chk('a patient guesser is walled after ten wrong answers',
      last && last.status === 429, JSON.stringify(last));
    chk('and the wall is per caller, not for everyone',
      (g2.refusalFor({ 'x-kitchen-key': 'nope' }, '8.8.8.8', 1000) || {}).status === 401);
    chk('while the family, who know it, are never counted toward that wall',
      g2.refusalFor({ 'x-kitchen-key': KEY }, '9.9.9.9', 1000) === null);
  }

  console.log('\n== A change reaches the family without waiting for morning (S03) ==');
  {
    /* The database is the canonical copy and db-sync is what turns it back
       into recipes.json. This asks for that run. Every rule here is about
       not making a write worse than it was. */
    const { makePublisher } = require('../backend/lib/publish');
    const calls = [];
    const okFetch = (url, opts) => { calls.push({ url, opts }); return Promise.resolve({ status: 204, ok: true }); };

    const none = makePublisher({ token: '', fetchImpl: okFetch });
    chk('with no token it reports itself unconfigured', none.configured === false);
    chk('and pokes nothing', (await none.poke(0)).sent === false && calls.length === 0);

    const pub = makePublisher({ token: 'ghp_secret', fetchImpl: okFetch, cooldownMs: 90000 });
    const first = await pub.poke(0);
    chk('a write asks db-sync to run', first.sent === true, JSON.stringify(first));
    chk('at the workflow this repo actually has',
      /actions\/workflows\/db-sync\.yml\/dispatches$/.test(calls[0].url), calls[0].url);
    chk('naming the branch Pages publishes from',
      JSON.parse(calls[0].opts.body).ref === 'main', calls[0].opts.body);

    /* Four typos fixed in a row is one publish, not four: the sync rebuilds
       the whole file, so one run covers everything that landed before it. */
    const second = await pub.poke(1000);
    chk('a second change moments later does not start a second run',
      second.sent === false && second.why === 'debounced', JSON.stringify(second));
    chk('and nothing else was sent', calls.length === 1, String(calls.length));
    chk('but once the cooldown passes it runs again',
      (await pub.poke(200000)).sent === true);

    /* The rule that matters most: this must never turn a saved recipe into
       a failed one. */
    const bad = makePublisher({ token: 'ghp_secret', cooldownMs: 0,
      fetchImpl: () => Promise.reject(new Error('getaddrinfo ENOTFOUND api.github.com')) });
    const r1 = await bad.poke(0);
    chk('an unreachable GitHub is reported, not thrown',
      r1.sent === false && r1.why === 'unreachable', JSON.stringify(r1));
    const refused = makePublisher({ token: 'ghp_secret', cooldownMs: 0,
      fetchImpl: () => Promise.resolve({ status: 403, ok: false }) });
    const r2 = await refused.poke(0);
    chk('and so is a token GitHub will not accept',
      r2.sent === false && /403/.test(r2.why), JSON.stringify(r2));

    /* A token in a log line is a token in a support screenshot. */
    const logged = [];
    const noisy = makePublisher({ token: 'ghp_SUPERSECRET', cooldownMs: 0,
      log: (m) => logged.push(m),
      fetchImpl: () => Promise.resolve({ status: 401, ok: false }) });
    await noisy.poke(0);
    chk('and the token never reaches a log line',
      logged.length > 0 && !logged.join(' ').includes('SUPERSECRET'), logged.join(' '));
    /* `R137` put a reason on the health endpoint, which is a public page. */
    chk('nor the reason the health endpoint now publishes',
      !String(noisy.lastError()).includes('SUPERSECRET'), String(noisy.lastError()));

    /* `R137` — and a poke that never happened must not spend the ninety
       seconds a poke that did would have earned.
     *
     * The debounce is not a rate limit. Its whole justification, written at
     * the top of the file, is that "the sync regenerates the whole file, so
     * a single run covers everything that landed before it" — it is a
     * PROMISE THAT A RUN IS ALREADY COVERING THIS. When the run never
     * started, that promise is false, and the next writer is told
     * "debounced" while nothing is on its way for either of them.
     *
     * Both changes then wait for the nightly sync. That is the direction
     * this app errs in — late, never wrong — but it is meant to be the cost
     * of a phone closing mid-burst, not the cost of one unlucky request.
     *
     * Every failure test above passes `cooldownMs: 0`, which is exactly why
     * the seam between failing and debouncing had never been looked at. */
    const flaky = [];
    let gh = 'down';
    const flakyPub = makePublisher({ token: 'ghp_secret', cooldownMs: 90000,
      fetchImpl: (url) => {
        flaky.push(url);
        return gh === 'down'
          ? Promise.reject(new Error('getaddrinfo ENOTFOUND api.github.com'))
          : Promise.resolve({ status: 204, ok: true });
      } });
    const missed = await flakyPub.poke(0);
    chk('a poke GitHub never took is reported as such',
      missed.sent === false && missed.why === 'unreachable', JSON.stringify(missed));
    chk('and does not count as a publish that happened',
      flakyPub.lastSentAt() === null, String(flakyPub.lastSentAt()));
    gh = 'up';
    const nextWriter = await flakyPub.poke(20000);
    chk('so the next change is not told a run is already covering it',
      nextWriter.sent === true, JSON.stringify(nextWriter));
    chk('and GitHub really was asked the second time', flaky.length === 2,
      String(flaky.length));
    chk('now the window is real, and holds',
      (await flakyPub.poke(21000)).why === 'debounced');
    chk('and lastSentAt means the poke that landed',
      flakyPub.lastSentAt() === 20000, String(flakyPub.lastSentAt()));
    chk('a publisher that has recovered stops reporting the old failure',
      flakyPub.lastError() === null, String(flakyPub.lastError()));

    /* A failure AFTER a success must not forget the success either, or the
       window it earned reopens and four typos become four publishes again. */
    gh = 'down';
    const after = await flakyPub.poke(200000);
    chk('a failure after a success is still a failure',
      after.sent === false, JSON.stringify(after));
    chk('and leaves the last real publish where it was',
      flakyPub.lastSentAt() === 20000, String(flakyPub.lastSentAt()));
    chk('while the fresh failure is the one reported',
      flakyPub.lastError() === 'unreachable', String(flakyPub.lastError()));

    /* The assignment stays BEFORE the request, which is what stops two
       writes landing together from both calling GitHub. Pinned, because the
       obvious way to fix the above is to move it after — and that trades one
       fault for a worse one. */
    const slow = [];
    let release;
    const gate = new Promise((r) => { release = r; });
    const concurrent = makePublisher({ token: 'ghp_secret', cooldownMs: 90000,
      fetchImpl: (url) => { slow.push(url); return gate; } });
    const inFlight = concurrent.poke(0);
    const alongsideP = concurrent.poke(10);
    /* Both bodies run to their await before anything is awaited here, and
       the gate is released before either result is read — otherwise a
       version that DOES call GitHub twice deadlocks on the second call and
       this check dies silently instead of by name. */
    await Promise.resolve();
    chk('so GitHub is asked once, not twice', slow.length === 1, String(slow.length));
    release({ status: 204, ok: true });
    const alongside = await alongsideP;
    chk('a second write while the first is still in the air is held back',
      alongside.sent === false && alongside.why === 'debounced',
      JSON.stringify(alongside));
    chk('and the one in the air still lands', (await inFlight).sent === true);
  }

  console.log('\n== The edit endpoint is wired the way the gate expects (S02) ==');
  {
    const src = fs.readFileSync(path.join(__dirname, '..', 'backend', 'server.js'), 'utf8');
    const put = src.slice(src.indexOf('async function putRecipe'), src.indexOf('/* ---', src.indexOf('async function putRecipe')));
    chk('the edit route exists', /\/api\\\/recipes\\\/|api\/recipes/.test(src));
    chk('and the very first thing it does is ask the gate',
      put.indexOf('refusalFor') < put.indexOf('bodyOr400'), 'gate must precede reading the body');
    chk('it validates before it writes',
      put.indexOf('validateRecipe') < put.indexOf('insert into kitchen.recipes'));
    /* The body must not be able to redirect the write onto another recipe. */
    chk('the id comes from the address, and a body that disagrees is refused',
      /r\.id !== id/.test(put), 'no path/body id check');
    /* Editing is not adding: "recently added" must not reshuffle on a typo. */
    chk('an edit overwrites its own row', /on conflict \(id\) do update/.test(put));
    chk('and does not touch position, so fixing a typo does not jump the queue',
      !/position\s*=\s*excluded\.position/.test(put));
    /* A tag someone removed has to actually come off. */
    chk('tags are replaced, not merely added to',
      /delete from kitchen\.recipe_tags where recipe_id/.test(put));
    chk('the browser is allowed to send the header the gate reads',
      /access-control-allow-headers[^\n]*x-kitchen-key/.test(src));
    chk('and to use the method the route answers',
      /access-control-allow-methods[^\n]*PUT/.test(src));
    chk('a write with no database is refused before it is attempted',
      /api\/recipes"\) === 0/.test(src) || /indexOf\("\/api\/recipes"\)/.test(src));
  }

  console.log('\n== The five words the app answers to itself (R132) ==');
  {
    /* A recipe id is the whole address the app reads it at
       (`#chicken-fritters`), so an id that IS one of the app's own screens
       is a recipe it can store and list but never open — measured in
       `tests/kt.js`, where six of seven seeded recipes drew a card on the
       Menu and every one of them opened a different screen.

       The app moves such an id out of the way at its own boundary, the way
       `R70` moves a duplicate. Refusing it here keeps it out of the
       database in the first place, so no phone has to keep renaming it at
       every boot — and there are two boundaries into that database, the
       wire and the nightly file, which is `R115`'s lesson about the title:
       they must not disagree about what is refused. */
    const { validateRecipe, ROUTE_WORDS } = require('../backend/lib/validate');
    const ok = { id: 'x', title: 'A Recipe', category: 'Dinner', contributor: 'Joan',
      servings: 4, ingredients: ['1 cup flour'], steps: ['Bake it.'] };

    chk('the list is the five screens the app has', 
      ROUTE_WORDS.slice().sort().join(',') === 'add,help,main,menu,plan',
      ROUTE_WORDS.join(','));
    for (const w of ROUTE_WORDS) {
      const v = validateRecipe(Object.assign({}, ok, { id: w }));
      chk('“' + w + '” is refused, and says why', !!v.error && /own screens/.test(v.error),
        JSON.stringify(v.error));
    }
    chk('while the moved-out-of-the-way id is fine',
      !validateRecipe(Object.assign({}, ok, { id: 'plan-2' })).error);
    chk('and so is anything that merely starts with one',
      !validateRecipe(Object.assign({}, ok, { id: 'menu-of-the-week' })).error &&
      !validateRecipe(Object.assign({}, ok, { id: 'menuboard' })).error);

    /* The nightly file is the other way in, and it runs at 06:17 with
       nobody watching. */
    const mig = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrate.js'), 'utf8');
    chk('the nightly migration reads the same list rather than typing its own',
      /require\('\.\.\/backend\/lib\/validate'\)/.test(mig) && /ROUTE_WORDS/.test(mig),
      'migrate does not share the list');
    chk('and refuses a recipe that has taken one',
      /ROUTE_WORDS\.includes\(r\.id\)/.test(mig) && /die\(/.test(mig));
    /* A floor: the two boundaries guard the same field for the same reason
       and must not drift apart (`R115`). */
    const val = fs.readFileSync(path.join(__dirname, '..', 'backend', 'lib', 'validate.js'), 'utf8');
    chk('and both name the one list, in one place',
      (val.match(/const ROUTE_WORDS = \[/g) || []).length === 1 &&
      !/const ROUTE_WORDS = \[/.test(mig),
      'a second copy of the list exists');
  }

  console.log('\n== A create must not overwrite; an edit must (R127) ==');
  {
    /* `S09` sent a newly typed recipe through the same call as an edit, and
       `putRecipe` overwrites by design. The two are opposite instructions:
       an edit says "someone opened THIS recipe and changed it", while a
       create's id was minted by `slugify(title)` against the phone's own
       copy of the book — so an id already in use belongs to somebody else's
       recipe, and writing over it destroys one.

       `acceptJob` had answered this from the day it was built. The rule now
       lives in one place so the two cannot drift. */
    const { freeRecipeId } = require('../backend/lib/ids');
    const fakeSql = (taken) => {
      const seen = new Set(taken);
      const f = (strings, ...vals) => Promise.resolve(seen.has(vals[0]) ? [{ one: 1 }] : []);
      f.asked = [];
      return (strings, ...vals) => { f.asked.push(vals[0]); return f(strings, ...vals); };
    };

    chk('a free name is used as it is', await freeRecipeId(fakeSql([]), 'shortbread') === 'shortbread');
    chk('a taken one is suffixed rather than overwritten',
      await freeRecipeId(fakeSql(['shortbread']), 'shortbread') === 'shortbread-2');
    chk('and keeps counting past the second',
      await freeRecipeId(fakeSql(['shortbread', 'shortbread-2']), 'shortbread') === 'shortbread-3');
    chk('it suffixes the ORIGINAL, so nothing turns into name-2-2',
      await freeRecipeId(fakeSql(['shortbread', 'shortbread-2', 'shortbread-3']), 'shortbread')
        === 'shortbread-4');
    {
      /* A `while` around a database call with no ceiling is a hang waiting
         for a pathological table, and this one is reachable by anybody
         holding the passphrase. */
      const every = { has: () => true };
      const forever = (strings, ...vals) => Promise.resolve([{ one: 1 }]);
      const out = await freeRecipeId(forever, 'x');
      chk('and it stops rather than looping for ever on a table that says yes to everything',
        typeof out === 'string' && out.length < 40, String(out));
    }

    const src = fs.readFileSync(path.join(__dirname, '..', 'backend', 'server.js'), 'utf8');
    const put = src.slice(src.indexOf('async function putRecipe'), src.indexOf('/* ---', src.indexOf('async function putRecipe')));
    const accept = src.slice(src.indexOf('async function acceptJob'), src.indexOf('async function putRecipe'));
    chk('the write endpoint can be told this is a new recipe',
      /async function putRecipe\(req, res, id, more, isNew\)/.test(put), 'no isNew parameter');
    chk('and the route reads it off the address',
      /u\.searchParams\.get\("new"\) === "1"/.test(src), 'route does not pass new');
    chk('a create looks for a free name first',
      /if \(isNew\) rowId = await freeRecipeId\(sql, r\.id\)/.test(put), 'no free-id lookup');
    chk('and the row it writes is the free one, not the one it was handed',
      /values\s*\n\s*\(\$\{rowId\}/.test(put), 'insert does not use rowId');
    chk('the tags follow the row that was actually written',
      !/recipe_tags where recipe_id = \$\{r\.id\}/.test(put) &&
      /recipe_tags where recipe_id = \$\{rowId\}/.test(put));
    chk('and the phone is told where its copy went',
      /id: rowId/.test(put), 'reply does not carry the id used');
    /* The load-bearing half: with `new`, the conflict clause must not fire,
       or freeRecipeId losing a race would still overwrite. */
    chk('a create cannot fall through to the overwrite',
      /where \$\{isNew \? 0 : 1\} = 1/.test(put), 'conflict update is unconditional');
    chk('and knows whether it landed rather than assuming',
      /returning id`\)\.length/.test(put), 'nothing checks the write happened');
    chk('an edit still overwrites its own row', /on conflict \(id\) do update/.test(put));
    chk('and still does not touch position',
      !/position\s*=\s*excluded\.position/.test(put));

    /* One rule, one home. Two copies of it are two chances to drift, which
       is exactly how `S09` produced this bug in the first place. */
    chk('the import path and the write path share the one rule',
      /await freeRecipeId\(sql, r\.id\)/.test(accept) && /await freeRecipeId\(sql, r\.id\)/.test(put));
    chk('and neither keeps a hand-rolled copy of it',
      !/while \(\(await sql`select 1 from kitchen\.recipes/.test(src),
      'a second suffixing loop is still in server.js');
  }

  console.log('\n== A burst publishes once, after the last row is in (S11) ==');
  {
    /* `S11` sends a bulk tag change one recipe at a time. Without a way to
       say "more coming", the FIRST write fires the republish and the other
       47 race a GitHub runner starting up — and the publisher's own cooldown
       guarantees no later write can fire a second one. That race is real,
       and this proves it before asserting the cure. */
    const { makePublisher } = require('../backend/lib/publish');
    const burst = makePublisher({ token: 'ghp_x', cooldownMs: 90000,
      fetchImpl: () => Promise.resolve({ status: 204, ok: true }) });
    const first = await burst.poke(0);
    const later = await burst.poke(1000);
    chk('the first write of a burst would publish', first.sent === true, JSON.stringify(first));
    chk('and no later one can, so the poke must be held back instead',
      later.sent === false && later.why === 'debounced', JSON.stringify(later));

    const src = fs.readFileSync(path.join(__dirname, '..', 'backend', 'server.js'), 'utf8');
    const put = src.slice(src.indexOf('async function putRecipe'), src.indexOf('/* ---', src.indexOf('async function putRecipe')));
    chk('the write endpoint can be told more is coming',
      /async function putRecipe\(req, res, id, more[,)]/.test(put), 'no more parameter');
    chk('and the route reads it off the address',
      /putRecipe\(req, res, m\[1\],\s*u\.searchParams\.get\("more"\) === "1"/.test(src),
      'route does not pass more');
    chk('a deferred write does not poke at all',
      /more \? \{ sent: false[^}]*\} : await publisher\.poke\(\)/.test(put), 'poke not guarded');
    chk('and still reports what actually happened, not what will',
      /publishing: poked\.sent/.test(put), 'publishing must mirror the poke');
    /* Deferring costs a caller nothing they did not already have: reaching
       this line at all needs the family passphrase, and the only effect is
       that the change waits for the nightly sync instead of a poke. */
    chk('the flag is read only on the write route',
      (src.match(/searchParams\.get\("more"\)/g) || []).length === 1,
      'more must not steer anything else');
  }

  console.log('\n== The setup note tells the truth about KT_DB (R151) ==');
  {
    /* `KT_DB` lives in two unrelated places — Render's Environment tab, so
       the import server can read the database, and a GitHub Actions secret,
       so the nightly `db-sync` can turn it back into `recipes.json`. Setting
       the first implies nothing about the second, and doing only half is
       worse than doing neither: with `KT_WRITE_KEY` set and the Actions
       secret missing, every edit a phone shares lands in the database and
       stops there — saved, reported saved, invisible to the family.
       `db-sync.yml`'s own warning exists because that went unnoticed for a
       fortnight.

       Measured on 2026-08-23: the secret is not set. Twenty-two scheduled
       runs, every one reporting success, every one a no-op — which is the
       designed behaviour of the warning, not a bug in it.

       The note is now in `backend/README.md`. This holds it to naming things
       that really exist: a reader following "how to tell in ten seconds"
       must be told field names the server actually reports and summary text
       the workflow actually writes, or the instructions send them looking
       for something that isn't there. `R126`'s rule — the labels a page
       names are checked against what the app draws. */
    const fsR = require('fs'), pathR = require('path');
    const root = pathR.join(__dirname, '..');
    const rd = (f) => fsR.readFileSync(pathR.join(root, f), 'utf8');
    const readme = rd('backend/README.md');
    const sync = rd('.github/workflows/db-sync.yml');
    const server = rd('backend/server.js');

    /* Scoped to the section that does the telling, not to the file. The
       first version asked whether the phrase appeared ANYWHERE, and the
       rotation note further down has always mentioned the Actions secret in
       passing — so deleting it from the new section left the check green.
       `R145` wrote this lesson down exactly once before, about requiring a
       document to name `tests/screens.js` somewhere; met again here, and
       recorded rather than quietly fixed. */
    const note = (readme.split(/\n(?=## )/)
      .find((sec) => /^## `KT_DB` has two homes/.test(sec)) || '');
    chk('the note exists and is a section of its own',
      note.length > 400, note.length + ' chars');
    chk('the note names both homes of KT_DB',
      /Render's `KT_DB`/.test(note) && /Actions secret `KT_DB`/.test(note),
      'render=' + /Render's `KT_DB`/.test(note) +
      ' actions=' + /Actions secret `KT_DB`/.test(note));
    chk('and says which one has to come first',
      /before — or at the same time as — `KT_WRITE_KEY`/.test(note),
      'the ordering constraint must be stated in the section itself');

    /* The two ways to check, bound to what really emits them. */
    ['accepts_changes', 'publishes_on_change', 'missing'].forEach((f) => {
      chk('health field `' + f + '` is named in the note and reported by the server',
        readme.indexOf(f) > -1 && server.indexOf(f) > -1,
        'readme=' + (readme.indexOf(f) > -1) + ' server=' + (server.indexOf(f) > -1));
    });
    /* Whitespace collapsed before matching, because prose wraps and this
       phrase happens to break across a line in the README. `R149` had just
       finished writing that lesson down — a line-sensitive matcher misses a
       claim that is plainly there — and this check walked straight into it
       anyway, which is why it is recorded rather than quietly fixed. */
    const flat = (t) => t.replace(/\s+/g, ' ');
    const warned = 'Skipped: \\`KT_DB\\` secret is not set';
    chk('and the summary line the note tells a reader to look for is the one the workflow writes',
      flat(sync).indexOf(flat(warned)) > -1 &&
      flat(readme).indexOf('Skipped: `KT_DB` secret is not set') > -1,
      'workflow=' + (flat(sync).indexOf(flat(warned)) > -1) +
      ' readme=' + (flat(readme).indexOf('Skipped: `KT_DB` secret is not set') > -1));
    /* A floor: a note that stopped explaining the hazard would pass the
       string rules above while telling a reader nothing. */
    chk('and it still explains why half the setup is the dangerous state',
      /lands in the database and stops there/.test(readme) &&
      /default branch/.test(readme),
      readme.length + ' chars');
  }

  console.log('\nbackend: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SUITE CRASH:', e); process.exit(1); });
