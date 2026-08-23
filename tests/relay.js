const { chromium, devices } = require('playwright');
const { freshContext } = require('./ctx');
const B = process.env.KT_BASE || 'http://127.0.0.1:8899';
let pass=0,fail=0;
const chk=(n,c,e='')=>c?(pass++,console.log('  PASS '+n)):(fail++,console.log('  FAIL '+n+(e?' :: '+e:'')));
const LD = JSON.stringify({"@context":"https://schema.org","@type":"Recipe",name:"Relay Scones",
  recipeYield:"12", prepTime:"PT15M", cookTime:"PT12M", recipeCategory:"Baking",
  recipeIngredient:["350 g self-raising flour","85 g butter","3 tbsp caster sugar"],
  recipeInstructions:[{"@type":"HowToStep",text:"Rub the butter into the flour."},{"@type":"HowToStep",text:"Bake for 12 minutes."}]});
const PAGE = `<html><head><script type="application/ld+json">${LD}<\/script></head><body></body></html>`;

(async()=>{
  const br=await chromium.launch(process.env.KT_CHROMIUM ? { executablePath: process.env.KT_CHROMIUM } : {});

  console.log('\n== First relay dead, second works ==');
  {
    const ctx=await freshContext(br, {...devices['iPhone 13']});
    /* Hermetic: the kitchen server is never poked from CI — the app's
       ready-list fetch on #add fails silently, exactly like offline. */
    await ctx.route('**/*.onrender.com/**', r => r.abort('failed'));
    const p=await ctx.newPage();
    let tried=[];
    await ctx.route('**/*', route => {
      const u=route.request().url();
      if (u.startsWith(B)) return route.continue();
      tried.push(u.slice(0,45));
      if (u.includes('example.com/scones') && !u.includes('allorigins') && !u.includes('corsproxy') && !u.includes('jina'))
        return route.abort();                                   // direct fetch blocked by CORS
      if (u.includes('allorigins')) return route.fulfill({status:522, body:'down'});
      if (u.includes('corsproxy')) return route.fulfill({status:200, contentType:'text/html', body:PAGE});
      return route.abort();
    });
    await p.goto(B+'/index.html#add'); await p.waitForSelector('.pathbtn');
    await p.click('[data-key="link"]'); await p.waitForSelector('#a-url');
    await p.fill('#a-url','https://example.com/scones');
    await p.click('[data-act="add-fetch"]');
    await p.waitForSelector('#a-title',{timeout:25000});
    chk('falls through a dead relay to a working one', (await p.inputValue('#a-title'))==='Relay Scones');
    chk('tried more than one relay', tried.length>=2, tried.join(' | '));
    chk('parsed the JSON-LD', (await p.inputValue('#a-serves'))==='12');
    chk('mapped Baking from a real category string', (await p.inputValue('#a-cat'))==='Baking', await p.inputValue('#a-cat'));
    await ctx.close();
  }

  console.log('\n== Text relay fallback ==');
  {
    const ctx=await freshContext(br, {...devices['iPhone 13']});
    /* Hermetic: the kitchen server is never poked from CI — the app's
       ready-list fetch on #add fails silently, exactly like offline. */
    await ctx.route('**/*.onrender.com/**', r => r.abort('failed'));
    const p=await ctx.newPage();
    await ctx.route('**/*', route => {
      const u=route.request().url();
      if (u.startsWith(B)) return route.continue();
      if (u.includes('r.jina.ai')) return route.fulfill({status:200,contentType:'text/plain',
        body:'Jina Flapjacks\nIngredients\n250 g oats\n100 g butter\n3 tbsp syrup\nInstructions\nMelt the butter and syrup together in a pan.\nStir in the oats and press into a tin.\nBake for 25 minutes until golden brown.'});
      return route.abort();
    });
    await p.goto(B+'/index.html#add'); await p.waitForSelector('.pathbtn');
    await p.click('[data-key="link"]'); await p.waitForSelector('#a-url');
    await p.fill('#a-url','https://example.com/flapjacks');
    await p.click('[data-act="add-fetch"]');
    await p.waitForSelector('#a-title',{timeout:30000});
    chk('text relay rescues it', (await p.inputValue('#a-title'))==='Jina Flapjacks');
    chk('3 ingredients', await p.locator('[data-k="ingredients"][data-act="adl"]').count()===3);
    chk('3 steps', await p.locator('[data-k="steps"][data-act="adl"]').count()===3);
    chk('flagged as guessed', (await p.locator('.panel--flag').textContent()).includes('plain text'));
    await ctx.close();
  }

  console.log('\n== Everything down: honest failure + paste still works ==');
  {
    const ctx=await freshContext(br, {...devices['iPhone 13']});
    /* Hermetic: the kitchen server is never poked from CI — the app's
       ready-list fetch on #add fails silently, exactly like offline. */
    await ctx.route('**/*.onrender.com/**', r => r.abort('failed'));
    const p=await ctx.newPage();
    await ctx.route('**/*', route => route.request().url().startsWith(B) ? route.continue() : route.abort());
    await p.goto(B+'/index.html#add'); await p.waitForSelector('.pathbtn');
    await p.click('[data-key="link"]'); await p.waitForSelector('#a-url');
    chk('paste box is offered up front', await p.locator('#a-paste').count()===1);
    chk('read button disabled while empty', await p.locator('[data-act="add-paste"]').isDisabled());
    await p.fill('#a-url','https://example.com/dead');
    await p.click('[data-act="add-fetch"]');
    await p.waitForSelector('.notice--bad',{timeout:40000});
    const msg=await p.locator('.notice--bad').textContent();
    chk('explains and points at the paste box', /Paste the recipe text below/.test(msg), msg.slice(0,70));
    await p.fill('#a-paste','Nan’s Tablet\nIngredients\n900 g sugar\n1 tin condensed milk\nMethod\nBoil everything for 20 minutes, stirring.\nBeat it until it thickens, then pour into a tray.');
    await p.waitForTimeout(300);
    chk('read button enables once text is in', !(await p.locator('[data-act="add-paste"]').isDisabled()));
    await p.click('[data-act="add-paste"]'); await p.waitForSelector('#a-title');
    chk('paste path parses with no network at all', (await p.inputValue('#a-title'))==='Nan’s Tablet', await p.inputValue('#a-title'));
    chk('2 ingredients', await p.locator('[data-k="ingredients"][data-act="adl"]').count()===2);
    chk('2 steps', await p.locator('[data-k="steps"][data-act="adl"]').count()===2);
    await p.fill('#a-from','Joan');
    await p.click('[data-act="add-save"]'); await p.waitForTimeout(600);
    chk('saves and opens the new recipe', (await p.locator('.r-title').textContent()).includes('Tablet'));
    await ctx.close();
  }

  console.log('\n== The disabling that stops a second fetch (R143) ==');
  {
    /* The other half of `R143`. `S.addBusy` is read in only two places and
       neither is a guard; what actually stops a second tap is the SUBMIT
       BUTTON disabling itself in the render — here and on the video form,
       the app's two network paths out of the Add screen. Nothing checked
       either one, and a relay chain walks up to four services per attempt,
       every one of them a third party the reader was told about once. */
    const ctx = await freshContext(br, { ...devices['iPhone 13'] });
    await ctx.route('**/*.onrender.com/**', r => r.abort('failed'));
    const p = await ctx.newPage();
    let asked = 0;
    const isImport = (u) => /example\.com|allorigins|corsproxy|jina/.test(u);
    await ctx.route('**/*', async (route) => {
      const u = route.request().url();
      if (u.startsWith(B)) return route.continue();
      /* Count only the import's own traffic: this catch-all is registered
         after the onrender abort, so it wins for the kitchen's job-list
         fetch too, and counting that would measure the wrong thing. */
      if (!isImport(u)) return route.abort('failed');
      asked++;
      /* Held open — but well inside `RELAY_TIMEOUT` (12s), or the chain
         falls through to the next relay and the count stops meaning
         "how many times did one tap start this". */
      await new Promise(r => setTimeout(r, 5000));
      return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE });
    });
    await p.goto(B + '/index.html#add'); await p.waitForSelector('.pathbtn');
    await p.click('[data-key="link"]'); await p.waitForSelector('#a-url');
    chk('the Fetch button is live before anything is sent',
      !(await p.locator('[data-act="add-fetch"]').isDisabled()));
    await p.fill('#a-url', 'https://example.com/scones');
    await p.click('[data-act="add-fetch"]');
    await p.waitForTimeout(600);
    chk('the button is still there while the page is being fetched',
      await p.locator('[data-act="add-fetch"]').count() === 1);
    chk('but disabled, which is what stops a second walk of the relays',
      await p.locator('[data-act="add-fetch"]').isDisabled());
    let tapped = 'landed';
    try { await p.click('[data-act="add-fetch"]', { timeout: 2500 }); }
    catch (e) { tapped = 'refused'; }
    chk('so a second tap cannot land at all', tapped === 'refused', tapped);
    chk('and one address is one attempt', asked === 1, String(asked));
    await ctx.close();
  }

  await br.close();
  console.log('\n'+'='.repeat(50)+'\nPASS: '+pass+'   FAIL: '+fail+'\n'+'='.repeat(50));
  process.exit(fail?1:0);
})();
