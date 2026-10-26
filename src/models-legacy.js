import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Original Project 1144 Kirov, 1985–86 fit. Metres; bow -Z, starboard +X, waterline Y=0.
// Hull loft and batching follow the procedural approach used in Battle Stations.
// Exterior references and interior reconstruction limits: refs/models.md.
const V = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const P = Math.PI;
const mats = {};
function material(color, roughness=.78, metalness=.12) {
  const key = `${color}-${roughness}-${metalness}`;
  return mats[key] ??= new THREE.MeshStandardMaterial({color,roughness,metalness});
}
const gray=material(0x89959a), pale=material(0xa9b2b4), dark=material(0x354147), deck=material(0x764d42), black=material(0x182126), red=material(0x863a30), steel=material(0x56686c), white=material(0xd1d2c8), brass=material(0x927b40,.4,.55);
function mesh(g,geo,mat,x=0,y=0,z=0) { const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m; }
function box(g,x,y,z,w,h,d,mat=gray) {return mesh(g,new THREE.BoxGeometry(w,h,d),mat,x,y,z);}
function cyl(g,x,y,z,r,h,mat=gray,r2=r,n=12) {return mesh(g,new THREE.CylinderGeometry(r2,r,h,n),mat,x,y,z);}
function ball(g,x,y,z,r,mat=pale,sx=1,sy=1,sz=1) {const m=mesh(g,new THREE.SphereGeometry(r,12,8),mat,x,y,z);m.scale.set(sx,sy,sz);return m;}
function rod(g,a,b,r=.06,mat=pale) {const av=V(...a),bv=V(...b),dv=bv.clone().sub(av);const m=mesh(g,new THREE.CylinderGeometry(r,r,dv.length(),6),mat);m.position.copy(av.add(bv).multiplyScalar(.5));m.quaternion.setFromUnitVectors(V(0,1,0),dv.normalize());return m;}
function batch(g) {
  g.updateMatrix(); const byMat=new Map();
  for(const child of [...g.children]) if(child.isMesh && !child.userData.dynamic && !child.material.transparent) {
    child.updateMatrix(); const geom=child.geometry.clone().applyMatrix4(child.matrix); const geo=geom.index?geom.toNonIndexed():geom;
    if(!geo.getAttribute('uv'))geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));
    const arr=byMat.get(child.material)||[]; arr.push(geo);byMat.set(child.material,arr);g.remove(child);
  }
  for(const [mat,geos] of byMat) {const joined=mergeGeometries(geos,false);if(joined){mesh(g,joined,mat);}geos.forEach(x=>x.dispose());}
}
function canvasTexture(w,h,draw) {const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');draw(ctx,w,h);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;return {canvas:c,ctx,texture:tex};}
function label(g,text,x,y,z,w,h,rotationY=0,color='#e5e6dd',bg=null) {
  const tx=canvasTexture(1024,Math.max(32,Math.round(1024*h/w)),(c,W,H)=>{if(bg){c.fillStyle=bg;c.fillRect(0,0,W,H);}c.fillStyle=color;let fs=H*.68;c.font=`bold ${fs}px monospace`;while(c.measureText(text).width>W*.94&&fs>8){fs*=.94;c.font=`bold ${fs}px monospace`;}c.textAlign='center';c.textBaseline='middle';c.fillText(text,W/2,H/2);});
  const mat=new THREE.MeshBasicMaterial({map:tx.texture,transparent:!bg,side:THREE.DoubleSide,depthWrite:false});const m=mesh(g,new THREE.PlaneGeometry(w,h),mat,x,y,z);m.rotation.y=rotationY;return m;
}
let paintInitialized=false;
function surfaceFinish() {
  if(paintInitialized)return;paintInitialized=true;
  const tex=canvasTexture(256,256,(c,W,H)=>{
    let seed=1144;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    c.fillStyle='#eeeeeb';c.fillRect(0,0,W,H);
    for(let i=0;i<9500;i++){const a=.02+rand()*.08;c.fillStyle=`rgba(60,65,62,${a})`;const x=rand()*W,y=rand()*H;c.fillRect(x,y,.6+rand()*1.2,.6+rand()*1.8);}
    for(let i=0;i<22;i++){const x=rand()*W,y=rand()*H;c.fillStyle=`rgba(85,66,43,${.025+rand()*.055})`;c.fillRect(x,y,.7+rand()*1.1,8+rand()*48);}
    c.fillStyle='rgba(35,45,42,.06)';c.fillRect(0,0,W,1);c.fillRect(0,0,1,H);
  }).texture;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  for(const m of [gray,pale,deck,white,steel]){m.map=tex;m.needsUpdate=true;}
}
function woodFinish(mat) {
  if(mat.map)return;const tex=canvasTexture(512,128,(c,W,H)=>{c.fillStyle='#e1c795';c.fillRect(0,0,W,H);for(let i=0;i<90;i++){const y=i*1.47;c.strokeStyle=`rgba(55,37,19,${.03+(i%7)*.012})`;c.lineWidth=.5+(i%3)*.3;c.beginPath();c.moveTo(0,y);for(let x=0;x<W;x+=8)c.lineTo(x,y+Math.sin(x*.025+i)*.7);c.stroke();}}).texture;mat.map=tex;mat.needsUpdate=true;
}
function outline(u,L,B) {
  const bow=Math.pow(Math.sin(Math.min(1,u/.35)*P/2),.72);
  const stern=1-.2*Math.pow(Math.max(0,(u-.7)/.3),3);
  return B*.5*bow*stern;
}
function hull(g,L,B,D,freeboard=7) {
  const pos=[],uv=[],ind=[],steps=70,rows=6;
  for(let i=0;i<=steps;i++) {
    const u=i/steps,z=(u-.5)*L,b=outline(u,L,B),sheer=freeboard+3*Math.pow(Math.max(0,1-u/.35),2);
    const section=[[-b*.12,-D],[-b*.72,-D*.72],[-b*.96,0],[-b,sheer],[b,sheer],[b*.96,0],[b*.72,-D*.72],[b*.12,-D]];
    section.forEach(([x,y])=>{pos.push(x,y,z);uv.push(u*L/9,y/7);});
    if(i)for(let j=0;j<8;j++){let a=(i-1)*8+j,b0=(i-1)*8+(j+1)%8,c=i*8+j,d=i*8+(j+1)%8;ind.push(a,c,b0,b0,c,d);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(ind);geo.computeVertexNormals();mesh(g,geo,gray);
  const top=[],ix=[];for(let i=0;i<=steps;i++){const u=i/steps,z=(u-.5)*L,b=outline(u,L,B);const y=freeboard+3*Math.pow(Math.max(0,1-u/.35),2);top.push(-b,y+.03,z,b,y+.03,z);if(i){let a=(i-1)*2;ix.push(a,a+2,a+1,a+1,a+2,a+3);}}
  const dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.Float32BufferAttribute(top,3));dg.setIndex(ix);dg.computeVertexNormals();mesh(g,dg,deck);
  // Visible boot topping around the design waterline, and a small antifouling strip.
  for(const [y,h,mat] of [[-.6,1.1,black],[-1.6,.9,red]]) {
    for(let side of [-1,1]) {const p=[],idx=[];for(let i=0;i<=steps;i++){let u=i/steps,b=outline(u,L,B)*.962; p.push(side*b,y-h/2,(u-.5)*L,side*b,y+h/2,(u-.5)*L);if(i){const a=(i-1)*2;idx.push(a,a+2,a+1,a+1,a+2,a+3);}}const gg=new THREE.BufferGeometry();gg.setAttribute('position',new THREE.Float32BufferAttribute(p,3));gg.setIndex(idx);gg.computeVertexNormals();const mm=mat.clone();mm.side=THREE.DoubleSide;mesh(g,gg,mm);}
  }
  box(g,0,freeboard*.45,L*.5,B*.8,freeboard*.9,.25,gray);
  return (z)=>outline((z+L/2)/L,L,B);
}
function rails(g,points,y,h=1.05) {
  for(let i=1;i<points.length;i++)for(const yy of [y+h*.45,y+h])rod(g,[points[i-1][0],yy,points[i-1][1]],[points[i][0],yy,points[i][1]],.037,pale);
  for(const [x,z] of points)rod(g,[x,y,z],[x,y+h,z],.055,pale);
}
function deckHouse(g,x,y,z,w,h,d) {
  // Slightly inclined plated walls catch light differently at every stepped deck.
  const shell=new THREE.BoxGeometry(w,h,d);const sp=shell.attributes.position;
  for(let i=0;i<sp.count;i++)if(sp.getY(i)>0){sp.setX(i,sp.getX(i)*.955);sp.setZ(i,sp.getZ(i)*.97);}shell.computeVertexNormals();mesh(g,shell,gray,x,y+h/2,z);
  box(g,x,y+h+.12,z,w*.955+.25,.25,d*.97+.25,deck);
  // Stiffening seams, ventilation grilles and exposed service ladder on the macks.
  for(const side of [-1,1]){
    for(const yy of [y+.18,y+h-.25])rod(g,[x+side*w*.495,yy,z-d*.44],[x+side*w*.495,yy,z+d*.44],.035,steel);
    if(h>4.9){const zz=z+d*.22;box(g,x+side*w*.502,y+h*.55,zz,.06,h*.38,Math.min(3.2,d*.3),dark);for(let k=0;k<6;k++)box(g,x+side*w*.51,y+h*.40+k*h*.045,zz,.09,.06,Math.min(3.2,d*.3),gray);}
  }
  if(h>7){for(const sx of [-.35,.35])rod(g,[x+sx,y+.2,z+d*.505],[x+sx,y+h+.3,z+d*.505],.045,pale);for(let yy=y+.3;yy<y+h+.2;yy+=.38)rod(g,[x-.35,yy,z+d*.51],[x+.35,yy,z+d*.51],.035,pale);}
  for(const side of [-1,1])for(let q=-d/2+1.5;q<d/2-1;q+=3.8) {
    box(g,x+side*(w/2+.035),y+h*.58,z+q,.06,.55,.45,black);
    if(Math.abs(q)<d*.3)box(g,x+side*(w/2+.07),y+1.2,z+q,.08,1.85,.85,pale);
  }
}
function dish(g,x,y,z,r,rot=0) {
  const p=new THREE.Group();p.position.set(x,y,z);p.rotation.y=rot;g.add(p);
  cyl(p,0,.5,0,.6,1,pale);const d=ball(p,0,1.8,0,r,pale,1,1,.22);d.rotation.x=-.25;
  rod(p,[0,1.8,0],[0,1.8,-r*.7],.08,steel);ball(p,0,1.8,-r*.7,.17,black);return p;
}
function lattice(g,z,y,h,w) {
  for(const sx of [-1,1])for(const sz of [-1,1])rod(g,[sx*w/2,y,z+sz*w/2],[sx*w*.24,y+h,z+sz*w*.24],.14,pale);
  for(let k=0;k<h;k+=2.4)for(const s of [-1,1]) {
    const ww=w*(1-.5*k/h),ww2=w*(1-.5*(k+2.4)/h);
    rod(g,[-ww/2,y+k,z+s*ww/2],[ww2/2,y+Math.min(k+2.4,h),z+s*ww2/2],.07,pale);
    rod(g,[s*ww/2,y+k,z-ww/2],[s*ww2/2,y+Math.min(k+2.4,h),z+ww2/2],.07,pale);
  }
}
function searchRadar(g,x,y,z,w,h) {
  const pivot=new THREE.Group();pivot.position.set(x,y,z);g.add(pivot);cyl(pivot,0,0,0,.35,2,steel);
  for(let xx=-w/2;xx<=w/2;xx+=.7)rod(pivot,[xx,.6,-.2],[xx,h+.6,0],.05,steel);
  for(let yy=.6;yy<=h+.6;yy+=.5)rod(pivot,[-w/2,yy,0],[w/2,yy,0],.055,steel);
  rod(pivot,[-w/2,.6,0],[w/2,h+.6,0],.09,gray);rod(pivot,[w/2,.6,0],[-w/2,h+.6,0],.09,gray);batch(pivot);return pivot;
}
function ak630(g,x,y,z,heading=0) {
  const p=new THREE.Group();g.add(p);p.position.set(x,y,z);p.rotation.y=heading;cyl(p,0,.25,0,1.25,.5,gray);ball(p,0,1.1,0,1,white,1,.85,1.15);box(p,0,1.0,-.55,1.4,.85,1.4,white);
  for(let i=0;i<6;i++){const a=i*P/3;rod(p,[Math.cos(a)*.13,1.1+Math.sin(a)*.13,-.6],[Math.cos(a)*.13,1.1+Math.sin(a)*.13,-2.5],.055,black);}batch(p);return p;
}
function ak100(g,z,y) {
  cyl(g,0,y+.3,z,3.0,.6,gray);const t=box(g,0,y+1.9,z,4.7,2.9,5.2,pale);t.rotation.x=.08;
  const roof=box(g,0,y+3.35,z+.35,4.4,.45,4.3,gray);rod(g,[0,y+2.1,z+1],[0,y+2.6,z+8],.19,steel);cyl(g,0,y+3.8,z-.4,.45,.4,black);
}
function lifeboat(g,x,y,z) {
  const b=ball(g,x,y,z,1,white,1.1,.65,4);box(g,x,y+.45,z,1.9,.35,5.8,deck);
  for(const dz of [-2.6,2.6]) {rod(g,[x*.9,y-1,z+dz],[x,y+2,z+dz],.11,gray);rod(g,[x,y+2,z+dz],[x,y+.7,z+dz],.035,black);}
}
function sailor(parent,x,y,z,heading=0,pose='watch') {
  const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=heading;parent.add(g);
  const cloth=material(0x1c2b39,.95,.02),skin=material(0xb48a6f,.85,.01),cap=material(0xd7d6c6,.88,.02),boot=material(0x171d20,.9,.05);
  // Articulated human proportions; seated watchkeepers rest their forearms near controls.
  for(const side of [-1,1]){const hip=[side*.12,.88,0],knee=[side*.13,.46,.025],foot=[side*.13,.09,-.07];
    rod(g,hip,knee,.085,cloth);rod(g,knee,foot,.075,cloth);box(g,side*.13,.055,-.09,.16,.11,.29,boot);}
  ball(g,0,1.13,0,1,cloth,.25,.35,.145);box(g,0,.9,0,.38,.1,.25,boot);
  for(const side of [-1,1]) {const shoulder=[side*.23,1.36,0],elbow=[side*.32,1.07,pose==='console'?-.17:.015],hand=[side*.29,pose==='console'?1.13:.87,pose==='console'?-.4:-.02];rod(g,shoulder,elbow,.07,cloth);rod(g,elbow,hand,.06,cloth);ball(g,...hand,.065,skin,.8,1.1,.8);box(g,side*.22,1.40,-.005,.13,.035,.14,brass);}
  const head=new THREE.Group();head.position.set(0,1.57,0);g.add(head);cyl(head,0,-.12,0,.065,.13,skin);
  ball(head,0,0,0,.13,skin,.83,1.08,.9);ball(head,0,-.01,-.115,.037,skin,.65,.8,1);box(head,0,.095,-.006,.23,.09,.22,cloth);
  cyl(head,0,.15,0,.15,.065,cap,.16,16);box(head,0,.102,-.14,.21,.025,.13,boot);box(head,0,.11,-.122,.035,.04,.015,brass);
  for(const side of [-1,1])ball(head,side*.046,.018,-.11,.012,black,.8,.55,.35);
  batch(head);batch(g);return {group:g,head,phase:x*.7+z*.33,pose};
}
function makeBridge() {
  const g=new THREE.Group();g.name='Kirov bridge • reconstructed interior';g.position.set(0,20,-30);const crew=[];
  const interior=material(0x78988a),ivory=material(0xbfc3af),panel=material(0x536b4a),floor=material(0x70503e),trim=material(0x1f302b),wood=material(0x926c43,.65,.03);woodFinish(wood);
  for(const m of [interior,ivory,panel,floor]){m.map=gray.map;m.needsUpdate=true;}
  box(g,0,-.12,0,16.2,.25,9.5,floor);box(g,0,3.65,0,16.5,.25,10,ivory);
  box(g,0,.4,-4.6,16,.8,.25,interior);box(g,0,3.2,-4.6,16,.55,.25,ivory);
  box(g,-8,.55,0,.25,1.1,9.5,interior);box(g,8,.55,0,.25,1.1,9.5,interior);
  box(g,-8,3.2,0,.25,.55,9.5,ivory);box(g,8,3.2,0,.25,.55,9.5,ivory);
  box(g,0,1.75,4.65,16,3.5,.25,interior);
  for(let x=-8;x<=8;x+=2)box(g,x,2.0,-4.6,.15,1.95,.23,ivory);
  for(const s of [-1,1])for(let z=-4.6;z<=4.6;z+=2.3)box(g,s*8,2,z,.2,1.95,.15,ivory);
  const glass=new THREE.MeshPhysicalMaterial({color:0xabc5bc,transparent:true,opacity:.055,roughness:.15,metalness:.1,side:THREE.DoubleSide,depthWrite:false});
  box(g,0,2,-4.63,15.9,1.9,.025,glass);box(g,-8.02,2,0,.025,1.9,9.2,glass);box(g,8.02,2,0,.025,1.9,9.2,glass);
  for(let z=-4;z<=4;z+=1.3)box(g,0,3.48,z,16,.12,.09,ivory);
  for(let x=-7;x<=7;x+=2){
    const dog=mesh(g,new THREE.TorusGeometry(.12,.027,6,12),brass,x,1.19,-4.39);
    rod(g,[x-.15,1.19,-4.39],[x+.15,1.19,-4.39],.025,brass);
    box(g,x,2,-4.42,1.78,1.8,.045,glass);
  }
  for(const x of [-6,-2,2,6]){box(g,x,3.48,0,1.35,.07,.28,white);const l=box(g,x,3.42,0,1.1,.03,.2,new THREE.MeshBasicMaterial({color:0xffefd1}));}
  // Forward console leaves a clear view of the foredeck over its instruments.
  box(g,0,.55,-3.65,13,1.1,1.2,panel);const fascia=box(g,0,1.1,-3.65,13,.16,1.35,wood);fascia.rotation.x=.10;
  const screens=[];
  for(const [i,x] of [-4.6,0,4.6].entries()) {
    box(g,x,1.28,-3.7,.92,.7,.6,trim);
    const tx=canvasTexture(256,256,()=>{});const m=new THREE.MeshBasicMaterial({map:tx.texture,toneMapped:false});
    const face=mesh(g,new THREE.PlaneGeometry(.68,.65),m,x,1.35,-3.37);face.userData.dynamic=true;screens.push(tx);
    label(g,['ОБЗОР','КУРС / ХОД','ЦЕЛЕУКАЗАНИЕ'][i],x,.82,-3.025,1.8,.2,0,'#e1d5b3','#263833');
    for(let k=-2;k<=2;k++){cyl(g,x+k*.26,1.23,-3.1,.055,.08,k===0?brass:black,undefined,8);}
  }
  // Pedestal and paired chrome handles follow Oleg Kuleshov's original-Kirov bridge photographs.
  const chrome=material(0xbac5c5,.18,.85);
  for(const x of [-2.4,2.4]) {
    box(g,x,.55,-2.5,.62,1.1,.7,pale);const stand=box(g,x,1.16,-2.5,.72,.36,.85,pale);stand.rotation.x=.25;
    for(const side of [-1,1]){const drum=cyl(g,x+side*.24,1.48,-2.6,.23,.16,chrome,undefined,24);drum.rotation.z=P/2;
      rod(g,[x+side*.24,1.48,-2.6],[x+side*.24,1.86,-2.47],.045,chrome);cyl(g,x+side*.24,1.87,-2.47,.075,.22,chrome,undefined,12);}
    const dial=cyl(g,x,1.14,-2.06,.19,.025,brass,undefined,24);dial.rotation.x=P/2;
  }
  box(g,0,.53,-1.6,1.1,1.05,.7,pale);const helm=box(g,0,1.1,-1.6,1.3,.4,.8,pale);helm.rotation.x=.25;
  for(const side of [-1,1]){rod(g,[side*.47,1.2,-1.6],[side*.47,1.65,-1.6],.045,chrome);cyl(g,side*.47,1.6,-1.6,.08,.3,chrome,undefined,12);}
  // Side chart table, paper chart and signal telephone.
  box(g,-5.3,.6,.7,3.4,1.2,2.8,panel);box(g,-5.3,1.22,.7,3.1,.035,2.5,ivory);
  for(let i=-4;i<=4;i++){box(g,-5.3+i*.32,1.244,.7,.012,.007,2.4,steel);box(g,-5.3,1.245,.7+i*.26,3.05,.007,.012,steel);}
  box(g,6.2,.9,1.4,1.5,1.8,1.4,panel);box(g,6.2,1.83,1.4,.65,.2,.45,black);rod(g,[5.8,1.98,1.4],[6.6,1.98,1.4],.1,black);
  label(g,'БОЕВАЯ ГОТОВНОСТЬ № 1',0,2.65,4.49,5.3,.38,P,'#eadcc2','#3a4940');
  label(g,'КИРОВ  •  СЕВЕРНЫЙ ФЛОТ',0,3.14,-4.44,5.1,.24,0,'#d2cdb9','#263833');
  for(const x of [-7.1,7.1]){box(g,x,1.25,3.8,.7,1.7,.4,red);rod(g,[x,2.3,3.65],[x,2.3,3.3],.06,black);}
  for(const x of [-6.6,-3.4,-1.25,1.25,3.4,6.6]) {
    box(g,x,1.06,-3.3,.72,.08,.48,black);
    const gauge=canvasTexture(128,128,(c,W,H)=>{c.fillStyle='#d4cbb0';c.fillRect(0,0,W,H);c.strokeStyle='#292d28';c.lineWidth=3;c.beginPath();c.arc(64,64,51,0,P*2);c.stroke();for(let n=0;n<12;n++){let a=n*P/6;c.beginPath();c.moveTo(64+Math.sin(a)*39,64-Math.cos(a)*39);c.lineTo(64+Math.sin(a)*49,64-Math.cos(a)*49);c.stroke();}c.strokeStyle='#ad4229';c.beginPath();c.moveTo(64,64);c.lineTo(87,28);c.stroke();});
    const gm=mesh(g,new THREE.PlaneGeometry(.33,.33),new THREE.MeshStandardMaterial({map:gauge.texture,roughness:.65}),x,1.105,-3.27);gm.rotation.x=-P/2;
    for(const side of [-1,1])for(const q of [-1,1]){const screw=cyl(g,x+side*.3,1.11,-3.27+q*.18,.018,.015,brass,undefined,6);}
  }
  for(const side of [-1,1])for(let z=-3;z<=3;z+=1.4){box(g,side*7.83,.45,z,.035,.72,1.15,panel);rod(g,[side*7.77,.55,z-.17],[side*7.77,.55,z+.17],.025,brass);}
  for(let x=-7;x<=7;x+=2)for(const y of [.95,2.95]){box(g,x,y,-4.40,.10,.14,.08,brass);}
  crew.push(sailor(g,-4.6,0,-2.45,0,'console'));crew.push(sailor(g,4.6,0,-2.45,0,'console'));crew.push(sailor(g,-6.3,0,1.0,P/2,'watch'));
  batch(g);
  let last=-1;
  const updateDisplays=(state={})=>{
    const tm=state.time??0;if(Math.floor(tm*4)===last)return;last=Math.floor(tm*4);
    const ship=state.ship??state.player??state;const entities=state.tracks??state.entities??state.threats??[];
    screens.forEach((s,i)=>{const c=s.ctx;c.fillStyle='#061a12';c.fillRect(0,0,256,256);c.strokeStyle='#2e7350';c.fillStyle='#78e9a3';c.lineWidth=1;c.font='17px monospace';
      if(i===1){const hdg=ship.heading??0; c.font='24px monospace';c.fillText('КУРС',25,52);c.font='bold 55px monospace';c.fillText(String(Math.round(hdg*180/P)%360).padStart(3,'0')+'°',25,112);c.font='24px monospace';c.fillText(`${((ship.speed??10)*1.94384).toFixed(1)} УЗ`,25,172);c.font='17px monospace';c.fillText('РЕАКТОР  НОРМА',25,218);}
      else {for(const r of [30,60,90]){c.beginPath();c.arc(128,128,r,0,P*2);c.stroke();}c.beginPath();c.moveTo(20,128);c.lineTo(236,128);c.moveTo(128,20);c.lineTo(128,236);c.stroke();const a=tm*.7;c.beginPath();c.moveTo(128,128);c.lineTo(128+100*Math.cos(a),128+100*Math.sin(a));c.stroke();c.fillText(i===0?'ОБЗОР  75 КМ':'ФОРТ • ГОТОВ',12,22);c.fillText('СЕВЕР',97,246);
        let list=entities instanceof Map?[...entities.values()]:Array.isArray(entities)?entities:[];for(let k=0;k<Math.min(12,list.length);k++){const e=list[k];if(e.alive===false)continue;const pos=e.pos??e.position??{};const own=ship.pos??ship.position??{};const x=128+((pos.x??0)-(own.x??0))/750;const y=128+((pos.z??0)-(own.z??0))/750;if(x>20&&x<236&&y>20&&y<236)c.fillRect(x-2,y-2,5,5);}}
      s.texture.needsUpdate=true;
    });
  };updateDisplays({time:0});
  return {group:g,updateDisplays,crew};
}

export function buildKirov() {
  surfaceFinish();
  const group=new THREE.Group();group.name='Kirov • Project 1144 • 1985';const exterior=new THREE.Group();group.add(exterior);
  const edge=hull(exterior,252,28.5,9.1,7.5),launchPoints={granit:[],fort:[],osa:[],gun:[]},radars=[],launchRigs={granit:[],fort:[],osa:[]};
  // Lower hull fittings and the raised forward forecastle.
  for(const side of [-1,1]) {
    const points=[];for(let z=-119;z<=122;z+=4)points.push([side*(edge(z)-.3),z]);rails(exterior,points,7.65);
    for(let z=-83;z<100;z+=5) {const p=cyl(exterior,side*(edge(z)+.02),5.0,z,.17,.06,black,undefined,8);p.rotation.z=P/2;}
    for(const z of [-105,-95,96,112]){cyl(exterior,side*edge(z)*.76,8.0,z,.3,.6,black);box(exterior,side*edge(z)*.76,8.3,z,1.3,.2,.45,black);}
    label(exterior,'065',side*edge(-87)*1.005,4.2,-87,10,3.6,side*P/2);
  }
  // Anchor machinery, breakwater and Metel launcher, visible in the 1985 USN foredeck image.
  box(exterior,0,9.05,-113,9,.25,14,deck);for(const side of [-1,1]){cyl(exterior,side*2,9.6,-114,.7,.7,steel);rod(exterior,[side*2,9.4,-114],[side*4,9.4,-122],.13,black);}
  box(exterior,0,9.3,-101,16,2,.35,pale);cyl(exterior,0,9,-96,2.4,2,gray);
  for(const x of [-1.7,1.7]){const tube=cyl(exterior,x,10.3,-97,.8,8,gray,.8,12);tube.rotation.x=P/2-.15;}
  // 12 octuple Fort rotary launchers (single visible launch aperture per magazine).
  for(let row=0;row<4;row++)for(let col=0;col<3;col++){
    const x=(col-1)*4.4,z=-87+row*5.4;box(exterior,x,7.78,z,3.55,.25,3.85,gray);cyl(exterior,x,7.97,z,1.25,.15,dark,undefined,24);const lid=new THREE.Group();lid.position.set(x,8.06,z+1.06);exterior.add(lid);cyl(lid,0,0,-1.06,1.06,.12,gray,undefined,24);batch(lid);launchRigs.fort.push({group:lid,left:0});launchPoints.fort.push(V(x,8.2,z));
    for(const s of [-1,1])box(exterior,x+s*1.45,8.04,z,.18,.16,3,steel);
  }
  // Twenty P-700 hatch covers arranged in four columns and five rows.
  for(let row=0;row<5;row++)for(let col=0;col<4;col++){
    const x=(col-1.5)*3.7,z=-64+row*4.1;box(exterior,x,8.02,z,3.15,.13,3.5,dark);const lid=new THREE.Group();lid.position.set(x,8.15,z+1.75);exterior.add(lid);box(lid,0,0,-1.75,3.15,.30,3.5,gray);box(lid,0,.19,-1.75,2.75,.1,2.95,pale);launchPoints.granit.push(V(x,8.8,z));
    for(const sx of [-1,1])box(lid,sx*1.35,.23,-.85,.18,.18,.65,steel);batch(lid);launchRigs.granit.push({group:lid,left:0});
  }
  for(const side of [-1,1]) {
    deckHouse(exterior,side*10.8,7.6,-51,5,3.3,20);
    for(const z of [-56,-47]){ak630(exterior,side*10.8,11.2,z,side*-P/2);launchPoints.gun.push(V(side*13.3,12.3,z));}
    cyl(exterior,side*10,8,-76,2.1,.3,dark);cyl(exterior,side*10,8.4,-76,.65,1,gray);
    const osa=new THREE.Group();osa.position.set(side*10,9.1,-76);exterior.add(osa);box(osa,0,0,0,3,.35,.6,gray);for(const x of [-1.1,1.1]){rod(osa,[x,0,.8],[x,.8,-2.5],.12,white);}batch(osa);launchRigs.osa.push({group:osa,left:0,baseY:9.1});launchPoints.osa.push(V(side*10,10,-77));
  }
  // Stepped forward superstructure, with real window openings at the bridge deck.
  deckHouse(exterior,0,7.6,-22,22,5.4,40);deckHouse(exterior,0,13,-22,19,3.8,33);deckHouse(exterior,0,16.8,-23,17,3,28);
  box(exterior,0,20,-30,20,.35,12,deck);rails(exterior,[[-10,-36],[-10,-24],[-8.4,-24]],20.2);rails(exterior,[[10,-36],[10,-24],[8.4,-24]],20.2);
  // Bridge stands clear of solid deckhouses so its windows see the actual outside scene.
  const bridgeData=makeBridge();group.add(bridgeData.group);
  deckHouse(exterior,0,20,-17,12,7.6,14);box(exterior,0,24.1,-30,17.5,.35,10.5,deck);
  cyl(exterior,0,25.3,-32,2.2,2,pale);ball(exterior,0,28.5,-32,3.0,pale);for(const side of [-1,1]){cyl(exterior,side*8.6,21,-29,.35,1.3,steel);ball(exterior,side*8.6,22,-29,.4,black);}
  // Forward mack and massive Top Pair lattice aerial.
  deckHouse(exterior,0,27.6,-11,8,9.5,10);box(exterior,0,37.3,-11,9,.5,11,dark);
  lattice(exterior,-11,37.5,11,5.6);const topPair=new THREE.Group();topPair.position.set(0,48.5,-11);exterior.add(topPair);
  for(const side of [-1,1]){const p=new THREE.Group();p.position.set(side*3.2,1.4,side*.5);p.rotation.y=side*.12;topPair.add(p);
    for(let yy=-3.8;yy<=3.8;yy+=.5){const half=2.7*Math.sqrt(Math.max(0,1-yy*yy/16));rod(p,[-half,yy,0],[half,yy,0],.055,steel);}
    for(let xx=-2.5;xx<=2.5;xx+=.5){const half=4*Math.sqrt(Math.max(0,1-xx*xx/(2.7*2.7)));rod(p,[xx,-half,0],[xx,half,0],.055,steel);}
    const rim=mesh(p,new THREE.TorusGeometry(1,.025,5,40),gray);rim.scale.set(2.7,4,1);batch(p);}
  radars.push(topPair);
  rod(exterior,[-9,33,-11],[9,33,-11],.16,pale);for(const side of [-1,1]){
    rod(exterior,[0,27.8,-11],[side*9,33,-11],.12,pale);rod(exterior,[side*8,33,-11],[side*8,39,-11],.055,steel);
    for(const y of [25,29,33])ball(exterior,side*4.9,y,-11,1.0,pale,.55,1,1);
    for(const z of [-15,-7])dish(exterior,side*5.3,23,z,1.25,side*P/2);
  }
  // Machinery deck, boats and aft sensors.
  deckHouse(exterior,0,7.6,22,19,5.5,46);deckHouse(exterior,0,13.1,23,14,5,29);
  for(const side of [-1,1])for(const z of [9,28])lifeboat(exterior,side*11.6,9.6,z);
  for(const side of [-1,1])for(let z=-28;z<=44;z+=8)for(let row=0;row<2;row++){
    const raft=cyl(exterior,side*10.1,13.8+row*.8,z,.34,2.3,white,.34,10);raft.rotation.z=P/2;
  }
  deckHouse(exterior,0,18.1,29,9,12,10);box(exterior,0,30.4,29,9.7,.65,10.7,dark);
  lattice(exterior,29,31,8,4.4);radars.push(searchRadar(exterior,0,39.5,29,8,3));
  // 3R41 Top Dome fire-control antenna, above the aft stepped deckhouse.
  deckHouse(exterior,0,13.1,48,13,5.5,15);deckHouse(exterior,0,18.6,48,8,5,9);radars.push(dish(exterior,0,24,48,3.1,P));
  for(const side of [-1,1]){dish(exterior,side*5.3,19.2,49,1.2,side*P/2);ball(exterior,side*5.5,24.3,40,1.6,pale,.7,1.4,.7);}
  // Tandem single AK-100 mounts and below-deck helicopter hangar/landing deck.
  deckHouse(exterior,0,7.6,68,18,3.3,27);ak100(exterior,64,11.1);ak100(exterior,78,8.2);
  for(const side of [-1,1])for(const z of [89,99]){ak630(exterior,side*10.7,8.0,z,side*-P/2);launchPoints.gun.push(V(side*13.2,9.1,z));}
  const heli=box(exterior,0,7.62,109,20,.09,27,dark);
  const tx=canvasTexture(512,512,(c,W,H)=>{c.fillStyle='#4b5555';c.fillRect(0,0,W,H);c.strokeStyle='#d2cec0';c.lineWidth=7;c.strokeRect(40,30,432,452);c.beginPath();c.arc(256,256,154,0,P*2);c.stroke();c.font='bold 150px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillStyle='#d2cec0';c.fillText('H',256,256);for(let i=0;i<8;i++){c.fillStyle=i%2?'#cba24e':'#30383b';c.fillRect(i*64,0,64,16);}});
  const hd=mesh(exterior,new THREE.PlaneGeometry(20,27),new THREE.MeshStandardMaterial({map:tx.texture,roughness:.95}),0,7.69,109);hd.rotation.x=-P/2;
  box(exterior,0,7.72,100,8,.06,12,steel);for(let i=-4;i<=4;i++)box(exterior,i*.82,7.77,100,.06,.03,11.5,dark);
  for(const side of [-1,1]){box(exterior,side*10.8,8.3,108,1,.9,4,gray);for(let z=105;z<115;z+=1)box(exterior,side*10.8,8.85,z,.25,.1,.2,new THREE.MeshBasicMaterial({color:0xe8b95f}));}
  rod(exterior,[0,8,123],[0,16,123],.08,pale);
  const flag=canvasTexture(256,128,(c,W,H)=>{c.fillStyle='#e6e6d9';c.fillRect(0,0,W,H);c.fillStyle='#346b8f';c.fillRect(0,92,W,36);c.fillStyle='#ad302c';c.font='bold 70px serif';c.fillText('★',25,76);c.font='bold 64px serif';c.fillText('☭',145,77);});
  const flagMesh=mesh(exterior,new THREE.PlaneGeometry(4,2,16,6),new THREE.MeshStandardMaterial({map:flag.texture,side:THREE.DoubleSide,roughness:1}),2,14.8,123);flagMesh.rotation.y=.3;flagMesh.userData.dynamic=true;
  // Whip antennas and stays reinforce the characteristic complex silhouette.
  for(const side of [-1,1])for(let z=-5;z<=75;z+=20)rod(exterior,[side*7.5,18,z],[side*8.4,27,z+1],.045,steel);
  for(const side of [-1,1]){rod(exterior,[0,48,-11],[side*8,16,38],.02,black);rod(exterior,[0,39,29],[side*7,12,75],.02,black);}
  const crew=[...bridgeData.crew];
  for(const [x,z,a] of [[-8,-25,-P/2],[8,-25,P/2],[-11,38,-P/2],[11,38,P/2],[-8,112,0],[8,112,0]])crew.push(sailor(exterior,x,Math.abs(z+25)<1?20.2:7.65,z,a));
  batch(exterior);
  group.userData.dimensions={length:252,beam:28.5,draft:9.1};
  const flagPositions=flagMesh.geometry.attributes.position;
  const animateLaunch=(kind,slot=0)=>{
    const bank=launchRigs[kind];if(!bank?.length)return;const rig=bank[((slot%bank.length)+bank.length)%bank.length];rig.left=kind==='osa'?2.1:4.0;rig.group.rotation.x=kind==='osa'?.40:1.42;
    if(kind==='osa')rig.group.position.y=rig.baseY-.12;
  };
  const animate=(time=0,dt=0,state={})=>{
    for(const [kind,bank] of Object.entries(launchRigs))for(const rig of bank){rig.left=Math.max(0,rig.left-Math.max(0,dt));const f=Math.min(1,rig.left/(kind==='osa'?1:1.2));rig.group.rotation.x=(kind==='osa'?.40:1.42)*f;if(kind==='osa')rig.group.position.y=rig.baseY-.12*f;}
    for(let i=0;i<radars.length;i++)radars[i].rotation.y=time*(i===0?.34:i===1?.65:.13)+(i===2?P:0);
    for(const c of crew){c.head.rotation.y=Math.sin(time*.32+c.phase)*.18;c.head.rotation.x=Math.sin(time*.43+c.phase)*.055+(c.pose==='console'?.12:0);c.group.rotation.z=Math.sin(time*.8+c.phase)*.008;}
    for(let i=0;i<flagPositions.count;i++){const x=flagPositions.getX(i);flagPositions.setZ(i,Math.sin(x*2.8-time*4)*.23*(x+2)/4+Math.sin(x*5-time*6)*.055*(x+2)/4);}
    flagPositions.needsUpdate=true;flagMesh.geometry.computeVertexNormals();bridgeData.updateDisplays(state);
  };
  return {group,bridgeEye:V(1.15,21.9,-27.2),bridgeTarget:V(0,21,-80),radars,launchPoints,bridge:bridgeData.group,updateDisplays:bridgeData.updateDisplays,animate,animateLaunch};
}

export function buildEnemyShip() {
  const g=new THREE.Group();g.name='Oliver Hazard Perry class silhouette';hull(g,138,13.7,4.5,4.5);
  deckHouse(g,0,4.5,-4,10.5,4.5,68);deckHouse(g,0,9,-20,9,3.3,18);
  for(const side of [-1,1])for(let z=-27;z<-12;z+=2.4)box(g,side*4.53,11,z,.05,.85,1.55,black);
  cyl(g,0,5.2,-46,2,1.4,gray);box(g,0,6.3,-46,3,.5,5,gray);rod(g,[0,6.5,-46],[0,7,-51],.2,white);
  deckHouse(g,0,9,13,6,5,9);box(g,0,14.3,13,6.5,.6,9.5,dark);lattice(g,-2,10,15,3);searchRadar(g,0,26,-2,7,2.2);
  dish(g,0,14,-21,1.4,0);
  // Mk15 Phalanx: tall white search/track radome above the compact Gatling mount.
  cyl(g,0,9.6,35,1.05,1.2,gray);box(g,0,10.5,35,1.65,1.2,1.45,pale);cyl(g,0,12.0,35.25,.7,1.75,white);ball(g,0,12.9,35.25,.7,white,1,.5,1);box(g,0,10.55,36,1.05,.8,1.1,pale);
  for(let k=0;k<6;k++){const a=k*P/3;rod(g,[Math.cos(a)*.10,10.7+Math.sin(a)*.10,35.5],[Math.cos(a)*.10,10.7+Math.sin(a)*.10,37.6],.04,black);}
cyl(g,0,10,7,1.8,2,gray);rod(g,[0,11,7],[0,11.5,2],.12,steel);
  for(const side of [-1,1])rails(g,[[side*5.8,-48],[side*6.5,-20],[side*6.5,40],[side*5.9,65]],4.7);
  box(g,0,4.63,55,11,.08,23,dark);label(g,'H',0,4.71,56,6,6).rotation.x=-P/2;batch(g);return g;
}
export function buildAircraft() {
  const g=new THREE.Group();g.name='A-6E Intruder';const a=material(0x88999e),b=material(0xc3c9c6),glass=material(0x203a45,.2,.45);
  ball(g,0,0,0,1,a,1.2,1.15,7.8);ball(g,0,.85,-3.7,1,glass,1.1,.6,1.6);
  // Swept wing planform and distinctive broad, side-by-side cockpit nose.
  for(const side of [-1,1]){
    const shape=new THREE.Shape();shape.moveTo(0,-2);shape.lineTo(side*8.1,1.1);shape.lineTo(side*8.1,2.1);shape.lineTo(0,2);shape.closePath();const wing=mesh(g,new THREE.ShapeGeometry(shape),a,0,-.1,0);wing.rotation.x=P/2;wing.material=wing.material.clone();wing.material.side=THREE.DoubleSide;
    ball(g,side*1.1,-.2,-1.7,.65,dark,.8,.8,2);ball(g,side*1.0,-.1,4,.45,black,.8,.8,2);
    const tail=box(g,side*1.9,.25,5.6,4.2,.13,1.4,a);tail.rotation.y=side*-.22;
    rod(g,[side*3.4,-.7,.3],[side*3.4,-.7,-2.6],.22,b);
  }
  const fin=box(g,0,1.45,5.5,.18,2.8,2.5,a);fin.rotation.x=-.25;batch(g);return g;
}
export function buildMissile(kind='fort') {
  const g=new THREE.Group();const big=/granit|p700/i.test(kind),small=/osa/i.test(kind);const len=big?10:small?3.2:7.2,r=big?.43:small?.10:.26;
  const body=cyl(g,0,0,0,r,len*.85,white,r,12);body.rotation.x=P/2;
  const nose=mesh(g,new THREE.ConeGeometry(r,len*.2,12),white,0,0,-len*.5);nose.rotation.x=-P/2;
  for(let i=0;i<4;i++){const p=new THREE.Group();p.rotation.z=i*P/2;g.add(p);const f=box(p,r*1.8,0,len*.25,r*4,.045,len*.2,gray);f.rotation.y=-.25;batch(p);}
  const exhaust=cyl(g,0,0,len*.43,r*.8,.08,black);exhaust.rotation.x=P/2;batch(g);return g;
}
