// Captures d'un boss dans son arène : hub, gros plans, combat (mécanique en alerte puis active), phase suivante.
// usage : node test/arene.js boss [zone] [pvPhase2] [outDir] [diff]
//   zone : type de zone à attendre pour la capture de mécanique (fissure, half, ...)
// Truqué pour la démo : les PV du boss sont forcés pour passer en phase suivante.
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
// le bot de test (Node) adapté à la page : il joue le raid lead pendant les captures
const botSrc = fs.readFileSync(path.join(__dirname, 'bot5.js'), 'utf8').replace("const G = require('../src/engine.js');", 'const G = GAME;').replace(/const diff = process\.argv[^\n]*\n/, '').replace(/if \(require\.main === module\)[\s\S]*$/, '') + `
window.__botOn = S => { const tick = bot(S, 'good'); clearInterval(window.__botI); window.__botI = setInterval(() => { if (!S.over) tick(); }, 100);
  window.__ffBot = sec => { let acc = 0; for (let t = 0; t < sec && !S.over; t += 0.05) { GAME.step(S, 0.05); acc += 0.05; if (acc >= 0.1) { acc = 0; tick(); } } window.__escadre.ff(0); }; };`;
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page0}</body></html>`;
(async () => {
  const [boss = 'vorr', zone = '', hp2 = '0', outArg, diff = 'heroique'] = process.argv.slice(2);
  const out = outArg || path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const { browser, page, errs } = await open({ html: wrapped, width: 852, height: 393, dpr: 2 });
  const shot = async n => { await page.screenshot({ path: `${out}/${boss}-${n}.png` }); console.log('shot', n); };
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.fill('#heroName', 'Bastien'); await page.click('#persoOk'); await page.waitForTimeout(300);
  await page.evaluate(([b, d]) => { const s = JSON.parse(localStorage.getItem('escadre-astrale-v5')); s.boss = b; s.diff = d; s.gfx = 'haute'; for (const x in s.kills) s.kills[x] = { normal: 1, heroique: 1, mythique: 0 }; localStorage.setItem('escadre-astrale-v5', JSON.stringify(s)); }, [boss, diff]);
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  await shot('1-hub');
  await page.evaluate(() => { document.querySelectorAll('.screen').forEach(e => e.style.visibility = 'hidden'); R3._setCam([10, 6.5, 17], [0, 5, 0]); });
  await page.waitForTimeout(1500); await shot('2-gros-plan');
  await page.evaluate(() => { R3._setCam([-26, 14, 26], [0, 4, 0]); });
  await page.waitForTimeout(1200); await shot('3-arene');
  await page.evaluate(() => { R3._setCam(null); document.querySelectorAll('.screen').forEach(e => e.style.visibility = ''); });
  await page.click('#btnPull'); await page.waitForTimeout(1200);
  await page.click('#prepPull'); await page.evaluate(() => window.__escadre.ff(0.5));
  await page.addScriptTag({ content: botSrc });
  await page.evaluate(() => window.__botOn(window.__escadre.state()));
  if (zone) {
    for (let k = 0; k < 400; k++) { const ok = await page.evaluate(z => { const S = window.__escadre.state(); return S.zones.some(q => q.type === z && S.t > q.born + 0.6 && (!q.armAt || S.t < q.armAt - 0.6)); }, zone); if (ok) break; await page.evaluate(() => window.__ffBot(0.2)); }
    await page.waitForTimeout(2000); await shot('4-alerte');
    for (let k = 0; k < 60; k++) { const ok = await page.evaluate(z => { const S = window.__escadre.state(); return S.zones.some(q => q.type === z && q.armAt && S.t > q.armAt + 0.2); }, zone); if (ok) break; await page.evaluate(() => window.__ffBot(0.1)); }
    await page.waitForTimeout(1600); await shot('5-active');
  } else { await page.evaluate(() => window.__ffBot(25)); await page.waitForTimeout(800); await shot('4-combat'); }
  if (+hp2 > 0) {
    await page.evaluate(h => { const S = window.__escadre.state(); S.hp = S.maxHp * h; window.__ffBot(0.2); }, +hp2);
    await page.waitForTimeout(2200); await shot('6-phase');
    await page.evaluate(() => window.__ffBot(8)); await page.waitForTimeout(1500); await shot('7-suite');
  }
  const st = await page.evaluate(() => { const S = window.__escadre.state(); return { t: S.t.toFixed(1), phase: S.phase + 1, alive: S.raiders.filter(r => r.alive).length }; });
  console.log(JSON.stringify(st));
  console.log(errs.filter(e => !e.includes('ERR_FAILED') && !e.includes('GPU stall')).slice(0, 15).join('\n') || 'no errors');
  await browser.close();
})();
