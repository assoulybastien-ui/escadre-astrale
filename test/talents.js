// Talents : écran (paliers, choix), effets en combat (PV, recharges), bulle des sorts.
// usage : node test/talents.js [outDir]
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page0}</body></html>`;
(async () => {
  const out = process.argv[2] || path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const { browser, page, errs } = await open({ html: wrapped, width: 852, height: 393, dpr: 2 });
  let ok = true; const check = (c, m) => { console.log((c ? 'ok   ' : 'ÉCHEC ') + m); if (!c) ok = false; };
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.fill('#heroName', 'Bastien'); await page.click('#persoOk'); await page.waitForTimeout(300);
  // 4 victoires : deux paliers ouverts
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('escadre-astrale-v5')); s.kills.vorr = { normal: 1, heroique: 1, mythique: 0 }; s.kills.jumelles = { normal: 1, heroique: 1, mythique: 0 }; localStorage.setItem('escadre-astrale-v5', JSON.stringify(s)); });
  await page.reload(); await page.waitForFunction(() => !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.click('#btnTalents'); await page.waitForTimeout(300);
  check(await page.evaluate(() => document.querySelector('#talPts').textContent === '2/3 paliers'), '4 victoires : 2 paliers ouverts');
  check(await page.evaluate(() => document.querySelectorAll('#talBody .tal[disabled]').length === 2), 'palier 3 verrouillé');
  await page.click('#talBody .tal[data-t="0"][data-j="0"]'); await page.click('#talBody .tal[data-t="1"][data-j="0"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/talents-1-ecran.png` }); console.log('shot talents-1-ecran');
  check(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('escadre-astrale-v5')).talents.gardien) === '[0,0,null]'), 'choix enregistrés (Gardien)');
  // effets en combat : Rempart (+15 % PV) et Bouclier de lumière (Égide 12 s)
  await page.click('#talents [data-go="hub"]'); await page.waitForTimeout(200);
  await page.click('#btnPull'); await page.waitForTimeout(1200);
  const hp = await page.evaluate(() => { const S = window.__escadre.state(); const g = S.raiders.find(r => r.cls === 'gardien'); return g.maxHp; });
  check(hp === Math.round(120000 * 1.15), 'Gardien : PV +15 % (' + hp + ')');
  await page.click('#spells [data-sp="egide"]'); await page.waitForTimeout(300);
  check(await page.evaluate(() => document.querySelector('#spellTip').textContent.includes('Bouclier de lumière')), 'la bulle d’Égide cite le talent');
  await page.screenshot({ path: `${out}/talents-2-bulle.png` }); console.log('shot talents-2-bulle');
  await page.click('#prepPull'); await page.evaluate(() => window.__escadre.ff(1));
  const dur = await page.evaluate(() => { const E = window.__escadre, S = E.state(); E.cast('egide'); const g = S.raiders.find(r => r.cls === 'gardien'); const m = g.mit.find(x => x.src === 'egide'); return m ? +(m.until - S.t).toFixed(1) : 0; });
  check(dur === 12, 'Égide dure 12 s (' + dur + ')');
  console.log(errs.filter(e => !e.includes('ERR_FAILED') && !e.includes('GPU stall')).slice(0, 15).join('\n') || 'no errors');
  console.log(ok ? 'TOUT EST OK' : 'DES VÉRIFICATIONS ONT ÉCHOUÉ');
  await browser.close(); process.exit(ok ? 0 : 1);
})();
