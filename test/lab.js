// Banc d'essai des personnages : poses figées, captures sans interface
// usage : node test/lab.js config.json   (config : [{ name, specs, frames, cam:{pos,look}, rot, gap, noBoss }])
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page0}</body></html>`;
(async () => {
  const shots = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const W = shots[0].w || 1000, H = shots[0].h || 560;
  const { browser, page, errs } = await open({ html: wrapped, width: W, height: H });
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.fill('#heroName', 'Bastien'); await page.click('#persoOk'); await page.waitForTimeout(300);
  const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  for (const sh of shots) {
    await page.evaluate((sh) => {
      document.querySelectorAll('.screen,.hud').forEach(e => e.style.visibility = 'hidden');
      if (!window.__labInit || window.__labKey !== JSON.stringify(sh.specs) + sh.rot + sh.gap) { R3._lab({ specs: sh.specs, frames: sh.frames, rot: sh.rot, gap: sh.gap, noBoss: sh.noBoss !== false }); window.__labInit = 1; window.__labKey = JSON.stringify(sh.specs) + sh.rot + sh.gap; }
      else R3._labFrames(sh.frames);
      if (sh.q) R3.setQuality(sh.q);
      if (sh.rots) R3._labRots(sh.rots);
      R3._setCam(sh.cam.pos, sh.cam.look);
      R3._dbg().cam.mode = 'lab'; R3.setInsets(0, 0, 0);
    }, sh);
    await page.evaluate(() => { R3.update(0.001); });
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(sh.wait || 350);
    await page.screenshot({ path: path.join(out, 'lab-' + sh.name + '.png') });
    console.log('shot', sh.name);
  }
  console.log(errs.filter(e => !e.includes('ERR_FAILED') && !e.includes('GPU stall')).slice(0, 10).join('\n') || 'ok');
  await browser.close();
})();
