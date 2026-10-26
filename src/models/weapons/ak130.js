import * as THREE from 'three';
import { V, DEG, TAU, xf, box, rbox, yTube, zTube, xTube, zLathe, loft, ringAt, ringPlate, circle, boltOutline, Parts } from './kit.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { slew } from './guns.js';

// Slava's main gun: the twin 130 mm AK-130 (A-218) on the forecastle, laid by its MR-184 (Kite
// Screech) director. Published figures (ru.wikipedia, navweaps.com): 130 mm L/70 barrels, 9,100 mm
// long; 90 rounds a minute from the mount (45 per barrel); 850 m/s; 23 km; elevation -12 to +80
// degrees; laying at up to 25 degrees a second; recoil 520 to 624 mm; unitary rounds; swept radius
// 7,803 mm at the muzzles and 3,050 mm at the gunhouse. The gunhouse's form, a broad dome closing
// down onto a flat face round the embrasure, with a horizontal seam, a side door and the sight hood
// on the after part of the roof, follows the USN photographs of 1985 and 1988 (refs/photos/slava/
// weapons-1985-bazalt-ak130-aerial-starboard.jpg, weapons-1988-ustinov-bazalt-ak130-port.jpg). The
// barrels' spacing, the trunnion position, the ejection ports under the embrasure and every other
// dimension are estimates. The barrels fire alternately, each recoiling on its own.
// Rig convention as guns.js: origin on the deck at the centre of the training ring, `train` about Y
// (0 = bow), `elev` about the trunnions' X axis, each barrel's `recoil` back along its bore.

export const AK130 = {
  trunnionY: 2.05, trunnionZ: -1.55, // trunnions above the ring and ahead of the training axis
  barrelL: 9.1, muzzle: -6.25, // muzzle 7.8 m from the training axis (the published sweep radius)
  recoil: 0.6, sep: 0.41, // half the distance between the bores
  ring: 0.42, // the gunhouse's underside above the deck
  trainRate: 25 * DEG, elevRate: 25 * DEG,
  minElev: -12 * DEG, maxElev: 80 * DEG,
};

// Plan ring of the gunhouse: a circle of radius r with its front cut flat at z = -flat.
function plan(r, flat, n = 30) {
  const w = Math.sqrt(Math.max(0, r * r - flat * flat)), pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    let x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z < -flat) { z = -flat; x = Math.max(-w, Math.min(w, x)); }
    pts.push([x, z]);
  }
  return pts;
}

// The fixed parts: the barbette ring the gunhouse turns on and its bolts.
export function ak130Base(P, m, r = 2.75) {
  const S = new Parts(P.mats);
  // (r: the barbette's radius; the gunhouse overhangs it)
  S.add('paintMid', yTube(0, AK130.ring, r - 0.15, r - 0.15, 48));
  S.add('paintMid', ringPlate(r - 0.3, r, 0, 0.06, 48));
  S.add('steel', boltOutline(circle(r - 0.12, 36), 0.06, 0, 0.6, 0.03));
  S.transform(m);
  for (const [key, list] of S.lists) {
    if (!P.lists.has(key)) P.lists.set(key, []);
    P.lists.get(key).push(...list);
  }
  S.lists.clear();
}

// The gunhouse, origin on the training ring: the cast and welded paint (tinted for the seam, the
// skirt and the fittings), the dark openings, and the dark steel of the small fittings.
export function ak130Train(P) {
  const y0 = AK130.ring, mid = { tint: 0xc4c4c4 };
  // the dome: broad at the seam, closing to the roof, the front cut flat for the embrasure
  const dome = loft([
    ringAt(plan(2.78, 2.25), y0),
    ringAt(plan(2.98, 2.3), y0 + 0.9),
    ringAt(plan(2.92, 2.28), y0 + 1.6),
    ringAt(plan(2.62, 2.1), y0 + 2.3),
    ringAt(plan(2.05, 1.7), y0 + 2.85),
    ringAt(plan(1.2, 1.05), y0 + 3.2),
    ringAt(plan(0.4, 0.4), y0 + 3.32),
  ], { bottom: false });
  // smooth over the dome, creased where it meets the flat face
  P.add('paintCast', toCreasedNormals(dome, 32 * DEG));
  // the horizontal seam round the dome and the skirt over the ring
  P.add('paintCast', loft([ringAt(plan(3.0, 2.32), y0 + 0.86), ringAt(plan(3.0, 2.32), y0 + 0.96)], { top: false, bottom: false }), mid);
  P.add('paintCast', loft([ringAt(plan(2.82, 2.28), y0 - 0.02), ringAt(plan(2.82, 2.28), y0 + 0.14)], { top: false, bottom: false }), mid);
  // the embrasure: a dark slot up the flat face and over the front of the roof, its cheeks
  P.add('dark', box(1.6, 2.1, 0.06, 0, AK130.trunnionY, -2.27));
  P.add('dark', box(1.6, 0.06, 1.0, 0, y0 + 3.0, -1.6, -0.5, 0, 0));
  for (const s of [-1, 1]) P.add('paintCast', box(0.12, 2.2, 0.3, s * 0.86, AK130.trunnionY, -2.2), mid);
  // the two case ejection ports low on the face, with their lips
  for (const s of [-1, 1]) {
    P.add('dark', box(0.4, 0.3, 0.05, s * 0.62, y0 + 0.5, -2.27));
    P.add('paintCast', box(0.54, 0.06, 0.2, s * 0.62, y0 + 0.7, -2.22), mid);
  }
  // the sight hood on the after roof (the photographs' box with a domed head), its window, a
  // periscope, vents
  P.add('paintCast', rbox(1.0, 0.5, 1.2, 0.12, -0.55, y0 + 3.35, 1.15));
  P.add('paintCast', new THREE.SphereGeometry(0.36, 12, 6, 0, TAU, 0, Math.PI / 2).translate(-0.55, y0 + 3.58, 1.2));
  P.add('dark', box(0.5, 0.14, 0.03, -0.55, y0 + 3.4, 0.54));
  P.add('darkSteel', yTube(y0 + 3.2, y0 + 3.55, 0.06, 0.06, 8, 0.7, 0.3));
  for (const x of [0.9, 1.4]) P.add('paintCast', yTube(y0 + 2.6, y0 + 3.0, 0.14, 0.14, 10, x, 1.6), mid);
  // the side door with its hinges and dogs (port), a hatch to starboard, lifting eyes
  P.add('paintCast', box(0.06, 1.3, 0.8, -2.93, y0 + 1.35, 0.2, 0, 0, 0.08), mid);
  for (const y of [0.95, 1.75]) P.add('darkSteel', box(0.08, 0.08, 0.1, -2.97, y0 + y, -0.22));
  P.add('paintCast', box(0.06, 0.9, 0.7, 2.93, y0 + 1.25, 0.6, 0, 0, -0.08), mid);
  for (const [x, z] of [[1.2, -0.6], [-1.2, -0.6], [0, 1.6]]) P.add('darkSteel', box(0.04, 0.12, 0.14, x, y0 + 3.1, z));
  // grab rails and foot rungs up the side to the roof
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) P.add('darkSteel', box(0.06, 0.03, 0.35, s * 2.86, y0 + 0.5 + k * 0.42, 1.9));
}

// The cradle at the trunnions: the curved mantlet closing the embrasure, the cradle body between
// the barrels and the recoil cylinders over them. Origin on the trunnion axis, bore toward -Z.
export function ak130Elev(P) {
  const sh = new THREE.CylinderGeometry(1.0, 1.0, 1.55, 16, 1, true, -0.6, 1.2).applyMatrix4(xf(0, 0, 0, 0, 0, Math.PI / 2)).applyMatrix4(xf(0, 0, 0, Math.PI / 2, Math.PI, 0));
  P.add('paintCast', sh, { tint: 0xc4c4c4 });
  P.add('darkSteel', box(1.25, 0.62, 2.6, 0, 0, 0.5));
  for (const s of [-1, 1]) {
    P.add('darkSteel', zTube(-1.2, 1.6, 0.25, 0.25, 14, s * AK130.sep, 0));
    P.add('darkSteel', zTube(-1.0, 1.3, 0.08, 0.08, 8, s * AK130.sep, 0.32), { tint: 0xd0d0d0 });
  }
}

// One barrel (both are the same; placed at +-sep): the tube from the muzzle to the breech, its
// muzzle swell and the thicker breech end in the cradle. Origin on the trunnion axis at x = 0.
export function ak130Barrel(P) {
  const z0 = AK130.muzzle, z1 = z0 + AK130.barrelL;
  P.add('darkSteel', zLathe([[z0, 0.1], [z0 + 0.03, 0.128], [z0 + 0.38, 0.128], [z0 + 0.42, 0.115], [-2.2, 0.15], [-2.1, 0.19], [-1.25, 0.2], [-1.2, 0.235], [z1 - 0.3, 0.235], [z1, 0.21]], 16));
  P.add('darkSteel', zTube(z0 - 0.005, z0 + 0.12, 0.065, 0.065, 10, 0, 0, true), { tint: 0x202020 });
  P.add('darkSteel', zTube(-2.15, -2.07, 0.195, 0.195, 16, 0, 0, true), { tint: 0xd8d8d8 });
}

// The AK-130s. mounts: [{ x, y, z, ry }] (y the deck or barbette top).
export function buildAk130s(parent, M, mounts, staticParts) {
  const n = mounts.length;
  if (!n) return { rigs: [], update() {}, fire() {}, muzzle: (i, b, out = V()) => out, port: (i, b, out = V()) => out };
  const T = new Parts(M), E = new Parts(M), B = new Parts(M);
  ak130Train(T); ak130Elev(E); ak130Barrel(B);
  const train = T.instanced(parent, n, { name: 'ak130-train' });
  const elev = E.instanced(parent, n, { name: 'ak130-elev' });
  const barrels = B.instanced(parent, n * 2, { name: 'ak130-barrel' });
  const rigs = mounts.map((mt, i) => {
    const base = xf(mt.x, mt.y, mt.z);
    ak130Base(staticParts, base, mt.barbetteRadius ?? 2.75);
    const stow = mt.ry ?? 0;
    return { i, mount: mt, base, stow, train: stow, elev: 0, recoil: [0, 0], recoilT: [9, 9], next: 0, target: null, shots: 0, elevMatrix: null };
  });
  const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _t = new THREE.Matrix4(), _b = new THREE.Matrix4();
  const muzzle = V(0, 0, AK130.muzzle - 0.05), port = V(0, AK130.ring + 0.5, -2.32);
  const api = {
    rigs,
    update(dt) {
      for (const g of rigs) {
        const tAim = g.target ? g.target.train : g.stow, eAim = g.target ? g.target.elev : 0;
        g.train = slew(g.train, tAim, AK130.trainRate, dt);
        g.elev = slew(g.elev, Math.max(AK130.minElev, Math.min(AK130.maxElev, eAim)), AK130.elevRate, dt, false);
        _m.copy(g.base).multiply(_r.makeRotationY(g.train));
        train.set(g.i, _m);
        g.trainMatrix = (g.trainMatrix || new THREE.Matrix4()).copy(_m);
        _m.multiply(_t.makeTranslation(0, AK130.trunnionY, AK130.trunnionZ)).multiply(_r.makeRotationX(g.elev));
        elev.set(g.i, _m);
        g.elevMatrix = (g.elevMatrix || new THREE.Matrix4()).copy(_m);
        for (let j = 0; j < 2; j++) {
          // the barrel runs back in 0.05 s and out again on its recuperator over about half a second
          g.recoilT[j] += dt;
          const t = g.recoilT[j];
          g.recoil[j] = t < 0.05 ? (t / 0.05) * AK130.recoil : t < 0.55 ? AK130.recoil * (1 - (t - 0.05) / 0.5) ** 2 : 0;
          _b.copy(_m).multiply(_t.makeTranslation((j === 0 ? -1 : 1) * AK130.sep, 0, g.recoil[j]));
          barrels.set(g.i * 2 + j, _b);
        }
      }
    },
    // fire the next barrel (they alternate); returns the barrel that fired
    fire(i, j = null) {
      const g = rigs[i], b = j ?? g.next;
      g.recoilT[b] = 0; g.shots++; g.next = 1 - b;
      return b;
    },
    // ship-local muzzle of barrel b of mount i (after update), and its case ejection port
    muzzle(i, b = 0, out = V()) { const g = rigs[i]; return out.copy(muzzle).setX((b === 0 ? -1 : 1) * AK130.sep).applyMatrix4(g.elevMatrix || g.base); },
    port(i, b = 0, out = V()) { const g = rigs[i]; return out.copy(port).setX((b === 0 ? -1 : 1) * 0.62).applyMatrix4(g.trainMatrix || g.base); },
    bore(i, out = V()) { const g = rigs[i]; return out.set(0, 0, -1).transformDirection(g.elevMatrix || g.base); },
  };
  api.update(0);
  return api;
}
