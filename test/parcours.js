// Parcours complet d'un nouveau joueur, bot aux commandes : Vorr en Normal → rapport → butin → palier de talents.
// usage : node test/parcours.js [outDir]
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const botSrc = fs.readFileSync(path.join(__dirname, 'bot5.js'), 'utf8').replace("const G = require('../src/engine.js');", 'const G = GAME;').replace(/const diff = process\.argv[^\n]*\n/, '').replace(/if \(require\.main === module\)[\s\S]*$/, '')
  + `window.__runBot = (S, sec) => { const tick = bot(S, 'good'); let acc = 0; for (let t = 0; t < sec && !S.over; t += 0.05) { GAME.step(S, 0.05); acc += 0.05; if (acc >= 0.1) { acc = 0; tick(); } } window.__escadre.ff(0); return S.result; };`;
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page0}</body></html>`;
(async () => {
  const out = process.argv[2] || path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const { browser, page, errs } = await open({ html: wrapped, width: 852, height: 393, dpr: 2 });
  let ok = true; const check = (c, m) => { console.log((c ? 'ok   ' : 'ÉCHEC ') + m); if (!c) ok = false; };
  const shot = async n => { await page.screenshot({ path: `${out}/parcours-${n}.png` }); console.log('shot', n); };
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  check(await page.evaluate(() => !document.querySelector('#perso').hidden), 'premier lancement : écran du raid lead');
  await page.fill('#heroName', 'Bastien'); await page.click('#persoOk'); await page.waitForTimeout(500);
  check(await page.evaluate(() => document.querySelector('#btnPull').textContent.includes('Vorr')), 'hub : Vorr à affronter');
  check(await page.evaluate(() => document.querySelector('[data-diff="mythique"]') && document.querySelectorAll('#bossList .bcard[disabled]').length === 3), 'hub : seul Vorr est ouvert');
  await page.click('#btnPull'); await page.waitForTimeout(1200);
  await page.click('#prepPull'); await page.evaluate(() => window.__escadre.ff(0.2));
  await page.addScriptTag({ content: botSrc });
  const res = await page.evaluate(() => window.__runBot(window.__escadre.state(), 400));
  check(res === 'kill', 'le raid tue Vorr (' + res + ')');
  await page.evaluate(() => window.__escadre.finish()); await page.waitForTimeout(800);
  check(await page.evaluate(() => !document.querySelector('#report').hidden), 'écran de rapport');
  check(await page.evaluate(() => !!document.querySelector('.new-tier')), 'le rapport annonce le palier de talents');
  await shot('1-rapport');
  await page.click('#rLoot'); await page.waitForTimeout(500);
  check(await page.evaluate(() => !document.querySelector('#loot').hidden), 'écran du butin');
  await shot('2-butin');
  await page.click('#lootOk'); await page.waitForTimeout(800);
  check(await page.evaluate(() => !document.querySelector('#hub').hidden), 'retour au hub');
  check(await page.evaluate(() => document.querySelector('#btnTalents').classList.contains('notify')), 'pastille sur Talents');
  check(await page.evaluate(() => !document.querySelector('#bossList .bcard[data-boss="jumelles"]').disabled), 'les Jumelles sont ouvertes');
  await shot('3-hub');
  await page.click('#btnTalents'); await page.waitForTimeout(300);
  check(await page.evaluate(() => document.querySelector('#talPts').textContent === '1/3 paliers'), 'talents : 1 palier ouvert');
  await page.click('#talents [data-go="hub"]'); await page.waitForTimeout(300);
  check(await page.evaluate(() => !document.querySelector('#btnTalents').classList.contains('notify')), 'pastille retirée au retour sur le hub');
  console.log(errs.filter(e => !e.includes('ERR_FAILED') && !e.includes('GPU stall')).slice(0, 15).join('\n') || 'no errors');
  console.log(ok ? 'TOUT EST OK' : 'DES VÉRIFICATIONS ONT ÉCHOUÉ');
  await browser.close(); process.exit(ok ? 0 : 1);
})();
