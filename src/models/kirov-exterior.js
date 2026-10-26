import * as THREE from 'three';
import { deckHeightAt as linesDeckHeightAt, LAYOUT, LENGTH, BEAM, DRAFT } from './exterior/lines.js';
import { buildShip } from './exterior/ship.js';
import { MOUNT_Y } from './exterior/superstructure.js';
import { exteriorMats } from './exterior/materials.js';
import { buildInlineWeapons } from './exterior/inline-weapons.js';
import { buildDeckCrew, defaultCrewFactory, CREW_POSTS } from './exterior/crew.js';

// Kirov (Project 1144, hull 065 as photographed in 1985): the exterior. Hull lines and general
// arrangement are measured on public-domain USN photographs (1983 port beam and port amidships,
// 1985 bow and foredeck, 1986 stern quarter) and the 1986 All Hands profile; see
// src/models/exterior/lines.js for the measured values and refs/README.md for the sources.
// Model space: ship-local metres, bow toward -Z, waterline at Y = 0, +X starboard; 252 m x 28.5 m.
//
// buildExterior({ weapons = true, crew = true, crewFactory, deckHoles = [] }) returns
//   { group, radars, launchPoints, animate, animateLaunch, prepareWeapon, aimWeapons, safeWeapon,
//     getLaunchPoint, weapons, crew, MOUNTS }
//   weapons:false skips the interim inline weapons (the game places kirov-weapons.js from MOUNTS);
//   the weapon functions are then no-ops and launchPoints empty.
//   crewFactory(post) -> { root, update(dt) } builds a figure for each CREW_POSTS entry (default:
//   the crew module's buildNavalCrewman); crew:false builds none.

export { CREW_POSTS };

// Deck height (top of the forecastle, main or quarterdeck plating) at ship z.
export const deckHeightAt = linesDeckHeightAt;
const r3 = (v) => Math.round(v * 1000) / 1000;
const onDeck = (x, z, extra = {}) => ({ x: r3(x), y: r3(deckHeightAt(z)), z: r3(z), ...extra });

// Where the walk-in bridge group's origin goes (same convention as the old (0, 20, -30)): the
// room's front face (local z -4.95) lands on the photographed navigation-bridge front at z = -17.5,
// its floor at 20.5 m and its roof under the 24.6 m block roof (USN port-amidships frame, 1983).
export const BRIDGE_ANCHOR = { x: 0, y: 20.5, z: -12.55 };

// Weapon and director mounts, ship-local metres. y is the top of the flat deck or platform the
// mount stands on; ry is the stowed train (0 = facing the bow, PI = facing aft). The exterior keeps
// flat plating at these spots; the weapons module owns launcher wells, hatches, Osa tubs, guns and
// the trainable directors. Entries marked estimated:true are placed by reasoning, not measurement.
export const MOUNTS = (() => {
  const granit = [], fort = [];
  // Granit: 4 across x 5 along, cells about 3.75 m athwartships and 4.0 m fore-and-aft (z -55.5..-35.5).
  for (let row = 0; row < 5; row++) for (let col = 0; col < 4; col++) {
    const x = (col - 1.5) * 3.75, z = -53.5 + row * 4.0;
    granit.push(onDeck(x, z, { cell: granit.length, row, col, footprint: [3.4, 3.6] }));
  }
  // Fort: 3 longitudinal rows of 4 hatches (z -70.6..-56.9). The photographed spacing across is
  // uneven and partly hidden by the bulwark; an even 4.5 m spacing is used.
  for (let col = 0; col < 4; col++) for (let row = 0; row < 3; row++) {
    const x = (row - 1) * 4.5, z = -69.0 + col * 3.5;
    fort.push(onDeck(x, z, { launcher: fort.length, row, col, footprint: [3.6, 3.2] }));
  }
  // Osa-M pop-up launchers in tubs at the forward corners of the 01-level deckhouse (1985 foredeck
  // photograph; the z position is uncertain by a few metres).
  const osa = [-1, 1].map((side) => ({ x: side * 9.6, y: LAYOUT.level01, z: -27, side, ry: 0, tubRadius: 2.4, estimated: true }));
  const ak630 = [];
  // Forward pairs on the raised galleries flanking the Granit bank (gallery top 12.2 m).
  for (const side of [-1, 1]) for (const z of [-46.2, -40.8]) ak630.push({ x: side * 11.2, y: LAYOUT.galleries.top, z, side, group: 'forward', ry: (side * Math.PI) / 2 });
  // Aft pairs on raised platforms at the forward corners of the quarterdeck (platform top 8.9 m,
  // z 85 to 99.5: 1983 profile for z, 1986 stern quarter for x).
  for (const side of [-1, 1]) for (const z of [89.0, 96.5]) ak630.push({ x: side * 10.4, y: LAYOUT.quarterPlatforms.top, z, side, group: 'aft', ry: (side * Math.PI) / 2 });
  const topDomeFwd = { x: 0, y: MOUNT_Y.fortFwd, z: -3.5, ry: 0, name: '3R41 Volna (Top Dome), forward, on the house over the bridge' };
  const topDomeAft = { x: 0, y: MOUNT_Y.fortAft, z: 45.4, ry: Math.PI, name: '3R41 Volna (Top Dome), aft' };
  return {
    granit, fort, osa, ak630,
    // Tandem single AK-100s on the centreline: the forward one on a barbette at the aft end of the
    // 01-level deckhouse, the aft one on a low barbette on the main deck. y = barbette top.
    ak100: [{ x: 0, y: LAYOUT.ak100Fwd.top, z: LAYOUT.ak100Fwd.z, ry: Math.PI }, { x: 0, y: LAYOUT.ak100Aft.top, z: LAYOUT.ak100Aft.z, ry: Math.PI }],
    // Metel (SS-N-14) twin launcher on the raised forecastle.
    metel: { ...onDeck(0, LAYOUT.metelZ), ry: 0 },
    // RBU-6000 on the forecastle ahead of Metel; RBU-1000 pair on the quarterdeck just abaft the
    // AK-630 platforms, outboard of the landing area (position estimated).
    rbu6000: { ...onDeck(0, LAYOUT.rbu6000Z), ry: 0 },
    rbu1000: [-1, 1].map((side) => ({ ...onDeck(side * 10.2, 102.5), side, ry: Math.PI, estimated: true })),
    directors: {
      fortFwd: topDomeFwd,
      fortAft: topDomeAft,
      fort: [topDomeFwd, topDomeAft],
      // 4R33 (Pop Group) for Osa: pedestals on the 02-level roof at the forward block's sides
      // (identity estimated; kept off the centreline for the bridge's view of the foredeck).
      osa: [-1, 1].map((side) => ({ x: side * 6.0, y: r3(LAYOUT.level02 + 1.15), z: -30.5, side, ry: 0, name: '4R33 Pop Group', estimated: true })),
      // MR-184 (Kite Screech) for AK-100: centreline platform aft of the aft Top Dome.
      ak100: [{ x: 0, y: 17.3, z: 53.5, ry: Math.PI, name: 'MR-184 Kite Screech' }],
      // MR-123 (Bass Tilt) radomes for AK-630: dome-topped cylinders, two on columns amidships
      // (staggered: port z 4.3, starboard z 14.5 [P]) and two abreast the aft Top Dome. Their radomes do not visibly train, so the
      // exterior models them complete (modelledByExterior); the weapons module need not.
      ak630: [{ x: -12.0, y: 16.15, z: 4.3, side: -1 }, { x: 12.0, y: 16.15, z: 14.5, side: 1 }, { x: -9.4, y: 17.2, z: 45.4, side: -1 }, { x: 9.4, y: 17.2, z: 45.4, side: 1 }]
        .map((d) => ({ ...d, ry: 0, name: 'MR-123 Bass Tilt', modelledByExterior: true })),
    },
  };
})();

const noop = () => {};

export function buildExterior({ weapons = true, crew = true, crewFactory = defaultCrewFactory, deckHoles = [] } = {}) {
  const ship = buildShip({ deckHoles });
  const group = new THREE.Group();
  group.name = 'Kirov 065 · USN photo reconstruction 1985';
  group.add(ship.root);
  const W = weapons ? buildInlineWeapons(group, exteriorMats(), MOUNTS) : null;
  const deckCrew = crew ? buildDeckCrew(group, crewFactory) : null;
  group.userData.dimensions = { length: LENGTH, beam: BEAM, draft: DRAFT };
  const animate = (time = 0, dt = 0, state = {}) => {
    ship.update(time);
    W?.animate(time, dt, state);
    deckCrew?.update(dt);
  };
  return {
    group,
    radars: ship.radars,
    launchPoints: W ? W.launchPoints : { granit: [], fort: [], osa: [], gun: [] },
    animate,
    animateLaunch: W?.animateLaunch || noop,
    prepareWeapon: W?.prepareWeapon || noop,
    aimWeapons: W?.aimWeapons || noop,
    safeWeapon: W?.safeWeapon || noop,
    getLaunchPoint: W?.getLaunchPoint || (() => undefined),
    weapons: W?.group || null,
    crew: deckCrew,
    stats: ship.stats,
    MOUNTS,
  };
}
