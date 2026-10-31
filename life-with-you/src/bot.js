// Pilote automatique : sert aux tests, aux vidéos et au réglage des médailles (jamais actif en vraie partie).
const BOT = (() => {
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function make(opts = {}) {
    const target = opts.agl || 5;
    return function (r) {
      const p = r.p, W = WORLD;
      if (p.mode === 'ready') return { x: 0, y: 1 };
      if (p.mode === 'ski' && !p.launched) return { x: 0, y: p.V > 11 ? -1 : 1 };
      if (p.mode !== 'air') return { x: 0, y: -0.5 };
      const g = W.GATES[r.gate];
      let tx, tz;
      if (g) {
        // viser un point en amont de la porte pour la franchir bien droit
        const along = (p.pos.x - g.x) * g.nx + (p.pos.z - g.z) * g.nz;
        const back = Math.min(40, Math.max(0, -along * 0.4));
        tx = g.x - g.nx * back; tz = g.z - g.nz * back;
      } else { tx = W.LAND.x; tz = W.LAND.z; }
      // trop haut : virages en S (on vise un point décalé sur le côté, en restant dans le couloir)
      const hg0 = p.pos.y - W.heightAt(p.pos.x, p.pos.z);
      const along0 = g ? (g.x - p.pos.x) * g.nx + (g.z - p.pos.z) * g.nz : 0;
      if (g && hg0 > target + 10 && along0 > 90 && opts.weave !== false) {
        const sAhead = -tz, c = W.xc(sAhead), half = W.smooth(W.CORR, sAhead, 1);
        const amp = Math.max(0, Math.min(45, half - 22));
        tx = c + amp * Math.sign(Math.sin(r.t * 0.55 + 0.5));
      }
      const hd = Math.atan2(p.vel.x, -p.vel.z), want = Math.atan2(tx - p.pos.x, -(tz - p.pos.z));
      let x = clamp(wrap(want - hd) * 2.2, -1, 1);
      // évitement des sapins devant soi
      {
        const vh0 = Math.hypot(p.vel.x, p.vel.z) || 1, fx = p.vel.x / vh0, fz = p.vel.z / vh0;
        for (const d of [8, 14, 20, 27, 35]) {
          const qx = p.pos.x + fx * d, qz = p.pos.z + fz * d, qy = p.pos.y + p.vel.y * d / vh0;
          const t = W.nearTree(qx, qy + 1, qz, 5) || W.nearTree(qx, qy + 6, qz, 4.5);
          if (t) {
            const side = (W.TREES.X[t.i] - p.pos.x) * -fz + (W.TREES.Z[t.i] - p.pos.z) * fx; // > 0 : sapin à droite
            x = clamp(x + (side > 0 ? -1.4 : 1.4) * (1 - d / 45), -1, 1);
            break;
          }
        }
      }
      let wantAgl = target;
      const toCable = -p.pos.z - W.CABLE.s;
      if (r.gate >= W.GATES.length - 2) wantAgl = Math.max(wantAgl, 6); // garder de l'énergie pour la finale
      if (toCable > -90 && toCable < 4) wantAgl = opts.underCable === false ? 24 : 2.5;
      // marge prévue le long de la trajectoire (prolongée en ligne droite) face au relief à venir
      const vh = Math.hypot(p.vel.x, p.vel.z) || 1;
      let agl = 1e9;
      for (const d of [0, 5, 10, 16, 24, 34, 46]) {
        const yy = p.pos.y + p.vel.y * (d / vh), h = W.heightAt(p.pos.x + p.vel.x / vh * d, p.pos.z + p.vel.z / vh * d);
        agl = Math.min(agl, yy - h - d * 0.03);
      }
      let y = clamp((agl - wantAgl) * 0.18, -1, 1);
      if (g && agl > wantAgl + 30) y = 1;
      if (g && p.V < 15) y = Math.max(y, 0.4); // ne pas laisser tomber la vitesse
      if (!g) {
        // finale : planer vers la cible puis arrondir juste avant le contact
        const aglG = p.pos.y - W.heightAt(p.pos.x, p.pos.z), dl = Math.hypot(tx - p.pos.x, tz - p.pos.z);
        const hreq = dl / 3.4;
        if (dl < 14 || (aglG < 2.2 && p.vel.y < -1.5) || p.V < 12.5) y = -1;
        else if (aglG > hreq + 4) y = 0.8;
        else y = -0.15; // meilleure finesse
      }
      return { x, y };
    };
  }
  return { make };
})();
if (typeof module !== 'undefined') module.exports = BOT;
