// Enregistre une démo image par image (temps de jeu maîtrisé), avec le doigt et des légendes.
// usage : node test/rec.js out_dir [boss]
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}
#finger{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(255,255,255,0.35);box-shadow:0 0 0 2px rgba(255,255,255,0.9),0 0 16px rgba(255,255,255,0.6);z-index:99;pointer-events:none;opacity:0}
#cap{position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:98;pointer-events:none;font:600 13px system-ui;color:#fff;background:rgba(10,12,20,0.82);box-shadow:0 0 0 1px #c9a24a;padding:6px 12px;border-radius:4px;white-space:nowrap;opacity:0}
</style></head><body>${page0}<div id="finger"></div><div id="cap"></div></body></html>`;
const FPS = 15, DT = 1 / FPS;
(async () => {
  const outDir = process.argv[2], boss = process.argv[3] || 'jumelles';
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) fs.unlinkSync(path.join(outDir, f));
  const { browser, page, errs } = await open({ html: wrapped, width: 852, height: 393, dpr: 1.1 });
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.fill('#heroName', 'Bastien'); await page.click('#persoOk'); await page.waitForTimeout(300);
  await page.evaluate(b => { const s = JSON.parse(localStorage.getItem('escadre-astrale-v5')); for (const x in s.kills) s.kills[x] = { normal: 1, heroique: 0, mythique: 0 }; s.boss = b; s.gfx = 'haute'; localStorage.setItem('escadre-astrale-v5', JSON.stringify(s)); }, boss);
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.click('#btnPull'); await page.waitForTimeout(500);
  await page.evaluate(() => window.__escadre.manual(true));
  let n = 0, fingerT = 0;
  async function rec(sec) {
    const frames = Math.round(sec * FPS);
    for (let i = 0; i < frames; i++) {
      await page.evaluate(([dt, ft]) => { window.__escadre.advance(dt); const f = document.getElementById('finger'); f.style.opacity = Math.max(0, ft); }, [DT, fingerT]);
      fingerT -= DT * 2.5;
      await page.screenshot({ path: path.join(outDir, String(n++).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 88 });
    }
  }
  async function fast(sec) { await page.evaluate(([dt, k]) => window.__escadre.advance(dt, k), [0.05, Math.round(sec / 0.05)]); }
  async function cap(text) { await page.evaluate(t => { const c = document.getElementById('cap'); c.textContent = t; c.style.opacity = t ? 1 : 0; }, text); }
  async function tapXY(x, y) {
    await page.evaluate(([x, y]) => { const f = document.getElementById('finger'); f.style.left = x + 'px'; f.style.top = y + 'px'; }, [x, y]);
    fingerT = 1; await page.touchscreen.tap(x, y);
  }
  const raiderXY = i => page.evaluate(i => { const p = R3.nameplates().find(q => q.i === i); return [p.x + 2, p.y + 26]; }, i);
  const groundXY = (x, z) => page.evaluate(([x, z]) => { const d = R3._dbg(); const v = new THREE.Vector3(x, 0, z).project(d.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (1 - (v.y * 0.5 + 0.5)) * innerHeight]; }, [x, z]);
  const elXY = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
  const tapRaider = async i => { const [x, y] = await raiderXY(i); await tapXY(x, y); };
  const tapGround = async (x, z) => { const [a, b] = await groundXY(x, z); await tapXY(a, b); };
  const tapEl = async s => { const [x, y] = await elXY(s); await tapXY(x, y); };
  const S = () => page.evaluate(() => { const S = window.__escadre.state(); return { t: S.t, started: S.started, raiders: S.raiders.map(r => ({ i: r.i, name: r.name, role: r.role, range: r.range, x: r.pos.x, z: r.pos.z, alive: r.alive })), zones: S.zones.filter(z => z.type === 'puits').map(z => ({ x: z.x, z: z.z, r: z.r })) }; });

  // 1. placement de départ
  await cap('Placement de départ : le boss attend');
  await rec(1.2);
  let s = await S();
  const rng = s.raiders.filter(r => r.range === 'ranged' && r.role === 'dps');
  await cap('Je touche un perso, puis le sol : il y va');
  await tapRaider(rng[0].i); await rec(0.6);
  await tapGround(rng[0].x - 3, rng[0].z + 1.5); await rec(1.0);
  await cap('Pull !');
  await tapEl('#prepPull'); await rec(3.6);
  // 2. un perso, ordres en file
  s = await S();
  const walker = rng[1] || rng[0];
  await cap('Ordres en file : un trajet en plusieurs points');
  await tapRaider(walker.i); await rec(0.5);
  await tapEl('#selbar [data-a="queue"]'); await rec(0.5);
  await tapGround(walker.x - 4, walker.z - 1); await rec(0.35);
  await tapGround(walker.x - 2, walker.z - 5); await rec(0.35);
  await tapGround(walker.x + 1, walker.z - 1.5); await rec(0.35);
  await tapEl('#selbar [data-a="clear"]');
  await cap('Il suit le trajet, puis reprend le combat');
  await rec(2.2);
  // 2b. groupe + ordre d'attaque
  await cap('Groupe « Distance » en 1 tap, puis je touche Néria : ordre d’attaque');
  await tapEl('#groups .grp:nth-child(4)'); await rec(0.7);
  { const [x, y] = await page.evaluate(() => { const d = R3._dbg(); const rg = d.rigs[1]; const v = rg.root.position.clone(); v.y = 3; v.project(d.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (1 - (v.y * 0.5 + 0.5)) * innerHeight]; }); await tapXY(x, y); }
  await rec(1.6);
  // 3. zones : ils ne bougent pas seuls
  s = await S();
  if (s.t < 10.05) await fast(10.05 - s.t);
  await rec(0.4);
  s = await S();
  const inZone = s.raiders.filter(r => r.alive && s.zones.some(z => Math.hypot(r.x - z.x, r.z - z.z) < z.r));
  await cap('Pluie d’étoiles : ils restent dedans si je ne fais rien');
  await rec(1.0);
  await cap('Je les sors un par un');
  const safeP = (r, taken) => {
    const bad = p => Math.hypot(p.x, p.z) > 17.5 || s.zones.some(z => Math.hypot(p.x - z.x, p.z - z.z) < z.r + 1.2) || Math.abs(p.z + 2) < 2.5 || taken.some(q => Math.hypot(p.x - q.x, p.z - q.z) < 2) || s.raiders.some(o => o.i !== r.i && Math.hypot(p.x - o.x, p.z - o.z) < 1.6);
    for (let rad = 3; rad <= 12; rad += 1) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; const p = { x: r.x + Math.cos(a) * rad, z: r.z + Math.sin(a) * rad }; if (!bad(p)) return p; }
    return { x: r.x, z: r.z + 6 };
  };
  const taken = [];
  for (const r of inZone.slice(0, 4)) {
    const p = safeP(r, taken); taken.push(p);
    await tapRaider(r.i); await rec(0.3);
    await tapGround(p.x, p.z); await rec(0.4);
    await page.evaluate(() => { const E = window.__escadre; if (E.ui.sel.size) { E.ui.sel.clear(); } });
  }
  await rec(1.4);
  // 4. interruption
  s = await S();
  if (s.t < 16.3) await fast(16.3 - s.t);
  await cap('Éruption solaire : Interruption (le porteur à portée s’en charge)');
  await rec(0.6);
  await tapEl('#spells [data-sp="kick"]'); await rec(1.8);
  // 5. sort au sol
  await cap('Sort au sol : Dôme, puis je touche où le poser');
  await tapEl('#spells [data-sp="dome"]'); await rec(0.5);
  s = await S();
  const heals = s.raiders.filter(r => r.role === 'heal');
  await tapGround(heals[2] ? heals[2].x : 0, heals[2] ? heals[2].z : 8); await rec(1.6);
  // 6. mode de soin
  await cap('Un soigneur : je choisis qui il soigne en priorité');
  await tapRaider(heals[0].i); await rec(0.7);
  await tapEl('#selbar [data-a="mode"][data-m="tanks"]'); await rec(1.4);
  await tapEl('#selbar [data-a="clear"]'); await cap(''); await rec(0.8);
  console.log('frames', n);
  console.log(errs.filter(e => !e.includes('ERR_FAILED') && !e.includes('GPU stall')).slice(0, 10).join('\n') || 'no errors');
  await browser.close();
})();
