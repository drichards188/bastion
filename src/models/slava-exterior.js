import * as THREE from 'three';
import { deckHeightAt as linesDeckHeightAt, LAYOUT, LENGTH, BEAM, DRAFT } from './slava/lines.js';
import { buildSlavaShip } from './slava/ship.js';
import { buildDeckCrew, SLAVA_CREW_POSTS, defaultCrewFactory } from './slava/crew.js';

// Slava (Project 1164 Atlant, the lead ship, hull number 108 as photographed in 1984 to 1986): the
// exterior. Hull lines and general arrangement are measured on public-domain USN photographs (the
// near-orthographic 1986 port-beam colour frame for z and heights; the 1983 and 1985 aerial frames
// and the 1984 elevated port view for plan widths); see src/models/slava/lines.js for the measured
// values and refs/README.md ("Slava exterior") for the sources.
// Model space: ship-local metres, bow toward -Z, waterline at Y = 0, +X starboard; 186.4 m x 20.8 m.
//
// buildSlavaExterior({ weapons = false, crew = true, crewFactory, deckHoles = [], hullNumber,
//   bridgeInterior = false }) returns
//   { group, radars, animate, crew, stats, MOUNTS }
//   weapons is accepted for symmetry with buildExterior; the Slava exterior never builds weapons
//   (slava-weapons.js places them from SLAVA_MOUNTS).
//   crewFactory(post) -> { root, update(dt) } builds a figure for each SLAVA_CREW_POSTS entry (default:
//   kirov-crew.js's buildNavalCrewman); crew:false builds none.
//   bridgeInterior:true leaves the navigation-bridge level open inside the SLAVA_BRIDGE envelope for
//   a walk-in room with its own skin (floor slab kept below 17.4 m, roof slab above 20.1 m, wings
//   and wing doors kept); false (default) builds the bridge closed with its own glazing.

export { SLAVA_CREW_POSTS };

// Deck height (top of the weather deck or quarterdeck plating at the deck edge) at ship z.
export const slavaDeckHeightAt = linesDeckHeightAt;
const r3 = (v) => Math.round(v * 1000) / 1000;
const DEG = Math.PI / 180;

// Where the walk-in bridge group's origin goes (the Kirov room's frame: front windows at local
// z -4.8, floor at local y 0): the room's front face (local z -4.95) on the photographed bridge
// front at z = -31.8, its floor on the 17.4 m bridge deck and its 2.6 m ceiling under the 20.1 m
// roof [P: 1986 broadside]. The Slava's bridge is narrower than the Kirov room and faceted (see
// SLAVA_BRIDGE), so the exterior builds the bridge level closed, with its own windows.
export const SLAVA_BRIDGE_ANCHOR = { x: 0, y: 17.4, z: -26.85 };

// The measured navigation-bridge level, for parameterising a Slava room. Plan: a flat front
// +-frontHalfWidth wide at z = front, chamfers to the +-halfWidth sides `chamfer` metres aft, sides
// to z = aft (the level's after end; the pylon stands on its roof from z -21.5). The windowed front
// leans out by `rakeOut` metres at the roof. Windows: about 8 on the front face, 4 on each chamfer,
// 5 along each side's forward part, round ports further aft; sill 18.3 m, head 19.3 m. Side doors
// (0.8 x 1.8 m) to the open wings at z -25.7 (wings x +-7.2..8.6, z -27.6..-23.8). [P: 1986 broadside; A: 1984 elevated and 1985
// aerial cameras, Marshal Ustinov 1988 and 1989 photographs.]
export const SLAVA_BRIDGE = {
  front: LAYOUT.bridgeBlock.z0, aft: LAYOUT.bridgeBlock.zBridgeAft, floor: LAYOUT.bridgeBlock.deck, roof: LAYOUT.bridgeBlock.roof,
  frontHalfWidth: LAYOUT.bridgeBlock.xFront, halfWidth: LAYOUT.bridgeBlock.x, chamfer: 2.95, rakeOut: 0.8,
  windowSill: 18.3, windowHead: 19.3, wingDoorZ: -25.7, wingDoor: { w: 0.8, h: 1.8 },
  kirovRoomFits: false, // the Kirov room is 15.8 m wide (x +-7.9); this front is 8.5 m, the sides 14.4 m
  estimated: ['halfWidth', 'frontHalfWidth', 'chamfer'],
};

// Weapon and director mounts, ship-local metres. y is the top of the flat deck, platform or
// barbette the mount stands on; ry is the stowed train (0 = facing the bow, +PI/2 = facing port,
// the weapons kit's train sense). The exterior keeps flat plating at these spots; the weapons module
// owns the launchers, lids, wells, guns and trainable directors. Entries marked estimated:true are
// placed by reasoning or by an uncertain plan reading (about +-1 m), not by a square-on measurement;
// entries marked modelledByExterior:true are built complete by the exterior.
export const SLAVA_MOUNTS = (() => {
  const L = LAYOUT;
  // ---- P-500 Bazalt: eight twin SM-248 launchers (16 containers), four per side, fixed, inclined
  // 15.8 degrees with the forward end up [P]. Containers 12.2 m long, 1.75 m across [P]; the two of a
  // pair lie side by side at the same height [A]. The exterior builds the inclined support frames
  // (the side webs with the walk-through openings) under them; the weapons module the containers,
  // their front covers and the rounds. Front-centre heights 10.8 m, pairs 11.65 m apart [P].
  const B = L.bazalt, th = B.incline * DEG, dir = { x: 0, y: Math.sin(th), z: -Math.cos(th) };
  const bazalt = [];
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const zf = B.z0 + i * B.pitch;
    const tubes = [B.xIn, B.xOut].map((ax, k) => {
      const x = side * ax;
      const front = { x: r3(x), y: r3(B.yFront), z: r3(zf) };
      const rear = { x: r3(x), y: r3(B.yFront - B.length * dir.y), z: r3(zf - B.length * dir.z) };
      return { x: r3(x), inboard: k === 0, front, rear, estimatedX: true };
    });
    const zc = zf - (B.length / 2) * dir.z;
    bazalt.push({
      launcher: bazalt.length, side, pair: i, x: r3(side * (B.xIn + B.xOut) / 2), y: r3(linesDeckHeightAt(zc)), z: r3(zc), ry: 0,
      incline: r3(th), dir: { x: 0, y: r3(dir.y), z: r3(dir.z) }, length: B.length, diameter: B.dia, tubes,
    });
  }
  // ---- S-300F Fort: eight B-204 revolver launchers of eight rounds under the deck abaft the
  // funnel, two rows of four (3.9 m apart) on two raised stadium-shaped plinths (0.55 m above the
  // deck, x 0.75..5.35, z 32.8..48.4 each side, built by the exterior). y = plinth top; lidRadius =
  // radius of the ring of eight round hatches [A: Marshal Ustinov 1988 from above, Slava 1989 aboard].
  const F = L.fort, plinthTop = r3(linesDeckHeightAt(40) + F.plinth.h);
  const fort = [];
  for (const side of [-1, 1]) F.z.forEach((z, col) => fort.push({ launcher: fort.length, x: r3(side * F.x), y: plinthTop, z, row: side < 0 ? 0 : 1, col, side, rounds: 8, lidRadius: F.lidRadius, ry: 0, estimatedX: true }));
  // ---- Osa-M: two ZIF-122 pop-up launchers under round drum housings on the quarterdeck, either
  // side of the hangar lid just forward of the helicopter pad (armament diagram, 1984 elevated and
  // Marshal Ustinov 1988 aerial frames). y = quarterdeck; the weapons module builds the drums.
  const osa = [-1, 1].map((side) => ({ x: r3(side * L.osa.x), y: r3(linesDeckHeightAt(L.osa.z)), z: L.osa.z, side, ry: Math.PI, tubRadius: L.osa.r, estimated: true }));
  // ---- AK-130: the twin 130 mm mount on its barbette on the forecastle [P z and heights].
  const ak130 = { x: 0, y: L.ak130.top, z: L.ak130.z, ry: 0, barbetteRadius: L.ak130.r };
  // ---- AK-630: six. A tandem pair on the centreline house at the forward end of the superstructure
  // (the after one a deck higher) [P: 1986 broadside, 1983 aerial bow]; two each side on 01-level
  // sponsons abreast the main mast [P z: armament diagram and 1986 broadside; x estimated].
  const ak630 = [
    { x: 0, y: L.fwdHouse.roof0, z: -54.0, side: 0, group: 'forward', ry: 0 },
    { x: 0, y: L.fwdHouse.roof1, z: -48.5, side: 0, group: 'forward', ry: 0 },
  ];
  for (const side of [-1, 1]) for (const z of [3.4, 9.0]) ak630.push({ x: r3(side * 8.4), y: L.mainBlock.sponson, z, side, group: 'midships', ry: -side * Math.PI / 2, estimatedX: true });
  // ---- RBU-6000: two, side by side on the centreline house just ahead of the bridge, stowed
  // vertical for loading [P z and height; A x].
  const rbu6000 = [-1, 1].map((side) => ({ x: r3(side * 1.6), y: L.fwdHouse.roof2, z: -40.5, side, ry: 0, estimatedX: true }));
  // ---- 533 mm torpedo tubes: two quintuple PTA-53-1164 behind shutters in the hull sides under
  // the aft block (armament diagram) [E size]. The exterior models the shutters closed.
  const torpedo = [-1, 1].map((side) => ({ side, z0: L.torpedo.z0, z1: L.torpedo.z1, y0: L.torpedo.y0, y1: L.torpedo.y1, tubes: 5, modelledByExterior: true, estimated: true }));

  const topDome = { x: 0, y: L.topDome.top, z: L.topDome.z, ry: 0, name: '3R41 Volna (Top Dome), on the aft block' };
  return {
    bazalt, fort, osa, ak130, ak630, rbu6000, torpedo,
    directors: {
      fort: [topDome],
      fortAft: topDome,
      // 4R33 (Pop Group) for Osa: on pedestals (0.6 m, built by the exterior) at the aft block's after
      // roof corners, one each side [A: Marshal Ustinov 1988 from above].
      osa: [-1, 1].map((side) => ({ x: r3(side * 4.8), y: r3(L.aftBlock.roof + 0.6), z: 61.4, side, ry: Math.PI, name: '4R33 Pop Group', estimated: true })),
      // MR-184 (Kite Screech) for the AK-130: on a pedestal on the bridge roof forward [P].
      ak130: [{ x: 0, y: L.bridgeBlock.roof, z: -27.0, ry: 0, name: 'MR-184 Kite Screech' }],
      // MR-123 (Bass Tilt) for the AK-630s: one on the centreline house for the forward pair, one
      // each side of the bridge block for the midships pairs [P z, heights; x estimated]. Radomes
      // that do not visibly train, built complete by the exterior (as on Kirov).
      ak630: [
        { x: 1.7, y: 15.0, z: -36.0, side: 0, group: 'forward' },
        { x: -6.2, y: 13.0, z: -14.3, side: -1, group: 'midships' },
        { x: 6.2, y: 13.0, z: -14.3, side: 1, group: 'midships' },
      ].map((d) => ({ ...d, ry: 0, name: 'MR-123 Bass Tilt', modelledByExterior: true, estimated: true })),
      // Argon (Front Door / Front Piece), the Bazalt guidance and data-link radar: a fixed antenna in
      // the forward face of the foremast, built by the exterior.
      bazalt: [{ x: 0, y: 23.5, z: -20.2, ry: 0, name: 'Argon (Front Door)', modelledByExterior: true }],
    },
  };
})();

export function buildSlavaExterior({ weapons = false, crew = true, crewFactory = defaultCrewFactory, deckHoles = [], hullNumber = '108', bridgeInterior = false } = {}) {
  void weapons;
  const ship = buildSlavaShip({ deckHoles, hullNumber, bridgeInterior });
  const group = new THREE.Group();
  group.name = 'Slava 108 · USN photo reconstruction 1985';
  group.add(ship.root);
  const deckCrew = crew ? buildDeckCrew(group, crewFactory, SLAVA_CREW_POSTS) : null;
  group.userData.dimensions = { length: LENGTH, beam: BEAM, draft: DRAFT };
  const animate = (time = 0, dt = 0) => {
    ship.update(time);
    deckCrew?.update(dt);
  };
  return { group, radars: ship.radars, animate, crew: deckCrew, stats: ship.stats, MOUNTS: SLAVA_MOUNTS, bridge: SLAVA_BRIDGE };
}
