// Sons réalistes synthétisés (Web Audio), sans musique : vent selon la vitesse, sifflement, claquement de voile,
// skis sur la neige, frôlés, drapeaux des portes, crash. Démarre au premier toucher (exigence d'iOS).
const AUDIO = (() => {
  let ctx = null, master, buf, wind, whistle, flap, lfo, lfoG, ski, enabled = true;

  function noiseBuffer(sec) {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate), d = b.getChannelData(0);
    // bruit rose (approximation de Paul Kellet) : plus doux que le bruit blanc, proche du vent
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
    return b;
  }
  function src(off) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, off); return s; }
  function chain(type, f, q, off) {
    const fl = ctx.createBiquadFilter(), g = ctx.createGain();
    fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0;
    src(off).connect(fl); fl.connect(g); g.connect(master);
    return { f: fl, g };
  }
  function build() {
    master = ctx.createGain(); master.gain.value = enabled ? 0.9 : 0; master.connect(ctx.destination);
    buf = noiseBuffer(4);
    wind = chain('lowpass', 300, 0.6, 0);
    whistle = chain('bandpass', 1200, 2.4, 1.3);
    flap = chain('lowpass', 420, 0.8, 2.1);
    ski = chain('bandpass', 3200, 0.7, 2.9);
    // claquement du tissu : le gain du « flap » est modulé par une oscillation basse
    lfo = ctx.createOscillator(); lfo.frequency.value = 9; lfoG = ctx.createGain(); lfoG.gain.value = 0;
    lfo.connect(lfoG); lfoG.connect(flap.g.gain); lfo.start();
  }
  function unlock() {
    try {
      if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ctx = new AC(); build(); }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
  }
  function setEnabled(b) { enabled = b; if (master) master.gain.setTargetAtTime(b ? 0.9 : 0, ctx.currentTime, 0.05); }
  const set = (p, v, t, k = 0.08) => p.setTargetAtTime(v, t, k);

  function frame(S) {
    if (!ctx) return;
    const t = ctx.currentTime, r = S.run;
    let V = 0, ground = false, air = false, prox = 0;
    if (r && (S.screen === 'run' || S.screen === 'crash') && !S.paused) {
      const p = r.p; V = p.mode === 'crash' ? p.V * 0.25 : p.V; ground = p.mode === 'ski' || p.mode === 'landing'; air = p.mode === 'air'; prox = r.proxF || 0;
    } else if (S.screen === 'title') V = 5;
    const v = Math.min(1.25, V / 27);
    set(wind.g.gain, 0.05 + v * v * 0.6 * (1 + prox * 0.4), t);
    set(wind.f.frequency, 170 + v * 1250 + prox * 500, t);
    set(whistle.g.gain, Math.pow(v, 3) * 0.1, t);
    set(whistle.f.frequency, 900 + v * 1900, t);
    set(flap.g.gain, air ? 0.02 + v * 0.04 : 0, t);
    set(lfoG.gain, air ? v * 0.045 : 0, t);
    set(lfo.frequency, 6 + v * 9, t);
    set(ski.g.gain, ground ? Math.min(1, V / 18) * 0.32 : 0, t, 0.04);
    set(ski.f.frequency, 2200 + Math.min(1, V / 20) * 2200, t);
  }

  // sons ponctuels
  function burst(type, f0, f1, q, dur, gain, delay = 0) {
    const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = buf; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 3); s.stop(t + dur + 0.05);
  }
  function thump() {
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.65);
    burst('lowpass', 1400, 200, 0.7, 0.9, 0.9);
  }
  function on(e) {
    if (!ctx) return;
    switch (e.type) {
      case 'near': burst('bandpass', 500, 2600, 1.6, 0.35, 0.6); break;
      case 'contact': burst('lowpass', 2600, 500, 0.8, 0.18 + Math.min(0.3, (e.vn || 0) * 0.05), 0.35 + Math.min(0.5, (e.vn || 0) * 0.1)); break;
      case 'crash': thump(); break;
      case 'gate': if (e.ok) for (let k = 0; k < 6; k++) burst('bandpass', 700, 380, 1.2, 0.05, 0.4 - k * 0.05, k * 0.055); break;
      case 'pop': if (e.kind === 'cable') burst('bandpass', 300, 1800, 1.2, 0.6, 0.6); break;
      case 'decollage': burst('lowpass', 300, 900, 0.7, 0.8, 0.25); break;
    }
  }
  return { unlock, frame, on, setEnabled };
})();
