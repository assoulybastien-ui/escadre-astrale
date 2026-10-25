// Pilote automatique (joueur soigneur ou tank) + raid lead, pour équilibrer
const G = require('../src/engine.js');
const POOLD = G.POOL;

function defaultRaid(role, size) {
  const tanks = POOLD.filter(p => G.SPECS[p.spec].role === 'tank');
  const heals = POOLD.filter(p => G.SPECS[p.spec].role === 'heal');
  const dps = POOLD.filter(p => G.SPECS[p.spec].role === 'dps');
  const nT = role === 'tank' ? 1 : 2;
  const nH = (size === 20 ? 5 : 3) - (role === 'heal' ? 1 : 0);
  const nD = size - 1 - nT - nH;
  return [...tanks.slice(0, nT), ...heals.slice(0, nH), ...dps.slice(0, nD)].map(p => ({ id: p.id, name: p.name, spec: p.spec, r: p.r, pow: 1 }));
}

function makeFight(bossId, diff, kit, seed, pow = 0, talents = [], raid) {
  const role = G.KITS[kit].role;
  const size = G.DIFFS[diff].size;
  const r = (raid || defaultRaid(role, size)).map(x => Object.assign({}, x, { pow: 1 + pow }));
  return G.createFight({ bossId, diff, me: { name: 'Moi', kit, talents, pow: 1 + pow }, raid: r, seed });
}

function run(bossId, diff, kit, seed, skill = 1, react = 0.7, pow = 0, talents = [], raid, hook) {
  const S = makeFight(bossId, diff, kit, seed, pow, talents, raid);
  const rng = G.mulberry32(seed * 31 + 7);
  const dt = 0.1;
  const seen = new Set(), queue = [];
  const later = (key, delay, fn) => { if (seen.has(key)) return; seen.add(key); if (rng() > skill) return; queue.push({ at: S.t + delay + rng() * 0.3, fn }); };
  const P = S.player;
  const sp = id => S.kit.spells.find(s => s.id === id);
  const use = (id, target) => G.input(S, { type: 'spell', id, target });
  const ready = id => !G.canUse(S, sp(id));
  let decideAt = 0;
  while (!S.over) {
    G.step(S, dt);
    if (hook) hook(S);
    const me = S.raiders[S.me];
    for (const e of S.events) {
      if (e.type === 'cast' && S.bodies[e.body] && S.bodies[e.body].cast && S.bodies[e.body].cast.interruptible) {
        if (S.role === 'tank' && G.dist(me.pos, S.bodies[e.body].pos) < 12) later('pk' + S.t.toFixed(1), react + 0.3, () => use('kick'));
        else later('k' + S.t.toFixed(1), react + 0.3, () => G.call(S, 'kick'));
      }
      if (e.type === 'addCast') { const a = S.adds.find(x => x.id === e.id); if (S.role === 'tank' && a && a.target === S.me) later('pka' + S.t.toFixed(1), react + 0.3, () => use('kick')); else later('ka' + S.t.toFixed(1), react + 0.4, () => G.call(S, 'kick')); }
      if (e.type === 'adds' && e.kind !== 'guardian') later('f' + S.t.toFixed(1), react, () => { if (S.focus !== 'adds') G.call(S, 'focus'); });
      if (e.type === 'adds' && e.kind === 'guardian' && S.role === 'tank') later('g' + S.t.toFixed(1), react + 0.5, () => { const g = S.adds.filter(a => a.alive && a.type === 'guardian' && (S.raiders[a.target] || {}).role !== 'tank'); if (g.length) P.moveTo = { x: g[0].pos.x, z: g[0].pos.z + 2 }; });
      if (e.type === 'adds' && e.kind === 'guardian') later('gf' + S.t.toFixed(1), react + 1, () => { if (S.focus !== 'adds') G.call(S, 'focus'); });
      if (e.type === 'phase' && e.p === S.B.phases.length - 1) later('sur', 4, () => G.call(S, 'surcharge'));
      if (e.type === 'busterHit' && S.role === 'heal') { const r = S.raiders[e.i]; const st = Object.values(r.stacks)[0]; if (st && st.n >= 3) later('t' + S.t.toFixed(1), react, () => G.call(S, 'taunt')); }
    }
    S.events.length = 0;
    const tv = G.timersView(S);
    const marksSoon = tv.find(x => x.call === 'spread' && x.left < 4.5) || S.raiders.some(r => r.mark);
    const soak = S.zones.find(z => z.type === 'soak');
    let want = 'stack';
    if (marksSoon && !soak) want = 'spread';
    if (soak && (!S.raiders.some(r => r.mark) || soak.at < Math.min(...S.raiders.filter(r => r.mark).map(r => r.mark.at)))) want = 'stack';
    if (S.formation !== want) later('form' + want + Math.floor(S.t / 3), react * 0.6, () => G.call(S, want));
    if (S.focus === 'adds' && !S.adds.some(a => a.alive)) later('back' + Math.floor(S.t), react, () => G.call(S, 'focus'));
    if (me.alive) {
      const zone = S.zones.find(z => (z.type === 'puits' || z.type === 'core' || (z.type === 'pool' && S.role === 'heal')) && G.dist(me.pos, z) < z.r + 0.3);
      if (zone) later('mv' + zone.id + Math.floor(S.t / 2), react * 0.8, () => { const dx = me.pos.x - zone.x, dz = me.pos.z - zone.z, d = Math.hypot(dx, dz) || 1; P.moveTo = { x: zone.x + dx / d * (zone.r + 1.6), z: zone.z + dz / d * (zone.r + 1.6) }; });
      if (me.mark && S.role === 'heal') later('mk' + me.mark.at, react, () => { const A = G.anchor(S); const dx = me.pos.x - A.cx, dz = me.pos.z - A.cz, d = Math.hypot(dx, dz) || 1; P.moveTo = { x: A.cx + dx / d * 16, z: A.cz + dz / d * 16 }; });
      if (!me.mark && P.moveTo && S.role === 'heal' && !zone && !S.zones.some(z => (z.type === 'puits' || z.type === 'pool' || z.type === 'core') && G.dist(G.slotFor(S, me), z) < z.r + 0.5)) later('ret' + Math.floor(S.t / 4), react + 2, () => { if (!me.mark) P.moveTo = null; });
      for (const b of S.bodies) if (b.cast && b.cast.kind === 'frontal' && S.role === 'heal') later('fr' + b.cast.start, react, () => { P.moveTo = null; });
      if (S.B.twins && S.role === 'heal' && S.zones.some(z => z.type === 'beam') && G.segDist(me.pos, S.bodies[0].pos, S.bodies[1].pos) < 2.5) later('bm' + Math.floor(S.t), react, () => { P.moveTo = null; });
      if (soak && S.role === 'heal') later('sk' + soak.id, react, () => { P.moveTo = null; });
    }
    if (me.alive && S.t >= decideAt) {
      decideAt = S.t + 0.25 + (1 - skill) * 0.6;
      if (rng() < skill) (S.role === 'heal' ? healAI : tankAI)(S, use, ready, rng, skill);
    }
    for (let k = queue.length - 1; k >= 0; k--) if (S.t >= queue[k].at) queue.splice(k, 1)[0].fn();
  }
  return S;
}

function healAI(S, use, ready) {
  const P = S.player; if (P.cast || S.t < P.gcdUntil) return;
  const al = S.raiders.filter(r => r.alive);
  const pct = r => r.hp / r.maxHp;
  const low = al.slice().sort((a, b) => pct(a) - pct(b));
  const avg = al.reduce((s, r) => s + pct(r), 0) / al.length;
  const tanks = al.filter(r => r.role === 'tank' && S.bodies.some(b => b.target === r.i));
  const aube = S.kit.id === 'aube';
  const big = aube ? 'aurore' : 'nuee';
  if (avg < 0.6 && ready(big)) return use(big);
  const deb = al.find(r => r.debuffs.some(d => d.dispel && S.t - d.start > 1));
  const disp = aube ? 'purif' : 'purge';
  if (deb && ready(disp)) return use(disp, deb.i);
  if (aube) {
    const tk = tanks.find(t => !(t.absorb > 0 && S.t < t.absorbUntil));
    if (tk && ready('prisme')) return use('prisme', tk.i);
    const hurt = al.filter(r => pct(r) < 0.8);
    if (hurt.length >= 3 && ready('halo')) { const c = hurt.sort((a, b) => al.filter(x => G.dist(x.pos, b.pos) < 8 && pct(x) < 0.85).length - al.filter(x => G.dist(x.pos, a.pos) < 8 && pct(x) < 0.85).length)[0]; return use('halo', c.i); }
    if (pct(low[0]) < 0.45) return use(P.mana > 15 ? 'eclat' : 'lumiere', low[0].i);
    if (pct(low[0]) < 0.88) return use('lumiere', low[0].i);
  } else {
    const tk = tanks.find(t => !t.hots.some(h => h.src === S.me && h.kind === 'inj'));
    if (tk && ready('injection')) return use('injection', tk.i);
    const hurt = al.filter(r => pct(r) < 0.8);
    if (hurt.length >= 3 && ready('essaim')) return use('essaim', hurt[0].i);
    if (pct(low[0]) < 0.4) return use(P.mana > 15 ? 'suture' : 'greffe', low[0].i);
    const noHot = low.find(r => pct(r) < 0.9 && !r.hots.some(h => h.src === S.me && h.kind === 'inj'));
    if (noHot && ready('injection') && P.mana > 30) return use('injection', noHot.i);
    if (pct(low[0]) < 0.85) return use('greffe', low[0].i);
  }
}

function tankAI(S, use, ready) {
  const P = S.player, me = S.raiders[S.me], pct = me.hp / me.maxHp;
  const rem = S.kit.id === 'rempart';
  const mit = rem ? 'barriere' : 'pas', builder = rem ? 'frappe' : 'paume', big = rem ? 'acier' : 'souffle', shout = rem ? 'cri' : 'vague';
  const myBodies = S.bodies.filter(b => b.target === S.me);
  const buster = myBodies.find(b => b.cast && b.cast.kind === 'buster');
  const mitUp = S.t < (P.buffs[mit] || 0);
  if (buster && !mitUp && ready(mit)) use(mit);
  else if ((P.buffs[mit] || 0) - S.t < 2 && P.ferveur > 65 && myBodies.length && ready(mit)) use(mit);
  if (pct < 0.35 && ready(big)) use(big);
  if (!rem && pct < 0.55 && ready('souffle')) use('souffle');
  const loose = S.adds.filter(a => a.alive && a.type === 'guardian' && (S.raiders[a.target] || {}).role !== 'tank');
  if (loose.length) { if (loose.filter(a => G.dist(a.pos, me.pos) < 14).length && ready(shout)) use(shout); else if (ready('provoc')) use('provoc'); }
  const b0 = S.bodies[0];
  if (S.B.twins) {
    const st = Object.entries(me.stacks).find(([k]) => k.startsWith('b'));
    if (st && st[1].n >= 5 && ready('provoc')) use('provoc');
  } else if (!S.B.phases[S.phase].center) {
    const co = S.raiders.find(r => r.role === 'tank' && !r.isMe);
    const myStk = Object.values(me.stacks)[0];
    const coStk = co ? Object.values(co.stacks)[0] : null;
    if (b0.target !== S.me && coStk && coStk.n >= 3 && ready('provoc')) use('provoc');
    if (b0.target === S.me && myStk && myStk.n >= 3 && !S.tauntPending) G.call(S, 'taunt');
    if (b0.target !== S.me && co && !co.alive && ready('provoc')) use('provoc');
  }
  const tg = G.tankTarget(S);
  if (tg && G.dist(me.pos, tg.pos) < 6.5 && ready(builder)) use(builder);
  const pool = S.zones.find(z => z.type === 'pool' && myBodies.some(b => G.dist(b.pos, z) < z.r));
  if (pool && !P.moveTo) { const a = Math.atan2(me.pos.x, me.pos.z) + 0.9; const R = Math.max(6, Math.hypot(me.pos.x, me.pos.z)); P.moveTo = { x: Math.sin(a) * R, z: Math.cos(a) * R }; }
  else if (P.moveTo && G.dist(me.pos, P.moveTo) < 0.3 && !S.B.twins) P.moveTo = null;
  if (S.B.twins && myBodies.length === 1) {
    const mine = myBodies[0], other = S.bodies.find(b => b !== mine);
    const d = G.dist(mine.pos, other.pos);
    if (d < S.B.link.dist + 3) { const dx = me.pos.x - other.pos.x, dz = me.pos.z - other.pos.z, dd = Math.hypot(dx, dz) || 1; P.moveTo = { x: other.pos.x + dx / dd * (S.B.link.dist + 8), z: -2 }; }
  }
  if (!myBodies.length && !S.B.twins && !S.B.phases[S.phase].center) { if (G.dist(me.pos, b0.pos) > 5) P.moveTo = { x: b0.pos.x + 2, z: b0.pos.z - 3.5 }; }
  if (S.B.phases[S.phase].center) { const g = S.adds.find(a => a.alive && a.target === S.me); if (g && G.dist(g.pos, me.pos) > 4) P.moveTo = { x: g.pos.x, z: g.pos.z }; }
}

function summary(boss, diff, kit, skill, react, n = 20, pow = 0, talents = []) {
  let kills = 0; const tk = [], wipes = []; const causes = {}; let deaths = 0, meDeaths = 0;
  for (let s = 1; s <= n; s++) {
    const S = run(boss, diff, kit, s * 17, skill, react, pow, talents);
    if (S.result === 'kill') { kills++; tk.push(S.endT); } else wipes.push(G.fmtT(S.endT) + ' P' + (S.phase + 1) + ' ' + Math.round(S.hp / S.maxHp * 100) + '%');
    deaths += S.deaths.length; meDeaths += S.deaths.filter(d => d.me).length;
    for (const d of S.deaths) { const k = d.cause.replace(/ de .*$/, '').replace(/ \(.*\)$/, ''); causes[k] = (causes[k] || 0) + 1; }
  }
  const avg = a => a.length ? G.fmtT(a.reduce((x, y) => x + y, 0) / a.length) : '-';
  const top = Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => k + ':' + v).join(' | ');
  console.log(`${boss.padEnd(8)} ${diff.padEnd(8)} ${kit.padEnd(11)} s=${skill} pow+${pow} → ${String(kills).padStart(2)}/${n} kill ${avg(tk)}  morts ${(deaths / n).toFixed(1)} (moi ${(meDeaths / n).toFixed(1)})  ${top}  | ${wipes.slice(0, 3).join(' ; ')}`);
}
module.exports = { run, summary, makeFight, defaultRaid };
if (require.main === module) {
  const [boss = 'vorr', diff = 'normal', n = '12'] = process.argv.slice(2);
  for (const kit of ['aube', 'nanochir', 'rempart', 'gardienflux']) { summary(boss, diff, kit, 1, 0.7, +n); summary(boss, diff, kit, 0.75, 1.0, +n); }
}
