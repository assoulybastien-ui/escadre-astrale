// Vérifie le mode téléphone et la qualité adaptative : on se fait passer pour un iPhone, on simule une cadence faible
// et on vérifie que la qualité descend d'un cran à chaque mesure, sans erreur, jusqu'au niveau le plus léger.
// usage : node test/qualite.js [outDir]
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
(async () => {
  const out = process.argv[2] || path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const { browser, page, errs } = await open({ ua, dpr: 3 });
  let ok = true; const check = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC ') + m); if (!c) ok = false; };
  const info = () => page.evaluate(() => R3D.perfInfo());
  let q = await info(); console.log('départ', JSON.stringify(q));
  check(q.mobile && q.level === 1, 'iPhone reconnu : on démarre au niveau 1 (densité de pixels 1,6 au lieu de 2)');
  await page.evaluate(() => { window.__lwy.manual(true); window.__lwy.start(); window.__lwy.bot({}); window.__lwy.advance(1 / 30, 60, false); });
  const seen = [q.level];
  for (let k = 0; k < 6; k++) {
    // 1,5 s de jeu à 20 images/s (plus la mise en route)
    await page.evaluate(() => { for (let i = 0; i < 80; i++) R3D.adapt(0.05); window.__lwy.advance(1 / 30, 1, true); });
    q = await info(); seen.push(q.level);
  }
  console.log('niveaux successifs', seen.join(' → '), JSON.stringify(q));
  check(q.level === 5 && seen.every((v, i) => i === 0 || v >= seen[i - 1]), 'à 20 images/s la qualité descend jusqu\'au niveau le plus léger');
  await page.screenshot({ path: path.join(out, 'qualite-min.png'), timeout: 180000 });
  const saved = await page.evaluate(() => GAME.S.save.opts.q);
  check(saved === 5, 'le niveau retenu est mémorisé pour la prochaine fois');
  const e = errs.filter(x => !x.includes('ERR_FAILED'));
  check(e.length === 0, 'aucune erreur console' + (e.length ? ' : ' + e.join(' | ') : ''));
  console.log(ok ? 'TOUT EST BON' : 'DES VÉRIFICATIONS ÉCHOUENT');
  await browser.close();
})();
