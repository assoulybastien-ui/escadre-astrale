// Descente complète par le pilote automatique, sans rendu. usage : node test/bot.js [agl] [sousCable]
global.NOISE = require('../src/noise.js'); global.WORLD = require('../src/world.js');
global.FLIGHT = require('../src/flight.js'); global.GAME = require('../src/game.js'); global.BOT = require('../src/bot.js');
const agl = +(process.argv[2] || 5), under = process.argv[3] !== '0';
GAME.start(); GAME.S.bot = BOT.make({ agl, underCable: under });
const log = [];
let n = 0, lastS = -1e9, minAgl = 99, aglSum = 0, aglN = 0;
while (GAME.S.screen === 'run' && n < 120 * 300) {
  GAME.tick(GAME.DT); n++;
  const r = GAME.S.run, p = r.p;
  for (const e of GAME.drain()) if (e.type !== 'near' || true) log.push(`${r.t.toFixed(1).padStart(5)}s s=${(-p.pos.z).toFixed(0).padStart(4)} ${e.type}${e.text ? ' ' + e.text : ''}${e.pts ? ' +' + e.pts : ''}${e.reason ? ' ' + e.reason : ''}${e.vn !== undefined ? ' vn=' + e.vn.toFixed(1) : ''}`);
  if (p.mode === 'air') { const c = r.clear.c; aglSum += Math.min(c, 60); aglN++; }
  if (-p.pos.z - lastS >= 100) { lastS = -p.pos.z; log.push(`   … s=${lastS.toFixed(0)} hauteur sol ${(p.pos.y - WORLD.heightAt(p.pos.x, p.pos.z)).toFixed(1)} m, ${(p.V * 3.6).toFixed(0)} km/h, combo ×${r.combo.toFixed(1)}, score ${r.score.toFixed(0)}`); }
}
for (const e of GAME.drain()) log.push('fin ' + e.type);
console.log(log.join('\n'));
console.log('écran', GAME.S.screen, '· hauteur moyenne en vol', (aglSum / aglN).toFixed(1), 'm');
if (GAME.S.result) console.log(JSON.stringify(GAME.S.result, (k, v) => typeof v === 'number' ? Math.round(v * 10) / 10 : v));
