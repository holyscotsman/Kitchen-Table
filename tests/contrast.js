const { chromium, devices } = require('playwright');
const B = process.env.KT_BASE || 'http://127.0.0.1:8899';
const CONTRAST = `(() => {
  function lum(c){const [r,g,b]=c.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*r+0.7152*g+0.0722*b;}
  function parse(s){const m=s.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const p=m[1].split(',').map(parseFloat);if(p.length>3&&p[3]===0)return null;return [p[0],p[1],p[2]];}
  function blend(fg,bg,a){return fg.map((c,i)=>c*a+bg[i]*(1-a));}
  function bgOf(el){let n=el;while(n&&n!==document.documentElement){const cs=getComputedStyle(n);const m=cs.backgroundColor.match(/rgba?\\(([^)]+)\\)/);if(m){const p=m[1].split(',').map(parseFloat);const a=p.length>3?p[3]:1;if(a===1)return [p[0],p[1],p[2]];if(a>0){const under=bgOf(n.parentElement||document.body);return blend([p[0],p[1],p[2]],under,a);}}n=n.parentElement;}
    const b=parse(getComputedStyle(document.body).backgroundColor);return b||[255,255,255];}
  const out=[];
  document.querySelectorAll('body *').forEach(el=>{
    if(!el.offsetParent && el.tagName!=='BODY') return;
    const hasText=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
    if(!hasText) return;
    const cs=getComputedStyle(el);
    const fg=parse(cs.color); if(!fg) return;
    const bg=bgOf(el);
    const L1=lum(fg),L2=lum(bg);
    const ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
    const size=parseFloat(cs.fontSize), bold=parseInt(cs.fontWeight,10)>=700;
    const large=size>=24||(bold&&size>=18.66);
    const need=large?3:4.5;
    if(ratio<need) out.push({sel:el.tagName.toLowerCase()+'.'+(typeof el.className==='string'?el.className.trim().split(/\\s+/).join('.'):''),txt:el.textContent.trim().slice(0,28),ratio:ratio.toFixed(2),need,size:size.toFixed(0)});
  });
  return out;
})()`;
(async()=>{
  const br=await chromium.launch(process.env.KT_CHROMIUM ? { executablePath: process.env.KT_CHROMIUM } : {});
  let total=0;
  for(const mode of ['normal','easyread']){
  for(const theme of ['dark','light']){
    for(const [name,hash,extra,seed,net] of [
      ['Main','#',null],['Menu','#menu',null],
      ['Menu + filter sheet','#menu','[data-act="open-filter"]'],
      ['Recipe','#chicken-cordon-bleu',null],
      ['Recipe flagged','#chops',null],
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
        'kt.plan': JSON.stringify([{ id:'pgone', date:new Date().toISOString().slice(0,10),
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
    ]){
      const ctx=await br.newContext({...devices['iPhone 13']});
      /* Hermetic: the kitchen server is never poked from CI — the app's
         ready-list fetch on #add fails silently, exactly like offline. */
      await ctx.route('**/*.onrender.com/**', r => r.abort('failed'));
      /* `R110` — a route may stub the wire as well as the storage.
         The photo is left HANGING and then refused: the request never
         completes, so the hero button is painted with nothing in it yet,
         which is exactly `R98`'s case — the button exists before the
         failure comes back, so the lightbox can already be open when it
         does.

         The first cut served the hero a real image marked `no-store` and
         refused everything after, on the theory that the lightbox would
         have to go back to the wire for it. `no-store` governs the HTTP
         cache; it does not stop a browser reusing an image it has already
         decoded for an identical `src` in the same document. Locally it
         re-fetched and the state opened; in CI it did not, and four routes
         audited the screen behind a lightbox that was never there. Never
         letting it load leaves nothing to reuse — a state, not a race. */
      if(net){
        await ctx.route(net.url, async r => {
          await new Promise(x=>setTimeout(x, net.holdMs||2500));
          return r.abort('failed');
        });
      }
      const p=await ctx.newPage();
      await p.addInitScript(a=>{
        localStorage.setItem('kt.theme',JSON.stringify(a.t));
        if(a.e)localStorage.setItem('kt.easyRead','true');
        /* The planner's states only exist with meals in them. */
        const iso=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
        /* And the lightbox only exists with a photo. A 2x2 GIF is enough
           for a hero, a thumbnail and a full-screen view; the app migrates
           this legacy key into IndexedDB at boot. */
        localStorage.setItem('kt.images',JSON.stringify({'chicken-cordon-bleu':
          'data:image/gif;base64,R0lGODdhAgACAIABAICAgP///ywAAAAAAgACAAACA0QCBQA7'}));
        localStorage.setItem('kt.plan',JSON.stringify([
          {id:'pseed1',date:iso(0),slot:'dinner',recipeId:'chicken-cordon-bleu',servings:8,titleThen:'Chicken Cordon Bleu'},
          {id:'pseed2',date:iso(1),slot:'dinner',recipeId:'potato-bacon-soup',servings:6,titleThen:'Potato Bacon Soup'}
        ]));
        /* This route's own seed, last so it can override the shared one.
           `R111` — a `session:` prefix writes to sessionStorage instead,
           which is where the half-finished import lives (gameplan 084): the
           waiting card is restored from it at boot, and there is no other
           way to be standing in front of that screen without a server. */
        if(a.s) Object.keys(a.s).forEach(k=>k.indexOf('session:')===0
          ? sessionStorage.setItem(k.slice(8),a.s[k])
          : localStorage.setItem(k,a.s[k]));
      },{t:theme,e:mode==='easyread',s:seed||null});
      await p.goto(''+B+'/index.html'+hash);
      await p.waitForTimeout(900);
      /* Some states need more than one tap to exist. Each one asserts it
         reached the state rather than silently auditing the screen behind
         it — a route that never opened is a clean pass on nothing. */
      if(name==='Menu tag sheet'){
        await p.click('[data-act="toggle-tagging"]');
        await p.locator('.rrow').first().click();
      }
      if(extra){ try{ await p.click(extra,{timeout:4000}); }catch(e){ console.log("  (trigger missing: "+extra+")"); } await p.waitForTimeout(400); }
      if(name==='Menu search, nothing found'){
        await p.fill('#menu-search','zzzqqqx'); await p.waitForTimeout(400);
      }
      if(name==='Add, a link the server will not take'){
        /* Refused in the page, before any request — the app knows the two
           platforms it can fetch, so this needs no server to reach. */
        await p.fill('#a-vurl','https://example.com/not-a-video');
        await p.click('[data-act="video-submit"]');
        await p.waitForTimeout(500);
      }
      const need={'Recipe with no serving count':'.servcard__value--none',
        'Week planner, a plan that outlived its recipe':'.mealcard--gone',
        'Recipe with nothing written down':'.panel--flag',
        'Recipe photo that failed while open':'.lightbox__gone',
        'Add, waiting on the kitchen server':'.vprog',
        'Add, a link the server will not take':'.notice--bad',
        'Recipe photo lightbox':'.lightbox','Menu sort menu':'.sortmenu','Menu search, nothing found':'.emptybox, .empty, #main-content',
        'Week planner, planned':'.shoplist__items','Week planner picker':'#pick-q',
        'Week planner meal sheet':'.sheet','Menu tag sheet':'.sheet'}[name];
      /* Wait for the state rather than sampling once: a state that arrives
         off a network failure lands when the failure does, not on a fixed
         timer. It still fails loudly if it never arrives. */
      if(need){
        try{ await p.waitForSelector(need,{timeout:6000}); }
        catch(e){ console.log('  (state never opened: '+name+' — wanted '+need+')'); total++; }
      }
      const bad=await p.evaluate(CONTRAST);
      console.log('['+mode+'/'+theme+'] '+name+': '+(bad.length?bad.length+' FAILURES':'AA clean'));
      bad.forEach(x=>console.log('    '+x.ratio+':1 (need '+x.need+') '+x.size+'px '+x.sel+' "'+x.txt+'"'));
      total+=bad.length;
      await ctx.close();
    }
  }
  }

  /* `R82` — paper is a screen this audit had never looked at.
     The print stylesheet keeps a hand-written list of "these carry --dim /
     --card-dim, which are near-white on the dark theme and so vanish
     entirely on paper" — a list maintained by memory, which is exactly the
     kind of thing this project stops maintaining by memory. The same audit,
     under `media: print`, says what is actually on the page.
     Both themes on purpose: print is supposed to be theme-independent, so a
     failure that appears in one theme and not the other is the dark palette
     leaking onto paper — which is precisely the bug. */
  for(const theme of ['dark','light']){
    for(const [name,hash,extra] of [
      ['Recipe','#chicken-cordon-bleu',null],
      ['Recipe with a tag','#scottish-tablet',null],
      ['Recipe rescaled','#potato-bacon-soup','[data-act="serv+"]'],
      ['Week plan + shopping list','#plan','[data-act="toggle-list"]']
    ]){
      const ctx=await br.newContext({viewport:{width:820,height:1160}});
      await ctx.route('**/*.onrender.com/**', r => r.abort('failed'));
      const p=await ctx.newPage();
      await p.addInitScript(t=>{
        localStorage.setItem('kt.theme',JSON.stringify(t));
        const iso=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
        localStorage.setItem('kt.plan',JSON.stringify([
          {id:'pseed1',date:iso(0),slot:'dinner',recipeId:'chicken-cordon-bleu',servings:8,titleThen:'Chicken Cordon Bleu'},
          {id:'pseed2',date:iso(1),slot:'dinner',recipeId:'potato-bacon-soup',servings:6,titleThen:'Potato Bacon Soup'}
        ]));
      },theme);
      /* Set the state on screen, THEN switch to paper. Print hides the very
         controls some of these routes need — `.servbtn` is display:none
         there, so rescaling first and printing second is the only order
         that reaches a rescaled page at all. */
      await p.goto(''+B+'/index.html'+hash);
      await p.waitForTimeout(900);
      if(extra){ try{ await p.click(extra,{timeout:4000}); }catch(e){ console.log("  (trigger missing: "+extra+")"); } await p.waitForTimeout(400); }
      await p.emulateMedia({media:'print'});
      await p.waitForTimeout(300);
      /* A floor: paper that rendered nothing would read as a clean pass. */
      const drew=await p.evaluate(()=>document.querySelectorAll('#app *').length);
      if(drew<20){ console.log('  (print page drew almost nothing: '+drew+' elements)'); total++; }
      const bad=await p.evaluate(CONTRAST);
      console.log('[print/'+theme+'] '+name+': '+(bad.length?bad.length+' FAILURES':'AA clean'));
      bad.forEach(x=>console.log('    '+x.ratio+':1 (need '+x.need+') '+x.size+'px '+x.sel+' "'+x.txt+'"'));
      total+=bad.length;
      await ctx.close();
    }
  }

  await br.close();
  console.log('\nTotal AA failures across every screen, and on paper: '+total);
  process.exit(total?1:0);
})();
