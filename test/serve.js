// Petit harnais : sert une page HTML avec three r128 + assets locaux, capture des écrans
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const fs = require('fs'), path = require('path');
const V = path.join(__dirname, '..', 'vendor', 'three');
const ASSETS = path.join(__dirname, '..', 'assets');
async function open({ html, width = 393, height = 852, dpr = 1 }) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); else if (m.text().startsWith('[t]')) console.log(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.includes('three.js/r128/')) return route.fulfill({ path: path.join(V, 'three.min.js'), contentType: 'text/javascript' });
    const m = u.match(/three@0\.128\.0\/(examples\/js\/.*)$/); if (m) return route.fulfill({ path: path.join(V, m[1].replace('examples/js/', '')), contentType: 'text/javascript' });
    const a = u.match(/^http:\/\/test\.local\/(assets\/.*)$/); if (a) { const f = path.join(__dirname, '..', a[1]); if (fs.existsSync(f)) return route.fulfill({ path: f }); return route.fulfill({ status: 404, body: 'nf' }); }
    if (u === 'http://test.local/' || u.startsWith('http://test.local/?')) return route.fulfill({ body: html, contentType: 'text/html' });
    return route.abort();
  });
  await page.goto('http://test.local/');
  return { browser, page, errs };
}
module.exports = { open };
