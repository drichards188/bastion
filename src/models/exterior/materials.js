import * as THREE from 'three';
import { paintTextures, deckTextures, grainTextures, latticeTexture, windowTexture, shipFinish } from './kit.js';

// Kirov's exterior materials. Colours checked against the colour USN frames (1983 underway, 1989 at
// anchor, Frunze 1989 alongside): a light, faintly blue Soviet naval grey on hull and superstructure,
// red-brown deck paint on the weather decks, white radomes and boats, black window and hatch
// rubber. Every painted key carries the plating texture and shipFinish's position-keyed weathering.
let cache;
export function exteriorMats() {
  if (cache) return cache;
  const sup = paintTextures('super'), hul = paintTextures('hull'), dk = deckTextures(), grain = grainTextures();
  const std = (color, rough, metal, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, vertexColors: true, ...extra });
  const painted = (color, tex, key, opts, ns = 0.55) => {
    const m = std(color, 1.0, 0.08, { map: tex.map, roughnessMap: tex.rough, normalMap: tex.normal });
    m.normalScale.set(ns, ns);
    return shipFinish(m, key, opts);
  };
  const grained = (color, rough, metal, key, opts = {}, ns = 0.5) => {
    const m = std(color, rough, metal, { roughnessMap: grain.rough, normalMap: grain.normal });
    m.normalScale.set(ns, ns);
    return shipFinish(m, key, { patches: 0, salt: 0.15, ...opts });
  };
  const lat = latticeTexture();
  cache = {
    // superstructure, masts, fittings: light naval grey
    paint: painted(0xa0aaac, sup, 'paint', { salt: 0.05, patches: 0.35 }),
    // hull sides: the same paint, weathered harder, with grime and boot topping
    hullPaint: painted(0x96a0a3, hul, 'hull', { hull: true, salt: 0.03, patches: 0.35 }, 0.45),
    // weather decks: red-brown deck paint
    deck: painted(0x6b3c31, dk, 'deck', { salt: 0.07, patches: 0.5 }, 0.35),
    // darker grey details: grating, machinery casings, gun shields' undersides
    dark: grained(0x4a5356, 0.62, 0.25, 'dark'),
    steel: grained(0x8b9296, 0.42, 0.7, 'steel'),
    black: grained(0x1c2123, 0.75, 0.05, 'black', { soot: 0 }),
    rubber: grained(0x232624, 0.95, 0.0, 'rubber', { soot: 0 }),
    white: grained(0xd5d8d2, 0.55, 0.02, 'white', { salt: 0.1 }, 0.25),
    radome: grained(0xbfc3bd, 0.5, 0.02, 'radome', { salt: 0.05 }, 0.15),
    canvas: grained(0x56625a, 0.95, 0.0, 'canvas', {}, 1.0),
    red: grained(0x8c2b22, 0.6, 0.05, 'red'),
    orange: grained(0xc4612a, 0.6, 0.02, 'orange'),
    rust: grained(0x6b4632, 0.85, 0.3, 'rust'),
    wood: grained(0x8a6a48, 0.8, 0.0, 'wood'),
    // glass: the room behind (texture) under a sharp sky reflection (low roughness, env map)
    glass: std(0xffffff, 0.08, 0.15, { map: windowTexture(), envMapIntensity: 1.4 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffe2a8, emissiveIntensity: 0.6, roughness: 0.3, vertexColors: true }),
    // lattice reflector mesh: grey bars on a transparent ground (far mips fade to a grey haze)
    lattice: new THREE.MeshStandardMaterial({ color: 0x9aa4a7, roughness: 0.55, metalness: 0.4, map: lat, alphaMap: lat, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide, depthWrite: true, vertexColors: true }),
  };
  return cache;
}
