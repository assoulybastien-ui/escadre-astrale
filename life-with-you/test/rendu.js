// Captures de contrôle du rendu (ciel, relief, ombres, sapins, pilote). usage : node test/rendu.js outDir [dpr] [liste]
// liste (par défaut tout) : titre,vol,couloir,cable,foret,pilote,virage,sol
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
(async () => {
  const out = process.argv[2] || path.join(__dirname, 'shots-rendu'); fs.mkdirSync(out, { recursive: true });
  const dpr = +(process.argv[3] || 1);
  const want = new Set((process.argv[4] || 'titre,vol,couloir,cable,foret,pilote,virage,sol').split(','));
  const t0 = Date.now();
  const { browser, page, errs } = await open({ dpr });
  console.log('chargé en', Date.now() - t0, 'ms');
  console.log(await page.evaluate(() => ({ post: POST.ok, webgl2: R3D.renderer.capabilities.isWebGL2, sun: LOOK.SHU.uSunOn.value, s1: LOOK.SHU.uSunS1.value.toArray().map(v => +v.toPrecision(4)), s2: LOOK.SHU.uSunS2.value.toArray().map(v => +v.toPrecision(4)) })));
  const shot = async n => { const t = Date.now(); await page.screenshot({ path: `${out}/${n}.png`, timeout: 300000 }); console.log('capture', n, (Date.now() - t) + ' ms'); };
  await page.evaluate(() => window.__lwy.manual(true));
  if (want.has('titre')) { await page.evaluate(() => window.__lwy.advance(1 / 30, 20)); await shot('titre'); }
  await page.evaluate(() => { window.__lwy.start(); window.__lwy.advance(1 / 30, 4, false); window.__lwy.bot({ agl: 3 }); });
  const until = async (cond, maxS = 120) => page.evaluate(([c, m]) => { const f = new Function('S', 'p', 'return ' + c); for (let i = 0; i < m * 30; i++) { const S = window.__lwy.state(); if (S.screen !== 'run' || f(S, S.run.p)) return true; window.__lwy.advance(1 / 30, 1, false); } return false; }, [cond, maxS]);
  const snap = async n => { await page.evaluate(() => window.__lwy.advance(1 / 30, 3)); await shot(n); };
  if (want.has('sol')) { await until('p.mode === "ski" && p.V > 7'); await snap('sol'); }
  await until('p.mode === "air" && p.airT > 1.5');
  if (want.has('vol')) await snap('vol');
  if (want.has('pilote')) {
    await page.evaluate(() => { window.__lwy.advance(1 / 30, 1, false); R3D.closeup(1.6, 2.1, 3.2, 0, 1.3, 0); });
    await shot('pilote');
    await page.evaluate(() => R3D.closeup(-2.6, 1.0, -2.4, 0, 1.2, 0));
    await shot('pilote-face');
  }
  if (want.has('virage')) {
    await page.evaluate(() => { window.__lwy.bot(null); window.__lwy.input(0, 1, true); window.__lwy.advance(1 / 30, 20, false); });
    await snap('virage');
    await page.evaluate(() => { window.__lwy.input(0, 0, true); window.__lwy.bot({ agl: 3 }); });
  }
  if (want.has('couloir')) { await until('-p.pos.z > 330'); await snap('couloir'); }
  if (want.has('cable')) { await until('-p.pos.z > 470'); await snap('cable'); }
  if (want.has('foret')) { await until('-p.pos.z > 600'); await snap('foret'); }
  console.log(errs.length ? errs.join('\n') : 'aucune erreur console');
  await browser.close();
})();
