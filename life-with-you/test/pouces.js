// Vérifie les deux poignées au doigt (multi-touch réel via CDP) et capture l'écran pendant un virage.
// usage : node test/pouces.js [outDir]
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
(async () => {
  const out = process.argv[2] || path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const { browser, page, errs } = await open({});
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: p[2] !== undefined ? p[2] : i, radiusX: 8, radiusY: 8, force: 1 })) });
  const inp = () => page.evaluate(() => { const S = window.__lwy.state(); return `G=${S.input.l.toFixed(2)} D=${S.input.r.toFixed(2)} départ=${S.input.go} mode=${S.run ? S.run.p.mode : '-'}`; });
  let ok = true; const check = (cond, msg) => { console.log((cond ? 'OK   ' : 'ÉCHEC ') + msg); if (!cond) ok = false; };
  await page.click('#btnPlay');
  await page.evaluate(() => window.__lwy.manual(true));
  // un seul pouce : pas de départ
  await touch('touchStart', [[200, 220, 1]]);
  let s = await inp(); console.log('un pouce :', s); check(s.includes('départ=false'), 'un seul pouce ne lance pas la descente');
  // deux pouces : départ
  await touch('touchStart', [[200, 220, 1], [650, 200, 2]]);
  await page.evaluate(() => window.__lwy.advance(1 / 30, 3, false));
  s = await inp(); console.log('deux pouces :', s); check(s.includes('départ=true') && s.includes('mode=ski'), 'les deux pouces lancent l\'élan');
  // pouce droit vers le bas de 45 px (environ la moitié de la course)
  await touch('touchMove', [[200, 220, 1], [650, 245, 2]]);
  s = await inp(); console.log('droit +45 px :', s);
  let v = await page.evaluate(() => window.__lwy.state().input); check(v.l === 0 && v.r > 0.38 && v.r < 0.55, 'pouce droit à mi-course = poignée droite tirée à moitié, gauche relâchée');
  // les deux à fond (et au-delà : le repère suit)
  await touch('touchMove', [[205, 340, 1], [640, 330, 2]]);
  v = await page.evaluate(() => window.__lwy.state().input); console.log('les deux en bas :', JSON.stringify(v)); check(v.l === 1 && v.r === 1, 'les deux pouces en bas = les deux poignées à fond');
  // pouce gauche qui remonte de 40 px depuis tout en bas : le repère n'a pas bougé (posé à 220), donc 80 px tirés ≈ 82 %
  await touch('touchMove', [[205, 300, 1], [640, 330, 2]]);
  v = await page.evaluate(() => window.__lwy.state().input); console.log('gauche remonte de 40 px :', JSON.stringify(v)); check(v.l > 0.75 && v.l < 0.9 && v.r === 1, 'le repère reste fixe : remonter le pouce relâche d\'autant');
  // au-dessus du point de départ : mains hautes, et le repère ne monte pas avec le pouce
  await touch('touchMove', [[205, 150, 1], [640, 330, 2]]);
  await touch('touchMove', [[205, 250, 1], [640, 330, 2]]);
  v = await page.evaluate(() => window.__lwy.state().input); console.log('gauche monté puis redescendu à +30 px :', JSON.stringify(v)); check(v.l > 0.2 && v.l < 0.4, 'monter au-dessus du repère ne le déplace pas');
  // gauche/droite : ignoré
  await touch('touchMove', [[120, 250, 1], [760, 330, 2]]);
  const v2 = await page.evaluate(() => window.__lwy.state().input); check(Math.abs(v2.l - v.l) < 1e-6 && v2.r === 1, 'le mouvement sur le côté ne change rien');
  // vol : on laisse le bot décoller puis on reprend la main avec un virage à droite
  await page.evaluate(() => { window.__lwy.bot({}); for (let i = 0; i < 2000; i++) { window.__lwy.advance(1 / 30, 1, false); const p = window.__lwy.state().run.p; if (p.mode === 'air' && p.airT > 1.2 && -p.pos.z > 150) break; } window.__lwy.bot(null); });
  await touch('touchMove', [[150, 220, 1], [700, 230, 2]]);           // repères à neutre
  await touch('touchMove', [[150, 220, 1], [700, 200, 2]]);           // pouce droit remonté : mains hautes
  await page.evaluate(() => window.__lwy.advance(1 / 30, 45, false)); // la voile revient à plat
  await touch('touchMove', [[150, 220, 1], [700, 270, 2]]);           // frein droit ~70 %
  await page.evaluate(() => window.__lwy.advance(1 / 30, 24, true));
  const st = await page.evaluate(() => { const p = window.__lwy.state().run.p; return { bank: p.bank * 57.3, mode: p.mode, bl: p.bl, br: p.br }; });
  console.log('virage :', JSON.stringify(st)); check(st.mode === 'air' && st.bank > 15, 'en vol, frein droit = la voile s\'incline à droite');
  await page.screenshot({ path: path.join(out, 'pouces-virage.png'), timeout: 180000 });
  await touch('touchEnd', []);
  v = await page.evaluate(() => window.__lwy.state().input); check(v.l === 0 && v.r === 0, 'pouces levés = mains hautes');
  console.log(errs.filter(e => !e.includes('ERR_FAILED')).join('\n') || 'aucune erreur console');
  console.log(ok ? 'TOUT EST BON' : 'DES VÉRIFICATIONS ÉCHOUENT');
  await browser.close();
})();
