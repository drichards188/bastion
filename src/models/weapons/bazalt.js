import * as THREE from 'three';
import { V, DEG, xf, box, rbox, zTube, xTube, zLathe, rod, inside, mirrorX, Parts } from './kit.js';
import { addRound, ROUNDS } from './missiles.js';

// Slava's P-500 Bazalt: sixteen SM-248 launch containers, eight twin launchers in a row along each
// side of the forward superstructure, fixed and inclined up toward the bow (GlobalSecurity: "eight
// double non-trainable launchers SM-248 ... along the sides"). The KBSM history (as quoted by
// testpilot.ru) gives the container's mechanism: a glass-fibre body and covers, guide rails of
// extruded V-95 alloy inside, an individual gas outlet over the ship's side for each launcher, and
// a turbojet that has to be brought up to running on an air starter inside the launcher, 20 to 30
// seconds before the round can go; two solid boosters then throw it out, and its folded wings spread
// as it leaves. A salvo is eight rounds at intervals of at most 8 s; the cruiser can fire two such
// salvos one after the other (ru.wikipedia, testpilot.ru). Reloading is a job for the base.
//
// The 1985 and 1988 USN photographs (refs/photos/slava/weapons-1985-bazalt-ak130-aerial-starboard.jpg,
// weapons-1988-ustinov-bazalt-ak130-port.jpg) show each container as a long plain cylinder with a
// slightly wider front collar, a domed front cover, a cable duct and lifting lugs along its top, and
// two curved lever arms over the cover's seam on top: the cover's hinge. So the cover swings up and
// back on its top hinge, clear of the round's path. Its travel, the drive housing, the gas outlet's
// housing and every dimension of the fittings are reconstructed. The containers' length (12.2 m),
// diameter (1.75 m) and incline (15.8 degrees; GlobalSecurity gives 30) come from the exterior's
// mount table, measured on the 1986 port beam photograph.
// Rig: a container's origin at the centre of its mouth (the cover's seam), local -Z up the bore
// toward the bow, +Y the bore's up, +X starboard. The container runs back along +Z.
//
// Fire-control steps proposed for CONFIG.bazalt in src/fire-control.js (game timings), and what the
// model shows for each (slava-weapons.js reads fireControl.stepIndex as kirov-weapons does Granit's):
//   0 ['LOAD TARGET DESIGNATION', 3]    the Argon fire control loads the designation into the
//                                       order's rounds: their lamps blink amber.
//   1 ['OPEN CONTAINER COVERS', 2.5]    the order's front covers swing up on their hinge arms.
//   2 ['START SUSTAINER ENGINES', 4]    the air starters bring each round's KR-17 turbojet up to
//                                       running (20 to 30 s for real): exhaust haze out of the gas
//                                       outlets over the side, lamps steady amber.
//   ARM: lamps red, engines running. FIRE: each round leaves on its boosters at the interval, fire
//   and smoke out of its mouth and out of its gas outlet; the cover stays up while the smoke clears,
//   then shuts. ABORT: engines run down, covers shut.

// Defaults; bazaltDims() sets L, R, Rf, bore and hingeY from the measured container.
export const BAZALT = {
  L: 11.38, // from the seam back to the rear end (inside the gas outlet's housing)
  R: 0.875, // body outer radius
  Rf: 0.935, // the front collar and cover
  collar: 1.15, // the collar's length behind the seam
  bore: 0.815,
  coverLen: 0.5, // the cover's cylindrical skirt ahead of the seam, then its dome
  dome: 0.32,
  hingeY: 1.075, // the cover's hinge axis above the bore axis, a little behind the seam
  hingeZ: 0.14,
  open: 112 * DEG,
  incline: 15.8 * DEG,
  seat: 0.3, // the round's nose tip behind the mouth
};

// The dimensions for a container `length` m from the cover's dome to its rear end and `diameter`
// m across its body (the exterior's mount table measures both).
export function bazaltDims(length = 12.2, diameter = 1.75) {
  const R = diameter / 2;
  return { ...BAZALT, R, Rf: R + 0.06, bore: R - 0.06, hingeY: R + 0.2, L: length - BAZALT.coverLen - BAZALT.dome };
}

// (the cover's cylinder and dome, its seal and the hinge arms; origin on the hinge axis). Glass-
// fibre like the body, in two materials: the paint, darkened by tint for the seal and the inside
// face, and the dark steel of the arms and lugs.
function coverParts(P, c) {
  const { Rf, coverLen, dome, hingeY, hingeZ } = c;
  const z0 = -hingeZ; // the seam, relative to the hinge
  const prof = [[z0 - coverLen - dome, 0.02]];
  for (let i = 1; i <= 5; i++) { const t = i / 5; prof.push([z0 - coverLen - dome * (1 - Math.sin((t * Math.PI) / 2)), Rf * Math.sin((t * Math.PI) / 2) ** 0.6]); }
  prof.push([z0 - 0.04, Rf], [z0, Rf - 0.02]);
  P.add('paintCast', zLathe(prof, 22).translate(0, -hingeY, 0));
  P.add('paintCast', zTube(z0 - 0.05, z0, Rf + 0.025, Rf + 0.025, 22, 0, 0, true).translate(0, -hingeY, 0), { tint: 0xb8b8b8 });
  // the inside face and its seal, seen once the cover is up
  P.add('paintCast', new THREE.CircleGeometry(Rf - 0.02, 22).translate(0, -hingeY, z0 + 0.005), { tint: 0x9a9a9a });
  P.add('paintCast', new THREE.RingGeometry(Rf - 0.08, Rf - 0.02, 22).translate(0, -hingeY, z0 + 0.008), { tint: 0x303030 });
  // the two curved lever arms from the hinge over the top of the cover
  for (const x of [-0.34, 0.34]) {
    const pts = [V(x, 0, 0), V(x, 0.02, -0.25), V(x, -0.05, -0.5), V(x, -0.16, -0.72)];
    for (let k = 0; k < 3; k++) P.add('darkSteel', rod(pts[k], pts[k + 1], 0.05, 6));
    P.add('darkSteel', xTube(x - 0.09, x + 0.09, 0.075, 0.075, 8));
  }
  // the latch lugs on the lower edges and a lifting eye on the dome
  for (const x of [-0.7, 0.7]) P.add('darkSteel', box(0.12, 0.1, 0.16, x * Rf / 0.94, -hingeY - 0.66 * Rf / 0.94, z0 - 0.12));
  P.add('darkSteel', box(0.04, 0.12, 0.14, 0, -hingeY + Rf * 0.6, z0 - coverLen - dome * 0.5, -0.6, 0, 0));
}

// The fixed container: collar and body, the rings, the cable duct and lugs on top, the hinge's pivot
// blocks and drive housing, the latch, the saddles and the gas outlet's housing round its rear end,
// and the dark bore with its guide rails inside the mouth.
function containerParts(P, W, c) {
  const { L, R, Rf, collar, bore, hingeY, hingeZ } = c;
  P.add('paintCast', zLathe([[0, Rf - 0.02], [0.04, Rf], [collar, Rf], [collar + 0.06, R + 0.05], [collar + 0.12, R], [L - 0.9, R], [L - 0.4, R * 0.9], [L - 0.1, R * 0.55], [L, 0.05]], 22));
  // the front face round the bore (the seam), the ring at the collar's after end, two body bands
  P.add('paintMid', new THREE.RingGeometry(bore, Rf - 0.01, 22).rotateY(Math.PI).translate(0, 0, 0.002));
  P.add('paintMid', zTube(collar - 0.02, collar + 0.1, Rf + 0.03, Rf + 0.03, 22, 0, 0, true));
  for (const z of [L * 0.4, L * 0.72]) P.add('paintMid', zTube(z - 0.04, z + 0.04, R + 0.012, R + 0.012, 22, 0, 0, true));
  // the cable duct along the top with its clamps, and the lifting lugs
  P.add('paintMid', box(0.12, 0.08, L - 3.4, 0.22, R + 0.03, (L + 1.6) / 2));
  for (let z = 2.2; z < L - 1.5; z += 2.0) P.add('paintMid', box(0.18, 0.06, 0.08, 0.22, R + 0.07, z));
  for (const z of [L * 0.26, L * 0.56, L * 0.86]) P.add('darkSteel', box(0.05, 0.12, 0.16, -0.25, R + 0.07, z));
  // the hinge's pivot blocks either side of the drive housing on top of the collar
  for (const x of [-0.34, 0.34]) P.add('darkSteel', box(0.14, 0.2, 0.34, x, hingeY - 0.08, hingeZ + 0.04));
  P.add('paintMid', rbox(0.5, 0.26, 0.6, 0.05, 0, Rf + 0.1, hingeZ + 0.42));
  // the latch block on the outboard lower edge of the collar
  P.add('darkSteel', box(0.14, 0.14, 0.26, Rf - 0.22, -Rf + 0.24, 0.14));
  // two saddles round the body, each with its pad on the support frame under the container (the
  // exterior's inclined frames)
  for (const z of [L * 0.3, L * 0.82]) {
    P.add('paintMid', new THREE.CylinderGeometry(R + 0.07, R + 0.07, 0.28, 16, 1, true, -Math.PI / 2, Math.PI).applyMatrix4(xf(0, 0, z, Math.PI / 2, 0, 0)));
    P.add('paintMid', box(0.9, 0.36, 0.34, 0, -R - 0.12, z));
  }
  // the gas outlet's housing round the rear end (the outlet itself runs on over the ship's side)
  P.add('paintMid', rbox(2 * R + 0.26, 2 * R + 0.3, 1.7, 0.12, 0, -0.08, L - 0.3));
  P.add('dark', box(0.08, 1.1, 1.0, R + 0.14, -0.3, L - 0.3));
  // inside the mouth: the dark bore, a closing disc, the two guide rails along its floor
  W.add('dark', inside(zTube(0, 3.2, bore, bore, 20, 0, 0, true)));
  W.add('dark', new THREE.CircleGeometry(bore, 14).rotateY(Math.PI).translate(0, 0, 3.2));
  for (const x of [-0.34, 0.34]) W.add('darkSteel', box(0.1, 0.08, 3.2, x, -bore + 0.06, 1.6), { tint: 0xb0b0b0 });
}

// Build the sixteen containers. mounts: [{ x, y, z, side, incline?, ry?, vent?: {x, y, z} }], one
// per container, (x, y, z) the mouth's centre in ship space; `length` and `diameter` the container's
// (from the first mount when not given). The gas outlet (vent) defaults to the outboard face of the
// container's rear housing. Returns the rig; slava-weapons.js runs
// the covers, engines, lamps and launch effects from the fire-control state.
export function buildBazalt(parent, M, mounts, staticParts, lamps, { length, diameter } = {}) {
  const n = mounts.length, c = bazaltDims(length ?? mounts[0]?.length, diameter ?? mounts[0]?.diameter);
  const C = new Parts(M), S = new Parts(M), Wd = new Parts(M), Rd = new Parts(M), Sp = new Parts(M);
  coverParts(C, c);
  containerParts(S, Wd, c);
  // built for a starboard container (latch and duct outboard); the port one is its mirror image in
  // geometry (a mirrored matrix would turn the faces inside out)
  for (const [key, list] of S.lists) Sp.lists.set(key, list.map((g) => mirrorX(g)));
  // the round in its container: only the nose shows through the open cover
  addRound(Rd, 'bazalt', xf(0, 0, c.seat + ROUNDS.bazalt.L / 2), { noseOnly: true });
  const covers = C.instanced(parent, n, { name: 'bazalt-cover' });
  const rounds = Rd.instanced(parent, n, { name: 'bazalt-round', shadow: false });
  const _m = new THREE.Matrix4(), _r = new THREE.Matrix4();
  const tubes = mounts.map((mt, i) => {
    const incline = mt.incline ?? BAZALT.incline;
    const base = new THREE.Matrix4().compose(V(mt.x, mt.y, mt.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(incline, mt.ry ?? 0, 0, 'YXZ')), V(1, 1, 1));
    // the starboard containers are the port ones mirrored, so the latch and duct sit outboard
    const side = mt.side ?? (mt.x < 0 ? -1 : 1);
    (side < 0 ? Sp : S).copyInto(staticParts, base);
    Wd.copyInto(staticParts, base);
    rounds.set(i, base);
    const dir = V(0, 0, -1).transformDirection(base);
    // the gas outlet over the side: the mount's, else below and outboard of the rear end
    const rear = V(side * (c.R + 0.2), -0.3, c.L - 0.3).applyMatrix4(base);
    const vent = mt.vent ? V(mt.vent.x, mt.vent.y, mt.vent.z) : rear;
    const lamp = lamps ? lamps.add(new THREE.Matrix4().multiplyMatrices(base, xf(side * (c.Rf - 0.05), 0.35, 0.45, 0, 0, -side * 1.2))) : -1;
    return { i, mount: mt, base, side, dir, incline, vent, lamp, cover: 0, coverTarget: 0, loaded: true, hold: 0, engine: 0, engineTarget: 0 };
  });
  S.dispose(); Sp.dispose(); Wd.dispose();
  const hinge = V(0, c.hingeY, c.hingeZ);
  const api = {
    tubes, dims: c,
    update(dt) {
      for (const t of tubes) {
        // the cover runs at a steady rate on its drive, easing into its stops
        const d = t.coverTarget - t.cover;
        t.cover += Math.sign(d) * Math.min(Math.abs(d), dt * 0.55 * (0.35 + 0.65 * Math.min(1, Math.abs(d) * 4)));
        t.hold = Math.max(0, t.hold - dt);
        // the turbojet spools up on its air starter and runs down slowly when stopped
        const e = t.engineTarget - t.engine;
        t.engine += Math.sign(e) * Math.min(Math.abs(e), dt * (e > 0 ? 0.3 : 0.12));
        const k = t.cover * t.cover * (3 - 2 * t.cover);
        _m.copy(t.base).multiply(_r.makeTranslation(hinge.x, hinge.y, hinge.z)).multiply(_r.makeRotationX(k * c.open));
        covers.set(t.i, _m);
        rounds.show(t.i, t.loaded);
      }
    },
    // the round's centre and bore in ship space for container i
    roundFrame(i) {
      const t = tubes[i % n];
      return { pos: V(0, 0, c.seat + ROUNDS.bazalt.L / 2).applyMatrix4(t.base), dir: t.dir.clone(), tube: t };
    },
    mouth(i, out = V()) { return out.set(0, 0, -0.1).applyMatrix4(tubes[i % n].base); },
    rear(i, out = V()) { return out.set(0, 0, c.L - 1).applyMatrix4(tubes[i % n].base); },
  };
  api.update(0);
  return api;
}
