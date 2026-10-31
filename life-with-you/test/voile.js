// Gros plans de la voile souple : vol droit, frein droit tenu (bord de fuite, bout qui traîne), spirale. usage : node test/voile.js outDir
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
(async () => {
  const out = process.argv[2] || path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const { browser, page, errs } = await open({ dpr: 2 });
  const shot = async n => { await page.screenshot({ path: path.join(out, n + '.png'), timeout: 180000 }); console.log('capture', n); };
  await page.evaluate(() => { const L = window.__lwy; L.manual(true); L.start(); L.bot({}); for (let i = 0; i < 900; i++) { L.advance(1 / 30, 1, false); if (-L.state().run.p.pos.z > 170) break; } L.bot(null); L.input(0, 0, false); L.advance(1 / 30, 40, false); });
  // vol droit : de trois-quarts arrière, puis de face (dessous du bord d'attaque, ouvertures des caissons)
  await page.evaluate(() => { window.__lwy.advance(1 / 30, 1, false); R3D.closeup(-5, 4.5, 6, 0, 6.2, 0); }); await shot('v1-vol-droit');
  await page.evaluate(() => { R3D.closeup(2.5, 3.2, -7.5, 0, 6.2, 0); }); await shot('v2-de-face');
  // frein droit tenu : bord de fuite droit abaissé, bout gauche qui traîne
  await page.evaluate(() => { const L = window.__lwy; L.input(0, 0.85, false); L.advance(1 / 30, 30, false); L.advance(1 / 30, 1, false); R3D.closeup(0, 3, 9, 0, 6, 0); }); await shot('v3-frein-droit');
  // spirale : frein tenu longtemps
  await page.evaluate(() => { const L = window.__lwy; L.advance(1 / 30, 45, false); const p = L.state().run.p; console.log('[t] spirale', (p.bank * 57).toFixed(0), '°', (p.V * 3.6).toFixed(0), 'km/h', p.gload.toFixed(1), 'g'); L.advance(1 / 30, 1, false); R3D.closeup(-6, 5, 7, 0, 5, 0); }); await shot('v4-spirale');
  console.log(errs.filter(e => !e.includes('ERR_FAILED')).join('\n') || 'aucune erreur console');
  await browser.close();
})();
