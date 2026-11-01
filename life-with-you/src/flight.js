// Physique de vol d'une voile de speed riding (modèle à point matériel) et glisse à skis.
// Portance et traînée réelles : L = ½ρV²S·CL, D = ½ρV²S·(CD0 + k·CL²). Deux poignées de frein, comme en vrai :
// les deux tirées = plus de CL (ralentir, remonter, arrondir) ; une seule = la voile s'incline et tourne de ce côté ;
// tenue à fond, elle part en spirale. Freins à fond trop lent = décrochage. L'énergie se conserve.
const FLIGHT = (() => {
  const G = 9.81, RHO = 1.0, M = 90; // air à ~2 000 m, pilote + matériel
  // Voile de speed riding de 9,5 m², trims ouverts : ~71 km/h mains hautes (finesse ~2,7), finesse max ~3,1 freins à moitié,
  // ~45 km/h freins à fond. Virage sans limite : un frein tenu fait pencher de plus en plus (spirale qui se resserre
  // jusqu'à ~88°, > 100 km/h, ~4,5 g) ; si on ne relâche pas, on finit au sol
  const WING = { nom: 'Voile 9,5 m²', S: 9.5, cd0: 0.12, k: 0.22, clTrim: 0.45, clMax: 1.15, bankMax: 62 * Math.PI / 180, bankDeep: 88 * Math.PI / 180,
    tauHand: 0.1, nMax: 4.5, stallV: 10.2,
    // voile nerveuse : elle bascule sous le frein en ~0,2 s et plonge dans le virage ; le pilote, en retard, part à l'extérieur
    // puis revient en dépassant (pendule ~2,2 s, peu amorti) et entraîne un peu la voile : en alternant, on enchaîne des wingovers
    tauBank: 0.17, rollK: 8.2, rollC: 0.9, swingPull: 0.2, turnDive: 0.24, bankLim: 89 * Math.PI / 180,
    // pendule en tangage : tirer = la voile cabre et dépasse (ressource), relâcher = elle plonge (abattée)
    pitchK: 26, pitchC: 4.6 };
  const MU_SKI = 0.055, MU_STOP = 0.35, PILOT_CDA = 0.5;
  // géométrie (m, au-dessus des pieds) : mousquetons, centre de la voile, bouts d'aile
  const GEO = { carab: 1.35, lineLen: 5.6, halfAngle: 40 * Math.PI / 180 };
  GEO.wingTop = GEO.carab + GEO.lineLen;
  GEO.tipY = GEO.carab + GEO.lineLen * Math.cos(GEO.halfAngle);
  GEO.tipX = GEO.lineLen * Math.sin(GEO.halfAngle);

  const W = () => WORLD;
  const D2R = Math.PI / 180;
  const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  // ---------- modèle à deux corps : voile légère + pilote lourd reliés par les suspentes ----------
  // La voile reçoit portance, traînée et force latérale selon son angle d'attaque (α) et son dérapage (β) ;
  // le pilote reçoit son poids et sa traînée. Les suspentes (tige rigide pieds → centre de voile) les relient.
  // La voile tourne (lacet) sous l'effet des freins, revient dans le vent (effet girouette) : le virage, le balancement,
  // l'abattée, la ressource, la spirale et le décrochage en découlent.
  const TB = {
    Mp: 85, Mw: 5, MwI: 13,                 // pilote, voile (poids), voile + air entraîné (inertie)
    L: GEO.carab + GEO.lineLen,             // des pieds au centre de la voile
    S: 9.5, span: 7.2, CLa: 3.6, a0: -2 * D2R, chordTrim: 7 * D2R,
    CD0: 0.075, k: 0.11, CdAp: 0.5,          // traînée de la voile (+ suspentes) et du pilote
    dCLb: 0.55, dCDb: 0.12, aStall: 18 * D2R, aStallB: 5 * D2R,
    cY: 0.5,                                 // force latérale de dérapage (faible : la voile s'aligne vite sur son vent relatif)
    tauYaw: 0.12,                            // la voile s'oriente dans son vent relatif en ~0,1 s
    rollKp: 28, rollKd: 16, rollMax: 0.6, rollCap: 0.8      // roulis de la voile : elle se porte vite vers l'inclinaison voulue (force ≤ 0,6 × portance)
  };

  function create() {
    const S = W().START;
    return {
      pos: { x: S.x, y: S.y, z: S.z }, vel: { x: 0, y: 0, z: 0 }, dir: { x: S.dx, y: 0, z: S.dz },
      cl: WING.clTrim, bank: 0, inflate: 0, mode: 'ready', launched: false,
      up: { x: 0, y: 1, z: 0 }, upV: { x: 0, y: 0, z: 0 }, fwd: { x: S.dx, y: 0, z: S.dz }, right: { x: -S.dz, y: 0, z: S.dx },
      aero: { x: 0, y: 0, z: 0 }, t: 0, stopT: 0, groundT: 0, airT: 0, crashT: 0, V: 0, gload: 1, vn: 0, inp: { l: 0, r: 0 },
      bl: 0, br: 0, spiralT: 0, stall: false, stallT: 0, departT: 0, bankV: 0, clV: 0, swing: 0, swingV: 0, free: false, tensAcc: 0, tensN: 0,
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
    // garde réduite : le frein agit presque dès le début de la course
    const garde = b => Math.max(0, (b - 0.03) / 0.97);
    const el = garde(p.bl), er = garde(p.br);
    if (!p.free && p.inflate >= 1 && (p.mode === 'air' || p.mode === 'ski')) freeInit(p);
    if (p.free) return stepFree(p, el, er, dt, ev);
    // part commune des deux freins (plus de CL) et différence (virage) ; un seul frein ralentit peu la voile
    const sym = Math.min(el, er) + 0.12 * Math.abs(er - el), dif = er - el;
    // quand la voile bascule, elle plonge dans le virage (moins d'incidence) : elle prend de la vitesse au lieu d'en perdre
    const dive = WING.turnDive * Math.min(1, Math.abs(p.bankV) / 1.5);
    const clT = WING.clTrim + (WING.clMax - WING.clTrim) * Math.pow(sym, 1.15) - dive;
    // incidence en pendule : elle dépasse sa consigne puis revient
    p.clV += ((clT - p.cl) * WING.pitchK - p.clV * WING.pitchC) * dt;
    p.cl = Math.min(1.32, Math.max(0.24, p.cl + p.clV * dt));
    // virage sans limite : tant qu'un frein est tenu, la voile penche de plus en plus (d'autant plus vite qu'on tire fort)
    const ad = Math.abs(dif);
    if (p.mode === 'air' && ad > 0.3) p.spiralT += dt * (ad - 0.3) / 0.7; else p.spiralT = Math.max(0, p.spiralT - dt * 2.5);
    const deep = Math.min(1, Math.max(0, (p.spiralT - 0.5) / 2.5));
    const bankT = p.mode === 'air' ? Math.sign(dif) * (ad * WING.bankMax + deep * (WING.bankDeep - ad * WING.bankMax)) : 0;
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

  // ---------- modèle à deux corps ----------
  const v3 = (x, y, z) => ({ x, y, z });
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const nrm = a => { const l = Math.hypot(a.x, a.y, a.z) || 1; return v3(a.x / l, a.y / l, a.z / l); };
  // inclinaison des suspentes, mesurée par rapport à la trajectoire horizontale du pilote (bien définie même en spirale)
  function bankOf(p, u) {
    let hx = p.vel.x, hz = p.vel.z, hl = Math.hypot(hx, hz);
    if (hl < 2) { hx = p.wf.x; hz = p.wf.z; hl = Math.hypot(hx, hz) || 1; }
    return Math.atan2((u.x * -hz + u.z * hx) / hl, u.y);
  }
  function freeInit(p) {
    const u = nrm(p.up.y > 0.3 ? p.up : v3(0, 1, 0));
    p.wp = v3(p.pos.x + u.x * TB.L, p.pos.y + u.y * TB.L, p.pos.z + u.z * TB.L);
    p.wv = v3(p.vel.x, p.vel.y, p.vel.z);
    const fl = Math.hypot(p.dir.x, p.dir.z) || 1;
    p.wf = v3(p.dir.x / fl, 0, p.dir.z / fl);
    p.yr = 0; p.tension = M * G; p.free = true; p.bankT = 0; p.lastBR = undefined; p.alpha = 0; p.beta = 0; p.bank = 0; p.swing = 0; p.bankV = 0;
    p.skiDir = v3(p.wf.x, 0, p.wf.z);
  }
  // un sous-pas : forces, intégration, suspentes, lacet de la voile, contact des pieds avec la neige
  function subFree(p, el, er, h, gnd) {
    const w = W(), pp = p.pos, vp = p.vel, pw = p.wp, vw = p.wv;
    const u = nrm(v3(pw.x - pp.x, pw.y - pp.y, pw.z - pp.z));
    let f = p.wf; const fu = dot(f, u); f = nrm(v3(f.x - u.x * fu, f.y - u.y * fu, f.z - u.z * fu));
    const sv = cross(f, u);                                   // droite de la voile
    const ct = Math.cos(TB.chordTrim), st = Math.sin(TB.chordTrim);
    const c = v3(f.x * ct - u.x * st, f.y * ct - u.y * st, f.z * ct - u.z * st);   // corde (nez un peu en bas)
    const nc = cross(sv, c);                                  // normale à la corde
    const wd = w.windAt(p.t);
    const va = v3(vw.x - wd.x, vw.y - wd.y, vw.z - wd.z), V = Math.hypot(va.x, va.y, va.z) || 1e-6;
    const vh = v3(va.x / V, va.y / V, va.z / V);
    const alpha = Math.atan2(-dot(va, nc), dot(va, c)), beta = Math.asin(Math.max(-1, Math.min(1, dot(va, sv) / V)));
    // part commune des freins (un frein seul agit surtout sur sa moitié et sert à tourner)
    const bs = Math.min(el, er) + 0.3 * Math.abs(er - el), bd = er - el, inf = p.inflate * p.inflate;
    const aS = TB.aStall - TB.aStallB * bs;
    const stallF = sstep(aS, aS + 0.14, alpha);
    let CL = (TB.CLa * (alpha - TB.a0) + TB.dCLb * bs) * (1 - 0.55 * stallF);
    CL = Math.max(-0.6, Math.min(1.6, CL));
    // fermeture frontale : si la voile plonge trop (angle d'attaque négatif), le bord d'attaque se ferme et la portance s'effondre
    if (alpha < -3.5 * D2R && p.mode === 'air' && !p.collapseT) p.collapseT = 1.1;
    const col = p.collapseT > 0 ? sstep(0, 0.4, p.collapseT) : 0;
    CL *= 1 - 0.75 * col;
    // effet de sol : sous une demi-envergure, la traînée induite diminue (la voile plane mieux au ras de la neige)
    const aglW = pw.y - w.heightAt(pw.x, pw.z), ge = 1 - 0.45 * Math.exp(-Math.max(0, aglW) / (TB.span * 0.35));
    const CD = TB.CD0 + TB.k * ge * CL * CL + TB.dCDb * bs + 0.55 * stallF + 0.25 * col;
    const q = 0.5 * RHO * V * V, qS = q * TB.S * inf;
    let lx = nc.x - vh.x * dot(nc, vh), ly = nc.y - vh.y * dot(nc, vh), lz = nc.z - vh.z * dot(nc, vh);
    const ll = Math.hypot(lx, ly, lz) || 1; lx /= ll; ly /= ll; lz /= ll;
    const Y = -qS * TB.cY * beta;
    // roulis : freins (et report de poids) → inclinaison visée ; la voile légère s'y porte, le pilote suit au bout des suspentes
    const vhl = Math.hypot(vp.x, vp.z) > 2 ? Math.hypot(vp.x, vp.z) : 0;
    const rH = vhl ? v3(-vp.z / vhl, 0, vp.x / vhl) : nrm(v3(-f.z, 0, f.x));
    const bankRod = bankOf(p, u);
    const bankRate = p.lastBR === undefined ? 0 : (bankRod - p.lastBR) / h; p.lastBR = bankRod;
    const eu = dot(u, rH), er2 = nrm(v3(rH.x - u.x * eu, rH.y - u.y * eu, rH.z - u.z * eu));
    // au-delà de 90° (voile plus basse que l'horizontale du pilote), on la ramène du même côté, jamais par-dessus
    const tgt = Math.abs(bankRod) > Math.PI / 2 ? Math.sign(bankRod) * 1.3 : p.bankT;
    let Fr = TB.MwI * TB.L * (TB.rollKp * (tgt - bankRod) - TB.rollKd * bankRate);
    // sans portance (voile déchargée), pas de roulis possible ; plafond absolu (le report de poids et le frein ont une autorité limitée)
    const Frm = Math.min(TB.rollMax * Math.max(0, qS * CL), TB.rollCap * M * G);
    Fr = Math.max(-Frm, Math.min(Frm, Fr)) * inf;
    const Fw = v3(qS * (CL * lx - CD * vh.x) + Y * sv.x + Fr * er2.x, qS * (CL * ly - CD * vh.y) + Y * sv.y + Fr * er2.y - TB.Mw * G, qS * (CL * lz - CD * vh.z) + Y * sv.z + Fr * er2.z);
    // pilote : poids et traînée (et voile dégonflée qui traîne derrière à l'atterrissage)
    const Vp = Math.hypot(vp.x, vp.y, vp.z), qp = 0.5 * RHO * Vp * TB.CdAp * (1 + 1.5 * (1 - inf));
    const Fp = v3(-qp * vp.x, -qp * vp.y - TB.Mp * G, -qp * vp.z);
    if (gnd && gnd.push) { Fp.x += gnd.push.x; Fp.z += gnd.push.z; }
    vw.x += Fw.x / TB.MwI * h; vw.y += Fw.y / TB.MwI * h; vw.z += Fw.z / TB.MwI * h;
    vp.x += Fp.x / TB.Mp * h; vp.y += Fp.y / TB.Mp * h; vp.z += Fp.z / TB.Mp * h;
    pw.x += vw.x * h; pw.y += vw.y * h; pw.z += vw.z * h;
    pp.x += vp.x * h; pp.y += vp.y * h; pp.z += vp.z * h;
    // suspentes : elles ne font que tirer (longueur maximale) ; corrections pondérées par les masses, tension déduite de l'impulsion
    let dx = pw.x - pp.x, dy = pw.y - pp.y, dz = pw.z - pp.z;
    const len = Math.hypot(dx, dy, dz) || 1; dx /= len; dy /= len; dz /= len;
    const e = len - TB.L, mt = TB.Mp + TB.MwI;
    if (e > 0) {
      pw.x -= dx * e * TB.Mp / mt; pw.y -= dy * e * TB.Mp / mt; pw.z -= dz * e * TB.Mp / mt;
      pp.x += dx * e * TB.MwI / mt; pp.y += dy * e * TB.MwI / mt; pp.z += dz * e * TB.MwI / mt;
    }
    const vrel = (vw.x - vp.x) * dx + (vw.y - vp.y) * dy + (vw.z - vp.z) * dz;
    if (e > -0.02 && vrel > 0) {
      const J = vrel * TB.MwI * TB.Mp / mt;
      vw.x -= dx * J / TB.MwI; vw.y -= dy * J / TB.MwI; vw.z -= dz * J / TB.MwI;
      vp.x += dx * J / TB.Mp; vp.y += dy * J / TB.Mp; vp.z += dz * J / TB.Mp;
      p.tensAcc += J / h;
    } else p.slackT = (p.slackT || 0) + h;
    p.tensN++;
    // cap de la voile : elle s'aligne sur son vent relatif (effet girouette) ; le frein la fait pivoter un peu de son côté
    // (vent relatif complet, projeté perpendiculairement aux suspentes : en virage, la descente fait partie du vent de la voile)
    const vau = dot(va, u), tpx = va.x - u.x * vau, tpy = va.y - u.y * vau, tpz = va.z - u.z * vau, tpl = Math.hypot(tpx, tpy, tpz);
    if (tpl > 1) {
      const k = 1 - Math.exp(-h / TB.tauYaw);
      const tx0 = tpx / tpl + sv.x * 0.12 * bd, ty0 = tpy / tpl + sv.y * 0.12 * bd, tz0 = tpz / tpl + sv.z * 0.12 * bd;
      p.wf = nrm(v3(f.x + (tx0 - f.x) * k, f.y + (ty0 - f.y) * k, f.z + (tz0 - f.z) * k));
    }
    // pieds au sol : appui, frottement (proportionnel à l'appui) et accroche des skis
    const hg = w.heightAt(pp.x, pp.z);
    if (gnd && pp.y <= hg + 0.02) {
      const n = w.normalAt(pp.x, pp.z);
      pp.y = hg;
      const vn = vp.x * n.x + vp.y * n.y + vp.z * n.z;
      if (vn < 0) {
        gnd.impact = Math.max(gnd.impact, -vn);
        vp.x -= n.x * vn; vp.y -= n.y * vn; vp.z -= n.z * vn;
        const sp = Math.hypot(vp.x, vp.y, vp.z);
        if (sp > 1e-3) { const k = Math.max(0, 1 - gnd.mu * -vn / sp); vp.x *= k; vp.y *= k; vp.z *= k; }
      }
      // les skis glissent dans leur axe, pas de côté
      const sd = p.skiDir, side = nrm(cross(n, sd)), lat = dot(vp, side), kk = Math.min(1, h * 6);
      vp.x -= side.x * lat * kk; vp.y -= side.y * lat * kk; vp.z -= side.z * lat * kk;
      gnd.on = true;
    }
    p.alpha = alpha; p.beta = beta; p.clNow = CL; p.stallF = stallF;
  }
  function stepFree(p, el, er, dt, ev) {
    const w = W(), wasAir = p.mode === 'air';
    if (p.collapseT > 0) { if (!p.collapseSaid) { p.collapseSaid = true; ev.push({ type: 'fermeture' }); } p.collapseT = Math.max(0, p.collapseT - dt); if (!p.collapseT) p.collapseSaid = false; }
    const dif = er - el, ad = Math.abs(dif);
    // la spirale se resserre si on tient le même frein ; changer de côté repart de zéro
    if (Math.sign(dif) !== p.spiralSide && ad > 0.3) { p.spiralT = 0; p.spiralSide = Math.sign(dif); }
    if (p.mode === 'air' && ad > 0.3) p.spiralT += dt * (ad - 0.3) / 0.7; else p.spiralT = Math.max(0, p.spiralT - dt * 2.5);
    const deep = Math.min(1, Math.max(0, (p.spiralT - 0.5) / 2.5));
    p.bankT = p.mode === 'air' ? Math.sign(dif) * (ad * WING.bankMax + deep * (WING.bankDeep - ad * WING.bankMax)) : 0;
    if (p.mode === 'landing') p.inflate = Math.max(0, p.inflate - dt * 0.8);
    // les skis suivent peu à peu le cap de la voile
    const fh = nrm(v3(p.wf.x, 0, p.wf.z)), ks = Math.min(1, dt * 2.5);
    p.skiDir = nrm(v3(p.skiDir.x + (fh.x - p.skiDir.x) * ks, 0, p.skiDir.z + (fh.z - p.skiDir.z) * ks));
    const gnd = { on: false, impact: 0, mu: p.mode === 'landing' ? 0.35 : 0.055, push: null };
    if (p.mode === 'ski' && !p.launched) {
      p.departT += dt;
      const sp = Math.hypot(p.vel.x, p.vel.z);
      if (p.departT < 4 && sp < 7) gnd.push = v3(p.skiDir.x * M * 1.6, 0, p.skiDir.z * M * 1.6);
    }
    p.tensAcc = 0; p.tensN = 0;
    const b0 = p.bank;
    subFree(p, el, er, dt / 2, gnd); subFree(p, el, er, dt / 2, gnd);
    p.V = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
    p.gload += (Math.max(0, p.tensAcc / Math.max(1, p.tensN)) / (M * G) - p.gload) * Math.min(1, dt * 10);
    p.cl = Math.max(0.24, Math.min(1.32, p.clNow));
    // repère : axe des suspentes, cap de la voile, inclinaison mesurée sur l'horizon
    const u = nrm(v3(p.wp.x - p.pos.x, p.wp.y - p.pos.y, p.wp.z - p.pos.z));
    let f = p.wf; const fu = dot(f, u); f = nrm(v3(f.x - u.x * fu, f.y - u.y * fu, f.z - u.z * fu));
    p.up = u; p.upV = v3(0, 0, 0); p.fwd = f; p.right = cross(f, u);
    p.bank = bankOf(p, u); p.swing = p.bank; p.bankV = (p.bank - b0) / dt;
    p.aero = v3(u.x * p.gload * M * G, u.y * p.gload * M * G, u.z * p.gload * M * G);
    // décrochage : angle d'attaque au-delà du décrochage (freins à fond, trop lent) ; on en sort en relâchant
    p.stallHold = p.stallF > 0.5 && p.mode === 'air' ? (p.stallHold || 0) + dt : 0;
    if (!p.stall && p.stallHold > 0.35) { p.stall = true; ev.push({ type: 'decrochage' }); }
    else if (p.stall && p.stallF < 0.1) { p.stall = false; ev.push({ type: 'raccroche' }); }
    const vhz = Math.hypot(p.vel.x, p.vel.z);
    if (vhz > 0.5) { p.dir.x = p.vel.x / vhz; p.dir.z = p.vel.z / vhz; }
    if (gnd.on) {
      if (wasAir && p.airT < 0.3 && gnd.impact < 1.5 && -p.pos.z <= w.LAND.from) {
        // juste après l'envol (arête, bosse) : simple frottement, on reste en vol
      } else if (wasAir) {
        // contact avec la neige
        const vn = gnd.impact; p.vn = vn;
        if (w.surfaceAt(p.pos.x, p.pos.z) === 'rock') return crash(p, 'Rocher', ev);
        if (vn > 7) return crash(p, 'Impact trop dur', ev);
        if (Math.abs(p.bank) > 0.8) return crash(p, 'Carre accrochée', ev);
        const landing = -p.pos.z > w.LAND.from;
        p.mode = landing ? 'landing' : 'ski'; p.lastAirT = p.airT; p.groundT = 0;
        if (landing || p.airT > 0.25 || vn > 1.5) ev.push({ type: 'contact', vn, landing, x: p.pos.x, z: p.pos.z, V: p.V });
      } else {
        p.groundT += dt;
        p.stopT = p.V < 0.8 ? p.stopT + dt : 0;
        // un bord (le relief 3 m devant tombe plus vite qu'une chute libre) n'est pas un choc : on va s'envoler
        const vhz = Math.hypot(p.vel.x, p.vel.z);
        let edge = false;
        if (vhz > 5) {
          const tt = 3 / vhz, gE = G * Math.max(0, 1 - p.gload * p.up.y);
          edge = w.heightAt(p.pos.x + p.vel.x / vhz * 3, p.pos.z + p.vel.z / vhz * 3) < p.pos.y + p.vel.y * tt - 0.5 * gE * tt * tt - 0.06;
        }
        if (!edge && p.V > 3 && w.surfaceAt(p.pos.x, p.pos.z) === 'rock' && w.surfaceAt(p.pos.x + p.vel.x * 0.15, p.pos.z + p.vel.z * 0.15) === 'rock') return crash(p, 'Rocher', ev);
        if (p.mode === 'ski' && p.launched && -p.pos.z > w.LAND.from) {
          p.mode = 'landing';
          ev.push({ type: 'contact', vn: p.vn || 0, landing: true, x: p.pos.x, z: p.pos.z, V: p.V, glisse: true });
        }
        if (p.mode === 'landing' && p.V < 0.9) { p.mode = 'stopped'; ev.push({ type: 'pose' }); }
        else if (p.mode === 'ski' && p.launched && p.stopT > 1.2) { p.mode = 'stopped'; ev.push({ type: 'arret' }); }
      }
    } else if (p.mode !== 'air' && p.mode !== 'landing') {
      // les pieds quittent la neige : décollage
      p.mode = 'air'; p.airT = 0;
      ev.push({ type: p.launched ? 'redecollage' : 'decollage', groundT: p.groundT, airBefore: p.lastAirT || 0 });
      p.launched = true;
    }
    if (p.mode === 'air') p.airT += dt;
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

  return { WING, GEO, TB, G, M, create, step, collide, clearance, points, crash };
})();
if (typeof module !== 'undefined') module.exports = FLIGHT;
