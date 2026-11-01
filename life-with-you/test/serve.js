// Harnais : sert la page avec three r128 local, rendu WebGL logiciel (SwiftShader), écran iPhone 15 en paysage.
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
async function open({ width = 852, height = 393, dpr = 1, file = 'index.html', storage = null, ua = null } = {}) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext(Object.assign({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true }, ua ? { userAgent: ua } : {}));
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); else if (m.text().startsWith('[t]')) console.log(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.includes('three.js/r128/')) return route.fulfill({ path: path.join(ROOT, 'vendor/three/three.min.js'), contentType: 'text/javascript' });
    if (u === 'http://test.local/') return route.fulfill({ body: html, contentType: 'text/html' });
    return route.abort();
  });
  if (storage) await ctx.addInitScript(s => { try { localStorage.setItem('life-with-you-v1', s); } catch (e) {} }, storage);
  await page.goto('http://test.local/');
  await page.waitForFunction(() => document.getElementById('boot').hidden || /indisponible|pas pu/.test(document.getElementById('bootMsg').textContent), null, { timeout: 120000 });
  return { browser, page, errs };
}
module.exports = { open };
