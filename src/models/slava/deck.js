import * as THREE from 'three';
import { V, box, bar, rod, xf, yTube, sphere, chain, mulberry32, flightDeckTexture, hRing, mergeAll } from '../exterior/kit.js';
import { rail, ladder, mushroom, gooseneck, bollard, fairlead, capstan, hatch, locker, lifeRing, whip } from '../exterior/fittings.js';
import { deckHeightAt, deckHalfBeamAt, LAYOUT, QUARTERDECK_STEP, STEM_Z, STERN_Z } from './lines.js';
import { hullX, hullNormal } from './hull.js';

// Weather-deck fittings: deck-edge railings, the forecastle's anchor gear (the anchors stowed in
// pockets high on the bow just abaft the stem, chain running aft to two windlasses), the V
// breakwater and the AK-130 barbette, mooring fittings, the quarterdeck's capstans and the markings
// of the raised helicopter pad. Photographic basis: 1983 and 1985 aerial bow frames, 1986 broadside
// and port quarter, Marshal Ustinov 1988 from above. Mooring fittings at typical spacings [E].

const D = deckHeightAt;

export function buildDeck(P, M, root) {
  const rnd = mulberry32(6512);
  const L = LAYOUT;

  // ---------------------------------------------------------- deck-edge railings
  for (const side of [-1, 1]) {
    let run = [];
    const flush = () => { if (run.length > 1) rail(P, run, (x, z) => D(z) + 0.08, { pitch: 1.6 }); run = []; };
    for (let z = STEM_Z + 1.2; z <= STERN_Z - 0.3; z += 1.6) {
      run.push([side * (deckHalfBeamAt(z) - 0.18), z]);
      if (Math.abs(z - QUARTERDECK_STEP) < 0.9) { flush(); run.push([side * (deckHalfBeamAt(z) - 0.18), z]); }
    }
    flush();
  }
  rail(P, [[-(deckHalfBeamAt(STERN_Z - 0.3) - 0.2), STERN_Z - 0.3], [deckHalfBeamAt(STERN_Z - 0.3) - 0.2, STERN_Z - 0.3]], D(STERN_Z) + 0.08, { pitch: 1.6 });

  // ---------------------------------------------------------- forecastle
  {
    // anchors in pockets high on the bow, close under the deck edge [P: z -89.5 to -87, 7 to 9.3 m]
    for (const side of [-1, 1]) {
      const z = -88.3, y = D(z) - 1.25;
      const x = hullX(z, y), n = hullNormal(z, y);
      n.x *= side;
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n);
      P.add('black', new THREE.CircleGeometry(1.0, 20).applyMatrix4(new THREE.Matrix4().compose(V(side * x, y, z).addScaledVector(n, 0.04), q, V(1.25, 1.0, 1))));
      P.add('hullPaint', new THREE.TorusGeometry(1.0, 0.14, 6, 24).applyMatrix4(new THREE.Matrix4().compose(V(side * x, y, z).addScaledVector(n, 0.1), q, V(1.3, 1.05, 1))), { tint: 0xe8ecec });
      const ap = V(side * x, y - 0.1, z).addScaledVector(n, 0.22);
      const anchor = mergeAll([box(0.28, 1.4, 0.22, 0, 0.1, 0), box(1.25, 0.36, 0.3, 0, -0.62, 0), box(0.36, 0.62, 0.26, -0.5, -0.45, 0, 0, 0, 0.5), box(0.36, 0.62, 0.26, 0.5, -0.45, 0, 0, 0, -0.5), sphere(0.2, 0, 0.82, 0)])
        .applyMatrix4(new THREE.Matrix4().compose(ap, q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -side * 0.2)), V(1, 1, 1)));
      P.add('black', anchor, { tint: 0x8a8a8a });
      // hawse pipe deck plate, chain to the windlass, the stopper
      const dp = V(side * 1.4, D(-87.5) + 0.05, -87.5);
      P.add('steel', new THREE.CylinderGeometry(0.5, 0.56, 0.2, 16).applyMatrix4(xf(dp.x, dp.y + 0.07, dp.z)), { tier: 1, tint: 0x7a7f80 });
      P.add('dark', chain(V(dp.x, dp.y + 0.2, dp.z), V(side * 1.7, D(-78) + 0.55, -78.6), 0.05, 0.1), { tier: 1 });
      P.add('steel', box(0.5, 0.32, 0.8, side * 1.6, D(-82) + 0.18, -82), { tier: 1, tint: 0x6d7375 });
      capstan(P, side * 1.7, D(-78.3), -78.3, 0.58);
      P.add('dark', box(2.0, 0.45, 1.5, side * 1.7, D(-76.4) + 0.22, -76.4), { tier: 0, tint: 0x9aa0a0 });
      capstan(P, side * 4.0, D(-70), -70, 0.42);
    }
    // the V breakwater ahead of the gun [A: apex z -72.5, wings to the deck sides]
    {
      const z0 = L.breakwater.z, h = 1.1;
      for (const s of [-1, 1]) {
        const a = V(0, D(z0), z0), b = V(s * 5.6, D(z0 + 5.5), z0 + 5.5);
        const len = Math.hypot(b.x - a.x, b.z - a.z), ang = Math.atan2(b.x - a.x, b.z - a.z);
        const plate = box(0.12, h, len, 0, h / 2, 0).applyMatrix4(xf((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, 0, ang, 0));
        P.add('paint', plate, { tint: 0xeef0f0 });
        for (let k = 1; k < 4; k++) {
          const p = a.clone().lerp(b, k / 4);
          P.add('paint', bar(V(p.x, p.y + h - 0.1, p.z), V(p.x, p.y, p.z + 0.9), 0.08), { tier: 1 });
        }
      }
    }
    // the AK-130 barbette with the low ring round it [P: barbette 7.35 to 8.7 m; A: ring]
    {
      const G = L.ak130, yb = D(G.z);
      P.add('paint', yTube(yb - 0.05, yb + 0.4, G.ring, G.ring, 40, 0, G.z), { tint: 0xe4e8e8 });
      P.add('deck', yTube(yb + 0.38, yb + 0.41, G.ring - 0.05, G.ring - 0.05, 40, 0, G.z));
      P.add('paint', yTube(yb + 0.4, G.top, G.r, G.r, 36, 0, G.z), { tint: 0xeceff0 });
      P.add('dark', yTube(G.top - 0.02, G.top + 0.01, G.r - 0.05, G.r - 0.05, 36, 0, G.z), { tint: 0x8d9395 });
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; P.add('steel', box(0.08, 0.6, 0.08, Math.cos(a) * (G.r + 0.04), yb + 1.0, G.z + Math.sin(a) * (G.r + 0.04)), { tier: 2 }); }
      ladder(P, V(2.4, yb + 0.4, G.z + 3.0), V(1.6, G.top, G.z + 1.7), { w: 0.55 });
    }
    // bollards and fairleads along both edges, hatches and vents
    for (const s of [-1, 1]) {
      for (const z of [-85, -80, -66, -50, -30, 20, 40, 60, 76, 84, 90]) {
        const x = s * (deckHalfBeamAt(z) - 0.95);
        bollard(P, x, D(z), z, Math.PI / 2);
        fairlead(P, s * (deckHalfBeamAt(z + 1.4) - 0.32), D(z + 1.4), z + 1.4, Math.PI / 2);
      }
      hatch(P, s * 3.6, D(-84), -84, 1.0, 1.0);
      hatch(P, s * 4.6, D(-66.5), -66.5, 1.2, 1.0);
      mushroom(P, s * 5.4, D(-76), -76, 0.3, 0.7);
      mushroom(P, s * 6.6, D(-58.5), -58.5, 0.3, 0.7);
      gooseneck(P, s * 3.0, D(-80.5), -80.5, 0.12, 0.6, s > 0 ? 0 : Math.PI);
      locker(P, s * 6.2, D(-61), -61, 1.0, 0.75, 0.6, s * Math.PI / 2);
    }
    // jackstaff at the stem and its light
    P.add('paint', yTube(D(-92.6), D(-92.6) + 5.0, 0.07, 0.04, 6, 0, -92.6), { tier: 1 });
    P.add('lamp', sphere(0.12, 0, D(-92.6) + 5.1, -92.6, 1, 1, 1, 8), { tier: 2 });
  }

  // ---------------------------------------------------------- main deck amidships and aft
  for (const s of [-1, 1]) {
    for (const z of [-22, -2, 24, 42, 49]) mushroom(P, s * (deckHalfBeamAt(z) - 1.3), D(z), z, 0.3, 0.65);
    for (const z of [26.5, 45.5]) locker(P, s * (deckHalfBeamAt(z) - 0.9), D(z), z, 1.1, 0.8, 0.6, s * Math.PI / 2);
    // the covered 45 mm saluting guns at the deck edges abreast the Fort plinths [A: Ustinov 1988]
    {
      const x = s * (deckHalfBeamAt(40) - 2.0), z = 40.5;
      P.add('paint', yTube(D(z), D(z) + 0.6, 0.55, 0.6, 14, x, z), { tint: 0xd8dcdc });
      P.add('canvas', sphere(0.75, x, D(z) + 0.95, z, 1, 0.7, 1.2, 12), { tint: 0xa8aca0 });
    }
  }

  // ---------------------------------------------------------- quarterdeck and helicopter pad
  {
    const PD = L.heliPad;
    // the pad's deck with its markings (texture), conforming to the octagon's bounding rectangle
    const w = PD.x * 2, l = PD.z1 - PD.z0;
    const tex = flightDeckTexture(w, l);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0.02, polygonOffset: true, polygonOffsetFactor: -1 });
    const c = 3.0, x = PD.x, z0 = PD.z0, z1 = PD.z1;
    const shape = new THREE.Shape([[-x + c, z0], [x - c, z0], [x, z0 + c], [x, z1 - c], [x - c, z1], [-x + c, z1], [-x, z1 - c], [-x, z0 + c]].map(([px, pz]) => new THREE.Vector2(px, -pz)));
    const geo = new THREE.ShapeGeometry(shape, 1).rotateX(-Math.PI / 2).translate(0, PD.y + 0.01, 0);
    const uv = geo.attributes.uv, p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + x) / w, 1 - (p.getZ(i) - z0) / l);
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.name = 'slava-flight-deck';
    root.add(m);
    for (let z = z0 + 2; z < z1 - 1; z += 3.2) for (const s of [-1, 1]) P.add('lamp', box(0.25, 0.08, 0.25, s * (x - 0.6), PD.y + 0.04, z), { tier: 2 });
    for (let z = z0 + 2.5; z < z1 - 1; z += 3) for (let xx = -6; xx <= 6; xx += 3) P.add('dark', yTube(PD.y, PD.y + 0.03, 0.08, 0.08, 6, xx, z), { tier: 2 });
    // ladders up to the pad from the quarterdeck, capstans and bollards aft
    for (const s of [-1, 1]) {
      ladder(P, V(s * 7.2, D(76), 76.0), V(s * 7.2, PD.y, 73.8), { w: 0.6 });
      capstan(P, s * 7.8, D(88.5), 88.5, 0.45, 1);
      locker(P, s * (deckHalfBeamAt(80) - 0.8), D(80), 80, 1.1, 0.8, 0.6, s * Math.PI / 2, 1);
      P.add('red', box(0.5, 0.8, 0.3, s * (deckHalfBeamAt(84) - 0.5), D(84) + 0.4, 84.0), { tier: 1 });
      lifeRing(P, V(s * 6.21, D(80) + 1.2, 80), V(0, 0, -s), V(s, 0, 0));
    }
    // flagstaff at the stern
    P.add('paint', yTube(PD.y, PD.y + 5.0, 0.08, 0.05, 6, 0, STERN_Z - 0.7), { tier: 1 });
  }

  // ---------------------------------------------------------- whips along the deck edges
  for (const s of [-1, 1]) for (const z of [-60, -44, 12, 28, 46, 64]) whip(P, s * (deckHalfBeamAt(z) - 0.35), D(z), z, 8 + rnd() * 3, 1, [s * 0.2, 0]);
  void hRing; void rod;
}
