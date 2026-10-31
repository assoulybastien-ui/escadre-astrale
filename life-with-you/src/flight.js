// Physique de vol d'une voile de speed riding (modèle à point matériel) et glisse à skis.
// Portance et traînée réelles : L = ½ρV²S·CL, D = ½ρV²S·(CD0 + k·CL²). Deux poignées de frein, comme en vrai :
// les deux tirées = plus de CL (ralentir, remonter, arrondir) ; une seule = la voile s'incline et tourne de ce côté ;
// tenue à fond, elle part en spirale. Freins à fond trop lent = décrochage. L'énergie se conserve.
const FLIGHT = (() => {
  const G = 9.81, RHO = 1.0, M = 90; // air à ~2 000 m, pilote + matériel
  // Voile de speed riding de 9,5 m², trims ouverts : ~71 km/h mains hautes (finesse ~2,7), finesse max ~3,1 freins à moitié,
  // ~45 km/h freins à fond ; virage freiné jusqu'à ~50° d'inclinaison, spirale jusqu'à ~72° (~95 km/h, 2,5 g)
  const WING = { nom: 'Voile 9,5 m²', S: 9.5, cd0: 0.12, k: 0.22, clTrim: 0.45, clMax: 1.15, bankMax: 50 * Math.PI / 180, bankSpiral: 72 * Math.PI / 180,
    tauHand: 0.1, nMax: 3.2, stallV: 10.2,
    // la voile s'incline vite sous le frein (~0,4 s) ; le pilote se balance dessous (pendule ~2,2 s, peu amorti)
    // et entraîne un peu la voile : en alternant les freins au bon rythme, on enchaîne des wingovers
    tauBank: 0.4, rollK: 8.2, rollC: 1.0, swingPull: 0.55, bankLim: 83 * Math.PI / 180,
    // pendule en tangage : tirer = la voile cabre et dépasse (ressource), relâcher = elle plonge (abattée)
    pitchK: 26, pitchC: 4.6 };
  const MU_SKI = 0.055, MU_STOP = 0.35, PILOT_CDA = 0.5;
  // géométrie (m, au-dessus des pieds) : mousquetons, centre de la voile, bouts d'aile
  const GEO = { carab: 1.35, lineLen: 5.6, halfAngle: 40 * Math.PI / 180 };
  GEO.wingTop = GEO.carab + GEO.lineLen;
  GEO.tipY = GEO.carab + GEO.lineLen * Math.cos(GEO.halfAngle);
  GEO.tipX = GEO.lineLen * Math.sin(GEO.halfAngle);

  const W = () => WORLD;

  function create() {
    const S = W().START;
    return {
      pos: { x: S.x, y: S.y, z: S.z }, vel: { x: 0, y: 0, z: 0 }, dir: { x: S.dx, y: 0, z: S.dz },
      cl: WING.clTrim, bank: 0, inflate: 0, mode: 'ready', launched: false,
      up: { x: 0, y: 1, z: 0 }, upV: { x: 0, y: 0, z: 0 }, fwd: { x: S.dx, y: 0, z: S.dz }, right: { x: -S.dz, y: 0, z: S.dx },
      aero: { x: 0, y: 0, z: 0 }, t: 0, stopT: 0, groundT: 0, airT: 0, crashT: 0, V: 0, gload: 1, vn: 0, inp: { l: 0, r: 0 },
      bl: 0, br: 0, spiralT: 0, stall: false, stallT: 0, departT: 0, bankV: 0, clV: 0, swing: 0, swingV: 0,
      spin: { x: 0, y: 0, z: 0 }, tumble: { x: 0, y: 0, z: 0 }, reason: ''
    };
  }

  // ---------- un pas de simulation ----------
  function step(p, inp, dt, ev) {
    const w = W();
    p.t += dt; p.inp = inp;
    if (p.mode === 'stopped') return;
    if (p.mode === 'crash') return stepCrash(p, dt);
    // les mains suivent les pouces avec un léger retard
    const kh = 1 - Math.exp(-dt / WING.tauHand);
    p.bl += ((inp.l || 0) - p.bl) * kh; p.br += ((inp.r || 0) - p.br) * kh;
    // part commune des deux freins (plus de CL) et différence (virage)
    const sym = Math.min(p.bl, p.br) + 0.35 * Math.abs(p.br - p.bl), dif = p.br - p.bl;
    const clT = WING.clTrim + (WING.clMax - WING.clTrim) * Math.pow(sym, 1.15);
    // incidence en pendule : elle dépasse sa consigne puis revient
    p.clV += ((clT - p.cl) * WING.pitchK - p.clV * WING.pitchC) * dt;
    p.cl = Math.min(1.32, Math.max(0.24, p.cl + p.clV * dt));
    // un frein tenu fort plus d'une seconde : la voile part en spirale
    if (p.mode === 'air' && Math.abs(dif) > 0.75) p.spiralT += dt; else p.spiralT = Math.max(0, p.spiralT - dt * 2);
    const spiral = Math.min(1, Math.max(0, (p.spiralT - 1) / 2));
    const bankT = p.mode === 'air' ? dif * (WING.bankMax + (WING.bankSpiral - WING.bankMax) * spiral) : 0;
    if (p.mode === 'air') {
      // pilote : pendule qui suit l'inclinaison de la voile avec retard, la dépasse et revient
      p.swingV += ((p.bank - p.swing) * WING.rollK - p.swingV * WING.rollC) * dt;
      p.swing = Math.max(-WING.bankLim, Math.min(WING.bankLim, p.swing + p.swingV * dt));
      // voile : rejoint vite la consigne des freins, tirée en plus par le poids du pilote qui se balance
      const b0 = p.bank;
      p.bank += (bankT + WING.swingPull * (p.swing - p.bank) - p.bank) * (1 - Math.exp(-dt / WING.tauBank));
      p.bank = Math.max(-WING.bankLim, Math.min(WING.bankLim, p.bank));
      p.bankV = (p.bank - b0) / dt;
    } else { p.bank *= Math.exp(-dt * 6); p.swing *= Math.exp(-dt * 6); p.bankV = 0; p.swingV = 0; }

    if (p.mode === 'ready') {
      frame(p, dt);
      if (inp.go) { p.mode = 'ski'; p.departT = 0; p.vel = { x: p.dir.x * 2, y: 0, z: p.dir.z * 2 }; ev.push({ type: 'depart' }); }
      return;
    }

    // vent relatif
    const wd = w.windAt(p.t);
    const vax = p.vel.x - wd.x, vay = p.vel.y - wd.y, vaz = p.vel.z - wd.z;
    const V = Math.hypot(vax, vay, vaz) || 1e-6;
    const hx = vax / V, hy = vay / V, hz = vaz / V;
    p.V = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
    // gonflage de la voile pendant l'élan, dégonflage à l'arrêt
    if (p.mode === 'landing') p.inflate = Math.max(0, p.inflate - dt * 0.8);
    else if (p.inflate < 1 && V > 2.5) p.inflate = Math.min(1, p.inflate + dt * (0.5 + V * 0.09));
    const inf = p.inflate * p.inflate;
    const q = 0.5 * RHO * V * V;
    // décrochage : freins à fond alors que la voile est trop lente ; on en sort en relâchant les freins
    if (p.mode === 'air') {
      if (!p.stall) {
        p.stallT = sym > 0.85 && V < WING.stallV ? p.stallT + dt : 0;
        if (p.stallT > 0.5) { p.stall = true; ev.push({ type: 'decrochage' }); }
      } else if (sym < 0.5) { p.stall = false; p.stallT = 0; ev.push({ type: 'raccroche' }); }
    } else { p.stall = false; p.stallT = 0; }
    let L = q * WING.S * (p.stall ? 0.3 : p.cl) * inf;
    const Lmax = WING.nMax * M * G;
    if (L > Lmax) L = Lmax; // la voile ne tient pas plus de ~3 g
    const clE = inf > 0.01 ? L / (q * WING.S * inf) : 0;
    const D = q * (WING.S * (WING.cd0 + WING.k * clE * clE + (p.stall ? 0.75 : 0)) * inf + PILOT_CDA * (1 - inf));
    // direction de la portance : perpendiculaire au vent relatif, inclinée de « bank » autour de lui
    let ux = -hy * hx, uy = 1 - hy * hy, uz = -hy * hz;
    let ul = Math.hypot(ux, uy, uz);
    if (ul < 1e-4) { ux = p.fwd.x; uy = 0; uz = p.fwd.z; ul = Math.hypot(ux, uz) || 1; }
    ux /= ul; uy /= ul; uz /= ul;
    const rx = hy * uz - hz * uy, ry = hz * ux - hx * uz, rz = hx * uy - hy * ux;
    const cb = Math.cos(p.bank), sb = Math.sin(p.bank);
    const lx = ux * cb + rx * sb, ly = uy * cb + ry * sb, lz = uz * cb + rz * sb;
    const ax = lx * L - hx * D, ay = ly * L - hy * D, az = lz * L - hz * D;
    p.aero.x = ax; p.aero.y = ay; p.aero.z = az;
    p.gload = Math.hypot(ax, ay, az) / (M * G);
    let fx = ax, fy = ay - M * G, fz = az;

    if (p.mode === 'ski' || p.mode === 'landing') {
      // élan aux bâtons pendant les premières secondes
      p.departT += dt;
      if (p.mode === 'ski' && !p.launched && p.departT < 4) {
        const sp = Math.hypot(p.vel.x, p.vel.z);
        if (sp < 7) { fx += p.dir.x * M * 1.6; fz += p.dir.z * M * 1.6; }
      }
      const n = w.normalAt(p.pos.x, p.pos.z);
      const Fn = fx * n.x + fy * n.y + fz * n.z;
      if (Fn > 0 && p.mode === 'ski' && p.inflate > 0.6 && (!p.launched || p.groundT > 0.2)) {
        // la voile soulève le pilote : décollage
        p.mode = 'air'; p.airT = 0;
        ev.push({ type: p.launched ? 'redecollage' : 'decollage', groundT: p.groundT, airBefore: p.lastAirT || 0 });
        p.launched = true;
      } else {
        p.groundT += dt;
        const N = Math.max(0, -Fn);
        let tx = fx - n.x * Fn, ty = fy - n.y * Fn, tz = fz - n.z * Fn;
        const vn = p.vel.x * n.x + p.vel.y * n.y + p.vel.z * n.z;
        let vx = p.vel.x - n.x * vn, vy = p.vel.y - n.y * vn, vz = p.vel.z - n.z * vn;
        const sp = Math.hypot(vx, vy, vz);
        const mu = p.mode === 'landing' ? MU_STOP : MU_SKI;
        if (sp > 0.05) { const fr = mu * N; tx -= vx / sp * fr; ty -= vy / sp * fr; tz -= vz / sp * fr; }
        const nvx = vx + tx / M * dt, nvy = vy + ty / M * dt, nvz = vz + tz / M * dt;
        // le frottement ne fait pas repartir en arrière
        if (sp > 0.05 && nvx * vx + nvy * vy + nvz * vz < 0 && Math.hypot(tx, ty, tz) < mu * N * 1.05) { vx = vy = vz = 0; }
        else { vx = nvx; vy = nvy; vz = nvz; }
        // virage sur les carres (rotation autour de la normale)
        const om = -dif * 0.9 * Math.min(1, sp / 4) * dt;
        if (om !== 0) {
          const c = Math.cos(om), s = Math.sin(om);
          const cx = n.y * vz - n.z * vy, cy = n.z * vx - n.x * vz, cz = n.x * vy - n.y * vx;
          vx = vx * c + cx * s; vy = vy * c + cy * s; vz = vz * c + cz * s;
        }
        p.vel.x = vx; p.vel.y = vy; p.vel.z = vz;
        // le sol se dérobe-t-il ? si le relief 3 m devant tombe plus vite qu'une chute libre (portance comprise), on s'envole
        let envol = false;
        const vhz = Math.hypot(vx, vz);
        if (p.mode === 'ski' && p.inflate > 0.6 && vhz > 5) {
          const tt = 3 / vhz, gEff = Math.max(0, -fy / M);
          const yb = p.pos.y + vy * tt - 0.5 * gEff * tt * tt;
          envol = w.heightAt(p.pos.x + vx / vhz * 3, p.pos.z + vz / vhz * 3) < yb - 0.06;
        }
        const ny2 = p.pos.y + vy * dt;
        p.pos.x += vx * dt; p.pos.z += vz * dt;
        const hT = w.heightAt(p.pos.x, p.pos.z);
        if (envol) {
          // bord de falaise, de barre, bosse : on s'envole
          p.pos.y = Math.max(ny2, hT); p.mode = 'air'; p.airT = 0;
          ev.push({ type: p.launched ? 'redecollage' : 'decollage', groundT: p.groundT, airBefore: p.lastAirT || 0 });
          p.launched = true;
          frame(p, dt);
          return;
        }
        p.pos.y = hT;
        const sp2 = Math.hypot(vx, vy, vz);
        if (sp2 > 0.5) { p.dir.x = vx / sp2; p.dir.z = vz / sp2; const l = Math.hypot(p.dir.x, p.dir.z); p.dir.x /= l; p.dir.z /= l; }
        p.stopT = sp2 < 0.8 ? p.stopT + dt : 0;
        if (sp2 > 3 && w.surfaceAt(p.pos.x, p.pos.z) === 'rock' && w.surfaceAt(p.pos.x + vx * 0.15, p.pos.z + vz * 0.15) === 'rock') return crash(p, 'Rocher', ev);
        // entrée à skis dans la prairie : l'atterrissage est noté au point d'entrée
        if (p.mode === 'ski' && p.launched && -p.pos.z > w.LAND.from) {
          p.mode = 'landing';
          ev.push({ type: 'contact', vn: p.vn || 0, landing: true, x: p.pos.x, z: p.pos.z, V: sp2, glisse: true });
        }
        if (p.mode === 'landing' && sp2 < 0.9) { p.mode = 'stopped'; ev.push({ type: 'pose' }); }
        else if (p.mode === 'ski' && p.launched && p.stopT > 1.2) { p.mode = 'stopped'; ev.push({ type: 'arret' }); }
        frame(p, dt);
        return;
      }
    }

    // ---------- en l'air ----------
    p.airT += dt;
    p.vel.x += fx / M * dt; p.vel.y += fy / M * dt; p.vel.z += fz / M * dt;
    p.pos.x += p.vel.x * dt; p.pos.y += p.vel.y * dt; p.pos.z += p.vel.z * dt;
    const hg = w.heightAt(p.pos.x, p.pos.z);
    if (p.pos.y <= hg) {
      const n = w.normalAt(p.pos.x, p.pos.z);
      const vn = -(p.vel.x * n.x + p.vel.y * n.y + p.vel.z * n.z);
      p.vn = vn;
      if (w.surfaceAt(p.pos.x, p.pos.z) === 'rock') { p.pos.y = hg; return crash(p, 'Rocher', ev); }
      // juste après l'envol, frottement léger sur la neige : on reste en vol (pas de faux contacts à l'arête)
      if (p.airT < 0.3 && vn < 1.5 && -p.pos.z <= w.LAND.from) {
        p.pos.y = hg;
        const dn = p.vel.x * n.x + p.vel.y * n.y + p.vel.z * n.z;
        if (dn < 0) { p.vel.x -= n.x * dn; p.vel.y -= n.y * dn; p.vel.z -= n.z * dn; }
        frame(p, dt);
        return;
      }
      if (vn > 7) { p.pos.y = hg; return crash(p, 'Impact trop dur', ev); }
      if (Math.abs(p.bank) > 0.8) { p.pos.y = hg; return crash(p, 'Carre accrochée', ev); }
      p.pos.y = hg;
      const d = p.vel.x * n.x + p.vel.y * n.y + p.vel.z * n.z;
      p.vel.x -= n.x * d; p.vel.y -= n.y * d; p.vel.z -= n.z * d;
      const s = -p.pos.z;
      const landing = s > w.LAND.from; // prairie d'atterrissage, après la dernière porte
      p.mode = landing ? 'landing' : 'ski'; p.groundT = 0; p.lastAirT = p.airT;
      // petits rebonds au ras de la neige : pas d'événement (évite d'enchaîner les bruits)
      if (landing || p.airT > 0.25 || vn > 1.5) ev.push({ type: 'contact', vn, landing, x: p.pos.x, z: p.pos.z, V: p.V });
      const sp = Math.hypot(p.vel.x, p.vel.z);
      if (sp > 0.5) { p.dir.x = p.vel.x / sp; p.dir.z = p.vel.z / sp; }
    }
    frame(p, dt);
  }

  // ---------- chute après un crash : le pilote roule dans la neige ----------
  function crash(p, reason, ev) {
    p.mode = 'crash'; p.reason = reason; p.crashT = 0;
    p.vel.x *= 0.4; p.vel.y = Math.max(p.vel.y * 0.3, 2); p.vel.z *= 0.4;
    p.spin = { x: 3 + Math.random() * 3, y: (Math.random() - 0.5) * 4, z: (Math.random() - 0.5) * 6 };
    ev.push({ type: 'crash', reason, x: p.pos.x, y: p.pos.y, z: p.pos.z, V: p.V });
  }
  function stepCrash(p, dt) {
    const w = W();
    p.crashT += dt;
    p.vel.y -= G * dt;
    const k = Math.exp(-1.2 * dt);
    p.vel.x *= k; p.vel.z *= k;
    p.pos.x += p.vel.x * dt; p.pos.y += p.vel.y * dt; p.pos.z += p.vel.z * dt;
    const hg = w.heightAt(p.pos.x, p.pos.z);
    if (p.pos.y < hg) { p.pos.y = hg; p.vel.y = Math.abs(p.vel.y) * 0.25; p.vel.x *= 0.8; p.vel.z *= 0.8; p.spin.x *= 0.85; p.spin.z *= 0.85; }
    p.tumble.x += p.spin.x * dt; p.tumble.y += p.spin.y * dt; p.tumble.z += p.spin.z * dt;
    p.inflate = Math.max(0, p.inflate - dt * 0.7);
  }

  // ---------- repère visuel du pilote (balancier sous la voile) ----------
  function frame(p, dt) {
    let tx = 0, ty = 1, tz = 0;
    const a = p.aero, al = Math.hypot(a.x, a.y, a.z);
    if (p.mode === 'air' && p.inflate > 0.5 && al > 60) { tx = a.x / al; ty = a.y / al; tz = a.z / al; }
    else if (p.mode !== 'air') {
      const n = W().normalAt(p.pos.x, p.pos.z);
      tx = n.x * 0.35; ty = 0.65 + n.y * 0.35; tz = n.z * 0.35;
      const l = Math.hypot(tx, ty, tz); tx /= l; ty /= l; tz /= l;
    }
    // ressort amorti : léger dépassement, comme un pendule
    const k = 24, c = 4.2, u = p.up, uv = p.upV;
    uv.x += ((tx - u.x) * k - uv.x * c) * dt; uv.y += ((ty - u.y) * k - uv.y * c) * dt; uv.z += ((tz - u.z) * k - uv.z * c) * dt;
    u.x += uv.x * dt; u.y += uv.y * dt; u.z += uv.z * dt;
    const ul = Math.hypot(u.x, u.y, u.z); u.x /= ul; u.y /= ul; u.z /= ul;
    let fx = p.vel.x, fy = p.vel.y, fz = p.vel.z;
    if (Math.hypot(fx, fy, fz) < 0.5) { fx = p.dir.x; fy = 0; fz = p.dir.z; }
    const d = fx * u.x + fy * u.y + fz * u.z;
    fx -= u.x * d; fy -= u.y * d; fz -= u.z * d;
    const fl = Math.hypot(fx, fy, fz) || 1;
    p.fwd.x = fx / fl; p.fwd.y = fy / fl; p.fwd.z = fz / fl;
    // droite = avant × haut
    p.right.x = p.fwd.y * u.z - p.fwd.z * u.y; p.right.y = p.fwd.z * u.x - p.fwd.x * u.z; p.right.z = p.fwd.x * u.y - p.fwd.y * u.x;
  }

  // ---------- points de contact (buste, centre et bouts de la voile) ----------
  function points(p) {
    const u = p.up, r = p.right, P = p.pos;
    const at = (h, s) => [P.x + u.x * h + r.x * s, P.y + u.y * h + r.y * s, P.z + u.z * h + r.z * s];
    return [
      { q: at(1.1, 0), pad: 0.35, wing: false },
      { q: at(GEO.wingTop, 0), pad: 0.45, wing: true },
      { q: at(GEO.tipY, GEO.tipX), pad: 0.35, wing: true },
      { q: at(GEO.tipY, -GEO.tipX), pad: 0.35, wing: true }
    ];
  }
  function collide(p) {
    if (p.mode === 'ready' || p.mode === 'crash' || p.mode === 'stopped') return null;
    const w = W();
    for (const pt of points(p)) {
      if (pt.wing && p.inflate < 0.85) continue;
      const [x, y, z] = pt.q;
      const why = w.hit(x, y, z, pt.pad);
      if (why) return pt.wing ? why + ' (voile)' : why;
      if (pt.wing && p.mode === 'air' && y < w.heightAt(x, z) + 0.15) return 'Voile dans la pente';
    }
    if (!w.inBounds(p.pos.x, p.pos.z)) return 'Hors parcours';
    return null;
  }

  // ---------- distance au relief (sol + parois) ----------
  function clearance(p) {
    const w = W(), P = p.pos;
    const agl = P.y - w.heightAt(P.x, P.z);
    let rx = p.right.x, rz = p.right.z; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    let wall = 99;
    for (const d of [3, 6, 10, 15]) {
      if (d >= wall) break;
      for (const sg of [-1, 1]) if (w.heightAt(P.x + rx * d * sg, P.z + rz * d * sg) > P.y + 0.5) { wall = d; break; }
    }
    return { agl, wall, c: Math.min(agl, wall) };
  }

  return { WING, GEO, G, M, create, step, collide, clearance, points, crash };
})();
if (typeof module !== 'undefined') module.exports = FLIGHT;
