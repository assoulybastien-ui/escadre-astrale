// Rendu three.js r128 : ciel et brume (look.js), relief texturé avec ombres cuites, sapins, rochers, chalets, télésiège,
// cible, pilote articulé (pilot.js) et voile souple translucide, fantôme, gerbes de neige, post-traitement HDR (post.js).
const R3D = (() => {
  const W = WORLD, G = FLIGHT.GEO;
  const lin = LOOK.lin;
  const clamp = W.clamp, sstep = W.sstep;
  const SUN_DIR = LOOK.SUN;
  const C = {
    wingA: 0xff5b1f, wingB: 0xf4f1ea, wingC: 0x14213d, jacket: 0xff5b1f, jacket2: 0x1b2433, pants: 0x262b33, helmet: 0xf4f6f8, boot: 0xe9ecef, ski: 0x14213d
  };
  let renderer, scene, camera, sun, sky, tex, envTex;
  let pilot, ghost, streaks, spray, gateObjs = [], windsock, trees;
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), ready: false, fov: 58, mode: '' };
  let time = 0;
  // matière standard branchée sur les ombres statiques du soleil
  const stdm = params => LOOK.hook(new THREE.MeshStandardMaterial(params));
  const caster = m => { m.layers.enable(1); return m; };

  // ---------- utilitaires de géométrie ----------
  function paint(geo, fn) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
    for (let i = 0; i < p.count; i++) { fn(col, p.getX(i), p.getY(i), p.getZ(i), i); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  }
  function merge(list) {
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    for (const g of list) {
      if (!g.attributes.normal) g.computeVertexNormals();
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.color) col.set(g.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + g.attributes.position.count) * 3);
      o += g.attributes.position.count;
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return m;
  }
  const solid = c => (col) => col.copy(c);

  // ---------- ciel ----------
  function buildSky() {
    sky = new THREE.Mesh(new THREE.SphereGeometry(14000, 48, 24), LOOK.skyMaterial(false));
    sky.frustumCulled = false; sky.renderOrder = -1;
    scene.add(sky);
  }

  // ---------- relief proche (grille fine, en tuiles) ----------
  // occlusion ambiante : horizon du relief dans 8 directions, assombrie au pied des sapins
  function terrainAO() {
    const { NX, NZ, H, GX0, GZ0, DX } = W.grid;
    const ao = LOOK.bakeAO(H, NX, NZ, DX, [1, 2, 3, 5, 8, 12, 18, 27, 40], 0.9);
    const T = W.TREES;
    for (let t = 0; t < T.n; t++) {
      const R = T.R[t] * 1.7, i0 = Math.max(0, Math.floor((T.X[t] - R - GX0) / DX)), i1 = Math.min(NX - 1, Math.ceil((T.X[t] + R - GX0) / DX));
      const j0 = Math.max(0, Math.floor((T.Z[t] - R - GZ0) / DX)), j1 = Math.min(NZ - 1, Math.ceil((T.Z[t] + R - GZ0) / DX));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(GX0 + i * DX - T.X[t], GZ0 + j * DX - T.Z[t]);
        if (d < R) ao[j * NX + i] *= 0.5 + 0.5 * sstep(0, R, d);
      }
    }
    return ao;
  }
  function buildTerrain() {
    const { NX, NZ, H, GX0, GZ0, DX } = W.grid;
    const nrm = new Float32Array(NX * NZ * 3), at = new Float32Array(NX * NZ * 3), ao = terrainAO();
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i, i0 = Math.max(0, i - 1), i1 = Math.min(NX - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(NZ - 1, j + 1);
      const gx = (H[j * NX + i1] - H[j * NX + i0]) / ((i1 - i0) * DX), gz = (H[j1 * NX + i] - H[j0 * NX + i]) / ((j1 - j0) * DX);
      const l = Math.hypot(gx, 1, gz);
      nrm[k * 3] = -gx / l; nrm[k * 3 + 1] = 1 / l; nrm[k * 3 + 2] = -gz / l;
      const x = GX0 + i * DX, z = GZ0 + j * DX;
      at[k * 3] = W.rockiness(Math.hypot(gx, gz), x, z) - 1; // même seuil que la physique (roche au-delà de 1)
      at[k * 3 + 1] = ao[k]; at[k * 3 + 2] = 0;
    }
    const mat = LOOK.terrainMaterial(tex, false);
    const TS = 64;
    for (let tj = 0; tj < NZ - 1; tj += TS) for (let ti = 0; ti < NX - 1; ti += TS) {
      const nx = Math.min(TS, NX - 1 - ti), nz = Math.min(TS, NZ - 1 - tj), vc = (nx + 1) * (nz + 1);
      const pos = new Float32Array(vc * 3), no = new Float32Array(vc * 3), ta = new Float32Array(vc * 3);
      let v = 0;
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
        const gi = ti + i, gj = tj + j, k = gj * NX + gi;
        pos[v * 3] = GX0 + gi * DX; pos[v * 3 + 1] = H[k]; pos[v * 3 + 2] = GZ0 + gj * DX;
        no.set(nrm.subarray(k * 3, k * 3 + 3), v * 3); ta.set(at.subarray(k * 3, k * 3 + 3), v * 3);
        v++;
      }
      const idx = [];
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(no, 3));
      geo.setAttribute('aT', new THREE.BufferAttribute(ta, 3));
      geo.setIndex(idx); geo.computeBoundingSphere();
      const mesh = caster(new THREE.Mesh(geo, mat)); mesh.receiveShadow = true;
      scene.add(mesh);
    }
    // jupe sous le bord de la grille (cache les raccords avec le relief lointain)
    const sk = [], edge = [];
    for (let i = 0; i < NX; i++) edge.push([i, 0]);
    for (let j = 1; j < NZ; j++) edge.push([NX - 1, j]);
    for (let i = NX - 2; i >= 0; i--) edge.push([i, NZ - 1]);
    for (let j = NZ - 2; j >= 0; j--) edge.push([0, j]);
    for (let e = 1; e < edge.length; e++) {
      const [i0, j0] = edge[e - 1], [i1, j1] = edge[e];
      const x0 = GX0 + i0 * DX, z0 = GZ0 + j0 * DX, x1 = GX0 + i1 * DX, z1 = GZ0 + j1 * DX, h0 = H[j0 * NX + i0], h1 = H[j1 * NX + i1];
      sk.push(x0, h0, z0, x1, h1, z1, x0, h0 - 40, z0, x1, h1, z1, x1, h1 - 40, z1, x0, h0 - 40, z0);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sk, 3)); sg.computeVertexNormals();
    scene.add(new THREE.Mesh(sg, stdm({ color: lin(0xb9c2cc), roughness: 0.9, side: THREE.DoubleSide })));
  }

  // ---------- relief lointain (massifs, vallée) : cellules alignées sur le bord de la grille fine ----------
  let farBox = null;
  function buildFar() {
    const g = W.grid, st = 82.5, X0 = g.GX0 - st * 92, Z0 = g.GZ0 - st * 83, NXf = 8 + 184 + 1, NZf = 22 + 83 + 90 + 1;
    const nA = W.noise.nA, nE = W.noise.nE;
    const hs = new Float32Array(NXf * NZf);
    for (let j = 0; j < NZf; j++) for (let i = 0; i < NXf; i++) hs[j * NXf + i] = W.hRaw(X0 + i * st, Z0 + j * st);
    const ao = LOOK.bakeAO(hs, NXf, NZf, st, [1, 2, 3, 5, 8], 1.1);
    const pos = new Float32Array(NXf * NZf * 3), at = new Float32Array(NXf * NZf * 3);
    let ymax = -1e9;
    for (let j = 0; j < NZf; j++) for (let i = 0; i < NXf; i++) {
      const k = j * NXf + i, x = X0 + i * st, z = Z0 + j * st, h = hs[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z; ymax = Math.max(ymax, h);
      const i0 = Math.max(0, i - 1), i1 = Math.min(NXf - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(NZf - 1, j + 1);
      const gx = (hs[j * NXf + i1] - hs[j * NXf + i0]) / ((i1 - i0) * st), gz = (hs[j1 * NXf + i] - hs[j0 * NXf + i]) / ((j1 - j0) * st);
      const sl = Math.hypot(gx, gz);
      const forest = (1 - sstep(260, 420, h + 120 * nA(x / 400, z / 400))) * (1 - sstep(0.45, 0.7, sl)) * sstep(-0.3, 0.2, nA(x / 260, z / 260));
      at[k * 3] = (sl + 0.25 * nE(x / 300, z / 300) - 0.8) * 0.6; at[k * 3 + 1] = ao[k]; at[k * 3 + 2] = forest;
    }
    const idx = [];
    for (let j = 0; j < NZf - 1; j++) for (let i = 0; i < NXf - 1; i++) {
      const cx = X0 + (i + 0.5) * st, cz = Z0 + (j + 0.5) * st;
      if (cx > g.GX0 && cx < g.GX1 && cz > g.GZ0 && cz < g.GZ1) continue; // couvert par la grille fine
      const a = j * NXf + i, b = a + 1, c = a + NXf, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aT', new THREE.BufferAttribute(at, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    scene.add(caster(new THREE.Mesh(geo, LOOK.terrainMaterial(tex, true))));
    farBox = new THREE.Box3(new THREE.Vector3(X0, -30, Z0), new THREE.Vector3(X0 + (NXf - 1) * st, ymax + 10, Z0 + (NZf - 1) * st));
  }

  // ---------- sapins (épicéas) : étages de branches retombantes, découpées, chargées de neige sur le dessus ----------
  // hauteur 1, rayon de base 0,27 (mis à l'échelle par instance)
  function spruceGeo(tiers, M, seed) {
    const r = NOISE.rng(seed), pos = [], col = [], nor = [];
    const needle = lin(0x1d3526), needleD = lin(0x0b1a12), under = lin(0x07110b), snow = new THREE.Color(0.82, 0.86, 0.92), bark = lin(0x3a2a20);
    const push = (p, n, c) => { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); col.push(c.r, c.g, c.b); };
    const tri = (a, b, c) => { for (const v of [a, b, c]) push(v.p, v.n, v.c); };
    // tronc
    for (let k = 0; k < 6; k++) {
      const a0 = k / 6 * Math.PI * 2, a1 = (k + 1) / 6 * Math.PI * 2;
      const P = (a, y, rr) => ({ p: [Math.cos(a) * rr, y, Math.sin(a) * rr], n: [Math.cos(a), 0, Math.sin(a)], c: bark });
      tri(P(a0, 0, 0.03), P(a1, 0, 0.03), P(a0, 0.3, 0.018)); tri(P(a1, 0, 0.03), P(a1, 0.3, 0.018), P(a0, 0.3, 0.018));
    }
    const c = new THREE.Color();
    for (let t = 0; t < tiers; t++) {
      const f = t / (tiers - 1);
      const yt = 0.12 + f * 0.86 + (r() - 0.5) * 0.02;                                     // haut de l'étage
      const R = 0.27 * Math.pow(1 - f, 0.95) * (0.92 + r() * 0.16) + 0.025;                // rayon (cône étroit)
      const droop = 0.06 + R * 0.55, thick = 0.03 + R * 0.25;
      const ph = r() * 6.28, lobes = 7 + Math.floor(r() * 3);
      const ring = [];
      for (let k = 0; k < M; k++) {
        const a = k / M * Math.PI * 2;
        const lob = Math.pow(0.5 + 0.5 * Math.cos(a * lobes + ph), 0.6);
        const rr = R * (0.62 + 0.38 * lob) * (0.9 + r() * 0.2);
        const sn = Math.max(0, (0.5 + 0.5 * Math.sin(a * 3 + ph * 2)) * 0.9 + r() * 0.4 - 0.25) * (0.55 + 0.45 * (1 - f));
        ring.push({ a, rr, sn });
      }
      const top = { p: [0, yt, 0], n: [0, 1, 0], c: c.copy(needleD).clone() };
      const bot = { p: [0, yt - thick - droop * 0.6, 0], n: [0, -1, 0], c: under };
      const mid = [], out = [], und = [];
      for (const q of ring) {
        const ca = Math.cos(q.a), sa = Math.sin(q.a);
        const m = 0.5, ym = yt - droop * 0.25 + 0.012;
        const nm = [ca * 0.45, 0.89, sa * 0.45], no = [ca * 0.75, 0.5, sa * 0.75];
        mid.push({ p: [ca * q.rr * m, ym, sa * q.rr * m], n: nm, c: new THREE.Color().copy(needle).lerp(snow, Math.min(1, q.sn * 0.9)) });
        out.push({ p: [ca * q.rr, yt - droop, sa * q.rr], n: no, c: new THREE.Color().copy(needle).multiplyScalar(1.15).lerp(snow, Math.min(1, q.sn * 0.55)) });
        und.push({ p: [ca * q.rr * 0.55, yt - droop - thick * 0.6, sa * q.rr * 0.55], n: [ca * 0.4, -0.9, sa * 0.4], c: under });
      }
      for (let k = 0; k < M; k++) {
        const k1 = (k + 1) % M;
        tri(top, mid[k1], mid[k]);
        tri(mid[k], mid[k1], out[k]); tri(mid[k1], out[k1], out[k]);
        tri(out[k], out[k1], und[k]); tri(out[k1], und[k1], und[k]);
        tri(und[k], und[k1], bot);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }
  function buildTrees() {
    const T = W.TREES;
    const mat = stdm({ vertexColors: true, roughness: 0.92 });
    const near = new THREE.InstancedMesh(spruceGeo(12, 16, 3), mat, T.n), far = new THREE.InstancedMesh(spruceGeo(6, 8, 4), mat, T.n);
    const r = NOISE.rng(11), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    const M = [];
    for (let i = 0; i < T.n; i++) {
      e.set((r() - 0.5) * 0.05, r() * 6.28, (r() - 0.5) * 0.05); q.setFromEuler(e);
      const k = T.R[i] / 0.27;
      s.set(k, T.H[i], k); p.set(T.X[i], T.Y[i], T.Z[i]);
      M.push(new THREE.Matrix4().compose(p, q, s));
      const v = 0.82 + r() * 0.36; col.setRGB(v, v * (0.96 + r() * 0.08), v * (0.94 + r() * 0.1));
      near.setColorAt(i, col); far.setColorAt(i, col);
    }
    for (const m of [near, far]) { m.frustumCulled = false; m.count = 0; caster(m); scene.add(m); }
    trees = { near, far, M, t: 99, cx: 1e9, cz: 1e9 };
  }
  // les sapins proches sont détaillés, les lointains simplifiés (réparti toutes les ~0,4 s)
  function treeLod(dt) {
    const T = W.TREES, t = trees; t.t += dt;
    const cp = camera.position;
    if (t.t < 0.4 && Math.hypot(cp.x - t.cx, cp.z - t.cz) < 25) return;
    t.t = 0; t.cx = cp.x; t.cz = cp.z;
    let a = 0, b = 0;
    for (let i = 0; i < T.n; i++) {
      const d = Math.hypot(T.X[i] - cp.x, T.Z[i] - cp.z);
      if (d < 230) t.near.setMatrixAt(a++, t.M[i]); else t.far.setMatrixAt(b++, t.M[i]);
    }
    // les couleurs suivent l'indice d'origine : on les réordonne avec les matrices
    a = 0; b = 0; const c = new THREE.Color();
    for (let i = 0; i < T.n; i++) {
      const d = Math.hypot(T.X[i] - cp.x, T.Z[i] - cp.z), v = 0.82 + ((i * 7919) % 97) / 97 * 0.36;
      c.setRGB(v, v * 0.98, v * 0.97);
      if (d < 230) t.near.setColorAt(a++, c); else t.far.setColorAt(b++, c);
    }
    t.near.count = a; t.far.count = b;
    t.near.instanceMatrix.needsUpdate = true; t.far.instanceMatrix.needsUpdate = true;
    if (t.near.instanceColor) t.near.instanceColor.needsUpdate = true;
    if (t.far.instanceColor) t.far.instanceColor.needsUpdate = true;
  }

  // ---------- rochers : blocs anguleux, roche texturée (même roche que les parois), neige sur le dessus ----------
  function buildRocks() {
    const geo = new THREE.IcosahedronGeometry(1, 2), p = geo.attributes.position, n = NOISE.make(3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      let k = 1 + 0.22 * n(x * 1.3 + z * 0.7, y * 1.3 - z) + 0.08 * n(x * 3.1, z * 3.1 + y);
      const facet = Math.round(k * 4) / 4; k = k * 0.6 + facet * 0.4;                // facettes (cassures planes)
      p.setXYZ(i, x * k * 1.2, Math.max(-0.35, y * k * 0.78), z * k);
    }
    geo.computeVertexNormals();
    const mat = stdm({ color: 0xffffff, roughness: 0.9 });
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = sh => {
      prev(sh);
      Object.assign(sh.uniforms, { tRockC: { value: tex.rockC }, tRockN: { value: tex.rockN }, tSnowN: { value: tex.snowN } });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          { vec4 wp = vec4(transformed, 1.0); vec3 wn = objectNormal;
            #ifdef USE_INSTANCING
            wp = instanceMatrix * wp; wn = mat3(instanceMatrix) * wn;
            #endif
            vWP = (modelMatrix * wp).xyz; vWN = normalize(mat3(modelMatrix) * wn); }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tRockC; uniform sampler2D tRockN; uniform sampler2D tSnowN; varying vec3 vWP; varying vec3 vWN;')
        .replace('#include <map_fragment>', `
          vec3 wN0 = normalize(vWN);
          vec3 tw = pow(abs(wN0), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
          vec2 uvX = vWP.zy * 0.3, uvY = vWP.xz * 0.3, uvZ = vWP.xy * 0.3;
          vec4 rc = texture2D(tRockC, uvX) * tw.x + texture2D(tRockC, uvY) * tw.y + texture2D(tRockC, uvZ) * tw.z;
          float snowM = smoothstep(0.55, 0.75, wN0.y + (rc.a - 0.5) * 0.5);
          diffuseColor.rgb = mix(pow(rc.rgb, vec3(2.2)), vec3(0.86, 0.9, 0.96), snowM);`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.9, 0.7, snowM);')
        .replace('#include <normal_fragment_maps>', `{
          vec3 tnX = texture2D(tRockN, uvX).xyz * 2.0 - 1.0, tnY = texture2D(tRockN, uvY).xyz * 2.0 - 1.0, tnZ = texture2D(tRockN, uvZ).xyz * 2.0 - 1.0;
          vec3 pR = vec3(0.0, tnX.y, tnX.x) * tw.x + vec3(tnY.x, 0.0, tnY.y) * tw.y + vec3(tnZ.x, tnZ.y, 0.0) * tw.z;
          normal = normalize((viewMatrix * vec4(normalize(wN0 + pR * (1.0 - snowM) * 1.1), 0.0)).xyz);
        }`);
    };
    const mesh = new THREE.InstancedMesh(geo, mat, W.ROCKS.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const wc = new THREE.Color(1, 1, 1);
    // couleur par instance obligatoire : three r128 ne change pas de programme entre instances avec et sans couleur (cuisson des ombres)
    W.ROCKS.forEach((r, i) => { e.set(0, r.rot, 0); q.setFromEuler(e); m.compose(new THREE.Vector3(r.x, r.y, r.z), q, new THREE.Vector3(r.r, r.r, r.r)); mesh.setMatrixAt(i, m); mesh.setColorAt(i, wc); });
    mesh.receiveShadow = true; mesh.frustumCulled = false;
    scene.add(caster(mesh));
  }

  // ---------- chalets ----------
  function buildChalets() {
    const parts = [], wood = lin(0x6a4630), woodD = lin(0x3e2a1d), roof = lin(0xf1f4f8), win = lin(0x1b2430), stone = lin(0x8b8580);
    const M = new THREE.Matrix4();
    for (const c of W.CHALETS) {
      const sh = new THREE.Shape();
      sh.moveTo(-c.w / 2, 0); sh.lineTo(c.w / 2, 0); sh.lineTo(c.w / 2, c.wh); sh.lineTo(0, c.wh + c.rh); sh.lineTo(-c.w / 2, c.wh); sh.lineTo(-c.w / 2, 0);
      const body = new THREE.ExtrudeGeometry(sh, { depth: c.d, bevelEnabled: false }); body.translate(0, 0, -c.d / 2);
      const base = new THREE.BoxGeometry(c.w + 0.3, 1.2, c.d + 0.3); base.translate(0, 0.3, 0);
      const pitch = Math.atan2(c.rh, c.w / 2), len = Math.hypot(c.w / 2, c.rh) + 0.9;
      const items = [[body, wood], [base, stone]];
      for (const sg of [-1, 1]) {
        const r = new THREE.BoxGeometry(len, 0.35, c.d + 1.4);
        r.rotateZ(-sg * pitch); r.translate(sg * (c.w / 4 + 0.15), c.wh + c.rh / 2 + 0.3, 0);
        items.push([r, roof]);
        for (const zz of [-c.d / 4, c.d / 4]) { const wdw = new THREE.BoxGeometry(0.1, 1.1, 1.3); wdw.translate(sg * (c.w / 2 + 0.02), c.wh * 0.55, zz); items.push([wdw, win]); }
      }
      const bal = new THREE.BoxGeometry(c.w + 0.8, 0.5, 0.25); bal.translate(0, c.wh * 0.62, c.d / 2 + 0.4); items.push([bal, woodD]);
      M.makeRotationY(c.yaw).setPosition(c.x, c.y, c.z);
      for (const [g, colr] of items) { const gg = paint(g, solid(colr)); gg.applyMatrix4(M); parts.push(gg); }
    }
    const mesh = new THREE.Mesh(merge(parts), stdm({ vertexColors: true, roughness: 0.85 }));
    caster(mesh); mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // ---------- télésiège ----------
  function buildCable() {
    const parts = [], steel = lin(0x6f7780), dark = lin(0x2a2f36), seat = lin(0x2c4a7a);
    for (const p of W.CABLE.pylons) {
      const t = new THREE.CylinderGeometry(0.3, 0.55, p.h, 8); t.translate(p.x, p.y + p.h / 2, p.z); parts.push(paint(t, solid(steel)));
      const bar = new THREE.BoxGeometry(0.5, 0.45, 5.6); bar.translate(p.x, p.y + p.h, p.z); parts.push(paint(bar, solid(dark)));
      for (const off of [-2.2, 2.2]) { const wh = new THREE.CylinderGeometry(0.45, 0.45, 0.2, 10); wh.rotateZ(Math.PI / 2); wh.translate(p.x, p.y + p.h + 0.15, p.z + off); parts.push(paint(wh, solid(dark))); }
    }
    for (const c of W.CABLE.chairs) {
      const hang = new THREE.BoxGeometry(0.06, 2.3, 0.06); hang.translate(c.x, c.y + 1.25, c.z); parts.push(paint(hang, solid(dark)));
      const s1 = new THREE.BoxGeometry(1.8, 0.12, 0.6); s1.translate(c.x, c.y, c.z); parts.push(paint(s1, solid(seat)));
      const s2 = new THREE.BoxGeometry(1.8, 0.7, 0.1); s2.translate(c.x, c.y + 0.4, c.z + 0.3); parts.push(paint(s2, solid(seat)));
    }
    const mesh = new THREE.Mesh(merge(parts), stdm({ vertexColors: true, roughness: 0.6, metalness: 0.3 }));
    caster(mesh);
    scene.add(mesh);
    const lm = new THREE.LineBasicMaterial({ color: lin(0x15181c) });
    for (const line of W.CABLE.lines) {
      const g = new THREE.BufferGeometry().setFromPoints(line.map(q => new THREE.Vector3(q.x, q.y, q.z)));
      scene.add(new THREE.Line(g, lm));
    }
  }

  // ---------- portes ----------
  function buildGates() {
    const pole = new THREE.CylinderGeometry(0.11, 0.14, 1, 6); pole.translate(0, 0.5, 0);
    const flag = new THREE.BufferGeometry(); flag.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -1.6, 0, 1.7, -0.8, 0], 3)); flag.computeVertexNormals();
    W.GATES.forEach((g, i) => {
      const mat = stdm({ color: lin(C.wingA), roughness: 0.5, emissive: lin(C.wingA), emissiveIntensity: 0.0, side: THREE.DoubleSide });
      const grp = new THREE.Group();
      const tops = [];
      for (const sg of [-1, 1]) {
        const x = g.x + g.tx * g.hw * sg, z = g.z + g.tz * g.hw * sg, y = W.heightAt(x, z) - 0.3;
        const pm = new THREE.Mesh(pole, mat); pm.position.set(x, y, z); pm.scale.set(1, g.h + 0.3, 1); pm.castShadow = true; grp.add(pm);
        const fm = new THREE.Mesh(flag, mat); fm.position.set(x, y + g.h + 0.3, z); fm.rotation.y = Math.atan2(g.nx, g.nz) + (sg > 0 ? Math.PI : 0); fm.castShadow = true; grp.add(fm);
        tops.push(new THREE.Vector3(x, y + g.h + 0.3, z));
      }
      // banderole : la porte se passe dessous
      const pts = [];
      for (let k = 0; k <= 12; k++) { const f = k / 12, v = tops[0].clone().lerp(tops[1], f); v.y -= Math.sin(Math.PI * f) * 0.6; pts.push(v); }
      const band = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: lin(0xffffff) }));
      grp.add(band);
      scene.add(grp);
      gateObjs.push({ grp, mat, band, state: 0 });
    });
  }
  function gateState(i, st) {
    const o = gateObjs[i]; if (!o) return; o.state = st;
    if (st === 1) { o.mat.color.copy(lin(0x35c46f)); o.mat.emissive.copy(lin(0x35c46f)); o.mat.emissiveIntensity = 0.25; }
    else if (st === -1) { o.mat.color.copy(lin(0x8d939b)); o.mat.emissiveIntensity = 0; }
    else { o.mat.color.copy(lin(C.wingA)); o.mat.emissive.copy(lin(C.wingA)); o.mat.emissiveIntensity = 0; }
  }

  // ---------- cible d'atterrissage + manche à air ----------
  function buildTarget() {
    const L = W.LAND, y = W.heightAt(L.x, L.z), n = W.normalAt(L.x, L.z);
    const grp = new THREE.Group();
    const mk = (r0, r1, hex) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 64), stdm({ color: lin(hex), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.rotation.x = -Math.PI / 2; m.receiveShadow = true; grp.add(m);
    };
    mk(0, 5, 0xff5b1f); mk(11.4, 12.4, 0xff5b1f); mk(19.3, 20.3, 0xd23c1a);
    grp.position.set(L.x, y + 0.05, L.z);
    grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n.x, n.y, n.z));
    scene.add(grp);
    // manche à air
    const wx = L.x + 30, wz = L.z - 6, wy = W.heightAt(wx, wz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6, 6), stdm({ color: lin(0xcfd5dc), roughness: 0.5 }));
    pole.position.set(wx, wy + 3, wz); pole.castShadow = true; scene.add(pole);
    const cone = new THREE.ConeGeometry(0.45, 2.6, 12, 4, true); cone.rotateX(Math.PI / 2); cone.translate(0, 0, 1.3);
    const sock = new THREE.Mesh(paint(cone, (c, x, y, z) => c.copy(lin(Math.floor((z + 0.1) / 0.65) % 2 ? 0xffffff : 0xff5b1f))), stdm({ vertexColors: true, side: THREE.DoubleSide }));
    sock.position.set(wx, wy + 5.8, wz); sock.castShadow = true; scene.add(sock);
    windsock = sock;
  }

  // ---------- voile souple : profil réel, caissons gonflés, nervures, ouvertures, suspentage en cascade ----------
  function wingGeometry(main, light, dark) {
    const NS = 48, NA = 20, RL = G.lineLen, A = G.halfAngle;
    const pos = [], col = [], meta = []; // meta par sommet : t (envergure −1..1), xc (corde 0..1), extrados (1/0), caisson (0 nervure → 1 milieu)
    const cM = lin(main), cL = lin(light), cD = lin(dark), cO = lin(0x10151c), c = new THREE.Color();
    const chordAt = t => 2.35 * Math.sqrt(Math.max(0.08, 1 - 0.78 * t * t));
    for (let i = 0; i <= NS; i++) {
      const t = -1 + 2 * i / NS, ang = A * t, ex = Math.sin(ang), ey = Math.cos(ang);
      const chord = chordAt(t), sweep = 0.35 * t * t, at = Math.abs(t);
      const cell = i % 2; // nervures sur les stations paires, milieu des caissons sur les impaires
      const base = at > 0.82 ? cD : (at > 0.6 && at < 0.72) ? cL : (at < 0.05 ? cL : cM);
      for (let k = 0; k < NA; k++) {
        const th = 2 * Math.PI * k / NA, xc = 0.5 + 0.5 * Math.cos(th), up = th < Math.PI;
        const yt = 0.6 * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc * xc + 0.2843 * xc * xc * xc - 0.1015 * xc ** 4);
        const camber = 0.05 * Math.sin(Math.PI * Math.min(1, xc * 1.1));
        const billow = cell * chord * (up ? 0.03 : -0.012) * Math.sin(Math.PI * Math.min(1, xc * 1.15)); // tissu gonflé entre deux nervures
        const rad = (camber + (up ? yt : -yt * 0.55)) * chord + billow;
        const zz = -0.32 * chord + xc * chord * (1 - 0.035 * cell * sstep(0.8, 1, xc)) + sweep; // bord de fuite festonné
        pos.push(ex * (RL + rad), ey * (RL + rad), zz);
        meta.push(t, xc, up ? 1 : 0, cell);
        if (!up && xc < 0.06 && at < 0.93) c.copy(cO);                       // ouvertures des caissons au bord d'attaque
        else c.copy(base).multiplyScalar((cell ? 1 : 0.84) * (up ? 1 : 0.74)); // nervures un peu plus sombres, intrados à l'ombre
        col.push(c.r, c.g, c.b);
      }
    }
    const idx = [];
    for (let i = 0; i < NS; i++) for (let k = 0; k < NA; k++) {
      const a = i * NA + k, b = i * NA + (k + 1) % NA, cc = (i + 1) * NA + k, d = (i + 1) * NA + (k + 1) % NA;
      idx.push(a, b, cc, b, d, cc);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    // suspentage : chaque nervure porte 3 suspentes (rangées A, B, C) ; elles se rejoignent par 3 (cascade) puis vont aux élévateurs
    const lowerIdx = (i, xcT) => { let best = -1, bd = 9; for (let k = 0; k < NA; k++) { const th = 2 * Math.PI * k / NA; if (th <= Math.PI) continue; const d = Math.abs(0.5 + 0.5 * Math.cos(th) - xcT); if (d < bd) { bd = d; best = k; } } return i * NA + best; };
    const fixed = [], mids = [], segs = [];
    const riserTop = (side, row) => fixed.push([side * 0.17, 0.42, -0.06 + row * 0.07]) - 1;
    for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
      const top = riserTop(side, row), bot = fixed.push([side * 0.17, 0, 0.0]) - 1;
      segs.push(['f', bot, 'f', top]);
      const ribs = [];
      for (let i = 2; i < NS - 1; i += 2) { const t = -1 + 2 * i / NS; if (Math.sign(t) === side) ribs.push(i); }
      if (side < 0) ribs.reverse(); // du centre vers le bout d'aile
      for (let gq = 0; gq < ribs.length; gq += 3) {
        const grp = ribs.slice(gq, gq + 3).map(i => lowerIdx(i, [0.1, 0.36, 0.64][row]));
        const m = mids.push({ v: grp, top }) - 1;
        for (const v of grp) segs.push(['v', v, 'm', m]);
        segs.push(['m', m, 'f', top]);
      }
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs.length * 6), 3));
    // points du bord de fuite où s'accrochent les freins (4 par côté)
    const te = [];
    for (const tt of [-0.92, -0.75, -0.58, -0.4, 0.4, 0.58, 0.75, 0.92]) { const i = Math.round((tt + 1) * NS / 2); te.push({ t: -1 + 2 * i / NS, v: i * NA }); }
    return { wing: g, lines: lg, meta: new Float32Array(meta), base: new Float32Array(pos), te, fixed, mids, segs };
  }

  // ---------- pilote articulé + voile souple ----------
  function buildPilot() {
    const root = new THREE.Group();
    const rig = PILOT.build({ hook: LOOK.hook, env: envTex, lin, colors: C });
    root.add(rig.body);
    const wingPivot = new THREE.Group(); wingPivot.position.set(0, G.carab, 0); root.add(wingPivot);
    const wg = wingGeometry(C.wingA, C.wingB, C.wingC);
    // nylon ripstop satiné ; le soleil traverse le tissu : l'intrados s'illumine par transparence
    const wmat = LOOK.hook(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, side: THREE.DoubleSide, envMap: envTex || null, envMapIntensity: envTex ? 0.45 : 0 }), sh => {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n\tiblIrradiance = vec3( 0.0 );')
        .replace('//@@APRES_LUMIERE', `
          #ifdef USE_FOG
          { vec3 wnT = inverseTransformDirection(normal, viewMatrix);
            float tr = max(dot(-wnT, SUN_D), 0.0);
            reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1.0, 0.95, 0.86) * 3.1 * 0.3 * tr * sunVisS; }
          #endif`);
    });
    const wing = new THREE.Mesh(wg.wing, wmat);
    wing.castShadow = true; wingPivot.add(wing);
    const lines = new THREE.LineSegments(wg.lines, new THREE.LineBasicMaterial({ color: lin(0x3a3e45), transparent: true, opacity: 0.42 }));
    lines.frustumCulled = false; wingPivot.add(lines);
    // élévateurs : sangles du mousqueton aux suspentes
    const strap = stdm({ color: lin(0x1a1d22), roughness: 0.7 });
    for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
      const top = wg.fixed[(side < 0 ? 0 : 6) + row * 2], a = new THREE.Vector3(side * 0.17, 0, 0), b = new THREE.Vector3(top[0], top[1], top[2]);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.022, 1, 0.006), strap);
      m.position.copy(a).lerp(b, 0.5); m.scale.y = a.distanceTo(b); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      m.castShadow = true; wingPivot.add(m);
    }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array((wg.te.length + 2) * 6), 3));
    const brakes = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: lin(0xff6a2a), transparent: true, opacity: 0.6 }));
    brakes.frustumCulled = false; root.add(brakes);
    return { root, rig, body: rig.body, wingPivot, wing, lines, brakes, geo: wg, gl: 1, acc: new THREE.Vector3(), lastV: null, sunV: 1 };
  }

  function buildGhost(geo) {
    const root = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.9, 1.4), transparent: true, opacity: 0.22, depthWrite: false });
    const pivot = new THREE.Group(); pivot.position.set(0, G.carab, 0); root.add(pivot);
    pivot.add(new THREE.Mesh(geo.wing.clone(), mat));
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 1.7, 8), mat); b.position.y = 0.85; root.add(b);
    root.visible = false;
    scene.add(root);
    return { root, pivot };
  }

  // ---------- particules : poussière d'air et gerbes de neige poudreuse ----------
  function buildParticles() {
    const N = 300, pos = new Float32Array(N * 6), seeds = new Float32Array(N * 3);
    const r = NOISE.rng(5);
    for (let i = 0; i < N; i++) { seeds[i * 3] = r(); seeds[i * 3 + 1] = r(); seeds[i * 3 + 2] = r(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(2.2, 2.25, 2.4), transparent: true, opacity: 0.2, depthWrite: false, fog: false }));
    ls.frustumCulled = false; scene.add(ls);
    streaks = { N, pos, seeds, mesh: ls };
    const M = 700;
    const sg = new THREE.BufferGeometry();
    const sp = new Float32Array(M * 3), sa = new Float32Array(M), ss = new Float32Array(M), sr = new Float32Array(M);
    for (let i = 0; i < M; i++) sr[i] = Math.random();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('aA', new THREE.BufferAttribute(sa, 1));
    sg.setAttribute('aS', new THREE.BufferAttribute(ss, 1)); sg.setAttribute('aR', new THREE.BufferAttribute(sr, 1));
    // neige poudreuse : nuage doux, éclairé par le soleil (clair en haut, bleuté dans son ombre), bord grumeleux
    const sm = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 400 }, sunCol: { value: new THREE.Color(3.0, 2.9, 2.7) }, skyCol: { value: new THREE.Color(0.75, 0.9, 1.25) } },
      vertexShader: 'attribute float aA; attribute float aS; attribute float aR; uniform float scale; varying float vA; varying float vR; void main(){ vA = aA; vR = aR; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aS * scale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform vec3 sunCol; uniform vec3 skyCol; varying float vA; varying float vR;
        void main(){
          vec2 q = gl_PointCoord - 0.5; float d = length(q);
          if (d > 0.5) discard;
          float lump = 0.75 + 0.25 * sin(atan(q.y, q.x) * 5.0 + vR * 40.0);
          float a = vA * smoothstep(0.5 * lump, 0.05, d);
          vec3 c = mix(skyCol, sunCol, clamp(0.55 - q.y * 1.4, 0.0, 1.0));
          gl_FragColor = vec4(c, a);
        }`,
      transparent: true, depthWrite: false
    });
    const pts = new THREE.Points(sg, sm); pts.frustumCulled = false; scene.add(pts);
    spray = { M, sp, sa, ss, geo: sg, mat: sm, life: new Float32Array(M), max: new Float32Array(M), vel: new Float32Array(M * 3), size: new Float32Array(M), next: 0 };
  }
  function emit(x, y, z, vx, vy, vz, n, spread, size, life) {
    const S = spray;
    for (let k = 0; k < n; k++) {
      const i = S.next; S.next = (S.next + 1) % S.M;
      S.sp[i * 3] = x + (Math.random() - 0.5) * 0.6; S.sp[i * 3 + 1] = y + Math.random() * 0.3; S.sp[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      S.vel[i * 3] = vx + (Math.random() - 0.5) * spread; S.vel[i * 3 + 1] = vy + Math.random() * spread * 0.7; S.vel[i * 3 + 2] = vz + (Math.random() - 0.5) * spread;
      S.max[i] = S.life[i] = life * (0.6 + Math.random() * 0.8); S.size[i] = size * (0.6 + Math.random() * 0.8);
    }
  }

  // ---------- traces de skis : deux sillons tassés dans la neige (élan, touch & go, atterrissage) ----------
  let tracks = null;
  function buildTracks() {
    const Q = 3000, pos = new Float32Array(Q * 18), nor = new Float32Array(Q * 18);
    for (let i = 0; i < Q * 6; i++) nor[i * 3 + 1] = 1;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setDrawRange(0, 0);
    const mat = stdm({ color: new THREE.Color(0.5, 0.58, 0.72), roughness: 0.85, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.receiveShadow = true;
    scene.add(mesh);
    tracks = { Q, pos, g, n: 0, next: 0, prev: null };
  }
  function updateTracks(p) {
    const T = tracks, ground = (p.mode === 'ski' || p.mode === 'landing') && p.V > 0.8;
    if (!ground) { T.prev = null; return; }
    const x = p.pos.x, z = p.pos.z;
    if (T.prev && Math.hypot(x - T.prev.x, z - T.prev.z) < 0.35) return;
    const vl = Math.hypot(p.vel.x, p.vel.z) || 1, rx = -p.vel.z / vl, rz = p.vel.x / vl;
    const pt = { x, z, rx, rz };
    if (T.prev) {
      const a = T.prev;
      for (const s of [-1, 1]) for (const [o0, o1] of [[0.065, 0.155]]) {
        const q = [];
        for (const [P, off] of [[a, o0], [a, o1], [pt, o0], [pt, o1]]) {
          const qx = P.x + P.rx * off * s, qz = P.z + P.rz * off * s;
          q.push([qx, W.heightAt(qx, qz) + 0.025, qz]);
        }
        const i = T.next; T.next = (T.next + 1) % T.Q; T.n = Math.min(T.Q, T.n + 1);
        T.pos.set([...q[0], ...q[2], ...q[1], ...q[1], ...q[2], ...q[3]], i * 18);
      }
      T.g.attributes.position.needsUpdate = true; T.g.setDrawRange(0, T.n * 6);
    }
    T.prev = pt;
  }

  // ---------- init ----------
  let usePost = false;
  function init(canvas) {
    LOOK.installFog();
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    usePost = POST.init(renderer);
    if (usePost) { renderer.toneMapping = THREE.NoToneMapping; renderer.outputEncoding = THREE.LinearEncoding; }
    else {
      // sans demi-flottants : rendu direct, antialiasing du navigateur impossible à rattraper ici, courbe ACES de three
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = LOOK.EXPOSURE; renderer.outputEncoding = THREE.sRGBEncoding;
    }
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xffffff, LOOK.HAZE);
    camera = new THREE.PerspectiveCamera(58, 1, 0.3, 20000);
    scene.add(new THREE.HemisphereLight(LOOK.COL.sky, LOOK.COL.ground, LOOK.HEMI_I));
    // soleil : ses ombres dynamiques ne servent qu'au pilote et à la voile (le reste est cuit)
    sun = new THREE.DirectionalLight(LOOK.COL.sun, LOOK.SUN_I);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 300 });
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    tex = LOOK.textures();
    envTex = LOOK.envMap(renderer);
    buildSky(); buildTerrain(); buildFar(); buildTrees(); buildRocks(); buildChalets(); buildCable(); buildGates(); buildTarget();
    pilot = buildPilot(); scene.add(pilot.root);
    ghost = buildGhost(pilot.geo);
    buildParticles(); buildTracks();
    // ombres du soleil cuites une fois : relief, sapins (tous en détail), rochers, chalets, pylônes
    const T = W.TREES;
    for (let i = 0; i < T.n; i++) trees.near.setMatrixAt(i, trees.M[i]);
    trees.near.count = T.n; trees.near.instanceMatrix.needsUpdate = true;
    const g = W.grid;
    let hmax = -1e9; for (const v of g.H) hmax = Math.max(hmax, v);
    const nearBox = new THREE.Box3(new THREE.Vector3(g.GX0, -20, g.GZ0), new THREE.Vector3(g.GX1, hmax + 90, g.GZ1));
    try { LOOK.bakeShadows(renderer, scene, nearBox, farBox); } catch (e) { console.warn('ombres statiques indisponibles', e); }
    trees.t = 99; trees.cx = 1e9;
    startLevel(); applyQuality(); window.addEventListener('resize', resize);
    // précompilation des shaders (pilote et fantôme compris) : évite les à-coups au premier départ
    pilot.root.visible = true; ghost.root.visible = true;
    try { renderer.compile(scene, camera); } catch (e) { /* facultatif */ }
    pilot.root.visible = false; ghost.root.visible = false;
  }
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (usePost) POST.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    sprayScale();
  }
  function sprayScale() { if (spray) spray.mat.uniforms.scale.value = window.innerHeight * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360)); }
  function draw() { if (usePost) POST.render(scene, camera); else { renderer.setRenderTarget(null); renderer.render(scene, camera); } }

  // ---------- pose du pilote et de la voile ----------
  const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  const _gu = new THREE.Vector3(), _qi = new THREE.Quaternion(), _acc = new THREE.Vector3(), _vl = new THREE.Vector3();
  function poseRig(rig, pos, up, fwd, inflate, opt) {
    _y.set(up.x, up.y, up.z); _z.set(-fwd.x, -fwd.y, -fwd.z);
    _x.crossVectors(_y, _z).normalize(); _z.crossVectors(_x, _y).normalize();
    _m.makeBasis(_x, _y, _z);
    rig.root.position.set(pos.x, pos.y, pos.z);
    rig.root.quaternion.setFromRotationMatrix(_m);
    if (opt && opt.tumble) { _e.set(opt.tumble.x, opt.tumble.y, opt.tumble.z); _q.setFromEuler(_e); rig.root.quaternion.multiply(_q); }
    // voile : couchée derrière le pilote avant le gonflage, puis au-dessus de lui, légèrement piquée
    const fwdFall = opt && opt.forward;
    const back = (1 - inflate) * (fwdFall ? -1.25 : 1.45), pitch = opt ? opt.pitch || 0 : 0, roll = opt ? opt.roll || 0 : 0;
    rig.pivot.rotation.set(back + pitch, 0, roll);
  }
  // voile souple : la charge ouvre l'arc, la décharge referme les bouts, les caissons respirent, le bord de fuite frémit,
  // les freins abaissent le bord de fuite de leur côté, le bout extérieur traîne en virage, la voile se froisse au décrochage
  function deformWing(p, bl, br, dt) {
    const gd = pilot.geo, P = gd.wing.attributes.position, M = gd.meta, B = gd.base;
    pilot.gl += (clamp(p.gload, 0.15, 4.5) - pilot.gl) * Math.min(1, dt * 6);
    const air = p.mode === 'air';
    const gl = air ? pilot.gl : 1;
    const sArc = clamp(1 - 0.045 * (gl - 1), 0.86, 1.06), curl = Math.max(0, 0.6 - gl) * 0.5;
    const flut = (0.006 + 0.028 * clamp((p.V - 15) / 15, 0, 1)) * (air ? 1 : 0.4);
    const yaw = air ? clamp(9.81 * Math.tan(p.bank) / Math.max(8, p.V), -1.5, 1.5) : 0;
    const stall = p.stall ? 1 : 0;
    for (let i = 0; i < P.count; i++) {
      const t = M[i * 4], xc = M[i * 4 + 1], up = M[i * 4 + 2], cell = M[i * 4 + 3], at = Math.abs(t);
      const bx = B[i * 3], by = B[i * 3 + 1];
      let r = Math.hypot(bx, by), th = Math.atan2(bx, by), z = B[i * 3 + 2];
      th *= sArc * (1 + curl * t * t);
      r += cell * (up ? 0.012 : -0.006) * Math.sin(time * 5.3 + t * 11);
      if (xc > 0.65) r += flut * ((xc - 0.65) / 0.35) * Math.sin(time * 23 + t * 9 + xc * 4);
      const b = (t > 0 ? br : bl) * sstep(0.1, 0.55, at) * Math.max(0, (xc - 0.5) / 0.5);
      r -= b * 0.6; z -= b * 0.15;
      z += -t * at * yaw * 0.9;
      if (stall) { r *= 0.93 + 0.05 * Math.sin(time * 13 + t * 7); z += 0.6 * (1 - at); }
      // fermeture frontale : le bord d'attaque se replie vers le bas et l'arrière, puis se regonfle
      if (p.collapseT > 0) { const cf = clamp(p.collapseT / 0.6, 0, 1) * (1 - xc) * (1 - 0.5 * at); r -= 0.9 * cf; z += 0.7 * cf; }
      P.setXYZ(i, r * Math.sin(th), r * Math.cos(th), z);
    }
    P.needsUpdate = true; gd.wing.computeVertexNormals();
    // suspentes : suivent la voile déformée
    const L = gd.lines.attributes.position.array, mid = gd.mids.map(m => {
      let x = 0, y = 0, zz = 0;
      for (const v of m.v) { x += P.getX(v); y += P.getY(v); zz += P.getZ(v); }
      const n = m.v.length, f = gd.fixed[m.top];
      return [x / n * 0.55 + f[0] * 0.45, y / n * 0.55 + f[1] * 0.45, zz / n * 0.55 + f[2] * 0.45];
    });
    const pt = (kind, id) => kind === 'v' ? [P.getX(id), P.getY(id), P.getZ(id)] : kind === 'm' ? mid[id] : gd.fixed[id];
    gd.segs.forEach((sg, k) => { const a = pt(sg[0], sg[1]), c2 = pt(sg[2], sg[3]); L.set(a, k * 6); L.set(c2, k * 6 + 3); });
    gd.lines.attributes.position.needsUpdate = true;
  }
  function posePilot(p, dt) {
    const crash = p.mode === 'crash';
    const gonfl = crash ? Math.max(0.2, p.inflate) : p.inflate;
    const bl = crash ? 0 : p.bl, br = crash ? 0 : p.br;
    poseRig({ root: pilot.root, pivot: pilot.wingPivot, wing: pilot.wing }, p.pos, p.up, p.fwd, gonfl, {
      forward: p.mode === 'landing' || p.mode === 'stopped', tumble: crash ? p.tumble : null, pitch: -0.12 + (p.bl + p.br) * 0.04,
      // la voile roule un peu avant le pilote (largeur des élévateurs) : elle part tout de suite du côté tiré
      roll: crash ? Math.sin(time * 9) * 0.3 : (p.mode === 'air' && p.free ? -clamp(((p.bankT || 0) - p.bank) * 0.4, -0.35, 0.35) : 0)
    });
    deformWing(p, bl, br, dt);
    // repère du pilote : normale de la neige et accélération ressentie (pour l'amorti et l'inertie des jambes)
    _qi.copy(pilot.root.quaternion).invert();
    const n = W.normalAt(p.pos.x, p.pos.z);
    _gu.set(n.x, n.y, n.z).applyQuaternion(_qi);
    if (dt > 0) {
      if (!pilot.lastV) pilot.lastV = new THREE.Vector3(p.vel.x, p.vel.y, p.vel.z);
      _acc.set((p.vel.x - pilot.lastV.x) / dt, (p.vel.y - pilot.lastV.y) / dt + 9.81, (p.vel.z - pilot.lastV.z) / dt);
      pilot.lastV.set(p.vel.x, p.vel.y, p.vel.z);
      pilot.acc.lerp(_acc.applyQuaternion(_qi), 1 - Math.exp(-dt * 12));
    }
    const agl = p.pos.y - W.heightAt(p.pos.x, p.pos.z);
    const launch = (p.mode === 'ready' || p.mode === 'ski') && p.inflate < 0.92;
    _vl.set(p.vel.x, p.vel.y, p.vel.z).applyQuaternion(_qi);
    PILOT.pose(pilot.rig, p, { dt, agl, acc: pilot.acc, velL: _vl, groundUp: _gu, launch });
    pilot.body.updateMatrix();
    // suspentes de frein : de chaque main à un point de cascade, puis aux 4 points du bord de fuite de son côté
    const show = !crash && p.inflate > 0.8;
    pilot.brakes.visible = show;
    if (show) {
      pilot.wingPivot.updateMatrix();
      const arr = pilot.brakes.geometry.attributes.position.array, te = pilot.geo.te, P2 = pilot.geo.wing.attributes.position;
      let k = 0;
      for (const side of [0, 1]) {
        const hand = PILOT.hand(pilot.rig, side, _y);
        hand.y += 0.06;
        const pts = te.filter(q => (q.t > 0 ? 1 : 0) === side).map(q => new THREE.Vector3(P2.getX(q.v), P2.getY(q.v), P2.getZ(q.v)).applyMatrix4(pilot.wingPivot.matrix));
        const m = pts.reduce((acc, q) => acc.add(q), new THREE.Vector3()).multiplyScalar(1 / pts.length).lerp(hand, 0.45);
        arr.set([hand.x, hand.y, hand.z, m.x, m.y, m.z], k * 6); k++;
        for (const q of pts) { arr.set([m.x, m.y, m.z, q.x, q.y, q.z], k * 6); k++; }
      }
      pilot.brakes.geometry.attributes.position.needsUpdate = true;
    }
  }

  // ---------- caméra ----------
  function chaseCam(p, dt, snap) {
    let hx = p.vel.x, hz = p.vel.z; const hl = Math.hypot(hx, hz);
    if (hl < 1) { hx = p.dir.x; hz = p.dir.z; } else { hx /= hl; hz /= hl; }
    const gam = Math.atan2(p.vel.y, Math.max(hl, 3)) * 0.55;
    const low = p.mode === 'air' ? 0 : 1 - clamp(p.inflate * 1.15, 0, 1);
    const V = p.V, back = 10.5 + clamp((V - 14) * 0.1, 0, 2.2) + low * 1.5, up = 2.9 + low * 4.2;
    const cg = Math.cos(gam), sg = Math.sin(gam);
    // la caméra suit plutôt la voile : en virage, on voit le pilote partir sous elle et revenir
    const air = p.mode === 'air' ? 1 : 0, ox = p.up.x * 4 * air, oz = p.up.z * 4 * air;
    _v.set(p.pos.x - hx * cg * back + ox, p.pos.y - sg * back + up, p.pos.z - hz * cg * back + oz);
    const k = snap ? 1 : 1 - Math.exp(-dt * 4.5);
    cam.pos.lerp(_v, k);
    const hg = W.heightAt(cam.pos.x, cam.pos.z) + 1.6; if (cam.pos.y < hg) cam.pos.y = hg;
    _v.set(p.pos.x + hx * cg * 16 + ox * 0.6, p.pos.y + sg * 16 + 2.2, p.pos.z + hz * cg * 16 + oz * 0.6);
    cam.look.lerp(_v, snap ? 1 : 1 - Math.exp(-dt * 7));
    camera.position.copy(cam.pos);
    // vibrations à grande vitesse près du sol
    const r = GAME.S.run, prox = r ? r.proxF : 0;
    const amp = clamp((V - 16) / 14, 0, 1) * (0.025 + prox * 0.07);
    if (amp > 0) camera.position.add(_v.set(Math.sin(time * 37.1) * amp, Math.sin(time * 41.7 + 1) * amp, Math.sin(time * 33.3 + 2) * amp));
    // roulis léger dans les virages
    _z.copy(cam.look).sub(camera.position).normalize();
    camera.up.set(0, 1, 0).applyAxisAngle(_z, -(p.swing * 0.42 + p.bank * 0.12) * (p.mode === 'air' ? 1 : 0.3));
    camera.lookAt(cam.look);
    const f = 58 + 16 * clamp((V - 12) / 16, 0, 1);
    cam.fov += (f - cam.fov) * (1 - Math.exp(-dt * 2.5));
    setFov(cam.fov);
  }
  function setFov(f) { if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); sprayScale(); } }
  function titleCam(dt) {
    const s = 60 + ((time * 13) % 820), x = W.xc(s) + 55 * Math.sin(time * 0.07) + 30, z = -s;
    _v.set(x, W.heightAt(x, z) + 38, z);
    cam.pos.lerp(_v, cam.mode === 'title' ? 1 - Math.exp(-dt * 1.5) : 1);
    const s2 = s + 170;
    _x.set(W.xc(s2) - 10, W.heightAt(W.xc(s2), -s2) + 6, -s2);
    cam.look.lerp(_x, cam.mode === 'title' ? 1 - Math.exp(-dt * 1.5) : 1);
    cam.mode = 'title';
    camera.position.copy(cam.pos); camera.up.set(0, 1, 0); camera.lookAt(cam.look); setFov(55);
  }
  function orbitCam(p, dt) {
    const a = time * 0.22 + 2.4, R = 12;
    _v.set(p.pos.x + Math.cos(a) * R, 0, p.pos.z + Math.sin(a) * R);
    _v.y = Math.max(W.heightAt(_v.x, _v.z) + 2, p.pos.y + 9); // assez haut pour passer au-dessus des sapins
    cam.pos.lerp(_v, 1 - Math.exp(-dt * 2));
    cam.look.lerp(_x.set(p.pos.x, p.pos.y + 2.5, p.pos.z), 1 - Math.exp(-dt * 3));
    camera.position.copy(cam.pos); camera.up.set(0, 1, 0); camera.lookAt(cam.look); setFov(55);
  }

  // ---------- particules ----------
  function updateParticles(dt, p) {
    const S = streaks, cp = camera.position, B = 30, Bh = 14;
    const vx = p ? p.vel.x : 0, vy = p ? p.vel.y : 0, vz = p ? p.vel.z : 0, k = 0.03;
    for (let i = 0; i < S.N; i++) {
      // positions fixes dans le monde, repliées dans une boîte autour de la caméra
      const ox = S.seeds[i * 3] * 2 * B, oy = S.seeds[i * 3 + 1] * 2 * Bh, oz = S.seeds[i * 3 + 2] * 2 * B;
      const x = cp.x - B + (((ox - (cp.x - B)) % (2 * B)) + 2 * B) % (2 * B);
      const y = cp.y - Bh + (((oy - (cp.y - Bh)) % (2 * Bh)) + 2 * Bh) % (2 * Bh);
      const z = cp.z - B + (((oz - (cp.z - B)) % (2 * B)) + 2 * B) % (2 * B);
      S.pos[i * 6] = x; S.pos[i * 6 + 1] = y; S.pos[i * 6 + 2] = z;
      S.pos[i * 6 + 3] = x - vx * k; S.pos[i * 6 + 4] = y - vy * k; S.pos[i * 6 + 5] = z - vz * k;
    }
    S.mesh.geometry.attributes.position.needsUpdate = true;
    S.mesh.material.opacity = p ? clamp((p.V - 12) / 20, 0, 1) * 0.16 : 0.04;
    // gerbes de neige : sous les skis à la glisse, et soufflées par la voile quand on rase la pente
    const Sp = spray;
    if (p && dt > 0) {
      const ground = p.mode === 'ski' || p.mode === 'landing';
      if (ground && p.V > 3) emit(p.pos.x, p.pos.y + 0.05, p.pos.z, -p.vel.x * 0.18, 1.0 + p.V * 0.04, -p.vel.z * 0.18, Math.ceil(p.V * dt * 9), 2.2 + p.V * 0.05, 0.5, 1.0);
      else if (p.mode === 'air') {
        const agl = p.pos.y - W.heightAt(p.pos.x, p.pos.z);
        if (agl < 2.6 && p.V > 13) emit(p.pos.x, p.pos.y - agl + 0.05, p.pos.z, p.vel.x * 0.12, 0.7, p.vel.z * 0.12, Math.ceil((2.6 - agl) * p.V * dt * 1.6), 2.6, 0.9, 1.3);
      }
    }
    for (let i = 0; i < Sp.M; i++) {
      if (Sp.life[i] <= 0) { Sp.sa[i] = 0; continue; }
      Sp.life[i] -= dt;
      Sp.vel[i * 3 + 1] -= 1.6 * dt;
      const dr = Math.exp(-2.2 * dt); Sp.vel[i * 3] *= dr; Sp.vel[i * 3 + 1] *= dr; Sp.vel[i * 3 + 2] *= dr;
      Sp.sp[i * 3] += Sp.vel[i * 3] * dt; Sp.sp[i * 3 + 1] += Sp.vel[i * 3 + 1] * dt; Sp.sp[i * 3 + 2] += Sp.vel[i * 3 + 2] * dt;
      const f = Sp.life[i] / Sp.max[i];
      Sp.sa[i] = Math.max(0, f) * Math.min(1, (1 - f) * 8) * 0.55; Sp.ss[i] = Sp.size[i] * (2.4 - 1.4 * f);
    }
    Sp.geo.attributes.position.needsUpdate = true; Sp.geo.attributes.aA.needsUpdate = true; Sp.geo.attributes.aS.needsUpdate = true;
  }

  // ---------- fantôme du record ----------
  function poseGhost(r) {
    const best = GAME.S.save.best;
    if (!best || !best.ghost || !r || r.p.mode === 'ready') { ghost.root.visible = false; return; }
    const g = best.ghost, f = r.t / 0.1, i = Math.floor(f);
    if (i >= g.length - 1) { ghost.root.visible = false; return; }
    const a = g[i], b = g[i + 1], t = f - i, L = k => a[k] + (b[k] - a[k]) * t;
    ghost.root.visible = true;
    poseRig({ root: ghost.root, pivot: ghost.pivot }, { x: L(0), y: L(1), z: L(2) }, { x: L(3), y: L(4), z: L(5) }, { x: L(6), y: L(7), z: L(8) }, L(9), { pitch: -0.1 });
  }

  // ---------- événements ----------
  function on(e) {
    const r = GAME.S.run;
    if (e.type === 'start') { cam.ready = false; for (let i = 0; i < gateObjs.length; i++) gateState(i, 0); spray.life.fill(0); pilot.lastV = null; tracks.n = 0; tracks.next = 0; tracks.prev = null; tracks.g.setDrawRange(0, 0); }
    else if (e.type === 'gate') gateState(e.i, e.ok ? 1 : -1);
    else if (e.type === 'contact' && r) emit(r.p.pos.x, r.p.pos.y, r.p.pos.z, r.p.vel.x * 0.2, 2.2, r.p.vel.z * 0.2, 40, 3.5, 1.0, 1.4);
    else if (e.type === 'crash' && r) emit(r.p.pos.x, r.p.pos.y + 0.5, r.p.pos.z, r.p.vel.x * 0.3, 3.0, r.p.vel.z * 0.3, 160, 6, 1.4, 2.0);
  }

  // ---------- image ----------
  function frame(dt, skipRender) {
    time += dt;
    const S = GAME.S, r = S.run;
    let p = null;
    if (r && (S.screen === 'run' || S.screen === 'crash' || S.screen === 'results')) {
      p = r.p;
      pilot.root.visible = true;
      posePilot(p, dt);
      if (S.screen === 'run') updateTracks(p);
      if (S.screen === 'results') orbitCam(p, dt);
      else if (S.screen === 'crash') {
        cam.look.lerp(_x.set(p.pos.x, p.pos.y + 1, p.pos.z), 1 - Math.exp(-dt * 4));
        camera.position.copy(cam.pos); camera.lookAt(cam.look);
      } else { chaseCam(p, dt, !cam.ready); cam.ready = true; cam.mode = 'run'; }
      poseGhost(S.screen === 'run' ? r : null);
      // porte suivante qui pulse
      gateObjs.forEach((o, i) => { if (o.state === 0) o.mat.emissiveIntensity = i === r.gate ? 0.35 + 0.35 * Math.sin(time * 6) : 0; });
    } else {
      pilot.root.visible = false; ghost.root.visible = false;
      titleCam(dt);
    }
    if (windsock) { const w = W.windAt(time); windsock.rotation.set(0.6 - Math.min(0.45, Math.hypot(w.x, w.z) * 0.35), Math.atan2(w.x, w.z), 0, 'YXZ'); }
    updateParticles(dt, p && S.screen !== 'results' ? p : null);
    treeLod(dt);
    // le soleil suit le pilote (ombres nettes du pilote et de la voile autour de lui)
    const t = p ? p.pos : cam.look;
    sun.target.position.set(t.x, t.y, t.z);
    sun.position.set(t.x + SUN_DIR.x * 150, t.y + SUN_DIR.y * 150, t.z + SUN_DIR.z * 150);
    sky.position.copy(camera.position);
    // post-traitement : flou de vitesse au-delà de ~60 km/h, plus fort près du sol
    const P = POST.P; P.time = time;
    const prox = r ? r.proxF || 0 : 0;
    P.speed = LEVELS[perf.level].blur && p && p.mode !== 'crash' && S.screen === 'run' ? clamp((p.V - 16) / 18, 0, 1) * (0.035 + 0.025 * prox) : 0;
    if (!skipRender) draw();
  }

  // ---------- qualité adaptative ----------
  // Niveaux du plus beau au plus léger. Téléphones et tablettes commencent au niveau 1 (ou au dernier niveau retenu − 1) ;
  // on descend d'un cran dès que la descente tombe sous ~48 images/s (sous ~28 à partir du niveau 3 : un iPhone en économie
  // d'énergie est bridé à 30 i/s, inutile de tout flouter pour rien). Mesure sur 1,5 s de jeu, hors 2 premières secondes.
  const LEVELS = [
    { pr: 2, msaa: 4, blur: 1, bloom: 1 },
    { pr: 1.6, msaa: 4, blur: 1, bloom: 1 },
    { pr: 1.35, msaa: 4, blur: 0, bloom: 1 },
    { pr: 1.15, msaa: 0, blur: 0, bloom: 1 },
    { pr: 1.0, msaa: 0, blur: 0, bloom: 0 },
    { pr: 0.8, msaa: 0, blur: 0, bloom: 0 }
  ];
  const MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || ''));
  const perf = { level: 0, t: 0, n: 0, warm: 2, fps: 0, ft: 0, fn: 0 };
  function startLevel() {
    const saved = GAME.S.save.opts.q;
    perf.level = Math.max(MOBILE ? 1 : 0, typeof saved === 'number' ? saved - 1 : 0);
    perf.level = Math.min(LEVELS.length - 1, perf.level);
  }
  function applyQuality() {
    const L = LEVELS[perf.level];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, L.pr));
    POST.setQuality(L);
    resize();
  }
  function adapt(dt) {
    perf.ft += dt; perf.fn++;
    if (perf.ft > 1) { perf.fps = perf.fn / perf.ft; perf.ft = perf.fn = 0; }
    const S = GAME.S;
    if (S.screen !== 'run' || S.paused || !S.run || S.run.p.mode === 'ready') { perf.warm = 2; perf.t = perf.n = 0; return; }
    if (perf.warm > 0) { perf.warm -= dt; return; }
    perf.t += dt; perf.n++;
    if (perf.t < 1.5) return;
    const fps = perf.n / perf.t; perf.t = perf.n = 0;
    const floor = perf.level < 3 ? 48 : 28;
    if (fps < floor && perf.level < LEVELS.length - 1) { perf.level++; applyQuality(); perf.warm = 1; GAME.setOpt('q', perf.level); }
  }
  function perfInfo() {
    const c = renderer.domElement;
    return { fps: perf.fps, level: perf.level, levels: LEVELS.length, w: c.width, h: c.height, mobile: MOBILE, post: usePost };
  }

  // position écran d'un point du monde (pour la flèche du HUD)
  function project(x, y, z) {
    _v.set(x, y, z).project(camera);
    return { x: (_v.x * 0.5 + 0.5) * window.innerWidth, y: (-_v.y * 0.5 + 0.5) * window.innerHeight, behind: _v.z > 1 };
  }

  // tests : gros plan, caméra placée dans le repère du pilote (x droite, y haut, z arrière) et visant un point de ce repère
  function closeup(cx, cy, cz, lx, ly, lz) {
    pilot.root.updateMatrixWorld(true);
    camera.position.set(cx, cy, cz).applyMatrix4(pilot.root.matrixWorld);
    _v.set(lx, ly, lz).applyMatrix4(pilot.root.matrixWorld);
    camera.up.set(0, 1, 0); camera.lookAt(_v); setFov(50);
    sky.position.copy(camera.position);
    POST.P.speed = 0;
    draw();
  }

  return { init, frame, on, project, adapt, perfInfo, closeup, get camera() { return camera; }, get renderer() { return renderer; }, get scene() { return scene; } };
})();
