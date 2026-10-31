// Bruit de simplexe 2D déterministe (avec graine), fbm et bruit « en crêtes ».
const NOISE = (() => {
  // Générateur pseudo-aléatoire reproductible
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  const GX = [1, -1, 1, -1, 1, -1, 0, 0], GY = [1, 1, -1, -1, 0, 0, 1, -1];

  // Renvoie une fonction n(x, y) dans [-1, 1]
  function make(seed) {
    const r = rng(seed), p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    return function (xin, yin) {
      const s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s);
      const t = (i + j) * G2, x0 = xin - (i - t), y0 = yin - (j - t);
      const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      let n = 0, tt, g;
      tt = 0.5 - x0 * x0 - y0 * y0;
      if (tt > 0) { tt *= tt; g = perm[ii + perm[jj]] & 7; n += tt * tt * (GX[g] * x0 + GY[g] * y0); }
      tt = 0.5 - x1 * x1 - y1 * y1;
      if (tt > 0) { tt *= tt; g = perm[ii + i1 + perm[jj + j1]] & 7; n += tt * tt * (GX[g] * x1 + GY[g] * y1); }
      tt = 0.5 - x2 * x2 - y2 * y2;
      if (tt > 0) { tt *= tt; g = perm[ii + 1 + perm[jj + 1]] & 7; n += tt * tt * (GX[g] * x2 + GY[g] * y2); }
      return 70 * n;
    };
  }

  // Somme d'octaves (relief doux)
  function fbm(n, x, y, oct) {
    let a = 1, f = 1, s = 0, t = 0;
    for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); t += a; a *= 0.5; f *= 2.03; }
    return s / t;
  }
  // Octaves en crêtes (arêtes rocheuses), dans [0, 1]
  function ridged(n, x, y, oct) {
    let a = 1, f = 1, s = 0, t = 0;
    for (let i = 0; i < oct; i++) { let v = 1 - Math.abs(n(x * f, y * f)); v *= v; s += a * v; t += a; a *= 0.5; f *= 2.1; }
    return s / t;
  }
  return { make, rng, fbm, ridged };
})();
if (typeof module !== 'undefined') module.exports = NOISE;
