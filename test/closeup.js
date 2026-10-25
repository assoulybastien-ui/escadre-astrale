// Gros plans en combat : avance le rendu image par image (les gestes progressent), captures régulières
// usage : node test/closeup.js <boss> <heal|tank> <ffSec> <name> <n> <stepsBetween> [camJSON]
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page0}</body></html>`;
(async () => {
  const [boss = 'vorr', role = 'tank', ff = '15', name = 'cu', n = '6', steps = '6', camJ = ''] = process.argv.slice(2);
  const { browser, page, errs } = await open({ html: wrapped, width: 760, height: 460 });
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  if (role === 'tank') await page.click('#roleSeg [data-role="tank"]');
  await page.fill('#heroName', 'Bastien'); await page.click('#persoOk'); await page.waitForTimeout(300);
  await page.evaluate((boss) => { const s = JSON.parse(localStorage.getItem('escadre-astrale-v2')); for (const b in s.kills) s.kills[b] = { normal: 1, heroique: 1, mythique: 0 }; s.boss = boss; localStorage.setItem('escadre-astrale-v2', JSON.stringify(s)); }, boss);
  await page.reload(); await page.waitForFunction(() => !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.click('#btnPull'); await page.waitForTimeout(300);
  await page.evaluate((ff) => { window.__escadre.ff(ff); document.querySelectorAll('.hud').forEach(e => e.style.visibility = 'hidden'); }, +ff);
  const cam = camJ ? JSON.parse(camJ) : null;
  for (let i = 0; i < +n; i++) {
    await page.evaluate(([steps, cam]) => {
      if (cam) { if (cam.rel) { const S = window.__escadre.state(); const b = S.bodies[0].pos, t = S.raiders[S.bodies[0].target].pos; const mx = (b.x + t.x) / 2, mz = (b.z + t.z) / 2; R3._setCam([mx + cam.pos[0], cam.pos[1], mz + cam.pos[2]], [mx, cam.look[1], mz]); } else R3._setCam(cam.pos, cam.look); }
      for (let k = 0; k < steps; k++) R3.update(0.05);
    }, [+steps, cam]);
    await page.screenshot({ path: path.join(__dirname, 'shots', `${name}-${i}.png`) });
  }
  console.log(errs.filter(e => !e.includes('ERR_FAILED')).slice(0, 8).join('\n') || 'ok');
  await browser.close();
})();
