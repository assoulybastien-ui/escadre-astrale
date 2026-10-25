// Contrôle du cadrage en combat (paysage) : positions écran des persos vs barres d'interface
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page0}</body></html>`;
(async () => {
  const boss = process.argv[2] || 'jumelles';
  const { browser, page, errs } = await open({ html: wrapped, width: 852, height: 393, dpr: 1 });
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.fill('#heroName', 'B'); await page.click('#persoOk'); await page.waitForTimeout(300);
  await page.evaluate(b => { const s = JSON.parse(localStorage.getItem('escadre-astrale-v5')); for (const x in s.kills) s.kills[x] = { normal: 1, heroique: 0, mythique: 0 }; s.boss = b; localStorage.setItem('escadre-astrale-v5', JSON.stringify(s)); }, boss);
  await page.reload(); await page.waitForFunction(() => !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.click('#btnPull'); await page.waitForTimeout(500); await page.evaluate(() => { window.__escadre.manual(true); window.__escadre.advance(0.05, 80); });
  const info = await page.evaluate(() => { const d = R3._dbg(); const np = R3.nameplates().map(p => [Math.round(p.x), Math.round(p.y)]); const sp = document.querySelector('#spells').getBoundingClientRect(); return { np, spellsTop: sp.top, spellsLeft: sp.left, zoom: d.cam.zoom, el: d.cam.el, pos: d.camera.position.toArray().map(v => +v.toFixed(1)), look: d.cam.look.toArray().map(v => +v.toFixed(1)), insets: d.insets, fit: d.fitPrev, fitDbg: d.fitDbg, mode: d.cam.mode, focus: d.cam.focus.toArray().map(v => +v.toFixed(1)), cpos: d.cam.pos.toArray().map(v => +v.toFixed(1)), az: d.cam.az, feet: d.raidM.map(m => { const v = m.root.position.clone(); v.y = 0; v.project(d.camera); return Math.round((1 - (v.y * 0.5 + 0.5)) * innerHeight); }) }; });
  console.log(JSON.stringify(info));
  const dbg = await page.evaluate(() => { const d = R3._dbg(); const c = d.camera; return { view: c.view, aspect: c.aspect, fov: c.fov, near: c.near, vwvh: [innerWidth, innerHeight], pm: Array.from(c.projectionMatrix.elements).map(v => +v.toFixed(3)) }; });
  console.log(JSON.stringify(dbg));
  const rep = await page.evaluate(() => { const d = R3._dbg(), T = THREE; const S = window.__escadre.state(); const fc = new T.PerspectiveCamera(); fc.copy(d.camera); fc.projectionMatrix.copy(d.camera.projectionMatrix);
    const focus = d.cam.focus.clone(); const out = [];
    for (const dd of [20, 24.6, 30, 40]) { fc.position.set(0, Math.sin(0.98) * dd, Math.cos(0.98) * dd).add(focus); fc.lookAt(focus); fc.updateMatrixWorld(true); const v = new T.Vector3(0, 0, 12.5).project(fc); out.push([dd, Math.round((1 - (v.y * 0.5 + 0.5)) * 393)]); }
    return { out, pts: d.raidM.map(m => [m.root.position.x.toFixed(1), m.root.position.z.toFixed(1)]), rpos: S.raiders.map(r => [r.pos.x.toFixed(1), r.pos.z.toFixed(1)]) }; });
  console.log(JSON.stringify(rep));
  await page.evaluate(() => window.__escadre.advance(0.05, 30));
  await page.screenshot({ path: path.join(__dirname, 'shots', 'cam-' + boss + '.png') });
  console.log('np2', JSON.stringify(await page.evaluate(() => R3.nameplates().map(p => Math.round(p.y)))));
  console.log(errs.slice(0,5).join('\n') || 'no errors');
  await browser.close();
})();
