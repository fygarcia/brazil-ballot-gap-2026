const puppeteer = require('puppeteer-core');
const fs = require('fs');
(async () => {
  const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome', headless:'new', args:['--no-sandbox']});
  const p = await b.newPage();
  const got = [];
  p.on('response', async r => {
    const u = r.url(); const ct = r.headers()['content-type']||'';
    if (/json/.test(ct) || /historico|apuracao|\.json/.test(u)) {
      try { const t = await r.text(); got.push({url:u, status:r.status(), len:t.length, body:t}); } catch(e) {}
    }
  });
  for (const url of process.argv.slice(2)) {
    await p.goto(url, {waitUntil:'networkidle2', timeout:60000}).catch(e=>console.log('goto err',e.message));
    await new Promise(r=>setTimeout(r,6000));
  }
  fs.writeFileSync('/tmp/pp/captured.json', JSON.stringify(got));
  for (const g of got) console.log(g.status, g.len, g.url.slice(0,160));
  await b.close();
})();
