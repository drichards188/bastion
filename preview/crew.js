// Crew preview: every outfit, every pose, a close-up at bridge distance and a mock bridge with the
// controls the figures hold. URL: ?view=lineup|poses|close|bridge &outfit=<NAVAL_OUTFITS key>
// &pose=<CREW_POSES name> &light=day|bridge|studio &t=<seconds, freezes time> &shot=1 (hide the UI)
// &cam=x,y,z,tx,ty,tz (camera and target).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { patchSceneFog, globalUniforms } from '../src/shaderlib.js';
import { Atmosphere } from '../src/atmosphere.js';
import { PostFX } from '../src/post.js';
import { buildNavalCrewman, NAVAL_OUTFITS, CREW_POSES, CREW_ROLES, crewTriangles } from '../src/models/kirov-crew.js';

const q = new URLSearchParams(location.search);
if (q.get('shot') === '1') document.body.classList.add('shot');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x9aa7ad, 0.004);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const lights = new THREE.Group();
scene.add(lights);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x7b8285, roughness: 0.92 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat);
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

// light=game: the game's own sky, sun, fog and post-processing, set up as main.js does (&el= &az= move the sun)
let atmosphere = null, post = null;
function gameLight() {
  atmosphere = new Atmosphere(renderer, scene);
  atmosphere.setShadowQuality(2048, 12);
  atmosphere.set(Number(q.get('el') ?? 14), Number(q.get('az') ?? 250));
  scene.fog.density = 0.000022;
  lights.add(new THREE.HemisphereLight(0xa5bfcc, 0x273d43, 0.22));
  globalUniforms.uSunDirW.value.copy(atmosphere.lightDir); globalUniforms.uSunColorN.value.copy(atmosphere.sun.color);
  globalUniforms.uCloudCoverage.value = 0.55; globalUniforms.uCloudShadow.value = 0.25; globalUniforms.fogHeightFalloff.value = 0.001;
  floorMat.color.setHex(0x6f777a);
  post = new PostFX(renderer, scene, camera); post.setGrade('Natural');
  post.exposure.params.key = 0.18; post.exposure.params.min = 0.18; post.exposure.params.max = 1.8; post.bloom.strength = 0.23;
  post.grade.uniforms.uVignette.value = 0.25; post.grade.uniforms.uGrain.value = 0.018; post.lens.uniforms.uFlare.value = 0.12;
  post.setSize(innerWidth, innerHeight, Math.min(renderer.getPixelRatio(), 1));
}

function setLight(mode) {
  if (mode === 'game') { if (!atmosphere) gameLight(); return; }
  lights.clear();
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 40 });
  if (mode === 'bridge') {
    // the bridge: cool daylight through the forward windows, warm fittings overhead, a brown deck
    scene.background = new THREE.Color(0x3a4a46);
    floorMat.color.setHex(0x5a2f24);
    lights.add(new THREE.HemisphereLight(0xa5bfcc, 0x3b2a22, 0.6));
    sun.color.setHex(0xdfe8ee); sun.intensity = 2.2; sun.position.set(-2, 6, -9);
    for (const x of [-2.5, 0, 2.5]) { const p = new THREE.PointLight(0xffdab0, 6, 9, 2); p.position.set(x, 2.6, 0.5); lights.add(p); }
  } else if (mode === 'studio') {
    scene.background = new THREE.Color(0x8d969a);
    floorMat.color.setHex(0x9aa1a3);
    lights.add(new THREE.HemisphereLight(0xffffff, 0x666f70, 1.6));
    sun.intensity = 2.6; sun.position.set(-3, 6, -5);
  } else {
    // overcast North Atlantic deck: the game's hemisphere colours, a soft high sun
    scene.background = new THREE.Color(0x9aa7ad);
    floorMat.color.setHex(0x6f777a);
    lights.add(new THREE.HemisphereLight(0xa5bfcc, 0x273d43, 1.1));
    sun.color.setHex(0xfff0dc); sun.intensity = 2.4; sun.position.set(-4, 7, -5);
  }
  lights.add(sun, sun.target);
}

// ---------------------------------------------------------------- props the figures hold
const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde0, metalness: 0.9, roughness: 0.25 });
const grey = new THREE.MeshStandardMaterial({ color: 0x8a9196, roughness: 0.6 });
const green = new THREE.MeshStandardMaterial({ color: 0x6f8a78, roughness: 0.7 });
const wood = new THREE.MeshStandardMaterial({ color: 0x9b7650, roughness: 0.7 });
const paper = new THREE.MeshStandardMaterial({ color: 0xe4e0cf, roughness: 0.9 });
const screen = new THREE.MeshBasicMaterial({ color: 0x2e6b48 });
function mesh(geo, mat, x, y, z, parent) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; }

// the helm: a curved grey housing with two vertical chrome grips; returns the grip anchors
function helmProp(parent) {
  const g = new THREE.Group(); parent.add(g);
  mesh(new THREE.BoxGeometry(0.7, 0.98, 0.42), grey, 0, 0.49, -0.62, g);
  const grips = [];
  for (const s of [-1, 1]) {
    const post = new THREE.Group(); post.position.set(s * 0.22, 0.98, -0.42); g.add(post);
    mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 10), chrome, 0, 0.025, 0, post);
    mesh(new THREE.CylinderGeometry(0.019, 0.017, 0.12, 14), chrome, 0, 0.11, 0, post);
    mesh(new THREE.SphereGeometry(0.021, 12, 8), chrome, 0, 0.175, 0, post);
    const a = new THREE.Object3D(); a.position.set(0, 0.1, 0); post.add(a); grips.push(a);
    post.userData.s = s;
  }
  mesh(new THREE.BoxGeometry(0.66, 0.06, 0.12), grey, 0, 0.95, -0.42, g);
  return { group: g, grips };
}
// the engine telegraph: a pedestal with a lever that swings fore and aft; returns the knob anchor
function telegraphProp(parent) {
  const g = new THREE.Group(); parent.add(g);
  mesh(new THREE.BoxGeometry(0.34, 1.0, 0.34), grey, 0.12, 0.5, -0.42, g);
  mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 24), paper, 0.12, 1.12, -0.42, g).rotation.z = Math.PI / 2;
  const pivot = new THREE.Group(); pivot.position.set(0.21, 1.12, -0.42); g.add(pivot);
  mesh(new THREE.BoxGeometry(0.02, 0.2, 0.03), chrome, 0, 0.1, 0, pivot);
  const knob = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 12), chrome, 0.03, 0.2, 0, pivot); knob.rotation.z = Math.PI / 2;
  const a = new THREE.Object3D(); a.position.set(0.045, 0.2, 0); pivot.add(a);
  return { group: g, pivot, knob: a };
}
function chartProp(parent) {
  const g = new THREE.Group(); parent.add(g);
  mesh(new THREE.BoxGeometry(1.1, 0.9, 0.7), wood, 0, 0.45, -0.62, g);
  mesh(new THREE.BoxGeometry(0.9, 0.004, 0.55), paper, 0, 0.902, -0.6, g);
  return g;
}
function consoleProp(parent, h = 0.98) {
  const g = new THREE.Group(); parent.add(g);
  mesh(new THREE.BoxGeometry(0.9, h, 0.5), green, 0, h / 2, -0.62, g);
  const head = mesh(new THREE.BoxGeometry(0.9, 0.55, 0.3), green, 0, h + 0.35, -0.75, g); head.rotation.x = 0.25;
  mesh(new THREE.PlaneGeometry(0.4, 0.3), screen, 0, h + 0.37, -0.592, g).rotation.x = 0.25;
  return g;
}

// ---------------------------------------------------------------- views
const crew = [], extra = [];
const labels = document.getElementById('labels');
const ROLE_FOR = { officer: 'officer', officerJunior: 'navigator', watchOfficer: 'watchOfficer', rating: 'sailor', ratingPilotka: 'telegraph', talker: 'talker', flannel: 'sailor', bushlat: 'signalman', lookout: 'lookout', deckhand: 'deckhand', deckhandCap: 'deckhand' };
const content = new THREE.Group(); scene.add(content);
let tick = null;

function add(fig, x, z, ry = 0, label = '') {
  fig.root.position.set(x, 0, z); fig.root.rotation.y = ry;
  content.add(fig.root); crew.push({ fig, label });
  return fig;
}

function clear() {
  for (const c of crew) c.fig.dispose();
  crew.length = 0; extra.length = 0; content.clear(); tick = null;
}

function build(view, outfit, pose) {
  clear();
  if (view === 'lineup') {
    const keys = Object.keys(NAVAL_OUTFITS);
    keys.forEach((k, i) => {
      const fig = buildNavalCrewman({ role: ROLE_FOR[k], outfit: k, seed: i + 2, pose: pose || 'stand', height: 1.78 });
      add(fig, (i - (keys.length - 1) / 2) * 0.82, 0, 0, `${k} · ${crewTriangles(fig.outfit)} tris`);
    });
    frame([0.2, 1.55, -9.2], [0.2, 1.0, 0]);
  } else if (view === 'poses') {
    const cols = 6;
    CREW_POSES.forEach((p, i) => {
      const x = ((i % cols) - (cols - 1) / 2) * 1.35, z = Math.floor(i / cols) * 2.0;
      const role = p === 'binoculars' ? 'lookout' : p === 'headset' ? 'talker' : 'sailor';
      const o = outfit || (p === 'binoculars' ? 'lookout' : p === 'headset' || p === 'phone' ? 'talker' : p === 'salute' || p === 'atEase' || p === 'chart' ? 'officer' : 'rating');
      const fig = add(buildNavalCrewman({ role, outfit: o, seed: i + 5, pose: p, height: 1.78 }), x, z, 0, p);
      const g = new THREE.Group(); g.position.set(x, 0, z); content.add(g);
      if (p === 'helm') { const h = helmProp(g); fig.hold('L', h.grips[0], { style: 'post', fade: 0 }); fig.hold('R', h.grips[1], { style: 'post', fade: 0 }); }
      if (p === 'telegraph') { const t = telegraphProp(g); fig.hold('R', t.knob, { style: 'knob', fade: 0 }); extra.push(t); }
      if (p === 'chart') chartProp(g);
      if (p === 'sit') mesh(new THREE.BoxGeometry(0.4, 0.46, 0.4), wood, 0, 0.23, 0.05, g);
      if (p === 'console' || p === 'operate') consoleProp(g, p === 'operate' ? 1.06 : 0.98);
    });
    frame([0, 2.4, -8.5], [0, 1.0, 1.2]);
  } else if (view === 'one') {
    // one pose, its prop, a three-quarter view at bridge distance
    const p = pose || 'stand';
    const o = outfit || (p === 'binoculars' ? 'lookout' : p === 'headset' || p === 'phone' ? 'talker' : p === 'salute' || p === 'atEase' || p === 'chart' ? 'officer' : 'rating');
    const fig = add(buildNavalCrewman({ outfit: o, seed: 5, pose: p, height: 1.78 }), 0, 0, 0, `${p} · ${o}`);
    if (p === 'helm') { const h = helmProp(content); fig.hold('L', h.grips[0], { style: 'post', fade: 0 }); fig.hold('R', h.grips[1], { style: 'post', fade: 0 }); }
    if (p === 'telegraph') { const t = telegraphProp(content); fig.hold('R', t.knob, { style: 'knob', fade: 0 }); extra.push(t); }
    if (p === 'chart') chartProp(content);
    if (p === 'console' || p === 'operate') consoleProp(content, p === 'operate' ? 1.06 : 0.98);
    if (p === 'sit') mesh(new THREE.BoxGeometry(0.4, 0.46, 0.4), wood, 0, 0.23, 0.05, content);
    frame([1.7, 1.55, -2.4], [0, 1.0, 0]);
  } else if (view === 'close') {
    const set = q.get('outfits')?.split(',') || (outfit ? [outfit] : ['officer', 'rating', 'lookout', 'talker', 'watchOfficer']);
    const seeds = q.get('seeds')?.split(',').map(Number);
    set.forEach((k, i) => add(buildNavalCrewman({ role: ROLE_FOR[k], outfit: k, seed: seeds?.[i] ?? i * 3 + 1, pose: pose || 'stand', height: 1.78, moustache: q.has('moustache') ? i % 2 === 1 : undefined }), (i - (set.length - 1) / 2) * 0.62, 0, 0, k));
    frame([0.0, 1.62, -2.6], [0, 1.52, 0]);
  } else {
    // a mock bridge: the stations the bridge module places
    const h = helmProp(content);
    const helm = add(buildNavalCrewman({ role: 'helmsman', seed: 4 }), 0, 0, 0, 'helmsman');
    helm.hold('L', h.grips[0], { style: 'post', fade: 0 }); helm.hold('R', h.grips[1], { style: 'post', fade: 0 });
    const tg = new THREE.Group(); tg.position.set(1.4, 0, 0.1); content.add(tg);
    const t = telegraphProp(tg); extra.push(t);
    const tel = add(buildNavalCrewman({ role: 'telegraph', seed: 8 }), 1.4, 0.1, 0, 'telegraph');
    tel.hold('R', t.knob, { style: 'knob', fade: 0 });
    const ch = new THREE.Group(); ch.position.set(-2.0, 0, 0.3); content.add(ch); chartProp(ch);
    add(buildNavalCrewman({ role: 'navigator', seed: 12 }), -2.0, 0.3, 0, 'navigator');
    add(buildNavalCrewman({ role: 'watchOfficer', seed: 3 }), 2.9, -0.4, -0.3, 'watch officer');
    add(buildNavalCrewman({ role: 'officer', seed: 9 }), -0.6, 1.4, 0.2, 'commander');
    add(buildNavalCrewman({ role: 'talker', seed: 21 }), 0.8, 1.6, 0.4, 'talker');
    const co = new THREE.Group(); co.position.set(-3.4, 0, 0.2); content.add(co); consoleProp(co);
    add(buildNavalCrewman({ role: 'sailor', seed: 17 }), -3.4, 0.2, 0, 'radar operator');
    frame([1.6, 1.7, 3.8], [-0.2, 1.1, -0.4]);
  }
  if (outfit && view !== 'close' && view !== 'poses') for (const c of crew) { /* outfit filter only applies to the pose and close views */ }
  info.textContent = `${crew.length} figures · ${renderer.info.render.calls} calls`;
}

function frame(pos, target) {
  const c = q.get('cam')?.split(',').map(Number);
  if (c && c.length === 6) { camera.position.set(c[0], c[1], c[2]); controls.target.set(c[3], c[4], c[5]); }
  else { camera.position.set(...pos); controls.target.set(...target); }
  controls.update();
}

// ---------------------------------------------------------------- UI and loop
const viewSel = document.getElementById('view'), outfitSel = document.getElementById('outfit'), poseSel = document.getElementById('pose'), lightSel = document.getElementById('light');
const info = document.getElementById('info'), play = document.getElementById('play');
outfitSel.add(new Option('(by role)', ''));
for (const k of Object.keys(NAVAL_OUTFITS)) outfitSel.add(new Option(k, k));
for (const p of CREW_POSES) poseSel.add(new Option(p, p));
viewSel.value = q.get('view') || 'lineup';
outfitSel.value = q.get('outfit') || '';
poseSel.value = q.get('pose') || '';
lightSel.value = q.get('light') || 'day';
const rebuild = () => build(viewSel.value, outfitSel.value, poseSel.value);
viewSel.onchange = outfitSel.onchange = poseSel.onchange = rebuild;
lightSel.onchange = () => setLight(lightSel.value);
let playing = !q.has('t');
play.textContent = playing ? 'Pause' : 'Play';
play.onclick = () => { playing = !playing; play.textContent = playing ? 'Pause' : 'Play'; };
setLight(lightSel.value);
rebuild();
patchSceneFog(scene);

let time = 0, last = performance.now();
const tmp = new THREE.Vector3();
function step(dt) {
  time += dt;
  for (const t of extra) if (t.pivot) t.pivot.rotation.x = Math.sin(time * 0.6) * 0.7;
  for (const c of crew) c.fig.update(dt);
}
function render() {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (playing) step(dt);
  controls.update();
  if (post) {
    atmosphere.sky.position.copy(camera.position); atmosphere.update(camera.position, time);
    post.update(time, dt, atmosphere.sunDir, atmosphere.sun.color, atmosphere.elevation); post.render(dt);
  } else renderer.render(scene, camera);
  // labels under the feet
  while (labels.children.length < crew.length) labels.appendChild(document.createElement('span'));
  for (let i = 0; i < labels.children.length; i++) {
    const el = labels.children[i], c = crew[i];
    if (!c || !c.label || q.get('labels') === '0') { el.style.display = 'none'; continue; }
    c.fig.root.getWorldPosition(tmp); tmp.y -= 0.05; tmp.project(camera);
    el.style.display = tmp.z < 1 ? '' : 'none';
    el.style.left = `${(tmp.x * 0.5 + 0.5) * innerWidth}px`; el.style.top = `${(-tmp.y * 0.5 + 0.5) * innerHeight}px`;
    el.textContent = c.label;
  }
  requestAnimationFrame(render);
}
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
// a fixed time for screenshots: run the figures to that time in small steps (cross-fades and holds settle)
if (q.has('t')) { const T = Number(q.get('t')) || 0; for (let s = 0; s < T; s += 1 / 30) step(1 / 30); }
render();
window.__crew = {
  scene, camera, renderer, crew, step, rebuild, setLight,
  set(view, outfit = '', pose = '') { viewSel.value = view; outfitSel.value = outfit; poseSel.value = pose; rebuild(); },
  ready: true,
};
