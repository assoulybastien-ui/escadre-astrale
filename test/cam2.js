const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page0}</body></html>`;
(async () => {
  const { browser, page, errs } = await open({ html: wrapped, width: 852, height: 393, dpr: 1 });
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.fill('#heroName', 'B'); await page.click('#persoOk'); await page.waitForTimeout(300);
  await page.click('#btnPull'); await page.waitForTimeout(800);
  const r = await page.evaluate(() => { const o = []; try { for (let i = 0; i < 4; i++) R3.update(0.05); o.push(["direct", R3._dbg().fitDbg.y1]); } catch (e) { o.push(["ERR", String(e.stack).slice(0, 400)]); } window.__escadre.manual(true); for (let i = 0; i < 6; i++) { window.__escadre.advance(0.05); const d = R3._dbg(); o.push([d.fitPrev, d.fitDbg && d.fitDbg.y1, d.insets[1], d.cam.mode]); } return o; });
  console.log(JSON.stringify(r)); console.log(errs.join('\n'));
  await browser.close();
})();
