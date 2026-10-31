// Vérifie les vitesses et la finesse de la voile en air libre, et le temps de génération du monde.
global.NOISE = require('../src/noise.js');
let t0 = Date.now();
global.WORLD = require('../src/world.js');
console.log('monde généré en', Date.now() - t0, 'ms ; sapins', WORLD.TREES.n, '; rochers', WORLD.ROCKS.length, '; descente', JSON.stringify(WORLD.FACTS));
const F = require('../src/flight.js');
// air libre : on neutralise le relief et le vent
const hgt = WORLD.heightAt, wind = WORLD.windAt;
WORLD.heightAt = () => -1e6; WORLD.windAt = () => ({ x: 0, y: 0, z: 0 });
for (const [nom, l, r] of [['mains hautes', 0, 0], ['freins à moitié', 0.5, 0.5], ['freins à fond', 1, 1], ['frein droit à moitié', 0, 0.5], ['frein droit à fond (spirale)', 0, 1], ['gauche à fond + droit moitié', 1, 0.5]]) {
  const p = F.create(); p.mode = 'air'; p.inflate = 1; p.launched = true; p.pos.y = 5000; p.vel = { x: 0, y: -3, z: -15 };
  const ev = [];
  for (let i = 0; i < 120 * 25; i++) F.step(p, { l, r }, 1 / 120, ev);
  const y0 = p.pos.y, x0 = p.pos.x, z0 = p.pos.z; let dist = 0, px = x0, pz = z0;
  for (let i = 0; i < 120 * 5; i++) { F.step(p, { l, r }, 1 / 120, ev); dist += Math.hypot(p.pos.x - px, p.pos.z - pz); px = p.pos.x; pz = p.pos.z; }
  const sink = (y0 - p.pos.y) / 5, vh = dist / 5;
  console.log(nom.padEnd(30), 'incl.', (p.bank * 57.3).toFixed(0).padStart(3), '° · vitesse', (p.V * 3.6).toFixed(0).padStart(3), 'km/h · chute', sink.toFixed(1), 'm/s · finesse', (vh / sink).toFixed(2), '· charge', p.gload.toFixed(2), 'g');
}
// ressource : sortie de spirale puis les deux freins → combien de mètres regagnés ? et décrochage si on insiste
{
  const p = F.create(); p.mode = 'air'; p.inflate = 1; p.launched = true; p.pos.y = 5000; p.vel = { x: 0, y: -5, z: -15 }; const ev = [];
  for (let i = 0; i < 120 * 6; i++) F.step(p, { l: 0, r: 1 }, 1 / 120, ev);
  for (let i = 0; i < 120 * 1.2; i++) F.step(p, { l: 0, r: 0 }, 1 / 120, ev); // sortie de spirale
  const v0 = p.V, y0 = p.pos.y; let ymax = y0;
  for (let i = 0; i < 120 * 6; i++) { F.step(p, { l: 1, r: 1 }, 1 / 120, ev); ymax = Math.max(ymax, p.pos.y); }
  console.log('ressource : à', (v0 * 3.6).toFixed(0), 'km/h, les deux freins à fond font remonter de', (ymax - y0).toFixed(1), 'm ; événements :', ev.map(e => e.type).join(', ') || 'aucun');
  for (let i = 0; i < 120 * 3; i++) F.step(p, { l: 0, r: 0 }, 1 / 120, ev);
  console.log('freins relâchés :', p.stall ? 'toujours décroché' : 'voile revolée', (p.V * 3.6).toFixed(0), 'km/h');
}
WORLD.heightAt = hgt; WORLD.windAt = wind;
// décollage : pousser puis tirer à 11 m/s
{
  const p = F.create(); const ev = []; let t = 0;
  while (t < 20 && p.mode !== 'air' && p.mode !== 'crash') { const b = p.V > 11 ? 1 : 0; F.step(p, { l: b, r: b, go: true }, 1 / 120, ev); t += 1 / 120; }
  console.log('décollage en tirant :', p.mode, 'après', t.toFixed(1), 's, à', (p.V * 3.6).toFixed(0), 'km/h, s =', (-p.pos.z).toFixed(0), 'm');
}
{
  const p = F.create(); const ev = []; let t = 0;
  while (t < 20 && p.mode !== 'air' && p.mode !== 'crash') { F.step(p, { l: 0, r: 0, go: true }, 1 / 120, ev); t += 1 / 120; }
  console.log('décollage sans tirer :', p.mode, 'après', t.toFixed(1), 's, à', (p.V * 3.6).toFixed(0), 'km/h, s =', (-p.pos.z).toFixed(0), 'm');
}
{ const C = WORLD.CABLE, x = WORLD.xc(C.s); console.log('câble : hauteur au centre', (WORLD.cableYAt(x) - WORLD.heightAt(x, C.z)).toFixed(1), 'm au-dessus du sol'); }
console.log('portes (hauteur sol):', WORLD.GATES.map(g => g.s + 'm').join(' '));
