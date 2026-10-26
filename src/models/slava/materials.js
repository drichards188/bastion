import * as THREE from 'three';
import { paintTextures, deckTextures, grainTextures, latticeTexture, windowTexture, shipFinish, shipUniforms } from '../exterior/kit.js';

// Slava's exterior materials: Kirov's palette and textures (the same light Soviet naval grey, the
// red-brown weather deck of the 1986 colour broadside, white radomes and boats), each with its own
// finish uniforms so both ships can stand in one scene with their own weathering, and their own
// program cache keys ('slava-' prefix). The 1986 colour frame reads a touch more neutral than
// Kirov's faintly blue grey. Superstructure roofs and the Fort plinths are light grey non-skid (they
// read as light as the walls from above in 1984 and 1985); 'plinth' is the red-brown of the Top Dome
// house's foot (Marshal Ustinov 1989).
export const SLAVA_UNIFORMS = shipUniforms();

let cache;
export function slavaMats() {
  if (cache) return cache;
  const sup = paintTextures('super'), hul = paintTextures('hull'), dk = deckTextures(), grain = grainTextures();
  const U = SLAVA_UNIFORMS;
  const std = (color, rough, metal, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, vertexColors: true, ...extra });
  const painted = (color, tex, key, opts, ns = 0.55) => {
    const m = std(color, 1.0, 0.08, { map: tex.map, roughnessMap: tex.rough, normalMap: tex.normal });
    m.normalScale.set(ns, ns);
    return shipFinish(m, 'slava-' + key, { uniforms: U, ...opts });
  };
  const grained = (color, rough, metal, key, opts = {}, ns = 0.5) => {
    const m = std(color, rough, metal, { roughnessMap: grain.rough, normalMap: grain.normal });
    m.normalScale.set(ns, ns);
    return shipFinish(m, 'slava-' + key, { patches: 0, salt: 0.15, uniforms: U, ...opts });
  };
  const lat = latticeTexture();
  cache = {
    paint: painted(0xa3a9ab, sup, 'paint', { salt: 0.05, patches: 0.35 }),
    hullPaint: painted(0x9aa0a2, hul, 'hull', { hull: true, salt: 0.03, patches: 0.35 }, 0.45),
    deck: painted(0x6b3c31, dk, 'deck', { salt: 0.07, patches: 0.5 }, 0.35),
    // superstructure roofs and platforms: light grey non-skid (they read nearly as light as the walls
    // in the 1984 and 1985 frames from above, while the weather deck reads dark)
    roof: painted(0x969c9d, dk, 'roof', { salt: 0.06, patches: 0.45 }, 0.3),
    plinth: painted(0x7c3b2f, dk, 'plinth', { salt: 0.05, patches: 0.3 }, 0.25),
    dark: grained(0x4a5356, 0.62, 0.25, 'dark'),
    steel: grained(0x8b9296, 0.42, 0.7, 'steel'),
    black: grained(0x1c2123, 0.75, 0.05, 'black', { soot: 0 }),
    rubber: grained(0x232624, 0.95, 0.0, 'rubber', { soot: 0 }),
    white: grained(0xd5d8d2, 0.55, 0.02, 'white', { salt: 0.1 }, 0.25),
    radome: grained(0xc4c8c2, 0.5, 0.02, 'radome', { salt: 0.05 }, 0.15),
    canvas: grained(0x56625a, 0.95, 0.0, 'canvas', {}, 1.0),
    red: grained(0x8c2b22, 0.6, 0.05, 'red'),
    orange: grained(0xc4612a, 0.6, 0.02, 'orange'),
    rust: grained(0x6b4632, 0.85, 0.3, 'rust'),
    wood: grained(0x8a6a48, 0.8, 0.0, 'wood'),
    bronze: grained(0x9a7a48, 0.45, 0.6, 'bronze'),
    glass: std(0xffffff, 0.08, 0.15, { map: windowTexture(), envMapIntensity: 1.4 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffe2a8, emissiveIntensity: 0.6, roughness: 0.3, vertexColors: true }),
    lattice: new THREE.MeshStandardMaterial({ color: 0x9aa4a7, roughness: 0.55, metalness: 0.4, map: lat, alphaMap: lat, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide, depthWrite: true, vertexColors: true }),
  };
  return cache;
}
