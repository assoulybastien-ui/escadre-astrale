// Pilote automatique (deux freins, comme le joueur) : tests, vidéos, réglage des médailles. Jamais actif en vraie partie.
const BOT = (() => {
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function make(opts = {}) {
    const target = opts.agl || 5;
    return function (r) {
      const p = r.p, W = WORLD;
      if (p.mode === 'ready') return { l: 0, r: 0, go: true };
      if (p.mode === 'landing' || p.mode === 'stopped') return { l: 0.3, r: 0.3 };
      const g = W.GATES[r.gate];
      let tx, tz;
      if (g) {
        // viser un point en amont de la porte pour la franchir bien droit
        const along = (p.pos.x - g.x) * g.nx + (p.pos.z - g.z) * g.nz;
        const back = Math.min(40, Math.max(0, -along * 0.4));
        tx = g.x - g.nx * back; tz = g.z - g.nz * back;
      } else { tx = W.LAND.x; tz = W.LAND.z; }
      // trop haut : grands virages en S (en restant dans le couloir)
      const hg0 = p.pos.y - W.heightAt(p.pos.x, p.pos.z);
      const along0 = g ? (g.x - p.pos.x) * g.nx + (g.z - p.pos.z) * g.nz : 0;
      if (g && hg0 > target + 8 && along0 > 70 && opts.weave !== false) {
        const sAhead = -p.pos.z + 45, c = W.xc(sAhead), half = W.smooth(W.CORR, sAhead, 1);
        const amp = Math.max(0, Math.min(70, half - 24));
        tx = c + amp * Math.sign(Math.sin(r.t * 0.42 + 0.5)); tz = -sAhead;
      }
      const hd = Math.atan2(p.vel.x, -p.vel.z), want = Math.atan2(tx - p.pos.x, -(tz - p.pos.z));
      let turn = clamp(wrap(want - hd) * (opts.gain || 0.9), -1, 1);
      // évitement des obstacles devant soi (sapins, rochers, pylônes) : on part du côté libre
      const vh = Math.hypot(p.vel.x, p.vel.z) || 1, fx = p.vel.x / vh, fz = p.vel.z / vh;
      const blocked = (qx, qy, qz) => W.hit(qx, qy + 1, qz, 2.5) || W.hit(qx, qy + 6, qz, 2.5);
      for (const d of [8, 14, 20, 27, 35]) {
        const qx = p.pos.x + fx * d, qz = p.pos.z + fz * d, qy = p.pos.y + p.vel.y * d / vh;
        if (blocked(qx, qy, qz)) {
          const freeR = !blocked(qx - fz * 7, qy, qz + fx * 7), freeL = !blocked(qx + fz * 7, qy, qz - fx * 7);
          const dirn = freeR && !freeL ? 1 : freeL && !freeR ? -1 : (turn >= 0 ? 1 : -1);
          turn = clamp(turn + dirn * 1.5 * (1 - d / 45), -1, 1);
          break;
        }
      }
      if (p.mode === 'ski') { const b = p.launched ? (p.V > 13 ? 0.7 : 0) : (p.V > 11.5 ? 1 : 0); return { l: clamp(b + Math.max(0, -turn), 0, 1), r: clamp(b + Math.max(0, turn), 0, 1) }; }
      let wantAgl = target;
      if (r.gate >= W.GATES.length - 2) wantAgl = Math.max(wantAgl, 6);
      const toCable = -p.pos.z - W.CABLE.s;
      if (toCable > -90 && toCable < 4) wantAgl = opts.underCable === false ? 24 : 2.5;
      // marge prévue le long de la trajectoire face au relief à venir
      let agl = 1e9;
      for (const d of [0, 4, 8, 13, 19]) {
        const yy = p.pos.y + p.vel.y * (d / vh), h = W.heightAt(p.pos.x + fx * d, p.pos.z + fz * d);
        agl = Math.min(agl, yy - h - d * 0.03);
      }
      // trop bas : les deux freins (ressource) ; jamais trop lent (décrochage)
      // freiner seulement si la trajectoire mène franchement trop bas (les freins coûtent de la vitesse)
      // freins : seulement si la trajectoire va toucher (ressource) ; sinon mains hautes pour garder la vitesse
      let sym = p.V > 13 ? clamp(((opts.floor || 0.4) - agl) * 0.5, 0, 0.6) : 0;
      if (agl > wantAgl + 6 && p.V > 16) sym = 0;
      if (p.stall) return { l: 0, r: 0 };
      if (!g) {
        // finale : planer vers la cible puis arrondir juste avant le contact
        const aglG = p.pos.y - W.heightAt(p.pos.x, p.pos.z), dl = Math.hypot(tx - p.pos.x, tz - p.pos.z);
        sym = (dl < 14 || (aglG < 2.2 && p.vel.y < -1.5)) ? 1 : (aglG > dl / 3 + 4 ? 0 : 0.15);
        if (aglG > dl / 3 + 4 && dl > 60) turn = clamp(turn + 0.6 * Math.sign(Math.sin(r.t * 0.5)), -1, 1);
      }
      return { l: clamp(sym + Math.max(0, -turn), 0, 1), r: clamp(sym + Math.max(0, turn), 0, 1) };
    };
  }
  return { make };
})();
if (typeof module !== 'undefined') module.exports = BOT;
