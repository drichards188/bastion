import * as THREE from 'three';
import { V, box, bar, rod, xf, yTube, zTube, xTube, sphere, chamferRect, ringAt, loft, topProfile, mulberry32, flightDeckTexture, hRing, TAU } from './kit.js';
import { rail, ladder, vLadder, mushroom, gooseneck, bollard, fairlead, capstan, hatch, locker, lifeRing, whip, door, louvre } from './fittings.js';
import { deckHeightAt, deckHalfBeamAt, LAYOUT, FORECASTLE_BREAK, QUARTERDECK_STEP } from './lines.js';
import { hullX } from './hull.js';

// Weather-deck fittings: the deck-edge railings, the raised AK-630 galleries flanking the Granit
// bank, the forecastle's anchor gear and mooring fittings, and the quarterdeck with the helicopter
// deck and its elevator. Photographic basis: 1985 bow and foredeck, 1986 stern quarter (USN).
// Mooring fittings are placed at typical spacings where the photographs do not resolve them [E].

const D = deckHeightAt;

export function buildDeck(P, M, root) {
  const rnd = mulberry32(6511);

  // ---------------------------------------------------------- deck-edge railings
  // Stanchions 0.15 m in from the deck edge, broken where structures stand at the edge: the AK-630
  // galleries, the boat-bay columns amidships and the quarterdeck platforms keep their own rails.
  const gaps = [[-51.6, -38.5], [5.0, 22.0]];
  for (const side of [-1, 1]) {
    let run = [];
    const flush = () => { if (run.length > 1) rail(P, run, (x, z) => D(z) + 0.08, { pitch: 1.6 }); run = []; };
    for (let z = -124.5; z <= 125.6; z += 1.6) {
      if (gaps.some(([a, b]) => z > a && z < b)) { flush(); continue; }
      run.push([side * (deckHalfBeamAt(z) - 0.18), z]);
      if (Math.abs(z - FORECASTLE_BREAK) < 0.9 || Math.abs(z - QUARTERDECK_STEP) < 0.9) { flush(); run.push([side * (deckHalfBeamAt(z) - 0.18), z]); }
    }
    flush();
  }
  // across the stern
  rail(P, [[-10.6, 125.75], [10.6, 125.75]], D(125.75) + 0.08, { pitch: 1.6 });

  // ---------------------------------------------------------- AK-630 galleries [P: z -51.4 to -38.7]
  {
    const G = LAYOUT.galleries;
    for (const s of [-1, 1]) {
      const xi = s * G.x0, xo = s * (deckHalfBeamAt(-45) - 0.15);
      const x0 = Math.min(xi, xo), x1 = Math.max(xi, xo);
      const plan = chamferRect(x0, x1, G.z0, G.z1, 1.2);
      P.add('paint', loft([ringAt(plan, D(-45) - 0.05), ringAt(plan, G.top)], { top: false, bottom: false }), { tint: 0xeef1f1 });
      P.add('deck', topProfile(plan, G.top - 0.06, G.top + 0.01));
      rail(P, [...plan.map(([x, z]) => [x, z]), plan[0]], G.top + 0.05);
      // the gallery's inboard face: doors to the gun crews' ready-use rooms, a vent and a hydrant
      const wz = s < 0 ? x1 : x0;
      door(P, V(wz, D(-44) + 0.05, -43.6), V(0, 0, s), V(-s, 0, 0));
      louvre(P, V(wz, D(-48) + 1.7, -48.2), V(0, 0, s), V(-s, 0, 0), { w: 0.9, h: 0.6 });
      ladder(P, V(x0 + (x1 - x0) * 0.5 - s * 0.0, D(-37.6), -37.4), V(x0 + (x1 - x0) * 0.5, G.top, -39.6));
      // a small control post and ready-use lockers on top, clear of the gun positions
      P.add('paint', box(1.4, 1.6, 1.4, s * 9.6, G.top + 0.8, -50.0), { tint: 0xe6eaea });
      P.add('glass', box(1.0, 0.35, 0.04, s * 9.6, G.top + 1.25, -50.72), { tier: 1 });
      locker(P, s * 12.6, G.top, -43.5, 0.8, 0.7, 0.55, s * Math.PI / 2);
    }
  }

  // ---------------------------------------------------------- forecastle: anchor gear and mooring
  for (const s of [-1, 1]) {
    // windlass heads with their gypsies, and two warping capstans further aft
    capstan(P, s * 2.0, D(-108.6), -108.6, 0.62);
    P.add('dark', box(2.2, 0.5, 1.6, s * 2.0, D(-106.6) + 0.25, -106.6), { tier: 0, tint: 0x9aa0a0 });
    capstan(P, s * 4.6, D(-99.5), -99.5, 0.45);
    // bollards and fairleads along both edges
    for (const z of [-118, -111, -102, -86, -76, -64, -30, 30, 60, 98, 107, 116]) {
      if (z > -52 && z < -38) continue;
      const x = s * (deckHalfBeamAt(z) - 1.1);
      bollard(P, x, D(z), z, Math.PI / 2 + (deckHalfBeamAt(z + 1) - deckHalfBeamAt(z - 1)) * 0.25 * s);
      fairlead(P, s * (deckHalfBeamAt(z + 1.4) - 0.35), D(z + 1.4), z + 1.4, Math.PI / 2);
    }
    // hatches and vents on the forecastle
    hatch(P, s * 5.5, D(-112), -112, 1.0, 1.0);
    hatch(P, s * 6.8, D(-83), -83, 1.2, 1.0);
    mushroom(P, s * 7.5, D(-95), -95, 0.32, 0.7);
    mushroom(P, s * 9.0, D(-78), -78, 0.32, 0.7);
    gooseneck(P, s * 8.5, D(-104), -104, 0.12, 0.6, s > 0 ? 0 : Math.PI);
    // ladders up the forecastle break
    ladder(P, V(s * 11.0, D(FORECASTLE_BREAK + 1.6), FORECASTLE_BREAK + 1.6), V(s * 11.0, D(FORECASTLE_BREAK - 0.6), FORECASTLE_BREAK - 0.6), { w: 0.6 });
    // life rings on the break bulkhead and the superstructure front
    lifeRing(P, V(s * 7.5, D(-70) + 0.55, FORECASTLE_BREAK + 0.57), V(-s, 0, 0).multiplyScalar(-1).set(1, 0, 0), V(0, 0, 1));
  }
  // jackstaff at the stem and the anchor light
  P.add('paint', yTube(D(-125.2), D(-125.2) + 6.0, 0.07, 0.04, 6, 0, -125.2), { tier: 1 });
  P.add('lamp', sphere(0.12, 0, D(-125.2) + 6.1, -125.2, 1, 1, 1, 8), { tier: 2 });
  // the main deck between the galleries and the superstructure: lockers and vents at the edges
  for (const s of [-1, 1]) {
    for (const z of [-66, -33.5]) locker(P, s * 12.4, D(z), z, 1.0, 0.75, 0.6, s * Math.PI / 2);
    for (const z of [-60, -36.5]) mushroom(P, s * 12.0, D(z), z, 0.3, 0.65);
  }

  // ---------------------------------------------------------- quarterdeck and helicopter deck
  {
    const z0 = LAYOUT.heliDeck.z0, z1 = LAYOUT.heliDeck.z1, w = 20;
    const tex = flightDeckTexture(w, z1 - z0);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0.02, polygonOffset: true, polygonOffsetFactor: -1 });
    // a deck overlay conforming to the gentle sheer
    const geo = new THREE.PlaneGeometry(w, z1 - z0, 8, 16).rotateX(-Math.PI / 2).translate(0, 0, (z0 + z1) / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, D(p.getZ(i)) + 0.025);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.name = 'flight-deck';
    root.add(m);
    // the aircraft elevator: a slightly raised grid of steel slats in a frame [1986 photograph]
    const E = LAYOUT.elevator, y = D(E.z) + 0.05;
    P.add('dark', box(E.w + 0.3, 0.06, E.l + 0.3, 0, y, E.z), { tint: 0x8a9092 });
    for (let x = -E.w / 2 + 0.25; x < E.w / 2; x += 0.3) P.add('steel', box(0.05, 0.05, E.l, x, y + 0.05, E.z), { tier: 1, tint: 0x9aa0a2 });
    for (let z = E.z - E.l / 2 + 0.4; z < E.z + E.l / 2; z += 0.8) P.add('steel', box(E.w, 0.04, 0.05, 0, y + 0.07, z), { tier: 2 });
    // its guide rails, the lines photographed running fore and aft over the deck
    for (const x of [-3.0, 3.0]) P.add('steel', box(0.18, 0.06, 26, x, D(108) + 0.04, 108), { tier: 1, tint: 0x8d9395 });
    // tie-down points, deck lights round the landing area and the safety nets at the deck edge
    for (let z = z0 + 2; z < z1; z += 3) for (let x = -8; x <= 8; x += 4) P.add('dark', yTube(D(z), D(z) + 0.03, 0.09, 0.09, 6, x, z), { tier: 2 });
    for (let z = z0 + 1; z < z1; z += 3.2) for (const s of [-1, 1]) P.add('lamp', box(0.25, 0.08, 0.25, s * 9.6, D(z) + 0.05, z), { tier: 2 });
    for (const s of [-1, 1]) {
      // safety nets along the flight-deck edges, folded up (as photographed in 1986): a light frame
      // of outriggers standing at the deck edge with the net between them
      for (let z = z0; z < z1 - 1; z += 2.0) {
        const x = side => side * (deckHalfBeamAt(z) + 0.08);
        const xa = x(s), xb = s * (deckHalfBeamAt(z) + 0.35);
        P.add('steel', rod(V(xa, D(z) - 0.1, z), V(xb, D(z) + 1.05, z), 0.03, 4), { tier: 2 });
        P.add('steel', rod(V(xb, D(z) + 1.05, z), V(xb, D(z + 2) + 1.05, z + 2), 0.025, 4), { tier: 2 });
      }
      // capstans and bollards aft
      capstan(P, s * 6.5, D(101.5), 101.5, 0.5, 1);
      capstan(P, s * 6.0, D(121.5), 121.5, 0.45, 1);
      // deck-edge lockers and a fire station
      locker(P, s * 11.8, D(100), 100, 1.2, 0.8, 0.6, s * Math.PI / 2);
      P.add('red', box(0.5, 0.8, 0.3, s * 12.0, D(110) + 0.4, 110.0), { tier: 1 });
    }
    // flagstaff at the stern (harbour ensign position; the sea ensign flies from the gaff)
    P.add('paint', yTube(D(125.3), D(125.3) + 6.5, 0.08, 0.05, 6, 0, 125.3), { tier: 1 });
    // helicopter control station: a small glazed cab on the port quarterdeck platform's aft end
    P.add('paint', box(2.2, 2.2, 2.0, -10.6, 8.9 + 1.1, 92.8), { tint: 0xe9ecec });
    P.add('glass', box(0.04, 0.8, 1.6, -9.48, 8.9 + 1.5, 92.8), { tier: 1 });
  }

  // ---------------------------------------------------------- whips along the main deck edges
  for (const s of [-1, 1]) {
    for (const z of [-66, -58, 26, 40, 55, 68, 80]) whip(P, s * (deckHalfBeamAt(z) - 0.35), D(z), z, 9 + rnd() * 3, 1, [s * 0.2, 0]);
  }
  void hullX; void zTube; void xTube; void bar; void vLadder; void hRing; void TAU; void xf;
}
