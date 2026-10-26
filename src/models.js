import { Group } from 'three';
import * as Exterior from './models/kirov-exterior.js';
import { buildBridge } from './models/kirov-bridge.js';
import { buildWeapons, buildFlightMissile } from './models/kirov-weapons.js';
import { buildMissile as buildLegacyMissile } from './models-legacy.js';
export { buildEnemyShip, buildAircraft } from './models-legacy.js';

// Kirov is composed of three reference-driven modules: the exterior (hull, superstructure, masts and
// fittings, built without weapons), the weapons (launchers, guns and directors as working machines,
// placed from the exterior's MOUNTS table) and the walk-in bridge. The opposing silhouettes remain the
// original lightweight assets for distant tactical contacts.

// Kirov's own rounds in flight are the ones modelled in their launchers; the Harpoon stays legacy.
export function buildMissile(kind) {
  return buildFlightMissile(kind) || buildLegacyMissile(kind);
}

export function buildKirov() {
  // the bridge group stands at the exterior's BRIDGE_ANCHOR (the bridge derives its eye and target
  // from its own group position, so they are not shifted here)
  const anchor = Exterior.BRIDGE_ANCHOR ?? { x: 0, y: 20, z: -30 };
  const exterior = Exterior.buildExterior({ weapons: false }), weapons = buildWeapons(), bridge = buildBridge({ anchor });
  bridge.group.position.set(anchor.x, anchor.y, anchor.z);
  const group = new Group();
  group.name = 'Kirov · Project 1144 · 1985';
  group.add(exterior.group, weapons.group, bridge.group);
  // open the deck plating over the launcher wells
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
  };
}
