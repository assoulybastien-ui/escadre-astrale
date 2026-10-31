// Pilote automatique (deux freins, comme le joueur) : tests, vidéos, réglage des médailles. Jamais actif en vraie partie.
// À chaque instant il essaie plusieurs caps, mesure la marge avec le relief, les parois et les obstacles sur ~40 m,
// et choisit le cap le plus proche de son objectif qui reste sûr. Trop haut : virages en S pour descendre vers la neige.
const BOT = (() => {
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const CANDS = [-1.1, -0.8, -0.55, -0.35, -0.18, 0, 0.18, 0.35, 0.55, 0.8, 1.1];
  function make(opts = {}) {
    // réglage par défaut issu d'un balayage (8/8 portes, sans crash) : gain 1,6, amortissement 0,3, virages en S jusqu'à 40 m des portes
    const target = opts.agl || 3, gain = opts.gain || 1.6;
    if (opts.kd === undefined) opts.kd = 0.3;
    if (opts.weaveDist === undefined) opts.weaveDist = 40;
    return function (r) {
      const p = r.p, W = WORLD;
      if (p.mode === 'ready') return { l: 0, r: 0, go: true };
      if (p.mode === 'landing' || p.mode === 'stopped') return { l: 0.3, r: 0.3 };
      let g = W.GATES[r.gate];
      // sans portes : on suit le couloir avec un point de passage 70 m devant, jusqu'à la finale
      if (!g && -p.pos.z < W.LAND.s - 150) {
        const sw = -p.pos.z + 70, d = (W.xc(sw + 1) - W.xc(sw - 1)) / 2, l = Math.hypot(d, 1);
        g = { x: W.xc(sw), z: -sw, nx: d / l, nz: -1 / l, tx: 1 / l, tz: d / l };
      }
      let tx, tz;
      if (g) {
        // viser un point en amont de la porte pour la franchir bien droit
        const along = (p.pos.x - g.x) * g.nx + (p.pos.z - g.z) * g.nz;
        const back = Math.min(40, Math.max(0, -along * 0.4));
        tx = g.x - g.nx * back; tz = g.z - g.nz * back;
      } else { tx = W.LAND.x; tz = W.LAND.z; }
      const vh = Math.hypot(p.vel.x, p.vel.z) || 1;
      const hd = Math.atan2(p.vel.x, -p.vel.z);
      let wantH = Math.atan2(tx - p.pos.x, -(tz - p.pos.z));
      if (g) {
        // suivre l'axe de la porte : rejoindre la ligne qui la traverse bien avant d'y arriver
        const lat = (p.pos.x - g.x) * g.tx + (p.pos.z - g.z) * g.tz, along = (p.pos.x - g.x) * g.nx + (p.pos.z - g.z) * g.nz;
        wantH = Math.atan2(g.nx, -g.nz) - Math.atan2(lat, Math.max(22, -along * 0.55));
      }
      // hauteur au-dessus de la neige
      const agl0 = p.pos.y - W.heightAt(p.pos.x, p.pos.z);
      const toCable = -p.pos.z - W.CABLE.s;
      const nearCable = toCable > -160 && toCable < 4; // passer sous le câble : être bas bien avant
      const distGate = g ? Math.hypot(tx - p.pos.x, tz - p.pos.z) : 0;
      // beaucoup trop haut et loin de la porte : spirale (un frein tenu) jusqu'à revenir près de la neige, face à la porte
      const errG = wrap(wantH - hd);
      if (r.spiral) {
        r.spiral.turned += Math.abs(p.bankV) > 0 ? Math.abs(wrap(hd - r.spiral.last)) : 0; r.spiral.last = hd;
        if (agl0 < target + 12 || r.spiral.turned > 4 * Math.PI || (g && distGate < 60)) r.spiral = null;
      } else if (g && opts.weave !== false && agl0 > target + 16 && distGate > 75 && p.mode === 'air' && W.smooth(W.CORR, -p.pos.z, 1) > 100) {
        r.spiral = { dir: errG >= 0 ? 1 : -1, last: hd, turned: 0 };
      }
      // un peu trop haut : virages en S (± 40°), sauf à l'approche d'une porte
      // un peu trop haut : on « carve », incliné d'un côté puis de l'autre (la chute augmente beaucoup en virage)
      const excess = agl0 - (nearCable ? 2 : target);
      const carve = !r.spiral && g && opts.weave !== false && excess > 4 && (distGate > (opts.weaveDist || 45) || (nearCable && toCable < -25));
      const carveBank = carve ? Math.min(0.9, 0.35 + excess / 30) * Math.min(1, W.smooth(W.CORR, -p.pos.z, 1) / 70) : 0;
      // évaluer chaque cap candidat
      let best = null;
      for (const c of CANDS) {
        const h = hd + c, dx = Math.sin(h), dz = -Math.cos(h);
        let minC = 99;
        for (const d of [5, 10, 16, 24, 33, 43]) {
          const yy = p.pos.y + p.vel.y * (d / vh), qx = p.pos.x + dx * d, qz = p.pos.z + dz * d;
          minC = Math.min(minC, yy - W.heightAt(qx, qz));
          // parois : relief à 5 m de part et d'autre (bouts de voile)
          minC = Math.min(minC, yy - W.heightAt(qx - dz * 5, qz + dx * 5) + 2.5, yy - W.heightAt(qx + dz * 5, qz - dx * 5) + 2.5);
          if (W.hit(qx, yy + 1, qz, 2.2) || W.hit(qx, yy + 6, qz, 2.6)) minC = Math.min(minC, -4);
        }
        const score = -Math.abs(wrap(wantH - h)) * 2.2 + (minC < 2.5 ? (minC - 2.5) * 2.5 : 0) + Math.min(minC, 8) * 0.05 - Math.abs(c) * 0.3;
        if (!best || score > best.score) best = { c, score, minC };
      }
      // inclinaison voulue, puis correction qui amortit le balancement
      // amortir aussi la rotation (sinon le cap dépasse sa cible à cause du balancement)
      const yawRate = 9.81 * Math.tan(p.bank) / Math.max(8, p.V);
      let bankWant = clamp(gain * (best.c - (opts.kd || 0.9) * yawRate), -0.9, 0.9);
      if (carveBank > 0 && best.minC > 4) {
        // alterner de côté quand le cap s'écarte trop de l'objectif (S autour de la ligne vers la porte)
        const off = wrap(hd - wantH);
        if (!r.carveDir || (r.carveDir > 0 && off > 0.55) || (r.carveDir < 0 && off < -0.55)) r.carveDir = off > 0 ? -1 : 1;
        bankWant = r.carveDir * carveBank;
      } else r.carveDir = 0;
      if (r.spiral) { if (best.minC > 6) bankWant = r.spiral.dir * 1.25; else r.spiral = null; }
      let turn = clamp(bankWant / FLIGHT.WING.bankMax + (bankWant - p.bank) * 0.6, -1, 1);
      // freins communs : ressource si tout mène trop bas, arrondi en finale
      let sym = p.V > 13 && best.minC < 1.2 ? clamp((1.2 - best.minC) * 0.4, 0, 0.7) : 0;
      if (p.stall) return { l: 0, r: 0 };
      if (p.mode === 'ski') { const b = p.launched ? (p.V > 13 ? 0.7 : 0) : (p.V > 11.5 ? 1 : 0); return { l: clamp(b + Math.max(0, -turn), 0, 1), r: clamp(b + Math.max(0, turn), 0, 1) }; }
      if (!g) {
        // finale : planer vers la cible puis arrondir juste avant le contact
        const dl = Math.hypot(tx - p.pos.x, tz - p.pos.z);
        sym = (dl < 14 || (agl0 < 2.2 && p.vel.y < -1.5)) ? 1 : 0.1;
        if (agl0 > dl / 3 + 5 && dl > 60) turn = clamp(turn + 0.7 * Math.sign(Math.sin(r.t * 1.2)), -1, 1);
      }
      r.botDbg = { c: best.c, minC: best.minC, bankWant, turn, wantH, hd };
      return { l: clamp(sym + Math.max(0, -turn), 0, 1), r: clamp(sym + Math.max(0, turn), 0, 1) };
    };
  }
  return { make };
})();
if (typeof module !== 'undefined') module.exports = BOT;
