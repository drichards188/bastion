import * as THREE from 'three';
import { V, DEG, xf, box, rbox, zTube, rod, topProfile, roundRect, bolts, boltOutline, inside, loft, ringAt, Parts } from './kit.js';
import { addRound, ROUNDS } from './missiles.js';

// The 20 SM-233 launchers of P-700 Granit under the foredeck: inclined launch tubes below a field of
// armoured lids, four across and five along (MI, MR; refs/README.md). The USN photographs of Frunze
// (1985) and Kalinin (1991) show the field as a low plinth with chamfered sides and a longitudinal
// divider, the lids rounded rectangles in the deck's colour, each with two heavy hinge arms along its
// starboard edge (refs/photos/frunze-1985-foredeck-granit-fort-hatches.jpg): the lids open sideways,
// standing up beside the opening, out of the way of the round, which leaves its tube nose first,
// forward and upward on its booster. The launcher is flooded with sea water before the launch
// (Kuzin; militaryrussia.ru): the open tube shows its water a little below the mouth.
// Reconstructed: the tube inclination is 60 degrees (MI, MR, ru.wikipedia; Kuzin and the MR ship
// table give 47 to the baseline), the well under each lid, the rams and all dimensions below.
// Rig: a cell's origin on its plinth top at the centre of its lid, bow toward -Z.

export const GRANIT = {
  incline: 60 * DEG,
  tubeR: 0.78, // launch tube outer radius (the round sits in a 1.35 m circle: MR)
  boreR: 0.68,
  mouth: V(0, -1.05, -0.2), // the mouth's centre in the cell frame
  seat: 0.95, // how far the round's body sits back inside the mouth (its seeker cone stands 0.75 m proud)
  water: 0.62, // the flooded tube's water surface below the mouth's centre
  lidOpen: 104 * DEG,
  coaming: 0.1,
  plinth: 0.45, // the field's plinth above the deck (when the exterior's deck is flat there)
  corner: 0.55,
};

// axis pointing up the tube (out of the mouth), and the round's centre in the cell frame
export const tubeAxis = V(0, Math.sin(GRANIT.incline), -Math.cos(GRANIT.incline));
export const roundCentre = GRANIT.mouth.clone().addScaledVector(tubeAxis, -(GRANIT.seat + ROUNDS.granit.L / 2));

// lid and opening from the mount's footprint [across, along]
function sizes(footprint = [3.4, 3.6]) {
  const W = footprint[0] - 0.2, L = footprint[1] - 0.15;
  return { W, L, w: W - 0.4, l: L - 0.4 };
}

// the hinge arms' stations along the lid's starboard edge
const ARM_Z = 1.0;

// The coaming round one opening and its bolts; the hinge blocks on the starboard edge, the lock
// housings on the port edge.
function cellStatic(P, s) {
  const outer = roundRect(s.W + 0.12, s.L + 0.12, GRANIT.corner + 0.06, 5), inner = roundRect(s.w, s.l, GRANIT.corner - 0.2, 5);
  P.add('deck', topProfile(outer, 0, GRANIT.coaming, [inner.slice().reverse()]));
  P.add('steel', boltOutline(roundRect(s.W - 0.08, s.L - 0.08, GRANIT.corner, 5), GRANIT.coaming, 0, 0.4, 0.02));
  // the hinge blocks and the drive housings beside them (the lids' drive is hydraulic: MI)
  for (const z of [-ARM_Z, ARM_Z]) {
    P.add('darkSteel', box(0.28, 0.22, 0.44, s.W / 2 + 0.12, GRANIT.coaming + 0.06, z));
    P.add('deck', box(0.34, 0.24, 0.6, s.W / 2 + 0.2, GRANIT.coaming + 0.04, z - Math.sign(z) * 0.6));
  }
  for (const z of [-0.6, 0.6]) P.add('darkSteel', box(0.18, 0.1, 0.26, -s.W / 2 - 0.04, GRANIT.coaming + 0.03, z));
}

// The well under the lid, drawn through the deck cut-out: its lining, frames and floor, the inclined
// tube rising through the floor to its mouth with a flange, the flooded bore, the rams' brackets.
function cellWell(W, s) {
  const depth = 2.3, inner = roundRect(s.w, s.l, GRANIT.corner - 0.2, 5);
  W.add('paintMid', inside(topProfile(inner, -depth, GRANIT.coaming)), { tint: 0xd8d8d8 });
  W.add('paintDark', topProfile(inner, -depth - 0.05, -depth), { tint: 0x9a9a9a });
  // stiffening frames round the lining (rings standing 0.1 m in from it)
  for (const y of [-0.75, -1.5]) W.add('paintMid', topProfile(inner, y - 0.08, y, [roundRect(s.w - 0.2, s.l - 0.2, GRANIT.corner - 0.3, 5).reverse()]), { tint: 0xb0b0b0 });
  const a = tubeAxis, m = GRANIT.mouth, R = GRANIT.tubeR;
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), a), qz = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), a);
  const along = (d) => m.clone().addScaledVector(a, d);
  const tubeLen = 3.4;
  W.add('paint', new THREE.CylinderGeometry(R, R, tubeLen, 24, 1, true).applyMatrix4(new THREE.Matrix4().compose(along(-tubeLen / 2), q, V(1, 1, 1))), { tint: 0xc8c8c8 });
  W.add('dark', inside(new THREE.CylinderGeometry(GRANIT.boreR, GRANIT.boreR, tubeLen, 24, 1, true).applyMatrix4(new THREE.Matrix4().compose(along(-tubeLen / 2), q, V(1, 1, 1)))));
  // the mouth's flange, a ring of bolts round it, and the band clamps down the tube
  W.add('steel', new THREE.RingGeometry(GRANIT.boreR, R + 0.12, 28).applyMatrix4(new THREE.Matrix4().compose(along(0.01), qz, V(1, 1, 1))), { tint: 0xc0c0c0 });
  W.add('paintMid', new THREE.CylinderGeometry(R + 0.12, R + 0.12, 0.14, 28, 1, true).applyMatrix4(new THREE.Matrix4().compose(along(-0.06), q, V(1, 1, 1))), { tint: 0xa0a0a0 });
  const ring = [];
  for (let k = 0; k < 14; k++) { const ang = (k / 14) * Math.PI * 2; ring.push(new THREE.Vector3(Math.cos(ang) * (R + 0.05), Math.sin(ang) * (R + 0.05), 0.02).applyQuaternion(qz).add(along(0))); }
  W.add('steel', bolts(ring, a, 0.03), { tint: 0xb0b0b0 });
  for (const d of [-1.2, -2.4]) W.add('paintMid', new THREE.CylinderGeometry(R + 0.05, R + 0.05, 0.16, 24, 1, true).applyMatrix4(new THREE.Matrix4().compose(along(d), q, V(1, 1, 1))), { tint: 0x8a8a8a });
  // a saddle where the tube passes the floor, drainage gratings beside it
  W.add('paintDark', box(2.0, 0.3, 0.6, 0, -depth + 0.15, 0.55), { tint: 0x777777 });
  for (const x of [-1.0, 1.0]) W.add('steel', box(0.4, 0.03, 1.4, x, -depth + 0.02, -0.5), { tint: 0x777777 });
  // stiffening knees in the corners of the well
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) W.add('paintDark', box(0.12, 0.6, 0.12, x * (s.w / 2 - 0.25), -0.5, z * (s.l / 2 - 0.25)), { tint: 0x888888 });
}

// The sea water standing in a flooded tube. Its surface is level, so it is the bore's horizontal
// section (an ellipse, long fore and aft) centred where the axis meets the water.
function waterSurface(Wt) {
  const sin = Math.sin(GRANIT.incline), c = GRANIT.mouth.clone().addScaledVector(tubeAxis, -GRANIT.water / sin);
  const e = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2).scale(GRANIT.boreR * 0.99, 1, (GRANIT.boreR * 0.99) / sin);
  Wt.add('water', e.translate(c.x, c.y, c.z));
}

// The lid, origin on its hinge axis (along Z at the starboard edge), lying toward -X when shut:
// armour plate in the deck's coating on top, grey underneath with its stiffeners and seal, the two
// hinge arms curving over the edge, the lifting eyes and the latch.
function cellLid(P, s) {
  const out = roundRect(s.W - 0.04, s.L - 0.04, GRANIT.corner, 5).map(([x, z]) => [x - s.W / 2 - 0.06, z]);
  const cx = -s.W / 2 - 0.06;
  P.add('deck', topProfile(out, 0.0, 0.08));
  P.add('paint', topProfile(out.map(([x, z]) => [cx + (x - cx) * 0.985, z * 0.985]), -0.1, 0.0));
  for (const z of [-0.8, 0, 0.8]) P.add('paintMid', box(s.W * 0.78, 0.09, 0.07, cx, -0.14, z));
  for (const x of [-0.7, 0, 0.7]) P.add('paintMid', box(0.07, 0.09, s.L * 0.8, cx + x, -0.14, 0));
  // the seal that lands on the coaming
  for (const sx of [-1, 1]) P.add('rubber', box(0.07, 0.05, s.l - 0.6, cx + sx * (s.w / 2 + 0.02), -0.12, 0));
  for (const sz of [-1, 1]) P.add('rubber', box(s.w - 0.6, 0.05, 0.07, cx, -0.12, sz * (s.l / 2 + 0.02)));
  // the hinge arms: heavy curved levers from the plate over the starboard edge onto the pins
  for (const z of [-ARM_Z, ARM_Z]) {
    const pts = [V(-0.75, 0.1, z), V(-0.35, 0.16, z), V(-0.08, 0.12, z), V(0.02, 0.02, z)];
    for (let k = 0; k < 3; k++) P.add('darkSteel', rod(pts[k], pts[k + 1], 0.065, 7));
    P.add('darkSteel', zTube(z - 0.2, z + 0.2, 0.09, 0.09, 10, 0, 0));
  }
  // lifting eyes and the latch lever on the plate (the photographs' small round fittings)
  P.add('steel', bolts([-1.0, 0, 1.0].map((z) => V(cx - 0.35, 0.08, z)), V(0, 1, 0), 0.07, 0.5));
  P.add('steel', box(0.36, 0.04, 0.08, cx - s.W / 2 + 0.45, 0.1, 0.0, 0, 0.4, 0));
}

// The field's plinth: a low slab with chamfered sides round the cells, its top following the deck,
// with an opening per cell and a divider along the middle.
function plinth(P, cells, s, H) {
  const xs = cells.map((c) => c.x), zs = cells.map((c) => c.z);
  const x0 = Math.min(...xs) - s.W / 2 - 0.45, x1 = Math.max(...xs) + s.W / 2 + 0.45;
  const z0 = Math.min(...zs) - s.L / 2 - 0.45, z1 = Math.max(...zs) + s.L / 2 + 0.45;
  const y0 = cells.reduce((a, c) => a + c.y, 0) / cells.length;
  const holes = cells.map((c) => roundRect(s.W + 0.12, s.L + 0.12, GRANIT.corner + 0.06, 5, c.x, c.z).reverse());
  P.add('deck', topProfile(roundRect(x1 - x0, z1 - z0, 0.4, 4, (x0 + x1) / 2, (z0 + z1) / 2), y0 + H - 0.02, y0 + H, holes));
  // chamfered skirt from the top's edge down onto the deck
  const top = roundRect(x1 - x0, z1 - z0, 0.4, 4, (x0 + x1) / 2, (z0 + z1) / 2), foot = roundRect(x1 - x0 + 0.7, z1 - z0 + 0.7, 0.6, 4, (x0 + x1) / 2, (z0 + z1) / 2);
  P.add('deck', loft([ringAt(foot, y0 - 0.1), ringAt(top, y0 + H - 0.02)], { top: false, bottom: false }), { tint: 0xc8c8c8 });
  // the divider between the port and starboard pairs of columns, lighter painted (Kalinin, 1991)
  const xm = (x0 + x1) / 2;
  P.add('paint', box(0.34, 0.12, z1 - z0 - 0.5, xm, y0 + H + 0.06, (z0 + z1) / 2));
  return y0;
}

// Build the field. mounts: MOUNTS.granit ([{x, y, z, footprint}]); raise: build the plinth.
export function buildGranit(parent, M, mounts, staticParts, wellParts, cutouts, lamps, { raise = true } = {}) {
  const n = mounts.length, s = sizes(mounts[0]?.footprint), H = raise ? GRANIT.plinth : 0;
  const Lid = new Parts(M), Rd = new Parts(M), S = new Parts(M), W = new Parts(M);
  cellLid(Lid, s);
  cellStatic(S, s);
  cellWell(W, s);
  const Wt = new Parts(M);
  waterSurface(Wt);
  const water = Wt.instanced(parent, n, { name: 'granit-water', shadow: false });
  const yFlat = raise ? plinth(staticParts, mounts, s, H) + H : null;
  // the round sits folded in its tube, nose just inside the mouth
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, -1), tubeAxis);
  // (only its nose shows through the mouth: the in-tube round is the forward part of the P-700)
  addRound(Rd, 'granit', new THREE.Matrix4().compose(roundCentre, q, V(1, 1, 1)), { wings: 0, noseOnly: true });
  const lids = Lid.instanced(parent, n, { name: 'granit-lid' });
  const rounds = Rd.instanced(parent, n, { name: 'granit-round' });
  const hinge = V(s.W / 2 + 0.06, GRANIT.coaming + 0.04, 0);
  const _m = new THREE.Matrix4(), _r = new THREE.Matrix4();
  const cells = mounts.map((mt, i) => {
    // on the plinth the lids lie in one plane; on a raised exterior deck each follows its mount
    const y = yFlat ?? mt.y, base = xf(mt.x, y, mt.z);
    S.copyInto(staticParts, base);
    W.copyInto(wellParts, base);
    // the deck under the plinth is opened over the whole well (and the plinth top has its holes)
    cutouts?.add(mt.x, mt.z, s.l, s.w, mt.y - 0.5, y + GRANIT.coaming - 0.01, GRANIT.corner - 0.2);
    rounds.set(i, base);
    const lamp = lamps ? lamps.add(xf(mt.x - s.W / 2 + 0.3, y + GRANIT.coaming + 0.01, mt.z - s.L / 2 - 0.16)) : -1;
    return { i, mount: mt, y, base, lamp, lid: 0, lidTarget: 0, loaded: true, hold: 0, flooded: false };
  });
  S.dispose(); W.dispose();
  const api = {
    cells, sizes: s, raise: H,
    update(dt) {
      for (const c of cells) {
        // the lid runs on its rams at a steady rate, easing into its stops
        const d = c.lidTarget - c.lid;
        c.lid += Math.sign(d) * Math.min(Math.abs(d), dt * 0.5 * (0.35 + 0.65 * Math.min(1, Math.abs(d) * 4)));
        c.hold = Math.max(0, c.hold - dt);
        const e = c.lid * c.lid * (3 - 2 * c.lid), ang = e * GRANIT.lidOpen;
        _m.copy(c.base).multiply(_r.makeTranslation(hinge.x, hinge.y, hinge.z)).multiply(_r.clone().makeRotationZ(-ang));
        lids.set(c.i, _m);
        rounds.show(c.i, c.loaded);
        rounds.set(c.i, c.base);
        water.show(c.i, c.flooded && c.loaded);
        water.set(c.i, c.base);
      }
    },
    // the round's centre and axis in ship space for simulation slot `slot`
    roundFrame(slot) {
      const c = cells[slot % n];
      return { pos: roundCentre.clone().applyMatrix4(c.base), dir: tubeAxis.clone(), cell: c };
    },
    mouth(i) { return GRANIT.mouth.clone().applyMatrix4(cells[i].base); },
    top(i) { return V(0, GRANIT.coaming, 0).applyMatrix4(cells[i].base); },
  };
  api.update(0);
  return api;
}
