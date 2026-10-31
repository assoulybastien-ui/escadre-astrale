// Petite vidéo de validation : le bot vole, on enregistre quelques passages à 15 images/s.
// usage : node test/film.js outDir [largeur hauteur]  puis ffmpeg -framerate 15 -i outDir/%04d.jpg ...
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const w = +(process.argv[3] || 640), h = +(process.argv[4] || 296), FPS = 15;
  const { browser, page, errs } = await open({ width: w, height: h });
  await page.evaluate(() => { window.__lwy.manual(true); window.__lwy.start(); window.__lwy.bot({ agl: 3 }); window.__lwy.advance(1 / 15, 4, false); });
  // fenêtres de temps (s de course) à filmer
  const SEG = [[0, 5.5], [15, 18.5], [25, 28], [39.5, 43], [47, 50.5], [57.5, 64]];
  let n = 0;
  for (const [a, b] of SEG) {
    await page.evaluate(a => { const L = window.__lwy; let i = 0; while (L.state().screen === 'run' && L.state().run.t < a - 0.6 && i++ < 5000) L.advance(1 / 30, 1, false); L.advance(1 / 15, 9, false); }, a);
    while (true) {
      const st = await page.evaluate(() => { const S = window.__lwy.state(); window.__lwy.advance(1 / 15, 1, true); return { t: S.run ? S.run.t : 0, sc: S.screen }; });
      await page.screenshot({ path: path.join(out, String(n++).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 82, timeout: 180000 });
      if (st.t > b || st.sc === 'title') break;
      if (st.sc === 'results') { for (let k = 0; k < 20; k++) { await page.evaluate(() => window.__lwy.advance(1 / 15, 1, true)); await page.screenshot({ path: path.join(out, String(n++).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 82, timeout: 180000 }); } break; }
      if (n % 30 === 0) console.log('images', n, 't', st.t.toFixed(1));
    }
  }
  console.log('fini', n, 'images', errs.filter(e => !e.includes('ERR_FAILED')));
  await browser.close();
})();
