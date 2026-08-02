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
    for(const [name,hash,extra] of [
      ['Main','#',null],['Menu','#menu',null],
      ['Menu + filter sheet','#menu','[data-act="open-filter"]'],
      ['Recipe','#chicken-cordon-bleu',null],
      ['Recipe flagged','#chops',null],
      ['Recipe edit','#chicken-cordon-bleu','[data-act="toggle-edit"]'],
      ['Recipe download sheet','#bacon-ranch-chicken-casserole','[data-act="open-dl"]'],
      ['Menu text sheet','#menu','[data-act="open-text"]'],
      ['Week planner','#plan',null],
      ['Add screen','#add',null],
      ['Add review form','#add','[data-key="review"]'],
      ['Add from a link','#add','[data-key="link"]'],
      ['Add from a photo','#add','[data-key="photo"]'],
    ]){
      const ctx=await br.newContext({...devices['iPhone 13']});
      const p=await ctx.newPage();
      await p.addInitScript(a=>{localStorage.setItem('kt.theme',JSON.stringify(a.t));if(a.e)localStorage.setItem('kt.easyRead','true');},{t:theme,e:mode==='easyread'});
      await p.goto(''+B+'/index.html'+hash);
      await p.waitForTimeout(900);
      if(extra){ try{ await p.click(extra,{timeout:4000}); }catch(e){ console.log("  (trigger missing: "+extra+")"); } await p.waitForTimeout(400); }
      const bad=await p.evaluate(CONTRAST);
      console.log('['+mode+'/'+theme+'] '+name+': '+(bad.length?bad.length+' FAILURES':'AA clean'));
      bad.forEach(x=>console.log('    '+x.ratio+':1 (need '+x.need+') '+x.size+'px '+x.sel+' "'+x.txt+'"'));
      total+=bad.length;
      await ctx.close();
    }
  }
  }
  await br.close();
  console.log('\nTotal AA failures across both themes: '+total);
  process.exit(total?1:0);
})();
