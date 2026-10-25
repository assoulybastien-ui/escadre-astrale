const T=THREE; const W=innerWidth,H=innerHeight;
const r=new T.WebGLRenderer({antialias:true}); r.setSize(W,H); document.body.appendChild(r.domElement);
r.outputEncoding=T.sRGBEncoding;
const s=new T.Scene(); s.background=new T.Color(0x202530);
const cam=new T.PerspectiveCamera(30,W/H,0.1,200); cam.position.set(0,1.5,6); cam.lookAt(0,1.0,0);
s.add(new T.HemisphereLight(0xffffff,0x404040,1.2));
const L=new T.GLTFLoader();
L.load('assets/colossus.glb',g=>{
  const sk=T.SkeletonUtils.clone(g.scene); s.add(sk);
  const mx=new T.AnimationMixer(sk); mx.clipAction(g.animations.find(a=>/idle/i.test(a.name))).play(); mx.update(0.5);
  sk.traverse(o=>{ if(o.isMesh) o.material=new T.MeshStandardMaterial({color:0x8899aa, skinning:true}); });
  sk.updateMatrixWorld(true);
  const add=(bn,rz,col,len)=>{ const b=sk.getObjectByName('mixamorig'+bn); const ws=new T.Vector3(); b.getWorldScale(ws); const g2=new T.Group(); g2.scale.setScalar(1/ws.x); const m=new T.Mesh(new T.BoxGeometry(0.02,len,0.02),new T.MeshBasicMaterial({color:col})); m.position.y=len/2; const h=new T.Group(); h.rotation.z=rz; h.add(m); g2.add(h); b.add(g2); };
  add('RightHand',-Math.PI/2,0xff3030,0.5); add('LeftHand',Math.PI/2,0x30ff30,0.5);
  // pièce d'épaule test sur Spine2
  const sp=sk.getObjectByName('mixamorigSpine2'); const ws=new T.Vector3(); sp.getWorldScale(ws); const g3=new T.Group(); g3.scale.setScalar(1/ws.x); sp.add(g3);
  [[0.2,0.17,0,0xffff30],[-0.2,0.17,0,0x30ffff],[0,0.05,0.12,0xff30ff]].forEach(([x,y,z,c])=>{ const m=new T.Mesh(new T.SphereGeometry(0.05,12,8),new T.MeshBasicMaterial({color:c})); m.position.set(x,y,z); g3.add(m); });
  r.render(s,cam); window.done=true;
});
