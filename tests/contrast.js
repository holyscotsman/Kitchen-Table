const { chromium, devices } = require('playwright');
const { freshContext } = require('./ctx');
const { SCREENS, PRINTS, seedInit, openScreen } = require('./screens');
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
    /* `R131` — the one list, shared with the two sweeps in kt.js. */
    for(const [name,hash,extra,seed,net] of SCREENS){
      const ctx=await freshContext(br, {...devices['iPhone 13']});
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
      await p.addInitScript(seedInit,{t:theme,e:mode==='easyread',s:seed||null});
      /* `R131` — one opening procedure, shared with the two sweeps in
         kt.js, so a state one of them can reach is a state all of them can. */
      const why=await openScreen(p,''+B,[name,hash,extra,seed,net]);
      if(why){ console.log('  ('+name+' — '+why+')'); total++; }
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
    /* `R133` — the same list, the same seed and the same opener as the
       screen pass. This kept four names, a seed of its own carrying the
       bug `R113` fixed, and an opener with no proof that the state it
       wanted ever appeared. */
    for(const [name,hash,extra,seed,net] of SCREENS.filter(e=>PRINTS.has(e[0]))){
      const ctx=await freshContext(br, {viewport:{width:820,height:1160}});
      await ctx.route('**/*.onrender.com/**', r => r.abort('failed'));
      if(net){
        await ctx.route(net.url, async r => {
          await new Promise(x=>setTimeout(x, net.holdMs||2500));
          return r.abort('failed');
        });
      }
      const p=await ctx.newPage();
      await p.addInitScript(seedInit,{t:theme,e:false,s:seed||null});
      /* Set the state on screen, THEN switch to paper. Print hides the very
         controls some of these routes need — `.servbtn` is display:none
         there, so rescaling first and printing second is the only order
         that reaches a rescaled page at all. */
      const whyP=await openScreen(p,''+B,[name,hash,extra,seed,net]);
      if(whyP){ console.log('  ('+name+' — '+whyP+')'); total++; }
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
