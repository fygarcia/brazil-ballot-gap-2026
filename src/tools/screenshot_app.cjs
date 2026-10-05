const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome', headless:'new', args:['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width:1250, height:900});
  const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
  await p.goto('http://localhost:8765/', {waitUntil:'networkidle0'});
  await p.waitForFunction(() => /done/.test(document.getElementById('status').textContent), {timeout:120000});
  console.log('status:', await p.$eval('#status', e=>e.textContent));
  console.log('summary:', (await p.$eval('#runSummary', e=>e.innerText)).replace(/\n/g,' | '));
  console.log('ref2022:', await p.$eval('#ref2022', e=>e.innerText));
  await p.screenshot({path:'/workspace/ballot-gap-lab/results/screenshot_full.png', fullPage:true});
  const el = await p.$('#cGap'); await el.screenshot({path:'/workspace/ballot-gap-lab/results/chart_gap.png'});
  const el2 = await p.$('#cShares'); await el2.screenshot({path:'/workspace/ballot-gap-lab/results/chart_shares.png'});
  const el3 = await p.$('#cMargin'); await el3.screenshot({path:'/workspace/ballot-gap-lab/results/chart_margin.png'});
  // run all-models table with 40 runs to check the button works
  await p.$eval('#runs', e=>e.value='40'); await p.click('#runAll');
  await p.waitForFunction(() => /all models done/.test(document.getElementById('status').textContent), {timeout:300000});
  console.log('table rows:', await p.$$eval('#tableWrap tr', r=>r.length));
  console.log('errors:', errs);
  await b.close();
})();
