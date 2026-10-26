import * as THREE from 'three';
import { V, box, bar, rod, xf, yTube, sphere, hRing, lathe, dish, mergeAll, mulberry32, Parts, TAU } from '../exterior/kit.js';
import { rail, vLadder, whip } from '../exterior/fittings.js';
import { topPair, topSteer, palmFrond, latticeYard, ovalReflector, ensign } from '../exterior/masts.js';
import { LAYOUT } from './lines.js';

// Slava's masts and rotating sensors as fitted in 1983 to 1986 (USN photographs; the same antenna
// builders as Kirov's, src/models/exterior/masts.js):
//   MR-700 Fregat "Top Steer" on the foremast pylon's pedestal [P: turntable 32.5 m over z -15.5];
//   MR-800 Voskhod "Top Pair" on the main mast [P: turntable 27.3 m over z 7.8];
//   two Palm Frond navigation radars on the lattice yard abaft the pylon;
//   the curved lattice dish on brackets at the pylon's forward port corner [P: 1986 broadside,
//   Marshal Ustinov 1989 close-up];
//   the lattice mast abaft the pylon with its yard, halyards and whips, the ensign on its gaff.

const rnd = mulberry32(1164700);

// Four-legged lattice mast between y0 and y1 at z, tapering from half-width w0 to w1.
function latticeMast(P, z, y0, y1, w0, w1, bays = 7) {
  const leg = (sx, sz, t) => V(sx * (w0 + (w1 - w0) * t), y0 + (y1 - y0) * t, z + sz * (w0 + (w1 - w0) * t));
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) P.add('paint', rod(leg(sx, sz, 0), leg(sx, sz, 1), 0.08, 6));
  for (let b = 0; b < bays; b++) {
    const t0 = b / bays, t1 = (b + 1) / bays;
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c], [bx, bz] = corners[(c + 1) % 4];
      P.add('paint', rod(leg(ax, az, t0), leg(bx, bz, t1), 0.03, 4), { tier: 1 });
      P.add('paint', rod(leg(ax, az, t1), leg(bx, bz, t1), 0.035, 4), { tier: 1 });
    }
  }
}

export function buildMasts(P, M, root) {
  const radars = [], spin = [];
  const F = LAYOUT.foremast, MM = LAYOUT.mainMast, LF = LAYOUT.latticeFwd, BB = LAYOUT.bridgeBlock;

  // ---- Top Steer on the pylon
  const ts = topSteer(M);
  ts.position.set(0, F.topSteerY, F.topSteerZ);
  root.add(ts);
  radars.push(ts);
  spin.push({ o: ts, rate: 0.95, phase: 1.1 });
  P.add('steel', yTube(F.topSteerY + 4.6, F.topSteerY + 7.4, 0.05, 0.03, 6, 0, F.topSteerZ + 1.8), { tier: 1 });

  // ---- Top Pair on the main mast
  const tp = topPair(M);
  tp.position.set(0, MM.top, MM.z);
  root.add(tp);
  radars.push(tp);
  spin.push({ o: tp, rate: 0.55, phase: 0.3 });
  P.add('steel', yTube(MM.top + 3.6, MM.top + 5.6, 0.06, 0.03, 6, 0, MM.z), { tier: 1 });

  // ---- the lattice mast abaft the pylon [P: z -10 to -9, 20 to 39.5 m; yard at 30 m]
  {
    const z = LF.z;
    latticeMast(P, z, BB.roof, LF.yard, 1.0, 0.5, 6);
    P.add('steel', yTube(LF.yard, LF.top, 0.12, 0.05, 8, 0, z), { tier: 0 });
    for (const y of [33.5, 36.5]) P.add('steel', rod(V(-1.6, y, z), V(1.6, y, z), 0.04, 4), { tier: 1 });
    // its yard: a lattice girder across the ship and a boom running aft [P: aft to z -5.5]
    latticeYard(P, LF.yard - 0.3, z, 6.2, 0.6);
    P.add('paint', rod(V(0, LF.yard, z), V(0, LF.yard, -5.4), 0.08, 6));
    P.add('paint', rod(V(0, LF.yard + 0.6, z), V(0, LF.yard, -5.4), 0.05, 5), { tier: 1 });
    // Palm Frond navigation radars on platforms at the yard's ends
    for (const s of [-1, 1]) {
      const px = s * 4.6, py = LF.yard + 0.35;
      P.add('dark', box(2.0, 0.06, 1.5, px, py, z), { tier: 1, tint: 0xb0b6b8 });
      rail(P, [[px - 1.0, z - 0.75], [px + 1.0, z - 0.75], [px + 1.0, z + 0.75], [px - 1.0, z + 0.75]], py, { h: 0.9, closed: true });
      const pf = palmFrond(M);
      pf.position.set(px, py + 0.05, z);
      root.add(pf);
      radars.push(pf);
      spin.push({ o: pf, rate: 2.0 + s * 0.12, phase: s * 0.7 });
      // halyards down to the bridge roof and the yard-arm lamps
      P.add('lamp', sphere(0.12, s * 6.1, LF.yard + 0.7, z, 1, 1, 1, 8), { tier: 2 });
      for (const dz of [-0.2, 0.2]) P.add('dark', rod(V(s * 6.0, LF.yard - 0.3, z + dz), V(s * 6.4, BB.roof + 0.4, -30 + dz * 8), 0.012, 3), { tier: 2 });
    }
    // dangling wire antennas from the boom's end down to the main-mast block
    for (const x of [-0.6, 0.6]) P.add('dark', rod(V(x, LF.yard - 0.1, -5.6), V(x * 3, LAYOUT.mainBlock.roof + 0.5, 4.5), 0.012, 3), { tier: 2 });
    whip(P, 1.6, LF.yard, z + 1.2, 6.0, 1, [0.4, 0]);
    whip(P, -1.6, LF.yard, z + 1.2, 6.0, 1, [-0.4, 0]);
  }

  // ---- the curved lattice dish on the pylon's forward port corner [P: z -21.4 to -19.5, 24.8 to 28.6 m]
  {
    const m = new THREE.Matrix4().compose(V(-3.0, 26.7, -20.4), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0.55, 0.1)), V(1, 1, 1));
    ovalReflector(P, m, 1.6, 1.9, 0.6, 0.045);
    P.add('paint', bar(V(-1.9, 26.4, -18.4), V(-2.9, 26.7, -20.1), 0.16), { tier: 0 });
    P.add('paint', bar(V(-1.9, 25.2, -18.6), V(-2.8, 25.9, -19.9), 0.12), { tier: 1 });
  }

  // ---- whips and small antennas on the bridge roof and the main-mast block
  for (const [x, z, h] of [[-6.4, -14.5, 8.0], [6.4, -14.5, 8.0], [-5.0, -29.5, 6.5], [5.0, -29.5, 6.5]]) whip(P, x, BB.roof, z, h + rnd(), 1, [x * 0.05, 0]);
  for (const [x, z] of [[-5.4, 0.5], [5.4, 0.5], [-5.4, 9.8], [5.4, 9.8]]) whip(P, x, LAYOUT.mainBlock.roof, z, 7 + rnd() * 2, 1, [x * 0.06, 0]);

  // ---- satcom / datalink dishes on the pylon's top gallery
  for (const s of [-1, 1]) {
    const x = s * 2.4, z = -13.2, y = F.top;
    P.add('paint', yTube(y, y + 0.9, 0.16, 0.16, 8, x, z), { tier: 1 });
    P.add('white', dish(0.65, 0.22, 0.04, 16).applyMatrix4(xf(x, y + 1.25, z, -0.7, s * 0.9)), { tier: 1 });
  }

  // ---- the naval ensign on the gaff of the lattice mast, flying aft
  const flag = ensign();
  flag.position.set(0, LF.yard + 2.6, LF.z + 0.8);
  root.add(flag);
  P.add('paint', bar(V(0, LF.yard + 2.0, LF.z), V(0, LF.yard + 3.0, LF.z + 0.9), 0.09), { tier: 1 });

  const animate = (time) => {
    for (const s of spin) s.o.rotation.y = s.phase + time * s.rate;
    const p = flag.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = flag.userData.base[i * 3], y = flag.userData.base[i * 3 + 1], k = Math.max(0, x) / 3.0;
      p.setX(i, x);
      p.setZ(i, k * (Math.sin(x * 2.1 - time * 4.2) * 0.32 + Math.sin(x * 4.3 - time * 6.1 + y) * 0.08));
    }
    p.needsUpdate = true;
    flag.geometry.computeVertexNormals();
  };
  void lathe; void hRing; void mergeAll; void vLadder; void TAU; void Parts;
  return { radars, animate, flag };
}
