import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Atmosphere } from './atmosphere.js';
import { PostFX } from './post.js';
import { FX } from './fx.js';
import { Ocean } from './ocean.js';
import { Clouds } from './clouds.js';
import { globalUniforms, patchSceneFog } from './shaderlib.js';
import { buildKirov, buildEnemyShip, buildAircraft, buildMissile } from './models.js';
import { Simulation, WEAPONS, SHIPS, ANTI_SHIP } from './sim.js';
import { FireControl } from './fire-control.js';
import { AudioEngine } from './audio.js';
import { MissileFollow } from './follow-camera.js';
import { FireCues } from './fire-cues.js';

const $ = id => document.getElementById(id);
// The playable ship: chosen on the title screen (boot.js) or with ?ship=kirov|slava.
const SHIP=SHIPS[new URLSearchParams(location.search).get('ship')||window.__orlanShip]||SHIPS.kirov;
const ANTI=SHIP.antiShip,WEAPON_KINDS=[ANTI,'fort','osa'];
// boot.js shows the loading screen; each stage reports progress and yields so the screen repaints.
async function loading(label,fraction){window.__orlanBoot?.progress(label,fraction);await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));}
await loading('Starting the renderer',.06);
const viewport=$('viewport');
let viewWidth=viewport.clientWidth,viewHeight=viewport.clientHeight;
const renderer = new THREE.WebGLRenderer({canvas:$('world'),antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.setSize(viewWidth,viewHeight,false);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
const scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(0x91a4aa,0.000013);
const camera=new THREE.PerspectiveCamera(48,viewWidth/viewHeight,0.15,200000);
camera.position.set(280,130,280);
const controls=new OrbitControls(camera,renderer.domElement);
controls.target.set(0,12,0);controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=50;controls.maxDistance=1600;controls.maxPolarAngle=Math.PI*.48;controls.enablePan=false;controls.zoomSpeed=1.15;
// Third-person camera: the orbit centre is a point on the ship (just forward of amidships, at the
// superstructure's middle height) that moves and turns with her, so the framing holds while she
// steams and manoeuvres; the user's orbit and zoom are kept relative to the ship. The default view is
// the starboard bow quarter, low, at the distance that fills the (portrait) 3D view with the ship.
const chase={aim:new THREE.Vector3(0,14,4),yaw:0,offset:new THREE.Vector3(),at:new THREE.Vector3(),up:new THREE.Vector3(0,1,0)};
const EXTERNAL={azimuth:38*Math.PI/180,elevation:17*Math.PI/180,fill:.92};
// ship-local extreme points (stem head, forefoot, transom corners, masthead, waterline amidships)
const EXTREMES=[[0,13.5,-126],[0,0,-111],[-11,7.6,126],[11,7.6,126],[0,51.5,11],[13,0,0],[-13,0,0],[0,0,118]].map(a=>new THREE.Vector3(...a));
function shipAim(p,out){return out.copy(chase.aim).applyAxisAngle(chase.up,-p.heading).add(p.pos);}
function frameExternal(p){
  // fit the whole ship in the view from the default bearing: find the nearest distance at which every
  // extreme point projects inside `fill` of the frame, centring the composition on the way
  chase.yaw=-p.heading;
  const c=Math.cos(EXTERNAL.elevation),dir=new THREE.Vector3(Math.sin(EXTERNAL.azimuth)*c,Math.sin(EXTERNAL.elevation),-Math.cos(EXTERNAL.azimuth)*c).applyAxisAngle(chase.up,chase.yaw);
  const pts=EXTREMES.map(e=>e.clone().applyAxisAngle(chase.up,chase.yaw).add(p.pos)),cam=camera.clone(),q=new THREE.Vector3();
  shipAim(p,controls.target);
  const fit=(d)=>{cam.position.copy(controls.target).addScaledVector(dir,d);cam.lookAt(controls.target);cam.updateMatrixWorld();let x0=1,x1=-1,y0=1,y1=-1;for(const e of pts){q.copy(e).project(cam);x0=Math.min(x0,q.x);x1=Math.max(x1,q.x);y0=Math.min(y0,q.y);y1=Math.max(y1,q.y);}return{x0,x1,y0,y1};};
  let d=250;
  for(let pass=0;pass<3;pass++){
    let lo=60,hi=1500;
    for(let i=0;i<24;i++){d=(lo+hi)/2;const b=fit(d);if(b.x0<-EXTERNAL.fill||b.x1>EXTERNAL.fill||b.y0<-EXTERNAL.fill||b.y1>EXTERNAL.fill)lo=d;else hi=d;}
    d=hi;
    // shift the orbit centre toward the middle of the projected ship (screen right and up axes)
    const b=fit(d),right=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,0),upv=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,1);
    const halfH=d*Math.tan(THREE.MathUtils.degToRad(cam.fov)/2),halfW=halfH*cam.aspect;
    controls.target.addScaledVector(right,(b.x0+b.x1)/2*halfW).addScaledVector(upv,(b.y0+b.y1)/2*halfH*.6);
  }
  chase.offset.copy(dir).multiplyScalar(d);
  // keep the orbit centre's offset from the aim point in ship axes, so following keeps the composition
  chase.aimOffset=controls.target.clone().sub(shipAim(p,new THREE.Vector3())).applyAxisAngle(chase.up,-chase.yaw);
  camera.position.copy(controls.target).add(chase.offset);controls.update();
}
function followExternal(p,dt){
  if(!chase.ready){chase.ready=true;frameExternal(p);return;}
  // turn the orbit with the ship's heading (smoothed, about 0.7 s), then carry it with the aim point
  let d=-p.heading-chase.yaw;d=Math.atan2(Math.sin(d),Math.cos(d));
  const turn=d*(1-Math.exp(-Math.max(0,dt)*1.5));chase.yaw+=turn;
  chase.offset.subVectors(camera.position,controls.target).applyAxisAngle(chase.up,turn);
  shipAim(p,controls.target);if(chase.aimOffset)controls.target.add(v2.copy(chase.aimOffset).applyAxisAngle(chase.up,chase.yaw));
  camera.position.copy(controls.target).add(chase.offset);
}
await loading('Sky, sun and weather',.12);
const atmosphere=new Atmosphere(renderer,scene);atmosphere.setShadowQuality(2048,165);atmosphere.set(14,250);
scene.fog.density=.000022;
const sunDirection=atmosphere.sunDir;
const sun=atmosphere.sun;
const hemi=new THREE.HemisphereLight(0xa5bfcc,0x273d43,.22);scene.add(hemi);
globalUniforms.uSunDirW.value.copy(atmosphere.lightDir);globalUniforms.uSunColorN.value.copy(sun.color);globalUniforms.uCloudCoverage.value=.55;globalUniforms.uCloudShadow.value=.25;globalUniforms.fogHeightFalloff.value=.001;
await loading('Norwegian Sea',.22);
const ocean=new Ocean(renderer,{rings:120,segs:160});scene.add(ocean.mesh);
const clouds=new Clouds(scene,{count:40});
await loading(`Building ${SHIP.name[0]+SHIP.name.slice(1).toLowerCase()}: hull, weapons, bridge and crew`,.32);
// `kirov` is the player's ship model whichever ship it is (both expose the same interface).
const kirov=SHIP.id==='slava'?(await import('./models/slava.js')).buildSlava():buildKirov();scene.add(kirov.group);
// Bridge interior lights live in the bridge group (models/kirov-bridge.js), so they follow its anchor.
kirov.group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
await loading('Smoke, fire and missile effects',.7);
const fx=new FX(scene,{maxSmoke:2400,maxGlow:1400,maxDebris:180,maxShards:160,maxBrass:100,lights:4});fx.ground=(x,z)=>ocean.heightAt(x,z);fx.budget=.7;
patchSceneFog(scene);
await loading('Post-processing',.76);
const post=new PostFX(renderer,scene,camera);post.setGrade('Natural');post.exposure.params.key=.18;post.exposure.params.min=.18;post.exposure.params.max=1.8;post.bloom.strength=.23;post.grade.uniforms.uVignette.value=.25;post.grade.uniforms.uGrain.value=.018;post.lens.uniforms.uFlare.value=.12;
post.setSize(viewWidth,viewHeight,Math.min(renderer.getPixelRatio(),1));
const seed=Number(new URLSearchParams(location.search).get('seed'))||1985;
const sim=new Simulation({seed,ship:SHIP.id});sim.setLaunchPoints(kirov.launchPoints);sim.setLaunchFrames?.(kirov.launchFrame);kirov.attachFx?.(fx);
const follow=new MissileFollow(camera,{seaLevel:(x,z)=>ocean.heightAt(x,z)});let previousView='external',followHinted=false;
const fireControl=new FireControl(sim);fireControl.setWeapon(ANTI);fireControl.setSalvo(2);
let followId=null,weaponCameraSnap=true;
let view='external',selected=null,weapon=ANTI,timeScale=1,started=false,lastFrame=performance.now(),uiAge=1,finished=false,helpWasPaused=false,raf=0;
let bridgeYaw=0,bridgePitch=-.1,bridgeFov=72,dragging=false,lastPointer={x:0,y:0},lastPlayer=new THREE.Vector3();
const timeScales=[.5,1,2,4,8,16];
let seaAmplitude=.85,weatherCover=.65,quality=2;
const shipPose={heave:0,pitch:0,roll:0};
const entityMeshes=new Map(),missileMeshes=new Map(),trackLabels=new Map();
const v=new THREE.Vector3(),v2=new THREE.Vector3(),look=new THREE.Vector3(),q=new THREE.Quaternion(),forward=new THREE.Vector3(0,0,-1);
const streaks=[];const wrecks=new Map();
let toastTimer;
function toast(text){$('toast').textContent=text;$('toast').style.opacity='1';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.opacity='0',3500);}
const audio=new AudioEngine();
// Crew callouts and the machinery of each firing step, placed at the launcher about to fire.
const cueSlot=()=>{const w=fireControl.state.weapon;return Math.max(0,(WEAPONS[w]?.ammo??0)-(sim.player.ammo[w]??0));};
let subtitleTimer=0;function showSubtitle(text,seconds){const el=$('subtitle');el.textContent=text;el.classList.add('show');clearTimeout(subtitleTimer);subtitleTimer=setTimeout(()=>el.classList.remove('show'),seconds*1000);}
const cues=new FireCues(audio,{where:(kind,slot)=>{const pts=kirov.launchPoints?.[kind];return pts?.length?kirov.group.localToWorld(pts[slot%pts.length].clone()):null;},subtitle:showSubtitle});cues.load();
try{cues.enabled=localStorage.getItem('orlan.voice')!=='0';}catch{}
function explosion(pos,scale=1){if(!pos)return;fx.explosion(pos,Math.max(.5,Number(scale)||1));post.shockwave(pos,{radius:Math.max(80,scale*130),strength:.5});audio.explosion(pos,scale);}
sim.events.launch=m=>{audio.launch(m);if(!m.hostile){kirov.animateLaunch?.(m.kind,m.slot,m);if(!kirov.attachFx&&m.kind!=='fort')fx.ignition(m.pos,m.fwd,ANTI_SHIP.has(m.kind)?3:1);if(m.kind===weapon)toast(followHinted?`${m.kind.toUpperCase()} AWAY`:`${m.kind.toUpperCase()} AWAY · press F to ride it`);followHinted=true;}};
sim.events.coldLaunch=m=>kirov.coldLaunch?kirov.coldLaunch(m):fx.coldLaunch(m.pos,m.fwd,1.8);
sim.events.ignite=m=>kirov.ignite?kirov.ignite(m):fx.ignition(m.pos,m.fwd,1.8);
sim.events.explosion=explosion;
sim.events.hit=p=>{audio.hit(p);post.dazzle(.45);cues.hit();};
sim.events.kill=(c,w)=>cues.kill(c,w);
sim.events.incoming=c=>cues.incoming(c);
sim.events.chaff=p=>{audio.chaff(p);fx.explosion(p,.25,{debris:false,fireball:false});};
sim.events.ciws=(a,b)=>{audio.ciws(a,b);const from=kirov.ciwsBurst?.(a,b)||a;const g=new THREE.BufferGeometry().setFromPoints([from,b]);const line=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xffe7a3,transparent:true,opacity:.8,depthWrite:false}));scene.add(line);streaks.push({mesh:line,age:0});};
function clock(t){const m=Math.floor(t/60),s=Math.floor(t%60);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
function bearing(pos){const p=sim.player.pos;return ((Math.atan2(pos.x-p.x,-(pos.z-p.z))*180/Math.PI+360)%360).toFixed(0).padStart(3,'0');}
// Follow (Drumfire's shell ride): F rides your newest round, Shift+F the nearest incoming missile. After the
// burst shot it picks up the next round of the same salvo still in flight, else returns to the last view.
function startFollow(m){if(view!=='missile')previousView=view;setView('missile');const kind=m.kind,targetId=m.targetId,hostile=m.hostile;follow.start(m,{aim:()=>hostile?sim.player.pos:sim.contacts.find(c=>c.id===targetId)?.pos,ship:()=>sim.player.pos,onEnd:()=>{const next=hostile?null:[...sim.missiles].reverse().find(x=>x.alive&&!x.hostile&&x.kind===kind&&x.targetId===targetId);if(next&&view==='missile')startFollow(next);else if(view==='missile')setView(previousView);}});uiAge=1;}
function followNewest(){const m=[...sim.missiles].reverse().find(m=>m.alive&&!m.hostile&&m.kind===weapon)||[...sim.missiles].reverse().find(m=>m.alive&&!m.hostile);if(!m){toast('No missile of yours in flight. Fire a salvo, then press F to ride it (Shift+F rides an incoming missile).');return;}startFollow(m);}
function followIncoming(){const p=sim.player.pos,m=sim.missiles.filter(m=>m.alive&&m.hostile).sort((a,b)=>a.pos.distanceToSquared(p)-b.pos.distanceToSquared(p))[0];if(!m){toast('No incoming missile to follow.');return;}startFollow(m);}
function leaveFollow(){follow.stop();setView(previousView==='missile'?'external':previousView);}
function updateFollowHud(){const el=$('follow-hud');if(view!=='missile'){el.classList.add('hidden');return;}el.classList.remove('hidden');const m=follow.missile;
if(follow.mode==='tripod'){el.innerHTML='<b>IMPACT</b> holding on the burst';return;}
if(!m){el.innerHTML='<b>FOLLOW</b> no missile in flight · F rides your newest round · Shift+F an incoming one';return;}
const t=m.hostile?null:sim.contacts.find(c=>c.id===m.targetId),name=m.hostile?'INCOMING '+(WEAPONS[m.kind]?.name||m.kind.toUpperCase()):(WEAPONS[m.kind]?.name||m.kind.toUpperCase());
const to=m.hostile?`${(m.pos.distanceTo(sim.player.pos)/1000).toFixed(1)} KM FROM KIROV`:t?`${(m.pos.distanceTo(t.pos)/1000).toFixed(1)} KM TO ${t.name.toUpperCase()}`:'';
el.innerHTML=`<b>RIDING</b> ${name} · ${Math.round(m.vel.length())} M/S · ${Math.round(m.pos.y)} M · ${to}<small>DRAG ORBIT · WHEEL ZOOM · F RETURN</small>`;}
function contacts(){return sim.contacts.filter(c=>c.alive&&c.detected);}
function designate(id){selected=id;kirov.safeWeapon?.(weapon);fireControl.designate(id);audio.tone(620,.07,.03);cues.designated();uiAge=1;}
function setView(next){if(next!=='missile')follow.stop();view=next;followId=null;weaponCameraSnap=true;audio.setView(view);document.body.classList.toggle('bridge',view==='bridge');controls.enabled=view==='external';camera.fov=view==='bridge'?bridgeFov:48;camera.updateProjectionMatrix();if(view==='external')frameExternal(sim.player);if(view==='bridge'){bridgeYaw=0;bridgePitch=-.1;}document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('camera-hint').textContent=view==='external'?'DRAG TO ORBIT · SCROLL TO ZOOM':view==='bridge'?'DRAG TO LOOK · SCROLL FOR BINOCULARS':view==='weapon'?'LAUNCHER INSPECTION · SELECT A WEAPON':'FOLLOWING MOST RECENT LIVE MISSILE';if(view==='missile'&&!sim.missiles.some(m=>m.alive))toast('No live missile — camera standing by');}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>b.dataset.view==='missile'?followNewest():setView(b.dataset.view));
if(ANTI!=='granit'){const card=document.querySelector('[data-weapon="granit"]');card.dataset.weapon=ANTI;document.querySelector('[data-auto="granit"]').dataset.auto=ANTI;card.querySelector('b').textContent=ANTI==='bazalt'?'П-500 БАЗАЛЬТ':ANTI.toUpperCase();card.querySelector('span').firstChild.textContent=`${WEAPONS[ANTI].name.replace(/^P-(\d+) (\w)(\w+)$/,(m,n,a,b)=>`P-${n} ${a}${b.toLowerCase()}`)} `;$('fit-granit').id=`fit-${ANTI}`;$('ammo-granit').id=`ammo-${ANTI}`;}
document.title=`Bastion · ${SHIP.name[0]+SHIP.name.slice(1).toLowerCase()} Command`;document.querySelector('.brand small').textContent=`БАСТИОН / ${SHIP.name} COMMAND`;document.querySelector('.view-caption').innerHTML=`${SHIP.project} <span>${SHIP.native} · NORTHERN FLEET</span>`;document.querySelector('#ship-panel .section-title').innerHTML=`${SHIP.native} <span>${SHIP.project}</span>`;
document.querySelectorAll('[data-weapon]').forEach(b=>{b.title=WEAPONS[b.dataset.weapon].description;});
document.querySelectorAll('[data-weapon]').forEach(b=>b.onclick=()=>{kirov.safeWeapon?.(weapon);weapon=b.dataset.weapon;fireControl.setWeapon(weapon);fireControl.designate(selected);fitRadar();document.querySelectorAll('[data-weapon]').forEach(x=>x.classList.toggle('active',x===b));uiAge=1;audio.tone(500,.04);});
function fire(){if(!started||sim.paused||sim.result)return;const result=fireControl.authorize();if(!result?.ok){toast(result?.reason||'Unable to fire');cues.refused(result?.reason);}uiAge=1;}
$('fire').onclick=fire;
for(const action of ['acquire','prepare','arm','abort'])$(action).onclick=()=>{const result=fireControl[action]();if(!result.ok){toast(result.reason);cues.refused(result.reason);}else audio.tone(action==='arm'?260:550,.09,.025);uiAge=1;};
function chooseSalvo(n){const result=fireControl.setSalvo(n);if(!result.ok)toast(result.reason);else audio.tone(500,.04);uiAge=1;}
document.querySelectorAll('[data-salvo]').forEach(b=>b.onclick=()=>chooseSalvo(Number(b.dataset.salvo)));
fireControl.events.prepare=state=>{const slot=WEAPONS[state.kind].ammo-sim.player.ammo[state.kind];kirov.prepareWeapon?.(state.kind,slot);sim.note(`${state.kind.toUpperCase()}: weapon preparation ordered.`);};
fireControl.events.ready=state=>{sim.note(`${state.weapon.toUpperCase()}: ready to arm.`);};
fireControl.events.abort=state=>{kirov.safeWeapon?.(state.weapon);sim.note(state.reason);};
fireControl.events.complete=state=>{sim.note(state.reason);};
function heading(delta){sim.setHeading(sim.player.desiredHeading*180/Math.PI+delta);uiAge=1;}
function speed(delta){sim.setSpeed(sim.player.desiredSpeed/0.514444+delta);uiAge=1;}
$('port').onclick=()=>heading(-10);$('starboard').onclick=()=>heading(10);$('slower').onclick=()=>speed(-5);$('faster').onclick=()=>speed(5);
$('radar-toggle').onclick=()=>{sim.toggleRadar();uiAge=1;};$('auto-toggle').onclick=()=>{sim.toggleAutoDefense();uiAge=1;};
// Per-weapon crew automation, beside each weapon card.
document.querySelectorAll('[data-auto]').forEach(b=>b.onclick=()=>{sim.toggleAuto(b.dataset.auto);audio.tone(500,.04);uiAge=1;});
function chaff(){if(!started||sim.paused||sim.result)return;if(sim.deployChaff()){toast('CHAFF DEPLOYED');}else toast('Chaff unavailable — dispenser recharging or empty');uiAge=1;}
$('chaff').onclick=chaff;
function pause(){if(!started||sim.result)return;sim.paused=!sim.paused;uiAge=1;}
$('pause').onclick=pause;
function changeTime(delta){let i=timeScales.indexOf(timeScale);timeScale=timeScales[Math.max(0,Math.min(timeScales.length-1,i+delta))];uiAge=1;}
$('time-down').onclick=()=>changeTime(-1);$('time-up').onclick=()=>changeTime(1);
$('conditions').onchange=()=>{const mode=$('conditions').value;const presets={day:[14,.15,.85,.65],dusk:[2,.12,.7,.5],overcast:[10,.82,1.8,1],night:[-10,.05,.8,.5]};const [elev,storm,amp,cover]=presets[mode];atmosphere.setStorm(storm);atmosphere.set(elev,250);seaAmplitude=amp;weatherCover=cover;globalUniforms.uSunDirW.value.copy(atmosphere.lightDir);globalUniforms.uSunColorN.value.copy(sun.color);globalUniforms.uCloudCoverage.value=cover;scene.fog.density=mode==='overcast'?.000075:.000022;globalUniforms.uWetness.value=mode==='overcast'?.8:0;post.exposure.params.max=mode==='night'?5:1.8;post.grade.uniforms.uNight.value=atmosphere.night;};
$('quality').onclick=()=>{quality=(quality+1)%3;const names=['LOW','MEDIUM','HIGH'];$('quality').textContent='QUALITY '+names[quality];post.gtao.enabled=quality>0;post.bloom.enabled=quality>0;renderer.shadowMap.enabled=quality>0;fx.budget=[.35,.55,.8][quality];post.setSize(viewWidth,viewHeight,[.65,.8,1][quality]);};
$('sound').onclick=()=>{audio.enabled=!audio.enabled;$('sound').textContent=audio.enabled?'SOUND ON':'SOUND OFF';};
$('voice').textContent=cues.enabled?'VOICE ON':'VOICE OFF';
$('voice').onclick=()=>{cues.enabled=!cues.enabled;$('voice').textContent=cues.enabled?'VOICE ON':'VOICE OFF';try{localStorage.setItem('orlan.voice',cues.enabled?'1':'0');}catch{}};
function startMission(){if(started)return;started=true;audio.start();cues.start();sim.start();$('intro').classList.add('hidden');lastPlayer.copy(sim.player.pos);uiAge=1;toast('Click a red track on the radar, then follow the FIRE CONTROL line: ACQUIRE → PREPARE → ARM → FIRE (Enter steps through).');}
$('start').onclick=startMission;
$('help').onclick=()=>{helpWasPaused=sim.paused;sim.paused=true;$('help-modal').classList.remove('hidden');uiAge=1;};
$('help-close').onclick=()=>{$('help-modal').classList.add('hidden');sim.paused=helpWasPaused;uiAge=1;};
$('restart').onclick=()=>{location.search=`?ship=${SHIP.id}&seed=${Math.floor(Math.random()*1000000)}`;};
// Radar display range: one button per scale; the lit one is the scale in use.
let range=40000;const ranges=[10000,20000,40000,80000,160000];
function setRange(r){range=r;document.querySelectorAll('[data-range]').forEach(b=>{const on=Number(b.dataset.range)===r;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});}
document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{setRange(Number(b.dataset.range));audio.tone(500,.04);});
window.addEventListener('keydown',e=>{if(!started||!$('help-modal').classList.contains('hidden')||sim.result)return;if(['Space','Tab','Enter','NumpadEnter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();if(e.repeat&& !e.code.startsWith('Arrow'))return;if(e.shiftKey&&/^Digit[1-4]$/.test(e.code)){chooseSalvo(Number(e.code.slice(5)));return;}
switch(e.code){case'Digit1':setView('external');break;case'Digit2':setView('bridge');break;case'Digit3':followNewest();break;case'KeyF':if(e.shiftKey)followIncoming();else if(view==='missile')leaveFollow();else followNewest();break;case'Digit4':setView('weapon');break;case'Space':fire();break;case'ArrowLeft':heading(-5);break;case'ArrowRight':heading(5);break;case'ArrowUp':speed(2);break;case'ArrowDown':speed(-2);break;case'KeyR':$('radar-toggle').click();break;case'KeyA':if(e.shiftKey){sim.toggleAuto(weapon);uiAge=1;}else $('auto-toggle').click();break;case'KeyG':$('ciws-toggle').click();break;case'KeyV':$('voice').click();break;case'Enter':case'NumpadEnter':nextStep();break;case'KeyC':chaff();break;case'KeyP':pause();break;case'KeyH':document.body.classList.toggle('clean');break;case'BracketLeft':changeTime(-1);break;case'BracketRight':changeTime(1);break;case'Tab':{const list=contacts();if(list.length)designate(list[(list.findIndex(c=>c.id===selected)+1)%list.length].id);break;}}});
renderer.domElement.addEventListener('pointerdown',e=>{if(view==='bridge'||view==='missile'){dragging=true;lastPointer={x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);}});
renderer.domElement.addEventListener('pointermove',e=>{if(dragging&&view==='missile'){follow.orbit(e.clientX-lastPointer.x,e.clientY-lastPointer.y);lastPointer={x:e.clientX,y:e.clientY};return;}if(dragging&&view==='bridge'){bridgeYaw-=(e.clientX-lastPointer.x)*.003;bridgePitch-=(e.clientY-lastPointer.y)*.003;bridgePitch=THREE.MathUtils.clamp(bridgePitch,-0.95,0.75);lastPointer={x:e.clientX,y:e.clientY};}});
renderer.domElement.addEventListener('pointerup',()=>dragging=false);
renderer.domElement.addEventListener('wheel',e=>{if(view==='missile'){e.preventDefault();follow.zoom(e.deltaY);return;}if(view==='bridge'){e.preventDefault();bridgeFov=THREE.MathUtils.clamp(bridgeFov+e.deltaY*.025,15,80);camera.fov=bridgeFov;camera.updateProjectionMatrix();}},{passive:false});
const radar=$('radar'),ctx=radar.getContext('2d');let radarHit=[];
radar.onclick=e=>{const r=radar.getBoundingClientRect(),x=(e.clientX-r.left)*520/r.width,y=(e.clientY-r.top)*520/r.height;const pick=radarHit.map(c=>({...c,d:Math.hypot(c.x-x,c.y-y)})).sort((a,b)=>a.d-b.d)[0];if(pick&&pick.d<30)designate(pick.id);};
// The selected weapon's engagement envelope on the scope: the shaded ring between its minimum and maximum
// range, labelled; a range beyond the scale is marked at the scope edge. For Fort and Osa against a
// designated target, the radar horizon for that target's altitude is drawn when it cuts the envelope short.
function drawEnvelope(c,r){const w=WEAPONS[weapon],rgb=ANTI_SHIP.has(weapon)?'230,187,118':'131,200,188',km=x=>`${x/1000>=10?Math.round(x/1000):(x/1000).toFixed(1)} KM`;
const beyond=w.range>range,outer=beyond?r:w.range/range*r,inner=Math.min(1,w.minRange/range)*r;
ctx.save();ctx.beginPath();ctx.arc(c,c,outer,0,Math.PI*2);ctx.arc(c,c,inner,0,Math.PI*2,true);ctx.fillStyle=`rgba(${rgb},.11)`;ctx.fill();
// dead zone inside the minimum range
if(inner>2){ctx.beginPath();ctx.arc(c,c,inner,0,Math.PI*2);ctx.fillStyle='rgba(5,12,14,.35)';ctx.fill();ctx.setLineDash([4,5]);ctx.strokeStyle=`rgba(${rgb},.7)`;ctx.lineWidth=1.2;ctx.stroke();}
ctx.setLineDash(beyond?[2,6]:[]);ctx.strokeStyle=`rgba(${rgb},${beyond?.55:.9})`;ctx.lineWidth=beyond?3:1.6;ctx.beginPath();ctx.arc(c,c,outer,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
ctx.font='bold 11px monospace';ctx.fillStyle=`rgba(${rgb},.95)`;ctx.textAlign='center';
const name=w.name.replace(/^.* /,'');
if(beyond)ctx.fillText(`${name} MAX ${km(w.range)} · BEYOND THIS SCALE`,c,c+r-8);
else{const a=-Math.PI/4;ctx.save();ctx.translate(c+Math.cos(a)*outer,c+Math.sin(a)*outer);ctx.textAlign='left';ctx.fillText(`${name} MAX ${km(w.range)}`,6,-4);ctx.restore();}
if(inner>14){ctx.textAlign='center';ctx.fillText(`MIN ${km(w.minRange)}`,c,c+inner+13);}
const t=sim.contacts.find(x=>x.id===selected&&x.alive);
if(t&&!ANTI_SHIP.has(weapon)){const h=4120*(Math.sqrt(35)+Math.sqrt(Math.max(0,t.pos.y)));if(h<Math.min(w.range,range)){ctx.setLineDash([1,4]);ctx.strokeStyle='rgba(230,187,118,.8)';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(c,c,h/range*r,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.textAlign='center';ctx.fillStyle='rgba(230,187,118,.9)';ctx.font='10px monospace';ctx.fillText(`RADAR HORIZON FOR ${Math.round(t.pos.y)} M TARGET`,c,c-h/range*r-6);}}
ctx.textAlign='left';ctx.restore();
}
function envelopeCaption(){const w=WEAPONS[weapon],km=x=>`${x/1000>=10?Math.round(x/1000):(x/1000).toFixed(1)} KM`;$('envelope-caption').textContent=`${w.name.replace(/^.* /,'')} ENVELOPE ${km(w.minRange)} TO ${km(w.range)}`+(ANTI_SHIP.has(weapon)?' · SHIPS':` · ${w.minAlt} TO ${w.maxAlt.toLocaleString('en-US')} M`);}
// Selecting a SAM scales the scope to show its whole envelope and the designated target; Granit's
// 550 km envelope is far beyond any useful scale, so its edge is marked instead.
function fitRadar(){if(ANTI_SHIP.has(weapon))return;const t=sim.contacts.find(x=>x.id===selected&&x.alive),need=Math.max(WEAPONS[weapon].range,t?t.pos.distanceTo(sim.player.pos):0)*1.06;setRange(ranges.find(x=>x>=need)||ranges.at(-1));}
function drawRadar(){const w=520,c=260,r=228;ctx.clearRect(0,0,w,w);ctx.strokeStyle='#42756760';ctx.lineWidth=1;ctx.font='12px monospace';ctx.fillStyle='#5b877a';for(let i=1;i<=4;i++){ctx.beginPath();ctx.arc(c,c,r*i/4,0,Math.PI*2);ctx.stroke();ctx.fillText(`${range*i/4000}`,c+4,c-r*i/4+14);}ctx.beginPath();ctx.moveTo(c-r,c);ctx.lineTo(c+r,c);ctx.moveTo(c,c-r);ctx.lineTo(c,c+r);ctx.stroke();
if(sim.player.radar){const sweep=(sim.time*.55)% (Math.PI*2);const grad=ctx.createConicGradient(sweep-Math.PI/2,c,c);grad.addColorStop(0,'#86d3ac35');grad.addColorStop(.12,'#86d3ac00');grad.addColorStop(1,'#86d3ac00');ctx.fillStyle=grad;ctx.beginPath();ctx.arc(c,c,r,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#92d5ac90';ctx.beginPath();ctx.moveTo(c,c);ctx.lineTo(c+Math.sin(sweep)*r,c-Math.cos(sweep)*r);ctx.stroke();}
drawEnvelope(c,r);
ctx.save();ctx.translate(c,c);ctx.rotate(sim.player.heading);ctx.fillStyle='#90d9c3';ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(6,8);ctx.lineTo(0,4);ctx.lineTo(-6,8);ctx.closePath();ctx.fill();ctx.restore();radarHit=[];
for(const contact of contacts()){const dx=contact.pos.x-sim.player.pos.x,dz=contact.pos.z-sim.player.pos.z;const distance=Math.hypot(dx,dz);const scale=Math.min(1,(range*.98)/Math.max(distance,1));const x=c+dx/range*r*scale,y=c+dz/range*r*scale;radarHit.push({id:contact.id,x,y});ctx.strokeStyle=contact.id===selected?'#ffe2a0':contact.type==='plane'?'#e5bd7d':'#f18472';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=contact.id===selected?2:1.5;ctx.beginPath();if(contact.type==='plane'){ctx.moveTo(x,y-7);ctx.lineTo(x+7,y+5);ctx.lineTo(x-7,y+5);}else if(contact.type==='munition'){ctx.moveTo(x,y-6);ctx.lineTo(x+4,y+5);ctx.lineTo(x,y+2);ctx.lineTo(x-4,y+5);}else{ctx.moveTo(x,y-7);ctx.lineTo(x+7,y);ctx.lineTo(x,y+7);ctx.lineTo(x-7,y);}ctx.closePath();ctx.stroke();if(contact.id===selected){ctx.strokeRect(x-13,y-13,26,26);const stage=fireControl.state.stage;if(stage==='tracking'){ctx.strokeStyle='#e4c583';ctx.beginPath();ctx.arc(x,y,20,-Math.PI/2,-Math.PI/2+fireControl.state.progress*Math.PI*2);ctx.stroke();}else if(['tracked','preparing','ready','armed','firing'].includes(stage)){ctx.strokeStyle='#9ad4ba';ctx.strokeRect(x-17,y-17,34,34);ctx.font='10px monospace';ctx.fillStyle='#9ad4ba';ctx.fillText('TRACK',x+21,y+3);}}const vel=contact.vel;if(vel&&vel.lengthSq()>1){v.copy(vel).normalize();ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+v.x*18,y+v.z*18);ctx.stroke();}}
for(const m of sim.missiles){if(!m.alive||m.hostile)continue;const dx=m.pos.x-sim.player.pos.x,dz=m.pos.z-sim.player.pos.z;if(Math.hypot(dx,dz)>range)continue;ctx.fillStyle='#b2dbc4';ctx.fillRect(c+dx/range*r-1.5,c+dz/range*r-1.5,3,3);}}
let previousList='';
$('ciws-toggle').onclick=()=>{sim.toggleCiws();uiAge=1;};
// Enter performs whichever fire-control step is next, so the sequence can be run from one key.
function nextStep(){const q=fireControl.status();if(q.canAuthorize)return fire();for(const action of ['arm','prepare','acquire'])if(q['can'+action[0].toUpperCase()+action.slice(1)])return $(action).click();const coach=coachFor(q,sim.contacts.find(c=>c.id===selected));toast(coach[1]);}
const WEAPON_ROLE={granit:'GRANIT (ships)',bazalt:'BAZALT (ships)',fort:'FORT (aircraft and missiles, long range)',osa:'OSA (aircraft and missiles, short range)'};
function coachFor(q,target){const salvo=q.salvo,unit=salvo>1?'rounds':'round';
if(!target?.alive)return['STEP 1 · DESIGNATE','Click a red track on the radar or in TRACKS (Tab cycles). ◇ is a ship, △ an aircraft or missile.'];
const surface=target.type==='ship';
if(surface&&!ANTI_SHIP.has(weapon))return['CHOOSE WEAPON',`Ships are engaged with 01 ${ANTI.toUpperCase()}. Select it above.`];
if(!surface&&ANTI_SHIP.has(weapon))return['CHOOSE WEAPON',`${weapon.toUpperCase()} is anti-ship only. Select 02 FORT (long range) or 03 OSA (short range) for aircraft and missiles.`];
const blocked=q.interlock&&['idle','aborted','complete','tracked'].includes(q.stage);
if(blocked)return['BLOCKED',`${q.interlock}. ${/range|envelope/i.test(q.interlock)?'Wait for the range to change or choose another track.':/radar/i.test(q.interlock)?'Set RADAR ACTIVE (R) or wait for the contact to rise above the horizon.':/floor|CIWS/i.test(q.interlock)?'Too low for this missile: chaff (C) and the AK-630 guns must deal with it.':/cycling/i.test(q.interlock)?'The launcher is reloading; it will be ready shortly.':'Choose another weapon or track.'}`];
switch(q.stage){
case'tracking':return['LOCKING ON',`The fire-control radar is acquiring ${target.name}. Wait for TRACK HELD.`];
case'tracked':return['STEP 3 · PREPARE',`Press PREPARE (Enter). The ${weapon.toUpperCase()} launcher readies ${salvo} ${unit}; nothing is fired yet.`];
case'preparing':return['PREPARING',`${q.stepLabel}. Wait for PREPARATION COMPLETE.`];
case'ready':return['STEP 4 · ARM','Press ARM (Enter) to close the firing circuit.'];
case'armed':return['STEP 5 · FIRE',`Press FIRE (Space or Enter) to release ${salvo} ${unit} at ${target.name}.`];
case'firing':return['SALVO IN PROGRESS','Rounds leave at the launcher interval. ABORT cancels the rest.'];
case'complete':return['SALVO AWAY','Watch the track on the radar. ACQUIRE again for another salvo, or designate the next target.'];
case'aborted':return['ABORTED',`${q.reason}. ACQUIRE TRACK (Enter) to start again.`];
default:return['STEP 2 · ACQUIRE TRACK',`Press ACQUIRE TRACK (Enter): the radar locks onto ${target.name} with ${WEAPON_ROLE[weapon]}.`];}}
function updateCoach(q,target){const [step,text]=coachFor(q,target);$('coach-step').textContent=step;$('coach-text').textContent=text;$('fire-coach').className=`coach ${step==='BLOCKED'||step==='CHOOSE WEAPON'?'warn':''}`;
for(const kind of WEAPON_KINDS){const el=$('fit-'+kind);if(!target?.alive){el.textContent='';el.className='fit';continue;}const check=sim.canFire(kind,target.id),wrongRole=ANTI_SHIP.has(kind)!==(target.type==='ship');
el.textContent=wrongRole?(ANTI_SHIP.has(kind)?'SHIPS ONLY':'AIR ONLY'):check.ok||/cycling/i.test(check.reason)?'CAN ENGAGE':check.reason.replace(/ · .*/,'').toUpperCase();el.className=`fit ${wrongRole?'no':check.ok||/cycling/i.test(check.reason)?'ok':'warn'}`;}}
function updateUI(){const p=sim.player;$('clock').textContent=clock(sim.time);$('speed').textContent=(p.speed/.514444).toFixed(1);$('heading').textContent=`${((p.heading*180/Math.PI+360)%360).toFixed(0).padStart(3,'0')}°`;$('integrity').textContent=Math.max(0,p.hp).toFixed(0);$('health').style.width=`${Math.max(0,p.hp)}%`;$('health').style.background=p.hp<35?'var(--red)':'var(--teal)';$('helm-order').textContent=`ORDER ${((p.desiredHeading*180/Math.PI+360)%360).toFixed(0).padStart(3,'0')}° / ${(p.desiredSpeed/.514444).toFixed(0)} KN`;$('radar-toggle').innerHTML=`RADAR <b style="color:${p.radar?'var(--teal)':'var(--amber)'}">${p.radar?'ACTIVE':'SILENT'}</b>`;{const a=Object.values(p.auto),all=a.every(Boolean),none=!a.some(Boolean);$('auto-toggle').innerHTML=`WEAPONS AUTO <b>${all?'ALL':none?'OFF':'MIXED'}</b>`;$('auto-toggle').title=all?'All weapons automatic: click for all manual (A)':'Some weapons manual: click for all automatic (A)';}
document.querySelectorAll('[data-auto]').forEach(b=>{const on=!!p.auto[b.dataset.auto];b.textContent=on?'AUTO':'MANUAL';b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});$('systems').innerHTML=Object.entries(p.systems).map(([k,n])=>`<span>${k.toUpperCase().slice(0,4)} ${Math.round(n)}%</span>`).join('');$('phase').textContent=sim.phase||'ON STATION';$('pause').textContent=sim.paused?'▶ RESUME':'Ⅱ PAUSE';$('time-scale').textContent=`${timeScale}×`;
const list=contacts();if(selected===null&&list.length){selected=list[0].id;fireControl.designate(selected);}const target=sim.contacts.find(c=>c.id===selected);$('target-name').textContent=target?.alive?target.name:target?'CONTACT NEUTRALIZED':'NO TARGET SELECTED';$('target-info').textContent=target?.alive?`${bearing(target.pos)}° / ${(target.pos.distanceTo(p.pos)/1000).toFixed(1)} KM / ${Math.round(target.pos.y)} M`:'SELECT A TRACK ON THE RADAR';if(target?.alive){const inbound=sim.missiles.filter(m=>m.alive&&!m.hostile&&m.targetId===target.id).length;$('target-info').textContent+=` / ${inbound} IN FLIGHT`;}const sequence=fireControl.status();$('weapon-status').textContent=sequence.interlock||sequence.launchInterlock||sequence.reason;$('sequence-stage').textContent=sequence.stepLabel;$('sequence-progress').style.width=`${sequence.progress*100}%`;
for(const [id,available] of [['acquire',sequence.canAcquire],['prepare',sequence.canPrepare],['arm',sequence.canArm],['fire',sequence.canAuthorize],['abort',sequence.canAbort]]){$(id).disabled=!available;$(id).classList.toggle('next',available&&id!=='abort'&&(id!=='acquire'||sequence.stage!=='tracked'));}
const salvoLocked=['tracking','preparing','firing'].includes(sequence.stage);document.querySelectorAll('[data-salvo]').forEach(b=>{b.disabled=salvoLocked;b.classList.toggle('active',Number(b.dataset.salvo)===sequence.salvo);});updateFollowHud();envelopeCaption();
for(const name of WEAPON_KINDS)$('ammo-'+name).textContent=p.ammo[name];$('ciws-toggle').innerHTML=`AK-630 · <b style="color:${p.ciwsAuto?'var(--teal)':'var(--amber)'}">${p.ciwsAuto?'AUTO':'HOLD'}</b>`;updateCoach(sequence,target);
$('track-count').textContent=list.length;$('sensor-status').textContent=`${p.radar?'RADAR TRANSMITTING':'RADAR SILENT'} · ${list.filter(c=>c.type==='munition').length} INBOUND`;
const html=list.map(c=>`<button class="contact ${c.id===selected?'selected':''}" data-id="${c.id}"><span class="${c.type==='plane'?'amber':'red'}">${c.type==='plane'?'△':c.type==='munition'?'↑':'◇'}</span><span><b>${c.name}</b><small>${c.type.toUpperCase()} · ${bearing(c.pos)}°</small></span><span class="distance">${(c.pos.distanceTo(p.pos)/1000).toFixed(1)} km</span></button>`).join('')||'<div class="muted" style="padding:15px">NO CURRENT TRACKS</div>';
if(html!==previousList){$('contacts').innerHTML=html;$('contacts').querySelectorAll('button').forEach(b=>b.onclick=()=>{const c=list.find(c=>String(c.id)===b.dataset.id);if(c)designate(c.id);});previousList=html;}
$('log').innerHTML=sim.log.slice(0,4).map(l=>`<div class="log-entry"><time>${clock(l.time)}</time><span>${l.text}</span></div>`).join('');
kirov.updateDisplays?.({ ...p, time:sim.time, night:atmosphere.night, conditions:$('conditions').value, heading:p.heading,speed:p.speed,tracks:list,contacts:list,ammo:p.ammo,radar:p.radar,selected:target,fireControl:sequence });
if(sim.result&&!finished){finished=true;$('debrief').classList.remove('hidden');$('result-title').textContent=sim.result==='victory'?'Mission accomplished.':p.hp<=0?'Ship lost.':'Mission incomplete.';$('result-description').textContent=sim.resultReason||'Sortie concluded.';$('result-stats').innerHTML=[['TIME AT SEA',clock(sim.time)],['SHIP INTEGRITY',`${Math.max(0,p.hp).toFixed(0)}%`],['SURFACE TARGETS',sim.stats.ships],['AIRCRAFT',sim.stats.planes],['MISSILES DEFEATED',sim.stats.munitions],['WEAPONS EXPENDED',sim.stats.launched]].map(([k,val])=>`<div class="stat"><span>${k}</span><b>${val}</b></div>`).join('');}}
function updateModels(dt){const p=sim.player;kirov.group.position.copy(p.pos);const sh=Math.sin(p.heading),ch=Math.cos(p.heading),h=ocean.heightAt(p.pos.x,p.pos.z);const bow=ocean.heightAt(p.pos.x+sh*90,p.pos.z-ch*90),stern=ocean.heightAt(p.pos.x-sh*90,p.pos.z+ch*90),port=ocean.heightAt(p.pos.x-ch*12,p.pos.z-sh*12),starboard=ocean.heightAt(p.pos.x+ch*12,p.pos.z+sh*12);const smooth=1-Math.exp(-Math.max(dt,.001)*1.4);shipPose.heave+=(h-shipPose.heave)*smooth;shipPose.pitch+=(Math.atan2(bow-stern,180)*.75-shipPose.pitch)*smooth;shipPose.roll+=(Math.atan2(starboard-port,24)*.6+(100-p.hp)*.0004-shipPose.roll)*smooth;kirov.group.position.y=shipPose.heave;kirov.group.rotation.set(shipPose.pitch,-p.heading,shipPose.roll);kirov.group.updateMatrixWorld(true);kirov.animate?.(ocean.time,dt,{...p,time:sim.time,tracks:contacts(),fireControl:fireControl.status()});const aimTarget=sim.contacts.find(c=>c.id===selected&&c.alive);if(aimTarget&&['preparing','ready','armed','firing'].includes(fireControl.state.stage)){const direction=aimTarget.pos.clone().sub(p.pos).applyAxisAngle(new THREE.Vector3(0,1,0),p.heading).normalize();kirov.aimWeapons?.(weapon,direction,dt);}
const wakeShips=[{x:p.pos.x,z:p.pos.z,heading:p.heading,halfLength:126,halfBeam:14.25,speed:p.speed}];
for(const c of sim.contacts){if(c.type==='munition')continue;let mesh=entityMeshes.get(c.id);if(!mesh){mesh=c.type==='ship'?buildEnemyShip():buildAircraft();patchSceneFog(mesh);scene.add(mesh);entityMeshes.set(c.id,mesh);}mesh.visible=c.alive;if(!c.alive){if(c.escaped)continue;let wreck=wrecks.get(c.id);if(!wreck){wreck={time:sim.time};wrecks.set(c.id,wreck);}const age=sim.time-wreck.time;if(c.type==='ship'&&age<95){mesh.visible=true;mesh.position.copy(c.pos);mesh.position.y=-Math.max(0,age-10)*.19;mesh.rotation.z=Math.min(1.2,age*.012);mesh.rotation.x=age*.002;if(dt>0&&age<70)fx.fire(c.pos.clone().add(new THREE.Vector3(0,8,0)),2,1);}else if(c.type==='plane'&&age<18){mesh.visible=true;mesh.position.copy(c.pos).addScaledVector(c.vel,age*.5);mesh.position.y-=age*age*4.9;mesh.rotation.z+=dt*1.5;mesh.rotation.x-=dt*.15;if(dt>0)fx.trail(mesh.position,c.vel,1);if(mesh.position.y<0)mesh.visible=false;}continue;}mesh.position.copy(c.pos);if(c.vel?.lengthSq()>1){mesh.rotation.y=Math.atan2(-c.vel.x,-c.vel.z);}if(c.type==='plane'){mesh.rotation.z=c.bank||0;}if(c.type==='ship'){mesh.position.y=ocean.heightAt(c.pos.x,c.pos.z);mesh.rotation.z=Math.sin(ocean.time*.4+c.pos.x)*.009+(c.heel||0);wakeShips.push({x:c.pos.x,z:c.pos.z,heading:-mesh.rotation.y,halfLength:68,halfBeam:7,speed:c.vel?.length()||8});}}
if(p.hp<100&&dt>0){v.copy(p.pos).add(new THREE.Vector3(6,15,18));fx.fire(v,(100-p.hp)/40,.6);}ocean.setShips(wakeShips);if(dt>0){const s=Math.sin(p.heading),c=Math.cos(p.heading);ocean.stamp(p.pos.x-s*125,p.pos.z+c*125,p.pos.x-s*150,p.pos.z+c*150,12,.5,.25);}
for(const m of sim.missiles){let mesh=missileMeshes.get(m.id);if(!m.alive){if(mesh){scene.remove(mesh);missileMeshes.delete(m.id);}continue;}if(!mesh){mesh=buildMissile(m.kind);patchSceneFog(mesh);scene.add(mesh);missileMeshes.set(m.id,mesh);}if(m.prev)mesh.position.lerpVectors(m.prev,m.pos,Math.min(1,sim.alpha));else mesh.position.copy(m.pos);if(m.vel.lengthSq()>1){v.copy(m.vel).normalize();mesh.quaternion.setFromUnitVectors(forward,v);}mesh.scale.setScalar(Math.max(1,Math.min(4,camera.position.distanceTo(m.pos)/2000)));if(dt>0&&m.motor!==false)fx.motorPlume(mesh.position,m.vel,ANTI_SHIP.has(m.kind)?2:1,m.kind==='fort'?35:0);}
for(let i=streaks.length-1;i>=0;i--){streaks[i].age+=dt;if(streaks[i].age>.1){scene.remove(streaks[i].mesh);streaks[i].mesh.geometry.dispose();streaks[i].mesh.material.dispose();streaks.splice(i,1);}}}
function disposeMesh(mesh){mesh.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}
// The bridge interior (instruments, crew, inner walls: 200k to 280k triangles) is only drawn on the
// bridge or close enough to see in through the windows; its outer skin, glass and wipers always draw.
// Layers, not `visible`, so the bridge module's own visibility switches are left alone.
const BRIDGE_SHELL=/^bridge:(hull|glass|wipers)/,bridgeInterior=[],bridgeWorld=new THREE.Vector3();let bridgeInteriorShown=true;
kirov.bridge?.traverse(o=>{if(o.isMesh&&!BRIDGE_SHELL.test(o.name)){o.userData.bridgeMask=o.layers.mask;bridgeInterior.push(o);}});
function cullBridge(){if(!kirov.bridge)return;kirov.bridge.getWorldPosition(bridgeWorld);const show=view==='bridge'||camera.position.distanceTo(bridgeWorld)<140;if(show===bridgeInteriorShown)return;bridgeInteriorShown=show;for(const o of bridgeInterior)o.layers.mask=show?o.userData.bridgeMask:0;}
function updateCamera(rawDt){const p=sim.player;if(view==='external'){followExternal(p,rawDt);if(!started){controls.autoRotate=true;controls.autoRotateSpeed=.22;}else controls.autoRotate=false;controls.update();}else if(view==='bridge'){const lean=THREE.MathUtils.smoothstep(-bridgePitch,.12,.55)*Math.max(0,Math.cos(bridgeYaw))*(kirov.bridge?.userData?.lean??2);camera.position.copy(kirov.bridgeEye);camera.position.z-=lean;camera.position.y-=lean*.05;kirov.group.localToWorld(camera.position);look.set(Math.sin(bridgeYaw)*Math.cos(bridgePitch),Math.sin(bridgePitch),-Math.cos(bridgeYaw)*Math.cos(bridgePitch));look.applyQuaternion(kirov.group.quaternion).add(camera.position);camera.up.set(0,1,0).applyQuaternion(kirov.group.quaternion);camera.lookAt(look);}else if(view==='weapon'){const shot=kirov.inspectView?.(weapon,fireControl.state,rawDt,weaponCameraSnap);if(shot){look.copy(shot.target);kirov.group.localToWorld(look);v2.copy(shot.eye);kirov.group.localToWorld(v2);camera.position.copy(v2);weaponCameraSnap=false;}else{const points=kirov.launchPoints[weapon]||kirov.launchPoints[ANTI];const anchor=points[(WEAPONS[weapon].ammo-p.ammo[weapon])%points.length];look.copy(anchor).add(new THREE.Vector3(0,2,0));kirov.group.localToWorld(look);v2.copy(anchor).add(new THREE.Vector3(anchor.x<0?-18:18,14,20));kirov.group.localToWorld(v2);if(weaponCameraSnap){camera.position.copy(v2);weaponCameraSnap=false;}else camera.position.lerp(v2,Math.min(1,rawDt*7));}camera.up.set(0,1,0);camera.lookAt(look);}else if(!follow.update(rawDt,sim.alpha)&&!follow.mode&&view==='missile'){camera.position.copy(p.pos).add(new THREE.Vector3(250,150,300));camera.lookAt(p.pos);}if(view!=='bridge')camera.up.set(0,1,0);lastPlayer.copy(p.pos);cullBridge();}
function updateLabels(){for(const el of trackLabels.values())el.style.display='none';if(!started)return;for(const c of contacts()){let el=trackLabels.get(c.id);if(!el){el=document.createElement('div');el.className='track-label';$('labels').append(el);trackLabels.set(c.id,el);}v.copy(c.pos);v.y+=c.type==='ship'?30:12;v.project(camera);if(v.z>1||v.z<0||Math.abs(v.x)>1||Math.abs(v.y)>1)continue;el.style.display='block';el.style.left=`${(v.x*.5+.5)*viewWidth}px`;el.style.top=`${(-v.y*.5+.5)*viewHeight}px`;el.classList.toggle('selected',c.id===selected);el.innerHTML=`<i></i>${c.name}<small>${(c.pos.distanceTo(sim.player.pos)/1000).toFixed(1)} KM</small>`;}}
function frame(now){const raw=Math.min(.05,Math.max(0,(now-lastFrame)/1000));lastFrame=now;const dt=started&&!sim.paused&&!sim.result?raw*timeScale:0;fx.dt=Math.min(dt,.1);fx._cam.copy(camera.position);if(dt){sim.update(dt);fireControl.update(dt);}cues.update(raw,fireControl.state,{view,slot:cueSlot(),paused:!started||sim.paused});globalUniforms.uTime.value+=raw;globalUniforms.uCloudOffset.value.x+=raw*.0003;updateModels(dt||(!started?raw:0));updateCamera(raw);ocean.update(dt||(!started?raw:0),camera,{amp:seaAmplitude,whitecap:seaAmplitude*.3,pixelAngle:camera.fov*Math.PI/180/viewHeight,foam:dt>0||!started});const lightEnv={sunDir:atmosphere.lightDir,sunColor:sun.color,sunIntensity:sun.intensity,ambient:new THREE.Color(.28,.34,.4)};clouds.update(raw,camera,{...lightEnv,cover:weatherCover});atmosphere.sky.position.copy(camera.position);atmosphere.update(sim.player.pos,now/1000);fx.update(dt,camera,lightEnv);post.update(now/1000,raw,sunDirection,sun.color,atmosphere.elevation);audio.update(raw,{position:camera.position,forward:camera.getWorldDirection(new THREE.Vector3()),speed:sim.player.speed,heading:sim.player.heading});uiAge+=raw;if(uiAge>.2){uiAge=0;updateUI();}drawRadar();updateLabels();post.render(raw);raf=requestAnimationFrame(frame);}
function resizeView(){viewWidth=Math.max(1,viewport.clientWidth);viewHeight=Math.max(1,viewport.clientHeight);camera.aspect=viewWidth/viewHeight;camera.updateProjectionMatrix();renderer.setSize(viewWidth,viewHeight,false);post.setSize(viewWidth,viewHeight,Math.min(renderer.getPixelRatio(),[.65,.8,1][quality]));const size=Math.max(1,radar.clientWidth),dpr=Math.min(devicePixelRatio,2);radar.width=radar.height=Math.round(size*dpr);ctx.setTransform(radar.width/520,0,0,radar.height/520,0,0);}
new ResizeObserver(resizeView).observe(viewport);
new ResizeObserver(resizeView).observe($('tactical'));
window.addEventListener('resize',resizeView);
resizeView();
await loading('Compiling shaders',.86);
try{setView('external');await renderer.compileAsync(scene,camera);}catch(e){console.warn('shader precompile skipped',e);}
await loading('Taking command',.98);
startMission();window.__orlanBoot?.done();
window.__orlan={cues,follow,followNewest,followIncoming,get range(){return range;},sim,fireControl,scene,camera,renderer,ocean,kirov,post,fx,audio,setView,stop(){cancelAnimationFrame(raf);},setTimeScale(n){timeScale=n;},fire,designate,get view(){return view;},get timeScale(){return timeScale;},get weapon(){return weapon;},setWeapon(k){kirov.safeWeapon?.(weapon);weapon=k;fireControl.setWeapon(k);fireControl.designate(selected);document.querySelectorAll('[data-weapon]').forEach(x=>x.classList.toggle('active',x.dataset.weapon===k));fitRadar();},step(dt){fx.dt=Math.min(dt,.1);fx._cam.copy(camera.position);sim.update(dt);fireControl.update(dt);updateModels(dt);fx.update(dt,camera,{sunDir:atmosphere.lightDir,sunColor:sun.color,sunIntensity:sun.intensity,ambient:new THREE.Color(.28,.34,.4)});updateUI();},render(){updateModels(0);drawRadar();updateCamera(.05);atmosphere.sky.position.copy(camera.position);atmosphere.update(sim.player.pos,sim.time);const lightEnv={sunDir:atmosphere.lightDir,sunColor:sun.color,sunIntensity:sun.intensity,ambient:new THREE.Color(.28,.34,.4)};clouds.update(.016,camera,{...lightEnv,cover:weatherCover});fx.update(0,camera,lightEnv);post.update(sim.time,.016,sunDirection,sun.color,atmosphere.elevation);post.render(.016);}};
raf=requestAnimationFrame(frame);
