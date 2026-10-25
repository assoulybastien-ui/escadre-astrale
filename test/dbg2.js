const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page0}</body></html>`;
(async () => {
  const { browser, page, errs } = await open({ html: wrapped, width: 600, height: 400 });
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  const info = await page.evaluate(() => {
    try {
      R3._lab({ specs: ['gardien'], frames: [{}], noBoss: true });
      const R = R3._labDbg().lab.list[0];
      const out = []; R.root.updateMatrixWorld(true);
      R.root.traverse(o => { if (o.isMesh) { const p = o.geometry.attributes.position; let nan = 0; for (let i = 0; i < Math.min(p.count, 5000); i++) if (!isFinite(p.getX(i))) nan++; const w = new THREE.Vector3(); o.getWorldPosition(w); out.push([o.type, o.name, o.visible, p.count, nan, w.toArray().map(v => +v.toFixed(2)), o.material && o.material.type]); } });
      R3.update(0.016);
      let body = null; R.model.traverse(o => { if (o.isSkinnedMesh && o.name === 'vanguard_Mesh') body = o; });
      const bm = body.skeleton.boneMatrices; let bnan = 0; for (const v of bm) if (!isFinite(v)) bnan++;
      const P = body.geometry.attributes.position; let pn = 0; for (let i = 0; i < P.count; i++) if (!isFinite(P.getX(i)) || !isFinite(P.getY(i))) pn++;
      const bones = body.skeleton.bones; const hi = bones.findIndex(b => b.name.endsWith('Head'));
      return { scale: R.root.scale.x, bnan, pn, hi, headName: bones[hi] && bones[hi].name, nb: bones.length, bmLen: bm.length, idx: !!body.geometry.index, groups: body.geometry.groups.length, mat: Array.isArray(body.material), dr: body.geometry.drawRange };
    } catch (e) { return { err: String(e.stack) }; }
  });
  console.log(JSON.stringify(info, null, 0).slice(0, 4000));
  console.log(errs.join('\n'));
  await browser.close();
})();
