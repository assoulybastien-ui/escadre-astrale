// Mesures du modèle à deux corps en air libre : plané, freins, premier virage, bascule, spirale, décrochage.
global.NOISE = require('../src/noise.js'); global.WORLD = require('../src/world.js');
const F = require('../src/flight.js');
WORLD.heightAt = () => -1e6; WORLD.windAt = () => ({ x: 0, y: 0, z: 0 });
const D = 180 / Math.PI;
function mk() { const p = F.create(); p.mode = 'air'; p.inflate = 1; p.launched = true; p.pos.y = 5000; p.vel = { x: 0, y: -6, z: -19 }; F.step(p, { l: 0, r: 0 }, 1 / 120, []); return p; }
function run(p, inp, sec, every, label) {
  const out = []; let y0 = p.pos.y, d = 0, px = p.pos.x, pz = p.pos.z;
  for (let i = 1; i <= Math.round(sec * 120); i++) {
    F.step(p, typeof inp === 'function' ? inp(i / 120) : inp, 1 / 120, []);
    d += Math.hypot(p.pos.x - px, p.pos.z - pz); px = p.pos.x; pz = p.pos.z;
    if (every && i % Math.round(every * 120) === 0) out.push(`${(i / 120).toFixed(2)}s incl ${(p.bank * D).toFixed(0)}° ${(p.V * 3.6).toFixed(0)}km/h chute ${(-p.vel.y).toFixed(1)} α ${(p.alpha * D).toFixed(1)}° β ${(p.beta * D).toFixed(0)}° ${p.gload.toFixed(1)}g${p.stall ? ' DÉCROCHÉ' : ''}`);
  }
  const sink = (y0 - p.pos.y) / sec, vh = d / sec;
  if (label) console.log(label.padEnd(22), `${(p.V * 3.6).toFixed(0)} km/h, chute ${sink.toFixed(1)} m/s, finesse ${(vh / sink).toFixed(2)}, α ${(p.alpha * D).toFixed(1)}°, incl ${(p.bank * D).toFixed(0)}°, ${p.gload.toFixed(2)} g`);
  if (out.length) console.log(out.join('\n'));
}
for (const [nom, b] of [['mains hautes', 0], ['freins 50 %', 0.5], ['freins à fond', 1]]) { const p = mk(); run(p, { l: b, r: b }, 10); run(p, { l: b, r: b }, 3, 0, nom); }
console.log('--- premier virage depuis le vol droit : frein droit à fond'); let p = mk(); run(p, { l: 0, r: 0 }, 8); run(p, { l: 0, r: 1 }, 2, 0.2);
console.log('--- bascule : frein gauche à fond'); run(p, { l: 1, r: 0 }, 2, 0.2);
console.log('--- frein droit 50 % tenu 8 s'); p = mk(); run(p, { l: 0, r: 0 }, 8); run(p, { l: 0, r: 0.5 }, 8, 1);
console.log('--- les deux freins à fond 3 s puis relâchés'); p = mk(); run(p, { l: 0, r: 0 }, 8); run(p, t => t < 3 ? { l: 1, r: 1 } : { l: 0, r: 0 }, 6, 0.5);
