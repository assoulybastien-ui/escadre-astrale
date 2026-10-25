// Vitrine d'une classe en combat : caméra en orbite autour du perso, gestes et sorts, légendes.
// usage : node test/recclass.js out_dir raiderIndex boss scriptName
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}
#cap{position:fixed;left:14px;bottom:14px;z-index:98;pointer-events:none;font:600 15px system-ui;color:#fff;background:rgba(10,12,20,0.78);box-shadow:0 0 0 1px #c9a24a;padding:7px 12px;border-radius:4px;opacity:0}
#ttl{position:fixed;left:14px;top:12px;z-index:98;pointer-events:none;font:700 17px system-ui;letter-spacing:.06em;color:#f2d68c;text-shadow:0 1px 3px #000}
#ttl small{display:block;font:500 12px system-ui;letter-spacing:0;color:#dfe6ff}
</style></head><body>${page0}<div id="cap"></div><div id="ttl"></div></body></html>`;
const FPS = 15, DT = 1 / FPS;
(async () => {
  const [outDir, ri = '0', boss = 'vorr', script = 'gardien'] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true }); for (const f of fs.readdirSync(outDir)) fs.unlinkSync(path.join(outDir, f));
  const { browser, page, errs } = await open({ html: wrapped, width: 760, height: 560, dpr: 1 });
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.fill('#heroName', 'B'); await page.click('#persoOk'); await page.waitForTimeout(300);
  await page.evaluate(b => { const s = JSON.parse(localStorage.getItem('escadre-astrale-v5')); for (const x in s.kills) s.kills[x] = { normal: 1, heroique: 0, mythique: 0 }; s.boss = b; s.gfx = 'haute'; localStorage.setItem('escadre-astrale-v5', JSON.stringify(s)); }, boss);
  await page.reload(); await page.waitForFunction(() => !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.click('#btnPull'); await page.waitForTimeout(400);
  await page.evaluate(() => { window.__escadre.manual(true); document.querySelectorAll('.hud').forEach(e => e.style.visibility = 'hidden'); document.getElementById('plates').style.display = 'none'; });
  let n = 0, a = +(process.env.CAM_A || 1.15);
  const cam = { d: 5.4, h: 2.5, ly: 1.5, spin: 0.005 };
  async function rec(sec) {
    const frames = Math.round(sec * FPS);
    for (let i = 0; i < frames; i++) {
      await page.evaluate(([ri, dt, a, cam]) => { const E = window.__escadre, S = E.state(), r = S.raiders[ri]; const b = S.bodies.reduce((p, q) => Math.hypot(p.pos.x - r.pos.x, p.pos.z - r.pos.z) < Math.hypot(q.pos.x - r.pos.x, q.pos.z - r.pos.z) ? p : q); const th = Math.atan2(b.pos.x - r.pos.x, b.pos.z - r.pos.z); window.__camA = window.__camA == null ? th + a : window.__camA + ((th + a) - window.__camA) * 0.05; const aa = window.__camA; R3._setCam([r.pos.x + Math.sin(aa) * cam.d, cam.h, r.pos.z + Math.cos(aa) * cam.d], [r.pos.x, cam.ly, r.pos.z]); E.advance(dt); }, [+ri, DT, a, cam]);
      a += cam.spin;
      await page.screenshot({ path: path.join(outDir, String(n++).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 90 });
    }
  }
  const cap = t => page.evaluate(t => { const c = document.getElementById('cap'); c.textContent = t; c.style.opacity = t ? 1 : 0; }, t);
  const ttl = (t, s) => page.evaluate(([t, s]) => { document.getElementById('ttl').innerHTML = t + '<small>' + s + '</small>'; }, [t, s]);
  const cast = (id, ctx) => page.evaluate(([id, ctx]) => window.__escadre.cast(id, ctx), [id, ctx || null]);
  const castE = (id, sel) => page.evaluate(([id, sel]) => { const E = window.__escadre; E.ui.sel = new Set(sel || []); E.cast(id); E.ui.sel.clear(); }, [id, sel]);
  const pull = () => page.evaluate(() => { const E = window.__escadre; E.pull(); });
  if (script === 'gardien') {
    await page.evaluate(() => { const E = window.__escadre, S = E.state(); const t = S.raiders.find(r => r.role === 'tank' && r.cls !== 'gardien'), g = S.raiders.find(r => r.cls === 'gardien'); g.pos = { x: 0.5, z: 6.8 }; g.anchor = { x: 0.5, z: 6.8 }; if (t) { t.pos = { x: -4.2, z: 7.4 }; t.anchor = { x: -4.2, z: 7.4 }; } for (const r of S.raiders) if (r.role !== 'tank' && r.pos.z > 3) { r.pos.z = -r.pos.z * 0.8; r.anchor = { x: r.pos.x, z: r.pos.z }; } });
    await ttl('GARDIEN', 'Humain · chevalier de la force · tank');
    await cap('Garde : lame basse, bouclier de lumière levé'); await rec(1.6);
    await pull(); await cap('Pull'); await rec(3.4);
    await cap('Attaques : taille, estoc, coup de bouclier, riposte'); await rec(6.5);
    await cap('Égide : −60 % de dégâts pendant 8 s'); await castE('egide', [+ri]); await rec(2.6);
    await cap('L’autre tank provoque le boss…'); await cast('provoc'); await rec(1.8);
    await cap('… et le Gardien le reprend : Provocation'); await cast('provoc'); await rec(2.8);
    await cap(''); await rec(0.6);
  }
  if (script === 'stills') {
    await page.evaluate(() => { const E = window.__escadre, S = E.state(); const t = S.raiders.find(r => r.role === 'tank' && r.cls !== 'gardien'), g = S.raiders.find(r => r.cls === 'gardien'); g.pos = { x: 0.5, z: 6.8 }; g.anchor = { x: 0.5, z: 6.8 }; if (t) { t.pos = { x: -6, z: 9 }; t.anchor = { x: -6, z: 9 }; } for (const r of S.raiders) if (r.role !== 'tank' && r.pos.z > 3) { r.pos.z = -r.pos.z * 0.8; r.anchor = { x: r.pos.x, z: r.pos.z }; } E.advance(0.05, 20); });
    const shot = async (name, o) => {
      await page.evaluate(([ri, o]) => { const E = window.__escadre, S = E.state(), r = S.raiders[ri]; const b = S.bodies[0]; const th = Math.atan2(b.pos.x - r.pos.x, b.pos.z - r.pos.z) + o.a;
        const setc = () => R3._setCam([r.pos.x + Math.sin(th) * o.d, o.h, r.pos.z + Math.cos(th) * o.d], [r.pos.x, o.ly, r.pos.z]);
        if (o.act) { R3._play(ri, o.act, {}); }
        for (let k = 0; k < (o.n || 4); k++) { setc(); E.advance(o.act ? 0.02 : 0.05); } }, [+ri, o]);
      await page.screenshot({ path: path.join(outDir, name + '.jpg'), type: 'jpeg', quality: 92 }); n++;
    };
    await shot('front', { a: 0.25, d: 4.3, h: 2.3, ly: 1.55 });
    await shot('34', { a: -0.75, d: 4.3, h: 2.3, ly: 1.55 });
    await shot('side', { a: -1.6, d: 4.3, h: 2.3, ly: 1.55 });
    await shot('back', { a: 2.7, d: 4.6, h: 3.4, ly: 1.5 });
    await shot('head', { a: -0.35, d: 1.5, h: 2.95, ly: 2.6 });
    await shot('riposte', { a: -0.9, d: 4.3, h: 2.3, ly: 1.6, act: 'riposte', n: 17 });
    await shot('aegis', { a: -0.5, d: 4.3, h: 2.3, ly: 1.6, act: 'aegis', n: 30 });
    await shot('taunt', { a: -0.5, d: 4.6, h: 2.5, ly: 1.9, act: 'gTaunt', n: 26 });
    await shot('bash', { a: -1.1, d: 4.3, h: 2.3, ly: 1.6, act: 'bash', n: 16 });
  }
  console.log('frames', n);
  console.log(errs.filter(e => !e.includes('ERR_FAILED') && !e.includes('GPU stall')).slice(0, 10).join('\n') || 'no errors');
  await browser.close();
})();
