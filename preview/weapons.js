import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildWeapons } from '../src/models/kirov-weapons.js';
import { MOUNTS, deckHeightAt, buildExterior } from '../src/models/kirov-exterior.js';
import { FX } from '../src/fx.js';
import { WEAPONS } from '../src/sim.js';

// The weapons alone on stand-in deck pieces at their MOUNTS heights, stepped through the fire-control
// sequence by hand or by URL (?weapon=fort&stage=armed&t=4&view=inspect&clean=1). Launches use a small
// stand-in flight model (cold eject and ignition for Fort, booster climb for Granit, rail launch for
// Osa) with the game's own effects. window.__preview drives it from tests and screenshots.

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
if (params.get('clean')) document.body.classList.add('clean');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb2b8);
scene.fog = new THREE.Fog(0x9fb2b8, 250, 2200);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 5000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const sunDir = new THREE.Vector3(-0.45, 0.62, -0.64).normalize();
const sun = new THREE.DirectionalLight(0xfff1dd, 3.2);
sun.position.copy(sunDir).multiplyScalar(200);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 500 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xc2d6df, 0x4b5552, 1.15));

// the sea, far below
const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x29454c, roughness: 0.35, metalness: 0.1 }));
sea.rotation.x = -Math.PI / 2;
scene.add(sea);

// ---------------------------------------------------------------- stand-in decks

const deckMat = new THREE.MeshStandardMaterial({ color: 0x6b4a3f, roughness: 0.95 });
const wallMat = new THREE.MeshStandardMaterial({ color: 0x7d8c90, roughness: 0.85, metalness: 0.1 });
const decks = new THREE.Group();
decks.name = 'stand-in decks';
scene.add(decks);
// ?ship=1 puts the real exterior (without its interim weapons) under them instead
const ship = params.get('ship') ? buildExterior({ weapons: false }) : null;
if (ship) { scene.add(ship.group); ship.group.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); }
if (!ship) {
  // the main deck, following the sheer, with a plain hull side under it
  const N = 120, pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const z = -118 + (i / N) * 236, y = deckHeightAt(z), b = 13.8 * Math.min(1, 0.35 + (z + 118) / 45);
    pos.push(-b, y, z, b, y, z);
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const deck = new THREE.Mesh(g, deckMat);
  deck.receiveShadow = true;
  decks.add(deck);
}
const block = (x, z, w, d, top, round = false) => {
  const base = deckHeightAt(z) - 0.05, h = top - base;
  if (h <= 0.05) return;
  const geo = round ? new THREE.CylinderGeometry(w / 2, w / 2, h, 32) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, wallMat);
  m.position.set(x, base + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  decks.add(m);
  const capGeo = round ? new THREE.CircleGeometry(w / 2, 32) : new THREE.PlaneGeometry(w, d);
  const cap = new THREE.Mesh(capGeo, deckMat);
  cap.rotation.x = -Math.PI / 2;
  cap.position.set(x, top + 0.002, z);
  cap.receiveShadow = true;
  decks.add(cap);
};
if (!ship) for (const g of MOUNTS.ak630) block(g.x, g.z, 3.2, 4.2, g.y);
if (!ship) {
  for (const o of MOUNTS.osa) block(o.x, o.z, (o.tubRadius ?? 2.4) * 2, 0, o.y, true);
  for (const a of MOUNTS.ak100) block(a.x, a.z, 6.2, 0, a.y, true);
  for (const d of MOUNTS.directors.fort) block(d.x, d.z, 5.5, 5.5, d.y);
  for (const d of MOUNTS.directors.osa) block(d.x, d.z, 2.4, 2.4, d.y);
  for (const d of MOUNTS.directors.ak100) block(d.x, d.z, 2.8, 2.8, d.y);
}

// ---------------------------------------------------------------- the weapons

const weapons = buildWeapons();
scene.add(weapons.group);
weapons.group.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
weapons.cutouts.apply(ship ? ship.group : decks);
const fx = new FX(scene, { maxSmoke: 2400, maxGlow: 1400, maxDebris: 120, maxShards: 120, maxBrass: 200, lights: 4 });
fx.ground = () => 0;
fx.budget = 0.8;
weapons.attachFx(fx);

// targets: a frigate for Granit, an aircraft for the SAMs and guns
const tracks = [
  { id: 'ship', type: 'ship', alive: true, pos: new THREE.Vector3(9000, 0, -26000) },
  { id: 'air', type: 'plane', alive: true, pos: new THREE.Vector3(6200, 1400, -6800) },
  { id: 'close', type: 'munition', alive: false, pos: new THREE.Vector3(1600, 18, -1500) },
];
const fc = { weapon: params.get('weapon') || 'granit', stage: 'idle', stepIndex: -1, salvo: Number(params.get('salvo') || 2), remaining: 2, fired: 0, targetId: null, progress: 0 };
const ammo = { granit: 20, fort: 96, osa: 40, gun: 16000 };
const state = { pos: new THREE.Vector3(), heading: 0, autoDefense: params.get('auto') === '1', radar: true, ammo, tracks, fireControl: fc };
const STEPS = { granit: 3, fort: 3, osa: 3 };

// ---------------------------------------------------------------- stand-in flights

const flights = [];
let nextId = 1, simTime = 0;
function launch(kind) {
  const slot = WEAPONS[kind].ammo - ammo[kind];
  if (slot >= WEAPONS[kind].ammo) return null;
  const target = tracks.find((t) => t.id === (kind === 'granit' ? 'ship' : 'air'));
  const dirT = target.pos.clone().normalize();
  const f = weapons.launchFrame(kind, slot, dirT);
  const m = { id: `m${nextId++}`, kind, slot, pos: f.pos.clone(), fwd: f.dir.clone().normalize(), speed: f.speed, vel: new THREE.Vector3(), age: 0, alive: true, motor: kind !== 'fort', targetId: target.id };
  m.vel.copy(m.fwd).multiplyScalar(m.speed);
  ammo[kind]--;
  weapons.animateLaunch(kind, slot, m);
  if (kind === 'fort') weapons.coldLaunch(m);
  const mesh = weapons.buildMissile(kind);
  scene.add(mesh);
  flights.push({ m, mesh, target });
  return m;
}
const _axis = new THREE.Vector3(), _aim = new THREE.Vector3();
function turn(f, d, rate, dt) {
  const a = Math.acos(Math.max(-1, Math.min(1, f.dot(d))));
  if (a < 1e-6) return;
  _axis.crossVectors(f, d);
  if (_axis.lengthSq() < 1e-9) _axis.set(1, 0, 0);
  f.applyAxisAngle(_axis.normalize(), Math.min(a, rate * dt)).normalize();
}
function fly(dt) {
  for (let i = flights.length - 1; i >= 0; i--) {
    const { m, mesh, target } = flights[i];
    m.age += dt;
    if (m.kind === 'fort' && m.age < 0.9) m.speed = Math.max(12, m.speed - 9.81 * dt);
    else {
      if (!m.motor) { m.motor = true; weapons.ignite(m); }
      const top = m.kind === 'fort' ? 1700 : m.kind === 'granit' ? 550 : 500;
      m.speed = Math.min(top, m.speed + (m.kind === 'fort' ? 420 : 140) * dt);
      _aim.copy(target.pos).sub(m.pos).normalize();
      if (m.kind === 'granit') _aim.y = Math.max(-0.05, Math.min(0.05, (60 - m.pos.y) / 400));
      turn(m.fwd, _aim.normalize(), m.kind === 'granit' ? 0.32 : m.kind === 'fort' ? 1.3 : 1.8, dt);
    }
    m.vel.copy(m.fwd).multiplyScalar(m.speed);
    m.pos.addScaledVector(m.vel, dt);
    mesh.position.copy(m.pos);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), m.fwd);
    if (m.motor && dt > 0) fx.motorPlume(m.pos, m.vel, m.kind === 'granit' ? 2 : 1, m.kind === 'fort' ? 35 : 0);
    if (m.age > 12) { m.alive = false; scene.remove(mesh); flights.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- sequence

let salvoTimer = 0;
function setStage(stage, step = -1) {
  fc.stage = stage;
  fc.stepIndex = step;
  fc.targetId = stage === 'idle' ? null : fc.weapon === 'granit' ? 'ship' : 'air';
  if (stage === 'firing') { fc.remaining = fc.salvo; fc.fired = 0; salvoTimer = 0; }
  if (stage !== 'firing') fc.remaining = fc.salvo;
  refresh();
}
function stepSequence(dt) {
  if (fc.stage !== 'firing') return;
  salvoTimer -= dt;
  if (salvoTimer <= 0 && fc.remaining > 0) {
    launch(fc.weapon);
    fc.remaining--; fc.fired++;
    salvoTimer = WEAPONS[fc.weapon].interval;
    if (!fc.remaining) fc.stage = 'complete';
  }
}

// ---------------------------------------------------------------- views

let view = params.get('view') || 'overview';
// camera presets framed on the MOUNTS table, so they follow the layout
const at = (m, dx, dy, dz, ty = 0) => [V(m.x + dx, m.y + dy, m.z + dz), V(m.x, m.y + ty, m.z)];
const mid = (list) => list.reduce((a, m) => ({ x: a.x + m.x / list.length, y: a.y + m.y / list.length, z: a.z + m.z / list.length }), { x: 0, y: 0, z: 0 });
const VIEWS = {
  overview: at(mid(MOUNTS.granit), 36, 26, -60, 0),
  granit: at(mid(MOUNTS.granit), 16, 5, -18, 0.5),
  fort: at(mid(MOUNTS.fort), 13, 4, -15, 0.5),
  osa: at(MOUNTS.osa[1], 9, 5, -12, 2),
  ak630: at(MOUNTS.ak630[2], 7, 3, -8, 0.8),
  ak100: at(mid(MOUNTS.ak100), 16, 7, 22, 0),
  directors: at(MOUNTS.directors.fort[0], -22, 8, -22, 2),
  aft: at(MOUNTS.directors.fort[MOUNTS.directors.fort.length - 1], -24, 8, 18, 2),
  bow: at(MOUNTS.metel, 14, 6, -16, 1),
};
function V(x, y, z) { return new THREE.Vector3(x, y, z); }
function setView(v) {
  view = v;
  const p = VIEWS[v];
  if (p) { camera.position.copy(p[0]); controls.target.copy(p[1]); }
  refresh();
}

// ---------------------------------------------------------------- UI

const ui = (id, items, on, fn) => {
  const el = document.getElementById(id);
  el.innerHTML = '';
  for (const [k, label] of items) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = on(k) ? 'on' : '';
    b.onclick = () => fn(k);
    el.appendChild(b);
  }
};
function refresh() {
  ui('weapons', [['granit', 'GRANIT'], ['fort', 'FORT'], ['osa', 'OSA']], (k) => fc.weapon === k, (k) => { fc.weapon = k; setStage('idle'); });
  const steps = [['idle', 'SAFE'], ['tracking', 'ACQUIRE'], ['tracked', 'TRACKED']];
  for (let i = 0; i < STEPS[fc.weapon]; i++) steps.push([`preparing:${i}`, `PREP ${i + 1}`]);
  steps.push(['ready', 'READY'], ['armed', 'ARM'], ['firing', 'FIRE'], ['aborted', 'ABORT']);
  ui('stages', steps, (k) => k === (fc.stage === 'preparing' ? `preparing:${fc.stepIndex}` : fc.stage), (k) => { const [s, i] = k.split(':'); setStage(s, i === undefined ? -1 : Number(i)); });
  ui('views', [...Object.keys(VIEWS).map((k) => [k, k]), ['inspect', 'inspect']], (k) => view === k, setView);
  ui('posture', [['auto', state.autoDefense ? 'AUTO DEFENSE ON' : 'AUTO DEFENSE OFF'], ['threat', tracks[2].alive ? 'CLOSE THREAT ON' : 'CLOSE THREAT OFF'], ['burst', 'CIWS BURST']], (k) => (k === 'auto' && state.autoDefense) || (k === 'threat' && tracks[2].alive), (k) => {
    if (k === 'auto') state.autoDefense = !state.autoDefense;
    if (k === 'threat') tracks[2].alive = !tracks[2].alive;
    if (k === 'burst') burst();
    refresh();
  });
  const g = weapons.parts;
  document.getElementById('status').textContent = `${fc.weapon.toUpperCase()} ${fc.stage}${fc.stage === 'preparing' ? ' step ' + (fc.stepIndex + 1) : ''} · ammo ${ammo[fc.weapon]}\nosa ${g.osa.rigs.map((r) => r.phase).join('/')} · fort drums ${g.fort.launchers.slice(0, 3).map((l) => (l.angle * 180 / Math.PI).toFixed(0)).join('/')}`;
}
function burst() {
  const t = tracks[2];
  t.alive = true;
  const anchor = weapons.launchPoints.gun.reduce((a, b) => (b.distanceTo(t.pos) < a.distanceTo(t.pos) ? b : a));
  const from = weapons.ciwsBurst(anchor.clone(), t.pos.clone());
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, t.pos]), new THREE.LineBasicMaterial({ color: 0xffe7a3, transparent: true, opacity: 0.8 }));
  scene.add(line);
  setTimeout(() => scene.remove(line), 90);
}

// ---------------------------------------------------------------- loop

const lightEnv = { sunDir, sunColor: sun.color, sunIntensity: 3.2, ambient: new THREE.Color(0.3, 0.35, 0.4) };
function step(dt) {
  simTime += dt;
  fx.dt = Math.min(dt, 0.1);
  fx._cam.copy(camera.position);
  stepSequence(dt);
  fly(dt);
  weapons.animate(simTime, dt, state);
  if (view === 'inspect') {
    const shot = weapons.inspectView(fc.weapon, fc, dt);
    camera.position.copy(shot.eye);
    controls.target.copy(shot.target);
  }
  fx.update(dt, camera, lightEnv);
}
let last = performance.now(), running = !params.get('frozen');
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (running) step(dt);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// URL-driven setup: stage, optional step, then advance t seconds
setView(view);
if (params.get('stage')) setStage(params.get('stage'), Number(params.get('step') ?? -1));
const advance = (s) => { for (let t = 0; t < s - 1e-9; t += 1 / 30) step(1 / 30); };
if (params.get('t')) advance(Number(params.get('t')));
refresh();
requestAnimationFrame(frame);

window.__preview = {
  weapons, fc, state, tracks, ammo, camera, controls, scene, renderer, fx,
  setStage, setView, launch, burst, advance,
  setWeapon(k) { fc.weapon = k; setStage('idle'); },
  pause(on = true) { running = !on; },
  render() { controls.update(); renderer.render(scene, camera); },
  info() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; },
};
