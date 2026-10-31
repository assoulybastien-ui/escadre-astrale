// Interface : écrans, HUD, stick flottant (un seul contrôle), clavier pour l'ordinateur, conseils de prise en main.
const UI = (() => {
  const $ = id => document.getElementById(id);
  const S = GAME.S, W = WORLD;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fmt = n => Math.round(n).toLocaleString('fr-FR');
  const dec = (n, d = 1) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const chrono = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + dec(s, 1); };
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, R: 64 };
  const kb = { l: 0, r: 0, u: 0, d: 0, x: 0, y: 0 };
  const cache = {};
  let el = {};

  function setText(k, v) { if (cache[k] !== v) { cache[k] = v; el[k].textContent = v; } }

  function init() {
    el = { hSpeed: $('hSpeed'), hAgl: $('hAgl'), hScore: $('hScore'), hCombo: $('hCombo'), hGateTxt: $('hGateTxt'), hGateDist: $('hGateDist'), hTime: $('hTime') };
    $('btnPlay').addEventListener('click', () => { AUDIO.unlock(); GAME.start(); });
    $('btnAgain').addEventListener('click', () => { AUDIO.unlock(); GAME.start(); });
    $('btnPause').addEventListener('click', () => pause(true));
    $('btnResume').addEventListener('click', () => pause(false));
    $('btnRestart').addEventListener('click', () => { GAME.start(); });
    $('btnMenu').addEventListener('click', () => GAME.menu());
    $('btnMenu2').addEventListener('click', () => GAME.menu());
    const inv = $('optInvert'), snd = $('optSound');
    inv.checked = !!S.save.opts.invert; snd.checked = S.save.opts.sound !== false;
    AUDIO.setEnabled(snd.checked);
    inv.addEventListener('change', () => GAME.setOpt('invert', inv.checked));
    snd.addEventListener('change', () => { GAME.setOpt('sound', snd.checked); AUDIO.setEnabled(snd.checked); });
    const t = $('touch');
    t.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key(true)); window.addEventListener('keyup', key(false));
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('touchmove', e => { if (e.target.closest && !e.target.closest('.screen')) e.preventDefault(); }, { passive: false });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
    // chiffres de la descente
    $('tCourse').textContent = W.name;
    $('fLen').textContent = dec(W.FACTS.length / 1000, 1).replace(',0', '') + ' km';
    $('fDrop').textContent = W.FACTS.drop + ' m';
    $('fGates').textContent = W.FACTS.gates;
    showTitle();
  }

  // ---------- stick flottant ----------
  function down(e) {
    AUDIO.unlock();
    if (S.screen === 'crash') { if (S.crashT > 0.45) GAME.start(); return; }
    if (S.screen !== 'run' || S.paused || stick.id !== null) return;
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
    $('stick').hidden = false; drawStick(0, 0);
    e.preventDefault();
  }
  function move(e) {
    if (e.pointerId !== stick.id) return;
    e.preventDefault();
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
    const R = stick.R, d = Math.hypot(dx, dy);
    // au-delà du cercle, le stick suit le pouce : on ne « perd » jamais le contrôle
    if (d > R * 1.2) { const k = (d - R * 1.2) / d; stick.ox += dx * k; stick.oy += dy * k; dx = e.clientX - stick.ox; dy = e.clientY - stick.oy; }
    const dd = Math.hypot(dx, dy), c = Math.min(1, dd / R);
    stick.x = curve(dd > 0 ? dx / dd * c : 0); stick.y = curve(dd > 0 ? -dy / dd * c : 0);
    const k2 = dd > R ? R / dd : 1;
    drawStick(dx * k2, dy * k2);
    apply();
  }
  function up(e) {
    if (e.pointerId !== stick.id) return;
    stick.id = null; stick.x = stick.y = 0; $('stick').hidden = true; apply();
  }
  // petite zone morte + courbe douce au centre, pleine course au bord
  function curve(v) { const a = Math.abs(v), b = a < 0.06 ? 0 : (a - 0.06) / 0.94; return Math.sign(v) * (0.45 * b + 0.55 * b * b); }
  function drawStick(dx, dy) {
    const s = $('stick');
    s.style.transform = `translate(${stick.ox}px, ${stick.oy}px)`;
    s.querySelector('.knob').style.transform = `translate(${dx}px, ${dy}px)`;
  }
  function apply() {
    const inv = S.save.opts.invert ? -1 : 1;
    S.input.x = clamp(stick.x + kb.x, -1, 1);
    S.input.y = clamp((stick.y + kb.y) * inv, -1, 1);
  }
  function key(isDown) {
    return e => {
      const k = e.key;
      if (isDown && (k === ' ' || k === 'Enter')) { if (S.screen === 'title' || S.screen === 'results' || S.screen === 'crash') { AUDIO.unlock(); GAME.start(); e.preventDefault(); return; } }
      if (isDown && k === 'Escape' && S.screen === 'run') { pause(!S.paused); return; }
      const m = { ArrowLeft: 'l', a: 'l', q: 'l', ArrowRight: 'r', d: 'r', ArrowUp: 'u', w: 'u', z: 'u', ArrowDown: 'd', s: 'd' }[k];
      if (!m) return;
      kb[m] = isDown ? 1 : 0; e.preventDefault();
    };
  }
  function keysFrame(dt) {
    // rampe douce pour le clavier (sinon le contrôle est tout ou rien)
    const tx = kb.r - kb.l, ty = kb.u - kb.d, k = 1 - Math.exp(-dt * 6);
    kb.x += (tx - kb.x) * k; kb.y += (ty - kb.y) * k;
    if (Math.abs(kb.x) < 0.01 && !tx) kb.x = 0; if (Math.abs(kb.y) < 0.01 && !ty) kb.y = 0;
    apply();
  }

  function pause(b) {
    if (S.screen !== 'run') return;
    GAME.pause(b);
    $('scrPause').hidden = !b;
    if (b) { stick.id = null; stick.x = stick.y = 0; $('stick').hidden = true; apply(); }
  }

  // ---------- écrans ----------
  function showTitle() {
    $('scrTitle').hidden = false; $('scrResult').hidden = true; $('scrPause').hidden = true; $('hud').hidden = true; $('crash').hidden = true;
    const b = S.save.best;
    const med = b && b.medal ? ' · ' + GAME.MEDALS.find(m => m.id === b.medal).nom : '';
    $('tBest').textContent = b ? `Record ${fmt(b.score)}${med} · ${chrono(b.time)} · ton fantôme vole avec toi` : 'Pas encore de record sur cette descente';
  }
  function on(e) {
    switch (e.type) {
      case 'start':
        $('scrTitle').hidden = true; $('scrResult').hidden = true; $('scrPause').hidden = true; $('crash').hidden = true; $('hud').hidden = false;
        $('pops').textContent = ''; break;
      case 'menu': showTitle(); break;
      case 'pop': pop(e); break;
      case 'crash':
        $('crashWhy').textContent = e.reason; $('crash').hidden = false;
        stick.id = null; stick.x = stick.y = 0; $('stick').hidden = true; apply(); break;
      case 'results': results(e.res); break;
    }
  }
  function pop(e) {
    const d = document.createElement('div');
    d.className = 'pop ' + (e.kind || '');
    d.textContent = e.text;
    if (e.pts) { const b = document.createElement('b'); b.textContent = '+' + fmt(e.pts); d.appendChild(b); }
    const box = $('pops'); box.appendChild(d);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => d.remove(), 1500);
  }
  function results(res) {
    $('hud').hidden = true; $('crash').hidden = true; $('stick').hidden = true;
    $('scrResult').hidden = false;
    $('rKind').textContent = res.kind === 'pose' ? (res.land && res.land.inTarget ? 'Posé dans la cible' : 'Posé') : 'Arrêté avant la prairie';
    $('rScore').textContent = fmt(res.score);
    const m = $('rMedal');
    m.className = 'medal ' + (res.medal ? res.medal.id : 'none');
    m.textContent = res.medal ? res.medal.nom : 'Sans médaille';
    const rec = $('rRecord');
    rec.className = 'sub' + (res.record ? ' rec' : '');
    rec.textContent = res.record ? 'Nouveau record : ton fantôme volera avec toi' : res.best ? 'Record : ' + fmt(res.best) : '';
    const nextM = [...GAME.MEDALS].reverse().find(x => res.score < x.min);
    $('rNext').textContent = res.kind !== 'pose' ? 'Il faut se poser dans la prairie pour obtenir une médaille.' : nextM ? `${nextM.nom} à partir de ${fmt(nextM.min)} points` : 'Meilleure médaille obtenue';
    const rows = [
      ['Temps', chrono(res.time), ''],
      ['Portes', `${res.gateOk} / ${res.gates}`, res.gatePts],
      ['Rase-mottes', dec(res.closeT, 1) + ' s sous 6 m', res.prox],
      ['Touch & go', res.touch, res.touchPts],
      ['Sapins frôlés', res.near, res.nearPts],
      ['Télésiège', res.cable === 'sous' ? 'dessous' : res.cable === 'dessus' ? 'au-dessus' : '—', res.cablePts],
      ['Atterrissage', res.land ? (res.land.glisse ? `${res.land.grade} · entrée à ${dec(res.land.d, 0)} m` : `${res.land.grade} · ${dec(res.land.d, 0)} m · ${dec(res.land.vn, 1)} m/s`) : '—', res.land ? res.land.pts : 0],
      ['Vitesse max', Math.round(res.maxV * 3.6) + ' km/h', '']
    ];
    const dl = $('rRows'); dl.textContent = '';
    for (const [k, v, p] of rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      const pp = document.createElement('dd'); pp.className = 'pts'; pp.textContent = p === '' ? '' : p ? '+' + fmt(p) : '0';
      dl.append(dt, dd, pp);
    }
  }

  // ---------- conseils (premières descentes) ----------
  function hintFor(r) {
    const p = r.p;
    if (p.mode === 'ready') return 'Pose le pouce n’importe où et glisse vers le haut pour t’élancer';
    if (p.mode === 'ski' && !p.launched) return p.V > 8.5 ? 'Glisse vers le bas pour décoller' : 'Garde le stick vers le haut pour prendre de l’élan';
    if ((S.save.runs || 0) > 3) return '';
    if (p.mode === 'air' && p.airT < 4 && r.gate === 0) return 'Haut : piquer · Bas : freiner · Côtés : tourner';
    if (r.gate === 0) return 'Passe entre les piquets orange, sous la banderole';
    const toCable = -p.pos.z - W.CABLE.s;
    if (!r.cable && toCable > -130 && toCable < -15) return 'Télésiège devant : câble à 18 m, passe dessous en rasant la neige';
    if (r.gate >= W.GATES.length && p.mode === 'air') return 'Pose-toi dans la cible orange : tire juste avant de toucher';
    if (r.gate === 1 && r.gateOk === 1) return 'Reste près de la neige : plus tu rases vite, plus le combo grimpe';
    return '';
  }

  // ---------- HUD ----------
  function hud(dt) {
    const r = S.run; if (!r) return;
    const p = r.p;
    setText('hSpeed', String(Math.round(p.V * 3.6)));
    const agl = p.mode === 'air' ? Math.max(0, r.clear.agl) : 0;
    setText('hAgl', agl < 10 ? dec(agl, 1) : String(Math.round(agl)));
    $('hAglBox').classList.toggle('close', p.mode === 'air' && r.clear.c < 6);
    setText('hScore', fmt(r.score));
    setText('hCombo', '×' + dec(r.combo, 1));
    el.hCombo.classList.toggle('c1', r.combo < 1.05);
    setText('hTime', chrono(r.t));
    // flèche vers la prochaine porte (ou la cible)
    const g = W.GATES[r.gate], tx = g ? g.x : W.LAND.x, tz = g ? g.z : W.LAND.z;
    let hx = p.vel.x, hz = p.vel.z; if (Math.hypot(hx, hz) < 1) { hx = p.dir.x; hz = p.dir.z; }
    let a = Math.atan2(tx - p.pos.x, -(tz - p.pos.z)) - Math.atan2(hx, -hz);
    while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI;
    $('hArrow').style.transform = `rotate(${a.toFixed(3)}rad)`;
    setText('hGateTxt', g ? `Porte ${r.gate + 1}/${W.GATES.length}` : 'Cible');
    $('hGate').classList.toggle('land', !g);
    setText('hGateDist', Math.round(Math.hypot(tx - p.pos.x, tz - p.pos.z)) + ' m');
    // conseil
    const h = hintFor(r), hb = $('hint');
    if (h !== cache.hint) { cache.hint = h; hb.textContent = h; hb.hidden = !h; }
    // vignette de vitesse
    $('vig').style.opacity = clamp((p.V - 15) / 14, 0, 1) * (0.55 + 0.45 * (r.proxF || 0));
  }

  function frame(dt) {
    keysFrame(dt);
    if (S.screen === 'run' || S.screen === 'crash') hud(dt);
    else $('vig').style.opacity = 0;
  }

  return { init, on, frame, pause };
})();
