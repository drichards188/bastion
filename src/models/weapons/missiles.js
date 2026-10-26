import * as THREE from 'three';
import { V, DEG, TAU, xf, box, zTube, zLathe, sideProfile, Parts, weaponMats, mergeAll } from './kit.js';

// Kirov's missiles as solids along Z, nose toward -Z, centred on the middle of their length, the way
// Drumfire builds its V-1 and A4: one set of pieces for the round sitting in its launcher and for the
// round in flight, so the missile that leaves a cell is the one that was in it.
//   granit  P-700 (3M45): 10 m, 0.85 m body, 2.6 m wing span unfolded (en.missilery.info, ru.wikipedia).
//           Annular nose intake round a conical centre body holding the seeker; small swept wings that
//           unfold after launch; cruciform tail; the solid booster at the tail. Light grey.
//   fort    5V55RM: about 7.25 m, 0.45 m body (missilery.info; figures between 0.45 and 0.5 m are
//           published). Ogive nose, four folding tail fins with control surfaces. Off-white.
//   osa     9M33: 3.16 m, 0.21 m body, 0.65 m span. Four canard control fins near the nose, four
//           trapezoidal wings at the tail. Off-white with a dark nose radome.
// Fin and intake shapes are drawn from museum photographs; their exact dimensions are estimates.
// Slava's round (src/models/slava-weapons.js):
//   bazalt  P-500 (4K80): 11.7 m, 0.88 m body, 2.6 m span (ru.wikipedia; testpilot.ru after the KBSM
//           history; FAS gives 0.9 m). The P-6 layout it kept (testpilot.ru): a ventral sector intake
//           with a two-shock centre body for the KR-17-300 turbojet, swept mid wings folded in the
//           container and spread as it leaves, two solid boosters on the tail (ru.wikipedia) that
//           drop away at burnout. No photograph of the round has been released (GlobalSecurity), so
//           the shapes follow published drawings of the P-6 family; every dimension but the four
//           above is an estimate.

export const ROUNDS = {
  granit: { L: 10, R: 0.425, span: 2.6 },
  fort: { L: 7.25, R: 0.235, span: 1.13 },
  osa: { L: 3.16, R: 0.105, span: 0.65 },
  bazalt: { L: 11.7, R: 0.44, span: 2.6 },
};

// A thin fin in the plane containing the body axis: root chord along Z on the body surface, the tip
// out along `dir` (a unit vector across the axis). pts are [z, s] with s the distance from the axis.
function fin(pts, dir, t = 0.02) {
  const g = sideProfile(pts.map(([z, s]) => [z, s]), t);
  // sideProfile puts s on +Y; turn that onto `dir` about Z
  const a = Math.atan2(dir.y, dir.x) - Math.PI / 2;
  return g.applyMatrix4(xf(0, 0, 0, 0, 0, a));
}

const cross = [V(1, 0, 0), V(0, 1, 0), V(-1, 0, 0), V(0, -1, 0)];
const xcross = cross.map((d) => d.clone().applyAxisAngle(V(0, 0, 1), Math.PI / 4));

// The P-700. `wings` 0 folded flat along the body (as in the tube), 1 spread.
function granitParts(P, { wings = 1, noseOnly = false } = {}) {
  const { L, R } = ROUNDS.granit, z0 = -L / 2;
  if (noseOnly) {
    // the forward 2.5 m: what shows of a round in its tube
    P.add('missile', zLathe([[z0 + 0.0, R * 0.86], [z0 + 0.05, R * 0.95], [z0 + 0.35, R], [z0 + 2.5, R]], 20));
    P.add('dark', zTube(z0 + 0.02, z0 + 0.6, R * 0.8, R * 0.7, 18));
    P.add('missileDark', zLathe([[z0 - 0.75, 0.02], [z0 - 0.5, 0.12], [z0 - 0.15, 0.24], [z0 + 0.25, R * 0.62]], 14));
    return;
  }
  // body: intake lip, the forward body barely tapered, the cylindrical fuselage, the tail boat
  P.add('missile', zLathe([[z0 + 0.0, R * 0.86], [z0 + 0.05, R * 0.95], [z0 + 0.35, R], [L / 2 - 0.9, R], [L / 2 - 0.35, R * 0.93], [L / 2, R * 0.9]], 28));
  // the intake's dark throat and the seeker's conical centre body standing out of it
  P.add('dark', zTube(z0 + 0.02, z0 + 0.6, R * 0.8, R * 0.7, 24));
  P.add('missileDark', zLathe([[z0 - 0.75, 0.02], [z0 - 0.5, 0.12], [z0 - 0.15, 0.24], [z0 + 0.25, R * 0.62]], 20));
  // a ring of booster nozzles round the sustainer's exhaust (the solid booster at the tail)
  P.add('dark', zTube(L / 2 - 0.05, L / 2 + 0.02, R * 0.88, R * 0.88, 24));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    P.add('darkSteel', zLathe([[L / 2 - 0.1, 0.11], [L / 2 + 0.12, 0.13], [L / 2 + 0.16, 0.12]], 10).translate(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, 0));
  }
  P.add('darkSteel', zTube(L / 2 - 0.1, L / 2 + 0.08, 0.2, 0.22, 16));
  // a dorsal cable duct and the two lifting lugs the photos show along the top
  P.add('missile', box(0.12, 0.06, L * 0.62, 0, R + 0.02, 0.2));
  for (const z of [-1.4, 2.1]) P.add('steel', box(0.1, 0.06, 0.18, 0, R + 0.06, z));
  // swept wings on the body's sides, folded down onto it in the tube
  const wing = [[-0.2, R], [0.95, R], [1.3, R + 0.85], [0.75, R + 0.88]];
  const fold = (1 - wings) * 1.35;
  for (const side of [-1, 1]) {
    const d = V(side * Math.cos(fold), -Math.sin(fold) * 0.98, 0).normalize();
    P.add('missile', fin(wing, d, 0.05).translate(0, 0, 0.2));
  }
  // cruciform tail, set at 45 degrees; the fins fold in the tube too
  for (const d of xcross) {
    const k = wings < 1 ? 0.55 : 1;
    P.add('missile', fin([[L / 2 - 1.5, R * 0.95], [L / 2 - 0.25, R * 0.9], [L / 2 - 0.1, R + 0.42 * k], [L / 2 - 0.65, R + 0.42 * k]], d, 0.04));
  }
}

function fortParts(P, { wings = 1 } = {}) {
  const { L, R } = ROUNDS.fort, z0 = -L / 2;
  // tangent ogive nose about 1.6 m long to the radome tip, then the plain body
  const nose = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10, z = z0 + 1.6 * t; nose.push([z, R * Math.sin((t * Math.PI) / 2) ** 0.8 + 0.005]); }
  P.add('missileWhite', zLathe([...nose, [L / 2 - 0.2, R], [L / 2, R * 0.92]], 24));
  P.add('missileDark', zLathe([[z0 - 0.02, 0.0], [z0 + 0.25, 0.07], [z0 + 0.55, 0.13]], 16));
  // the joint band between the warhead and the motor, and the motor's nozzle
  P.add('steel', zTube(z0 + 2.3, z0 + 2.36, R + 0.006, R + 0.006, 24));
  P.add('darkSteel', zLathe([[L / 2 - 0.05, R * 0.6], [L / 2 + 0.18, R * 0.7], [L / 2 + 0.22, R * 0.66]], 16));
  P.add('dark', zTube(L / 2 + 0.05, L / 2 + 0.23, R * 0.5, R * 0.62, 16));
  // four folding tail fins with their hinged control surfaces; folded back along the body in the TPK
  const open = wings;
  for (const d of xcross) {
    const s = 0.12 + 0.44 * open;
    P.add('missileWhite', fin([[L / 2 - 1.25, R], [L / 2 - 0.25, R], [L / 2 - 0.25, R + s], [L / 2 - 0.65, R + s]], d, 0.03));
    P.add('missileDark', fin([[L / 2 - 0.24, R + 0.02], [L / 2 - 0.02, R + 0.02], [L / 2 - 0.02, R + s * 0.9], [L / 2 - 0.24, R + s * 0.9]], d, 0.025));
  }
}

function osaParts(P) {
  const { L, R } = ROUNDS.osa, z0 = -L / 2;
  const nose = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; nose.push([z0 + 0.45 * t, R * Math.sin((t * Math.PI) / 2) ** 0.7 + 0.003]); }
  P.add('missileWhite', zLathe([...nose, [L / 2 - 0.08, R], [L / 2, R * 0.85]], 18));
  P.add('missileDark', zLathe([[z0 - 0.01, 0], [z0 + 0.12, 0.045], [z0 + 0.2, 0.065]], 12));
  P.add('dark', zTube(L / 2 - 0.01, L / 2 + 0.05, R * 0.55, R * 0.6, 12));
  // canards (the control fins) and the tail wings, in line
  for (const d of cross) {
    P.add('missileWhite', fin([[z0 + 0.55, R], [z0 + 0.8, R], [z0 + 0.8, R + 0.13], [z0 + 0.65, R + 0.13]], d, 0.012));
    P.add('missileWhite', fin([[L / 2 - 0.62, R], [L / 2 - 0.05, R], [L / 2 - 0.08, R + 0.22], [L / 2 - 0.3, R + 0.22]], d, 0.015));
  }
  // the lug that holds it to the launcher arm
  P.add('steel', box(0.05, 0.04, 0.9, 0, R + 0.02, 0.1));
}

// The P-500. `wings` 0 folded up beside each other over the body (as in the container), 1 spread;
// `boosters` the two solid boosters still on the tail; `noseOnly` the forward 2.8 m, what shows of a
// round through its container's open cover.
function bazaltParts(P, { wings = 1, boosters = true, noseOnly = false } = {}) {
  const { L, R } = ROUNDS.bazalt, z0 = -L / 2;
  // the long ogive radome (its dielectric tip darker) running into the cylindrical body
  const ogive = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; ogive.push([z0 + 2.4 * t, R * Math.sin((t * Math.PI) / 2) ** 0.85 + 0.006]); }
  const tail = noseOnly ? [[z0 + 2.8, R]] : [[L / 2 - 0.7, R], [L / 2 - 0.2, R * 0.9], [L / 2, R * 0.82]];
  P.add('missile', zLathe([...ogive, ...tail], noseOnly ? 14 : 26));
  P.add('missileDark', zLathe([[z0 - 0.01, 0], [z0 + 0.4, 0.12], [z0 + 0.95, 0.24]], noseOnly ? 12 : 16));
  if (noseOnly) return;
  P.add('steel', zTube(z0 + 2.38, z0 + 2.44, R + 0.006, R + 0.006, 24));
  // the ventral intake: a sector-shaped duct under the body with a dark mouth and the wedge of its
  // two-shock centre body, the fairing running aft to the engine bay
  const zi = z0 + 4.1, zf = L / 2 - 2.7, y0 = -R + 0.12, y1 = -R - 0.3;
  P.add('missile', sideProfile([[zi, y0], [zi, y1], [zf - 0.6, y1], [zf, y0 + 0.05]], 0.66));
  P.add('dark', box(0.56, 0.3, 0.06, 0, (y0 + y1) / 2 - 0.02, zi - 0.01));
  P.add('missileDark', sideProfile([[zi - 0.45, y1 + 0.12], [zi + 0.1, y1 + 0.02], [zi + 0.1, y0 - 0.02]], 0.16));
  // the sustainer's nozzle in the tail cone
  P.add('darkSteel', zLathe([[L / 2 - 0.05, R * 0.62], [L / 2 + 0.12, R * 0.66], [L / 2 + 0.15, R * 0.62]], 18));
  P.add('dark', zTube(L / 2 - 0.02, L / 2 + 0.15, R * 0.45, R * 0.55, 16));
  // a dorsal cable duct and lifting lugs
  P.add('missile', box(0.1, 0.06, L * 0.55, 0, R + 0.02, -0.3));
  for (const z of [-2.2, 1.6]) P.add('steel', box(0.1, 0.06, 0.18, 0, R + 0.06, z));
  // swept wings, each folding about its root (a hinge along the body): spread level, folded up
  const wing = [[0.0, 0], [1.75, 0], [1.95, 0.86], [1.35, 0.9]];
  const fold = (1 - wings) * 1.7;
  for (const side of [-1, 1]) {
    const g = fin(wing, V(0, 1, 0), 0.06);
    // root on the body's side, then swing about the root's hinge up from the spread position
    g.applyMatrix4(xf(0, 0, 0, 0, 0, -side * (Math.PI / 2 - fold)));
    P.add('missile', g.translate(side * (R - 0.02), 0.04, 0.1));
  }
  // tail: a ventral fin, and two tailplanes that fold up for the container
  P.add('missile', fin([[L / 2 - 1.7, R * 0.9], [L / 2 - 0.3, R * 0.9], [L / 2 - 0.15, R + 0.55], [L / 2 - 0.75, R + 0.55]], V(0, -1, 0), 0.05));
  const tailFold = (1 - wings) * (Math.PI / 2);
  for (const side of [-1, 1]) {
    const g = fin([[0, 0], [1.2, 0], [1.3, 0.62], [0.85, 0.66]], V(0, 1, 0), 0.04);
    g.applyMatrix4(xf(0, 0, 0, 0, 0, -side * (Math.PI / 2 - tailFold)));
    P.add('missile', g.translate(side * R * 0.85, 0.05, L / 2 - 1.45));
  }
  if (!boosters) return;
  // the two solid boosters on the tail, beside the ventral fin, nozzles canted out and down
  for (const side of [-1, 1]) {
    const x = side * 0.42, y = -R + 0.02, za = L / 2 - 2.55, zb = L / 2 + 0.25;
    P.add('missile', zLathe([[za, 0.02], [za + 0.25, 0.17], [za + 0.45, 0.2], [zb - 0.15, 0.2], [zb, 0.16]], 14).translate(x, y, 0));
    P.add('darkSteel', zLathe([[-0.02, 0.12], [0.25, 0.18], [0.28, 0.17]], 12).applyMatrix4(xf(x, y, zb, 0.1, side * 0.12, 0)));
    for (const z of [za + 0.9, zb - 0.5]) P.add('steel', box(0.1, 0.12, 0.3, side * 0.3, -R + 0.12, z));
  }
}

const BUILDERS = { granit: granitParts, fort: fortParts, osa: osaParts, bazalt: bazaltParts };

// Add a round's pieces into a part collector, placed by matrix m (the cell or the rail).
export function addRound(P, kind, m, opts = {}) {
  const tmp = new Parts(P.mats);
  BUILDERS[kind](tmp, opts);
  tmp.transform(m);
  for (const [key, list] of tmp.lists) for (const g of list) {
    if (!P.lists.has(key)) P.lists.set(key, []);
    P.lists.get(key).push(g);
  }
  tmp.lists.clear();
  return P;
}

// The round in flight: a group with the nose toward -Z and its origin at the nozzle, as the game's
// missile meshes expect. The P-700's wings and the 5V55's fins spread in the first moments after
// launch (they are folded in the cell): the mesh holds the poses and shows one by its age. The poses
// are built once per kind and cloned (geometry and materials shared), since the game makes a mesh
// for every round and does not dispose them.
// Each kind's poses in order, with the age (s) at which each gives way to the next. The P-500 also
// drops its two boosters at burnout (reconstructed timing).
const SPREAD = [[{ wings: 0 }, 0.6], [{ wings: 0.5 }, 0.9], [{ wings: 1 }, Infinity]];
const POSES = {
  granit: SPREAD, fort: SPREAD, osa: [[{ wings: 1 }, Infinity]],
  bazalt: [[{ wings: 0 }, 0.55], [{ wings: 0.5 }, 0.9], [{ wings: 1 }, 3.2], [{ wings: 1, boosters: false }, Infinity]],
};
const templates = new Map();
function flightTemplate(kind) {
  if (templates.has(kind)) return templates.get(kind);
  const M = weaponMats(), g = new THREE.Group();
  g.name = `missile:${kind}`;
  for (const [opts] of POSES[kind]) {
    const P = new Parts(M);
    BUILDERS[kind](P, opts);
    const holder = new THREE.Group();
    holder.position.z = -ROUNDS[kind].L / 2;
    P.build(holder, { shadow: true, name: kind });
    g.add(holder);
  }
  templates.set(kind, g);
  return g;
}

export function buildFlightMissile(kind) {
  if (!BUILDERS[kind]) return null;
  const g = flightTemplate(kind).clone();
  const sets = g.children, born = performance.now(), poses = POSES[kind];
  sets.forEach((s, i) => { s.visible = i === 0; });
  if (sets.length > 1) {
    const pose = () => {
      const t = (performance.now() - born) / 1000;
      let k = 0;
      while (t >= poses[k][1]) k++;
      sets.forEach((s, i) => { s.visible = i === k; });
    };
    // whichever pose is showing swaps itself for the next as the round ages
    for (const s of sets) for (const m of s.children) m.onBeforeRender = pose;
  }
  return g;
}
