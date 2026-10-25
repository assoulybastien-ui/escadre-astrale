// Vitrine des 9 classes en combat (étape 2) : une séquence par classe, caméra proche, gestes et sorts.
// usage : node test/recall.js outDir [fps] [segments]   (segments : liste d'indices séparés par des virgules)
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}
#cap{position:fixed;left:14px;bottom:14px;z-index:98;pointer-events:none;font:600 15px system-ui;color:#fff;background:rgba(10,12,20,0.78);box-shadow:0 0 0 1px #c9a24a;padding:7px 12px;border-radius:4px;opacity:0}
#ttl{position:fixed;left:14px;top:12px;z-index:98;pointer-events:none;font:700 19px system-ui;letter-spacing:.06em;color:#f2d68c;text-shadow:0 1px 3px #000}
#ttl small{display:block;font:500 12px system-ui;letter-spacing:0;color:#dfe6ff}
</style></head><body>${page0}<div id="cap"></div><div id="ttl"></div></body></html>`;
(async () => {
  const [outDir, fpsA = '15', segA = ''] = process.argv.slice(2);
  const FPS = +fpsA, DT = 1 / FPS;
  fs.mkdirSync(outDir, { recursive: true }); for (const f of fs.readdirSync(outDir)) fs.unlinkSync(path.join(outDir, f));
  const { browser, page, errs } = await open({ html: wrapped, width: 760, height: 560, dpr: 1 });
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.fill('#heroName', 'B'); await page.click('#persoOk'); await page.waitForTimeout(300);
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('escadre-astrale-v5')); for (const x in s.kills) s.kills[x] = { normal: 1, heroique: 0, mythique: 0 }; s.boss = 'vorr'; s.gfx = 'haute'; localStorage.setItem('escadre-astrale-v5', JSON.stringify(s)); });
  await page.reload(); await page.waitForFunction(() => !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.click('#btnPull'); await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__escadre.manual(true);
    document.querySelectorAll('.hud').forEach(e => e.style.visibility = 'hidden'); document.getElementById('plates').style.display = 'none';
    const S = window.__escadre.state();
    // tanks au sud du boss (caméra dos au soleil), le reste du raid derrière
    const g = S.raiders.find(r => r.cls === 'gardien'), t = S.raiders.find(r => r.cls === 'titan');
    g.pos = { x: 0.5, z: 6.8 }; g.anchor = { x: 0.5, z: 6.8 }; t.pos = { x: -3.6, z: 7.6 }; t.anchor = { x: -3.6, z: 7.6 };
    const put = (c, n, x, z) => { const r = S.raiders.filter(q => q.cls === c)[n]; if (r) { r.pos = { x, z }; r.anchor = { x, z }; } };
    put('medic', 0, -8, 15); put('seraphe', 0, -1.5, 16.5); put('maree', 0, 6.5, 15); put('spectre', 0, -8.5, 17); put('spectre', 1, 9, 18); put('bricoleur', 0, 2.5, 18.5);
  });
  let n = 0, camA = null;
  const cap = t => page.evaluate(t => { const c = document.getElementById('cap'); c.textContent = t; c.style.opacity = t ? 1 : 0; }, t);
  const ttl = (t, s) => page.evaluate(([t, s]) => { document.getElementById('ttl').innerHTML = t ? t + '<small>' + s + '</small>' : ''; }, [t, s]);
  const js = (f, a) => page.evaluate(f, a);
  // caméra : décalage absolu (azimut a, dos au soleil), légère orbite
  async function rec(sec, cam) {
    const frames = Math.round(sec * FPS);
    for (let i = 0; i < frames; i++) {
      await page.evaluate(([cam, dt, i]) => {
        const E = window.__escadre, S = E.state();
        for (const r of S.raiders) { if (r.alive) r.hp = Math.max(r.hp, r.maxHp * 0.85); }
        const r = cam.ri >= 0 ? S.raiders[cam.ri] : null;
        const c = r ? { x: r.pos.x + (cam.ox || 0), z: r.pos.z + (cam.oz || 0) } : { x: cam.x, z: cam.z };
        window.__cc = window.__cc ? { x: window.__cc.x + (c.x - window.__cc.x) * (cam.cut ? 1 : 0.12), z: window.__cc.z + (c.z - window.__cc.z) * (cam.cut ? 1 : 0.12) } : c;
        cam.cut = false;
        let base = cam.a;
        if (cam.mode && r) {
          const B = S.bodies[0].pos, th = Math.atan2(r.pos.x - B.x, r.pos.z - B.z);
          const sun = q => Math.sin(q) * 0.59 - Math.cos(q) * 0.81;
          if (cam.mode === 'side') { const q1 = th + Math.PI / 2 - (cam.bias || 0.35), q2 = th - Math.PI / 2 + (cam.bias || 0.35); base = sun(q1) > sun(q2) ? q1 : q2; }
          else base = th + Math.PI + (cam.bias || 0);
          base += cam.a || 0;
          if (window.__ca == null || cam.cut2) window.__ca = base; else window.__ca += (((base - window.__ca + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 0.06;
          base = window.__ca;
        }
        const a = base + (cam.spin || 0) * i * dt, cc = window.__cc;
        R3._setCam([cc.x + Math.sin(a) * cam.d, cam.h, cc.z + Math.cos(a) * cam.d], [cc.x, cam.ly, cc.z]);
        E.advance(dt);
      }, [Object.assign({}, cam, { cut2: cam.cut && i === 0 }), DT, i]);
      if (i === 0) cam.cut = false;
      await page.screenshot({ path: path.join(outDir, String(n++).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 90 });
    }
  }
  const cast = async (id, o) => { const r = await cast0(id, o); console.log('cast', id, r && r.text); return r; };
  const cast0 = (id, o) => js(([id, o]) => { const E = window.__escadre, S = E.state();
    if (o && o.only != null) for (const r of S.raiders) if (r.i !== o.only) r.cds[id] = S.t + 30;
    const res = GAME.cast(S, id, { sel: (o && o.sel) || [], enemy: null, ground: o && o.ground }); return res; }, [id, o || null]);
  const P = i => js(i => { const r = window.__escadre.state().raiders[i]; return { x: r.pos.x, z: r.pos.z }; }, i);
  const idx = c => js(c => window.__escadre.state().raiders.findIndex(r => r.cls === c), c);
  const want = segA ? new Set(segA.split(',').map(Number)) : null;
  const I = {}; for (const c of ['gardien', 'titan', 'medic', 'seraphe', 'maree', 'lameombre', 'fracasseur', 'spectre', 'bricoleur']) I[c] = await idx(c);
  const SEG = [
    async () => { // ouverture : le raid au complet
      await ttl('LES 9 CLASSES', 'Escadre Astrale · une race par classe'); await cap('Le raid au complet avant le pull');
      await rec(2.6, { ri: -1, x: -1, z: 13, a: 2.45, d: 19, h: 14, ly: 1.2, spin: -0.03, cut: true });
      await js(() => window.__escadre.pull()); await cap('Pull !'); await rec(1.8, { ri: -1, x: -1, z: 11, a: 2.37, d: 21, h: 15, ly: 1.4, spin: -0.03 });
    },
    async () => { // Titan
      await ttl('TITAN', 'Géant · tank · marteau et pavois de forge'); await cap('Provocation : il frappe son pavois et rugit');
      await cast('provoc'); await rec(2.6, { ri: I.titan, mode: 'side', d: 7.0, h: 3.6, ly: 2.2, spin: 0.04, cut: true });
      await cap('Coups de marteau écrasants'); await rec(2.4, { ri: I.titan, mode: 'side', d: 7.0, h: 3.6, ly: 2.2, spin: 0.04 });
      await cap('Séisme (sur les adds) : bond, puis onde de choc'); await js(i => R3._play(i, 'quake', {}), I.titan); await rec(2.0, { ri: I.titan, mode: 'side', d: 8, h: 4.2, ly: 2.0, spin: 0.04 });
      await cap('Carapace : pavois planté, −45 % de dégâts'); await cast('carapace'); await rec(1.9, { ri: I.titan, mode: 'side', d: 7.4, h: 3.6, ly: 2.0, spin: 0.04 });
    },
    async () => { // Médic
      await ttl('MÉDIC', 'Droïde · soigneur · émetteur et drone médical'); await cap('Soins : rayon de l’émetteur, relais du drone');
      await rec(2.8, { ri: I.medic, mode: 'front', bias: -0.5, d: 5.0, h: 2.7, ly: 1.7, spin: 0.06, cut: true });
      await cap('Nuée : le drone libère les nanites sur tout le raid'); await cast('nuee'); await rec(2.6, { ri: I.medic, mode: 'front', bias: -0.5, d: 6.2, h: 3.2, ly: 1.7, spin: 0.06 });
    },
    async () => { // Séraphe
      await ttl('SÉRAPHE', 'Alien mystique · soigneur · ailes de lumière'); await cap('Lévite, soigne au sceptre');
      await rec(2.6, { ri: I.seraphe, mode: 'front', bias: -0.55, d: 4.8, h: 2.8, ly: 1.9, spin: 0.06, cut: true });
      await cap('Prisme : bouclier sur le tank'); await cast('prisme', { sel: [I.titan] }); await rec(2.4, { ri: I.seraphe, mode: 'front', bias: -0.55, d: 5.2, h: 2.9, ly: 1.9, spin: 0.06 });
    },
    async () => { // Marée
      await ttl('MARÉE', 'Amphibien · soigneur · bâton-trident'); await cap('Soins : vagues lancées au trident');
      await rec(2.4, { ri: I.maree, mode: 'front', bias: -0.5, d: 5.0, h: 2.7, ly: 1.6, spin: 0.06, cut: true });
      const tp = await P(I.titan);
      await cap('Marée haute : la vague retombe sur les tanks'); await cast('vague', { ground: { x: tp.x + 1.5, z: tp.z } });
      await rec(3.0, { ri: I.maree, mode: 'front', bias: -0.75, d: 9.5, h: 5, ly: 1.2, spin: 0.04 });
    },
    async () => { // Lame-ombre
      await ttl('LAME-OMBRE', 'Reptilien · DPS mêlée · deux sabres'); await cap('Taillades croisées aux deux sabres');
      await rec(2.8, { ri: I.lameombre, mode: 'side', bias: 0.55, d: 5.0, h: 2.8, ly: 1.5, spin: 0.05, cut: true });
      await cap('Pas de l’ombre : il disparaît et frappe en croix'); await cast('pas'); await rec(2.6, { ri: I.lameombre, mode: 'side', bias: 0.55, d: 5.6, h: 3, ly: 1.5, spin: 0.05 });
    },
    async () => { // Fracasseur
      await ttl('FRACASSEUR', 'Félin · DPS mêlée · épée à deux mains'); await cap('Frappes à deux mains');
      await rec(2.6, { ri: I.fracasseur, mode: 'side', bias: 0.5, d: 6, h: 3, ly: 1.7, spin: 0.05, cut: true });
      await cap('Tourbillon : 4 s de rotation, frappe tout autour'); await cast('tourbillon'); await rec(3.4, { ri: I.fracasseur, mode: 'side', bias: 0.5, d: 6.4, h: 3.2, ly: 1.6, spin: 0.05 });
      await cap('Cri de guerre : +25 % de dégâts au raid'); await cast('cri'); await rec(1.8, { ri: I.fracasseur, mode: 'side', bias: 0.5, d: 6.4, h: 3.1, ly: 1.7, spin: 0.05 });
    },
    async () => { // Spectre
      await ttl('SPECTRE', 'Cyborg · DPS distance · fusil de précision'); await cap('Tir d’élite, laser de visée');
      await rec(2.6, { ri: I.spectre, mode: 'side', bias: 0.15, d: 5.2, h: 2.5, ly: 1.2, spin: 0.05, cut: true });
      await cap('Tir de précision : visée longue, gros impact'); await cast('tir', { only: I.spectre }); await rec(2.6, { ri: I.spectre, mode: 'side', bias: 0.25, d: 6.0, h: 2.7, ly: 1.4, spin: 0.05 });
    },
    async () => { // Bricoleur
      await ttl('BRICOLEUR', 'Petit ingénieur · DPS distance · canon et gadgets'); await cap('Canon à main');
      await rec(2.4, { ri: I.bricoleur, mode: 'front', bias: -0.55, d: 3.6, h: 1.9, ly: 0.95, spin: 0.06, cut: true });
      const bp = await P(I.bricoleur), tp = await P(I.titan);
      await cap('Tourelle : il lance le gadget, elle se déploie'); await cast('tourelle', { ground: { x: bp.x - 2.5, z: bp.z - 5 } });
      await rec(2.6, { ri: I.bricoleur, mode: 'front', bias: -0.75, d: 6.5, h: 3.4, ly: 1.0, spin: 0.05 });
      await cap('Dôme : bouclier au sol pour le raid'); await cast('dome', { ground: { x: bp.x - 4, z: bp.z - 6 } }); await rec(2.4, { ri: I.bricoleur, mode: 'front', bias: -0.8, d: 9, h: 5.2, ly: 1.0, spin: 0.04 });
    },
    async () => { // fin : vue d'ensemble
      await ttl('', ''); await cap('Les 9 classes ensemble'); await rec(2.8, { ri: -1, x: -1, z: 10, a: 2.2, d: 21, h: 13, ly: 1.5, spin: -0.04, cut: true });
      await cap(''); await rec(0.4, { ri: -1, x: -1, z: 10, a: 2.09, d: 21, h: 13, ly: 1.5 });
    },
  ];
  for (let k = 0; k < SEG.length; k++) {
    if (want && !want.has(k) && k !== 0) continue;
    if (want && k > 0 && !SEG.warm) { SEG.warm = 1; await js(() => { const E = window.__escadre; for (let j = 0; j < 60; j++) { for (const r of E.state().raiders) if (r.alive) r.hp = r.maxHp; E.ff(0.5); } E.advance(0.05, 4); }); }
    await SEG[k](); console.log('seg', k, 'frames', n);
  }
  console.log('frames', n);
  console.log(errs.filter(e => !e.includes('ERR_FAILED') && !e.includes('GPU stall')).slice(0, 10).join('\n') || 'no errors');
  await browser.close();
})();
