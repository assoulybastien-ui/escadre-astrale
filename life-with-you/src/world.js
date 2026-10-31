// Monde : relief de la descente (généré), obstacles, portes, télésiège, village, cible.
// Repère : x vers la droite, y vers le haut ; la descente part vers −z. s = −z = distance vers l'aval (m).
const WORLD = (() => {
  const { make, rng, fbm, ridged } = NOISE;
  const nA = make(1337), nB = make(4242), nC = make(77), nD = make(2024), nE = make(5150);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ---------- Profil de la ligne de pente : tangente de la pente selon s ----------
  // départ à skis (~17°), face (~27°), barre rocheuse (~20 m), replat, couloir (~21°), ressaut, bosses, forêt, prairie.
  // Une voile accélérée plane à ~23° : on suit les pentes douces en piqué, les ressauts font « décoller » le sol.
  const SLOPE = [[-700, 0.05], [-140, 0.03], [-78, 0.06], [-64, 0.30], [0, 0.32], [25, 0.5], [140, 0.52], [146, 2.6], [153, 2.6],
    [158, 0.36], [250, 0.36], [270, 0.42], [455, 0.42], [470, 0.62], [495, 0.62], [510, 0.36], [720, 0.32], [880, 0.15], [960, 0.045],
    [1200, 0.025], [1330, 0], [3400, 0]];
  // Couloir de la descente : [s, demi-largeur ouverte, hauteur des parois, largeur des parois, pente des flancs]
  const CORR = [[-700, 90, 0, 30, 0.22], [-70, 80, 0, 30, 0.25], [0, 130, 0, 30, 0.3], [205, 140, 0, 30, 0.3], [245, 44, 40, 22, 0.35],
    [275, 30, 58, 16, 0.42], [455, 30, 58, 16, 0.42], [505, 85, 8, 30, 0.3], [770, 92, 0, 30, 0.28], [810, 72, 0, 30, 0.24],
    [950, 72, 0, 30, 0.2], [1010, 190, 0, 40, 0.12], [1300, 230, 0, 40, 0.08], [1450, 700, 0, 40, 0.04], [3400, 700, 0, 40, 0.04]];

  function lin(pts, s, k) {
    if (s <= pts[0][0]) return pts[0][k];
    for (let i = 1; i < pts.length; i++) if (s <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; return a[k] + (b[k] - a[k]) * (s - a[0]) / (b[0] - a[0]); }
    return pts[pts.length - 1][k];
  }
  function smooth(pts, s, k) {
    if (s <= pts[0][0]) return pts[0][k];
    for (let i = 1; i < pts.length; i++) if (s <= pts[i][0]) {
      const a = pts[i - 1], b = pts[i], t = (s - a[0]) / (b[0] - a[0]);
      return a[k] + (b[k] - a[k]) * t * t * (3 - 2 * t);
    }
    return pts[pts.length - 1][k];
  }
  // Intégration du profil (altitude relative au fond de vallée)
  const S0 = -700, S1 = 3400, prof = new Float32Array(S1 - S0 + 1);
  (() => {
    let h = 0;
    for (let i = 0; i < prof.length; i++) { prof[i] = h; h -= lin(SLOPE, S0 + i + 0.5, 1); }
    const ref = prof[1330 - S0];
    for (let i = 0; i < prof.length; i++) prof[i] -= ref;
  })();
  function P(s) { const f = clamp(s - S0, 0, prof.length - 1.0001), i = f | 0; return prof[i] + (prof[i + 1] - prof[i]) * (f - i); }
  // Ligne médiane de la descente (légers méandres)
  function xc(s) {
    const m = sstep(-260, -120, s) * (1 - sstep(900, 1040, s));
    return m * (26 * Math.sin(s / 185 + 0.3) + 9 * Math.sin(s / 79 + 1.1));
  }
  const LAND = { s: 955, x: xc(955), z: -955, r: 90 };

  // ---------- Relief analytique ----------
  function hRaw(x, z) {
    const s = -z, c = xc(s), u = x - c, a = Math.abs(u);
    const w = smooth(CORR, s, 1), wallH = smooth(CORR, s, 2), wallW = smooth(CORR, s, 3), side = smooth(CORR, s, 4);
    const e = Math.max(0, a - w), am = Math.min(a, w);
    let h = P(s) + side * e + 0.0011 * e * e + (wallH > 0.5 ? 0.0035 : 0.001) * am * am;
    // parois rocheuses du couloir
    if (wallH > 0.5) { const k = sstep(0, wallW, e); h += k * (wallH * (1 + 0.22 * ridged(nB, x / 24, s / 24, 3)) + 5 * (ridged(nE, x / 10, s / 10, 2) - 0.45)); }
    // massifs latéraux
    const sm = sstep(240, 760, a) * (1 - sstep(1150, 1500, s));
    if (sm > 0) h += sm * (360 + 720 * ridged(nB, x / 640, s / 640, 4));
    // sommet derrière le départ
    const bk = sstep(130, 560, -s);
    if (bk > 0) h += bk * (320 + 560 * ridged(nC, x / 520, s / 520, 4));
    // massif d'en face, de l'autre côté de la vallée
    const op = sstep(1750, 3100, s);
    if (op > 0) h += op * (1150 + 950 * ridged(nD, x / 820, s / 820, 5));
    // ondulations (gommées autour de la cible)
    const dT = Math.hypot(x - LAND.x, s - LAND.s), m = sstep(75, 150, dT);
    h += m * ((4.5 + 2.5 * sstep(w * 0.6, w + 20, a)) * fbm(nA, x / 150, s / 150, 3) + 1.4 * fbm(nC, x / 34, s / 34, 2));
    // bosses (rouleaux) au milieu de la descente
    const rw = sstep(480, 540, s) * (1 - sstep(740, 800, s)) * (1 - sstep(w * 0.7, w + 10, a));
    if (rw > 0) h += rw * 3.3 * Math.sin(s * 0.131 + 0.9 * Math.sin(x / 40));
    // pointements rocheux dans la face
    const fw = sstep(15, 60, s) * (1 - sstep(215, 255, s));
    if (fw > 0) h += fw * 11 * Math.max(0, ridged(nD, x / 55, s / 55, 3) - 0.6);
    return h;
  }

  // ---------- Grille fine (même triangulation que le rendu) ----------
  const GX0 = -330, GX1 = 330, GZ0 = -1605, GZ1 = 210, DX = 3;
  const NX = Math.round((GX1 - GX0) / DX) + 1, NZ = Math.round((GZ1 - GZ0) / DX) + 1;
  const H = new Float32Array(NX * NZ);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) H[j * NX + i] = hRaw(GX0 + i * DX, GZ0 + j * DX);

  function heightAt(x, z) {
    const fx = (x - GX0) / DX, fz = (z - GZ0) / DX;
    if (fx < 0 || fz < 0 || fx >= NX - 1 || fz >= NZ - 1) return hRaw(x, z);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * NX + i;
    const a = H[k], b = H[k + 1], c = H[k + NX], d = H[k + NX + 1];
    if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  }
  function grad(x, z) {
    return [(heightAt(x + DX, z) - heightAt(x - DX, z)) / (2 * DX), (heightAt(x, z + DX) - heightAt(x, z - DX)) / (2 * DX)];
  }
  function normalAt(x, z) { const g = grad(x, z), l = Math.hypot(g[0], 1, g[1]); return { x: -g[0] / l, y: 1 / l, z: -g[1] / l }; }
  // > 1 : roche (pente forte), sinon neige
  function rockiness(g, x, z) { return g + 0.22 * nE(x / 17, z / 17); }
  function surfaceAt(x, z) { const g = grad(x, z); return rockiness(Math.hypot(g[0], g[1]), x, z) > 1 ? 'rock' : 'snow'; }

  const rnd = rng(31337);

  // ---------- Départ ----------
  const START = (() => {
    const s = -50, x = xc(s), z = -s, d = (xc(s + 1) - xc(s - 1)) / 2, l = Math.hypot(d, 1);
    return { s, x, z, y: heightAt(x, z), dx: d / l, dz: -1 / l };
  })();

  // ---------- Village (chalets autour de la prairie) ----------
  const CHALETS = [];
  for (const [du, ds] of [[-100, 25], [-128, -18], [-150, 58], [-92, 112], [98, 38], [136, -4], [120, 96], [62, 150], [-34, 176],
    [170, 150], [-178, 128], [24, 222], [-70, 240], [110, 205]]) {
    const s = LAND.s + ds, x = xc(s) + du, z = -s;
    const yaw = (rnd() - 0.5) * 0.5 + (du > 0 ? 0.12 : -0.12);
    const w = 8 + rnd() * 4, d = 7 + rnd() * 3, wh = 4 + rnd() * 2, rh = 2.6 + rnd() * 1.2;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    let y = Infinity;
    for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) y = Math.min(y, heightAt(x + lx * c + lz * sn, z - lx * sn + lz * c));
    CHALETS.push({ x, y: y - 0.3, z, yaw, w, d, wh, rh });
  }
  function nearChalet(x, z, m) { for (const c of CHALETS) if (Math.hypot(x - c.x, z - c.z) < Math.max(c.w, c.d) / 2 + m) return true; return false; }

  // ---------- Télésiège qui traverse la descente ----------
  const CABLE = { s: 640, z: -640, pylons: [], segs: [], chairs: [], lines: [] };
  (() => {
    const PU = [-230, -48, 48, 230];
    const gc = heightAt(xc(CABLE.s), CABLE.z), sagIn = 0.032 * (PU[2] - PU[1]);
    for (const pu of PU) {
      const x = xc(CABLE.s) + pu, y = heightAt(x, CABLE.z) - 0.5;
      // pylônes du milieu : le câble passe à ~18 m au-dessus du fond de la combe
      const h = Math.abs(pu) < 100 ? clamp(gc + 18 + sagIn - y, 8, 26) : 15;
      CABLE.pylons.push({ x, y, z: CABLE.z, h });
    }
    for (const off of [-2.2, 2.2]) {
      const line = [];
      for (let k = 0; k < PU.length - 1; k++) {
        const A = CABLE.pylons[k], B = CABLE.pylons[k + 1], span = B.x - A.x, sag = 0.032 * span;
        const ya = A.y + A.h, yb = B.y + B.h;
        for (let t = (k === 0 ? 0 : 1); t <= 20; t++) {
          const f = t / 20;
          line.push({ x: A.x + span * f, y: ya + (yb - ya) * f - sag * 4 * f * (1 - f), z: CABLE.z + off });
        }
      }
      for (let i = 1; i < line.length; i++) CABLE.segs.push([line[i - 1], line[i]]);
      CABLE.lines.push(line);
      // sièges tous les ~24 m
      for (let i = 2; i < line.length - 2; i += 3) {
        const q = line[i];
        if (CABLE.pylons.some(p => Math.abs(p.x - q.x) < 8)) continue;
        if (Math.abs(q.x - xc(CABLE.s)) < 50) continue; // pas de siège au-dessus de la piste (télésiège à l'arrêt, sièges garés)
        CABLE.chairs.push({ x: q.x, y: q.y - 2.4, z: q.z });
      }
    }
  })();
  // hauteur du brin le plus bas à l'abscisse x
  function cableYAt(x) {
    let best = Infinity;
    for (const line of CABLE.lines) for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      if (x >= a.x && x <= b.x) { const t = (x - a.x) / (b.x - a.x); best = Math.min(best, a.y + (b.y - a.y) * t); }
    }
    return best;
  }

  // ---------- Portes (piquets orange) ----------
  const GATES = [[40, -18], [118, 22], [300, -8], [400, 10], [540, -32], [720, -26], [790, 20], [860, 2]].map(([s, du]) => {
    const x = xc(s) + du, z = -s, d = (xc(s + 1) - xc(s - 1)) / 2, l = Math.hypot(d, 1);
    const nx = d / l, nz = -1 / l;
    return { s, x, z, y: heightAt(x, z), nx, nz, tx: -nz, tz: nx, hw: 8, h: 14 };
  });

  LAND.from = GATES[GATES.length - 1].s + 3; // un contact au-delà compte comme atterrissage

  // ---------- Sapins ----------
  const TX = [], TY = [], TZ = [], TH = [], TR = [];
  for (let s = 255; s < 1430; s += 6.4) for (let x0 = GX0 + 8; x0 < GX1 - 8; x0 += 6.4) {
    const px = x0 + (rnd() - 0.5) * 5.8, ps = s + (rnd() - 0.5) * 5.8, pz = -ps;
    const a = Math.abs(px - xc(ps)), w = smooth(CORR, ps, 1);
    if (a < w + 5) continue;
    if (Math.hypot(px - LAND.x, ps - LAND.s) < 120) continue;
    if (Math.abs(ps - CABLE.s) < 14) continue;
    if (nearChalet(px, pz, 9)) continue;
    const g = grad(px, pz);
    if (Math.hypot(g[0], g[1]) > 0.78) continue;
    let dens = 0.22 + 0.78 * sstep(330, 640, ps);
    dens *= sstep(-0.45, 0.2, fbm(nA, px / 110, ps / 110, 2));
    dens *= 1 - 0.6 * sstep(1300, 1420, ps);
    if (rnd() > dens * 0.8) continue;
    const h = 8 + rnd() * 10;
    TX.push(px); TZ.push(pz); TY.push(heightAt(px, pz) - 0.2); TH.push(h); TR.push(h * (0.21 + rnd() * 0.06));
  }
  // sapins isolés dans le couloir de la forêt : il faut slalomer
  for (let ps = 742; ps < 935; ps += 9) {
    for (let k = 0; k < 3; k++) {
      if (rnd() > 0.32) continue;
      const w = smooth(CORR, ps, 1), px = xc(ps) + (rnd() * 2 - 1) * (w - 6), pz = -ps + (rnd() - 0.5) * 8;
      if (GATES.some(g => Math.abs(-pz - g.s) < 16 && Math.abs(px - g.x) < 22)) continue;
      // la ligne idéale d'une porte à l'autre reste dégagée sur ~9 m
      let dl = 1e9;
      for (let gi = 1; gi < GATES.length; gi++) {
        const A = GATES[gi - 1], B = GATES[gi], ex = B.x - A.x, ez = B.z - A.z;
        const t = clamp(((px - A.x) * ex + (pz - A.z) * ez) / (ex * ex + ez * ez), 0, 1);
        dl = Math.min(dl, Math.hypot(px - A.x - ex * t, pz - A.z - ez * t));
      }
      if (dl < 9) continue;
      if (TX.some((x, i) => Math.hypot(x - px, TZ[i] - pz) < 14)) continue;
      const h = 7 + rnd() * 8;
      TX.push(px); TZ.push(pz); TY.push(heightAt(px, pz) - 0.2); TH.push(h); TR.push(h * (0.22 + rnd() * 0.05));
    }
  }
  const TREES = { X: Float32Array.from(TX), Y: Float32Array.from(TY), Z: Float32Array.from(TZ), H: Float32Array.from(TH), R: Float32Array.from(TR), n: TX.length };
  const CELL = 8, TGRID = new Map();
  const key = (i, j) => (i + 500) * 4096 + (j + 2000);
  for (let i = 0; i < TREES.n; i++) {
    const k = key(Math.floor(TX[i] / CELL), Math.floor(TZ[i] / CELL));
    let L = TGRID.get(k); if (!L) TGRID.set(k, L = []); L.push(i);
  }

  // ---------- Rochers isolés ----------
  const ROCKS = [];
  for (let k = 0; k < 600 && ROCKS.length < 140; k++) {
    const ps = 20 + rnd() * 880, sd = rnd() < 0.5 ? -1 : 1, w = smooth(CORR, ps, 1);
    const px = xc(ps) + sd * w * (0.4 + rnd() * 0.85), pz = -ps;
    if (GATES.some(g => Math.hypot(g.x - px, g.z - pz) < 22)) continue;
    if (Math.abs(ps - CABLE.s) < 10) continue;
    const r = 0.8 + rnd() * rnd() * 2.6;
    ROCKS.push({ x: px, y: heightAt(px, pz) - r * 0.35, z: pz, r, rot: rnd() * 6.28 });
  }

  // ---------- Collisions ----------
  function segDist2(px, py, pz, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    let t = ((px - a.x) * dx + (py - a.y) * dy + (pz - a.z) * dz) / (dx * dx + dy * dy + dz * dz);
    t = clamp(t, 0, 1);
    const qx = a.x + dx * t - px, qy = a.y + dy * t - py, qz = a.z + dz * t - pz;
    return qx * qx + qy * qy + qz * qz;
  }
  // rayon du feuillage d'un sapin à la hauteur dy au-dessus de son pied (0 si hors du sapin)
  function treeR(i, dy) {
    const h = TREES.H[i]; if (dy < 0 || dy > h) return -1;
    const f = dy / h; return f < 0.16 ? 0.25 : TREES.R[i] * 0.85 * (1 - (f - 0.16) / 0.84);
  }
  function hit(x, y, z, pad) {
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const L = TGRID.get(key(ci + a, cj + b)); if (!L) continue;
      for (let k = 0; k < L.length; k++) {
        const i = L[k], rr = treeR(i, y - TREES.Y[i]); if (rr < 0) continue;
        const dx = x - TREES.X[i], dz = z - TREES.Z[i], R = rr + pad;
        if (dx * dx + dz * dz < R * R) return 'Sapin';
      }
    }
    for (const r of ROCKS) { const dx = x - r.x, dy = y - r.y, dz = z - r.z, R = r.r + pad; if (dx * dx + dy * dy + dz * dz < R * R) return 'Rocher'; }
    if (Math.abs(z - CABLE.z) < 12) {
      for (const p of CABLE.pylons) if (y > p.y && y < p.y + p.h + 0.5 && Math.hypot(x - p.x, z - p.z) < 0.8 + pad) return 'Pylône';
      for (const c of CABLE.chairs) { const dx = x - c.x, dy = y - c.y, dz = z - c.z, R = 1 + pad; if (dx * dx + dy * dy + dz * dz < R * R) return 'Télésiège'; }
      const R = 0.25 + pad;
      for (const sg of CABLE.segs) if (segDist2(x, y, z, sg[0], sg[1]) < R * R) return 'Câble';
    }
    for (const c of CHALETS) {
      const dx = x - c.x, dz = z - c.z; if (dx * dx + dz * dz > 400) continue;
      const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs, ly = y - c.y;
      const hw = c.w / 2 + pad, hd = c.d / 2 + pad;
      if (Math.abs(lx) < hw && Math.abs(lz) < hd && ly < c.wh + c.rh * (1 - Math.abs(lx) / hw) + pad && ly > -1) return 'Chalet';
    }
    return null;
  }
  // sapin le plus proche (pour le « frôlé ») : distance au feuillage
  function nearTree(x, y, z, Rmax) {
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    let best = -1, bd = Rmax;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const L = TGRID.get(key(ci + a, cj + b)); if (!L) continue;
      for (let k = 0; k < L.length; k++) {
        const i = L[k], rr = treeR(i, y - TREES.Y[i]); if (rr < 0) continue;
        const d = Math.hypot(x - TREES.X[i], z - TREES.Z[i]) - rr;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best < 0 ? null : { i: best, d: bd };
  }
  // Vent : brise légère et rafales lentes (difficulté « calme »)
  function windAt(t) { return { x: 0.8 * nA(t * 0.21, 3.3), y: 0.3 * nB(t * 0.33, 8.1), z: 0.8 * nC(t * 0.17, 1.9) }; }
  function inBounds(x, z) {
    const s = -z;
    return s > -160 && s < 1585 && Math.abs(x - xc(s)) < 300 && x > GX0 + 6 && x < GX1 - 6;
  }

  // Chiffres de la descente pour l'écran titre
  const FACTS = { length: Math.round(LAND.s - START.s), drop: Math.round(START.y - heightAt(LAND.x, LAND.z)), gates: GATES.length };

  return {
    name: 'Couloir des Aiguilles', clamp, sstep, hRaw, heightAt, grad, normalAt, rockiness, surfaceAt, xc, P, smooth, CORR,
    grid: { GX0, GX1, GZ0, GZ1, DX, NX, NZ, H }, LAND, START, GATES, CABLE, cableYAt, TREES, ROCKS, CHALETS, hit, nearTree, windAt,
    inBounds, FACTS, noise: { nA, nB, nC, nD, nE }
  };
})();
if (typeof module !== 'undefined') module.exports = WORLD;
