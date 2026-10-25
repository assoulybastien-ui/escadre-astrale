// Gestes du joueur soigneur : incantation, relâche, canalisation (gros plan)
// usage : node test/casts.js <aube|nanochir> <name>
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page0}</body></html>`;
(async () => {
  const [kit = 'aube', name = 'cast'] = process.argv.slice(2);
  const { browser, page, errs } = await open({ html: wrapped, width: 640, height: 460 });
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.fill('#heroName', 'Bastien');
  if (kit === 'rempart' || kit === 'gardienflux') { await page.click('#roleSeg [data-role="tank"]'); await page.waitForTimeout(100); }
  { const kits = await page.$$('#kitList .kit'); if ((kit === 'nanochir' || kit === 'gardienflux') && kits[1]) await kits[1].click(); }
  await page.click('#persoOk'); await page.waitForTimeout(300);
  await page.click('#btnPull'); await page.waitForTimeout(300);
  await page.evaluate(() => { window.__escadre.ff(6); document.querySelectorAll('.hud').forEach(e => e.style.visibility = 'hidden'); });
  const TANK = { rempart: [['frappe', -1, [0.15, 0.32]], ['barriere', -1, [0.25]], ['acier', -1, [0.45, 0.75]], ['provoc', -1, [0.3]], ['cri', -1, [0.3]]],
    gardienflux: [['paume', -1, [0.12, 0.22]], ['pas', -1, [0.2]], ['souffle', -1, [0.4]], ['provoc', -1, [0.3]], ['vague', -1, [0.3]]] };
  const plan = TANK[kit] ? TANK[kit] : kit === 'aube' ? [['lumiere', 0, [0.6, 1.6, 2.4]], ['halo', 0, [1.0, 1.95]], ['prisme', 0, [0.1]], ['aurore', -1, [1.0, 2.5]]]
                              : [['suture', 0, [0.5, 1.45]], ['essaim', 0, [0.6, 1.45]], ['injection', 1, [0.05]], ['nuee', -1, [0.1]]];
  let shot = 0;
  for (const [sp, tgt, times] of plan) {
    await page.evaluate(([sp, tgt]) => { const S = window.__escadre.state(); if (tgt >= 0) GAME.input(S, { type: 'target', i: tgt }); S.player.mana = S.player.maxMana || 100; S.player.ferveur = 100; S.player.gcdUntil = 0; for (const k in S.player.cds) S.player.cds[k] = 0; const r = GAME.input(S, { type: 'spell', id: sp }); window.__last = r; }, [sp, tgt]);
    let tPrev = 0;
    for (const t of times) {
      await page.evaluate(([dt]) => {
        const S = window.__escadre.state(); const me = S.raiders[S.me];
        window.__escadre.ff(dt);
        R3._setCam([me.pos.x + 4.5, 4.2, me.pos.z + 7.5], [me.pos.x, 1.6, me.pos.z]);
        for (let k = 0; k < 4; k++) R3.update(0.05);
      }, [t - tPrev]);
      tPrev = t;
      await page.screenshot({ path: path.join(__dirname, 'shots', `${name}-${shot++}.png`) });
    }
    await page.evaluate(() => { window.__escadre.ff(1.2); });
  }
  console.log(shot, errs.filter(e => !e.includes('ERR_FAILED')).slice(0, 8).join('\n') || 'ok');
  await browser.close();
})();
