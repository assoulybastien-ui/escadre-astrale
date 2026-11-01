// Post-traitement : la scène est rendue en HDR (demi-flottants, antialiasing 4×), puis
// halo lumineux (bloom) sur la neige au soleil et les paillettes, flou radial de vitesse,
// exposition + courbe ACES, étalonnage léger, vignettage, grain (casse les dégradés du ciel), sortie sRGB.
// Si l'appareil ne sait pas rendre en demi-flottants : rendu direct avec la courbe ACES de three.
const POST = (() => {
  let R = null, ok = false, W = 1, H = 1;
  let rtMain, rtA, rtB, rtC, rtD, scene, cam, quad;
  const M = {};
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const P = { exposure: 0.6, bloom: 0.11, glow: 0.03, speed: 0, vignette: 0.32, grain: 0.022, sat: 1.06, contrast: 1.05, time: 0 };

  let msaa = 4, bloomOn = true;
  function target(w, h, ms) {
    const o = { format: THREE.RGBAFormat, type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, stencilBuffer: false };
    if (ms && msaa > 0 && THREE.WebGLMultisampleRenderTarget && R.capabilities.isWebGL2) { const t = new THREE.WebGLMultisampleRenderTarget(w, h, o); t.samples = msaa; return t; }
    return new THREE.WebGLRenderTarget(w, h, Object.assign(o, { depthBuffer: !!ms }));
  }
  function shader(fs, uniforms) {
    return new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
  }
  function init(renderer) {
    R = renderer;
    const ext = R.extensions;
    ok = R.capabilities.isWebGL2 ? ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float')
      : ext.has('OES_texture_half_float') && ext.has('EXT_color_buffer_half_float');
    if (!ok) return false;
    scene = new THREE.Scene(); cam = new THREE.Camera();
    quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null); quad.frustumCulled = false; scene.add(quad);
    // seuil doux : seules les très hautes lumières débordent
    M.bright = shader(`uniform sampler2D t; uniform vec2 px; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(t, vUv + px * vec2(-1.0, -1.0)).rgb + texture2D(t, vUv + px * vec2(1.0, -1.0)).rgb
               + texture2D(t, vUv + px * vec2(-1.0, 1.0)).rgb + texture2D(t, vUv + px * vec2(1.0, 1.0)).rgb;
        c *= 0.25;
        float l = max(c.r, max(c.g, c.b));
        float s = clamp(l - 1.6, 0.0, 2.0); s = s * s / 4.0;   // genou doux autour du seuil 2,6
        float k = max(s, l - 2.6);
        gl_FragColor = vec4(min(c * (k / max(l, 0.0001)), vec3(40.0)), 1.0);
      }`, { t: { value: null }, px: { value: new THREE.Vector2() } });
    M.down = shader(`uniform sampler2D t; uniform vec2 px; varying vec2 vUv;
      void main(){ gl_FragColor = 0.25 * (texture2D(t, vUv + px * vec2(-1.0, -1.0)) + texture2D(t, vUv + px * vec2(1.0, -1.0)) + texture2D(t, vUv + px * vec2(-1.0, 1.0)) + texture2D(t, vUv + px * vec2(1.0, 1.0))); }`,
      { t: { value: null }, px: { value: new THREE.Vector2() } });
    // flou gaussien 9 échantillons (5 lectures grâce au filtrage linéaire)
    M.blur = shader(`uniform sampler2D t; uniform vec2 dir; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(t, vUv) * 0.2270270270;
        c += (texture2D(t, vUv + dir * 1.3846153846) + texture2D(t, vUv - dir * 1.3846153846)) * 0.3162162162;
        c += (texture2D(t, vUv + dir * 3.2307692308) + texture2D(t, vUv - dir * 3.2307692308)) * 0.0702702703;
        gl_FragColor = c;
      }`, { t: { value: null }, dir: { value: new THREE.Vector2() } });
    M.final = shader(`uniform sampler2D tScene; uniform sampler2D tB1; uniform sampler2D tB2;
      uniform float exposure, bloom, glow, speed, vignette, grain, sat, contrast, time; uniform vec2 res;
      varying vec2 vUv;
      vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
      vec3 aces(vec3 c){
        const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
        const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
        c = IN * c; c = RRTAndODTFit(c); c = OUT * c; return clamp(c, 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      void main(){
        vec2 ctr = vec2(0.5, 0.47);
        vec2 dv = vUv - ctr;
        vec3 c;
        float k = speed * smoothstep(0.12, 0.75, length(dv * vec2(res.x / res.y, 1.0)));
        if (k > 0.0005) {
          // flou radial : le centre reste net, les bords filent
          c = vec3(0.0);
          for (int i = 0; i < 8; i++) { float f = float(i) / 7.0; c += texture2D(tScene, vUv - dv * k * f).rgb; }
          c *= 0.125;
        } else c = texture2D(tScene, vUv).rgb;
        vec3 b1 = texture2D(tB1, vUv).rgb, b2 = texture2D(tB2, vUv).rgb;
        c += b1 * bloom + b2 * (bloom * 0.7 + glow);
        c = aces(c * exposure / 0.6);
        // étalonnage : un peu de contraste et de saturation, ombres à peine bleutées
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, sat);
        c = clamp((c - 0.5) * contrast + 0.5, 0.0, 1.0);
        c += vec3(-0.004, 0.0, 0.01) * (1.0 - l);
        float v = dot(dv * vec2(1.25, 1.0), dv * vec2(1.25, 1.0));
        c *= 1.0 - vignette * smoothstep(0.08, 0.55, v);
        c = toSRGB(clamp(c, 0.0, 1.0));
        c += (hash(vUv * res + fract(time * 7.13) * 91.7) - 0.5) * grain;
        gl_FragColor = vec4(c, 1.0);
      }`, {
      tScene: { value: null }, tB1: { value: null }, tB2: { value: null }, res: { value: new THREE.Vector2() },
      exposure: { value: P.exposure }, bloom: { value: P.bloom }, glow: { value: P.glow }, speed: { value: 0 }, vignette: { value: P.vignette },
      grain: { value: P.grain }, sat: { value: P.sat }, contrast: { value: P.contrast }, time: { value: 0 }
    });
    return true;
  }
  function setSize(w, h) {
    if (!ok) return;
    W = Math.max(4, Math.floor(w)); H = Math.max(4, Math.floor(h));
    for (const t of [rtMain, rtA, rtB, rtC, rtD]) if (t) t.dispose();
    rtMain = target(W, H, true);
    const w4 = Math.max(2, W >> 2), h4 = Math.max(2, H >> 2), w8 = Math.max(2, W >> 3), h8 = Math.max(2, H >> 3);
    rtA = target(w4, h4); rtB = target(w4, h4); rtC = target(w8, h8); rtD = target(w8, h8);
  }
  // qualité : antialiasing (0 ou 4) et halo ; la cible principale est recréée si l'antialiasing change
  function setQuality(L) {
    if (!ok) return;
    bloomOn = !!L.bloom;
    if (L.msaa !== msaa) { msaa = L.msaa; if (rtMain) { rtMain.dispose(); rtMain = target(W, H, true); } }
  }
  function pass(mat, out) { quad.material = mat; R.setRenderTarget(out); R.render(scene, cam); }
  function render(sc, camera) {
    if (!ok) { R.setRenderTarget(null); R.render(sc, camera); return; }
    R.setRenderTarget(rtMain); R.render(sc, camera);
    const w4 = rtA.width, h4 = rtA.height, w8 = rtC.width, h8 = rtC.height;
    if (bloomOn) {
    M.bright.uniforms.t.value = rtMain.texture; M.bright.uniforms.px.value.set(1.5 / W, 1.5 / H); pass(M.bright, rtA);
    M.blur.uniforms.t.value = rtA.texture; M.blur.uniforms.dir.value.set(1 / w4, 0); pass(M.blur, rtB);
    M.blur.uniforms.t.value = rtB.texture; M.blur.uniforms.dir.value.set(0, 1 / h4); pass(M.blur, rtA);
    M.down.uniforms.t.value = rtA.texture; M.down.uniforms.px.value.set(0.5 / w4, 0.5 / h4); pass(M.down, rtC);
    M.blur.uniforms.t.value = rtC.texture; M.blur.uniforms.dir.value.set(1.6 / w8, 0); pass(M.blur, rtD);
    M.blur.uniforms.t.value = rtD.texture; M.blur.uniforms.dir.value.set(0, 1.6 / h8); pass(M.blur, rtC);
    }
    const u = M.final.uniforms;
    u.tScene.value = rtMain.texture; u.tB1.value = rtA.texture; u.tB2.value = rtC.texture; u.res.value.set(W, H);
    for (const k of ['exposure', 'bloom', 'glow', 'speed', 'vignette', 'grain', 'sat', 'contrast', 'time']) u[k].value = P[k];
    if (!bloomOn) { u.bloom.value = 0; u.glow.value = 0; }
    pass(M.final, null);
  }
  return { init, setSize, setQuality, render, P, get ok() { return ok; } };
})();
