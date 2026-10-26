import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildSlavaWeapons, SLAVA_MAGAZINES } from '../src/models/slava-weapons.js';
import { SLAVA_MOUNTS, slavaDeckHeightAt } from '../src/models/slava-exterior.js';
import { deckHalfBeamAt } from '../src/models/slava/lines.js';
import { FX } from '../src/fx.js';
import { WEAPONS } from '../src/sim.js';

// Slava's weapons alone on stand-in deck pieces at their SLAVA_MOUNTS heights, or on the whole
// composed ship (?ship=1: buildSlava(), exterior, weapons and bridge), stepped through the fire-
// control sequence by hand or by URL (?weapon=bazalt&stage=preparing&step=2&t=4&view=inspect&clean=1).
// Launches use a small stand-in flight model (booster climb for Bazalt, cold eject and ignition for
// Fort, rail launch for Osa, a tracer for the AK-130) with the game's own effects. window.__preview
// drives it from tests and screenshots, as preview/weapons.html does for Kirov.

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
Object.assign(sun.shadow.camera, { left: -100, right: 100, top: 100, bottom: -100, near: 1, far: 500 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xc2d6df, 0x4b5552, 1.15));

const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x29454c, roughness: 0.35, metalness: 0.1 }));
sea.rotation.x = -Math.PI / 2;
scene.add(sea);

// ---------------------------------------------------------------- the ship or stand-in decks

let ship = null, weapons;
if (params.get('ship')) {
  const { buildSlava } = await import('../src/models/slava.js');
  ship = buildSlava();
  scene.add(ship.group);
  ship.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  weapons = ship.weapons;
} else {
  weapons = buildSlavaWeapons({ mounts: SLAVA_MOUNTS, deckHeightAt: slavaDeckHeightAt });
  scene.add(weapons.group);
  weapons.group.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
}
const M = weapons.mounts;
const decks = new THREE.Group();
decks.name = 'stand-in decks';
if (!ship) {
  scene.add(decks);
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x6b4a3f, roughness: 0.95 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x7d8c90, roughness: 0.85, metalness: 0.1 });
  // the weather deck along the sheer, at its plan width
  const N = 160, pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const z = -93 + (i / N) * 186, y = slavaDeckHeightAt(z), b = deckHalfBeamAt(z);
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
  const block = (x, z, w, d, top, round = false, base = slavaDeckHeightAt(z) - 0.05) => {
    const h = top - base;
    if (h <= 0.05) return;
    const geo = round ? new THREE.CylinderGeometry(w / 2, w / 2, h, 32) : new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, wallMat);
    m.position.set(x, base + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    decks.add(m);
  };
  for (const g of M.ak630) block(g.x, g.z, 3.0, 4.0, g.y);
  for (const a of M.ak130) block(a.x, a.z, (a.barbetteRadius ?? 2.6) * 2, 0, a.y, true);
  for (const d of M.directors.fort) block(d.x, d.z, 6, 6, d.y);
  for (const d of M.directors.osa) block(d.x, d.z, 2.6, 2.6, d.y);
  for (const d of M.directors.ak130) block(d.x, d.z, 3.0, 3.0, d.y);
  for (const r of M.rbu6000) block(r.x, r.z, 2.6, 2.6, r.y);
  // the Fort platforms, and a plain web under each Bazalt container
  for (const side of [-1, 1]) {
    const row = M.fort.filter((f) => Math.sign(f.x) === side), zs = row.map((f) => f.z);
    if (row.length) block(row[0].x, (Math.min(...zs) + Math.max(...zs)) / 2, 4.3, Math.max(...zs) - Math.min(...zs) + 4.4, row[0].y);
  }
  for (const t of M.bazalt) {
    const d = new THREE.Vector3(0, Math.sin(t.incline), -Math.cos(t.incline)), mid = new THREE.Vector3(t.x, t.y, t.z).addScaledVector(d, -5.5);
    const top = mid.y - (t.diameter ?? 1.75) / 2 - 0.2, base = slavaDeckHeightAt(mid.z) - 0.05;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, top - base, 9), wallMat);
    m.position.set(t.x, (top + base) / 2, mid.z);
    m.castShadow = m.receiveShadow = true;
    decks.add(m);
  }
}
weapons.cutouts.apply(ship ? ship.group : decks);
const fx = new FX(scene, { maxSmoke: 3000, maxGlow: 1600, maxDebris: 120, maxShards: 120, maxBrass: 200, lights: 4 });
fx.ground = () => 0;
fx.budget = 0.8;
weapons.attachFx(fx);
const animateAll = (t, dt, state) => (ship ? ship.animate(t, dt, state) : weapons.animate(t, dt, state));

// targets: a frigate for Bazalt and the gun, an aircraft for the SAMs, a close threat for the guns
const tracks = [
  { id: 'ship', type: 'ship', alive: true, pos: new THREE.Vector3(5200, 0, -14000) },
  { id: 'air', type: 'plane', alive: true, pos: new THREE.Vector3(6200, 1400, -6800) },
  { id: 'close', type: 'munition', alive: false, pos: new THREE.Vector3(1600, 18, -1500) },
];
const KINDS = ['bazalt', 'fort', 'osa', 'ak130'];
const targetOf = (kind) => (kind === 'bazalt' || kind === 'ak130' ? 'ship' : 'air');
const fc = { weapon: KINDS.includes(params.get('weapon')) ? params.get('weapon') : 'bazalt', stage: 'idle', stepIndex: -1, salvo: Number(params.get('salvo') || 2), remaining: 2, fired: 0, targetId: null, progress: 0 };
const ammo = { ...SLAVA_MAGAZINES };
const state = { pos: new THREE.Vector3(), heading: 0, autoDefense: params.get('auto') === '1', radar: true, ammo, tracks, fireControl: fc };
// the preparation steps (the Bazalt list is the proposal in weapons/bazalt.js; the AK-130 has none)
const STEPS = { bazalt: ['LOAD TARGET DESIGNATION', 'OPEN CONTAINER COVERS', 'START SUSTAINER ENGINES'], fort: ['ASSIGN CHANNEL', 'INDEX ROTARY MAGAZINE', 'CHECK EJECTION'], osa: ['RAISE LAUNCHER', 'TRAIN LAUNCHER', 'CHECK GUIDANCE'], ak130: [] };
const INTERVAL = { bazalt: 8, fort: 3, osa: 8, ak130: 0.67 };

// ---------------------------------------------------------------- stand-in flights

const flights = [];
let nextId = 1, simTime = 0;
function launch(kind) {
  // the slot as sim.fire numbers it
  if (ammo[kind] <= 0) return null;
  const slot = (WEAPONS[kind]?.ammo ?? SLAVA_MAGAZINES[kind]) - ammo[kind];
  const target = tracks.find((t) => t.id === targetOf(kind));
  const f = weapons.launchFrame(kind, slot, target.pos.clone().normalize());
  ammo[kind]--;
  if (kind === 'ak130') {
    weapons.animateLaunch(kind, slot, null);
    const mz = new THREE.Vector3().copy(f.pos).applyMatrix4(weapons.group.matrixWorld), dir = f.dir.clone().transformDirection(weapons.group.matrixWorld);
    fx.tracer(mz, dir, 850, 6000, [30, 14, 4]);
    return null;
  }
  const m = { id: `m${nextId++}`, kind, slot, pos: f.pos.clone(), fwd: f.dir.clone().normalize(), speed: f.speed, vel: new THREE.Vector3(), age: 0, alive: true, motor: kind !== 'fort', targetId: target.id };
  m.vel.copy(m.fwd).multiplyScalar(m.speed);
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
      const top = m.kind === 'fort' ? 1700 : m.kind === 'bazalt' ? 680 : 500;
      m.speed = Math.min(top, m.speed + (m.kind === 'fort' ? 420 : m.kind === 'bazalt' ? (m.age < 3.2 ? 150 : 25) : 140) * dt);
      _aim.copy(target.pos).sub(m.pos).normalize();
      // the Bazalt climbs out on its boosters before turning toward its cruise
      if (m.kind === 'bazalt') _aim.y = m.age < 2.5 ? Math.max(_aim.y, 0.3) : Math.max(-0.05, Math.min(0.15, (400 - m.pos.y) / 1500));
      turn(m.fwd, _aim.normalize(), m.kind === 'bazalt' ? 0.22 : m.kind === 'fort' ? 1.3 : 1.8, dt);
    }
    m.vel.copy(m.fwd).multiplyScalar(m.speed);
    m.pos.addScaledVector(m.vel, dt);
    mesh.position.copy(m.pos);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), m.fwd);
    if (m.motor && dt > 0) fx.motorPlume(m.pos, m.vel, m.kind === 'bazalt' ? (m.age < 3.2 ? 2.6 : 1.2) : 1, m.kind === 'fort' ? 35 : 0);
    if (m.kind === 'bazalt' && !m.dropped && m.age > 3.2) { m.dropped = true; fx.separation(m.pos, m.vel, 1.6); }
    if (m.age > 14) { m.alive = false; scene.remove(mesh); flights.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- sequence

let salvoTimer = 0;
function setStage(stage, step = -1) {
  fc.stage = stage;
  fc.stepIndex = step;
  fc.targetId = stage === 'idle' ? null : targetOf(fc.weapon);
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
    salvoTimer = INTERVAL[fc.weapon];
    if (!fc.remaining) fc.stage = 'complete';
  }
}

// ---------------------------------------------------------------- views

let view = params.get('view') || 'overview';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const at = (m, dx, dy, dz, ty = 0) => [V(m.x + dx, m.y + dy, m.z + dz), V(m.x, m.y + ty, m.z)];
const mid = (list) => list.reduce((a, m) => ({ x: a.x + m.x / list.length, y: a.y + m.y / list.length, z: a.z + m.z / list.length }), { x: 0, y: 0, z: 0 });
const stbdBazalt = M.bazalt.filter((t) => t.side > 0);
const VIEWS = {
  overview: at(mid(M.bazalt), 48, 30, -62, -2),
  bazalt: at(mid(stbdBazalt), 22, 7, -22, -1),
  bazaltPort: at(mid(M.bazalt.filter((t) => t.side < 0)), -24, 9, -16, -1),
  fort: at(mid(M.fort), 16, 9, -16, 0),
  osa: at(M.osa[1], 9, 5, 12, 2),
  ak130: at(M.ak130[0], 14, 6, -16, 2),
  ak630: at(M.ak630.find((g) => g.side > 0) || M.ak630[0], 7, 3, -8, 0.8),
  forward: at(M.ak630[0], -12, 6, -14, 1),
  directors: at(M.directors.fort[0], -20, 8, 20, 2),
  aft: at(mid([...M.fort, ...M.osa]), -34, 22, 34, 0),
  ship: at({ x: 0, y: 8, z: 0 }, 120, 70, -150, 0),
};
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
  ui('weapons', [['bazalt', 'BAZALT'], ['fort', 'FORT'], ['osa', 'OSA'], ['ak130', 'AK-130']], (k) => fc.weapon === k, (k) => { fc.weapon = k; setStage('idle'); });
  const steps = [['idle', 'SAFE'], ['tracking', 'ACQUIRE'], ['tracked', 'TRACKED']];
  STEPS[fc.weapon].forEach((label, i) => steps.push([`preparing:${i}`, `PREP ${i + 1}`]));
  steps.push(['ready', 'READY'], ['armed', 'ARM'], ['firing', 'FIRE'], ['aborted', 'ABORT']);
  ui('stages', steps, (k) => k === (fc.stage === 'preparing' ? `preparing:${fc.stepIndex}` : fc.stage), (k) => { const [s, i] = k.split(':'); setStage(s, i === undefined ? -1 : Number(i)); });
  ui('views', [...Object.keys(VIEWS).map((k) => [k, k]), ['inspect', 'inspect']], (k) => view === k, setView);
  ui('posture', [['auto', state.autoDefense ? 'AUTO DEFENSE ON' : 'AUTO DEFENSE OFF'], ['threat', tracks[2].alive ? 'CLOSE THREAT ON' : 'CLOSE THREAT OFF'], ['burst', 'CIWS BURST']], (k) => (k === 'auto' && state.autoDefense) || (k === 'threat' && tracks[2].alive), (k) => {
    if (k === 'auto') state.autoDefense = !state.autoDefense;
    if (k === 'threat') tracks[2].alive = !tracks[2].alive;
    if (k === 'burst') burst();
    refresh();
  });
  const g = weapons.parts, step = fc.stage === 'preparing' ? ` step ${fc.stepIndex + 1} ${STEPS[fc.weapon][fc.stepIndex] ?? ''}` : '';
  document.getElementById('status').textContent = `${fc.weapon.toUpperCase()} ${fc.stage}${step} · ammo ${ammo[fc.weapon]}\nbazalt covers ${g.bazalt.tubes.slice(0, 4).map((t) => t.cover.toFixed(2)).join('/')} engines ${g.bazalt.tubes.slice(0, 2).map((t) => t.engine.toFixed(2)).join('/')}\nosa ${g.osa.rigs.map((r) => r.phase).join('/')} · fort drums ${g.fort.launchers.slice(0, 3).map((l) => (l.angle * 180 / Math.PI).toFixed(0)).join('/')}`;
}
function burst() {
  const t = tracks[2];
  t.alive = true;
  const w = weapons.group.matrixWorld;
  const anchor = weapons.launchPoints.gun.map((p) => p.clone().applyMatrix4(w)).reduce((a, b) => (b.distanceTo(t.pos) < a.distanceTo(t.pos) ? b : a));
  const from = weapons.ciwsBurst(anchor, t.pos.clone());
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
  // the gun is laid by its order as main.js does it, while the order is active
  if (fc.weapon === 'ak130' && ['preparing', 'ready', 'armed', 'firing'].includes(fc.stage)) weapons.aimWeapons('ak130', tracks[0].pos.clone().normalize(), dt);
  animateAll(simTime, dt, state);
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

setView(view);
if (params.get('stage')) setStage(params.get('stage'), Number(params.get('step') ?? -1));
const advance = (s) => { for (let t = 0; t < s - 1e-9; t += 1 / 30) step(1 / 30); };
if (params.get('t')) advance(Number(params.get('t')));
refresh();
requestAnimationFrame(frame);

// triangles and meshes (one draw call each, plus one in the shadow pass) of a group
function groupInfo(root) {
  let tris = 0, meshes = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    meshes++;
    const g = o.geometry, n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    tris += n * (o.isInstancedMesh ? o.count : 1);
  });
  return { tris: Math.round(tris), meshes };
}

window.__preview = {
  weapons, ship, fc, state, tracks, ammo, camera, controls, scene, renderer, fx,
  setStage, setView, launch, burst, advance, refresh,
  setWeapon(k) { fc.weapon = k; setStage('idle'); },
  pause(on = true) { running = !on; },
  render() { controls.update(); renderer.render(scene, camera); },
  info() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, weapons: groupInfo(weapons.group), ship: ship ? groupInfo(ship.group) : null }; },
};
