// ============================================================
//  ESCADRE ASTRALE — moteur de combat (pur, sans DOM)
//  v5 : le raid lead est invisible et commande les 10 persos.
// ============================================================
const GAME = (() => {
  const DD = (typeof DATA !== 'undefined') ? DATA : require('./data.js');
  const { CLASSES, CLASS_ORDER, SPELLS, POOL, BOSSES, DIFFS, LOOT } = DD;

  // ---------- utilitaires ----------
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtT = s => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const ARENA = 19.5;
  const inArena = (p, R = ARENA) => { const d = Math.hypot(p.x, p.z); if (d > R) { p.x *= R / d; p.z *= R / d; } return p; };
  const LAVA_DPS = 14000;   // hors de l'arène effondrée
  const HEAL_RANGE = 16, RANGED_RANGE = 36, SPEED = 6.5, LEASH = 10;
  const CALL_FOR_KIND = { buster: 'taunt', raidcast: 'heal', frontal: 'pos', dots: 'dispel', pool: 'tank', zones: 'move', beam: 'pos', marks: 'spread', soak: 'stack', adds: 'focus', pulse: 'move', eclipse: 'cd', meleeStack: 'taunt', fissures: 'move', half: 'move' };

  // ---------- résolution d'un boss pour une difficulté ----------
  function resolveBoss(B, dk) {
    const sfx = dk === 'heroique' ? 'h' : dk === 'mythique' ? 'm' : null;
    const raws = {};
    const phases = B.phases.map(ph => {
      const abilities = {};
      for (const id in ph.abilities) {
        const a = ph.abilities[id];
        const raw = a.inherit ? Object.assign({}, raws[id] || {}, a) : Object.assign({}, a);
        delete raw.inherit;
        raws[id] = raw;
        if (raw.only && !raw.only.includes(dk[0])) continue;
        const fin = Object.assign({}, raw, (sfx && raw[sfx]) || {});
        delete fin.h; delete fin.m; delete fin.only;
        abilities[id] = fin;
      }
      // une phase peut aussi avoir ses surcharges h / m (ex. montée de l'aura)
      const fin = Object.assign({}, ph, (sfx && ph[sfx]) || {}, { abilities });
      delete fin.h; delete fin.m;
      return fin;
    });
    let link = null;
    if (B.link) link = Object.assign({}, B.link, (sfx && B.link[sfx]) || {});
    return Object.assign({}, B, { phases, link });
  }

  // ---------- création ----------
  // opts : { bossId, diff, raid:[{id,name,cls,pow}], seed, placement:[{x,z}]|null }
  function createFight(opts) {
    const D = DIFFS[opts.diff];
    const B = resolveBoss(BOSSES.find(b => b.id === opts.bossId), opts.diff);
    const rng = mulberry32(opts.seed || 1);
    const roleOrder = { tank: 0, heal: 1, dps: 2 };
    const defs = opts.raid.slice().sort((a, b) => roleOrder[CLASSES[a.cls].role] - roleOrder[CLASSES[b.cls].role] || CLASS_ORDER.indexOf(a.cls) - CLASS_ORDER.indexOf(b.cls));
    const raiders = defs.map((d, i) => {
      const C = CLASSES[d.cls];
      const maxHp = Math.round(C.hp * (d.pow || 1));
      return {
        i, id: d.id, name: d.name, cls: d.cls, role: C.role, range: C.range, pow: d.pow || 1, maxHp, hp: maxHp, alive: true,
        vcls: C.look.style, vspec: C.look.spec, isMe: false,
        pos: { x: 0, z: 9 }, anchor: { x: 0, z: 9 }, orders: [], focus: null, moving: false, inReach: false,
        healMode: 'raid', healFix: -1, healTarget: -1, atkTarget: 'boss',
        stacks: {}, debuffs: [], absorb: 0, absorbUntil: 0, hots: [], mit: [], mark: null, whirlUntil: 0,
        cds: {}, lastHits: [],
        stats: { dmg: 0, heal: 0, overheal: 0, taken: 0, avoid: 0, deaths: 0, absorbed: 0, oor: 0, moved: 0 },
      };
    });
    const healers = raiders.filter(r => r.role === 'heal');
    if (healers[0]) healers[0].healMode = 'tanks';
    const tanks = raiders.filter(r => r.role === 'tank');
    const bodies = B.twins
      ? [{ id: 'b0', name: 'Séla', pos: { x: -11.5, z: -2 }, target: tanks[0] ? tanks[0].i : 0, cast: null, facing: 0, empower: 0, poolT: 0 },
         { id: 'b1', name: 'Néria', pos: { x: 11.5, z: -2 }, target: tanks[1] ? tanks[1].i : (tanks[0] ? tanks[0].i : 0), cast: null, facing: 0, empower: 0, poolT: 0 }]
      : [{ id: 'b0', name: B.name, pos: { x: 0, z: 0 }, target: tanks[0] ? tanks[0].i : 0, cast: null, facing: Math.PI, empower: 0, poolT: 0 }];
    const S = {
      D, B, rng, t: 0, started: false, phase: 0, phaseStart: 0, over: false, result: null, endT: 0, size: raiders.length,
      hp: B.hp * D.hpMult, maxHp: B.hp * D.hpMult, invulnUntil: 0, enrage: Math.round(B.enrage * D.enrageMult),
      arenaR: ARENA, lavaAt: 0,   // rayon jouable (l'Effondrement le réduit) ; la lave brûle au-delà à partir de lavaAt
      bodies, raiders, me: -1,
      adds: [], zones: [], pending: [], turrets: [], domes: [],
      timers: {}, buffs: { criUntil: 0, eclipseUntil: 0, chantDotUntil: 0, chantDot: 0 },
      link: { active: false, closeT: 0 },
      events: [], log: [], deaths: [], spellUse: {},
      mech: {}, phaseTimes: {},
    };
    const place = opts.placement && opts.placement.length === raiders.length ? opts.placement : defaultPlacement(S);
    raiders.forEach((r, k) => { const p = inArena({ x: place[k].x, z: place[k].z }); r.pos = { x: p.x, z: p.z }; r.anchor = { x: p.x, z: p.z }; });
    bodies.forEach(b => { const t = raiders[b.target]; if (t) b.facing = Math.atan2(t.pos.x - b.pos.x, t.pos.z - b.pos.z); });
    enterPhase(S, 0);
    return S;
  }

  // placement de départ conseillé : tanks devant, mêlée derrière le boss, soigneurs à portée de tout le monde, distance au fond
  function defaultPlacement(S) {
    const out = [], R = S.raiders;
    const by = role => R.filter(r => r.role === role);
    const arc = (n, cx, cz, rad, a0, a1) => Array.from({ length: n }, (_, k) => { const a = n > 1 ? a0 + (a1 - a0) * k / (n - 1) : (a0 + a1) / 2; return { x: cx + Math.sin(a) * rad, z: cz + Math.cos(a) * rad }; });
    const D2R = Math.PI / 180;
    if (S.B.twins) {
      const t = by('tank'), h = by('heal'), dps = by('dps');
      const mel = dps.filter(r => r.range === 'melee'), rng = dps.filter(r => r.range === 'ranged');
      t.forEach((r, k) => { out[r.i] = { x: k % 2 ? 15.5 : -15.5, z: -2 }; });
      const hp = [{ x: -6.5, z: 5 }, { x: 6.5, z: 5 }, { x: 0, z: 7.5 }, { x: -3, z: 9 }, { x: 3, z: 9 }];
      h.forEach((r, k) => { out[r.i] = hp[k % hp.length]; });
      mel.forEach((r, k) => { out[r.i] = { x: (k % 2 ? 10.5 : -10.5) + (k > 1 ? (k % 2 ? 1.6 : -1.6) : 0), z: 2.6 + Math.floor(k / 2) * 0.8 }; });
      arc(rng.length, 0, -2, 12, -38 * D2R, 38 * D2R).forEach((p, k) => { out[rng[k].i] = p; });
    } else {
      const t = by('tank'), h = by('heal'), dps = by('dps');
      const mel = dps.filter(r => r.range === 'melee'), rng = dps.filter(r => r.range === 'ranged');
      t.forEach((r, k) => { out[r.i] = k === 0 ? { x: 0, z: -6.2 } : { x: 2.6 + (k - 1) * 1.4, z: -6.8 }; });
      arc(mel.length, 0, 0, 5, -42 * D2R, 42 * D2R).forEach((p, k) => { out[mel[k].i] = p; });
      arc(h.length, 0, 0, 8.5, -55 * D2R, 55 * D2R).forEach((p, k) => { out[h[k].i] = p; });
      arc(rng.length, 0, 0, 12.5, -35 * D2R, 35 * D2R).forEach((p, k) => { out[rng[k].i] = p; });
    }
    return R.map(r => out[r.i] || { x: 0, z: 9 });
  }

  const M = (S, id) => (S.mech[id] ||= { casts: 0, hits: 0, fails: 0, dmg: 0, ok: 0, extra: [] });
  function log(S, text, kind) { S.log.push({ t: S.t, text, kind: kind || 'info' }); }
  function alert(S, text, level, call) { S.events.push({ type: 'alert', text, level: level || 'warn', call }); }
  function ab(S, id) { return S.B.phases[S.phase].abilities[id]; }
  function phaseMult(S) { return S.B.phases[S.phase].dmgMult || 1; }
  const mainBody = S => S.bodies[0];
  const alive = S => S.raiders.filter(r => r.alive);
  function raidCenter(S) { const a = alive(S); if (!a.length) return { x: 0, z: 0 }; return { x: a.reduce((s, r) => s + r.pos.x, 0) / a.length, z: a.reduce((s, r) => s + r.pos.z, 0) / a.length }; }
  const bodyRad = S => S.B.rad || 3.4;
  const nearestBody = (S, p) => S.bodies.reduce((a, b) => dist(a.pos, p) <= dist(b.pos, p) ? a : b);
  const tankingBodies = (S, r) => S.bodies.filter(b => b.target === r.i);
  const isTanking = (S, r) => S.bodies.some(b => b.target === r.i) || S.adds.some(a => a.alive && a.type === 'guardian' && a.target === r.i);

  // ---------- phases ----------
  function enterPhase(S, p) {
    S.phase = p; S.phaseStart = S.t; S.phaseTimes[p] = S.t;
    const ph = S.B.phases[p];
    const inv = ph.invuln || 0;
    S.invulnUntil = S.t + inv;
    for (const b of S.bodies) b.cast = null;
    S.timers = {};
    for (const id in ph.abilities) {
      const a = ph.abilities[id];
      if (a.kind === 'meleeStack') continue;
      S.timers[id] = { next: S.t + inv + (a.first || 0), every: a.every };
    }
    if (p > 0) {
      S.events.push({ type: 'phase', p });
      log(S, 'Phase ' + (p + 1) + ' : ' + ph.name + '.', 'phase');
      alert(S, 'PHASE ' + (p + 1) + ' — ' + ph.name.toUpperCase(), 'phase');
    }
    S.bodies[0].centerMove = !!ph.center;
    if (ph.collapse) {
      // le bord de l'arène s'écroule : quelques secondes pour rentrer, puis la lave brûle au-delà
      const delay = ph.collapseDelay || 4;
      S.arenaR = ph.collapse; S.lavaAt = S.t + delay;
      S.events.push({ type: 'collapse', r: ph.collapse, delay });
      alert(S, 'EFFONDREMENT — ramène tout le monde à moins de ' + String(ph.collapse).replace('.', ',') + ' m du centre', 'danger', 'move');
      log(S, 'Le bord de l’arène s’effondre dans la lave.', 'bad');
    }
    if (p > 0) {
      const echoes = S.adds.filter(a => a.alive && a.type === 'echo');
      if (echoes.length) {
        for (const a of echoes) { a.alive = false; S.events.push({ type: 'addExplode', x: a.pos.x, z: a.pos.z }); }
        for (const r of S.raiders) if (r.alive) dmg(S, r, 9000 * echoes.length, 'Rupture des Échos', { avoidable: true, mech: true });
        M(S, 'echos').fails += echoes.length;
        log(S, echoes.length + ' Écho(s) ont explosé.', 'bad');
      }
    }
  }

  // ---------- dégâts & soins ----------
  function inDome(S, p) { return S.domes.find(d => S.t < d.until && dist(p, d) < d.r); }
  function dmg(S, r, amount, cause, o = {}) {
    if (!r.alive || amount <= 0) return 0;
    let a = amount * S.D.dmgMult;
    if (r.role === 'tank' && o.phys) a *= 0.75;
    for (const m of r.mit) if (S.t < m.until) a *= 1 - m.dr;
    const dm = inDome(S, r.pos); if (dm) a *= 1 - dm.dr;
    if (r.absorb > 0 && S.t < r.absorbUntil) {
      const ab = Math.min(r.absorb, a); r.absorb -= ab; a -= ab;
      if (r.absorbSrc != null && S.raiders[r.absorbSrc]) S.raiders[r.absorbSrc].stats.heal += ab;
      r.stats.absorbed += ab;
    }
    if (a <= 0) return 0;
    r.hp -= a; r.stats.taken += a; if (o.avoidable) r.stats.avoid += a;
    r.lastHits.push({ t: S.t, cause, amount: a }); if (r.lastHits.length > 5) r.lastHits.shift();
    if (r.hp <= 0) kill(S, r, cause);
    return a;
  }
  function kill(S, r, cause) {
    r.hp = 0; r.alive = false; r.stats.deaths++;
    r.mark = null; r.moving = false; r.debuffs = []; r.hots = []; r.absorb = 0; r.orders = []; r.focus = null; r.mit = []; r.whirlUntil = 0;
    S.deaths.push({ t: S.t, i: r.i, name: r.name, cause, phase: S.phase, role: r.role, cls: r.cls });
    S.events.push({ type: 'death', i: r.i });
    log(S, r.name + ' meurt (' + cause + ').', 'death');
    for (const b of S.bodies) if (b.target === r.i) retarget(S, b, r);
    for (const a of S.adds) if (a.alive && a.target === r.i) { a.target = pickRandom(S, x => x.alive && x.role === 'heal') ?? pickRandom(S, x => x.alive); a.tanked = false; }
    for (const h of S.raiders) if (h.healFix === r.i) { h.healFix = -1; if (h.healMode === 'cible') h.healMode = 'raid'; }
  }
  function retarget(S, b, dead) {
    const others = S.raiders.filter(o => o.alive && o.role === 'tank' && o !== dead);
    if (others.length) { others.sort((x, y) => dist(x.pos, b.pos) - dist(y.pos, b.pos)); b.target = others[0].i; S.events.push({ type: 'taunt', i: b.target }); }
    else { const any = S.raiders.filter(o => o.alive && o !== dead); if (any.length) { any.sort((x, y) => dist(x.pos, b.pos) - dist(y.pos, b.pos)); b.target = any[0].i; alert(S, 'Plus aucun tank !', 'danger'); } }
  }
  function pickRandom(S, f) { const a = S.raiders.filter(f); return a.length ? a[Math.floor(S.rng() * a.length)].i : null; }
  function healMult(S) { return S.t < S.buffs.eclipseUntil ? 0.5 : 1; }
  function heal(S, src, r, amount) {
    if (!r.alive || amount <= 0) return 0;
    const eff = Math.min(amount, r.maxHp - r.hp);
    r.hp += eff; src.stats.heal += eff; src.stats.overheal += amount - eff;
    return eff;
  }
  function addHot(S, src, t, hps, dur, kind) {
    if (!t || !t.alive) return;
    const ex = t.hots.find(h => h.kind === kind);
    if (ex) { ex.until = S.t + dur; ex.hps = Math.max(ex.hps, hps); ex.src = src.i; return; }
    t.hots.push({ src: src.i, hps, until: S.t + dur, kind });
  }
  function dmgMultRaid(S) { return S.t < S.buffs.criUntil ? SPELLS.cri.mult : 1; }

  // ---------- capacités du boss ----------
  function bodyFor(S, a) { return S.bodies[a.body > 0 ? a.body : 0] || S.bodies[0]; }
  function fire(S, id) {
    const a = ab(S, id); if (!a) return;
    const aliveNT = S.raiders.filter(r => r.alive && r.role !== 'tank');
    const pick = (arr, n) => { const c = arr.slice(), out = []; while (c.length && out.length < n) out.push(c.splice(Math.floor(S.rng() * c.length), 1)[0]); return out; };
    const m = M(S, id); m.casts++;
    switch (a.kind) {
      case 'buster': case 'raidcast': case 'frontal': {
        const b = bodyFor(S, a);
        const tgt = S.raiders[b.target];
        let facing = b.facing;
        if (tgt) facing = Math.atan2(tgt.pos.x - b.pos.x, tgt.pos.z - b.pos.z);
        b.cast = { id, kind: a.kind, name: a.name, start: S.t, end: S.t + a.cast, interruptible: !!a.interruptible, facing };
        S.events.push({ type: 'cast', id, kind: a.kind, body: S.bodies.indexOf(b), dur: a.cast, facing, range: a.range, angle: a.angle, x: b.pos.x, z: b.pos.z });
        if (a.kind === 'raidcast' && a.interruptible) alert(S, a.name.toUpperCase() + ' — Interruption !', 'warn', 'kick');
        else if (a.kind === 'raidcast') alert(S, a.name.toUpperCase() + ' — dégâts de raid', 'warn', 'heal');
        else if (a.kind === 'frontal') alert(S, a.name.toUpperCase() + ' — personne devant', 'warn', 'pos');
        else if (a.kind === 'buster' && tgt) {
          const st = tgt.stacks[a.stack]; const n = st ? st.n : 0;
          if (n >= 2) alert(S, a.name.toUpperCase() + ' sur ' + tgt.name + ' (' + n + ' cumuls)', n >= 3 ? 'danger' : 'warn', 'taunt');
        }
        break;
      }
      case 'dots': {
        const ts = pick(S.raiders.filter(r => r.alive && !r.debuffs.length), a.count);
        for (const r of ts) r.debuffs.push({ id, name: a.name, dps: a.dps, start: S.t, until: S.t + a.dur, dispel: true, explode: a.explode || null });
        S.events.push({ type: 'dots', idx: ts.map(r => r.i) });
        alert(S, a.name.toUpperCase() + ' sur ' + ts.map(r => r.name).join(', ') + ' — Purge', 'warn', 'dispel');
        break;
      }
      case 'pool': {
        const b = mainBody(S);
        S.zones.push({ type: 'pool', id: 'pl' + Math.floor(S.t * 100), x: b.pos.x, z: b.pos.z, r: a.r, born: S.t, endAt: S.t + a.dur, abId: id });
        S.events.push({ type: 'pool' });
        alert(S, a.name.toUpperCase() + ' — déplace le tank', 'warn', 'tank');
        break;
      }
      case 'zones': {
        const ts = pick(aliveNT, a.count);
        const nz = ts.map(r => ({ type: 'puits', id: 'p' + Math.floor(S.t * 100) + '_' + r.i, x: r.pos.x + (S.rng() - 0.5) * 0.8, z: r.pos.z + (S.rng() - 0.5) * 0.8, r: a.r, born: S.t, armAt: S.t + a.arm, endAt: S.t + a.arm + a.dur, dps: a.dps, abId: id }));
        S.zones.push(...nz);
        S.events.push({ type: 'zones' });
        alert(S, a.name.toUpperCase() + ' — sors-les des cercles', 'warn', 'move');
        break;
      }
      case 'marks': {
        const ts = pick(aliveNT, a.count);
        const at = S.t + a.time;
        for (const r of ts) r.mark = { at, start: S.t, r: a.r };
        S.pending.push({ at, fn: () => explodeMarks(S, ts, a, id) });
        S.events.push({ type: 'marks', idx: ts.map(r => r.i), at });
        alert(S, a.name.toUpperCase() + ' sur ' + ts.map(r => r.name).join(', ') + ' — écarte-les', 'warn', 'spread');
        break;
      }
      case 'soak': {
        const b = mainBody(S); const tk = S.raiders[b.target];
        let dx = 0, dz = 1;
        if (tk) { dx = b.pos.x - tk.pos.x; dz = b.pos.z - tk.pos.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d; }
        const c = inArena({ x: b.pos.x + dx * 7, z: b.pos.z + dz * 7 });
        const z = { type: 'soak', id: 's' + Math.floor(S.t * 100), x: c.x, z: c.z, r: a.r, born: S.t, at: S.t + a.time, abId: id, dmg: a.dmg, need: a.need || 4 };
        S.zones.push(z);
        S.pending.push({ at: z.at, fn: () => resolveSoak(S, z, id) });
        S.events.push({ type: 'soak', id: z.id });
        alert(S, a.name.toUpperCase() + ' — ' + z.need + ' persos dans le cercle', 'warn', 'stack');
        break;
      }
      case 'adds': spawnAdds(S, a, id); break;
      case 'beam': {
        S.zones.push({ type: 'beam', id: 'bm' + Math.floor(S.t * 100), born: S.t, armAt: S.t + a.warn, endAt: S.t + a.warn + a.dur, dps: a.dps, width: a.width, abId: id, x: 0, z: 0, r: 0 });
        S.events.push({ type: 'beam' });
        alert(S, a.name.toUpperCase() + ' — personne entre elles', 'warn', 'pos');
        break;
      }
      case 'pulse': {
        const b = mainBody(S);
        S.events.push({ type: 'pulse', x: b.pos.x, z: b.pos.z });
        for (const r of S.raiders) {
          if (!r.alive) continue;
          const dx = b.pos.x - r.pos.x, dz = b.pos.z - r.pos.z, d = Math.hypot(dx, dz);
          if (d < 0.2) continue;
          const k = Math.min(a.pull, d - 0.5) / d;
          r.pos.x += dx * k; r.pos.z += dz * k;
          r.anchor = { x: r.pos.x, z: r.pos.z };   // ils restent où l'aspiration les a laissés
        }
        S.zones = S.zones.filter(z => z.type !== 'core');
        S.zones.push({ type: 'core', id: 'core', x: b.pos.x, z: b.pos.z, r: a.r, born: S.t, endAt: S.t + 999, dps: a.dps, abId: id });
        alert(S, 'SINGULARITÉ — ressors les persos aspirés', 'warn', 'move');
        break;
      }
      case 'fissures': {
        // des lignes partent du boss vers plusieurs persos, puis entrent en éruption
        const b = mainBody(S), ts = pick(aliveNT, a.count), r0 = bodyRad(S), len = a.len || 24;
        for (const r of ts) {
          let dx = r.pos.x - b.pos.x, dz = r.pos.z - b.pos.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
          S.zones.push({ type: 'fissure', id: 'f' + Math.floor(S.t * 100) + '_' + r.i, x: b.pos.x + dx * r0, z: b.pos.z + dz * r0, x2: b.pos.x + dx * (r0 + len), z2: b.pos.z + dz * (r0 + len), w: a.width, r: 0, born: S.t, armAt: S.t + a.arm, endAt: S.t + a.arm + a.dur, dps: a.dps, abId: id });
        }
        S.events.push({ type: 'fissures', body: 0, arm: a.arm });
        alert(S, a.name.toUpperCase() + ' — sors des lignes', 'warn', 'move');
        break;
      }
      case 'half': {
        // une moitié de l'arène s'embrase (Séla, x < 0) ou gèle (Néria, x > 0) ; les côtés alternent
        const side = S.halfNext || (S.rng() < 0.5 ? -1 : 1); S.halfNext = -side;
        S.zones.push({ type: 'half', id: 'h' + Math.floor(S.t * 100), side, x: 0, z: 0, r: 0, born: S.t, armAt: S.t + a.warn, endAt: S.t + a.warn + a.dur, dps: a.dps, abId: id });
        S.events.push({ type: 'half', side, warn: a.warn, dur: a.dur, body: side < 0 ? 0 : 1 });
        alert(S, a.name.toUpperCase() + ' — ' + (side < 0 ? 'le côté de Séla s’embrase' : 'le côté de Néria gèle') + ' : change de côté', 'warn', 'move');
        break;
      }
      case 'eclipse': {
        S.buffs.eclipseUntil = S.t + a.dur; S.buffs.eclipseDps = a.dps;
        S.events.push({ type: 'eclipse' });
        alert(S, a.name.toUpperCase() + ' — soins réduits de moitié', 'danger', 'cd');
        break;
      }
    }
  }
  function inCone(b, facing, p, a) {
    const dx = p.x - b.pos.x, dz = p.z - b.pos.z, d = Math.hypot(dx, dz);
    if (d > a.range) return false;
    let ang = Math.atan2(dx, dz) - facing; while (ang > Math.PI) ang -= Math.PI * 2; while (ang < -Math.PI) ang += Math.PI * 2;
    return Math.abs(ang) < a.angle * Math.PI / 180 || d < 2.2;
  }
  function explodeMarks(S, ts, a, id) {
    const m = M(S, id);
    for (const mk of ts) {
      if (!mk.mark) continue;
      const c = { x: mk.pos.x, z: mk.pos.z };
      S.events.push({ type: 'markExplode', x: c.x, z: c.z, r: a.r });
      for (const o of S.raiders) {
        if (!o.alive) continue;
        if (o === mk) { dmg(S, o, a.dmg * 0.4, a.name, { mech: true }); continue; }
        if (dist(o.pos, c) < a.r) { m.hits++; m.dmg += dmg(S, o, a.dmg, 'Explosion de la marque de ' + mk.name, { avoidable: true, mech: true }); }
      }
      mk.mark = null;
    }
  }
  function resolveSoak(S, z, id) {
    const m = M(S, id);
    S.zones = S.zones.filter(q => q !== z);
    const inside = S.raiders.filter(r => r.alive && r.role !== 'tank' && dist(r.pos, z) < z.r);
    m.extra.push(inside.length);
    S.events.push({ type: 'soakHit', x: z.x, z: z.z, r: z.r, n: inside.length });
    if (inside.length) {
      const each = z.dmg / inside.length;
      for (const r of inside) dmg(S, r, each, inside.length < z.need ? 'Convergence (trop peu de persos)' : 'Convergence', { avoidable: inside.length < z.need, mech: true });
      if (inside.length < z.need) m.fails++; else m.ok++;
    } else {
      m.fails++;
      for (const r of S.raiders) if (r.alive) dmg(S, r, z.dmg / 5, 'Convergence non partagée', { avoidable: true, mech: true });
    }
  }
  function spawnAdds(S, a, id) {
    const n = a.count, b = mainBody(S);
    for (let k = 0; k < n; k++) {
      const hp = Math.round(a.hp * (S.D.addMult || 1));
      const add = { id: 'a' + S.adds.length, type: a.type, name: a.type === 'echo' ? 'Écho' : a.type === 'orb' ? 'Orbe' : 'Gardien', hp, maxHp: hp, alive: true, abId: id, cast: null, stunUntil: 0, nextShard: S.t + 2 + S.rng() * 2, rad: a.type === 'guardian' ? 1.6 : 1 };
      if (a.type === 'echo') { const an = Math.PI + (k - (n - 1) / 2) * 0.42; add.pos = { x: b.pos.x + Math.sin(an) * 9.6, z: b.pos.z - Math.cos(an) * 9.6 }; inArena(add.pos); }
      else if (a.type === 'orb') { const C = raidCenter(S); const base = Math.atan2(C.x, C.z) + Math.PI; const an = base + (S.rng() - 0.5) * 1.8; add.pos = inArena({ x: Math.sin(an) * 19.5, z: Math.cos(an) * 19.5 }); add.explode = a.explode; add.speed = 0.8 + (S.D.key === 'heroique' ? 0.1 : S.D.key === 'mythique' ? 0.2 : 0); }
      else { add.pos = inArena({ x: (k % 2 ? 1 : -1) * 6, z: -3 + k * 2 }); add.melee = a.melee; add.nextCast = S.t + 8 + k * 4; add.target = pickRandom(S, x => x.alive && x.role === 'heal') ?? pickRandom(S, x => x.alive); add.tanked = false; }
      S.adds.push(add);
    }
    S.events.push({ type: 'adds', kind: a.type });
    alert(S, n + ' ' + a.name.toUpperCase() + (a.type === 'guardian' ? ' — Provocation ou Séisme' : ' — ordre d’attaque'), 'warn', a.type === 'guardian' ? 'tank' : 'focus');
  }

  // ---------- ordres du raid lead ----------
  const MSG = (ok, text, code) => ({ ok, text, code });
  // positions en tournesol autour d'un point, puis chaque place va au perso le plus proche
  function packSlots(n, x, z, gap) {
    const g = 2.399963, out = [];
    for (let k = 0; k < n; k++) { const rr = n === 1 ? 0 : gap * 0.62 * Math.sqrt(k + 0.5); out.push(inArena({ x: x + Math.cos(k * g) * rr, z: z + Math.sin(k * g) * rr })); }
    return out;
  }
  function lastPoint(r) { return r.orders.length ? r.orders[r.orders.length - 1] : r.pos; }
  function order(S, cmd) {
    if (S.over) return MSG(false, '');
    const rs = (cmd.idx || []).map(i => S.raiders[i]).filter(r => r && r.alive);
    if (!rs.length) return MSG(false, '');
    if (cmd.type === 'move') {
      const assign = new Map();
      if (cmd.pack || rs.length === 1) {
        // serré : tournesol autour du point, chaque place au perso le plus proche
        const slots = packSlots(rs.length, cmd.x, cmd.z, 1.2);
        const free = rs.slice();
        for (const s of slots) { free.sort((a, b) => dist(lastPoint(a), s) - dist(lastPoint(b), s)); assign.set(free.shift(), s); }
      } else {
        // en formation : le groupe glisse vers le point en gardant sa forme, resserrée au-delà de 4 m de rayon
        const pts = rs.map(lastPoint);
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
        const maxR = Math.max(0.01, ...pts.map(p => Math.hypot(p.x - cx, p.z - cz)));
        const k = maxR > 4 ? 4 / maxR : 1;
        rs.forEach((r, j) => assign.set(r, inArena({ x: cmd.x + (pts[j].x - cx) * k, z: cmd.z + (pts[j].z - cz) * k })));
      }
      for (const [r, s] of assign) inArena(s, S.arenaR - 0.4);
      for (const [r, s] of assign) {
        if (!S.started) { r.pos = { x: s.x, z: s.z }; r.anchor = { x: s.x, z: s.z }; r.orders = []; continue; }
        if (cmd.queue) r.orders.push({ x: s.x, z: s.z }); else { r.orders = [{ x: s.x, z: s.z }]; r.focus = null; }
      }
      S.events.push({ type: 'order', kind: 'move', idx: rs.map(r => r.i), x: cmd.x, z: cmd.z });
      return MSG(true, '');
    }
    if (cmd.type === 'attack') {
      const tg = enemyRef(S, cmd.target); if (!tg) return MSG(false, 'Cible invalide');
      for (const r of rs) { r.focus = Object.assign({}, cmd.target); r.orders = []; }
      S.events.push({ type: 'order', kind: 'attack', idx: rs.map(r => r.i), x: tg.pos.x, z: tg.pos.z });
      return MSG(true, rs.length > 1 ? rs.length + ' persos sur ' + tg.name : rs[0].name + ' sur ' + tg.name);
    }
    if (cmd.type === 'stop') { for (const r of rs) { r.orders = []; r.focus = null; r.anchor = { x: r.pos.x, z: r.pos.z }; } return MSG(true, ''); }
    return MSG(false, '');
  }
  function setHealMode(S, i, mode, fix) {
    const h = S.raiders[i]; if (!h || h.role !== 'heal') return MSG(false, '');
    h.healMode = mode; h.healFix = mode === 'cible' ? fix : -1;
    return MSG(true, h.name + ' : ' + (mode === 'tanks' ? 'soigne les tanks d’abord' : mode === 'raid' ? 'soigne le plus blessé' : 'soigne ' + S.raiders[fix].name));
  }
  function pull(S) { if (S.started) return; S.started = true; log(S, 'Pull !', 'phase'); S.events.push({ type: 'pull' }); }

  // référence d'ennemi : { kind:'body', k } | { kind:'add', id }
  function enemyRef(S, ref) {
    if (!ref) return null;
    if (ref.kind === 'body') { const b = S.bodies[ref.k]; return b ? { pos: b.pos, rad: bodyRad(S), name: b.name, body: b, k: ref.k } : null; }
    const a = S.adds.find(x => x.id === ref.id && x.alive); return a ? { pos: a.pos, rad: a.rad, name: a.name, add: a } : null;
  }

  // ---------- sorts de la barre ----------
  function barIds(S) {
    const out = [];
    const present = new Set(S.raiders.map(r => r.cls));
    for (const c of CLASS_ORDER) if (present.has(c)) for (const id of CLASSES[c].spells) if (!out.includes(id)) out.push(id);
    return out;
  }
  function carriers(S, id) { const sp = SPELLS[id]; return S.raiders.filter(r => sp.classes.includes(r.cls)); }
  function spellBar(S) {
    return barIds(S).map(id => {
      const sp = SPELLS[id], all = carriers(S, id), live = all.filter(r => r.alive);
      const ready = live.filter(r => (r.cds[id] || 0) <= S.t);
      const next = live.length ? Math.min(...live.map(r => Math.max(0, (r.cds[id] || 0) - S.t))) : 0;
      return { id, name: sp.name, icon: sp.icon, target: sp.target, cd: sp.cd, total: all.length, alive: live.length, ready: ready.length, next };
    });
  }
  function interruptibles(S) {
    const out = [];
    S.bodies.forEach((b, k) => { if (b.cast && b.cast.interruptible) out.push({ src: b, cast: b.cast, pos: b.pos, rad: bodyRad(S), ref: { kind: 'body', k } }); });
    for (const a of S.adds) if (a.alive && a.cast && a.cast.interruptible) out.push({ src: a, cast: a.cast, pos: a.pos, rad: a.rad, ref: { kind: 'add', id: a.id } });
    return out.sort((x, y) => x.cast.end - y.cast.end);
  }
  function doInterrupt(S, x, by) {
    x.src.cast = null;
    const id = x.cast.id; if (id) M(S, id).ok++;
    S.events.push({ type: 'interrupt', x: x.pos.x, z: x.pos.z, by });
    log(S, (x.cast.name || 'Incantation') + ' interrompue' + (by >= 0 ? ' par ' + S.raiders[by].name : '') + '.', 'good');
  }
  const near = (list, p) => list.slice().sort((a, b) => dist(a.pos, p) - dist(b.pos, p))[0];
  // ctx : { sel:[i], enemy:ref|null, ground:{x,z}|null }
  function cast(S, id, ctx = {}) {
    if (S.over) return MSG(false, '');
    if (!S.started) return MSG(false, 'Lance le pull d’abord');
    const sp = SPELLS[id]; if (!sp) return MSG(false, '');
    const live = carriers(S, id).filter(r => r.alive);
    if (!live.length) return MSG(false, 'Aucun ' + sp.classes.map(c => CLASSES[c].name).join(' ni ') + ' en vie');
    const ready = live.filter(r => (r.cds[id] || 0) <= S.t);
    if (!ready.length) return MSG(false, sp.name + ' en recharge');
    const sel = (ctx.sel || []).map(i => S.raiders[i]).filter(Boolean);
    const selAlive = sel.filter(r => r.alive);
    let by = null, tgtR = null, E = null, gp = null;
    const done = (extra) => {
      by.cds[id] = S.t + sp.cd;
      S.spellUse[id] = (S.spellUse[id] || 0) + 1;
      S.events.push(Object.assign({ type: 'spell', id, by: by.i, target: tgtR ? tgtR.i : -1, x: gp ? gp.x : E ? E.pos.x : tgtR ? tgtR.pos.x : by.pos.x, z: gp ? gp.z : E ? E.pos.z : tgtR ? tgtR.pos.z : by.pos.z }, extra || {}));
      return MSG(true, by.name + ' : ' + sp.name + (tgtR && tgtR !== by ? ' → ' + tgtR.name : E ? ' → ' + E.name : ''));
    };
    switch (id) {
      case 'provoc': {
        E = enemyRef(S, ctx.enemy);
        if (E && E.add && E.add.type !== 'guardian') return MSG(false, 'On ne provoque pas un ' + E.add.name);
        if (!E) {
          // à défaut : un gardien libre, sinon le boss dont le tank a le plus de cumuls
          const loose = S.adds.find(a => a.alive && a.type === 'guardian' && (S.raiders[a.target] || {}).role !== 'tank');
          if (loose) E = enemyRef(S, { kind: 'add', id: loose.id });
          else { const k = S.bodies.map((b, k) => ({ k, n: Math.max(0, ...Object.values((S.raiders[b.target] || { stacks: {} }).stacks).map(s => s.n)) })).sort((x, y) => y.n - x.n)[0].k; E = enemyRef(S, { kind: 'body', k }); }
        }
        const cur = E.body ? E.body.target : E.add.target;
        const cands = ready.filter(r => r.i !== cur);
        if (!cands.length) return MSG(false, 'Le seul tank disponible a déjà ' + E.name);
        by = near(cands, E.pos);
        if (E.body) E.body.target = by.i; else { E.add.target = by.i; E.add.tanked = true; }
        M(S, 'swaps').ok++;
        S.events.push({ type: 'taunt', i: by.i });
        log(S, by.name + ' provoque ' + E.name + '.', 'good');
        return done();
      }
      case 'kick': {
        const list = interruptibles(S);
        if (!list.length) return MSG(false, 'Rien à interrompre');
        let pref = ctx.enemy ? list.find(x => (x.ref.kind === ctx.enemy.kind) && (x.ref.k === ctx.enemy.k) && (x.ref.id === ctx.enemy.id)) : null;
        const order = pref ? [pref, ...list.filter(x => x !== pref)] : list;
        for (const x of order) {
          const inR = ready.filter(r => dist(r.pos, x.pos) <= (sp.range[r.cls] || 9) + (x.rad || 0));
          if (inR.length) { by = near(inR, x.pos); E = { pos: x.pos, name: x.cast.name }; doInterrupt(S, x, by.i); return done(); }
        }
        return MSG(false, 'Aucun porteur à portée : Gardien ou Lame-ombre au contact, ou un Spectre');
      }
      case 'egide': case 'carapace': {
        by = ready.find(r => sel.includes(r)) || ready.find(r => isTanking(S, r)) || ready[0];
        by.mit.push({ until: S.t + sp.dur, dr: sp.dr, src: id });
        tgtR = by;
        return done({ dur: sp.dur });
      }
      case 'seisme': {
        const withAdds = ready.map(r => ({ r, n: S.adds.filter(a => a.alive && a.type !== 'orb' && dist(a.pos, r.pos) <= sp.r).length + S.adds.filter(a => a.alive && a.type === 'orb' && dist(a.pos, r.pos) <= sp.r).length }));
        const pickR = withAdds.find(x => sel.includes(x.r) && x.n) || withAdds.sort((a, b) => b.n - a.n)[0];
        if (!pickR.n) return MSG(false, 'Aucun add à 9 m d’un Titan');
        by = pickR.r;
        for (const a of S.adds) if (a.alive && dist(a.pos, by.pos) <= sp.r) {
          a.stunUntil = S.t + sp.stun; if (a.cast) { if (a.cast.interruptible) M(S, a.cast.id).ok++; a.cast = null; }
          if (a.type === 'guardian') { a.target = by.i; a.tanked = true; }
          dealAdd(S, by, a, sp.dmg * by.pow);
        }
        return done({ r: sp.r });
      }
      case 'nuee': {
        by = ready[0];
        for (const r of S.raiders) if (r.alive) addHot(S, by, r, r.maxHp * sp.pct, sp.dur, 'nuee');
        return done({ dur: sp.dur });
      }
      case 'purge': {
        const has = r => r.alive && r.debuffs.some(d => d.dispel);
        tgtR = selAlive.filter(has).sort((a, b) => a.debuffs[0].start - b.debuffs[0].start)[0]
          || S.raiders.filter(has).sort((a, b) => Math.min(...a.debuffs.map(d => d.start)) - Math.min(...b.debuffs.map(d => d.start)))[0];
        if (!tgtR) return MSG(false, 'Aucun effet néfaste à purger');
        by = near(ready, tgtR.pos);
        const k = tgtR.debuffs.findIndex(d => d.dispel); const db = tgtR.debuffs.splice(k, 1)[0]; M(S, db.id).ok++;
        S.events.push({ type: 'dispel', i: tgtR.i, by: by.i });
        return done();
      }
      case 'prisme': {
        tgtR = selAlive.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] || S.raiders[mainBody(S).target];
        if (!tgtR || !tgtR.alive) tgtR = alive(S).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (!tgtR) return MSG(false, '');
        by = near(ready, tgtR.pos);
        tgtR.absorb = Math.max(tgtR.absorb > 0 && S.t < tgtR.absorbUntil ? tgtR.absorb : 0, tgtR.maxHp * sp.absorb * by.pow); tgtR.absorbUntil = S.t + sp.dur; tgtR.absorbSrc = by.i;
        return done();
      }
      case 'rez': {
        const dead = sel.filter(r => !r.alive);
        const order = { tank: 0, heal: 1, dps: 2 };
        tgtR = dead[0] || S.raiders.filter(r => !r.alive).sort((a, b) => order[a.role] - order[b.role] || b.stats.deaths - a.stats.deaths)[0];
        if (!tgtR) return MSG(false, 'Personne à relever');
        by = near(ready, tgtR.pos);
        tgtR.alive = true; tgtR.hp = tgtR.maxHp * sp.hp; tgtR.anchor = { x: tgtR.pos.x, z: tgtR.pos.z }; tgtR.orders = []; tgtR.focus = null;
        S.events.push({ type: 'rez', i: tgtR.i });
        log(S, tgtR.name + ' est relevé par ' + by.name + '.', 'good');
        return done();
      }
      case 'vague': {
        if (!ctx.ground) return MSG(false, 'Touche le sol pour placer ' + sp.name, 'ground');
        gp = inArena({ x: ctx.ground.x, z: ctx.ground.z });
        by = near(ready, gp);
        for (const r of S.raiders) if (r.alive && dist(r.pos, gp) <= sp.r) { heal(S, by, r, r.maxHp * sp.pct * by.pow * healMult(S)); addHot(S, by, r, r.maxHp * sp.hot * by.pow, sp.dur, 'vague'); }
        return done({ r: sp.r });
      }
      case 'pas': {
        E = enemyRef(S, ctx.enemy) || enemyRef(S, { kind: 'body', k: S.bodies.indexOf(nearestBody(S, raidCenter(S))) });
        by = near(ready, E.pos);
        const from = { x: by.pos.x, z: by.pos.z };
        let dx = by.pos.x - E.pos.x, dz = by.pos.z - E.pos.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
        const to = inArena({ x: E.pos.x + dx * (E.rad + 1.2), z: E.pos.z + dz * (E.rad + 1.2) });
        by.pos = { x: to.x, z: to.z }; by.anchor = { x: to.x, z: to.z }; by.orders = [];
        if (E.add) { by.focus = { kind: 'add', id: E.add.id }; dealAdd(S, by, E.add, sp.dmg * by.pow * dmgMultRaid(S)); }
        else bossDamage(S, by, sp.dmg * by.pow * dmgMultRaid(S));
        return done({ fx: from.x, fz: from.z });
      }
      case 'tir': {
        E = enemyRef(S, ctx.enemy) || enemyRef(S, { kind: 'body', k: 0 });
        by = near(ready, E.pos);
        if (E.add) dealAdd(S, by, E.add, sp.dmg * by.pow * dmgMultRaid(S)); else bossDamage(S, by, sp.dmg * by.pow * dmgMultRaid(S));
        return done();
      }
      case 'tourbillon': {
        const enemyP = enemyRef(S, ctx.enemy);
        by = ready.find(r => sel.includes(r)) || near(ready, enemyP ? enemyP.pos : nearestBody(S, raidCenter(S)).pos);
        by.whirlUntil = S.t + sp.dur;
        tgtR = by;
        return done({ dur: sp.dur, r: sp.r });
      }
      case 'cri': { by = ready[0]; S.buffs.criUntil = S.t + sp.dur; log(S, by.name + ' pousse un Cri de guerre.', 'cd'); return done({ dur: sp.dur }); }
      case 'tourelle': {
        if (!ctx.ground) return MSG(false, 'Touche le sol pour poser la Tourelle', 'ground');
        gp = inArena({ x: ctx.ground.x, z: ctx.ground.z });
        by = near(ready, gp);
        const tu = { id: 'tu' + Math.floor(S.t * 100), x: gp.x, z: gp.z, until: S.t + sp.dur, by: by.i, pow: by.pow, shotT: 0 };
        S.turrets.push(tu);
        return done({ tid: tu.id, dur: sp.dur });
      }
      case 'dome': {
        if (!ctx.ground) return MSG(false, 'Touche le sol pour poser le Dôme', 'ground');
        gp = inArena({ x: ctx.ground.x, z: ctx.ground.z });
        by = near(ready, gp);
        S.domes.push({ x: gp.x, z: gp.z, r: sp.r, dr: sp.dr, until: S.t + sp.dur });
        return done({ r: sp.r, dur: sp.dur });
      }
    }
    return MSG(false, '');
  }

  // ---------- dégâts infligés ----------
  function dealAdd(S, src, a, amount) { const x = Math.min(a.hp, amount); a.hp -= x; src.stats.dmg += x; if (a.hp <= 0) killAdd(S, a); }
  function killAdd(S, a) {
    if (!a.alive) return;
    a.alive = false; S.events.push({ type: 'addDie', id: a.id });
    M(S, a.abId).ok++;
    for (const r of S.raiders) if (r.focus && r.focus.kind === 'add' && r.focus.id === a.id) { r.focus = null; r.anchor = { x: r.pos.x, z: r.pos.z }; }
  }
  function bossDamage(S, src, amount) {
    if (S.t < S.invulnUntil) return;
    const ph = S.B.phases[S.phase];
    let a = amount;
    if (S.adds.some(x => x.alive && x.type === 'echo')) a *= 0.5;
    if (ph.shieldWhileAdds && S.adds.some(x => x.alive && x.type === 'guardian')) a *= ph.shieldWhileAdds;
    const floor = (ph.to || 0) * S.maxHp;
    a = Math.min(a, S.hp - floor);
    if (a > 0) { S.hp -= a; src.stats.dmg += a; }
  }

  // zone dangereuse pour un déplacement automatique
  function danger(S, p, r) {
    for (const z of S.zones) {
      if ((z.type === 'puits' || z.type === 'core') && dist(p, z) < z.r + 0.6) return true;
      if (z.type === 'pool' && r.role !== 'tank' && dist(p, z) < z.r + 0.6) return true;
      if (z.type === 'beam' && r.role !== 'tank' && S.bodies.length > 1 && segDist(p, S.bodies[0].pos, S.bodies[1].pos) < z.width + 0.8) return true;
      if (z.type === 'fissure' && r.role !== 'tank' && segDist(p, z, { x: z.x2, z: z.z2 }) < z.w / 2 + 0.6) return true;
      if (z.type === 'half' && r.role !== 'tank' && p.x * z.side > -0.8) return true;
    }
    return S.lavaAt > 0 && Math.hypot(p.x, p.z) > S.arenaR;
  }
  // cible de combat d'un perso
  function combatTarget(S, r) {
    if (r.focus) {
      const E = enemyRef(S, r.focus);
      if (E) return E;
      r.focus = null; r.anchor = { x: r.pos.x, z: r.pos.z };
    }
    if (r.role === 'tank') {
      const g = S.adds.find(a => a.alive && a.type === 'guardian' && a.target === r.i);
      if (g) return enemyRef(S, { kind: 'add', id: g.id });
      const bs = tankingBodies(S, r); if (bs.length) return enemyRef(S, { kind: 'body', k: S.bodies.indexOf(near(bs, r.pos)) });
    }
    const b = nearestBody(S, r.pos);
    return enemyRef(S, { kind: 'body', k: S.bodies.indexOf(b) });
  }

  // ---------- boucle ----------
  // R : rayon jouable ; un perso déjà au-delà (arène effondrée) peut rentrer mais pas s'éloigner davantage
  function moveToward(p, q, step, R) { const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz); if (d < 1e-3) return 0; const d0 = Math.hypot(p.x, p.z); const k = Math.min(1, step / d); p.x += dx * k; p.z += dz * k; inArena(p, R ? Math.min(ARENA, Math.max(R, d0)) : ARENA); return d * k; }
  function step(S, dt) {
    if (S.over || !S.started) return;
    const D = S.D;
    S.t += dt; const t = S.t;
    if (t >= S.enrage) {
      S.events.push({ type: 'nova' });
      for (const r of S.raiders) if (r.alive) kill(S, r, 'Enrage');
      return end(S, 'wipe');
    }
    if (S.pending.length) { const due = S.pending.filter(p => t >= p.at); if (due.length) { S.pending = S.pending.filter(p => t < p.at); due.forEach(p => p.fn()); } }
    // capacités
    if (t >= S.invulnUntil) {
      for (const id in S.timers) {
        const tm = S.timers[id];
        if (tm.next != null && t >= tm.next) {
          const a = ab(S, id);
          const needsCast = a && (a.kind === 'buster' || a.kind === 'raidcast' || a.kind === 'frontal');
          if (needsCast && bodyFor(S, a).cast) { tm.next = bodyFor(S, a).cast.end + 0.4; continue; }
          fire(S, id);
          tm.next = tm.every ? tm.next + tm.every : null;
        }
      }
    }
    // cumuls de mêlée (jumelles)
    const ms = ab(S, 'brulure');
    if (ms) for (const b of S.bodies) { b.stackT = (b.stackT || 0) + dt; if (b.stackT >= ms.every) { b.stackT = 0; const r = S.raiders[b.target]; if (r && r.alive && dist(r.pos, b.pos) < 7) addStack(S, r, b.id, ms.stack + ' (' + b.name + ')', ms.stackDur); } }
    // incantations des corps
    for (const b of S.bodies) { const c = b.cast; if (c && t >= c.end) { b.cast = null; resolveCast(S, b, c, ab(S, c.id)); } }
    // flaques : boss renforcé
    for (const b of S.bodies) {
      const inPool = S.zones.some(z => z.type === 'pool' && dist(b.pos, z) < z.r);
      if (inPool) { b.poolT += dt; if (b.poolT >= 3) { b.poolT = 0; b.empower = Math.min(10, b.empower + 1); M(S, 'flaque').hits++; } }
      else { b.poolT = 0; b.decayT = (b.decayT || 0) + dt; if (b.decayT >= 1.5 && b.empower > 0) { b.decayT = 0; b.empower--; } }
    }
    // lien des jumelles
    if (S.B.twins && S.B.link) {
      const close = dist(S.bodies[0].pos, S.bodies[1].pos) < S.B.link.dist;
      S.link.closeT = close ? S.link.closeT + dt : 0;
      const was = S.link.active;
      S.link.active = S.link.closeT > 4;
      if (S.link.active && !was) { alert(S, 'LIEN STELLAIRE — écarte les tanks des Jumelles !', 'danger', 'tank'); M(S, 'lien').hits++; }
      if (S.link.active) M(S, 'lien').dmg += dt;
    }
    // expirations
    for (const r of S.raiders) { for (const k in r.stacks) if (t > r.stacks[k].exp) delete r.stacks[k]; if (r.mit.length) r.mit = r.mit.filter(m => t < m.until); }
    S.zones = S.zones.filter(z => !((z.type === 'puits' || z.type === 'pool' || z.type === 'beam' || z.type === 'fissure' || z.type === 'half') && t >= z.endAt));
    if (!S.B.phases[S.phase].abilities.singularite) S.zones = S.zones.filter(z => z.type !== 'core');
    S.domes = S.domes.filter(d => t < d.until);
    for (const tu of S.turrets) if (t >= tu.until && !tu.gone) { tu.gone = true; S.events.push({ type: 'turretEnd', id: tu.id }); }
    S.turrets = S.turrets.filter(tu => !tu.gone);

    const eclipse = t < S.buffs.eclipseUntil;
    const aliveAdds = S.adds.filter(a => a.alive);
    if (aliveAdds.some(a => a.type === 'echo')) M(S, 'echos').shield = (M(S, 'echos').shield || 0) + dt;

    // ---- boss : déplacement
    for (const b of S.bodies) {
      if (b.centerMove) { moveToward(b.pos, { x: 0, z: 0 }, 6 * dt); continue; }
      const tg = S.raiders[b.target];
      if (b.cast || !tg || !tg.alive) continue;
      const d = dist(b.pos, tg.pos);
      if (d > 4.2) moveToward(b.pos, tg.pos, Math.min(d - 4.2, 5.2 * dt));
      b.facing = Math.atan2(tg.pos.x - b.pos.x, tg.pos.z - b.pos.z);
    }
    // ---- adds
    for (const a of aliveAdds) {
      const stunned = t < a.stunUntil;
      if (a.type === 'orb') {
        if (stunned) continue;
        const tgt = near(alive(S), a.pos); if (tgt) moveToward(a.pos, tgt.pos, a.speed * dt);
        const hit = S.raiders.find(r => r.alive && dist(r.pos, a.pos) < 2.2);
        if (hit) {
          a.alive = false; M(S, a.abId).fails++;
          S.events.push({ type: 'orbExplode', x: a.pos.x, z: a.pos.z });
          for (const r of S.raiders) if (r.alive && dist(r.pos, a.pos) < 6) dmg(S, r, a.explode, 'Explosion d’un Orbe vide', { avoidable: true, mech: true });
        }
      } else if (a.type === 'guardian') {
        const tg = S.raiders[a.target];
        if (tg && tg.alive && !stunned) {
          const d = dist(a.pos, tg.pos);
          if (!a.cast && d > 3.2) moveToward(a.pos, tg.pos, Math.min(d - 3.2, 4.5 * dt));
          if (d < 4.5) dmg(S, tg, a.melee * dt * (tg.role === 'tank' ? 1 : 1.6), 'Gardien du Vide', { phys: true });
          if (tg.role !== 'tank') M(S, 'gardiens').loose = (M(S, 'gardiens').loose || 0) + dt;
        }
        if (!stunned && !a.cast && t >= a.nextCast) { a.cast = { id: 'fleau', name: 'Fléau', start: t, end: t + 3, interruptible: true }; a.nextCast = t + 15; M(S, 'fleau').casts++; S.events.push({ type: 'addCast', id: a.id }); alert(S, 'FLÉAU — Interruption sur le Gardien', 'warn', 'kick'); }
        if (a.cast && t >= a.cast.end) { a.cast = null; M(S, 'fleau').fails++; S.events.push({ type: 'raidHit', kind: 'fleau' }); for (const r of S.raiders) if (r.alive) dmg(S, r, 9000, 'Fléau (non interrompu)', { avoidable: true, mech: true }); }
      } else if (a.type === 'echo') {
        if (!stunned && t >= a.nextShard) { a.nextShard = t + 3; const al = alive(S); if (al.length) { const v = al[Math.floor(S.rng() * al.length)]; dmg(S, v, 2500, 'Éclat du Vide', { mech: true }); S.events.push({ type: 'shard', from: a.id, i: v.i }); } }
      }
    }

    // ---- persos : ordres & mouvement
    const rad = bodyRad(S);
    for (const r of S.raiders) {
      if (!r.alive) { r.moving = false; continue; }
      let desired = null;
      if (r.orders.length) {
        const w = r.orders[0];
        if (dist(r.pos, w) < 0.12) { r.orders.shift(); if (!r.orders.length) r.anchor = { x: w.x, z: w.z }; }
        if (r.orders.length) desired = r.orders[0];
      }
      const E = combatTarget(S, r);
      r.atkTarget = E && E.add ? E.add.id : 'boss';
      const reachD = E ? E.rad + 2.2 : 0;
      r.inReach = !!E && dist(r.pos, E.pos) <= (r.range === 'melee' ? reachD : RANGED_RANGE);
      if (!desired && E && r.range === 'melee') {
        const tanking = r.role === 'tank' && isTanking(S, r);
        if (tanking && !r.focus) desired = r.anchor;
        else {
          // point de contact du côté de sa zone
          let dx = r.anchor.x - E.pos.x, dz = r.anchor.z - E.pos.z, d = Math.hypot(dx, dz);
          if (d < 0.5) { dx = r.pos.x - E.pos.x; dz = r.pos.z - E.pos.z; d = Math.hypot(dx, dz) || 1; }
          // un perso ne sort pas seul d'une zone, mais n'y entre jamais de lui-même : il cherche un autre angle d'attaque
          const base = Math.atan2(dx, dz), ok = p => (r.focus || dist(p, r.anchor) <= LEASH) && !danger(S, p, r);
          let contact = null;
          for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4]) {
            const p = inArena({ x: E.pos.x + Math.sin(base + off) * (E.rad + 1.3), z: E.pos.z + Math.cos(base + off) * (E.rad + 1.3) });
            if (ok(p)) { contact = p; break; }
          }
          const here = dist(r.pos, E.pos) <= reachD - 0.3;
          if (contact) desired = here && !danger(S, r.pos, r) ? null : (here ? null : contact);
          else desired = danger(S, r.anchor, r) ? null : r.anchor;
        }
      } else if (!desired) desired = r.anchor;
      if (desired && dist(r.pos, desired) > 0.08) { const mv = moveToward(r.pos, desired, SPEED * dt, S.arenaR); r.moving = mv > 0.0005; r.stats.moved += mv; }
      else r.moving = false;
      if (r.role !== 'heal') r.healTarget = -1;
    }

    // ---- dégâts infligés par le raid
    const raidMult = dmgMultRaid(S);
    for (const r of S.raiders) {
      if (!r.alive) continue;
      const C = CLASSES[r.cls];
      const E = combatTarget(S, r); if (!E) continue;
      let m = C.dps * r.pow * raidMult;
      if (r.moving) m *= r.range === 'melee' ? 0.8 : 0.5;
      if (!r.inReach) m = 0;
      const amount = m * dt;
      if (amount > 0) { if (E.add) dealAdd(S, r, E.add, amount); else bossDamage(S, r, amount); }
      if (t < r.whirlUntil) {
        const w = SPELLS.tourbillon, wd = w.dps * r.pow * raidMult * dt;
        for (const a of S.adds) if (a.alive && dist(a.pos, r.pos) <= w.r + a.rad) dealAdd(S, r, a, wd);
        for (const b of S.bodies) if (dist(b.pos, r.pos) <= w.r + rad) { bossDamage(S, r, wd); break; }
      }
    }
    // tourelles
    for (const tu of S.turrets) {
      const tp = tu, pool = S.adds.filter(a => a.alive && dist(a.pos, tp) <= SPELLS.tourelle.range);
      let tgt = pool.length ? near(pool, tp) : null, body = null;
      if (!tgt) { const b = nearestBody(S, tp); if (dist(b.pos, tp) <= SPELLS.tourelle.range + rad) body = b; }
      const src = S.raiders[tu.by] || S.raiders[0];
      const amount = SPELLS.tourelle.dps * tu.pow * raidMult * dt;
      if (tgt) dealAdd(S, src, tgt, amount); else if (body) bossDamage(S, src, amount);
      tu.shotT -= dt;
      if (tu.shotT <= 0 && (tgt || body)) { tu.shotT = 0.45; const p = tgt ? tgt.pos : body.pos; S.events.push({ type: 'turretShot', id: tu.id, x: tu.x, z: tu.z, tx: p.x, tz: p.z, add: !!tgt }); }
    }
    // transitions
    const ph = S.B.phases[S.phase];
    if (S.phase < S.B.phases.length - 1 && S.hp <= S.maxHp * ph.to + 1) enterPhase(S, S.phase + 1);
    if (S.hp <= 1) return end(S, 'kill');

    // ---- dégâts subis
    const vuln = t >= S.invulnUntil;
    for (const b of S.bodies) {
      const tk = S.raiders[b.target];
      if (!vuln || b.centerMove || !tk || !tk.alive || dist(tk.pos, b.pos) > 7) continue;
      let auto = 1150 * phaseMult(S) * (1 + 0.08 * b.empower) * (S.link.active ? 1.5 : 1) * (S.B.twins ? 0.8 : 1);
      const stk = S.B.twins ? tk.stacks[b.id] : null; if (stk) auto *= 1 + 0.12 * stk.n;
      dmg(S, tk, auto * dt * (tk.role === 'tank' ? 1 : 2.4), tk.role === 'tank' ? 'Mêlée de ' + b.name : 'Mêlée de ' + b.name + ' (pas de tank)', { phys: true });
    }
    let aura = ph.aura ? ph.aura + (ph.ramp || 0) * Math.max(0, t - S.phaseStart - (ph.invuln || 0)) : 0;
    if (S.link.active) aura += 1500;
    for (const r of S.raiders) {
      if (!r.alive) continue;
      if (aura) dmg(S, r, aura * dt, ph.aura ? (S.B.id === 'nyxar' ? 'Effondrement du Noyau' : 'Faim d’Azhal') : 'Lien stellaire', {});
      if (t < S.buffs.chantDotUntil) dmg(S, r, S.buffs.chantDot * dt, 'Écho du Chant', { avoidable: true, mech: true });
      if (eclipse) dmg(S, r, (S.buffs.eclipseDps || 1200) * dt, 'Éclipse', { mech: true });
      for (const z of S.zones) {
        if ((z.type === 'puits' && t >= z.armAt && dist(r.pos, z) < z.r) || (z.type === 'core' && dist(r.pos, z) < z.r)) {
          const a = dmg(S, r, z.dps * dt, z.type === 'core' ? 'Cœur de la Singularité' : ab(S, z.abId) ? ab(S, z.abId).name : 'Impact', { avoidable: true, mech: true });
          M(S, z.abId).dmg += a;
        }
        if (z.type === 'pool' && r.role !== 'tank' && dist(r.pos, z) < z.r) dmg(S, r, 3000 * dt, 'Flaque de scories', { avoidable: true, mech: true });
        if (z.type === 'beam' && t >= z.armAt && r.role !== 'tank' && segDist(r.pos, S.bodies[0].pos, S.bodies[1].pos) < z.width) { const a = dmg(S, r, z.dps * dt, 'Rayon jumeau', { avoidable: true, mech: true }); M(S, z.abId).dmg += a; M(S, z.abId).hits += dt; }
        if (z.type === 'half' && t >= z.armAt && r.role !== 'tank' && r.pos.x * z.side > -0.3) { const a = dmg(S, r, z.dps * dt, ab(S, z.abId) ? ab(S, z.abId).name : 'Équinoxe', { avoidable: true, mech: true }); M(S, z.abId).dmg += a; M(S, z.abId).hits += dt; }
        if (z.type === 'fissure' && t >= z.armAt && r.role !== 'tank' && segDist(r.pos, z, { x: z.x2, z: z.z2 }) < z.w / 2) { const a = dmg(S, r, z.dps * dt, ab(S, z.abId) ? ab(S, z.abId).name : 'Fissure de magma', { avoidable: true, mech: true }); M(S, z.abId).dmg += a; M(S, z.abId).hits += dt; }
      }
      if (S.lavaAt && t >= S.lavaAt && Math.hypot(r.pos.x, r.pos.z) > S.arenaR + 0.3) { const a = dmg(S, r, LAVA_DPS * dt, 'Lave', { avoidable: true, mech: true }); M(S, 'lave').dmg += a; M(S, 'lave').hits += dt; }
      for (let k = r.debuffs.length - 1; k >= 0; k--) {
        const db = r.debuffs[k];
        if (t >= db.until) {
          r.debuffs.splice(k, 1); M(S, db.id).fails++;
          if (db.explode) { S.events.push({ type: 'dotExplode', x: r.pos.x, z: r.pos.z, r: db.explode.r }); for (const o of S.raiders) if (o.alive && dist(o.pos, r.pos) < db.explode.r) dmg(S, o, db.explode.dmg, db.name + ' (explosion)', { avoidable: true, mech: true }); }
          continue;
        }
        dmg(S, r, db.dps * dt, db.name, { mech: true });
        if (!r.alive) break;
      }
    }

    // ---- soins
    const hm = healMult(S);
    const al = alive(S);
    for (const r of al) {
      for (let k = r.hots.length - 1; k >= 0; k--) {
        const h = r.hots[k];
        if (t >= h.until) { r.hots.splice(k, 1); continue; }
        heal(S, S.raiders[h.src] || r, r, h.hps * dt * hm);
      }
    }
    const healers = al.filter(r => r.role === 'heal');
    for (const r of al) if (!healers.some(h => dist(h.pos, r.pos) <= HEAL_RANGE)) r.stats.oor += dt;
    for (const h of healers) {
      const C = CLASSES[h.cls];
      const budget = C.hps * h.pow * hm * dt * (h.moving ? 0.75 : 1);
      const inR = al.filter(x => dist(x.pos, h.pos) <= HEAL_RANGE && x.hp < x.maxHp);
      if (!inR.length) { h.healTarget = -1; continue; }
      const byPct = inR.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
      let x = byPct[0];
      if (h.healMode === 'tanks') { const tk = byPct.filter(q => q.role === 'tank')[0]; if (tk && tk.hp / tk.maxHp < 0.97) x = tk; }
      else if (h.healMode === 'cible') { const f = S.raiders[h.healFix]; if (f && f.alive && inR.includes(f)) x = f; }
      const used = heal(S, h, x, budget);
      h.healTarget = x.i;
      if (used < budget) { const y = byPct.find(q => q !== x); if (y) heal(S, h, y, budget - used); }
    }
    if (!al.length) return end(S, 'wipe');
  }
  function segDist(p, a, b) {
    const vx = b.x - a.x, vz = b.z - a.z, wx = p.x - a.x, wz = p.z - a.z;
    const c = clamp((wx * vx + wz * vz) / (vx * vx + vz * vz || 1), 0, 1);
    return Math.hypot(wx - vx * c, wz - vz * c);
  }
  function addStack(S, r, key, name, dur) {
    const s = r.stacks[key] || { n: 0, name };
    s.n = Math.min(12, s.n + 1); s.exp = S.t + dur; r.stacks[key] = s;
    const mm = M(S, 'stacks'); mm.max = Math.max(mm.max || 0, s.n);
    if (s.n === 5) alert(S, name + ' ×5 sur ' + r.name + ' — échange les Jumelles', 'warn', 'taunt');
  }
  function resolveCast(S, b, c, a) {
    if (!a) return;
    const m = M(S, c.id);
    if (a.kind === 'buster') {
      const r = S.raiders[b.target]; if (!r || !r.alive) return;
      const st = r.stacks[a.stack] || { n: 0 };
      if (st.n >= 3) m.fails++;
      const amount = a.dmg * Math.pow(a.mult, st.n) * phaseMult(S) * (1 + 0.08 * b.empower);
      S.events.push({ type: 'busterHit', i: r.i, stacks: st.n, body: S.bodies.indexOf(b) });
      dmg(S, r, amount, a.name + (st.n ? ' (' + a.stack + ' ×' + st.n + ')' : ''), { phys: true, buster: true, avoidable: st.n >= 3 });
      const s = r.stacks[a.stack] || { n: 0, name: a.stack };
      s.n = Math.min(9, s.n + 1); s.exp = S.t + a.stackDur; r.stacks[a.stack] = s;
      const mm = M(S, 'stacks'); mm.max = Math.max(mm.max || 0, s.n);
      if (S.D.hints && s.n >= 2 && r.alive) alert(S, a.stack + ' ×' + s.n + ' sur ' + r.name + ' — Provocation avec l’autre tank', s.n >= 3 ? 'danger' : 'warn', 'taunt');
    } else if (a.kind === 'raidcast') {
      m.fails += a.interruptible ? 1 : 0;
      S.events.push({ type: 'raidHit', kind: c.id });
      for (const r of S.raiders) if (r.alive) { const x = dmg(S, r, a.dmg * phaseMult(S), a.name + (a.interruptible ? ' (non interrompu)' : ''), { avoidable: !!a.interruptible, mech: true }); m.dmg += x; }
      if (a.dot) { S.buffs.chantDotUntil = S.t + a.dotDur; S.buffs.chantDot = a.dot; }
      if (a.interruptible) log(S, a.name + ' n’a pas été interrompu.', 'bad');
    } else if (a.kind === 'frontal') {
      S.events.push({ type: 'frontalHit', body: S.bodies.indexOf(b), facing: c.facing, range: a.range, angle: a.angle });
      for (const r of S.raiders) {
        if (!r.alive || r.i === b.target || r.role === 'tank') continue;
        if (inCone(b, c.facing, r.pos, a)) { m.hits++; m.dmg += dmg(S, r, a.dmg * phaseMult(S), a.name, { avoidable: true, mech: true }); }
      }
    }
  }
  function end(S, result) {
    S.over = true; S.result = result; S.endT = S.t;
    S.events.push({ type: 'end', result });
    log(S, result === 'kill' ? S.B.name + ' est vaincu !' : 'Le raid est anéanti.', result === 'kill' ? 'good' : 'death');
  }

  // ---------- vues ----------
  function timersView(S) {
    const out = [];
    for (const id in S.timers) {
      const tm = S.timers[id]; if (tm.next == null) continue;
      const a = ab(S, id); if (!a || a.every >= 900 && tm.next < S.t) continue;
      out.push({ id, name: a.name, left: tm.next - S.t, every: a.every, call: a.call || CALL_FOR_KIND[a.kind] });
    }
    return out.sort((a, b) => a.left - b.left);
  }

  // ---------- analyse ----------
  function analyze(S) {
    const out = [];
    const push = (sev, title, text) => out.push({ sev, title, text });
    const all = {}; S.B.phases.forEach(ph => Object.assign(all, ph.abilities));
    // morts groupées par cause
    const byCause = {};
    for (const d of S.deaths) { if (d.cause === 'Enrage') continue; const k = d.cause.replace(/ \(.*\)$/, ''); (byCause[k] ||= []).push(d.name); }
    Object.entries(byCause).sort((a, b) => b[1].length - a[1].length).slice(0, 2).forEach(([c, ns]) => push(3 + ns.length, ns.length + ' mort' + (ns.length > 1 ? 's' : '') + ' : ' + c, ns.slice(0, 5).join(', ') + (ns.length > 5 ? '…' : '') + '.'));
    for (const id in all) {
      const a = all[id], m = S.mech[id]; if (!m) continue;
      switch (a.kind) {
        case 'raidcast': if (a.interruptible && m.fails) push(2 + m.fails, a.name + ' non interrompu', m.fails + ' sur ' + m.casts + ' sont passés. Interruption pendant la barre : un Gardien ou une Lame-ombre au contact, ou un Spectre.'); break;
        case 'frontal': if (m.hits >= 2) push(2 + Math.min(4, m.hits), a.name + ' encaissée', m.hits + ' persos touchés. Le cône part vers le tank : place le raid derrière le boss.'); break;
        case 'dots': if (m.fails >= 2) push(2 + Math.min(4, m.fails), a.name + ' laissée en place', m.fails + ' effets ont expiré sans Purge. Sélectionne la cible puis Purge, ou Purge directement.'); break;
        case 'pool': if ((m.hits || 0) >= 4) push(3, 'Boss laissé dans la Flaque', 'Vorr a pris ' + m.hits + ' cumuls de puissance. Déplace son tank à 8-10 m dès qu’elle apparaît.'); break;
        case 'zones': if (m.dmg > 60000 * S.D.dmgMult) push(2 + Math.min(3, Math.floor(m.dmg / 150000)), 'Trop de temps dans ' + a.name, Math.round(m.dmg / 1000) + 'k de dégâts subis. Les persos ne bougent pas seuls : sélectionne-les et sors-les du cercle avant qu’il s’arme.'); break;
        case 'beam': if ((m.hits || 0) > 2) push(3, 'Persos pris dans le Rayon', 'Le rayon a frappé pendant ' + Math.round(m.hits) + ' s cumulées. Personne entre les Jumelles.'); break;
        case 'half': if (m.dmg > 50000 * S.D.dmgMult) push(2 + Math.min(3, Math.floor(m.dmg / 120000)), 'Persos du mauvais côté', Math.round(m.dmg / 1000) + 'k de dégâts subis pendant l’' + a.name + '. Dès l’alerte, sélectionne tout le monde et fais traverser la ligne du milieu.'); break;
        case 'fissures': if (m.dmg > 50000 * S.D.dmgMult) push(2 + Math.min(3, Math.floor(m.dmg / 120000)), 'Persos dans les ' + a.name, Math.round(m.dmg / 1000) + 'k de dégâts subis. Dès que les lignes apparaissent, sélectionne les persos dessus et décale-les sur le côté.'); break;
        case 'marks': if (m.hits >= 2) push(3 + Math.min(3, Math.floor(m.hits / 3)), a.name + ' mal gérées', m.hits + ' alliés touchés par une explosion. Sors chaque marqué à plus de 6,5 m des autres.'); break;
        case 'soak': if (m.fails) push(3 + m.fails, a.name + ' mal partagée', 'Persos dans le cercle : ' + m.extra.join(', ') + '. Il en faut au moins ' + (a.need || 4) + ', hors tanks.'); break;
        case 'adds':
          if (a.type === 'echo' && (m.shield || 0) > 40) push(3, 'Échos laissés en vie', 'Bouclier actif ' + Math.round(m.shield) + ' s' + (m.fails ? ', ' + m.fails + ' explosion(s)' : '') + '. Sélectionne des DPS puis touche un Écho.');
          if (a.type === 'orb' && m.fails) push(3 + m.fails, 'Orbes arrivés au contact', m.fails + ' orbe(s) ont explosé dans le raid. Ordre d’attaque, Tir ou Tourelle dès leur apparition.');
          break;
      }
    }
    const g = S.mech.gardiens; if (g && (g.loose || 0) > 6) push(4, 'Gardien non tanké', 'Un Gardien a frappé des non-tanks pendant ' + Math.round(g.loose) + ' s. Provocation sur le Gardien, ou Séisme avec un Titan à côté.');
    const fl = S.mech.fleau; if (fl && fl.fails) push(2 + fl.fails, 'Fléau non interrompu', fl.fails + ' Fléau(x) sont passés.');
    const lv = S.mech.lave; if (lv && lv.hits > 2) push(4, 'Persos restés dans la lave', 'La lave a brûlé pendant ' + Math.round(lv.hits) + ' s cumulées. À l’Effondrement, ramène tout le monde vers le centre, placement compris.');
    const st = S.mech.stacks; if (st && st.max >= 4 && !S.B.twins) push(3 + st.max - 3, 'Cumuls trop hauts sur un tank', 'Le tank a atteint ' + st.max + ' cumuls. Provocation avec l’autre tank à 2-3 cumuls.');
    if (S.B.twins && st && st.max >= 8) push(3, 'Jumelles pas assez échangées', 'Un tank a atteint ' + st.max + ' cumuls d’Astre. Échange vers 5 avec deux Provocations.');
    if (S.mech.lien && S.mech.lien.dmg > 6) push(4, 'Jumelles trop proches', 'Le Lien stellaire est resté actif ' + Math.round(S.mech.lien.dmg) + ' s. Garde les deux tanks à plus de ' + S.B.link.dist + ' m l’un de l’autre.');
    const oor = S.raiders.filter(r => r.stats.oor > 15).sort((a, b) => b.stats.oor - a.stats.oor);
    if (oor.length) push(2 + Math.min(3, oor.length), 'Hors de portée des soigneurs', oor.slice(0, 3).map(r => r.name + ' ' + Math.round(r.stats.oor) + ' s').join(', ') + '. Les soigneurs soignent à 16 m.');
    if (S.deaths.some(d => d.cause === 'Enrage')) push(5, 'Enrage atteint', 'Le raid manque de dégâts : moins de morts, plus de DPS au contact, Cri de guerre en dernière phase.');
    if (S.raiders.some(r => r.cls === 'fracasseur') && !S.spellUse.cri && S.result !== 'kill' && S.phase === S.B.phases.length - 1) push(3, 'Cri de guerre jamais utilisé', '+25 % de dégâts pendant 12 s : idéal au début de la dernière phase.');
    out.sort((a, b) => b.sev - a.sev);
    return out.slice(0, 5);
  }

  // ---------- butin ----------
  function lootFits(item, cls) {
    const C = CLASSES[cls] || {};
    const role = C.role, range = C.range;
    switch (item.for) {
      case 'all': return true; case 'tank': return role === 'tank'; case 'heal': return role === 'heal'; case 'dps': return role === 'dps';
      case 'ranged': return role === 'dps' && range === 'ranged'; case 'melee': return role === 'dps' && range === 'melee'; case 'support': return role === 'tank' || role === 'heal';
    }
    return false;
  }
  // roster : [{id, name, cls, pow, parts}]
  function rollLoot(bossId, roster, diffKey, rng) {
    const D = DIFFS[diffKey];
    const items = LOOT[bossId].slice().sort(() => rng() - 0.5).slice(0, Math.min(D.loot, LOOT[bossId].length));
    const taken = new Set();
    return items.map(item => {
      const cands = roster.filter(p => lootFits(item, p.cls)).map(p => ({ id: p.id, name: p.name, parts: p.parts, pow: p.pow, cls: p.cls, roll: Math.floor(rng() * 100) + 1 }));
      cands.sort((a, b) => (taken.has(a.id) - taken.has(b.id)) || (b.parts - a.parts) || (a.pow - b.pow) || (b.roll - a.roll));
      const w = cands[0] || null; if (w) taken.add(w.id);
      let reason = '';
      if (w) {
        const s2 = cands[1];
        if (!s2) reason = 'seul candidat éligible.';
        else if (taken.has(s2.id) && !taken.has(w.id)) reason = 'les autres ont déjà reçu un objet.';
        else if (w.parts > s2.parts) reason = w.parts + ' part(s) d’équité, le plus haut parmi les éligibles.';
        else if (w.pow < s2.pow) reason = 'égalité de parts : va à celui pour qui le gain est le plus fort.';
        else reason = 'égalité : tirage au sort (' + w.roll + ' contre ' + s2.roll + ').';
      }
      return { item, winner: w ? w.id : null, reason, candidates: cands, bonus: D.lootPow };
    });
  }

  return { CLASSES, CLASS_ORDER, SPELLS, POOL, BOSSES, DIFFS, LOOT, HEAL_RANGE, resolveBoss, createFight, defaultPlacement, pull, step, order, setHealMode, cast, spellBar, barIds, timersView, analyze, rollLoot, lootFits, fmtT, mulberry32, segDist, dist, enemyRef, isTanking, interruptibles };
})();
if (typeof module !== 'undefined') module.exports = GAME;
