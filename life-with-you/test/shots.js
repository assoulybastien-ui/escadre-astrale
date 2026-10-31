// Captures des moments clés d'une descente pilotée par le bot. usage : node test/shots.js [outDir] [dpr]
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
(async () => {
  const out = process.argv[2] || path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const dpr = +(process.argv[3] || 1);
  const t0 = Date.now();
  const { browser, page, errs } = await open({ dpr });
  console.log('chargé en', Date.now() - t0, 'ms', errs.length ? errs : '');
  const shot = async n => { await page.screenshot({ path: `${out}/${n}.png`, timeout: 180000 }); console.log('capture', n); };
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__lwy.manual(true));
  await page.evaluate(() => window.__lwy.advance(1 / 30, 30));
  await shot('01-titre');
  await page.evaluate(() => { window.__lwy.start(); window.__lwy.advance(1 / 30, 8); });
  await shot('02-depart');
  await page.evaluate(() => window.__lwy.bot({ agl: 3 }));
  const until = async (cond, label, maxS = 120) => {
    const ok = await page.evaluate(([c, m]) => { const f = new Function('S', 'p', 'return ' + c); for (let i = 0; i < m * 30; i++) { const S = window.__lwy.state(); if (S.screen !== 'run' || f(S, S.run.p)) return true; window.__lwy.advance(1 / 30, 1, false); } return false; }, [cond, maxS]);
    const st = await page.evaluate(() => { const S = window.__lwy.state(), r = S.run; return r ? `${S.screen} t=${r.t.toFixed(1)} s=${(-r.p.pos.z).toFixed(0)} V=${(r.p.V * 3.6).toFixed(0)} sol=${r.clear.agl.toFixed(1)} score=${r.score.toFixed(0)}` : S.screen; });
    console.log(label, ok, st);
  };
  const snap = async n => { await page.evaluate(() => window.__lwy.advance(1 / 30, 3)); await shot(n); };
  await until('p.mode === "ski" && p.V > 6', 'élan'); await snap('03-elan');
  await until('p.mode === "air" && p.airT > 1.2', 'décollé'); await snap('04-vol');
  await until('-p.pos.z > 25', 'porte 1'); await snap('05-porte1');
  await until('-p.pos.z > 140', 'barre'); await snap('06-barre-rocheuse');
  await until('-p.pos.z > 330', 'couloir'); await snap('07-couloir');
  await until('-p.pos.z > 605', 'câble'); await snap('08-cable');
  await until('-p.pos.z > 770', 'forêt'); await snap('09-foret');
  await until('S.run.gate >= 8 && -p.pos.z > 900', 'finale'); await snap('10-finale');
  await until('false', 'fin', 60);
  await page.evaluate(() => window.__lwy.advance(1 / 30, 45));
  await shot('11-resultats');
  console.log(errs.length ? errs.join('\n') : 'aucune erreur console');
  await browser.close();
})();
