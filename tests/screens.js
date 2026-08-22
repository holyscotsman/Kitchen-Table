/* `R131` — every screen this app has, in one place.
 *
 * Three sweeps walk the app state by state: the contrast audit
 * (`tests/contrast.js`), and the accessible-name and 44px-floor sweeps in
 * `tests/kt.js`. Each carried its own hand-typed list, and they had drifted
 * to 32, 16 and **6** states respectively — while the a11y list's comment
 * said *"Same list the contrast audit walks"*, which was false by sixteen
 * screens, and the floor sweep's own comment records why that matters:
 *
 *     Every screen, not just the Menu: the servings number shipped a hair
 *     under the floor (R16) precisely because this sweep only ever visited
 *     one route.
 *
 * The same sentence one level down. `R85` found 192 contrast failures the
 * moment two unswept modes were added, so "which states are missing" is a
 * question worth answering once, in one place, rather than three times.
 *
 * An entry is `[name, hash, opener, seed, net]`:
 *   - `opener`  a selector to click after load, or null for the bare route;
 *   - `seed`    localStorage to plant before boot (a `session:` prefix on the
 *               key plants it in sessionStorage instead) — `R101`;
 *   - `net`     `{url, holdMs}`, a request to hold and then refuse — `R110`.
 * A sweep that has no use for a field ignores it; none of them may quietly
 * skip a screen.
 */
const SCREENS = [
      ['Main','#',null],['Menu','#menu',null],
      ['Menu + filter sheet','#menu','[data-act="open-filter"]'],
      ['Recipe','#chicken-cordon-bleu',null],
      ['Recipe flagged','#chops',null],
      /* `R133` — a recipe carrying a tag chip. It lived in the print list
         and nowhere else, so the SCREEN passes had never seen one: found by
         the floor below, which is the whole reason for having a floor. */
      ['Recipe with a tag','#scottish-tablet',null],
      /* R60 — the kept-amount note only exists on a rescaled recipe, so it
         needs a route of its own. One tap on + is enough to be off the
         original count; this one carries seven of them. */
      ['Recipe rescaled','#potato-bacon-soup','[data-act="serv+"]'],
      ['Recipe edit','#chicken-cordon-bleu','[data-act="toggle-edit"]'],
      ['Recipe download sheet','#bacon-ranch-chicken-casserole','[data-act="open-dl"]'],
      ['Menu text sheet','#menu','[data-act="open-text"]'],
      ['Week planner','#plan',null],
      /* `R85` — two whole modes the route list had never visited. They are
         reached from two buttons side by side, one of them destructive, and
         the colours that tell them apart are the point. */
      ['Menu tag mode','#menu','[data-act="toggle-tagging"]'],
      ['Menu remove mode','#menu','[data-act="toggle-remove"]'],
      /* `R86` — the rest of what the list had never visited. `R85` found
         192 failures in the two modes above the moment they were added, so
         "which states are missing" is a question worth finishing rather
         than answering once. Sheets and popups each put familiar
         components on a surface they were not written for, which is
         exactly the shape of the bug `R85` turned up. */
      ['Menu sort menu','#menu','[data-act="toggle-sort"]'],
      ['Menu search, nothing found','#menu','[data-act="toggle-search"]'],
      ['Week planner, planned','#plan','[data-act="toggle-list"]'],
      ['Week planner picker','#plan','.slotadd'],
      ['Week planner meal sheet','#plan','.dayblock .mealcard'],
      ['Menu tag sheet','#menu','[data-act="open-bulk"]'],
      /* The one full-screen surface in the app, and the last one the route
         list had never reached. */
      ['Recipe photo lightbox','#chicken-cordon-bleu','[data-act="open-lb"]'],
      ['Add screen','#add',null],
      ['Add review form','#add','[data-key="review"]'],
      ['Add from a link','#add','[data-key="link"]'],
      ['Add from a photo','#add','[data-key="photo"]'],
      ['Add from a video','#add','[data-key="video"]'],
      ['How to use it','#help',''],
      /* `S06` — the help page now reads the phone rather than describing
         phones in general, which makes its shared-edit half a state of its
         own that nothing had looked at. Same question as `R110`: which
         states can this audit even reach. */
      ['How to use it, on a phone that shares',  '#help', '',
        { 'kt.kitchenKey': JSON.stringify('family-secret') }],
      /* `R101` — the two states the last rounds added, and the reason the
         table could not hold them before: every route got the SAME seeded
         data, so a state that only exists for a particular recipe was
         unreachable and simply went unmeasured. `R85` found 192 failures
         the moment two unswept modes were added, so "which states can this
         audit even reach" is the question, not "are these two fine". The
         fourth element is that route's own seed. */
      ['Recipe with no serving count','#ninja-cookies',null,{
        'kt.recipes': JSON.stringify([{ id:'ninja-cookies', title:'Ninja Cookies',
          category:'Desserts', contributor:'Joan', servings:'makes about 2 dozen',
          ingredients:['1 cup butter, softened','3 cups all-purpose flour'],
          steps:['Cream the butter.','Bake at 400F for 10 minutes.'] }])
      }],
      /* `R110` — two more states only a seed can reach, both of them a
         familiar component put on a surface it was not written for, which
         is the exact shape `R85` found 192 failures in.

         A plan outlives its recipe (task 127): the slot degrades to the
         name it was planned under and says "No longer in the book" — a
         `.rcard__meta` on a surface that exists nowhere else in the app.

         And a recipe with nothing written down draws BOTH of `R108`'s
         panels at once, a heading and a paragraph inside `.panel--flag`
         that the flagged route does not carry. */
      ['Week planner, a plan that outlived its recipe','#plan',null,{
        'kt.plan': JSON.stringify([{ id:'pgone', date:(()=>{const n=new Date();
            return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');})(),
          slot:'dinner', recipeId:'no-such-recipe', servings:4,
          titleThen:'Granny’s Clootie Dumpling' }])
      }],
      ['Recipe with nothing written down','#nowt',null,{
        'kt.recipes': JSON.stringify([{ id:'nowt', title:'Nothing At All',
          category:'Dinner', contributor:'Lindsay', servings:4,
          ingredients:[], steps:[] }])
      }],
      /* And the state this audit could not reach at all until it could stub
         the NETWORK as well as the storage — the seed `R101` added answers
         "which recipe", not "what did the wire do". `R98` wrote this branch
         for a real case its own comment describes: the hero button is
         painted before the 404 comes back, so a photo can already be open
         full screen when it fails, and a dialog is not something to yank
         away underneath someone.

         Reached deterministically rather than by racing a timer: the first
         request for the photo is answered with a real image marked
         `no-store`, so the hero paints; the lightbox opening must go back
         to the wire for it, and that request is refused. */
      /* `R111` — the two Add-screen states left. The waiting card is not an
         edge case: it is where a reader sits for MINUTES while a video is
         written up, and `CLAUDE.md` requires a cold start to read as
         "waking up the kitchen…" rather than as an error — wording nothing
         had ever contrast-checked. The refusal beside it is the other half:
         the sentence shown when a link is not one the server can take. */
      ['Add, waiting on the kitchen server','#add',null,{
        'session:kt.addDraft': JSON.stringify({ step:'video',
          videoUrl:'https://youtu.be/vid1', videoJob:{ id:7, status:'transcribing' } })
      }],
      ['Add, a link the server will not take','#add','[data-key="video"]',null],
      ['Recipe photo that failed while open','#chicken-cordon-bleu','[data-act="open-lb"]',
        { 'kt.images': '{}',
          'kt.recipes': JSON.stringify([{ id:'chicken-cordon-bleu',
            title:'Chicken Cordon Bleu', category:'Dinner', contributor:'Joan',
            servings:4, ingredients:['4 large chicken breasts'],
            steps:['Bake it.'], image:'images/chicken-cordon-bleu.jpg' }]) },
        { url: '**/images/**', holdMs: 4000 }],
];

/* The proof that a state actually opened. A route that never opened is a
   clean pass on nothing — `R86` found four routes auditing the screen behind
   a sheet that never appeared, and `R110` found a fifth. */
const NEED = {
  'Recipe with no serving count': '.servcard__value--none',
  'Week planner, a plan that outlived its recipe': '.mealcard--gone',
  'Recipe with nothing written down': '.panel--flag',
  'Recipe photo that failed while open': '.lightbox__gone',
  'How to use it, on a phone that shares': '.help__h1',
  'Add, waiting on the kitchen server': '.vprog',
  'Add, a link the server will not take': '.notice--bad',
  'Recipe photo lightbox': '.lightbox',
  'Menu sort menu': '.sortmenu',
  'Menu search, nothing found': '.emptybox, .empty, #main-content',
  'Week planner, planned': '.shoplist__items',
  'Week planner picker': '#pick-q',
  'Week planner meal sheet': '.sheet',
  'Menu tag sheet': '.sheet'
};

/* Everything a screen needs planted before boot. Serialised into the page by
   `addInitScript`, so it must stay self-contained. */
function seedInit(a) {
  if (a.t) localStorage.setItem('kt.theme', JSON.stringify(a.t));
  if (a.e) localStorage.setItem('kt.easyRead', 'true');
  /* The planner's states only exist with meals in them — and the meals have
     to land in the week the planner is SHOWING. `R113`: offsets from today
     walk off the end of a Monday-to-Sunday week at the weekend, which
     silently audits one meal instead of two rather than failing. Anchored to
     this week's Monday, in local date parts like the app's own `isoDate`. */
  var mon = (function () { var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() - ((n.getDay() + 6) % 7)); })();
  var iso = function (n) {
    var d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0'); };
  /* And the lightbox only exists with a photo. A 2x2 GIF is enough for a
     hero, a thumbnail and a full-screen view; the app migrates this legacy
     key into IndexedDB at boot. */
  localStorage.setItem('kt.images', JSON.stringify({ 'chicken-cordon-bleu':
    'data:image/gif;base64,R0lGODdhAgACAIABAICAgP///ywAAAAAAgACAAACA0QCBQA7' }));
  localStorage.setItem('kt.plan', JSON.stringify([
    { id: 'pseed1', date: iso(0), slot: 'dinner', recipeId: 'chicken-cordon-bleu',
      servings: 8, titleThen: 'Chicken Cordon Bleu' },
    { id: 'pseed2', date: iso(1), slot: 'dinner', recipeId: 'potato-bacon-soup',
      servings: 6, titleThen: 'Potato Bacon Soup' }
  ]));
  /* No half-finished import snapshot unless this screen asked for one
     (gameplan 084): restored, it lands on the review form instead of the
     three ways in. */
  sessionStorage.removeItem('kt.addDraft');
  /* This route's own seed, last so it can override the shared one. `R111` —
     a `session:` prefix writes to sessionStorage instead, which is where the
     half-finished import lives: the waiting card is restored from it at
     boot, and there is no other way to be standing in front of that screen
     without a server. */
  if (a.s) Object.keys(a.s).forEach(function (k) {
    return k.indexOf('session:') === 0
      ? sessionStorage.setItem(k.slice(8), a.s[k])
      : localStorage.setItem(k, a.s[k]);
  });
}

/* Drive the page to one screen. Some states need more than one tap to
   exist, and each asserts it got there rather than silently auditing the
   screen behind it. Returns "" when the state opened, or a sentence saying
   what it wanted and never saw. */
async function openScreen(p, base, entry) {
  const name = entry[0], hash = entry[1], extra = entry[2];
  await p.goto(base + '/index.html' + hash);
  /* Atkinson is self-hosted (`049`) and arrives after first paint. Measured
     before it lands, a 44px control reads 43.98 and a 24px line reads 23.9 —
     one flips the tap-target floor, the other flips the AA threshold, and
     both do it at random. Waited for rather than slept off. */
  await p.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await p.waitForTimeout(900);
  if (name === 'Menu tag sheet') {
    await p.click('[data-act="toggle-tagging"]').catch(() => {});
    await p.locator('.rrow').first().click().catch(() => {});
  }
  if (extra) {
    try { await p.click(extra, { timeout: 4000 }); }
    catch (e) { return 'trigger missing: ' + extra; }
    await p.waitForTimeout(400);
  }
  if (name === 'Menu search, nothing found') {
    await p.fill('#menu-search', 'zzzqqqx').catch(() => {});
    await p.waitForTimeout(400);
  }
  if (name === 'Add, a link the server will not take') {
    /* Refused in the page, before any request — the app knows the two
       platforms it can fetch, so this needs no server to reach. */
    await p.fill('#a-vurl', 'https://example.com/not-a-video').catch(() => {});
    await p.click('[data-act="video-submit"]').catch(() => {});
    await p.waitForTimeout(500);
  }
  /* `R133` — the seed plants two meals in the week the planner is showing,
     and a week that is showing one of them is a shopping list with half the
     ingredients in it. That is exactly how the print pass's own copy of the
     seed failed: `today + n days` puts the second meal in NEXT week every
     Sunday, and the audit read it as clean. Any planner screen that leans on
     the shared seed says so here rather than in one loop and not the other. */
  if (/^Week planner/.test(name) && !entry[3]) {
    const meals = await p.evaluate(() => document.querySelectorAll('.dayblock .mealcard').length);
    if (meals < 2) return 'the week is showing ' + meals + ' of the 2 meals it was seeded with';
  }

  const need = NEED[name];
  if (need) {
    /* Wait for the state rather than sampling once: a state that arrives off
       a network failure lands when the failure does, not on a fixed timer. */
    try { await p.waitForSelector(need, { timeout: 6000 }); }
    catch (e) { return 'state never opened: wanted ' + need; }
  }
  return '';
}

/* `R133` — which screens are worth putting on paper is a different question
   from which screens exist, and it has a different answer: nobody prints a
   sheet, a popup, or the Add screen. But it is still a question about the
   list above, so it is answered beside it rather than in a second list in
   another file — which is where it used to live, four names long, with its
   own copy of the seed and its own copy of the opener.

   That copy had drifted: it planned meals at `today + n days` in UTC, which
   is the bug `R113` fixed here. On a Sunday the second meal lands in NEXT
   week, so the printed shopping list carries one meal instead of two and
   the audit says "AA clean" over half of what it thinks it is reading. */
const PRINTS = new Set([
  'Recipe',
  'Recipe flagged',
  'Recipe rescaled',
  'Recipe with a tag',
  'Recipe with no serving count',
  'Recipe with nothing written down',
  'Week planner',
  'Week planner, planned',
  'Week planner, a plan that outlived its recipe'
]);

module.exports = { SCREENS, NEED, PRINTS, seedInit, openScreen };
