// Vorr et la Forge effondrée : gros plan, fissures (alerte puis éruption), Effondrement en cours et après.
// usage : node test/vorr.js [outDir] [diff]
// Truqué pour la démo : les PV du boss sont forcés à 46 % pour déclencher la phase 2.
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page0}</body></html>`;
(async () => {
  const out = process.argv[2] || path.join(__dirname, 'shots'), diff = process.argv[3] || 'heroique';
  fs.mkdirSync(out, { recursive: true });
  const { browser, page, errs } = await open({ html: wrapped, width: 852, height: 393, dpr: 2 });
  const shot = async n => { await page.screenshot({ path: `${out}/vorr-${n}.png` }); console.log('shot', n); };
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.fill('#heroName', 'Bastien'); await page.click('#persoOk'); await page.waitForTimeout(300);
  await page.evaluate(d => { const s = JSON.parse(localStorage.getItem('escadre-astrale-v5')); s.boss = 'vorr'; s.diff = d; s.gfx = 'haute'; for (const x in s.kills) s.kills[x] = { normal: 1, heroique: 1, mythique: 0 }; localStorage.setItem('escadre-astrale-v5', JSON.stringify(s)); }, diff);
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  await shot('1-hub');
  // gros plan sur Vorr dans son arène
  await page.evaluate(() => { document.querySelectorAll('.screen').forEach(e => e.style.visibility = 'hidden'); R3._setCam([9, 6.5, 15], [0, 5.2, 0]); });
  await page.waitForTimeout(1500);
  await shot('2-gros-plan');
  await page.evaluate(() => { R3._setCam([-13, 3.5, 11], [0, 6, 0]); });
  await page.waitForTimeout(1200);
  await shot('3-contre-plongee');
  await page.evaluate(() => { R3._setCam(null); document.querySelectorAll('.screen').forEach(e => e.style.visibility = ''); });
  // combat
  await page.click('#btnPull'); await page.waitForTimeout(1200);
  await page.click('#prepPull'); await page.evaluate(() => window.__escadre.ff(1));
  // fissures : pendant l'alerte, puis à l'éruption
  for (let k = 0; k < 200; k++) { const ok = await page.evaluate(() => { const S = window.__escadre.state(); return S.zones.some(z => z.type === 'fissure' && S.t > z.born + 0.6 && S.t < z.armAt - 0.8); }); if (ok) break; await page.evaluate(() => window.__escadre.ff(0.2)); }
  await page.waitForTimeout(500);
  await shot('4-fissures-alerte');
  for (let k = 0; k < 40; k++) { const ok = await page.evaluate(() => { const S = window.__escadre.state(); return S.zones.some(z => z.type === 'fissure' && S.t > z.armAt + 0.15); }); if (ok) break; await page.evaluate(() => window.__escadre.ff(0.1)); }
  await page.waitForTimeout(250);
  await shot('5-fissures-eruption');
  // phase 2 : Effondrement
  await page.evaluate(() => { const S = window.__escadre.state(); S.hp = S.maxHp * 0.44; window.__escadre.ff(0.2); });
  await page.waitForTimeout(1900);
  await shot('6-effondrement');
  await page.waitForTimeout(3800);
  await shot('7-apres');
  const st = await page.evaluate(() => { const S = window.__escadre.state(); return { t: S.t.toFixed(1), phase: S.phase + 1, arena: S.arenaR, alive: S.raiders.filter(r => r.alive).length }; });
  console.log(JSON.stringify(st));
  console.log(errs.filter(e => !e.includes('ERR_FAILED') && !e.includes('GPU stall')).slice(0, 15).join('\n') || 'no errors');
  await browser.close();
})();
