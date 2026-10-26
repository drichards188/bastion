import * as THREE from 'three';
import { V, DEG, xf, box, rbox, yTube, zTube, xTube, rod, sideProfile, topProfile, circle, ringPlate, boltOutline, inside, mirrorX, loft, ringAt, Parts } from './kit.js';
import { addRound } from './missiles.js';
import { slew } from './guns.js';

// The two ZIF-122 launchers of Osa-M. Each lives in a cylindrical magazine well under a pair of
// clamshell doors: to fire, the doors open, the launcher rises out of the well on its column with
// both arms standing vertical and loaded, then the arms swing down to the firing elevation and the
// head trains onto the director's bearing. To reload it brings the arms vertical again, sinks into the
// magazine, takes two rounds from the drums below and comes back up (Polmar; navweaps.com; the
// ZIF-122 entries of ru.wikipedia and rbase.new-factoria.ru: 20 rounds per launcher, reload of
// 16 to 21 seconds). The arm layout (missiles slung under the arms, 1.1 m apart) follows photographs
// of ZIF-122 launchers on Krivak and Kirov class ships; column, well and door proportions are
// estimates. Rig: origin on the well's deck at its centre.

export const OSA = {
  armSpan: 0.55, // half the distance between the two arms
  trunnionUp: 1.95, // trunnion height above the deck with the launcher raised
  trunnionDown: -3.55, // ... and lowered into the magazine
  roundZ: -1.15, // the round's centre along its arm, from the trunnion
  roundY: -0.27, // the round's axis below the arm's (slung)
  magazine: 20,
};

const DOOR_OPEN = 1.85; // radians each leaf swings up and outward (past the vertical)
export const BAY = { height: 1.3 }; // the octagonal bay's rim above the deck it stands on

// The raised octagonal bay round the hatch (refs/photos/kirov-1985-osa-lowered.jpg, the 1985 overhead
// photograph): plated walls from the deck below up to the rim, a deck-coated top round the hatch
// ring, a railing along the rim, a door and a vent in the wall. Origin at the rim's centre; the walls
// reach down `drop` metres. `rIn` is the octagon's inscribed radius.
function osaBay(P, rIn, drop) {
  const oct = (k) => Array.from({ length: 8 }, (_, i) => { const a = Math.PI / 8 + (i / 8) * Math.PI * 2, rr = (rIn * k) / Math.cos(Math.PI / 8); return [Math.cos(a) * rr, Math.sin(a) * rr]; });
  P.add('paint', loft([ringAt(oct(1), -drop), ringAt(oct(1), -0.12), ringAt(oct(0.985), 0)], { top: false, bottom: false }));
  P.add('deck', topProfile(oct(0.985), -0.06, 0.0, [circle(rIn - 0.42, 40).reverse()]));
  P.add('paintMid', loft([ringAt(oct(1.012), -0.2), ringAt(oct(1.012), -0.08)], { top: false, bottom: false }));
  // the railing: stanchions at the corners and between them, two rails
  const pts = oct(0.95);
  for (let i = 0; i < 8; i++) {
    const a = pts[i], b = pts[(i + 1) % 8];
    for (const t of [0, 0.5]) { const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; P.add('steel', rod(V(x, 0, z), V(x, 1.0, z), 0.025, 5)); }
    for (const y of [0.5, 1.0]) P.add('steel', rod(V(a[0], y, a[1]), V(b[0], y, b[1]), 0.02, 5));
  }
  // a door and a louvred vent in the wall, facing aft and inboard
  const w = (i) => { const a = oct(1.004)[i], b = oct(1.004)[(i + 1) % 8]; return { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, ry: Math.atan2(b[0] - a[0], b[1] - a[1]) }; };
  for (const [i, h, kind] of [[1, 1.8, 'door'], [3, 0.6, 'vent']]) {
    const f = w(i), m = xf(f.x, -drop + 0.15 + h / 2, f.z, 0, f.ry + Math.PI / 2, 0);
    if (kind === 'door' && drop > 2) P.add('paintMid', box(0.8, h, 0.06).applyMatrix4(m));
    if (kind === 'vent') for (let k = 0; k < 4; k++) P.add('dark', box(0.7, 0.05, 0.05).applyMatrix4(xf(f.x, -0.9 - k * 0.12, f.z, 0, f.ry + Math.PI / 2, 0)));
  }
}

// Slava's tubs (bay 'round'): a plain cylinder standing on the main deck with a flat top round the
// doors and a ladder up its side (refs/photos/slava/weapons-1988-ustinov-osa-port.jpg, Marshal
// Ustinov, 1988). Origin at the rim's centre; walls reach down `drop` metres; R the tub's radius.
function roundBay(P, R, drop) {
  P.add('paint', yTube(-drop, -0.1, R, R, 36, 0, 0, true));
  P.add('paint', topProfile(circle(R, 36), -0.12, 0.0, [circle(R - 0.62, 36).reverse()]));
  P.add('paintMid', yTube(-0.18, -0.08, R + 0.04, R + 0.04, 36, 0, 0, true));
  P.add('paintMid', yTube(-drop, -drop + 0.14, R + 0.03, R + 0.03, 36, 0, 0, true));
  // the ladder up the after side, its grab handles over the rim
  const a = Math.PI * 0.62, lx = Math.cos(a) * (R + 0.18), lz = Math.sin(a) * (R + 0.18), ry = -a + Math.PI / 2;
  for (const s of [-1, 1]) {
    const ox = Math.cos(a + Math.PI / 2) * 0.24 * s, oz = Math.sin(a + Math.PI / 2) * 0.24 * s;
    P.add('steel', rod(V(lx + ox, -drop, lz + oz), V(lx + ox, 0.9, lz + oz), 0.025, 5));
  }
  for (let y = -drop + 0.3; y < 0; y += 0.3) P.add('steel', box(0.48, 0.03, 0.03, lx, y, lz, 0, ry, 0));
}

// Fixed parts at one mount: the hatch ring on the deck, the well's lining down to the magazine top
// and the doors' hinge brackets. `r` is the opening's radius.
function osaStatic(P, W, r) {
  // the deck ring the doors close onto, with its bolts
  P.add('paintMid', ringPlate(r, r + 0.28, 0, 0.12, 48));
  P.add('steel', boltOutline(circle(r + 0.18, 40), 0.12, 0, 0.3, 0.022));
  for (const s of [-1, 1]) for (const z of [-0.9, 0.9]) P.add('steel', box(0.18, 0.2, 0.32, s * (r + 0.18), 0.2, z));
  // the well (drawn through the deck cut-out): lining, frames and the magazine's top deck
  W.add('paintDark', inside(yTube(-5.2, 0.0, r, r, 40, 0, 0, true)), { tint: 0xb0b0b0 });
  for (let k = 1; k < 5; k++) W.add('paintDark', ringPlate(r - 0.1, r, -k * 1.05, 0.08, 40), { tint: 0x909090 });
  W.add('paintDark', topProfile(circle(r, 40), -5.25, -5.2), { tint: 0x707070 });
  // the guide rails the column runs in, and the drum tops of the magazine below
  for (const a of [0.4, 2.1, 3.6, 5.3]) W.add('steel', box(0.12, 5.2, 0.12, Math.cos(a) * (r - 0.12), -2.6, Math.sin(a) * (r - 0.12)), { tint: 0x9a9a9a });
  for (const a of [0.8, 2.37, 3.94, 5.5]) W.add('paintMid', yTube(-5.2, -5.0, 0.45, 0.45, 20, Math.cos(a) * 1.0, Math.sin(a) * 1.0), { tint: 0x808080 });
}

// One door leaf: a half disc on the +X side of the hinge line, origin on its hinge (at the
// opening's edge), lying toward -X when closed. Built for the starboard leaf; mirrored for port.
function osaDoor(P, r) {
  const half = [];
  for (let i = 0; i <= 24; i++) { const a = -Math.PI / 2 + (i / 24) * Math.PI; half.push([Math.cos(a) * r - r, Math.sin(a) * r]); }
  P.add('paint', topProfile(half, 0.12, 0.24));
  // stiffening ribs underneath and the seal along the meeting edge
  for (const z of [-0.8, 0, 0.8]) P.add('paintMid', box(r * 0.9, 0.1, 0.08, -r * 0.55, 0.08, z));
  P.add('rubber', box(0.05, 0.06, r * 1.9, -r + 0.02, 0.2, 0));
  // the hinge knuckles
  for (const z of [-0.9, 0.9]) P.add('steel', zTube(z - 0.16, z + 0.16, 0.07, 0.07, 10, 0.02, 0.22));
}

// The column that lifts the launcher, origin at its top (the head's training ring).
function osaColumn(P) {
  P.add('paintMid', yTube(-5.0, 0, 0.42, 0.42, 24));
  P.add('steel', yTube(-0.1, 0, 0.5, 0.5, 24));
  for (let k = 1; k < 5; k++) P.add('steel', yTube(-k * 1.0 - 0.04, -k * 1.0 + 0.04, 0.44, 0.44, 24));
}

// The trainable head: turntable drum and the trunnion housing. Origin on the training ring.
function osaHead(P) {
  // the turntable drum on the column and its skirt
  P.add('paint', yTube(0, 0.55, 0.8, 0.76, 28));
  P.add('paintMid', yTube(0, 0.08, 0.86, 0.86, 28));
  P.add('steel', yTube(0.55, 0.62, 0.7, 0.7, 28));
  // the trunnion housing: a rounded casing whose cheeks carry the arms' shaft
  const ty = OSA.trunnionUp;
  P.add('paintCast', loft([
    ringAt(roundPlan(1.2, 1.1, 0.3), 0.62),
    ringAt(roundPlan(1.2, 1.1, 0.3), ty - 0.15),
    ringAt(roundPlan(0.95, 0.85, 0.25), ty + 0.32),
  ]));
  for (const s of [-1, 1]) {
    P.add('paintMid', xTube(s * 0.6, s * 0.66, 0.24, 0.24, 18, ty, 0));
    // the elevation drive's arc housing on the cheek
    P.add('paintMid', box(0.08, 0.5, 0.5, s * 0.64, ty - 0.45, 0.25));
  }
  // the guidance-link box and the cable loop at the back, the ready lamp housing
  P.add('paint', rbox(0.62, 0.42, 0.34, 0.06, 0, 0.95, 0.68));
  P.add('rubber', new THREE.TorusGeometry(0.22, 0.035, 6, 12, Math.PI).applyMatrix4(xf(0.48, 0.42, 0.72, 0, Math.PI / 2, 0)));
  P.add('paintMid', box(0.16, 0.14, 0.1, -0.5, 1.3, 0.55));
}

// a plan outline [x, z] for a rounded box, width w (across) by d (along), corner radius rc
function roundPlan(w, d, rc) {
  const pts = [];
  for (const [cx, cz, a0] of [[w / 2 - rc, -d / 2 + rc, -Math.PI / 2], [w / 2 - rc, d / 2 - rc, 0], [-w / 2 + rc, d / 2 - rc, Math.PI / 2], [-w / 2 + rc, -d / 2 + rc, Math.PI]]) {
    for (let i = 0; i <= 3; i++) { const a = a0 + (i / 3) * (Math.PI / 2); pts.push([cx + Math.cos(a) * rc, cz + Math.sin(a) * rc]); }
  }
  return pts;
}

// The elevating arms, origin on the trunnion axis, arms along -Z at elevation 0. Each arm is a girder
// tapering forward with the launch rail under it, a short tail behind the shaft with the umbilical
// connector, and a brace between the two arms; the rounds are separate (each can be away).
function osaArms(P) {
  P.add('steel', xTube(-OSA.armSpan - 0.14, OSA.armSpan + 0.14, 0.1, 0.1, 16));
  for (const s of [-1, 1]) {
    const x = s * OSA.armSpan;
    // the girder: deep at the shaft, shallow at its tip
    P.add('paint', sideProfile([[0.45, 0.16], [0.45, -0.16], [-2.35, -0.05], [-2.35, 0.08]], 0.16).translate(x, 0, 0));
    P.add('paintMid', box(0.2, 0.04, 2.6, x, 0.15, -0.95, -0.02, 0, 0));
    // the launch rail and the shoe catches that hold the round under it
    P.add('steel', box(0.06, 0.07, 2.45, x, -0.12, -1.05));
    P.add('steel', box(0.12, 0.03, 2.45, x, -0.165, -1.05));
    for (const z of [-0.5, -1.75]) P.add('darkSteel', box(0.16, 0.09, 0.16, x, -0.18, z));
    // the shaft bearing and the umbilical connector housing on the tail
    P.add('darkSteel', xTube(x - 0.13, x + 0.13, 0.13, 0.13, 12));
    P.add('paintMid', rbox(0.17, 0.2, 0.3, 0.03, x, 0.08, 0.35));
    P.add('rubber', rod(V(x, 0.0, 0.42), V(x, -0.2, 0.5), 0.03, 6));
  }
  // the brace between the arms, ahead of the shaft
  P.add('paintMid', box(OSA.armSpan * 2 - 0.1, 0.1, 0.12, 0, 0.06, -0.7));
}

// Build both launchers. mounts: MOUNTS.osa ([{x, y, z, side, wellRadius}]).
export function buildOsa(parent, M, mounts, staticParts, wellParts, cutouts, lamps, { deckHeightAt = null, bay = 'octagon' } = {}) {
  const n = mounts.length;
  const D = new Parts(M), Dp = new Parts(M), C = new Parts(M), H = new Parts(M), A = new Parts(M), R = new Parts(M);
  const r = (mounts[0]?.wellRadius ?? 2.05) - 0.2;
  osaDoor(D, r); osaColumn(C); osaHead(H); osaArms(A);
  // the port leaf is the starboard one mirrored in geometry (a mirrored instance matrix would
  // turn its faces inside out)
  for (const [key, list] of D.lists) Dp.lists.set(key, list.map((g) => mirrorX(g)));
  addRound(R, 'osa', new THREE.Matrix4());
  const doors = [D.instanced(parent, n, { name: 'osa-door-s' }), Dp.instanced(parent, n, { name: 'osa-door-p' })];
  const column = C.instanced(parent, n, { name: 'osa-column', order: 0 });
  const head = H.instanced(parent, n, { name: 'osa-head' });
  const arms = A.instanced(parent, n, { name: 'osa-arms' });
  const rounds = R.instanced(parent, n * 2, { name: 'osa-round' });
  const _m = new THREE.Matrix4(), _a = new THREE.Matrix4(), _b = new THREE.Matrix4();
  const rigs = mounts.map((mt, i) => {
    // the launcher's hatch is at the bay's rim, which stands on the mount's deck
    const top = mt.y + (mt.bayHeight ?? BAY.height), base = xf(mt.x, top, mt.z);
    const S = new Parts(M), Wl = new Parts(M);
    osaStatic(S, Wl, r);
    const drop = top - (deckHeightAt ? deckHeightAt(mt.z) : mt.y) + 0.05;
    if ((mt.bay ?? bay) === 'round') roundBay(S, mt.tubRadius ?? r + 0.55, drop);
    else osaBay(S, mt.tubRadius ?? r + 0.55, drop);
    S.copyInto(staticParts, base); S.dispose();
    Wl.copyInto(wellParts, base); Wl.dispose();
    cutouts?.add(mt.x, mt.z, 2 * r, 2 * r, mt.y - 0.4, top + 0.11);
    const lamp = lamps ? lamps.add(base) : -1;
    return {
      i, mount: mt, base, side: mt.side || (mt.x < 0 ? -1 : 1), lamp,
      // the mechanism's state: doors 0 shut .. 1 open, lift 0 down .. 1 up, arms elevation
      doors: 0, lift: 0, elev: Math.PI / 2, train: 0,
      loaded: [true, true], magazine: OSA.magazine - 2, phase: 'stowed', phaseT: 0,
      want: false, aim: null, jolt: 0,
    };
  });

  // the phase machine: stowed -> opening -> rising -> up <-> (reload: arming down, sinking, loading,
  // rising) -> lowering -> closing -> stowed
  function step(g, dt) {
    g.phaseT += dt;
    const empty = !g.loaded[0] && !g.loaded[1];
    const reload = empty && g.magazine > 0;
    switch (g.phase) {
      case 'stowed': // below the closed doors; an empty launcher reloads where it is
        if (reload) go(g, 'loading');
        else if (g.want && !empty) go(g, 'opening');
        break;
      case 'opening':
        g.doors = Math.min(1, g.doors + dt / 0.9);
        if (g.doors >= 1) go(g, 'rising');
        break;
      case 'rising':
        g.lift = Math.min(1, g.lift + dt / 1.5);
        g.elev = slew(g.elev, Math.PI / 2, 1, dt, false);
        if (g.lift >= 1) go(g, 'up');
        break;
      case 'up': {
        if (reload) { go(g, 'arming'); break; }
        if (!g.want && g.phaseT > 4) { go(g, 'arming'); break; }
        const tTrain = g.aim ? g.aim.train : 0, tElev = g.aim ? Math.max(8 * DEG, Math.min(80 * DEG, g.aim.elev)) : 12 * DEG;
        g.elev = slew(g.elev, tElev, 0.9, dt, false);
        // the arms are laid down before the head trains far, so they clear the doors
        if (g.elev < 1.2) g.train = slew(g.train, tTrain, 1.1, dt);
        break;
      }
      case 'arming': // bring the arms vertical and the head fore and aft, ready to sink
        g.elev = slew(g.elev, Math.PI / 2, 1.1, dt, false);
        g.train = slew(g.train, 0, 1.3, dt);
        if (Math.abs(g.elev - Math.PI / 2) < 0.01 && Math.abs(g.train) < 0.01) go(g, reload ? 'sinking' : 'lowering');
        break;
      case 'sinking':
        g.lift = Math.max(0, g.lift - dt / 1.8);
        if (g.lift <= 0) go(g, 'loading');
        break;
      case 'loading': // two rounds come up from the drums onto the arms
        if (g.phaseT > 3.2) {
          for (let j = 0; j < 2; j++) if (!g.loaded[j] && g.magazine > 0) { g.loaded[j] = true; g.magazine--; }
          go(g, g.want && g.doors > 0 ? 'rising' : g.want ? 'opening' : g.doors > 0 ? 'closing' : 'stowed');
        }
        break;
      case 'lowering':
        g.lift = Math.max(0, g.lift - dt / 1.8);
        if (g.want) go(g, 'rising');
        else if (g.lift <= 0) go(g, 'closing');
        break;
      case 'closing':
        if (g.want && !empty) { go(g, 'opening'); break; }
        g.doors = Math.max(0, g.doors - dt / 1.1);
        if (g.doors <= 0) go(g, 'stowed');
        break;
    }
    g.jolt = Math.max(0, g.jolt - dt * 4);
  }
  const go = (g, phase) => { g.phase = phase; g.phaseT = 0; };

  function place(g) {
    // doors: each leaf swings up and outboard about its hinge at the opening's edge
    const swing = g.doors * g.doors * (3 - 2 * g.doors) * DOOR_OPEN;
    for (let k = 0; k < 2; k++) {
      const ks = k === 0 ? 1 : -1;
      _m.copy(g.base).multiply(_a.makeTranslation(ks * r, 0, 0)).multiply(_b.makeRotationZ(-ks * swing));
      doors[k].set(g.i, _m);
    }
    const ease = g.lift * g.lift * (3 - 2 * g.lift);
    const top = OSA.trunnionDown + (OSA.trunnionUp - OSA.trunnionDown) * ease - OSA.trunnionUp + 0.0;
    // column top (the head's ring) sits 1.95 m under the trunnions
    _m.copy(g.base).multiply(_a.makeTranslation(0, top, 0));
    column.set(g.i, _m);
    _m.multiply(_a.makeRotationY(g.train));
    head.set(g.i, _m);
    _m.multiply(_a.makeTranslation(0, OSA.trunnionUp, 0)).multiply(_b.makeRotationX(g.elev + g.jolt * 0.03));
    arms.set(g.i, _m);
    g.armMatrix = g.armMatrix || new THREE.Matrix4();
    g.armMatrix.copy(_m);
    for (let j = 0; j < 2; j++) {
      const x = (j === 0 ? -1 : 1) * OSA.armSpan;
      _a.copy(_m).multiply(_b.makeTranslation(x, OSA.roundY, OSA.roundZ));
      rounds.show(g.i * 2 + j, g.loaded[j]);
      rounds.set(g.i * 2 + j, _a);
    }
    // the ready lamp on the head's lamp housing (it rides with the head; hidden in the well)
    if (g.lamp >= 0) lamps.move(g.lamp, _m.copy(g.base).multiply(_a.makeTranslation(0, top, 0)).multiply(_b.makeRotationY(g.train)).multiply(_a.makeTranslation(-0.5, 1.37, 0.55)));
  }

  const api = {
    rigs,
    update(dt) { for (const g of rigs) { step(g, dt); place(g); } },
    // the round's centre and bore direction in ship space for simulation slot `slot`
    roundFrame(slot) {
      const g = rigs[slot % n], j = Math.floor(slot / n) % 2;
      const m = _m.copy(g.armMatrix).multiply(_a.makeTranslation((j === 0 ? -1 : 1) * OSA.armSpan, OSA.roundY, OSA.roundZ));
      const pos = V().setFromMatrixPosition(m), dir = V(0, 0, -1).transformDirection(m);
      return { pos, dir, mount: g, rail: j };
    },
    // is the rail for this slot raised, laid and loaded?
    ready(slot) { const g = rigs[slot % n], j = Math.floor(slot / n) % 2; return g.phase === 'up' && g.loaded[j] && g.elev < 1.45; },
    // force a mount up and laid (a launch the simulation ordered while it was still below)
    snapUp(slot, aim) {
      const g = rigs[slot % n];
      g.doors = 1; g.lift = 1; go(g, 'up');
      if (aim) { g.train = aim.train; g.elev = Math.max(8 * DEG, Math.min(80 * DEG, aim.elev)); }
      const j = Math.floor(slot / n) % 2;
      g.loaded[j] = true;
      place(g);
    },
    launched(slot) {
      const g = rigs[slot % n], j = Math.floor(slot / n) % 2;
      g.loaded[j] = false; g.jolt = 1;
      place(g);
    },
  };
  api.update(0);
  return api;
}
