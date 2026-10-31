global.NOISE = require('../src/noise.js'); global.WORLD = require('../src/world.js');
global.FLIGHT = require('../src/flight.js'); global.GAME = require('../src/game.js'); global.BOT = require('../src/bot.js');
GAME.start(); const bot = BOT.make({ agl: +(process.argv[2] || 4) }); let last = { l: 0, r: 0 };
GAME.S.bot = r => (last = bot(r));
let lastS = -1e9, n = 0;
while (GAME.S.screen === 'run' && n < 120 * 200) {
  GAME.tick(GAME.DT); n++; GAME.drain();
  const r = GAME.S.run, p = r.p, s = -p.pos.z;
  if (s - lastS >= 20 && s > 120) { lastS = s;
    const u = p.pos.x - WORLD.xc(s);
    console.log(`s=${s.toFixed(0).padStart(4)} u=${u.toFixed(0).padStart(4)} sol=${(p.pos.y - WORLD.heightAt(p.pos.x, p.pos.z)).toFixed(1).padStart(5)} V=${(p.V*3.6).toFixed(0)} vy=${p.vel.y.toFixed(1)} in=(${last.l.toFixed(2)},${last.r.toFixed(2)}) bank=${(p.bank*57.3).toFixed(0)} cl=${p.cl.toFixed(2)} pente=${(-(WORLD.heightAt(p.pos.x,p.pos.z-5)-WORLD.heightAt(p.pos.x,p.pos.z+5))/10).toFixed(2)} mode=${p.mode}`);
  }
}
console.log(GAME.S.screen, GAME.S.run && GAME.S.run.p.reason);
