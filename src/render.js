// ============================================================
//  ESCADRE ASTRALE — moteur de rendu « cinéma » (Three.js r128)
//  HDR linéaire → bloom → étalonnage ACES, ombres douces, PBR, IBL
// ============================================================
var R3 = window.THREE ? (() => {
  const T = window.THREE;
  const PI = Math.PI;
  const ASSET_BASE = 'assets/';
  let renderer, scene, camera, composer = null, bloomPass = null, finalPass = null, canvas;
  let vw = 1, vh = 1, insetTop = 0, insetBottom = 0, insetLeft = 0;
  let time = 0, ready = false, hdrType = T.UnsignedByteType;
  const cam = { az: 0, el: 0.86, zoom: 1, shake: 0, mode: 'hub', hubAz: 0.6, look: new T.Vector3(0, 3, 0), pos: new T.Vector3(0, 10, 30), focus: new T.Vector3() };
  let S = null, me = -1, UIsel = -1, tapCb = null, eclipseLvl = 0, flashLvl = 0;
  let UISet = new Set(), UIenemy = null, UIplace = null;
  const U = { time: { value: 0 }, phase: { value: new T.Color('#9d6bff') }, eclipse: { value: 0 }, sunDir: { value: new T.Vector3(380, 150, -520).normalize() } };
  const phaseCol = new T.Color('#9d6bff');
  const A = { trooper: null, colossus: null, tex: {} };
  const L = {};                 // lumières et objets de décor
  let rigs = [], previewRigs = [], previewModel = null, raidM = [];
  const addM = new Map(), zoneM = new Map(), markM = new Map(), fx = [];
  const tmpV = new T.Vector3(), tmpV2 = new T.Vector3(), tmpC = new T.Color(), white = new T.Color(1, 1, 1);

  // ---------- qualité ----------
  const PRESETS = {
    ultra: { label: 'Ultra', dpr: 2, msaa: true, shadow: 2048, bloom: true },
    haute: { label: 'Haute', dpr: 1.6, msaa: true, shadow: 2048, bloom: true },
    moyenne: { label: 'Moyenne', dpr: 1.25, msaa: false, shadow: 1024, bloom: true },
    basse: { label: 'Basse', dpr: 1, msaa: false, shadow: 0, bloom: false },
  };
  let qName = 'auto', Q = PRESETS.haute, dprScale = 1, perf = { acc: 0, n: 0, t: 0, cool: 3 };
  function currentDpr() { return Math.max(0.75, Math.min(window.devicePixelRatio || 1, Q.dpr) * dprScale); }

  // ---------- textures procédurales ----------
  function canvasTex(size, draw) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const t = new T.CanvasTexture(c); return t; }
  const radial = (stops, size = 128) => canvasTex(size, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
  const glowTex = radial([[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,255,255,0.55)'], [0.45, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
  const softTex = radial([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']], 64);
  const streakTex = canvasTex(256, (g, s) => { const gr = g.createLinearGradient(0, 0, s, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); const v = g.createLinearGradient(0, 0, 0, s); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = v; g.fillRect(0, 0, s, s); });
  const ringTexC = canvasTex(256, (g, s) => { g.clearRect(0, 0, s, s); g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 6; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 10, 0, PI * 2); g.stroke(); g.filter = 'blur(6px)'; g.lineWidth = 12; g.globalAlpha = 0.5; g.stroke(); });

  // ---------- GLSL commun ----------
  const NOISE = `
    float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float noise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
      return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
    float fbm(vec3 p){ float v=0.0; float a=0.5; for(int i=0;i<6;i++){ v+=a*noise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return v; }`;

  // ---------- matériaux ----------
  // les ShaderMaterial écrivent dans la cible via l'encodage de sortie (RGBE pour l'environnement)
  function SM(p) { p.fragmentShader = p.fragmentShader.replace(/}\s*$/, ' gl_FragColor = linearToOutputTexel(gl_FragColor); }'); return new T.ShaderMaterial(p); }
  // PBR triplanaire (monde ou objet) + relief par dérivées + émission par masque
  function triMat(o) {
    const set = A.tex[o.set || 'hull'] || {};
    const m = new T.MeshStandardMaterial({
      color: new T.Color(o.color || '#ffffff').convertSRGBToLinear(), metalness: o.metal ?? 0.9, roughness: o.rough ?? 0.4,
      emissive: new T.Color(o.emis || '#000000').convertSRGBToLinear(), emissiveIntensity: o.emisI || 0, envMapIntensity: o.env ?? 1, skinning: !!o.skinning,
      side: o.side || T.FrontSide, transparent: !!o.transparent, opacity: o.opacity ?? 1, flatShading: !!o.flat,
    });
    m.extensions = { derivatives: true };
    const u = {
      tA: { value: set.albedo || null }, tO: { value: set.orm || null }, tH: { value: set.height || null }, tE: { value: set.emissive || null },
      uScale: { value: o.scale || 0.25 }, uBump: { value: o.bump ?? 0.05 }, uUseA: { value: set.albedo && o.albedo !== false ? (o.albedoMix ?? 1) : 0 },
      uUseO: { value: set.orm && o.orm !== false ? 1 : 0 }, uLine: { value: new T.Color(o.line || '#000000').convertSRGBToLinear().multiplyScalar(o.lineI || 0) },
      uRim: { value: new T.Color(o.rim || '#000000').convertSRGBToLinear().multiplyScalar(o.rimI || 0) }, uTime: U.time, uPulse: { value: 0 }, uWorld: { value: o.world ? 1 : 0 },
    };
    m.userData.u = u; m.userData.lineI = o.lineI || 0;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'varying vec3 vTP; varying vec3 vTN; uniform float uWorld;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        if (uWorld > 0.5) { vec4 wp = modelMatrix * vec4(position,1.0);
          #ifdef USE_INSTANCING
            wp = modelMatrix * instanceMatrix * vec4(position,1.0);
          #endif
          vTP = wp.xyz; vTN = normalize(mat3(modelMatrix) * normal); }
        else { vTP = position; vTN = normal; }`);
      sh.fragmentShader = `varying vec3 vTP; varying vec3 vTN; uniform sampler2D tA; uniform sampler2D tO; uniform sampler2D tH; uniform sampler2D tE;
        uniform float uScale; uniform float uBump; uniform float uUseA; uniform float uUseO; uniform vec3 uLine; uniform vec3 uRim; uniform float uTime; uniform float uPulse;
        vec3 triW(){ vec3 w = pow(abs(normalize(vTN)), vec3(4.0)); return w/(w.x+w.y+w.z+1e-4); }
        vec4 tri(sampler2D t){ vec3 w=triW(); vec3 p=vTP*uScale; return texture2D(t,p.zy)*w.x + texture2D(t,p.xz)*w.y + texture2D(t,p.xy)*w.z; }
      ` + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          if (uUseA > 0.0) { vec3 ta = tri(tA).rgb; ta = ta*ta; diffuseColor.rgb *= mix(vec3(1.0), ta*3.2, uUseA); }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          vec3 tORM = vec3(1.0, 0.5, 1.0); if (uUseO > 0.5) { tORM = tri(tO).rgb; roughnessFactor *= tORM.g*2.0; }`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
          if (uUseO > 0.5) { metalnessFactor *= mix(0.4, 1.0, tORM.b); }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          if (uBump > 0.0) { float bH = tri(tH).r; vec3 bSp = -vViewPosition; vec3 bDx = dFdx(bSp), bDy = dFdy(bSp);
            float bHx = dFdx(bH)*uBump, bHy = dFdy(bH)*uBump; vec3 bR1 = cross(bDy,normal), bR2 = cross(normal,bDx);
            float bDet = dot(bDx,bR1); vec3 bG = sign(bDet)*(bHx*bR1 + bHy*bR2); vec3 bN = abs(bDet)*normal - bG; if (dot(bN,bN) > 1e-20) normal = normalize(bN); }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float eLine = tri(tE).r; totalEmissiveRadiance += uLine * eLine * (0.75 + 0.25*sin(uTime*1.7 + vTP.y*2.0)) * (1.0 + uPulse);
          float eRim = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0); totalEmissiveRadiance += uRim * eRim * (1.0 + uPulse);
          #ifdef USE_AOMAP
          #endif
          totalEmissiveRadiance *= mix(1.0, tORM.r, 0.3);`);
    };
    return m;
  }
  const hdr = (c, k) => new T.Color(c).convertSRGBToLinear().multiplyScalar(k);
  const glowMat = (c, k, o = {}) => new T.MeshBasicMaterial(Object.assign({ color: hdr(c, k), transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }, o));
  function fresnelMat(color, power, intensity, opacity, side) {
    return SM({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: side || T.FrontSide,
      uniforms: { uColor: { value: hdr(color, 1) }, uPow: { value: power }, uInt: { value: intensity }, uOp: { value: opacity } },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uPow; uniform float uInt; uniform float uOp; varying vec3 vN; varying vec3 vV;
        void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPow); gl_FragColor = vec4(uColor*f*uInt*uOp, f*uOp); }`,
    });
  }
  function coreMat(colorUniform, k) {
    return SM({
      uniforms: { uColor: colorUniform, uTime: U.time, uPulse: { value: 0 }, uK: { value: k || 4 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV=-mv.xyz; vP=position; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: NOISE + `uniform vec3 uColor; uniform float uTime; uniform float uPulse; uniform float uK; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)),0.0), 1.5);
          float n = fbm(vP*2.2 + vec3(uTime*0.6, -uTime*0.4, uTime*0.3));
          vec3 c = uColor*(0.4 + 1.6*n) + vec3(1.0,0.95,1.0)*pow(n,3.5)*3.0 + uColor*f*2.0;
          gl_FragColor = vec4(c*uK*(1.0+uPulse), 1.0); }`,
    });
  }
  function robeMat(colorUniform) {
    return SM({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      uniforms: { uColor: colorUniform, uTime: U.time },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: NOISE + `uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
        void main(){ float h = vUv.y; float s = fbm(vec3(vUv.x*9.0, h*3.0 + uTime*0.9, uTime*0.2));
          float a = (smoothstep(0.0, 0.8, h) * (1.0 - smoothstep(0.92,1.0,h))) * (0.03 + smoothstep(0.55, 0.9, s)*0.35);
          gl_FragColor = vec4(uColor*a*2.2, a); }`,
    });
  }
  function decalMat(color, style, k) {
    return SM({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      uniforms: { uColor: { value: hdr(color, k || 2.2) }, uProg: { value: 0 }, uTime: U.time, uAlpha: { value: 1 }, uStyle: { value: style || 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uProg; uniform float uTime; uniform float uAlpha; uniform float uStyle; varying vec2 vUv;
        void main(){ vec2 p = vUv*2.0-1.0; float r = length(p); if(r>1.0) discard; float a = 0.0;
          if (uStyle > 2.5) { float an = atan(p.y,p.x); float sw = sin(an*3.0 - r*10.0 + uTime*5.0)*0.5+0.5; a = (sw*0.45 + 0.15) * (1.0-r) * (0.6+0.4*sin(uTime*3.0)) + (1.0-smoothstep(0.0,0.06,abs(r-0.97)))*0.6; }
          else if (uStyle > 1.5) { float ring = 1.0 - smoothstep(0.0, 0.10, abs(r - uProg)); a = ring * (1.0-uProg*0.6); }
          else {
            float edge = smoothstep(0.88,0.965,r) * (1.0 - smoothstep(0.975,1.0,r));
            float pulse = 0.8 + 0.2*sin(uTime*9.0);
            float fill = (1.0 - smoothstep(uProg-0.03, uProg, r)) * 0.18;
            if (uStyle > 0.5) { float an = atan(p.y,p.x); float sw = sin(an*5.0 + r*16.0 - uTime*7.0)*0.5+0.5; fill = (0.08 + sw*0.26) * (1.0-r*0.5) * (0.35+uProg*0.65); }
            else fill += (1.0 - smoothstep(0.0,0.02,abs(fract(r*4.0 - uTime*0.8)-0.5)-0.47)) * 0.05;
            a = edge*pulse + fill;
          }
          a *= uAlpha; gl_FragColor = vec4(uColor*a, a); }`,
    });
  }
  function beamMat(color, k) {
    return SM({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      uniforms: { uColor: { value: hdr(color, k || 4) }, uTime: U.time, uOp: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: NOISE + `uniform vec3 uColor; uniform float uTime; uniform float uOp; varying vec2 vUv;
        void main(){ float across = abs(vUv.x - 0.5)*2.0; float core = exp(-across*across*18.0); float halo = exp(-across*across*3.0)*0.35;
          float n = noise(vec3(vUv.y*14.0 - uTime*9.0, vUv.x*3.0, uTime)); float a = (core*(0.7+0.6*n) + halo) * uOp;
          gl_FragColor = vec4(uColor*a, a); }`,
    });
  }

  // ---------- chargement ----------
  function load(onProgress) {
    const tex = [
      ['floor', 'albedo', 'floor_albedo.jpg', true], ['floor', 'normal', 'floor_normal.jpg'], ['floor', 'orm', 'floor_orm.jpg'], ['floor', 'emissive', 'floor_emissive.jpg'],
      ['hull', 'albedo', 'hull_albedo.jpg', true], ['hull', 'normal', 'hull_normal.jpg'], ['hull', 'orm', 'hull_orm.jpg'], ['hull', 'emissive', 'hull_emissive.jpg'], ['hull', 'height', 'hull_height.jpg'],
      ['rock', 'albedo', 'rock_albedo.jpg', true], ['rock', 'normal', 'rock_normal.jpg'], ['rock', 'orm', 'rock_orm.jpg'], ['rock', 'emissive', 'rock_emissive.jpg'], ['rock', 'height', 'rock_height.jpg'],
    ];
    const total = tex.length + 2; let done = 0;
    const tick = () => { done++; if (onProgress) onProgress(done / total); };
    const tl = new T.TextureLoader();
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const pTex = tex.map(([set, kind, file, srgb]) => new Promise((res, rej) => tl.load(ASSET_BASE + file, t => {
      t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = aniso; if (srgb) t.encoding = T.sRGBEncoding;
      (A.tex[set] ||= {})[kind] = t; tick(); res();
    }, undefined, () => rej(new Error(file)))));
    const gl = T.GLTFLoader ? new T.GLTFLoader() : null;
    const pGlb = (file, key) => new Promise((res, rej) => { if (!gl) return rej(new Error('GLTFLoader')); gl.load(ASSET_BASE + file, g => { g.animations.forEach(c => { c.tracks = c.tracks.filter(t => !/\.scale$/.test(t.name)); }); A[key] = g; tick(); res(); }, undefined, () => rej(new Error(file))); });
    return Promise.all([...pTex, pGlb('trooper.json', 'trooper'), pGlb('colossus.json', 'colossus')]).then(() => { buildArena(); buildMegastructure(); buildEnvironment(); ready = true; });
  }

  // ---------- décor ----------
  function skyMat(env) {
    return SM({
      side: T.BackSide, depthWrite: false, fog: false, uniforms: { uTime: U.time, uEclipse: U.eclipse, uSun: U.sunDir, uEnv: { value: env ? 1 : 0 } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: NOISE + `uniform float uTime; uniform float uEclipse; uniform vec3 uSun; uniform float uEnv; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir);
          vec3 q = d*1.8 + vec3(0.0, uTime*0.003, 0.0);
          float w = fbm(q*1.3);
          float n = fbm(q + w*1.4);
          float n2 = fbm(d*4.1 + n*2.2 + 3.1);
          float n3 = fbm(d*11.0 - n2*1.5);
          vec3 col = vec3(0.004,0.005,0.012);
          float band = exp(-pow(d.y*2.4 - 0.18 - 0.6*(n-0.5), 2.0));
          col += vec3(0.30,0.07,0.42) * smoothstep(0.38,0.85,n) * 0.32;
          col += vec3(0.02,0.22,0.36) * smoothstep(0.48,0.92,n2) * 0.28;
          col += vec3(0.85,0.32,0.12) * pow(smoothstep(0.45,0.95,n*n2*1.6),2.0) * 0.22;
          col += vec3(0.20,0.16,0.34) * band * 0.35 * (0.4+n3);
          col *= 0.6 + 0.8*smoothstep(0.35, 0.75, n3);  // filaments
          col *= 1.0 - smoothstep(0.55, 0.75, fbm(d*6.0+w))*0.65*band; // poussière sombre
          float sd = max(dot(d, uSun), 0.0);
          col += vec3(1.0,0.6,0.3) * pow(sd, 18.0) * 0.6 + vec3(1.0,0.75,0.5) * pow(sd, 400.0) * 6.0;
          col *= 1.0 - uEclipse*0.7;
          if (uEnv > 0.5) col *= 1.3;
          gl_FragColor = vec4(col, 1.0); }`,
    });
  }
  function planetMat() {
    return SM({
      fog: false, uniforms: { uSun: U.sunDir, uTime: U.time },
      vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vW; void main(){ vP = position; vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: NOISE + `uniform vec3 uSun; uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vW;
        void main(){ vec3 p = normalize(vP);
          float lat = p.y;
          float turb = fbm(p*4.0 + vec3(uTime*0.002,0.0,0.0));
          float b = sin(lat*26.0 + turb*3.2) * 0.5 + 0.5;
          float b2 = sin(lat*61.0 + turb*5.0 + 1.3) * 0.5 + 0.5;
          vec3 c1 = vec3(0.42,0.27,0.20), c2 = vec3(0.85,0.66,0.48), c3 = vec3(0.30,0.22,0.36);
          vec3 col = mix(c1, c2, b); col = mix(col, c3, b2*0.35);
          float storm = smoothstep(0.08, 0.0, length(vec2(atan(p.z,p.x)*0.6-0.9, (lat+0.28)*2.4)));
          col = mix(col, vec3(0.95,0.55,0.35), storm*0.8);
          col *= 0.7 + 0.5*fbm(p*18.0);
          vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
          float ndl = dot(n, uSun); float lit = smoothstep(-0.15, 0.6, ndl);
          float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          vec3 c = col*lit*1.25 + vec3(0.35,0.5,1.0)*rim*smoothstep(-0.3,0.4,ndl)*1.6 + col*0.015;
          gl_FragColor = vec4(c, 1.0); }`,
    });
  }
  function ringMat() {
    return SM({
      transparent: true, depthWrite: false, side: T.DoubleSide, fog: false, uniforms: { uSun: U.sunDir },
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: NOISE + `uniform vec3 uSun; varying vec2 vUv; varying vec3 vW;
        void main(){ float r = vUv.x; float bands = 0.5 + 0.5*sin(r*120.0) * (0.6 + 0.4*sin(r*23.0+1.0));
          float a = bands * smoothstep(0.0,0.06,r) * smoothstep(1.0,0.9,r) * (0.35 + 0.65*noise(vec3(r*60.0,0.0,0.0)));
          a *= 1.0 - smoothstep(0.42,0.47,r)*(1.0-smoothstep(0.5,0.55,r))*0.9;
          vec3 c = vec3(0.85,0.75,0.68) * 0.9;
          gl_FragColor = vec4(c*a, a*0.85); }`,
    });
  }
  // bloc de pierre taillé : dodécaèdre aux sommets décalés, pour des facettes nettes
  function shardGeo(seed) {
    const g = new T.DodecahedronGeometry(1, 0), p = g.attributes.position, v = new T.Vector3(), seen = new Map();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); const key = v.x.toFixed(3) + v.y.toFixed(3) + v.z.toFixed(3);
      if (!seen.has(key)) seen.set(key, 0.82 + 0.3 * Math.abs(Math.sin(seen.size * 12.9898 + seed * 78.233)));
      v.multiplyScalar(seen.get(key)); v.y *= 0.8; p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }
  function rockGeo(seed, detail) {
    const g = new T.IcosahedronGeometry(1, detail || 2);
    const p = g.attributes.position, v = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = Math.sin(v.x * 3.1 + seed) * 0.12 + Math.sin(v.y * 5.3 + seed * 2) * 0.09 + Math.sin(v.z * 7.7 + seed * 3) * 0.06 + Math.sin((v.x + v.z) * 11 + seed) * 0.03;
      v.multiplyScalar(1 + n); v.y *= 0.75 + (seed % 3) * 0.1;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }
  function buildSky() {
    L.sky = new T.Mesh(new T.SphereGeometry(950, 64, 32), skyMat(false)); L.sky.renderOrder = -10; scene.add(L.sky);
    // étoiles
    const N = 3600, sp = new Float32Array(N * 3), sc = new Float32Array(N * 3), ss = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const band = Math.random() < 0.5, th = Math.random() * PI * 2;
      const y = band ? (Math.random() - 0.5) * 0.32 + 0.1 : Math.random() * 2 - 1, rb = Math.sqrt(1 - y * y);
      sp[i * 3] = Math.cos(th) * rb * 800; sp[i * 3 + 1] = y * 800; sp[i * 3 + 2] = Math.sin(th) * rb * 800;
      const t = Math.random(), c = t < 0.15 ? [1, 0.75, 0.55] : t < 0.35 ? [0.6, 0.75, 1] : [0.92, 0.94, 1];
      const big = Math.random() < 0.025, b = big ? 3 + Math.random() * 4 : 0.3 + Math.random() * 0.8;
      sc[i * 3] = c[0] * b; sc[i * 3 + 1] = c[1] * b; sc[i * 3 + 2] = c[2] * b; ss[i] = big ? 3 + Math.random() * 2 : 1 + Math.random() * 1.4;
    }
    const sg = new T.BufferGeometry();
    sg.setAttribute('position', new T.BufferAttribute(sp, 3)); sg.setAttribute('color', new T.BufferAttribute(sc, 3)); sg.setAttribute('size', new T.BufferAttribute(ss, 1));
    L.stars = new T.Points(sg, SM({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, vertexColors: true, fog: false, uniforms: { uTex: { value: softTex }, uTime: U.time, uEclipse: U.eclipse, uPR: { value: 1 } },
      vertexShader: `attribute float size; varying vec3 vC; uniform float uTime; uniform float uPR; void main(){ vC = color*(0.7+0.3*sin(uTime*1.7 + position.x*0.37 + position.y)); vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*1.6*uPR; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D uTex; uniform float uEclipse; varying vec3 vC; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC*t.a*(1.0-uEclipse*0.5), t.a); }`,
    })); scene.add(L.stars);
    // soleil + traînée anamorphique
    const sunPos = U.sunDir.value.clone().multiplyScalar(700);
    L.sun = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr('#ffe2c0', 14), blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false }));
    L.sun.position.copy(sunPos); L.sun.scale.set(90, 90, 1); scene.add(L.sun);
    L.sunHalo = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr('#ff9a5a', 1.4), blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    L.sunHalo.position.copy(sunPos); L.sunHalo.scale.set(520, 520, 1); scene.add(L.sunHalo);
    L.streak = new T.Sprite(new T.SpriteMaterial({ map: streakTex, color: hdr('#7fb4ff', 2.5), blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    L.streak.position.copy(sunPos); L.streak.scale.set(420, 5, 1); scene.add(L.streak);
    // géante gazeuse + anneaux + lune
    L.planet = new T.Mesh(new T.SphereGeometry(150, 96, 64), planetMat());
    L.planet.position.set(-330, 30, -600); L.planet.rotation.z = 0.32; scene.add(L.planet);
    const atm = new T.Mesh(new T.SphereGeometry(157, 64, 48), SM({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { uSun: U.sunDir },
      vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 uSun; varying vec3 vN; varying vec3 vW; void main(){ vec3 v = normalize(cameraPosition - vW); float f = pow(1.0 - abs(dot(normalize(vN), v)), 2.4); float lit = smoothstep(-0.25, 0.5, dot(normalize(vN), uSun)); float a = f * lit; gl_FragColor = vec4(vec3(0.35,0.55,1.0)*a*2.4, a); }` }));
    atm.position.copy(L.planet.position); scene.add(atm);
    const rg = new T.RingGeometry(190, 330, 160, 1); const rp = rg.attributes.position, ruv = rg.attributes.uv, v3 = new T.Vector3();
    for (let i = 0; i < rp.count; i++) { v3.fromBufferAttribute(rp, i); ruv.setXY(i, (v3.length() - 190) / 140, 0.5); }
    const ring = new T.Mesh(rg, ringMat()); ring.position.copy(L.planet.position); ring.rotation.set(-1.22, 0.2, 0.34); scene.add(ring);

    // astéroïdes
    const am = new T.MeshStandardMaterial({ color: 0x2c2a30, roughness: 0.95, metalness: 0.05, envMapIntensity: 0.3 });
    L.ast = []; L.astMesh = [];
    for (let k = 0; k < 3; k++) {
      const inst = new T.InstancedMesh(rockGeo(k * 7 + 1, 3), am, 40);
      for (let i = 0; i < 40; i++) L.ast.push({ m: inst, i, a: Math.random() * PI * 2, r: 110 + Math.random() * 200, y: -70 + Math.random() * 60, s: 0.8 + Math.pow(Math.random(), 3) * 6, rx: Math.random() * 6, ry: Math.random() * 6, w: (Math.random() - 0.5) * 0.015 });
      inst.castShadow = false; scene.add(inst); L.astMesh.push(inst);
    }
  }
  // flèches de la Citadelle, vaisseaux lointains
  function buildMegastructure() {
    const tower = (h, r0) => {
      const pts = []; let y = 0;
      pts.push(new T.Vector2(0.01, -2));
      pts.push(new T.Vector2(r0 * 1.2, -2)); pts.push(new T.Vector2(r0, 0));
      while (y < h) { const r = r0 * (1 - y / h * 0.75); pts.push(new T.Vector2(r, y)); y += h * (0.06 + Math.random() * 0.08); pts.push(new T.Vector2(r * (0.85 + Math.random() * 0.2), y)); pts.push(new T.Vector2(r * (0.9 + Math.random() * 0.15), y + h * 0.01)); }
      pts.push(new T.Vector2(r0 * 0.15, h)); pts.push(new T.Vector2(0.01, h + r0 * 2.5));
      return new T.LatheGeometry(pts, 12);
    };
    const mat = triMat({ set: 'hull', world: true, scale: 0.06, color: '#7f8796', metal: 0.85, rough: 0.6, bump: 0.02, line: '#ffb36a', lineI: 6, env: 0.6 });
    L.towers = [];
    const spots = [[-0.3, 140, 90], [0.4, 170, 120], [1.2, 120, 70], [2.0, 180, 140], [2.7, 150, 85], [3.5, 130, 100], [4.3, 200, 160], [5.0, 110, 65], [5.7, 165, 110]];
    spots.forEach(([a, r, h], k) => {
      const m = new T.Mesh(tower(h, 4 + h * 0.04), mat);
      m.position.set(Math.sin(a) * r, -70, -Math.cos(a) * r); scene.add(m); L.towers.push(m);
      const beacon = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr('#ff3b3b', 8), blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
      beacon.position.set(m.position.x, -70 + h + (4 + h * 0.04) * 2.5, m.position.z); beacon.scale.set(5, 5, 1); beacon.userData.ph = k; scene.add(beacon); L.towers.push(beacon);
    });
    // lune
    const mg = new T.SphereGeometry(1, 64, 48); const mp = mg.attributes.position, mv = new T.Vector3();
    for (let i = 0; i < mp.count; i++) { mv.fromBufferAttribute(mp, i); const n = Math.sin(mv.x * 6.1) * Math.sin(mv.y * 5.3) * Math.sin(mv.z * 7.7) * 0.03; mv.multiplyScalar(1 + n); mp.setXYZ(i, mv.x, mv.y, mv.z); }
    mg.computeVertexNormals();
    const moonMat = triMat({ set: 'rock', world: false, scale: 1.2, color: '#9a95a0', metal: 0, rough: 0.95, bump: 0.25, env: 0.2 }); moonMat.fog = false;
    L.moon = new T.Mesh(mg, moonMat); L.moon.scale.setScalar(30); L.moon.position.set(-160, 140, -640); scene.add(L.moon);
    // anneau orbital
    const arc = new T.Mesh(new T.TorusGeometry(420, 7, 10, 160, PI * 0.9), triMat({ set: 'hull', world: true, scale: 0.05, color: '#6d7380', metal: 0.9, rough: 0.5, bump: 0.02, line: '#8fd0ff', lineI: 5, env: 0.6 }));
    arc.position.set(60, -160, -260); arc.rotation.set(1.15, 0.25, 0.4); scene.add(arc);
    // vaisseaux
    L.ships = [];
    const shipMat = triMat({ set: 'hull', world: false, scale: 0.4, color: '#a7adba', metal: 0.85, rough: 0.45, bump: 0.03, line: '#9fd8ff', lineI: 3, env: 0.8 });
    const engMat = glowMat('#7fc8ff', 9);
    for (let k = 0; k < 3; k++) {
      const s = new T.Group();
      const hullG = new T.CylinderGeometry(0.6, 4, 22, 4, 1); hullG.rotateX(PI / 2); hullG.rotateZ(PI / 4); hullG.scale(1.6, 0.45, 1);
      s.add(new T.Mesh(hullG, shipMat));
      const deck = new T.Mesh(new T.BoxGeometry(3, 2.2, 5), shipMat); deck.position.set(0, 1.4, 6); s.add(deck);
      const tw = new T.Mesh(new T.BoxGeometry(1.2, 2, 1.6), shipMat); tw.position.set(0, 3.2, 7); s.add(tw);
      for (const x of [-1.8, 0, 1.8]) { const e = new T.Mesh(new T.CylinderGeometry(0.7, 0.7, 0.4, 16), engMat); e.rotation.x = PI / 2; e.position.set(x, 0, 11.2); s.add(e); const gl = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr('#6fb8ff', 5), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); gl.position.set(x, 0, 12); gl.scale.set(3.5, 3.5, 1); s.add(gl); }
      const sc = [3.2, 2.4, 4][k]; s.scale.setScalar(sc);
      s.userData = { a: [0.8, 2.5, 4.4][k], r: [330, 420, 520][k], y: [60, 110, 20][k], w: [0.004, -0.003, 0.0025][k] };
      scene.add(s); L.ships.push(s);
    }
  }
  function buildArena() {
    // plateforme du Noyau : arène par défaut (Nyxar, et les boss qui n'ont pas encore la leur)
    const g = new T.Group(); scene.add(g); L.arenaDefault = g;
    const F = A.tex.floor;
    // sol
    const fg = new T.CircleGeometry(22, 6, 0); const fp = fg.attributes.position, fuv = fg.attributes.uv;
    for (let i = 0; i < fp.count; i++) fuv.setXY(i, fp.getX(i) / 12, fp.getY(i) / 12);
    fg.setAttribute('uv2', fuv);
    const floorMat = new T.MeshStandardMaterial({ map: F.albedo, normalMap: F.normal, roughnessMap: F.orm, metalnessMap: F.orm, aoMap: F.orm, emissiveMap: F.emissive, emissive: hdr('#6fd4ff', 1.0), roughness: 1.15, metalness: 1, envMapIntensity: 0.28, normalScale: new T.Vector2(0.6, -0.6) });
    const floor = new T.Mesh(fg, floorMat); floor.rotation.x = -PI / 2; floor.receiveShadow = true; g.add(floor); L.floor = floor;
    // surcouche lumineuse (couleur de phase)
    const ov = new T.Mesh(new T.CircleGeometry(22, 6), SM({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { uTime: U.time, uPhase: U.phase, uEclipse: U.eclipse },
      vertexShader: `varying vec2 vP; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vP = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uTime; uniform vec3 uPhase; uniform float uEclipse; varying vec2 vP;
        void main(){ float d = length(vP); float ang = atan(vP.y, vP.x); float sec = mod(ang, 1.0471976) - 0.5235988;
          float edgeT = d*cos(sec) / (22.0*0.8660254);
          vec3 c = uPhase*(1.0 - smoothstep(0.0, 0.07, abs(d-6.2)))*1.4;
          c += uPhase*(1.0 - smoothstep(0.0, 0.05, abs(d-6.6)))*0.5;
          float runes = step(0.5, fract(ang*12.0/6.2832 + 0.25)) * (1.0 - smoothstep(0.0, 0.18, abs(d-6.4)));
          c += uPhase * runes * 0.25 * (0.6+0.4*sin(uTime*2.0 + ang*6.0));
          c += vec3(0.4,0.75,1.0)*(1.0 - smoothstep(0.0, 0.04, abs(d-12.0)))*0.35;
          // conduits vers les six pylônes, parcourus d'impulsions ; œil du Noyau au centre
          float sp = abs(mod(ang + 0.5235988, 1.0471976) - 0.5235988) * d;
          float duct = (1.0 - smoothstep(0.08, 0.22, sp)) * step(3.2, d) * step(d, 19.5);
          c += vec3(0.62,0.4,1.0) * duct * (0.25 + 0.75 * pow(0.5 + 0.5 * sin(d * 0.9 - uTime * 4.0), 6.0)) * 0.9;
          c += vec3(0.7,0.45,1.0) * (1.0 - smoothstep(0.0, 0.06, abs(d - 3.0))) * (0.8 + 0.2 * sin(uTime * 3.0));
          c += vec3(0.45,0.8,1.0)*smoothstep(0.96, 0.995, edgeT)*1.2;
          float s = fract(uTime*0.06); c += vec3(0.3,0.6,1.0)*(1.0 - smoothstep(0.0, 0.6, abs(d - s*24.0)))*0.25*(1.0-s);
          c *= 1.0 - uEclipse*0.5;
          gl_FragColor = vec4(c, 1.0); }`,
    })); ov.rotation.x = -PI / 2; ov.position.y = 0.012; g.add(ov);
    // bordure
    const rimMat = triMat({ set: 'hull', world: true, scale: 0.22, color: '#9aa2b2', metal: 0.9, rough: 0.55, bump: 0.035, line: '#7fd4ff', lineI: 3.5 });
    const ap = 22 * Math.cos(PI / 6), postM = [];
    for (let k = 0; k < 6; k++) {
      const a = PI / 6 + k * PI / 3;   // milieu de l'arête
      const side = new T.Group(); side.rotation.y = -a + PI / 2; g.add(side);
      const wall = new T.Mesh(new T.BoxGeometry(22.2, 1.5, 1.6), rimMat); wall.position.set(0, -0.35, -(ap + 0.8)); wall.receiveShadow = true; wall.castShadow = true; side.add(wall);
      const lip = new T.Mesh(new T.BoxGeometry(22.4, 0.25, 0.5), rimMat); lip.position.set(0, 0.5, -(ap + 0.25)); side.add(lip);
      const strip = new T.Mesh(new T.BoxGeometry(21, 0.06, 0.08), glowMat('#7fd4ff', 7)); strip.position.set(0, 0.64, -(ap + 0.05)); side.add(strip);
      side.updateMatrixWorld(true);
      for (let j = -4; j <= 4; j++) { tmpV.set(j * 2.4, 1.2, -(ap + 1.3)).applyMatrix4(side.matrixWorld); postM.push(new T.Matrix4().makeRotationY(side.rotation.y).setPosition(tmpV)); }
      const rail = new T.Mesh(new T.BoxGeometry(22, 0.1, 0.1), glowMat('#ff9b4a', 5)); rail.position.set(0, 1.8, -(ap + 1.3)); side.add(rail);
    }
    const posts = new T.InstancedMesh(new T.BoxGeometry(0.22, 1.2, 0.22), rimMat, postM.length);
    postM.forEach((m, i) => posts.setMatrixAt(i, m)); posts.castShadow = true; g.add(posts);
    // dessous et noyau
    const under = new T.Mesh(new T.CylinderGeometry(23.3, 7, 13, 6, 3, true), triMat({ set: 'hull', world: true, scale: 0.18, color: '#7a8292', metal: 0.9, rough: 0.5, bump: 0.03, line: '#ffa25a', lineI: 4 }));
    under.position.y = -7.6; under.rotation.y = 0; g.add(under);
    const core = new T.Mesh(new T.IcosahedronGeometry(2.2, 3), coreMat({ value: new T.Color('#7fd8ff') }, 5)); core.position.y = -15.4; g.add(core); L.core = core;
    const coreGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr('#6fd0ff', 4), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); coreGlow.scale.set(24, 24, 1); coreGlow.position.y = -15.4; g.add(coreGlow);
    const shaftG = new T.CylinderGeometry(0.6, 6, 120, 24, 1, true); shaftG.translate(0, -60, 0);
    const shaft = new T.Mesh(shaftG, SM({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, uniforms: { uTime: U.time },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: NOISE + `uniform float uTime; varying vec2 vUv; void main(){ float n = fbm(vec3(vUv.x*8.0, vUv.y*6.0 + uTime*0.6, 0.0)); float a = smoothstep(0.0,0.9,vUv.y)*(0.25+0.75*n)*0.6; gl_FragColor = vec4(vec3(0.35,0.75,1.0)*a*2.0, a); }` }));
    shaft.position.y = -16; g.add(shaft);
    // anneaux gyroscopiques de la Salle du Noyau
    const gyroMat = triMat({ set: 'hull', world: false, scale: 0.4, color: '#5a5f70', metal: 0.95, rough: 0.35, bump: 0.02, line: '#b07cff', lineI: 4, env: 0.9 });
    L.gyros = [];
    [[30, 0.18, 0.06], [34, -0.12, -0.045]].forEach(([r, w0, w], k) => {
      const piv = new T.Group(); piv.position.y = 2; piv.rotation.z = k ? 1.1 : 0.35; g.add(piv);
      const ring = new T.Mesh(new T.TorusGeometry(r, 0.55, 10, 160), gyroMat); piv.add(ring);
      for (let j = 0; j < 8; j++) { const a = j / 8 * PI * 2; const n = new T.Mesh(new T.BoxGeometry(1.4, 1.4, 2.2), gyroMat); n.position.set(Math.cos(a) * r, Math.sin(a) * r, 0); n.rotation.z = a; ring.add(n); const lt = new T.Mesh(new T.SphereGeometry(0.35, 12, 8), glowMat('#c08bff', 5)); lt.position.set(Math.cos(a) * (r - 0.9), Math.sin(a) * (r - 0.9), 0); ring.add(lt); }
      L.gyros.push({ ring, w });
    });
    // pylônes
    const pyMat = triMat({ set: 'hull', world: true, scale: 0.3, color: '#8a92a4', metal: 0.92, rough: 0.4, bump: 0.035, line: '#7fd4ff', lineI: 5 });
    const prof = [[0.01, 0], [1.3, 0], [1.3, 0.6], [0.9, 0.9], [0.75, 4], [0.95, 4.3], [0.95, 4.8], [0.55, 5.2], [0.45, 8.6], [0.75, 8.9], [0.3, 9.6], [0.01, 9.7]].map(([x, y]) => new T.Vector2(x, y));
    const pyGeo = new T.LatheGeometry(prof, 8);
    L.crystals = [];
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * PI * 2, x = Math.cos(a) * 23.8, z = -Math.sin(a) * 23.8;
      const py = new T.Mesh(pyGeo, pyMat); py.position.set(x, -0.6, z); py.castShadow = true; g.add(py);
      const cr = new T.Mesh(new T.OctahedronGeometry(0.75, 0), new T.MeshStandardMaterial({ color: 0x9feaff, emissive: hdr('#7fe0ff', 4), metalness: 0.1, roughness: 0.1 })); cr.position.set(x, 11, z); cr.scale.set(0.8, 1.6, 0.8); g.add(cr);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr('#7fe0ff', 3), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); sp.scale.set(7, 7, 1); cr.add(sp);
      L.crystals.push(cr);
    }
  }
  function buildEnvironment() {
    // carte d'environnement HDR pour les reflets (ciel + panneaux lumineux)
    try {
      const pm = new T.PMREMGenerator(renderer), es = new T.Scene();
      es.add(new T.Mesh(new T.SphereGeometry(50, 48, 24), skyMat(true)));
      const card = (c, k, w, h, p) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: hdr(c, k), side: T.DoubleSide })); m.position.set(...p); m.lookAt(0, 0, 0); es.add(m); };
      const sd = U.sunDir.value;
      card('#ffd8b0', 9, 10, 10, [sd.x * 40, sd.y * 40, sd.z * 40]);
      card('#7fb0ff', 1.4, 40, 8, [-30, 18, 25]);
      card('#b07bff', 0.9, 30, 12, [35, 8, 20]);
      card('#ff9a5a', 0.7, 30, 6, [0, -6, -40]);
      const fl = new T.Mesh(new T.CircleGeometry(40, 32), new T.MeshBasicMaterial({ color: hdr('#141822', 1) })); fl.rotation.x = -PI / 2; fl.position.y = -8; es.add(fl);
      scene.environment = pm.fromScene(es, 0.035).texture; pm.dispose();
    } catch (e) { }
  }

  // ---------- arènes par boss ----------
  // default : plateforme du Noyau (Nyxar, et les boss qui n'ont pas encore la leur) ; forge : Vorr
  const ARENA_OF = { vorr: 'forge', twins: 'observatory', azhal: 'horizon' };
  const THEMES = {
    default: { fog: 0x0a0b16, fogD: 0.0032, hemiS: 0x5a6aa8, hemiG: 0x0a0a12, hemiI: 0.35, key: 0xffd9b4, keyI: 2.6, rim: 0x6fa8ff, rimI: 1.6, fill: 0xa47bff, fillI: 0.6, fillPos: [-60, 10, -40], dust: '#b9c8ff' },
    forge: { fog: 0x1a0905, fogD: 0.0042, hemiS: 0x6a5048, hemiG: 0xff4a10, hemiI: 0.55, key: 0xffc896, keyI: 2.3, rim: 0xff7a3a, rimI: 1.4, fill: 0xff5a1a, fillI: 1.2, fillPos: [10, -40, 20], dust: '#ff8a3a' },
    horizon: { fog: 0x07041a, fogD: 0.003, hemiS: 0x6a4ad0, hemiG: 0x100818, hemiI: 0.45, key: 0xd8c0ff, keyI: 1.9, rim: 0xff5ac8, rimI: 1.5, fill: 0x7a5cff, fillI: 1.0, fillPos: [0, -50, 10], dust: '#b18cff' },
    observatory: { fog: 0x0c0a1c, fogD: 0.0035, hemiS: 0x8a80d8, hemiG: 0x2a2030, hemiI: 0.5, key: 0xffe2b0, keyI: 2.4, rim: 0x9fc8ff, rimI: 1.9, fill: 0xffb860, fillI: 0.8, fillPos: [-60, 10, 0], dust: '#ffe8b0' },
  };
  const ARENA_BUILD = { forge: () => buildForge(), observatory: () => buildObservatory(), horizon: () => buildHorizon() };
  const arenaGroup = n => ({ default: L.arenaDefault, forge: L.arenaForge, observatory: L.arenaObs, horizon: L.arenaHor })[n] || null;
  let arenaName = null;
  function setArena(model) {
    const name = ARENA_OF[model] || 'default';
    if (!ready || name === arenaName) return;
    arenaName = name;
    if (!arenaGroup(name) && ARENA_BUILD[name]) ARENA_BUILD[name]();
    for (const n of ['default', 'forge', 'observatory', 'horizon']) { const g = arenaGroup(n); if (g) g.visible = n === name; }
    const th = THEMES[name];
    scene.fog.color.setHex(th.fog); scene.fog.density = th.fogD;
    L.hemi.color.setHex(th.hemiS); L.hemi.groundColor.setHex(th.hemiG); L.hemi.intensity = th.hemiI;
    L.key.color.setHex(th.key); L.keyBase = th.keyI;
    L.rim.color.setHex(th.rim); L.rim.intensity = th.rimI;
    L.fill.color.setHex(th.fill); L.fill.intensity = th.fillI; L.fill.position.set(...th.fillPos);
    if (L.dust) L.dust.material.color.copy(hdr(th.dust, 1.2));
    if (L.towers) L.towers.forEach(o => { o.visible = name !== 'forge'; });
  }

  // bruit plus léger (3 octaves) pour les grandes surfaces
  const NOISE3 = NOISE.replace('fbm(vec3 p)', 'fbm3(vec3 p)').replace('i<6', 'i<3');
  function lavaMat() {
    return SM({
      uniforms: { uTime: U.time },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: NOISE3 + `uniform float uTime; varying vec3 vW;
        void main(){ vec2 p = vW.xz*0.035 + vec2(uTime*0.012, uTime*0.006);
          float n = fbm3(vec3(p, uTime*0.03));
          float n2 = fbm3(vec3(p*2.6 + n*1.6, uTime*0.05 + 4.0));
          float crust = smoothstep(0.30, 0.46, n2);
          float hot = pow(1.0 - crust, 2.6);
          vec3 c = mix(vec3(0.55,0.12,0.02), vec3(1.5,0.55,0.12), pow(1.0 - n2, 3.0)) * hot + vec3(0.035,0.012,0.008) * crust;
          float far = smoothstep(120.0, 420.0, length(vW.xz));
          c = mix(c, vec3(0.12,0.03,0.01), far*0.7);
          gl_FragColor = vec4(c, 1.0); }`,
    });
  }
  function lavaFallMat() {
    return SM({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, uniforms: { uTime: U.time, uSeed: { value: Math.random() * 10 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: NOISE3 + `uniform float uTime; uniform float uSeed; varying vec2 vUv;
        void main(){ float n = fbm3(vec3(vUv.x*5.0 + uSeed, vUv.y*3.0 + uTime*0.55, uSeed));
          float w = 0.32 + 0.12*sin(vUv.y*6.0 + uSeed);
          float a = (1.0 - smoothstep(w*0.55, w, abs(vUv.x - 0.5) + (n - 0.5)*0.25)) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
          vec3 c = mix(vec3(1.0,0.28,0.05), vec3(2.6,1.1,0.3), smoothstep(0.45, 0.8, n));
          gl_FragColor = vec4(c*a*1.6, a); }`,
    });
  }
  // fissures du sol (motif de Voronoï en coordonnées monde) : cR = rayon de la zone qui restera après l'Effondrement
  function forgeCrackMat() {
    return SM({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, uniforms: { uTime: U.time, uPhase: U.phase, uBound: { value: 0.25 }, uHeat: { value: 0 } },
      vertexShader: `varying vec2 vP; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vP = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uTime; uniform vec3 uPhase; uniform float uBound; uniform float uHeat; varying vec2 vP;
        vec2 h2(vec2 p){ p = vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(269.5,183.3))); return fract(sin(p)*43758.5453); }
        float edges(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 r = g + h2(i + g) - f; float d = dot(r, r); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
          return sqrt(d2) - sqrt(d1); }
        void main(){ float d = length(vP);
          float e = edges(vP*0.30), e2 = edges(vP*0.85 + 7.0);
          float glow = (1.0 - smoothstep(0.0, 0.05, e)) + (1.0 - smoothstep(0.0, 0.025, e2))*0.18;
          float flick = 0.7 + 0.3*sin(uTime*1.1 + vP.x*0.35 + vP.y*0.27);
          vec3 c = vec3(1.0,0.20,0.03) * glow * flick * (0.5 + uHeat);
          c += uPhase*(1.0 - smoothstep(0.0, 0.07, abs(d - 6.2)))*1.1;
          c += uPhase*(1.0 - smoothstep(0.0, 0.05, abs(d - 6.6)))*0.4;
          c += vec3(1.0,0.36,0.08)*(1.0 - smoothstep(0.0, 0.16, abs(d - 13.5)))*uBound*(0.75 + 0.25*sin(uTime*5.0));
          gl_FragColor = vec4(c, 1.0); }`,
    });
  }
  function buildForge() {
    const g = new T.Group(); scene.add(g); L.arenaForge = g;
    const RIN = 13.5, ROUT = 24, DEPTH = 1.8;
    const stone = triMat({ set: 'rock', world: false, scale: 0.16, color: '#4e403a', metal: 0.05, rough: 0.9, bump: 0.07, line: '#ff5a1a', lineI: 1.6, env: 0.3 });
    const crack = forgeCrackMat(); L.forgeCrack = crack.uniforms;
    // dalle centrale : ce qui reste après l'Effondrement
    const inner = new T.Mesh(new T.CylinderGeometry(RIN, RIN - 0.4, DEPTH, 72), stone); inner.position.y = -DEPTH / 2; inner.receiveShadow = true; g.add(inner);
    const innerC = new T.Mesh(new T.CircleGeometry(RIN, 72), crack); innerC.rotation.x = -PI / 2; innerC.position.y = 0.012; g.add(innerC);
    // anneau extérieur en secteurs, qui tombent dans la lave
    const col = triMat({ set: 'rock', world: false, scale: 0.5, color: '#3e322e', metal: 0.05, rough: 0.92, bump: 0.12, line: '#ff6a1a', lineI: 3, env: 0.3 });
    const colGeo = new T.CylinderGeometry(1.0, 1.15, 1, 6);
    L.forgePieces = [];
    const N = 14;
    for (let k = 0; k < N; k++) {
      const a0 = k / N * PI * 2 + 0.006, a1 = (k + 1) / N * PI * 2 - 0.006, am = (a0 + a1) / 2;
      const cx = Math.cos(am) * (RIN + ROUT) / 2, cz = Math.sin(am) * (RIN + ROUT) / 2;
      const sh = new T.Shape(), n = 12;
      for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n, r = ROUT * (1 + (i % n ? Math.sin(i * 2.3 + k) * 0.015 : 0)); const x = Math.cos(a) * r - cx, y = Math.sin(a) * r - cz; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
      for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; sh.lineTo(Math.cos(a) * RIN - cx, Math.sin(a) * RIN - cz); }
      const geo = new T.ExtrudeGeometry(sh, { depth: DEPTH, bevelEnabled: false, curveSegments: 1 }); geo.rotateX(PI / 2);
      const piece = new T.Mesh(geo, stone); piece.position.set(cx, 0, cz); piece.receiveShadow = true; piece.castShadow = true; g.add(piece);
      const top = new T.Mesh(new T.ShapeGeometry(sh), crack); top.rotation.x = PI / 2; top.position.y = 0.012; piece.add(top);
      // colonne de basalte brisée sur le bord, une sur deux
      if (k % 2 === 0) {
        const cg = new T.Group(); const h = 3 + ((k * 37) % 7);
        for (let j = 0; j < 3; j++) { const seg = new T.Mesh(colGeo, col); const sh2 = h * (j === 2 ? 0.25 : 0.4); seg.scale.set(1 - j * 0.12, sh2, 1 - j * 0.12); seg.position.y = j === 0 ? sh2 / 2 : j === 1 ? h * 0.4 + sh2 / 2 : h * 0.8 + sh2 / 2; seg.rotation.set((j - 1) * 0.08, j * 0.4, (k % 3 - 1) * 0.06 * j); seg.castShadow = true; cg.add(seg); }
        const ar = (ROUT + 22.2) / 2 - 0.4; cg.position.set(Math.cos(am + 0.1) * ar - cx, 0, Math.sin(am + 0.1) * ar - cz); piece.add(cg);
      }
      L.forgePieces.push({ m: piece, base: piece.position.clone(), a: am, delay: 0.2 + ((k * 5) % N) / N * 2.6, v: 0, spin: (k % 2 ? 1 : -1) * (0.3 + (k % 3) * 0.15), fell: false });
    }
    // dessous de la plateforme : un éperon de roche veiné de magma
    const under = new T.Mesh(new T.CylinderGeometry(RIN - 0.4, 2.5, 14, 32, 4, true), triMat({ set: 'rock', world: true, scale: 0.12, color: '#3a2e2a', metal: 0.05, rough: 0.9, bump: 0.1, line: '#ff5a1a', lineI: 5, env: 0.2 }));
    under.position.y = -DEPTH - 7; g.add(under);
    // mer de lave et sa lueur
    const sea = new T.Mesh(new T.CircleGeometry(700, 48), lavaMat()); sea.rotation.x = -PI / 2; sea.position.y = -18; g.add(sea);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr('#ff5a1a', 1.6), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); glow.scale.set(90, 90, 1); glow.position.y = -16; g.add(glow);
    // chutes de lave et falaises au loin
    for (let k = 0; k < 5; k++) {
      const a = 0.5 + k * 1.25, r = 170 + (k % 2) * 60, h = 150 + (k % 3) * 40;
      const cliff = new T.Mesh(rockGeo(k * 3 + 2, 2), triMat({ set: 'rock', world: false, scale: 0.05, color: '#2a221f', metal: 0, rough: 1, bump: 0.05, line: '#ff4a10', lineI: 2, env: 0.1 }));
      cliff.scale.set(75, h * 0.38, 55); cliff.position.set(Math.cos(a) * (r + 30), -18 + h * 0.12, Math.sin(a) * (r + 30)); g.add(cliff);
      const fall = new T.Mesh(new T.PlaneGeometry(30, h * 0.55), lavaFallMat()); fall.position.set(Math.cos(a) * r, -18 + h * 0.275, Math.sin(a) * r); fall.lookAt(0, -18 + h * 0.275, 0); g.add(fall);
    }
    // rochers flottants
    L.forgeRocks = [];
    const rm = triMat({ set: 'rock', world: false, scale: 0.6, color: '#3a2e2a', metal: 0, rough: 0.95, bump: 0.1, line: '#ff6a1a', lineI: 4, env: 0.2 });
    for (let k = 0; k < 12; k++) {
      const m = new T.Mesh(rockGeo(k * 7 + 3, 1), rm); const s = 1.2 + (k % 4) * 1.1; m.scale.set(s, s * 0.8, s);
      const a = k / 12 * PI * 2 + 0.3, r = 32 + (k % 3) * 12; m.userData = { a, r, y: -8 + (k % 5) * 3.5, w: 0.01 + (k % 3) * 0.006, ph: k };
      g.add(m); L.forgeRocks.push(m);
    }
    g.visible = false;
  }
  // ---------- l'Observatoire céleste (Jumelles) ----------
  // mosaïque : moitié soleil (Séla, x < 0), moitié lune (Néria, x > 0), zodiaque ; uHalf* : moitié en alerte (Équinoxe)
  function mosaicMat() {
    return SM({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { uTime: U.time, uPhase: U.phase, uHalfSide: { value: 0 }, uHalfK: { value: 0 }, uHalfArmed: { value: 0 } },
      vertexShader: `varying vec2 vP; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vP = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uTime; uniform vec3 uPhase; uniform float uHalfSide; uniform float uHalfK; uniform float uHalfArmed; varying vec2 vP;
        void main(){ vec2 p = vP; float d = length(p); float a = atan(p.y, p.x);
          float sun = step(p.x, 0.0);
          vec3 gold = vec3(1.0,0.70,0.28), silver = vec3(0.55,0.78,1.0);
          vec3 tint = mix(silver, gold, sun);
          vec3 c = vec3(1.0,0.92,0.8) * (1.0 - smoothstep(0.0, 0.09, abs(p.x))) * 0.9;
          c += tint * (1.0 - smoothstep(0.0, 0.05, abs(d - 6.4))) * 0.6;
          c += uPhase * (1.0 - smoothstep(0.0, 0.07, abs(d - 6.0))) * 0.9;
          c += tint * (1.0 - smoothstep(0.0, 0.05, abs(d - 12.0))) * 0.35;
          c += tint * ((1.0 - smoothstep(0.0, 0.06, abs(d - 18.0))) + (1.0 - smoothstep(0.0, 0.06, abs(d - 20.6)))) * 0.6;
          float tick = step(0.9, fract(a / 6.2831853 * 72.0)) * step(18.2, d) * step(d, 19.0);
          float big = step(0.95, fract(a / 6.2831853 * 12.0)) * step(18.0, d) * step(d, 20.6);
          c += tint * (tick * 0.45 + big * 0.8);
          vec2 s = p - vec2(-11.5, -2.0); float ds = length(s); float as = atan(s.y, s.x);
          float rays = smoothstep(0.55, 1.0, sin(as * 16.0)) * smoothstep(9.0, 3.6, ds) * step(3.6, ds);
          c += gold * (rays * 0.28 + (1.0 - smoothstep(0.0, 0.08, abs(ds - 3.4))) * 0.7) * sun;
          vec2 m = p - vec2(11.5, -2.0); float dm = length(m), dm2 = length(m - vec2(1.5, 0.7));
          c += silver * (step(dm, 3.4) * step(3.0, dm2) * 0.3 + (1.0 - smoothstep(0.0, 0.08, abs(dm - 3.4))) * 0.45) * (1.0 - sun);
          vec2 cell = floor(p * 0.8); float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          c += silver * step(0.93, h) * (1.0 - smoothstep(0.0, 0.12, length(fract(p * 0.8) - 0.5))) * (1.0 - sun) * step(d, 17.5) * (0.6 + 0.4 * sin(uTime * 3.0 + h * 20.0));
          float inHalf = step(0.0, p.x * uHalfSide) * step(0.5, abs(uHalfSide));
          vec3 hc = uHalfSide < 0.0 ? vec3(1.0,0.45,0.1) : vec3(0.4,0.72,1.0);
          float sweep = 1.0 - smoothstep(0.0, 1.2, abs(abs(p.x) - fract(uTime * 0.7) * 21.0));
          float w = ((0.32 + uHalfK * 0.55) * (0.65 + 0.35 * sin(uTime * (6.0 + uHalfK * 10.0))) + sweep * 0.35) * (1.0 - uHalfArmed) + uHalfArmed * (0.9 + 0.3 * sin(uTime * 18.0 + d));
          c += hc * inHalf * w;
          c *= step(d, 21.7);
          gl_FragColor = vec4(c, 1.0); }`,
    });
  }
  function buildObservatory() {
    const g = new T.Group(); scene.add(g); L.arenaObs = g;
    const R = 22;
    const marble = triMat({ set: 'hull', world: true, scale: 0.08, color: '#5e5c70', metal: 0.2, rough: 0.32, bump: 0.008, albedoMix: 0.2, env: 0.7 });
    const disc = new T.Mesh(new T.CylinderGeometry(R, R - 0.6, 1.6, 96), marble); disc.position.y = -0.8; disc.receiveShadow = true; g.add(disc);
    const mos = new T.Mesh(new T.CircleGeometry(R - 0.3, 96), mosaicMat()); mos.rotation.x = -PI / 2; mos.position.y = 0.012; g.add(mos); L.obsMosaic = mos.material.uniforms;
    const gold = triMat({ set: 'hull', world: false, scale: 2, color: '#d9a94a', metal: 1, rough: 0.22, bump: 0.01, albedoMix: 0.2, env: 1.4 });
    const ring = new T.Mesh(new T.TorusGeometry(R + 0.1, 0.28, 10, 160), gold); ring.rotation.x = PI / 2; ring.position.y = 0.05; g.add(ring);
    // colonnade et lanternes (dorées côté Séla, argentées côté Néria)
    const colGeo = new T.CylinderGeometry(0.42, 0.5, 9, 16), capGeo = new T.CylinderGeometry(0.8, 0.45, 0.6, 16), baseGeo = new T.CylinderGeometry(0.7, 0.8, 0.5, 16);
    const colMat = triMat({ set: 'hull', world: true, scale: 0.3, color: '#a8a4b8', metal: 0.1, rough: 0.35, bump: 0.01, albedoMix: 0.2, env: 0.8 });
    L.obsLamps = [];
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * PI * 2 + PI / 12, x = Math.cos(a) * (R + 1.4), z = Math.sin(a) * (R + 1.4), sun = x < 0;
      const c = new T.Mesh(colGeo, colMat); c.position.set(x, 4.5, z); c.castShadow = true; g.add(c);
      const b = new T.Mesh(baseGeo, gold); b.position.set(x, 0.25, z); g.add(b);
      const cap = new T.Mesh(capGeo, gold); cap.position.set(x, 9.2, z); g.add(cap);
      const orb = new T.Mesh(new T.SphereGeometry(0.3, 16, 12), glowMat(sun ? '#ffd27a' : '#bfe6ff', 5)); orb.position.set(x, 10.3, z); g.add(orb);
      const lamp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr(sun ? '#ffc860' : '#9fd0ff', 2.2), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); lamp.scale.set(3, 3, 1); orb.add(lamp);
      L.obsLamps.push({ orb, y: 10.3, ph: k });
    }
    // dessous : coupe inversée cerclée d'or
    const under = new T.Mesh(new T.CylinderGeometry(R - 0.6, 3, 12, 64, 1, true), marble); under.position.y = -7.6; g.add(under);
    for (const [y, rr] of [[-3, 17.6], [-6.5, 12.3]]) { const bd = new T.Mesh(new T.TorusGeometry(rr, 0.2, 8, 96), gold); bd.rotation.x = PI / 2; bd.position.y = y; g.add(bd); }
    // planétaire géant au-dessus de l'arène
    const orr = new T.Group(); orr.position.y = 54; g.add(orr); L.orrery = [];
    orr.add(new T.Mesh(new T.SphereGeometry(1.6, 32, 16), glowMat('#fff0c8', 2)));
    const og = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr('#ffe0a0', 1), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); og.scale.set(10, 10, 1); orr.add(og);
    [[11, 0.28, '#ffcf6a', 0.16], [16, -0.2, '#bfe0ff', -0.1], [21, 0.3, '#e8b8ff', 0.06]].forEach(([r, tilt, col, w], k) => {
      const piv = new T.Group(); piv.rotation.set(tilt, 0, tilt * 0.6); orr.add(piv);
      const rg = new T.Mesh(new T.TorusGeometry(r, 0.13, 6, 180), gold); rg.rotation.x = PI / 2; piv.add(rg);
      const arm = new T.Group(); piv.add(arm);
      const pl = new T.Mesh(new T.SphereGeometry(1.2 - k * 0.15, 24, 16), new T.MeshStandardMaterial({ color: new T.Color(col).convertSRGBToLinear(), roughness: 0.4, metalness: 0.2, emissive: hdr(col, 0.5) })); pl.position.x = r; arm.add(pl);
      const spoke = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, r, 6), gold); spoke.rotation.z = PI / 2; spoke.position.x = r / 2; arm.add(spoke);
      L.orrery.push({ arm, w });
    });
    // un soleil d'or à l'ouest (côté Séla), une lune pâle à l'est (côté Néria)
    const sd = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr('#ffc35a', 1.6), blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); sd.scale.set(130, 130, 1); sd.position.set(-520, 110, -120); g.add(sd);
    const sd2 = new T.Mesh(new T.SphereGeometry(24, 32, 16), glowMat('#ffe0a0', 1.4, { fog: false })); sd2.position.copy(sd.position); g.add(sd2);
    const moon = new T.Mesh(new T.SphereGeometry(40, 48, 32), new T.MeshStandardMaterial({ color: 0xbcc8e0, roughness: 0.9, metalness: 0, emissive: hdr('#3a4a70', 0.25), fog: false })); moon.position.set(520, 140, -160); g.add(moon);
    g.visible = false;
  }
  function updateObservatory(dt) {
    if (L.orrery) L.orrery.forEach(o => { o.arm.rotation.y += o.w * dt; });
    if (L.obsLamps) L.obsLamps.forEach(l => { l.orb.position.y = l.y + Math.sin(time * 1.3 + l.ph) * 0.25; });
    if (Q.bloom && Math.random() < 0.5) { const a = Math.random() * PI * 2, r = Math.random() * 20; emit(Math.cos(a) * r, 0.4 + Math.random() * 4, Math.sin(a) * r, 1, Math.cos(a) < 0 ? '#ffe0a0' : '#cfe6ff', { speed: 0.15, life: 2.5, size: 0.14, vy: 0.4, grav: 0 }); }
    // Équinoxe : la moitié visée s'embrase ou gèle
    const u = L.obsMosaic; if (!u) return;
    const z = S && S.zones.find(q => q.type === 'half');
    if (!z) { u.uHalfSide.value = 0; u.uHalfK.value = 0; u.uHalfArmed.value = 0; return; }
    const armed = S.t >= z.armAt;
    u.uHalfSide.value = z.side; u.uHalfK.value = armed ? 0 : Math.min(1, (S.t - z.born) / Math.max(0.1, z.armAt - z.born)); u.uHalfArmed.value = armed ? 1 : 0;
    if (armed) {
      if (!z.fxDone) { z.fxDone = true; const rg = rigs[z.side < 0 ? 0 : 1]; if (rg) bossPlay(rg, 'bRelease'); cam.shake = Math.max(cam.shake, 0.5); flashLvl = Math.max(flashLvl, 0.2); }
      for (let k = 0; k < 4; k++) { const x = z.side * (0.6 + Math.random() * 19), zz = (Math.random() - 0.5) * 2 * Math.sqrt(Math.max(0, 400 - x * x)); if (z.side < 0) emit(x, 0.2, zz, 1, Math.random() < 0.5 ? '#ff8a3a' : '#ffd27a', { speed: 0.6, life: 0.9, size: 0.55, vy: 5, grav: 0 }); else emit(x, 2.5 + Math.random() * 3, zz, 1, '#d8f0ff', { speed: 0.4, life: 1.2, size: 0.3, vy: -1.5, grav: -1 }); }
    }
  }
  // ---------- L'Horizon (Azhal) ----------
  // dalles hexagonales d'obsidienne au-dessus d'un trou noir ; les dalles de l'Effritement tombent dans le Néant
  function buildHorizon() {
    const g = new T.Group(); scene.add(g); L.arenaHor = g;
    const tiles = GAME.HEX_TILES, H = GAME.HEX;
    const obs = triMat({ set: 'hull', world: true, scale: 0.12, color: '#221a30', metal: 0.85, rough: 0.22, bump: 0.02, line: '#9b6bff', lineI: 1.2, env: 1.1 });
    const tg = new T.CylinderGeometry(H * 0.96, H * 0.8, 2.4, 6); tg.translate(0, -1.2, 0);
    const im = new T.InstancedMesh(tg, obs, tiles.length); im.receiveShadow = true; im.castShadow = true; g.add(im);
    const rg = new T.RingGeometry(H * 0.89, H * 0.95, 6, 1); rg.rotateX(-PI / 2); rg.rotateY(PI / 2); rg.translate(0, 0.02, 0);
    const rim = new T.InstancedMesh(rg, glowMat('#9b6bff', 1.1, { side: T.DoubleSide }), tiles.length); g.add(rim);
    L.horTiles = tiles.map((t, k) => ({ x: t.x, z: t.z, fall: -1, spin: (k % 2 ? 1 : -1) * (0.4 + (k % 3) * 0.2) }));
    L.horIM = [im, rim];
    // le trou noir sous la plateforme : horizon sombre, anneau de photons, disque d'accrétion
    const bh = new T.Group(); bh.position.set(0, -420, -60); bh.rotation.x = 0.18; g.add(bh);
    bh.add(new T.Mesh(new T.SphereGeometry(230, 48, 24), new T.MeshBasicMaterial({ color: 0x000000, fog: false })));
    const disk = new T.Mesh(new T.RingGeometry(260, 1100, 160, 4), SM({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, uniforms: { uTime: U.time },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: NOISE3 + `uniform float uTime; varying vec2 vP;
        void main(){ float r = length(vP); float a = atan(vP.y, vP.x); float t = (r - 260.0) / 840.0;
          float sw = fbm3(vec3(cos(a - uTime*0.05*300.0/r)*r*0.006, sin(a - uTime*0.05*300.0/r)*r*0.006, t*3.0));
          float bands = 0.5 + 0.5*sin(r*0.05 - uTime*0.6 + sw*5.0);
          vec3 hot = mix(vec3(1.0,0.9,0.8), vec3(1.0,0.45,0.75), smoothstep(0.0,0.3,t));
          vec3 c = mix(hot, vec3(0.45,0.25,1.0), smoothstep(0.2,0.9,t));
          float al = pow(1.0 - t, 1.4) * smoothstep(0.0, 0.03, t) * (0.35 + 0.65*sw) * (0.55 + 0.45*bands);
          gl_FragColor = vec4(c*al*1.6, al); }`,
    })); disk.rotation.x = -PI / 2; bh.add(disk); L.horDisk = disk;
    const ring = new T.Mesh(new T.TorusGeometry(238, 4, 8, 160), glowMat('#ffd9f0', 3, { fog: false })); ring.rotation.x = PI / 2; bh.add(ring);
    // débris en orbite et aspirés
    L.horRocks = [];
    const rm = triMat({ set: 'rock', world: false, scale: 0.6, color: '#3a3048', metal: 0.2, rough: 0.8, bump: 0.08, line: '#b07bff', lineI: 3, env: 0.4, flat: true });
    for (let k = 0; k < 16; k++) { const m = new T.Mesh(shardGeo(k + 3), rm); const s2 = 0.8 + (k % 5) * 0.7; m.scale.setScalar(s2); m.userData = { a: k / 16 * PI * 2, r: 26 + (k % 4) * 9, y: -6 + (k % 6) * 3, w: 0.02 + (k % 3) * 0.01, ph: k }; g.add(m); L.horRocks.push(m); }
    setHorTiles(); g.visible = false;
  }
  function resetHorizon() {
    if (!L.horTiles) return;
    for (const t of L.horTiles) t.fall = -1;
    setHorTiles();
  }
  const _hm = new T.Matrix4(), _hq = new T.Quaternion(), _he = new T.Euler(), _hs = new T.Vector3(1, 1, 1), _hp = new T.Vector3();
  function setHorTiles() {
    L.horTiles.forEach((t, k) => {
      const f = t.fall < 0 ? 0 : t.fall, y = -0.5 * 14 * f * f;
      _he.set(f * t.spin * 0.6, 0, f * t.spin * 0.4); _hq.setFromEuler(_he); _hs.setScalar(y < -40 ? 0.0001 : 1);
      _hm.compose(_hp.set(t.x, y, t.z), _hq, _hs);
      for (const im of L.horIM) im.setMatrixAt(k, _hm);
    });
    for (const im of L.horIM) im.instanceMatrix.needsUpdate = true;
  }
  function updateHorizon(dt) {
    if (L.horRocks) L.horRocks.forEach(m => { const u = m.userData; u.a += u.w * dt; m.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(time * 0.5 + u.ph) * 0.6, Math.sin(u.a) * u.r); m.rotation.x += dt * 0.2; m.rotation.y += dt * 0.15; });
    if (L.horDisk) L.horDisk.rotation.z += dt * 0.01;
    // poussière aspirée vers le centre, en spirale
    if (Q.bloom && Math.random() < 0.7) { const a = Math.random() * PI * 2, r = 24 + Math.random() * 10; emit(Math.cos(a) * r, -1 + Math.random() * 6, Math.sin(a) * r, 1, Math.random() < 0.5 ? '#b18cff' : '#ff8ad8', { speed: 0.2, life: 2.2, size: 0.18, vy: -0.5, grav: 0 }); }
    let moved = false;
    for (const t of L.horTiles) if (t.fall >= 0 && t.fall < 3) { t.fall += dt; moved = true; }
    if (moved) setHorTiles();
  }
  // dalle fissurée : hexagone qui palpite, puis la dalle tombe
  function holeFx(z, m) {
    if (!m) {
      m = new T.Mesh(new T.CircleGeometry(z.r, 6), decalMat('#ff5ac8', 1, 3)); m.rotation.x = -PI / 2; m.rotation.z = PI / 2; m.position.set(z.x, 0.09, z.z); m.renderOrder = 3;
      scene.add(m); zoneM.set(z.id, m);
      emit(z.x, 0.3, z.z, 12, '#ff8ad8', { speed: 2, life: 0.6, size: 0.3, vy: 2, grav: -4 });
    }
    const armed = S.t >= z.armAt;
    if (!armed) { m.material.uniforms.uProg.value = Math.min(1, (S.t - z.born) / Math.max(0.1, z.armAt - z.born)); m.material.uniforms.uAlpha.value = 0.8 + 0.4 * Math.sin(time * 14); return; }
    if (!m.userData.fell) {
      m.userData.fell = true; m.visible = false;
      const t = L.horTiles && arenaName === 'horizon' ? L.horTiles[z.tile] : null; if (t && t.fall < 0) t.fall = 0;
      emit(z.x, 0.2, z.z, 40, '#5a4a70', { speed: 3, life: 1.2, size: 0.55, vy: 2, grav: -8 }); emit(z.x, 0.2, z.z, 25, '#ff8ad8', { speed: 4, life: 0.7, size: 0.35, vy: 3, grav: -6 });
      cam.shake = Math.max(cam.shake, 0.3);
    }
  }
  // remet la Forge intacte (nouveau combat, aperçu du hub)
  function resetForge() {
    if (!L.forgePieces) return;
    for (const p of L.forgePieces) { p.m.position.copy(p.base); p.m.rotation.set(0, 0, 0); p.m.visible = true; p.v = 0; p.fell = false; }
    L.collapse = null; L.forgeCrack.uBound.value = 0.25; L.forgeCrack.uHeat.value = 0;
  }
  function updateForge(dt) {
    if (L.forgeRocks) L.forgeRocks.forEach(m => { const u = m.userData; u.a += u.w * dt; m.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(time * 0.4 + u.ph) * 0.8, Math.sin(u.a) * u.r); m.rotation.y += dt * 0.05; m.rotation.x += dt * 0.03; });
    // braises qui montent de la lave et des fissures
    if (Q.bloom && Math.random() < 0.9) { const a = Math.random() * PI * 2, r = Math.random() < 0.6 ? 14 + Math.random() * 12 : Math.random() * 13; emit(Math.cos(a) * r, Math.random() < 0.5 ? 0.2 : -6, Math.sin(a) * r, 1, '#ff8a3a', { speed: 0.3, life: 2.4, size: 0.16, vy: 1.6, grav: 0 }); }
    const C = L.collapse; if (!C) return;
    C.t += dt;
    for (const p of L.forgePieces) {
      if (p.fell || C.t < p.delay) continue;
      if (!p.v) { p.v = 0.01; const ex = Math.cos(p.a) * 13.8, ez = Math.sin(p.a) * 13.8; emit(ex, 0.4, ez, 26, '#ff7a2a', { speed: 4, life: 1.0, size: 0.4, vy: 4, grav: -6 }); emit(ex, 0.5, ez, 14, '#6a5a52', { speed: 2.5, life: 1.4, size: 0.6, vy: 2, grav: -3 }); cam.shake = Math.max(cam.shake, 0.35); }
      p.v += 16 * dt; p.m.position.y -= p.v * dt;
      p.m.position.x += Math.cos(p.a) * dt * 1.2; p.m.position.z += Math.sin(p.a) * dt * 1.2;
      p.m.rotation.x += Math.sin(p.a) * p.spin * dt; p.m.rotation.z -= Math.cos(p.a) * p.spin * dt;
      if (p.m.position.y < -22) { p.fell = true; p.m.visible = false; emit(p.m.position.x, -17, p.m.position.z, 30, '#ffb050', { speed: 5, life: 1.2, size: 0.6, vy: 9, grav: -10 }); }
    }
    L.forgeCrack.uBound.value = Math.min(1, 0.25 + C.t / C.delay);
    L.forgeCrack.uHeat.value = Math.min(0.6, C.t / C.delay * 0.6);
  }

  // ---------- particules ----------
  const NP = 1400;
  let pGeo, pPts, pData = [], pIdx = 0;
  function initParticles() {
    pGeo = new T.BufferGeometry();
    pGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(NP * 3), 3));
    pGeo.setAttribute('color', new T.BufferAttribute(new Float32Array(NP * 3), 3));
    pGeo.setAttribute('size', new T.BufferAttribute(new Float32Array(NP), 1));
    for (let i = 0; i < NP; i++) pData.push({ life: 0, max: 1, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, s: 1, drag: 1, grav: 0 });
    pPts = new T.Points(pGeo, SM({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, vertexColors: true,
      uniforms: { uTex: { value: softTex }, uScale: { value: 300 } },
      vertexShader: `attribute float size; varying vec3 vC; uniform float uScale; void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = min(size*uScale/max(-mv.z, 0.5), 160.0); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec3 vC; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC*t.a, t.a); }`,
    }));
    pPts.frustumCulled = false; pPts.renderOrder = 5; scene.add(pPts);
    // poussière en suspension
    const DN = 380, dp = new Float32Array(DN * 3);
    for (let i = 0; i < DN; i++) { const a = Math.random() * PI * 2, r = Math.random() * 30; dp[i * 3] = Math.cos(a) * r; dp[i * 3 + 1] = Math.random() * 14; dp[i * 3 + 2] = Math.sin(a) * r; }
    const dg = new T.BufferGeometry(); dg.setAttribute('position', new T.BufferAttribute(dp, 3));
    L.dust = new T.Points(dg, new T.PointsMaterial({ color: hdr('#b9c8ff', 1.2), size: 0.09, map: softTex, transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false }));
    L.dust.material.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <logdepthbuf_vertex>', 'gl_PointSize = min(gl_PointSize, 6.0);\n#include <logdepthbuf_vertex>'); };
    scene.add(L.dust);
  }
  function emit(x, y, z, n, color, o = {}) {
    tmpC.set(color).convertSRGBToLinear().multiplyScalar(o.k || 3.2);
    for (let k = 0; k < n; k++) {
      const p = pData[pIdx]; pIdx = (pIdx + 1) % NP;
      const sp = (o.speed || 6) * (0.4 + Math.random() * 0.8), th = Math.random() * PI * 2, ph = Math.random() * PI, sr = o.spread || 0.3;
      p.x = x + (Math.random() - 0.5) * sr; p.y = y + (Math.random() - 0.5) * (o.spreadY || sr); p.z = z + (Math.random() - 0.5) * sr;
      p.vx = Math.cos(th) * Math.sin(ph) * sp; p.vz = Math.sin(th) * Math.sin(ph) * sp; p.vy = Math.cos(ph) * sp + (o.vy || 0);
      if (o.flat) p.vy = Math.random() * 1.2 + (o.vy || 0);
      p.life = p.max = (o.life || 0.9) * (0.6 + Math.random() * 0.6);
      p.r = tmpC.r; p.g = tmpC.g; p.b = tmpC.b; p.s = (o.size || 0.35) * (0.6 + Math.random() * 0.8);
      p.drag = o.drag ?? 0.92; p.grav = o.grav ?? -4;
    }
  }
  function updateParticles(dt) {
    const pos = pGeo.attributes.position.array, col = pGeo.attributes.color.array, size = pGeo.attributes.size.array;
    for (let i = 0; i < NP; i++) {
      const p = pData[i];
      if (p.life <= 0) { size[i] = 0; continue; }
      p.life -= dt; const k = Math.pow(p.drag, dt * 60);
      p.vx *= k; p.vy *= k; p.vz *= k; p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; }
      const f = Math.max(0, p.life / p.max);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 3] = p.r * f; col[i * 3 + 1] = p.g * f; col[i * 3 + 2] = p.b * f;
      size[i] = p.s * (0.5 + f * 0.5);
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true; pGeo.attributes.size.needsUpdate = true;
  }

  // ---------- tirs, rayons, flashs ----------
  const tracers = [];
  const boltGeo = new T.CylinderGeometry(0.05, 0.05, 1, 6, 1, true); boltGeo.rotateX(PI / 2);
  function tracer(from, to, color, dur, width) {
    let tr = tracers.find(t => !t.on);
    if (!tr) {
      if (tracers.length > 160) return;
      const m = new T.Mesh(boltGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      tr = { m, on: false }; tracers.push(tr); scene.add(m);
    }
    tr.on = true; tr.t = 0; tr.dur = dur || 0.28; tr.from = from.clone(); tr.to = to.clone(); tr.col = color;
    tr.m.material.color.copy(hdr(color, 7)); tr.m.visible = true; const w = width || 1; tr.m.scale.set(w, w, Math.min(3, from.distanceTo(to) * 0.3) + 0.6);
  }
  function updateTracers(dt) {
    for (const tr of tracers) {
      if (!tr.on) continue;
      tr.t += dt; const k = tr.t / tr.dur;
      if (k >= 1) { tr.on = false; tr.m.visible = false; emit(tr.to.x, tr.to.y, tr.to.z, 3, tr.col, { speed: 3, life: 0.25, size: 0.3 }); continue; }
      tr.m.position.lerpVectors(tr.from, tr.to, k); tr.m.lookAt(tr.to);
    }
  }
  const beamGeo = new T.PlaneGeometry(1, 1, 1, 1); beamGeo.translate(0, 0.5, 0);
  function makeBeam(color, width, k) {
    const m = new T.Mesh(beamGeo, beamMat(color, k)); m.userData.w = width || 0.4; m.visible = false; m.frustumCulled = false; scene.add(m); return m;
  }
  function setBeam(m, a, b, op) {
    const d = a.distanceTo(b); if (d < 0.01) { m.visible = false; return; }
    m.position.copy(a);
    tmpV.subVectors(b, a).normalize();
    // plan orienté vers la caméra autour de l'axe a→b
    const z = tmpV2.subVectors(camera.position, a).normalize();
    const x = new T.Vector3().crossVectors(tmpV, z).normalize(); const zz = new T.Vector3().crossVectors(x, tmpV);
    m.matrixAutoUpdate = false; m.matrix.makeBasis(x.multiplyScalar(m.userData.w), tmpV.clone().multiplyScalar(d), zz); m.matrix.setPosition(a);
    m.material.uniforms.uOp.value = op; m.visible = true;
  }
  const flashes = [];
  function flash(x, y, z, color, power, dur) {
    let f = flashes.find(q => q.t >= q.dur) || flashes[0];
    if (!f) return;
    f.l.position.set(x, y, z); f.l.color.set(color); f.p = power; f.t = 0; f.dur = dur || 0.35;
  }
  function updateFlashes(dt) { for (const f of flashes) { f.t += dt; const k = Math.max(0, 1 - f.t / f.dur); f.l.intensity = f.p * k * k; } }

  // ---------- init ----------
  function init(cv) {
    canvas = cv;
    renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.setPixelRatio(currentDpr());
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.NoToneMapping; renderer.outputEncoding = T.LinearEncoding;
    const gl2 = renderer.capabilities.isWebGL2;
    if (gl2 && (renderer.extensions.get('EXT_color_buffer_float') || renderer.extensions.get('EXT_color_buffer_half_float'))) hdrType = T.HalfFloatType;
    scene = new T.Scene();
    scene.fog = new T.FogExp2(0x0a0b16, 0.0032);
    camera = new T.PerspectiveCamera(42, 1, 0.5, 3000);
    // lumières
    L.hemi = new T.HemisphereLight(0x5a6aa8, 0x0a0a12, 0.35); scene.add(L.hemi);
    L.key = new T.DirectionalLight(0xffd9b4, 2.6);
    L.key.position.copy(U.sunDir.value).multiplyScalar(70); L.key.target.position.set(0, 0, 0); scene.add(L.key); scene.add(L.key.target);
    L.key.castShadow = true;
    const sc = L.key.shadow.camera; sc.left = -27; sc.right = 27; sc.top = 27; sc.bottom = -27; sc.near = 20; sc.far = 140;
    L.key.shadow.bias = -0.0004; L.key.shadow.normalBias = 0.04; L.key.shadow.radius = 3;
    L.rim = new T.DirectionalLight(0x6fa8ff, 1.6); L.rim.position.set(-40, 30, 50); scene.add(L.rim);
    L.fill = new T.DirectionalLight(0xa47bff, 0.6); L.fill.position.set(-60, 10, -40); scene.add(L.fill);
    L.boss = new T.PointLight(0x9d6bff, 3, 28, 2); L.boss.position.set(0, 5, 0); scene.add(L.boss);
    for (let i = 0; i < 3; i++) { const l = new T.PointLight(0xffffff, 0, 16, 2); scene.add(l); flashes.push({ l, t: 1, dur: 1, p: 0 }); }
    L.moveMark = new T.Mesh(new T.RingGeometry(0.45, 0.6, 32), new T.MeshBasicMaterial({ color: hdr('#ffbf5a', 4), transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
    L.moveMark.rotation.x = -PI / 2; L.moveMark.position.y = 0.08; scene.add(L.moveMark);
    buildSky(); initParticles();
    setupPost();
    resize(); bindControls();
  }
  // ---------- post-traitement ----------
  const FinalShader = {
    uniforms: { tDiffuse: { value: null }, uExposure: { value: 0.78 }, uTime: { value: 0 }, uVignette: { value: 0.6 }, uCA: { value: 0.0022 }, uGrain: { value: 0.022 }, uSat: { value: 1.1 }, uFlash: { value: 0 }, uFlashCol: { value: new T.Color(1, 1, 1) }, uRes: { value: new T.Vector2(1, 1) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uExposure; uniform float uTime; uniform float uVignette; uniform float uCA; uniform float uGrain; uniform float uSat; uniform float uFlash; uniform vec3 uFlashCol; uniform vec2 uRes; varying vec2 vUv;
      vec3 fitRRT(vec3 v){ vec3 a = v*(v + 0.0245786) - 0.000090537; vec3 b = v*(0.983729*v + 0.4329510) + 0.238081; return a/b; }
      vec3 aces(vec3 c){ const mat3 I = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
        const mat3 O = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
        c = I*c; c = fitRRT(c); c = O*c; return clamp(c, 0.0, 1.0); }
      vec3 toSRGB(vec3 c){ return mix(pow(c, vec3(0.41666))*1.055 - 0.055, c*12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
      float h12(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        vec2 d = vUv - 0.5; float r2 = dot(d,d);
        vec2 off = d * uCA * (0.3 + r2*2.0);
        vec3 col = vec3(texture2D(tDiffuse, vUv - off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + off).b);
        // netteté légère
        vec2 px = 1.0/uRes; vec3 nb = texture2D(tDiffuse, vUv+vec2(px.x,0.0)).rgb + texture2D(tDiffuse, vUv-vec2(px.x,0.0)).rgb + texture2D(tDiffuse, vUv+vec2(0.0,px.y)).rgb + texture2D(tDiffuse, vUv-vec2(0.0,px.y)).rgb;
        col = max(col + (col - nb*0.25)*0.18, 0.0);
        col *= uExposure / 0.6;
        col += uFlashCol * uFlash;
        col = aces(col);
        float l = dot(col, vec3(0.2126,0.7152,0.0722));
        col = mix(vec3(l), col, uSat);
        col += vec3(-0.012, 0.004, 0.022) * (1.0 - l);     // ombres froides
        col += vec3(0.020, 0.008, -0.016) * l;             // hautes lumières chaudes
        col *= 1.0 - uVignette * smoothstep(0.12, 0.75, r2*1.8);
        col = toSRGB(clamp(col, 0.0, 1.0));
        col += (h12(vUv*uRes + fract(uTime)*91.7) - 0.5) * uGrain;
        gl_FragColor = vec4(col, 1.0); }`,
  };
  function setupPost() {
    if (composer) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); }
    composer = null; bloomPass = null; finalPass = null;
    if (!(T.EffectComposer && T.RenderPass && T.ShaderPass)) { renderer.toneMapping = T.ACESFilmicToneMapping; renderer.outputEncoding = T.sRGBEncoding; return; }
    try {
      const canMS = Q.msaa && renderer.capabilities.isWebGL2 && T.WebGLMultisampleRenderTarget;
      const tries = [];
      if (canMS) tries.push([true, hdrType]);
      tries.push([false, hdrType]);
      if (hdrType !== T.UnsignedByteType) { if (canMS) tries.push([true, T.UnsignedByteType]); tries.push([false, T.UnsignedByteType]); }
      let rt = null, chosenType = T.UnsignedByteType;
      for (const [ms, type] of tries) {
        const opts = { type, format: T.RGBAFormat, encoding: T.LinearEncoding, minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: true, stencilBuffer: false };
        const cand = ms ? new T.WebGLMultisampleRenderTarget(16, 16, opts) : new T.WebGLRenderTarget(16, 16, opts);
        if (ms) cand.samples = 4;
        renderer.setRenderTarget(cand); const gl = renderer.getContext(); const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; renderer.setRenderTarget(null);
        if (ok) { rt = cand; chosenType = type; break; }
        cand.dispose();
      }
      if (!rt) throw new Error('rt');
      composer = new T.EffectComposer(renderer, rt);
      composer.addPass(new T.RenderPass(scene, camera));
      if (Q.bloom && T.UnrealBloomPass) {
        bloomPass = new T.UnrealBloomPass(new T.Vector2(256, 256), 0.5, 0.4, chosenType === T.HalfFloatType ? 2.6 : 0.9);
        if (chosenType === T.HalfFloatType) [bloomPass.renderTargetBright, ...bloomPass.renderTargetsHorizontal, ...bloomPass.renderTargetsVertical].forEach(t => { t.texture.type = T.HalfFloatType; });
        composer.addPass(bloomPass);
      }
      finalPass = new T.ShaderPass(FinalShader); finalPass.material.toneMapped = false; composer.addPass(finalPass);
      renderer.toneMapping = T.NoToneMapping; renderer.outputEncoding = T.LinearEncoding;
    } catch (e) { composer = null; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.outputEncoding = T.sRGBEncoding; }
    applyShadowQuality();
  }
  function applyShadowQuality() {
    const on = Q.shadow > 0;
    renderer.shadowMap.enabled = on;
    if (L.key) { L.key.castShadow = on; if (on && L.key.shadow.mapSize.x !== Q.shadow) { L.key.shadow.mapSize.set(Q.shadow, Q.shadow); if (L.key.shadow.map) { L.key.shadow.map.dispose(); L.key.shadow.map = null; } } }
    scene && scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { m.needsUpdate = true; }); } });
  }
  function setQuality(name) {
    qName = name;
    Q = name === 'auto' ? PRESETS.haute : PRESETS[name] || PRESETS.haute;
    dprScale = 1; perf = { acc: 0, n: 0, t: 0, cool: 3 };
    setupPost(); resize();
  }
  function adaptQuality(dt) {
    if (qName !== 'auto') return;
    perf.acc += dt; perf.n++; perf.t += dt; perf.cool -= dt;
    if (perf.t < 1.5 || perf.cool > 0) return;
    const avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0; perf.t = 0;
    let changed = false;
    if (avg > 1 / 40 && dprScale > 0.6) { dprScale = Math.max(0.6, dprScale - 0.12); changed = true; }
    else if (avg < 1 / 56 && dprScale < 1) { dprScale = Math.min(1, dprScale + 0.08); changed = true; }
    if (avg > 1 / 26 && Q === PRESETS.haute && dprScale <= 0.62) { Q = PRESETS.moyenne; setupPost(); changed = true; }
    if (changed) { perf.cool = 2; resize(); }
  }
  function resize() {
    vw = window.innerWidth; vh = window.innerHeight;
    const pr = currentDpr();
    renderer.setPixelRatio(pr); renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh; applyViewOffset();
    if (composer) { composer.setPixelRatio(pr); composer.setSize(vw, vh); }
    if (finalPass) finalPass.uniforms.uRes.value.set(vw * pr, vh * pr);
    if (pPts) pPts.material.uniforms.uScale.value = vh * pr * 0.42;
    if (L.stars) L.stars.material.uniforms.uPR.value = pr;
  }
  function applyViewOffset() {
    const off = cam.mode === 'fight' ? (insetBottom - insetTop) / 2 : (vw < vh ? vh * 0.21 : 0);
    const offX = cam.mode === 'hub' && vw > vh ? -vw * 0.2 : (cam.mode === 'fight' ? -insetLeft / 2 : 0);
    camera.setViewOffset(vw, vh, offX, off, vw, vh); camera.updateProjectionMatrix();
  }
  function setInsets(top, bottom, left) { insetTop = top; insetBottom = bottom; insetLeft = left || 0; applyViewOffset(); }
  const ray = new T.Raycaster(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0), ndc = new T.Vector2(), hit = new T.Vector3();
  function bindControls() {
    const ptrs = new Map(); let pinch0 = 0, zoom0 = 1, down = null;
    canvas.addEventListener('pointerdown', e => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
      if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = cam.zoom; down = null; }
    });
    canvas.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (down) down.moved += Math.abs(dx) + Math.abs(dy);
      if (ptrs.size === 1 && (!down || down.moved > 14)) { cam.az -= dx * 0.006; cam.el = Math.max(0.5, Math.min(1.36, cam.el + dy * 0.004)); }
      else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 0) cam.zoom = Math.max(0.45, Math.min(1.5, zoom0 * pinch0 / d)); }
    });
    const up = e => {
      if (down && ptrs.size === 1 && down.moved <= 14 && performance.now() - down.t < 600 && tapCb && cam.mode === 'fight') {
        ndc.set((e.clientX / vw) * 2 - 1, -(e.clientY / vh) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const g = ray.ray.intersectPlane(plane, hit) && Math.hypot(hit.x, hit.z) < 21 ? { x: hit.x, z: hit.z } : null;
        tapCb({ ground: g, sx: e.clientX, sy: e.clientY, pick: pick(e.clientX, e.clientY, UISet.size > 0 || !!UIplace) });
      }
      ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; if (!ptrs.size) down = null;
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); down = null; });
    canvas.addEventListener('wheel', e => { cam.zoom = Math.max(0.45, Math.min(1.5, cam.zoom * (1 + e.deltaY * 0.001))); e.preventDefault(); }, { passive: false });
  }
  function onTap(fn) { tapCb = fn; }
  // ---------- sélection tolérante : le perso ou l'ennemi le plus proche du doigt ----------
  const _ps = new T.Vector3();
  function toScreen(x, y, z) { _ps.set(x, y, z).project(camera); return { x: (_ps.x * 0.5 + 0.5) * vw, y: (1 - (_ps.y * 0.5 + 0.5)) * vh, z: _ps.z }; }
  function segPx(px, py, a, b) { const vx = b.x - a.x, vy = b.y - a.y, wx = px - a.x, wy = py - a.y; const c = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy || 1))); return Math.hypot(wx - vx * c, wy - vy * c); }
  function raiderH(m) { return 1.95 * (m.root.scale.x / 1.7); }
  // strict : une sélection est en cours, un tap près d'un perso reste un ordre de déplacement
  function pick(sx, sy, strict) {
    if (!S) return null;
    let br = null, brd = 1e9;
    for (const m of raidM) { const p = m.root.position; const d = segPx(sx, sy, toScreen(p.x, 0.1, p.z), toScreen(p.x, raiderH(m), p.z)); if (d < brd) { brd = d; br = { kind: 'raider', i: m.r.i }; } }
    if (br && brd < (strict ? 14 : 26)) return br;
    let be = null, bed = 1e9;
    rigs.forEach((rg, k) => {
      const p = rg.root.position, h = (rg.height || 8) + (rg.baseY || 0);
      const mid = toScreen(p.x, h * 0.45, p.z), edge = toScreen(p.x + (S.B.rad || 3.4), h * 0.45, p.z);
      const radPx = Math.max(34, Math.hypot(edge.x - mid.x, edge.y - mid.y));
      const d = segPx(sx, sy, toScreen(p.x, 0, p.z), toScreen(p.x, h * 0.85, p.z)) - radPx;
      if (d < bed) { bed = d; be = { kind: 'body', k }; }
    });
    for (const [id, am] of addM) { if (!am.a.alive) continue; const p = am.g.position; const s = toScreen(p.x, p.y + (am.a.type === 'guardian' ? 2 : 0.3), p.z); const d = Math.hypot(sx - s.x, sy - s.y) - (am.a.type === 'guardian' ? 48 : 30); if (d < bed) { bed = d; be = { kind: 'add', id }; } }
    if (be && bed < 0) return be;
    if (br && !strict && brd < 44) return br;
    return null;
  }
  // positions écran des têtes, pour les plaques au-dessus des persos
  function nameplates() {
    const out = [];
    for (const m of raidM) { const p = m.root.position; const s = toScreen(p.x, raiderH(m) + 0.35 + (m.lift || 0), p.z); out.push({ i: m.r.i, x: s.x, y: s.y, vis: s.z < 1 }); }
    return out;
  }
  function marker(x, z, color) { L.moveMark.material.color.copy(hdr(color || '#66d8ff', 4)); L.moveMark.position.set(x, 0.08, z); L.moveMark.material.opacity = 1; L.moveMark.scale.setScalar(1.6); }
  function setMode(m) {
    cam.mode = m;
    if (m === 'fight') { cam.az = 0; cam.el = 0.98; cam.zoom = 1; camera.fov = 46; cam.dCur = 0; cam.fCur = null; }
    else camera.fov = 40;
    camera.updateProjectionMatrix(); applyViewOffset();
  }

  // ---------- squelettes : outils ----------
  function cloneSkinned(gltf) { return T.SkeletonUtils ? T.SkeletonUtils.clone(gltf.scene) : gltf.scene.clone(true); }
  function bone(root, name) { return root.getObjectByName('mixamorig' + name); }
  // attache un objet à un os, en « mètres » du modèle non mis à l'échelle
  function attach(root, name, obj) {
    const b = bone(root, name); if (!b) return null;
    root.updateMatrixWorld(true);
    const ws = new T.Vector3(); b.getWorldScale(ws); const rs = new T.Vector3(); root.getWorldScale(rs);
    const g = new T.Group(); g.scale.setScalar(rs.x / ws.x); g.add(obj); b.add(g); return g;
  }
  function handDown(obj, right) { const g = new T.Group(); g.rotation.z = right ? PI / 2 : -PI / 2; g.add(obj); return g; }
  function makeMixer(root, clips, names) {
    const mixer = new T.AnimationMixer(root), actions = {};
    for (const [key, clipName] of Object.entries(names)) { const c = clips.find(x => x.name === clipName); if (c) { actions[key] = mixer.clipAction(c); } }
    if (actions.idle) actions.idle.play();
    return { mixer, actions, cur: 'idle' };
  }
  function playAction(anim, key, fade) {
    if (!anim || anim.cur === key || !anim.actions[key]) return;
    const prev = anim.actions[anim.cur], next = anim.actions[key];
    next.reset().setEffectiveWeight(1).fadeIn(fade || 0.25).play();
    if (prev) prev.fadeOut(fade || 0.25);
    anim.cur = key;
  }

/*@@CHARS@@*/

  // ---------- boss ----------
  function bossBase(colors) {
    const root = new T.Group(); scene.add(root);
    const body = new T.Group(); root.add(body);
    const col = { value: new T.Color(colors[0]).convertSRGBToLinear() };
    const rig = { root, body, col, colors, mats: [], skel: null, anim: null, baseY: 0, height: 8, charge: null, slash: null, rise: 0, dead: 0, attachments: [], floatAmp: 0, glowS: null };
    const blob = new T.Mesh(new T.CircleGeometry(4, 40), new T.MeshBasicMaterial({ map: radial([[0, 'rgba(0,0,0,0.7)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false })); blob.rotation.x = -PI / 2; blob.position.y = 0.02; root.add(blob);
    const orb = new T.Mesh(new T.SphereGeometry(1, 32, 16), fresnelMat('#7fe6ff', 1.3, 3, 1)); orb.scale.setScalar(0.001); root.add(orb); rig.orb = orb;
    orb.add(new T.Mesh(new T.SphereGeometry(0.45, 16, 12), glowMat('#dff8ff', 6)));
    rig.glowS = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffffff, blending: T.AdditiveBlending, depthWrite: false, transparent: true })); body.add(rig.glowS);
    return rig;
  }
  function colossusRig(colors, scale, bodyLook, jointLook) {
    const rig = bossBase(colors);
    if (!A.colossus) return rig;
    const sk = cloneSkinned(A.colossus);
    const bm = triMat(Object.assign({ skinning: true }, bodyLook)), jm = triMat(Object.assign({ skinning: true }, jointLook));
    sk.traverse(o => { if (o.isMesh) { o.material = o.name.includes('Joints') ? jm : bm; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    rig.mats.push(bm, jm);
    sk.scale.setScalar(scale);
    rig.body.add(sk); rig.skel = sk;
    rig.anim = makeMixer(sk, A.colossus.animations, { idle: 'idle', walk: 'walk', run: 'run' });
    rig.height = 1.8 * scale;
    rig.bones = { spine: bone(sk, 'Spine1'), spine2: bone(sk, 'Spine2'), rarm: bone(sk, 'RightArm'), rfore: bone(sk, 'RightForeArm'), larm: bone(sk, 'LeftArm'), head: bone(sk, 'Head') };
    rig.scale = scale;
    return rig;
  }
  function pauldron(mat, trim, r) {
    const g = new T.Group();
    const sh = new T.Mesh(new T.SphereGeometry(r, 24, 12, 0, PI * 2, 0, PI * 0.5), mat); sh.scale.set(1.15, 0.8, 1); g.add(sh);
    const t = new T.Mesh(new T.TorusGeometry(r * 1.02, r * 0.06, 8, 32), trim); t.rotation.x = PI / 2; t.scale.set(1.15, 1, 1); g.add(t);
    for (let k = 0; k < 3; k++) { const sp = new T.Mesh(new T.ConeGeometry(r * 0.12, r * 0.9, 5), mat); sp.position.set((k - 1) * r * 0.45, r * 0.55, -r * 0.2); sp.rotation.x = -0.35; g.add(sp); }
    return g;
  }
  function haloRing(colU, r, spikes, crescent) {
    const g = new T.Group();
    const mat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
    g.userData.mat = mat;
    if (crescent) { const c = new T.Mesh(new T.TorusGeometry(r, r * 0.07, 8, 64, PI * 1.35), mat); c.rotation.z = PI * 0.33; g.add(c); }
    else { g.add(new T.Mesh(new T.TorusGeometry(r, r * 0.025, 6, 96), mat)); g.add(new T.Mesh(new T.TorusGeometry(r * 1.15, r * 0.01, 6, 96), mat)); }
    for (let k = 0; k < spikes; k++) { const a = k / spikes * PI * 2; const s = new T.Mesh(new T.ConeGeometry(r * 0.035, r * (0.35 + (k % 2) * 0.25), 4), mat); s.position.set(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15, 0); s.rotation.z = a - PI / 2; g.add(s); }
    return g;
  }
  function buildNyxar() {
    const rig = colossusRig(['#9d6bff', '#ff4fc8', '#ff7433'], 5,
      { set: 'hull', color: '#1b1824', metal: 1, rough: 0.28, scale: 2.4, bump: 0.035, line: '#9d6bff', lineI: 1.5, albedoMix: 0.6, env: 1.3 },
      { set: 'hull', color: '#2a2235', metal: 0.9, rough: 0.25, scale: 2.4, bump: 0.02, line: '#b07cff', lineI: 6, rim: '#9d6bff', rimI: 3 });
    const sk = rig.skel; if (!sk) return rig;
    // silhouette d'Archonte (avant l'armure) : buste haut et large, bras longs, tête fine
    for (const [n, k] of Object.entries({ Spine2: 1.12, LeftArm: 1.1, RightArm: 1.1, Neck: 1.1, Head: 0.88 })) { const bn = bone(sk, n); if (bn) bn.scale.multiplyScalar(k); }
    const armor = triMat({ set: 'hull', world: false, scale: 4, color: '#24202e', metal: 1, rough: 0.25, bump: 0.04, line: '#a77bff', lineI: 3, env: 1.3 });
    const trim = glowMat('#b07cff', 5); rig.trims = [trim];
    for (const sd of [1, -1]) { const p = pauldron(armor, trim, 0.13); p.position.set(0.17 * sd, 0.15, -0.01); p.rotation.z = -0.55 * sd; attach(sk, 'Spine2', p); }
    const core = new T.Mesh(new T.IcosahedronGeometry(0.075, 3), coreMat(rig.col, 5)); core.position.set(0, 0.05, 0.11); attach(sk, 'Spine2', core); rig.core = core;
    const chest = new T.Mesh(new T.TorusGeometry(0.1, 0.012, 8, 32), armor); chest.position.set(0, 0.05, 0.1); attach(sk, 'Spine2', chest);
    const halo = haloRing(rig.col, 0.24, 11); halo.position.set(0, 0.12, -0.12); attach(sk, 'Head', halo); rig.halo = halo;
    for (const side of ['Left', 'Right']) {
      const bl = new T.Group();
      const blade = new T.Mesh(new T.OctahedronGeometry(1, 0), armor); blade.scale.set(0.035, 0.3, 0.012); blade.position.y = 0.28; bl.add(blade);
      const edge = new T.Mesh(new T.BoxGeometry(0.008, 0.56, 0.005), trim); edge.position.y = 0.28; bl.add(edge);
      attach(sk, side + 'Hand', handDown(bl, side === 'Right'));
    }
    // robe d'énergie sous la taille, remplace les jambes
    const robe = new T.Mesh(new T.ConeGeometry(2.2, 6.5, 48, 1, true), robeMat(rig.col)); robe.position.y = 2.6; rig.body.add(robe);
    const robe2 = new T.Mesh(new T.ConeGeometry(1.5, 4.6, 32, 1, true), robeMat(rig.col)); robe2.position.y = 3.2; robe2.rotation.y = 1; rig.body.add(robe2);
    const shards = new T.Group(); shards.position.y = 6.2; rig.body.add(shards); rig.shards = shards;
    for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2; const s = new T.Mesh(new T.OctahedronGeometry(0.5, 0), armor); s.scale.set(0.35, 1.2, 0.22); s.position.set(Math.cos(a) * 4.2, Math.sin(k * 1.7) * 0.6, Math.sin(a) * 4.2); s.castShadow = true; shards.add(s); }
    // aile de lames flottantes dans le dos, en éventail
    const wing = new T.Group(); wing.position.set(0, 0.12, -0.16);
    for (let k = 0; k < 9; k++) { const an = (k - 4) * 0.3; const bl = new T.Group(); bl.rotation.z = an; const len = 0.34 - Math.abs(k - 4) * 0.035;
      const m2 = new T.Mesh(new T.OctahedronGeometry(1, 0), armor); m2.scale.set(0.03, len, 0.01); m2.position.y = 0.14 + len; bl.add(m2);
      const e2 = new T.Mesh(new T.BoxGeometry(0.006, len * 1.9, 0.004), trim); e2.position.y = 0.14 + len; bl.add(e2); wing.add(bl); }
    attach(sk, 'Spine2', wing); rig.wing = wing;
    // couronne de pointes au-dessus de la tête et anneau gyroscopique à la taille
    const crown = new T.Group(); for (let k = 0; k < 7; k++) { const c = new T.Mesh(new T.ConeGeometry(0.012, 0.12 + (k === 3 ? 0.06 : 0), 4), trim); c.position.set((k - 3) * 0.03, 0.22, 0.02); c.rotation.z = (k - 3) * -0.12; crown.add(c); } attach(sk, 'Head', crown);
    const gyro = new T.Mesh(new T.TorusGeometry(2.6, 0.06, 8, 96), trim); gyro.position.y = 4.1; gyro.rotation.x = PI / 2 - 0.25; rig.body.add(gyro); rig.gyro = gyro;
    rig.floatAmp = 0.3; rig.baseY = 1.0; rig.glowS.position.set(0, 6.6, 0.6); rig.glowS.scale.set(5, 5, 1); rig.orbY = 11.5; rig.levit = true;
    return rig;
  }
  function buildVorr() {
    // golem de basalte : armure de roche sombre veinée de magma, cœur en fusion, marteau monolithe
    const rig = colossusRig(['#ff7a2a', '#ff3a10'], 5.6,
      { set: 'rock', color: '#6a5a52', metal: 0.05, rough: 0.92, scale: 1.4, bump: 0.1, line: '#ff6a1a', lineI: 3.2, albedoMix: 1, env: 0.4 },
      { set: 'rock', color: '#2a1a14', metal: 0.2, rough: 0.6, scale: 1.4, bump: 0.05, line: '#ff7a2a', lineI: 6, rim: '#ff4a10', rimI: 1.6 });
    const sk = rig.skel; if (!sk) return rig;
    // silhouette de golem (avant l'armure, qui garde ainsi sa taille) : torse et bras épaissis, cou rentré ; pieds recalés au sol
    const toe = bone(sk, 'LeftToeBase'), tp = new T.Vector3();
    sk.updateMatrixWorld(true); const y0 = toe ? toe.getWorldPosition(tp).y : 0;
    for (const [n, k] of Object.entries({ Spine2: 1.22, LeftArm: 1.16, RightArm: 1.16, LeftUpLeg: 1.1, RightUpLeg: 1.1, Neck: 0.78 })) { const b = bone(sk, n); if (b) b.scale.multiplyScalar(k); }
    sk.updateMatrixWorld(true); if (toe) rig.baseY = y0 - toe.getWorldPosition(tp).y;
    const rock = triMat({ set: 'rock', world: false, scale: 3.0, color: '#4a3e3a', metal: 0.05, rough: 0.8, bump: 0.05, line: '#ff6a1a', lineI: 2.2, env: 0.5, flat: true });
    const basalt = triMat({ set: 'rock', world: false, scale: 4.0, color: '#3a302c', metal: 0.05, rough: 0.85, bump: 0.08, line: '#ff6a1a', lineI: 1.2, env: 0.4 });
    rig.mats.push(rock, basalt);
    const seam = glowMat('#ff7a2a', 7); rig.trims = [seam];
    const chunk = (s, x, y, z, seed, m) => { const o = new T.Mesh(shardGeo(seed), m || rock); o.scale.set(s, s * 0.85, s); o.position.set(x, y, z); o.rotation.set(seed, seed * 2, seed * 0.5); o.castShadow = true; return o; };
    const prism = (r, h, x, y, z, rx, rz) => { const o = new T.Mesh(new T.CylinderGeometry(r * 0.8, r, h, 6), basalt); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = true; return o; };
    rig.vents = []; rig.breakable = [];
    // épaulières : blocs massifs, une fente de magma et une fumerolle
    const shoulder = sd => {
      const g = new T.Group();
      const a = chunk(0.17, 0, 0.01, 0, sd + 2); g.add(a); rig.breakable.push(a);
      g.add(chunk(0.1, 0.07 * sd, 0.1, -0.04, sd + 4)); g.add(chunk(0.08, -0.03 * sd, 0.09, 0.07, sd + 6));
      g.add(prism(0.025, 0.2, 0.05 * sd, 0.15, -0.06, -0.4, -0.35 * sd)); g.add(prism(0.02, 0.15, 0.1 * sd, 0.12, -0.02, -0.2, -0.6 * sd));
      const s = new T.Mesh(new T.TorusGeometry(0.11, 0.008, 6, 24, PI * 1.2), seam); s.rotation.set(PI / 2, 0, sd > 0 ? 0.6 : 2.2); s.position.y = 0.02; g.add(s);
      const v = new T.Object3D(); v.position.set(0.05 * sd, 0.2, -0.05); g.add(v); rig.vents.push(v);
      g.position.set(0.21 * sd, 0.16, -0.02); return g;
    };
    attach(sk, 'Spine2', shoulder(1)); attach(sk, 'Spine2', shoulder(-1));
    // dos : crête de colonnes de basalte
    const back = new T.Group();
    back.add(chunk(0.2, 0, 0.04, -0.13, 7));
    [[0, 0.3, -0.16, -0.35, 0], [0.08, 0.24, -0.15, -0.45, -0.3], [-0.08, 0.25, -0.15, -0.45, 0.3], [0.15, 0.18, -0.12, -0.5, -0.6], [-0.15, 0.17, -0.12, -0.5, 0.6]].forEach(([x, h, z, rx, rz], k) => back.add(prism(0.03 - k * 0.002, h, x, 0.12 + h * 0.35, z, rx, rz)));
    attach(sk, 'Spine2', back);
    // tête : bloc fendu, couronne de cornes, fente d'yeux
    const helm = new T.Group(); helm.add(chunk(0.13, 0, 0.09, -0.02, 11));
    for (let k = 0; k < 5; k++) { const c = new T.Mesh(new T.ConeGeometry(0.022, 0.16 + (k === 2 ? 0.06 : 0) - Math.abs(k - 2) * 0.02, 5), basalt); c.position.set((k - 2) * 0.05, 0.2, -0.03); c.rotation.set(-0.3, 0, (k - 2) * 0.28); c.castShadow = true; helm.add(c); }
    const eye = new T.Mesh(new T.BoxGeometry(0.15, 0.014, 0.02), glowMat('#ffc060', 12)); eye.position.set(0, 0.075, 0.105); helm.add(eye);
    attach(sk, 'Head', helm);
    // bras et jambes : gantelets et genouillères de roche
    for (const s of ['Left', 'Right']) {
      const g = new T.Group(); const c = chunk(0.1, 0, 0.13, 0, s.length); g.add(c); g.add(chunk(0.06, 0.03, 0.2, 0.03, s.length + 5)); attach(sk, s + 'ForeArm', g); rig.breakable.push(c);
      attach(sk, s + 'UpLeg', chunk(0.11, 0, 0.22, 0.03, s.length + 2)); attach(sk, s + 'Leg', chunk(0.08, 0, 0.05, 0.05, s.length + 9));
    }
    // cœur en fusion visible à travers la cuirasse
    const core = new T.Mesh(new T.IcosahedronGeometry(0.06, 2), coreMat(rig.col, 0.7)); core.position.set(0, 0.03, 0.085); core.scale.set(1, 1.25, 0.35); attach(sk, 'Spine2', core); rig.core = core;
    for (let k = 0; k < 4; k++) { const v = new T.Mesh(new T.BoxGeometry(0.008, 0.08 + k * 0.02, 0.006), seam); v.position.set((k - 1.5) * 0.045, 0.03 + (k % 2) * 0.03, 0.12); v.rotation.z = (k - 1.5) * 0.5; attach(sk, 'Spine2', v); }
    const coreGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr('#ff6a1a', 0.7), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); coreGlow.scale.set(0.28, 0.28, 1); core.add(coreGlow);
    // marteau monolithe : manche de fer, tête de basalte cerclée de magma
    const ham = new T.Group();
    const shaftM = triMat({ set: 'hull', world: false, scale: 6, color: '#3a3d44', metal: 0.95, rough: 0.45, bump: 0.02 });
    const shaft = new T.Mesh(new T.CylinderGeometry(0.02, 0.024, 0.95, 10), shaftM); shaft.position.y = 0.3; ham.add(shaft);
    for (const y of [0.05, 0.2, 0.62]) { const w = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.035, 10), shaftM); w.position.y = y; ham.add(w); }
    const head = new T.Group(); head.position.y = 0.82; ham.add(head);
    const drum = new T.Mesh(new T.CylinderGeometry(0.13, 0.15, 0.46, 8), rock); drum.rotation.z = PI / 2; drum.castShadow = true; head.add(drum);
    for (const x of [-0.17, 0.17]) { const cap = new T.Mesh(new T.CylinderGeometry(0.155, 0.11, 0.06, 8), basalt); cap.rotation.z = PI / 2; cap.position.x = x * 1.4; head.add(cap); }
    for (const x of [-0.1, 0.1]) { const band = new T.Mesh(new T.TorusGeometry(0.145, 0.012, 6, 24), seam); band.rotation.y = PI / 2; band.position.x = x; head.add(band); }
    const heart = new T.Mesh(new T.IcosahedronGeometry(0.04, 1), coreMat(rig.col, 2.5)); heart.position.z = 0.13; head.add(heart);
    for (let k = 0; k < 3; k++) { const sp = new T.Mesh(new T.ConeGeometry(0.03, 0.12, 5), basalt); sp.position.set((k - 1) * 0.13, 0.15, 0); head.add(sp); }
    attach(sk, 'RightHand', handDown(ham, true)); rig.hammer = ham; rig.hammerHead = head;
    rig.trimK = 2.6;
    rig.glowS.position.set(0, 5.6, 0.9); rig.glowS.scale.set(5, 5, 1); rig.orbY = 13; rig.heavy = true; rig.magma = true;
    return rig;
  }
  function buildTwin(kind) {
    const sun = kind === 'sun';
    const rig = colossusRig(sun ? ['#ffcf5a', '#ffa83a'] : ['#9fd0ff', '#c9a8ff'], 3.9,
      sun ? { set: 'hull', color: '#e3b24f', metal: 1, rough: 0.26, scale: 2.4, bump: 0.025, line: '#ffd27a', lineI: 2, albedoMix: 0.3, env: 1.4 }
        : { set: 'hull', color: '#c3d2ec', metal: 1, rough: 0.18, scale: 2.4, bump: 0.025, line: '#a8dcff', lineI: 2, albedoMix: 0.3, env: 1.4 },
      sun ? { set: 'hull', color: '#3a2a10', metal: 0.9, rough: 0.3, scale: 2.4, bump: 0.01, line: '#ffcf5a', lineI: 4, rim: '#ffb84a', rimI: 1.2 }
        : { set: 'hull', color: '#1a2436', metal: 0.9, rough: 0.3, scale: 2.4, bump: 0.01, line: '#9fd0ff', lineI: 4, rim: '#8fc8ff', rimI: 1.2 });
    const sk = rig.skel; if (!sk) return rig;
    // silhouette élancée (avant les parures) : cou allongé, tête et bras affinés
    for (const [n, k] of Object.entries({ Neck: 1.18, Head: 0.92, LeftArm: 0.94, RightArm: 0.94 })) { const bn = bone(sk, n); if (bn) bn.scale.multiplyScalar(k); }
    const halo = haloRing(rig.col, 0.22, sun ? 16 : 6, !sun); halo.position.set(0, 0.1, -0.12); attach(sk, 'Head', halo); rig.halo = halo;
    const robe = new T.Mesh(new T.ConeGeometry(1.5, 4.8, 40, 1, true), robeMat(rig.col)); robe.position.y = 2.0; rig.body.add(robe);
    const trim = glowMat(sun ? '#ffcf5a' : '#9fd0ff', 5);
    const armor = triMat({ set: 'hull', world: false, scale: 4, color: sun ? '#c99a3f' : '#aebcd6', metal: 1, rough: 0.25, bump: 0.03, env: 1.3 });
    for (const sd of [1, -1]) { const p = pauldron(armor, trim, 0.1); p.position.set(0.16 * sd, 0.14, -0.01); p.rotation.z = -0.55 * sd; attach(sk, 'Spine2', p); }
    const core = new T.Mesh(new T.IcosahedronGeometry(0.06, 3), coreMat(rig.col, 5)); core.position.set(0, 0.04, 0.1); attach(sk, 'Spine2', core); rig.core = core;
    const hand = new T.Mesh(new T.IcosahedronGeometry(0.045, 2), glowMat(sun ? '#ffd27a' : '#bfe6ff', 8)); attach(sk, 'RightHand', hand);
    // jupe d'armure à lamelles + cape
    const skirt = new T.Group();
    for (let k = 0; k < 10; k++) { const a = k / 10 * PI * 2; const pl = new T.Mesh(new T.BoxGeometry(0.075, 0.42, 0.012), armor); pl.position.set(Math.sin(a) * 0.15, -0.2, Math.cos(a) * 0.13); pl.rotation.set(Math.cos(a) * 0.32, a, -Math.sin(a) * 0.32); pl.castShadow = true; skirt.add(pl);
      const tr = new T.Mesh(new T.BoxGeometry(0.076, 0.012, 0.014), trim); tr.position.set(Math.sin(a) * 0.205, -0.4, Math.cos(a) * 0.18); tr.rotation.y = a; skirt.add(tr); }
    attach(sk, 'Hips', skirt);
    const crown = new T.Group(); for (let k = 0; k < 5; k++) { const c = new T.Mesh(new T.ConeGeometry(0.012, 0.09 + (k === 2 ? 0.05 : 0), 4), trim); c.position.set((k - 2) * 0.035, 0.2, 0.03); crown.add(c); } attach(sk, 'Head', crown);
    // grand disque derrière la tête : soleil à rayons (Séla) ou croissant (Néria)
    const disc = new T.Group(); disc.position.set(0, 0.12, -0.16);
    const dm = new T.MeshBasicMaterial({ color: hdr(sun ? '#ffcf5a' : '#cfe6ff', sun ? 3 : 2.4), transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    if (sun) { disc.add(new T.Mesh(new T.RingGeometry(0.2, 0.235, 64), dm)); for (let k = 0; k < 24; k++) { const an = k / 24 * PI * 2, l = k % 2 ? 0.12 : 0.2; const ray = new T.Mesh(new T.PlaneGeometry(0.012, l), dm); ray.position.set(Math.cos(an) * (0.25 + l / 2), Math.sin(an) * (0.25 + l / 2), 0); ray.rotation.z = an - PI / 2; disc.add(ray); } }
    else { const cr = new T.Mesh(new T.RingGeometry(0.2, 0.3, 64, 1, PI * 0.15, PI * 1.25), dm); cr.rotation.z = PI * 0.2; disc.add(cr); for (let k = 0; k < 5; k++) { const st = new T.Mesh(new T.CircleGeometry(0.012, 6), dm); const an = PI * 1.55 + k * 0.22; st.position.set(Math.cos(an) * 0.36, Math.sin(an) * 0.36, 0); disc.add(st); } }
    attach(sk, 'Head', disc); rig.disc = disc;
    // sceptre : disque solaire (Séla) ou glaive en croissant (Néria)
    const staff = new T.Group();
    const pole = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.9, 8), armor); pole.position.y = 0.2; staff.add(pole);
    if (sun) { const sd = new T.Mesh(new T.CircleGeometry(0.07, 32), glowMat('#ffd27a', 6, { side: T.DoubleSide })); sd.position.y = 0.68; staff.add(sd); const sr = new T.Mesh(new T.TorusGeometry(0.085, 0.008, 6, 32), armor); sr.position.y = 0.68; staff.add(sr); }
    else { const bl = new T.Mesh(new T.TorusGeometry(0.09, 0.012, 6, 32, PI * 1.2), glowMat('#cfe6ff', 5)); bl.position.y = 0.68; bl.rotation.z = -PI * 0.1; staff.add(bl); }
    attach(sk, 'LeftHand', handDown(staff, false));
    // astres en orbite autour d'elle
    const orbit = new T.Group(); orbit.position.y = 4.2; rig.body.add(orbit); rig.shards = orbit;
    for (let k = 0; k < 6; k++) { const an = k / 6 * PI * 2, rr = 2.6 + (k % 2) * 0.4; const o2 = new T.Mesh(sun ? new T.IcosahedronGeometry(0.16, 1) : new T.OctahedronGeometry(0.16, 0), glowMat(sun ? '#ffd27a' : '#cfe6ff', 4)); o2.position.set(Math.cos(an) * rr, Math.sin(k * 1.9) * 0.5, Math.sin(an) * rr); orbit.add(o2); }
    // traîne d'énergie plus longue
    const train = new T.Mesh(new T.ConeGeometry(2.0, 6.4, 40, 1, true), robeMat(rig.col)); train.position.y = 1.6; train.rotation.y = 0.7; rig.body.add(train);
    rig.floatAmp = 0.25; rig.baseY = 0.6; rig.glowS.position.set(0, 4.6, 0.5); rig.glowS.scale.set(3.5, 3.5, 1); rig.orbY = 9; rig.levit = true;
    return rig;
  }
  function buildAzhal() {
    const rig = bossBase(['#7a5cff', '#c23bff', '#ff3b6b']);
    const b = rig.body;
    const hz = new T.Mesh(new T.SphereGeometry(2.2, 64, 32), new T.MeshBasicMaterial({ color: 0x000000 })); hz.position.y = 7; b.add(hz);
    const rim = new T.Mesh(new T.SphereGeometry(2.32, 64, 32), fresnelMat('#a07bff', 3.5, 6, 1)); rim.position.y = 7; b.add(rim); rig.rim = rim;
    // disque d'accrétion
    const disk = new T.Mesh(new T.RingGeometry(2.5, 8, 128, 4), SM({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, uniforms: { uTime: U.time, uCol: rig.col },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: NOISE + `uniform float uTime; uniform vec3 uCol; varying vec2 vP;
        void main(){ float r = length(vP); float a = atan(vP.y, vP.x); float t = (r-2.5)/5.5;
          float sw = fbm(vec3(cos(a - uTime*0.9/r*4.0)*r*0.9, sin(a - uTime*0.9/r*4.0)*r*0.9, t*3.0 + uTime*0.1));
          float bands = 0.5 + 0.5*sin(r*9.0 - uTime*2.0 + sw*6.0);
          vec3 hot = mix(vec3(1.0,0.95,0.85), vec3(1.0,0.55,0.25), smoothstep(0.0,0.35,t));
          vec3 c = mix(hot, uCol*1.4, smoothstep(0.25,0.9,t));
          float doppler = 0.6 + 0.8*smoothstep(-1.0,1.0,cos(a));
          float al = pow(1.0-t, 1.6) * smoothstep(0.0,0.04,t) * (0.35 + 0.65*sw) * (0.6+0.4*bands);
          gl_FragColor = vec4(c*al*doppler*5.0, al); }`,
    })); disk.position.y = 7; disk.rotation.x = -PI / 2 + 0.32; b.add(disk); rig.disk = disk;
    const photon = new T.Sprite(new T.SpriteMaterial({ map: ringTexC, color: hdr('#ffd9b0', 5), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); photon.position.y = 7; photon.scale.set(5.6, 5.6, 1); b.add(photon);
    // tentacules
    const tmat = triMat({ set: 'hull', world: false, scale: 1.2, color: '#14111c', metal: 1, rough: 0.22, bump: 0.03, line: '#9b6bff', lineI: 7, rim: '#7a5cff', rimI: 2, env: 1.2 });
    rig.tentacles = [];
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * PI * 2 + 0.35, len = 0.75 + ((k * 37) % 10) / 22, curl = (k % 2 ? 1 : -1) * (0.5 + (k % 3) * 0.25);
      const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; const rr = 1.6 + t * 7 * len; const tw = a + curl * t * t * 0.9; let y = 6.0 - t * 5.6 * len + Math.sin(t * PI) * 1.8; if (t > 0.78) y += (t - 0.78) * 9 * len; pts.push(new T.Vector3(Math.cos(tw) * rr, Math.max(0.35, y), Math.sin(tw) * rr)); }
      const curve = new T.CatmullRomCurve3(pts);
      const geo = new T.TubeGeometry(curve, 48, 0.5, 12, false);
      // effilement
      const p = geo.attributes.position, c0 = new T.Vector3();
      for (let i = 0; i < p.count; i++) { const seg = Math.floor(i / 13) / 48; const pt = curve.getPoint(seg); c0.set(p.getX(i), p.getY(i), p.getZ(i)).sub(pt).multiplyScalar((1 - seg * 0.9) * (1 + 0.12 * Math.sin(seg * 40))).add(pt); p.setXYZ(i, c0.x, c0.y, c0.z); }
      geo.computeVertexNormals();
      const m = new T.Mesh(geo, tmat); m.castShadow = true; b.add(m); rig.tentacles.push({ m, a, ph: k * 0.9 });
    }
    rig.mats.push(tmat);
    // débris en orbite
    const rockM = triMat({ set: 'rock', world: false, scale: 1.5, color: '#9a8fa8', metal: 0.2, rough: 0.8, bump: 0.08, line: '#b07bff', lineI: 4 });
    const shards = new T.Group(); shards.position.y = 7; b.add(shards); rig.shards = shards;
    for (let k = 0; k < 14; k++) { const a = k / 14 * PI * 2, rr = 5 + (k % 3) * 1.4; const s = new T.Mesh(rockGeo(k, 1), rockM); s.scale.setScalar(0.25 + (k % 4) * 0.12); s.position.set(Math.cos(a) * rr, Math.sin(k * 2.3) * 1.2, Math.sin(a) * rr); s.castShadow = true; shards.add(s); }
    // l'œil au fond de l'horizon : iris de lumière tourné vers sa proie
    const eye = new T.Group(); eye.position.set(0, 7, 2.05); b.add(eye); rig.eye = eye;
    eye.add(new T.Mesh(new T.RingGeometry(0.55, 0.95, 48), glowMat('#ff5ac8', 3.5, { side: T.DoubleSide })));
    eye.add(new T.Mesh(new T.RingGeometry(0.95, 1.05, 48), glowMat('#ffd9f0', 4, { side: T.DoubleSide })));
    const pupil = new T.Mesh(new T.CircleGeometry(0.42, 32), new T.MeshBasicMaterial({ color: 0x000000, side: T.DoubleSide })); pupil.position.z = 0.01; eye.add(pupil); rig.pupil = pupil;
    rig.glowS.position.set(0, 7, 0); rig.glowS.scale.set(16, 16, 1);
    rig.baseY = 0; rig.floatAmp = 0.35; rig.orbY = 12.5; rig.height = 9; rig.azhal = true;
    return rig;
  }
  function buildRigs(model) {
    if (model === 'twins') return [buildTwin('sun'), buildTwin('moon')];
    if (model === 'vorr') return [buildVorr()];
    if (model === 'azhal') return [buildAzhal()];
    return [buildNyxar()];
  }
  function disposeRigs(list) { for (const r of list) { scene.remove(r.root); if (r.anim) r.anim.mixer.stopAllAction(); } }
  function showBoss(model) {
    if (S || !ready || (lab && lab.cfg.noBoss)) { if (!ready) previewModel = null; return; }
    setArena(model); resetForge(); resetHorizon();
    if (previewModel === model && previewRigs.length) return;
    disposeRigs(previewRigs); previewRigs = []; previewModel = model;
    previewRigs = buildRigs(model); previewRigs.forEach(bossInit);
    if (previewRigs.length === 2) { previewRigs[0].root.position.set(-4.2, 0, 0); previewRigs[1].root.position.set(4.2, 0, 0); previewRigs[0].root.rotation.y = 0.35; previewRigs[1].root.rotation.y = -0.35; }
  }

  // ---------- adds ----------
  function buildAdd(a) {
    const g = new T.Group(); let body, orbit = null, tether = null, anim = null;
    if (a.type === 'orb') {
      body = new T.Mesh(new T.SphereGeometry(0.95, 40, 24), new T.MeshStandardMaterial({ color: 0x050308, metalness: 1, roughness: 0.06, envMapIntensity: 1.6 })); g.add(body);
      g.add(new T.Mesh(new T.SphereGeometry(1.08, 40, 24), fresnelMat('#a07bff', 2.2, 4, 1)));
      const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr('#7a5cff', 1.5), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); sp.scale.set(4.5, 4.5, 1); g.add(sp);
      g.position.set(a.pos.x, 1.7, a.pos.z);
    } else if (a.type === 'guardian' && A.colossus) {
      const sk = cloneSkinned(A.colossus);
      const bm = triMat({ set: 'hull', skinning: true, color: '#2a1f40', metal: 0.7, rough: 0.2, scale: 2.4, bump: 0.03, line: '#ff6bd9', lineI: 3, rim: '#ff5ccf', rimI: 2 });
      const jm = triMat({ set: 'hull', skinning: true, color: '#3a1030', metal: 0.4, rough: 0.2, scale: 2.4, bump: 0, line: '#ff6bd9', lineI: 8 });
      sk.traverse(o => { if (o.isMesh) { o.material = o.name.includes('Joints') ? jm : bm; o.castShadow = true; o.frustumCulled = false; } });
      sk.scale.setScalar(2.8); g.add(sk); body = sk;
      const crys = new T.MeshStandardMaterial({ color: 0xff8fe0, emissive: hdr('#ff5ccf', 2.5), metalness: 0.2, roughness: 0.1 });
      const cl = new T.Group(); for (let k = 0; k < 5; k++) { const c = new T.Mesh(new T.OctahedronGeometry(0.05, 0), crys); c.scale.set(0.6, 2.4, 0.6); c.position.set((k - 2) * 0.05, 0.1 + (k % 2) * 0.04, -0.1); c.rotation.z = (k - 2) * 0.3; cl.add(c); }
      attach(sk, 'Spine2', cl);
      anim = makeMixer(sk, A.colossus.animations, { idle: 'idle', walk: 'walk' });
      g.position.set(a.pos.x, 0, a.pos.z);
      const ring = new T.Mesh(new T.RingGeometry(1.4, 1.55, 40), new T.MeshBasicMaterial({ color: hdr('#ff5ccf', 3), transparent: true, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending })); ring.rotation.x = -PI / 2; ring.position.y = 0.04; g.add(ring);
    } else {
      body = new T.Mesh(new T.OctahedronGeometry(0.75, 0), new T.MeshStandardMaterial({ color: 0xff8fe0, emissive: hdr('#ff4fc8', 1.6), metalness: 0.15, roughness: 0.06, transparent: true, opacity: 0.92 }));
      body.scale.set(0.8, 1.8, 0.8); g.add(body);
      g.add(new T.Mesh(new T.OctahedronGeometry(0.3, 0), glowMat('#ffd0f4', 6)));
      orbit = new T.Group(); g.add(orbit);
      for (let k = 0; k < 3; k++) { const s = new T.Mesh(new T.TetrahedronGeometry(0.2, 0), glowMat('#ff8fe0', 4)); const an = k / 3 * PI * 2; s.position.set(Math.cos(an) * 1.1, 0, Math.sin(an) * 1.1); orbit.add(s); }
      g.position.set(a.pos.x, 3.0, a.pos.z);
      tether = makeBeam('#ff5ccf', 0.25, 3);
    }
    scene.add(g);
    emit(a.pos.x, 2, a.pos.z, 50, a.type === 'orb' ? '#a07bff' : '#ff63d2', { speed: 5, life: 0.8, size: 0.4 });
    return { g, orbit, body, tether, a, die: 0, anim };
  }

  // ---------- combat ----------
  function clearFight() {
    for (const m of raidM) disposeRaider(m);
    raidM = []; clearChars();
    for (const [, a] of addM) { scene.remove(a.g); if (a.tether) scene.remove(a.tether); } addM.clear();
    for (const [, z] of zoneM) scene.remove(z); zoneM.clear();
    for (const [, z] of markM) scene.remove(z); markM.clear();
    for (const f of fx) if (f.obj) scene.remove(f.obj); fx.length = 0;
    disposeRigs(rigs); rigs = [];
    if (L.tankBeams) L.tankBeams.forEach(b => b.visible = false);
    if (L.twinBeam) L.twinBeam.visible = false;
    eclipseLvl = 0; U.eclipse.value = 0;
    for (const m of pathPool) m.visible = false; for (const m of wpPool) m.visible = false;
    if (enemyRing) { enemyRing.visible = false; healRing.visible = false; placeRing.visible = false; }
    for (const [, t] of turretM) scene.remove(t); turretM.clear();
    UISet = new Set(); UIenemy = null;
  }
  function bindFight(state) {
    clearFight(); disposeRigs(previewRigs); previewRigs = []; previewModel = null;
    S = state; me = S.me;
    setArena(S.B.model); resetForge(); resetHorizon();
    rigs = buildRigs(S.B.model); rigs.forEach(bossInit);
    rigs.forEach((rg, k) => { const b = S.bodies[k]; rg.root.position.set(b.pos.x, 0, b.pos.z); });
    raidM = S.raiders.map(buildRaider);
    if (!L.tankBeams) L.tankBeams = [makeBeam('#ff5a5a', 0.08, 2.5), makeBeam('#ff5a5a', 0.08, 2.5)];
    if (!L.twinBeam) L.twinBeam = makeBeam('#ffe9b0', 1.4, 5);
  }
  function unbind() { clearFight(); S = null; }
  function decal(color, style, radius, geo, k) {
    const m = new T.Mesh(geo || new T.CircleGeometry(1, 64), decalMat(color, style, k));
    m.rotation.x = -PI / 2; m.scale.set(radius, radius, 1); m.position.y = 0.06; m.renderOrder = 2; scene.add(m); return m;
  }
  function burstRing(x, z, r, color, dur) {
    const m = decal(color, 2, r, null, 3); m.position.set(x, 0.08, z);
    fx.push({ obj: m, t: 0, dur: dur || 0.7, upd(f, k) { m.material.uniforms.uProg.value = k; m.material.uniforms.uAlpha.value = 0.9 * (1 - k); } });
  }
  function pillar(x, z, color, dur, h) {
    const m = new T.Mesh(new T.CylinderGeometry(0.6, 0.9, h || 14, 24, 1, true), fresnelMat(color, 0.8, 4, 1, T.DoubleSide));
    m.position.set(x, (h || 14) / 2, z); scene.add(m);
    fx.push({ obj: m, t: 0, dur: dur || 1.2, upd(f, k) { m.material.uniforms.uOp.value = 1 - k; m.scale.x = m.scale.z = 1 + k * 0.6; } });
  }
  function raidPos(i, y) { const m = raidM[i]; return m ? new T.Vector3(m.root.position.x, y ?? 1.4, m.root.position.z) : new T.Vector3(); }
  function muzzlePos(i) { const m = raidM[i]; if (m && m.wObj) return tipPos(m); return raidPos(i, 1.5); }
  function bodyPoint(k) { const rg = rigs[k] || rigs[0]; if (!rg) return new T.Vector3(0, 4, 0); const p = rg.root.position; const h = rg.height || 8; return new T.Vector3(p.x + (Math.random() - 0.5) * 1.6, rg.body.position.y + h * (0.35 + Math.random() * 0.4), p.z + (Math.random() - 0.5) * 1.6); }
  function nearestRig(x, z) { let best = 0, bd = 1e9; rigs.forEach((r, k) => { const d = Math.hypot(r.root.position.x - x, r.root.position.z - z); if (d < bd) { bd = d; best = k; } }); return best; }
  const HEALCOL = { aube: '#ffe39a', nanochir: '#9dff8a' };

  function handleEvents(events) {
    for (const e of events) {
      if (S) charEvent(e);
      switch (e.type) {
        case 'cast': {
          const rg = rigs[e.body] || rigs[0]; if (!rg) break;
          if (e.kind === 'buster') bossPlay(rg, 'bWind', { dur: e.dur });
          if (e.kind === 'raidcast') { rg.charge = { t: 0, dur: e.dur }; bossPlay(rg, 'bCharge', { dur: e.dur }); }
          if (e.kind === 'frontal') {
            const geo = new T.CircleGeometry(1, 48, PI / 2 - e.angle * PI / 180, 2 * e.angle * PI / 180);
            const m = decal('#ff6a2a', 0, e.range, geo, 2.6);
            m.rotation.set(-PI / 2, 0, e.facing - PI); m.position.set(e.x, 0.07, e.z);
            fx.push({ obj: m, t: 0, dur: e.dur, upd(f, k) { m.material.uniforms.uProg.value = k; m.material.uniforms.uAlpha.value = 1.2; } });
            bossPlay(rg, 'bSweepWind', { dur: e.dur });
          }
          break;
        }
        case 'interrupt': {
          const rg = rigs[nearestRig(e.x, e.z)];
          if (rg) { rg.charge = null; rg.act = null; bossPlay(rg, 'bStagger'); const o = rg.orb.getWorldPosition(new T.Vector3()); emit(o.x, o.y, o.z, 80, '#8ff0ff', { speed: 9, life: 0.8, size: 0.45, grav: -2 }); rg.orb.scale.setScalar(0.001); if (e.by >= 0 && raidM[e.by]) tracer(muzzlePos(e.by), o, '#8ff0ff', 0.18, 2.2); flash(o.x, o.y, o.z, '#8ff0ff', 6); }
          break;
        }
        case 'raidHit': {
          for (const rg of rigs) { rg.charge = null; rg.orb.scale.setScalar(0.001); bossPlay(rg, 'bRelease'); }
          burstRing(0, 0, 24, '#8a7bff', 1.1);
          for (const m of raidM) if (m.r.alive) emit(m.root.position.x, 1.2, m.root.position.z, 5, '#c08bff', { speed: 3, life: 0.6, size: 0.3 });
          cam.shake = Math.max(cam.shake, 0.7); flashLvl = Math.max(flashLvl, 0.25);
          break;
        }
        case 'frontalHit': {
          const b = S.bodies[e.body]; if (rigs[e.body]) bossPlay(rigs[e.body], 'bSweep');
          for (let k = 0; k < 60; k++) { const a = e.facing + (Math.random() - 0.5) * 2 * e.angle * PI / 180, d = Math.random() * e.range; emit(b.pos.x + Math.sin(a) * d, 0.4, b.pos.z + Math.cos(a) * d, 1, '#ff8a3c', { speed: 2, life: 0.7, size: 0.5, vy: 3 }); }
          flash(b.pos.x + Math.sin(e.facing) * 4, 1.5, b.pos.z + Math.cos(e.facing) * 4, '#ff7a3a', 10, 0.5);
          cam.shake = Math.max(cam.shake, 0.6);
          break;
        }
        case 'busterHit': {
          if (rigs[e.body] && rigs[e.body].tentacles) rigs[e.body].lash = 1;
          const p = raidPos(e.i, 1.3); if (rigs[e.body]) bossPlay(rigs[e.body], 'bSlam');
          emit(p.x, p.y, p.z, 30 + e.stacks * 14, e.stacks >= 3 ? '#ff4d4d' : '#ffb27a', { speed: 7, life: 0.6, size: 0.4 });
          burstRing(p.x, p.z, 2.5 + e.stacks, '#ff5a3c', 0.5); flash(p.x, 1.5, p.z, '#ff8a4a', 8);
          cam.shake = Math.max(cam.shake, 0.3 + e.stacks * 0.12);
          break;
        }
        case 'markExplode': burstRing(e.x, e.z, e.r, '#c46bff', 0.65); emit(e.x, 1.2, e.z, 50, '#d08bff', { speed: 8, life: 0.7, size: 0.45, flat: true }); flash(e.x, 1.2, e.z, '#c46bff', 7); cam.shake = Math.max(cam.shake, 0.3); break;
        case 'dotExplode': burstRing(e.x, e.z, e.r, '#7dff9c', 0.6); emit(e.x, 1.2, e.z, 35, '#7a5cff', { speed: 7, life: 0.6, size: 0.4 }); break;
        case 'soakHit': burstRing(e.x, e.z, e.r * 1.6, '#ffc35a', 0.8); emit(e.x, 0.5, e.z, 90, '#ffd27a', { speed: 4, life: 1.0, size: 0.5, vy: 8, grav: -9 }); flash(e.x, 2, e.z, '#ffc35a', 12, 0.6); cam.shake = Math.max(cam.shake, e.n < 4 ? 0.8 : 0.35); break;
        case 'addDie': { const a = addM.get(e.id); if (a) { a.die = 0.001; const p = a.g.position; emit(p.x, p.y + 1, p.z, 60, a.a.type === 'orb' ? '#a07bff' : '#ff7ce0', { speed: 8, life: 0.8, size: 0.45 }); flash(p.x, p.y + 1, p.z, '#ff7ce0', 6); } break; }
        case 'addExplode': burstRing(e.x, e.z, 10, '#ff5ccf', 0.8); emit(e.x, 3, e.z, 80, '#ff5ccf', { speed: 12, life: 0.9, size: 0.5 }); flash(e.x, 3, e.z, '#ff5ccf', 12); cam.shake = Math.max(cam.shake, 0.6); break;
        case 'orbExplode': burstRing(e.x, e.z, 6, '#a07bff', 0.7); emit(e.x, 1.5, e.z, 90, '#b79bff', { speed: 10, life: 0.9, size: 0.55 }); flash(e.x, 1.5, e.z, '#a07bff', 12); cam.shake = Math.max(cam.shake, 0.6); break;
        case 'shard': { const a = addM.get(e.from); if (a) tracer(a.g.position.clone(), raidPos(e.i), '#ff7ce0', 0.5, 1.8); break; }
        case 'death': { const p = raidPos(e.i, 1); emit(p.x, p.y, p.z, 25, '#8a90a8', { speed: 3, life: 1.0, size: 0.35, vy: 1.5, grav: 0.5, k: 1.5 }); break; }
        case 'rez': { const p = raidPos(e.i); pillar(p.x, p.z, '#9ff7d6', 1.6); emit(p.x, 0.3, p.z, 60, '#bfffe6', { speed: 2, life: 1.4, size: 0.35, vy: 6, grav: 0 }); flash(p.x, 2, p.z, '#9ff7d6', 8, 0.8); const m = raidM[e.i]; if (m) m.dead = 0; break; }
        case 'taunt': { const p = raidPos(e.i); burstRing(p.x, p.z, 3, '#5aa9ff', 0.5); emit(p.x, 2, p.z, 20, '#8fc8ff', { speed: 4, life: 0.5, size: 0.3 }); break; }
        case 'shout': burstRing(e.x, e.z, e.r, '#5aa9ff', 0.6); break;
        case 'surcharge':
          for (const m of raidM) if (m.r.alive) { pillar(m.root.position.x, m.root.position.z, '#ffcf6a', 1.4, 6); emit(m.root.position.x, 0.5, m.root.position.z, 14, '#ffd98a', { speed: 2, life: 1.2, size: 0.35, vy: 5, grav: 0 }); }
          fx.push({ t: 0, dur: 30, upd() { if (Math.random() < 0.3) { const m = raidM[Math.floor(Math.random() * raidM.length)]; if (m && m.r.alive) emit(m.root.position.x, 0.3, m.root.position.z, 1, '#ffcf6a', { speed: 0.5, life: 1, size: 0.3, vy: 3, grav: 0 }); } } });
          break;
        case 'spell': spellFx(e); break;
        case 'turretShot': { const tm = turretM.get(e.id); const from = tm ? tm.userData.tip.getWorldPosition(new T.Vector3()) : new T.Vector3(e.x, 1.1, e.z); const to = new T.Vector3(e.tx, e.add ? 1.6 : 3 + Math.random() * 2, e.tz); tracer(from, to, '#ffb060', 0.09, 1.6); emit(to.x, to.y, to.z, 6, '#ffb060', { speed: 4, life: 0.25, size: 0.25 }); if (tm) tm.userData.head.rotation.y = Math.atan2(e.tx - e.x, e.tz - e.z); break; }
        case 'turretEnd': { const tm = turretM.get(e.id); if (tm) { emit(tm.position.x, 0.8, tm.position.z, 30, '#ff9f43', { speed: 4, life: 0.6, size: 0.35 }); scene.remove(tm); turretM.delete(e.id); } break; }
        case 'nanites': fx.push({ t: 0, dur: 6, upd() { for (const m of raidM) if (m.r.alive && Math.random() < 0.4) emit(m.root.position.x, 0.4, m.root.position.z, 1, '#7dff9c', { speed: 1, life: 1.2, size: 0.28, vy: 2.5, grav: 0, spread: 1.4 }); } }); break;
        case 'aurore': for (const m of raidM) if (m.r.alive) emit(m.root.position.x, 2.6, m.root.position.z, 4, '#ffe39a', { speed: 1, life: 0.9, size: 0.35, vy: -1, grav: 0 }); break;
        case 'eclipse': fx.push({ t: 0, dur: 8, upd(f, k) { eclipseLvl = k < 0.1 ? k / 0.1 : k > 0.85 ? (1 - k) / 0.15 : 1; }, done() { eclipseLvl = 0; } }); break;
        case 'fissures': {
          const rg = rigs[e.body] || rigs[0]; if (rg) bossPlay(rg, 'bSlam');
          const b = S.bodies[e.body] || S.bodies[0];
          burstRing(b.pos.x, b.pos.z, 7, '#ff7a2a', 0.6); emit(b.pos.x, 0.4, b.pos.z, 50, '#ff9a4a', { speed: 6, life: 0.8, size: 0.45, vy: 5, grav: -9 });
          flash(b.pos.x, 1.5, b.pos.z, '#ff7a2a', 10, 0.5); cam.shake = Math.max(cam.shake, 0.55);
          break;
        }
        case 'half': { const rg = rigs[e.body]; if (rg) bossPlay(rg, 'bCharge', { dur: e.warn }); break; }
        case 'collapse': if (arenaName === 'forge') { L.collapse = { t: 0, delay: e.delay || 4 }; cam.shake = Math.max(cam.shake, 0.9); flashLvl = Math.max(flashLvl, 0.3); } break;
        case 'phase': {
          for (const rg of rigs) { rg.rise = 1; bossPlay(rg, 'bRoar'); }
          // Vorr perd des pans d'armure
          for (const rg of rigs) if (rg.breakable) rg.breakable.forEach(c => { if (!c.visible) return; const p = c.getWorldPosition(new T.Vector3()); emit(p.x, p.y, p.z, 26, '#5a4a44', { speed: 6, life: 1.2, size: 0.6, grav: -10 }); emit(p.x, p.y, p.z, 18, '#ff7a2a', { speed: 7, life: 0.8, size: 0.4, grav: -8 }); c.visible = false; });
          cam.shake = Math.max(cam.shake, 1); flashLvl = Math.max(flashLvl, 0.4);
          const c = rigs[0] ? rigs[0].colors[Math.min(e.p, rigs[0].colors.length - 1)] : '#ff4fc8';
          const p0 = rigs[0] ? rigs[0].root.position : new T.Vector3();
          emit(p0.x, 5, p0.z, 160, c, { speed: 12, life: 1.2, size: 0.55, grav: -2 });
          burstRing(0, 0, 22, c, 1.2); flash(p0.x, 4, p0.z, c, 16, 0.9);
          break;
        }
        case 'pulse': {
          burstRing(e.x, e.z, 18, '#b18cff', 0.8);
          for (const m of raidM) if (m.r.alive) tracer(new T.Vector3(m.root.position.x, 1, m.root.position.z), new T.Vector3(e.x, 1.5, e.z), '#b18cff', 0.5, 1.2);
          cam.shake = Math.max(cam.shake, 0.4);
          break;
        }
        case 'pheal': {
          if (!raidM[e.target] || !raidM[me]) break;
          const col = HEALCOL[S.kit.id] || '#ffe39a';
          const p = raidPos(e.target, 1); emit(p.x, p.y, p.z, 12, col, { speed: 2.5, life: 0.7, size: 0.32, vy: 2, grav: 0 });
          break;
        }
        case 'paoe': burstRing(e.x, e.z, e.r, HEALCOL[S.kit.id] || '#ffe39a', 0.6); flash(e.x, 1.5, e.z, HEALCOL[S.kit.id] || '#ffe39a', 5); break;
        case 'pchain': { let prev = raidM[me] && raidM[me].drone ? raidM[me].drone.position.clone() : muzzlePos(me); for (const i of e.idx) { const p = raidPos(i, 1.4); tracer(prev, p, '#9dff8a', 0.25, 1.4); prev = p; } break; }
        case 'dispel': { const p = raidPos(e.i, 1.6); emit(p.x, p.y, p.z, 20, '#e6fff0', { speed: 4, life: 0.5, size: 0.3 }); break; }
        case 'pstrike': emit(e.x, 2.2, e.z, 12, '#9fd0ff', { speed: 5, life: 0.4, size: 0.3 }); break;
        case 'pbuff': { const p = raidPos(me); burstRing(p.x, p.z, 2.2, e.id === 'acier' ? '#ffd27a' : '#6fb6ff', 0.5); break; }
        case 'selfheal': { const p = raidPos(e.i); emit(p.x, 0.5, p.z, 30, '#76f0c6', { speed: 2, life: 1, size: 0.35, vy: 4, grav: 0 }); break; }
        case 'ange': { const p = raidPos(e.i); pillar(p.x, p.z, '#fff3c4', 1.2, 8); break; }
        case 'cancel': if (raidM[me]) { const p = raidPos(me, 2); emit(p.x, p.y, p.z, 8, '#ff9b9b', { speed: 2, life: 0.4, size: 0.25 }); } break;
        case 'nova': burstRing(0, 0, 30, '#ffffff', 1.5); emit(0, 5, 0, 220, '#ffffff', { speed: 20, life: 1.5, size: 0.6 }); cam.shake = 1.5; flashLvl = 1; break;
        case 'end': if (e.result === 'kill') { for (const rg of rigs) rg.dead = 0.001; cam.shake = 1.2; } break;
      }
    }
  }

  // ---------- mises à jour ----------
  function updateRig(rg, k, dt) {
    const b = S ? S.bodies[k] : null;
    const idx = S ? Math.min(S.phase, rg.colors.length - 1) : 0;
    tmpC.set(rg.colors[idx]).convertSRGBToLinear(); rg.col.value.lerp(tmpC, Math.min(1, dt * 2));
    rg.glowS.material.color.copy(rg.col.value).multiplyScalar(2.2);
    if (rg.halo) rg.halo.userData.mat.color.copy(rg.col.value).multiplyScalar(5);
    if (rg.trims) rg.trims.forEach(m => m.color.copy(rg.col.value).multiplyScalar(rg.trimK || 5));
    for (const m of rg.mats) if (m.userData.u && m.userData.lineI) m.userData.u.uLine.value.copy(rg.col.value).multiplyScalar(m.userData.lineI);
    let moving = false;
    if (b) {
      const ox = rg.root.position.x, oz = rg.root.position.z;
      rg.root.position.x += (b.pos.x - rg.root.position.x) * Math.min(1, dt * 10);
      rg.root.position.z += (b.pos.z - rg.root.position.z) * Math.min(1, dt * 10);
      moving = Math.hypot(rg.root.position.x - ox, rg.root.position.z - oz) > dt * 0.8;
      let d = b.facing - rg.root.rotation.y; while (d > PI) d -= PI * 2; while (d < -PI) d += PI * 2;
      if (!b.centerMove) rg.root.rotation.y += d * Math.min(1, dt * 3);
      if (rg.heavy && moving && Math.random() < dt * 3) emit(rg.root.position.x + (Math.random() - 0.5) * 3, 0.2, rg.root.position.z + (Math.random() - 0.5) * 3, 6, '#a08070', { speed: 2, life: 1, size: 0.6, vy: 1, grav: -1, k: 0.6 });
    } else rg.root.rotation.y += dt * 0.06;
    if (rg.anim) {
      playAction(rg.anim, rg.levit ? 'idle' : moving ? 'walk' : 'idle', 0.4);
      if (rg.dead > 0) rg.anim.mixer.timeScale = Math.max(0, 1 - rg.dead * 3);
      rg.anim.mixer.update(dt);
    }
    if (rg.bonesP) { if (S && rigs.includes(rg)) bossAuto(rg, k, dt); bossPose(rg, dt, k); }
    let bob = Math.sin(time * 1.1 + k) * (rg.floatAmp || 0);
    if (rg.rise > 0) rg.rise = Math.max(0, rg.rise - dt * 0.25);
    const yRise = Math.sin(rg.rise * PI) * 2;
    let deadK = 0; if (rg.dead > 0) { rg.dead = Math.min(1, rg.dead + dt * 0.3); deadK = rg.dead; }
    rg.body.position.y = rg.baseY + bob + yRise - deadK * (rg.baseY + (rg.azhal ? 4 : 0.6));
    rg.body.rotation.x = deadK * (rg.azhal ? 0.2 : 0.55);
    if (deadK > 0 && Math.random() < 0.5) { const p = rg.root.position; emit(p.x + (Math.random() - 0.5) * 4, 1 + Math.random() * 6, p.z + (Math.random() - 0.5) * 4, 2, rg.colors[0], { speed: 1, life: 1.5, size: 0.5, vy: 2, grav: 0 }); }
    if (rg.halo) rg.halo.rotation.z += dt * 0.3;
    if (rg.disc) rg.disc.rotation.z += dt * 0.12;
    if (rg.gyro) rg.gyro.rotation.z += dt * 0.8;
    if (rg.wing) rg.wing.rotation.z = Math.sin(time * 0.8) * 0.05;
    if (rg.shards) rg.shards.rotation.y += dt * (S && S.phase === S.B.phases.length - 1 ? 0.9 : 0.35);
    if (rg.disk) rg.disk.rotation.z += dt * 0.15;
    if (rg.lash) rg.lash = Math.max(0, rg.lash - dt * 1.6);
    if (rg.tentacles) rg.tentacles.forEach(t => { const l = (rg.lash || 0) * Math.sin(t.ph * 3.1) ; t.m.rotation.y = Math.sin(time * 0.7 + t.ph) * 0.12 + l * 0.25; t.m.rotation.z = Math.sin(time * 0.9 + t.ph * 1.3) * 0.05 - Math.abs(l) * 0.12; });
    if (rg.pupil) { const bl = Math.sin(time * 0.45) > 0.985 ? 0.1 : 1; rg.pupil.scale.set(1, bl, 1); rg.pupil.scale.multiplyScalar(0.8 + 0.25 * Math.sin(time * 1.7)); }
    // Vorr : fumerolles des épaules, braises du marteau
    if (rg.vents && !rg.dead && Math.random() < dt * 7) { const v = rg.vents[Math.floor(Math.random() * rg.vents.length)]; const p = v.getWorldPosition(tmpV2); emit(p.x, p.y, p.z, 1, Math.random() < 0.65 ? '#4a3c36' : '#ff7a2a', { speed: 0.4, life: 1.8, size: 0.8, vy: 2.4, grav: 0, k: 0.7 }); }
    if (rg.hammerHead && !rg.dead && Math.random() < dt * 9) { const p = rg.hammerHead.getWorldPosition(tmpV2); emit(p.x + (Math.random() - 0.5) * 1.6, p.y, p.z + (Math.random() - 0.5) * 1.6, 1, '#ff9a4a', { speed: 0.6, life: 0.8, size: 0.25, vy: 1.6, grav: 0 }); }
    const pulse = b && b.cast && b.cast.interruptible ? 0.6 + 0.4 * Math.sin(time * 12) : (b && b.empower ? Math.min(1, b.empower * 0.1) : 0);
    if (rg.core && rg.core.material.uniforms) rg.core.material.uniforms.uPulse.value = pulse;
    for (const m of rg.mats) if (m.userData.u) m.userData.u.uPulse.value = pulse * 0.6;
    if (rg.charge) {
      rg.charge.t += dt; const kk = Math.min(1, rg.charge.t / rg.charge.dur);
      rg.orb.position.set(0, rg.orbY || 11, 0);
      rg.orb.scale.setScalar(0.3 + kk * 1.4 + Math.sin(time * 20) * 0.05);
      if (Math.random() < 0.7) { const o = rg.orb.getWorldPosition(tmpV); emit(o.x + (Math.random() - 0.5) * 9, o.y + (Math.random() - 0.5) * 7, o.z + (Math.random() - 0.5) * 9, 1, '#8ff0ff', { speed: 0.2, life: 0.5, size: 0.3, grav: 0 }); }
      if (rg.charge.t > rg.charge.dur + 0.3) { rg.charge = null; rg.orb.scale.setScalar(0.001); }
    }
  }
  function update(dt) {
    time += dt; U.time.value = time;
    const lead = rigs[0] || previewRigs[0];
    if (lead) { phaseCol.copy(lead.col.value); U.phase.value.copy(phaseCol); L.boss.color.copy(phaseCol); }
    U.eclipse.value += (eclipseLvl - U.eclipse.value) * Math.min(1, dt * 3);
    L.key.intensity = (L.keyBase || 2.6) * (1 - U.eclipse.value * 0.75);
    if (arenaName === 'forge') updateForge(dt);
    if (arenaName === 'observatory') updateObservatory(dt);
    if (arenaName === 'horizon') updateHorizon(dt);
    if (L.planet) L.planet.rotation.y += dt * 0.004;
    if (L.ast) { const m4 = new T.Matrix4(), q4 = new T.Quaternion(), e3 = new T.Euler(), s3 = new T.Vector3(); L.ast.forEach(a => { a.a += a.w * dt; a.rx += dt * 0.15; a.ry += dt * 0.1; e3.set(a.rx, a.ry, 0); q4.setFromEuler(e3); s3.setScalar(a.s); m4.compose(tmpV.set(Math.cos(a.a) * a.r, a.y, Math.sin(a.a) * a.r), q4, s3); a.m.setMatrixAt(a.i, m4); }); L.astMesh.forEach(m => { m.instanceMatrix.needsUpdate = true; }); }
    if (L.crystals) L.crystals.forEach((c, k) => { c.position.y = 11 + Math.sin(time * 1.2 + k) * 0.35; c.rotation.y += dt * 0.8; });
    if (L.gyros && L.arenaDefault.visible) L.gyros.forEach(o => { o.ring.rotation.y += o.w * dt; });
    if (L.towers) L.towers.forEach(o => { if (o.isSprite) o.material.opacity = 0.4 + 0.6 * (Math.sin(time * 2 + o.userData.ph) > 0.6 ? 1 : 0.2); });
    if (L.ships) L.ships.forEach(s => { s.userData.a += s.userData.w * dt; const a = s.userData.a; s.position.set(Math.cos(a) * s.userData.r, s.userData.y, Math.sin(a) * s.userData.r); s.rotation.y = -a + (s.userData.w > 0 ? 0 : PI); });
    if (L.core) L.core.rotation.y += dt * 0.6;
    if (L.dust) L.dust.rotation.y += dt * 0.01;
    if (L.moveMark.material.opacity > 0) { L.moveMark.material.opacity = Math.max(0, L.moveMark.material.opacity - dt * 1.5); L.moveMark.scale.setScalar(Math.max(0.6, L.moveMark.scale.x - dt * 2)); }
    previewRigs.forEach((rg, k) => updateRig(rg, k, dt));
    rigs.forEach((rg, k) => updateRig(rg, k, dt));
    if (lead) { L.boss.position.set(lead.root.position.x, lead.body.position.y + (lead.height || 8) * 0.6, lead.root.position.z); L.boss.intensity = 3 + Math.sin(time * 2) * 0.6; }
    if (S) updateFight(dt);
    if (lab) labUpdate(dt);
    updateCharFx(dt);
    for (let k = fx.length - 1; k >= 0; k--) {
      const f = fx[k]; f.t += dt; const kk = Math.min(1, f.t / f.dur);
      f.upd && f.upd(f, kk);
      if (kk >= 1) { if (f.obj) { scene.remove(f.obj); if (f.obj.geometry) f.obj.geometry.dispose(); } f.done && f.done(); fx.splice(k, 1); }
    }
    updateTracers(dt); updateParticles(dt); updateFlashes(dt); updateCamera(dt);
    flashLvl = Math.max(0, flashLvl - dt * 2.5);
    if (finalPass) { finalPass.uniforms.uTime.value = time; finalPass.uniforms.uFlash.value = flashLvl * 0.6; }
    if (composer) composer.render(); else renderer.render(scene, camera);
    adaptQuality(dt);
  }

  // ---------- fissures de magma ----------
  // la ligne se dessine depuis le boss, palpite de plus en plus vite, puis entre en éruption sur toute sa largeur
  function fissureMat() {
    return SM({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      uniforms: { uTime: U.time, uGrow: { value: 0 }, uProg: { value: 0 }, uArmed: { value: 0 }, uSeed: { value: Math.random() * 10 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: NOISE3 + `uniform float uTime; uniform float uGrow; uniform float uProg; uniform float uArmed; uniform float uSeed; varying vec2 vUv;
        void main(){ float x = vUv.x; if (x > uGrow) discard;
          float off = (noise(vec3(x*12.0, uSeed, 0.0)) - 0.5)*0.5 + (noise(vec3(x*38.0, uSeed + 3.0, 0.0)) - 0.5)*0.16;
          float y = vUv.y - 0.5 - off*0.5;
          float core = exp(-y*y*700.0);
          float ay = abs(vUv.y - 0.5);
          float band = 1.0 - smoothstep(0.40, 0.5, ay);
          float edge = 1.0 - smoothstep(0.0, 0.035, abs(ay - 0.46));
          float warn = 0.5 + 0.5*sin(uTime*(5.0 + uProg*16.0));
          float a = core*(0.8 + uProg*1.4) + band*0.16*(0.5 + uProg) + edge*0.9*warn;
          if (uArmed > 0.5) { float fl = fbm3(vec3(x*9.0 - uTime*4.0, vUv.y*5.0, uTime*2.5)); a = band*(0.25 + 0.65*smoothstep(0.35, 0.8, fl)) + core*1.4; }
          a *= smoothstep(uGrow, uGrow - 0.03, x) * smoothstep(0.0, 0.03, x);
          vec3 c = uArmed > 0.5 ? mix(vec3(1.0,0.30,0.05), vec3(1.0,0.62,0.22), clamp(core + 0.2, 0.0, 1.0)) : mix(vec3(1.0,0.78,0.30), vec3(1.0,0.9,0.6), core);
          gl_FragColor = vec4(c*a*1.5, a); }`,
    });
  }
  function updateFissure(z, m) {
    // le tracé s'arrête au bord de la plateforme
    let dx = z.x2 - z.x, dz = z.z2 - z.z, len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len, pb = z.x * ux + z.z * uz, edge = -pb + Math.sqrt(Math.max(0, pb * pb - (z.x * z.x + z.z * z.z - 21.5 * 21.5)));
    if (edge > 1 && edge < len) { len = edge; dx = ux * len; dz = uz * len; }
    if (!m) {
      const geo = new T.PlaneGeometry(len, z.w); geo.rotateX(-PI / 2);
      m = new T.Mesh(geo, fissureMat()); m.position.set((z.x + z.x2) / 2, 0.075, (z.z + z.z2) / 2); m.rotation.y = Math.atan2(-dz, dx); m.renderOrder = 3;
      scene.add(m); zoneM.set(z.id, m);
    }
    const u = m.material.uniforms, armed = S.t >= z.armAt;
    u.uGrow.value = Math.min(1, (S.t - z.born) / 0.35);
    u.uProg.value = Math.min(1, (S.t - z.born) / Math.max(0.1, z.armAt - z.born));
    u.uArmed.value = armed ? 1 : 0;
    if (armed && !m.userData.erupted) {
      m.userData.erupted = true;
      for (let k = 0; k <= 9; k++) { const f = k / 9, x = z.x + dx * f, zz = z.z + dz * f; emit(x, 0.2, zz, 7, '#ffb050', { speed: 2.5, life: 0.9, size: 0.5, vy: 11, grav: -16 }); }
      flash(z.x + dx * 0.4, 1.2, z.z + dz * 0.4, '#ff7a2a', 9, 0.5); cam.shake = Math.max(cam.shake, 0.4);
    }
    if (armed && Math.random() < 0.8) { const f = Math.random(); emit(z.x + dx * f, 0.2, z.z + dz * f, 1, Math.random() < 0.5 ? '#ff8a3a' : '#ffd080', { speed: 1, life: 0.6, size: 0.45, vy: 6, grav: -8 }); }
  }

  // ---------- Rayons du Noyau ----------
  // deux secteurs au sol pendant l'alerte, puis deux murs de lumière qui tournent depuis l'œil central
  function sweepFx(z, m) {
    if (!m) {
      m = new T.Group(); m.renderOrder = 3;
      const secMat = SM({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, uniforms: { uTime: U.time, uProg: { value: 0 }, uAlpha: { value: 1 }, uColor: { value: hdr('#c46bff', 1) } },
        vertexShader: `varying vec2 vP; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vP = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }`,
        fragmentShader: `uniform float uTime; uniform float uProg; uniform float uAlpha; uniform vec3 uColor; varying vec2 vP;
          void main(){ float d = length(vP); float hatch = step(0.5, fract(d * 0.35 - uTime * 1.2));
            float a = (0.22 + 0.35 * uProg + hatch * 0.12) * uAlpha;
            gl_FragColor = vec4(uColor * a * 1.6, a); }` });
      for (const off of [0, PI]) {
        const a0 = z.dir > 0 ? z.a0 + off : z.a0 + off - z.span;
        const sec = new T.Mesh(new T.RingGeometry(z.eye, 21, 48, 1, -a0 - z.span, z.span), secMat); sec.rotation.x = -PI / 2; sec.position.y = 0.06; m.add(sec);
      }
      m.userData.secMat = secMat;
      const wallMat = beamMat('#d79bff', 4); m.userData.walls = [];
      for (const off of [0, PI]) { const wl = new T.Mesh(new T.PlaneGeometry(21 - z.eye, 3.2), wallMat); wl.visible = false; m.add(wl); m.userData.walls.push({ wl, off }); }
      const band = new T.Mesh(new T.PlaneGeometry(2 * 21, z.w), beamMat('#c46bff', 2.5)); band.rotation.x = -PI / 2; band.position.y = 0.08; band.visible = false; m.add(band); m.userData.band = band;
      scene.add(m); zoneM.set(z.id, m);
    }
    const armed = S.t >= z.armAt, u = m.userData;
    u.secMat.uniforms.uProg.value = armed ? 1 : Math.min(1, (S.t - z.born) / Math.max(0.1, z.armAt - z.born));
    u.secMat.uniforms.uAlpha.value = armed ? 0.35 : 0.75 + 0.25 * Math.sin(time * 10);
    const b = G_sweepAngle(z);
    for (const w of u.walls) { w.wl.visible = armed; const a = b + w.off, rm = (z.eye + 21) / 2; w.wl.position.set(Math.cos(a) * rm, 1.6, Math.sin(a) * rm); w.wl.rotation.y = -a; }
    u.band.visible = armed; u.band.rotation.z = -b; 
    if (armed && Math.random() < 0.9) for (const off of [0, PI]) { const a = b + off, d = z.eye + Math.random() * (21 - z.eye); emit(Math.cos(a) * d, 0.3, Math.sin(a) * d, 1, Math.random() < 0.5 ? '#d79bff' : '#ffffff', { speed: 1.2, life: 0.5, size: 0.35, vy: 3, grav: 0 }); }
    if (armed && !u.flashed) { u.flashed = true; flash(0, 2, 0, '#c46bff', 10, 0.6); cam.shake = Math.max(cam.shake, 0.4); }
  }
  function G_sweepAngle(z) { const k = Math.max(0, Math.min(1, (S.t - z.armAt) / (z.endAt - z.armAt))); return z.a0 + z.dir * z.span * k; }

  function updateFight(dt) {
    S.bodies.forEach((b, k) => {
      const tb = L.tankBeams[k], tg = raidM[b.target], rg = rigs[k];
      if (tb && tg && rg && tg.r.alive && !S.over && !b.centerMove) setBeam(tb, new T.Vector3(rg.root.position.x, rg.body.position.y + (rg.height || 8) * 0.55, rg.root.position.z), new T.Vector3(tg.root.position.x, 1.4, tg.root.position.z), 0.22 + 0.08 * Math.sin(time * 6)); else if (tb) tb.visible = false;
    });
    if (L.tankBeams[1] && S.bodies.length < 2) L.tankBeams[1].visible = false;
    for (const m of raidM) {
      const r = m.r, g = m.root;
      g.position.x += (r.pos.x - g.position.x) * Math.min(1, dt * 12);
      g.position.z += (r.pos.z - g.position.z) * Math.min(1, dt * 12);
      const moved = Math.hypot(g.position.x - m.lastPos.x, g.position.z - m.lastPos.z);
      let face;
      if (moved > 0.01) face = Math.atan2(g.position.x - m.lastPos.x, g.position.z - m.lastPos.z);
      else {
        let tp = S.bodies.reduce((a, b) => Math.hypot(a.pos.x - g.position.x, a.pos.z - g.position.z) <= Math.hypot(b.pos.x - g.position.x, b.pos.z - g.position.z) ? a : b).pos;
        if (r.atkTarget && r.atkTarget !== 'boss') { const a = S.adds.find(q => q.id === r.atkTarget); if (a) tp = a.pos; }
        if (r.role === 'heal' && r.healTarget >= 0 && raidM[r.healTarget] && raidM[r.healTarget] !== m) tp = raidM[r.healTarget].root.position;
        face = Math.atan2(tp.x - g.position.x, tp.z - g.position.z);
      }
      let d = face - g.rotation.y; while (d > PI) d -= PI * 2; while (d < -PI) d += PI * 2;
      if (r.alive) g.rotation.y += d * Math.min(1, dt * 8);
      m.lastPos.copy(g.position);
      driveRaider(m, dt, r.moving || moved > dt * 1.5);
      m.ring.material.opacity = r.alive ? 0.85 : 0.12;
      if (m.chev) { m.chev.visible = r.alive; m.chev.position.y = 2.35 + Math.sin(time * 4) * 0.06 + (m.lift || 0); m.chev.rotation.y += dt * 2; }
      const st = Object.values(r.stacks).reduce((a, b) => Math.max(a, b.n), 0);
      m.stacks.forEach((o, k) => { o.visible = r.alive && k < Math.min(6, st); if (o.visible) { const a = time * 2.5 + k / Math.max(1, st) * PI * 2; o.position.set(Math.cos(a) * 0.45, 2.05 + Math.sin(time * 3 + k) * 0.03, Math.sin(a) * 0.45); } });
      m.markG.visible = !!(r.alive && r.mark);
      if (m.markG.visible) { const s = 1 + Math.sin(time * 10) * 0.15; m.markG.scale.set(s * 0.8, s * 0.8, 1); }
      m.debG.visible = r.alive && r.debuffs.length > 0;
      const absorbed = r.alive && r.absorb > 0 && S.t < r.absorbUntil, mit = r.alive && r.mit && r.mit.find(q => S.t < q.until);
      m.bubble.visible = !!(absorbed || mit);
      if (m.bubble.visible) { m.bubble.material.uniforms.uColor.value.copy(hdr(mit ? (mit.src === 'carapace' ? '#ff9a6a' : '#ffd27a') : '#e2c8ff', 1)); m.bubble.material.uniforms.uOp.value = 0.6 + 0.2 * Math.sin(time * 5); }
      m.sel.visible = UISet.has(r.i); m.sel.material.opacity = 0.95; if (m.sel.visible) m.sel.scale.setScalar(1 + Math.sin(time * 6) * 0.06);
      if (r.alive && S.t < r.whirlUntil) { g.rotation.y += dt * 15; if (m.trail) m.trail.on = true; }
    }
    updateGuides(dt);
    // adds
    for (const a of S.adds) if (!addM.has(a.id) && a.alive) addM.set(a.id, buildAdd(a));
    for (const [id, am] of addM) {
      const a = am.a;
      if (a.type === 'orb') { am.g.position.x += (a.pos.x - am.g.position.x) * Math.min(1, dt * 8); am.g.position.z += (a.pos.z - am.g.position.z) * Math.min(1, dt * 8); am.g.position.y = 1.7 + Math.sin(time * 2 + a.pos.x) * 0.2; if (Math.random() < 0.5) emit(am.g.position.x, am.g.position.y, am.g.position.z, 1, '#7a5cff', { speed: 0.4, life: 0.8, size: 0.45, grav: 0 }); }
      else if (a.type === 'guardian') {
        const ox = am.g.position.x, oz = am.g.position.z;
        am.g.position.x += (a.pos.x - am.g.position.x) * Math.min(1, dt * 8); am.g.position.z += (a.pos.z - am.g.position.z) * Math.min(1, dt * 8);
        const tg = S.raiders[a.target]; if (tg) am.g.rotation.y = Math.atan2(tg.pos.x - a.pos.x, tg.pos.z - a.pos.z);
        if (am.anim) { playAction(am.anim, Math.hypot(am.g.position.x - ox, am.g.position.z - oz) > dt * 0.6 ? 'walk' : 'idle', 0.3); am.anim.mixer.update(dt); }
        if (a.cast && Math.random() < 0.6) emit(a.pos.x, 4.5, a.pos.z, 1, '#8ff0ff', { speed: 2, life: 0.5, size: 0.3, grav: 0 });
      } else {
        am.g.position.y = 3.0 + Math.sin(time * 1.8 + a.pos.x) * 0.3; if (am.orbit) am.orbit.rotation.y += dt * 2; am.body.rotation.y += dt * 0.7;
        if (a.alive && rigs[0]) setBeam(am.tether, am.g.position, new T.Vector3(rigs[0].root.position.x, rigs[0].body.position.y + (rigs[0].height || 8) * 0.6, rigs[0].root.position.z), 0.4 + 0.2 * Math.sin(time * 7 + a.pos.x)); else if (am.tether) am.tether.visible = false;
      }
      if (!a.alive) {
        if (!am.die) am.die = 0.001;
        am.die += dt * 2.5; am.g.scale.setScalar(Math.max(0.001, 1 - am.die));
        if (am.tether) am.tether.visible = false;
        if (am.die >= 1) { scene.remove(am.g); if (am.tether) scene.remove(am.tether); addM.delete(id); }
      }
    }
    // zones
    const live = new Set(); let beamZ = null;
    for (const z of S.zones) {
      if (z.type === 'beam') { beamZ = z; continue; }
      live.add(z.id);
      let m = zoneM.get(z.id);
      if (z.type === 'fissure') { updateFissure(z, m); continue; }
      if (z.type === 'sweep') { sweepFx(z, m); continue; }
      if (z.type === 'hole') { holeFx(z, m); continue; }
      if (!m) {
        if (z.type === 'puits') m = decal('#ff5a2e', 1, z.r, null, 2.6);
        else if (z.type === 'pool') m = decal('#ff8a2a', 1, z.r, null, 2.2);
        else if (z.type === 'core') m = decal('#a07bff', 3, z.r, null, 2.6);
        else m = decal('#ffc35a', 0, z.r, null, 2.6);
        m.position.set(z.x, 0.07, z.z); zoneM.set(z.id, m);
      }
      if (z.type === 'puits') {
        m.material.uniforms.uProg.value = Math.min(1, (S.t - z.born) / (z.armAt - z.born));
        m.material.uniforms.uAlpha.value = S.t >= z.armAt ? 1.25 : 0.6;
        if (S.t >= z.armAt && Math.random() < 0.35) emit(z.x + (Math.random() - 0.5) * z.r, 0.2, z.z + (Math.random() - 0.5) * z.r, 1, '#ff7a3c', { speed: 0.4, life: 0.7, size: 0.35, vy: 2.5, grav: 0 });
      } else if (z.type === 'pool') { m.material.uniforms.uProg.value = 1; m.material.uniforms.uAlpha.value = 0.9; if (Math.random() < 0.25) emit(z.x + (Math.random() - 0.5) * z.r, 0.2, z.z + (Math.random() - 0.5) * z.r, 1, '#ffb05a', { speed: 0.3, life: 1, size: 0.4, vy: 1.2, grav: 0 }); }
      else if (z.type === 'core') { m.position.set(z.x, 0.07, z.z); m.material.uniforms.uAlpha.value = 1; if (Math.random() < 0.6) { const a = Math.random() * PI * 2; emit(z.x + Math.cos(a) * 14, 0.5, z.z + Math.sin(a) * 14, 1, '#b18cff', { speed: 0.1, life: 1.5, size: 0.3, grav: 0, drag: 1 }); } }
      else { m.material.uniforms.uProg.value = Math.min(1, (S.t - z.born) / (z.at - z.born)); m.material.uniforms.uAlpha.value = 1.1; }
    }
    for (const [id, m] of zoneM) if (!live.has(id)) { scene.remove(m); if (m.geometry) m.geometry.dispose(); zoneM.delete(id); }
    if (beamZ && rigs.length === 2) {
      const a = rigs[0].root.position, b = rigs[1].root.position;
      const armed = S.t >= beamZ.armAt;
      L.twinBeam.userData.w = armed ? 1.6 : 0.2;
      setBeam(L.twinBeam, new T.Vector3(a.x, 2.6, a.z), new T.Vector3(b.x, 2.6, b.z), armed ? 0.8 + 0.2 * Math.sin(time * 14) : 0.4 + 0.3 * Math.sin(time * 20));
      if (armed && Math.random() < 0.7) { const k = Math.random(); emit(a.x + (b.x - a.x) * k, 2.6, a.z + (b.z - a.z) * k, 1, '#fff0c0', { speed: 2, life: 0.4, size: 0.45 }); }
    } else if (L.twinBeam) L.twinBeam.visible = false;
    for (const r of S.raiders) {
      let m = markM.get(r.i);
      if (r.alive && r.mark) {
        if (!m) { m = decal(r.isMe ? '#ff5bd0' : '#c46bff', 0, r.mark.r || 6.5, null, 2.4); markM.set(r.i, m); }
        const gm = raidM[r.i].root.position; m.position.set(gm.x, 0.08, gm.z);
        m.material.uniforms.uProg.value = Math.min(1, (S.t - r.mark.start) / (r.mark.at - r.mark.start));
      } else if (m) { scene.remove(m); markM.delete(r.i); }
    }
  }

  // ---------- repères tactiques ----------
  const pathPool = [], wpPool = [];
  let segGeo = null, enemyRing = null, healRing = null, placeRing = null;
  const turretM = new Map();
  function guideMat(col, op) { return new T.MeshBasicMaterial({ color: hdr(col, 2.2), transparent: true, opacity: op, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending }); }
  function pathSeg(k) {
    if (!segGeo) { segGeo = new T.PlaneGeometry(1, 1); segGeo.rotateX(-PI / 2); }
    if (!pathPool[k]) { const m = new T.Mesh(segGeo, guideMat('#66d8ff', 0.7)); m.renderOrder = 4; scene.add(m); pathPool[k] = m; }
    return pathPool[k];
  }
  function wpRing(k) { if (!wpPool[k]) { const m = new T.Mesh(new T.RingGeometry(0.22, 0.34, 24), guideMat('#66d8ff', 0.8)); m.rotation.x = -PI / 2; m.renderOrder = 4; scene.add(m); wpPool[k] = m; } return wpPool[k]; }
  function setSeg(m, ax, az, bx, bz, w) { const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); m.visible = l > 0.05; m.position.set((ax + bx) / 2, 0.09, (az + bz) / 2); m.rotation.y = Math.atan2(dx, dz); m.scale.set(w, 1, l); }
  function bigRing(col, r0, r1) { const m = new T.Mesh(new T.RingGeometry(r0, r1, 96), guideMat(col, 0.8)); m.rotation.x = -PI / 2; m.position.y = 0.085; m.renderOrder = 4; m.visible = false; scene.add(m); return m; }
  function updateGuides(dt) {
    let k = 0, w = 0;
    for (const m of raidM) {
      const r = m.r; if (!r.alive) continue;
      const sel = UISet.has(r.i), p = m.root.position;
      if (r.orders && r.orders.length) {
        let ax = p.x, az = p.z;
        for (const o of r.orders) { const sg = pathSeg(k++); setSeg(sg, ax, az, o.x, o.z, sel ? 0.12 : 0.07); sg.material.color.copy(hdr(sel ? '#66d8ff' : '#7fa8c8', sel ? 2.4 : 1.2)); sg.material.opacity = sel ? 0.85 : 0.35; ax = o.x; az = o.z; }
        const wr = wpRing(w++); wr.visible = true; wr.position.set(ax, 0.09, az); wr.material.opacity = sel ? 0.95 : 0.4;
      }
      if (sel && r.focus) { const E = GAME.enemyRef(S, r.focus); if (E) { const sg = pathSeg(k++); setSeg(sg, p.x, p.z, E.pos.x, E.pos.z, 0.08); sg.material.color.copy(hdr('#ff6a5a', 2.2)); sg.material.opacity = 0.7; } }
    }
    for (let j = k; j < pathPool.length; j++) pathPool[j].visible = false;
    for (let j = w; j < wpPool.length; j++) wpPool[j].visible = false;
    if (!enemyRing) { enemyRing = bigRing('#ff5a4a', 0.92, 1); healRing = bigRing('#5be39a', 0.985, 1); placeRing = bigRing('#ffcf6a', 0.9, 1); }
    const E = UIenemy ? GAME.enemyRef(S, UIenemy) : null;
    enemyRing.visible = !!E;
    if (E) { const rr = E.rad + 0.6; enemyRing.position.set(E.pos.x, 0.085, E.pos.z); enemyRing.scale.setScalar(rr * (1 + Math.sin(time * 5) * 0.03)); }
    const hs = [...UISet].map(i => raidM[i]).filter(m => m && m.r.alive && m.r.role === 'heal');
    healRing.visible = hs.length === 1;
    if (healRing.visible) { healRing.position.set(hs[0].root.position.x, 0.085, hs[0].root.position.z); healRing.scale.setScalar(GAME.HEAL_RANGE); healRing.material.opacity = 0.35; }
    placeRing.visible = false;
    for (const tu of S.turrets) if (!turretM.has(tu.id)) turretM.set(tu.id, buildTurret(tu));
  }
  function buildTurret(tu) {
    const g = new T.Group(); g.position.set(tu.x, 0, tu.z);
    const metal = new T.MeshStandardMaterial({ color: 0x5a5048, metalness: 0.8, roughness: 0.4 });
    const base = new T.Mesh(new T.CylinderGeometry(0.45, 0.6, 0.35, 12), metal); base.position.y = 0.18; g.add(base);
    const head = new T.Group(); head.position.y = 0.6; g.add(head);
    const body = new T.Mesh(new T.BoxGeometry(0.5, 0.36, 0.6), new T.MeshStandardMaterial({ color: 0xff9f43, metalness: 0.5, roughness: 0.45 })); head.add(body);
    const barrel = new T.Mesh(new T.CylinderGeometry(0.07, 0.08, 0.8, 8), metal); barrel.rotation.x = PI / 2; barrel.position.set(0, 0.05, 0.6); head.add(barrel);
    const tip = new T.Object3D(); tip.position.set(0, 0.05, 1.0); head.add(tip);
    const eye = new T.Mesh(new T.SphereGeometry(0.07, 8, 6), glowMat('#ffb060', 6)); eye.position.set(0, 0.12, 0.3); head.add(eye);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.userData = { head, tip }; scene.add(g);
    // le gadget lancé par le Bricoleur atterrit, puis la tourelle se déploie
    g.scale.setScalar(0.001); let up = false;
    fx.push({ t: 0, dur: 1.2, upd(f, k) { const u = (f.t - 0.68) / 0.4; if (u <= 0) return; if (!up) { up = true; burstRing(tu.x, tu.z, 2, '#ff9f43', 0.5); emit(tu.x, 0.6, tu.z, 24, '#ffcf8a', { speed: 4, life: 0.5, size: 0.3 }); } const c = Math.min(1, u) - 1; g.scale.setScalar(Math.max(0.001, 1 + 2.7 * c * c * c + 1.7 * c * c)); }, done() { g.scale.setScalar(1); } });
    return g;
  }
  // effets des sorts de la barre
  function spellFx(e) {
    const col = { provoc: '#ff6a5a', egide: '#ffd27a', carapace: '#ff9a6a', seisme: '#e0703f', nuee: '#6fe58f', purge: '#e6fff0', prisme: '#e2c8ff', rez: '#bfffe6', vague: '#3fd6d0', pas: '#c6f24a', tourbillon: '#8f9cff', cri: '#ff6a4a', tir: '#9cc3e6', tourelle: '#ff9f43', dome: '#7fd0ff', kick: '#8ff0ff' }[e.id] || '#ffffff';
    const by = raidM[e.by], bp = by ? by.root.position : new T.Vector3(e.x, 0, e.z);
    switch (e.id) {
      case 'egide': case 'carapace': burstRing(bp.x, bp.z, 2.4, col, 0.6); emit(bp.x, 1.2, bp.z, 30, col, { speed: 3, life: 0.6, size: 0.35 }); break;
      case 'seisme': if (by && by.model) break; burstRing(bp.x, bp.z, e.r || 9, col, 0.8); emit(bp.x, 0.4, bp.z, 70, '#a89a8a', { speed: 8, life: 0.8, size: 0.5, vy: 4, grav: -10, k: 1.2, flat: true }); flash(bp.x, 1, bp.z, col, 10, 0.4); cam.shake = Math.max(cam.shake, 0.5); break;
      case 'nuee': fx.push({ t: 0, dur: e.dur || 6, upd() { for (const m of raidM) if (m.r.alive && Math.random() < 0.35) emit(m.root.position.x, 0.4, m.root.position.z, 1, col, { speed: 1, life: 1.2, size: 0.28, vy: 2.5, grav: 0, spread: 1.4 }); } }); break;
      case 'prisme': { const p = raidPos(e.target, 1.3); pop(p, starTex, '#fff3c4', 5, 2.4, 0.4, 1.4); burstRing(p.x, p.z, 1.6, col, 0.5); break; }
      case 'vague': { if (by && by.model) break; burstRing(e.x, e.z, e.r || 7, col, 0.9); burstRing(e.x, e.z, (e.r || 7) * 0.6, col, 0.7); emit(e.x, 0.3, e.z, 80, col, { speed: 5, life: 0.9, size: 0.4, vy: 3, grav: -4, flat: true }); flash(e.x, 1, e.z, col, 6, 0.4); break; }
      case 'pas': { const fp = new T.Vector3(e.fx, 1.2, e.fz); emit(fp.x, fp.y, fp.z, 30, '#4a3a6a', { speed: 3, life: 0.7, size: 0.5, grav: 0.5, k: 1.4 }); tracer(fp, new T.Vector3(bp.x, 1.2, bp.z), col, 0.25, 2); emit(e.x, 2, e.z, 30, col, { speed: 7, life: 0.4, size: 0.35 }); break; }
      case 'tir': { if (by && by.model) break; const from = by ? (by.wObj ? tipPos(by) : raidPos(e.by, 1.5)) : new T.Vector3(); const to = new T.Vector3(e.x, 3.5, e.z); tracer(from, to, col, 0.18, 4); flash(to.x, to.y, to.z, col, 10, 0.3); emit(to.x, to.y, to.z, 40, col, { speed: 9, life: 0.4, size: 0.4 }); break; }
      case 'tourbillon': burstRing(bp.x, bp.z, e.r || 7, col, 0.6); break;
      case 'cri': for (const m of raidM) if (m.r.alive) { pillar(m.root.position.x, m.root.position.z, '#ff8a5a', 1.2, 5); } fx.push({ t: 0, dur: e.dur || 12, upd() { if (Math.random() < 0.4) { const m = raidM[Math.floor(Math.random() * raidM.length)]; if (m && m.r.alive) emit(m.root.position.x, 0.3, m.root.position.z, 1, '#ff8a5a', { speed: 0.5, life: 1, size: 0.3, vy: 3, grav: 0 }); } } }); break;
      case 'dome': {
        const dome = new T.Mesh(new T.SphereGeometry(e.r || 6.5, 48, 24, 0, PI * 2, 0, PI / 2), fresnelMat('#7fd0ff', 3.0, 1.6, 0.5, T.DoubleSide)); dome.position.set(e.x, 0, e.z); scene.add(dome);
        fx.push({ obj: dome, t: 0, dur: e.dur || 8, upd(f, k) { const a = k < 0.06 ? k / 0.06 : k > 0.9 ? (1 - k) / 0.1 : 1; dome.material.uniforms.uOp.value = a * 0.55; } });
        burstRing(e.x, e.z, e.r || 6.5, '#7fd0ff', 0.6); break;
      }
      case 'rez': break;
      case 'purge': { const p = e.target >= 0 ? raidPos(e.target, 1.3) : new T.Vector3(e.x, 1.3, e.z); emit(p.x, p.y, p.z, 26, col, { speed: 2.5, life: 0.9, size: 0.3, vy: 3, grav: 0 }); pillar(p.x, p.z, '#b8ffd8', 0.7, 3); break; }
    }
  }

  let camOverride = null;
  const fitCam = new T.PerspectiveCamera(), fitV = new T.Vector3();
  let fitPrev = 40, fitT = 0, fitDbg = null;
  function fitDistance(focus, az, el, pts) {
    fitT -= 1; if (fitT > 0) return fitPrev; fitT = 3;   // recalcul toutes les 3 images
    fitCam.copy(camera); fitCam.projectionMatrix.copy(camera.projectionMatrix); fitCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    const m = 14, x0 = Math.max(m, insetLeft + m), x1 = vw - m, y0 = insetTop + m, y1 = vh - insetBottom - m;
    const fits = d => {
      fitCam.position.set(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d).add(focus);
      fitCam.lookAt(focus); fitCam.updateMatrixWorld(true);
      for (const p of pts) { fitV.copy(p).project(fitCam); const px = (fitV.x * 0.5 + 0.5) * vw, py = (1 - (fitV.y * 0.5 + 0.5)) * vh; if (px < x0 || px > x1 || py < y0 || py > y1 || fitV.z > 1) return false; }
      return true;
    };
    let lo = 16, hi = 90;
    for (let i = 0; i < 12; i++) { const d = (lo + hi) / 2; if (fits(d)) hi = d; else lo = d; }
    fitDbg = { x0, x1, y0, y1, n: pts.length, worst: (() => { fits(hi); let w = 0; for (const p of pts) { fitV.copy(p).project(fitCam); w = Math.max(w, (1 - (fitV.y * 0.5 + 0.5)) * vh); } return w; })(), vh, vw };
    fitPrev = Math.max(vw > vh && vh < 560 ? 16 : 20, hi);
    return fitPrev;
  }
  function updateCamera(dt) {
    if (camOverride) { camera.position.copy(camOverride.pos); camera.lookAt(camOverride.look); L.key.target.position.set(0, 0, 0); L.key.position.copy(U.sunDir.value).multiplyScalar(70); return; }
    const target = new T.Vector3(), desired = new T.Vector3();
    if (cam.mode === 'fight' && S) {
      const pts = [];
      for (const m of raidM) if (m.r.alive || !S.started) { const p = m.root.position; pts.push(new T.Vector3(p.x, 0, p.z), new T.Vector3(p.x, 2.6, p.z)); }
      S.bodies.forEach((b, k) => { const h = rigs[k] ? (rigs[k].height || 8) + (rigs[k].baseY || 0) : 8; pts.push(new T.Vector3(b.pos.x, 0, b.pos.z), new T.Vector3(b.pos.x, h * 0.85, b.pos.z)); });
      let cx = 0, cz = 0; for (const p of pts) { cx += p.x; cz += p.z; } cx /= pts.length; cz /= pts.length;
      // cadrage stable : recul rapide si quelqu'un sort du champ, rapprochement lent
      if (!cam.fCur) cam.fCur = new T.Vector3(cx, 2.4, cz);
      cam.focus.set(cx, 2.4, cz);
      const fit = fitDistance(cam.focus, cam.az, cam.el, pts);
      cam.dCur = cam.dCur ? cam.dCur + (fit - cam.dCur) * Math.min(1, dt * (fit > cam.dCur ? 4 : 0.7)) : fit;
      cam.fCur.lerp(cam.focus, Math.min(1, dt * 1.6));
      const d = cam.dCur * cam.zoom;
      target.copy(cam.fCur);
      desired.set(Math.sin(cam.az) * Math.cos(cam.el) * d, Math.sin(cam.el) * d, Math.cos(cam.az) * Math.cos(cam.el) * d).add(target);
    } else {
      const lead = previewRigs[0];
      const h = lead ? (lead.height || 8) + (lead.baseY || 0) : 8;
      const portrait = vw < vh, wide = previewRigs.length > 1 ? 1.35 : 1;
      const d = (portrait ? h * 2.9 + 7 : h * 2.2 + 5) * wide;
      const az = Math.sin(time * 0.05) * 0.55 + 0.25;
      target.set(0, h * 0.52, 0);
      desired.set(Math.sin(az) * d, h * 0.3 + 1.5 + Math.sin(time * 0.13) * 0.8, Math.cos(az) * d);
    }
    const k = Math.min(1, dt * (cam.mode === 'fight' ? 4 : 1.2));
    cam.pos.lerp(desired, k); cam.look.lerp(target, k);
    camera.position.copy(cam.pos);
    if (cam.shake > 0) { cam.shake = Math.max(0, cam.shake - dt * 2.2); const s = cam.shake * cam.shake * 0.5; camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.position.z += (Math.random() - 0.5) * s; }
    camera.lookAt(cam.look);
    // lumière clé et ombres centrées sur l'action
    L.key.target.position.set(cam.look.x * 0.5, 0, cam.look.z * 0.5); L.key.position.copy(U.sunDir.value).multiplyScalar(70).add(L.key.target.position);
  }
  function select(set) { UISet = new Set(Array.isArray(set) ? set : set >= 0 ? [set] : []); }
  function selectEnemy(ref) { UIenemy = ref; }
  function placing(o) { UIplace = o; }
  function getQuality() { return { name: qName, label: qName === 'auto' ? 'Auto' : PRESETS[qName].label, dpr: currentDpr() }; }
  return { init, load, resize, setInsets, setMode, bindFight, unbind, update, handleEvents, select, selectEnemy, placing, onTap, pick, nameplates, marker, showBoss, setQuality, getQuality, isReady: () => ready, PRESETS,
    _dbg: () => ({ scene, camera, renderer, raidM, rigs, previewRigs, cam, composer, hdrType, Q, finalPass, bloomPass, insets: [insetTop, insetBottom, insetLeft], fitPrev, fitDbg }), _setCam: (p, l) => { camOverride = p ? { pos: new T.Vector3(...p), look: new T.Vector3(...l) } : null; },
    _lab: cfg => labInit(cfg), _labDbg: () => ({ lab, STZ, P0: Array.from(P0), BK }), _labFrames: f => { if (lab) lab.frames = f; }, _labRots: rs => { if (lab) lab.list.forEach((R, i) => { R.root.rotation.y = rs[i] ?? R.root.rotation.y; }); }, _play: (i, n, o) => { const R = raidM[i]; if (R) play(R, n, o || {}); }, _bossPlay: (k, n, o) => { const rg = rigs[k] || previewRigs[k]; if (rg) bossPlay(rg, n, o || {}); } };
})() : null;
