import * as THREE from 'three';
import {
  V, PI, TAU, xf, box, rbox, sphere, yTube, zTube, xTube, rod, pipe, plane, disc, lathe, xLathe, zLathe, rrectShape, rrectRing, rrectSlab, loft, planRing,
  sideProfile, markEdges, mergeAll, heads, bolts, screwFrame, handwheel, lobedShape, Parts, mulberry32, atlasUV,
} from './kit.js';
import { dialArt, placardArt, drumBandArt, chartArt, logbookArt, panelArt, stencilArt } from './art.js';
import { roomOcclusion } from './room.js';
import { FOOTPRINTS, CEIL, ZA } from './layout.js';

// Bridge fittings. Each is built in its own frame (deck at y = 0, the operator's side +Z) and
// placed by an At. Evidence: helm, twin telegraph and optical sight from the 2015 photographs
// (refs/photos/kirov-bridge-*.jpg); the telegraph's lettered drums and plates also follow the
// destroyer Razumny's telegraph (refs/photos/razumny-engine-telegraph.jpg); the chart table,
// cream equipment cases and red frame stencils follow Project 1143 Minsk (refs/photos/minsk-1143-*).
// Repeat station and tactical CRT consoles are gameplay reconstructions.

export class At {
  constructor(ctx, x, z, ry = 0, y = 0) {
    this.ctx = ctx;
    this.m = xf(x, y, z, 0, ry, 0);
    this.x = x; this.z = z; this.ry = ry;
  }
  T(g) { return g.applyMatrix4(this.m); }
  add(key, g, o) { this.ctx.P.add(key, this.T(g), o); return this; }
  label(g, r) { this.ctx.label(this.T(g), r); return this; }
  decal(g, r) { this.ctx.decal(this.T(g), r); return this; }
  dial(g, r) { this.ctx.dial(this.T(g), r); return this; }
  // a point in room space
  p(x, y, z) { return V(x, y, z).applyMatrix4(this.m); }
  // the matrix of a local frame (for needles, cards and pivots)
  frame(x, y, z, rx = 0, ry = 0, rz = 0) { return this.m.clone().multiply(xf(x, y, z, rx, ry, rz)); }
  // a moving part: a Group placed at the local frame, with its own parts collector
  pivot(name, x, y, z, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.Group();
    g.name = name;
    this.frame(x, y, z, rx, ry, rz).decompose(g.position, g.quaternion, g.scale);
    this.ctx.group.add(g);
    const parts = new Parts(this.ctx.M, { occlusion: roomOcclusion });
    const build = () => { g.updateMatrix(); parts.build(g, { frame: g.matrix, name }); };
    this.ctx.builds.push(build);
    return { group: g, parts, add: (key, geom, o) => parts.add(key, geom, o), base: g.quaternion.clone() };
  }
  // the same from a full matrix in the fitting's frame (hinges off a tilted face)
  pivotM(name, local) {
    const g = new THREE.Group();
    g.name = name;
    this.m.clone().multiply(local).decompose(g.position, g.quaternion, g.scale);
    this.ctx.group.add(g);
    const parts = new Parts(this.ctx.M, { occlusion: roomOcclusion });
    this.ctx.builds.push(() => { g.updateMatrix(); parts.build(g, { frame: g.matrix, name }); });
    return { group: g, parts, add: (key, geom, o) => parts.add(key, geom, o), base: g.quaternion.clone() };
  }
  footprint(hx, hz, h, k = 0.42) { FOOTPRINTS.push({ x: this.x, z: this.z, hx: Math.abs(Math.cos(this.ry)) * hx + Math.abs(Math.sin(this.ry)) * hz, hz: Math.abs(Math.sin(this.ry)) * hx + Math.abs(Math.cos(this.ry)) * hz, h, k }); }
}

// Round instrument: bezel ring, face (atlas), glass, needle pivot. Face normal +Z at (x, y, z).
// Returns the needle frame (rotate about local z; 0 points up).
export function instrument(a, x, y, z, r, spec, { rx = 0, ry = 0, bezel = 'black', needle = true, needleColor = 0x161616, len = 0.8, value = null, depth = 0.05 } = {}) {
  const f = xf(x, y, z, rx, ry, 0);
  const G = (g) => g.applyMatrix4(f);
  a.add(bezel, G(zLathe([[-depth, r * 1.02], [-depth * 0.4, r * 1.08], [0.0, r * 1.12], [0.012, r * 1.1], [0.016, r * 0.98], [0.008, r * 0.94]], 32)));
  a.add('chrome', G(zLathe([[0.006, r * 0.97], [0.014, r * 1.0], [0.019, r * 0.97]], 32)));
  a.dial(G(disc(r * 0.94, 0, 0, 0.002)), dialArt(a.ctx.atlas, spec));
  a.add('dialGlass', G(disc(r * 0.95, 0, 0, 0.012)));
  if (needle && value) {
    a.ctx.needles.push({ m: a.frame(x, y, z, rx, ry, 0).multiply(xf(0, 0, 0.006)), len: r * len, w: r * 0.06, color: needleColor, value });
    a.add('black', G(zTube(0.004, 0.012, r * 0.07, r * 0.06, 12)));
  }
  return f;
}

// ---------------------------------------------------------------- helm

// The curved cast helm housing with two chromed grips on a turning bar
// (refs/photos/kirov-bridge-helm-detail.jpg), a gyro repeater card set into its sloped face.
export function buildHelm(ctx, x, z) {
  const a = new At(ctx, x, z);
  a.footprint(0.36, 0.33, 1.1);
  a.add('hammer', rbox(0.72, 0.045, 0.64, 0.02, 0, 0.022, 0));
  a.add('steel', bolts([V(-0.31, 0.045, -0.27), V(0.31, 0.045, -0.27), V(-0.31, 0.045, 0.27), V(0.31, 0.045, 0.27)], V(0, 1, 0), 0.016, 0.012));
  // pedestal: tapered and rounded, with an inspection plate toward the helmsman
  a.add('hammer', sideProfile([[-0.18, 0.04], [0.2, 0.04], [0.17, 0.72], [-0.17, 0.72]], 0.46, 0.04));
  a.add('hammer', rbox(0.3, 0.42, 0.02, 0.02, 0, 0.36, 0.182, -0.04));
  a.add('steel', screwFrame(V(0, 0.36, 0.195), V(1, 0, 0), V(0, 1, 0), 0.25, 0.37, V(0, 0, 1), 0.006));
  a.label(plane(0.2, 0.045, 0, 0.5, 0.198, -0.04), placardArt(ctx.atlas, ['РУЛЕВОЙ ПРИБОР', 'ЗАВ. № 1144-07'], { w: 384, h: 96, bg: '#b9b29a', ink: '#1d1d18', border: '#4b4a40' }));
  // the cast head: a bulging casting whose after face slopes up toward the helmsman
  // (the photographed housing is rounded all over, heavier than the pedestal)
  a.add('hammer', loft([
    planRing(0.5, 0.44, 0.05, 0.68, 0.0),
    planRing(0.6, 0.56, 0.08, 0.72, 0.0),
    planRing(0.66, 0.62, 0.11, 0.8, -0.01),
    planRing(0.67, 0.62, 0.13, 0.86, -0.02),
    planRing(0.64, 0.5, 0.14, 0.93, -0.05),
    planRing(0.56, 0.36, 0.13, 0.975, -0.08),
    planRing(0.44, 0.24, 0.1, 0.997, -0.1),
  ]));
  // a cast lip round the sloped face
  const slope = Math.atan2(0.11, 0.22);
  const fx = (t) => [0.29 - 0.22 * t, 0.86 + 0.11 * t];
  const [sz, sy] = fx(0.5);
  a.add('hammer', rbox(0.5, 0.2, 0.02, 0.01, 0, sy + 0.012, sz - 0.004, -(PI / 2 - slope)));
  // gyro repeater in the face: bowl, card (rotates with heading), lubber line
  const [cz, cy] = fx(0.45);
  const tilt = -(PI / 2 - slope);
  const cf = xf(-0.1, cy + 0.03, cz + 0.02, tilt, 0, 0);
  a.add('black', zLathe([[-0.03, 0.085], [0.0, 0.092], [0.012, 0.09], [0.016, 0.08]], 32).applyMatrix4(cf));
  ctx.cards.push({ m: a.frame(-0.1, cy + 0.03, cz + 0.02, tilt, 0, 0).multiply(xf(0, 0, 0.004)), r: 0.074, value: (s) => s.heading || 0 });
  a.add('dialGlass', disc(0.08, 0, 0, 0.014).applyMatrix4(cf));
  a.add('red', box(0.004, 0.02, 0.004, 0, 0.068, 0.01).applyMatrix4(cf));
  // rudder order dial beside it, lamps and the steering mode switch
  instrument(a, 0.13, cy + 0.03, cz + 0.02, 0.06, { kind: 'rudder', label: 'ЗАДАНО', size: 192, seed: 41 }, { rx: tilt, value: (s) => ((s.rudderOrder || 0) / 35) * 120, len: 0.75 });
  for (let i = 0; i < 3; i++) {
    const lf = xf(-0.2 + i * 0.05 + 0.25, cy - 0.06, cz + 0.06, tilt, 0, 0);
    a.add('chrome', zLathe([[0, 0.012], [0.008, 0.012], [0.012, 0.009]], 12).applyMatrix4(lf));
    a.add('lens', disc(0.008, 0, 0, 0.013).applyMatrix4(lf));
  }
  a.add('black', zTube(0, 0.03, 0.02, 0.018, 12, -0.22, 0, 0).applyMatrix4(xf(0, cy - 0.06, cz + 0.05, tilt, 0, 0)));
  a.add('black', rbox(0.012, 0.05, 0.016, 0.004, -0.22, 0.0, 0.03).applyMatrix4(xf(0, cy - 0.06, cz + 0.05, tilt, 0, 0)));
  a.label(plane(0.24, 0.03, 0, -0.085, 0.012).applyMatrix4(cf.clone().multiply(xf(0.1, 0, 0))), placardArt(ctx.atlas, ['КУРС       РУЛЬ'], { w: 384, h: 48, bg: '#1c201d', ink: '#d6d2bc', border: null, screws: false }));
  // bar and grips: the bar turns about a vertical post through the head's crown; the grips stand
  // 0.44 m apart at hand height (1.08 m), as the photographed pair
  const bar = a.pivot('helm-bar', 0, 1.0, -0.12);
  bar.add('chrome', lathe([[0.07, -0.03], [0.072, -0.01], [0.06, 0.012], [0.04, 0.03], [0.03, 0.045], [0.0001, 0.047]], 28));
  bar.add('chrome', xTube(-0.22, 0.22, 0.016, 0.016, 16, 0.028, 0));
  for (const s of [-1, 1]) {
    bar.add('chrome', sphere(0.024, s * 0.22, 0.028, 0, 1, 1, 1, 16));
    // the grip: a hand-filling chromed handle with a cupped cap, on a short post
    bar.add('chrome', lathe([[0.014, 0.03], [0.016, 0.05], [0.026, 0.058], [0.03, 0.075], [0.027, 0.11], [0.029, 0.15], [0.033, 0.168], [0.033, 0.182], [0.026, 0.19], [0.012, 0.188], [0.01, 0.182], [0.0001, 0.182]], 24).translate(s * 0.22, 0, 0));
    bar.add('black', yTube(0.098, 0.106, 0.0285, 0.0285, 24, s * 0.22, 0));
  }
  ctx.anim.helmBar = bar;
  ctx.anchors.helmGrips = [V(-0.22, 0.1, 0), V(0.22, 0.1, 0)].map((p) => ({ group: bar.group, p }));
  return a;
}

// ---------------------------------------------------------------- telegraph

// Twin engine telegraph (refs/photos/kirov-bridge-telegraph-detail.jpg): two lettered drums with
// chromed rims and bolted bands on a cast pedestal whose sloped face carries the two reply dials.
// Drum axis athwartships; each lever straddles its drum and swings fore and aft.
export function buildTelegraph(ctx, x, z) {
  const a = new At(ctx, x, z);
  a.footprint(0.34, 0.3, 1.2);
  a.add('hammer', rbox(0.62, 0.04, 0.56, 0.02, 0, 0.02, 0));
  a.add('steel', bolts([V(-0.26, 0.04, -0.23), V(0.26, 0.04, -0.23), V(-0.26, 0.04, 0.23), V(0.26, 0.04, 0.23)], V(0, 1, 0), 0.015, 0.012));
  a.add('hammer', sideProfile([[-0.17, 0.04], [0.19, 0.04], [0.16, 0.62], [-0.15, 0.62]], 0.42, 0.04));
  // head with the sloped dial face toward the operator
  const head = [[-0.2, 0.6], [0.17, 0.6], [0.27, 0.68], [0.27, 0.74], [0.08, 0.88], [-0.2, 0.88]];
  a.add('hammer', sideProfile(head, 0.56, 0.03, 8));
  const slope = Math.atan2(0.88 - 0.74, 0.27 - 0.08), tilt = -(PI / 2 - slope);
  const fz = 0.175, fy = 0.81;
  for (const s of [-1, 1]) {
    instrument(a, s * 0.13, fy, fz + 0.01, 0.075, { kind: 'gauge', min: -100, max: 100, major: 10, skipLabels: 2, a0: -120, a1: 120, label: s < 0 ? 'ЛЕВЫЙ' : 'ПРАВЫЙ', sub: 'ОБ/МИН %', red: [-100, -40], green: [40, 100], face: '#dcd2b0', size: 192, seed: 50 + s }, { rx: tilt, value: (st) => (st.shaftRpm || 0) * 1.2, len: 0.78, bezel: 'hammer' });
  }
  a.label(plane(0.36, 0.05, 0, 0.645, 0.2, -0.05), placardArt(ctx.atlas, ['МАШИННЫЙ ТЕЛЕГРАФ'], { w: 512, h: 72, bg: '#1c201d', ink: '#d6d2bc', border: '#7d7f72' }));
  // the drum carriage on the head's crown
  const ay = 0.99, az = -0.06, R = 0.165, L = 0.15, LV = 0.27;
  a.add('hammer', rbox(0.14, 0.17, 0.2, 0.03, 0, 0.92, az));
  const band = drumBandArt(ctx.atlas);
  const levers = [];
  for (const s of [-1, 1]) {
    const x0 = s * 0.03, x1 = s * (0.03 + L), xm = (x0 + x1) / 2;
    // drum body with chromed rims, bolt circles and the lettered band
    a.add('hammer', xTube(x0, x1, R * 0.96, R * 0.96, 40, ay, az));
    for (const xe of [x0, x1]) {
      a.add('chrome', xLathe([[xe - 0.012, R * 0.92], [xe - 0.008, R * 1.04], [xe + 0.008, R * 1.04], [xe + 0.012, R * 0.92]].sort((p, q) => p[0] - q[0]), 40).translate(0, ay, az));
      const pts = [];
      for (let k = 0; k < 10; k++) { const t = (k / 10) * TAU; pts.push(V(xe + s * 0.0, ay + Math.cos(t) * R * 0.98, az + Math.sin(t) * R * 0.98)); }
      a.add('steel', heads(pts.map((p) => p.clone().add(V(0, 0, 0))), V(s, 0, 0), 0.007));
    }
    const bandG = new THREE.CylinderGeometry(R * 0.975, R * 0.975, L - 0.03, 48, 1, true);
    atlasUV(bandG, band);
    a.label(bandG.applyMatrix4(xf(xm, ay, az, 0, 0, PI / 2)), band);
    // outer end: order dial under glass in a chromed bezel
    const xe = x1 + s * 0.012;
    const ef = xf(xe, ay, az, 0, s * PI / 2, 0);
    a.add('chrome', zLathe([[-0.01, R * 0.98], [0.006, R * 1.0], [0.016, R * 0.92], [0.012, R * 0.86]], 40).applyMatrix4(ef));
    a.dial(disc(R * 0.86, 0, 0, 0.004).applyMatrix4(ef), dialArt(ctx.atlas, { kind: 'order', label: s < 0 ? 'ЛЕВАЯ' : 'ПРАВАЯ', size: 256, seed: 60 + s }));
    a.add('dialGlass', disc(R * 0.88, 0, 0, 0.012).applyMatrix4(ef));
    ctx.needles.push({ m: a.frame(xe, ay, az, 0, s * PI / 2, 0).multiply(xf(0, 0, 0.008)), len: R * 0.78, w: 0.012, color: 0x9a1c12, value: (st) => -(st.telegraphReply?.[s < 0 ? 0 : 1] ?? 0) * 30 });
    a.add('black', zTube(0.006, 0.016, 0.014, 0.012, 12).applyMatrix4(ef));
    // the lever straddles the drum: two flat arms on the axis joined by a chromed grip
    const lv = a.pivot('telegraph-lever', xm, ay, az);
    for (const xe2 of [x0 + s * 0.004, x1 - s * -0.004]) {
      lv.add('chrome', xTube(xe2 - 0.008, xe2 + 0.008, 0.03, 0.03, 20, 0, 0).translate(-xm, 0, 0));
      lv.add('chrome', rbox(0.012, LV - 0.03, 0.034, 0.006, xe2 - xm + s * 0.006, LV / 2 + 0.02, 0));
    }
    lv.add('chrome', xTube(x0 - xm - 0.012, x1 - xm + 0.012, 0.024, 0.024, 18, LV, 0));
    lv.add('chrome', xLathe([[x0 - xm - 0.03, 0.0001], [x0 - xm - 0.03, 0.026], [x0 - xm - 0.012, 0.03], [x1 - xm + 0.012, 0.03], [x1 - xm + 0.03, 0.026], [x1 - xm + 0.03, 0.0001]].sort((p, q) => p[0] - q[0]), 20).translate(0, LV, 0));
    lv.add('black', rbox(0.03, 0.03, 0.05, 0.008, 0, LV * 0.55, -0.03));
    levers.push(lv);
  }
  // pawl sector between the drums with notches for each order
  a.add('chrome', rbox(0.05, 0.04, 0.26, 0.012, 0, ay + R + 0.01, az));
  ctx.anim.levers = levers;
  ctx.anchors.telegraphGrips = levers.map((lv) => ({ group: lv.group, p: V(0, LV, 0) }));
  return a;
}

// ---------------------------------------------------------------- optical sight

// Cream optical bearing sight on its column (refs/photos/kirov-bridge-telegraph-reference.jpg and
// kirov-bridge-sight-detail.jpg): flanged base, tapered column, bolted head with a black
// adjustment wheel on top, eyepiece, objective and tubular handgrips. The head trains slowly.
export function buildSight(ctx, x, z, ry = 0) {
  const a = new At(ctx, x, z, ry);
  a.footprint(0.3, 0.3, 1.2);
  a.add('cream', lathe([[0.0001, 0.0], [0.3, 0.0], [0.3, 0.035], [0.26, 0.05], [0.14, 0.07], [0.11, 0.12], [0.1, 0.2]], 36));
  const bp = [];
  for (let k = 0; k < 8; k++) { const t = (k / 8) * TAU + 0.2; bp.push(V(Math.cos(t) * 0.25, 0.04, Math.sin(t) * 0.25)); }
  a.add('steel', bolts(bp, V(0, 1, 0), 0.016, 0.014));
  a.add('cream', lathe([[0.1, 0.2], [0.085, 1.05], [0.1, 1.1], [0.16, 1.13], [0.17, 1.17], [0.12, 1.19]], 28));
  // graduated training ring
  a.add('brass', lathe([[0.165, 1.17], [0.178, 1.175], [0.178, 1.195], [0.165, 1.2]], 40));
  const head = a.pivot('sight-head', 0, 1.2, 0);
  const H = head;
  H.add('cream', lathe([[0.0001, 0], [0.15, 0.0], [0.16, 0.02], [0.14, 0.05], [0.0001, 0.06]], 28));
  // the cast housing: an angular block with chamfered corners and a bolted cover toward the observer
  H.add('cream', sideProfile([[-0.2, 0.04], [0.15, 0.04], [0.22, 0.12], [0.22, 0.38], [0.15, 0.47], [-0.14, 0.47], [-0.22, 0.4], [-0.22, 0.13]], 0.38, 0.018));
  H.add('cream', rbox(0.3, 0.24, 0.025, 0.02, 0, 0.26, 0.225));
  H.add('steel', screwFrame(V(0, 0.26, 0.24), V(1, 0, 0), V(0, 1, 0), 0.25, 0.19, V(0, 0, 1), 0.01, 2, 2));
  // round cast bosses with recessed centres, as photographed on the cream housing
  const boss = lathe([[0.0001, 0.006], [0.014, 0.006], [0.017, 0.016], [0.034, 0.018], [0.04, 0.008], [0.042, 0.0]], 20);
  for (const s of [-1, 1]) {
    H.add('cream', rbox(0.03, 0.26, 0.26, 0.03, s * 0.2, 0.26, 0));
    H.add('cream', boss.clone().rotateZ(-s * PI / 2).translate(s * 0.215, 0.36, -0.08));
    H.add('cream', boss.clone().rotateZ(-s * PI / 2).translate(s * 0.215, 0.16, 0.08));
    H.add('steel', xTube(s * 0.224, s * 0.236, 0.012, 0.012, 10, 0.36, -0.08));
  }
  H.add('cream', boss.clone().rotateX(PI / 2).translate(-0.1, 0.42, 0.2));
  H.add('cream', boss.clone().rotateX(PI / 2).translate(0.1, 0.1, 0.2));
  // top: the black adjustment wheel on a cream turret
  H.add('cream', lathe([[0.0001, 0.46], [0.09, 0.46], [0.09, 0.5], [0.075, 0.52], [0.0001, 0.53]], 28));
  H.add('bakelite', lathe([[0.0001, 0.52], [0.1, 0.52], [0.11, 0.535], [0.11, 0.575], [0.1, 0.59], [0.03, 0.6], [0.0001, 0.6]], 36));
  for (let k = 0; k < 24; k++) { const t = (k / 24) * TAU; H.add('bakelite', box(0.008, 0.04, 0.012, Math.cos(t) * 0.11, 0.555, Math.sin(t) * 0.11, 0, -t, 0)); }
  H.add('chrome', rbox(0.06, 0.03, 0.03, 0.008, 0.08, 0.5, 0.08));
  // eyepiece toward the observer, objective forward
  H.add('cream', zTube(0.18, 0.24, 0.05, 0.045, 20, 0, 0.33));
  H.add('black', zLathe([[0.24, 0.038], [0.3, 0.036], [0.31, 0.042], [0.36, 0.04], [0.37, 0.034]], 20).translate(0, 0.33, 0));
  H.add('rubber', zLathe([[0.36, 0.032], [0.39, 0.045], [0.4, 0.048], [0.405, 0.04]], 20).translate(0, 0.33, 0));
  H.add('cream', zLathe([[-0.36, 0.085], [-0.33, 0.09], [-0.3, 0.082], [-0.18, 0.078]], 24).translate(0, 0.33, 0));
  H.add('black', zLathe([[-0.375, 0.07], [-0.36, 0.088], [-0.345, 0.09]], 24).translate(0, 0.33, 0));
  H.add('dialGlass', disc(0.07, 0, 0.33, -0.37, 0, PI, 0));
  // handgrips: cream arms and black tubes, the observer's two hands
  for (const s of [-1, 1]) {
    H.add('cream', rod(V(s * 0.19, 0.16, 0.06), V(s * 0.33, 0.1, 0.2), 0.022, 10));
    H.add('black', zLathe([[0.16, 0.026], [0.18, 0.03], [0.34, 0.03], [0.36, 0.026]], 16).translate(s * 0.34, 0.1, 0));
    H.add('chrome', zTube(0.355, 0.37, 0.022, 0.018, 12, s * 0.34, 0.1));
  }
  H.add('red', rbox(0.03, 0.03, 0.02, 0.008, 0.33, 0.13, 0.36));
  ctx.anim.sightHead = H;
  ctx.anchors.sightGrips = [V(-0.34, 0.1, 0.27), V(0.34, 0.1, 0.27)].map((p) => ({ group: H.group, p }));
  a.label(plane(0.2, 0.05, 0, 0.7, 0.096, -0.02), placardArt(ctx.atlas, ['ВИЗИР ЦУ'], { w: 256, h: 64, bg: '#cfc6a2', ink: '#1d1d18', border: '#5d5848' }));
  return a;
}

// ---------------------------------------------------------------- gyro repeater (pelorus)

export function buildPelorus(ctx, x, z, ry = 0) {
  const a = new At(ctx, x, z, ry);
  a.footprint(0.22, 0.22, 1.2, 0.35);
  a.add('grey', lathe([[0.0001, 0], [0.22, 0], [0.22, 0.03], [0.12, 0.06], [0.08, 0.12], [0.07, 0.95], [0.11, 1.02], [0.17, 1.08], [0.19, 1.12]], 28));
  a.add('black', lathe([[0.19, 1.12], [0.2, 1.13], [0.2, 1.16], [0.18, 1.165]], 40));
  a.add('brass', lathe([[0.18, 1.165], [0.205, 1.168], [0.205, 1.18], [0.18, 1.182]], 48));
  ctx.cards.push({ m: a.frame(0, 1.15, 0, -PI / 2, 0, 0), r: 0.165, value: (s) => s.heading || 0 });
  a.add('dialGlass', disc(0.18, 0, 1.175, 0, -PI / 2, 0, 0));
  // alidade: the turning bar with its two sighting vanes
  a.add('brass', box(0.42, 0.012, 0.03, 0, 1.19, 0, 0, 0.35, 0));
  for (const s of [-1, 1]) {
    const p = V(Math.cos(0.35) * s * 0.2, 1.19, -Math.sin(0.35) * s * 0.2);
    a.add('black', box(0.012, 0.12, 0.04, p.x, 1.25, p.z, 0, 0.35, 0));
  }
  a.add('brass', yTube(1.18, 1.21, 0.02, 0.018, 12, 0, 0));
  a.label(plane(0.16, 0.04, 0, 0.8, 0.074, 0), placardArt(ctx.atlas, ['РЕПИТЕР ГК'], { w: 256, h: 64, bg: '#1c201d', ink: '#d6d2bc' }));
  return a;
}

// ---------------------------------------------------------------- commander's chair

// Tall bridge chair: tan seat and armrests, worn brown velour back (refs/photos/kirov-bridge-chair-reference.jpg).
export function buildChair(ctx, x, z, ry = 0) {
  const a = new At(ctx, x, z, ry);
  a.footprint(0.3, 0.3, 1.0, 0.3);
  a.add('black', lathe([[0.0001, 0], [0.28, 0], [0.28, 0.02], [0.08, 0.05], [0.05, 0.08]], 28));
  a.add('chrome', yTube(0.08, 0.72, 0.045, 0.04, 16));
  a.add('chrome', lathe([[0.26, 0.4], [0.27, 0.41], [0.26, 0.42]], 32));
  for (let k = 0; k < 3; k++) { const t = (k / 3) * TAU; a.add('chrome', rod(V(0, 0.41, 0), V(Math.cos(t) * 0.26, 0.41, Math.sin(t) * 0.26), 0.008, 6)); }
  a.add('black', rbox(0.46, 0.06, 0.44, 0.02, 0, 0.74, 0));
  a.add('tan', rbox(0.52, 0.1, 0.5, 0.05, 0, 0.81, -0.01));
  a.add('tan', rbox(0.46, 0.035, 0.42, 0.016, 0, 0.87, -0.02));
  // the back: a curved tan shell wrapping round to the arms, brown velour panels inside it
  const sector = (r0, r1, a0, a1) => {
    const sh = new THREE.Shape();
    sh.absarc(0, 0, r1, a0, a1, false);
    sh.absarc(0, 0, r0, a1, a0, true);
    return sh;
  };
  const shell = new THREE.ExtrudeGeometry(sector(0.27, 0.31, -1.04 * PI, 0.04 * PI), { depth: 0.52, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 20 });
  markEdges(shell, 'z');
  a.add('tan', shell.rotateX(-PI / 2).translate(0, 0.84, 0.02));
  const pad = new THREE.ExtrudeGeometry(sector(0.24, 0.272, -0.86 * PI, -0.14 * PI), { depth: 0.44, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.012, bevelSegments: 2, curveSegments: 16 });
  a.add('velour', pad.rotateX(-PI / 2).translate(0, 0.89, 0.02));
  for (const s of [-1, 1]) a.add('tan', rbox(0.09, 0.07, 0.36, 0.03, s * 0.29, 1.04, -0.12));
  return a;
}

// ---------------------------------------------------------------- consoles

// Cabinet with a sloped desk and a round CRT (tactical repeaters: gameplay reconstruction in the
// period's cream and green equipment style). `screen` receives the canvas display mesh.
export function buildCrtConsole(ctx, x, z, ry, { title, hood = false, screen, knobs = ['ЯРКОСТЬ', 'ДАЛЬНОСТЬ', 'УСИЛЕНИЕ'] } = {}) {
  const a = new At(ctx, x, z, ry);
  a.footprint(0.45, 0.36, 1.45);
  a.add('darkGreen', rbox(0.88, 0.9, 0.66, 0.04, 0, 0.45, 0));
  a.add('green', rbox(0.76, 0.66, 0.02, 0.015, 0, 0.46, 0.335));
  a.add('steel', screwFrame(V(0, 0.46, 0.347), V(1, 0, 0), V(0, 1, 0), 0.7, 0.6, V(0, 0, 1), 0.006, 3, 3));
  for (let k = 0; k < 6; k++) a.add('black', box(0.5, 0.01, 0.01, 0, 0.18 + k * 0.03, 0.348));
  // sloped desk with switches and the display head above it
  const prof = [[-0.33, 0.9], [0.36, 0.9], [0.36, 0.95], [0.0, 1.06], [-0.33, 1.06]];
  a.add('grey', sideProfile(prof, 0.86, 0.02));
  const slope = Math.atan2(0.11, 0.36);
  for (let k = 0; k < 6; k++) {
    const sx = -0.3 + k * 0.12, zz = 0.27, yy = 0.95 + (0.36 - zz) * Math.tan(slope) + 0.005;
    a.add('steel', rbox(0.016, 0.012, 0.032, 0.004, sx, yy + 0.012, zz, -slope + (k % 2 ? 0.4 : -0.4)));
    a.add('black', yTube(yy - 0.004, yy + 0.004, 0.016, 0.016, 12, sx, zz));
  }
  a.add('grey', rbox(0.78, 0.52, 0.5, 0.06, 0, 1.31, -0.05));
  const fz = 0.2;
  a.add('black', rrectSlab(0.7, 0.46, 0.06, 0.012, 0.004).translate(0, 1.31, fz));
  // CRT bezel and the screen, optionally with a short rubber viewing hood
  a.add('black', zLathe([[fz - 0.01, 0.2], [fz + 0.02, 0.2], [fz + 0.025, 0.185], [fz + 0.018, 0.172]], 40).translate(-0.1, 1.31, 0));
  if (hood) a.add('rubber', zLathe([[fz + 0.02, 0.2], [fz + 0.12, 0.22], [fz + 0.13, 0.215], [fz + 0.03, 0.193]], 40).translate(-0.1, 1.31, 0));
  if (screen) screen(a.frame(-0.1, 1.31, fz + 0.016), 0.172);
  a.add('dialGlass', disc(0.178, -0.1, 1.31, fz + 0.02));
  knobs.forEach((t, k) => {
    const ky = 1.44 - k * 0.12;
    a.add('black', zLathe([[fz + 0.012, 0.025], [fz + 0.03, 0.025], [fz + 0.04, 0.02], [fz + 0.045, 0.012]], 16).translate(0.25, ky, 0));
    a.add('chrome', zTube(fz + 0.012, fz + 0.016, 0.03, 0.03, 16, 0.25, ky));
    a.label(plane(0.1, 0.022, 0.25, ky - 0.045, fz + 0.013), placardArt(ctx.atlas, [t], { w: 192, h: 44, bg: '#151816', ink: '#cfccb5', border: null, screws: false }));
  });
  a.label(plane(0.36, 0.05, -0.1, 1.08 + 0.0, fz + 0.013), placardArt(ctx.atlas, [title], { w: 512, h: 72, bg: '#151816', ink: '#d5d1b8', border: '#6b6c60', screws: false }));
  return a;
}

// The guarded weapons-command repeat station (gameplay reconstruction): annunciator tiles for
// every firing stage, a status window, weapon selector, key switch, launch push under a red guard.
export function buildRepeatStation(ctx, x, z, ry, hooks, { selector = 'ОСА  ГРАНИТ  ФОРТ' } = {}) {
  const a = new At(ctx, x, z, ry);
  a.footprint(0.42, 0.33, 1.3);
  a.add('darkGreen', rbox(0.84, 0.92, 0.6, 0.035, 0, 0.46, 0));
  a.add('green', rbox(0.72, 0.68, 0.02, 0.012, 0, 0.47, 0.305));
  a.add('steel', screwFrame(V(0, 0.47, 0.316), V(1, 0, 0), V(0, 1, 0), 0.66, 0.62, V(0, 0, 1), 0.006, 3, 3));
  a.add('steel', rbox(0.12, 0.02, 0.02, 0.006, 0.25, 0.62, 0.325));
  a.label(plane(0.5, 0.06, 0, 0.82, 0.318), placardArt(ctx.atlas, ['ПОВТОРИТЕЛЬ КОМАНД', 'ПУСКА РАКЕТ'], { w: 512, h: 96, bg: '#1b221d', ink: '#e0dcc2', border: '#8a8b78' }));
  // the sloped control face
  const tilt = -0.62;
  const face = xf(0, 1.05, 0.08, tilt, 0, 0);
  a.add('grey', rbox(0.84, 0.5, 0.12, 0.04, 0, 0, -0.06).applyMatrix4(face));
  a.add('grey', rbox(0.84, 0.18, 0.5, 0.04, 0, -0.18, -0.25).applyMatrix4(face));
  a.add('black', rrectSlab(0.78, 0.44, 0.03, 0.01, 0.003).applyMatrix4(face));
  a.add('steel', screwFrame(V(0, 0, 0.012), V(1, 0, 0), V(0, 1, 0), 0.74, 0.4, V(0, 0, 1), 0.006, 4, 2).applyMatrix4(face));
  // annunciator tiles (3 x 3) and the status window share one emissive canvas
  hooks.annunciator(a.frame(0, 1.05, 0.08, tilt, 0, 0).multiply(xf(-0.13, 0.06, 0.012)), 0.44, 0.24);
  hooks.status(a.frame(0, 1.05, 0.08, tilt, 0, 0).multiply(xf(-0.13, -0.135, 0.012)), 0.44, 0.1);
  a.add('black', rrectRing(0.47, 0.27, 0.01, 0.445, 0.245, 0.006, 0.012, 0.002).applyMatrix4(face.clone().multiply(xf(-0.13, 0.06, 0.008))));
  a.add('black', rrectRing(0.47, 0.13, 0.01, 0.445, 0.105, 0.006, 0.012, 0.002).applyMatrix4(face.clone().multiply(xf(-0.13, -0.135, 0.008))));
  // weapon selector (rotary, three positions) and key switch
  const sel = a.pivotM('weapon-selector', face.clone().multiply(xf(0.22, 0.1, 0)));
  sel.add('black', zLathe([[0.012, 0.04], [0.03, 0.04], [0.035, 0.034], [0.04, 0.012]], 20));
  sel.add('black', rbox(0.016, 0.07, 0.03, 0.006, 0, 0, 0.05));
  sel.add('chrome', zTube(0.012, 0.016, 0.05, 0.05, 24, 0, 0));
  ctx.anim.selector = sel;
  a.label(plane(0.2, 0.05, 0.22, 0.175, 0.013).applyMatrix4(face), placardArt(ctx.atlas, [selector], { w: 384, h: 72, bg: '#151816', ink: '#d5d1b8', border: null, screws: false }));
  a.add('chrome', zLathe([[0.012, 0.022], [0.025, 0.022], [0.03, 0.016]], 16).applyMatrix4(face.clone().multiply(xf(0.22, -0.03, 0))));
  a.add('brass', rbox(0.008, 0.03, 0.012, 0.003, 0.22, -0.03, 0.04).applyMatrix4(face));
  a.label(plane(0.1, 0.022, 0.22, -0.075, 0.013).applyMatrix4(face), placardArt(ctx.atlas, ['ВЗВЕДЕНИЕ'], { w: 192, h: 44, bg: '#151816', ink: '#d5d1b8', border: null, screws: false }));
  // launch push and its hinged red guard
  a.add('red', zTube(0.012, 0.03, 0.032, 0.028, 20, 0.22, -0.16).applyMatrix4(face));
  a.add('black', zTube(0.008, 0.014, 0.05, 0.05, 20, 0.22, -0.16).applyMatrix4(face));
  const guard = a.pivotM('launch-guard', face.clone().multiply(xf(0.22, -0.105, 0.03)));
  guard.add('red', rbox(0.11, 0.11, 0.05, 0.02, 0, -0.055, 0.02));
  guard.add('steel', xTube(-0.05, 0.05, 0.006, 0.006, 8, 0, 0));
  ctx.anim.guard = guard;
  a.label(plane(0.08, 0.02, 0.22, -0.235, 0.013).applyMatrix4(face), placardArt(ctx.atlas, ['ПУСК'], { w: 128, h: 36, bg: '#8d241e', ink: '#f0dfb4', border: null, screws: false }));
  ctx.anchors.repeatPanel = { group: null, p: a.p(0, 1.1, 0.25) };
  ctx.anchors.launchButton = { group: ctx.group, p: V(0.22, -0.16, 0.045).applyMatrix4(a.m.clone().multiply(face)) };
  return a;
}

// ---------------------------------------------------------------- chart table

// Navigator's chart table (after Minsk's, refs/photos/minsk-1143-chart-console.jpg): drawer
// cabinet, timber top with a raised rim, the glass plotting plate over the working chart, a chromed
// rail, the gooseneck lamp and the plotting instruments.
export function buildChartTable(ctx, x, z, ry) {
  const a = new At(ctx, x, z, ry);
  a.footprint(0.85, 0.45, 1.0);
  a.add('darkGreen', rbox(1.6, 0.86, 0.84, 0.03, 0, 0.43, 0));
  a.add('darkGreen', box(1.5, 0.08, 0.7, 0, 0.04, 0.02));
  for (let k = 0; k < 3; k++) {
    const y = 0.25 + k * 0.22;
    a.add('green', rbox(1.48, 0.19, 0.02, 0.012, 0, y, 0.425));
    a.add('steel', rbox(0.18, 0.025, 0.03, 0.008, 0, y + 0.04, 0.445));
    a.label(plane(0.1, 0.03, -0.45, y + 0.05, 0.437), placardArt(ctx.atlas, [['КАРТЫ 1-40', 'КАРТЫ 41-90', 'ПОСОБИЯ'][k]], { w: 192, h: 56, bg: '#d8d0b0', ink: '#1d1d18', border: '#3d3c33', screws: false }));
  }
  // top: timber frame, chart under glass, rim and rail
  a.add('wood', rbox(1.7, 0.05, 0.96, 0.012, 0, 0.885, 0));
  for (const s of [-1, 1]) {
    a.add('wood', rbox(1.7, 0.035, 0.05, 0.01, 0, 0.925, s * 0.455));
    a.add('wood', rbox(0.05, 0.035, 0.9, 0.01, s * 0.825, 0.925, 0));
  }
  a.label(plane(1.56, 0.82, 0, 0.912, 0, -PI / 2), chartArt(ctx.atlas));
  a.add('dialGlass', plane(1.58, 0.84, 0, 0.918, 0, -PI / 2));
  a.add('chrome', xTube(-0.8, 0.8, 0.012, 0.012, 10, 0.86, 0.52));
  for (const s of [-0.7, 0, 0.7]) a.add('chrome', rod(V(s, 0.86, 0.52), V(s, 0.86, 0.47), 0.01, 6));
  // parallel rule, dividers, pencils, a log book
  a.add('black', box(0.5, 0.008, 0.06, 0.15, 0.926, -0.05, 0, 0.3, 0));
  a.add('black', box(0.5, 0.008, 0.06, 0.18, 0.926, 0.05, 0, 0.3, 0));
  for (const s of [-1, 1]) a.add('brass', rod(V(0.1, 0.928, -0.04), V(0.13 + s * 0.04, 0.928, 0.05), 0.004, 6));
  a.add('steel', rod(V(-0.3, 0.93, 0.1), V(-0.2, 0.93, -0.12), 0.003, 5));
  a.add('steel', rod(V(-0.3, 0.93, 0.1), V(-0.16, 0.93, 0.08), 0.003, 5));
  a.add('red', rod(V(-0.55, 0.927, 0.2), V(-0.38, 0.927, 0.27), 0.004, 6));
  a.add('cream', rod(V(-0.6, 0.927, 0.12), V(-0.45, 0.927, 0.2), 0.004, 6));
  a.add('paper', rbox(0.26, 0.02, 0.34, 0.004, 0.55, 0.932, 0.12, 0, -0.2, 0));
  a.label(plane(0.24, 0.31, 0.55, 0.943, 0.12, -PI / 2, 0, 0.2), logbookArt(ctx.atlas));
  a.add('black', rbox(0.27, 0.012, 0.35, 0.004, 0.55, 0.92, 0.12, 0, -0.2, 0));
  // gooseneck lamp (the shade turned down onto the chart)
  a.add('black', lathe([[0.0001, 0.925], [0.07, 0.925], [0.07, 0.94], [0.03, 0.96]], 20).translate(-0.7, 0, -0.38));
  a.add('steel', pipe([V(-0.7, 0.95, -0.38), V(-0.7, 1.2, -0.36), V(-0.62, 1.38, -0.28), V(-0.5, 1.36, -0.18)], 0.008, 6));
  a.add('green', lathe([[0.03, 0.0], [0.04, -0.02], [0.08, -0.08], [0.1, -0.12]], 20).applyMatrix4(xf(-0.48, 1.36, -0.16, 0.5, 0, 0.3)));
  a.add('lamp', disc(0.09, 0, -0.1, 0, PI / 2, 0, 0).applyMatrix4(xf(-0.48, 1.36, -0.16, 0.5, 0, 0.3)));
  ctx.lamps.push(a.p(-0.45, 1.2, -0.1));
  return a;
}

// ---------------------------------------------------------------- small fittings

// Brass voice pipes coming down from the overhead, bell mouths with hinged lids.
export function buildVoicePipes(ctx, x, z) {
  const a = new At(ctx, x, z);
  [[-0.08, 'ГКП'], [0.08, 'БИП']].forEach(([dx, t], k) => {
    a.add('brass', pipe([V(dx, CEIL, 0.2), V(dx, CEIL - 0.3, 0.2), V(dx, 1.9, 0.12), V(dx, 1.62, 0.04), V(dx, 1.5, 0.0)], 0.03, 10));
    a.add('brass', lathe([[0.03, -0.0], [0.04, -0.03], [0.065, -0.08], [0.07, -0.09]], 24).applyMatrix4(xf(dx, 1.5, 0.0, PI * 0.75, 0, 0)));
    a.add('brass', disc(0.075, 0, -0.095, 0, PI / 2 + 0.6, 0, 0).applyMatrix4(xf(dx, 1.5, 0.0, PI * 0.75, 0, 0)));
    a.add('brass', box(0.02, 0.03, 0.02, dx, 1.48, 0.09));
    a.label(plane(0.07, 0.03, dx, 1.56, 0.08, -0.3), placardArt(ctx.atlas, [t], { w: 128, h: 56, bg: '#b6984f', ink: '#1d1a12', border: '#5a4a23', screws: false }));
  });
  a.add('green', box(0.3, 0.05, 0.08, 0, 1.75, 0.13));
  return a;
}

// Sound-powered telephone: cast box with hook switch, bakelite handset and coiled cord.
export function buildPhone(ctx, m, { label = 'ГКП', bell = true } = {}) {
  const P = (key, g) => ctx.P.add(key, g.applyMatrix4(m));
  P('black', rbox(0.2, 0.26, 0.1, 0.02, 0, 0, 0.05));
  P('steel', screwFrame(V(0, 0, 0.101), V(1, 0, 0), V(0, 1, 0), 0.16, 0.22, V(0, 0, 1), 0.005));
  P('black', rbox(0.05, 0.03, 0.06, 0.008, 0.07, 0.09, 0.13));
  // handset on its hook
  P('bakelite', rod(V(-0.08, 0.08, 0.13), V(-0.08, -0.12, 0.13), 0.018, 10));
  P('bakelite', sphere(0.035, -0.08, 0.1, 0.13, 1, 0.8, 0.9, 12));
  P('bakelite', sphere(0.035, -0.08, -0.14, 0.13, 1, 0.8, 0.9, 12));
  const cord = [];
  for (let i = 0; i <= 80; i++) { const t = i / 80, ang = i * 0.9; cord.push(V(-0.04 + Math.cos(ang) * 0.012, -0.14 - t * 0.22 + Math.sin(t * PI) * 0.02, 0.12 + Math.sin(ang) * 0.012)); }
  P('cable', pipe(cord, 0.004, 5, 160, 0.2));
  if (bell) {
    P('black', lathe([[0.0001, 0], [0.05, 0], [0.055, 0.02], [0.05, 0.035], [0.0001, 0.04]], 20).rotateX(PI / 2).translate(0, 0.2, 0.05));
    P('steel', zTube(0.0, 0.05, 0.008, 0.008, 8, 0, 0.2));
  }
  ctx.label(plane(0.12, 0.035, 0, -0.06, 0.102).applyMatrix4(m), placardArt(ctx.atlas, [label], { w: 192, h: 56, bg: '#d6cfb0', ink: '#1d1d18', border: '#3d3c33', screws: false }));
}

// Red portable extinguisher on its wall bracket (axis vertical, against the wall at local z = 0).
export function buildExtinguisher(ctx, m) {
  const P = (key, g) => ctx.P.add(key, g.applyMatrix4(m));
  P('red', lathe([[0.0001, 0], [0.075, 0], [0.085, 0.02], [0.085, 0.5], [0.07, 0.56], [0.03, 0.59], [0.022, 0.62]], 24).translate(0, 0, 0.1));
  P('black', yTube(0.62, 0.68, 0.018, 0.018, 10, 0, 0.1));
  P('black', rbox(0.12, 0.02, 0.025, 0.006, 0.03, 0.68, 0.1));
  P('black', pipe([V(0.02, 0.64, 0.12), V(0.08, 0.6, 0.14), V(0.1, 0.4, 0.15), V(0.07, 0.25, 0.16)], 0.01, 6));
  P('steel', box(0.18, 0.03, 0.02, 0, 0.42, 0.01));
  P('steel', box(0.18, 0.03, 0.02, 0, 0.12, 0.01));
  ctx.label(plane(0.12, 0.16, 0, 0.3, 0.186).applyMatrix4(m), placardArt(ctx.atlas, ['ОУ-5', 'ОГНЕТУШИТЕЛЬ'], { w: 160, h: 200, bg: '#e6dfc8', ink: '#8b2016', border: '#8b2016', screws: false }));
}

// "Kashtan" style intercom: cream case with a speaker grille and a row of station keys.
export function buildIntercom(ctx, m) {
  const P = (key, g) => ctx.P.add(key, g.applyMatrix4(m));
  P('cream', rbox(0.46, 0.32, 0.14, 0.03, 0, 0, 0.07));
  P('black', disc(0.09, -0.12, 0.03, 0.142, 0, 0, 0, 28));
  for (let k = -4; k <= 4; k++) P('steel', box(0.15, 0.006, 0.004, -0.12, 0.03 + k * 0.018, 0.145));
  for (let k = 0; k < 8; k++) P('black', rbox(0.024, 0.04, 0.03, 0.006, 0.02 + (k % 4) * 0.045, k < 4 ? 0.06 : -0.02, 0.15));
  P('red', rbox(0.04, 0.03, 0.03, 0.006, 0.16, -0.11, 0.15));
  ctx.label(plane(0.2, 0.035, 0.09, 0.115, 0.142).applyMatrix4(m), placardArt(ctx.atlas, ['КАШТАН'], { w: 256, h: 48, bg: '#cfc6a6', ink: '#1d1d18', border: null, screws: false }));
  ctx.label(plane(0.2, 0.03, 0.09, -0.1, 0.142).applyMatrix4(m), placardArt(ctx.atlas, ['ГКП БИП БЧ-2 БЧ-5'], { w: 256, h: 40, bg: '#cfc6a6', ink: '#1d1d18', border: null, screws: false }));
}

// The green "signal watch" cabinet with its painted name board (refs/photos/kirov-bridge-helm-detail.jpg).
export function buildSignalCabinet(ctx, x, z, ry) {
  const a = new At(ctx, x, z, ry);
  a.footprint(0.4, 0.24, 1.4, 0.3);
  a.add('darkGreen', rbox(0.8, 1.36, 0.46, 0.03, 0, 0.68, 0));
  for (const s of [-1, 1]) {
    a.add('green', rbox(0.37, 1.2, 0.02, 0.012, s * 0.195, 0.72, 0.235));
    a.add('steel', rbox(0.02, 0.1, 0.025, 0.006, s * 0.035, 0.78, 0.25));
  }
  a.label(plane(0.6, 0.15, 0, 1.18, 0.247), placardArt(ctx.atlas, ['СИГНАЛЬНАЯ', 'ВАХТА'], { w: 512, h: 128, bg: '#e6e2d2', ink: '#1b1b16', border: null, screws: false }));
  a.label(plane(0.24, 0.12, 0.2, 0.45, 0.247), placardArt(ctx.atlas, ['ДОКУМЕНТЫ', 'НЕ ВЫНОСИТЬ'], { w: 256, h: 128, bg: '#e6e2d2', ink: '#1b1b16', border: '#1b1b16', screws: false }));
  return a;
}

// Interior glazed panel with timber surround on the aft bulkhead, a dim space behind it.
export function buildAftWindow(ctx, x, y, w, h, glow = 0.4) {
  const a = new At(ctx, x, ZA, PI, y);
  a.add('wood', rrectRing(w + 0.14, h + 0.14, 0.02, w, h, 0.01, 0.05, 0.008));
  a.add('wood', rbox(w + 0.18, 0.04, 0.08, 0.01, 0, -h / 2 - 0.08, 0.03));
  a.add('void', plane(w, h, 0, 0, -0.5, 0, 0, 0));
  a.add('void', box(w, 0.02, 0.5, 0, -h / 2, -0.25));
  a.add('void', box(w, 0.02, 0.5, 0, h / 2, -0.25));
  a.add('lamp', disc(0.08, w * 0.2, h * 0.3, -0.48), { tint: new THREE.Color(glow, glow * 0.95, glow * 0.85) });
  ctx.glass.push(plane(w, h, 0, 0, 0.02).applyMatrix4(a.m));
  return a;
}

// ---------------------------------------------------------------- command console and wall cases

// The command post console across the after part of the bridge (reconstruction): a desk with a
// sloped panel of switches, lamp rings, small dials and two telephones, in the green and cream
// equipment colours of the period.
export function buildCommandConsole(ctx, x, z, ry, w = 2.4) {
  const a = new At(ctx, x, z, ry);
  a.footprint(w / 2 + 0.05, 0.36, 1.2);
  a.add('darkGreen', rbox(w, 0.82, 0.62, 0.03, 0, 0.41, 0));
  const nDoors = Math.round(w / 0.6);
  for (let k = 0; k < nDoors; k++) {
    const dx = -w / 2 + (k + 0.5) * (w / nDoors);
    a.add('green', rbox(w / nDoors - 0.05, 0.62, 0.02, 0.012, dx, 0.44, 0.315));
    a.add('steel', rbox(0.016, 0.08, 0.02, 0.005, dx + (w / nDoors) * 0.36, 0.5, 0.33));
    a.add('steel', screwFrame(V(dx, 0.44, 0.327), V(1, 0, 0), V(0, 1, 0), w / nDoors - 0.1, 0.56, V(0, 0, 1), 0.005));
  }
  // desk top and sloped panel
  a.add('wood', rbox(w + 0.06, 0.04, 0.3, 0.01, 0, 0.84, 0.2));
  const tilt = -0.95, face = xf(0, 1.0, -0.06, tilt, 0, 0);
  a.add('grey', rbox(w, 0.36, 0.06, 0.02, 0, 0, -0.03).applyMatrix4(face));
  a.add('grey', box(w, 0.2, 0.36, 0, 1.0, -0.2));
  a.add('black', rrectSlab(w - 0.08, 0.3, 0.02, 0.012, 0.003).applyMatrix4(face));
  const rnd = mulberry32(17);
  const cols = Math.round((w - 0.2) / 0.11);
  for (let k = 0; k < cols; k++) {
    const px = -w / 2 + 0.15 + k * ((w - 0.3) / (cols - 1));
    // a row of lamp rings over a row of toggle switches, with legend strips between
    const lf = face.clone().multiply(xf(px, 0.08, 0.012));
    a.add('chrome', zLathe([[0, 0.014], [0.008, 0.014], [0.012, 0.01]], 10).applyMatrix4(lf));
    a.add(rnd() < 0.3 ? 'lens' : 'bakelite', disc(0.009, 0, 0, 0.013, 0, 0, 0, 10).applyMatrix4(lf));
    const tf = face.clone().multiply(xf(px, -0.05, 0.012));
    a.add('steel', zTube(0, 0.012, 0.012, 0.01, 8).applyMatrix4(tf));
    a.add('steel', rod(V(0, 0, 0.01), V(0, rnd() < 0.5 ? 0.02 : -0.02, 0.035), 0.003, 5).applyMatrix4(tf));
  }
  a.label(plane(w - 0.2, 0.03, 0, 0.015, 0.014).applyMatrix4(face), placardArt(ctx.atlas, ['ГКП · БЧ-1 · БЧ-2 · БЧ-5 · ТРЕВОГА · ГГС · ОСВЕЩЕНИЕ · СТЕКЛООЧИСТИТЕЛИ'], { w: 1024, h: 40, bg: '#151816', ink: '#cfccb5', border: null, screws: false }));
  for (const [dx, spec] of [[-w / 2 + 0.25, { kind: 'gauge', min: 0, max: 400, major: 8, label: 'НАПРЯЖЕНИЕ', sub: 'В', seed: 31, size: 160 }], [w / 2 - 0.25, { kind: 'gauge', min: 0, max: 60, major: 6, label: 'ЧАСТОТА', sub: 'ГЦ', seed: 32, size: 160 }]]) {
    instrument(a, dx, 1.0, -0.06, 0.05, spec, { rx: tilt, value: () => (spec.max === 60 ? 50 / 60 : 220 / 400) * 270 - 135, len: 0.8 });
  }
  a.label(plane(0.6, 0.06, 0, 0.71, 0.328), placardArt(ctx.atlas, ['ПУЛЬТ ГКП'], { w: 384, h: 64, bg: '#1b221d', ink: '#e0dcc2', border: '#8a8b78' }));
  buildPhone(ctx, a.m.clone().multiply(xf(-w / 2 + 0.25, 1.06, -0.3, -0.25, 0, 0)), { label: 'БЧ-5', bell: false });
  buildPhone(ctx, a.m.clone().multiply(xf(w / 2 - 0.25, 1.06, -0.3, -0.25, 0, 0)), { label: 'БИП', bell: false });
  return a;
}

// Cream wall-mounted equipment case (after Minsk's, refs/photos/minsk-1143-wall-equipment.jpg):
// rounded cast case with a lid seam, round dials, knob row, a lamp, cable glands below with the
// cables running up to the overhead tray. Frame m: origin on the wall at the case's centre, +Z out.
export function buildWallCase(ctx, m, { w = 0.5, h = 0.6, d = 0.2, title = '', dials = [], knobs = 3, window = false, cables = 2, seed = 1 } = {}) {
  const P = (key, g, o) => ctx.P.add(key, g.applyMatrix4(m), o);
  P('cream', rbox(w, h, d, 0.035, 0, 0, d / 2));
  P('cream', rbox(w - 0.03, h - 0.03, 0.012, 0.01, 0, 0, d + 0.002));
  P('steel', screwFrame(V(0, 0, d + 0.009), V(1, 0, 0), V(0, 1, 0), w - 0.07, h - 0.07, V(0, 0, 1), 0.006, 2, 2));
  P('steel', heads([V(-w / 2 - 0.005, h * 0.3, d * 0.6), V(-w / 2 - 0.005, -h * 0.3, d * 0.6)], V(-1, 0, 0), 0.012));
  if (window) {
    P('black', rrectRing(w * 0.7, h * 0.36, 0.02, w * 0.64, h * 0.3, 0.015, 0.012, 0).translate(0, h * 0.16, d + 0.004));
    P('paper', plane(w * 0.64, h * 0.3, 0, h * 0.16, d + 0.002));
    ctx.glass.push(plane(w * 0.64, h * 0.3, 0, h * 0.16, d + 0.012).applyMatrix4(m));
  }
  const at = { ctx, add: (k, g) => ctx.P.add(k, g.applyMatrix4(m)), dial: (g, r) => ctx.dial(g.applyMatrix4(m), r), frame: (x, y, z, rx = 0, ry = 0, rz = 0) => m.clone().multiply(xf(x, y, z, rx, ry, rz)) };
  dials.forEach((spec, k) => {
    const n = dials.length, dx = n === 1 ? 0 : -w * 0.25 + (k * w * 0.5) / (n - 1);
    instrument(at, dx, window ? -h * 0.12 : h * 0.1, d + 0.008, Math.min(0.07, w / (n * 2.6)), { size: 160, ...spec, seed: seed * 10 + k }, { value: spec.value || null });
  });
  for (let k = 0; k < knobs; k++) {
    const kx = -w * 0.32 + (k * w * 0.64) / Math.max(1, knobs - 1);
    P('black', zLathe([[d + 0.008, 0.018], [d + 0.025, 0.018], [d + 0.03, 0.013]], 12).translate(kx, -h * 0.34, 0));
  }
  P('lens', disc(0.01, w * 0.4, h * 0.4, d + 0.01, 0, 0, 0, 10));
  P('chrome', zLathe([[d + 0.002, 0.016], [d + 0.008, 0.016], [d + 0.012, 0.012]], 12).translate(w * 0.4, h * 0.4, 0));
  if (title) ctx.label(plane(w * 0.6, 0.035, 0, h * 0.42, d + 0.01).applyMatrix4(m), placardArt(ctx.atlas, [title], { w: 320, h: 48, bg: '#1b1d1a', ink: '#ddd8c0', border: null, screws: false }));
  // glands and cables: down out of the case, then up the wall to the overhead
  for (let k = 0; k < cables; k++) {
    const gx = -w * 0.25 + k * 0.08;
    P('cream', yTube(-h / 2 - 0.04, -h / 2, 0.016, 0.018, 10, gx, d * 0.5));
    const top = CEIL - 0.12 - m.elements[13];
    P('cable', pipe([V(gx, -h / 2 - 0.04, d * 0.5), V(gx, -h / 2 - 0.14, d * 0.45), V(gx - w / 2 - 0.05 - k * 0.03, -h / 2 - 0.12, 0.04), V(gx - w / 2 - 0.05 - k * 0.03, top, 0.04)], 0.011, 6));
  }
}
