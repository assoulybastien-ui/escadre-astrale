const { open } = require('./serve.js');
(async () => {
  const { browser, page } = await open({});
  await page.evaluate(() => window.__lwy.manual(true));
  const r = await page.evaluate(() => {
    const L = window.__lwy, out = [];
    L.start(); L.bot({ agl: 3 });
    for (let i = 0; i < 3; i++) { const t = performance.now(); L.advance(1 / 30, 1); out.push('titre/départ ' + (performance.now() - t).toFixed(0)); }
    L.advance(1 / 30, 300);
    for (let i = 0; i < 3; i++) { const t = performance.now(); L.advance(1 / 30, 1); window.__lwy.state(); out.push('vol ' + (performance.now() - t).toFixed(0)); }
    const t = performance.now(); L.advance(1 / 30, 30); out.push('30 pas sans rendu+1 ' + (performance.now() - t).toFixed(0));
    return out;
  });
  console.log(r.join('\n'));
  const t = Date.now(); await page.screenshot({ path: '/tmp/claude-0/-home-user-escadre-astrale/3c0d2bf9-d06d-53e2-824c-ffefd39308a0/scratchpad/perf.png', timeout: 120000 }); console.log('capture', Date.now() - t, 'ms');
  await browser.close();
})();
