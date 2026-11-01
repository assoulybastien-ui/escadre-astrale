// Lumière, atmosphère et matières du rendu réaliste.
// - Soleil haut dans le dos du pilote, un peu à droite : la vallée est encaissée (sommets à 1 500–4 000 m),
//   en dessous de ~55° de hauteur la descente serait à l'ombre (mesuré : 57° → 96 % de la descente au soleil).
// - Ciel analytique (diffusion Rayleigh/Mie simplifiée) + nuages ; la même fonction colore la brume lointaine.
// - Perspective aérienne : brume plus dense en bas de vallée, le bleu s'éteint plus vite que le rouge.
// - Ombres du soleil « cuites » une fois dans deux cartes de profondeur (descente fine, massifs lointains) :
//   relief, sapins, chalets, pylônes projettent leur ombre sur tout ce qui passe dessous, pilote compris.
// - Occlusion ambiante du relief (horizon dans 8 directions) et du pied des sapins.
// - Textures procédurales carrelables : neige (rides de vent), roche (strates, fissures, lichens).
const LOOK = (() => {
  const D2R = Math.PI / 180, AZ = 18 * D2R, EL = 57 * D2R;
  const SUN = new THREE.Vector3(Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL));
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
  // le sol enneigé renvoie énormément de lumière : la couleur « sol » de l'hémisphère vaut la luminance de la neige au soleil (~2)
  const COL = { sun: new THREE.Color(1.0, 0.95, 0.86), sky: new THREE.Color(0.4, 0.55, 0.88), ground: new THREE.Color(1.75, 1.8, 1.9) };
  const SUN_I = 3.1, HEMI_I = 1.0, EXPOSURE = 0.52, HAZE = 0.85e-4;
  const g3 = v => `vec3(${(+v.x).toFixed(5)}, ${(+v.y).toFixed(5)}, ${(+v.z).toFixed(5)})`;

  // ---------- atmosphère (GLSL partagé : ciel, brume, reflets) ----------
  const ATMO = `
const vec3 SUN_D = ${g3(SUN)};
vec3 skyRad(vec3 d) {
  float mu = dot(d, SUN_D), y = max(d.y, 0.0), m = max(mu, 0.0);
  vec3 zen = vec3(0.085, 0.215, 0.58), hor = vec3(0.80, 0.96, 1.22);
  vec3 c = mix(hor, zen, pow(y, 0.4));
  c += vec3(0.16, 0.16, 0.15) * exp(-y * 22.0);                 // liseré clair juste au-dessus de l'horizon
  c *= 0.86 + 0.14 * mu * mu;                                    // Rayleigh : plus clair côté soleil et à l'opposé
  c += vec3(1.0, 0.86, 0.68) * (0.09 * m * m * m + 0.45 * pow(m, 26.0)); // Mie : halo autour du soleil
  return c;
}
vec3 hazeRad(vec3 d) { return skyRad(normalize(vec3(d.x, max(d.y, 0.0) * 0.35 + 0.012, d.z))) * 0.94; }
`;
  // brume selon l'altitude : densité dens·exp(−y/1300), intégrée le long du rayon caméra → point
  const AERIAL = `
vec3 aerial(vec3 col, vec3 rel, float dens) {
  float dist = length(rel); vec3 d = rel / max(dist, 0.001);
  const float B = 1.0 / 1300.0;
  float by = B * rel.y;
  float k = abs(by) > 0.0005 ? (1.0 - exp(-by)) / by : 1.0;
  float od = dens * dist * exp(-B * max(cameraPosition.y, -50.0)) * k;
  vec3 ext = exp(-od * vec3(0.52, 0.74, 1.0));
  return col * ext + hazeRad(d) * (1.0 - ext);
}
`;
  function installFog() {
    const C = THREE.ShaderChunk;
    C.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying vec3 vFogRel;\n#endif';
    // vecteur caméra → point dans le repère du monde (transposée de la rotation de la vue)
    C.fog_vertex = '#ifdef USE_FOG\n\tvFogRel = vec3( dot( viewMatrix[ 0 ].xyz, mvPosition.xyz ), dot( viewMatrix[ 1 ].xyz, mvPosition.xyz ), dot( viewMatrix[ 2 ].xyz, mvPosition.xyz ) );\n#endif';
    C.fog_pars_fragment = '#ifdef USE_FOG\n\tuniform vec3 fogColor;\n\tuniform float fogDensity;\n\tvarying vec3 vFogRel;\n' + ATMO + AERIAL + '#endif';
    C.fog_fragment = '#ifdef USE_FOG\n\tgl_FragColor.rgb = aerial( gl_FragColor.rgb, vFogRel, fogDensity );\n#endif';
  }

  // ---------- ciel ----------
  const NOISE_GLSL = `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm5(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;
  function skyMaterial(env) {
    return new THREE.ShaderMaterial({
      vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vD;
        ${ATMO}${NOISE_GLSL}
        void main() {
          vec3 d = normalize(vD);
          vec3 c = skyRad(d);
          float mu = dot(d, SUN_D);
          ${env ? `
          // carte d'environnement : la neige renvoie la lumière par en dessous
          if (d.y < 0.0) c = mix(hazeRad(d), vec3(0.95, 1.0, 1.08), smoothstep(0.0, -0.25, d.y));
          ` : `
          c += vec3(1.0, 0.93, 0.82) * 40.0 * smoothstep(0.99994, 0.99998, mu);  // disque solaire
          if (d.y > 0.0) {
            // cumulus accrochés aux sommets (bande basse) et voile de cirrus
            vec2 cp = d.xz / (d.y + 0.07);
            vec2 q = cp * 0.85 + vec2(11.3, 4.7);
            float n = fbm5(q), ns = fbm5(q + SUN_D.xz * 0.28);
            float band = smoothstep(0.0, 0.05, d.y) * (1.0 - smoothstep(0.1, 0.42, d.y));
            float cov = smoothstep(0.52, 0.74, n) * band;
            vec3 cc = mix(vec3(0.52, 0.6, 0.74), vec3(1.75, 1.68, 1.56), clamp(0.55 + (n - ns) * 5.0, 0.0, 1.0));
            c = mix(c, cc, cov * 0.94);
            float ci = fbm5(vec2(cp.x * 0.22, cp.y * 1.9) + 3.0);
            c += vec3(0.22, 0.24, 0.27) * smoothstep(0.56, 0.86, ci) * smoothstep(0.04, 0.3, d.y) * (1.0 - cov);
          } else c = hazeRad(d);
          `}
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false
    });
  }
  // carte d'environnement (reflets du casque, des skis, du tissu) : le même ciel, préfiltré
  function envMap(renderer) {
    try {
      const sc = new THREE.Scene();
      sc.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial(true)));
      const pm = new THREE.PMREMGenerator(renderer);
      const rt = pm.fromScene(sc, 0, 0.1, 200);
      pm.dispose();
      return rt.texture;
    } catch (e) { return null; }
  }

  // ---------- bruit périodique (textures carrelables) ----------
  function pnoise(P, seed) {
    const r = NOISE.rng(seed), L = new Float32Array(P * P); for (let i = 0; i < L.length; i++) L[i] = r();
    return (x, y) => {
      const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0, ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty);
      const i0 = ((x0 % P) + P) % P, i1 = (i0 + 1) % P, j0 = ((y0 % P) + P) % P, j1 = (j0 + 1) % P;
      const a = L[j0 * P + i0], b = L[j0 * P + i1], c = L[j1 * P + i0], d = L[j1 * P + i1];
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    };
  }
  // fbm périodique sur [0,1)² : chaque octave double la grille
  function pfbm(P0, oct, seed) {
    const L = []; for (let o = 0; o < oct; o++) L.push(pnoise(P0 << o, seed + o * 31));
    return (u, v, o0 = 0, o1 = oct) => { let s = 0, a = 0.5, n = 0; for (let o = o0; o < o1; o++) { const P = P0 << o; s += a * L[o](u * P, v * P); n += a; a *= 0.5; } return s / n; };
  }
  function dataTex(data, N) {
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
    return t;
  }
  // normale (RGB) + hauteur (A) à partir d'un champ de hauteur périodique
  function normalHeight(h, N, k) {
    const out = new Uint8Array(N * N * 4);
    let mn = 1e9, mx = -1e9; for (const v of h) { if (v < mn) mn = v; if (v > mx) mx = v; }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const dx = (h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N]) * k, dy = (h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x]) * k;
      const l = Math.hypot(dx, dy, 1);
      out[i * 4] = (-dx / l * 0.5 + 0.5) * 255; out[i * 4 + 1] = (-dy / l * 0.5 + 0.5) * 255; out[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255;
      out[i * 4 + 3] = (h[i] - mn) / (mx - mn) * 255;
    }
    return out;
  }
  function textures() {
    // neige : rides de vent allongées + grain fin
    const NS = 256, hs = new Float32Array(NS * NS);
    const ripple = pnoise(24, 71), rip2 = pnoise(48, 72), grain = pfbm(16, 4, 73), big = pfbm(4, 2, 74);
    for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++) {
      const u = x / NS, v = y / NS;
      const w = big(u, v);
      hs[y * NS + x] = 0.5 * ripple(u * 24, v * 6 + w * 3) + 0.25 * rip2(u * 48, v * 12 + w * 5) + 0.35 * grain(u, v) + 0.4 * w;
    }
    const snowN = dataTex(normalHeight(hs, NS, 15), NS);
    // roche : strates ondulées, diaclases verticales, fissures, grain ; couleur granite gris-brun avec oxydes et lichens
    const NR = 512, hr = new Float32Array(NR * NR), cr = new Float32Array(NR * NR * 3);
    const warp = pfbm(4, 3, 81), layer = pnoise(8, 82), crack = pfbm(8, 3, 83), joint = pnoise(16, 84), fine = pfbm(32, 3, 85), tint = pfbm(4, 3, 86), lich = pfbm(16, 3, 87);
    for (let y = 0; y < NR; y++) for (let x = 0; x < NR; x++) {
      const u = x / NR, v = y / NR, i = y * NR + x;
      const wv = warp(u, v);
      const s = v * 6 + wv * 2.4, sf = s - Math.floor(s);
      const thick = 0.35 + 0.65 * layer(u * 8, Math.floor(s) * 1.37);
      const strata = Math.pow(sf, 1.0 + thick * 1.6);                         // marches : arête nette en haut de chaque banc
      const cr1 = 1 - Math.abs(2 * crack(u, v) - 1), cracks = Math.pow(Math.max(0, (cr1 - 0.86) / 0.14), 1.5);
      const jn = 1 - Math.abs(2 * joint(u * 16 + wv * 3, v * 4) - 1), joints = Math.pow(Math.max(0, (jn - 0.9) / 0.1), 2);
      const f = fine(u, v);
      hr[i] = 0.55 * strata + 0.35 * f + 0.25 * wv - 0.45 * cracks - 0.3 * joints;
      const t = tint(u, v), l = lich(u, v);
      let r = 0.5 + 0.07 * t, g = 0.485 + 0.04 * t, b = 0.47;                         // gris granite
      const ox = Math.max(0, (t - 0.55) * 2.2); r += 0.1 * ox; g += 0.04 * ox; b -= 0.02 * ox; // oxydes roux
      const sh = 0.72 + 0.4 * strata + 0.25 * (f - 0.5);
      r *= sh; g *= sh; b *= sh;
      const dark = 1 - 0.6 * Math.min(1, cracks + joints); r *= dark; g *= dark; b *= dark;
      const lk = Math.max(0, (l - 0.62) * 4); r += (0.33 - r) * lk * 0.5; g += (0.36 - g) * lk * 0.5; b += (0.3 - b) * lk * 0.5; // lichens
      cr[i * 3] = r; cr[i * 3 + 1] = g; cr[i * 3 + 2] = b;
    }
    const rn = normalHeight(hr, NR, 7), rc = new Uint8Array(NR * NR * 4);
    for (let i = 0; i < NR * NR; i++) {
      rc[i * 4] = Math.min(255, cr[i * 3] * 255); rc[i * 4 + 1] = Math.min(255, cr[i * 3 + 1] * 255); rc[i * 4 + 2] = Math.min(255, cr[i * 3 + 2] * 255);
      rc[i * 4 + 3] = rn[i * 4 + 3];
    }
    return { snowN, rockC: dataTex(rc, NR), rockN: dataTex(rn, NR) };
  }

  // ---------- ombres statiques (cuites une fois) ----------
  const SHU = {
    uSunT1: { value: null }, uSunM1: { value: new THREE.Matrix4() }, uSunS1: { value: new THREE.Vector4(1, 1, 0, 0) },
    uSunT2: { value: null }, uSunM2: { value: new THREE.Matrix4() }, uSunS2: { value: new THREE.Vector4(1, 1, 0, 0) },
    uSunOn: { value: 0 }
  };
  const SH_PARS = `
uniform sampler2D uSunT1; uniform mat4 uSunM1; uniform vec4 uSunS1;
uniform sampler2D uSunT2; uniform mat4 uSunM2; uniform vec4 uSunS2;
uniform float uSunOn;
float sunPcf(sampler2D t, vec3 a, vec4 s) {
  vec2 tp = a.xy * s.xy - 0.5, f = fract(tp), b = (floor(tp) + 0.5) / s.xy, o = 1.0 / s.xy;
  float z = a.z - s.w;
  float s00 = step(z, texture2D(t, b).r), s10 = step(z, texture2D(t, b + vec2(o.x, 0.0)).r);
  float s01 = step(z, texture2D(t, b + vec2(0.0, o.y)).r), s11 = step(z, texture2D(t, b + o).r);
  return mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
}
float sunStatic(vec3 wp, vec3 wn) {
  if (uSunOn < 0.5) return 1.0;
  vec3 a = (uSunM1 * vec4(wp + wn * uSunS1.z, 1.0)).xyz;
  if (a.x > 0.001 && a.x < 0.999 && a.y > 0.001 && a.y < 0.999) return sunPcf(uSunT1, a, uSunS1);
  vec3 b = (uSunM2 * vec4(wp + wn * uSunS2.z, 1.0)).xyz;
  if (b.x > 0.001 && b.x < 0.999 && b.y > 0.001 && b.y < 0.999) return sunPcf(uSunT2, b, uSunS2);
  return 1.0;
}
`;
  // branche les ombres statiques (et d'éventuels ajouts) sur une matière standard
  let keyN = 0;
  function hook(mat, extra) {
    const key = 'lwy' + (keyN++);
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, SHU);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + SH_PARS)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          float sunVisS = 1.0;
          #ifdef USE_FOG
          { vec3 wnS = inverseTransformDirection(geometry.normal, viewMatrix);
            sunVisS = sunStatic(cameraPosition + vFogRel, wnS);
            reflectedLight.directDiffuse *= sunVisS; reflectedLight.directSpecular *= sunVisS; }
          #endif
          //@@APRES_LUMIERE`);
      if (extra) extra(sh);
    };
    mat.customProgramCacheKey = () => key;
    return mat;
  }
  // carte de profondeur vue du soleil ; bornes = boîte englobante des receveurs, profondeur jusqu'à 4 600 m d'altitude
  function bakeOne(renderer, scene, box, texel, maxSize, normalOff, biasM) {
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2);
    const c = box.getCenter(new THREE.Vector3());
    cam.position.copy(c).addScaledVector(SUN, 100); cam.up.set(0, 1, 0); cam.lookAt(c); cam.updateMatrixWorld(true);
    const inv = cam.matrixWorldInverse;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(inv);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    const reach = (4600 - box.min.y) / SUN.y; // les sommets au loin peuvent faire de l'ombre
    Object.assign(cam, { left: x0, right: x1, bottom: y0, top: y1, near: -z1 - reach, far: -z0 + 20 });
    cam.updateProjectionMatrix();
    const w = Math.min(maxSize, Math.ceil((x1 - x0) / texel)), h = Math.min(maxSize, Math.ceil((y1 - y0) / texel));
    const rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, stencilBuffer: false });
    rt.depthTexture = new THREE.DepthTexture(w, h);
    rt.depthTexture.type = THREE.UnsignedIntType;
    cam.layers.set(1);
    const ov = scene.overrideMaterial;
    scene.overrideMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    try { renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, cam); }
    finally { renderer.setRenderTarget(null); scene.overrideMaterial.dispose(); scene.overrideMaterial = ov; }
    const m = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(cam.projectionMatrix).multiply(inv);
    rt.texture.dispose(); // seule la profondeur sert ensuite
    return { tex: rt.depthTexture, m, s: new THREE.Vector4(w, h, normalOff, biasM / (cam.far - cam.near)), w, h, rt };
  }
  function bakeShadows(renderer, scene, nearBox, farBox) {
    const a = bakeOne(renderer, scene, nearBox, 0.62, 4096, 0.5, 0.3);
    const b = bakeOne(renderer, scene, farBox, 8, 2048, 9, 6);
    SHU.uSunT1.value = a.tex; SHU.uSunM1.value.copy(a.m); SHU.uSunS1.value.copy(a.s);
    SHU.uSunT2.value = b.tex; SHU.uSunM2.value.copy(b.m); SHU.uSunS2.value.copy(b.s);
    SHU.uSunOn.value = 1;
    return { near: [a.w, a.h], far: [b.w, b.h] };
  }
  // visibilité du soleil en un point (pilote) : rayon vers le soleil au-dessus du relief
  function sunRay(heightAt, x, y, z) {
    let vis = 1;
    for (let t = 2; t < 2600; t += 3 + t * 0.04) {
      const py = y + SUN.y * t; if (py > 4300) break;
      const d = py - heightAt(x + SUN.x * t, z + SUN.z * t);
      if (d < 0) return 0;
      if (d < 2) vis = Math.min(vis, d / 2);
    }
    return vis;
  }

  // ---------- matière du relief ----------
  // attribut aT : x = rocaille (> 0 : roche, même seuil que la physique), y = occlusion ambiante, z = forêt lointaine (0–1)
  function terrainMaterial(tex, far) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
    const RS = far ? (1 / 60).toFixed(6) : (1 / 6.5).toFixed(6), RSM = far ? (1 / 420).toFixed(6) : (1 / 37).toFixed(6), SS = far ? (1 / 60).toFixed(6) : (1 / 5.5).toFixed(6);
    return hook(mat, sh => {
      Object.assign(sh.uniforms, { tSnowN: { value: tex.snowN }, tRockC: { value: tex.rockC }, tRockN: { value: tex.rockN } });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aT; varying vec3 vWP; varying vec3 vWN; varying vec3 vT;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal); vT = aT;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D tSnowN; uniform sampler2D tRockC; uniform sampler2D tRockN;
          varying vec3 vWP; varying vec3 vWN; varying vec3 vT;
          float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }`)
        .replace('#include <map_fragment>', `
          vec3 wN0 = normalize(vWN), tWN = wN0;
          vec3 tw = pow(abs(wN0), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
          vec4 sn = texture2D(tSnowN, vWP.xz * ${SS});
          vec4 sb = texture2D(tSnowN, vWP.xz * ${SS} * 0.11 + 0.5);              // grandes plaques : neige soufflée / poudreuse
          vec3 snowAlb = vec3(0.84, 0.885, 0.95) * (0.88 + 0.08 * sn.a + 0.12 * sb.a);
          vec3 pS = vec3(sn.x * 2.0 - 1.0, 0.0, sn.y * 2.0 - 1.0) * ${far ? '0.3' : '1.0'} + vec3(sb.x * 2.0 - 1.0, 0.0, sb.y * 2.0 - 1.0) * ${far ? '0.0' : '0.9'}; // rides + ondulations
          float rockM = 0.0, dust = 0.0; vec3 rockAlb = vec3(0.2), pR = vec3(0.0);
          if (vT.x > -0.45) {
            // roche à deux échelles : grandes structures (dalles, dièdres) + détail (strates, fissures)
            vec2 uX = vWP.zy, uY = vWP.xz + 3.7, uZ = vWP.xy;
            vec4 cM = texture2D(tRockC, uX * ${RSM}) * tw.x + texture2D(tRockC, uY * ${RSM}) * tw.y + texture2D(tRockC, uZ * ${RSM}) * tw.z;
            vec4 cD = texture2D(tRockC, uX * ${RS}) * tw.x + texture2D(tRockC, uY * ${RS}) * tw.y + texture2D(tRockC, uZ * ${RS}) * tw.z;
            float rh = cM.a * 0.6 + cD.a * 0.4;
            rockAlb = pow(mix(cM.rgb, cD.rgb, 0.45), vec3(2.2)) * 1.15;
            vec3 mX = texture2D(tRockN, uX * ${RSM}).xyz * 2.0 - 1.0, mY = texture2D(tRockN, uY * ${RSM}).xyz * 2.0 - 1.0, mZ = texture2D(tRockN, uZ * ${RSM}).xyz * 2.0 - 1.0;
            vec3 dX = texture2D(tRockN, uX * ${RS}).xyz * 2.0 - 1.0, dY = texture2D(tRockN, uY * ${RS}).xyz * 2.0 - 1.0, dZ = texture2D(tRockN, uZ * ${RS}).xyz * 2.0 - 1.0;
            vec3 nX = mX * 1.3 + dX * 0.8, nY = mY * 1.3 + dY * 0.8, nZ = mZ * 1.3 + dZ * 0.8;
            pR = vec3(0.0, nX.y, nX.x) * tw.x + vec3(nY.x, 0.0, nY.y) * tw.y + vec3(nZ.x, nZ.y, 0.0) * tw.z;
            rockM = smoothstep(-0.1, 0.1, vT.x + (rh - 0.5) * 0.35 + (0.5 - sn.a) * 0.06);
            // neige collée sur les vires et les replats de la roche
            vec3 nr = normalize(wN0 + pR);
            dust = smoothstep(0.62, 0.9, nr.y + (rh - 0.5) * 0.5) * ${far ? '0.9' : '0.85'};
          }
          snowAlb *= 1.0 - 0.1 * smoothstep(-0.25, 0.1, vT.x) * (1.0 - rockM);     // neige salie au pied des rochers
          vec3 alb = mix(snowAlb, mix(rockAlb, snowAlb * 0.95, dust), rockM);
          ${far ? 'alb = mix(alb, vec3(0.018, 0.034, 0.026) * (0.7 + 0.6 * sn.a), vT.z * (1.0 - rockM * 0.6));' : ''}
          tWN = normalize(wN0 + mix(pS, pR * (1.0 - dust * 0.6), rockM));
          diffuseColor.rgb = alb;`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.66, 0.92, rockM * (1.0 - dust));')
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tWN, 0.0)).xyz);')
        .replace('//@@APRES_LUMIERE', `
          reflectedLight.indirectDiffuse *= vT.y;
          reflectedLight.indirectSpecular *= vT.y;
          ${far ? '' : `
          // paillettes de neige au soleil (de près seulement)
          { vec3 toC = cameraPosition - vWP; float dist = length(toC);
            if (dist < 45.0) {
              float h = hash13(floor(vWP * 28.0) + floor(toC / dist * 5.0) * 7.0);
              float spk = step(0.9972, h) * (1.0 - rockM * (1.0 - dust)) * (1.0 - smoothstep(12.0, 45.0, dist)) * max(dot(tWN, SUN_D), 0.0);
              reflectedLight.directSpecular += vec3(1.0, 0.97, 0.9) * spk * 16.0 * sunVisS;
            } }`}`);
    });
  }

  // ---------- occlusion ambiante d'une grille de hauteurs (horizon dans 8 directions) ----------
  function bakeAO(H, NX, NZ, DX, steps, strength) {
    const ao = new Float32Array(NX * NZ);
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i, h0 = H[k];
      let occ = 0;
      for (const [di, dj] of dirs) {
        const dl = Math.hypot(di, dj) * DX;
        let mx = 0;
        for (const m of steps) {
          const ii = i + di * m, jj = j + dj * m;
          if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ) break;
          const s = (H[jj * NX + ii] - h0) / (m * dl);
          if (s > mx) mx = s;
        }
        occ += mx / Math.sqrt(1 + mx * mx);
      }
      ao[k] = Math.max(0.35, 1 - strength * occ / 8);
    }
    return ao;
  }

  return { SUN, COL, SUN_I, HEMI_I, EXPOSURE, HAZE, ATMO, installFog, skyMaterial, envMap, textures, hook, bakeShadows, sunRay, terrainMaterial, bakeAO, lin, SHU };
})();
