// Réactivité du premier virage depuis le vol droit, puis virage inverse (balancement), en air libre.
global.NOISE = require('../src/noise.js'); global.WORLD = require('../src/world.js');
const F = require('../src/flight.js');
WORLD.heightAt = () => -1e6; WORLD.windAt = () => ({ x: 0, y: 0, z: 0 });
const p = F.create(); p.mode = 'air'; p.inflate = 1; p.launched = true; p.pos.y = 5000; p.vel = { x: 0, y: -6, z: -19 };
for (let i = 0; i < 120 * 4; i++) F.step(p, { l: 0, r: 0 }, 1 / 120, []);
const row = (t) => `${t.toFixed(1).padStart(4)} s  voile ${(p.bank * 57.3).toFixed(0).padStart(4)}°  pilote ${(p.swing * 57.3).toFixed(0).padStart(4)}°  écart ${((p.bank - p.swing) * 57.3).toFixed(0).padStart(4)}°  ${(p.V * 3.6).toFixed(0)} km/h  chute ${(-p.vel.y).toFixed(1)} m/s`;
console.log('vol droit :', row(0));
console.log('— frein droit à fond, depuis le vol droit');
for (let i = 1; i <= 120 * 2; i++) { F.step(p, { l: 0, r: 1 }, 1 / 120, []); if (i % 24 === 0) console.log(row(i / 120)); }
console.log('— on bascule : frein gauche à fond');
for (let i = 1; i <= 120 * 2; i++) { F.step(p, { l: 1, r: 0 }, 1 / 120, []); if (i % 24 === 0) console.log(row(i / 120)); }
