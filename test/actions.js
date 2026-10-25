// Gestes figés au banc d'essai (vue trois-quarts), pour vérifier les poses d'attaque et de sort
// usage : node test/actions.js outDir '{"titan":[["tSmash",0.42],["tSmash",0.6]], ...}' [w] [h] [angle]
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page0}</body></html>`;
(async () => {
  const [outDir, json, w = '480', h = '480', ang = '1.05'] = process.argv.slice(2);
  const plan = JSON.parse(json);
  fs.mkdirSync(outDir, { recursive: true });
  const { browser, page, errs } = await open({ html: wrapped, width: +w, height: +h });
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.fill('#heroName', 'B'); await page.click('#persoOk'); await page.waitForTimeout(300);
  for (const c in plan) {
    for (const [act, k, a2] of plan[c]) {
      await page.evaluate(([c, act, k, a]) => {
        document.querySelectorAll('.screen,.hud').forEach(e => e.style.visibility = 'hidden');
        if (window.__pc !== c) { R3._lab({ specs: [c], frames: [{}], rot: 0, noBoss: true }); window.__pc = c; }
        R3._labFrames([act ? { act, k, lunge: 0 } : {}]);
        R3._dbg().cam.mode = 'lab'; R3.setInsets(0, 0, 0);
        R3.update(0.001);
        const R = R3._labDbg().lab.list[0]; const hp = R.root.position, sc = R.root.scale.x / 1.7;
        R3._setCam([hp.x + Math.sin(a) * 5.4 * sc, 2.5 * sc + 0.2, hp.z + Math.cos(a) * 5.4 * sc], [hp.x, 1.45 * sc, hp.z]);
      }, [c, act, k, a2 ?? +ang]);
      await page.evaluate(() => { R3.update(0.016); });
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(outDir, `${c}-${act || 'stance'}-${k}.jpg`), type: 'jpeg', quality: 90, timeout: 180000 });
    }
    console.log('ok', c);
  }
  console.log(errs.filter(e => !e.includes('ERR_FAILED') && !e.includes('GPU stall')).slice(0, 10).join('\n') || 'no errors');
  await browser.close();
})();
