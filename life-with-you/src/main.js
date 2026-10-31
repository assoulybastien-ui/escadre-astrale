// Boucle principale : simulation à pas fixe (dans GAME), rendu, HUD, son.
(function () {
  const msg = document.getElementById('bootMsg');
  if (typeof THREE === 'undefined') { msg.textContent = 'Le moteur 3D n’a pas pu se charger. Vérifie ta connexion puis recharge la page.'; return; }
  try { R3D.init(document.getElementById('gl')); }
  catch (e) { msg.textContent = 'WebGL est indisponible sur cet appareil.'; console.error(e); return; }
  UI.init();
  document.getElementById('boot').hidden = true;
  let last = performance.now(), manual = false;
  function step(dt) {
    GAME.update(dt);
    for (const e of GAME.drain()) { UI.on(e); AUDIO.on(e); R3D.on(e); }
  }
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (manual) return;
    step(dt); R3D.frame(dt); UI.frame(dt); AUDIO.frame(GAME.S); R3D.adapt(dt);
  }
  requestAnimationFrame(loop);
  // @@TEST — crochet de test (retiré de la version installable)
  window.__lwy = {
    manual(b) { manual = b; },
    advance(dt, n, render = true) { for (let i = 0; i < n; i++) { step(dt); R3D.frame(dt, !(render && i === n - 1)); UI.frame(dt); } },
    state: () => GAME.S,
    start: () => GAME.start(),
    bot(opts) { GAME.S.bot = opts ? BOT.make(opts) : null; },
    input(x, y) { GAME.S.input.x = x; GAME.S.input.y = y; }
  };
  // @@FIN-TEST
})();
