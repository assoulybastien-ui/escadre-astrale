const { open } = require('./serve.js');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page0}</body></html>`;
(async () => {
  const { browser, page, errs } = await open({ html: wrapped, width: 600, height: 400 });
  await page.waitForFunction(() => !document.querySelector('#perso').hidden || !document.querySelector('#hub').hidden, null, { timeout: 120000 });
  await page.fill('#heroName', 'B'); await page.click('#persoOk'); await page.waitForTimeout(300);
  await page.click('#btnPull'); await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const T = THREE, R = R3._dbg().raidM[0]; let body = null; R.model.traverse(o => { if (o.isSkinnedMesh && o.name === 'vanguard_Mesh') body = o; });
    R.root.updateMatrixWorld(true);
    const b = R.bones.head, sk = body.skeleton, bi = sk.bones.indexOf(b);
    const cube = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.1)); b.add(cube); cube.position.set(0, 10, 0); R.root.updateMatrixWorld(true);
    const want = new T.Vector3().setFromMatrixPosition(cube.matrixWorld);
    const bind = body.bindMatrix, bindInv = body.bindMatrixInverse, meshWInv = new T.Matrix4().copy(body.matrixWorld).invert(), A1 = new T.Matrix4(), M = new T.Matrix4();
    M.copy(bindInv).multiply(A1.copy(sk.boneInverses[bi]).invert()).multiply(A1.copy(b.matrixWorld).invert()).multiply(bind).multiply(meshWInv).multiply(cube.matrixWorld);
    const p = new T.Vector3(0, 0, 0).applyMatrix4(M);
    // rendu GPU équivalent : Mw * Binv * Bw * Bi * B * p
    const g = new T.Matrix4().copy(body.matrixWorld).multiply(bindInv).multiply(b.matrixWorld).multiply(sk.boneInverses[bi]).multiply(bind);
    const got = p.clone().applyMatrix4(g);
    // ordre alternatif : bones relatifs au parent du maillage ?
    const GM = new T.Matrix4().multiplyMatrices(g, M);
    const inv = m => new T.Matrix4().copy(m).invert(), mul = (...ms) => ms.reduce((a, b) => new T.Matrix4().multiplyMatrices(a, b));
    const Mw = body.matrixWorld, Bw = b.matrixWorld, Bi = sk.boneInverses[bi], Ow = cube.matrixWorld;
    const step1 = mul(Mw, inv(Mw)).elements.map(x => +x.toFixed(3));
    const step2 = mul(Bw, inv(Bw)).elements.map(x => +x.toFixed(3));
    const X = mul(inv(Bi), inv(Bw), inv(Mw), Ow), Y = mul(Mw, Bw, Bi), YX = mul(Y, X).elements.map(x => +x.toFixed(3));
    window.__c = { step1, step2, YX, MwDet: Mw.determinant(), BwDet: Bw.determinant() };
    const chk = window.__c; chk.biInvOk = new T.Matrix4().multiplyMatrices(sk.boneInverses[bi], new T.Matrix4().copy(sk.boneInverses[bi]).invert()).elements.map(x => +x.toFixed(3));
    chk.bi = sk.boneInverses[bi].elements.map(x => +x.toFixed(4)); chk.det = sk.boneInverses[bi].determinant();
    chk.GM = GM.elements.map(x => +x.toFixed(3)); chk.Ow = cube.matrixWorld.elements.map(x => +x.toFixed(3));
    return { chk, want: want.toArray().map(x => +x.toFixed(3)), got: got.toArray().map(x => +x.toFixed(3)), p: p.toArray().map(x => +x.toFixed(3)), mw: body.matrixWorld.elements.map(x => +x.toFixed(4)), bindIsI: bind.equals(new T.Matrix4()), parent: body.parent.name, parentScale: body.parent.scale.toArray(), bodyScale: body.scale.toArray(), bodyRot: body.rotation.toArray().slice(0, 3) };
  });
  console.log(JSON.stringify(r));
  await browser.close();
})();
