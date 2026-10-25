// Bulles d'explication des sorts : équipe (toucher), placement (toucher), combat (appui long sans lancer le sort).
// usage : node test/tips.js [outDir]
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page0}</body></html>`;
(async () => {
  const out = process.argv[2] || path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const { browser, page, errs } = await open({ html: wrapped, width: 852, height: 393, dpr: 2 });
  const shot = async n => { await page.screenshot({ path: `${out}/tips-${n}.png` }); console.log('shot', n); };
  const tipShown = () => page.evaluate(() => !document.querySelector('#spellTip').hidden);
  let ok = true; const check = (cond, msg) => { console.log((cond ? 'ok   ' : 'ÉCHEC ') + msg); if (!cond) ok = false; };
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.fill('#heroName', 'Bastien'); await page.click('#persoOk'); await page.waitForTimeout(300);

  // 1. écran d'équipe : toucher un sort
  await page.click('#btnRoster'); await page.waitForTimeout(300);
  await page.click('#compSummary [data-sp="provoc"]'); await page.waitForTimeout(200);
  check(await tipShown(), 'équipe : la bulle s’ouvre au toucher');
  await shot('1-equipe');
  await page.click('#compSummary [data-sp="provoc"]'); await page.waitForTimeout(100);
  check(!(await tipShown()), 'équipe : un second toucher la ferme');
  await page.click('#rosterOk');

  // 2. placement (avant le pull) : toucher un sort
  await page.waitForFunction(() => !document.querySelector('#hub').hidden);
  await page.click('#btnPull'); await page.waitForTimeout(1500);
  await page.click('#spells [data-sp="nuee"]'); await page.waitForTimeout(200);
  check(await tipShown(), 'placement : la bulle s’ouvre au toucher');
  await shot('2-placement');

  // 3. combat : appui long = bulle, et le sort n'est pas lancé
  await page.click('#prepPull');
  await page.evaluate(() => window.__escadre.ff(4));
  await page.waitForTimeout(300);
  check(!(await tipShown()), 'combat : la bulle du placement s’est fermée');
  const b = await page.locator('#spells [data-sp="egide"]').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(700);
  check(await tipShown(), 'combat : la bulle s’ouvre à l’appui long');
  await shot('3-combat-appui-long');
  await page.mouse.up(); await page.waitForTimeout(150);
  const used = await page.evaluate(() => window.__escadre.state().spellUse.egide || 0);
  check(used === 0, 'combat : l’appui long ne lance pas le sort');
  // un toucher normal lance toujours le sort
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(150);
  const used2 = await page.evaluate(() => window.__escadre.state().spellUse.egide || 0);
  check(used2 === 1, 'combat : un toucher simple lance toujours le sort');
  check(!(await tipShown()), 'combat : le toucher suivant ferme la bulle');

  console.log(errs.filter(e => !e.includes('ERR_FAILED') && !e.includes('GPU stall')).slice(0, 15).join('\n') || 'no errors');
  console.log(ok ? 'TOUT EST OK' : 'DES VÉRIFICATIONS ONT ÉCHOUÉ');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
