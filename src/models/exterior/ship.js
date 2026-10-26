import * as THREE from 'three';
import { Parts, shipInverse, setSoot } from './kit.js';
import { exteriorMats } from './materials.js';
import { buildHull } from './hull.js';
import { buildSuperstructure } from './superstructure.js';
import { buildMasts } from './masts.js';
import { buildDeck } from './deck.js';
import { buildEquipment } from './equipment.js';
import { flushGrime } from './clutter.js';

// Assembles the static exterior: hull, superstructure, masts and fittings, each merged per material
// and detail tier (one Parts collector per region keeps the merged meshes' bounds tight, which
// helps frustum culling and the LOD switch). Returns the root group and the animated sensors.
export function buildShip({ deckHoles = [], only = null } = {}) {
  const M = exteriorMats();
  const root = new THREE.Group();
  root.name = 'kirov-exterior';
  const stats = {};

  const hull = new Parts(M);
  buildHull(hull, M, root, { deckHoles });
  stats.hull = Math.round(hull.triangles);
  hull.build(root, { name: 'hull' });

  const deck = new Parts(M);
  buildDeck(deck, M, root);
  stats.deck = Math.round(deck.triangles);
  if (!only || only.includes('deck')) deck.build(root, { name: 'deck' });

  const sup = new Parts(M);
  const s = buildSuperstructure(sup, M);
  stats.superstructure = Math.round(sup.triangles);
  if (!only || only.includes('sup')) sup.build(root, { name: 'superstructure' });

  const mastParts = new Parts(M);
  const masts = buildMasts(mastParts, M, root);
  stats.masts = Math.round(mastParts.triangles);
  if (!only || only.includes('masts')) mastParts.build(root, { name: 'masts' });

  const eq = new Parts(M);
  buildEquipment(eq, M, root);
  stats.equipment = Math.round(eq.triangles);
  if (!only || only.includes('equipment')) eq.build(root, { name: 'equipment' });

  flushGrime(root);
  setSoot([s.sootFwd, s.sootAft].filter(Boolean));
  const update = (time = 0) => {
    root.updateWorldMatrix(true, false);
    shipInverse.value.copy(root.matrixWorld).invert();
    masts.animate(time);
  };
  return { root, radars: masts.radars, update, stats, sockets: s.sockets };
}
