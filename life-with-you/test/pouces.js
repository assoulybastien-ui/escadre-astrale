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
  // pouce droit vers le bas de la moitié de la course (course ≈ 17 % de la hauteur d'écran)
  const T = await page.evaluate(() => UI.travelFor(200)); console.log('course du pouce :', T.toFixed(0), 'px');
  await touch('touchMove', [[200, 220, 1], [650, 200 + T / 2, 2]]);
  s = await inp(); console.log('droit mi-course :', s);
  let v = await page.evaluate(() => window.__lwy.state().input); check(v.l === 0 && v.r > 0.38 && v.r < 0.55, 'pouce droit à mi-course = poignée droite tirée à moitié, gauche relâchée');
  // les deux à fond (et au-delà : le repère suit)
  await touch('touchMove', [[205, 340, 1], [640, 330, 2]]);
  v = await page.evaluate(() => window.__lwy.state().input); console.log('les deux en bas :', JSON.stringify(v)); check(v.l === 1 && v.r === 1, 'les deux pouces en bas = les deux poignées à fond');
  // pouce gauche qui remonte depuis tout en bas aux 3/4 de la course : le repère n'a pas bougé (posé à 220)
  await touch('touchMove', [[205, 220 + T * 0.75, 1], [640, 330, 2]]);
  v = await page.evaluate(() => window.__lwy.state().input); console.log('gauche remonte aux 3/4 :', JSON.stringify(v)); check(v.l > 0.68 && v.l < 0.8 && v.r === 1, 'le repère reste fixe : remonter le pouce relâche d\'autant');
  // au-dessus du point de départ : mains hautes, et le repère ne monte pas avec le pouce
  await touch('touchMove', [[205, 150, 1], [640, 330, 2]]);
  await touch('touchMove', [[205, 220 + T * 0.35, 1], [640, 330, 2]]);
  v = await page.evaluate(() => window.__lwy.state().input); console.log('gauche monté puis redescendu à 35 % :', JSON.stringify(v)); check(v.l > 0.25 && v.l < 0.4, 'monter au-dessus du repère ne le déplace pas');
  // pouce posé tout en bas de l'écran : la course raccourcit pour qu'on puisse quand même tirer à fond
  const Tb = await page.evaluate(() => UI.travelFor(window.innerHeight - 40)); console.log('course si posé à 40 px du bas :', Tb.toFixed(0), 'px');
  check(Tb <= 40 && Tb >= 36, 'pouce posé en bas : course raccourcie, frein à fond atteignable');
  // gauche/droite : ignoré
  await touch('touchMove', [[120, 220 + T * 0.35, 1], [760, 330, 2]]);
  const v2 = await page.evaluate(() => window.__lwy.state().input); check(Math.abs(v2.l - v.l) < 1e-6 && v2.r === 1, 'le mouvement sur le côté ne change rien');
  // vol : on laisse le bot décoller puis on reprend la main avec un virage à droite
  await page.evaluate(() => { window.__lwy.bot({}); for (let i = 0; i < 2000; i++) { window.__lwy.advance(1 / 30, 1, false); const p = window.__lwy.state().run.p; if (p.mode === 'air' && p.airT > 1.2 && -p.pos.z > 150) break; } window.__lwy.bot(null); });
  await touch('touchMove', [[150, 220, 1], [700, 230, 2]]);           // repères à neutre
  await touch('touchMove', [[150, 220, 1], [700, 200, 2]]);           // pouce droit remonté : mains hautes
  await page.evaluate(() => window.__lwy.advance(1 / 30, 45, false)); // la voile revient à plat
  await touch('touchMove', [[150, 220, 1], [700, 230 + T * 0.7, 2]]);  // frein droit ~70 %
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
