import * as THREE from 'three';
import { V, DEG, TAU, xf, box, rbox, yTube, zTube, xTube, rod, zLathe, topProfile, roundRect, circle, ringPlate, boltOutline, Parts } from './kit.js';

// The anti-submarine fittings, built stowed (the encounter has no submarine, so the simulation never
// trains them). Each is a solid set of parts merged into the static weapons mesh.
//   Metel (URPK-3, SS-N-14): Kirov's twin launcher on the forecastle, two launch tubes inside one long
//     armoured housing on a trainable pedestal, reloaded from the magazine below (Polmar; navweaps.com;
//     the 1985 foredeck photograph shows the housing's long rounded box and the blast deflector panel
//     behind it). Housing about 8.6 m by 3.2 m, estimated from the photograph.
//   RBU-6000 (Smerch-2): twelve 212 mm barrels in a horseshoe round the trunnion, 1.6 m long (one
//     on Kirov's forecastle; Slava's pair are on the forward deckhouse).
//   RBU-1000 (Smerch-3): six 300 mm barrels in a ring, 1.4 m long. Kirov's pair is at the stern.

function metel(P) {
  // the training pedestal and its ring
  P.add('paintMid', ringPlate(1.6, 1.95, 0, 0.1, 40));
  P.add('steel', boltOutline(circle(1.8, 32), 0.1, 0, 0.3, 0.025));
  P.add('paint', yTube(0, 0.9, 1.5, 1.45, 36));
  P.add('paint', rbox(2.6, 0.5, 3.6, 0.1, 0, 1.15, 0.6));
  for (const s of [-1, 1]) P.add('paint', rbox(0.35, 1.2, 1.6, 0.06, s * 1.35, 1.6, 0.6));
  // the housing: an outline of two merged tubes, flat-sided with an arched roof, extruded along Z
  const shape = new THREE.Shape();
  const hw = 1.6, h0 = 1.75, h1 = 3.55;
  shape.moveTo(-hw, h0); shape.lineTo(hw, h0); shape.lineTo(hw, h1 - 0.6);
  shape.quadraticCurveTo(hw, h1, hw - 0.6, h1); shape.lineTo(-hw + 0.6, h1); shape.quadraticCurveTo(-hw, h1, -hw, h1 - 0.6); shape.closePath();
  const housing = new THREE.ExtrudeGeometry(shape, { depth: 8.6, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2, curveSegments: 8 }).translate(0, 0, -4.3 - 1.4);
  P.add('paint', housing);
  // the panel seams and lifting points along the roof, the hinged front covers over both tubes
  for (const z of [-3.6, -1.4, 0.8]) P.add('paintMid', box(3.24, 0.04, 0.06, 0, h1 + 0.02, z));
  for (const s of [-1, 1]) {
    P.add('paintMid', zTube(-5.8, -5.7, 0.72, 0.72, 28, s * 0.8, (h0 + h1) / 2));
    P.add('steel', box(0.08, 0.3, 0.12, s * 0.8 + 0.6, (h0 + h1) / 2 + 0.6, -5.78));
    P.add('paintMid', zTube(2.9, 3.0, 0.7, 0.7, 28, s * 0.8, (h0 + h1) / 2));
  }
  for (const z of [-4.5, 2.2]) for (const s of [-1, 1]) P.add('steel', new THREE.TorusGeometry(0.08, 0.02, 5, 10).applyMatrix4(xf(s * 1.2, h1 + 0.06, z, 0, Math.PI / 2, 0)));
  // the blast deflector behind the launcher, raked aft
  P.add('paint', box(4.2, 2.4, 0.15, 0, 1.7, 5.2, -0.45, 0, 0));
  for (const s of [-1, 1]) P.add('paintMid', box(0.15, 2.0, 1.2, s * 2.0, 1.3, 4.8));
}

function rbu6000(P, mt = {}) {
  P.add('paintMid', ringPlate(0.9, 1.2, 0, 0.1, 32));
  P.add('paint', yTube(0, 0.7, 0.85, 0.8, 28));
  P.add('paint', rbox(1.4, 0.9, 1.3, 0.1, 0, 1.1, 0.1));
  for (const s of [-1, 1]) P.add('paint', rbox(0.2, 0.8, 0.7, 0.04, s * 0.9, 1.6, 0));
  // twelve barrels in a horseshoe round the trunnion, laid at the stowed elevation
  // laid at its stowed elevation (20 degrees; Slava's pair stand vertical, mt.elev)
  const el = mt.elev ?? 20 * DEG, m = xf(0, 1.75, 0, el, 0, 0);
  for (let i = 0; i < 12; i++) {
    // the horseshoe opens downward, round the training column
    const ang = -Math.PI * 0.25 + (i / 11) * Math.PI * 1.5, x = Math.cos(ang) * 0.62, y = Math.sin(ang) * 0.62;
    P.add('paintMid', zTube(-1.3, 0.3, 0.13, 0.13, 12, x, y).applyMatrix4(m));
    P.add('dark', zTube(-1.31, -1.25, 0.1, 0.1, 10, x, y).applyMatrix4(m));
  }
  P.add('paintMid', zTube(-1.0, -0.9, 0.82, 0.82, 24, 0, 0).applyMatrix4(m));
  P.add('paintMid', zTube(0.0, 0.1, 0.82, 0.82, 24, 0, 0).applyMatrix4(m));
  P.add('steel', xTube(-0.95, 0.95, 0.12, 0.12, 12).applyMatrix4(m));
}

function rbu1000(P) {
  P.add('paintMid', ringPlate(0.85, 1.15, 0, 0.1, 32));
  P.add('paint', yTube(0, 0.75, 0.8, 0.75, 28));
  for (const s of [-1, 1]) P.add('paint', rbox(0.2, 0.9, 0.7, 0.04, s * 0.75, 1.25, 0));
  const el = 30 * DEG, m = xf(0, 1.5, 0, el, 0, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU, x = Math.cos(a) * 0.36, y = Math.sin(a) * 0.36;
    P.add('paintMid', zTube(-1.0, 0.45, 0.17, 0.17, 14, x, y).applyMatrix4(m));
    P.add('dark', zTube(-1.01, -0.95, 0.14, 0.14, 12, x, y).applyMatrix4(m));
  }
  P.add('paint', zTube(-0.2, 0.2, 0.6, 0.6, 24).applyMatrix4(m));
  P.add('steel', xTube(-0.65, 0.65, 0.1, 0.1, 12).applyMatrix4(m));
}

// Place every stowed fitting into the static part collector. mounts: kirov-exterior MOUNTS.
export function buildAsw(M, mounts, staticParts) {
  const place = (fn, mt) => {
    if (!mt) return;
    const S = new Parts(M);
    fn(S, mt);
    S.copyInto(staticParts, xf(mt.x, mt.y, mt.z, 0, mt.ry ?? 0, 0));
    S.dispose();
  };
  place(metel, mounts.metel);
  // (one RBU-6000 on Kirov, a pair on Slava)
  for (const mt of [].concat(mounts.rbu6000 || [])) place(rbu6000, mt);
  for (const mt of mounts.rbu1000 || []) place(rbu1000, mt);
}
