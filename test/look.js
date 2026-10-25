// Captures « vitrine » : boss et troopers en gros plan, sans interface
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page0}</body></html>`;
(async () => {
  const shots = JSON.parse(process.argv[2] || '[]');
  const W = +(process.argv[3] || 700), H = +(process.argv[4] || 700);
  const { browser, page, errs } = await open({ html: wrapped, width: W, height: H });
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.fill('#heroName', 'Bastien'); await page.click('#persoOk'); await page.waitForTimeout(300);
  for (const sh of shots) {
    await page.evaluate((sh) => {
      document.querySelectorAll('.screen,.hud').forEach(e => e.style.visibility = 'hidden');
      if (sh.fight) {
        const s = JSON.parse(localStorage.getItem('escadre-astrale-v2')); for (const b in s.kills) s.kills[b] = { normal: 1, heroique: 1, mythique: 0 }; s.boss = sh.boss; localStorage.setItem('escadre-astrale-v2', JSON.stringify(s));
      } else { R3.showBoss(sh.model); }
      R3._setCam(sh.pos, sh.look);
    }, sh);
    if (sh.fight) {
      await page.reload(); await page.waitForFunction(() => !document.querySelector('#hub').hidden, null, { timeout: 120000 });
      await page.evaluate((sh) => { document.querySelector('#btnPull').click(); }, sh);
      await page.waitForTimeout(500);
      await page.evaluate((sh) => { window.__escadre.ff(sh.ff || 20); document.querySelectorAll('.screen,.hud').forEach(e => e.style.visibility = 'hidden'); R3._setCam(sh.pos, sh.look); }, sh);
    }
    await page.waitForTimeout(sh.wait || 2500);
    await page.screenshot({ path: path.join(__dirname, 'shots', 'look-' + sh.name + '.png') });
  }
  console.log(errs.filter(e => !e.includes('ERR_FAILED') && !e.includes('GPU stall')).slice(0, 8).join('\n') || 'ok');
  await browser.close();
})();
