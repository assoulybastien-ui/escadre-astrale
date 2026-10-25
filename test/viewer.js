const { open } = require('./serve.js');
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#000}canvas{display:block}</style></head><body>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/SkeletonUtils.js"></script>
<script>
const T=THREE; const W=innerWidth,H=innerHeight;
const r=new T.WebGLRenderer({antialias:true}); r.setSize(W,H); document.body.appendChild(r.domElement);
r.outputEncoding=T.sRGBEncoding; r.toneMapping=T.ACESFilmicToneMapping; r.shadowMap.enabled=true; r.shadowMap.type=T.PCFSoftShadowMap;
const s=new T.Scene(); s.background=new T.Color(0x0a0c14);
const cam=new T.PerspectiveCamera(40,W/H,0.1,200); cam.position.set(0,4,14); cam.lookAt(0,2.2,0);
s.add(new T.HemisphereLight(0x8090c0,0x101018,0.6));
const sun=new T.DirectionalLight(0xffe0c0,3); sun.position.set(6,10,6); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024); s.add(sun);
const rim=new T.DirectionalLight(0x60a0ff,2); rim.position.set(-6,5,-8); s.add(rim);
const pm=new T.PMREMGenerator(r); const es=new T.Scene(); 
[[0xffffff,8,[0,10,10]],[0xffa060,6,[10,3,-6]],[0x6080ff,6,[-10,3,0]]].forEach(([c,i,p])=>{const m=new T.Mesh(new T.PlaneGeometry(8,8),new T.MeshBasicMaterial({color:new T.Color(c).multiplyScalar(i),side:T.DoubleSide})); m.position.set(...p); m.lookAt(0,0,0); es.add(m);});
s.environment=pm.fromScene(es,0.04).texture;
const fl=new T.Mesh(new T.CircleGeometry(12,48),new T.MeshStandardMaterial({color:0x222630,roughness:0.5,metalness:0.6})); fl.rotation.x=-Math.PI/2; fl.receiveShadow=true; s.add(fl);
const L=new T.GLTFLoader();
const mixers=[];
function load(u){return new Promise((res,rej)=>L.load(u,res,undefined,rej));}
Promise.all([load('assets/trooper.glb'),load('assets/colossus.glb')]).then(([tr,co])=>{
  const info=[]; tr.scene.traverse(o=>{ if(o.isMesh) info.push(o.name+':'+o.material.name+':'+(o.material.map?'map':'')+(o.material.normalMap?'+nrm':'')+':'+o.isSkinnedMesh); });
  console.log('[t] trooper', info.join(' | '), 'anims', tr.animations.map(a=>a.name+':'+a.duration.toFixed(2)).join(','));
  const bb=new T.Box3().setFromObject(tr.scene); console.log('[t] trooper bbox', JSON.stringify(bb.min), JSON.stringify(bb.max));
  const bb2=new T.Box3().setFromObject(co.scene); console.log('[t] colossus bbox', JSON.stringify(bb2.min), JSON.stringify(bb2.max));
  co.scene.traverse(o=>{ if(o.isMesh) console.log('[t] colossus mesh', o.name, o.material.name, JSON.stringify(o.material.color), o.geometry.attributes.uv?'uv':'nouv'); });
  for(let i=0;i<3;i++){ const c=T.SkeletonUtils.clone(tr.scene); c.position.set(-3+i*3,0,0); c.scale.setScalar(1); c.traverse(o=>{if(o.isMesh){o.castShadow=true;}}); s.add(c);
    const mx=new T.AnimationMixer(c); mx.clipAction(tr.animations[i===1?1:0]).play(); mixers.push(mx);
    if(i===0){ const hand=c.getObjectByName('mixamorigRightHand')||c.getObjectByName('mixamorig:RightHand'); console.log('[t] hand', hand&&hand.name); 
      const g=new T.Group(); const ax=new T.AxesHelper(30); g.add(ax); hand.add(g); }
  }
  const b=T.SkeletonUtils.clone(co.scene); b.position.set(0,0,-6); b.scale.setScalar(3); b.traverse(o=>{if(o.isMesh)o.castShadow=true}); s.add(b);
  const mb=new T.AnimationMixer(b); mb.clipAction(co.animations.find(a=>a.name==='idle')).play(); mixers.push(mb);
  const nodes=[]; c=null; tr.scene.traverse(o=>{ if(o.isBone && nodes.length<8) nodes.push(o.name); }); console.log('[t] bones', nodes.join(','));
  let t=0; function f(){ t+=1/30; mixers.forEach(m=>m.update(1/30)); r.render(s,cam); } for(let i=0;i<20;i++) f(); window.done=true;
}).catch(e=>console.log('[t] ERR '+e));
</script></body></html>`;
(async () => {
  const { browser, page, errs } = await open({ html, width: 700, height: 600 });
  await page.waitForFunction(() => window.done, null, { timeout: 60000 }).catch(() => {});
  await page.screenshot({ path: __dirname + '/v1.png' });
  console.log(errs.join('\n'));
  await browser.close();
})();
