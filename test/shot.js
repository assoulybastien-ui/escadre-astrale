const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${page0}</body></html>`;
(async () => {
  const [mode = 'portrait', role = 'heal', boss = 'vorr', what = 'basic', diff = 'normal', gfx = 'haute'] = process.argv.slice(2);
  const vp = mode === 'landscape' ? { width: 852, height: 393 } : { width: 393, height: 852 };
  const { browser, page, errs } = await open({ html: wrapped, width: vp.width, height: vp.height, dpr: 1 });
  const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const tag = `${mode}-${role}-${boss}`;
  const t0 = Date.now();
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden || !document.querySelector('#loadRetry').hidden, null, { timeout: 120000 });
  console.log('loaded in', Date.now() - t0, 'ms', await page.evaluate(() => document.querySelector('#loadTxt').textContent));
  if (role === 'tank') await page.click('#roleSeg [data-role="tank"]');
  await page.fill('#heroName', 'Bastien');
  await page.click('#persoOk');
  await page.waitForTimeout(500);
  await page.evaluate(([boss, diff, gfx]) => { const s = JSON.parse(localStorage.getItem('escadre-astrale-v2')); for (const b in s.kills) s.kills[b] = { normal: 1, heroique: 1, mythique: 0 }; s.boss = boss; s.diff = diff; s.gfx = gfx; localStorage.setItem('escadre-astrale-v2', JSON.stringify(s)); }, [boss, diff, gfx]);
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${tag}-1-hub.png` });
  await page.click('#btnPull'); await page.waitForTimeout(400);
  await page.evaluate(() => window.__escadre.ff(25));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/${tag}-5-fight.png` });
  if (what !== 'quick') {
    await page.evaluate(() => window.__escadre.ff(55));
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${out}/${tag}-6-fight2.png` });
  }
  const info = await page.evaluate(() => { const d = R3._dbg(); const pr = d.rigs.map(r => { const v = r.root.position.clone(); const w = v.clone(); v.project(d.camera); return [w.x.toFixed(1), w.z.toFixed(1), ((v.x*0.5+0.5)*innerWidth).toFixed(0), ((1-(v.y*0.5+0.5))*innerHeight).toFixed(0), r.root.visible, r.body.position.y.toFixed(1)]; }); return { rigs: pr, cam: d.camera.position.toArray().map(v=>+v.toFixed(1)), look: d.cam.look.toArray().map(v=>+v.toFixed(1)), zoom: d.cam.zoom, mode: d.cam.mode, bodies: window.__escadre.state().bodies.map(b=>[+b.pos.x.toFixed(1), +b.pos.z.toFixed(1)]), hdr: d.hdrType, ms: !!(d.composer && d.composer.renderTarget1.isWebGLMultisampleRenderTarget), calls: d.renderer.info.render.calls, tris: d.renderer.info.render.triangles, geos: d.renderer.info.memory.geometries, tex: d.renderer.info.memory.textures }; });
  console.log(JSON.stringify(info));
  console.log(errs.filter(e => !e.includes('ERR_FAILED')).slice(0, 15).join('\n') || 'no errors');
  await browser.close();
})();
