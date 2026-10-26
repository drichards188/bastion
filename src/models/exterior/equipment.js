import * as THREE from 'three';
import { V, box, bar, rod, xf, yTube, zTube, xTube, sphere, dome, lathe, dish, hRing, mergeAll, mulberry32, TAU } from './kit.js';
import { rail, vLadder, louvre, mushroom, locker, whip, onWall } from './fittings.js';
import { deckHeightAt, deckHalfBeamAt, LAYOUT } from './lines.js';
import { hullX, hullNormal } from './hull.js';

// Second-pass equipment that gives the superstructure the density of the photographs: roof
// machinery and ventilation trunks, EW radomes ("Side Globe", "Rum Tub" type drums), extra tower
// galleries and their brackets, searchlights and signal lamps, a satcom dish, hull fittings (the
// torpedo-tube shutters aft) and rust-streak decals under the hawse pipes and scuppers.
// Positions of individual small items are representative, not surveyed [E]; the classes of item and
// where they cluster follow the 1983, 1985, 1986 and 1989 USN frames.

const D = deckHeightAt;

// Roof machinery: a cluster of boxes, trunks and a vent on a roof at (x, y, z).
function roofKit(P, rnd, x, y, z, w = 3, d = 3) {
  const n = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const bw = 0.6 + rnd() * 1.2, bh = 0.5 + rnd() * 1.0, bd = 0.5 + rnd() * 1.2;
    const bx = x + (rnd() - 0.5) * (w - bw), bz = z + (rnd() - 0.5) * (d - bd);
    P.add('paint', box(bw, bh, bd, bx, y + bh / 2, bz), { tier: 1, tint: 0xdde2e2 });
    if (rnd() < 0.5) louvre(P, V(bx + bw / 2 + 0.01, y + bh * 0.55, bz), V(0, 0, -1), V(1, 0, 0), { w: bd * 0.7, h: bh * 0.5, tier: 2 });
  }
  if (rnd() < 0.7) mushroom(P, x + (rnd() - 0.5) * w, y, z + (rnd() - 0.5) * d, 0.28, 0.6, 2);
}

// "Rum Tub" type EW drum: a ribbed cylinder radome on a bracket.
function ewDrum(P, x, y, z, r = 0.7, h = 1.3) {
  P.add('radome', yTube(y, y + h, r, r, 16, x, z));
  for (let k = 1; k < 4; k++) P.add('paint', hRing(r + 0.02, 0.03, x, y + (h * k) / 4, z, 16), { tier: 2 });
  P.add('paint', yTube(y + h, y + h + 0.12, r * 0.9, r * 0.6, 14, x, z), { tier: 1 });
  P.add('paint', yTube(y - 0.25, y, r * 0.5, r * 0.5, 10, x, z), { tier: 1 });
}

// Searchlight on a short pedestal, facing `ry`.
function searchlight(P, x, y, z, ry = 0) {
  P.add('dark', yTube(y, y + 0.8, 0.12, 0.15, 8, x, z), { tier: 1 });
  const m = xf(x, y + 1.05, z, 0, ry);
  P.add('steel', zTube(-0.45, 0.35, 0.38, 0.32, 14).applyMatrix4(m), { tier: 1, tint: 0x9aa2a4 });
  P.add('glass', new THREE.CircleGeometry(0.34, 14).applyMatrix4(xf(0, 0, -0.46, 0, Math.PI)).applyMatrix4(m), { tier: 1 });
  P.add('dark', box(0.9, 0.08, 0.12, 0, -0.32, 0).applyMatrix4(m), { tier: 2 });
}

// Signal lamp (blinker) with its shutter box.
function signalLamp(P, x, y, z, ry = 0) {
  const m = xf(x, y, z, 0, ry);
  P.add('dark', yTube(0, 0.7, 0.06, 0.06, 6).applyMatrix4(m), { tier: 2 });
  P.add('steel', zTube(-0.2, 0.2, 0.18, 0.18, 10, 0, 0.85).applyMatrix4(m), { tier: 1, tint: 0x8d9597 });
  P.add('dark', box(0.4, 0.4, 0.06, 0, 0.85, -0.22).applyMatrix4(m), { tier: 2 });
}

// Rust streak decals: one atlas texture, many conforming quads, one draw call.
let streakTex;
function streakTexture() {
  if (streakTex) return streakTex;
  const W = 256, H = 512, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  const r = mulberry32(77);
  // four variants side by side (columns of 64 px)
  for (let v = 0; v < 4; v++) {
    const x0 = v * 64 + 32;
    for (let k = 0; k < 7; k++) {
      const x = x0 + (r() - 0.5) * 22, w = 1.5 + r() * 5, len = H * (0.35 + r() * 0.6);
      const grad = g.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, `rgba(96,52,26,${0.55 + r() * 0.3})`);
      grad.addColorStop(0.3, `rgba(110,64,34,${0.35 + r() * 0.2})`);
      grad.addColorStop(1, 'rgba(110,70,40,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x - w, 0);
      for (let y = 0; y <= len; y += 16) g.lineTo(x - w * (1 - y / len * 0.6) + Math.sin(y * 0.05 + k) * 1.5, y);
      for (let y = len; y >= 0; y -= 16) g.lineTo(x + w * (1 - y / len * 0.6) + Math.sin(y * 0.05 + k) * 1.5, y);
      g.closePath();
      g.fill();
    }
    // the source stain
    const rg = g.createRadialGradient(x0, 6, 1, x0, 6, 18);
    rg.addColorStop(0, 'rgba(70,38,20,0.8)');
    rg.addColorStop(1, 'rgba(70,38,20,0)');
    g.fillStyle = rg;
    g.fillRect(x0 - 20, 0, 40, 30);
  }
  streakTex = new THREE.CanvasTexture(cv);
  streakTex.colorSpace = THREE.SRGBColorSpace;
  streakTex.anisotropy = 8;
  return streakTex;
}

// A streak quad hanging from (z, yTop) down `len` metres on the hull side, variant 0..3.
function streakQuad(list, z, yTop, len, w, side, variant) {
  const g = new THREE.PlaneGeometry(w, len, 2, 6);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = p.getY(i);
    const yy = yTop - len / 2 + v, zz = z - u * side;
    p.setXYZ(i, side * (hullX(zz, yy) + 0.03), yy, zz);
    uv.setXY(i, (variant + uv.getX(i)) / 4, uv.getY(i));
  }
  g.computeVertexNormals();
  list.push(g);
}

export function buildEquipment(P, M, root) {
  const rnd = mulberry32(1983);
  const L = LAYOUT, T = L.towerFwd;

  // ---------------------------------------------------- rust streaks on the hull
  {
    const list = [];
    for (const side of [-1, 1]) {
      // under the hawse pipes (heaviest), then scuppers and discharges along the length
      streakQuad(list, -121.4, D(-121.4) - 3.6, 6.5, 2.2, side, 0);
      for (let z = -100; z < 118; z += 9 + rnd() * 9) {
        if (z > -95 && z < -82) continue; // keep the hull number clean
        const yTop = (z < -71 ? D(z) : z < 83 ? D(z) : D(z)) - 0.4;
        streakQuad(list, z, yTop, 2.5 + rnd() * 4.5, 0.9 + rnd() * 0.8, side, Math.floor(rnd() * 4));
      }
      // discharges near the waterline amidships stain downward a little
      for (const z of [-20, 8, 40, 66]) streakQuad(list, z, 3.2, 2.8, 1.0, side, Math.floor(rnd() * 4));
    }
    const g = mergeAll(list);
    const mat = new THREE.MeshStandardMaterial({ map: streakTexture(), transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3 });
    const m = new THREE.Mesh(g, mat);
    m.name = 'rust-streaks';
    m.receiveShadow = true;
    m.renderOrder = 1;
    root.add(m);
  }

  // ---------------------------------------------------- torpedo-tube shutters aft (both sides)
  // Kirov carried 533 mm tubes behind hull-side shutters aft; the 1985 bow photograph shows a
  // rectangular shutter outline low on the side near the stern [P outline, E size].
  for (const side of [-1, 1]) {
    for (const [z, w] of [[96.5, 4.2]]) {
      const y = 4.9, x = hullX(z, y), n = hullNormal(z, y);
      n.x *= side;
      const c = V(side * (x + 0.02), y, z), u = V(0, 0, side).cross(V(0, 1, 0)).cross(n).normalize();
      void u;
      const along = V(0, 0, -side);
      onWall(P, 'dark', box(w, 1.3, 0.04), c, along, n, { tier: 1, tint: 0xc8cccc });
      onWall(P, 'hullPaint', box(w - 0.2, 1.1, 0.05, 0, 0, 0.02), c, along, n, { tier: 1, tint: 0xe2e6e6 });
      for (let k = 1; k < 5; k++) onWall(P, 'dark', box(0.04, 1.1, 0.06, -w / 2 + (w * k) / 5, 0, 0.03), c, along, n, { tier: 2 });
    }
  }

  // ---------------------------------------------------- forward block roofs and corners
  for (const side of [-1, 1]) {
    // machinery and ventilation trunks on the 01, 02 and 03 roofs
    roofKit(P, rnd, side * 10.6, L.level01, -6.5, 2.4, 6);
    roofKit(P, rnd, side * 9.0, L.level02, -20.0, 2.2, 4);
    roofKit(P, rnd, side * 6.6, L.level03, -14.0, 2.0, 3);
    roofKit(P, rnd, side * 5.0, L.bridgeRoof, 1.0, 3.0, 3.0);
    // searchlights at the forward corners of the 02 level and on the bridge roof
    searchlight(P, side * 9.8, L.level02, -21.4, side * 0.4);
    searchlight(P, side * 6.8, L.bridgeRoof, -15.8, side * 0.3);
    signalLamp(P, side * 7.2, L.bridgeRoof, -12.5, side * Math.PI / 2);
    // EW drums on brackets at the forward block's 02-level corners
    ewDrum(P, side * 10.2, L.level02 + 0.25, -17.0, 0.6, 1.1);
    // small radomes on the bridge roof corners
    P.add('paint', yTube(L.bridgeRoof, L.bridgeRoof + 0.8, 0.35, 0.35, 10, side * 6.8, -9.0), { tier: 1 });
    P.add('radome', sphere(0.65, side * 6.8, L.bridgeRoof + 1.35, -9.0, 1, 1, 1, 14));
    // whip antennas from the bridge roof
    whip(P, side * 7.6, L.bridgeRoof, 2.8, 8.5, 1, [side * 0.5, 0.3]);
  }

  // ---------------------------------------------------- forward tower: galleries, drums, dish
  {
    const tw = (y) => 7.4 + (4.7 - 7.4) * (y - T.base) / (T.top - T.base); // tower half-width at height y
    // a full gallery round the tower front at 28.5 m with its brackets, carrying EW drums
    {
      const y = 28.5, hx = tw(y) + 1.4, z0 = 3.0, z1 = 9.0;
      P.add('dark', box(2 * hx, 0.08, z1 - z0, 0, y - 0.04, (z0 + z1) / 2), { tier: 0, tint: 0xb0b6b8 });
      P.add('paint', box(2 * hx, 0.22, 0.2, 0, y - 0.15, z0), { tier: 0 });
      rail(P, [[-hx, z1], [-hx, z0], [hx, z0], [hx, z1]], y);
      for (const x of [-hx + 0.4, -2.5, 2.5, hx - 0.4]) P.add('paint', bar(V(x, y - 0.2, z0 + 0.2), V(x * 0.6, y - 2.4, z0 + 2.6), 0.14), { tier: 1 });
      for (const s of [-1, 1]) ewDrum(P, s * (hx - 0.9), y + 0.05, z0 + 0.9, 0.55, 1.0);
    }
    // more Side Globe radomes low on the tower's after corners
    for (const s of [-1, 1]) {
      for (const [y, z] of [[19.0, 15.8], [23.0, 16.0]]) {
        const x = s * (tw(y) - 0.1);
        P.add('paint', xTube(x, x + s * 0.9, 0.28, 0.28, 8, y - 0.2, z), { tier: 1 });
        P.add('paint', sphere(0.95, x + s * 1.35, y + 0.15, z, 1, 1, 1, 16), { tint: 0xf4f6f4 });
        P.add('dark', box(2.0, 0.06, 1.7, x + s * 1.4, y - 0.72, z), { tier: 1, tint: 0xb0b6b8 });
        rail(P, [[x + s * 0.3, z - 0.85], [x + s * 2.4, z - 0.85], [x + s * 2.4, z + 0.85], [x + s * 0.3, z + 0.85]], y - 0.7, { h: 0.9 });
      }
      // cable trays and pipes up the tower sides
      for (const z of [6.2, 12.6]) {
        const a = V(s * (tw(T.base) + 0.06), T.base + 0.3, z), b = V(s * (tw(T.top) + 0.06), T.top - 0.3, z);
        P.add('dark', bar(a, b, 0.1, 0.35), { tier: 2 });
      }
    }
    // satcom / datalink dish at the cap's after port corner [P: 1985 bow photograph]
    {
      const x = -4.2, z = 18.6, y = T.capY;
      P.add('paint', yTube(y, y + 1.0, 0.18, 0.18, 8, x, z), { tier: 1 });
      P.add('white', dish(0.85, 0.3, 0.04, 18).applyMatrix4(xf(x, y + 1.45, z, -0.9, 0.6)), { tier: 1 });
      P.add('dark', rod(V(x, y + 1.45, z), V(x - 0.2, y + 1.9, z - 0.55), 0.03, 4), { tier: 2 });
    }
    // masthead lights and a small yard on the cone
    for (const s of [-1, 1]) P.add('paint', rod(V(0, 43.6, T.mastZ), V(s * 3.2, 43.6, T.mastZ), 0.06, 5), { tier: 1 });
    P.add('lamp', sphere(0.14, 0, 51.5, T.mastZ, 1, 1, 1, 8), { tier: 2 });
  }

  // ---------------------------------------------------- midships and the aft block
  for (const side of [-1, 1]) {
    roofKit(P, rnd, side * 9.0, 11.9, 40, 2.4, 6);
    roofKit(P, rnd, side * 7.4, 14.4, 52, 2.0, 4);
    roofKit(P, rnd, side * 5.6, L.aftBlock.roof, 26.0, 1.8, 3.0);
    ewDrum(P, side * 8.3, 14.6, 30.5, 0.6, 1.1);
    searchlight(P, side * 8.1, 14.4, 56.0, Math.PI + side * 0.5);
    searchlight(P, side * 9.7, 11.9, 64.5, Math.PI + side * 0.6);
    // boat booms stowed along the side amidships
    P.add('paint', rod(V(side * 13.9, D(26) + 0.6, 24.5), V(side * 13.9, D(36) + 0.6, 36.5), 0.09, 6), { tier: 1 });
    // ventilation trunks on the main deck abreast the towers
    for (const z of [2.0, 23.5]) {
      P.add('paint', box(1.6, 2.0, 2.4, side * 12.4, D(z) + 1.0, z), { tier: 1, tint: 0xe4e8e8 });
      louvre(P, V(side * 13.21, D(z) + 1.2, z), V(0, 0, side), V(side, 0, 0), { w: 1.8, h: 1.0, tier: 1 });
    }
  }
  // the aft tower: gallery at 26 m with EW drums
  {
    const A = L.towerAft, y = 26.0;
    for (const s of [-1, 1]) {
      const x0 = s * 3.4, x1 = s * 5.2;
      P.add('dark', box(1.8, 0.07, 4.2, (x0 + x1) / 2, y - 0.04, 34.6), { tier: 1, tint: 0xb0b6b8 });
      rail(P, [[x1, 32.5], [x1, 36.7]], y, { h: 0.9 });
      ewDrum(P, (x0 + x1) / 2, y, 33.5, 0.5, 0.9);
      ewDrum(P, (x0 + x1) / 2, y, 35.8, 0.5, 0.9);
    }
    void A;
  }
  // the quarterdeck: davit for the stern boat and the deck-edge lockers
  for (const side of [-1, 1]) {
    locker(P, side * 11.4, D(104), 104, 1.4, 0.9, 0.7, side * Math.PI / 2, 1);
    locker(P, side * 11.2, D(117), 117, 1.0, 0.8, 0.6, side * Math.PI / 2, 1);
  }
  void rod; void dome; void lathe; void TAU; void deckHalfBeamAt; void vLadder; void M;
}
