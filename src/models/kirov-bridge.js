import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as exteriorModule from './kirov-exterior.js';
import { V, PI, xf, box, rbox, zTube, plane, rrectRing, Parts, atlasUV, clamp, screwFrame } from './bridge/kit.js';
import { bridgeMaterials, windowGlassMaterial, deckTextures, grainTextures, INTERIOR_ENV } from './bridge/textures.js';
import { Atlas, dialArt, placardArt, stencilArt } from './bridge/art.js';
import { buildShell, buildDeck, roomOcclusion, segmentFrame, planLights } from './bridge/room.js';
import {
  At, instrument, buildHelm, buildTelegraph, buildSight, buildPelorus, buildChair, buildCrtConsole, buildRepeatStation,
  buildChartTable, buildVoicePipes, buildPhone, buildExtinguisher, buildIntercom, buildSignalCabinet, buildAftWindow,
  buildCommandConsole, buildWallCase,
} from './bridge/fittings.js';
import { createDisplays, displayStage } from './bridge/displays.js';
import { buildBridgeCrew } from './bridge/crew.js';
import { CEIL, ZA, ZF, XI, SEGMENTS, WIN, SILL_Y, LOWER_D, PLAN, useLayout } from './bridge/layout.js';

const PLAN_ACTIVE = () => PLAN !== null;

// Original Kirov (Project 1144), navigation bridge, 1985.
// Evidence: Oleg Kuleshov's 2015 photographs aboard the ship (refs/photos/kirov-bridge-*.jpg):
// pale sea-green steel, individually framed rounded windows with cream five-lobed dogs, the timber
// sill, perforated off-white overhead with dome lights, brown deck, the curved cast helm with two
// chromed grips, the twin-drum telegraph, the cream optical sight, the tall commander's chair, the
// "signal watch" cabinet and the wood-framed aft bulkhead windows. Period equipment style from
// Project 1143 Minsk and the destroyer Razumny (refs/README.md). Room size and the station layout are a
// reconstruction; the tactical CRT consoles and the weapons repeat station are gameplay additions.
// See refs/bridge-notes.md. Room frame: deck at y = 0, forward -Z, starboard +X.

const DEFAULT_ANCHOR = { x: 0, y: 20, z: -30 };

// Where the stations stand (room frame).
export const STATIONS = {
  helm: { x: -0.62, z: -3.12 },
  telegraph: { x: -1.98, z: -3.18 },
  voicePipes: { x: -1.3, z: -3.62 },
  radar: { x: -3.45, z: -3.05, ry: 0.12 },
  sight: { x: -4.8, z: -3.5, ry: 0.15 },
  pelorusP: { x: -6.6, z: -2.95, ry: 0.7 },
  pelorusS: { x: 6.6, z: -2.95, ry: -0.7 },
  chair: { x: 2.35, z: -3.3, ry: 0.0 },
  fortCrt: { x: 4.55, z: -2.95, ry: -0.12 },
  repeat: { x: 2.55, z: -1.45, ry: -0.62 },
  chart: { x: -4.7, z: 1.38 },
  chartTable: { x: -4.7, z: 2.2, ry: PI },
  lookout: { x: 5.4, z: -3.6 },
  talker: { x: 5.75, z: 2.05, ry: 0.5 },
  console: { x: -0.9, z: 0.95, ry: 0 },
};

// The watch officer's eye at the conning position (room frame): 3.4 m behind the forward glass,
// the helmsman and telegraph ahead on the left, the repeat station on the right. main.js leans the
// eye up to BRIDGE_LEAN metres toward the glass as the view pitches down onto the foredeck.
export const EYE = V(0.2, 1.74, -0.95);
export const LOOK = V(0.05, 1.48, -6.2);
export const BRIDGE_LEAN = 2.0;

// The Slava (Project 1164) plan: the same Soviet bridge fit laid out in the narrower faceted room.
// The eye stands about 1.35 m behind a centre window of the raked front (ship 0.5, 19.0, -30.3), where
// the AK-130 and the Bazalt container fronts show over the low house ahead; it barely leans.
export const SLAVA_STATIONS = {
  helm: { x: -1.0, z: -3.4 },
  telegraph: { x: -2.35, z: -3.45 },
  voicePipes: { x: -1.68, z: -3.95 },
  radar: { x: -3.4, z: -3.15, ry: 0.15 },
  sight: { x: -4.95, z: -2.6, ry: PI / 4 },
  pelorusP: { x: -6.2, z: -1.2, ry: PI / 4 },
  pelorusS: { x: 6.2, z: -1.2, ry: -PI / 4 },
  chair: { x: 2.05, z: -3.45, ry: 0.0 },
  fortCrt: { x: 3.4, z: -3.15, ry: -0.15 },
  repeat: { x: 2.75, z: -1.3, ry: -0.62 },
  chart: { x: -4.6, z: 3.77 },
  chartTable: { x: -4.6, z: 4.59, ry: PI },
  lookout: { x: 5.15, z: -2.55 },
  lookoutRy: -PI / 4 + 0.1,
  talker: { x: 5.8, z: 4.3, ry: 0.5 },
  console: { x: -0.9, z: 2.2, ry: 0 },
};
export const SLAVA_EYE = V(0.5, 1.6, -3.45);
export const SLAVA_LOOK = V(0.45, 1.22, -9.0);
export const SLAVA_LEAN = 0.4;

// buildBridge({ anchor, plan }): anchor is where the group origin goes (ship-local); plan is a
// faceted bridge measurement such as slava-exterior.js's SLAVA_BRIDGE (null: the Kirov room).
export function buildBridge(opts = {}) {
  const plan = opts.plan ?? null;
  const anchor = opts.anchor ?? (plan ? { x: 0, y: plan.floor, z: plan.front + 4.95 } : exteriorModule.BRIDGE_ANCHOR) ?? DEFAULT_ANCHOR;
  useLayout(plan, anchor);
  try {
    return buildRoom(anchor, plan);
  } finally {
    useLayout(null);
  }
}

function buildRoom(anchor, plan) {
  const group = new THREE.Group();
  group.name = plan ? 'Slava bridge (plan reconstruction)' : 'Kirov bridge (photo-referenced reconstruction)';
  group.position.set(anchor.x ?? 0, anchor.y ?? 20, anchor.z ?? -30);
  group.userData.lean = plan ? SLAVA_LEAN : BRIDGE_LEAN;

  const M = bridgeMaterials();
  const atlas = new Atlas(2048, 2048);
  const atlasTex = atlas.texture();
  M.label = new THREE.MeshStandardMaterial({ map: atlasTex, roughness: 0.55, metalness: 0.05, vertexColors: true, envMapIntensity: INTERIOR_ENV });
  M.decal = new THREE.MeshStandardMaterial({ map: atlasTex, roughness: 0.7, metalness: 0, vertexColors: true, alphaTest: 0.45, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, envMapIntensity: INTERIOR_ENV });
  M.dial = new THREE.MeshStandardMaterial({ map: atlasTex, roughness: 0.45, metalness: 0, vertexColors: true, emissive: 0x000000, emissiveMap: atlasTex, envMapIntensity: INTERIOR_ENV });
  for (const k of ['label', 'decal', 'dial']) M[k].userData.noAO = false;

  const P = new Parts(M, { occlusion: roomOcclusion });
  const ctx = {
    P, M, atlas, group,
    glass: [], wipers: [], needles: [], cards: [], lamps: [], anim: {}, anchors: {}, builds: [],
    label(g, r) { atlasUV(g, r); P.add('label', g, { uv: true }); },
    decal(g, r) { atlasUV(g, r); P.add('decal', g, { uv: true }); },
    dial(g, r) { atlasUV(g, r); P.add('dial', g, { uv: true }); },
  };

  // ------------------------------------------------------------ shell and furniture
  buildShell(ctx);
  const S = plan ? SLAVA_STATIONS : STATIONS;
  buildHelm(ctx, S.helm.x, S.helm.z);
  buildTelegraph(ctx, S.telegraph.x, S.telegraph.z);
  buildVoicePipes(ctx, S.voicePipes.x, S.voicePipes.z);
  buildSight(ctx, S.sight.x, S.sight.z, S.sight.ry);
  buildPelorus(ctx, S.pelorusP.x, S.pelorusP.z, S.pelorusP.ry);
  buildPelorus(ctx, S.pelorusS.x, S.pelorusS.z, S.pelorusS.ry);
  buildChair(ctx, S.chair.x, S.chair.z, S.chair.ry);
  const displays = createDisplays(group);
  buildCrtConsole(ctx, S.radar.x, S.radar.z, S.radar.ry, { title: 'РЛС «ВАЙГАЧ» · ИНДИКАТОР', hood: true, screen: displays.hooks.ppi });
  buildCrtConsole(ctx, S.fortCrt.x, S.fortCrt.z, S.fortCrt.ry, { title: 'ВЫНОСНОЙ ИНДИКАТОР «ФОРТ»', screen: displays.hooks.fort, knobs: ['ЯРКОСТЬ', 'МАСШТАБ', 'КАНАЛ'] });
  buildRepeatStation(ctx, S.repeat.x, S.repeat.z, S.repeat.ry, displays.hooks, plan ? { selector: 'ОСА  БАЗАЛЬТ  ФОРТ' } : undefined);
  buildChartTable(ctx, S.chartTable.x, S.chartTable.z, S.chartTable.ry);
  buildCommandConsole(ctx, S.console.x, S.console.z, S.console.ry, 2.4);
  if (plan) instrumentsHung(ctx); else instrumentsOverhead(ctx);
  aftBulkhead(ctx);
  if (plan) planNightLamps(ctx); else nightLamps(ctx);

  // ------------------------------------------------------------ merge
  P.build(group, { name: 'bridge' });
  for (const b of ctx.builds) b();

  // deck: room-mapped linoleum with the walked paths worn into it
  const deckT = deckTextures(plan ? [
    { pts: [[-7.0, 1.15], [-5.0, 0.6], [-2.0, -0.6], [0.5, -1.2], [3.0, -0.6], [5.0, 0.6], [7.0, 1.15]], w: 1.1 },
    { pts: [[0.5, -4.1], [0.6, -2.6], [1.2, -0.8], [1.6, 2.0], [1.55, 4.9]], w: 1.0 },
    { pts: [[-4.6, 3.8], [-3.0, 2.6], [-0.8, 0.6], [0.4, -1.2]], w: 0.9 },
    { pts: [[-5.4, -2.0], [-3.6, -3.9], [0, -4.1], [3.6, -3.9], [5.4, -2.0]], w: 1.2 },
  ] : [
    { pts: [[-7.6, -1.5], [-5.5, -1.7], [-3.0, -2.0], [-1.0, -2.2], [1.5, -1.9], [4.0, -1.6], [7.6, -1.55]], w: 1.1 },
    { pts: [[0.3, -3.4], [0.4, -2.2], [1.2, -0.6], [1.6, 1.2], [1.55, 2.6]], w: 1.0 },
    { pts: [[-4.7, 1.4], [-3.0, 0.4], [-0.8, -0.5], [0.4, -1.6]], w: 0.9 },
    { pts: [[-4.5, -3.6], [-2.0, -3.6], [0.5, -3.5], [3.0, -3.6], [5.4, -3.7]], w: 1.2 },
  ]);
  const grain = grainTextures();
  const deckN = grain.normal.clone();
  deckN.channel = 1;
  deckN.repeat.set(1, 1);
  deckN.needsUpdate = true;
  M.deck = new THREE.MeshStandardMaterial({ map: deckT.map, roughnessMap: deckT.rough, normalMap: deckN, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 1, metalness: 0, vertexColors: true, envMapIntensity: INTERIOR_ENV });
  group.add(buildDeck(M.deck));

  // window glass, one mesh: salt and grime with the wiper-cleared arcs
  const glassMat = windowGlassMaterial();
  const glassGeo = mergeGlass(ctx.glass);
  const glassMesh = new THREE.Mesh(glassGeo, glassMat);
  glassMesh.name = 'bridge:glass';
  glassMesh.renderOrder = 2;
  group.add(glassMesh);

  const needles = needleMesh(ctx.needles);
  group.add(needles.mesh);
  const cards = cardMesh(ctx.cards, M.dial, atlas);
  group.add(cards.mesh);
  const wipers = wiperMeshes(ctx.wipers, M);
  for (const w of wipers.meshes) group.add(w);

  // ------------------------------------------------------------ light
  const lights = [];
  // wide spots in four of the dome fittings: they light the room and the deck, not the overhead
  // round the fitting (an omni light there burns a hot spot onto the panels)
  const spots = plan ? [0, 1, 2, 4].map((i) => planLights()[i]) : [[-4.6, -2.2], [0, -2.2], [4.6, -2.2], [0, 1.2]];
  for (const [x, z] of spots) {
    const L = new THREE.SpotLight(0xffe2bc, 0, 11, 1.38, 0.7, 1.5);
    L.position.set(x, CEIL - 0.06, z);
    L.target.position.set(x, 0, z);
    L.castShadow = false;
    group.add(L, L.target);
    lights.push(L);
  }
  const chartLight = new THREE.PointLight(0xffd29a, 0, 2.6, 2);
  chartLight.position.copy(ctx.lamps.at(-1));
  group.add(chartLight);

  // ------------------------------------------------------------ crew
  let crew = null;
  try {
    crew = buildBridgeCrew(group, ctx.anchors, { ...S, repeat: { x: S.repeat.x + Math.sin(S.repeat.ry) * 0.62, z: S.repeat.z + Math.cos(S.repeat.ry) * 0.62, ry: S.repeat.ry } }, plan ? { window: V(0.5, 1.2, -8), lookoutRy: S.lookoutRy } : undefined);
  } catch (e) {
    console.warn('bridge crew unavailable', e);
  }

  // ------------------------------------------------------------ view
  // eye and target are ship-local and follow the group wherever the ship model places it
  const eyeLocal = (plan ? SLAVA_EYE : EYE).clone(), targetLocal = (plan ? SLAVA_LOOK : LOOK).clone();
  const eye = V(), target = V();
  const syncView = () => { eye.copy(eyeLocal).add(group.position); target.copy(targetLocal).add(group.position); };
  syncView();

  // ------------------------------------------------------------ state
  const view = { heading: 0, rudder: 0, rpm: [0, 0], reply: [0, 0], order: 0, sight: 0, wiper: 0, wiping: false, night: 0, conditions: 'day', selector: 0, guard: 0 };
  let uiState = {};

  function setLighting(night, conditions) {
    view.night = night;
    const dusk = conditions === 'dusk' ? 1 : 0, heavy = conditions === 'overcast' ? 1 : 0;
    // red night lighting replaces the white fittings after dark; dusk and heavy weather bring them up
    const white = (1 - night) * (14 + dusk * 30 + heavy * 22);
    const red = night * (plan ? 16 : 30); // the plan's smaller room puts its lamps nearer the walls
    const col = new THREE.Color(0xffe2bc).multiplyScalar(white).add(new THREE.Color(0xff3a22).multiplyScalar(red));
    const I = Math.max(col.r, col.g, col.b);
    for (const L of lights) { L.color.copy(col).multiplyScalar(1 / Math.max(I, 1e-3)); L.intensity = I; }
    chartLight.intensity = 2.5 + night * 1.5 + dusk * 2;
    M.lamp.emissiveIntensity = (1 - night) * (0.35 + dusk * 0.25 + heavy * 0.25) + 0.03;
    M.lens.emissiveIntensity = 0.15 + night * 3.5;
    M.dial.emissive.setRGB(0.55, 0.32, 0.12).multiplyScalar(night * 0.7 + dusk * 0.08);
    for (const m of displays.materials) {
      m.userData.base ??= m.emissiveIntensity;
      m.emissiveIntensity = m.userData.base * (1 - night * 0.3);
    }
    view.wiping = heavy > 0;
  }
  setLighting(0, 'day');

  const updateDisplays = (state = {}) => {
    uiState = state;
    if (state.night != null || state.conditions) setLighting(state.night ?? view.night, state.conditions ?? view.conditions);
    if (state.conditions) view.conditions = state.conditions;
  };

  const animate = (time = 0, dt = 0, state = {}) => {
    syncView();
    const st = { ...uiState, ...state };
    const k = 1 - Math.exp(-Math.max(dt, 0.016) * 3);
    // heading cards, rudder order, telegraph orders and the reply pointers
    view.heading = state.heading ?? view.heading;
    const knots = (state.desiredSpeed ?? state.speed ?? 0) / 0.514444;
    const order = knots < 0.5 ? 0 : knots < 8 ? 1 : knots < 14 ? 2 : knots < 20 ? 3 : knots < 27 ? 4 : 5;
    view.order = order;
    const yaw = Math.atan2(Math.sin((state.desiredHeading ?? view.heading) - view.heading), Math.cos((state.desiredHeading ?? view.heading) - view.heading));
    view.rudder += (clamp((yaw * 180) / PI * 3, -35, 35) - view.rudder) * k;
    for (let i = 0; i < 2; i++) {
      view.reply[i] += (order - view.reply[i]) * (1 - Math.exp(-Math.max(dt, 0.016) * 1.2));
      view.rpm[i] += (((state.speed ?? 0) / 0.514444 / 31) * 100 - view.rpm[i]) * k;
    }
    // telegraph levers swing forward through the notches (about 0.17 rad each)
    const levers = ctx.anim.levers || [];
    levers.forEach((lv) => { lv.group.quaternion.copy(lv.base).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -order * 0.17)); });
    if (ctx.anim.helmBar) ctx.anim.helmBar.group.quaternion.copy(ctx.anim.helmBar.base).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), (-view.rudder * PI) / 180 * 0.6));
    if (ctx.anim.sightHead) ctx.anim.sightHead.group.quaternion.copy(ctx.anim.sightHead.base).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.sin(time * 0.07) * 0.35));
    // repeat station: the selector follows the weapon, the guard lifts once armed
    const fc = st.fireControl || {};
    const stage = displayStage(fc);
    const sel = { osa: -0.6, granit: 0, bazalt: 0, fort: 0.6 }[fc.weapon || 'granit'] ?? 0;
    view.selector += (sel - view.selector) * k;
    const guardOpen = ['armed', 'firing'].includes(stage) ? 1 : 0;
    view.guard += (guardOpen - view.guard) * (1 - Math.exp(-Math.max(dt, 0.016) * 6));
    if (ctx.anim.selector) ctx.anim.selector.group.quaternion.copy(ctx.anim.selector.base).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -view.selector));
    if (ctx.anim.guard) ctx.anim.guard.group.quaternion.copy(ctx.anim.guard.base).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -view.guard * 1.9));
    // wipers sweep in heavy weather, park otherwise
    if (view.wiping) view.wiper += Math.max(dt, 0) * 1.6;
    wipers.update(view.wiping ? view.wiper : null);
    const s = { heading: view.heading, rudderOrder: view.rudder, shaftRpm: view.rpm[0], telegraphReply: view.reply, time: st.time ?? time };
    needles.update(s, time);
    cards.update(s);
    displays.update({ ...st, time: st.time ?? time });
    crew?.update(dt, stage);
  };
  animate(0, 0, {});

  return {
    group, eye, target, eyeLocal, targetLocal, updateDisplays, animate,
    // stats for the preview and the docs
    info: () => {
      let tris = 0, meshes = 0;
      group.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        const g = o.geometry, n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
        tris += n * (o.isInstancedMesh ? o.count : 1);
      });
      return { tris: Math.round(tris), meshes, atlas: Math.round(atlas.used * 100) };
    },
  };
}

// ---------------------------------------------------------------- instruments above the windows

function instrumentsOverhead(ctx) {
  // the bulkhead header above the forward windows: shaft revolutions, the clock, the rudder
  // angle indicator over the centre window, the log, the clinometer and the anemometer
  const f = segmentFrame(SEGMENTS[2]);
  const frameTop = WIN.y0 + WIN.h + 0.14, yI = (frameTop + CEIL) / 2 + 0.005, rMax = (CEIL - frameTop) / 2 - 0.015;
  const a = new At(ctx, 0, 0);
  a.m = f.m.clone();
  const row = [
    [-4.86, 0.12, { kind: 'clino', size: 256, seed: 71 }, (s) => Math.sin(s.time * 0.31) * 6 * 1.6, 0.9],
    [-3.24, 0.12, { kind: 'clock', size: 256, seed: 72 }, null],
    [-1.62, 0.12, { kind: 'gauge', min: 0, max: 300, major: 6, label: 'ОБОРОТЫ', sub: 'ЛЕВ. ВАЛ · ОБ/МИН', green: [0, 240], red: [270, 300], seed: 73 }, (s) => -135 + (s.shaftRpm || 0) * 2.7 * 0.9],
    [0, 0.15, { kind: 'rudder', label: 'АКСИОМЕТР', size: 256, seed: 74 }, (s) => ((s.rudderOrder || 0) / 35) * 120],
    [1.62, 0.12, { kind: 'gauge', min: 0, max: 300, major: 6, label: 'ОБОРОТЫ', sub: 'ПР. ВАЛ · ОБ/МИН', green: [0, 240], red: [270, 300], seed: 75 }, (s) => -135 + (s.shaftRpm || 0) * 2.7 * 0.9],
    [3.24, 0.12, { kind: 'gauge', min: 0, max: 35, major: 7, label: 'ЛАГ', sub: 'СКОРОСТЬ · УЗЛЫ', seed: 76 }, (s) => -135 + Math.min(35, (s.shaftRpm || 0) * 0.31) / 35 * 270],
    [4.86, 0.12, { kind: 'gauge', min: 0, max: 40, major: 8, label: 'ВЕТЕР', sub: 'АНЕМОМЕТР · М/С', amber: [20, 30], red: [30, 40], seed: 77 }, (s) => -135 + (11 + Math.sin(s.time * 0.4) * 2) / 40 * 270],
  ];
  for (const [x, r0, spec, fn] of row) {
    const u = x + 6.0, r = Math.min(r0, rMax);
    // a backing plate tilted down toward the room
    a.add('green', rbox(r * 2.6, r * 2.6, 0.03, 0.02, u, yI, 0.05, -0.18));
    instrument(a, u, yI, 0.075, r, { ...spec }, { rx: -0.18, value: fn ? (s) => fn(s) : null });
    if (spec.kind === 'clock') {
      const base = a.frame(u, yI, 0.075, -0.18, 0, 0).multiply(xf(0, 0, 0.007));
      ctx.needles.push({ m: base.clone(), len: r * 0.55, w: r * 0.07, color: 0x111111, value: (s) => clockAngle(s.time, 'h') });
      ctx.needles.push({ m: base.clone().multiply(xf(0, 0, 0.002)), len: r * 0.8, w: r * 0.05, color: 0x111111, value: (s) => clockAngle(s.time, 'm') });
      ctx.needles.push({ m: base.clone().multiply(xf(0, 0, 0.004)), len: r * 0.85, w: r * 0.02, color: 0x9a1c12, value: (s) => clockAngle(s.time, 's') });
    }
  }
  // name boards on the pilasters beside the rudder indicator
  a.label(plane(0.07, 0.36, 6.0 - 0.81, WIN.y0 + WIN.h * 0.5, 0.078), placardArt(ctx.atlas, ['ГКП'], { w: 64, h: 320, bg: '#1b221d', ink: '#d9d6bd', border: null, screws: false }));
  a.label(plane(0.07, 0.36, 6.0 + 0.81, WIN.y0 + WIN.h * 0.5, 0.078), placardArt(ctx.atlas, ['БЧ-1'], { w: 64, h: 320, bg: '#1b221d', ink: '#d9d6bd', border: null, screws: false }));
  // telephone and the window-heater switchboard on the forward bulkhead's port end
  buildPhone(ctx, f.m.clone().multiply(xf(0.42, 1.55, 0.05)), { label: 'ГКП' });
  const sw = new At(ctx, 0, 0);
  sw.m = f.m.clone();
  sw.add('cream', rbox(0.34, 0.24, 0.1, 0.02, 11.55, 1.6, 0.06));
  for (let k = 0; k < 4; k++) {
    sw.add('black', zTube(0.11, 0.14, 0.014, 0.012, 12, 11.43 + k * 0.08, 1.62));
    sw.add('black', rbox(0.01, 0.035, 0.012, 0.003, 11.43 + k * 0.08, 1.62, 0.15, 0, 0, k % 2 ? 0.5 : -0.5));
  }
  sw.label(plane(0.3, 0.04, 11.55, 1.51, 0.111), placardArt(ctx.atlas, ['ОБОГРЕВ СТЁКОЛ'], { w: 384, h: 48, bg: '#cfc6a2', ink: '#1d1d18', border: null, screws: false }));
}

function clockAngle(t = 0, hand) {
  const s = 4 * 3600 + 17 * 60 + t; // the watch begins at 04:17 local
  if (hand === 'h') return ((s / 3600) % 12) * 30;
  if (hand === 'm') return ((s / 60) % 60) * 6;
  return Math.floor(s % 60) * 6;
}

// ---------------------------------------------------------------- the aft bulkhead

function aftBulkhead(ctx) {
  const { atlas } = ctx;
  // wood-framed glazed panels into the chart house, and the doorway (as photographed)
  buildAftWindow(ctx, -1.2, 1.52, 0.62, 0.8, 0.6);
  buildAftWindow(ctx, 4.1, 1.52, 0.62, 0.8, 0.5);
  const d = new At(ctx, 1.55, ZA, PI);
  d.add('wood', rrectRing(1.02, 2.08, 0.02, 0.82, 1.96, 0.01, 0.06, 0.008).translate(0, 0.98, 0));
  d.add('wood', rbox(0.8, 1.94, 0.045, 0.006, 0, 0.98, -0.03));
  d.add('wood', rrectRing(0.5, 0.72, 0.01, 0.4, 0.62, 0.005, 0.03, 0.004).translate(0, 1.5, -0.005));
  ctx.glass.push(plane(0.4, 0.62, 0, 1.5, -0.006).applyMatrix4(d.m));
  d.add('void', plane(0.4, 0.62, 0, 1.5, -0.02));
  d.add('chrome', rbox(0.12, 0.03, 0.04, 0.01, 0.3, 1.02, 0.02));
  d.add('chrome', zTube(-0.02, 0.0, 0.035, 0.035, 16, 0.3, 1.02));
  d.label(plane(0.3, 0.06, 0.62, 1.8, 0.004), placardArt(atlas, ['ШТУРМАНСКАЯ РУБКА'], { w: 512, h: 96, bg: '#d6cfb0', ink: '#1d1d18', border: '#3d3c33' }));
  // timber rail along the aft bulkhead at shoulder height
  const rail = new At(ctx, 0, ZA, PI);
  const xr = PLAN_ACTIVE() ? XI - 0.15 : 7.6;
  for (const [x0, x1] of [[-xr, -1.6], [-0.8, 1.0], [2.1, 3.7], [4.5, xr]]) rail.add('wood', rbox(x1 - x0, 0.06, 0.035, 0.01, -(x0 + x1) / 2, 2.08, 0.018));
  // intercom, telephones, the clock and barometer, extinguishers, signal cabinet
  buildIntercom(ctx, xf(-2.6, 1.45, ZA, 0, PI, 0));
  buildPhone(ctx, xf(5.0, 1.5, ZA, 0, PI, 0), { label: 'БЧ-2' });
  buildPhone(ctx, xf(PLAN_ACTIVE() ? XI - 0.65 : 6.4, 1.5, ZA, 0, PI, 0), { label: 'БИП' });
  const w = new At(ctx, 0, ZA, PI);
  instrument(w, 2.9, 1.86, 0.04, 0.12, { kind: 'clock', size: 256, seed: 81 }, { value: null });
  const cf = w.frame(2.9, 1.86, 0.047);
  ctx.needles.push({ m: cf.clone(), len: 0.066, w: 0.008, color: 0x111111, value: (s) => clockAngle(s.time, 'h') });
  ctx.needles.push({ m: cf.clone().multiply(xf(0, 0, 0.002)), len: 0.096, w: 0.006, color: 0x111111, value: (s) => clockAngle(s.time, 'm') });
  instrument(w, -5.9, 1.82, 0.04, 0.11, { kind: 'gauge', min: 720, max: 790, major: 7, label: 'БАРОМЕТР', sub: 'ММ РТ. СТ.', a0: -140, a1: 140, seed: 82 }, { value: (s) => -140 + ((748 - 720) / 70) * 280 + Math.sin(s.time * 0.01) * 4, bezel: 'brass' });
  const xe = PLAN_ACTIVE() ? XI - 0.5 : 7.0;
  buildExtinguisher(ctx, xf(-xe, 0.55, ZA, 0, PI, 0));
  buildExtinguisher(ctx, xf(xe, 0.55, ZA, 0, PI, 0));
  buildSignalCabinet(ctx, PLAN_ACTIVE() ? -(XI - 1.0) : -6.75, ZA - 0.25, PI);
  // cream equipment cases: echo sounder recorder, a receiver, the gyrocompass alarm panel
  buildWallCase(ctx, xf(0.2, 1.42, ZA, 0, PI, 0), { w: 0.5, h: 0.62, d: 0.22, title: 'ЭХОЛОТ НЭЛ-10', window: true, knobs: 3, cables: 2, seed: 4,
    dials: [{ kind: 'gauge', min: 0, max: 500, major: 5, label: 'ГЛУБИНА', sub: 'М' }] });
  buildWallCase(ctx, xf(-5.2, 1.55, ZA, 0, PI, 0), { w: 0.46, h: 0.34, d: 0.2, title: 'ПРИЁМНИК', knobs: 4, cables: 1, seed: 5,
    dials: [{ kind: 'gauge', min: 0, max: 10, major: 5, label: 'УРОВЕНЬ', sub: 'ДБ' }] });
  buildWallCase(ctx, xf(6.0, 1.9, ZA, 0, PI, 0), { w: 0.62, h: 0.3, d: 0.16, title: 'СИГНАЛИЗАЦИЯ ГК', knobs: 2, cables: 2, seed: 6,
    dials: [{ kind: 'gauge', min: 0, max: 50, major: 5, label: 'ТОК', sub: 'А' }, { kind: 'gauge', min: 0, max: 150, major: 5, label: 'НАПР', sub: 'В' }] });
  // first-aid box and a notice board with the watch bill
  w.add('cream', rbox(0.3, 0.24, 0.12, 0.02, 3.2, 1.5, 0.06));
  w.add('red', box(0.05, 0.15, 0.004, 3.2, 1.5, 0.121));
  w.add('red', box(0.15, 0.05, 0.004, 3.2, 1.5, 0.121));
  w.add('wood', rbox(0.62, 0.46, 0.02, 0.006, -3.9, 1.6, 0.01));
  w.label(plane(0.56, 0.4, -3.9, 1.6, 0.022), placardArt(atlas, ['РАСПИСАНИЕ', 'ХОДОВОЙ ВАХТЫ', '1-Я СМЕНА  2-Я СМЕНА', '3-Я СМЕНА'], { w: 320, h: 256, bg: '#e1dbc3', ink: '#25251f', border: '#6c6a5c', screws: false }));
  // stencils
  ctx.decal(plane(0.3, 0.08, 0, 0.35, 0.002).applyMatrix4(w.frame(-2.0, 0, 0)), stencilArt(atlas, '1-2-14', { w: 256, h: 72, seed: 31 }));
  ctx.decal(plane(0.22, 0.07, 0, 0.3, 0.002).applyMatrix4(w.frame(5.6, 0, 0)), stencilArt(atlas, '-127 В', { w: 256, h: 80, seed: 32 }));
}

// ---------------------------------------------------------------- night lighting

// Small red night lamps under the sill and on the consoles: they carry the room after dark.
function nightLamps(ctx) {
  const f = segmentFrame(SEGMENTS[2]);
  const a = new At(ctx, 0, 0);
  a.m = f.m.clone();
  for (const x of [-4.05, -0.81, 2.43, 5.67]) {
    const u = x + 6.0;
    a.add('black', rbox(0.12, 0.06, 0.05, 0.01, u, SILL_Y - 0.1, 0.35));
    a.add('lens', box(0.09, 0.02, 0.01, u, SILL_Y - 0.12, 0.377));
  }
  for (const [x, z] of [[-6.8, 0.5], [6.8, 0.5]]) {
    a.m = xf(x, 0, z, 0, x < 0 ? PI / 2 : -PI / 2, 0);
    a.add('black', rbox(0.12, 0.06, 0.05, 0.01, 0, 0.82, 0.38));
    a.add('lens', box(0.09, 0.02, 0.01, 0, 0.8, 0.407));
  }
}

// ---------------------------------------------------------------- the plan's own fittings

// On a raked front the repeaters hang from the deckhead instead: a long panel tilted down to the
// conning position carries the same instruments (clinometer, clock, revolutions, rudder angle, log,
// anemometer) above the line of sight through the windows. The telephone and the window-heater
// switchboard move to the side bulkheads between the wing door and the after windows.
function instrumentsHung(ctx) {
  const zP = ZF + 0.62, yP = CEIL - 0.21, tilt = -0.62;
  const a = new At(ctx, 0, 0);
  a.m = xf(0, yP, zP, tilt, 0, 0);
  a.add('green', rbox(6.9, 0.3, 0.06, 0.02, 0, 0, -0.03));
  a.add('steel', screwFrame(V(0, 0, 0.002), V(1, 0, 0), V(0, 1, 0), 6.8, 0.24, V(0, 0, 1), 0.006, 9, 2));
  for (const x of [-3.0, -1.0, 1.0, 3.0]) {
    ctx.P.add('steel', yTubeAt(x, yP + 0.08, CEIL, zP - 0.04));
  }
  const row = [
    [-2.85, { kind: 'clino', size: 256, seed: 71 }, (s) => Math.sin(s.time * 0.31) * 6 * 1.6],
    [-1.9, { kind: 'clock', size: 256, seed: 72 }, null],
    [-0.95, { kind: 'gauge', min: 0, max: 300, major: 6, label: 'ОБОРОТЫ', sub: 'ЛЕВ. ВАЛ · ОБ/МИН', green: [0, 240], red: [270, 300], seed: 73 }, (s) => -135 + (s.shaftRpm || 0) * 2.7 * 0.9],
    [0, { kind: 'rudder', label: 'АКСИОМЕТР', size: 256, seed: 74 }, (s) => ((s.rudderOrder || 0) / 35) * 120],
    [0.95, { kind: 'gauge', min: 0, max: 300, major: 6, label: 'ОБОРОТЫ', sub: 'ПР. ВАЛ · ОБ/МИН', green: [0, 240], red: [270, 300], seed: 75 }, (s) => -135 + (s.shaftRpm || 0) * 2.7 * 0.9],
    [1.9, { kind: 'gauge', min: 0, max: 35, major: 7, label: 'ЛАГ', sub: 'СКОРОСТЬ · УЗЛЫ', seed: 76 }, (s) => -135 + Math.min(35, (s.shaftRpm || 0) * 0.31) / 35 * 270],
    [2.85, { kind: 'gauge', min: 0, max: 40, major: 8, label: 'ВЕТЕР', sub: 'АНЕМОМЕТР · М/С', amber: [20, 30], red: [30, 40], seed: 77 }, (s) => -135 + (11 + Math.sin(s.time * 0.4) * 2) / 40 * 270],
  ];
  for (const [x, spec, fn] of row) {
    instrument(a, x, 0, 0.012, 0.11, { ...spec }, { value: fn ? (s) => fn(s) : null });
    if (spec.kind === 'clock') {
      const base = a.frame(x, 0, 0.019);
      ctx.needles.push({ m: base.clone(), len: 0.06, w: 0.008, color: 0x111111, value: (s) => clockAngle(s.time, 'h') });
      ctx.needles.push({ m: base.clone().multiply(xf(0, 0, 0.002)), len: 0.088, w: 0.006, color: 0x111111, value: (s) => clockAngle(s.time, 'm') });
      ctx.needles.push({ m: base.clone().multiply(xf(0, 0, 0.004)), len: 0.094, w: 0.002, color: 0x9a1c12, value: (s) => clockAngle(s.time, 's') });
    }
  }
  a.label(plane(0.5, 0.045, 0, -0.125, 0.004), placardArt(ctx.atlas, ['ПОЛОЖЕНИЕ РУЛЯ'], { w: 384, h: 40, bg: '#1b221d', ink: '#d9d6bd', border: null, screws: false }));
  // side bulkheads: telephone to port, the heater switchboard to starboard (between door and windows)
  const zs = 2.0;
  buildPhone(ctx, xf(-XI, 1.5, zs, 0, PI / 2, 0), { label: 'ГКП' });
  const sw = new At(ctx, 0, 0);
  sw.m = xf(XI, 0, zs, 0, -PI / 2, 0);
  sw.add('cream', rbox(0.34, 0.24, 0.1, 0.02, 0, 1.6, 0.05));
  for (let k = 0; k < 4; k++) {
    sw.add('black', zTube(0.1, 0.13, 0.014, 0.012, 12, -0.12 + k * 0.08, 1.62));
    sw.add('black', rbox(0.01, 0.035, 0.012, 0.003, -0.12 + k * 0.08, 1.62, 0.14, 0, 0, k % 2 ? 0.5 : -0.5));
  }
  sw.label(plane(0.3, 0.04, 0, 1.51, 0.101), placardArt(ctx.atlas, ['ОБОГРЕВ СТЁКОЛ'], { w: 384, h: 48, bg: '#cfc6a2', ink: '#1d1d18', border: null, screws: false }));
}
const yTubeAt = (x, y0, y1, z) => new THREE.CylinderGeometry(0.008, 0.008, y1 - y0, 6).translate(x, (y0 + y1) / 2, z);

// Red night lamps under the sill along the front and on the side bulkheads.
function planNightLamps(ctx) {
  const f = segmentFrame(SEGMENTS[2]);
  const a = new At(ctx, 0, 0);
  a.m = f.m.clone();
  for (const x of [-3.1, -1.05, 1.05, 3.1]) {
    const u = x + f.len / 2;
    a.add('black', rbox(0.12, 0.06, 0.05, 0.01, u, SILL_Y - 0.1, LOWER_D + 0.03));
    a.add('lens', box(0.09, 0.02, 0.01, u, SILL_Y - 0.12, LOWER_D + 0.057));
  }
  for (const sx of [-1, 1]) {
    a.m = xf(sx * XI, 0, -1.0, 0, -sx * PI / 2, 0);
    a.add('black', rbox(0.12, 0.06, 0.05, 0.01, 0, SILL_Y - 0.1, LOWER_D + 0.03));
    a.add('lens', box(0.09, 0.02, 0.01, 0, SILL_Y - 0.12, LOWER_D + 0.057));
  }
}

// ---------------------------------------------------------------- instanced moving parts

function mergeGlass(list) {
  const geos = list.map((g) => {
    const c = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k);
    if (!c.attributes.normal) c.computeVertexNormals();
    return c;
  });
  return geos.length ? mergeGeometries(geos) : new THREE.BufferGeometry();
}

// Pointer needles: a tapered blade with a tail, instanced; value(s) returns the dial angle in
// degrees, clockwise from twelve o'clock as the faces are drawn.
function needleMesh(list) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.22);
  shape.lineTo(0.5, -0.22);
  shape.lineTo(0.22, 0.6);
  shape.lineTo(0.0, 1.0);
  shape.lineTo(-0.22, 0.6);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
  g.scale(1, 1, 0.025);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.2, envMapIntensity: INTERIOR_ENV });
  const mesh = new THREE.InstancedMesh(g, mat, Math.max(1, list.length));
  mesh.name = 'bridge:needles';
  mesh.frustumCulled = false; // small, always near the eye; instances move every frame
  mesh.castShadow = false;
  mesh.count = list.length;
  const c = new THREE.Color(), m = new THREE.Matrix4(), r = new THREE.Matrix4(), sc = new THREE.Matrix4();
  list.forEach((n, i) => mesh.setColorAt(i, c.set(n.color)));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return {
    mesh,
    update(s) {
      list.forEach((n, i) => {
        const deg = n.value ? n.value(s) : 0;
        r.makeRotationZ((-deg * PI) / 180);
        sc.makeScale(n.w * 2, n.len, 1);
        m.copy(n.m).multiply(r).multiply(sc);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// Gyro repeater cards: discs with the compass card art, turning with the ship's head.
function cardMesh(list, material, atlas) {
  const g = new THREE.CircleGeometry(1, 64);
  atlasUV(g, dialArt(atlas, { kind: 'compass', size: 384, face: '#ebe6d2', seed: 90 }));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  const mesh = new THREE.InstancedMesh(g, material, Math.max(1, list.length));
  mesh.name = 'bridge:cards';
  mesh.frustumCulled = false;
  mesh.count = list.length;
  const m = new THREE.Matrix4(), r = new THREE.Matrix4(), sc = new THREE.Matrix4();
  return {
    mesh,
    update(s) {
      list.forEach((c, i) => {
        r.makeRotationZ(c.value ? c.value(s) : 0);
        sc.makeScale(c.r, c.r, 1);
        m.copy(c.m).multiply(r).multiply(sc);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// Wipers outside every window: arm and blade, instanced, pivoting at the bottom of the glass.
function wiperMeshes(list, M) {
  const prep = (g, h = 2.2) => {
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    g.setAttribute('aH', new THREE.BufferAttribute(new Float32Array(n).fill(h), 1));
    g.setAttribute('aEdge', new THREE.BufferAttribute(new Float32Array(n), 1));
    return g;
  };
  // unit length along +Y: hub, arm, and the blade carrier
  const arm = prep(mergeGeo([
    zTube(-0.02, 0.02, 0.025, 0.025, 12),
    box(0.012, 0.95, 0.008, 0, 0.5, 0.0),
    box(0.02, 0.06, 0.02, 0, 0.98, 0.01),
  ]));
  const blade = prep(mergeGeo([box(0.03, 0.9, 0.012, 0, 0.56, 0.022), box(0.008, 0.9, 0.02, 0, 0.56, 0.036)]));
  const meshes = [new THREE.InstancedMesh(arm, M.black, Math.max(1, list.length)), new THREE.InstancedMesh(blade, M.rubber, Math.max(1, list.length))];
  meshes.forEach((m, i) => { m.name = `bridge:wipers${i}`; m.count = list.length; m.castShadow = true; m.frustumCulled = false; });
  const m4 = new THREE.Matrix4(), r = new THREE.Matrix4(), sc = new THREE.Matrix4();
  // the arm rotates about the pivot's local +Z (the wall normal): park angle lies along the frame
  const set = (t) => {
    list.forEach((w, i) => {
      const a = t == null ? -1.25 : Math.sin(t * 1.0 + w.phase) * 0.85;
      r.makeRotationZ(a);
      sc.makeScale(1, w.len, 1);
      m4.copy(w.m).multiply(r).multiply(sc);
      meshes[0].setMatrixAt(i, m4);
      // the blade keeps its own proportions: a second scale on the blade carrier only
      meshes[1].setMatrixAt(i, m4);
    });
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  };
  set(null);
  let parked = true;
  return {
    meshes,
    update(t) {
      if (t == null) { if (!parked) { set(null); parked = true; } return; }
      parked = false;
      set(t);
    },
  };
}

function mergeGeo(list) {
  return mergeGeometries(list.map((g) => {
    const c = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k);
    return c;
  }));
}
