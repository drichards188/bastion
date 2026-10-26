import * as THREE from 'three';
import { Parts, projectUV } from '../exterior/kit.js';
import { flushGrime } from '../exterior/clutter.js';
import { slavaMats, SLAVA_UNIFORMS } from './materials.js';
import { buildHull } from './hull.js';
import { buildSuperstructure } from './superstructure.js';
import { buildMasts } from './masts.js';
import { buildDeck } from './deck.js';
import { buildEquipment } from './equipment.js';

// Kirov's Parts collector, plus metric box-projected UVs for Slava's own paint keys (the light grey
// roof paint and the red-brown Fort plinths), which the shared kit does not know.
const SLAVA_PROJECTED = { roof: 4, plinth: 4 };
class SlavaParts extends Parts {
  add(key, geom, o = {}) {
    if (!SLAVA_PROJECTED[key] || o.uv) return super.add(key, geom, o);
    const g = geom.index ? geom.toNonIndexed() : geom;
    if (geom !== g) geom.dispose?.();
    if (!g.attributes.normal) g.computeVertexNormals();
    projectUV(g, SLAVA_PROJECTED[key]);
    return super.add(key, g, { ...o, uv: true });
  }
}

// Assembles Slava's static exterior: hull, superstructure, masts and fittings, each merged per
// material and detail tier (one Parts collector per region keeps the merged meshes' bounds tight,
// which helps frustum culling and the LOD switch). Returns the root group and the rotating sensors.
export function buildSlavaShip({ deckHoles = [], hullNumber = '108', only = null, bridgeInterior = false } = {}) {
  const M = slavaMats();
  const root = new THREE.Group();
  root.name = 'slava-exterior';
  const stats = {};
  const region = (name, fn) => {
    const P = new SlavaParts(M);
    const out = fn(P);
    stats[name] = Math.round(P.triangles);
    if (!only || only.includes(name)) P.build(root, { name: 'slava-' + name });
    else P.lists.clear();
    return out;
  };
  region('hull', (P) => buildHull(P, M, root, { deckHoles, hullNumber }));
  region('deck', (P) => buildDeck(P, M, root));
  const s = region('superstructure', (P) => buildSuperstructure(P, M, { bridgeInterior }));
  const masts = region('masts', (P) => buildMasts(P, M, root));
  region('equipment', (P) => buildEquipment(P, M, root));
  flushGrime(root);
  SLAVA_UNIFORMS.setSoot([s.soot].filter(Boolean));
  const update = (time = 0) => {
    root.updateWorldMatrix(true, false);
    SLAVA_UNIFORMS.inverse.value.copy(root.matrixWorld).invert();
    masts.animate(time);
  };
  return { root, radars: masts.radars, update, stats, sockets: s.sockets };
}
