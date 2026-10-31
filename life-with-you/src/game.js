// Déroulé d'une descente : élan, vol, score (proximité, portes, touch & go, frôlés, câble), crash, atterrissage noté.
const GAME = (() => {
  const DT = 1 / 120, KEY = 'life-with-you-v2'; // v2 : commandes à deux poignées (anciens records effacés)
  const MEDALS = [{ id: 'or', nom: 'Or', min: 20000 }, { id: 'argent', nom: 'Argent', min: 14000 }, { id: 'bronze', nom: 'Bronze', min: 8000 }];
  const S = { screen: 'title', run: null, acc: 0, input: { l: 0, r: 0, go: false }, bot: null, paused: false, crashT: 0, events: [], save: load(), result: null };

  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 2) return s; } catch (e) { /* stockage indisponible */ }
    return { v: 2, best: null, opts: {}, runs: 0 };
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(S.save)); } catch (e) { /* stockage indisponible */ } }
  function emit(e) { S.events.push(e); }
  function drain() { const e = S.events; S.events = []; return e; }

  function newRun() {
    S.run = {
      p: FLIGHT.create(), t: 0, score: 0, combo: 1, idle: 0, proxF: 0, prox: 0,
      gate: 0, gates: WORLD.GATES.map(() => 0), gateOk: 0, gatePts: 0,
      touch: 0, touchPts: 0, near: 0, nearPts: 0, nearSeen: new Set(), cable: null, cablePts: 0,
      landing: null, end: null, ghost: [], closeT: 0, clear: { agl: 0, wall: 99, c: 99 }, maxV: 0
    };
    S.acc = 0; S.crashT = 0; S.paused = false; S.result = null;
  }
  function start() {
    newRun(); S.screen = 'run';
    S.save.runs = (S.save.runs || 0) + 1; persist();
    emit({ type: 'start' });
  }
  function menu() { S.screen = 'title'; S.run = null; S.paused = false; emit({ type: 'menu' }); }
  function pause(b) { if (S.screen === 'run') S.paused = b; }

  function update(dtReal) {
    if (S.paused || !S.run || (S.screen !== 'run' && S.screen !== 'crash')) return;
    let ts = 1;
    if (S.screen === 'crash') {
      // ralenti de l'impact, puis on rejoue
      S.crashT += dtReal; ts = S.crashT < 1.4 ? 0.22 : 0.5;
      if (S.crashT > 2.8) { start(); return; }
    }
    S.acc += Math.min(dtReal, 0.1) * ts;
    let n = 0;
    while (S.acc >= DT && n < 40) { S.acc -= DT; tick(DT); n++; }
  }

  function pop(text, kind, pts) { emit({ type: 'pop', text, kind, pts }); }

  function tick(dt) {
    const r = S.run, p = r.p, ev = [];
    const inp = S.bot ? S.bot(r) : S.input;
    const a = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
    FLIGHT.step(p, inp, dt, ev);
    if (S.screen === 'run' && p.mode !== 'ready' && p.mode !== 'landing' && p.mode !== 'stopped' && !r.end) r.t += dt; // chrono arrêté au toucher dans la prairie
    if (S.screen === 'run') { const why = FLIGHT.collide(p); if (why) FLIGHT.crash(p, why, ev); }
    for (const e of ev) handle(e);
    if (S.screen !== 'run' || r.end) return;
    r.maxV = Math.max(r.maxV, p.V);
    gates(a, p.pos);
    cable(a, p.pos);
    score(dt);
    record();
    if (r.t > 240) finish('arret');
  }

  function handle(e) {
    const r = S.run;
    switch (e.type) {
      case 'depart': emit(e); break;
      case 'decrochage': emit(e); pop('Décrochage ! Relâche les freins', 'miss', 0); break;
      case 'raccroche': emit(e); break;
      case 'decollage': emit(e); break;
      case 'redecollage': {
        emit(e);
        if (e.groundT < 8 && r.t - (r.lastTouch || -9) > 1.5) {
          r.lastTouch = r.t;
          const pts = Math.round(150 * r.combo);
          r.touch++; r.touchPts += pts; r.score += pts; r.combo = Math.min(5, r.combo + 0.3);
          pop('Touch & go', 'touch', pts);
        }
        break;
      }
      case 'contact':
        if (e.landing) r.landing = { d: Math.hypot(e.x - WORLD.LAND.x, e.z - WORLD.LAND.z), vn: e.vn, glisse: !!e.glisse };
        emit(e); break;
      case 'pose': finish('pose'); break;
      case 'arret': finish('arret'); break;
      case 'crash':
        r.end = 'crash'; S.screen = 'crash'; S.crashT = 0;
        emit(e); break;
    }
  }

  function gates(a, b) {
    const r = S.run, G = WORLD.GATES;
    while (r.gate < G.length) {
      const g = G[r.gate];
      const da = (a.x - g.x) * g.nx + (a.z - g.z) * g.nz, db = (b.x - g.x) * g.nx + (b.z - g.z) * g.nz;
      if (da < 0 && db >= 0) {
        const t = da / (da - db), cx = a.x + (b.x - a.x) * t, cy = a.y + (b.y - a.y) * t, cz = a.z + (b.z - a.z) * t;
        const lat = (cx - g.x) * g.tx + (cz - g.z) * g.tz, hgt = cy - WORLD.heightAt(cx, cz);
        if (Math.abs(lat) <= g.hw && hgt <= g.h) passGate(); else missGate(Math.abs(lat) > g.hw ? 'à côté' : 'trop haut');
        break;
      }
      if (db > 40) { missGate('à côté'); continue; }
      break;
    }
  }
  function passGate() {
    const r = S.run, i = r.gate, pts = Math.round(250 * r.combo);
    r.gates[i] = 1; r.gateOk++; r.gatePts += pts; r.score += pts; r.combo = Math.min(5, r.combo + 0.5); r.gate++;
    emit({ type: 'gate', i, ok: true, pts });
    pop('Porte ' + (i + 1), 'gate', pts);
  }
  function missGate(why) {
    const r = S.run, i = r.gate;
    r.gates[i] = -1; r.combo = 1; r.gate++;
    emit({ type: 'gate', i, ok: false });
    pop('Porte ' + (i + 1) + ' manquée (' + why + ')', 'miss', 0);
  }

  function cable(a, b) {
    const r = S.run, C = WORLD.CABLE;
    if (r.cable) return;
    const sa = -a.z - C.s, sb = -b.z - C.s;
    if (sa < 0 && sb >= 0) {
      const t = -sa / (sb - sa), cx = a.x + (b.x - a.x) * t, cy = a.y + (b.y - a.y) * t;
      const yc = WORLD.cableYAt(cx);
      if (yc < Infinity && cy + FLIGHT.GEO.wingTop < yc) {
        const pts = Math.round(400 * r.combo);
        r.cable = 'sous'; r.cablePts = pts; r.score += pts; r.combo = Math.min(5, r.combo + 0.5);
        pop('Sous le câble !', 'cable', pts);
      } else r.cable = 'dessus';
    }
  }

  function score(dt) {
    const r = S.run, p = r.p;
    if (p.mode === 'air') {
      const c = FLIGHT.clearance(p); r.clear = c;
      if (c.c < 15 && p.V > 9) {
        const f = Math.pow(WORLD.clamp((15 - c.c) / 13, 0, 1), 1.5);
        const pts = 55 * f * (p.V / 14) * r.combo * dt;
        r.score += pts; r.prox += pts; r.combo = Math.min(5, r.combo + 0.1 * f * dt); r.idle = 0; r.proxF = f;
        if (c.c < 6) r.closeT += dt;
      } else { r.proxF = 0; r.idle += dt; }
      const nt = WORLD.nearTree(p.pos.x, p.pos.y + 1, p.pos.z, 3);
      if (nt && !r.nearSeen.has(nt.i)) {
        r.nearSeen.add(nt.i); r.near++;
        const pts = Math.round(60 * r.combo);
        r.nearPts += pts; r.score += pts; r.combo = Math.min(5, r.combo + 0.1);
        emit({ type: 'near', d: nt.d });
        pop('Frôlé !', 'near', pts);
      }
    } else {
      r.proxF = 0; r.clear = { agl: 0, wall: 99, c: 0 };
      if (p.mode === 'landing') r.idle += dt;
    }
    if (r.idle > 2) r.combo = Math.max(1, r.combo - dt * 1.2);
  }

  // fantôme : 10 positions par seconde depuis le départ
  function record() {
    const r = S.run, p = r.p;
    if (p.mode === 'ready') return;
    while (r.ghost.length * 0.1 <= r.t) {
      r.ghost.push([p.pos.x, p.pos.y, p.pos.z, p.up.x, p.up.y, p.up.z, p.fwd.x, p.fwd.y, p.fwd.z, p.inflate].map(v => Math.round(v * 100) / 100));
    }
  }

  function finish(kind) {
    const r = S.run; if (r.end) return; r.end = kind;
    let land = null;
    if (kind === 'pose' && r.landing) {
      const { d, vn, glisse } = r.landing;
      const prec = d <= 5 ? 1000 : d <= 12 ? 600 : d <= 20 ? 300 : 0;
      // arrivée à skis (posé avant la prairie) : pas de points de douceur
      const soft = glisse ? 0 : vn <= 1.5 ? 600 : vn <= 3 ? 400 : vn <= 4.5 ? 200 : 0;
      const pts = prec + soft;
      const grade = glisse ? 'Arrivée à skis' : pts >= 1400 ? 'Parfait' : pts >= 900 ? 'Très bien' : pts >= 500 ? 'Bien' : pts > 0 ? 'Correct' : 'Raté';
      land = { d, vn, prec, soft, pts, grade, glisse, inTarget: d <= 20 };
      r.score += pts;
    }
    const score = Math.round(r.score), landed = kind === 'pose';
    const medal = landed ? (MEDALS.find(m => score >= m.min) || null) : null;
    const best = S.save.best;
    const record = landed && (!best || score > best.score);
    if (record) S.save.best = { score, time: Math.round(r.t * 10) / 10, medal: medal && medal.id, ghost: r.ghost };
    persist();
    S.result = {
      kind, score, time: r.t, gateOk: r.gateOk, gates: WORLD.GATES.length, prox: Math.round(r.prox), closeT: r.closeT, touch: r.touch, touchPts: r.touchPts,
      near: r.near, nearPts: r.nearPts, cable: r.cable, cablePts: r.cablePts, gatePts: r.gatePts, land, medal, record,
      best: best ? best.score : null, maxV: r.maxV
    };
    S.screen = 'results';
    emit({ type: 'results', res: S.result });
  }

  function setOpt(k, v) { S.save.opts[k] = v; persist(); }

  return { S, DT, MEDALS, start, menu, pause, update, drain, tick, setOpt, persist };
})();
if (typeof module !== 'undefined') module.exports = GAME;
