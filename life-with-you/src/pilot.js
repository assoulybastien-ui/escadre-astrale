// Pilote articulé : proportions d'un adulte (1,80 m en chaussures de ski), veste, casque et masque, sellette légère,
// chaussures et skis galbés. Animé chaque image :
// - bras en cinématique inverse à deux os : chaque main tient sa poignée, le coude part vers l'extérieur ;
// - jambes en cinématique inverse : à skis elles amortissent (flexion selon la vitesse et les chocs), skis à plat sur la neige ;
//   en vol elles pendent, traînent sous l'effet des accélérations et se tendent vers l'avant pour se poser ;
// - buste : penché en avant à skis, assis dans la sellette en vol, il se porte du côté du virage ; la tête regarde où l'on va.
// Repère du pilote : x à droite, y vers le haut (axe des suspentes), z vers l'arrière ; origine aux pieds.
const PILOT = (() => {
  const V3 = THREE.Vector3;
  const BONE = { thigh: 0.45, shin: 0.43, upper: 0.29, fore: 0.27 };
  const PELVIS_Y = 0.93, SHOULDER = new V3(0.19, 0.455, 0.0), HIP_X = 0.095;

  // capsule effilée le long de +y, de 0 à len (bouts arrondis de rayon r0 en bas, r1 en haut)
  function capsule(r0, r1, len, seg = 12, rings = 4) {
    const pts = [];
    for (let i = 0; i <= rings; i++) { const a = -Math.PI / 2 + (Math.PI / 2) * i / rings; pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r0), Math.sin(a) * r0)); }
    for (let i = 0; i <= rings; i++) { const a = (Math.PI / 2) * i / rings; pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r1), len + Math.sin(a) * r1)); }
    return new THREE.LatheGeometry(pts, seg);
  }
  function lathe(profile, seg = 20, sx = 1, sz = 1) {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y)), seg);
    g.scale(sx, 1, sz); g.computeVertexNormals();
    return g;
  }
  // ski galbé : spatule relevée, talon un peu relevé, taille de guêpe ; pointe vers −z, dessus à y = 0
  function skiGeo(len = 1.62, w = 0.088, th = 0.02) {
    const N = 30, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, z = (0.5 - t) * len;
      const tip = Math.max(0, (t - 0.84) / 0.16), tail = Math.max(0, (0.07 - t) / 0.07);
      const rise = 0.085 * tip * tip + 0.025 * tail * tail;
      const ww = w * (0.86 + 0.2 * Math.pow(2 * t - 1, 2)) * (1 - 0.55 * Math.pow(Math.max(0, (t - 0.95) / 0.05), 2)) * (1 - 0.3 * Math.pow(Math.max(0, (0.025 - t) / 0.025), 2));
      const y = rise;
      pos.push(-ww / 2, y, z, ww / 2, y, z, ww / 2, y - th, z, -ww / 2, y - th, z);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 4, b = a + 4;
      for (let s = 0; s < 4; s++) { const s1 = (s + 1) % 4; idx.push(a + s, b + s, a + s1, a + s1, b + s, b + s1); }
    }
    idx.push(0, 1, 2, 0, 2, 3); const e = N * 4; idx.push(e, e + 2, e + 1, e, e + 3, e + 2);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // chaussure de ski : coque basse (pied) + tige qui monte sur le tibia ; origine à la cheville
  function bootGeos() {
    const foot = new THREE.BoxGeometry(0.112, 0.095, 0.3, 2, 2, 4), p = foot.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const front = Math.max(0, (-z - 0.06) / 0.09);            // bout arrondi et plus bas
      y -= front * front * 0.03 * (y > 0 ? 1 : 0); x *= 1 - 0.18 * front * front;
      p.setXYZ(i, x, y - 0.055, z - 0.035);
    }
    foot.computeVertexNormals();
    const cuff = capsule(0.068, 0.062, 0.17, 12, 3); cuff.translate(0, -0.03, 0.01); cuff.rotateX(-0.22);
    const buckle = new THREE.BoxGeometry(0.125, 0.018, 0.05); buckle.translate(0, 0.05, -0.06);
    return { foot, cuff, buckle };
  }

  function build(opt) {
    const hook = opt.hook, env = opt.env, lin = opt.lin;
    const mats = [];
    const M = (hex, rough, metal = 0, envI = 0.6) => {
      const m = hook(new THREE.MeshStandardMaterial({ color: lin(hex), roughness: rough, metalness: metal, envMap: env || null, envMapIntensity: env ? envI : 0 }),
        sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n\tiblIrradiance = vec3( 0.0 );'); });
      mats.push(m); return m;
    };
    const C = opt.colors;
    const mJacket = M(C.jacket, 0.62), mJacket2 = M(C.jacket2, 0.62), mPants = M(C.pants, 0.78), mHelmet = M(C.helmet, 0.22, 0, 1.0);
    const mGoggle = M(0xffa040, 0.06, 1.0, 1.4), mStrap = M(0x16191e, 0.7), mSkin = M(0xc8957a, 0.75), mGlove = M(0x15171b, 0.55);
    const mBoot = M(C.boot, 0.3, 0, 0.8), mSki = M(C.ski, 0.25, 0, 0.8), mBase = M(0x0c0e12, 0.35), mMetal = M(0xb8bec6, 0.3, 1.0, 1.0), mBag = M(0x252a31, 0.7);
    const body = new THREE.Group();
    const add = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };

    // ---- buste (origine au bassin) ----
    const torso = new THREE.Group(); body.add(torso);
    add(lathe([[0, 0.0], [0.155, 0.0], [0.15, 0.1], [0.162, 0.24], [0.178, 0.36], [0.182, 0.44], [0.15, 0.5], [0.09, 0.55], [0.05, 0.57], [0, 0.575]], 22, 1.12, 0.66), mJacket, torso, 0, 0.0, 0);
    add(lathe([[0, -0.13], [0.12, -0.13], [0.165, -0.06], [0.162, 0.03], [0.15, 0.06], [0, 0.06]], 20, 1.08, 0.72), mPants, torso);
    // empiècements de la veste (épaules contrastées)
    for (const sx of [-1, 1]) { const e = add(new THREE.SphereGeometry(0.075, 12, 8), mJacket2, torso, sx * 0.175, 0.43, 0); e.scale.set(1.1, 0.8, 1.2); }
    // sellette : ceinture, cuissardes (sur les cuisses), bretelles, sangle de poitrine, dorsale
    const belt = add(new THREE.TorusGeometry(0.16, 0.018, 6, 24), mStrap, torso, 0, 0.035, 0); belt.rotation.x = Math.PI / 2; belt.scale.set(1.1, 0.72, 1);
    for (const sx of [-1, 1]) {
      const st = add(new THREE.BoxGeometry(0.045, 0.5, 0.012), mStrap, torso, sx * 0.1, 0.27, -0.118); st.rotation.z = sx * 0.12;
      const st2 = add(new THREE.BoxGeometry(0.045, 0.012, 0.25), mStrap, torso, sx * 0.13, 0.5, 0.0); st2.rotation.x = 0.1;
      // mousquetons au niveau de la poitrine (là où s'accrochent les élévateurs)
      const k = add(new THREE.TorusGeometry(0.022, 0.006, 6, 12), mMetal, torso, sx * 0.17, 0.42, -0.02); k.rotation.y = Math.PI / 2;
    }
    add(new THREE.BoxGeometry(0.22, 0.03, 0.012), mStrap, torso, 0, 0.33, -0.12);
    const bag = add(new THREE.BoxGeometry(0.3, 0.38, 0.11, 2, 2, 2), mBag, torso, 0, 0.27, 0.15);
    { const p = bag.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x * (1 - 0.15 * (z > 0 ? 1 : 0)), y, z); } bag.geometry.computeVertexNormals(); }
    // ---- tête ----
    const neck = add(capsule(0.052, 0.05, 0.07, 10, 2), mJacket, torso, 0, 0.53, 0.0);
    const head = new THREE.Group(); head.position.set(0, 0.64, 0.0); torso.add(head);
    add(new THREE.SphereGeometry(0.096, 16, 12), mSkin, head, 0, -0.01, -0.005).scale.set(0.95, 1.08, 1.0);
    const hel = add(new THREE.SphereGeometry(0.128, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), mHelmet, head, 0, 0.012, 0.008); hel.scale.set(1.0, 1.0, 1.12);
    const band = add(new THREE.CylinderGeometry(0.124, 0.124, 0.05, 24, 1, true), mStrap, head, 0, 0.0, 0.0); band.scale.set(1, 1, 1.1);
    const lens = add(new THREE.CylinderGeometry(0.131, 0.128, 0.058, 20, 1, true, Math.PI - 0.95, 1.9), mGoggle, head, 0, -0.002, -0.004); lens.scale.set(1, 1, 1.08);
    // ---- bras (segments placés chaque image) ----
    const arms = [];
    for (const s of [-1, 1]) {
      const up = add(capsule(0.058, 0.05, BONE.upper, 12, 3), mJacket, body);
      const fo = add(capsule(0.05, 0.042, BONE.fore, 12, 3), mJacket, body);
      const cuffG = add(new THREE.CylinderGeometry(0.046, 0.05, 0.06, 10), mGlove, fo, 0, BONE.fore - 0.01, 0);
      const hand = new THREE.Group(); body.add(hand);
      add(new THREE.SphereGeometry(0.05, 12, 8), mGlove, hand, 0, 0.045, 0).scale.set(0.85, 1.25, 0.72);
      const tog = add(new THREE.CylinderGeometry(0.013, 0.013, 0.11, 8), mStrap, hand, 0, 0.06, -0.025); tog.rotation.z = Math.PI / 2;
      arms.push({ s, up, fo, hand, cuffG, sh: new V3(), el: new V3(), wr: new V3(), tgt: new V3(), cur: new V3(), init: false });
    }
    // ---- jambes ----
    const bg = bootGeos(), skG = skiGeo();
    const legs = [];
    for (const s of [-1, 1]) {
      const th = add(capsule(0.088, 0.066, BONE.thigh, 12, 3), mPants, body);
      const loop = add(new THREE.TorusGeometry(0.094, 0.014, 6, 16), mStrap, th, 0, 0.08, 0); loop.rotation.x = Math.PI / 2;
      const sn = add(capsule(0.064, 0.056, BONE.shin, 12, 3), mPants, body);
      const foot = new THREE.Group(); body.add(foot);
      add(bg.foot, mBoot, foot); add(bg.cuff, mBoot, foot); add(bg.buckle, mMetal, foot);
      const ski = new THREE.Group(); ski.position.set(0, -0.112, -0.02); foot.add(ski);
      add(skG, mSki, ski);
      const base = add(new THREE.BoxGeometry(0.074, 0.004, 1.5), mBase, ski, 0, -0.021, 0.02);
      add(new THREE.BoxGeometry(0.07, 0.03, 0.34), mStrap, ski, 0, 0.012, 0.02);
      legs.push({ s, th, sn, foot, hip: new V3(), kn: new V3(), an: new V3(), tgt: new V3(), off: new V3(), offV: new V3() });
    }
    const rig = { body, torso, head, arms, legs, mats, crouch: 0.1, crouchV: 0, lean: 0, roll: 0, look: 0, align: new THREE.Quaternion(), t: 0, skiDir: new V3(0, 0, -1) };
    return rig;
  }

  // ---------- cinématique inverse à deux os ----------
  const _d = new V3(), _p = new V3(), _q = new THREE.Quaternion(), _Y = new V3(0, 1, 0), _m = new THREE.Matrix4(), _x = new V3(), _y = new V3(), _z = new V3();
  function ik2(a, target, l1, l2, pole, mid, end) {
    _d.subVectors(target, a); let L = _d.length();
    L = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, L));
    _d.normalize();
    const k = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - k * k));
    _p.subVectors(pole, a); _p.addScaledVector(_d, -_p.dot(_d)); if (_p.lengthSq() < 1e-8) _p.set(1, 0, 0); _p.normalize();
    mid.copy(a).addScaledVector(_d, k).addScaledVector(_p, h);
    end.copy(a).addScaledVector(_d, L);
  }
  function seg(mesh, a, b) { mesh.position.copy(a); _d.subVectors(b, a).normalize(); mesh.quaternion.setFromUnitVectors(_Y, _d); }
  // repère d'un pied : avant (−z local) et haut donnés
  function basis(obj, fwd, up) {
    _z.copy(fwd).multiplyScalar(-1).normalize(); _x.crossVectors(up, _z).normalize(); _y.crossVectors(_z, _x);
    _m.makeBasis(_x, _y, _z); obj.quaternion.setFromRotationMatrix(_m);
  }
  const exp = (k, dt) => 1 - Math.exp(-k * dt);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // k : { dt, agl, acc (accélération ressentie), velL (vitesse), groundUp (normale de la neige) — tous dans le repère du pilote —, launch }
  const _tmp = new V3(), _tmp2 = new V3(), _pole = new V3(), _sk = new V3(), _up = new V3(), _qa = new THREE.Quaternion();
  function pose(rig, p, k) {
    const dt = Math.max(1e-4, k.dt), t = (rig.t += dt);
    const ground = p.mode === 'ski' || p.mode === 'landing' || p.mode === 'stopped' || p.mode === 'ready';
    const crash = p.mode === 'crash';
    const bl = crash ? 0.3 + 0.3 * Math.sin(t * 11) : p.bl, br = crash ? 0.3 + 0.3 * Math.sin(t * 9 + 1) : p.br;
    // ---- le corps se redresse sur la neige (à skis) ; en vol il pend dans l'axe des suspentes ----
    if (ground && k.groundUp) _qa.setFromUnitVectors(_Y, k.groundUp); else _qa.identity();
    rig.align.slerp(_qa, exp(ground ? 8 : 5, dt));
    rig.body.quaternion.copy(rig.align);
    // ---- flexion : amorti selon la vitesse et les chocs ----
    const gl = clamp(p.gload || 1, 0, 3);
    const crouchT = crash ? 0.25 : ground ? 0.1 + 0.12 * clamp(p.V / 22, 0, 1) + 0.1 * clamp(gl - 1, 0, 1.5) + (p.mode === 'stopped' ? -0.06 : 0) : 0.02;
    rig.crouchV += ((crouchT - rig.crouch) * 140 - rig.crouchV * 16) * dt;   // jambes = ressort amorti
    rig.crouch = clamp(rig.crouch + rig.crouchV * dt, -0.02, 0.32);
    // ---- buste ----
    const dif = clamp(br - bl, -1, 1), both = Math.min(bl, br);
    const leanT = crash ? 0.5 * Math.sin(t * 7) : ground ? 0.18 + 0.5 * rig.crouch + (p.mode === 'stopped' ? -0.1 : 0) : -0.1 - 0.12 * both;
    const rollT = crash ? 0.6 * Math.sin(t * 5) : (ground ? 0.1 : 0.2) * dif;
    rig.lean += (leanT - rig.lean) * exp(6, dt); rig.roll += (rollT - rig.roll) * exp(7, dt);
    const pelvisY = PELVIS_Y - rig.crouch;
    rig.torso.position.set(0, pelvisY, ground ? -0.04 * rig.crouch : 0.03);
    rig.torso.rotation.set(-rig.lean, 0, -rig.roll, 'YXZ');
    // la tête regarde dans le virage, et vers la neige quand on la frôle
    const lookT = crash ? 0 : -dif * 0.5;
    rig.look += (lookT - rig.look) * exp(5, dt);
    const nod = (ground ? -0.1 : k.agl < 6 ? -0.3 : -0.15) + rig.lean * 0.7; // regard vers la neige devant, buste compensé
    rig.head.rotation.set(nod, rig.look, rig.roll * 0.4, 'YXZ');
    rig.torso.updateMatrix();
    // ---- bras ----
    for (const a of rig.arms) {
      const s = a.s, b = s < 0 ? bl : br;
      a.sh.set(SHOULDER.x * s, SHOULDER.y, SHOULDER.z).applyMatrix4(rig.torso.matrix);
      // poignées : en haut près des élévateurs (bras levés), en bas vers les hanches ; arc vers l'extérieur et l'avant
      if (k.launch) a.tgt.set(0.42 * s, 1.5 + 0.25 * p.inflate, 0.12 - 0.15 * p.inflate);
      else {
        const top = _tmp.set(0.27 * s, 1.84, 0.02), bot = _tmp2.set(0.31 * s, 1.06 - rig.crouch * 0.5, -0.14);
        a.tgt.copy(top).lerp(bot, b);
        const bulge = Math.sin(Math.PI * b);
        a.tgt.x += s * 0.07 * bulge; a.tgt.z -= 0.06 * bulge;
      }
      if (crash) a.tgt.set(0.55 * s, 1.3 + 0.35 * Math.sin(t * 8 + s), 0.2 * Math.cos(t * 6 + s));
      if (!a.init) { a.cur.copy(a.tgt); a.init = true; }
      a.cur.lerp(a.tgt, exp(crash ? 6 : 22, dt));
      _pole.copy(a.sh).add(_tmp.set(0.55 * s, -0.35, 0.3));
      ik2(a.sh, a.cur, BONE.upper, BONE.fore, _pole, a.el, a.wr);
      seg(a.up, a.sh, a.el); seg(a.fo, a.el, a.wr);
      a.hand.position.copy(a.wr); a.hand.quaternion.copy(a.fo.quaternion);
    }
    // ---- jambes et skis ----
    if (!ground) {
      if (k.velL) _sk.copy(k.velL).normalize(); else _sk.set(0, 0, -1);
      _sk.y += 0.12 + 0.08 * Math.min(bl, br); _sk.x *= 0.5;
      _sk.lerp(_tmp.set(0, 0.05, -1), 0.3); _sk.y = clamp(_sk.y, -0.45, 0.4); if (_sk.z > -0.6) _sk.z = -0.6;
      rig.skiDir.lerp(_sk.normalize(), exp(6, dt)).normalize();
    } else rig.skiDir.set(0, 0, -1);
    const up = _up.set(0, 1, 0); // le corps est déjà redressé sur la neige
    for (const l of rig.legs) {
      const s = l.s;
      l.hip.set(HIP_X * s, 0, 0).applyMatrix4(rig.torso.matrix);
      if (ground) l.tgt.set(0.105 * s, 0.112, 0.02);
      else {
        // en vol : jambes pendantes un peu fléchies ; près du sol en descente, elles se tendent vers l'avant pour se poser
        const prep = clamp((3.5 - k.agl) / 3, 0, 1) * (p.vel && p.vel.y < 0 ? 1 : 0.3);
        l.tgt.set(0.1 * s, 0.17 - 0.06 * prep, -0.1 - 0.08 * prep);
      }
      if (crash) l.tgt.set(0.3 * s, 0.3 + 0.2 * Math.sin(t * 9 + s * 2), 0.25 * Math.cos(t * 7 + s));
      // inertie : en vol les jambes traînent sous l'effet des accélérations (ressort amorti)
      if (!ground && k.acc) {
        _tmp.copy(k.acc).multiplyScalar(-0.014); _tmp.y = 0; _tmp.clampLength(0, 0.22);
        l.offV.addScaledVector(_tmp.sub(l.off), 60 * dt).multiplyScalar(Math.exp(-9 * dt));
        l.off.addScaledVector(l.offV, dt);
      } else { l.off.multiplyScalar(Math.exp(-10 * dt)); l.offV.set(0, 0, 0); }
      l.tgt.add(l.off);
      _pole.copy(l.hip).add(_tmp.set(0.05 * s, 0, -1));
      ik2(l.hip, l.tgt, BONE.thigh, BONE.shin, _pole, l.kn, l.an);
      seg(l.th, l.hip, l.kn); seg(l.sn, l.kn, l.an);
      l.foot.position.copy(l.an);
      // skis : à plat sur la neige au sol ; en vol, spatules un peu relevées, ils suivent la jambe
      if (ground) basis(l.foot, _sk.set(0, 0, -1), up);
      else {
        // le pilote garde ses skis dans le vent relatif, spatules un peu relevées (moins de traînée)
        basis(l.foot, rig.skiDir, _tmp.set(0, 1, 0.1).normalize());
      }
    }
  }
  // position d'une main (repère du pilote, origine aux pieds)
  function hand(rig, side, out) { return out.copy(rig.arms[side].wr).applyQuaternion(rig.body.quaternion); }
  return { build, pose, hand, BONE };
})();
