/* The import server's logic, no network and no browser: URL validation, ETA
 * math, VTT cleanup, frame dedupe, extraction shaping — and the whole
 * pipeline walked once with yt-dlp/ffmpeg faked by shell scripts and the
 * database and Claude stubbed in-process. Run directly: node tests/backend.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const chk = (n, c, e = '') => c ? (pass++, console.log('  PASS ' + n))
  : (fail++, console.log('  FAIL ' + n + (e ? ' :: ' + e : '')));

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
      if (/'failed'/.test(text)) { state.statuses.push('failed'); state.error = vals[0]; }
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

  console.log('\nbackend: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SUITE CRASH:', e); process.exit(1); });
