import * as THREE from 'three';
import { V, DEG, TAU, xf, box, rbox, yTube, zTube, xTube, rod, lathe, zLathe, loft, ringAt, circle, ringPlate, boltOutline, Parts } from './kit.js';

// Kirov's guns: eight AK-630 six-barrel 30 mm mounts and two single AK-100 100 mm mounts aft.
// Rig convention: each mount's origin is on its deck at the centre of its training ring; `train`
// turns about Y (0 = bow, positive toward port, as Object3D.rotation.y), `elev` about the trunnions'
// X axis (positive up), the AK-630's `rotor` spins the barrel cluster about its own axis and the
// AK-100's `recoil` runs the barrel back along its bore. One InstanceSet per moving part serves all
// mounts of a type (a draw call per material), placed every frame from the mount's state.
//
// AK-630 (en/ru.wikipedia, navweaps.com): six 30 mm barrels of 54 calibres (1.62 m) on a block
// driven by the gun's own gas, 4,000 to 5,000 rounds a minute, elevation -12 to +88 degrees; the
// mount stands 1.07 m above its deck and the barrels sweep a 1.66 m radius (en.wikipedia). The
// cupola's shape, with its flat front panel and embrasure, follows photographs; its proportions
// within those figures are estimates.
// AK-100 (navweaps.com, militaryrussia.ru): 100 mm L/59 in a single automatic turret, 60 rounds a
// minute, elevation -10 to +85 degrees, recoil 510 mm, line of fire 2.04 m above the base, barrel
// sweep radius 5.55 m. The gunhouse's rounded front, embrasure, chamfered roof and sight hood follow
// the 1986 USN stern-quarter photograph (refs/kirov-aft.jpg); its plan dimensions are estimates.

export const AK630 = { trunnionY: 0.62, trunnionZ: -0.1, barrelR: 0.085, barrelL: 1.62, R: 0.86 };
export const AK100 = { trunnionY: 2.04, trunnionZ: -1.1, barrelL: 5.9, muzzle: -4.45, recoil: 0.51 };

// ---------------------------------------------------------------- AK-630

// The fixed parts at one mount: the deck foundation ring and its bolts.
export function ak630Base(P, m) {
  const S = new Parts(P.mats);
  S.add('paintMid', ringPlate(0.58, 0.84, 0, 0.08, 28));
  S.add('steel', boltOutline(circle(0.76, 18), 0.08, 0, 0.36, 0.02));
  S.add('paintMid', yTube(0.0, 0.1, 0.62, 0.62, 28));
  S.transform(m);
  merge(P, S);
}

// The turret: a lathed glass-fibre cupola on its training ring, the flat front panel round the
// embrasure, side doors, the feed housing behind. Origin at the training ring.
export function ak630Train(P) {
  const R = AK630.R;
  const prof = [[0.0, 0.08], [R - 0.02, 0.08], [R, 0.12], [R, 0.42], [R - 0.03, 0.6], [R - 0.1, 0.76], [R - 0.23, 0.9], [R - 0.4, 1.0], [R - 0.62, 1.055], [0.0, 1.07]];
  P.add('paintCast', lathe(prof, 28));
  P.add('paintMid', ringPlate(0.6, R + 0.02, 0.06, 0.05, 28));
  // the flat front panel, the dark embrasure down its middle and the slot's cheeks and lintel
  P.add('paintCast', box(0.96, 0.82, 0.16, 0, 0.53, -R + 0.13));
  P.add('dark', box(0.36, 0.72, 0.04, 0, 0.56, -R + 0.04));
  for (const s of [-1, 1]) P.add('paintMid', box(0.06, 0.78, 0.12, s * 0.22, 0.55, -R + 0.05));
  P.add('paintMid', box(0.5, 0.06, 0.14, 0, 0.94, -R + 0.08));
  // trunnion bosses either side of the slot
  for (const s of [-1, 1]) P.add('steel', xTube(s * 0.19, s * 0.27, 0.08, 0.08, 12, AK630.trunnionY, AK630.trunnionZ));
  // side access doors with hinges and dogs
  for (const s of [-1, 1]) {
    P.add('paintMid', box(0.04, 0.4, 0.46, s * (R - 0.005), 0.38, 0.08));
    for (const z of [-0.12, 0.28]) P.add('steel', box(0.05, 0.05, 0.06, s * (R + 0.01), 0.56, z));
    P.add('steel', box(0.04, 0.1, 0.04, s * (R + 0.015), 0.38, -0.17));
  }
  // the feed housing and cable trunk at the back
  P.add('paintCast', rbox(0.56, 0.38, 0.36, 0.06, 0, 0.36, R - 0.08));
  P.add('dark', box(0.36, 0.05, 0.04, 0, 0.27, R + 0.1));
  // lifting eyes and the vent on the dome
  for (const a of [0.9, 4.0]) P.add('steel', new THREE.TorusGeometry(0.04, 0.012, 4, 8).applyMatrix4(xf(Math.cos(a) * 0.48, 0.99, Math.sin(a) * 0.48, 0, a, 0)));
  P.add('paintMid', yTube(0.98, 1.08, 0.1, 0.085, 12, 0.26, 0.2));
}

// The elevating cradle at the trunnions: the barrel block's casing and the shield that closes the
// embrasure as it elevates. Origin on the trunnion axis, bore toward -Z.
export function ak630Elev(P) {
  P.add('darkSteel', zTube(-0.78, 0.3, 0.15, 0.15, 18));
  P.add('darkSteel', zTube(-0.84, -0.76, 0.17, 0.17, 18));
  // the curved shield in the slot, concentric with the trunnions
  const sh = new THREE.CylinderGeometry(0.62, 0.62, 0.34, 16, 1, true, -0.45, 0.9).applyMatrix4(xf(0, 0, 0, 0, 0, Math.PI / 2)).applyMatrix4(xf(0, 0, 0, Math.PI / 2, Math.PI, 0));
  P.add('paintMid', sh);
}

// The rotor: six barrels round the axis with their clamps and the gas block; spins about Z. Origin
// on the bore axis at the trunnions; the muzzles are at the documented sweep radius.
export function ak630Rotor(P) {
  const r = AK630.barrelR, z0 = -1.56, z1 = z0 + AK630.barrelL;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU, x = Math.cos(a) * r, y = Math.sin(a) * r;
    P.add('darkSteel', zTube(z0, z1, 0.021, 0.024, 8, x, y));
    P.add('dark', zTube(z0 - 0.001, z0 + 0.05, 0.011, 0.011, 6, x, y));
  }
  // the muzzle clamp, the middle clamp (hexagonal plates) and the gas block at the casing's mouth
  for (const [z, t, rr] of [[z0 + 0.1, 0.05, 0.125], [z0 + 0.62, 0.04, 0.12], [-0.86, 0.06, 0.135]]) P.add('darkSteel', zTube(z - t / 2, z + t / 2, rr, rr, 6));
  P.add('steel', zTube(z0 + 0.04, z0 + 0.08, 0.028, 0.028, 8));
}

// ---------------------------------------------------------------- AK-100

export function ak100Base(P, m) {
  const S = new Parts(P.mats);
  // the turret's fixed base ring on its deck and the foundation bolts
  S.add('paintMid', ringPlate(1.85, 2.3, 0, 0.12, 48));
  S.add('paintMid', yTube(0, 0.26, 1.95, 1.95, 48));
  S.add('steel', boltOutline(circle(2.18, 40), 0.12, 0, 0.36, 0.03));
  S.transform(m);
  merge(P, S);
}

// Plan outline of the gunhouse: a semicircular front of radius 1.45 and a squared rear.
const AK100_PLAN = (() => {
  const pts = [];
  for (let i = 0; i <= 16; i++) { const a = Math.PI + (i / 16) * Math.PI; pts.push([Math.cos(a) * 1.45, -0.55 + Math.sin(a) * 1.45]); }
  pts.push([1.45, 2.05], [1.25, 2.3], [-1.25, 2.3], [-1.45, 2.05]);
  return pts;
})();

export function ak100Train(P) {
  // the gunhouse: walls to 2.3 m, then the chamfered edge of the roof up to 2.6 m
  const inset = (k, dz) => AK100_PLAN.map(([x, z]) => [x * k, -0.55 + (z + 0.55) * k + dz]);
  P.add('paint', loft([ringAt(AK100_PLAN, 0.26), ringAt(AK100_PLAN, 2.3), ringAt(inset(0.88, 0.02), 2.6)], { bottom: false }));
  P.add('paintMid', loft([ringAt(inset(1.015, 0), 0.26), ringAt(inset(1.015, 0), 0.42)], { top: false, bottom: false }));
  // embrasure: the vertical slot in the rounded front, its cheeks and the shield's guide
  P.add('dark', box(0.48, 1.72, 0.08, 0, 1.6, -1.98));
  for (const s of [-1, 1]) P.add('paintMid', box(0.09, 1.8, 0.24, s * 0.3, 1.6, -1.9));
  P.add('paintMid', box(0.7, 0.1, 0.26, 0, 2.52, -1.82));
  // the gunlayer's sight hood on the roof, its window; ventilation heads; a periscope
  P.add('paint', rbox(0.62, 0.36, 0.86, 0.1, -0.78, 2.74, -0.6));
  P.add('glass', box(0.42, 0.14, 0.03, -0.78, 2.78, -1.04));
  for (const x of [0.5, 0.95]) {
    P.add('paintMid', yTube(2.6, 2.86, 0.13, 0.13, 12, x, 1.2));
    P.add('paintMid', yTube(2.86, 2.9, 0.19, 0.19, 12, x, 1.2));
  }
  P.add('darkSteel', yTube(2.6, 2.92, 0.05, 0.05, 8, 0.6, -0.4));
  // rear access door, its dogs, hinges; the side louvres and foot rungs
  P.add('paintMid', box(0.85, 1.6, 0.06, 0, 1.15, 2.31));
  for (const y of [0.6, 1.15, 1.7]) {
    P.add('steel', box(0.12, 0.05, 0.08, 0.36, y, 2.36));
    P.add('steel', zTube(2.28, 2.38, 0.035, 0.035, 8, -0.44, y));
  }
  for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k++) P.add('dark', box(0.04, 0.05, 0.75, s * 1.46, 0.9 + k * 0.1, 1.15));
    P.add('paintMid', box(0.05, 0.78, 0.92, s * 1.455, 1.15, 1.15));
    for (const y of [0.75, 1.25, 1.75]) P.add('steel', box(0.06, 0.03, 0.4, s * 1.48, y, 1.95));
  }
  // the case ejection port under the embrasure
  P.add('dark', box(0.36, 0.24, 0.06, 0, 0.66, -2.0));
  P.add('paintMid', box(0.52, 0.06, 0.2, 0, 0.82, -1.95));
  // grab rails round the roof
  for (const s of [-1, 1]) P.add('steel', rod(V(s * 1.18, 2.72, -0.55), V(s * 1.18, 2.72, 1.85), 0.02, 6));
}

// The cradle at the trunnions: slot shield, cradle tube and recoil cylinders. Origin on the trunnion
// axis, bore toward -Z.
export function ak100Elev(P) {
  const sh = new THREE.CylinderGeometry(0.85, 0.85, 0.5, 18, 1, true, -0.52, 1.04).applyMatrix4(xf(0, 0, 0, 0, 0, Math.PI / 2)).applyMatrix4(xf(0, 0, 0, Math.PI / 2, Math.PI, 0));
  P.add('paintMid', sh);
  P.add('darkSteel', zTube(-0.95, 1.1, 0.24, 0.24, 18));
  for (const s of [-1, 1]) P.add('steel', zTube(-0.7, 0.9, 0.07, 0.07, 10, s * 0.2, 0.22));
}

// The barrel that recoils: the 100 mm tube from its muzzle (at the documented sweep radius) to the
// breech, with the cooling jacket where it leaves the cradle. Origin on the trunnion axis.
export function ak100Barrel(P) {
  const z0 = AK100.muzzle, z1 = z0 + AK100.barrelL;
  P.add('darkSteel', zLathe([[z0, 0.092], [z0 + 0.04, 0.104], [z0 + 0.32, 0.104], [z0 + 0.36, 0.094], [-1.75, 0.112], [-1.7, 0.15], [-0.98, 0.16], [-0.95, 0.19], [z1 - 0.3, 0.19], [z1, 0.17]], 18));
  P.add('dark', zTube(z0 - 0.005, z0 + 0.1, 0.05, 0.05, 12));
  P.add('steel', zTube(-1.02, -0.95, 0.195, 0.195, 18));
}

function merge(P, S) {
  for (const [key, list] of S.lists) {
    if (!P.lists.has(key)) P.lists.set(key, []);
    P.lists.get(key).push(...list);
  }
  S.lists.clear();
}

// ---------------------------------------------------------------- rigs

const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _t = new THREE.Matrix4(), _e = new THREE.Matrix4(), _q = new THREE.Quaternion();
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Slew a value toward a target at a limited rate; angles wrap.
export function slew(cur, target, rate, dt, angle = true) {
  const d = angle ? wrap(target - cur) : target - cur;
  return cur + Math.max(-rate * dt, Math.min(rate * dt, d));
}

// Eight AK-630s. mounts: [{x, y, z, side, group}] (kirov-exterior MOUNTS.ak630).
export function buildAk630s(parent, M, mounts, staticParts) {
  const n = mounts.length;
  const T = new Parts(M), E = new Parts(M), R = new Parts(M);
  ak630Train(T); ak630Elev(E); ak630Rotor(R);
  const train = T.instanced(parent, n, { name: 'ak630-train' });
  const elev = E.instanced(parent, n, { name: 'ak630-elev' });
  const rotor = R.instanced(parent, n, { name: 'ak630-rotor' });
  const rigs = mounts.map((mt, i) => {
    const base = xf(mt.x, mt.y, mt.z);
    ak630Base(staticParts, base);
    // stowed laid outboard and level, the photographed posture at sea (a centreline mount, side 0
    // as on Slava's forward house, at its mount's stowed train)
    const stow = mt.side > 0 ? -Math.PI / 2 : mt.side < 0 || mt.side === undefined ? Math.PI / 2 : (mt.ry ?? 0);
    return { i, mount: mt, base, stow, train: stow, elev: 0, spin: 0, spinRate: 0, firing: 0, target: null, fireTime: 0 };
  });
  const muzzle = V(0, 0, -1.56 - 0.05);
  const api = {
    rigs,
    update(dt) {
      for (const g of rigs) {
        g.firing = Math.max(0, g.firing - dt);
        // the gas drive spins up with the burst and runs down after it
        g.spinRate += ((g.firing > 0 ? 75 : 0) - g.spinRate) * Math.min(1, dt * (g.firing > 0 ? 18 : 3));
        g.spin += g.spinRate * dt;
        const tAim = g.target ? g.target.train : g.stow, eAim = g.target ? g.target.elev : 0;
        g.train = slew(g.train, tAim, 1.4, dt);
        g.elev = slew(g.elev, Math.max(-12 * DEG, Math.min(85 * DEG, eAim)), 1.1, dt, false);
        _m.copy(g.base).multiply(_r.makeRotationY(g.train));
        train.set(g.i, _m);
        _m.multiply(_t.makeTranslation(0, AK630.trunnionY, AK630.trunnionZ)).multiply(_e.makeRotationX(g.elev));
        elev.set(g.i, _m);
        _m.multiply(_e.makeRotationZ(g.spin));
        rotor.set(g.i, _m);
        g.muzzleMatrix = g.muzzleMatrix || new THREE.Matrix4();
        g.muzzleMatrix.copy(_m);
      }
    },
    // ship-local muzzle position of mount i (after update)
    muzzle(i, out = V()) { return out.copy(muzzle).applyMatrix4(rigs[i].muzzleMatrix || rigs[i].base); },
    // ship-local launch anchor used by the simulation to pick the engaging mount
    anchor(i) { const m = rigs[i].mount; return V(m.x + (m.side || 0) * 1.4, m.y + 1, m.z); },
  };
  api.update(0);
  return api;
}

// Two AK-100s. mounts: [{x, y, z, ry}].
export function buildAk100s(parent, M, mounts, staticParts) {
  const n = mounts.length;
  const T = new Parts(M), E = new Parts(M), B = new Parts(M);
  ak100Train(T); ak100Elev(E); ak100Barrel(B);
  const train = T.instanced(parent, n, { name: 'ak100-train' });
  const elev = E.instanced(parent, n, { name: 'ak100-elev' });
  const barrel = B.instanced(parent, n, { name: 'ak100-barrel' });
  const rigs = mounts.map((mt, i) => {
    const base = xf(mt.x, mt.y, mt.z);
    ak100Base(staticParts, base);
    const stow = mt.ry ?? Math.PI;
    return { i, mount: mt, base, stow, train: stow, elev: 0, recoil: 0, recoilT: 9, target: null, shots: 0 };
  });
  const muzzle = V(0, 0, AK100.muzzle - 0.05), port = V(0, -1.38, -0.9);
  const api = {
    rigs,
    update(dt) {
      for (const g of rigs) {
        const tAim = g.target ? g.target.train : g.stow, eAim = g.target ? g.target.elev : 0;
        g.train = slew(g.train, tAim, 0.55, dt);
        g.elev = slew(g.elev, Math.max(-15 * DEG, Math.min(80 * DEG, eAim)), 0.5, dt, false);
        // recoil: the barrel runs back fast and returns on the recuperator in about half a second
        g.recoilT += dt;
        const t = g.recoilT;
        // runs out in 0.06 s and back on the recuperator over half a second
        g.recoil = t < 0.06 ? (t / 0.06) * AK100.recoil : t < 0.6 ? AK100.recoil * (1 - (t - 0.06) / 0.54) ** 2 : 0;
        _m.copy(g.base).multiply(_r.makeRotationY(g.train));
        train.set(g.i, _m);
        _m.multiply(_t.makeTranslation(0, AK100.trunnionY, AK100.trunnionZ)).multiply(_e.makeRotationX(g.elev));
        elev.set(g.i, _m);
        _m.multiply(_t.makeTranslation(0, 0, g.recoil));
        barrel.set(g.i, _m);
        g.elevMatrix = g.elevMatrix || new THREE.Matrix4();
        g.elevMatrix.copy(_m).multiply(_t.makeTranslation(0, 0, -g.recoil));
      }
    },
    fire(i) { const g = rigs[i]; g.recoilT = 0; g.shots++; },
    muzzle(i, out = V()) { return out.copy(muzzle).applyMatrix4(rigs[i].elevMatrix || rigs[i].base); },
    port(i, out = V()) { return out.copy(port).applyMatrix4(rigs[i].elevMatrix || rigs[i].base); },
  };
  api.update(0);
  return api;
}
