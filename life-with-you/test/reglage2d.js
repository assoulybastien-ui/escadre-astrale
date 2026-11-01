// Balayage du roulis commandé (gains, limite) : premier virage, bascule, maintien.
global.NOISE = require('../src/noise.js'); global.WORLD = require('../src/world.js');
const F = require('../src/flight.js');
WORLD.heightAt = () => -1e6; WORLD.windAt = () => ({ x: 0, y: 0, z: 0 });
const D = 180 / Math.PI, base = Object.assign({}, F.TB);
function mk() { const p = F.create(); p.mode = 'air'; p.inflate = 1; p.launched = true; p.pos.y = 5000; p.vel = { x: 0, y: -6, z: -19 }; F.step(p, { l: 0, r: 0 }, 1 / 120, []); for (let i = 0; i < 960; i++) F.step(p, { l: 0, r: 0 }, 1 / 120, []); return p; }
for (const rollKp of [28, 34]) for (const rollKd of [16, 20]) for (const rollCap of [0.8, 1.0]) for (const rollMax of [0.6]) {
  Object.assign(F.TB, base, { rollKp, rollKd, rollCap, rollMax });
  const p = mk(), a = [], b = []; let gmin = 9, amin = 99, bmax = 0;
  for (let i = 1; i <= 240; i++) { F.step(p, { l: 0, r: 1 }, 1 / 120, []); if ([24, 48, 72, 120, 240].includes(i)) a.push((p.bank * D).toFixed(0)); gmin = Math.min(gmin, p.gload); amin = Math.min(amin, p.alpha * D); }
  for (let i = 1; i <= 240; i++) { F.step(p, { l: 1, r: 0 }, 1 / 120, []); if ([24, 48, 72, 120, 240].includes(i)) b.push((p.bank * D).toFixed(0)); gmin = Math.min(gmin, p.gload); amin = Math.min(amin, p.alpha * D); bmax = Math.max(bmax, Math.abs(p.bank * D)); }
  console.log(`Kp ${rollKp} Kd ${rollKd} plafond ${rollCap} max ${rollMax} | droit 0,2/0,4/0,6/1/2 s : ${a.join('/')}° | bascule : ${b.join('/')}° | g min ${gmin.toFixed(1)} α min ${amin.toFixed(0)}° |incl| max ${bmax.toFixed(0)}° | ${(p.V * 3.6).toFixed(0)} km/h`);
}
