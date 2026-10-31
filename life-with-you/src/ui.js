// Interface : écrans, HUD, deux poignées de frein (une par pouce), clavier pour l'ordinateur, conseils de prise en main.
const UI = (() => {
  const $ = id => document.getElementById(id);
  const S = GAME.S, W = WORLD;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fmt = n => Math.round(n).toLocaleString('fr-FR');
  const dec = (n, d = 1) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const chrono = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + dec(s, 1); };
  // course du pouce pour tirer une poignée à fond (px)
  const TRAVEL = 95;
  const hands = { l: { id: null, x: 0, y0: 0, dy: 0, v: 0, el: null }, r: { id: null, x: 0, y0: 0, dy: 0, v: 0, el: null } };
  const kb = { l: 0, r: 0, both: 0, go: 0, vl: 0, vr: 0 };
  const cache = {};
  let el = {};

  function setText(k, v) { if (cache[k] !== v) { cache[k] = v; el[k].textContent = v; } }

  function init() {
    el = { hSpeed: $('hSpeed'), hAgl: $('hAgl'), hScore: $('hScore'), hCombo: $('hCombo'), hGateTxt: $('hGateTxt'), hGateDist: $('hGateDist'), hTime: $('hTime') };
    hands.l.el = $('gripL'); hands.r.el = $('gripR');
    $('btnPlay').addEventListener('click', () => { AUDIO.unlock(); GAME.start(); });
    $('btnAgain').addEventListener('click', () => { AUDIO.unlock(); GAME.start(); });
    $('btnPause').addEventListener('click', () => pause(true));
    $('btnResume').addEventListener('click', () => pause(false));
    $('btnRestart').addEventListener('click', () => { GAME.start(); });
    $('btnMenu').addEventListener('click', () => GAME.menu());
    $('btnMenu2').addEventListener('click', () => GAME.menu());
    const snd = $('optSound');
    snd.checked = S.save.opts.sound !== false;
    AUDIO.setEnabled(snd.checked);
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
    $('fLen').textContent = W.FACTS.length >= 1000 ? dec(W.FACTS.length / 1000, 1).replace(',0', '') + ' km' : W.FACTS.length + ' m';
    $('fDrop').textContent = W.FACTS.drop + ' m';
    $('fGates').textContent = W.FACTS.gates;
    $('fGates').parentElement.hidden = !W.FACTS.gates;
    showTitle();
  }

  // ---------- deux poignées de frein ----------
  // Moitié gauche de l'écran = poignée gauche, moitié droite = poignée droite. Le repère apparaît sous le pouce et n'en bouge plus ;
  // descendre le pouce tire la poignée (course TRAVEL). Monter au-dessus du repère ou aller sur le côté ne tire rien.
  function handOf(id) { return hands.l.id === id ? hands.l : hands.r.id === id ? hands.r : null; }
  function down(e) {
    AUDIO.unlock();
    if (S.screen === 'crash') { if (S.crashT > 0.45) GAME.start(); return; }
    if (S.screen !== 'run' || S.paused) return;
    const h = e.clientX < window.innerWidth / 2 ? hands.l : hands.r;
    if (h.id !== null) return;
    h.id = e.pointerId; h.x = e.clientX; h.y0 = e.clientY; h.dy = 0; h.v = 0;
    h.el.hidden = false; draw(h); apply();
    e.preventDefault();
  }
  function move(e) {
    const h = handOf(e.pointerId); if (!h) return;
    e.preventDefault();
    // le repère reste là où le pouce s'est posé : au-delà de la course, la poignée reste à fond ; au-dessus, mains hautes
    const dy = Math.max(0, Math.min(TRAVEL, e.clientY - h.y0));
    h.dy = dy; h.v = curve(dy / TRAVEL);
    draw(h); apply();
  }
  function up(e) {
    const h = handOf(e.pointerId); if (!h) return;
    h.id = null; h.v = 0; h.dy = 0; h.el.hidden = true; apply();
  }
  function release() { for (const h of [hands.l, hands.r]) { h.id = null; h.v = 0; h.dy = 0; h.el.hidden = true; } apply(); }
  // petite zone morte en haut, puis progression régulière
  function curve(v) { const b = v < 0.05 ? 0 : (v - 0.05) / 0.95; return Math.pow(b, 1.1); }
  function draw(h) {
    h.el.style.transform = `translate(${h.x}px, ${h.y0}px)`;
    h.el.querySelector('.knob').style.transform = `translateY(${h.dy}px)`;
    h.el.querySelector('.fill').style.height = h.dy + 'px';
  }
  function apply() {
    S.input.l = clamp(Math.max(hands.l.v, kb.vl), 0, 1);
    S.input.r = clamp(Math.max(hands.r.v, kb.vr), 0, 1);
    // départ : les deux pouces posés (ou Espace / flèche bas au clavier)
    S.input.go = (hands.l.id !== null && hands.r.id !== null) || kb.go > 0;
  }
  function key(isDown) {
    return e => {
      const k = e.key;
      if (isDown && (k === ' ' || k === 'Enter')) {
        if (S.screen === 'title' || S.screen === 'results' || S.screen === 'crash') { AUDIO.unlock(); GAME.start(); e.preventDefault(); return; }
      }
      if (isDown && k === 'Escape' && S.screen === 'run') { pause(!S.paused); return; }
      const m = { ArrowLeft: 'l', a: 'l', q: 'l', ArrowRight: 'r', d: 'r', ArrowDown: 'both', s: 'both', ' ': 'go', ArrowUp: 'go' }[k];
      if (!m) return;
      kb[m] = isDown ? 1 : 0; if (m === 'both' && isDown) kb.go = 1; if (m === 'both' && !isDown) kb.go = 0;
      e.preventDefault();
    };
  }
  function keysFrame(dt) {
    // rampe douce pour le clavier (sinon la poignée est tout ou rien)
    const k = 1 - Math.exp(-dt * 6), ol = kb.vl, or = kb.vr;
    kb.vl += (Math.max(kb.l, kb.both) - kb.vl) * k; kb.vr += (Math.max(kb.r, kb.both) - kb.vr) * k;
    if (kb.vl < 0.01 && !kb.l && !kb.both) kb.vl = 0; if (kb.vr < 0.01 && !kb.r && !kb.both) kb.vr = 0;
    if (kb.vl !== ol || kb.vr !== or) apply(); // seulement si le clavier bouge (n'écrase pas les poignées tactiles)
  }

  function pause(b) {
    if (S.screen !== 'run') return;
    GAME.pause(b);
    $('scrPause').hidden = !b;
    if (b) release();
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
        release(); break;
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
    $('hud').hidden = true; $('crash').hidden = true; release();
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
      ...(res.gates ? [['Portes', `${res.gateOk} / ${res.gates}`, res.gatePts]] : []),
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
    if (p.mode === 'ready') return 'Pose tes deux pouces sur l’écran, à gauche et à droite : tu t’élances et tu sautes de la falaise';
    if (p.mode === 'ski' && !p.launched) return 'Élan… la voile se gonfle, la falaise arrive';
    if (p.stall) return 'Décrochage ! Relâche les deux poignées';
    if ((S.save.runs || 0) > 3) return '';
    if (p.mode === 'air' && p.airT < 4 && r.gate === 0) return 'Pouce droit vers le bas : tu vires à droite et tu te balances. Pouce gauche : à gauche';
    const agl = p.pos.y - W.heightAt(p.pos.x, p.pos.z);
    if (p.mode === 'air' && agl > 22 && -p.pos.z < 260) return 'Trop haut ? Enchaîne les virages, gauche puis droite : la voile plonge vers la neige';
    const toCable = -p.pos.z - W.CABLE.s;
    if (!r.cable && toCable > -150 && toCable < -15) return 'Télésiège devant : câble à 22 m. Descends en virant et passe dessous';
    if (-p.pos.z > W.LAND.s - 160 && p.mode === 'air') return 'Pose-toi dans la cible : tire les deux poignées juste avant de toucher';
    const s = -p.pos.z;
    if (s > 240 && s < 320) return 'Rase la neige : plus tu frôles vite, plus le combo grimpe';
    if (s > 400 && s < 450) return 'Alterne les freins au rythme du balancement : la voile s’incline de plus en plus (wingover)';
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
    if (S.screen === 'run' && !S.paused && window.innerHeight > window.innerWidth) pause(true); // le jeu se joue en paysage
    if (S.screen === 'run' || S.screen === 'crash') hud(dt);
    else $('vig').style.opacity = 0;
  }

  return { init, on, frame, pause };
})();
