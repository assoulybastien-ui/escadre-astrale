// Portraits de classe au banc d'essai : vues cadrées sur la tête et le corps (taille réelle de chaque race)
// usage : node test/portrait.js outDir cls1,cls2,... [w] [h] [views]
// views : liste séparée par des virgules parmi front,34,side,back,head,headside (défaut : toutes)
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page0}</body></html>`;
const VIEWS = { front: { a: 0.35, d: 4.2, dy: 0.1, ly: -0.75 }, '34': { a: 0.95, d: 4.2, dy: 0.1, ly: -0.75 }, side: { a: -1.57, d: 4.2, dy: 0.1, ly: -0.75 }, back: { a: 2.75, d: 4.4, dy: 0.5, ly: -0.75 },
  head: { a: 0.45, d: 1.25, dy: 0.12, ly: 0.06 }, face: { a: 0.0, d: 0.95, dy: 0.15, ly: 0.12 }, headside: { a: -1.2, d: 1.3, dy: 0.1, ly: 0.06 } };
(async () => {
  const [outDir, list, w = '640', h = '640', vlist] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const { browser, page, errs } = await open({ html: wrapped, width: +w, height: +h });
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.fill('#heroName', 'B'); await page.click('#persoOk'); await page.waitForTimeout(300);
  const views = vlist ? vlist.split(',') : Object.keys(VIEWS);
  for (const c of list.split(',')) {
    for (const v of views) {
      const o = VIEWS[v];
      await page.evaluate(v => { window.__vname = v; }, v);
      await page.evaluate(([c, o]) => {
        document.querySelectorAll('.screen,.hud').forEach(e => e.style.visibility = 'hidden');
        if (window.__pc !== c) { R3._lab({ specs: [c], frames: [{}], rot: 0, noBoss: true }); window.__pc = c; }
        R3._dbg().cam.mode = 'lab'; R3.setInsets(0, 0, 0);
        R3.update(0.001);
        const R = R3._labDbg().lab.list[0]; const hp = R.bones.head.getWorldPosition(new THREE.Vector3());
        const OV = { titan: { head: { a: 0.25, d: 1.55, dy: 0.5, ly: 0.08 } }, fracasseur: { head: { a: 0.5, d: 1.35, dy: 0.3, ly: 0.07 } }, lameombre: { head: { a: 0.75, d: 1.35, dy: 0.18, ly: 0.06 } } };
        if (OV[c] && OV[c][window.__vname]) o = OV[c][window.__vname];
        const th = o.a, k = o.d > 2 ? R.root.scale.x / 1.7 : Math.max(1, R.root.scale.x / 1.7); R3._setCam([hp.x + Math.sin(th) * o.d * k, hp.y + o.dy * k, hp.z + Math.cos(th) * o.d * k], [hp.x, hp.y + o.ly * k, hp.z]);
      }, [c, o]);
      await page.evaluate(() => { R3.update(0.016); });
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(outDir, `${c}-${v}.jpg`), type: 'jpeg', quality: 92, timeout: 180000 });
    }
    console.log('ok', c);
  }
  console.log(errs.filter(e => !e.includes('ERR_FAILED') && !e.includes('GPU stall')).slice(0, 10).join('\n') || 'no errors');
  await browser.close();
})();
