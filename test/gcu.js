// Gros plan en jeu sur un perso (caméra libre), images successives
// usage : node test/gcu.js <boss> <raiderIndex> <name> <n> <stepsBetween> [ff]
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page0}</body></html>`;
(async () => {
  const [boss = 'vorr', ri = '0', name = 'gcu', n = '4', steps = '6', ff = '0', camJ = ''] = process.argv.slice(2);
  const { browser, page, errs } = await open({ html: wrapped, width: 900, height: 560 });
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.fill('#heroName', 'B'); await page.click('#persoOk'); await page.waitForTimeout(300);
  await page.evaluate(b => { const s = JSON.parse(localStorage.getItem('escadre-astrale-v5')); for (const x in s.kills) s.kills[x] = { normal: 1, heroique: 0, mythique: 0 }; s.boss = b; s.gfx = 'haute'; localStorage.setItem('escadre-astrale-v5', JSON.stringify(s)); }, boss);
  await page.reload(); await page.waitForFunction(() => !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.click('#btnPull'); await page.waitForTimeout(400);
  await page.evaluate(ff => { const E = window.__escadre; E.manual(true); if (+ff > 0) { E.pull(); E.advance(0.05, 70); E.ff(+ff); } document.querySelectorAll(".hud").forEach(e => e.style.visibility = "hidden"); document.getElementById("plates").style.display = "none"; }, ff);
  if (process.env.QUAL) await page.evaluate(q => R3.setQuality(q), process.env.QUAL);
  const cam = camJ ? JSON.parse(camJ) : { d: 4.2, h: 2.4, a: 0.5, ly: 1.5 };
  for (let i = 0; i < +n; i++) {
    await page.evaluate(([ri, steps, cam, i]) => {
      const E = window.__escadre;
      for (let k = 0; k < steps; k++) {
        const S = E.state(), r = S.raiders[ri];
        const a = cam.a + (cam.spin || 0) * i;
        R3._setCam([r.pos.x + Math.sin(a) * cam.d, cam.h, r.pos.z + Math.cos(a) * cam.d], [r.pos.x, cam.ly, r.pos.z]);
        E.advance(0.05);
      }
    }, [+ri, +steps, cam, i]);
    await page.screenshot({ path: path.join(__dirname, 'shots', `${name}-${i}.png`) });
  }
  console.log(errs.filter(e => !e.includes('ERR_FAILED')).slice(0, 8).join('\n') || 'ok');
  await browser.close();
})();
