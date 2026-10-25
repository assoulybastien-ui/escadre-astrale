  // ============================================================
  //  PERSONNAGES — direction artistique par classe, animation procédurale par poses, effets d'armes
  //  (inséré dans la fermeture de render.js : accès à T, scene, emit, tracer, flash, etc.)
  // ============================================================

  // ---------- squelette : canaux de pose ----------
  // Une pose = rotations exprimées dans l'espace du PERSONNAGE (X gauche, Y haut, Z avant), ordre YXZ,
  // appliquées au pivot de chaque os par-dessus l'animation de base (repos/course).
  const BONES = { hips: 'Hips', spine: 'Spine', spine1: 'Spine1', spine2: 'Spine2', neck: 'Neck', head: 'Head',
    rsh: 'RightShoulder', rarm: 'RightArm', rfore: 'RightForeArm', rhand: 'RightHand',
    lsh: 'LeftShoulder', larm: 'LeftArm', lfore: 'LeftForeArm', lhand: 'LeftHand',
    rup: 'RightUpLeg', rleg: 'RightLeg', rfoot: 'RightFoot', lup: 'LeftUpLeg', lleg: 'LeftLeg', lfoot: 'LeftFoot' };
  const BK = Object.keys(BONES), NB = BK.length;
  const LEG = new Set(['rup', 'rleg', 'rfoot', 'lup', 'lleg', 'lfoot']);
  const CH_ROOT = NB * 3, CH_YAW = CH_ROOT + 3, CH_PITCH = CH_YAW + 1, CH_ROLL = CH_YAW + 2, NCH = CH_YAW + 3;
  const BIDX = {}; BK.forEach((k, i) => { BIDX[k] = i; });
  // pose compilée : { v: Float32Array(NCH), m: Uint8Array(NB+2) } (masque : os touchés, +racine, +orientation)
  function pz(o) {
    const v = new Float32Array(NCH), m = new Uint8Array(NB + 2);
    for (const k in o) {
      const x = o[k];
      if (k in BIDX) { const i = BIDX[k]; v[i * 3] = x[0]; v[i * 3 + 1] = x[1]; v[i * 3 + 2] = x[2]; m[i] = 1; }
      else if (k === 'root') { v[CH_ROOT] = x[0]; v[CH_ROOT + 1] = x[1]; v[CH_ROOT + 2] = x[2]; m[NB] = 1; }
      else if (k === 'yaw') { v[CH_YAW] = x; m[NB + 1] = 1; } else if (k === 'pitch') { v[CH_PITCH] = x; m[NB + 1] = 1; } else if (k === 'roll') { v[CH_ROLL] = x; m[NB + 1] = 1; }
    }
    return { v, m };
  }
  const M = (...parts) => Object.assign({}, ...parts);          // fusion de poses « brutes »
  const getBones = model => { const o = {}; for (const k of BK) o[k] = bone(model, BONES[k]); return o; };
  const _qR = new T.Quaternion(), _qP = new T.Quaternion(), _qD = new T.Quaternion(), _qI = new T.Quaternion(), _eu = new T.Euler(), _vp = new T.Vector3(), _vs = new T.Vector3();
  // le mélangeur three.js ne réécrit un os que si sa valeur change : on restaure la pose de base
  // quand l'os porte encore la retouche de l'image précédente, puis on applique la nouvelle
  const eqQ = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z && a.w === b.w;
  function overlay(rootObj, model, bones, v, st) {
    if (!st.base) { st.base = BK.map(() => new T.Quaternion()); st.post = BK.map(() => new T.Quaternion()); st.init = false; }
    for (let i = 0; i < NB; i++) { const b = bones[BK[i]]; if (!b) continue; if (st.init && eqQ(b.quaternion, st.post[i])) b.quaternion.copy(st.base[i]); st.base[i].copy(b.quaternion); }
    st.init = true;
    rootObj.getWorldQuaternion(_qR).invert();
    model.updateMatrixWorld(true);
    for (let i = 0; i < NB; i++) {
      const b = bones[BK[i]]; if (!b) continue;
      const x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2];
      if (Math.abs(x) + Math.abs(y) + Math.abs(z) > 1e-4) {
        b.parent.matrixWorld.decompose(_vp, _qP, _vs); _qP.premultiply(_qR);
        _eu.set(x, y, z, 'YXZ'); _qD.setFromEuler(_eu);
        _qI.copy(_qP).invert(); _qD.premultiply(_qI).multiply(_qP);
        b.quaternion.premultiply(_qD);
        b.updateMatrixWorld(true);
      }
      st.post[i].copy(b.quaternion);
    }
  }
  function applyPose(R, v) {
    overlay(R.root, R.model, R.bones, v, R.ov || (R.ov = {}));
    R.model.position.set(v[CH_ROOT], v[CH_ROOT + 1] + (R.lift || 0) + (R.baseY || 0), v[CH_ROOT + 2]);
    R.model.rotation.set(v[CH_PITCH], PI + v[CH_YAW], v[CH_ROLL]);
  }

  // ---------- jambes : flexion cohérente (pieds au sol) ----------
  function crouch(R0, a, b) {   // a : angle de cuisse gauche/droite (rad) ; b : idem pour l'autre jambe (défaut = a)
    b = b ?? a;
    const L = 0.43 + 0.43, drop = (L * (1 - Math.cos(a)) + L * (1 - Math.cos(b))) / 2;
    return { rup: [-a, 0, 0], rleg: [2 * a, 0, 0], rfoot: [-a, 0, 0], lup: [-b, 0, 0], lleg: [2 * b, 0, 0], lfoot: [-b, 0, 0], root: [0, -drop, 0] };
  }
  const stride = (a, s) => ({ rup: [-a + s, 0, 0], rleg: [2 * a, 0, 0], rfoot: [-a - s * 0.5, 0, 0], lup: [-a - s, 0, 0.04], lleg: [2 * a + s * 0.8, 0, 0], lfoot: [-a, 0, 0], root: [0, -0.86 * (1 - Math.cos(a)) - Math.abs(s) * 0.06, 0] });
  const kneel = { rup: [0.15, 0, 0], rleg: [1.55, 0, 0], rfoot: [0.3, 0, 0], lup: [-1.35, 0, 0.12], lleg: [1.3, 0, 0], lfoot: [0.05, 0, 0], root: [0, -0.46, -0.05] };

  // ---------- styles de classe ----------
  // armor/cloth : couleurs ; accent : lumière de classe ; plate : [métal, rugosité] des plaques ; size : gabarit
  const STYLE = {
    sentinelle:  { armor: '#93a6c6', accent: '#3fa2ff', cloth: '#1a2645', plate: [0.9, 0.26], size: 1.06, trim: '#d8e4ff', name: 'Sentinelle' },
    ascete:      { armor: '#ece6d6', accent: '#39f0c0', cloth: '#123a36', plate: [0.05, 0.5], size: 0.98, trim: '#bfa76a', name: 'Ascète' },
    medic:       { armor: '#f2f4f2', accent: '#53ff7a', cloth: '#2f3532', plate: [0.08, 0.28], size: 1.0, trim: '#9aa3a0', name: 'Médic' },
    oracle:      { armor: '#e0c27e', accent: '#ffc94a', cloth: '#2a1f55', plate: [1.0, 0.2], size: 1.0, trim: '#fff0c8', name: 'Oracle' },
    franctireur: { armor: '#6f7458', accent: '#ff7a2e', cloth: '#29271f', plate: [0.12, 0.8], size: 1.0, trim: '#3d3a30', name: 'Franc-tireur' },
    lame:        { armor: '#2c2838', accent: '#c27bff', cloth: '#140f1d', plate: [0.7, 0.2], size: 0.96, trim: '#5a4a78', name: 'Lame' },
    // --- races (v5) ---
    gardien:     { armor: '#d6cfc2', accent: '#ffc24a', cloth: '#2a2420', plate: [0.4, 0.3], size: 1.03, trim: '#d9ad55', robe: '#cfc5b0', headless: true, name: 'Gardien' },
    titan:       { armor: '#a65a3a', accent: '#ff4a2e', cloth: '#2a1712', plate: [0.65, 0.55], size: 1.2, trim: '#4d403a', robe: '#6a2a1c', headless: true, bones: { rsh: 1.12, lsh: 1.12, rup: 1.04, lup: 1.04 }, name: 'Titan' },
    medic:       { armor: '#eef2ef', accent: '#46ff7a', cloth: '#2b3230', plate: [0.25, 0.22], size: 0.98, trim: '#8d9894', headless: true, name: 'Médic' },
    seraphe:     { armor: '#cdbaf5', accent: '#ffb54a', cloth: '#3a1f6b', plate: [0.3, 0.35], size: 1.03, trim: '#f5c46a', robe: '#5d35a6', skin: '#d9cbff', skinPR: [0.15, 0.35], glow2: '#b98cff', headless: true, bones: { neck: 1.2 }, name: 'Séraphe' },
    maree:       { armor: '#38a397', accent: '#3ff0e0', cloth: '#0f2c3e', plate: [0.12, 0.25], size: 0.98, trim: '#e6d3a0', robe: '#165a6e', skin: '#2f9b8f', skinPR: [0.1, 0.22], headless: true, name: 'Marée' },
    lameombre:   { armor: '#2b3a2f', accent: '#b8ff2a', cloth: '#0c100c', plate: [0.45, 0.35], size: 0.98, trim: '#5d6e40', skin: '#4a6650', skinPR: [0.3, 0.35], headless: true, name: 'Lame-ombre' },
    fracasseur:  { armor: '#4049a8', accent: '#8f9bff', cloth: '#171a40', plate: [0.85, 0.28], size: 1.05, trim: '#dfe4ee', skin: '#b8bfcd', skin2: '#e8ebf2', mane: '#2c2f60', headless: true, bones: { rsh: 1.06, lsh: 1.06 }, name: 'Fracasseur' },
    spectre:     { armor: '#8ba3c0', accent: '#ff3b3b', cloth: '#1b2331', plate: [0.9, 0.3], size: 1.0, trim: '#3d4757', headless: true, name: 'Spectre' },
    bricoleur:   { armor: '#e0832a', accent: '#ffa63f', cloth: '#3a2716', plate: [0.5, 0.45], size: 0.86, trim: '#caa04a', skin: '#d39b6c', skinPR: [0.05, 0.6], headless: true, bones: { lup: 0.8, rup: 0.8, rsh: 0.92, lsh: 0.92 }, name: 'Bricoleur' },
  };
  // matériau du corps : recolorisation de la texture d'origine, plaques/tissu/liserés par classe
  const bodyCache = new Map();
  function bodyMat(base, cls, visor, dim) {
    const ck = cls + (visor ? 'v' : 'b') + (dim ? 'd' : '');
    if (bodyCache.has(ck)) return bodyCache.get(ck);
    const st = STYLE[cls] || STYLE.sentinelle;
    const m = base.clone();
    m.skinning = true; m.roughness = 1; m.metalness = 1; m.envMapIntensity = 1.15;
    const u = { uArmor: { value: new T.Color(st.armor).convertSRGBToLinear() }, uAccent: { value: new T.Color(st.accent).convertSRGBToLinear() }, uCloth: { value: new T.Color(st.cloth).convertSRGBToLinear() },
      uGlow: { value: visor ? 0 : 3.4 }, uDim: { value: dim ? 0.3 : 1 }, uPM: { value: st.plate[0] }, uPR: { value: st.plate[1] } };
    if (visor) { m.emissive = new T.Color(st.accent).convertSRGBToLinear(); m.emissiveIntensity = dim ? 0 : 1.6; m.color = new T.Color('#111111'); }
    m.userData.u = u;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.fragmentShader = 'uniform vec3 uArmor; uniform vec3 uAccent; uniform vec3 uCloth; uniform float uGlow; uniform float uDim; uniform float uPM; uniform float uPR;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `float plate = 0.0, red = 0.0;
          #ifdef USE_MAP
            vec3 c = mapTexelToLinear(texture2D(map, vUv)).rgb;
            float lum = dot(c, vec3(0.2126,0.7152,0.0722));
            red = smoothstep(0.05, 0.16, c.r - max(c.g, c.b)*1.6) * step(0.06, c.r);
            plate = smoothstep(0.18, 0.38, lum) * (1.0 - red);
            vec3 plateCol = uArmor * (0.3 + lum*1.5);
            c = mix(c*uCloth*1.6, plateCol, plate);
            c = mix(c, uAccent*0.3, red);
            diffuseColor *= vec4(c * uDim, 1.0);
          #endif`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(0.82, uPR, plate);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(0.02, uPM, plate);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = totalEmissiveRadiance * uDim + uAccent * red * uGlow * uDim;');
    };
    bodyCache.set(ck, m);
    return m;
  }
  // matériaux d'accessoires : des « étiquettes » (couleur + métal/rugosité) fusionnées ensuite en un seul
  // matériau à couleurs par sommet (solide) et un seul matériau additif (lumineux) → très peu d'appels de dessin
  const SOLID = new T.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 1, envMapIntensity: 1.2, side: T.DoubleSide });
  SOLID.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute vec2 pbr; varying vec2 vPbr;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vPbr = pbr;');
    sh.fragmentShader = 'varying vec2 vPbr;\n' + sh.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = vPbr.y;').replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = vPbr.x;');
  };
  const GLOW = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false });
  const SOLID_SK = new T.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 1, envMapIntensity: 1.2, side: T.DoubleSide, skinning: true }); SOLID_SK.onBeforeCompile = SOLID.onBeforeCompile;
  const GLOW_SK = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false, skinning: true });
  // tous les accessoires rigides d'un personnage → 2 maillages articulés sur son squelette (solide + lumineux)
  function skinAccessories(R) {
    let body = null; R.model.traverse(o => { if (o.isSkinnedMesh && !o.name.includes('visor') && !body) body = o; });
    if (!body) return;
    R.model.updateMatrixWorld(true);
    const sk = body.skeleton, bind = body.bindMatrix, bindInv = new T.Matrix4().copy(body.bindMatrix).invert();
    const lists = new Map([[SOLID, []], [GLOW, []]]), targets = [];
    R.model.traverse(o => { if (o.isMesh && !o.isSkinnedMesh && !o.userData.noSkin && lists.has(o.material)) targets.push(o); });
    const M = new T.Matrix4(), A1 = new T.Matrix4();
    for (const o of targets) {
      let b = o.parent; while (b && sk.bones.indexOf(b) < 0) b = b.parent; if (!b) continue;
      const bi = sk.bones.indexOf(b);
      M.copy(bindInv).multiply(A1.copy(sk.boneInverses[bi]).invert()).multiply(A1.copy(b.matrixWorld).invert()).multiply(o.matrixWorld);
      const g = o.geometry.clone(); g.applyMatrix4(M);
      const n = g.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let v = 0; v < n; v++) { si[v * 4] = bi; sw[v * 4] = 1; }
      g.setAttribute('skinIndex', new T.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new T.BufferAttribute(sw, 4));
      lists.get(o.material).push(g); o.parent.remove(o);
    }
    for (const [mat, geos] of lists) {
      if (!geos.length) continue;
      const names = Object.keys(geos[0].attributes), size = {}, tot = geos.reduce((a, g) => a + g.attributes.position.count, 0);
      const mg = new T.BufferGeometry();
      for (const nm of names) { const it = geos[0].attributes[nm].itemSize; size[nm] = it; const Arr = nm === 'skinIndex' ? Uint16Array : Float32Array; const arr = new Arr(tot * it); let off = 0; for (const g of geos) { const at = g.attributes[nm]; if (at) arr.set(at.array, off); off += g.attributes.position.count * it; g.dispose(); } mg.setAttribute(nm, new T.BufferAttribute(arr, it)); }
      const m = new T.SkinnedMesh(mg, mat === SOLID ? SOLID_SK : GLOW_SK);
      m.position.copy(body.position); m.quaternion.copy(body.quaternion); m.scale.copy(body.scale);
      body.parent.add(m); m.bind(sk, bind); m.frustumCulled = false; m.castShadow = mat === SOLID; m.renderOrder = mat === GLOW ? 3 : 0;
      if (mat === GLOW) R.accGlow = m;
    }
  }
  function solidTag(col, metal, rough, side) { const c = new T.Color(col).convertSRGBToLinear(); const m = new T.MeshStandardMaterial({ color: c, metalness: metal, roughness: rough, envMapIntensity: 1.2, side: side || T.FrontSide }); m.userData.vc = c; m.userData.pbr = [metal, rough]; m.userData.into = SOLID; return m; }
  function glowTag(col, k) { const m = glowMat(col, k, { side: T.DoubleSide }); m.userData.vc = hdr(col, k); m.userData.into = GLOW; return m; }
  const accCache = new Map();
  function accMats(cls) {
    if (accCache.has(cls)) return accCache.get(cls);
    const st = STYLE[cls];
    const o = {
      armor: solidTag(st.armor, st.plate[0], Math.min(0.9, st.plate[1] + 0.05)),
      dark: solidTag('#2c3038', 0.85, 0.35),
      trim: solidTag(st.trim, 0.9, 0.25),
      cloth: solidTag(new T.Color(st.cloth).multiplyScalar(1.4).getStyle(), 0, 0.92, T.DoubleSide),
      glow: glowTag(st.accent, 3.2),
      glowS: glowTag(st.accent, 2.2),
      white: glowTag('#ffffff', 3.5),
      robe: solidTag(st.robe || new T.Color(st.cloth).multiplyScalar(1.4).getStyle(), 0, 0.85, T.DoubleSide),
      halo: glowTag(st.accent, 0.55),
      core: glowTag('#fff6dc', 5),
      skin: solidTag(st.skin || st.armor, (st.skinPR || [0.1, 0.5])[0], (st.skinPR || [0.1, 0.5])[1]),
      skin2: solidTag(st.skin2 || st.skin || st.armor, 0.05, 0.55),
      glow2: glowTag(st.glow2 || st.accent, 2.6),
      glow2S: glowTag(st.glow2 || st.accent, 0.9),
    };
    accCache.set(cls, o); return o;
  }

  // ---------- fixation d'accessoires : repère du personnage au moment de la construction ----------
  const _m1 = new T.Matrix4(), _m2 = new T.Matrix4(), _q3 = new T.Quaternion(), _v3 = new T.Vector3(), _e3 = new T.Euler();
  // pos/rot exprimés dans l'espace personnage (mètres du modèle), relatifs au pivot de l'os
  function attachCS(R, key, obj, pos, rot, into) {
    const b = typeof key === 'string' ? R.bones[key] : key; if (!b) return null;
    R.model.updateMatrixWorld(true);
    b.matrixWorld.decompose(_vp, _qP, _vs);
    R.root.matrixWorld.decompose(_v3, _q3, _vs);   // échelle racine (uniforme)
    const rs = _vs.x / R.root.scale.x;              // échelle monde du parent de la racine (1)
    const cs = R.root.scale.x * rs;
    // monde souhaité : position os + rotation racine·offset ; orientation racine·rot
    const off = new T.Vector3(...(pos || [0, 0, 0])).multiplyScalar(cs).applyQuaternion(_q3);
    _e3.set(...(rot || [0, 0, 0]), 'YXZ');
    const qw = new T.Quaternion().setFromEuler(_e3).premultiply(_q3);
    _m1.compose(_vp.clone().add(off), qw, new T.Vector3(cs, cs, cs));
    _m2.copy(b.matrixWorld).invert().multiply(_m1);
    const g = new T.Group(); _m2.decompose(g.position, g.quaternion, g.scale); g.add(obj); (into || b).add(g); return g;
  }
  // fusionne les maillages d'un groupe par matériau (moins d'appels de dessin) ; garde intacts sprites, repères et objets marqués noMerge
  function mergeByMat(group) {
    group.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(group.matrixWorld).invert();
    const byMat = new Map(), keep = [];
    const walk = o => { for (const c of o.children.slice()) {
      if (c.isSprite || c.userData.noMerge || (!c.isMesh && c.children.length === 0)) keep.push(c);
      else { if (c.isMesh) { const k = c.material.userData.into || c.material; if (!byMat.has(k)) byMat.set(k, []); byMat.get(k).push(c); } walk(c); } } };
    walk(group);
    const out = new T.Group();
    for (const [mat, list] of byMat) {
      const geos = list.map(o => { const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(_m1.copy(inv).multiply(o.matrixWorld)); return g; });
      let n = 0; for (const g of geos) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3), pbr = new Float32Array(n * 2); let o3 = 0, o2 = 0;
      geos.forEach((g, gi) => { const c = g.attributes.position.count, m = list[gi].material; pos.set(g.attributes.position.array, o3); if (g.attributes.normal) nor.set(g.attributes.normal.array, o3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o2);
        const vc = m.userData.vc || m.color || white, pb = m.userData.pbr || [0.5, 0.5]; for (let v = 0; v < c; v++) { col[o3 + v * 3] = vc.r; col[o3 + v * 3 + 1] = vc.g; col[o3 + v * 3 + 2] = vc.b; pbr[o2 + v * 2] = pb[0]; pbr[o2 + v * 2 + 1] = pb[1]; }
        o3 += c * 3; o2 += c * 2; g.dispose(); });
      const mg = new T.BufferGeometry(); mg.setAttribute('position', new T.BufferAttribute(pos, 3)); mg.setAttribute('normal', new T.BufferAttribute(nor, 3)); mg.setAttribute('uv', new T.BufferAttribute(uv, 2));
      if (mat === SOLID || mat === GLOW) mg.setAttribute('color', new T.BufferAttribute(col, 3)); if (mat === SOLID) mg.setAttribute('pbr', new T.BufferAttribute(pbr, 2));
      const m = new T.Mesh(mg, mat); m.castShadow = mat === SOLID && list.some(o => o.castShadow); m.renderOrder = mat === GLOW ? 3 : 0; out.add(m);
    }
    for (const o of keep) { const w = new T.Matrix4().copy(inv).multiply(o.matrixWorld); o.parent.remove(o); w.decompose(o.position, o.quaternion, o.scale); out.add(o); }
    out.userData = group.userData;
    return out;
  }
  const mesh = (geo, mat, p, r, s, shadow) => { const m = new T.Mesh(geo, mat); if (p) m.position.set(...p); if (r) m.rotation.set(...r); if (s) (typeof s === 'number' ? m.scale.setScalar(s) : m.scale.set(...s)); if (shadow) m.castShadow = true; return m; };
  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  const cyl = (r1, r2, h, n) => new T.CylinderGeometry(r1, r2, h, n || 12);

  // ---------- cape / pans de tissu animés (déformation dans le shader) ----------
  const capeGeoCache = new Map();
  function capeGeo(w0, w1, h) {
    const k = w0 + ':' + w1 + ':' + h; if (capeGeoCache.has(k)) return capeGeoCache.get(k);
    const g = new T.PlaneGeometry(1, 1, 6, 12); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const v = 0.5 - p.getY(i); const w = w0 + (w1 - w0) * v; p.setXYZ(i, p.getX(i) * w, -v * h, -Math.pow(Math.abs(p.getX(i) * 2), 2) * 0.05 * w); }
    g.computeVertexNormals(); capeGeoCache.set(k, g); return g;
  }
  function capeMat(baseMat, h, stiff) {
    const m = baseMat.clone(); m.side = T.DoubleSide;
    const u = { uT: U.time, uSwing: { value: 0 }, uH: { value: h }, uStiff: { value: stiff || 1 }, uPh: { value: Math.random() * 6 }, uTrim: { value: new T.Color(0, 0, 0) } };
    m.userData.u = u;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'uniform float uT; uniform float uSwing; uniform float uH; uniform float uStiff; uniform float uPh; varying float vCv;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float cv = clamp(-position.y / uH, 0.0, 1.0); float c2 = cv*cv; vCv = cv;
        float wv = sin(uT*2.1 + uPh + position.x*5.0 + cv*4.0) * 0.035 + sin(uT*3.7 + uPh*1.3 - cv*6.0) * 0.015;
        transformed.z -= (uSwing*0.55*c2 + 0.03*cv) / uStiff;
        transformed.y += uSwing*0.18*c2 / uStiff;
        transformed.z += wv*cv*(1.0 + uSwing*1.5) / uStiff;
        transformed.x += sin(uT*1.6 + uPh + cv*2.5)*0.025*cv / uStiff;`);
      sh.fragmentShader = 'uniform vec3 uTrim; varying float vCv;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uTrim * smoothstep(0.92, 0.97, vCv);');
    };
    return m;
  }

  // ---------- armes (repère arme : poignée à l'origine, axe principal +Y) ----------
  function W_sword(c) {
    const g = new T.Group(), a = accMats(c);
    g.add(mesh(cyl(0.022, 0.025, 0.2, 10), a.dark, [0, 0.0, 0]));
    g.add(mesh(new T.SphereGeometry(0.035, 10, 8), a.trim, [0, -0.11, 0]));
    g.add(mesh(box(0.26, 0.04, 0.06), a.trim, [0, 0.11, 0], null, null, true));
    g.add(mesh(box(0.07, 0.06, 0.075), a.armor, [0, 0.11, 0]));
    const bl = new T.Shape(); bl.moveTo(-0.045, 0); bl.lineTo(0.045, 0); bl.lineTo(0.04, 0.78); bl.lineTo(0, 0.9); bl.lineTo(-0.04, 0.78); bl.closePath();
    const bg = new T.ExtrudeGeometry(bl, { depth: 0.014, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1 }); bg.translate(0, 0, -0.007);
    g.add(mesh(bg, a.armor, [0, 0.13, 0], null, null, true));
    g.add(mesh(box(0.012, 0.8, 0.03), a.glow, [0, 0.55, 0]));
    const tip = new T.Object3D(); tip.position.y = 1.0; g.add(tip); g.userData.tip = tip; g.userData.base = 0.15; return g;
  }
  function W_tower(c) {   // bouclier pavois : face vers +Z (repère arme), poignée à l'origine
    const g = new T.Group(), a = accMats(c);
    const sh = new T.Shape(); sh.moveTo(-0.28, 0.42); sh.lineTo(0.28, 0.42); sh.lineTo(0.3, -0.18); sh.lineTo(0, -0.5); sh.lineTo(-0.3, -0.18); sh.closePath();
    const sg = new T.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.015, bevelSegments: 2 }); sg.translate(0, 0, -0.02);
    g.add(mesh(sg, a.armor, [0, 0, 0.06], null, null, true));
    const rim = new T.Shape(); rim.moveTo(-0.3, 0.44); rim.lineTo(0.3, 0.44); rim.lineTo(0.32, -0.19); rim.lineTo(0, -0.53); rim.lineTo(-0.32, -0.19); rim.closePath();
    const hole = new T.Path(); hole.moveTo(-0.27, 0.41); hole.lineTo(0.27, 0.41); hole.lineTo(0.29, -0.175); hole.lineTo(0, -0.485); hole.lineTo(-0.29, -0.175); hole.closePath(); rim.holes.push(hole);
    g.add(mesh(new T.ExtrudeGeometry(rim, { depth: 0.05, bevelEnabled: false }), a.trim, [0, 0, 0.055]));
    g.add(mesh(new T.CircleGeometry(0.12, 6), a.glow, [0, 0.05, 0.12]));
    g.add(mesh(new T.RingGeometry(0.14, 0.165, 6), a.glow, [0, 0.05, 0.121]));
    g.add(mesh(box(0.025, 0.7, 0.012), a.glow, [0, -0.02, 0.105]));
    g.userData.face = true; return g;
  }
  function W_hammer(c) {
    const g = new T.Group(), a = accMats(c);
    g.add(mesh(cyl(0.022, 0.024, 1.2, 10), a.dark, [0, 0.3, 0], null, null, true));
    g.add(mesh(box(0.06, 0.08, 0.06), a.trim, [0, -0.3, 0]));
    g.add(mesh(box(0.4, 0.22, 0.22), a.armor, [0, 0.95, 0], null, null, true));
    g.add(mesh(box(0.12, 0.26, 0.26), a.trim, [0.16, 0.95, 0])); g.add(mesh(box(0.12, 0.26, 0.26), a.trim, [-0.16, 0.95, 0]));
    g.add(mesh(new T.IcosahedronGeometry(0.075, 1), a.glow, [0, 0.95, 0.12])); g.add(mesh(new T.IcosahedronGeometry(0.075, 1), a.glow, [0, 0.95, -0.12]));
    g.add(mesh(box(0.42, 0.025, 0.232), a.glow, [0, 0.95, 0]));
    const tip = new T.Object3D(); tip.position.y = 1.05; g.add(tip); g.userData.tip = tip; g.userData.base = 0.75; return g;
  }
  function W_fist(c) {    // gantelet d'énergie
    const g = new T.Group(), a = accMats(c);
    g.add(mesh(new T.TorusGeometry(0.075, 0.012, 6, 24), a.glow, [0, 0.03, 0], [PI / 2, 0, 0]));
    g.add(mesh(new T.TorusGeometry(0.06, 0.008, 6, 24), a.glow, [0, -0.06, 0], [PI / 2, 0, 0]));
    g.add(mesh(new T.IcosahedronGeometry(0.06, 1), a.glowS, [0, 0.1, 0]));
    const tip = new T.Object3D(); tip.position.y = 0.12; g.add(tip); g.userData.tip = tip; g.userData.base = 0; return g;
  }
  function W_ringstaff(c) {
    const g = new T.Group(), a = accMats(c);
    g.add(mesh(cyl(0.018, 0.022, 1.9, 8), a.trim, [0, 0.25, 0], null, null, true));
    g.add(mesh(new T.TorusGeometry(0.17, 0.016, 8, 32), a.trim, [0, 1.36, 0]));
    for (let k = 0; k < 4; k++) { const an = k / 4 * PI * 2; g.add(mesh(new T.TorusGeometry(0.045, 0.007, 6, 16), a.trim, [Math.cos(an) * 0.17, 1.36 + Math.sin(an) * 0.17 - 0.06, 0])); }
    const orb = mesh(new T.IcosahedronGeometry(0.07, 2), a.glow, [0, 1.36, 0]); orb.userData.noMerge = true; g.add(orb);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr(STYLE[c].accent, 1.4), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); sp.scale.set(0.55, 0.55, 1); orb.add(sp);
    g.add(mesh(cyl(0.03, 0.03, 0.08, 8), a.armor, [0, 1.16, 0]));
    g.userData.tip = orb; g.userData.orb = orb; g.userData.base = 1.1; return g;
  }
  function W_pistol(c) {
    const g = new T.Group(), a = accMats(c);
    g.add(mesh(box(0.05, 0.13, 0.06), a.dark, [0, 0, 0]));
    g.add(mesh(box(0.06, 0.07, 0.26), a.armor, [0, 0.08, 0.08], null, null, true));
    g.add(mesh(cyl(0.022, 0.022, 0.1, 8), a.dark, [0, 0.085, 0.24], [PI / 2, 0, 0]));
    g.add(mesh(cyl(0.02, 0.02, 0.09, 8), a.glow, [0, 0.135, 0.04], [PI / 2, 0, 0]));
    const tip = new T.Object3D(); tip.position.set(0, 0.085, 0.3); g.add(tip); g.userData.tip = tip; g.userData.fwdZ = true; return g;
  }
  function W_sprayer(c) {
    const g = new T.Group(), a = accMats(c);
    g.add(mesh(box(0.07, 0.1, 0.62), a.armor, [0, 0.05, 0.16], null, null, true));
    g.add(mesh(cyl(0.035, 0.06, 0.18, 10), a.dark, [0, 0.06, 0.55], [PI / 2, 0, 0]));
    g.add(mesh(cyl(0.05, 0.05, 0.2, 12), a.glow, [0, 0.14, 0.02], [PI / 2, 0, 0]));
    g.add(mesh(box(0.05, 0.12, 0.05), a.dark, [0, -0.05, 0]));
    g.add(mesh(box(0.05, 0.08, 0.2), a.dark, [0, 0.03, -0.22]));
    const tip = new T.Object3D(); tip.position.set(0, 0.06, 0.66); g.add(tip); g.userData.tip = tip; g.userData.fwdZ = true; return g;
  }
  function W_scepter(c) {
    const g = new T.Group(), a = accMats(c);
    g.add(mesh(cyl(0.016, 0.02, 1.35, 8), a.armor, [0, 0.3, 0], null, null, true));
    g.add(mesh(new T.TorusGeometry(0.11, 0.012, 8, 32), a.trim, [0, 1.06, 0]));
    const star = new T.Group(); star.position.y = 1.06; star.userData.noMerge = true; g.add(star);
    for (let k = 0; k < 4; k++) { const s = mesh(new T.ConeGeometry(0.03, 0.2, 4), a.glow); const an = k / 4 * PI * 2; s.position.set(Math.cos(an) * 0.1, Math.sin(an) * 0.1, 0); s.rotation.z = an - PI / 2; star.add(s); }
    const orb = mesh(new T.IcosahedronGeometry(0.055, 2), a.glow); star.add(orb);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr(STYLE[c].accent, 1.6), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); sp.scale.set(0.6, 0.6, 1); orb.add(sp);
    g.add(mesh(new T.ConeGeometry(0.035, 0.1, 6), a.trim, [0, -0.4, 0], [PI, 0, 0]));
    g.userData.tip = orb; g.userData.orb = orb; g.userData.star = star; g.userData.base = 1.0; return g;
  }
  function W_orb(c) {
    const g = new T.Group(), a = accMats(c);
    const orb = mesh(new T.IcosahedronGeometry(0.075, 2), a.white, [0, 0, 0]); orb.userData.noMerge = true; g.add(orb);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr('#ff9a3a', 1.8), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); sp.scale.set(0.6, 0.6, 1); orb.add(sp);
    g.add(mesh(new T.TorusGeometry(0.12, 0.006, 6, 32), a.glow, [0, 0, 0], [PI / 2, 0, 0]));
    g.userData.tip = orb; g.userData.orb = orb; return g;
  }
  function W_sniper(c) {
    const g = new T.Group(), a = accMats(c);
    g.add(mesh(box(0.06, 0.12, 0.6), a.armor, [0, 0.06, 0.12], null, null, true));
    g.add(mesh(cyl(0.018, 0.022, 0.8, 8), a.dark, [0, 0.08, 0.8], [PI / 2, 0, 0], null, true));
    g.add(mesh(cyl(0.03, 0.03, 0.12, 8), a.dark, [0, 0.08, 1.2], [PI / 2, 0, 0]));
    g.add(mesh(cyl(0.032, 0.032, 0.32, 10), a.dark, [0, 0.17, 0.15], [PI / 2, 0, 0]));
    g.add(mesh(new T.CircleGeometry(0.026, 12), a.glow, [0, 0.17, 0.311]));
    g.add(mesh(box(0.05, 0.13, 0.26), a.dark, [0, 0.02, -0.28]));
    g.add(mesh(box(0.065, 0.012, 0.5), a.glow, [0, 0.0, 0.14]));
    g.add(mesh(box(0.012, 0.18, 0.012), a.dark, [0.03, -0.05, 0.62], [0.4, 0, 0.3])); g.add(mesh(box(0.012, 0.18, 0.012), a.dark, [-0.03, -0.05, 0.62], [0.4, 0, -0.3]));
    const tip = new T.Object3D(); tip.position.set(0, 0.08, 1.27); g.add(tip); g.userData.tip = tip; g.userData.fwdZ = true; return g;
  }
  function W_launcher(c) {   // lance-roquettes d'épaule (axe +Z)
    const g = new T.Group(), a = accMats(c);
    g.add(mesh(cyl(0.085, 0.085, 1.0, 14), a.armor, [0, 0, 0.1], [PI / 2, 0, 0], null, true));
    g.add(mesh(cyl(0.1, 0.09, 0.14, 14), a.dark, [0, 0, 0.62], [PI / 2, 0, 0]));
    g.add(mesh(cyl(0.11, 0.095, 0.12, 14), a.dark, [0, 0, -0.42], [PI / 2, 0, 0]));
    g.add(mesh(new T.RingGeometry(0.06, 0.085, 14), a.glow, [0, 0, 0.695]));
    g.add(mesh(box(0.04, 0.09, 0.14), a.dark, [0, 0.12, 0.2])); g.add(mesh(new T.CircleGeometry(0.03, 10), a.glow, [0, 0.12, 0.271]));
    g.add(mesh(box(0.05, 0.14, 0.06), a.dark, [0, -0.12, 0.25]));
    g.add(mesh(box(0.172, 0.02, 0.6), a.glow, [0, 0, 0.1]));
    const tip = new T.Object3D(); tip.position.set(0, 0, 0.72); g.add(tip); g.userData.tip = tip; g.userData.fwdZ = true; return g;
  }
  function W_dagger(c) {
    const g = new T.Group(), a = accMats(c);
    g.add(mesh(cyl(0.018, 0.02, 0.13, 8), a.dark, [0, 0, 0]));
    g.add(mesh(box(0.11, 0.025, 0.035), a.trim, [0, 0.075, 0]));
    const sh = new T.Shape(); sh.moveTo(-0.03, 0); sh.quadraticCurveTo(0.05, 0.2, 0.0, 0.42); sh.quadraticCurveTo(-0.005, 0.2, -0.03, 0);
    const bg = new T.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 }); bg.translate(0, 0, -0.004);
    g.add(mesh(bg, a.armor, [0, 0.085, 0], null, null, true));
    g.add(mesh(box(0.008, 0.36, 0.02), a.glow, [0.008, 0.27, 0]));
    const tip = new T.Object3D(); tip.position.y = 0.5; g.add(tip); g.userData.tip = tip; g.userData.base = 0.1; return g;
  }
  function W_katana(c) {
    const g = new T.Group(), a = accMats(c);
    g.add(mesh(cyl(0.018, 0.018, 0.28, 8), a.dark, [0, -0.02, 0]));
    g.add(mesh(cyl(0.05, 0.05, 0.012, 12), a.trim, [0, 0.13, 0]));
    const sh = new T.Shape(); sh.moveTo(-0.018, 0); sh.lineTo(0.016, 0); sh.quadraticCurveTo(0.05, 0.6, 0.012, 1.02); sh.lineTo(-0.02, 0.95); sh.quadraticCurveTo(0.02, 0.6, -0.018, 0);
    const bg = new T.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1 }); bg.translate(0, 0, -0.003);
    g.add(mesh(bg, a.armor, [0, 0.14, 0], null, null, true));
    const edge = new T.Shape(); edge.moveTo(0.012, 0); edge.lineTo(0.022, 0); edge.quadraticCurveTo(0.056, 0.6, 0.016, 1.03); edge.lineTo(0.01, 1.0); edge.quadraticCurveTo(0.044, 0.6, 0.012, 0);
    g.add(mesh(new T.ShapeGeometry(edge), a.glowS, [0, 0.14, 0.006]));
    const tip = new T.Object3D(); tip.position.y = 1.15; g.add(tip); g.userData.tip = tip; g.userData.base = 0.2; return g;
  }

  // ---------- Gardien : lame d'énergie, bouclier de lumière, heaume ----------
  function W_lightblade(c) {
    const g = new T.Group(), a = accMats(c);
    g.add(mesh(cyl(0.026, 0.03, 0.26, 12), a.armor, [0, -0.02, 0], null, null, true));
    for (let k = 0; k < 3; k++) g.add(mesh(cyl(0.033, 0.033, 0.016, 12), a.trim, [0, -0.1 + k * 0.07, 0]));
    g.add(mesh(new T.SphereGeometry(0.04, 12, 8), a.trim, [0, -0.17, 0]));
    const wing = new T.Shape(); wing.moveTo(0, 0); wing.quadraticCurveTo(0.12, -0.01, 0.18, 0.1); wing.quadraticCurveTo(0.1, 0.035, 0, 0.055); wing.closePath();
    for (const sd of [-1, 1]) { const wg = new T.ExtrudeGeometry(wing, { depth: 0.026, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 }); wg.translate(0, 0, -0.013); g.add(mesh(wg, a.trim, [0, 0.1, 0], null, [sd, 1, 1], true)); }
    g.add(mesh(cyl(0.042, 0.034, 0.07, 12), a.armor, [0, 0.13, 0]));
    g.add(mesh(new T.TorusGeometry(0.037, 0.008, 6, 16), a.glow, [0, 0.165, 0], [PI / 2, 0, 0]));
    const core = glowTag('#fff2cf', 2.1);
    g.add(mesh(cyl(0.012, 0.018, 1.08, 10), core, [0, 0.71, 0]));
    g.add(mesh(new T.ConeGeometry(0.012, 0.08, 10), core, [0, 1.29, 0]));
    g.add(mesh(cyl(0.03, 0.04, 1.1, 12), glowTag(STYLE[c].accent, 0.32), [0, 0.72, 0]));
    const tip = new T.Object3D(); tip.position.y = 1.32; g.add(tip); g.userData.tip = tip; g.userData.base = 0.2; return g;
  }
  function hexShape(r, ry) { const s = new T.Shape(); for (let k = 0; k < 6; k++) { const an = k / 6 * PI * 2 + PI / 6; const x = Math.cos(an) * r, y = Math.sin(an) * r * (ry || 1); k ? s.lineTo(x, y) : s.moveTo(x, y); } s.closePath(); return s; }
  function W_lightshield(c) {   // bouclier de lumière : face vers +Z, émetteur au bras
    const g = new T.Group(), a = accMats(c);
    g.add(mesh(box(0.1, 0.22, 0.09), a.armor, [0, 0, 0.02], null, null, true));
    g.add(mesh(box(0.11, 0.04, 0.1), a.trim, [0, 0.09, 0.02])); g.add(mesh(box(0.11, 0.04, 0.1), a.trim, [0, -0.09, 0.02]));
    g.add(mesh(cyl(0.035, 0.035, 0.03, 12), a.glow, [0, 0, 0.075], [PI / 2, 0, 0]));
    const face = new T.Group(); face.position.set(0, 0.02, 0.1);
    face.add(mesh(new T.ShapeGeometry(hexShape(0.32, 1.12)), glowTag(STYLE[c].accent, 0.22)));
    const rim = hexShape(0.335, 1.12); rim.holes.push(hexShape(0.31, 1.12)); face.add(mesh(new T.ShapeGeometry(rim), glowTag(STYLE[c].accent, 1.5), [0, 0, 0.003]));
    face.add(mesh(new T.RingGeometry(0.08, 0.098, 6), glowTag(STYLE[c].accent, 1.3), [0, 0, 0.004], [0, 0, PI / 6]));
    for (let k = 0; k < 3; k++) face.add(mesh(box(0.009, 0.52, 0.002), glowTag(STYLE[c].accent, 0.5), [0, 0, 0.004], [0, 0, k * PI / 3]));
    g.add(face); g.userData.face = true; g.userData.shield = face; return g;
  }
  function helmKnight(a, c) {
    const h = new T.Group();
    h.add(mesh(cyl(0.108, 0.116, 0.19, 20), a.armor, [0, 0.07, 0.005], null, [1, 1, 1.1], true));
    h.add(mesh(new T.SphereGeometry(0.108, 20, 10, 0, PI * 2, 0, PI / 2), a.armor, [0, 0.165, 0.005], null, [1, 0.8, 1.1], true));
    h.add(mesh(box(0.15, 0.018, 0.03), a.glow, [0, 0.105, 0.118]));
    h.add(mesh(box(0.022, 0.085, 0.03), a.glow, [0, 0.06, 0.122]));
    h.add(mesh(new T.TorusGeometry(0.11, 0.011, 6, 28), a.trim, [0, 0.145, 0.005], [PI / 2, 0, 0], [1, 1.1, 1]));
    h.add(mesh(new T.TorusGeometry(0.118, 0.011, 6, 28), a.trim, [0, -0.025, 0.005], [PI / 2, 0, 0], [1, 1.1, 1]));
    const crest = new T.Shape(); crest.moveTo(-0.12, 0); crest.quadraticCurveTo(-0.02, 0.16, 0.13, 0.06); crest.lineTo(0.1, 0.0); crest.quadraticCurveTo(0.0, 0.08, -0.12, 0);
    const cg = new T.ExtrudeGeometry(crest, { depth: 0.018, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 }); cg.translate(0, 0, -0.009);
    h.add(mesh(cg, a.trim, [0, 0.19, -0.01], [0, PI / 2, 0], null, true));
    h.add(mesh(box(0.008, 0.03, 0.2), a.glowS, [0, 0.235, 0.0], [-0.15, 0, 0]));
    for (const sd of [-1, 1]) { const w = new T.Shape(); w.moveTo(0, 0); w.lineTo(0.02, 0.1); w.lineTo(-0.06, 0.04); w.closePath(); h.add(mesh(new T.ExtrudeGeometry(w, { depth: 0.012, bevelEnabled: false }), a.trim, [sd * 0.115, 0.1, -0.02], [0, sd * PI / 2, 0], null, true)); }
    return h;
  }
  function plastronKnight(a) {
    const g = new T.Group();
    const sh = new T.Shape(); sh.moveTo(-0.16, 0.12); sh.lineTo(0.16, 0.12); sh.lineTo(0.15, -0.04); sh.quadraticCurveTo(0.08, -0.16, 0, -0.2); sh.quadraticCurveTo(-0.08, -0.16, -0.15, -0.04); sh.closePath();
    const pg = new T.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 2 });
    g.add(mesh(pg, a.armor, [0, 0, 0], null, null, true));
    const rim = new T.Shape(); rim.moveTo(-0.17, 0.13); rim.lineTo(0.17, 0.13); rim.lineTo(0.16, -0.045); rim.quadraticCurveTo(0.085, -0.17, 0, -0.215); rim.quadraticCurveTo(-0.085, -0.17, -0.16, -0.045); rim.closePath();
    const hole = new T.Path(); hole.moveTo(-0.15, 0.11); hole.lineTo(0.15, 0.11); hole.lineTo(0.14, -0.035); hole.quadraticCurveTo(0.075, -0.15, 0, -0.19); hole.quadraticCurveTo(-0.075, -0.15, -0.14, -0.035); hole.closePath(); rim.holes.push(hole);
    g.add(mesh(new T.ExtrudeGeometry(rim, { depth: 0.045, bevelEnabled: false }), a.trim, [0, 0, -0.005]));
    // soleil : disque et rayons lumineux
    g.add(mesh(new T.CircleGeometry(0.035, 16), a.glow, [0, -0.02, 0.046]));
    g.add(mesh(new T.RingGeometry(0.045, 0.055, 24), a.trim, [0, -0.02, 0.045]));
    for (let k = 0; k < 8; k++) { const an = k / 8 * PI * 2; const ln = k % 2 ? 0.035 : 0.06; g.add(mesh(box(0.008, ln, 0.004), a.glowS, [Math.sin(an) * (0.065 + ln / 2), -0.02 + Math.cos(an) * (0.065 + ln / 2), 0.046], [0, 0, -an])); }
    return g;
  }

  // ============================================================
  //  RACES (v5) : têtes, armes et équipements des classes
  //  (une race par classe ; la tête d'origine est retirée et remplacée)
  // ============================================================
  const tagC = new Map();
  function xt(col, metal, rough) { const k = 's' + col + metal + rough; if (!tagC.has(k)) tagC.set(k, solidTag(col, metal, rough)); return tagC.get(k); }
  function xg(col, k) { const kk = 'g' + col + k; if (!tagC.has(kk)) tagC.set(kk, glowTag(col, k)); return tagC.get(kk); }
  const ext = (sh, d, bv) => { const g = new T.ExtrudeGeometry(sh, { depth: d, bevelEnabled: !!bv, bevelSize: bv || 0, bevelThickness: bv || 0, bevelSegments: 1 }); g.translate(0, 0, -d / 2); return g; };
  const shp = pts => { const s = new T.Shape(); pts.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])); s.closePath(); return s; };
  const sph = (r, ws, hs) => new T.SphereGeometry(r, ws || 16, hs || 10);
  const halfS = (r, n) => new T.SphereGeometry(r, n || 16, Math.max(6, (n || 16) >> 1), 0, PI * 2, 0, PI / 2);
  const _up = new T.Vector3(0, 1, 0);
  const aim = (m, d) => { m.quaternion.setFromUnitVectors(_up, new T.Vector3(...d).normalize()); return m; };
  // tube effilé le long d'une courbe (cornes, oreilles, queues, câbles, branchies) ; flat : aplatissement
  function taperTube(pts, r0, r1, rs, segs, flat) {
    rs = rs || 8; segs = segs || 14;
    const curve = new T.CatmullRomCurve3(pts.map(p => new T.Vector3(p[0], p[1], p[2])));
    const fr = curve.computeFrenetFrames(segs, false);
    const pos = new Float32Array((segs + 1) * (rs + 1) * 3), uv = new Float32Array((segs + 1) * (rs + 1) * 2), idx = [];
    let o = 0, ou = 0;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs, c = curve.getPointAt(u), r = r0 + (r1 - r0) * u, N = fr.normals[i], B = fr.binormals[i];
      for (let j = 0; j <= rs; j++) {
        const a = j / rs * PI * 2, ca = Math.cos(a) * r, sa = Math.sin(a) * r * (flat || 1);
        pos[o++] = c.x + ca * N.x + sa * B.x; pos[o++] = c.y + ca * N.y + sa * B.y; pos[o++] = c.z + ca * N.z + sa * B.z; uv[ou++] = j / rs; uv[ou++] = u;
      }
    }
    for (let i = 0; i < segs; i++) for (let j = 0; j < rs; j++) { const a = i * (rs + 1) + j, b = a + rs + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  // concatène des géométries (non indexées) : position, normale, uv
  function catGeo(list) {
    const gs = list.map(g => g.index ? g.toNonIndexed() : g);
    let n = 0; for (const g of gs) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
    for (const g of gs) { const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += c; }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2)); return g;
  }
  // queue animée : balancement latéral dans le shader (axe de la queue = -Y local)
  function addTail(R, geo, len, col, pos, rot, amp, curl) {
    const m = new T.MeshStandardMaterial({ color: new T.Color(col).convertSRGBToLinear(), metalness: 0.25, roughness: 0.5, envMapIntensity: 1.2, side: T.DoubleSide });
    const u = { uT: U.time, uSwing: { value: 0 }, uH: { value: len }, uPh: { value: Math.random() * 6 }, uAmp: { value: amp }, uCurl: { value: curl } };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'uniform float uT; uniform float uSwing; uniform float uH; uniform float uPh; uniform float uAmp; uniform float uCurl;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float cv = clamp(-position.y / uH, 0.0, 1.0); float c2 = cv*cv;
        transformed.x += (sin(uT*2.2 + uPh - cv*2.6)*uAmp + sin(uT*3.9 + uPh*1.7 - cv*4.0)*uAmp*0.3) * c2 * (1.0 - uSwing*0.45);
        transformed.z -= (uCurl*c2 + uSwing*0.22*c2);`);
    };
    const tm = new T.Mesh(geo, m); tm.castShadow = true; tm.frustumCulled = false;
    const grp = new T.Group(); grp.add(tm); attachCS(R, 'hips', grp, pos, rot);
    R.capes.push(u);
  }
  function addMotes(R, col, n, sz) { R.motes = []; for (let k = 0; k < n; k++) { const m = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr(k ? col : '#ffffff', 2.2), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); m.scale.set(sz || 0.18, sz || 0.18, 1); R.root.add(m); R.motes.push(m); } }
  function emitter(R, parent, p, col, every, opt, n) { const o = new T.Object3D(); o.position.set(...p); parent.add(o); (R.emitters || (R.emitters = [])).push({ o, col, every, t: Math.random() * every, opt, n: n || 1 }); return o; }

  // ---------- armes ----------
  function W_titanHammer(c) {   // marteau à une main, tête massive (faces de frappe vers ±Z)
    const g = new T.Group(), a = accMats(c);
    g.add(mesh(cyl(0.028, 0.032, 0.95, 10), a.dark, [0, 0.2, 0], null, null, true));
    for (let k = 0; k < 3; k++) g.add(mesh(cyl(0.037, 0.037, 0.03, 10), a.trim, [0, -0.13 + k * 0.08, 0]));
    g.add(mesh(cyl(0.048, 0.03, 0.08, 8), a.trim, [0, -0.3, 0]));
    g.add(mesh(box(0.21, 0.21, 0.36), a.armor, [0, 0.74, 0], null, null, true));
    for (const sd of [-1, 1]) {
      g.add(mesh(box(0.25, 0.25, 0.05), a.trim, [0, 0.74, sd * 0.165], null, null, true));
      g.add(mesh(cyl(0.1, 0.115, 0.04, 8), a.dark, [0, 0.74, sd * 0.2], [PI / 2, 0, 0]));
      g.add(mesh(new T.CircleGeometry(0.065, 8), a.glow, [0, 0.74, sd * 0.222], [0, sd < 0 ? PI : 0, 0]));
    }
    g.add(mesh(box(0.215, 0.026, 0.28), a.glow, [0, 0.74, 0]));
    g.add(mesh(box(0.215, 0.17, 0.026), a.glow, [0, 0.74, 0.05], [0.5, 0, 0]));
    g.add(mesh(new T.ConeGeometry(0.035, 0.13, 6), a.dark, [0, 0.9, 0]));
    const tip = new T.Object3D(); tip.position.y = 0.8; g.add(tip); g.userData.tip = tip; g.userData.base = 0.55; return g;
  }
  function W_slab(c) {   // pavois de forge : face vers +Z
    const g = new T.Group(), a = accMats(c), k = new T.Group(); k.scale.setScalar(0.82); g.add(k);
    k.add(mesh(ext(shp([[-0.32, 0.5], [0.32, 0.5], [0.37, 0.38], [0.37, -0.44], [0.2, -0.58], [-0.2, -0.58], [-0.37, -0.44], [-0.37, 0.38]]), 0.05, 0.02), a.armor, [0, 0, 0.07], null, null, true));
    for (const y of [0.36, -0.36]) { k.add(mesh(box(0.78, 0.07, 0.03), a.trim, [0, y, 0.118])); for (const x of [-0.3, -0.15, 0.15, 0.3]) k.add(mesh(sph(0.02, 8, 6), a.trim, [x, y, 0.135])); }
    k.add(mesh(cyl(0.17, 0.17, 0.03, 24), a.trim, [0, 0, 0.115], [PI / 2, 0, 0]));
    for (let j = 0; j < 10; j++) { const an = j / 10 * PI * 2; k.add(mesh(box(0.05, 0.05, 0.03), a.trim, [Math.cos(an) * 0.18, Math.sin(an) * 0.18, 0.115], [0, 0, an])); }
    k.add(mesh(new T.RingGeometry(0.08, 0.12, 24), a.glow, [0, 0, 0.132]));
    k.add(mesh(new T.CircleGeometry(0.055, 20), a.glowS, [0, 0, 0.131]));
    for (let j = 0; j < 4; j++) k.add(mesh(box(0.016, 0.07, 0.006), a.glow, [Math.cos(j * PI / 2 + PI / 4) * 0.1, Math.sin(j * PI / 2 + PI / 4) * 0.1, 0.133], [0, 0, j * PI / 2 + PI / 4 - PI / 2]));
    g.userData.face = true; return g;
  }
  function W_medgun(c) {   // émetteur de soin
    const g = new T.Group(), a = accMats(c);
    g.add(mesh(box(0.05, 0.12, 0.06), a.dark, [0, 0, 0]));
    g.add(mesh(cyl(0.046, 0.04, 0.32, 16), a.armor, [0, 0.08, 0.1], [PI / 2, 0, 0], null, true));
    g.add(mesh(cyl(0.026, 0.026, 0.17, 10), a.glow, [0, 0.135, 0.06], [PI / 2, 0, 0]));
    for (let k = 0; k < 2; k++) g.add(mesh(new T.TorusGeometry(0.047, 0.008, 6, 18), a.glow, [0, 0.08, 0.02 + k * 0.17]));
    g.add(mesh(new T.ConeGeometry(0.04, 0.07, 14), a.trim, [0, 0.08, 0.285], [PI / 2, 0, 0]));
    const tip = new T.Object3D(); tip.position.set(0, 0.08, 0.33); g.add(tip); g.userData.tip = tip; g.userData.fwdZ = true; return g;
  }
  function W_trident(c) {   // bâton-trident, bulle d'eau entre les dents
    const g = new T.Group(), a = accMats(c), pearl = xt('#e9dfc4', 0.35, 0.25);
    g.add(mesh(cyl(0.019, 0.023, 1.7, 8), pearl, [0, 0.3, 0], null, null, true));
    for (let k = 0; k < 4; k++) g.add(mesh(new T.TorusGeometry(0.027, 0.007, 6, 14), a.trim, [0, -0.35 + k * 0.4, 0], [PI / 2, 0, 0]));
    g.add(mesh(new T.TorusGeometry(0.03, 0.01, 6, 14), a.glow, [0, 1.12, 0], [PI / 2, 0, 0]));
    g.add(mesh(box(0.26, 0.035, 0.035), a.trim, [0, 1.17, 0], null, null, true));
    for (const x of [-1, 0, 1]) {
      g.add(mesh(cyl(0.011, 0.016, x ? 0.26 : 0.34, 6), a.trim, [x * 0.12, 1.3 + (x ? 0 : 0.04), 0], [0, 0, -x * 0.12]));
      g.add(mesh(new T.ConeGeometry(0.024, 0.09, 6), a.trim, [x * 0.137, 1.47 + (x ? 0 : 0.08), 0], [0, 0, -x * 0.12]));
    }
    const orb = mesh(sph(0.07, 16, 12), a.glowS, [0, 1.32, 0]); orb.userData.noMerge = true; g.add(orb);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr(STYLE[c].accent, 1.4), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); sp.scale.set(0.55, 0.55, 1); orb.add(sp);
    g.userData.tip = orb; g.userData.orb = orb; g.userData.base = 1.0; return g;
  }
  function W_sabre(c) {   // sabre courbe à une main, fil acide
    const g = new T.Group(), a = accMats(c), steel = xt('#3c463c', 0.9, 0.22);
    g.add(mesh(cyl(0.018, 0.02, 0.16, 8), a.dark, [0, 0, 0]));
    g.add(mesh(sph(0.026, 8, 6), a.trim, [0, -0.09, 0]));
    g.add(mesh(ext(shp([[-0.07, 0], [0.07, 0], [0.095, 0.035], [0, 0.018], [-0.095, 0.035]]), 0.03, 0.004), a.trim, [0, 0.075, 0]));
    const bl = new T.Shape(); bl.moveTo(-0.024, 0); bl.lineTo(0.028, 0); bl.quadraticCurveTo(0.085, 0.45, 0.0, 0.86); bl.quadraticCurveTo(0.025, 0.42, -0.024, 0);
    g.add(mesh(ext(bl, 0.008, 0.003), steel, [0, 0.095, 0], null, null, true));
    const ed = new T.Shape(); ed.moveTo(0.022, 0.03); ed.quadraticCurveTo(0.083, 0.45, 0.0, 0.86); ed.quadraticCurveTo(0.068, 0.45, 0.012, 0.03);
    for (const z of [0.0065, -0.0065]) g.add(mesh(new T.ShapeGeometry(ed), a.glow, [0, 0.095, z]));
    const tip = new T.Object3D(); tip.position.y = 0.95; g.add(tip); g.userData.tip = tip; g.userData.base = 0.15; return g;
  }
  function W_greatsword(c) {   // épée immense à deux mains
    const g = new T.Group(), a = accMats(c), steel = xt('#d9dee8', 0.95, 0.18);
    g.add(mesh(cyl(0.025, 0.027, 0.44, 10), a.dark, [0, -0.05, 0]));
    for (let k = 0; k < 4; k++) g.add(mesh(cyl(0.031, 0.031, 0.02, 10), a.trim, [0, -0.22 + k * 0.1, 0]));
    g.add(mesh(new T.OctahedronGeometry(0.05, 0), a.trim, [0, -0.3, 0]));
    g.add(mesh(ext(shp([[-0.05, 0], [0.05, 0], [0.26, 0.05], [0.32, 0.13], [0.19, 0.09], [0.05, 0.08], [-0.05, 0.08], [-0.19, 0.09], [-0.32, 0.13], [-0.26, 0.05]]), 0.05, 0.01), a.trim, [0, 0.16, 0], null, null, true));
    for (const z of [1, -1]) g.add(mesh(new T.CircleGeometry(0.032, 14), a.glow, [0, 0.205, z * 0.032], [0, z < 0 ? PI : 0, 0]));
    g.add(mesh(ext(shp([[-0.09, 0], [0.09, 0], [0.095, 1.18], [0.0, 1.42], [-0.095, 1.18]]), 0.022, 0.01), steel, [0, 0.24, 0], null, null, true));
    g.add(mesh(box(0.032, 1.08, 0.05), a.glow, [0, 0.8, 0]));
    for (let k = 0; k < 4; k++) g.add(mesh(box(0.07, 0.014, 0.048), a.glowS, [0, 0.45 + k * 0.22, 0], [0, 0, (k % 2 ? 1 : -1) * 0.5]));
    const tip = new T.Object3D(); tip.position.y = 1.62; g.add(tip); g.userData.tip = tip; g.userData.base = 0.35; return g;
  }
  function W_rifle(c) {   // fusil de précision du Spectre
    const g = new T.Group(), a = accMats(c);
    g.add(mesh(box(0.065, 0.12, 0.62), a.armor, [0, 0.06, 0.12], null, null, true));
    g.add(mesh(box(0.068, 0.02, 0.5), a.glow, [0, 0.0, 0.14]));
    g.add(mesh(cyl(0.019, 0.023, 0.9, 8), a.dark, [0, 0.08, 0.85], [PI / 2, 0, 0], null, true));
    g.add(mesh(box(0.06, 0.05, 0.14), a.dark, [0, 0.08, 1.3]));
    for (const sd of [-1, 1]) g.add(mesh(box(0.012, 0.035, 0.1), a.glow, [sd * 0.031, 0.08, 1.3]));
    g.add(mesh(cyl(0.034, 0.034, 0.34, 12), a.dark, [0, 0.175, 0.15], [PI / 2, 0, 0]));
    g.add(mesh(cyl(0.042, 0.036, 0.06, 12), a.trim, [0, 0.175, 0.33], [PI / 2, 0, 0]));
    g.add(mesh(new T.CircleGeometry(0.03, 14), a.glow, [0, 0.175, 0.361]));
    g.add(mesh(box(0.05, 0.14, 0.26), a.dark, [0, 0.02, -0.29]));
    g.add(mesh(box(0.012, 0.2, 0.012), a.dark, [0.03, -0.05, 0.66], [0.4, 0, 0.3])); g.add(mesh(box(0.012, 0.2, 0.012), a.dark, [-0.03, -0.05, 0.66], [0.4, 0, -0.3]));
    const tip = new T.Object3D(); tip.position.set(0, 0.08, 1.38); g.add(tip); g.userData.tip = tip; g.userData.fwdZ = true; return g;
  }
  function W_handcannon(c) {   // canon à main du Bricoleur (tenu à la hanche)
    const g = new T.Group(), a = accMats(c), brass = a.trim;
    g.add(mesh(cyl(0.085, 0.075, 0.55, 16), brass, [0, 0.06, 0.2], [PI / 2, 0, 0], null, true));
    g.add(mesh(cyl(0.115, 0.086, 0.12, 16), brass, [0, 0.06, 0.52], [PI / 2, 0, 0], null, true));
    g.add(mesh(new T.RingGeometry(0.055, 0.112, 18), a.dark, [0, 0.06, 0.582]));
    g.add(mesh(new T.CircleGeometry(0.055, 16), a.glow, [0, 0.06, 0.575]));
    for (let k = 0; k < 3; k++) g.add(mesh(new T.TorusGeometry(0.087, 0.011, 6, 20), a.glowS, [0, 0.06, 0.04 + k * 0.12]));
    g.add(mesh(box(0.14, 0.17, 0.22), a.armor, [0, 0.03, -0.13], null, null, true));
    g.add(mesh(cyl(0.05, 0.05, 0.16, 12), a.dark, [0.0, 0.17, -0.1], [PI / 2, 0, 0]));
    g.add(mesh(new T.CircleGeometry(0.03, 12), a.glow, [0.0, 0.17, -0.019]));
    g.add(mesh(box(0.05, 0.14, 0.05), a.dark, [0, -0.09, -0.05]));
    g.add(mesh(box(0.04, 0.12, 0.04), a.dark, [0, -0.05, 0.24]));
    const tip = new T.Object3D(); tip.position.set(0, 0.06, 0.62); g.add(tip); g.userData.tip = tip; g.userData.fwdZ = true; return g;
  }

  // ---------- têtes ----------
  function headTitan(a) {
    const h = new T.Group(), horn = xt('#dccba5', 0.05, 0.55);
    h.add(mesh(cyl(0.1, 0.122, 0.2, 18), a.armor, [0, 0.06, 0], null, [1, 1, 1.12], true));
    h.add(mesh(halfS(0.1, 18), a.armor, [0, 0.16, 0], null, [1, 0.55, 1.12], true));
    h.add(mesh(new T.TorusGeometry(0.104, 0.012, 6, 24), a.trim, [0, 0.16, 0], [PI / 2, 0, 0], [1, 1.12, 1]));
    h.add(mesh(box(0.014, 0.06, 0.24), a.trim, [0, 0.2, 0]));
    h.add(mesh(box(0.18, 0.026, 0.03), a.dark, [0, 0.1, 0.128]));
    h.add(mesh(box(0.16, 0.013, 0.03), a.glow, [0, 0.1, 0.134]));
    h.add(mesh(box(0.15, 0.08, 0.04), a.dark, [0, 0.025, 0.122]));
    for (let k = -2; k <= 2; k++) h.add(mesh(box(0.012, 0.07, 0.03), a.trim, [k * 0.028, 0.025, 0.143]));
    for (const sd of [-1, 1]) h.add(mesh(taperTube([[sd * 0.09, 0.12, 0.0], [sd * 0.19, 0.14, 0.03], [sd * 0.25, 0.22, 0.09], [sd * 0.24, 0.31, 0.14]], 0.036, 0.004, 8, 14), horn, null, null, null, true));
    return h;
  }
  function headDroid(a) {
    const h = new T.Group();
    h.add(mesh(sph(0.1, 22, 16), a.armor, [0, 0.11, -0.012], null, [1, 1, 1.05], true));
    h.add(mesh(box(0.165, 0.115, 0.05), a.dark, [0, 0.095, 0.083], null, null, true));
    h.add(mesh(box(0.18, 0.024, 0.065), a.armor, [0, 0.158, 0.08]));
    h.add(mesh(box(0.024, 0.13, 0.06), a.armor, [0.088, 0.095, 0.083])); h.add(mesh(box(0.024, 0.13, 0.06), a.armor, [-0.088, 0.095, 0.083]));
    for (const sd of [-1, 1]) { h.add(mesh(new T.CircleGeometry(0.022, 16), a.glow, [sd * 0.038, 0.108, 0.109])); h.add(mesh(new T.RingGeometry(0.027, 0.032, 16), a.glowS, [sd * 0.038, 0.108, 0.109])); }
    h.add(mesh(box(0.05, 0.009, 0.004), a.glow, [0, 0.062, 0.109]));
    for (const sd of [-1, 1]) { h.add(mesh(cyl(0.044, 0.044, 0.03, 16), a.trim, [sd * 0.1, 0.1, 0], [0, 0, PI / 2])); h.add(mesh(new T.TorusGeometry(0.031, 0.007, 6, 18), a.glow, [sd * 0.117, 0.1, 0], [0, PI / 2, 0])); }
    h.add(mesh(cyl(0.005, 0.006, 0.17, 6), a.dark, [-0.1, 0.2, -0.02], [0, 0, 0.15]));
    h.add(mesh(sph(0.017, 8, 6), a.glow, [-0.113, 0.285, -0.02]));
    h.add(mesh(cyl(0.05, 0.06, 0.07, 12), a.dark, [0, -0.03, 0]));
    return h;
  }
  function headSeraph(a) {
    const h = new T.Group();
    h.add(mesh(sph(0.1, 22, 16), a.skin, [0, 0.14, -0.035], [0.65, 0, 0], [0.86, 0.95, 1.6], true));
    h.add(mesh(sph(0.075, 18, 12), a.skin, [0, 0.07, 0.03], null, [0.85, 1.15, 0.92], true));
    for (const sd of [-1, 1]) h.add(mesh(sph(0.022, 12, 8), a.glow, [sd * 0.034, 0.09, 0.093], [0, 0, sd * 0.4], [1.7, 0.7, 0.5]));
    h.add(mesh(new T.OctahedronGeometry(0.015, 0), a.glow, [0, 0.135, 0.1]));
    h.add(mesh(new T.TorusGeometry(0.09, 0.007, 6, 28), a.trim, [0, 0.13, 0], [PI / 2 - 0.35, 0, 0]));
    return h;
  }
  function headAmphib(a) {
    const h = new T.Group(), belly = xt('#c4ecdc', 0.05, 0.35), eye = xt('#f2fbf6', 0.1, 0.12), spot = xt('#1d665e', 0.1, 0.3), pupil = xt('#10201e', 0.3, 0.2);
    h.add(mesh(sph(0.115, 24, 14), a.skin, [0, 0.075, 0.01], null, [1.34, 0.66, 1.22], true));
    h.add(mesh(sph(0.105, 22, 12), belly, [0, 0.03, 0.03], null, [1.26, 0.42, 1.12], true));
    h.add(mesh(new T.TorusGeometry(0.128, 0.005, 4, 28, PI), a.dark, [0, 0.045, 0.02], [PI / 2, 0, 0], [1.13, 1.08, 1]));
    for (const [x, z, r] of [[0.0, -0.04, 0.02], [0.05, -0.08, 0.014], [-0.06, -0.06, 0.016], [0.03, 0.02, 0.012], [-0.03, 0.0, 0.011]]) h.add(mesh(sph(r, 8, 6), spot, [x, 0.148 - Math.abs(x) * 0.4, z], null, [1, 0.35, 1]));
    for (const sd of [-1, 1]) {
      h.add(mesh(sph(0.046, 14, 10), a.skin, [sd * 0.088, 0.122, 0.055], null, null, true));
      h.add(mesh(sph(0.041, 14, 10), eye, [sd * 0.092, 0.128, 0.064]));
      h.add(mesh(sph(0.02, 10, 8), pupil, [sd * 0.1, 0.132, 0.098], null, [1.4, 0.7, 0.6]));
      h.add(mesh(new T.RingGeometry(0.03, 0.036, 18), a.glowS, [sd * 0.098, 0.13, 0.1], [0, sd * 0.35, 0]));
      for (let k = 0; k < 3; k++) {
        const fr = new T.Group(); fr.position.set(sd * 0.13, 0.03 + k * 0.042, -0.02);
        fr.add(aim(mesh(new T.ShapeGeometry(shp([[0, 0], [0.028, 0.05], [0.022, 0.11], [0, 0.15], [-0.022, 0.11], [-0.028, 0.05]])), a.glowS), [sd * 0.75, -0.25 + k * 0.32, -0.6]));
        fr.add(aim(mesh(box(0.006, 0.14, 0.006), a.trim, null), [sd * 0.75, -0.25 + k * 0.32, -0.6]));
        h.add(fr);
      }
    }
    h.add(mesh(new T.ShapeGeometry(shp([[0, 0], [0.05, 0.07], [0.12, 0.06], [0.21, -0.02], [0.2, -0.06], [0, -0.04]])), a.glowS, [0, 0.15, 0.04], [0, PI / 2, 0]));
    for (let k = 0; k < 4; k++) h.add(mesh(box(0.006, 0.07, 0.006), a.trim, [0, 0.165 + Math.sin(k * 0.6) * 0.01, 0.02 - k * 0.05], [0.4 - k * 0.25, 0, 0]));
    return h;
  }
  function headReptile(a) {
    const h = new T.Group();
    h.add(mesh(sph(0.092, 18, 12), a.skin, [0, 0.105, -0.01], null, [0.95, 0.85, 1.15], true));
    h.add(mesh(cyl(0.03, 0.066, 0.2, 10), a.skin, [0, 0.088, 0.14], [PI / 2, 0, 0], [1.25, 1, 0.72], true));
    h.add(mesh(cyl(0.02, 0.05, 0.17, 10), a.skin, [0, 0.048, 0.125], [PI / 2 + 0.14, 0, 0], [1.15, 1, 0.5], true));
    for (const sd of [-1, 1]) h.add(mesh(sph(0.007, 6, 4), a.dark, [sd * 0.016, 0.1, 0.235]));
    for (const sd of [-1, 1]) {
      h.add(mesh(box(0.048, 0.014, 0.02), a.glow, [sd * 0.058, 0.12, 0.078], [0, sd * 0.55, -sd * 0.25]));
      h.add(mesh(box(0.062, 0.02, 0.045), a.skin, [sd * 0.05, 0.14, 0.07], [0.3, sd * 0.4, 0]));
      h.add(mesh(taperTube([[sd * 0.05, 0.16, -0.05], [sd * 0.08, 0.19, -0.13], [sd * 0.09, 0.2, -0.22]], 0.019, 0.003, 6, 10), a.trim, null, null, null, true));
    }
    for (let k = 0; k < 7; k++) { const ph = 0.15 + k * 0.24, s = 1 - k * 0.09; h.add(aim(mesh(new T.ConeGeometry(0.016 * s, 0.075 * s, 5), a.glowS, [0, 0.1 + 0.095 * Math.cos(ph), -0.01 - 0.105 * Math.sin(ph)]), [0, Math.cos(ph), -Math.sin(ph)])); }
    return h;
  }
  function headFeline(a, st) {
    const h = new T.Group(), fur = a.skin, muz = a.skin2, mane = xt(st.mane, 0.0, 0.85), nose = xt('#23263a', 0.2, 0.4), inner = xt(st.cloth, 0, 0.8);
    h.add(mesh(sph(0.1, 20, 14), fur, [0, 0.1, 0], null, [1.0, 0.95, 1.02], true));
    h.add(mesh(sph(0.056, 14, 10), muz, [0, 0.058, 0.085], null, [1.25, 0.8, 0.9], true));
    h.add(mesh(sph(0.019, 8, 6), nose, [0, 0.082, 0.135]));
    for (const sd of [-1, 1]) {
      h.add(mesh(sph(0.021, 10, 8), a.glow, [sd * 0.043, 0.115, 0.088], [0, 0, sd * 0.3], [1.5, 0.72, 0.6]));
      h.add(mesh(new T.ConeGeometry(0.048, 0.11, 4), fur, [sd * 0.066, 0.2, -0.01], [0, 0, -sd * 0.35], [1, 1, 0.45], true));
      h.add(mesh(new T.ConeGeometry(0.03, 0.075, 4), inner, [sd * 0.064, 0.197, 0.006], [0, 0, -sd * 0.35], [1, 1, 0.3]));
      for (let k = 0; k < 2; k++) h.add(mesh(box(0.08, 0.003, 0.003), xg('#ffffff', 1.2),[sd * 0.08, 0.05 + k * 0.014, 0.11], [0, sd * 0.25, sd * (k ? -0.12 : 0.08)]));
    }
    for (const [y, n, tilt, len] of [[0.02, 13, -0.5, 0.18], [0.1, 11, 0.05, 0.17], [0.19, 7, 0.75, 0.13]]) for (let k = 0; k < n; k++) {
      const an = 1.05 + k / (n - 1) * (PI * 2 - 2.1), d = [Math.sin(an), tilt, Math.cos(an)], L = Math.hypot(...d);
      h.add(aim(mesh(new T.ConeGeometry(0.046, len, 5), mane, [d[0] / L * (0.07 + len * 0.45), 0.1 + (y - 0.1) + d[1] / L * 0.06, -0.015 + d[2] / L * (0.07 + len * 0.45)], null, null, true), d));
    }
    return h;
  }
  function headCyborg(a) {
    const h = new T.Group();
    h.add(mesh(sph(0.095, 20, 14), a.armor, [0, 0.105, -0.005], null, [0.95, 1.05, 1.1], true));
    h.add(mesh(new T.CylinderGeometry(0.097, 0.088, 0.12, 20, 1, true, -1.2, 2.4), a.dark, [0, 0.068, 0], null, [0.98, 1, 1.12]));
    h.add(mesh(cyl(0.032, 0.036, 0.075, 14), a.dark, [-0.045, 0.112, 0.1], [PI / 2, 0, 0], null, true));
    h.add(mesh(new T.TorusGeometry(0.034, 0.007, 6, 18), a.trim, [-0.045, 0.112, 0.138]));
    h.add(mesh(new T.CircleGeometry(0.029, 16), a.glow, [-0.045, 0.112, 0.14]));
    h.add(mesh(box(0.15, 0.01, 0.006), a.glowS, [0, 0.145, 0.103]));
    h.add(mesh(sph(0.013, 8, 6), a.glow, [0.042, 0.114, 0.098]));
    h.add(mesh(box(0.006, 0.06, 0.012), a.glowS, [0, 0.045, 0.108]));
    h.add(mesh(ext(shp([[0, 0], [0.13, 0.02], [0.15, 0.055], [0.02, 0.065]]), 0.012, 0), a.trim, [0, 0.18, -0.03], [0, PI / 2, 0], null, true));
    h.add(mesh(sph(0.011, 6, 4), a.glow, [0, 0.238, -0.175]));
    for (const sd of [-1, 1]) h.add(mesh(cyl(0.036, 0.036, 0.022, 14), a.trim, [sd * 0.092, 0.1, 0], [0, 0, PI / 2]));
    return h;
  }
  function headGnome(a) {
    const h = new T.Group(), skin = a.skin, brass = a.trim, leather = xt('#5c3b22', 0.0, 0.7);
    h.add(mesh(sph(0.135, 22, 16), skin, [0, 0.12, 0.01], null, [1, 0.95, 1], true));
    h.add(mesh(sph(0.04, 12, 10), skin, [0, 0.082, 0.145], null, [1, 0.9, 1.1], true));
    h.add(mesh(halfS(0.14, 20), leather, [0, 0.15, 0], null, [1.02, 0.78, 1.02], true));
    h.add(mesh(new T.TorusGeometry(0.141, 0.012, 6, 28), brass, [0, 0.15, 0], [PI / 2, 0, 0]));
    h.add(mesh(cyl(0.028, 0.034, 0.04, 12), brass, [0, 0.225, 0.115], [PI / 2 - 0.4, 0, 0]));
    h.add(mesh(new T.CircleGeometry(0.025, 12), a.white, [0, 0.233, 0.136], [-0.4, 0, 0]));
    h.add(mesh(new T.TorusGeometry(0.137, 0.014, 6, 28), leather, [0, 0.122, 0.005], [PI / 2, 0, 0]));
    for (const sd of [-1, 1]) {
      h.add(mesh(cyl(0.043, 0.047, 0.05, 16), brass, [sd * 0.055, 0.125, 0.12], [PI / 2, 0, 0], null, true));
      h.add(mesh(new T.CircleGeometry(0.034, 16), a.glow, [sd * 0.055, 0.125, 0.146]));
      h.add(mesh(new T.TorusGeometry(0.041, 0.008, 6, 18), brass, [sd * 0.055, 0.125, 0.147]));
      h.add(mesh(taperTube([[sd * 0.12, 0.12, -0.01], [sd * 0.2, 0.15, -0.04], [sd * 0.3, 0.21, -0.07]], 0.042, 0.004, 8, 10, 0.4), skin, null, null, null, true));
    }
    return h;
  }

  // ---------- équipements par classe ----------
  const RACE = {};
  const knee = (a, mat, r) => { const g = new T.Group(); g.add(mesh(sph(r || 0.06, 12, 8), mat || a.armor, [0, 0, 0], null, [1, 1.15, 0.7], true)); return g; };
  RACE.titan = (R, a, st, add) => {
    add('head', headTitan(a), [0, -0.01, 0]);
    for (const sd of [-1, 1]) {
      const pd = new T.Group();
      for (let k = 0; k < 3; k++) { pd.add(mesh(halfS(0.17 - k * 0.02, 18), a.armor, [sd * k * 0.035, -k * 0.065, 0], null, [1.2, 0.55, 1.1], true)); pd.add(mesh(new T.TorusGeometry(0.17 - k * 0.02, 0.012, 6, 28), a.trim, [sd * k * 0.035, -k * 0.065, 0], [PI / 2, 0, 0], [1.2, 1.1, 1])); }
      for (let k = 0; k < 3; k++) pd.add(mesh(new T.ConeGeometry(0.026, 0.1, 6), a.dark, [sd * (0.04 + k * 0.06), 0.085 - k * 0.02, -0.05 + k * 0.05], [0, 0, -sd * 0.55]));
      pd.add(mesh(new T.CircleGeometry(0.03, 10), a.glow, [sd * 0.2, -0.02, 0], [0, sd * PI / 2, 0]));
      add('spine2', pd, [sd * 0.25, 0.16, -0.01], [0, 0, sd * 0.4]);
    }
    const ch = new T.Group();
    ch.add(mesh(box(0.37, 0.27, 0.07), a.armor, [0, 0, 0], null, null, true));
    ch.add(mesh(box(0.39, 0.035, 0.08), a.trim, [0, 0.135, 0]));
    ch.add(mesh(box(0.21, 0.13, 0.02), a.dark, [0, -0.02, 0.04]));
    for (let k = 0; k < 4; k++) ch.add(mesh(box(0.19, 0.015, 0.02), a.glow, [0, -0.065 + k * 0.03, 0.047]));
    add('spine2', ch, [0, 0.06, 0.13], [-0.1, 0, 0]);
    const cp = new T.Group();
    cp.add(mesh(halfS(0.3, 22), a.armor, [0, 0, 0], [-PI / 2, 0, 0], [1.05, 0.55, 0.92], true));
    cp.add(mesh(new T.TorusGeometry(0.3, 0.016, 6, 32), a.trim, [0, 0, 0], null, [1.05, 0.92, 1]));
    for (const y of [-0.14, 0.0, 0.13]) { const f = Math.sqrt(1 - (y / 0.276) ** 2); cp.add(mesh(new T.TorusGeometry(1, 0.045, 6, 26, PI), a.trim, [0, y, 0], [-PI / 2, 0, 0], [0.315 * f, 0.165 * f + 0.004, 0.3])); }
    for (let k = 0; k < 4; k++) { const y = -0.2 + k * 0.12, z = -0.165 * Math.sqrt(Math.max(0, 1 - (y / 0.276) ** 2)); cp.add(mesh(new T.ConeGeometry(0.032, 0.1, 6), a.dark, [0, y, z - 0.03], [-PI / 2, 0, 0])); }
    for (const sd of [-1, 1]) { cp.add(mesh(cyl(0.034, 0.04, 0.2, 10), a.dark, [sd * 0.19, 0.24, -0.06])); cp.add(mesh(new T.TorusGeometry(0.035, 0.009, 6, 14), a.glow, [sd * 0.19, 0.34, -0.06], [PI / 2, 0, 0])); emitter(R, cp, [sd * 0.19, 0.37, -0.06], '#ff7a3a', 0.35, { speed: 0.6, life: 0.9, size: 0.22, vy: 1.6, grav: 0.4, k: 2.2 }); }
    add('spine2', cp, [0, 0.0, -0.15]);
    const gor = new T.Group(); gor.add(mesh(cyl(0.12, 0.155, 0.09, 14), a.armor, [0, 0, 0], null, null, true)); gor.add(mesh(new T.TorusGeometry(0.14, 0.011, 6, 24), a.trim, [0, 0.045, 0], [PI / 2, 0, 0]));
    add('spine2', gor, [0, 0.27, 0]);
    const belt = new T.Group(); belt.add(mesh(new T.TorusGeometry(0.19, 0.032, 8, 28), a.trim, [0, 0, 0], [PI / 2, 0, 0], [1, 0.78, 1], true));
    belt.add(mesh(box(0.11, 0.09, 0.03), a.armor, [0, 0, 0.155])); belt.add(mesh(new T.CircleGeometry(0.026, 10), a.glow, [0, 0, 0.172]));
    for (const sd of [-1, 1]) belt.add(mesh(box(0.14, 0.17, 0.03), a.armor, [sd * 0.15, -0.1, 0.08], [0.15, sd * 0.55, 0], null, true));
    add('hips', belt, [0, 0.05, 0]);
    for (const sd of [-1, 1]) {
      const vb = new T.Group(); vb.add(mesh(cyl(0.072, 0.06, 0.2, 12), a.armor, [0, 0, 0], null, null, true)); vb.add(mesh(new T.TorusGeometry(0.072, 0.01, 6, 18), a.trim, [0, 0.09, 0], [PI / 2, 0, 0])); vb.add(mesh(box(0.02, 0.15, 0.02), a.glow, [sd * 0.068, 0, 0]));
      add(sd < 0 ? 'rfore' : 'lfore', vb, [0, -0.11, 0]);
      add(sd < 0 ? 'rleg' : 'lleg', knee(a, a.armor, 0.075), [0, 0.0, 0.06]);
      const boot = new T.Group(); boot.add(mesh(cyl(0.075, 0.08, 0.12, 12), a.armor, [0, 0, 0], null, null, true)); boot.add(mesh(new T.TorusGeometry(0.077, 0.01, 6, 18), a.trim, [0, 0.06, 0], [PI / 2, 0, 0]));
      add(sd < 0 ? 'rleg' : 'lleg', boot, [0, -0.3, 0.0]);
    }
    R.capes.push(addCape(R, 'hips', a.robe, 0.2, 0.26, 0.5, [0, -0.02, 0.15], [0, 0, 0], 2.2, st.accent));
  };
  RACE.medic = (R, a, st, add) => {
    add('head', headDroid(a), [0, -0.01, 0]);
    const core = new T.Group(); core.add(mesh(cyl(0.075, 0.075, 0.03, 20), a.trim, [0, 0, 0], [PI / 2, 0, 0])); core.add(mesh(new T.CircleGeometry(0.056, 20), a.glow, [0, 0, 0.017]));
    core.add(mesh(box(0.06, 0.017, 0.004), a.white, [0, 0, 0.02])); core.add(mesh(box(0.017, 0.06, 0.004), a.white, [0, 0, 0.02]));
    add('spine2', core, [0, 0.06, 0.15]);
    for (const sd of [-1, 1]) {
      const sp = new T.Group(); sp.add(mesh(halfS(0.115, 16), a.armor, [0, 0, 0], null, [1.15, 0.6, 1.05], true)); sp.add(mesh(new T.TorusGeometry(0.115, 0.009, 6, 22), a.glowS, [0, 0, 0], [PI / 2, 0, 0], [1.15, 1.05, 1]));
      add('spine2', sp, [sd * 0.2, 0.17, -0.01], [0, 0, sd * 0.3]);
      for (const [b, r] of [[sd < 0 ? 'rfore' : 'lfore', 0.058], [sd < 0 ? 'rleg' : 'lleg', 0.07], [sd < 0 ? 'rarm' : 'larm', 0.07]]) { const j = new T.Group(); j.add(mesh(new T.TorusGeometry(r, 0.011, 6, 20), a.glow, [0, 0, 0], [PI / 2, 0, 0])); j.add(mesh(cyl(r * 0.92, r * 0.92, 0.035, 14), a.dark)); add(b, j, [0, 0.0, 0]); }
      const cr = new T.Group(); cr.add(mesh(box(0.1, 0.1, 0.02), a.armor)); cr.add(mesh(box(0.07, 0.02, 0.012), a.glow, [0, 0, 0.012])); cr.add(mesh(box(0.02, 0.07, 0.012), a.glow, [0, 0, 0.012]));
      add(sd < 0 ? 'rarm' : 'larm', cr, [sd * 0.07, -0.12, 0], [0, sd * PI / 2, 0]);
    }
    const pack = new T.Group();
    pack.add(mesh(box(0.34, 0.4, 0.16), a.armor, [0, 0, 0], null, null, true));
    pack.add(mesh(box(0.36, 0.06, 0.18), a.dark, [0, 0.16, 0]));
    for (const sd of [-1, 1]) { pack.add(mesh(cyl(0.056, 0.056, 0.34, 12), a.dark, [sd * 0.12, 0, -0.1])); pack.add(mesh(cyl(0.046, 0.046, 0.26, 12), a.glow, [sd * 0.12, 0, -0.1])); }
    const cross = new T.Group(); cross.add(mesh(box(0.13, 0.04, 0.01), a.glow)); cross.add(mesh(box(0.04, 0.13, 0.01), a.glow)); cross.position.set(0, 0.05, 0.085); pack.add(cross);
    add('spine2', pack, [0, 0.05, -0.2], [0, PI, 0]);
    const belt = new T.Group(); belt.add(mesh(new T.TorusGeometry(0.17, 0.02, 8, 28), a.dark, [0, 0, 0], [PI / 2, 0, 0], [1, 0.75, 1])); for (let k = 0; k < 4; k++) { const an = -0.9 + k * 0.6; belt.add(mesh(cyl(0.018, 0.018, 0.07, 8), a.glow, [Math.sin(an) * 0.17, -0.01, Math.cos(an) * 0.13])); }
    add('hips', belt, [0, 0.05, 0]);
    R.drone = makeDrone(R.r.vcls || R.r.cls);
  };
  RACE.seraphe = (R, a, st, add) => {
    add('head', headSeraph(a), [0, -0.01, 0]);
    const halo = new T.Group(); halo.add(mesh(new T.TorusGeometry(0.2, 0.011, 8, 48), a.glowS)); halo.add(mesh(new T.TorusGeometry(0.17, 0.005, 6, 48), a.glow2));
    for (let k = 0; k < 8; k++) { const an = k / 8 * PI * 2; halo.add(mesh(new T.ConeGeometry(0.012, 0.07, 4), a.glowS, [Math.cos(an) * 0.24, Math.sin(an) * 0.24, 0], [0, 0, an - PI / 2])); }
    const ownH = {}; add('head', halo, [0, 0.2, -0.21], [0.3, 0, 0], { own: ownH }); R.spin.push({ o: ownH.o, s: 0.4 });
    const col = new T.Group(); for (let k = 0; k < 7; k++) { const an = (k - 3) * 0.32; col.add(mesh(box(0.024, 0.2 - Math.abs(k - 3) * 0.02, 0.012), a.trim, [Math.sin(an) * 0.09, 0.08 + Math.cos(an) * 0.03, 0], [0, 0, -an])); }
    col.add(mesh(new T.TorusGeometry(0.13, 0.016, 6, 24, PI), a.trim, [0, 0, 0.02], [0, 0, 0], [1, 0.5, 1]));
    add('spine2', col, [0, 0.28, -0.08], [-0.25, 0, 0]);
    for (const sd of [-1, 1]) {
      const sp = new T.Group(); sp.add(mesh(halfS(0.1, 16), a.trim, [0, 0, 0], null, [1.2, 0.55, 1.1], true)); sp.add(mesh(new T.OctahedronGeometry(0.025, 0), a.glow, [sd * 0.07, 0.03, 0]));
      add('spine2', sp, [sd * 0.19, 0.17, 0], [0, 0, sd * 0.4]);
      const w = new T.Group();
      [[0.22, 0.78], [0.5, 0.86], [0.78, 0.8], [1.06, 0.66], [1.34, 0.5]].forEach(([ang, len], k) => {
        const f = new T.Group(); f.rotation.z = -sd * ang;
        f.add(mesh(new T.ShapeGeometry(shp([[0, 0], [0.075, len * 0.3], [0.03, len * 0.8], [0, len], [-0.03, len * 0.8], [-0.075, len * 0.3]])), a.glow2S));
        f.add(mesh(box(0.008, len * 0.92, 0.002), k % 2 ? a.glow2 : a.glow, [0, len * 0.47, 0.001]));
        w.add(f);
      });
      w.add(mesh(new T.OctahedronGeometry(0.035, 0), a.glow, [0, 0, 0.01]));
      const ownW = {}; add('spine2', w, [sd * 0.07, 0.2, -0.18], [0, sd * 0.45, 0], { own: ownW });
      (R.flaps || (R.flaps = [])).push({ o: ownW.o, sd, a0: 0 });
    }
    const belt = new T.Group(); belt.add(mesh(new T.TorusGeometry(0.17, 0.02, 8, 28), a.trim, [0, 0, 0], [PI / 2, 0, 0], [1, 0.75, 1])); belt.add(mesh(new T.OctahedronGeometry(0.03, 0), a.glow, [0, 0, 0.14]));
    add('hips', belt, [0, 0.05, 0]);
    R.capes.push(addCape(R, 'hips', a.robe, 0.2, 0.32, 0.95, [0, -0.02, 0.13], [0, 0, 0], 1.6, st.accent));
    R.capes.push(addCape(R, 'hips', a.robe, 0.26, 0.42, 1.0, [0, -0.02, -0.12], [0, PI, 0], 1.4, st.accent));
    for (const sd of [-1, 1]) R.capes.push(addCape(R, 'hips', a.robe, 0.13, 0.2, 0.9, [sd * 0.15, -0.02, 0], [0, sd * PI / 2, 0], 1.6, st.accent));
    addMotes(R, st.accent, 3, 0.18);
    R.levit = 0.15;
  };
  RACE.maree = (R, a, st, add) => {
    add('head', headAmphib(a), [0, -0.01, 0]);
    const pearl = xt('#ecdcb4', 0.35, 0.25);
    for (const sd of [-1, 1]) {
      const sh = new T.Group(); sh.add(mesh(halfS(0.12, 16), pearl, [0, 0, 0], null, [1.2, 0.55, 1.05], true));
      for (let k = 0; k < 7; k++) { const an = -PI / 2 + k * PI / 6; sh.add(aim(mesh(box(0.012, 0.13, 0.012), a.trim, [Math.sin(an) * 0.075 * 1.2, 0.042, Math.cos(an) * 0.07]), [Math.sin(an), -0.55, Math.cos(an)])); }
      add('spine2', sh, [sd * 0.2, 0.17, -0.01], [0, 0, sd * 0.32]);
      const fin = new T.Group(); fin.add(mesh(new T.ShapeGeometry(shp([[0, 0], [0.0, -0.22], [0.09, -0.04]])), a.glowS)); fin.add(mesh(box(0.008, 0.22, 0.008), a.trim, [0.002, -0.11, 0]));
      add(sd < 0 ? 'rfore' : 'lfore', fin, [sd * 0.045, 0.0, -0.01], [0, sd < 0 ? PI : 0, 0]);
      const bw = new T.Group(); bw.add(mesh(new T.TorusGeometry(0.05, 0.01, 6, 16), a.glow, [0, 0, 0], [PI / 2, 0, 0])); add(sd < 0 ? 'rfore' : 'lfore', bw, [0, -0.2, 0]);
    }
    const dor = new T.Group(); dor.add(mesh(new T.ShapeGeometry(shp([[0, 0], [0.1, -0.04], [0.13, -0.16], [0.07, -0.3], [0, -0.37]])), a.glowS));
    for (let k = 0; k < 4; k++) dor.add(mesh(box(0.1, 0.007, 0.007), a.trim, [0.05, -0.06 - k * 0.08, 0], [0, 0, -0.2]));
    add('spine2', dor, [0, 0.27, -0.13], [0, PI / 2, 0]);
    const neck = new T.Group(); for (let k = 0; k < 11; k++) { const an = -1.4 + k * 0.28; neck.add(mesh(sph(0.018, 8, 6), pearl, [Math.sin(an) * 0.12, -Math.cos(an * 0.9) * 0.02, Math.cos(an) * 0.11])); }
    neck.add(mesh(sph(0.03, 10, 8), a.glow, [0, -0.04, 0.12]));
    add('spine2', neck, [0, 0.26, 0.02]);
    const belt = new T.Group(); belt.add(mesh(new T.TorusGeometry(0.17, 0.02, 8, 28), a.trim, [0, 0, 0], [PI / 2, 0, 0], [1, 0.75, 1])); belt.add(mesh(halfS(0.045, 10), pearl, [0, 0, 0.14], [PI / 2, 0, 0], [1, 0.4, 1]));
    add('hips', belt, [0, 0.05, 0]);
    R.capes.push(addCape(R, 'hips', a.robe, 0.2, 0.3, 0.58, [0, -0.02, 0.13], [0, 0, 0], 1.7, st.accent));
    R.capes.push(addCape(R, 'hips', a.robe, 0.24, 0.36, 0.62, [0, -0.02, -0.12], [0, PI, 0], 1.5, st.accent));
    for (const sd of [-1, 1]) R.capes.push(addCape(R, 'hips', a.cloth, 0.1, 0.13, 0.5, [sd * 0.15, -0.02, 0.02], [0, sd * PI / 2, 0], 1.8, st.accent));
    addMotes(R, st.accent, 3, 0.2);
  };
  RACE.lameombre = (R, a, st, add) => {
    add('head', headReptile(a), [0, -0.01, 0]);
    const pd = new T.Group(); pd.add(mesh(halfS(0.13, 14), a.armor, [0, 0, 0], null, [1.25, 0.6, 1.05], true));
    for (let k = 0; k < 3; k++) pd.add(mesh(new T.ConeGeometry(0.028, 0.16 - k * 0.03, 5), a.trim, [-0.04 - k * 0.04, 0.07 - k * 0.015, -0.03 + k * 0.03], [0, 0, 0.55 + k * 0.15]));
    pd.add(mesh(new T.TorusGeometry(0.13, 0.004, 6, 22), a.glowS, [0, 0, 0], [PI / 2, 0, 0], [1.25, 1.05, 1]));
    add('spine2', pd, [-0.21, 0.17, -0.01], [0, 0, -0.35]);
    const straps = new T.Group(); for (const sd of [-1, 1]) straps.add(mesh(box(0.045, 0.42, 0.02), a.dark, [0, 0, 0], [0, 0, sd * 0.62])); straps.add(mesh(cyl(0.035, 0.035, 0.02, 12), a.trim, [0, 0, 0.012], [PI / 2, 0, 0])); straps.add(mesh(new T.CircleGeometry(0.022, 12), a.glow, [0, 0, 0.024]));
    add('spine1', straps, [0, 0.08, 0.13]);
    for (const sd of [-1, 1]) { const sh = new T.Group(); sh.add(mesh(box(0.05, 0.36, 0.035), a.dark, [0, 0, 0])); sh.add(mesh(box(0.054, 0.04, 0.04), a.trim, [0, 0.16, 0])); sh.add(mesh(box(0.012, 0.3, 0.038), a.glowS, [0, -0.02, 0])); add('hips', sh, [sd * 0.13, -0.05, -0.12], [0.35, 0, sd * 0.45]); }
    for (const sd of [-1, 1]) { const br = new T.Group(); br.add(mesh(cyl(0.052, 0.045, 0.16, 10), a.armor, [0, 0, 0], null, null, true)); for (let k = 0; k < 3; k++) br.add(mesh(new T.ConeGeometry(0.014, 0.06, 4), a.trim, [sd * 0.05, 0.05 - k * 0.05, -0.02], [0, 0, -sd * 1.2])); add(sd < 0 ? 'rfore' : 'lfore', br, [0, -0.1, 0]); }
    const belt = new T.Group(); belt.add(mesh(new T.TorusGeometry(0.17, 0.02, 8, 28), a.dark, [0, 0, 0], [PI / 2, 0, 0], [1, 0.75, 1])); belt.add(mesh(box(0.06, 0.05, 0.02), a.trim, [0, 0, 0.13]));
    add('hips', belt, [0, 0.05, 0]);
    for (const sd of [-1, 1]) R.capes.push(addCape(R, 'spine2', a.cloth, 0.07, 0.04, 1.15, [sd * 0.06, 0.27, -0.1], [0, PI, sd * 0.12], 0.75, st.accent));
    R.capes.push(addCape(R, 'hips', a.cloth, 0.16, 0.2, 0.42, [0, -0.02, 0.14], [0, 0, 0], 2.0, st.accent));
    addTail(R, taperTube([[0, 0.02, 0], [0, -0.25, -0.02], [0, -0.52, 0], [0, -0.8, 0.03]], 0.075, 0.006, 10, 22), 0.82, st.skin, [0, -0.02, -0.1], [1.12, 0, 0], 0.16, 0.12);
    R.ghosts = [makeGhost(R, st.accent), makeGhost(R, st.accent)];
  };
  RACE.fracasseur = (R, a, st, add) => {
    add('head', headFeline(a, st), [0, -0.01, 0]);
    const mane = xt(st.mane, 0.0, 0.85);
    const ruff = new T.Group(); for (let k = 0; k < 12; k++) { const an = k / 12 * PI * 2, d = [Math.sin(an), -0.55, Math.cos(an) * 0.9]; ruff.add(aim(mesh(new T.ConeGeometry(0.05, 0.16, 5), mane, [Math.sin(an) * 0.13, 0, Math.cos(an) * 0.11], null, null, true), d)); }
    add('spine2', ruff, [0, 0.28, -0.01]);
    const pd = new T.Group();
    for (let k = 0; k < 3; k++) { pd.add(mesh(halfS(0.14 - k * 0.018, 18), k ? a.armor : a.trim, [k * 0.03, -k * 0.055, 0], null, [1.2, 0.55, 1.1], true)); pd.add(mesh(new T.TorusGeometry(0.14 - k * 0.018, 0.008, 6, 26), a.trim, [k * 0.03, -k * 0.055, 0], [PI / 2, 0, 0], [1.2, 1.1, 1])); }
    pd.add(mesh(new T.ConeGeometry(0.028, 0.15, 6), a.trim, [0.06, 0.07, -0.02], [0, 0, -0.9]));
    pd.add(mesh(new T.CircleGeometry(0.025, 12), a.glowS, [0.17, -0.03, 0], [0, PI / 2, 0]));
    add('spine2', pd, [0.25, 0.15, -0.01], [0, 0, 0.45]);
    const straps = new T.Group(); for (const sd of [-1, 1]) straps.add(mesh(box(0.05, 0.44, 0.02), a.dark, [0, 0, 0], [0, 0, sd * 0.6])); straps.add(mesh(cyl(0.045, 0.045, 0.025, 14), a.trim, [0, 0, 0.012], [PI / 2, 0, 0])); straps.add(mesh(new T.CircleGeometry(0.03, 14), a.glow, [0, 0, 0.026]));
    add('spine1', straps, [0, 0.08, 0.14]);
    for (const sd of [-1, 1]) { const wr = new T.Group(); wr.add(mesh(cyl(0.052, 0.047, 0.15, 10), a.cloth, [0, 0, 0])); wr.add(mesh(new T.TorusGeometry(0.052, 0.008, 6, 16), a.trim, [0, 0.07, 0], [PI / 2, 0, 0])); add(sd < 0 ? 'rfore' : 'lfore', wr, [0, -0.13, 0]); add(sd < 0 ? 'rleg' : 'lleg', knee(a, a.trim, 0.06), [0, 0, 0.06]); }
    const belt = new T.Group(); belt.add(mesh(new T.TorusGeometry(0.18, 0.026, 8, 28), a.trim, [0, 0, 0], [PI / 2, 0, 0], [1, 0.76, 1])); belt.add(mesh(cyl(0.05, 0.05, 0.02, 14), a.trim, [0, 0, 0.14], [PI / 2, 0, 0])); belt.add(mesh(new T.CircleGeometry(0.032, 14), a.glow, [0, 0, 0.152]));
    add('hips', belt, [0, 0.05, 0]);
    R.capes.push(addCape(R, 'hips', a.cloth, 0.2, 0.28, 0.6, [0, -0.02, 0.14], [0, 0, 0], 1.9, st.accent));
    R.capes.push(addCape(R, 'hips', a.cloth, 0.24, 0.34, 0.62, [0, -0.02, -0.13], [0, PI, 0], 1.7, st.accent));
    const tail = catGeo([taperTube([[0, 0.02, 0], [0, -0.3, -0.03], [0, -0.6, 0.02], [0, -0.86, 0.1]], 0.04, 0.02, 8, 20), sph(0.05, 10, 8).scale(1, 1.6, 1).translate(0, -0.9, 0.12)]);
    addTail(R, tail, 0.95, st.mane, [0, -0.02, -0.1], [0.75, 0, 0], 0.13, 0.22);
  };
  RACE.spectre = (R, a, st, add) => {
    add('head', headCyborg(a), [0, -0.01, 0]);
    const collar = new T.Group(); collar.add(mesh(new T.CylinderGeometry(0.145, 0.12, 0.15, 20, 1, true, PI - 2.3, 4.6), a.cloth, [0, 0, 0]));
    add('spine2', collar, [0, 0.3, -0.01]);
    const sh = new T.Group(); sh.add(mesh(sph(0.08, 14, 10), a.dark, [0, 0, 0], null, null, true)); sh.add(mesh(new T.TorusGeometry(0.08, 0.01, 6, 20), a.glow, [0, 0, 0], [0, PI / 2, 0]));
    add('rarm', sh, [-0.02, 0.02, 0]);
    const up = new T.Group(); up.add(mesh(cyl(0.065, 0.058, 0.22, 10), a.armor, [0, 0, 0], null, null, true)); up.add(mesh(box(0.012, 0.18, 0.012), a.glow, [-0.06, 0, 0.02])); add('rarm', up, [0, -0.15, 0]);
    const lo = new T.Group(); lo.add(mesh(box(0.1, 0.2, 0.1), a.armor, [0, 0, 0], null, null, true)); for (let k = 0; k < 3; k++) lo.add(mesh(sph(0.012, 6, 4), a.glow, [-0.051, 0.06 - k * 0.05, 0.02])); lo.add(mesh(new T.TorusGeometry(0.055, 0.008, 6, 16), a.glow, [0, 0.0, 0], [PI / 2, 0, 0]));
    add('rfore', lo, [0, -0.11, 0]);
    const lb = new T.Group(); lb.add(mesh(cyl(0.05, 0.045, 0.15, 10), a.cloth, [0, 0, 0])); add('lfore', lb, [0, -0.12, 0]);
    const cp = new T.Group(); cp.add(mesh(box(0.3, 0.2, 0.05), a.armor, [0, 0, 0], null, null, true)); for (const sd of [-1, 1]) cp.add(mesh(box(0.012, 0.16, 0.012), a.glow, [sd * 0.12, 0, 0.028])); cp.add(mesh(box(0.1, 0.012, 0.012), a.glow, [0, 0.07, 0.028]));
    add('spine2', cp, [0, 0.07, 0.13], [-0.1, 0, 0]);
    const strap = new T.Group(); strap.add(mesh(box(0.05, 0.6, 0.02), a.dark, [0, 0, 0], [0, 0, 0.75])); for (let k = 0; k < 5; k++) strap.add(mesh(box(0.03, 0.06, 0.035), a.trim, [(k - 2) * 0.048, (k - 2) * -0.051, 0.02], [0, 0, 0.75]));
    add('spine1', strap, [0, 0.1, 0.13]);
    const pack = new T.Group(); pack.add(mesh(box(0.24, 0.24, 0.1), a.dark, [0, 0, 0], null, null, true)); pack.add(mesh(box(0.2, 0.02, 0.102), a.glowS, [0, 0.05, 0])); pack.add(mesh(cyl(0.005, 0.005, 0.5, 4), a.dark, [-0.08, 0.35, 0])); pack.add(mesh(sph(0.016, 8, 6), a.glow, [-0.08, 0.61, 0]));
    add('spine2', pack, [0, 0.0, -0.16], [0, PI, 0]);
    for (const sd of [-1, 1]) add('spine2', (() => { const c = new T.Group(); c.add(mesh(taperTube([[sd * 0.03, 0.36, -0.06], [sd * 0.06, 0.3, -0.13], [sd * 0.07, 0.18, -0.16]], 0.012, 0.012, 6, 8), a.dark)); return c; })(), [0, 0, 0]);
    const hol = new T.Group(); hol.add(mesh(box(0.06, 0.16, 0.08), a.dark, [0, 0, 0])); hol.add(mesh(box(0.062, 0.02, 0.082), a.glowS, [0, 0.05, 0])); add('rup', hol, [-0.08, -0.12, 0.0]);
    { const u = addCape(R, 'spine2', a.cloth, 0.36, 0.5, 0.95, [0, 0.2, -0.15], [0, PI, 0], 1.1, st.accent); u.base = 0.7; R.capes.push(u); }
    for (const sd of [-1, 1]) { const u = addCape(R, 'hips', a.cloth, 0.11, 0.15, 0.42, [sd * 0.09, -0.02, 0.13], [0, 0, 0], 1.6, st.accent); u.base = 0.5; R.capes.push(u); }
    R.laser = makeBeam(st.accent, 0.03, 3.2);
  };
  RACE.bricoleur = (R, a, st, add) => {
    add('head', headGnome(a), [0, -0.01, 0]);
    const brass = a.trim, leather = xt('#5c3b22', 0, 0.7);
    const pack = new T.Group();
    pack.add(mesh(box(0.34, 0.36, 0.2), a.armor, [0, 0, 0], null, null, true));
    pack.add(mesh(cyl(0.1, 0.1, 0.34, 16), a.armor, [0, 0.18, 0], [0, 0, PI / 2]));
    for (const sd of [-1, 1]) { const gr = new T.Group(); gr.add(mesh(new T.TorusGeometry(0.075, 0.02, 6, 20), brass)); for (let k = 0; k < 10; k++) { const an = k / 10 * PI * 2; gr.add(mesh(box(0.03, 0.03, 0.03), brass, [Math.cos(an) * 0.095, Math.sin(an) * 0.095, 0], [0, 0, an])); } gr.add(mesh(new T.CircleGeometry(0.035, 12), a.glow, [0, 0, 0.012])); gr.position.set(sd * 0.11, -0.05, -0.105); gr.rotation.y = PI; pack.add(gr); }
    pack.add(mesh(cyl(0.035, 0.04, 0.3, 10), a.dark, [0.11, 0.32, 0.02]));
    pack.add(mesh(cyl(0.05, 0.035, 0.05, 10), a.dark, [0.11, 0.48, 0.02]));
    pack.add(mesh(new T.TorusGeometry(0.05, 0.01, 6, 14), a.glow, [0.11, 0.505, 0.02], [PI / 2, 0, 0]));
    emitter(R, pack, [0.11, 0.53, 0.02], '#8d8378', 0.28, { speed: 0.5, life: 1.3, size: 0.42, vy: 1.4, grav: 0.3, k: 0.55, drag: 0.94 });
    pack.add(mesh(cyl(0.05, 0.05, 0.03, 14), brass, [-0.08, 0.1, -0.1], [PI / 2, 0, 0])); pack.add(mesh(new T.CircleGeometry(0.04, 14), a.glow, [-0.08, 0.1, -0.118], [0, PI, 0]));
    pack.add(mesh(taperTube([[-0.17, 0.12, 0], [-0.24, 0.0, 0.05], [-0.2, -0.16, 0.12]], 0.02, 0.02, 6, 8), brass));
    add('spine2', pack, [0, 0.04, -0.2], [0, PI, 0]);
    for (const sd of [-1, 1]) { const sp = new T.Group(); sp.add(mesh(halfS(0.1, 14), brass, [0, 0, 0], null, [1.15, 0.6, 1.05], true)); sp.add(mesh(sph(0.015, 6, 4), a.glow, [sd * 0.08, 0.02, 0])); add('spine2', sp, [sd * 0.19, 0.17, 0], [0, 0, sd * 0.35]); add(sd < 0 ? 'rleg' : 'lleg', knee(a, brass, 0.06), [0, 0, 0.06]); }
    const belt = new T.Group(); belt.add(mesh(new T.TorusGeometry(0.18, 0.025, 8, 28), leather, [0, 0, 0], [PI / 2, 0, 0], [1, 0.76, 1]));
    for (const [an, w] of [[-0.9, 0.08], [-0.35, 0.06], [0.5, 0.07], [1.1, 0.08]]) belt.add(mesh(box(w, 0.08, 0.05), leather, [Math.sin(an) * 0.18, -0.03, Math.cos(an) * 0.14], [0, an, 0]));
    belt.add(mesh(box(0.03, 0.18, 0.02), brass, [0.17, -0.1, 0.06], [0, 0.9, 0.2])); belt.add(mesh(new T.TorusGeometry(0.03, 0.01, 6, 12, PI * 1.5), brass, [0.17, -0.01, 0.06], [0, 0.9, 0]));
    add('hips', belt, [0, 0.05, 0]);
    R.capes.push(addCape(R, 'hips', leather, 0.18, 0.24, 0.36, [0, -0.02, 0.14], [0, 0, 0], 2.2, st.accent));
    for (const sd of [-1, 1]) { const gl = new T.Group(); gl.add(mesh(cyl(0.055, 0.05, 0.1, 10), leather, [0, 0, 0])); gl.add(mesh(new T.TorusGeometry(0.055, 0.01, 6, 14), brass, [0, 0.05, 0], [PI / 2, 0, 0])); add(sd < 0 ? 'rfore' : 'lfore', gl, [0, -0.17, 0]); }
  };

  // ---------- accessoires de classe (silhouettes) ----------
  function pauldronHeavy(a, sd) {
    const g = new T.Group();
    for (let k = 0; k < 3; k++) {
      const p = mesh(new T.SphereGeometry(0.15 - k * 0.012, 16, 8, 0, PI * 2, 0, PI * 0.5), k === 0 ? a.armor : a.armor, [sd * k * 0.03, -k * 0.055, 0], [0, 0, 0], [1.2, 0.55, 1.05], true);
      g.add(p);
      g.add(mesh(new T.TorusGeometry(0.15 - k * 0.012, 0.009, 6, 24), a.trim, [sd * k * 0.03, -k * 0.055, 0], [PI / 2, 0, 0], [1.2, 1.05, 1]));
    }
    g.add(mesh(box(0.03, 0.03, 0.18), a.glow, [sd * 0.05, 0.06, 0]));
    return g;
  }
  function buildAccessories(R) {
    const c = R.r.vcls || R.r.cls, a = accMats(c), st = STYLE[c], spec = R.r.vspec || R.r.spec;
    const parts = [], buckets = new Map();
    const add = (key, obj, pos, rot, opt = {}) => {
      if (opt.merge === false || opt.own) { const o2 = opt.own ? mergeByMat(obj) : obj; o2.traverse(q => { q.userData.noSkin = true; }); const g = attachCS(R, key, o2, pos, rot); parts.push(g); if (opt.own) opt.own.o = o2; return g; }
      const b = R.bones[key]; if (!buckets.has(b)) { const bk = new T.Group(); b.add(bk); buckets.set(b, bk); }
      return attachCS(R, key, obj, pos, rot, buckets.get(b));
    };
    if (RACE[c]) {
      RACE[c](R, a, st, add);
    } else if (c === 'sentinelle') {
      add('spine2', pauldronHeavy(a, -1), [-0.2, 0.17, -0.01], [0, 0, -0.35]);
      add('spine2', pauldronHeavy(a, 1), [0.2, 0.17, -0.01], [0, 0, 0.35]);
      const crest = new T.Group(); crest.add(mesh(box(0.025, 0.12, 0.26), a.trim, [0, 0.0, -0.02], [-0.25, 0, 0], null, true)); crest.add(mesh(box(0.012, 0.11, 0.24), a.glow, [0, 0.01, -0.02], [-0.25, 0, 0]));
      add('head', crest, [0, 0.2, -0.02], [0, 0, 0]);
      const gorget = new T.Group(); gorget.add(mesh(cyl(0.11, 0.14, 0.08, 12), a.armor, [0, 0, 0], null, null, true)); gorget.add(mesh(new T.TorusGeometry(0.12, 0.008, 6, 24), a.trim, [0, 0.04, 0], [PI / 2, 0, 0]));
      add('spine2', gorget, [0, 0.27, 0.0]);
      // tabard avant / arrière
      R.capes.push(addCape(R, 'hips', a.cloth, 0.26, 0.3, 0.48, [0, -0.02, 0.13], [0, 0, 0], 2.2, st.accent));
      R.capes.push(addCape(R, 'spine2', a.cloth, 0.36, 0.5, 1.0, [0, 0.18, -0.15], [0, PI, 0], 1.2, st.accent));
    } else if (c === 'ascete') {
      const ring = new T.Group();
      ring.add(mesh(new T.TorusGeometry(0.34, 0.016, 8, 48), a.trim));
      ring.add(mesh(new T.TorusGeometry(0.3, 0.006, 6, 48), a.glow));
      for (let k = 0; k < 8; k++) { const an = k / 8 * PI * 2; ring.add(mesh(new T.OctahedronGeometry(0.03, 0), a.glow, [Math.cos(an) * 0.34, Math.sin(an) * 0.34, 0])); }
      const ownR = {}; add('spine2', ring, [0, 0.3, -0.3], [0, 0, 0], { own: ownR }); R.spin.push({ o: ownR.o, s: 0.6 });
      for (const sd of [-1, 1]) { const band = new T.Group(); band.add(mesh(new T.TorusGeometry(0.05, 0.012, 6, 16), a.glow, [0, 0, 0], [PI / 2, 0, 0])); band.add(mesh(new T.TorusGeometry(0.055, 0.008, 6, 16), a.glow, [0, -0.06, 0], [PI / 2, 0, 0])); add(sd < 0 ? 'rfore' : 'lfore', band, [0, -0.12, 0]); }
      const collar = new T.Group(); collar.add(mesh(new T.TorusGeometry(0.13, 0.03, 8, 24), a.cloth, [0, 0, 0], [PI / 2, 0, 0], null, true)); add('spine2', collar, [0, 0.25, 0.0]);
      R.capes.push(addCape(R, 'hips', a.cloth, 0.22, 0.32, 0.75, [0, -0.02, 0.12], [0, 0, 0], 1.6, st.accent));
      R.capes.push(addCape(R, 'hips', a.cloth, 0.26, 0.36, 0.8, [0, -0.02, -0.12], [0, PI, 0], 1.4, st.accent));
      R.capes.push(addCape(R, 'spine2', a.cloth, 0.06, 0.08, 0.9, [0.1, 0.24, -0.1], [0, PI, 0.1], 0.8, null));
    } else if (c === 'medic') {
      const pack = new T.Group();
      pack.add(mesh(box(0.34, 0.4, 0.16), a.armor, [0, 0, 0], null, null, true));
      pack.add(mesh(box(0.36, 0.06, 0.18), a.dark, [0, 0.16, 0]));
      for (const sd of [-1, 1]) { pack.add(mesh(cyl(0.055, 0.055, 0.34, 12), a.dark, [sd * 0.12, 0.0, -0.1])); pack.add(mesh(cyl(0.045, 0.045, 0.26, 12), a.glow, [sd * 0.12, 0.0, -0.1])); }
      pack.add(mesh(cyl(0.006, 0.006, 0.42, 4), a.dark, [0.14, 0.38, 0.0])); pack.add(mesh(new T.SphereGeometry(0.018, 8, 6), a.glow, [0.14, 0.6, 0]));
      const cross = new T.Group(); cross.add(mesh(box(0.13, 0.04, 0.01), a.glow)); cross.add(mesh(box(0.04, 0.13, 0.01), a.glow)); cross.position.set(0, 0.05, 0.085); pack.add(cross);
      add('spine2', pack, [0, 0.05, -0.2], [0, PI, 0]);
      for (const sd of [-1, 1]) { const cr = new T.Group(); cr.add(mesh(box(0.1, 0.1, 0.02), a.armor, [0, 0, 0], null, null)); cr.add(mesh(box(0.07, 0.02, 0.012), a.glow, [0, 0, 0.012])); cr.add(mesh(box(0.02, 0.07, 0.012), a.glow, [0, 0, 0.012])); add(sd < 0 ? 'rarm' : 'larm', cr, [sd * 0.07, -0.1, 0], [0, sd * PI / 2, 0]); }
      R.drone = makeDrone(c);
    } else if (c === 'oracle') {
      const crown = new T.Group();
      crown.add(mesh(new T.TorusGeometry(0.2, 0.01, 6, 40), a.glowS));
      for (let k = 0; k < 12; k++) { const an = k / 12 * PI * 2; const ln = k % 3 === 0 ? 0.16 : 0.08; crown.add(mesh(new T.ConeGeometry(0.012, ln, 4), a.glowS, [Math.cos(an) * (0.2 + ln / 2), Math.sin(an) * (0.2 + ln / 2), 0], [0, 0, an - PI / 2])); }
      const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr(st.accent, 0.6), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); sp.scale.set(0.6, 0.6, 1); crown.add(sp);
      const ownC = {}; add('head', crown, [0, 0.1, -0.16], [0, 0, 0], { own: ownC }); R.spin.push({ o: ownC.o, s: 0.35, axis: 'z' });
      const mantle = new T.Group();
      for (const sd of [-1, 1]) { mantle.add(mesh(new T.SphereGeometry(0.13, 16, 8, 0, PI * 2, 0, PI * 0.5), a.armor, [sd * 0.17, 0, 0], [0, 0, sd * 0.45], [1.25, 0.5, 1.1], true)); mantle.add(mesh(new T.TorusGeometry(0.13, 0.008, 6, 24), a.trim, [sd * 0.17, 0, 0], [PI / 2, 0, sd * 0.45], [1.25, 1.1, 1])); }
      mantle.add(mesh(new T.TorusGeometry(0.12, 0.02, 8, 24), a.armor, [0, 0.03, 0], [PI / 2, 0, 0]));
      add('spine2', mantle, [0, 0.2, 0]);
      R.capes.push(addCape(R, 'spine2', a.cloth, 0.4, 0.68, 1.35, [0, 0.2, -0.13], [0, PI, 0], 1.0, st.accent, true));
      R.capes.push(addCape(R, 'hips', a.cloth, 0.28, 0.4, 0.85, [0, -0.02, 0.13], [0, 0, 0], 1.5, st.accent, true));
      R.motes = [];
      for (let k = 0; k < 3; k++) { const m = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr(k ? st.accent : '#ffffff', 2.2), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); m.scale.set(0.18, 0.18, 1); R.root.add(m); R.motes.push(m); }
      R.levit = 0.12;
    } else if (c === 'franctireur') {
      const hood = new T.Group(); hood.add(mesh(new T.SphereGeometry(0.15, 16, 10, 0, PI * 2, 0, PI * 0.62), a.cloth, [0, 0, 0], [-0.25, 0, 0], [1.05, 1.15, 1.2], true)); hood.add(mesh(new T.TorusGeometry(0.12, 0.02, 6, 20, PI), a.cloth, [0, -0.02, 0.09], [0, 0, PI], null));
      add('head', hood, [0, 0.07, -0.03]);
      const strap = new T.Group(); strap.add(mesh(box(0.05, 0.6, 0.02), a.dark, [0, 0, 0], [0, 0, 0.75])); for (let k = 0; k < 5; k++) strap.add(mesh(box(0.03, 0.06, 0.035), a.armor, [(k - 2) * 0.07 * 0.68, (k - 2) * 0.07 * -0.73, 0.02], [0, 0, 0.75])); strap.add(mesh(box(0.01, 0.01, 0.01), a.glow));
      add('spine1', strap, [0, 0.1, 0.13]);
      const pack = new T.Group(); pack.add(mesh(box(0.26, 0.26, 0.12), a.dark, [0, 0, 0], null, null, true)); pack.add(mesh(cyl(0.005, 0.005, 0.6, 4), a.dark, [-0.09, 0.4, 0])); pack.add(mesh(new T.SphereGeometry(0.016, 8, 6), a.glow, [-0.09, 0.71, 0]));
      add('spine2', pack, [0, 0.0, -0.17], [0, PI, 0]);
      R.capes.push(addCape(R, 'spine2', a.cloth, 0.42, 0.56, 0.78, [0, 0.22, -0.14], [0, PI, 0], 1.3, null));
    } else if (c === 'gardien') {
      add('head', helmKnight(a, c), [0, 0.0, 0.0]);
      add('spine2', plastronKnight(a), [0, 0.08, 0.13], [-0.08, 0, 0]);
      for (const sd of [-1, 1]) {
        const pd = new T.Group();
        pd.add(mesh(new T.SphereGeometry(0.16, 20, 10, 0, PI * 2, 0, PI * 0.5), a.armor, [0, 0, 0], null, [1.25, 0.62, 1.12], true));
        pd.add(mesh(new T.TorusGeometry(0.16, 0.013, 8, 32), a.trim, [0, 0.0, 0], [PI / 2, 0, 0], [1.25, 1.12, 1]));
        pd.add(mesh(new T.SphereGeometry(0.11, 16, 8, 0, PI * 2, 0, PI * 0.5), a.armor, [sd * 0.02, 0.05, 0], null, [1.2, 0.55, 1.05], true));
        pd.add(mesh(new T.TorusGeometry(0.11, 0.008, 6, 24), a.trim, [sd * 0.02, 0.05, 0], [PI / 2, 0, 0], [1.2, 1.05, 1]));
        const flare = new T.Shape(); flare.moveTo(-0.12, 0); flare.quadraticCurveTo(0, 0.11, 0.12, 0); flare.lineTo(0.1, -0.02); flare.quadraticCurveTo(0, 0.07, -0.1, -0.02); flare.closePath();
        pd.add(mesh(new T.ExtrudeGeometry(flare, { depth: 0.012, bevelEnabled: false }), a.trim, [sd * 0.05, 0.08, 0], [0, PI / 2, sd * 0.25], null, true));
        pd.add(mesh(new T.CircleGeometry(0.022, 12), a.glow, [sd * 0.12, 0.03, 0.0], [0, sd * PI / 2, 0]));
        add('spine2', pd, [sd * 0.21, 0.18, -0.01], [0, 0, sd * 0.38]);
      }
      const gorget = new T.Group(); gorget.add(mesh(cyl(0.105, 0.135, 0.07, 14), a.armor, [0, 0, 0], null, null, true)); gorget.add(mesh(new T.TorusGeometry(0.12, 0.009, 6, 24), a.trim, [0, 0.035, 0], [PI / 2, 0, 0]));
      add('spine2', gorget, [0, 0.27, 0.0]);
      const belt = new T.Group(); belt.add(mesh(new T.TorusGeometry(0.17, 0.022, 8, 28), a.trim, [0, 0, 0], [PI / 2, 0, 0], [1, 0.75, 1], true)); belt.add(mesh(box(0.07, 0.06, 0.02), a.trim, [0, 0, 0.13])); belt.add(mesh(new T.CircleGeometry(0.018, 12), a.glow, [0, 0, 0.142]));
      add('hips', belt, [0, 0.05, 0]);
      for (const sd of [-1, 1]) { const vb = new T.Group(); vb.add(mesh(cyl(0.05, 0.045, 0.16, 12), a.armor, [0, 0, 0], null, null, true)); vb.add(mesh(new T.TorusGeometry(0.05, 0.007, 6, 18), a.trim, [0, 0.07, 0], [PI / 2, 0, 0])); vb.add(mesh(new T.TorusGeometry(0.046, 0.005, 6, 18), a.glowS, [0, -0.06, 0], [PI / 2, 0, 0])); add(sd < 0 ? 'rfore' : 'lfore', vb, [0, -0.1, 0]); }
      R.capes.push(addCape(R, 'hips', a.robe, 0.2, 0.28, 0.62, [0, -0.02, 0.14], [0, 0, 0], 2.0, st.accent));
      R.capes.push(addCape(R, 'hips', a.robe, 0.24, 0.34, 0.66, [0, -0.02, -0.13], [0, PI, 0], 1.8, st.accent));
      for (const sd of [-1, 1]) R.capes.push(addCape(R, 'hips', a.robe, 0.12, 0.17, 0.55, [sd * 0.16, -0.02, 0.0], [0, sd * PI / 2, 0], 2.0, st.accent));
      R.capes.push(addCape(R, 'spine2', a.robe, 0.34, 0.58, 1.22, [0, 0.2, -0.15], [0, PI, 0], 1.1, st.accent));
    } else if (c === 'lame') {
      const pd = new T.Group(); pd.add(mesh(new T.ConeGeometry(0.13, 0.24, 5), a.armor, [0, 0, 0], [0, 0, 0.9], [1, 1, 0.8], true)); pd.add(mesh(new T.ConeGeometry(0.03, 0.18, 4), a.glow, [0.06, 0.08, 0], [0, 0, 0.5]));
      add('spine2', pd, [0.2, 0.18, 0], [0, 0, 0]);
      const mask = new T.Group(); mask.add(mesh(box(0.2, 0.06, 0.04), a.dark, [0, 0, 0])); mask.add(mesh(box(0.16, 0.012, 0.045), a.glow, [0, 0.005, 0.005]));
      add('head', mask, [0, 0.09, 0.1]);
      for (const sd of [-1, 1]) R.capes.push(addCape(R, 'spine2', a.cloth, 0.07, 0.04, 1.25, [sd * 0.06, 0.27, -0.1], [0, PI, sd * 0.12], 0.75, st.accent));
      R.ghosts = [makeGhost(R, st.accent), makeGhost(R, st.accent)];
    }
    for (const [, bk] of buckets) { const m = mergeByMat(bk); while (bk.children.length) bk.remove(bk.children[0]); while (m.children.length) bk.add(m.children[0]); }
    return parts;
  }
  function addCape(R, key, mat, w0, w1, h, pos, rot, stiff, trimCol, stars) {
    const m = capeMat(mat, h, stiff);
    const cm = new T.Mesh(capeGeo(w0, w1, h), m); cm.castShadow = false;
    const grp = new T.Group(); grp.add(cm);
    if (trimCol) m.userData.u.uTrim.value.copy(hdr(trimCol, 2.5));
    attachCS(R, key, grp, pos, rot);
    return m.userData.u;
  }
  function makeDrone(c) {
    const a = accMats(c), g = new T.Group();
    g.add(mesh(new T.SphereGeometry(0.16, 16, 10), a.armor, [0, 0, 0], null, [1, 0.75, 1], true));
    g.add(mesh(new T.TorusGeometry(0.24, 0.02, 6, 28), a.dark, [0, 0, 0], [PI / 2, 0, 0]));
    g.add(mesh(new T.TorusGeometry(0.24, 0.008, 6, 28), a.glow, [0, 0.015, 0], [PI / 2, 0, 0]));
    const eye = mesh(new T.SphereGeometry(0.05, 10, 8), a.glow, [0, -0.02, 0.13]); eye.userData.noMerge = true; g.add(eye);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr(STYLE[c].accent, 1.2), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); sp.scale.set(0.5, 0.5, 1); g.add(sp);
    g.userData.eye = eye; scene.add(g); return g;
  }
  // image rémanente (Lame) : copie du squelette figée, matériau fantôme
  function makeGhost(R, col) {
    const gh = cloneSkinned(A.trooper);
    const mat = new T.MeshBasicMaterial({ color: hdr(col, 1.6), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, skinning: true });
    gh.traverse(o => { if (o.isMesh) { o.material = mat; o.frustumCulled = false; if (R.st.headless) { if (o.name.includes('visor')) o.visible = false; else if (o.isSkinnedMesh) o.geometry = headlessGeo(o); } } });
    const bonesA = [], bonesB = []; R.model.traverse(o => { if (o.isBone) bonesA.push(o); }); gh.traverse(o => { if (o.isBone) bonesB.push(o); });
    gh.visible = false; scene.add(gh);
    return { o: gh, mat, A: bonesA, B: bonesB, t: 1 };
  }
  function spawnGhost(R) {
    if (!R.ghosts) return;
    const g = R.ghosts.find(x => x.t >= 1) || R.ghosts[0];
    for (let i = 0; i < g.A.length && i < g.B.length; i++) { g.B[i].quaternion.copy(g.A[i].quaternion); g.B[i].position.copy(g.A[i].position); g.B[i].scale.copy(g.A[i].scale); }
    R.model.updateMatrixWorld(true); R.model.matrixWorld.decompose(g.o.position, g.o.quaternion, g.o.scale);
    g.o.visible = true; g.t = 0;
  }

  // ---------- spécialisations : arme, posture, attaques ----------
  // grip : position/rotation (espace personnage) de l'arme dans la main droite au repos (bras le long du corps)
  const SPEC = {
    rempart: { main: [W_sword, [0, -0.07, 0.03], [2.45, 0, 0]], off: [W_tower, 'lfore', [0.02, -0.22, -0.03], [1.8, 0, 0]],
      stance: 'shieldGuard', autos: ['slashR', 'bash', 'slashR', 'thrust'], cad: [1.25, 1.7], melee: true },
    briseligne: { main: [W_hammer, [0, -0.07, 0.03], [2.5, 0, 0]], stance: 'hammerReady', autos: ['slam', 'sweep2h'], cad: [1.7, 2.3], melee: true, heavy: true },
    gardienflux: { main: [W_fist, [0, -0.08, 0.0], [PI, 0, 0]], off: [W_fist, 'lhand', [0, -0.08, 0.0], [PI, 0, 0]], stance: 'fluxGuard', autos: ['palmR', 'palmL', 'palmR', 'spinKick'], cad: [0.85, 1.15], melee: true },
    harmonie: { main: [W_ringstaff, [0, -0.07, 0.02], [0.05, 0, 0]], stance: 'staffRest', heal: 'fluxWave', cad: [1.6, 2.2] },
    nanochir: { main: [W_pistol, [0, -0.08, 0.03], [PI / 2 + 0.1, 0, 0]], stance: 'pistolLow', heal: 'pistolShot', cad: [1.3, 1.9], drone: true },
    toxine: { main: [W_sprayer, 'spine', [-0.16, 0.02, 0.12], [-0.05, 0.08, 0]], stance: 'rifleHip', autos: ['spray', 'spray', 'spray', 'grenade'], cad: [0.75, 1.0], drone: true },
    aube: { main: [W_scepter, [0, -0.07, 0.02], [0.7, 0, 0]], stance: 'scepterRest', heal: 'scepterCast', cad: [1.7, 2.3] },
    supernova: { main: [W_scepter, [0, -0.07, 0.02], [0.7, 0, 0]], off: [W_orb, 'lhand', [0.02, -0.14, 0.06], [0, 0, 0]], stance: 'scepterRest', autos: ['orbPush', 'orbPush', 'comet'], cad: [1.1, 1.4] },
    precision: { main: [W_sniper, 'spine2', [-0.14, 0.12, 0.1], [-0.18, 0.04, 0]], stance: 'sniperKneel', autos: ['snipe', 'snipe', 'reload'], cad: [1.0, 1.3] },
    demolition: { main: [W_launcher, 'spine2', [-0.2, 0.2, 0.0], [0, 0, 0]], stance: 'launcher', autos: ['rocket', 'rocket', 'rocket2'], cad: [1.4, 1.8] },
    ombre: { main: [W_dagger, [0, -0.07, 0.0], [PI, 0, 0]], off: [W_dagger, 'lhand', [0, -0.07, 0.0], [PI, 0, 0]], stance: 'daggerCrouch', autos: ['stabR', 'stabL', 'stabR', 'stabL', 'blink'], cad: [0.6, 0.8], melee: true },
    gardien: { main: [W_lightblade, [0, -0.07, 0.03], [2.45, 0, 0]], off: [W_lightshield, 'lfore', [0.02, -0.22, -0.03], [1.8, 0, 0]],
      stance: 'gardGuard', autos: ['slashR', 'thrust', 'bash', 'slashR', 'riposte'], cad: [1.15, 1.6], melee: true },
    duel: { main: [W_katana, [0, -0.07, 0.03], [2.2, 0, 0]], stance: 'katanaReady', autos: ['iaiR', 'iaiL', 'iaiR', 'dash'], cad: [0.95, 1.2], melee: true },
    titan: { main: [W_titanHammer, [0, -0.07, 0.03], [2.45, 0, 0]], off: [W_slab, 'lfore', [0.03, -0.22, -0.03], [1.8, 0, 0]], stance: 'titanGuard', autos: ['tSmash', 'tBash', 'tSwing', 'tSmash'], cad: [1.5, 2.0], melee: true, heavy: true },
    medic: { main: [W_medgun, [0, -0.08, 0.03], [PI / 2 + 0.1, 0, 0]], stance: 'medicReady', heal: 'medicBeam', cad: [1.3, 1.9], drone: true },
    seraphe: { main: [W_scepter, [0, -0.07, 0.02], [0.7, 0, 0]], stance: 'seraphFloat', heal: 'sCast', cad: [1.7, 2.3] },
    maree: { main: [W_trident, [0, -0.07, 0.02], [0.05, 0, 0]], stance: 'tideRest', heal: 'tideFlow', cad: [1.5, 2.1] },
    lameombre: { main: [W_sabre, [0, -0.07, 0.03], [2.3, 0, 0]], off: [W_sabre, 'lhand', [0, -0.07, 0.03], [2.3, 0, 0]], stance: 'sabreCrouch', autos: ['sabreR', 'sabreL', 'sabreR', 'sabreL', 'sabreX'], cad: [0.6, 0.85], melee: true },
    fracasseur: { main: [W_greatsword, [0, -0.07, 0.03], [2.5, 0, 0]], stance: 'gsReady', autos: ['cleave', 'gsSweep', 'rising'], cad: [1.4, 1.9], melee: true, heavy: true },
    spectre: { main: [W_rifle, 'spine2', [-0.14, 0.12, 0.1], [-0.18, 0.04, 0]], stance: 'sniperKneel', autos: ['snipe', 'snipe', 'reload'], cad: [1.1, 1.4] },
    bricoleur: { main: [W_handcannon, 'spine', [-0.15, 0.02, 0.13], [-0.05, 0.08, 0]], stance: 'cannonHip', autos: ['cannon', 'cannon', 'bomb'], cad: [1.2, 1.6] },
  };

  // ---------- postures (garde de combat) ----------
  const ST = {};
  ST.neutral = {};
  ST.shieldGuard = M(crouch(0, 0.16, 0.16), { spine: [0.06, 0.18, 0], spine2: [0.04, 0.1, 0], head: [-0.05, -0.25, 0],
    larm: [-0.55, -0.2, 0.25], lfore: [-1.25, -0.15, 0], rarm: [-0.25, -0.15, -0.3], rfore: [-0.75, 0.2, 0], rhand: [0, 0, 0],
    rup: [-0.32, 0, -0.06], rleg: [0.32, 0, 0], lup: [0.0, 0, 0.08], lleg: [0.32, 0, 0] });
  ST.gardGuard = M(crouch(0, 0.14, 0.14), { spine: [0.04, 0.22, 0], spine2: [0.02, 0.08, 0], head: [-0.04, -0.26, 0],
    larm: [-0.6, -0.25, 0.25], lfore: [-1.3, -0.15, 0], rarm: [-0.4, -0.25, -0.35], rfore: [-0.9, -0.2, 0], rhand: [0.5, 0, 0],
    rup: [-0.3, 0, -0.06], rleg: [0.3, 0, 0], lup: [0.02, 0, 0.08], lleg: [0.3, 0, 0] });
  ST.hammerReady = M(crouch(0, 0.18), { spine: [0.1, -0.25, 0], spine2: [0.05, -0.1, 0], head: [0, 0.3, 0],
    rarm: [-0.55, 0.45, -0.25], rfore: [-1.2, 0.5, 0], larm: [-0.75, -0.25, 0.1], lfore: [-1.0, -0.6, 0] });
  ST.fluxGuard = M(crouch(0, 0.28, 0.2), { spine: [0.1, 0.35, 0], spine2: [0.02, 0.1, 0], head: [-0.05, -0.4, 0],
    larm: [-1.25, -0.35, 0.0], lfore: [-0.35, -0.2, 0], lhand: [0.6, 0, 0], rarm: [0.15, 0.1, -0.2], rfore: [-1.6, 0.3, 0],
    rup: [-0.55, 0, -0.05], rleg: [0.55, 0, 0], lup: [0.0, 0, 0.1], lleg: [0.45, 0, 0] });
  ST.staffRest = { spine: [0.02, 0, 0], rarm: [-0.3, 0.1, -0.12], rfore: [-0.6, 0.15, 0], larm: [-0.55, -0.6, 0.1], lfore: [-1.4, -0.4, 0], head: [0.05, 0, 0] };
  ST.pistolLow = { rarm: [-0.55, 0.15, -0.15], rfore: [-0.6, 0.0, 0], larm: [-0.2, 0, 0.05], lfore: [-0.5, 0, 0], spine: [0.03, 0.05, 0] };
  ST.rifleHip = M(crouch(0, 0.12), { spine: [0.06, 0.1, 0], head: [0, -0.1, 0], rarm: [-0.2, 0.1, -0.25], rfore: [-1.2, 0.3, 0], larm: [-0.7, -0.45, 0.15], lfore: [-1.0, -0.4, 0] });
  ST.scepterRest = { spine: [-0.03, 0, 0], head: [-0.06, 0, 0], rarm: [-0.35, 0.1, -0.18], rfore: [-0.7, 0.2, 0], larm: [-0.5, -0.35, 0.18], lfore: [-1.1, -0.25, 0], lhand: [0, 0, 0.3],
    rup: [-0.12, 0, 0], rleg: [0.35, 0, 0], lup: [0.05, 0, 0], lleg: [0.12, 0, 0] };
  ST.sniperKneel = M(kneel, { spine: [0.12, 0.0, 0], spine2: [0.04, 0, 0], head: [0.1, 0.1, -0.12],
    rarm: [-0.75, 0.15, -0.55], rfore: [-1.45, 0.35, 0], larm: [-1.35, -0.35, 0.15], lfore: [-0.35, -0.3, 0] });
  ST.launcher = M(crouch(0, 0.14), { spine: [0.04, 0.05, 0], head: [0.08, 0.05, -0.15], rarm: [-0.45, 0.2, -0.45], rfore: [-1.45, 0.25, 0], larm: [-1.25, -0.5, 0.1], lfore: [-0.55, -0.35, 0] });
  ST.daggerCrouch = M(crouch(0, 0.42, 0.35), { spine: [0.32, 0.1, 0], spine2: [0.1, 0, 0], head: [-0.4, -0.1, 0],
    rarm: [-0.3, -0.2, -0.45], rfore: [-0.95, 0.1, 0], larm: [-0.35, 0.2, 0.45], lfore: [-0.95, -0.1, 0], rup: [-0.6, 0, -0.08], lup: [-0.25, 0, 0.12] });
  ST.katanaReady = M(crouch(0, 0.24, 0.2), { spine: [0.14, 0.45, 0], spine2: [0.03, 0.12, 0], head: [-0.1, -0.5, 0],
    rarm: [-0.75, 0.6, -0.25], rfore: [-0.9, 0.4, 0], larm: [-0.85, -0.2, 0.15], lfore: [-1.15, 0.2, 0], rup: [-0.45, 0, -0.06], rleg: [0.45, 0, 0], lup: [0.05, 0, 0.1] });
  // incantations du joueur (soins) et canalisations
  ST.castOracle = { spine: [-0.08, 0.1, 0], head: [-0.15, 0, 0], rarm: [-1.5, 0.15, -0.25], rfore: [-0.35, 0, 0], larm: [-1.0, -0.6, 0.25], lfore: [-0.6, -0.3, 0], lhand: [0, 0, 0.4] };
  ST.castMedic = { spine: [0.05, 0.25, 0], head: [0, -0.25, 0], rarm: [-1.45, 0.3, -0.05], rfore: [-0.1, 0.1, 0], larm: [-1.1, -0.4, 0.2], lfore: [-0.9, -0.45, 0] };
  ST.channelOracle = { spine: [-0.22, 0, 0], spine2: [-0.1, 0, 0], head: [-0.4, 0, 0], rarm: [-2.6, 0, -0.35], rfore: [-0.2, 0, 0], larm: [-2.6, 0, 0.35], lfore: [-0.2, 0, 0], lift: 1 };
  ST.channelMedic = { spine: [-0.1, 0, 0], head: [-0.3, 0, 0], rarm: [-2.4, 0.1, -0.3], rfore: [-0.2, 0, 0], larm: [-0.6, -0.3, 0.3], lfore: [-1.2, -0.3, 0] };
  // ---------- postures des races (v5) ----------
  ST.titanGuard = M(crouch(0, 0.22, 0.2), { spine: [0.1, 0.3, 0], spine2: [0.05, 0.08, 0], head: [-0.08, -0.32, 0],
    larm: [-0.5, -0.35, 0.3], lfore: [-1.15, -0.2, 0], rarm: [-0.15, 0.25, -0.35], rfore: [-1.2, 0.25, 0], rhand: [0.25, 0, 0],
    rup: [-0.4, 0, -0.14], rleg: [0.4, 0, 0], lup: [0.02, 0, 0.16], lleg: [0.32, 0, 0] });
  ST.medicReady = { spine: [-0.02, 0.06, 0], head: [-0.05, 0.12, 0.1], rarm: [-0.55, 0.15, -0.15], rfore: [-0.75, 0, 0], larm: [-0.25, -0.1, 0.12], lfore: [-0.65, 0, 0], lhand: [0.2, 0, 0.3] };
  ST.seraphFloat = { spine: [-0.06, 0, 0], head: [-0.1, 0, 0], rarm: [-0.35, 0.1, -0.25], rfore: [-0.7, 0.2, 0], larm: [-0.25, -0.2, 0.5], lfore: [-0.55, -0.2, 0], lhand: [0, 0, 0.5],
    rup: [-0.18, 0, -0.03], rleg: [0.5, 0, 0], rfoot: [0.5, 0, 0], lup: [0.05, 0, 0.03], lleg: [0.28, 0, 0], lfoot: [0.5, 0, 0] };
  ST.tideRest = M(crouch(0, 0.14), { spine: [0.1, 0.05, 0], spine2: [0.04, 0, 0], head: [-0.08, 0, 0], rarm: [-0.3, 0.1, -0.15], rfore: [-0.65, 0.15, 0],
    larm: [-0.75, -0.45, 0.25], lfore: [-0.85, -0.3, 0], lhand: [0.3, 0, 0.6] });
  ST.sabreCrouch = M(crouch(0, 0.42, 0.34), { spine: [0.32, 0.15, 0], spine2: [0.08, 0, 0], head: [-0.36, -0.15, 0],
    rarm: [-0.6, 0.1, -0.45], rfore: [-1.05, 0.2, 0], rhand: [0.25, 0, 0], larm: [0.1, 0.15, 0.55], lfore: [-0.7, -0.1, 0], lhand: [0.5, 0, 0],
    rup: [-0.66, 0, -0.1], lup: [-0.2, 0, 0.14] });
  ST.gsReady = M(crouch(0, 0.26, 0.22), { spine: [0.16, -0.3, 0], spine2: [0.06, -0.1, 0], head: [-0.12, 0.2, 0],
    rarm: [-0.35, 0.25, -0.35], rfore: [-0.95, 0.35, 0], larm: [-0.6, -0.4, 0.02], lfore: [-0.95, -0.5, 0],
    rup: [-0.46, 0, -0.1], rleg: [0.46, 0, 0], lup: [-0.05, 0, 0.14], lleg: [0.36, 0, 0] });
  ST.cannonHip = M(crouch(0, 0.18), { spine: [0.08, 0.12, 0], head: [0.0, -0.12, 0], rarm: [-0.2, 0.1, -0.28], rfore: [-1.25, 0.3, 0], larm: [-0.7, -0.45, 0.15], lfore: [-1.0, -0.4, 0] });

  const STZ = {}; for (const k in ST) STZ[k] = pz(ST[k]);

  // ---------- actions (images clés) ----------
  // keys : [t (0..1), pose, easing] ; ev : [t, nom] ; trail : [t0, t1] ; lunge : [[t, k]] (fraction de l'élan vers la cible)
  const A2 = {};
  const G = ST;
  A2.slashR = { dur: 0.62, keys: [[0, G.shieldGuard], [0.38, M(G.shieldGuard, { spine: [0.0, 0.55, 0], rarm: [-2.3, -0.3, -0.5], rfore: [-0.6, 0.3, 0], head: [0, -0.4, 0] }), 'out'],
    [0.6, M(G.shieldGuard, { spine: [0.25, -0.35, 0], spine2: [0.1, -0.15, 0], rarm: [-0.55, 1.25, -0.2], rfore: [-0.2, 0.2, 0], head: [0, 0.1, 0] }), 'in'], [1, G.shieldGuard, 'io']],
    ev: [[0.56, 'hit']], trail: [0.36, 0.7], lunge: [[0, 0], [0.5, 0.55], [0.75, 0.6], [1, 0]] };
  A2.thrust = { dur: 0.55, keys: [[0, G.shieldGuard], [0.35, M(G.shieldGuard, { spine: [-0.05, 0.35, 0], rarm: [-0.6, -0.1, -0.5], rfore: [-1.6, 0.2, 0] }), 'out'],
    [0.55, M(G.shieldGuard, { spine: [0.2, -0.2, 0], rarm: [-1.55, 0.25, -0.1], rfore: [0.0, 0, 0], larm: [-0.6, -0.3, 0.4] }), 'in'], [1, G.shieldGuard, 'io']],
    ev: [[0.52, 'hit']], trail: [0.38, 0.62], lunge: [[0, 0], [0.5, 0.8], [0.7, 0.8], [1, 0]] };
  A2.bash = { dur: 0.6, keys: [[0, G.shieldGuard], [0.35, M(G.shieldGuard, { spine: [-0.08, -0.35, 0], larm: [-0.9, -0.2, 0.3], lfore: [-1.2, -0.1, 0] }), 'out'],
    [0.55, M(G.shieldGuard, { spine: [0.25, 0.45, 0], larm: [-1.35, -0.85, 0.1], lfore: [-0.6, -0.5, 0] }), 'in'], [1, G.shieldGuard, 'io']],
    ev: [[0.52, 'bash']], lunge: [[0, 0], [0.5, 1], [0.7, 1], [1, 0]] };
  A2.slam = { dur: 1.0, keys: [[0, G.hammerReady], [0.42, M(crouch(0, 0.05), { spine: [-0.4, 0, 0], spine2: [-0.15, 0, 0], head: [-0.2, 0, 0], rarm: [-2.9, 0.1, -0.15], rfore: [-0.4, 0, 0], larm: [-2.8, -0.1, 0.15], lfore: [-0.5, 0, 0] }), 'out'],
    [0.55, M(crouch(0, 0.45), { spine: [0.55, 0, 0], spine2: [0.2, 0, 0], head: [0.15, 0, 0], rarm: [-1.1, 0.2, -0.1], rfore: [-0.1, 0, 0], larm: [-1.0, -0.2, 0.1], lfore: [-0.1, 0, 0] }), 'in'],
    [0.75, M(crouch(0, 0.45), { spine: [0.5, 0, 0], spine2: [0.2, 0, 0], rarm: [-1.0, 0.2, -0.1], rfore: [-0.1, 0, 0], larm: [-0.95, -0.2, 0.1], lfore: [-0.1, 0, 0] })], [1, G.hammerReady, 'io']],
    ev: [[0.55, 'slam']], trail: [0.42, 0.6], lunge: [[0, 0], [0.5, 0.5], [0.8, 0.5], [1, 0]] };
  A2.sweep2h = { dur: 0.9, keys: [[0, G.hammerReady], [0.4, M(G.hammerReady, { spine: [0.0, -1.0, 0], spine2: [0, -0.3, 0], rarm: [-0.9, -0.4, -0.4], larm: [-1.0, -0.8, 0.0] }), 'out'],
    [0.62, M(G.hammerReady, { spine: [0.15, 0.9, 0], spine2: [0, 0.3, 0], rarm: [-1.2, 1.3, -0.1], rfore: [-0.3, 0.3, 0], larm: [-1.3, 0.8, 0.1], lfore: [-0.5, 0, 0] }), 'in'], [1, G.hammerReady, 'io']],
    ev: [[0.56, 'hit']], trail: [0.38, 0.72], lunge: [[0, 0], [0.55, 0.4], [1, 0]] };
  A2.palmR = { dur: 0.45, keys: [[0, G.fluxGuard], [0.3, M(G.fluxGuard, { spine: [0.0, 0.6, 0], rarm: [0.35, 0.2, -0.25], rfore: [-1.8, 0.2, 0] }), 'out'],
    [0.5, M(G.fluxGuard, { spine: [0.15, -0.45, 0], rarm: [-1.5, 0.15, -0.1], rfore: [0, 0, 0], rhand: [0.9, 0, 0], larm: [0.2, 0.2, 0.2], lfore: [-1.6, 0, 0] }), 'in'], [1, G.fluxGuard, 'io']],
    ev: [[0.48, 'palm']], lunge: [[0, 0], [0.45, 0.6], [0.65, 0.6], [1, 0]] };
  A2.palmL = { dur: 0.45, keys: [[0, G.fluxGuard], [0.3, M(G.fluxGuard, { spine: [0.0, 0.0, 0], larm: [0.3, -0.2, 0.25], lfore: [-1.8, -0.2, 0] }), 'out'],
    [0.5, M(G.fluxGuard, { spine: [0.15, 0.75, 0], larm: [-1.55, -0.2, 0.1], lfore: [0, 0, 0], lhand: [0.9, 0, 0] }), 'in'], [1, G.fluxGuard, 'io']],
    ev: [[0.48, 'palmL']], lunge: [[0, 0], [0.45, 0.6], [0.65, 0.6], [1, 0]] };
  A2.spinKick = { dur: 0.8, keys: [[0, G.fluxGuard], [0.25, M(crouch(0, 0.35), { spine: [0.15, 0.6, 0], larm: [-0.8, 0, 0.9], rarm: [-0.8, 0, -0.9], yaw: 0 }), 'out'],
    [0.6, { spine: [-0.2, 0, 0.3], rup: [-1.5, 0, -0.4], rleg: [0.1, 0, 0], lup: [0.15, 0, 0.05], lleg: [0.2, 0, 0], larm: [-0.3, 0, 1.2], rarm: [-0.3, 0, -1.2], yaw: PI * 2, root: [0, 0.18, 0] }, 'io'],
    [1, M(G.fluxGuard, { yaw: PI * 2 }), 'io']],
    ev: [[0.55, 'kick']], trail: [0.3, 0.7], lunge: [[0, 0], [0.5, 0.7], [1, 0]], trailBone: 'rfoot' };
  A2.fluxWave = { dur: 1.3, keys: [[0, G.staffRest], [0.35, M(G.staffRest, { spine: [-0.1, -0.4, 0], rarm: [-1.2, -0.5, -0.4], rfore: [-0.5, 0, 0], larm: [-1.3, -0.2, 0.6], lfore: [-0.4, 0, 0] }), 'io'],
    [0.6, M(G.staffRest, { spine: [0.1, 0.45, 0], rarm: [-1.6, 0.7, -0.1], rfore: [-0.2, 0.2, 0], larm: [-1.5, 0.4, 0.2], lfore: [-0.2, 0, 0], lhand: [0.8, 0, 0] }), 'io'], [1, G.staffRest, 'io']],
    ev: [[0.58, 'heal']], trail: [0.3, 0.65] };
  A2.pistolShot = { dur: 0.9, keys: [[0, G.pistolLow], [0.3, G.castMedic, 'out'], [0.45, M(G.castMedic, { rarm: [-1.6, 0.3, -0.05] }), 'in'], [0.7, G.castMedic], [1, G.pistolLow, 'io']], ev: [[0.42, 'heal']] };
  A2.spray = { dur: 0.7, keys: [[0, G.rifleHip], [0.25, M(G.rifleHip, { rarm: [-0.6, 0.25, -0.25], rfore: [-1.2, 0.55, 0], spine: [0.1, 0.25, 0] }), 'out'], [0.45, M(G.rifleHip, { rarm: [-0.5, 0.2, -0.22], spine: [0.0, 0.3, 0] })], [0.65, M(G.rifleHip, { rarm: [-0.6, 0.25, -0.25], rfore: [-1.2, 0.55, 0] })], [1, G.rifleHip, 'io']],
    ev: [[0.28, 'fire'], [0.48, 'fire'], [0.66, 'fire']] };
  A2.grenade = { dur: 1.0, keys: [[0, G.rifleHip], [0.4, M(G.rifleHip, { spine: [-0.15, 0.6, 0], larm: [-1.0, 0.2, 1.1], lfore: [-1.5, 0, 0], lhand: [0, 0, 0] }), 'out'],
    [0.58, M(G.rifleHip, { spine: [0.25, -0.2, 0], larm: [-2.2, -0.3, 0.2], lfore: [-0.1, 0, 0] }), 'in'], [1, G.rifleHip, 'io']], ev: [[0.56, 'grenade']] };
  A2.scepterCast = { dur: 1.4, keys: [[0, G.scepterRest], [0.45, M(G.castOracle, { lift: 1 }), 'io'], [0.65, M(G.castOracle, { rarm: [-1.9, 0.2, -0.2], spine: [-0.15, 0.1, 0], lift: 1 })], [0.78, M(G.castOracle, { rarm: [-1.3, 0.25, -0.2], rfore: [-0.1, 0, 0], spine: [0.08, 0.1, 0], lift: 1 }), 'in'], [1, G.scepterRest, 'io']],
    ev: [[0.76, 'heal']] };
  A2.orbPush = { dur: 0.85, keys: [[0, G.scepterRest], [0.42, M(G.scepterRest, { spine: [-0.12, -0.35, 0], larm: [-0.6, 0.4, 0.9], lfore: [-1.7, 0, 0], lhand: [0, 0, 0], lift: 1 }), 'out'],
    [0.6, M(G.scepterRest, { spine: [0.12, 0.25, 0], larm: [-1.55, 0.3, 0.05], lfore: [-0.05, 0, 0], lhand: [1.0, 0, 0], lift: 1 }), 'in'], [1, G.scepterRest, 'io']], ev: [[0.58, 'orb']] };
  A2.comet = { dur: 1.5, keys: [[0, G.scepterRest], [0.45, M(G.channelOracle), 'io'], [0.62, M(G.channelOracle, { spine: [-0.3, 0, 0] })], [0.75, M(G.scepterRest, { spine: [0.25, 0, 0], rarm: [-1.4, 0.2, -0.2], larm: [-1.4, -0.2, 0.2], lift: 1 }), 'in'], [1, G.scepterRest, 'io']],
    ev: [[0.5, 'cometCall'], [0.74, 'comet']] };
  A2.snipe = { dur: 1.0, keys: [[0, G.sniperKneel], [0.35, G.sniperKneel], [0.42, M(G.sniperKneel, { spine: [-0.08, 0.4, 0], rarm: [-1.45, 0.6, -0.55], larm: [-1.55, -0.15, 0.25], head: [-0.1, -0.45, 0.05] }), 'out'], [0.8, G.sniperKneel, 'io'], [1, G.sniperKneel]], ev: [[0.02, 'laserOn'], [0.36, 'fire']] };
  A2.reload = { dur: 1.1, keys: [[0, G.sniperKneel], [0.3, M(G.sniperKneel, { larm: [-0.5, 0.35, 0.1], lfore: [-1.5, 0.3, 0], head: [0.3, -0.2, 0] }), 'io'], [0.55, M(G.sniperKneel, { larm: [-0.6, 0.6, 0.0], lfore: [-1.6, 0.6, 0], head: [0.3, -0.2, 0] })], [0.75, M(G.sniperKneel, { larm: [-0.5, 0.35, 0.1], lfore: [-1.5, 0.3, 0] })], [1, G.sniperKneel, 'io']], ev: [[0.5, 'reload']] };
  A2.rocket = { dur: 1.1, keys: [[0, G.launcher], [0.3, M(G.launcher, { spine: [0.0, 0.2, 0] }), 'io'], [0.36, M(G.launcher, { spine: [-0.25, 0.2, 0], spine2: [-0.1, 0, 0], head: [-0.1, -0.15, 0], root: [0, -0.06, -0.08] }), 'out'], [1, G.launcher, 'io']], ev: [[0.31, 'rocket']] };
  A2.rocket2 = { dur: 1.3, keys: [[0, G.launcher], [0.25, M(G.launcher, { spine: [-0.05, 0.25, 0] })], [0.3, M(G.launcher, { spine: [-0.25, 0.2, 0], root: [0, -0.06, -0.08] }), 'out'], [0.5, G.launcher, 'io'], [0.56, M(G.launcher, { spine: [-0.25, 0.1, 0], root: [0, -0.06, -0.08] }), 'out'], [1, G.launcher, 'io']], ev: [[0.26, 'rocket'], [0.52, 'rocket']] };
  A2.stabR = { dur: 0.42, keys: [[0, G.daggerCrouch], [0.35, M(G.daggerCrouch, { spine: [0.2, 0.4, 0], rarm: [0.2, -0.3, -0.6], rfore: [-1.4, 0, 0] }), 'out'], [0.55, M(G.daggerCrouch, { spine: [0.4, -0.3, 0], rarm: [-1.5, 0.25, -0.2], rfore: [-0.1, 0, 0] }), 'in'], [1, G.daggerCrouch, 'io']],
    ev: [[0.52, 'stab']], trail: [0.35, 0.65], lunge: [[0, 0], [0.5, 0.9], [0.7, 0.9], [1, 0]] };
  A2.stabL = { dur: 0.42, keys: [[0, G.daggerCrouch], [0.35, M(G.daggerCrouch, { spine: [0.2, -0.4, 0], larm: [0.2, 0.3, 0.6], lfore: [-1.4, 0, 0] }), 'out'], [0.55, M(G.daggerCrouch, { spine: [0.4, 0.3, 0], larm: [-1.5, -0.25, 0.2], lfore: [-0.1, 0, 0] }), 'in'], [1, G.daggerCrouch, 'io']],
    ev: [[0.52, 'stabL']], trail: [0.35, 0.65], trailOff: true, lunge: [[0, 0], [0.5, 0.9], [0.7, 0.9], [1, 0]] };
  A2.blink = { dur: 1.0, keys: [[0, G.daggerCrouch], [0.2, M(G.daggerCrouch, { spine: [0.5, 0, 0] })], [0.5, M(G.daggerCrouch, { spine: [0.1, 0.9, 0], rarm: [-1.8, 1.0, -0.3], rfore: [-0.1, 0, 0], larm: [-1.8, -1.0, 0.3], lfore: [-0.1, 0, 0], yaw: 0 }), 'in'],
    [0.68, M(G.daggerCrouch, { spine: [0.4, -0.6, 0], rarm: [-0.6, -0.8, -0.8], larm: [-0.6, 0.8, 0.8], yaw: 0 }), 'out'], [1, G.daggerCrouch, 'io']],
    ev: [[0.22, 'vanish'], [0.42, 'appear'], [0.6, 'cross'], [0.85, 'return']], trail: [0.42, 0.72], blink: [0.22, 0.85] };
  A2.iaiR = { dur: 0.55, keys: [[0, G.katanaReady], [0.3, M(G.katanaReady, { spine: [0.1, 0.8, 0], rarm: [-1.1, 0.9, -0.2], rfore: [-1.0, 0.4, 0] }), 'out'],
    [0.5, M(G.katanaReady, { spine: [0.25, -0.5, 0], rarm: [-1.1, -0.9, -0.6], rfore: [-0.1, 0, 0], larm: [-0.4, 0.2, 0.6], lfore: [-0.4, 0, 0] }), 'in'], [1, G.katanaReady, 'io']],
    ev: [[0.46, 'hit']], trail: [0.28, 0.62], lunge: [[0, 0], [0.45, 0.85], [0.65, 0.85], [1, 0]] };
  A2.iaiL = { dur: 0.55, keys: [[0, G.katanaReady], [0.3, M(G.katanaReady, { spine: [0.0, -0.5, 0], rarm: [-2.2, -0.4, -0.5], rfore: [-0.5, 0, 0] }), 'out'],
    [0.5, M(G.katanaReady, { spine: [0.35, 0.6, 0], rarm: [-0.4, 1.0, -0.2], rfore: [-0.3, 0, 0] }), 'in'], [1, G.katanaReady, 'io']],
    ev: [[0.46, 'hit']], trail: [0.28, 0.62], lunge: [[0, 0], [0.45, 0.85], [0.65, 0.85], [1, 0]] };
  A2.dash = { dur: 0.9, keys: [[0, G.katanaReady], [0.25, M(crouch(0, 0.5, 0.3), { spine: [0.45, 0.5, 0], rarm: [-0.3, 0.6, -0.5], rfore: [-1.2, 0.4, 0] }), 'out'],
    [0.5, M(crouch(0, 0.45, 0.3), { spine: [0.35, -0.7, 0], rarm: [-1.4, -1.1, -0.7], rfore: [0, 0, 0], larm: [-0.3, 0.4, 1.0] }), 'in'], [0.75, M(crouch(0, 0.4, 0.3), { spine: [0.3, -0.7, 0], rarm: [-1.2, -1.2, -0.7], rfore: [0, 0, 0], larm: [-0.3, 0.4, 1.0] })], [1, G.katanaReady, 'io']],
    ev: [[0.3, 'ghost'], [0.38, 'ghost'], [0.46, 'hit'], [0.46, 'ghost']], trail: [0.3, 0.6], lunge: [[0, 0], [0.25, 0.1], [0.45, 1.25], [0.8, 1.25], [1, 0]] };
  // sorts et gestes partagés
  A2.castRelease = { dur: 0.5, keys: [[0, G.castOracle], [0.35, M(G.castOracle, { rarm: [-1.2, 0.25, -0.15], rfore: [0, 0, 0], spine: [0.12, 0.1, 0] }), 'in'], [1, G.scepterRest, 'io']] };
  A2.medicRelease = { dur: 0.45, keys: [[0, G.castMedic], [0.25, M(G.castMedic, { rarm: [-1.75, 0.3, -0.05], spine: [-0.08, 0.25, 0] }), 'out'], [1, G.pistolLow, 'io']] };
  A2.prism = { dur: 0.6, keys: [[0, G.scepterRest], [0.4, M(G.scepterRest, { larm: [-1.6, -0.3, 0.2], lfore: [0, 0, 0], lhand: [0.9, 0, 0], spine: [0, -0.2, 0] }), 'out'], [1, G.scepterRest, 'io']] };
  A2.haloCast = { dur: 0.9, keys: [[0, G.castOracle], [0.4, M(G.scepterRest, { rarm: [-0.5, 0, -1.3], larm: [-0.5, 0, 1.3], rfore: [0, 0, 0], lfore: [0, 0, 0], spine: [-0.15, 0, 0], head: [-0.2, 0, 0], lift: 1 }), 'out'], [1, G.scepterRest, 'io']] };
  A2.injector = { dur: 0.6, keys: [[0, G.pistolLow], [0.35, M(G.castMedic, { rarm: [-1.3, 0.4, -0.05] }), 'out'], [1, G.pistolLow, 'io']] };
  A2.swarmSend = { dur: 0.8, keys: [[0, G.pistolLow], [0.4, M(G.pistolLow, { larm: [-2.3, 0, 0.3], lfore: [-0.2, 0, 0], spine: [-0.1, -0.1, 0] }), 'out'], [0.6, M(G.pistolLow, { larm: [-1.5, 0.3, 0.1], lfore: [0, 0, 0], lhand: [0.8, 0, 0] }), 'in'], [1, G.pistolLow, 'io']] };
  A2.purify = { dur: 0.55, keys: [[0, null], [0.35, { larm: [-1.4, -0.4, 0.2], lfore: [-0.3, 0, 0], lhand: [0.6, 0, 0], spine: [-0.05, -0.15, 0] }, 'out'], [1, null, 'io']] };
  A2.brace = { dur: 0.8, keys: [[0, G.shieldGuard], [0.3, M(crouch(0, 0.4, 0.35), { spine: [0.25, 0.05, 0], spine2: [0.1, 0, 0], head: [-0.15, 0, 0], larm: [-1.35, -0.75, 0.0], lfore: [-0.5, -0.4, 0], rarm: [-0.2, 0, -0.3], rfore: [-1.0, 0.3, 0] }), 'out'], [0.75, M(crouch(0, 0.4, 0.35), { spine: [0.25, 0.05, 0], larm: [-1.35, -0.75, 0.0], lfore: [-0.5, -0.4, 0], rarm: [-0.2, 0, -0.3], rfore: [-1.0, 0.3, 0] })], [1, G.shieldGuard, 'io']], ev: [[0.3, 'barrier']] };
  A2.steel = { dur: 1.2, keys: [[0, G.shieldGuard], [0.35, M(crouch(0, 0.1), { spine: [-0.25, 0, 0], head: [-0.25, 0, 0], rarm: [-2.8, 0, -0.1], rfore: [-0.1, 0, 0], larm: [-0.5, 0, 0.8] }), 'out'],
    [0.55, M(crouch(0, 0.55, 0.4), { spine: [0.5, 0, 0], head: [0.1, 0, 0], rarm: [-0.6, 0, -0.1], rfore: [0, 0, 0], larm: [-0.9, -0.5, 0.3] }), 'in'], [0.85, M(crouch(0, 0.55, 0.4), { spine: [0.45, 0, 0], rarm: [-0.6, 0, -0.1], larm: [-0.9, -0.5, 0.3] })], [1, G.shieldGuard, 'io']], ev: [[0.55, 'steel']] };
  A2.taunt = { dur: 0.9, keys: [[0, null], [0.3, { spine: [-0.15, 0.2, 0], head: [-0.2, -0.1, 0], rarm: [-1.6, 0.1, -0.2], rfore: [0, 0, 0] }, 'out'], [0.6, { spine: [-0.15, 0.2, 0], head: [-0.2, -0.1, 0], rarm: [-1.55, 0.1, -0.2], rfore: [0, 0, 0] }], [1, null, 'io']], ev: [[0.3, 'taunt']] };
  A2.shout = { dur: 1.0, keys: [[0, null], [0.3, { spine: [-0.3, 0, 0], spine2: [-0.15, 0, 0], head: [-0.35, 0, 0], rarm: [-0.6, 0, -1.0], larm: [-0.6, 0, 1.0], rfore: [-0.6, 0, 0], lfore: [-0.6, 0, 0] }, 'out'], [0.7, { spine: [-0.3, 0, 0], head: [-0.35, 0, 0], rarm: [-0.6, 0, -1.0], larm: [-0.6, 0, 1.0], rfore: [-0.6, 0, 0], lfore: [-0.6, 0, 0] }], [1, null, 'io']], ev: [[0.3, 'shout']] };
  A2.meditate = { dur: 1.4, keys: [[0, G.fluxGuard], [0.3, M(crouch(0, 0.25), { spine: [-0.1, 0, 0], head: [0.15, 0, 0], rarm: [-0.9, 0.7, -0.1], rfore: [-1.1, 0.6, 0], larm: [-0.9, -0.7, 0.1], lfore: [-1.1, -0.6, 0], lift: 1 }), 'io'], [0.75, M(crouch(0, 0.25), { spine: [-0.1, 0, 0], head: [0.15, 0, 0], rarm: [-0.9, 0.7, -0.1], rfore: [-1.1, 0.6, 0], larm: [-0.9, -0.7, 0.1], lfore: [-1.1, -0.6, 0], lift: 1 })], [1, G.fluxGuard, 'io']], ev: [[0.35, 'meditate']] };
  A2.evade = { dur: 0.7, keys: [[0, G.fluxGuard], [0.35, M(G.fluxGuard, { root: [0.45, 0, -0.2], yaw: 0.6, spine: [0.1, 0.4, 0.3] }), 'out'], [0.6, M(G.fluxGuard, { root: [0.45, 0, -0.2], yaw: 0.6, spine: [0.1, 0.4, 0.3] })], [1, G.fluxGuard, 'io']], ev: [[0.15, 'evade']] };
  A2.fluxCut = { dur: 0.6, keys: [[0, G.fluxGuard], [0.3, M(G.fluxGuard, { spine: [-0.1, 0.6, 0], rarm: [-0.5, 1.0, -0.3], rfore: [-1.0, 0, 0] }), 'out'], [0.5, M(G.fluxGuard, { spine: [0.15, -0.5, 0], rarm: [-1.5, -0.6, -0.4], rfore: [0, 0, 0], rhand: [0, 0, -0.5] }), 'in'], [1, G.fluxGuard, 'io']], ev: [[0.48, 'cut']], trail: [0.3, 0.6] };
  A2.shieldThrow = { dur: 0.7, keys: [[0, G.shieldGuard], [0.3, M(G.shieldGuard, { spine: [0, -0.6, 0], larm: [-0.8, 0.6, 0.6], lfore: [-1.4, 0, 0] }), 'out'], [0.5, M(G.shieldGuard, { spine: [0.2, 0.6, 0], larm: [-1.5, -0.6, 0.3], lfore: [-0.1, 0, 0] }), 'in'], [1, G.shieldGuard, 'io']], ev: [[0.48, 'kick']] };
  // Gardien
  A2.riposte = { dur: 0.95, keys: [[0, G.gardGuard], [0.2, M(G.gardGuard, { spine: [0.05, -0.55, 0], spine2: [0.02, -0.2, 0], rarm: [-0.9, -0.95, 0.35], rfore: [-1.45, 0, 0], head: [0, 0.3, 0] }), 'out'],
    [0.36, M(G.gardGuard, { spine: [0.12, 0.5, 0], spine2: [0.04, 0.15, 0], rarm: [-2.1, 0.95, -0.55], rfore: [-0.3, 0, 0], head: [0, -0.35, 0] }), 'in'],
    [0.56, M(G.gardGuard, { spine: [-0.12, 0.2, 0], rarm: [-2.85, 0.2, -0.3], rfore: [-0.45, 0, 0], head: [-0.1, -0.2, 0] }), 'io'],
    [0.72, M(G.gardGuard, { spine: [0.38, -0.15, 0], spine2: [0.12, 0, 0], rarm: [-0.75, 0.3, -0.1], rfore: [-0.1, 0, 0], head: [0.15, 0, 0] }), 'in'], [1, G.gardGuard, 'io']],
    ev: [[0.34, 'hit'], [0.7, 'hit']], trail: [0.18, 0.78], lunge: [[0, 0], [0.3, 0.5], [0.7, 0.75], [1, 0]] };
  A2.aegis = { dur: 1.15, keys: [[0, G.gardGuard], [0.28, M(crouch(0, 0.3, 0.25), { spine: [-0.08, 0.05, 0], head: [-0.15, 0, 0], larm: [-1.95, -0.25, 0.15], lfore: [-0.55, 0, 0], rarm: [-0.35, 0.3, -0.25], rfore: [-0.9, 0.3, 0] }), 'out'],
    [0.8, M(crouch(0, 0.3, 0.25), { spine: [-0.06, 0.05, 0], head: [-0.15, 0, 0], larm: [-1.9, -0.25, 0.15], lfore: [-0.55, 0, 0], rarm: [-0.35, 0.3, -0.25], rfore: [-0.9, 0.3, 0] })], [1, G.gardGuard, 'io']], ev: [[0.3, 'aegis']] };
  A2.gTaunt = { dur: 1.1, keys: [[0, G.gardGuard], [0.32, M(crouch(0, 0.05), { spine: [-0.14, 0.1, 0], head: [-0.32, 0, 0], rarm: [-3.0, 0.1, -0.15], rfore: [-0.1, 0, 0], larm: [-0.7, -0.3, 0.3], lfore: [-1.2, -0.1, 0] }), 'out'],
    [0.72, M(crouch(0, 0.05), { spine: [-0.12, 0.1, 0], head: [-0.3, 0, 0], rarm: [-2.95, 0.1, -0.15], rfore: [-0.1, 0, 0], larm: [-0.7, -0.3, 0.3], lfore: [-1.2, -0.1, 0] })], [1, G.gardGuard, 'io']], ev: [[0.38, 'beacon']] };
  // ---------- actions des races (v5) ----------
  // Titan : marteau à une main + pavois
  const TG = G.titanGuard;
  A2.tSmash = { dur: 1.0, keys: [[0, TG], [0.42, M(TG, { spine: [-0.22, 0.15, 0], spine2: [-0.1, 0, 0], head: [-0.15, -0.1, 0], rarm: [-2.9, 0.1, -0.3], rfore: [-0.6, 0, 0], rhand: [0, 0, 0] }), 'out'],
    [0.58, M(TG, { spine: [0.42, -0.1, 0], spine2: [0.15, 0, 0], head: [0.1, -0.1, 0], rarm: [-0.9, 0.1, -0.12], rfore: [-0.15, 0, 0], rhand: [0.2, 0, 0] }), 'in'],
    [0.78, M(TG, { spine: [0.38, -0.1, 0], spine2: [0.12, 0, 0], rarm: [-0.95, 0.1, -0.12], rfore: [-0.2, 0, 0] })], [1, TG, 'io']],
    ev: [[0.58, 'smash']], trail: [0.44, 0.62], lunge: [[0, 0], [0.55, 0.5], [0.8, 0.5], [1, 0]] };
  A2.tSwing = { dur: 0.85, keys: [[0, TG], [0.4, M(TG, { spine: [0.0, 0.6, 0], rarm: [-1.4, -0.9, -0.9], rfore: [-0.9, 0, 0] }), 'out'],
    [0.6, M(TG, { spine: [0.25, -0.5, 0], spine2: [0.1, -0.2, 0], rarm: [-1.3, 1.1, -0.3], rfore: [-0.3, 0.2, 0] }), 'in'], [1, TG, 'io']],
    ev: [[0.58, 'hit']], trail: [0.38, 0.68], lunge: [[0, 0], [0.55, 0.5], [1, 0]] };
  A2.tBash = { dur: 0.7, keys: [[0, TG], [0.35, M(TG, { spine: [-0.08, -0.4, 0], larm: [-0.95, -0.25, 0.35], lfore: [-1.25, -0.1, 0] }), 'out'],
    [0.55, M(TG, { spine: [0.28, 0.5, 0], larm: [-1.4, -0.9, 0.1], lfore: [-0.6, -0.5, 0] }), 'in'], [1, TG, 'io']],
    ev: [[0.52, 'bash']], lunge: [[0, 0], [0.5, 1], [0.7, 1], [1, 0]] };
  const TCL = { rarm: [-1.7, -0.5, -0.7], rfore: [-1.2, 0, 0], larm: [-0.9, -0.55, 0.2], lfore: [-1.15, -0.25, 0] }, TCH = { rarm: [-1.2, 0.85, -0.2], rfore: [-0.9, 0, 0], larm: [-0.9, -0.55, 0.2], lfore: [-1.15, -0.25, 0] };
  const TROAR = { spine: [-0.28, 0, 0], spine2: [-0.12, 0, 0], head: [-0.45, 0, 0], rarm: [-0.7, 0, -1.0], larm: [-0.7, 0, 1.0], rfore: [-0.6, 0, 0], lfore: [-0.6, 0, 0] };
  A2.tTaunt = { dur: 1.4, keys: [[0, TG], [0.16, M(TG, TCL), 'out'], [0.26, M(TG, TCH), 'in'], [0.4, M(TG, TCL), 'out'], [0.5, M(TG, TCH), 'in'],
    [0.7, M(TG, TROAR), 'out'], [0.88, M(TG, TROAR)], [1, TG, 'io']], ev: [[0.26, 'clang'], [0.5, 'clang'], [0.7, 'roar']] };
  const TFORT = M(crouch(0, 0.55, 0.42), { spine: [0.32, 0.1, 0], spine2: [0.1, 0, 0], head: [-0.2, 0, 0], larm: [-1.3, -0.6, 0.0], lfore: [-0.6, -0.4, 0], rarm: [-0.4, 0.4, -0.2], rfore: [-1.4, 0.3, 0] });
  A2.fortify = { dur: 1.3, keys: [[0, TG], [0.28, TFORT, 'out'], [0.82, TFORT], [1, TG, 'io']], ev: [[0.28, 'fortify']] };
  const TQUP = M(crouch(0, 0.05), { spine: [-0.35, 0, 0], spine2: [-0.15, 0, 0], head: [-0.3, 0, 0], rarm: [-3.0, 0.2, -0.1], rfore: [-0.3, 0, 0], larm: [-2.6, -0.2, 0.3], lfore: [-0.4, 0, 0], root: [0, 0.32, 0] });
  const TQDN = M(crouch(0, 0.6, 0.5), { spine: [0.6, 0, 0], spine2: [0.2, 0, 0], head: [0.2, 0, 0], rarm: [-1.0, 0.2, -0.1], rfore: [-0.1, 0, 0], larm: [-0.9, -0.3, 0.25], lfore: [-0.5, 0, 0] });
  A2.quake = { dur: 1.35, legs: true, keys: [[0, TG], [0.22, M(crouch(0, 0.45, 0.4), { spine: [0.3, 0, 0], rarm: [-0.6, 0, -0.3], larm: [-0.6, 0, 0.3] }), 'io'], [0.44, TQUP, 'out'], [0.58, TQDN, 'in'], [0.84, TQDN], [1, TG, 'io']],
    ev: [[0.58, 'quake']], trail: [0.44, 0.6] };
  // Médic : droïde, émetteur de soin
  const MR = G.medicReady;
  const MAIM = M(MR, { rarm: [-1.45, 0.25, -0.05], rfore: [-0.12, 0.1, 0], spine: [0.04, 0.22, 0], head: [-0.02, -0.2, 0.06] });
  A2.medicBeam = { dur: 0.95, keys: [[0, MR], [0.3, MAIM, 'out'], [0.72, MAIM], [1, MR, 'io']], ev: [[0.34, 'heal']] };
  A2.mSwarm = { dur: 1.1, keys: [[0, MR], [0.35, M(MR, { larm: [-2.5, 0, 0.3], lfore: [-0.15, 0, 0], lhand: [0.3, 0, 0], spine: [-0.12, -0.1, 0], head: [-0.3, 0, 0] }), 'out'],
    [0.6, M(MR, { larm: [-1.6, 0.35, 0.1], lfore: [0, 0, 0], lhand: [0.8, 0, 0], spine: [0.05, 0.1, 0] }), 'in'], [1, MR, 'io']], ev: [[0.42, 'swarm']] };
  A2.mScan = { dur: 0.8, keys: [[0, MR], [0.3, M(MR, { larm: [-1.45, -0.35, 0.15], lfore: [-0.2, 0, 0], lhand: [0.7, 0, 0], head: [0, -0.15, 0] }), 'out'], [0.7, M(MR, { larm: [-1.45, -0.15, 0.15], lfore: [-0.2, 0, 0], lhand: [0.7, 0, 0] })], [1, MR, 'io']], ev: [[0.32, 'scan']] };
  // Séraphe : sceptre, ailes de lumière
  const SF = G.seraphFloat;
  const SCAST = M(SF, { spine: [-0.1, 0.1, 0], head: [-0.16, 0, 0], rarm: [-1.55, 0.15, -0.25], rfore: [-0.35, 0, 0], larm: [-1.0, -0.6, 0.3], lfore: [-0.55, -0.3, 0], lift: 1 });
  A2.sCast = { dur: 1.3, keys: [[0, SF], [0.42, SCAST, 'io'], [0.6, M(SCAST, { rarm: [-1.95, 0.2, -0.2], spine: [-0.15, 0.1, 0] })], [0.74, M(SCAST, { rarm: [-1.25, 0.25, -0.2], rfore: [-0.1, 0, 0], spine: [0.08, 0.1, 0] }), 'in'], [1, SF, 'io']], ev: [[0.72, 'heal']] };
  A2.sPrism = { dur: 0.75, keys: [[0, SF], [0.4, M(SF, { larm: [-1.65, -0.3, 0.2], lfore: [0, 0, 0], lhand: [0.9, 0, 0], spine: [0, -0.2, 0], lift: 1 }), 'out'], [0.7, M(SF, { larm: [-1.6, -0.3, 0.2], lfore: [0, 0, 0], lhand: [0.9, 0, 0], lift: 1 })], [1, SF, 'io']], ev: [[0.4, 'prism']] };
  const SREZ = M(SF, { rarm: [-0.45, 0, -1.35], larm: [-0.45, 0, 1.35], rfore: [-0.1, 0, 0], lfore: [-0.1, 0, 0], spine: [-0.2, 0, 0], head: [-0.3, 0, 0], lift: 2 });
  A2.sRez = { dur: 1.5, keys: [[0, SF], [0.35, SREZ, 'out'], [0.8, SREZ], [1, SF, 'io']], ev: [[0.36, 'halo']] };
  // Marée : bâton-trident
  const TR = G.tideRest;
  A2.tideFlow = { dur: 1.25, keys: [[0, TR], [0.35, M(TR, { spine: [-0.08, -0.4, 0], rarm: [-1.2, -0.5, -0.4], rfore: [-0.5, 0, 0], larm: [-1.3, -0.2, 0.6], lfore: [-0.4, 0, 0] }), 'io'],
    [0.6, M(TR, { spine: [0.12, 0.45, 0], rarm: [-1.6, 0.7, -0.1], rfore: [-0.2, 0.2, 0], larm: [-1.5, 0.4, 0.2], lfore: [-0.2, 0, 0], lhand: [0.8, 0, 0] }), 'io'], [1, TR, 'io']],
    ev: [[0.58, 'heal']], trail: [0.3, 0.65] };
  const TUP = M(crouch(0, 0.08), { spine: [-0.25, 0, 0], head: [-0.3, 0, 0], rarm: [-2.9, 0.1, -0.15], rfore: [-0.25, 0, 0], larm: [-2.8, -0.1, 0.2], lfore: [-0.3, 0, 0] });
  const TDN = M(crouch(0, 0.5, 0.4), { spine: [0.45, 0, 0], spine2: [0.12, 0, 0], head: [0.1, 0, 0], rarm: [-1.1, 0.1, -0.1], rfore: [-0.1, 0, 0], larm: [-1.0, -0.1, 0.1], lfore: [-0.2, 0, 0] });
  A2.tideCall = { dur: 1.3, keys: [[0, TR], [0.4, TUP, 'out'], [0.56, TDN, 'in'], [0.8, TDN], [1, TR, 'io']], ev: [[0.56, 'tide']], trail: [0.4, 0.58] };
  const TKN = M(kneel, { spine: [0.2, 0, 0], head: [0.2, 0, 0], rarm: [-0.9, 0.1, -0.15], rfore: [-0.5, 0, 0], larm: [-0.9, -0.3, 0.2], lfore: [-0.6, 0, 0], lhand: [0.6, 0, 0] });
  A2.tideRez = { dur: 1.6, legs: true, keys: [[0, TR], [0.3, TKN, 'io'], [0.8, TKN], [1, TR, 'io']], ev: [[0.32, 'meditate']] };
  // Lame-ombre : deux sabres
  const SC = G.sabreCrouch;
  A2.sabreR = { dur: 0.45, keys: [[0, SC], [0.32, M(SC, { spine: [0.15, 0.55, 0], rarm: [-2.2, -0.3, -0.6], rfore: [-0.5, 0.2, 0] }), 'out'],
    [0.56, M(SC, { spine: [0.4, -0.4, 0], spine2: [0.1, -0.15, 0], rarm: [-0.5, 1.2, -0.2], rfore: [-0.15, 0.1, 0] }), 'in'], [1, SC, 'io']],
    ev: [[0.52, 'stab']], trail: [0.3, 0.66], lunge: [[0, 0], [0.5, 0.9], [0.7, 0.9], [1, 0]] };
  A2.sabreL = { dur: 0.45, keys: [[0, SC], [0.32, M(SC, { spine: [0.15, -0.55, 0], larm: [-2.2, 0.3, 0.6], lfore: [-0.5, -0.2, 0] }), 'out'],
    [0.56, M(SC, { spine: [0.4, 0.4, 0], spine2: [0.1, 0.15, 0], larm: [-0.5, -1.2, 0.2], lfore: [-0.15, -0.1, 0] }), 'in'], [1, SC, 'io']],
    ev: [[0.52, 'stabL']], trail: [0.3, 0.66], trailOff: true, lunge: [[0, 0], [0.5, 0.9], [0.7, 0.9], [1, 0]] };
  A2.sabreX = { dur: 0.7, keys: [[0, SC], [0.36, M(SC, { spine: [0.1, 0, 0], rarm: [-1.6, 0.9, -0.2], rfore: [-0.9, 0, 0], larm: [-1.6, -0.9, 0.2], lfore: [-0.9, 0, 0] }), 'out'],
    [0.56, M(SC, { spine: [0.45, 0, 0], rarm: [-0.8, -0.9, -1.0], rfore: [-0.1, 0, 0], larm: [-0.8, 0.9, 1.0], lfore: [-0.1, 0, 0] }), 'in'], [1, SC, 'io']],
    ev: [[0.54, 'cross']], trail: [0.34, 0.66], lunge: [[0, 0], [0.5, 1], [0.75, 1], [1, 0]] };
  A2.sBlink = { dur: 1.0, keys: [[0, SC], [0.2, M(SC, { spine: [0.5, 0, 0] })], [0.5, M(SC, { spine: [0.1, 0.9, 0], rarm: [-1.8, 1.0, -0.3], rfore: [-0.1, 0, 0], larm: [-1.8, -1.0, 0.3], lfore: [-0.1, 0, 0] }), 'in'],
    [0.68, M(SC, { spine: [0.4, -0.6, 0], rarm: [-0.6, -0.8, -0.8], larm: [-0.6, 0.8, 0.8] }), 'out'], [1, SC, 'io']],
    ev: [[0.22, 'vanish'], [0.42, 'appear'], [0.6, 'cross'], [0.85, 'return']], trail: [0.42, 0.72], blink: [0.22, 0.85] };
  // Fracasseur : épée à deux mains
  const GR = G.gsReady;
  const GUP = M(crouch(0, 0.12), { spine: [-0.35, -0.1, 0], spine2: [-0.15, 0, 0], head: [-0.15, 0, 0], rarm: [-2.9, 0.15, -0.2], rfore: [-0.45, 0, 0], larm: [-2.75, -0.15, 0.2], lfore: [-0.6, 0, 0] });
  const GDN = M(crouch(0, 0.5, 0.35), { spine: [0.55, 0, 0], spine2: [0.2, 0, 0], head: [0.15, 0, 0], rarm: [-1.15, 0.2, -0.1], rfore: [-0.1, 0, 0], larm: [-1.05, -0.25, 0.12], lfore: [-0.2, 0, 0] });
  A2.cleave = { dur: 1.05, keys: [[0, GR], [0.42, GUP, 'out'], [0.56, GDN, 'in'], [0.8, GDN], [1, GR, 'io']],
    ev: [[0.56, 'cleave']], trail: [0.42, 0.62], lunge: [[0, 0], [0.55, 0.6], [0.8, 0.6], [1, 0]] };
  A2.gsSweep = { dur: 0.95, keys: [[0, GR], [0.4, M(GR, { spine: [0.0, -1.0, 0], spine2: [0, -0.3, 0], rarm: [-0.9, -0.4, -0.4], larm: [-1.0, -0.8, 0.0] }), 'out'],
    [0.62, M(GR, { spine: [0.15, 0.9, 0], spine2: [0, 0.3, 0], rarm: [-1.2, 1.3, -0.1], rfore: [-0.3, 0.3, 0], larm: [-1.3, 0.8, 0.1], lfore: [-0.5, 0, 0] }), 'in'], [1, GR, 'io']],
    ev: [[0.56, 'hit']], trail: [0.38, 0.72], lunge: [[0, 0], [0.55, 0.45], [1, 0]] };
  A2.rising = { dur: 0.9, keys: [[0, GR], [0.35, M(crouch(0, 0.5, 0.32), { spine: [0.38, 0.5, 0], rarm: [-0.2, 0.6, -0.4], rfore: [-0.6, 0.3, 0], larm: [-0.3, 0.3, 0.1], lfore: [-0.9, -0.2, 0] }), 'out'],
    [0.56, M(crouch(0, 0.1), { spine: [-0.25, -0.4, 0], spine2: [-0.1, -0.15, 0], rarm: [-2.6, -0.5, -0.3], rfore: [-0.2, 0, 0], larm: [-2.3, -0.6, 0.1], lfore: [-0.4, 0, 0], root: [0, 0.08, 0] }), 'in'], [1, GR, 'io']],
    ev: [[0.52, 'hit']], trail: [0.33, 0.62], lunge: [[0, 0], [0.5, 0.7], [1, 0]] };
  const GWH = M(crouch(0, 0.3), { spine: [0.12, -0.2, 0], head: [0.1, 0, 0], rarm: [-1.45, -0.2, -1.05], rfore: [-0.15, 0, 0], larm: [-1.35, 0.1, 0.35], lfore: [-0.9, 0, 0] });
  A2.whirl = { dur: 4.0, keys: [[0, GR], [0.06, M(GWH, { yaw: 0 }), 'out'], [0.94, M(GWH, { yaw: PI * 2 * 9 }), 'lin'], [1, M(GR, { yaw: PI * 2 * 9 }), 'io']],
    ev: Array.from({ length: 12 }, (_, k) => [0.09 + k * 0.071, 'whirlHit']) };
  const GROAR = { spine: [-0.35, 0, 0], spine2: [-0.15, 0, 0], head: [-0.48, 0, 0], rarm: [-0.5, 0, -1.1], larm: [-0.5, 0, 1.1], rfore: [-0.9, 0, 0], lfore: [-0.9, 0, 0] };
  A2.roar = { dur: 1.25, keys: [[0, GR], [0.28, M(GR, GROAR), 'out'], [0.78, M(GR, GROAR)], [1, GR, 'io']], ev: [[0.28, 'roar']] };
  // Spectre : tir chargé (visée laser), tir d'interruption
  const SKn = G.sniperKneel, SKF = M(SKn, { spine: [-0.12, 0.45, 0], rarm: [-1.45, 0.6, -0.55], larm: [-1.6, -0.15, 0.25], head: [-0.15, -0.5, 0.05], root: [0, 0, -0.12] });
  A2.chargeShot = { dur: 1.15, keys: [[0, SKn], [0.15, M(SKn, { head: [0.14, 0.12, -0.16] })], [0.62, M(SKn, { head: [0.14, 0.12, -0.16] })], [0.67, SKF, 'out'], [1, SKn, 'io']], ev: [[0.08, 'laserOn'], [0.64, 'bigshot']] };
  A2.quickShot = { dur: 0.6, keys: [[0, SKn], [0.25, SKn], [0.32, M(SKn, { spine: [-0.08, 0.4, 0], rarm: [-1.45, 0.6, -0.55], larm: [-1.55, -0.15, 0.25], head: [-0.1, -0.45, 0.05] }), 'out'], [1, SKn, 'io']], ev: [[0.28, 'fire']] };
  // Bricoleur : canon à main, gadgets
  const CH = G.cannonHip;
  A2.cannon = { dur: 1.0, keys: [[0, CH], [0.26, M(CH, { spine: [0.04, 0.18, 0] }), 'io'], [0.31, M(CH, { spine: [-0.3, 0.2, 0], spine2: [-0.12, 0, 0], head: [-0.15, -0.1, 0], root: [0, -0.04, -0.12] }), 'out'], [1, CH, 'io']], ev: [[0.28, 'shell']] };
  A2.bomb = { dur: 1.0, keys: [[0, CH], [0.4, M(CH, { spine: [-0.15, 0.6, 0], larm: [-1.0, 0.2, 1.1], lfore: [-1.5, 0, 0], lhand: [0, 0, 0] }), 'out'],
    [0.58, M(CH, { spine: [0.25, -0.2, 0], larm: [-2.2, -0.3, 0.2], lfore: [-0.1, 0, 0] }), 'in'], [1, CH, 'io']], ev: [[0.56, 'bomb']] };
  A2.deploy = { dur: 1.0, keys: [[0, CH], [0.32, M(crouch(0, 0.3), { spine: [0.1, 0.5, 0], larm: [-0.6, 0.3, 0.9], lfore: [-1.4, 0, 0] }), 'out'],
    [0.52, M(crouch(0, 0.2), { spine: [0.25, -0.25, 0], larm: [-1.9, -0.2, 0.2], lfore: [-0.1, 0, 0], lhand: [0.6, 0, 0] }), 'in'], [1, CH, 'io']], ev: [[0.5, 'deploy']] };

  // réactions
  A2.block = { dur: 0.5, add: true, keys: [[0, {}], [0.2, { spine: [-0.18, 0, 0], larm: [-0.2, -0.2, 0], root: [0, 0, -0.12] }, 'out'], [1, {}, 'io']] };
  A2.flinch = { dur: 0.5, add: true, keys: [[0, {}], [0.18, { spine: [-0.3, 0.1, 0.12], head: [-0.25, 0, 0], rarm: [0.2, 0, -0.2], larm: [0.2, 0, 0.2], root: [0, 0, -0.1] }, 'out'], [1, {}, 'io']] };
  A2.stagger = { dur: 0.9, add: true, keys: [[0, {}], [0.15, { spine: [-0.45, 0, 0.2], spine2: [-0.2, 0, 0], head: [-0.3, 0, 0], rarm: [0.3, 0, -0.5], larm: [0.3, 0, 0.5], root: [0, -0.06, -0.35] }, 'out'], [0.45, { spine: [-0.2, 0, 0.1], root: [0, -0.04, -0.3] }], [1, {}, 'io']] };
  A2.death = { dur: 1.3, hold: true, legs: true, keys: [[0, {}], [0.3, M(crouch(0, 0.9, 0.7), { spine: [0.5, 0.2, 0], head: [0.4, 0, 0], rarm: [0.2, 0, -0.3], larm: [0.2, 0, 0.3] }), 'out'],
    [0.62, M(kneel, { spine: [0.5, 0.2, 0.2], head: [0.5, 0, 0], rarm: [0.1, 0, -0.2], larm: [0.1, 0, 0.2] })], [1, { spine: [0.2, 0, 0], head: [0.4, 0.4, 0], rarm: [-0.2, 0, -1.2], larm: [-0.3, 0, 1.0], rup: [-0.3, 0, -0.1], rleg: [0.6, 0, 0], lup: [0.1, 0, 0.1], pitch: -PI / 2 * 0.96, root: [0, 0.12, 0.25] }, 'in']] };
  A2.rise = { dur: 1.1, legs: true, keys: [[0, { spine: [0.2, 0, 0], head: [0.4, 0.4, 0], rarm: [-0.2, 0, -1.2], larm: [-0.3, 0, 1.0], pitch: -PI / 2 * 0.96, root: [0, 0.12, 0.25] }], [0.45, M(kneel, { spine: [0.4, 0, 0], head: [0.2, 0, 0] }), 'io'], [1, {}, 'io']] };
  A2.cheer = { dur: 1.2, hold: true, keys: [[0, null], [0.35, { spine: [-0.2, 0, 0], head: [-0.35, 0, 0], rarm: [-2.9, 0, -0.25], rfore: [-0.1, 0, 0] }, 'out'], [0.6, { spine: [-0.15, 0, 0], head: [-0.3, 0, 0], rarm: [-2.7, 0, -0.25], rfore: [-0.2, 0, 0], root: [0, 0.05, 0] }], [1, { spine: [-0.2, 0, 0], head: [-0.3, 0, 0], rarm: [-2.8, 0, -0.25], rfore: [-0.15, 0, 0] }, 'io']] };

  // compilation : les clés « null » reprennent la posture courante au moment de l'évaluation
  const ACT = {};
  for (const k in A2) {
    const a = A2[k];
    const mask = new Uint8Array(NB + 2);
    const keys = a.keys.map(([t, p, e]) => { if (!p) return { t, p: null, e }; const c = pz(p); for (let i = 0; i < mask.length; i++) mask[i] |= c.m[i]; return { t, p: c, e, lift: p.lift || 0 }; });
    ACT[k] = Object.assign({}, a, { name: k, keys, mask });
  }
  const ease = (e, k) => e === 'in' ? k * k * k : e === 'out' ? 1 - Math.pow(1 - k, 3) : e === 'io' ? k * k * (3 - 2 * k) : k;
  const curve = (pts, k) => { if (!pts) return 0; for (let i = 1; i < pts.length; i++) if (k <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; const u = (k - a[0]) / Math.max(1e-4, b[0] - a[0]); return a[1] + (b[1] - a[1]) * (u * u * (3 - 2 * u)); } return pts[pts.length - 1][1]; };

  // ---------- effets : traînées, projectiles, éclairs de bouche, entailles ----------
  const crescentTex = canvasTex(256, (g, s) => { g.translate(s / 2, s / 2); for (let k = 0; k < 18; k++) { g.strokeStyle = `rgba(255,255,255,${0.06 + k / 18 * 0.12})`; g.lineWidth = 3 + (18 - k) * 1.4; g.beginPath(); g.arc(0, s * 0.18, s * 0.36, PI * 1.12 + k * 0.004, PI * 1.88 - k * 0.004); g.stroke(); } g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 4; g.beginPath(); g.arc(0, s * 0.18, s * 0.36, PI * 1.16, PI * 1.84); g.stroke(); });
  const starTex = canvasTex(128, (g, s) => { const c = s / 2; const gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); g.globalCompositeOperation = 'lighter'; for (let k = 0; k < 6; k++) { g.save(); g.translate(c, c); g.rotate(k * PI / 3); const l = g.createLinearGradient(0, 0, c, 0); l.addColorStop(0, 'rgba(255,255,255,0.9)'); l.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = l; g.fillRect(0, -2, c, 4); g.restore(); } });
  const spritePool = [];
  function sprite(tex, color, k, size, rot) {
    let s = spritePool.find(x => !x.visible);
    if (!s) { if (spritePool.length > 90) s = spritePool[0]; else { s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true })); s.renderOrder = 6; scene.add(s); spritePool.push(s); } }
    s.material.map = tex; s.material.color.copy(hdr(color, k)); s.material.rotation = rot || 0; s.material.opacity = 1; s.scale.set(size, size, 1); s.visible = true; return s;
  }
  const sfx = [];   // effets éphémères à base de sprites
  function pop(pos, tex, color, k, size, dur, grow, rot) { const s = sprite(tex, color, k, size, rot); s.position.copy(pos); sfx.push({ s, t: 0, dur: dur || 0.2, size, grow: grow ?? 1.6 }); }
  function updateSfx(dt) { for (let i = sfx.length - 1; i >= 0; i--) { const f = sfx[i]; f.t += dt; const k = f.t / f.dur; if (k >= 1) { f.s.visible = false; sfx.splice(i, 1); continue; } const sc = f.size * (1 + (f.grow - 1) * (1 - Math.pow(1 - k, 2))); f.s.scale.set(sc, sc, 1); f.s.material.opacity = 1 - k * k; } }
  function slashMark(pos, color, size, rot) { pop(pos, crescentTex, color, 4.5, size || 2.6, 0.22, 1.35, rot ?? (Math.random() - 0.5) * 2.4); emit(pos.x, pos.y, pos.z, 8, color, { speed: 6, life: 0.3, size: 0.3 }); }
  function muzzle(pos, color, size) { pop(pos, starTex, color, 6, size || 1.1, 0.09, 1.3, Math.random() * PI); }

  // traînée d'arme (ruban)
  const TRN = 14;
  function makeTrail(color) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(TRN * 2 * 3), 3));
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(TRN * 2 * 3), 3));
    const idx = []; for (let i = 0; i < TRN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
    const m = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    m.frustumCulled = false; m.visible = false; m.renderOrder = 4; scene.add(m);
    return { m, col: hdr(color, 2.6), pts: [], on: false, fade: 0 };
  }
  const _tb = new T.Vector3(), _tt = new T.Vector3();
  function updateTrail(tr, base, tip, dt) {
    if (tr.on) { tr.pts.unshift([base.clone(), tip.clone()]); if (tr.pts.length > TRN) tr.pts.pop(); tr.fade = 1; }
    else if (tr.pts.length) { tr.fade -= dt * 6; tr.pts.pop(); if (tr.fade <= 0 || tr.pts.length < 2) { tr.pts.length = 0; tr.m.visible = false; return; } }
    if (tr.pts.length < 2) { tr.m.visible = false; return; }
    const pos = tr.m.geometry.attributes.position.array, col = tr.m.geometry.attributes.color.array;
    for (let i = 0; i < TRN; i++) {
      const p = tr.pts[Math.min(i, tr.pts.length - 1)], a = 1 - i / (tr.pts.length - 1 || 1), k = Math.max(0, a) * Math.max(0, tr.fade);
      pos.set([p[0].x, p[0].y, p[0].z, p[1].x, p[1].y, p[1].z], i * 6);
      col.set([tr.col.r * k * 0.25, tr.col.g * k * 0.25, tr.col.b * k * 0.25, tr.col.r * k, tr.col.g * k, tr.col.b * k], i * 6);
    }
    tr.m.geometry.attributes.position.needsUpdate = true; tr.m.geometry.attributes.color.needsUpdate = true; tr.m.visible = true;
  }

  // projectiles
  const proj = [];
  const rocketGeo = (() => { const g = new T.CylinderGeometry(0.06, 0.06, 0.5, 8); g.rotateX(PI / 2); return g; })();
  let rocketMat = null;
  function shoot(type, from, to, col, onHit) {
    const p = { type, from: from.clone(), to: to.clone(), t: 0, col, onHit, obj: null, sp: null };
    const d = from.distanceTo(to);
    if (type === 'orb') { p.dur = d / 20 + 0.08; p.arc = 0.8; p.sp = sprite(glowTex, col, 5, 1.1); p.sp2 = sprite(starTex, '#ffffff', 3, 0.7); }
    else if (type === 'rocket') { p.dur = d / 24 + 0.1; p.arc = 1.2; if (!rocketMat) rocketMat = new T.MeshStandardMaterial({ color: 0x555a60, metalness: 0.8, roughness: 0.4 }); p.obj = new T.Mesh(rocketGeo, rocketMat); scene.add(p.obj); p.sp = sprite(glowTex, '#ffb060', 6, 0.9); p.wob = Math.random() * 6; }
    else if (type === 'grenade') { p.dur = 0.75; p.arc = 4 + d * 0.12; p.sp = sprite(glowTex, col, 5, 0.6); }
    else if (type === 'comet') { p.from = to.clone().add(new T.Vector3(-4, 26, 3)); p.dur = 0.55; p.arc = 0; p.sp = sprite(glowTex, col, 7, 3.2); p.sp2 = sprite(starTex, '#ffffff', 5, 2); }
    else if (type === 'blob') { p.dur = d / 26 + 0.05; p.arc = 0.6; p.sp = sprite(glowTex, col, 4, 0.55); }
    else if (type === 'wave') { p.dur = d / 18 + 0.1; p.arc = 0.4; p.sp = sprite(ringTexC, col, 4, 1.2); p.sp2 = sprite(glowTex, col, 3, 0.8); }
    else if (type === 'shell') { p.dur = d / 22 + 0.1; p.arc = 0.9 + d * 0.03; p.sp = sprite(glowTex, '#ffb060', 6, 0.9); p.sp2 = sprite(starTex, '#fff0d0', 4, 0.5); }
    else if (type === 'water') { p.dur = 0.62; p.arc = 2.6 + d * 0.05; p.sp = sprite(glowTex, col, 5, 1.4); p.sp2 = sprite(ringTexC, '#e8ffff', 3, 0.9); }
    else if (type === 'gadget') { p.dur = 0.7; p.arc = 3 + d * 0.08; p.sp = sprite(glowTex, col, 5, 0.7); }
    proj.push(p);
  }
  const _pp = new T.Vector3(), _pq = new T.Vector3();
  function updateProj(dt) {
    for (let i = proj.length - 1; i >= 0; i--) {
      const p = proj[i]; p.t += dt; const k = Math.min(1, p.t / p.dur);
      _pp.lerpVectors(p.from, p.to, p.type === 'comet' ? k * k : k); _pp.y += Math.sin(k * PI) * p.arc;
      if (p.type === 'rocket') { _pp.x += Math.sin(p.t * 22 + p.wob) * 0.08 * (1 - k); _pp.y += Math.cos(p.t * 19 + p.wob) * 0.08 * (1 - k); }
      if (p.sp) p.sp.position.copy(_pp); if (p.sp2) p.sp2.position.copy(_pp);
      if (p.obj) { _pq.lerpVectors(p.from, p.to, Math.min(1, k + 0.02)); _pq.y += Math.sin(Math.min(1, k + 0.02) * PI) * p.arc; p.obj.position.copy(_pp); p.obj.lookAt(_pq); }
      // sillages
      if (p.type === 'orb') emit(_pp.x, _pp.y, _pp.z, 2, p.col, { speed: 0.6, life: 0.35, size: 0.4, grav: 0 });
      else if (p.type === 'rocket') { emit(_pp.x, _pp.y, _pp.z, 2, '#7a7068', { speed: 0.5, life: 0.9, size: 0.55, grav: 0.6, k: 0.5, drag: 0.9 }); emit(_pp.x, _pp.y, _pp.z, 1, '#ffb060', { speed: 1, life: 0.15, size: 0.4, grav: 0 }); }
      else if (p.type === 'comet') emit(_pp.x, _pp.y, _pp.z, 6, p.col, { speed: 1.5, life: 0.5, size: 0.7, grav: 0, spread: 0.8 });
      else if (p.type === 'grenade' || p.type === 'blob') { if (Math.random() < 0.6) emit(_pp.x, _pp.y, _pp.z, 1, p.col, { speed: 0.3, life: 0.3, size: 0.3, grav: 0 }); }
      else if (p.type === 'shell') { emit(_pp.x, _pp.y, _pp.z, 1, '#8a8078', { speed: 0.4, life: 0.7, size: 0.45, grav: 0.4, k: 0.5, drag: 0.9 }); if (Math.random() < 0.6) emit(_pp.x, _pp.y, _pp.z, 1, '#ffb060', { speed: 1, life: 0.15, size: 0.3, grav: 0 }); }
      else if (p.type === 'water') { emit(_pp.x, _pp.y, _pp.z, 2, p.col, { speed: 0.8, life: 0.5, size: 0.35, grav: -4 }); if (p.sp2) { const sc = 0.9 + Math.sin(p.t * 24) * 0.25; p.sp2.scale.set(sc, sc, 1); } }
      else if (p.type === 'gadget') { if (Math.random() < 0.7) emit(_pp.x, _pp.y, _pp.z, 1, '#ffd08a', { speed: 1.5, life: 0.25, size: 0.2, grav: -3 }); }
      else if (p.type === 'wave') { if (p.sp) { const sc = 1.2 + Math.sin(p.t * 20) * 0.2; p.sp.scale.set(sc, sc, 1); } emit(_pp.x, _pp.y, _pp.z, 1, p.col, { speed: 0.4, life: 0.4, size: 0.35, grav: 0.5 }); }
      if (k >= 1) {
        if (p.sp) p.sp.visible = false; if (p.sp2) p.sp2.visible = false; if (p.obj) { scene.remove(p.obj); }
        impact(p.type, p.to, p.col); if (p.onHit) p.onHit(p.to);
        proj.splice(i, 1);
      }
    }
  }
  function impact(type, at, col) {
    if (type === 'orb') { emit(at.x, at.y, at.z, 22, col, { speed: 7, life: 0.5, size: 0.4 }); pop(at, starTex, col, 3.5, 1.5, 0.22, 1.6); }
    else if (type === 'rocket') { emit(at.x, at.y, at.z, 34, '#ff9a3a', { speed: 9, life: 0.5, size: 0.55 }); emit(at.x, at.y, at.z, 18, '#5a5048', { speed: 3, life: 1.2, size: 0.8, grav: 1, k: 0.6, drag: 0.9 }); pop(at, glowTex, '#ffb060', 6, 3.4, 0.25, 2); flash(at.x, at.y, at.z, '#ff8a3a', 9, 0.35); if (cam.shake < 0.12) cam.shake = 0.12; }
    else if (type === 'grenade') { emit(at.x, 0.6, at.z, 40, col, { speed: 2.2, life: 1.6, size: 0.8, grav: 0.4, drag: 0.94, k: 1.5, spread: 1.2 }); burstRing(at.x, at.z, 3.2, col, 0.7); flash(at.x, 1, at.z, col, 5, 0.3); }
    else if (type === 'comet') { emit(at.x, at.y, at.z, 70, col, { speed: 12, life: 0.8, size: 0.6 }); pop(at, starTex, '#ffffff', 4, 3.6, 0.3, 1.8); burstRing(at.x, at.z, 6, col, 0.8); flash(at.x, at.y, at.z, col, 10, 0.4); cam.shake = Math.max(cam.shake, 0.35); }
    else if (type === 'blob') { emit(at.x, at.y, at.z, 10, col, { speed: 3, life: 0.6, size: 0.4, grav: -3 }); }
    else if (type === 'shell') { emit(at.x, at.y, at.z, 28, '#ff9a3a', { speed: 8, life: 0.45, size: 0.5 }); emit(at.x, at.y, at.z, 12, '#5a5048', { speed: 3, life: 1.1, size: 0.75, grav: 1, k: 0.6, drag: 0.9 }); pop(at, glowTex, '#ffb060', 6, 2.8, 0.22, 2); flash(at.x, at.y, at.z, '#ff8a3a', 7, 0.3); }
    else if (type === 'water') { emit(at.x, 0.4, at.z, 30, '#e8ffff', { speed: 4, life: 0.6, size: 0.3, vy: 3, grav: -9 }); }
    else if (type === 'gadget') { emit(at.x, 0.4, at.z, 24, col, { speed: 4, life: 0.5, size: 0.3 }); pop(at, starTex, '#ffffff', 4, 1.6, 0.2, 1.6); }
    else if (type === 'wave') { burstRing(at.x, at.z, 2.2, col, 0.5); emit(at.x, at.y, at.z, 14, col, { speed: 2, life: 0.7, size: 0.35, vy: 2, grav: 0 }); }
  }

  // ---------- tête retirée : les sommets du casque d'origine sont repliés sur le pivot de la tête ----------
  const headlessCache = new Map();
  function headlessGeo(body) {
    if (headlessCache.has(body.geometry)) return headlessCache.get(body.geometry);
    const src = body.geometry, P = src.attributes.position, n = P.count;
    const g = new T.BufferGeometry();
    for (const k in src.attributes) g.setAttribute(k, src.attributes[k]);
    g.setIndex(src.index); for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
    const bones = body.skeleton.bones, hi = bones.findIndex(b => b.name.endsWith('Head'));
    const piv = new T.Vector3().setFromMatrixPosition(new T.Matrix4().copy(body.skeleton.boneInverses[hi]).invert().premultiply(new T.Matrix4().copy(body.bindMatrix).invert()));
    const pk = P.normalized ? (P.array instanceof Int16Array ? 1 / 32767 : P.array instanceof Int8Array ? 1 / 127 : P.array instanceof Uint16Array ? 1 / 65535 : 1) : 1;
    const si = src.attributes.skinIndex, sw = src.attributes.skinWeight, arr = new Float32Array(n * 3);
    const wk = sw.normalized ? (sw.array instanceof Uint8Array ? 1 / 255 : sw.array instanceof Uint16Array ? 1 / 65535 : 1) : 1;
    for (let v = 0; v < n; v++) {
      let w = 0; const is = [si.getX(v), si.getY(v), si.getZ(v), si.getW(v)], ws = [sw.getX(v), sw.getY(v), sw.getZ(v), sw.getW(v)];
      for (let k = 0; k < 4; k++) if (is[k] === hi) w += ws[k] * wk;
      if (w >= 0.35) { arr[v * 3] = piv.x; arr[v * 3 + 1] = piv.y; arr[v * 3 + 2] = piv.z; }
      else { arr[v * 3] = P.getX(v) * pk; arr[v * 3 + 1] = P.getY(v) * pk; arr[v * 3 + 2] = P.getZ(v) * pk; }
    }
    g.setAttribute('position', new T.BufferAttribute(arr, 3));
    g.boundingSphere = src.boundingSphere; headlessCache.set(src, g); return g;
  }

  // ---------- construction d'un raideur ----------
  const charObjs = [];   // objets ajoutés à la scène hors de la racine (drones, fantômes, traînées)
  function buildRaider(r) {
    const root = new T.Group(); scene.add(root);
    const VC = r.vcls || r.cls, VSP = r.vspec || r.spec;
    const st = STYLE[VC] || STYLE.sentinelle, sp = SPEC[VSP] || SPEC.rempart;
    const R = { root, r, st, sp, dead: 0, lastPos: new T.Vector3(r.pos.x, 0, r.pos.z), anim: null, capes: [], spin: [], moveW: 0, atkT: 0.4 + Math.random() * 1.6, combo: Math.floor(Math.random() * 4),
      act: null, react: null, stV: new Float32Array(NCH), ph: Math.random() * 6, lift: 0, lungeD: 0, stanceName: sp.stance, beamT: 0 };
    root.position.set(r.pos.x, 0, r.pos.z);
    if (!A.trooper) {
      const m = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 1.7, 10), new T.MeshStandardMaterial({ color: st.armor })); m.position.y = 0.9; root.add(m); root.scale.setScalar(1.7); R.fallback = true;
    } else {
      const model = cloneSkinned(A.trooper); model.rotation.order = 'YXZ'; model.rotation.y = PI; root.add(model); R.model = model;
      if (st.headless) model.traverse(o => { if (o.isSkinnedMesh) { if (o.name.includes('visor')) o.visible = false; else if (o.name.includes('Mesh')) o.geometry = headlessGeo(o); } });
      model.traverse(o => { if (o.isMesh) { const vis = o.name.includes('visor'); const base = o.material; o.userData.live = bodyMat(base, VC, vis); o.userData.dead = bodyMat(base, VC, vis, true); o.material = o.userData.live; o.castShadow = !vis; o.receiveShadow = true; o.frustumCulled = false; } });
      R.bones = getBones(model);
      R.anim = makeMixer(model, A.trooper.animations, { idle: 'Idle', run: 'Run', walk: 'Walk' });
      R.anim.mixer.update(0);
      root.scale.setScalar(1.7 * st.size);
      root.updateMatrixWorld(true);
      // proportions de race : échelle uniforme de certains os ; les pieds sont recalés au sol
      if (st.bones) {
        const toe = bone(model, 'LeftToeBase'), tp = new T.Vector3();
        const y0 = toe ? root.worldToLocal(toe.getWorldPosition(tp)).y : 0;
        for (const k in st.bones) { const b = R.bones[k]; if (b) b.scale.multiplyScalar(st.bones[k]); }
        root.updateMatrixWorld(true);
        R.baseY = toe ? y0 - root.worldToLocal(toe.getWorldPosition(tp)).y : 0;
      }
      const mn = sp.main, onBone = typeof mn[1] === 'string';
      R.wObj = mergeByMat(mn[0](VC)); R.weapon = attachCS(R, onBone ? mn[1] : 'rhand', R.wObj, onBone ? mn[2] : mn[1], onBone ? mn[3] : mn[2]);
      if (sp.off) { R.offObj = mergeByMat(sp.off[0](VC)); attachCS(R, sp.off[1], R.offObj, sp.off[2], sp.off[3]); }
      buildAccessories(R);
      skinAccessories(R);
      R.anim.mixer.update(Math.random() * 2);
      if (sp.melee) { R.trail = makeTrail(st.accent); charObjs.push(R.trail.m); }
      if (R.drone) { charObjs.push(R.drone); R.drone.position.set(r.pos.x, 3.4, r.pos.z); R.droneBeam = makeBeam(st.accent, 0.14, 2.6); charObjs.push(R.droneBeam); }
      if (R.ghosts) R.ghosts.forEach(g => charObjs.push(g.o));
      if (R.laser) charObjs.push(R.laser);
    }
    R.stV.set((STZ[R.stanceName] || STZ.neutral).v);
    // anneau au sol, sélection, cumuls, marque, bouclier
    const ringCol = r.isMe ? '#ffbf5a' : { tank: '#5aa9ff', heal: '#5be39a', dps: '#ff7a6b' }[r.role];
    R.ring = new T.Mesh(new T.RingGeometry(0.42, 0.5, 40), new T.MeshBasicMaterial({ color: hdr(ringCol, 2.2), transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
    R.ring.rotation.x = -PI / 2; R.ring.position.y = 0.03; root.add(R.ring);
    R.sel = new T.Mesh(new T.RingGeometry(0.56, 0.62, 40), new T.MeshBasicMaterial({ color: hdr('#66d8ff', 3), transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
    R.sel.rotation.x = -PI / 2; R.sel.position.y = 0.035; root.add(R.sel);
    R.stacks = []; for (let k = 0; k < 6; k++) { const o = new T.Mesh(new T.SphereGeometry(0.05, 8, 6), glowMat('#ff4d4d', 5)); o.visible = false; root.add(o); R.stacks.push(o); }
    R.markG = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr('#d07bff', 5), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); R.markG.position.y = 2.25; R.markG.scale.set(0.7, 0.7, 1); R.markG.visible = false; root.add(R.markG);
    R.debG = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: hdr('#7dff9c', 4), blending: T.AdditiveBlending, depthWrite: false, transparent: true })); R.debG.position.y = 2.05; R.debG.scale.set(0.5, 0.5, 1); R.debG.visible = false; root.add(R.debG);
    R.bubble = new T.Mesh(new T.SphereGeometry(0.75, 32, 16), fresnelMat('#ffe7a0', 2.2, 2.2, 0.9)); R.bubble.position.y = 0.95; R.bubble.visible = false; root.add(R.bubble);
    if (r.isMe) { const chev = new T.Mesh(new T.ConeGeometry(0.12, 0.22, 3), glowMat('#ffbf5a', 4)); chev.rotation.x = PI; chev.position.y = 2.35; root.add(chev); R.chev = chev; }
    R.beam = null;
    return R;
  }
  function disposeRaider(R) {
    scene.remove(R.root); if (R.anim) R.anim.mixer.stopAllAction();
    for (const o of [R.trail && R.trail.m, R.drone, R.droneBeam, R.laser, ...(R.ghosts || []).map(g => g.o)]) if (o) { scene.remove(o); const i = charObjs.indexOf(o); if (i >= 0) charObjs.splice(i, 1); }
  }
  const tipPos = (R, out) => { const t = R.wObj && R.wObj.userData.tip; return t ? t.getWorldPosition(out || new T.Vector3()) : raidPos(R.r.i, 1.6); };
  const handPos = (R, side, out) => (R.bones && R.bones[side]) ? R.bones[side].getWorldPosition(out || new T.Vector3()) : raidPos(R.r.i, 1.5);

  // ---------- composition de la pose ----------
  const P0 = new Float32Array(NCH), PA = new Float32Array(NCH);
  let evalLift = 0;
  function evalAct(a, k, stanceV, out) {
    const ks = a.keys; let i = 1; while (i < ks.length - 1 && k > ks[i].t) i++;
    const ka = ks[i - 1], kb = ks[i];
    const u = Math.min(1, Math.max(0, (k - ka.t) / Math.max(1e-4, kb.t - ka.t))), e = ease(kb.e, u);
    const va = ka.p ? ka.p.v : stanceV, vb = kb.p ? kb.p.v : stanceV;
    for (let c = 0; c < NCH; c++) out[c] = va[c] + (vb[c] - va[c]) * e;
    evalLift = (ka.lift || 0) + ((kb.lift || 0) - (ka.lift || 0)) * e;
  }
  const wrapA = x => { x = (x + PI) % (PI * 2); if (x < 0) x += PI * 2; return x - PI; };
  function compose(R, dt) {
    const tgt = (STZ[R.stanceName] || STZ.neutral).v;
    const kS = dt > 0 ? Math.min(1, dt * 7) : 1;
    for (let c = 0; c < NCH; c++) R.stV[c] += (tgt[c] - R.stV[c]) * kS;
    P0.set(R.stV);
    // en mouvement : bras moins contraints, jambes rendues à la course
    const mw = R.moveW;
    let lift = (R.levit || 0) * (1 + 0.3 * Math.sin(time * 1.4 + R.ph)), lungeK = 0, legs = false, blinkOff = 0;
    const AC = R.act;
    if (AC) {
      const a = AC.a, k = Math.min(1, AC.t / a.dur);
      evalAct(a, k, R.stV, PA);
      const w = Math.max(0, a.hold ? Math.min(1, AC.t / 0.08) : Math.min(1, AC.t / 0.07, (a.dur - AC.t) / 0.14));
      for (let i = 0; i < NB; i++) if (a.mask[i]) for (let c = i * 3; c < i * 3 + 3; c++) P0[c] += (PA[c] - P0[c]) * w;
      if (a.mask[NB]) for (let c = CH_ROOT; c < CH_ROOT + 3; c++) P0[c] += (PA[c] - P0[c]) * w;
      if (a.mask[NB + 1]) { P0[CH_YAW] = wrapA(PA[CH_YAW]) * w; P0[CH_PITCH] += (PA[CH_PITCH] - P0[CH_PITCH]) * w; P0[CH_ROLL] += (PA[CH_ROLL] - P0[CH_ROLL]) * w; }
      lift += evalLift * 0.16 * w;
      lungeK = curve(a.lunge, k);
      legs = !!a.legs;
      if (a.blink) { if (k >= a.blink[0] && k < a.blink[1]) blinkOff = 1; R.model.visible = !(k > a.blink[0] && k < a.blink[0] + 0.18) && !(k > a.blink[1] && k < a.blink[1] + 0.06); }
    }
    if (R.react) {
      const a = R.react.a, k = Math.min(1, R.react.t / a.dur);
      evalAct(a, k, R.stV, PA);
      const w = R.react.amp || 1;
      for (let i = 0; i < NB; i++) if (a.mask[i]) for (let c = i * 3; c < i * 3 + 3; c++) P0[c] += PA[c] * w;
      if (a.mask[NB]) for (let c = CH_ROOT; c < CH_ROOT + 3; c++) P0[c] += PA[c] * w;
    }
    if (!legs && mw > 0.001) {
      const lw = 1 - mw;
      for (const key of LEG) { const i = BIDX[key] * 3; P0[i] *= lw; P0[i + 1] *= lw; P0[i + 2] *= lw; }
      P0[CH_ROOT + 1] *= lw;
      for (const key of ['rarm', 'rfore', 'larm', 'lfore', 'spine', 'spine2']) { const i = BIDX[key] * 3; const f = key === 'spine' ? 0.4 : 0.7; P0[i] *= 1 - mw * (1 - f); P0[i + 1] *= 1 - mw * (1 - f); P0[i + 2] *= 1 - mw * (1 - f); }
    }
    P0[BIDX.spine1 * 3] += Math.sin(time * 1.7 + R.ph) * 0.025 * (1 - mw);
    P0[CH_ROOT + 2] += lungeK * R.lungeD + blinkOff * R.lungeD * 1.25;
    R.lift = lift;
    applyPose(R, P0);
  }

  // ---------- jouer une action ----------
  function play(R, name, o = {}) {
    const a = ACT[name]; if (!a || !R.model) return;
    if (a.add) { R.react = { a, t: 0, o, amp: o.amp || 1 }; return; }
    if (R.act && R.act.a.hold && name !== 'rise' && name !== 'cheer') return;
    if (R.act) fireRest(R);
    R.act = { a, t: 0, o, ev: 0 };
    R.model.visible = true;
    R.lungeD = 0;
    if (o.tgt && a.lunge) { const d = Math.hypot(o.tgt.x - R.root.position.x, o.tgt.z - R.root.position.z) - (o.reach || 3); R.lungeD = Math.max(0, Math.min(name === 'dash' ? 4.2 : 2.2, d)) / R.root.scale.x; }
    if (a.blink && o.tgt) { const d = Math.hypot(o.tgt.x - R.root.position.x, o.tgt.z - R.root.position.z) - (o.reach || 3) + 1.2; R.lungeD = Math.max(0.5, Math.min(5, d)) / R.root.scale.x; }
  }
  function fireRest(R) {   // déclenche les événements non joués d'une action interrompue
    const a = R.act.a; if (!a.ev) return;
    while (R.act.ev < a.ev.length) { const e = a.ev[R.act.ev++]; if (['hit', 'fire', 'heal', 'orb', 'rocket', 'grenade', 'comet', 'stab', 'stabL', 'palm', 'palmL', 'kick', 'slam', 'bash'].includes(e[1])) onEvent(R, e[1]); }
  }
  function stepAct(R, dt) {
    const AC = R.act;
    if (AC) {
      AC.t += dt; const a = AC.a, k = AC.t / a.dur;
      if (a.ev) while (AC.ev < a.ev.length && k >= a.ev[AC.ev][0]) onEvent(R, a.ev[AC.ev++][1]);
      if (R.trail) R.trail.on = !!(a.trail && k >= a.trail[0] && k <= a.trail[1]);
      if (k >= 1 && !a.hold) { R.act = null; if (R.model) R.model.visible = true; }
    } else if (R.trail) R.trail.on = false;
    if (R.react) { R.react.t += dt; if (R.react.t >= R.react.a.dur) R.react = null; }
  }

  // ---------- cibles ----------
  const _aim = new T.Vector3();
  function aimTarget(R, melee) {
    const r = R.r, g = R.root.position;
    if (r.atkTarget && r.atkTarget !== 'boss') { const am = addM.get(r.atkTarget); if (am && am.a.alive) { const p = am.g.position.clone(); if (am.a.type === 'guardian') p.y = 2.4 + Math.random() * 1.2; return { p, reach: am.a.type === 'guardian' ? 2.2 : 1.4, base: am.g.position }; } }
    const k = nearestRig(g.x, g.z), rg = rigs[k]; if (!rg) return null;
    const c = rg.root.position, rad = rg.azhal ? 3.2 : (rg.scale || 5) * 0.42;
    const dx = g.x - c.x, dz = g.z - c.z, d = Math.hypot(dx, dz) || 1;
    const h = rg.azhal ? 7 : (rg.height || 8);
    const y = melee ? (rg.levit ? h * 0.3 : 1.2 + Math.random() * 2.2) + (rg.body.position.y - (rg.baseY || 0)) : rg.body.position.y + h * (0.35 + Math.random() * 0.3);
    const p = new T.Vector3(c.x + dx / d * rad * (melee ? 1 : 0.6) + (Math.random() - 0.5) * 0.8, y, c.z + dz / d * rad * (melee ? 1 : 0.6) + (Math.random() - 0.5) * 0.8);
    if (rg.azhal) p.set(c.x + dx / d * rad, melee ? 2 + Math.random() * 2 : 5 + Math.random() * 3, c.z + dz / d * rad);
    return { p, reach: rad + 0.6, base: c };
  }

  // ---------- attaques automatiques ----------
  function autoAttack(R, dt, moving) {
    const r = R.r, sp = R.sp;
    if (R.act || R.dead) return;
    R.atkT -= dt; if (R.atkT > 0) return;
    if (moving) { R.atkT = 0.15; return; }
    R.atkT = sp.cad[0] + Math.random() * (sp.cad[1] - sp.cad[0]);
    if (r.isMe && S.role === 'heal') return;
    if (sp.heal) { const ht = r.healTarget; if (ht >= 0 && raidM[ht] && raidM[ht].r.alive && ht !== r.i) play(R, sp.heal, { heal: ht }); return; }
    const t = aimTarget(R, sp.melee); if (!t) return;
    if (sp.melee && Math.hypot(t.base.x - R.root.position.x, t.base.z - R.root.position.z) > t.reach + 4.5) return;
    const name = sp.autos[R.combo++ % sp.autos.length];
    play(R, name, { tgt: t.p, reach: t.reach });
  }

  // ---------- événements d'action → effets ----------
  const _e1 = new T.Vector3(), _e2 = new T.Vector3();
  function hitPoint(R) { const o = R.act ? R.act.o : {}; if (o.tgt) return o.tgt; const t = aimTarget(R, true); return t ? t.p : tipPos(R); }
  function onEvent(R, name) {
    const o = R.act ? R.act.o : {}, st = R.st, col = st.accent, me = R.r.isMe;
    switch (name) {
      case 'hit': case 'stab': case 'stabL': case 'cross': {
        const p = hitPoint(R);
        const big = R.sp.heavy || R.r.vspec === 'rempart' || R.r.vspec === 'gardien';
        slashMark(p, col, name === 'cross' ? 3.4 : big ? 2.8 : 2.2, name === 'cross' ? 0.8 : undefined);
        if (name === 'cross') slashMark(p, col, 3.4, -0.8);
        emit(p.x, p.y, p.z, me ? 14 : 7, '#ffffff', { speed: 7, life: 0.25, size: 0.22 });
        if (me) { flash(p.x, p.y, p.z, col, 4, 0.18); cam.shake = Math.max(cam.shake, 0.08); }
        break;
      }
      case 'palm': case 'palmL': case 'kick': case 'cut': {
        const p = hitPoint(R); const from = name === 'kick' ? R.bones.rfoot.getWorldPosition(_e1) : handPos(R, name === 'palmL' ? 'lhand' : 'rhand', _e1);
        shoot('wave', from, p, col); pop(from, starTex, col, 4, 1.0, 0.12, 1.4);
        if (me) cam.shake = Math.max(cam.shake, 0.06);
        break;
      }
      case 'bash': {
        const p = hitPoint(R); const s = R.offObj ? R.offObj.getWorldPosition(_e1) : handPos(R, 'lhand', _e1);
        pop(s, ringTexC, col, 4, 2.2, 0.25, 1.8); emit(p.x, p.y, p.z, 16, col, { speed: 7, life: 0.35, size: 0.35 }); pop(p, starTex, '#ffffff', 4, 1.8, 0.15);
        if (me) { flash(s.x, s.y, s.z, col, 5, 0.2); cam.shake = Math.max(cam.shake, 0.12); }
        break;
      }
      case 'slam': {
        const p = tipPos(R, _e1); p.y = 0.1;
        burstRing(p.x, p.z, 4.2, col, 0.55); pop(p.clone().setY(0.6), starTex, col, 5, 3.2, 0.2, 1.6);
        emit(p.x, 0.3, p.z, 30, '#a89a8a', { speed: 6, life: 0.7, size: 0.4, vy: 4, grav: -12, k: 1.2 });
        emit(p.x, 0.4, p.z, 20, col, { speed: 8, life: 0.4, size: 0.35, flat: true });
        const t = hitPoint(R); shoot('wave', p.clone().setY(0.5), t.clone().setY(0.6), col);
        flash(p.x, 1, p.z, col, 6, 0.25); cam.shake = Math.max(cam.shake, me ? 0.4 : 0.14);
        break;
      }
      case 'fire': {
        const tp = tipPos(R, _e1), p = (R.laserT > 0 && R.laserTo) ? R.laserTo.clone() : hitPoint(R); R.laserT = 0;
        if (R.r.vspec === 'precision' || R.r.vspec === 'spectre') { tracer(tp, p, col, 0.1, 2.6); muzzle(tp, col, 1.6); emit(tp.x, tp.y, tp.z, 6, '#ffd0a0', { speed: 3, life: 0.15, size: 0.25 }); slashMark(p, col, 1.4, 0); emit(p.x, p.y, p.z, 12, col, { speed: 7, life: 0.3, size: 0.3 }); }
        else { muzzle(tp, col, 0.8); shoot('blob', tp, p.clone().add(new T.Vector3((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2)), col); }
        break;
      }
      case 'rocket': { const tp = tipPos(R, _e1); muzzle(tp, '#ffb060', 1.6); const back = R.root.localToWorld(new T.Vector3(-0.2, 1.4, -0.6)); emit(back.x, back.y, back.z, 12, '#8a8078', { speed: 2.5, life: 0.8, size: 0.6, grav: 0.5, k: 0.6 }); shoot('rocket', tp, hitPoint(R), col); break; }
      case 'grenade': { const hp = handPos(R, 'lhand', _e1); const t = hitPoint(R).clone(); t.y = 0.4; shoot('grenade', hp, t, col); break; }
      case 'orb': { const hp = handPos(R, 'lhand', _e1); pop(hp, starTex, col, 5, 1.6, 0.15); shoot('orb', hp, hitPoint(R), col); break; }
      case 'cometCall': { const tp = tipPos(R, _e1); pop(tp, starTex, '#ffffff', 6, 2.2, 0.35, 2); emit(tp.x, tp.y, tp.z, 18, col, { speed: 2, life: 0.8, size: 0.35, vy: 5, grav: 0 }); break; }
      case 'comet': shoot('comet', null, hitPoint(R), col); break;
      case 'heal': {
        const ti = o.heal; const tR = raidM[ti]; if (!tR) break;
        const tp = raidPos(ti, 1.4);
        if (R.r.vspec === 'harmonie' || R.r.vspec === 'maree') { const from = tipPos(R, _e1); shoot('wave', from, tp, col); }
        else if (R.r.vspec === 'seraphe') { const from = tipPos(R, _e1); tracer(from, tp, col, 0.18, 2.2); pop(from, starTex, col, 5, 1.5, 0.16); pop(tp, starTex, '#e2c8ff', 4, 2.0, 0.32, 1.6); emit(tp.x, tp.y, tp.z, 12, st.glow2 || col, { speed: 2, life: 0.9, size: 0.3, vy: 2.5, grav: 0 }); }
        else if (R.r.vspec === 'aube') { const from = tipPos(R, _e1); tracer(from, tp, col, 0.16, 2.2); pop(from, starTex, col, 5, 1.4, 0.15); pop(tp, starTex, col, 4, 1.8, 0.3, 1.6); emit(tp.x, tp.y, tp.z, 10, col, { speed: 2, life: 0.8, size: 0.3, vy: 2.5, grav: 0 }); }
        else { const from = tipPos(R, _e1); tracer(from, tp, col, 0.14, 1.2); muzzle(from, col, 0.7); emit(tp.x, tp.y, tp.z, 8, col, { speed: 2, life: 0.6, size: 0.28, vy: 2, grav: 0 }); R.beamT = 1.2; R.beamTo = ti; }
        break;
      }
      case 'reload': { const p = tipPos(R, _e1); emit(p.x, p.y, p.z, 2, '#ffcf8a', { speed: 2, life: 0.6, size: 0.18, vy: 2, grav: -9, k: 1.5 }); break; }
      case 'vanish': case 'return': { spawnGhost(R); const p = raidPos(R.r.i, 1.2); emit(p.x, p.y, p.z, 26, '#6a4a9a', { speed: 3, life: 0.7, size: 0.6, grav: 0.5, k: 1.4 }); emit(p.x, p.y, p.z, 12, col, { speed: 5, life: 0.3, size: 0.3 }); break; }
      case 'appear': { const p = hitPoint(R); emit(p.x, 1.2, p.z, 20, '#6a4a9a', { speed: 3, life: 0.6, size: 0.5, grav: 0.5, k: 1.4 }); break; }
      case 'ghost': spawnGhost(R); break;
      case 'aegis': { const p = R.offObj ? R.offObj.getWorldPosition(_e1) : raidPos(R.r.i, 1.4); pop(p, ringTexC, col, 4, 5.5, 0.5, 1.6); pop(p, starTex, '#fff6dc', 6, 2.6, 0.35, 1.4); emit(p.x, p.y, p.z, 40, col, { speed: 5, life: 0.6, size: 0.35 }); flash(p.x, p.y, p.z, col, 8, 0.4); break; }
      case 'beacon': { const tp = tipPos(R, _e1); pop(tp, starTex, '#ffffff', 6, 3.2, 0.45, 2); emit(tp.x, tp.y, tp.z, 30, col, { speed: 3, life: 0.9, size: 0.35, vy: 4, grav: 0 }); flash(tp.x, tp.y, tp.z, col, 9, 0.5); const p = raidPos(R.r.i, 0.1); burstRing(p.x, p.z, 3.5, col, 0.7); break; }
      case 'barrier': { const p = raidPos(R.r.i, 1.2); pop(p, ringTexC, col, 4, 4.2, 0.4, 1.4); emit(p.x, p.y, p.z, 30, col, { speed: 4, life: 0.5, size: 0.3 }); break; }
      // --- races (v5) ---
      case 'smash': {   // Titan : coup de marteau écrasant
        const p = hitPoint(R);
        pop(p, starTex, col, 5, 3.0, 0.2, 1.7); slashMark(p, '#ffb070', 2.6, 0);
        emit(p.x, p.y, p.z, 26, '#ffb070', { speed: 8, life: 0.45, size: 0.35 }); emit(p.x, p.y, p.z, 10, col, { speed: 4, life: 0.6, size: 0.45 });
        flash(p.x, p.y, p.z, col, me ? 6 : 4, 0.25); cam.shake = Math.max(cam.shake, 0.1);
        break;
      }
      case 'clang': { const s = R.offObj ? R.offObj.getWorldPosition(_e1) : raidPos(R.r.i, 1.4); pop(s, starTex, '#ffd2a0', 6, 2.0, 0.15, 1.6); emit(s.x, s.y, s.z, 22, '#ffb070', { speed: 7, life: 0.35, size: 0.25 }); pop(s, ringTexC, col, 4, 2.4, 0.3, 1.8); break; }
      case 'roar': { const p = raidPos(R.r.i, 1.8); pop(p, ringTexC, col, 4, 6, 0.5, 2.2); pop(p, ringTexC, col, 3, 3.6, 0.4, 2.0); emit(p.x, p.y, p.z, 30, col, { speed: 6, life: 0.5, size: 0.35, flat: true }); cam.shake = Math.max(cam.shake, 0.18); break; }
      case 'fortify': { const p = raidPos(R.r.i, 1.1); pop(p, ringTexC, col, 4, 4.4, 0.45, 1.5); emit(p.x, 0.3, p.z, 40, '#a89a8a', { speed: 4, life: 0.6, size: 0.4, flat: true }); emit(p.x, p.y, p.z, 30, col, { speed: 3, life: 0.8, size: 0.3, vy: 2, grav: 0 }); flash(p.x, p.y, p.z, col, 7, 0.4); break; }
      case 'quake': {
        const p = tipPos(R, _e1); p.y = 0.1; const c0 = raidPos(R.r.i, 0.1);
        burstRing(c0.x, c0.z, 9, col, 0.8); burstRing(p.x, p.z, 4, '#ffb070', 0.5);
        emit(p.x, 0.4, p.z, 70, '#a89a8a', { speed: 8, life: 0.8, size: 0.5, vy: 4, grav: -10, k: 1.2, flat: true }); emit(p.x, 0.4, p.z, 40, col, { speed: 10, life: 0.5, size: 0.4, flat: true });
        flash(p.x, 1, p.z, col, 12, 0.45); cam.shake = Math.max(cam.shake, 0.5);
        break;
      }
      case 'swarm': { const d = R.drone ? R.drone.position : raidPos(R.r.i, 2); pop(d, starTex, col, 5, 2.4, 0.3, 1.6); emit(d.x, d.y, d.z, 70, col, { speed: 6, life: 1.0, size: 0.3, grav: 0, drag: 0.9 }); flash(d.x, d.y, d.z, col, 6, 0.4); break; }
      case 'scan': { const hp = handPos(R, 'lhand', _e1); pop(hp, ringTexC, col, 4, 1.6, 0.3, 1.8); emit(hp.x, hp.y, hp.z, 14, '#e6fff0', { speed: 3, life: 0.4, size: 0.25 }); break; }
      case 'prism': { const hp = handPos(R, 'lhand', _e1); pop(hp, starTex, '#fff3c4', 6, 2.0, 0.3, 1.6); emit(hp.x, hp.y, hp.z, 18, st.glow2 || col, { speed: 3, life: 0.6, size: 0.3 }); break; }
      case 'halo': { const p = raidPos(R.r.i, 2.4); pop(p, ringTexC, col, 5, 3.2, 0.6, 1.8); pop(p, starTex, '#ffffff', 5, 2.6, 0.5, 1.5); emit(p.x, p.y, p.z, 40, col, { speed: 3, life: 1.0, size: 0.32, vy: 2, grav: 0 }); flash(p.x, p.y, p.z, col, 8, 0.6); break; }
      case 'tide': {
        const t = (o.tgt ? o.tgt.clone() : hitPoint(R).clone()); t.y = 0.2; const from = tipPos(R, _e2).clone();
        shoot('water', from, t, col, at => { burstRing(at.x, at.z, 7, col, 0.9); burstRing(at.x, at.z, 4.2, '#bffcff', 0.7); emit(at.x, 0.3, at.z, 80, col, { speed: 5, life: 0.9, size: 0.4, vy: 3, grav: -4, flat: true }); emit(at.x, 0.5, at.z, 40, '#e8ffff', { speed: 3, life: 1.0, size: 0.3, vy: 6, grav: -9 }); flash(at.x, 1, at.z, col, 7, 0.45); });
        break;
      }
      case 'cleave': {
        const p = hitPoint(R); slashMark(p, col, 3.6, 0); pop(p, starTex, '#ffffff', 5, 2.4, 0.18, 1.6);
        const g = tipPos(R, _e1); g.y = 0.1; burstRing(g.x, g.z, 3.2, col, 0.5); emit(g.x, 0.3, g.z, 24, '#a89a8a', { speed: 6, life: 0.6, size: 0.35, vy: 3, grav: -10, flat: true });
        flash(p.x, p.y, p.z, col, me ? 6 : 4, 0.25); cam.shake = Math.max(cam.shake, 0.14);
        break;
      }
      case 'whirlHit': { const c0 = raidPos(R.r.i, 1.2), an = Math.random() * PI * 2; const p = c0.clone().add(_e2.set(Math.cos(an) * 1.7, (Math.random() - 0.3) * 0.6, Math.sin(an) * 1.7)); slashMark(p, col, 2.4); if (Math.random() < 0.5) emit(c0.x, 0.3, c0.z, 12, col, { speed: 6, life: 0.4, size: 0.3, flat: true }); break; }
      case 'laserOn': R.laserT = 0.62; R.laserTo = (o.tgt ? new T.Vector3(o.tgt.x, o.tgt.y + 1.4, o.tgt.z) : hitPoint(R)).clone(); break;
      case 'bigshot': {
        const tp = tipPos(R, _e1).clone(), p = R.laserTo ? R.laserTo.clone() : hitPoint(R).clone(); R.laserT = 0;
        tracer(tp, p, col, 0.16, 4); muzzle(tp, col, 2.6); pop(tp, ringTexC, col, 4, 2.2, 0.25, 1.8); emit(tp.x, tp.y, tp.z, 16, '#ffd0a0', { speed: 4, life: 0.3, size: 0.3 });
        flash(p.x, p.y, p.z, col, 10, 0.3); emit(p.x, p.y, p.z, 40, col, { speed: 9, life: 0.4, size: 0.4 }); slashMark(p, col, 2.2, 0); cam.shake = Math.max(cam.shake, 0.12);
        break;
      }
      case 'shell': { const tp = tipPos(R, _e1); muzzle(tp, '#ffb060', 1.8); emit(tp.x, tp.y, tp.z, 14, '#9a8a7a', { speed: 2.5, life: 0.9, size: 0.6, grav: 0.6, k: 0.6, drag: 0.9 }); shoot('shell', tp, hitPoint(R), col); break; }
      case 'bomb': case 'deploy': { const hp = handPos(R, 'lhand', _e1); const t = (name === 'deploy' && o.tgt ? o.tgt : hitPoint(R)).clone(); t.y = 0.4; shoot(name === 'deploy' ? 'gadget' : 'grenade', hp, t, col); break; }
      case 'steel': { const p = tipPos(R, _e1); p.y = 0.1; burstRing(p.x, p.z, 5, '#ffd27a', 0.7); emit(p.x, 0.4, p.z, 40, '#ffd27a', { speed: 6, life: 0.6, size: 0.4, vy: 3 }); flash(p.x, 1.2, p.z, '#ffd27a', 8, 0.4); cam.shake = Math.max(cam.shake, 0.3); break; }
      case 'taunt': { const p = raidPos(R.r.i, 2.2); pop(p, starTex, '#ff6a5a', 4, 1.6, 0.3, 1.6); break; }
      case 'shout': { const p = raidPos(R.r.i, 1.6); pop(p, ringTexC, col, 4, 5, 0.45, 2.2); break; }
      case 'meditate': { const p = raidPos(R.r.i, 0.4); for (let k = 0; k < 3; k++) burstRing(p.x, p.z, 2 + k, col, 0.6 + k * 0.2); emit(p.x, 0.3, p.z, 40, col, { speed: 2, life: 1.2, size: 0.35, vy: 4, grav: 0, spread: 1.2 }); break; }
      case 'evade': { const p = raidPos(R.r.i, 1.2); emit(p.x, p.y, p.z, 24, col, { speed: 3, life: 0.5, size: 0.35 }); break; }
    }
  }

  // ---------- pilotage par image ----------
  const CAST_STANCE = { aube: ['castOracle', 'channelOracle'], nanochir: ['castMedic', 'channelMedic'] };
  function driveRaider(R, dt, moving) {
    const r = R.r;
    if (!R.model) return;
    const alive = r.alive;
    R.moveW += ((moving && alive ? 1 : 0) - R.moveW) * Math.min(1, dt * 8);
    if (alive) { playAction(R.anim, moving ? 'run' : 'idle', 0.18); R.anim.mixer.timeScale = 1; }
    else R.anim.mixer.timeScale = Math.max(0, R.anim.mixer.timeScale - dt * 3);
    R.anim.mixer.update(dt);
    if (!alive && !R.dead) { R.dead = 1; R.react = null; R.act = null; play(R, 'death'); setDim(R, true); }
    else if (alive && R.dead) { R.dead = 0; R.act = null; play(R, 'rise'); setDim(R, false); }
    // posture : incantation du joueur
    let stn = R.sp.stance;
    if (r.isMe && S && S.player.cast && alive && CAST_STANCE[S.kit.id]) stn = CAST_STANCE[S.kit.id][S.player.cast.channel ? 1 : 0];
    R.stanceName = stn;
    if (S && alive && !S.over && S.started !== false) autoAttack(R, dt, moving);
    if (R.delayed && (R.delayed.t -= dt) <= 0) { const d = R.delayed; R.delayed = null; play(R, d.name, d.o); }
    stepAct(R, dt);
    compose(R, dt);
    // traînée d'arme
    if (R.trail) {
      const tb = R.act && R.act.a.trailBone;
      if (tb) updateTrail(R.trail, R.bones.rleg.getWorldPosition(_tb), R.bones[tb].getWorldPosition(_tt), dt);
      else if (R.act && R.act.a.trailOff && R.offObj) { R.offObj.userData.tip.getWorldPosition(_tt); R.offObj.getWorldPosition(_tb); updateTrail(R.trail, _tb, _tt, dt); }
      else { tipPos(R, _tt); (R.wObj.userData.baseO ? R.wObj.userData.baseO.getWorldPosition(_tb) : R.wObj.getWorldPosition(_tb)); updateTrail(R.trail, _tb, _tt, dt); }
    }
    // tissus : balancement selon la vitesse et les élans
    const sw = R.moveW * 1.0 + (R.act && R.act.a.lunge ? 0.5 : 0) + (R.act && R.act.a.blink ? 0.8 : 0);
    for (const u of R.capes) u.uSwing.value += (sw + (u.base || 0) - u.uSwing.value) * Math.min(1, dt * 3);
    for (const s of R.spin) { if (s.axis === 'z') s.o.rotation.z += dt * s.s; else s.o.rotation.z += dt * s.s; }
    if (R.motes) R.motes.forEach((m, k) => { const a = time * (1.2 + k * 0.3) + k * 2.1; m.position.set(Math.cos(a) * 0.55, 1.15 + Math.sin(time * 2 + k) * 0.25, Math.sin(a) * 0.55); m.visible = alive; });
    // ailes (battement lent), émetteurs (fumée, braises), laser de visée
    if (R.flaps) { const s = Math.sin(time * 1.9 + R.ph), act = R.act ? 0.25 : 0; for (const f of R.flaps) { f.o.rotation.y = f.sd * (f.a0 - 0.1 - 0.14 * s - act); f.o.rotation.z = -f.sd * 0.05 * s; } }
    if (R.emitters && alive) for (const em of R.emitters) { em.t -= dt; if (em.t <= 0) { em.t = em.every * (0.6 + Math.random() * 0.8); em.o.getWorldPosition(_e1); emit(_e1.x, _e1.y, _e1.z, em.n, em.col, em.opt); } }
    if (R.laser) { if (R.laserT > 0 && alive && R.laserTo) { R.laserT -= dt; setBeam(R.laser, tipPos(R, _e1), R.laserTo, 0.55 + 0.35 * Math.sin(time * 37)); } else R.laser.visible = false; }
    // drone médical
    if (R.drone) {
      const want = R.root.localToWorld(_e2.set(-0.42, 1.55 + Math.sin(time * 2.2 + R.ph) * 0.06, -0.25));
      if (!alive) want.y = 0.4;
      R.drone.position.lerp(want, Math.min(1, dt * 5));
      const ht = R.beamT > 0 ? R.beamTo : (r.isMe && S && S.player.cast ? S.player.cast.target : (!r.isMe && r.role === 'heal' ? r.healTarget : -1));
      const tR = ht >= 0 ? raidM[ht] : null;
      if (tR && tR.r.alive && alive && tR !== R) { const tp = raidPos(ht, 1.3); R.drone.lookAt(tp); setBeam(R.droneBeam, R.drone.userData.eye.getWorldPosition(_e1), tp, 0.35 + 0.25 * Math.sin(time * 11 + R.ph) + Math.min(0.6, R.beamT)); if (Math.random() < 0.25) emit(tp.x, tp.y, tp.z, 1, R.st.accent, { speed: 1.2, life: 0.5, size: 0.25, vy: 1.5, grav: 0 }); }
      else { R.droneBeam.visible = false; R.drone.rotation.y += dt * 0.8; }
      R.beamT = Math.max(0, R.beamT - dt);
    }
  }
  function setDim(R, on) { if (!R.model) return; R.model.traverse(o => { if (o.isMesh && o.userData.live) o.material = on ? o.userData.dead : o.userData.live; }); if (R.accGlow) R.accGlow.visible = !on; }
  function updateCharFx(dt) {
    updateSfx(dt); updateProj(dt);
    for (const R of raidM.concat(lab ? lab.list : [])) if (R.ghosts) for (const g of R.ghosts) { if (g.t < 1) { g.t = Math.min(1, g.t + dt * 2.2); g.mat.opacity = 0.5 * (1 - g.t); if (g.t >= 1) g.o.visible = false; } }
  }
  function clearChars() {
    for (const o of charObjs) scene.remove(o); charObjs.length = 0;
    for (const p of proj) { if (p.sp) p.sp.visible = false; if (p.sp2) p.sp2.visible = false; if (p.obj) scene.remove(p.obj); } proj.length = 0;
    for (const f of sfx) f.s.visible = false; sfx.length = 0;
  }

  // ---------- événements du moteur → gestes ----------
  const RM = i => raidM[i];
  // sorts de la barre → geste de la classe qui le lance
  const SPELL_ACT = {
    gardien: { provoc: 'gTaunt', egide: 'aegis' },
    titan: { provoc: 'tTaunt', carapace: 'fortify', seisme: 'quake' },
    medic: { nuee: 'mSwarm', purge: 'mScan' },
    seraphe: { prisme: 'sPrism', rez: 'sRez' },
    maree: { vague: 'tideCall', purge: 'purify', rez: 'tideRez' },
    lameombre: { pas: 'sBlink' },
    fracasseur: { tourbillon: 'whirl', cri: 'roar' },
    spectre: { tir: 'chargeShot' },
    bricoleur: { tourelle: 'deploy', dome: 'deploy' },
  };
  const SPELL_ACT_DEF = { provoc: 'taunt', egide: 'brace', carapace: 'steel', seisme: 'slam', nuee: 'swarmSend', purge: 'purify', prisme: 'prism', rez: 'meditate', vague: 'meditate', pas: 'blink', tourbillon: 'sweep2h', cri: 'shout', tir: 'snipe', tourelle: 'grenade', dome: 'grenade' };
  const SPELL_TGT = new Set(['tir', 'pas', 'tourelle', 'dome', 'vague']);
  const INT_ACT = { gardien: 'thrust', lameombre: 'sabreX', spectre: 'quickShot', rempart: 'shieldThrow', precision: 'snipe' };
  function playIf(i, name, o) { const R = RM(i); if (R && R.r.alive) play(R, name, o); }
  function charEvent(e) {
    switch (e.type) {
      case 'pheal': {
        const R = RM(me); if (!R) break;
        const kit = S.kit.id, id = e.id;
        if (kit === 'aube') {
          if (id === 'prisme') { play(R, 'prism'); const tp = raidPos(e.target, 1.3); pop(tp, starTex, '#fff3c4', 5, 2.4, 0.4, 1.4); }
          else if (id === 'halo') play(R, 'haloCast');
          else if (id === 'purif') play(R, 'purify');
          else if (id !== 'aurore' && id !== 'auto') { play(R, 'castRelease'); const from = tipPos(R, _e1), tp = raidPos(e.target, 1.4); tracer(from, tp, '#ffe39a', 0.16, 2.4); pop(from, starTex, '#ffe39a', 5, 1.6, 0.18); pop(tp, starTex, '#fff3c4', 5, 2.2, 0.3, 1.6); return true; }
        } else if (kit === 'nanochir') {
          if (id === 'injection') play(R, 'injector');
          else if (id === 'essaim' || id === 'nuee') play(R, 'swarmSend');
          else if (id === 'purge') play(R, 'purify');
          else if (id !== 'auto') { play(R, 'medicRelease'); const from = tipPos(R, _e1), tp = raidPos(e.target, 1.4); tracer(from, tp, '#9dff8a', 0.14, 1.4); muzzle(from, '#9dff8a', 0.9); R.beamT = 1.0; R.beamTo = e.target; }
          if (e.target >= 0) { R.beamT = Math.max(R.beamT, 0.8); R.beamTo = e.target; }
        }
        break;
      }
      case 'spell': {
        const R = RM(e.by); if (!R || !R.r.alive) break;
        const tp = new T.Vector3(e.x, 1.4, e.z);
        const nm = (SPELL_ACT[R.r.cls] || {})[e.id] || SPELL_ACT_DEF[e.id];
        if (nm) { R.act = null; play(R, nm, SPELL_TGT.has(e.id) ? { tgt: tp, reach: 1.5 } : {}); }
        break;
      }
      case 'pstrike': { const R = RM(me); if (!R) break; const t = aimTarget(R, true); play(R, S.kit.id === 'rempart' ? 'bash' : 'palmR', t ? { tgt: t.p, reach: t.reach } : {}); break; }
      case 'pbuff': { const R = RM(me); if (!R) break; play(R, e.id === 'acier' ? 'steel' : e.id === 'pas' ? 'evade' : 'brace'); break; }
      case 'taunt': { const R = RM(e.i); if (R && R.r.alive && !R.act) play(R, 'taunt'); break; }
      case 'shout': playIf(me, 'shout'); break;
      case 'selfheal': break;
      case 'interrupt': { const R = e.by >= 0 ? RM(e.by) : null; if (!R || !R.r.alive) break; const t = aimTarget(R, true); const nm = INT_ACT[R.r.cls] || INT_ACT[R.r.vspec] || (R.sp.autos ? R.sp.autos[0] : null); if (nm) play(R, nm, t ? { tgt: t.p, reach: t.reach } : {}); break; }
      case 'busterHit': { const R = RM(e.i); if (R) play(R, 'stagger', { amp: Math.min(1.4, 0.8 + e.stacks * 0.2) }); break; }
      case 'raidHit': for (const R of raidM) if (R.r.alive) R.delayed = { t: Math.random() * 0.15, name: 'flinch', o: { amp: 0.8 + Math.random() * 0.4 } }; break;
      case 'markExplode': case 'soakHit': case 'orbExplode': case 'addExplode': for (const R of raidM) if (R.r.alive && Math.hypot(R.root.position.x - e.x, R.root.position.z - e.z) < (e.r || 8) + 1) play(R, 'flinch', { amp: 0.7 }); break;
      case 'end': if (e.result === 'kill') for (const R of raidM) if (R.r.alive) R.delayed = { t: 0.5 + Math.random() * 0.6, name: 'cheer', o: {} }; break;
    }
    return false;
  }

  // ---------- boss : gestes ----------
  const BA = {};
  const BW_UP = { spine: [-0.35, 0, 0], spine2: [-0.15, 0, 0], head: [-0.2, 0, 0], rarm: [-2.7, 0.1, -0.25], rfore: [-0.6, 0, 0], larm: [-2.7, -0.1, 0.25], lfore: [-0.6, 0, 0] };
  BA.bHookR = { dur: 1.0, keys: [[0, {}], [0.42, { spine: [-0.05, 0.55, 0], rarm: [-0.5, -0.4, -1.1], rfore: [-1.3, 0, 0] }, 'out'], [0.6, { spine: [0.25, -0.5, 0], spine2: [0.1, -0.2, 0], rarm: [-1.55, 0.7, -0.25], rfore: [-0.2, 0, 0] }, 'in'], [1, {}, 'io']], ev: [[0.58, 'hit']] };
  BA.bHookL = { dur: 1.0, keys: [[0, {}], [0.42, { spine: [-0.05, -0.55, 0], larm: [-0.5, 0.4, 1.1], lfore: [-1.3, 0, 0] }, 'out'], [0.6, { spine: [0.25, 0.5, 0], spine2: [0.1, 0.2, 0], larm: [-1.55, -0.7, 0.25], lfore: [-0.2, 0, 0] }, 'in'], [1, {}, 'io']], ev: [[0.58, 'hit']] };
  BA.bWind = { dur: 1.2, hold: true, keys: [[0, {}], [1, BW_UP, 'out']] };
  BA.bSlam = { dur: 1.1, keys: [[0, BW_UP], [0.22, { spine: [0.65, 0, 0], spine2: [0.2, 0, 0], head: [0.2, 0, 0], rarm: [-1.0, 0.15, -0.1], rfore: [-0.1, 0, 0], larm: [-1.0, -0.15, 0.1], lfore: [-0.1, 0, 0] }, 'in'], [0.6, { spine: [0.6, 0, 0], spine2: [0.2, 0, 0], rarm: [-1.0, 0.15, -0.1], larm: [-1.0, -0.15, 0.1] }], [1, {}, 'io']] };
  BA.bCharge = { dur: 1.5, hold: true, keys: [[0, {}], [1, { spine: [-0.3, 0, 0], head: [-0.4, 0, 0], rarm: [-2.2, 0, -0.9], rfore: [-0.3, 0, 0], larm: [-2.2, 0, 0.9], lfore: [-0.3, 0, 0] }, 'out']] };
  BA.bRelease = { dur: 1.0, keys: [[0, { spine: [-0.3, 0, 0], head: [-0.4, 0, 0], rarm: [-2.2, 0, -0.9], larm: [-2.2, 0, 0.9] }], [0.2, { spine: [0.3, 0, 0], rarm: [-1.2, 0, -1.3], rfore: [0, 0, 0], larm: [-1.2, 0, 1.3], lfore: [0, 0, 0] }, 'in'], [1, {}, 'io']] };
  BA.bSweepWind = { dur: 1.2, hold: true, keys: [[0, {}], [1, { spine: [0.05, -0.9, 0], spine2: [0, -0.35, 0], rarm: [-1.0, -0.9, -1.0], rfore: [-0.4, 0, 0], larm: [-0.6, -0.6, 0.6], lfore: [-1.0, 0, 0] }, 'out']] };
  BA.bSweep = { dur: 1.1, keys: [[0, { spine: [0.05, -0.9, 0], spine2: [0, -0.35, 0], rarm: [-1.0, -0.9, -1.0], rfore: [-0.4, 0, 0] }], [0.3, { spine: [0.2, 0.8, 0], spine2: [0.05, 0.35, 0], rarm: [-1.4, 1.2, -0.4], rfore: [0, 0, 0], larm: [-0.3, 0.4, 0.8] }, 'in'], [1, {}, 'io']] };
  BA.bRoar = { dur: 2.0, keys: [[0, {}], [0.25, { spine: [-0.4, 0, 0], spine2: [-0.2, 0, 0], head: [-0.5, 0, 0], rarm: [-0.9, 0, -1.4], rfore: [-0.8, 0, 0], larm: [-0.9, 0, 1.4], lfore: [-0.8, 0, 0] }, 'out'], [0.75, { spine: [-0.35, 0, 0], head: [-0.45, 0, 0], rarm: [-0.9, 0, -1.4], rfore: [-0.8, 0, 0], larm: [-0.9, 0, 1.4], lfore: [-0.8, 0, 0] }], [1, {}, 'io']] };
  BA.bStagger = { dur: 1.0, add: true, keys: [[0, {}], [0.2, { spine: [-0.35, 0.2, 0.15], head: [-0.3, 0, 0] }, 'out'], [1, {}, 'io']] };
  for (const k in BA) { const a = BA[k]; const mask = new Uint8Array(NB + 2); const keys = a.keys.map(([t, p, e]) => { const c = pz(p); for (let i = 0; i < mask.length; i++) mask[i] |= c.m[i]; return { t, p: c, e }; }); ACT[k] = Object.assign({}, a, { name: k, keys, mask }); }
  const ZV = new Float32Array(NCH);
  function bossInit(rg) { if (!rg.skel) return; rg.model = rg.skel; rg.bones = Object.assign(rg.bones || {}, getBones(rg.skel)); rg.bonesP = getBones(rg.skel); rg.isBoss = true; rg.swingT = 1.5 + Math.random(); rg.side = 0; }
  function bossPlay(rg, name, o = {}) {
    if (!rg.bonesP) return; const a = ACT[name]; if (!a) return;
    if (a.add) { rg.react = { a, t: 0, o, amp: 1 }; return; }
    rg.act = { a, t: 0, o, ev: 0, dur: o.dur || a.dur };
  }
  function bossPose(rg, dt, k) {
    if (!rg.bonesP) return;
    P0.fill(0);
    const AC = rg.act;
    if (AC) {
      AC.t += dt; const a = AC.a, dur = AC.dur, kk = Math.min(1, AC.t / dur);
      if (a.ev) while (AC.ev < a.ev.length && kk >= a.ev[AC.ev][0]) bossEvent(rg, k, a.ev[AC.ev++][1], AC.o);
      evalAct(a, kk, ZV, PA);
      const w = Math.max(0, a.hold ? Math.min(1, AC.t / 0.15) : Math.min(1, AC.t / 0.12, (dur - AC.t) / 0.25));
      for (let c = 0; c < NB * 3; c++) P0[c] = PA[c] * w;
      if (kk >= 1 && !a.hold) rg.act = null;
    }
    if (rg.react) { rg.react.t += dt; const a = rg.react.a, kk = Math.min(1, rg.react.t / a.dur); evalAct(a, kk, ZV, PA); for (let c = 0; c < NB * 3; c++) P0[c] += PA[c]; if (kk >= 1) rg.react = null; }
    applyBossPose(rg, P0);
  }
  function applyBossPose(rg, v) { overlay(rg.root, rg.skel, rg.bonesP, v, rg.ov || (rg.ov = {})); }
  function bossEvent(rg, k, name, o) {
    if (name !== 'hit' || !S) return;
    const b = S.bodies[k]; if (!b) return;
    const R = raidM[b.target]; if (!R || !R.r.alive) return;
    const p = raidPos(b.target, 1.5);
    const tank = R.r.role === 'tank', mine = R.r.isMe;
    const barrier = mine && S.role === 'tank' && (S.t < (S.player.buffs.barriere || 0) || S.t < (S.player.buffs.acier || 0));
    const dodge = false;
    if (dodge) { play(R, 'evade'); emit(p.x, p.y, p.z, 12, R.st.accent, { speed: 4, life: 0.4, size: 0.3 }); }
    else if ((R.r.vspec === 'rempart' || R.r.vspec === 'gardien' || R.r.vspec === 'titan') && (barrier || Math.random() < 0.6)) { play(R, 'block'); const s = R.offObj ? R.offObj.getWorldPosition(_e1) : p; pop(s, ringTexC, R.st.accent, 4, 1.8, 0.2, 1.5); emit(s.x, s.y, s.z, 18, '#cfe6ff', { speed: 8, life: 0.3, size: 0.25 }); }
    else { play(R, 'flinch', { amp: tank ? 0.8 : 1.2 }); emit(p.x, p.y, p.z, 14, '#ffb27a', { speed: 6, life: 0.35, size: 0.3 }); }
    pop(p, starTex, '#ffd2a0', 4, 1.6, 0.14, 1.5);
    if (mine) cam.shake = Math.max(cam.shake, 0.18);
  }
  // attaques de mêlée « cosmétiques » du boss sur son tank (les dégâts sont continus dans le moteur)
  function bossAuto(rg, k, dt) {
    if (!S || !rg.bonesP || S.over || rg.dead) return;
    const b = S.bodies[k]; if (!b || b.cast || b.centerMove) return;
    const t = S.raiders[b.target]; if (!t || !t.alive || Math.hypot(t.pos.x - b.pos.x, t.pos.z - b.pos.z) > 7.5) return;
    rg.swingT -= dt; if (rg.swingT > 0 || rg.act) return;
    rg.swingT = 2.0 + Math.random() * 0.8;
    bossPlay(rg, (rg.side++ % 2) ? 'bHookL' : 'bHookR');
  }

  // ---------- banc d'essai (captures de mise au point) ----------
  let lab = null;
  function labInit(cfg) {
    if (lab) lab.list.forEach(disposeRaider);
    if (cfg.noBoss) { disposeRigs(previewRigs); previewRigs = []; previewModel = '__lab'; }
    lab = { cfg, list: [] };
    (cfg.specs || []).forEach((spec, i) => {
      const s = DATA.VSPECS[spec]; const n = cfg.specs.length;
      const r = { i, spec, cls: s.cls, vspec: spec, vcls: s.cls, role: s.role, range: s.range, isMe: false, pos: { x: (i - (n - 1) / 2) * (cfg.gap || 2.4), z: cfg.z || 0 }, alive: true, stacks: {}, debuffs: [] };
      const R = buildRaider(r); R.root.rotation.y = cfg.rot ?? 0; R.ring.visible = false; lab.list.push(R);
    });
    lab.frames = cfg.frames || [];
  }
  const isDesc = (o, p) => { while (o) { if (o === p) return true; o = o.parent; } return false; };
  function labUpdate(dt) {
    lab.list.forEach((R, i) => {
      const f = lab.frames[i] || {};
      if (R.anim) { const ac = R.anim.actions[f.moving ? 'run' : 'idle']; for (const k in R.anim.actions) R.anim.actions[k].setEffectiveWeight(k === (f.moving ? 'run' : 'idle') ? 1 : 0); ac.play(); ac.time = f.at ?? 0.4; R.anim.mixer.update(0); }
      R.moveW = f.moving ? 1 : 0;
      if (f.raw) { STZ['_raw' + i] = pz(f.raw); R.stanceName = '_raw' + i; } else R.stanceName = f.stance || R.sp.stance;
      R.stV.set(STZ[R.stanceName].v);
      if (f.act) { const a = ACT[f.act]; R.act = { a, t: (f.k || 0) * a.dur, o: {}, ev: 999 }; R.lungeD = (f.lunge ?? 1.2); } else R.act = null;
      R.react = null;
      if (f.hide) { R.model.traverse(o => { if (o.isMesh || o.isSprite) { const tag = o.isSkinnedMesh ? 'body' : (R.wObj && isDesc(o, R.wObj)) ? 'weapon' : 'acc'; o.visible = !f.hide.includes(tag); } }); if (R.drone) R.drone.visible = !f.hide.includes('drone'); }
      compose(R, 0);
      for (const u of R.capes) u.uSwing.value = R.moveW + (u.base || 0);
      for (const s of R.spin) s.o.rotation.z = 0.3;
      if (R.motes) R.motes.forEach((m, k) => { const a = k * 2.1; m.position.set(Math.cos(a) * 0.55, 1.15, Math.sin(a) * 0.55); });
      if (R.flaps) for (const fl of R.flaps) fl.o.rotation.y = fl.sd * (fl.a0 - 0.1);
      if (R.drone) { R.drone.position.copy(R.root.localToWorld(_e2.set(-0.42, 1.55, -0.25))); R.drone.rotation.y = R.root.rotation.y; }
    });
  }
