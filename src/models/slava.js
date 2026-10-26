import { Group } from 'three';
import * as Exterior from './slava-exterior.js';
import { buildBridge } from './kirov-bridge.js';
import { buildSlavaWeapons, SLAVA_MAGAZINES } from './slava-weapons.js';

// Slava (Project 1164, 1985) composed the way models.js composes Kirov: the exterior (hull,
// superstructure, masts and fittings, built without weapons), the weapons (launchers, guns and
// directors as working machines, placed from the exterior's SLAVA_MOUNTS) and the walk-in bridge,
// built by kirov-bridge.js to the exterior's measured Slava plan (SLAVA_BRIDGE) at SLAVA_BRIDGE_ANCHOR.
// buildSlava() returns exactly buildKirov()'s interface, so main.js can drive either ship; the extra
// fields (name, kinds, magazines, fireGun, mounts) are Slava's additions. Its weapon kinds are 'bazalt', 'fort', 'osa', 'gun' (AK-630) and
// 'ak130'; the flying rounds come from buildFlightMissile (weapons/missiles.js), 'bazalt' included.

// bridgeInterior opens the exterior's bridge level for the Slava-shaped room (false keeps the
// exterior's own closed, glazed bridge block, for previews of the exterior alone).
export function buildSlava({ crewFactory, bridgeInterior = true } = {}) {
  // the bridge group stands at the exterior's anchor (the bridge derives its eye and target from
  // its own group position, so they are not shifted here)
  const anchor = Exterior.SLAVA_BRIDGE_ANCHOR ?? { x: 0, y: 17.4, z: -26.85 };
  const exterior = Exterior.buildSlavaExterior({ weapons: false, bridgeInterior, ...(crewFactory ? { crewFactory } : {}) });
  const weapons = buildSlavaWeapons({ mounts: Exterior.SLAVA_MOUNTS, deckHeightAt: Exterior.slavaDeckHeightAt });
  const bridge = buildBridge({ anchor, plan: Exterior.SLAVA_BRIDGE });
  bridge.group.position.set(anchor.x, anchor.y, anchor.z);
  const group = new Group();
  group.name = 'Slava · Project 1164 · 1985';
  group.add(exterior.group, weapons.group, bridge.group);
  // open the deck plating over the launcher wells and under the Fort turntables
  weapons.cutouts.apply(exterior.group);
  return {
    group, bridge: bridge.group, bridgeEye: bridge.eye, bridgeTarget: bridge.target,
    radars: exterior.radars, weapons,
    launchPoints: weapons.launchPoints,
    launchFrame: weapons.launchFrame,
    animateLaunch: weapons.animateLaunch,
    coldLaunch: weapons.coldLaunch,
    ignite: weapons.ignite,
    ciwsBurst: weapons.ciwsBurst,
    inspectView: weapons.inspectView,
    attachFx: weapons.attachFx,
    getLaunchPoint: weapons.getLaunchPoint,
    prepareWeapon: weapons.prepareWeapon, aimWeapons: weapons.aimWeapons, safeWeapon: weapons.safeWeapon,
    updateDisplays: bridge.updateDisplays,
    animate(time, dt, state) {
      exterior.animate(time, dt, state);
      weapons.animate(time, dt, state);
      bridge.animate(time, dt, state);
    },
    // Slava's additions
    name: 'Slava', kinds: ['bazalt', 'fort', 'osa', 'gun', 'ak130'], magazines: { ...SLAVA_MAGAZINES },
    fireGun: weapons.fireGun, mounts: Exterior.SLAVA_MOUNTS,
  };
}
