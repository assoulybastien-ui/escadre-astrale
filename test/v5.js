// Parcours v5 en paysage iPhone : hub, placement, sélection au doigt, ordres en file, sorts.
// usage : node test/v5.js [boss] [dpr]
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page0}</body></html>`;
(async () => {
  const boss = process.argv[2] || 'vorr', dpr = +(process.argv[3] || 1);
  const { browser, page, errs } = await open({ html: wrapped, width: 852, height: 393, dpr });
  const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const shot = async n => { await page.screenshot({ path: `${out}/v5-${boss}-${n}.png` }); console.log('shot', n); };
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden || !document.querySelector('#loadRetry').hidden, null, { timeout: 120000 });
  await page.fill('#heroName', 'Bastien'); await page.click('#persoOk'); await page.waitForTimeout(300);
  await page.evaluate(b => { const s = JSON.parse(localStorage.getItem('escadre-astrale-v5')); for (const x in s.kills) s.kills[x] = { normal: 1, heroique: 0, mythique: 0 }; s.boss = b; s.gfx = 'haute'; localStorage.setItem('escadre-astrale-v5', JSON.stringify(s)); }, boss);
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await shot('1-hub');
  await page.click('#btnPull'); await page.waitForTimeout(1500);
  await shot('2-prep');
  // vrai tap au doigt sur un perso (sélection tolérante) puis sur le sol
  const np = await page.evaluate(() => R3.nameplates());
  const tgt = np[7];
  await page.touchscreen.tap(tgt.x + 6, tgt.y + 28);
  await page.waitForTimeout(200);
  const selA = await page.evaluate(() => [...window.__escadre.ui.sel]);
  console.log('tap sur', tgt.i, '→ sélection', JSON.stringify(selA));
  await page.touchscreen.tap(tgt.x + 140, tgt.y + 10);
  await page.waitForTimeout(200);
  const moved = await page.evaluate(i => window.__escadre.state().raiders[i].pos, tgt.i);
  console.log('placé en', JSON.stringify(moved));
  // pull, puis groupes + ordres en file
  await page.evaluate(() => window.__escadre.pull());
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__escadre.ff(6));
  await page.evaluate(() => {
    const E = window.__escadre, S = E.state();
    const dps = S.raiders.filter(r => r.role === 'dps' && r.range === 'ranged').map(r => r.i);
    dps.forEach(i => E.pick({ kind: 'raider', i }, null));
    E.ui.queue = true;
    E.pick(null, { x: -9, z: 9 }); E.pick(null, { x: -12, z: 2 });
    E.ui.queue = false;
    E.pick({ kind: 'raider', i: S.raiders.find(r => r.role === 'heal').i }, null);
  });
  await page.waitForTimeout(1200);
  await shot('3-orders');
  await page.evaluate(() => { const E = window.__escadre; E.pick({ kind: 'raider', i: [...E.ui.sel][0] }, null); E.pick({ kind: 'body', k: 0 }, null); E.cast('provoc'); E.cast('egide'); E.cast('nuee'); E.cast('dome', { x: 0, z: 7 }); E.cast('tourelle', { x: 4, z: 6 }); E.cast('tir'); });
  await page.evaluate(() => window.__escadre.ff(2));
  await page.waitForTimeout(1500);
  await shot('4-spells');
  await page.evaluate(() => window.__escadre.ff(30));
  await page.waitForTimeout(2500);
  await shot('5-mid');
  const info = await page.evaluate(() => { const d = R3._dbg(); return { calls: d.renderer.info.render.calls, tris: d.renderer.info.render.triangles, t: window.__escadre.state().t.toFixed(1), hp: (window.__escadre.state().hp / window.__escadre.state().maxHp * 100).toFixed(0) }; });
  console.log(JSON.stringify(info));
  console.log(errs.filter(e => !e.includes('ERR_FAILED') && !e.includes('GPU stall')).slice(0, 15).join('\n') || 'no errors');
  await browser.close();
})();
