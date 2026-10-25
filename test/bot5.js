// Équilibrage v5 : un raid lead scripté joue chaque boss, à vitesse humaine.
// usage : node test/bot5.js [diff] [n] [level] [boss]   level : good | ok | passive
const G = require('../src/engine.js');
const diff = process.argv[2] || 'normal', N = +(process.argv[3] || 6), LEVEL = process.argv[4] || 'good', ONLY = process.argv[5];
const COMP = ['kaelith', 'brakka', 'nym4', 'iriel', 'somna', 'vex', 'rhun', 'ashka', 'kiro', 'senn'];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function bot(S, level) {
  const R = S.raiders, B = S.bodies;
  const home = R.map(r => ({ x: r.pos.x, z: r.pos.z }));
  const P = { good: { react: 0.8, apm: 0.55 }, ok: { react: 1.4, apm: 0.9 } }[level] || { react: 1, apm: 1 };
  const seen = new Set(), later = [], queue = [];
  let busyUntil = 0;
  const at = (dt, fn) => later.push({ t: S.t + dt, fn });
  const act = (fn, cost) => queue.push({ fn, cost: cost || P.apm });       // une action humaine (sélection + tap)
  const alive = () => R.filter(r => r.alive);
  const castS = (id, ctx) => G.cast(S, id, ctx || {});
  const mv = (idx, x, z, pack) => G.order(S, { type: 'move', idx: Array.isArray(idx) ? idx : [idx], x, z, pack });
  // point sûr le plus proche : hors des zones, du rayon, du cœur
  function safe(from, avoid = []) {
    const bad = p => Math.hypot(p.x, p.z) > Math.min(18.5, S.arenaR - 1) || S.zones.some(z => ((z.type === 'puits' || z.type === 'core' || z.type === 'pool') && dist(p, z) < z.r + 1) || (z.type === 'fissure' && G.segDist(p, z, { x: z.x2, z: z.z2 }) < z.w / 2 + 1) || (z.type === 'half' && p.x * z.side > -1.5)) || (S.B.twins && G.segDist(p, B[0].pos, B[1].pos) < 2.5) || avoid.some(a => dist(p, a.p) < a.r);
    if (!bad(from)) return from;
    for (let rad = 2; rad <= 12; rad += 1.5) for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const p = { x: from.x + Math.cos(a) * rad, z: from.z + Math.sin(a) * rad }; if (!bad(p)) return p; }
    return from;
  }
  let lastPulse = -1, criDone = false, lastPhase = 0;
  return function tick(dt) {
    if (S.over) return;
    for (let k = later.length - 1; k >= 0; k--) if (S.t >= later[k].t) { const f = later[k].fn; later.splice(k, 1); f(); }
    if (S.t >= busyUntil && queue.length) { const q = queue.shift(); q.fn(); busyUntil = S.t + q.cost; }
    if (level === 'passive') return;
    if (S.phase !== lastPhase) {
      lastPhase = S.phase; const ph = S.B.phases[S.phase];
      if (ph.center) R.forEach((r, i) => { if (r.role !== 'tank') { const d = Math.hypot(home[i].x, home[i].z) || 1; const k = Math.max(d, r.range === 'melee' ? 5.5 : 10.5) / d; home[i] = { x: home[i].x * k, z: home[i].z * k }; } });
      // Effondrement : on resserre le placement et on ramène tout le monde, en un geste (tout sélectionner, toucher près du centre)
      if (ph.collapse) {
        const lim = ph.collapse - 1.5;
        R.forEach((r, i) => { const d = Math.hypot(home[i].x, home[i].z); if (d > lim) home[i] = { x: home[i].x * lim / d, z: home[i].z * lim / d }; });
        at(P.react, () => act(() => alive().filter(r => Math.hypot(r.pos.x, r.pos.z) > lim).forEach(r => mv(r.i, home[r.i].x, home[r.i].z)), P.apm * 2));
      }
    }
    // Équinoxe : tout le monde (hors tanks) passe de l'autre côté de la ligne du milieu, en un geste, puis revient
    for (const z of S.zones) if (z.type === 'half' && !seen.has(z.id)) {
      seen.add(z.id);
      at(P.react, () => act(() => {
        const on = alive().filter(r => r.role !== 'tank' && r.pos.x * z.side > -1.5);
        for (const r of on) { const p = safe({ x: -z.side * Math.max(2.5, Math.abs(r.pos.x)), z: r.pos.z }); mv(r.i, p.x, p.z); }
        at(z.endAt - S.t + 0.3, () => act(() => on.forEach(r => { if (r.alive) { const q = safe(home[r.i]); mv(r.i, q.x, q.z); } }), P.apm * 2));
      }, P.apm * 2));
    }
    // fissures : décaler sur le côté ceux qui sont sur une ligne, puis les remettre en place
    for (const z of S.zones) if (z.type === 'fissure' && !seen.has(z.id)) {
      seen.add(z.id);
      at(P.react, () => act(() => {
        const ux = z.x2 - z.x, uz = z.z2 - z.z, l = Math.hypot(ux, uz) || 1, nx = -uz / l, nz = ux / l;
        const on = alive().filter(r => r.role !== 'tank' && G.segDist(r.pos, z, { x: z.x2, z: z.z2 }) < z.w / 2 + 0.8);
        for (const r of on) {
          const side = Math.sign((r.pos.x - z.x) * nx + (r.pos.z - z.z) * nz) || 1;
          const p = safe({ x: r.pos.x + nx * side * (z.w / 2 + 1.8), z: r.pos.z + nz * side * (z.w / 2 + 1.8) });
          mv(r.i, p.x, p.z);
          at(z.endAt - S.t + 0.3, () => act(() => { if (r.alive && dist(r.pos, home[r.i]) > 1.5) { const q = safe(home[r.i]); mv(r.i, q.x, q.z); } }, 0.3));
        }
      }, P.apm * 1.5));
    }
    // zones sous les persos : un perso à la fois
    for (const z of S.zones) {
      if (z.type === 'puits' && !seen.has(z.id)) { seen.add(z.id); at(P.react, () => { for (const r of alive()) if (r.role !== 'tank' && dist(r.pos, z) < z.r + 0.3) act(() => { if (r.alive) { const p = safe(r.pos); mv(r.i, p.x, p.z); at(z.endAt - S.t + 0.3, () => act(() => { if (r.alive && dist(r.pos, home[r.i]) > 1.5) { const q = safe(home[r.i]); mv(r.i, q.x, q.z); } })); } }); }); }
      if (z.type === 'soak' && !seen.has(z.id)) { seen.add(z.id); at(P.react, () => act(() => { const nt = alive().filter(r => r.role !== 'tank').sort((a, b) => dist(a.pos, z) - dist(b.pos, z)).slice(0, 6); const back = nt.map(r => ({ r, p: { x: r.pos.x, z: r.pos.z } })); mv(nt.map(r => r.i), z.x, z.z, true); at(z.at - S.t + 0.5, () => act(() => back.forEach(b => b.r.alive && mv(b.r.i, b.p.x, b.p.z)), P.apm * 2)); }, P.apm * 1.6)); }
      if (z.type === 'pool' && !seen.has(z.id)) { seen.add(z.id); at(P.react, () => act(() => { const t = R[B[0].target]; if (!t || !t.alive) return; const lim = Math.min(16, S.arenaR - 2.5); let nx = t.pos.x + 9, nz = t.pos.z; if (Math.hypot(nx, nz) > lim) nx = t.pos.x - 9; if (Math.hypot(nx, nz) > lim) { const d = Math.hypot(nx, nz); nx *= lim / d; nz *= lim / d; } mv(t.i, nx, nz); home[t.i] = { x: nx, z: nz }; })); }
    }
    // marques : écarter les marqués
    for (const r of alive()) if (r.mark && !seen.has('m' + r.i + r.mark.at)) {
      seen.add('m' + r.i + r.mark.at);
      at(P.react, () => act(() => { if (!r.alive || !r.mark) return; const a = Math.atan2(r.pos.x, r.pos.z) + ((r.i * 0.9) % 2 - 1); const p = safe({ x: Math.sin(a) * 16, z: Math.cos(a) * 16 }); mv(r.i, p.x, p.z); at(r.mark.at - S.t + 0.4, () => act(() => r.alive && mv(r.i, home[r.i].x, home[r.i].z))); }));
    }
    // aspiration : remettre chacun à sa place
    const core = S.zones.find(z => z.type === 'core');
    if (core && core.born !== lastPulse) { lastPulse = core.born; at(P.react, () => { const pulled = alive().filter(r => dist(r.pos, home[r.i]) > 2.5); if (pulled.length) act(() => pulled.forEach(r => { const p = safe(home[r.i]); mv(r.i, p.x, p.z); }), P.apm * Math.min(4, 1 + pulled.length / 3)); }); }
    // interruptions
    for (const x of G.interruptibles(S)) { const key = 'k' + x.cast.start + x.ref.k + x.ref.id; if (!seen.has(key)) { seen.add(key); at(P.react * 0.7, () => act(() => castS('kick', { enemy: x.ref }), 0.35)); } }
    // purge
    if (alive().some(r => r.debuffs.some(d => S.t - d.start > P.react)) && !queue.some(q => q.purge)) queue.push({ fn: () => castS('purge'), cost: 0.35, purge: 1 });
    // changement de tank
    for (let k = 0; k < B.length; k++) {
      const t = R[B[k].target]; if (!t) continue;
      const n = Math.max(0, ...Object.values(t.stacks).map(s => s.n));
      if (!S.B.twins && n >= 2 && !B[k].cast && !seen.has('sw' + Math.floor(S.t / 4))) { seen.add('sw' + Math.floor(S.t / 4)); act(() => castS('provoc', { enemy: { kind: 'body', k } }), 0.4); }
      if (B[k].cast && B[k].cast.kind === 'buster' && n >= 1 && t.role === 'tank' && !seen.has('df' + B[k].cast.start)) { seen.add('df' + B[k].cast.start); act(() => { castS(t.cls === 'gardien' ? 'egide' : 'carapace', { sel: [t.i] }); castS('prisme', { sel: [t.i] }); }, 0.7); }
    }
    if (S.B.twins) { const n0 = Math.max(0, ...Object.values((R[B[0].target] || { stacks: {} }).stacks).map(s => s.n)); if (n0 >= 5 && !seen.has('tw' + Math.floor(S.t / 6))) { seen.add('tw' + Math.floor(S.t / 6)); act(() => { castS('provoc', { enemy: { kind: 'body', k: 1 } }); castS('provoc', { enemy: { kind: 'body', k: 0 } }); }, 0.8); } }
    // Gardiens du Vide : le Titan va au milieu d'eux et lance Séisme (ils viennent tous sur lui, Fléau coupé),
    // puis l'autre tank reprend le boss. Provocation seulement en secours.
    const titan = R.find(r => r.cls === 'titan' && r.alive);
    const gNew = S.adds.filter(a => a.alive && a.type === 'guardian' && !seen.has(a.id));
    if (gNew.length && titan && !seen.has('gs' + gNew[0].id)) {
      seen.add('gs' + gNew[0].id);
      at(P.react, () => act(() => {
        const gs = S.adds.filter(a => a.alive && a.type === 'guardian'); if (!gs.length || !titan.alive) return;
        const c = safe({ x: gs.reduce((s, a) => s + a.pos.x, 0) / gs.length, z: gs.reduce((s, a) => s + a.pos.z, 0) / gs.length });
        mv(titan.i, c.x, c.z); home[titan.i] = c;
        at(1.6, () => act(() => {
          if (!castS('seisme', { sel: [titan.i] }).ok) for (const g of S.adds.filter(a => a.alive && a.type === 'guardian' && a.target !== titan.i)) castS('provoc', { enemy: { kind: 'add', id: g.id } });
          if (B[0].target === titan.i) castS('provoc', { enemy: { kind: 'body', k: 0 } });
          // puis il les emmène loin du centre : l'aspiration ne le jette plus dans le cœur
          const d = Math.hypot(c.x, c.z) || 1, p = safe({ x: c.x / d * 10.5, z: c.z / d * 10.5 });
          at(0.6, () => act(() => { if (titan.alive) { mv(titan.i, p.x, p.z); home[titan.i] = p; } }));
        }, 0.5));
      }));
    }
    // Séisme dès qu'il est prêt : Gardien lâché par le Titan ou Fléau en cours à côté de lui
    if (titan && titan.alive && S.adds.some(a => a.alive && a.type === 'guardian' && dist(a.pos, titan.pos) <= 8.5 && (a.target !== titan.i || a.cast)) && !queue.some(q => q.sz)) {
      const ready = G.spellBar(S).find(b => b.id === 'seisme' && b.ready);
      if (ready) queue.push({ sz: 1, cost: 0.4, fn: () => castS('seisme', { sel: [titan.i] }) });
    }
    // adds
    for (const a of S.adds.filter(a => a.alive)) if (!seen.has(a.id)) {
      seen.add(a.id);
      at(P.react, () => act(() => {
        if (!a.alive) return;
        if (a.type === 'guardian') { if (!titan || !titan.alive) castS('provoc', { enemy: { kind: 'add', id: a.id } }); const g0 = S.adds.filter(q => q.alive && q.type === 'guardian')[0]; if (g0) G.order(S, { type: 'attack', idx: alive().filter(r => r.role === 'dps').map(r => r.i), target: { kind: 'add', id: g0.id } }); }
        else { const dps = alive().filter(r => r.role === 'dps' && (a.type === 'orb' ? r.range === 'ranged' : true)); G.order(S, { type: 'attack', idx: dps.map(r => r.i), target: { kind: 'add', id: a.id } }); castS('tir', { enemy: { kind: 'add', id: a.id } }); castS('tourelle', { ground: { x: a.pos.x * 0.7, z: a.pos.z * 0.7 } }); }
      }));
    }
    const gs = S.adds.filter(a => a.alive && a.type === 'guardian');
    if (gs.length) { const idle = alive().filter(r => r.role === 'dps' && !r.focus); if (idle.length && !queue.some(q => q.g)) queue.push({ g: 1, cost: P.apm, fn: () => G.order(S, { type: 'attack', idx: idle.map(r => r.i), target: { kind: 'add', id: gs[0].id } }) }); }
    const echoes = S.adds.filter(a => a.alive && a.type === 'echo');
    if (echoes.length) { const idle = alive().filter(r => r.role === 'dps' && !r.focus); if (idle.length && !queue.some(q => q.e)) queue.push({ e: 1, cost: P.apm, fn: () => G.order(S, { type: 'attack', idx: idle.map(r => r.i), target: { kind: 'add', id: echoes[0].id } }) }); }
    // soins de raid et défensifs (un tap chacun)
    const al = alive(), avg = al.reduce((s, r) => s + r.hp / r.maxHp, 0) / Math.max(1, al.length);
    const tap = (id, ctx) => { if (G.spellBar(S).find(b => b.id === id && b.ready) && !queue.some(q => q.sp === id)) queue.push({ sp: id, cost: 0.4, fn: () => castS(id, ctx) }); };
    if (avg < 0.6) tap('nuee');
    const h0 = al.find(r => r.role === 'heal');
    if (avg < 0.65 && h0) tap('dome', { ground: { x: h0.pos.x, z: h0.pos.z } });
    const low = al.filter(r => r.hp / r.maxHp < 0.6);
    if (low.length >= 3) tap('vague', { ground: { x: low[0].pos.x, z: low[0].pos.z } });
    if (!criDone && S.phase === S.B.phases.length - 1 && S.t - S.phaseStart > 4) { if (castS('cri').ok) criDone = true; }
    if (R.some(r => !r.alive && r.role !== 'dps')) tap('rez');
  };
}

if (require.main === module) for (const B of G.BOSSES) {
  if (ONLY && B.id !== ONLY) continue;
  const out = [];
  for (let s = 0; s < N; s++) {
    const raid = COMP.map(id => { const p = G.POOL.find(x => x.id === id); return { id, name: p.name, cls: p.cls, pow: 1 }; });
    const S = G.createFight({ bossId: B.id, diff, raid, seed: 1000 + s * 7 });
    const tick = bot(S, LEVEL); G.pull(S);
    let acc = 0;
    while (!S.over && S.t < 900) { G.step(S, 0.05); S.events.length = 0; acc += 0.05; if (acc >= 0.1) { acc = 0; tick(); } }
    out.push({ r: S.result, t: Math.round(S.endT), pct: Math.round(S.hp / S.maxHp * 100), deaths: S.deaths.filter(d => d.cause !== 'Enrage').length, phase: S.phase + 1, top: G.analyze(S).slice(0, 2).map(i => i.title).join(' | ') });
  }
  const kills = out.filter(o => o.r === 'kill');
  console.log(`${B.id.padEnd(9)} ${diff}/${LEVEL}: ${kills.length}/${N} kills, durée ${kills.length ? Math.round(kills.reduce((a, o) => a + o.t, 0) / kills.length) : '-'} s (enrage ${Math.round(B.enrage * G.DIFFS[diff].enrageMult)}), morts moy ${(out.reduce((a, o) => a + o.deaths, 0) / N).toFixed(1)}`);
  for (const o of out.slice(0, 2)) console.log('   ', o.r, o.t + 's', o.pct + '%', 'P' + o.phase, 'morts', o.deaths, '·', o.top);
}
module.exports = { bot };
