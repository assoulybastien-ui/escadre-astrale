// Premier virage depuis le vol droit puis bascule (réactivité, balancement). usage : node test/virage.js outDir
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
(async () => {
  const out = process.argv[2] || path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const { browser, page, errs } = await open({});
  const shot = async n => { await page.screenshot({ path: path.join(out, n + '.png'), timeout: 180000 }); console.log('capture', n); };
  const st = () => page.evaluate(() => { const p = window.__lwy.state().run.p; return `s=${(-p.pos.z).toFixed(0)} sol=${(p.pos.y - WORLD.heightAt(p.pos.x, p.pos.z)).toFixed(0)} ${(p.V * 3.6).toFixed(0)} km/h voile=${(p.bank * 57.3).toFixed(0)}° pilote=${(p.swing * 57.3).toFixed(0)}°`; });
  // le bot vole jusqu'au tablier, puis vol droit mains hautes 2 s
  await page.evaluate(() => { const L = window.__lwy; L.manual(true); L.start(); L.bot({ agl: 18 }); for (let i = 0; i < 900; i++) { L.advance(1 / 30, 1, false); const p = L.state().run.p; if (-p.pos.z > 150 && p.mode === 'air' && p.pos.y - WORLD.heightAt(p.pos.x, p.pos.z) > 16) break; } L.bot(null); L.input(0, 0, false); L.advance(1 / 30, 40, true); });
  console.log('droit', await st()); await shot('r1-vol-droit');
  await page.evaluate(() => { const L = window.__lwy; L.input(0, 1, false); L.advance(1 / 30, 9, true); });
  console.log('+0,3 s frein droit', await st()); await shot('r2-paf-droite');
  await page.evaluate(() => { const L = window.__lwy; L.advance(1 / 30, 18, true); });
  console.log('+0,9 s', await st()); await shot('r3-pilote-suit');
  await page.evaluate(() => { const L = window.__lwy; L.input(1, 0, false); L.advance(1 / 30, 12, true); });
  console.log('bascule +0,4 s', await st()); await shot('r4-bascule-gauche');
  console.log(errs.filter(e => !e.includes('ERR_FAILED')).join('\n') || 'aucune erreur console');
  await browser.close();
})();
