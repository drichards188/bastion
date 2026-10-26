import * as THREE from 'three';
import { V, DEG, TAU, xf, box, rbox, yTube, zTube, xTube, rod, zLathe, dish, ringPlate, circle, boltOutline, Parts } from './kit.js';
import { slew } from './guns.js';

// Kirov's fire-control directors. Each is a rig on its foundation: `train` about Y (0 = bow, as
// Object3D.rotation.y) and, where the antenna is mechanically laid in elevation, `elev` about X.
//   3R41 Volna (NATO Top Dome) for Fort: the large hemispherical radome trains in azimuth; the beam
//     is steered in elevation electronically, so the face does not nod (missilery.info, Polmar's
//     Guide to the Soviet Navy). The small radomes under the dome are the missile command links.
//     The radome is shown 3.8 m across, scaled against the AK-100 turrets in refs/kirov-aft.jpg.
//   4R33 (Pop Group) for Osa-M: a trainable, elevating head with the tracking radar's large radome in
//     the middle, two small radomes for the missile capture and command channels and a TV sight.
//   MR-123 Vympel (Bass Tilt) for the AK-630s: a radar dish in a drum-shaped radome with a TV sight.
//   MR-184 Lev (Kite Screech) for the AK-100s: a solid parabolic dish, a smaller one over it, a sight.
// Shapes follow published photographs; their dimensions are estimates.

export const KINDS = {
  topDome: { trainRate: 0.55, elevRate: 0, pivotY: 0 },
  popGroup: { trainRate: 1.2, elevRate: 0.9, pivotY: 1.45 },
  bassTilt: { trainRate: 1.6, elevRate: 1.3, pivotY: 1.4 },
  kiteScreech: { trainRate: 0.9, elevRate: 0.7, pivotY: 1.95 },
};

function foundation(S, r) {
  S.add('paintMid', ringPlate(r * 0.8, r, 0, 0.1, 32));
  S.add('steel', boltOutline(circle(r * 0.92, 20), 0.1, 0, 0.3, 0.025));
}

// A spherical cap radome facing -Z: sphere radius R, half-angle a, its rim (radius R sin a) at z.
function capRadome(R, a, x, y, z, seg = 28) {
  return new THREE.SphereGeometry(R, seg, 10, 0, TAU, 0, a).applyMatrix4(xf(x, y, z + R * Math.cos(a), -Math.PI / 2, 0, 0));
}

// ---------------------------------------------------------------- 3R41 Top Dome

// After the colour photograph of Frunze's forward director (refs/photos/frunze-1985-amidships-
// port.jpg): the hemispherical radome closes the front of a short drum, its face tipped up a little,
// with a small fitting off its centre; the drum sits in a saddle on the director's house (the house
// and the link antennas at its corner are the exterior's). The radome's centre (2.3 m over the house) and size (4.7 m) are from the
// exterior's photo reprojection.
export const TOP_DOME = { R: 2.35, centreY: 2.3, tilt: 12 * DEG };
function topDome(S, T) {
  foundation(S, 2.1);
  T.add('steel', yTube(0.1, 0.22, 1.7, 1.7, 36));
  T.add('paintMid', yTube(0.0, 0.1, 1.85, 1.85, 36));
  // the saddle carrying the drum, and the cable trunk behind it
  T.add('paintCast', rbox(2.8, 0.75, 2.6, 0.14, 0, 0.6, 0.55));
  T.add('paint', rbox(0.8, 0.9, 0.7, 0.08, 0, 0.65, 2.0));
  const { R, centreY: cy, tilt } = TOP_DOME;
  const head = new Parts(T.mats);
  head.add('radome', new THREE.SphereGeometry(R, 32, 12, 0, TAU, 0, Math.PI / 2).applyMatrix4(xf(0, 0, -0.55, -Math.PI / 2, 0, 0)));
  head.add('paintMid', zTube(-0.57, -0.45, R + 0.06, R + 0.06, 40));
  head.add('paint', zTube(-0.45, 1.0, R * 0.98, R * 0.92, 40));
  head.add('paintMid', zLathe([[1.0, R * 0.92], [1.15, R * 0.6], [1.22, 0.25]], 32));
  // the small round fitting off the face's centre
  head.add('paintMid', zLathe([[-0.55 - R * 0.93 - 0.12, 0.0], [-0.55 - R * 0.93 + 0.05, 0.16]], 12).translate(-0.95, 0.45, 0));
  head.copyInto(T, xf(0, cy, 0.3, tilt, 0, 0));
  head.dispose();
  // (the three upright link antennas and the small sphere stand on the house: the exterior's)
  return false;
}

// ---------------------------------------------------------------- 4R33 Pop Group

// A trainable, elevating head on a pedestal. The colour photograph of Frunze shows the directors' faces
// as two tan circular radomes side by side, a larger and a smaller; the TV sight sits beside them.
function popGroup(S, T, E) {
  foundation(S, 1.0);
  S.add('paintMid', yTube(0, 0.7, 0.62, 0.7, 24));
  T.add('steel', yTube(0.7, 0.8, 0.72, 0.72, 24));
  T.add('paint', yTube(0.8, 1.0, 0.75, 0.75, 24));
  // the yoke arms carrying the head's trunnions
  for (const s of [-1, 1]) T.add('paint', rbox(0.22, 1.0, 0.6, 0.05, s * 1.32, 1.4, 0));
  T.add('paint', rbox(2.86, 0.2, 0.62, 0.05, 0, 0.95, 0));
  // the head (origin on its trunnions): cabin with the two dish radomes on its face
  E.add('paintCast', rbox(2.4, 1.3, 1.1, 0.12, 0, 0.05, 0.15));
  E.add('radomeTan', capRadome(1.0, 0.5, -0.5, 0.05, -0.42));
  E.add('paintMid', zTube(-0.46, -0.38, 0.5, 0.52, 32, -0.5, 0.05));
  E.add('radomeTan', capRadome(0.75, 0.52, 0.62, 0.0, -0.42, 24));
  E.add('paintMid', zTube(-0.46, -0.38, 0.38, 0.4, 24, 0.62, 0.0));
  E.add('paintMid', rbox(0.28, 0.26, 0.5, 0.04, 1.05, 0.5, -0.3));
  E.add('glass', zTube(-0.57, -0.54, 0.07, 0.07, 12, 1.05, 0.5));
  for (const s of [-1, 1]) E.add('steel', xTube(s * 1.2, s * 1.32, 0.12, 0.12, 14));
  return true;
}

// ---------------------------------------------------------------- MR-123 Bass Tilt

function bassTilt(S, T, E) {
  foundation(S, 0.85);
  S.add('paintMid', yTube(0, 0.6, 0.5, 0.58, 24));
  T.add('steel', yTube(0.6, 0.68, 0.6, 0.6, 24));
  T.add('paint', rbox(1.6, 0.3, 0.9, 0.06, 0, 0.82, 0.05));
  for (const s of [-1, 1]) T.add('paint', rbox(0.16, 0.72, 0.5, 0.04, s * 0.84, 1.25, 0));
  // the radome: a short drum with a domed face, the dish behind it; the TV sight box on the side
  E.add('paint', zTube(-0.25, 0.4, 0.66, 0.62, 28));
  E.add('radome', capRadome(0.9, 0.82, 0, 0, -0.25));
  E.add('paintMid', zLathe([[0.4, 0.62], [0.55, 0.35], [0.58, 0.1]], 20));
  E.add('paintMid', rbox(0.22, 0.24, 0.5, 0.03, 0.55, 0.55, -0.1));
  E.add('glass', zTube(-0.36, -0.34, 0.06, 0.06, 10, 0.55, 0.55));
  for (const s of [-1, 1]) E.add('steel', xTube(s * 0.66, s * 0.76, 0.08, 0.08, 12));
  return true;
}

// ---------------------------------------------------------------- MR-184 Kite Screech

function kiteScreech(S, T, E) {
  foundation(S, 1.1);
  S.add('paintMid', yTube(0, 0.8, 0.7, 0.75, 28));
  T.add('steel', yTube(0.8, 0.9, 0.78, 0.78, 28));
  T.add('paint', rbox(1.7, 0.4, 1.2, 0.08, 0, 1.08, 0.75));
  for (const s of [-1, 1]) T.add('paint', rbox(0.18, 1.0, 0.55, 0.04, s * 1.08, 1.7, 0.1));
  T.add('paint', rbox(2.3, 0.2, 0.55, 0.04, 0, 1.25, 0.1));
  // the main dish (vertex behind the trunnions), its feed horn on three struts, the electronics
  // box behind, the smaller dish above and the TV sight beside
  E.add('paintMid', dish(0.95, 0.32, 0.05, 28).translate(0, 0, 0.12));
  E.add('paint', rbox(0.75, 0.6, 0.5, 0.06, 0, 0, 0.45));
  E.add('darkSteel', zTube(-0.85, -0.62, 0.07, 0.11, 12));
  for (const a of [Math.PI / 2, Math.PI / 2 + TAU / 3, Math.PI / 2 + (2 * TAU) / 3]) E.add('steel', rod(V(Math.cos(a) * 0.85, Math.sin(a) * 0.85, -0.18), V(0, 0, -0.75), 0.016, 5));
  E.add('paintMid', dish(0.4, 0.12, 0.04, 20).translate(0, 1.15, 0.05));
  E.add('paint', rbox(0.3, 0.3, 0.3, 0.04, 0, 1.15, 0.25));
  E.add('paintMid', rbox(0.26, 0.26, 0.6, 0.03, 0.88, -0.35, 0.05));
  E.add('glass', zTube(-0.27, -0.25, 0.07, 0.07, 10, 0.88, -0.35));
  for (const s of [-1, 1]) E.add('steel', xTube(s * 0.88, s * 1.0, 0.1, 0.1, 12));
  return true;
}

const BUILD = { topDome, popGroup, bassTilt, kiteScreech };

// A set of directors of one kind. mounts: [{x, y, z, ry}]. Each rig's `target` ({train, elev} in
// ship terms, or null for the search posture) is slewed at the director's rates; `onTarget` says
// when it is laid on its target.
export function buildDirectors(parent, M, kind, mounts, staticParts) {
  const K = KINDS[kind], n = mounts.length;
  if (!n) return { kind, rigs: [], update() {} };
  const S = new Parts(M), T = new Parts(M), E = new Parts(M);
  const elev = BUILD[kind](S, T, E);
  for (const mt of mounts) S.copyInto(staticParts, xf(mt.x, mt.y, mt.z));
  S.dispose();
  const train = T.instanced(parent, n, { name: `${kind}-train` });
  const head = elev ? E.instanced(parent, n, { name: `${kind}-elev` }) : null;
  const _m = new THREE.Matrix4(), _r = new THREE.Matrix4();
  const rigs = mounts.map((mt, i) => ({ i, mount: mt, base: xf(mt.x, mt.y, mt.z), stow: mt.ry ?? 0, train: mt.ry ?? 0, elev: 0, target: null, scan: i * 1.7, onTarget: false }));
  const api = {
    kind, rigs,
    update(dt, time = 0) {
      for (const g of rigs) {
        // with no designation, the search posture: a slow sweep either side of the stowed bearing
        const tAim = g.target ? g.target.train : g.stow + Math.sin(time * 0.06 + g.scan) * 0.35;
        const eAim = g.target ? g.target.elev : 0.03;
        g.train = slew(g.train, tAim, K.trainRate, dt);
        if (K.elevRate) g.elev = slew(g.elev, Math.max(-5 * DEG, Math.min(80 * DEG, eAim)), K.elevRate, dt, false);
        const dTrain = Math.abs(Math.atan2(Math.sin(tAim - g.train), Math.cos(tAim - g.train)));
        g.onTarget = !!g.target && dTrain < 0.02 && (!K.elevRate || Math.abs(eAim - g.elev) < 0.03);
        _m.copy(g.base).multiply(_r.makeRotationY(g.train));
        train.set(g.i, _m);
        if (head) {
          _m.multiply(_r.makeTranslation(0, K.pivotY, 0)).multiply(_r.makeRotationX(g.elev));
          head.set(g.i, _m);
        }
      }
    },
  };
  api.update(0);
  return api;
}
