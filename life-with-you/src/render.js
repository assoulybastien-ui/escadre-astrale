// Rendu three.js r128 : ciel, relief, sapins, rochers, chalets, télésiège, portes, cible, pilote et voile, fantôme, particules.
const R3D = (() => {
  const W = WORLD, G = FLIGHT.GEO;
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
  const clamp = W.clamp, sstep = W.sstep;
  const SUN_DIR = new THREE.Vector3(0.42, 0.58, 0.7).normalize(); // soleil dans le dos du pilote, un peu à droite
  const C = {
    horizon: lin(0xc9d7e6), zenith: lin(0x3a72bf), sun: lin(0xfff0dc), sky: lin(0xb8d0f0), ground: lin(0xeef1f5),
    wingA: 0xff5b1f, wingB: 0xf4f1ea, wingC: 0x14213d, jacket: 0xff5b1f, pants: 0x1b2433, helmet: 0xf4f6f8
  };
  let renderer, scene, camera, sun, sky, terrainMat;
  let pilot, ghost, streaks, spray, gateObjs = [], windsock;
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), ready: false, fov: 58, mode: '' };
  let time = 0;

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

  // ---------- textures de détail de la neige (bruit périodique, carrelable) ----------
  function detailTextures() {
    const N = 256, h = new Float32Array(N * N), r = NOISE.rng(7);
    for (const [P, amp, sx] of [[6, 0.42, 1], [12, 0.26, 1], [24, 0.16, 1], [48, 0.1, 1], [16, 0.22, 4]]) {
      const PX = P * sx, L = new Float32Array(PX * P); for (let i = 0; i < L.length; i++) L[i] = r();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const fx = x / N * PX, fy = y / N * P, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty);
        const a = L[(y0 % P) * PX + x0 % PX], b = L[(y0 % P) * PX + (x0 + 1) % PX], c = L[((y0 + 1) % P) * PX + x0 % PX], d = L[((y0 + 1) % P) * PX + (x0 + 1) % PX];
        h[y * N + x] += amp * (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy);
      }
    }
    let mn = 1e9, mx = -1e9; for (const v of h) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    const cm = document.createElement('canvas'), cn = document.createElement('canvas');
    cm.width = cm.height = cn.width = cn.height = N;
    const im = cm.getContext('2d').createImageData(N, N), inn = cn.getContext('2d').createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const k = y * N + x, v = (h[k] - mn) / (mx - mn);
      const g = 214 + v * 41;
      im.data[k * 4] = g - 6; im.data[k * 4 + 1] = g - 3; im.data[k * 4 + 2] = g; im.data[k * 4 + 3] = 255;
      const dx = (h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N]) * 7, dy = (h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x]) * 7;
      const l = Math.hypot(dx, dy, 1);
      inn.data[k * 4] = (-dx / l * 0.5 + 0.5) * 255; inn.data[k * 4 + 1] = (-dy / l * 0.5 + 0.5) * 255; inn.data[k * 4 + 2] = (1 / l * 0.5 + 0.5) * 255; inn.data[k * 4 + 3] = 255;
    }
    cm.getContext('2d').putImageData(im, 0, 0); cn.getContext('2d').putImageData(inn, 0, 0);
    const an = renderer.capabilities.getMaxAnisotropy();
    const map = new THREE.CanvasTexture(cm), nrm = new THREE.CanvasTexture(cn);
    for (const t of [map, nrm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, an); }
    map.encoding = THREE.sRGBEncoding;
    return { map, nrm };
  }

  // ---------- ciel ----------
  function buildSky() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { top: { value: C.zenith }, hor: { value: C.horizon }, sunDir: { value: SUN_DIR } },
      vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; varying vec3 vD;
        void main(){
          vec3 d = normalize(vD); float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(hor, top, pow(h, 0.55));
          float s = max(dot(d, sunDir), 0.0);
          col += vec3(1.0, 0.93, 0.8) * (pow(s, 1200.0) * 40.0 + pow(s, 60.0) * 0.5 + pow(s, 6.0) * 0.1);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false
    });
    sky = new THREE.Mesh(new THREE.SphereGeometry(14000, 32, 16), mat);
    sky.frustumCulled = false; sky.renderOrder = -1;
    scene.add(sky);
  }

  // ---------- relief proche (grille fine, en tuiles) ----------
  function buildTerrain(tex) {
    const { NX, NZ, H, GX0, GZ0, DX } = W.grid, nA = W.noise.nA, nC = W.noise.nC;
    const nrm = new Float32Array(NX * NZ * 3), col = new Float32Array(NX * NZ * 3);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i, i0 = Math.max(0, i - 1), i1 = Math.min(NX - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(NZ - 1, j + 1);
      const gx = (H[j * NX + i1] - H[j * NX + i0]) / ((i1 - i0) * DX), gz = (H[j1 * NX + i] - H[j0 * NX + i]) / ((j1 - j0) * DX);
      const l = Math.hypot(gx, 1, gz);
      nrm[k * 3] = -gx / l; nrm[k * 3 + 1] = 1 / l; nrm[k * 3 + 2] = -gz / l;
      const x = GX0 + i * DX, z = GZ0 + j * DX;
      const rk = sstep(0.84, 1.16, W.rockiness(Math.hypot(gx, gz), x, z));
      const v = 0.93 + 0.06 * nA(x / 45, z / 45);
      const rv = 0.7 + 0.4 * (0.5 + 0.5 * nC(x / 7, z / 7));
      col[k * 3] = 0.9 * v + (0.2 * rv - 0.9 * v) * rk;
      col[k * 3 + 1] = 0.93 * v + (0.185 * rv - 0.93 * v) * rk;
      col[k * 3 + 2] = 0.98 * v + (0.17 * rv - 0.98 * v) * rk;
    }
    terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex.map, normalMap: tex.nrm, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.88, metalness: 0 });
    // projection sur 3 axes : la texture ne s'étire pas sur les parois raides
    terrainMat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
        .replace('#include <map_fragment>', `vec3 tw = pow(abs(normalize(vWN)), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
          vec4 texelColor = texture2D(map, vWP.zy * 0.1428) * tw.x + texture2D(map, vWP.xz * 0.1428) * tw.y + texture2D(map, vWP.xy * 0.1428) * tw.z;
          texelColor = mapTexelToLinear(texelColor); diffuseColor *= texelColor;`)
        .replace('#include <normal_fragment_maps>', `{
          vec3 tnX = texture2D(normalMap, vWP.zy * 0.1428).xyz * 2.0 - 1.0;
          vec3 tnY = texture2D(normalMap, vWP.xz * 0.1428).xyz * 2.0 - 1.0;
          vec3 tnZ = texture2D(normalMap, vWP.xy * 0.1428).xyz * 2.0 - 1.0;
          vec3 pert = vec3(0.0, tnX.y, tnX.x) * tw.x + vec3(tnY.x, 0.0, tnY.y) * tw.y + vec3(tnZ.x, tnZ.y, 0.0) * tw.z;
          vec3 wn = normalize(normalize(vWN) + pert * normalScale.x);
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`);
    };
    const TS = 64;
    for (let tj = 0; tj < NZ - 1; tj += TS) for (let ti = 0; ti < NX - 1; ti += TS) {
      const nx = Math.min(TS, NX - 1 - ti), nz = Math.min(TS, NZ - 1 - tj), vc = (nx + 1) * (nz + 1);
      const pos = new Float32Array(vc * 3), no = new Float32Array(vc * 3), co = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
      let v = 0;
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
        const gi = ti + i, gj = tj + j, k = gj * NX + gi;
        pos[v * 3] = GX0 + gi * DX; pos[v * 3 + 1] = H[k]; pos[v * 3 + 2] = GZ0 + gj * DX;
        no.set(nrm.subarray(k * 3, k * 3 + 3), v * 3); co.set(col.subarray(k * 3, k * 3 + 3), v * 3);
        uv[v * 2] = pos[v * 3] / 7; uv[v * 2 + 1] = pos[v * 3 + 2] / 7;
        v++;
      }
      const idx = [];
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(no, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(co, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, terrainMat); mesh.receiveShadow = true;
      scene.add(mesh);
    }
    // jupe sous le bord de la grille (cache les raccords avec le relief lointain)
    const sk = [];
    const edge = [];
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
    scene.add(new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: lin(0xdfe6ee), roughness: 0.9, side: THREE.DoubleSide })));
  }

  // ---------- relief lointain (massifs, vallée) : cellules alignées sur le bord de la grille fine ----------
  function buildFar() {
    const g = W.grid, st = 82.5, X0 = g.GX0 - st * 92, Z0 = g.GZ0 - st * 83, NXf = 8 + 184 + 1, NZf = 22 + 83 + 90 + 1;
    const nA = W.noise.nA, nE = W.noise.nE;
    const hs = new Float32Array(NXf * NZf);
    for (let j = 0; j < NZf; j++) for (let i = 0; i < NXf; i++) hs[j * NXf + i] = W.hRaw(X0 + i * st, Z0 + j * st);
    const pos = new Float32Array(NXf * NZf * 3), col = new Float32Array(NXf * NZf * 3);
    for (let j = 0; j < NZf; j++) for (let i = 0; i < NXf; i++) {
      const k = j * NXf + i, x = X0 + i * st, z = Z0 + j * st, h = hs[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      const i0 = Math.max(0, i - 1), i1 = Math.min(NXf - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(NZf - 1, j + 1);
      const gx = (hs[j * NXf + i1] - hs[j * NXf + i0]) / ((i1 - i0) * st), gz = (hs[j1 * NXf + i] - hs[j0 * NXf + i]) / ((j1 - j0) * st);
      const sl = Math.hypot(gx, gz);
      const rock = sstep(0.62, 0.95, sl + 0.25 * nE(x / 300, z / 300));
      const forest = (1 - sstep(260, 420, h + 120 * nA(x / 400, z / 400))) * (1 - sstep(0.45, 0.7, sl)) * sstep(-0.3, 0.2, nA(x / 260, z / 260));
      let r = 0.9, gg = 0.93, b = 0.98;
      r += (0.09 - r) * forest * 0.85; gg += (0.13 - gg) * forest * 0.85; b += (0.11 - b) * forest * 0.85;
      r += (0.22 - r) * rock; gg += (0.21 - gg) * rock; b += (0.2 - b) * rock;
      col[k * 3] = r; col[k * 3 + 1] = gg; col[k * 3 + 2] = b;
    }
    const idx = [];
    for (let j = 0; j < NZf - 1; j++) for (let i = 0; i < NXf - 1; i++) {
      const cx = X0 + (i + 0.5) * st, cz = Z0 + (j + 0.5) * st;
      if (cx > g.GX0 && cx < g.GX1 && cz > g.GZ0 && cz < g.GZ1) continue; // couvert par la grille fine
      const a = j * NXf + i, b = a + 1, c = a + NXf, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
    scene.add(m);
  }

  // ---------- sapins ----------
  function buildTrees() {
    const parts = [], snow = lin(0xe8eef4), dark = lin(0x10261b), mid = lin(0x1d3a29);
    const trunk = new THREE.CylinderGeometry(0.018, 0.03, 0.2, 5, 1, true); trunk.translate(0, 0.1, 0);
    parts.push(paint(trunk, solid(lin(0x3b2a20))));
    for (const [y, h, r] of [[0.1, 0.42, 1], [0.32, 0.36, 0.78], [0.52, 0.3, 0.56], [0.7, 0.3, 0.34]]) {
      const c = new THREE.ConeGeometry(0.27 * r, h, 8, 1, true); c.translate(0, y + h / 2, 0);
      parts.push(paint(c, (col, x, yy) => { const f = (yy - y) / h; col.copy(dark).lerp(mid, f).lerp(snow, Math.max(0, f - 0.45) * 0.9); }));
    }
    const geo = merge(parts);
    const T = W.TREES;
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), T.n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler(), col = new THREE.Color();
    const r = NOISE.rng(11);
    for (let i = 0; i < T.n; i++) {
      e.set(0, r() * 6.28, 0); q.setFromEuler(e);
      const k = T.R[i] / 0.27;
      s.set(k, T.H[i], k); p.set(T.X[i], T.Y[i], T.Z[i]);
      m.compose(p, q, s); mesh.setMatrixAt(i, m);
      const v = 0.85 + r() * 0.3; col.setRGB(v, v * (0.95 + r() * 0.1), v); mesh.setColorAt(i, col);
    }
    mesh.castShadow = true; mesh.frustumCulled = false;
    scene.add(mesh);
  }

  // ---------- rochers ----------
  function buildRocks() {
    const geo = new THREE.IcosahedronGeometry(1, 1), p = geo.attributes.position, n = NOISE.make(3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.28 * n(x * 1.7 + z, y * 1.7 - z);
      p.setXYZ(i, x * k * 1.15, y * k * 0.8, z * k);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: lin(0x4a4642), roughness: 0.95, flatShading: true }), W.ROCKS.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    W.ROCKS.forEach((r, i) => { e.set(0, r.rot, 0); q.setFromEuler(e); m.compose(new THREE.Vector3(r.x, r.y, r.z), q, new THREE.Vector3(r.r, r.r, r.r)); mesh.setMatrixAt(i, m); });
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    scene.add(mesh);
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
    const mesh = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    mesh.castShadow = true; mesh.receiveShadow = true;
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
    const mesh = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }));
    mesh.castShadow = true;
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
      const mat = new THREE.MeshStandardMaterial({ color: lin(C.wingA), roughness: 0.5, emissive: lin(C.wingA), emissiveIntensity: 0.0, side: THREE.DoubleSide });
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
      const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 64), new THREE.MeshStandardMaterial({ color: lin(hex), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.rotation.x = -Math.PI / 2; m.receiveShadow = true; grp.add(m);
    };
    mk(0, 5, 0xff5b1f); mk(11.4, 12.4, 0xff5b1f); mk(19.3, 20.3, 0xd23c1a);
    grp.position.set(L.x, y + 0.05, L.z);
    grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n.x, n.y, n.z));
    scene.add(grp);
    // manche à air
    const wx = L.x + 30, wz = L.z - 6, wy = W.heightAt(wx, wz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6, 6), new THREE.MeshStandardMaterial({ color: lin(0xcfd5dc), roughness: 0.5 }));
    pole.position.set(wx, wy + 3, wz); pole.castShadow = true; scene.add(pole);
    const cone = new THREE.ConeGeometry(0.45, 2.6, 12, 4, true); cone.rotateX(Math.PI / 2); cone.translate(0, 0, 1.3);
    const sock = new THREE.Mesh(paint(cone, (c, x, y, z) => c.copy(lin(Math.floor((z + 0.1) / 0.65) % 2 ? 0xffffff : 0xff5b1f))), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide }));
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

  // ---------- pilote debout dans sa sellette, à skis ----------
  function buildPilot() {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const M = (hex, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: lin(hex), roughness: r, metalness: m });
    const jacket = M(C.jacket, 0.65), pants = M(C.pants, 0.8), helmet = M(C.helmet, 0.35), skiM = M(0x111a26, 0.4, 0.2), dark = M(0x1a1d22, 0.8), skin = M(0xc79a7e, 0.8);
    const add = (geo, mat, x, y, z, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    const legs = [];
    for (const sx of [-0.12, 0.12]) {
      const hip = new THREE.Group(); hip.position.set(sx, 0.95, 0); body.add(hip);
      const lg = new THREE.CylinderGeometry(0.08, 0.065, 0.84, 8); lg.translate(0, -0.42, 0);
      add(lg, pants, 0, 0, 0, hip);
      add(new THREE.BoxGeometry(0.15, 0.16, 0.32), dark, 0, -0.86, -0.03, hip);
      const ski = add(new THREE.BoxGeometry(0.1, 0.03, 1.75), skiM, 0, -0.95, -0.12, hip);
      legs.push({ hip, ski });
    }
    add(new THREE.CylinderGeometry(0.17, 0.15, 0.6, 10), jacket, 0, 1.26, 0);
    add(new THREE.BoxGeometry(0.44, 0.24, 0.36), dark, 0, 0.98, 0.04);       // sellette
    add(new THREE.BoxGeometry(0.34, 0.42, 0.14), dark, 0, 1.22, 0.2);         // dorsale / secours
    add(new THREE.SphereGeometry(0.11, 12, 10), skin, 0, 1.68, 0);
    const hm = add(new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), helmet, 0, 1.69, 0);
    hm.scale.set(1, 1.05, 1.12);
    add(new THREE.BoxGeometry(0.2, 0.06, 0.05), dark, 0, 1.68, -0.115);         // masque
    const arms = [];
    const armGeo = new THREE.CylinderGeometry(0.055, 0.05, 1, 8); armGeo.translate(0, 0.5, 0);
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(0.19 * sx, 1.5, 0); body.add(sh);
      const arm = add(armGeo, jacket, 0, 0, 0, sh);
      const hand = add(new THREE.SphereGeometry(0.06, 8, 6), dark, 0, 0, 0, body);
      arms.push({ sh, arm, hand, sx });
    }
    const wingPivot = new THREE.Group(); wingPivot.position.set(0, G.carab, 0); root.add(wingPivot);
    const wg = wingGeometry(C.wingA, C.wingB, C.wingC);
    // nylon ripstop : un peu satiné, légèrement translucide à contre-jour (émissif faible)
    const wing = new THREE.Mesh(wg.wing, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.02, emissive: lin(0x202020), emissiveIntensity: 1, side: THREE.DoubleSide }));
    wing.castShadow = true; wingPivot.add(wing);
    const lines = new THREE.LineSegments(wg.lines, new THREE.LineBasicMaterial({ color: lin(0x2a2d33), transparent: true, opacity: 0.5 }));
    lines.frustumCulled = false; wingPivot.add(lines);
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array((wg.te.length + 2) * 6), 3));
    const brakes = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: lin(0xd8572a), transparent: true, opacity: 0.5 }));
    brakes.frustumCulled = false; root.add(brakes);
    return { root, body, legs, arms, wingPivot, wing, lines, brakes, geo: wg, gl: 1 };
  }

  function buildGhost(geo) {
    const root = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: lin(0x8fd8ff), transparent: true, opacity: 0.26, depthWrite: false });
    const pivot = new THREE.Group(); pivot.position.set(0, G.carab, 0); root.add(pivot);
    pivot.add(new THREE.Mesh(geo.wing.clone(), mat));
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 1.7, 8), mat); b.position.y = 0.85; root.add(b);
    root.visible = false;
    scene.add(root);
    return { root, pivot };
  }

  // ---------- particules : traînées d'air et gerbes de neige ----------
  function buildParticles() {
    const N = 420, pos = new Float32Array(N * 6), seeds = new Float32Array(N * 3);
    const r = NOISE.rng(5);
    for (let i = 0; i < N; i++) { seeds[i * 3] = r(); seeds[i * 3 + 1] = r(); seeds[i * 3 + 2] = r(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
    ls.frustumCulled = false; scene.add(ls);
    streaks = { N, pos, seeds, mesh: ls };
    const M = 500;
    const sg = new THREE.BufferGeometry();
    const sp = new Float32Array(M * 3), sa = new Float32Array(M), ss = new Float32Array(M);
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('aA', new THREE.BufferAttribute(sa, 1)); sg.setAttribute('aS', new THREE.BufferAttribute(ss, 1));
    const sm = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 400 }, color: { value: lin(0xf6f9fc) } },
      vertexShader: 'attribute float aA; attribute float aS; uniform float scale; varying float vA; void main(){ vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aS * scale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 color; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(color, vA * (1.0 - d * 2.0)); }',
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

  // ---------- init ----------
  function init(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xffffff, 0.00016); scene.fog.color.copy(C.horizon);
    camera = new THREE.PerspectiveCamera(58, 1, 0.3, 20000);
    scene.add(new THREE.HemisphereLight(C.sky, C.ground, 0.72));
    sun = new THREE.DirectionalLight(C.sun, 2.2);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 420 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.5;
    scene.add(sun, sun.target);
    const tex = detailTextures();
    buildSky(); buildTerrain(tex); buildFar(); buildTrees(); buildRocks(); buildChalets(); buildCable(); buildGates(); buildTarget();
    pilot = buildPilot(); scene.add(pilot.root);
    ghost = buildGhost(pilot.geo);
    buildParticles();
    resize(); window.addEventListener('resize', resize);
  }
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    sprayScale();
  }
  function sprayScale() { if (spray) spray.mat.uniforms.scale.value = window.innerHeight * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360)); }

  // ---------- pose du pilote et de la voile ----------
  const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
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
      forward: p.mode === 'landing' || p.mode === 'stopped', tumble: crash ? p.tumble : null, pitch: -0.12 + (p.cl - 0.45) * 0.3, roll: crash ? Math.sin(time * 9) * 0.3 : 0
    });
    deformWing(p, bl, br, dt);
    // bras : chaque main tient sa poignée ; tirer = la main descend vers la hanche
    for (const a of pilot.arms) {
      const pull = a.sx < 0 ? bl : br;
      _v.set((0.33 - pull * 0.08) * a.sx, 1.92 - pull * 0.72, -0.06 + pull * 0.2);
      if (p.mode === 'ready' || p.mode === 'ski' && p.inflate < 0.8) _v.set(0.36 * a.sx, 1.5 - p.inflate * 0.2, 0.25); // tient les élévateurs à l'élan
      a.hand.position.copy(_v);
      const d = _v.clone().sub(a.sh.position), l = d.length();
      a.arm.scale.set(1, l, 1);
      a.arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    }
    // jambes : flexion à skis, légèrement en avant en vol
    const ground = p.mode === 'ski' || p.mode === 'landing' || p.mode === 'stopped';
    const kneel = ground ? 0.18 + Math.min(0.25, p.V / 60) : 0.08;
    for (const l of pilot.legs) { l.hip.rotation.x = -kneel; l.ski.rotation.x = kneel; }
    // le pilote se balance sous la voile : rotation autour des mousquetons (écart entre voile et pilote)
    const sw = p.mode === 'air' ? clamp(p.bank - p.swing, -0.85, 0.85) : 0, P = G.carab;
    pilot.body.rotation.z = sw;
    pilot.body.position.set(P * Math.sin(sw), P - P * Math.cos(sw) + (ground ? -kneel * 0.4 : 0), 0);
    pilot.body.updateMatrix();
    // suspentes de frein : de chaque main à un point de cascade, puis aux 4 points du bord de fuite de son côté
    const show = !crash && p.inflate > 0.8;
    pilot.brakes.visible = show;
    if (show) {
      pilot.wingPivot.updateMatrix();
      const arr = pilot.brakes.geometry.attributes.position.array, te = pilot.geo.te, P2 = pilot.geo.wing.attributes.position;
      let k = 0;
      for (const side of [0, 1]) {
        const hand = _y.copy(pilot.arms[side].hand.position).applyMatrix4(pilot.body.matrix);
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
    const S = streaks, cp = camera.position, B = 34, Bh = 16;
    const vx = p ? p.vel.x : 0, vy = p ? p.vel.y : 0, vz = p ? p.vel.z : 0, k = 0.035;
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
    S.mesh.material.opacity = p ? clamp((p.V - 8) / 20, 0, 1) * 0.32 : 0.1;
    // gerbes de neige
    const Sp = spray;
    if (p && dt > 0) {
      const ground = p.mode === 'ski' || p.mode === 'landing';
      if (ground && p.V > 3) emit(p.pos.x, p.pos.y + 0.05, p.pos.z, -p.vel.x * 0.25, 1.2, -p.vel.z * 0.25, Math.ceil(p.V * dt * 6), 2.5, 0.55, 0.9);
      else if (p.mode === 'air') {
        const agl = p.pos.y - W.heightAt(p.pos.x, p.pos.z);
        if (agl < 2.2 && p.V > 14) emit(p.pos.x, p.pos.y - agl + 0.05, p.pos.z, p.vel.x * 0.15, 0.8, p.vel.z * 0.15, Math.ceil((2.2 - agl) * p.V * dt * 1.5), 3, 0.8, 1.1);
      }
    }
    for (let i = 0; i < Sp.M; i++) {
      if (Sp.life[i] <= 0) { Sp.sa[i] = 0; continue; }
      Sp.life[i] -= dt;
      Sp.vel[i * 3 + 1] -= 2.5 * dt;
      const dr = Math.exp(-1.8 * dt); Sp.vel[i * 3] *= dr; Sp.vel[i * 3 + 2] *= dr;
      Sp.sp[i * 3] += Sp.vel[i * 3] * dt; Sp.sp[i * 3 + 1] += Sp.vel[i * 3 + 1] * dt; Sp.sp[i * 3 + 2] += Sp.vel[i * 3 + 2] * dt;
      const f = Sp.life[i] / Sp.max[i];
      Sp.sa[i] = Math.max(0, f) * 0.75; Sp.ss[i] = Sp.size[i] * (1.8 - f);
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
    if (e.type === 'start') { cam.ready = false; for (let i = 0; i < gateObjs.length; i++) gateState(i, 0); spray.life.fill(0); }
    else if (e.type === 'gate') gateState(e.i, e.ok ? 1 : -1);
    else if (e.type === 'contact' && r) emit(r.p.pos.x, r.p.pos.y, r.p.pos.z, r.p.vel.x * 0.2, 2.5, r.p.vel.z * 0.2, 30, 4, 0.9, 1.2);
    else if (e.type === 'crash' && r) emit(r.p.pos.x, r.p.pos.y + 0.5, r.p.pos.z, r.p.vel.x * 0.3, 3.5, r.p.vel.z * 0.3, 140, 7, 1.3, 1.8);
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
    // le soleil suit le pilote (ombres nettes autour de lui)
    const t = p ? p.pos : cam.look;
    sun.target.position.set(t.x, t.y, t.z);
    sun.position.set(t.x + SUN_DIR.x * 200, t.y + SUN_DIR.y * 200, t.z + SUN_DIR.z * 200);
    sky.position.copy(camera.position);
    if (!skipRender) renderer.render(scene, camera);
  }

  // résolution adaptative : si l'iPhone peine (< ~42 images/s), on baisse la densité de pixels par paliers
  const perf = { t: 0, n: 0, pr: 0 };
  function adapt(dt) {
    if (!perf.pr) perf.pr = renderer.getPixelRatio();
    perf.t += dt; perf.n++;
    if (perf.t < 2.5) return;
    const avg = perf.t / perf.n; perf.t = perf.n = 0;
    if (avg > 1 / 42 && perf.pr > 1.01) { perf.pr = Math.max(1, perf.pr - 0.25); renderer.setPixelRatio(perf.pr); resize(); }
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
    renderer.render(scene, camera);
  }

  return { init, frame, on, project, adapt, closeup, get camera() { return camera; }, get renderer() { return renderer; } };
})();
