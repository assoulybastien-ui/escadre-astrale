// Balayage des coefficients de lacet / force latérale du modèle à deux corps.
global.NOISE = require('../src/noise.js'); global.WORLD = require('../src/world.js');
const F = require('../src/flight.js');
WORLD.heightAt = () => -1e6; WORLD.windAt = () => ({ x: 0, y: 0, z: 0 });
const D = 180 / Math.PI, base = Object.assign({}, F.TB);
function mk() { const p = F.create(); p.mode = 'air'; p.inflate = 1; p.launched = true; p.pos.y = 5000; p.vel = { x: 0, y: -6, z: -19 }; F.step(p, { l: 0, r: 0 }, 1 / 120, []); for (let i = 0; i < 960; i++) F.step(p, { l: 0, r: 0 }, 1 / 120, []); return p; }
const res = [];
for (const cWs of [0.04, 0.08]) for (const Iz of [3, 6]) for (const cNb of [0.01, 0.016]) for (const cNr of [0.05, 0.09]) {
  Object.assign(F.TB, base, { cWs, Iz, cNb, cNr, cNbeta: 0.03, cY: 1.2 });
  let p = mk(); const b = [];
  for (let i = 1; i <= 240; i++) { F.step(p, { l: 0, r: 1 }, 1 / 120, []); if ([36, 72, 120, 240].includes(i)) b.push((p.bank * D).toFixed(0)); }
  const v2 = p.V * 3.6;
  let mx = -99; for (let i = 1; i <= 240; i++) { F.step(p, { l: 1, r: 0 }, 1 / 120, []); }
  const rev = (p.bank * D).toFixed(0);
  let q = mk(), h = []; for (let i = 1; i <= 960; i++) { F.step(q, { l: 0, r: 0.5 }, 1 / 120, []); if (i % 240 === 0) h.push((q.bank * D).toFixed(0)); }
  res.push(`cWs ${cWs} Iz ${Iz} cNb ${cNb} cNr ${cNr} | droit à fond 0,3/0,6/1/2 s : ${b.join('/')}° ${v2.toFixed(0)} km/h | bascule 2 s : ${rev}° | 50 % tenu 2/4/6/8 s : ${h.join('/')}°`);
}
console.log(res.join('\n'));
