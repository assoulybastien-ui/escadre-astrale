// Captures du saut de falaise et du balancement (frein tenu, relâché, wingover). usage : node test/balance.js outDir
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
(async () => {
  const out = process.argv[2] || path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const { browser, page, errs } = await open({});
  const shot = async n => { await page.screenshot({ path: path.join(out, n + '.png'), timeout: 180000 }); console.log('capture', n); };
  const st = () => page.evaluate(() => { const p = window.__lwy.state().run.p; return `s=${(-p.pos.z).toFixed(0)} sol=${(p.pos.y - WORLD.heightAt(p.pos.x, p.pos.z)).toFixed(1)} V=${(p.V * 3.6).toFixed(0)} voile=${(p.bank * 57.3).toFixed(0)}° pilote=${(p.swing * 57.3).toFixed(0)}°`; });
  await page.evaluate(() => { const L = window.__lwy; L.manual(true); L.start(); L.input(0, 0, true); });
  // élan puis saut : on avance jusqu'au bord, puis juste après
  await page.evaluate(() => { const L = window.__lwy; for (let i = 0; i < 400; i++) { L.advance(1 / 30, 1, false); if (-L.state().run.p.pos.z > -6) break; } L.advance(1 / 30, 3, true); });
  console.log('bord', await st()); await shot('b1-bord-falaise');
  await page.evaluate(() => { const L = window.__lwy; L.advance(1 / 30, 26, true); });
  console.log('saut', await st()); await shot('b2-saut');
  // le bot vole jusqu'au tablier, puis on prend la main
  await page.evaluate(() => { const L = window.__lwy; L.bot({}); for (let i = 0; i < 900; i++) { L.advance(1 / 30, 1, false); if (-L.state().run.p.pos.z > 175) break; } L.bot(null); L.input(0, 0, false); L.advance(1 / 30, 30, false); });
  // frein droit tenu : la voile s'incline vite, le pilote part ensuite
  await page.evaluate(() => { const L = window.__lwy; L.input(0, 0.8, false); L.advance(1 / 30, 12, true); });
  console.log('frein droit', await st()); await shot('b3-frein-droit');
  await page.evaluate(() => { const L = window.__lwy; L.advance(1 / 30, 12, true); });
  console.log('frein droit +0,4 s', await st()); await shot('b4-balance');
  // relâché : la voile revient, le pilote repart de l'autre côté
  await page.evaluate(() => { const L = window.__lwy; L.input(0, 0, false); L.advance(1 / 30, 22, true); });
  console.log('relâché', await st()); await shot('b5-retour');
  console.log(errs.filter(e => !e.includes('ERR_FAILED')).join('\n') || 'aucune erreur console');
  await browser.close();
})();
