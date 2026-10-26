import * as THREE from 'three';
import { V, DEG, TAU, xf, box, rbox, yTube, zTube, xTube, lathe, topProfile, roundRect, circle, ringPlate, boltOutline, inside, Parts } from './kit.js';
import { ROUNDS } from './missiles.js';

// The twelve B-203A launchers of S-300F Fort, two identical complexes of six (Kuzin). Each is a
// revolver drum of eight vertical transport-launch containers below deck turning under one launch
// hatch: the drum brings a loaded container under the hatch, the hatch opens, a gas generator in the
// container blows the round out (the cold launch; a charge breaks the container's lid) and its motor
// lights 20 to 25 m up; the hatch shuts and the drum turns the next container under it
// (missilery.info, ru.wikipedia; 3 s between rounds). The USN photographs of Frunze (1985) show each
// launcher's deck hatch as a square lid with a low pyramid top in a raised frame, three across and
// four along (refs/photos/frunze-1985-foredeck-granit-fort-hatches.jpg). Reconstructed: the hinge (no
// source gives it; here on the after edge), the drum's size and the hatch's place over it (a 0.86 m
// container is assumed; ru.wikipedia quotes 1.0 m for a container without saying whose).
// Rig: a launcher's origin on the deck at the centre of its hatch; its drum's axis lies to port.
//
// Slava's B-204 (variant 'b204'): eight drums of eight, 64 rounds, in two rows of four on raised
// platforms abaft the funnel (missilery.info; GlobalSecurity). The USN photographs of Marshal Ustinov
// (1988 overhead and 1989 alongside: refs/photos/slava/weapons-1988-ustinov-fort-topdome.jpg,
// weapons-1989-ustinov-fort-hatches.jpg) show each drum's deck installation as a large disc flush
// with its platform carrying eight round lids, each embossed with three overlapping circles, round a
// central housing, with a hinged arm reaching from the housing over one lid (all at the same bearing,
// outboard of aft). One container is always under the launch hatch (missilery.info) and the drum turns
// to bring the next under it, so here the disc is the drum's top and turns with it, its lids riding
// on it over their containers, and the arm at the fixed launch station lifts whichever lid is there,
// swinging it up on its inner edge. That reading of the photographs, the lid travel and all the
// dimensions (from the photographs' proportions; a 0.86 m container is again assumed) are
// reconstructed. Rig: a launcher's origin on its platform at the drum's axis.

export const FORT = {
  cellR: 1.12, // radius of the container circle on the drum
  tpkR: 0.43, // container outer radius
  tpkTop: -0.62, // container tops under the deck
  tpkLen: 7.9, // (the containers' full length; only their top 2.6 m is modelled, the part a hatch shows)
  shown: 2.6,
  frame: 2.3, // the hatch frame's outer side
  open: 1.9, // the opening's side
  rim: 0.16, // the frame's height above the deck
  lidOpen: 100 * DEG,
  cells: 8,
};

// Fixed parts at one launcher: the raised frame with its corner pins and bolts, the hinge blocks,
// the lock lever forward of the frame.
function frameStatic(P) {
  const F = FORT.frame, a = FORT.open;
  P.add('darkSteel', topProfile(roundRect(F, F, 0.08, 2), 0, FORT.rim, [roundRect(a, a, 0.06, 2).reverse()]));
  P.add('steel', boltOutline(roundRect(F - 0.1, F - 0.1, 0.05, 2), FORT.rim, 0, 0.42, 0.018));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.add('steel', yTube(FORT.rim, FORT.rim + 0.1, 0.06, 0.05, 10, x * (F / 2 - 0.06), z * (F / 2 - 0.06)));
  for (const x of [-0.65, 0.65]) P.add('darkSteel', box(0.26, 0.2, 0.22, x, FORT.rim + 0.06, F / 2 + 0.02));
  // the lock's operating lever: a stub post and its handle on the deck forward of the frame
  P.add('steel', yTube(0, 0.32, 0.03, 0.025, 8, -0.4, -F / 2 - 0.25));
  P.add('steel', box(0.28, 0.035, 0.04, -0.28, 0.32, -F / 2 - 0.25, 0, 0.3, 0));
}

// The shaft under the hatch, down to the drum's top (drawn through the deck cut-out).
function hatchWell(W) {
  const a = FORT.open;
  W.add('paintMid', inside(topProfile(roundRect(a, a, 0.06, 2), FORT.tpkTop - 0.1, FORT.rim)), { tint: 0xd0d0d0 });
  W.add('paintMid', inside(topProfile(roundRect(a - 0.1, a - 0.1, 0.05, 2), -0.32, -0.24)), { tint: 0xaaaaaa });
}

// The lid, origin on its hinge axis (the after edge, at the frame's top), lying forward when shut:
// a plate with the low pyramid on it, deck coloured, its underside grey with a seal and stiffeners.
function hatchLid(P) {
  const F = FORT.frame - 0.06, zc = -F / 2 - 0.02, h = 0.34;
  P.add('deck', box(F, 0.08, F, 0, 0.04, zc));
  // the low pyramid, flat-faceted so its four faces catch the light as in the photographs
  const pyr = new THREE.ConeGeometry(F / Math.SQRT2 * 0.97, h, 4, 1).rotateY(Math.PI / 4).translate(0, 0.08 + h / 2, zc).toNonIndexed();
  pyr.computeVertexNormals();
  P.add('deck', pyr);
  P.add('paint', box(F * 0.98, 0.03, F * 0.98, 0, -0.01, zc));
  P.add('rubber', topProfile(roundRect(FORT.open + 0.12, FORT.open + 0.12, 0.08, 2), -0.05, -0.01, [roundRect(FORT.open - 0.02, FORT.open - 0.02, 0.05, 2).reverse()]).translate(0, 0, zc));
  for (const x of [-0.5, 0.5]) P.add('paintMid', box(0.08, 0.12, F * 0.82, x, -0.08, zc));
  for (const x of [-0.65, 0.65]) P.add('darkSteel', xTube(x - 0.14, x + 0.14, 0.075, 0.075, 12, 0, 0));
  for (const x of [-0.65, 0.65]) P.add('darkSteel', box(0.12, 0.06, 0.45, x, 0.05, -0.2));
}

// One drum, origin on its axis at the deck: eight containers round a column, frame rings, the drive
// ring gear under the top frame. `c` the launcher's dimensions (FORT, or B204 for Slava's).
function drum(P, c = FORT) {
  const top = c.tpkTop, L = c.shown, R = c.tpkR;
  // (only the top of the drum is ever seen, through the hatch: the lower frames are plain)
  P.add('darkSteel', yTube(top - L, top - 0.1, 0.35, 0.35, 12));
  P.add('paintMid', ringPlate(0.3, c.cellR + R + 0.1, top - 0.25, 0.12, 32), { tint: 0xb8b8b8 });
  for (const y of [top - L * 0.5, top - L + 0.3]) P.add('paintDark', ringPlate(0.3, c.cellR + R + 0.1, y, 0.12, 12), { tint: 0x9a9a9a });
  for (let k = 0; k < c.cells; k++) {
    const a = (k / c.cells) * TAU, x = Math.cos(a) * c.cellR, z = Math.sin(a) * c.cellR;
    P.add('paint', yTube(top - L, top, R, R, 14, x, z, true), { tint: 0xc0c0c0 });
    P.add('dark', inside(yTube(top - 1.4, top, R - 0.05, R - 0.05, 14, x, z, true)));
    // the container's top flange, its gas generator's cable box and the lugs it hangs from
    P.add('steel', new THREE.RingGeometry(R - 0.05, R + 0.07, 14).rotateX(-Math.PI / 2).translate(x, top, z), { tint: 0xb0b0b0 });
    P.add('paintDark', box(0.14, 0.3, 0.14, x * 0.7, top - 0.2, z * 0.7), { tint: 0x8a8a8a });
    P.add('paintMid', box(0.2, 0.14, 0.12, x * 1.32, top - 0.3, z * 1.32), { tint: 0x9a9a9a });
  }
}

// The nose of the round in a container: the ogive and its dark radome tip, origin on the axis at the
// container's top.
function nose(P) {
  const R = ROUNDS.fort.R, pts = [[R, -2.6]];
  // lathe about Y from [r, y], listed from the body (low) to the tip (high)
  for (let i = 6; i >= 0; i--) { const t = i / 6; pts.push([R * Math.sin((t * Math.PI) / 2) ** 0.8 + 0.004, -0.2 - 1.6 * t]); }
  P.add('missileWhite', lathe(pts, 12));
  P.add('missileDark', lathe([[0.142, -0.75], [0.085, -0.47], [0.004, -0.199]], 12));
}

export function buildFort(parent, M, mounts, staticParts, wellParts, cutouts, lamps, { variant = 'b203a', plinth = 0, discR } = {}) {
  if (variant === 'b204') return buildB204(parent, M, mounts, staticParts, wellParts, cutouts, lamps, plinth, discR ?? B204.discR);
  const n = mounts.length;
  const D = new Parts(M), N = new Parts(M), Lid = new Parts(M), S = new Parts(M), W = new Parts(M);
  drum(D); nose(N); hatchLid(Lid); frameStatic(S); hatchWell(W);
  const drums = D.instanced(parent, n, { name: 'fort-drum' });
  // only the three containers nearest a hatch can show through it, so three noses per drum ride on
  // whichever cells are there
  const noses = N.instanced(parent, n * 3, { name: 'fort-nose', shadow: false });
  const lids = Lid.instanced(parent, n, { name: 'fort-lid' });
  const _m = new THREE.Matrix4(), _a = new THREE.Matrix4(), _b = new THREE.Matrix4();
  const axis = V(-FORT.cellR, 0, 0);
  const launchers = mounts.map((mt, i) => {
    const base = xf(mt.x, mt.y, mt.z);
    S.copyInto(staticParts, base);
    W.copyInto(wellParts, base);
    cutouts?.add(mt.x, mt.z, FORT.open, FORT.open, mt.y - 0.4, mt.y + FORT.rim - 0.01, 0.06);
    const lamp = lamps ? lamps.add(xf(mt.x - FORT.frame / 2 - 0.15, mt.y + 0.02, mt.z - FORT.frame / 2 - 0.15)) : -1;
    // the drum angle that puts cell k under the hatch is k * 45 degrees (cell 0 is built at +X)
    return { i, mount: mt, base, lamp, angle: 0, cell: 0, loaded: new Array(FORT.cells).fill(true), lid: 0, lidTarget: 0, hold: 0, indexing: false };
  });
  S.dispose(); W.dispose();
  // the drum turns a cell (45 degrees) in about 1.6 s
  const INDEX_RATE = (TAU / FORT.cells) / 1.6;
  const api = {
    launchers,
    update(dt) {
      for (const l of launchers) {
        const d = l.lidTarget - l.lid;
        l.lid += Math.sign(d) * Math.min(Math.abs(d), dt * 1.1);
        l.hold = Math.max(0, l.hold - dt);
        // the drum turns only with the hatch shut
        const want = l.cell * (TAU / FORT.cells), da = Math.atan2(Math.sin(want - l.angle), Math.cos(want - l.angle));
        l.indexing = Math.abs(da) > 0.002;
        if (l.indexing && l.lid < 0.01) l.angle += Math.sign(da) * Math.min(Math.abs(da), dt * INDEX_RATE);
        _m.copy(l.base).multiply(_a.makeTranslation(axis.x, axis.y, axis.z)).multiply(_b.makeRotationY(l.angle));
        drums.set(l.i, _m);
        const near = Math.round(l.angle / (TAU / FORT.cells));
        for (let j = 0; j < 3; j++) {
          const k = (((near + j - 1) % FORT.cells) + FORT.cells) % FORT.cells, a = (k / FORT.cells) * TAU;
          _b.copy(_m).multiply(_a.makeTranslation(Math.cos(a) * FORT.cellR, FORT.tpkTop, Math.sin(a) * FORT.cellR));
          noses.show(l.i * 3 + j, l.loaded[k]);
          noses.set(l.i * 3 + j, _b);
        }
        const e = l.lid * l.lid * (3 - 2 * l.lid);
        _m.copy(l.base).multiply(_a.makeTranslation(0, FORT.rim + 0.02, FORT.frame / 2 - 0.02)).multiply(_b.makeRotationX(e * FORT.lidOpen));
        lids.set(l.i, _m);
      }
    },
    // the round's tail and bore in ship space for simulation slot `slot`: up the hatch's axis
    roundFrame(slot) {
      const l = launchers[slot % n];
      return { pos: V(0, FORT.tpkTop - 0.2 - ROUNDS.fort.L, 0).applyMatrix4(l.base), dir: V(0, 1, 0), launcher: l };
    },
    hatch(l) { return V(0, FORT.rim, 0).applyMatrix4(l.base); },
  };
  api.update(0);
  return api;
}

// ---------------------------------------------------------------- B-204 (Slava)

export const B204 = {
  discR: 2.5, // the turntable: the drum's top, flush with its platform
  cellR: 1.72, // the circle of containers, and of the lids over them
  lidR: 0.6,
  tpkR: 0.43, tpkTop: -0.75, shown: 2.6, cells: 8,
  lidOpen: 100 * DEG,
  hub: 0.86, // the opening round the fixed central housing
  plinth: 0.45, // the platform's height when the weapons build it
};

// B-204 dimensions for a turntable of radius discR, in the 1988 photograph's proportions (lids a
// quarter of the disc across, on a circle at 0.69 of its radius).
export function b204Dims(discR = B204.discR) {
  const k = discR / B204.discR;
  return { ...B204, discR, cellR: B204.cellR * k, lidR: B204.lidR * k, hub: B204.hub * k };
}

// world-plan angle (from +X toward +Z) of the launch station: outboard of aft
const stationOf = (mt) => mt.station ?? Math.atan2(1, mt.side ?? (mt.x < 0 ? -1 : 1));

// The turntable: a deck-coated disc with the hub opening and an opening under each lid; its rim.
function b204Disc(P, c) {
  const holes = [circle(c.hub, 16).reverse()];
  for (let k = 0; k < c.cells; k++) { const a = (k / c.cells) * TAU; holes.push(circle(c.lidR - 0.03, 14, Math.cos(a) * c.cellR, Math.sin(a) * c.cellR).reverse()); }
  P.add('deck', topProfile(circle(c.discR - 0.04, 40), -0.08, 0.0, holes));
  // the turntable's rim, a raised band in the same coating
  P.add('deck', new THREE.RingGeometry(c.discR - 0.14, c.discR - 0.05, 40).rotateX(-Math.PI / 2).translate(0, 0.012, 0), { tint: 0x9a9a9a });
}

// One lid, origin at its centre on the turntable: a grey plate with its three embossed circles and
// a hinge lug on its inner edge.
function b204Lid(P, c) {
  const r = c.lidR, flat = (r0, r1, x, z, seg) => new THREE.RingGeometry(r0, r1, seg).rotateX(-Math.PI / 2).translate(x, 0.056, z);
  P.add('paintCast', yTube(0, 0.05, r, r, 20, 0, 0, true));
  P.add('paintCast', new THREE.CircleGeometry(r, 20).rotateX(-Math.PI / 2).translate(0, 0.05, 0));
  // its underside, seen when it stands open
  P.add('paintCast', new THREE.CircleGeometry(r, 20).rotateX(Math.PI / 2), { tint: 0xb4b4b4 });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + Math.PI / 2, x = Math.cos(a) * r * 0.42, z = Math.sin(a) * r * 0.42;
    P.add('paintCast', flat(r * 0.44, r * 0.5, x, z, 14), { tint: 0xc4c4c4 });
  }
  P.add('paintCast', flat(r - 0.05, r, 0, 0, 20), { tint: 0xb4b4b4 });
}

// The opening arm at the launch station, origin on its hinge (horizontal, along X), reaching along
// -Z over the lid it lifts: a deep lever with its boss and the link to the drive in the housing.
function b204Arm(P, c) {
  const L = c.lidR * 2 + 0.25;
  P.add('paintCast', box(0.16, 0.14, L, 0, 0.08, -L / 2 + 0.1));
  P.add('paintCast', box(0.22, 0.2, 0.3, 0, 0.1, -L + 0.2));
  P.add('paintCast', xTube(-0.16, 0.16, 0.1, 0.1, 10, 0.05, 0), { tint: 0x5a5a5a });
  P.add('paintCast', box(0.12, 0.26, 0.14, 0, 0.1, 0.2), { tint: 0x5a5a5a });
}

// Fixed parts at one launcher (origin on the axis at the platform's top): the central housing (two
// stiffened casings with lifting eyes, the arm's drive), the rim ring and its bolts, the arm's pivot
// bracket at the station; and the station's short well down to the container top.
function b204Static(P, W, sigma, c) {
  const h = c.hub / B204.hub;
  P.add('darkSteel', ringPlate(c.discR - 0.02, c.discR + 0.1, -0.03, 0.04, 40));
  P.add('steel', boltOutline(circle(c.discR + 0.05, 40), 0.01, 0, 0.75, 0.022));
  P.add('paintMid', yTube(-0.1, 0.06, c.hub - 0.02, c.hub - 0.02, 16));
  // the housing: a larger and a smaller casing side by side across the station's bearing
  const u = V(Math.cos(sigma), 0, Math.sin(sigma)), ry = Math.atan2(-u.z, u.x);
  const H = new Parts(P.mats);
  H.add('paint', rbox(0.95, 0.95, 1.2, 0.05, -0.08, 0.5, 0));
  H.add('paint', rbox(0.55, 0.75, 0.8, 0.05, 0.46, 0.4, 0.05));
  for (const z of [-0.45, 0, 0.45]) H.add('paintMid', box(0.98, 0.04, 0.05, -0.08, 0.98, z));
  for (const z of [-0.6, 0.6]) H.add('paintMid', box(0.04, 0.9, 0.05, 0.4, 0.47, z));
  for (const [x, z] of [[-0.3, -0.35], [-0.3, 0.35], [0.46, 0.05]]) H.add('steel', box(0.03, 0.12, 0.14, x, x > 0 ? 0.84 : 1.04, z));
  // the drive's bracket on the housing's face toward the station
  H.add('darkSteel', box(0.3, 0.3, 0.24, 0.78, 0.15, 0));
  // (the housing is drawn for a 0.86 m hub and scaled to this one in plan)
  H.copyInto(P, xf(0, 0, 0, 0, ry, 0, V(h, Math.min(1, 0.4 + 0.6 * h), h)));
  H.dispose();
  const s = V(Math.cos(sigma) * c.cellR, 0, Math.sin(sigma) * c.cellR);
  W.add('paintDark', inside(yTube(c.tpkTop + 0.05, -0.08, c.lidR - 0.03, c.lidR - 0.03, 16, s.x, s.z, true)), { tint: 0xb8b8b8 });
}

// The launchers of one platform row stand on a raised slab with rounded ends and an opening per disc.
function b204Plinth(P, mounts, H, c) {
  const rows = new Map();
  for (const mt of mounts) { const k = mt.row ?? Math.sign(mt.x); if (!rows.has(k)) rows.set(k, []); rows.get(k).push(mt); }
  for (const list of rows.values()) {
    const xs = list.map((m) => m.x), zs = list.map((m) => m.z), y = list[0].y;
    const x = (Math.min(...xs) + Math.max(...xs)) / 2, z0 = Math.min(...zs) - c.discR - 0.4, z1 = Math.max(...zs) + c.discR + 0.4, W = 2 * c.discR + 0.8;
    const outline = roundRect(W, z1 - z0, W / 2 - 0.05, 10, x, (z0 + z1) / 2);
    P.add('deck', topProfile(outline, y + H - 0.04, y + H, list.map((m) => circle(c.discR, 56, m.x, m.z).reverse())));
    P.add('paintMid', topProfile(outline, y - 0.05, y + H - 0.04, [roundRect(W - 0.3, z1 - z0 - 0.3, W / 2 - 0.2, 10, x, (z0 + z1) / 2).reverse()]));
  }
}

// The B-204's drum as far as it can be seen: only the container under the open station lid shows,
// so its eight containers' tops, bores and flanges in two materials.
function b204Drum(P, c) {
  const top = c.tpkTop, R = c.tpkR;
  for (let k = 0; k < c.cells; k++) {
    const a = (k / c.cells) * TAU, x = Math.cos(a) * c.cellR, z = Math.sin(a) * c.cellR;
    P.add('paint', yTube(top - 1.6, top, R, R, 14, x, z, true), { tint: 0xc0c0c0 });
    P.add('paint', new THREE.RingGeometry(R - 0.05, R + 0.07, 14).rotateX(-Math.PI / 2).translate(x, top, z), { tint: 0x9a9a9a });
    P.add('dark', inside(yTube(top - 1.4, top, R - 0.05, R - 0.05, 14, x, z, true)));
  }
}

function buildB204(parent, M, mounts, staticParts, wellParts, cutouts, lamps, plinth = 0, discR = B204.discR) {
  const n = mounts.length, c = b204Dims(discR);
  const D = new Parts(M), N = new Parts(M), Dk = new Parts(M), Ld = new Parts(M), A = new Parts(M);
  b204Drum(D, c); nose(N); b204Disc(Dk, c); b204Lid(Ld, c); b204Arm(A, c);
  if (plinth > 0) b204Plinth(staticParts, mounts, plinth, c);
  const drums = D.instanced(parent, n, { name: 'fort-drum' });
  const noses = N.instanced(parent, n * 3, { name: 'fort-nose', shadow: false });
  const discs = Dk.instanced(parent, n, { name: 'fort-disc' });
  const lids = Ld.instanced(parent, n * c.cells, { name: 'fort-lid' });
  const arms = A.instanced(parent, n, { name: 'fort-arm' });
  const _m = new THREE.Matrix4(), _a = new THREE.Matrix4(), _b = new THREE.Matrix4(), _h = new THREE.Matrix4();
  const STEP = TAU / c.cells, up = V(0, 1, 0);
  const launchers = mounts.map((mt, i) => {
    const y = mt.y + plinth, base = xf(mt.x, y, mt.z), sigma = stationOf(mt);
    const S = new Parts(M), Wl = new Parts(M);
    b204Static(S, Wl, sigma, c);
    S.copyInto(staticParts, base); S.dispose();
    Wl.copyInto(wellParts, base); Wl.dispose();
    const u = V(Math.cos(sigma), 0, Math.sin(sigma)), t = V().crossVectors(up, u.clone().negate()).normalize();
    // the arm's hinge on the lid's inner edge, its frame (local -Z out along the station's radius)
    const hinge = u.clone().multiplyScalar(c.cellR - c.lidR - 0.06).setY(0.06);
    const frame = new THREE.Matrix4().makeBasis(t, up, u.clone().negate()).setPosition(hinge);
    const station = u.clone().multiplyScalar(c.cellR);
    // the deck or platform plating gives way to the turntable (built flush with it)
    cutouts?.add(mt.x, mt.z, 2 * c.discR - 0.02, 2 * c.discR - 0.02, mt.y - 0.9, y + 0.02, c.discR - 0.01);
    const lamp = lamps ? lamps.add(xf(mt.x + u.x * (c.discR + 0.25) - t.x * 0.6, y + 0.02, mt.z + u.z * (c.discR + 0.25) - t.z * 0.6)) : -1;
    // cell k is under the station when the drum's angle is k * 45 degrees less the station's bearing
    return { i, mount: mt, base, sigma, u, t, hinge, frame, station, lamp, angle: -sigma, cell: 0, loaded: new Array(c.cells).fill(true), lid: 0, lidTarget: 0, hold: 0, indexing: false };
  });
  const INDEX_RATE = STEP / 1.6;
  const api = {
    launchers, variant: 'b204',
    update(dt) {
      for (const l of launchers) {
        const d = l.lidTarget - l.lid;
        l.lid += Math.sign(d) * Math.min(Math.abs(d), dt * 1.1);
        l.hold = Math.max(0, l.hold - dt);
        // the drum (and its turntable with the lids) turns only with the station's lid shut
        const want = l.cell * STEP - l.sigma, da = Math.atan2(Math.sin(want - l.angle), Math.cos(want - l.angle));
        l.indexing = Math.abs(da) > 0.002;
        if (l.indexing && l.lid < 0.01) l.angle += Math.sign(da) * Math.min(Math.abs(da), dt * INDEX_RATE);
        _m.copy(l.base).multiply(_a.makeRotationY(l.angle));
        drums.set(l.i, _m);
        discs.set(l.i, _m);
        const e = l.lid * l.lid * (3 - 2 * l.lid), open = e * c.lidOpen;
        // the arm's swing about its hinge, applied to the arm and to the lid it lifts
        _h.copy(l.base).multiply(_a.makeTranslation(l.hinge.x, l.hinge.y, l.hinge.z)).multiply(_b.makeRotationAxis(l.t, open)).multiply(_a.makeTranslation(-l.hinge.x, -l.hinge.y, -l.hinge.z));
        const atStation = Math.round((l.angle + l.sigma) / STEP);
        for (let k = 0; k < c.cells; k++) {
          const a = k * STEP;
          _b.copy(_m).multiply(_a.makeTranslation(Math.cos(a) * c.cellR, 0, Math.sin(a) * c.cellR));
          if (open > 0 && ((k - atStation) % c.cells + c.cells) % c.cells === 0) _b.premultiply(_a.copy(l.base).invert()).premultiply(_h);
          lids.set(l.i * c.cells + k, _b);
        }
        arms.set(l.i, _b.copy(_h).multiply(l.frame));
        for (let j = 0; j < 3; j++) {
          const k = (((atStation + j - 1) % c.cells) + c.cells) % c.cells, a = k * STEP;
          _b.copy(_m).multiply(_a.makeTranslation(Math.cos(a) * c.cellR, c.tpkTop, Math.sin(a) * c.cellR));
          noses.show(l.i * 3 + j, l.loaded[k]);
          noses.set(l.i * 3 + j, _b);
        }
      }
    },
    // the round's tail and bore in ship space for simulation slot `slot`: up out of the station
    roundFrame(slot) {
      const l = launchers[slot % n];
      return { pos: V(l.station.x, c.tpkTop - 0.2 - ROUNDS.fort.L, l.station.z).applyMatrix4(l.base), dir: V(0, 1, 0), launcher: l };
    },
    hatch(l) { return V(l.station.x, 0.05, l.station.z).applyMatrix4(l.base); },
  };
  api.update(0);
  return api;
}
