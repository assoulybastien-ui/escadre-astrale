// Inspection du modèle de base (maillages, os, poids de la tête)
const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page0}</body></html>`;
(async () => {
  const { browser, page } = await open({ html: wrapped, width: 600, height: 400 });
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  const info = await page.evaluate(() => {
    R3._lab({ specs: ['rempart'], frames: [{}], noBoss: true });
    const R = R3._labDbg().lab.list[0];
    const out = { meshes: [], bones: [] };
    R.model.traverse(o => {
      if (o.isSkinnedMesh) {
        const g = o.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = g.attributes.position.count;
        const bones = o.skeleton.bones.map(b => b.name);
        const hist = {};
        for (let v = 0; v < n; v++) { let best = 0, bi = 0; const ws = [sw.getX(v), sw.getY(v), sw.getZ(v), sw.getW(v)], is = [si.getX(v), si.getY(v), si.getZ(v), si.getW(v)]; for (let k = 0; k < 4; k++) { if (ws[k] > best) { best = ws[k]; bi = is[k]; } } const nm = bones[bi]; hist[nm] = (hist[nm] || 0) + 1; }
        out.meshes.push({ name: o.name, verts: n, mat: o.material.name, inter: !!si.isInterleavedBufferAttribute, type: si.array.constructor.name, hist });
        if (!out.bones.length) out.bones = bones;
      }
    });
    return out;
  });
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
})();
