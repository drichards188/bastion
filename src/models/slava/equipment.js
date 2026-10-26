import * as THREE from 'three';
import { V, box, bar, rod, xf, yTube, zTube, sphere, hRing, mergeAll, mulberry32 } from '../exterior/kit.js';
import { rail, louvre, mushroom, whip, onWall } from '../exterior/fittings.js';
import { deckHeightAt, LAYOUT } from './lines.js';
import { hullX, hullNormal } from './hull.js';

// Second-pass equipment that gives Slava's superstructure the density of the photographs: roof
// machinery and ventilation trunks, EW radomes and drums, searchlights and signal lamps, the
// torpedo-tube shutters in the hull sides aft, the portholes and scuppers, and rust streaks under
// the anchor pockets and discharges. Positions of individual small items are representative, not
// surveyed [E]; the classes of item and where they cluster follow the 1983 to 1989 USN frames.

const D = deckHeightAt;

function roofKit(P, rnd, x, y, z, w = 3, d = 3) {
  const n = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const bw = 0.6 + rnd() * 1.1, bh = 0.5 + rnd() * 0.9, bd = 0.5 + rnd() * 1.1;
    const bx = x + (rnd() - 0.5) * (w - bw), bz = z + (rnd() - 0.5) * (d - bd);
    P.add('paint', box(bw, bh, bd, bx, y + bh / 2, bz), { tier: 1, tint: 0xdde2e2 });
    if (rnd() < 0.5) louvre(P, V(bx + bw / 2 + 0.01, y + bh * 0.55, bz), V(0, 0, -1), V(1, 0, 0), { w: bd * 0.7, h: bh * 0.5, tier: 2 });
  }
  if (rnd() < 0.7) mushroom(P, x + (rnd() - 0.5) * w, y, z + (rnd() - 0.5) * d, 0.28, 0.6, 2);
}

function ewDrum(P, x, y, z, r = 0.6, h = 1.1) {
  P.add('radome', yTube(y, y + h, r, r, 16, x, z));
  for (let k = 1; k < 4; k++) P.add('paint', hRing(r + 0.02, 0.03, x, y + (h * k) / 4, z, 16), { tier: 2 });
  P.add('paint', yTube(y + h, y + h + 0.12, r * 0.9, r * 0.6, 14, x, z), { tier: 1 });
  P.add('paint', yTube(y - 0.25, y, r * 0.5, r * 0.5, 10, x, z), { tier: 1 });
}

function searchlight(P, x, y, z, ry = 0) {
  P.add('dark', yTube(y, y + 0.8, 0.12, 0.15, 8, x, z), { tier: 1 });
  const m = xf(x, y + 1.05, z, 0, ry);
  P.add('steel', zTube(-0.45, 0.35, 0.38, 0.32, 14).applyMatrix4(m), { tier: 1, tint: 0x9aa2a4 });
  P.add('glass', new THREE.CircleGeometry(0.34, 14).applyMatrix4(xf(0, 0, -0.46, 0, Math.PI)).applyMatrix4(m), { tier: 1 });
}

function porthole(P, side, z, y) {
  const x = hullX(z, y), n = hullNormal(z, y);
  n.x *= side;
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n);
  const c = V(side * x, y, z);
  P.add('glass', new THREE.CircleGeometry(0.19, 12).applyMatrix4(new THREE.Matrix4().compose(c.clone().addScaledVector(n, 0.025), q, V(1, 1, 1))), { tier: 1, uv: true });
  P.add('steel', new THREE.TorusGeometry(0.21, 0.035, 4, 12).applyMatrix4(new THREE.Matrix4().compose(c.clone().addScaledVector(n, 0.03), q, V(1, 1, 1))), { tier: 1, tint: 0xa8aeb0 });
  P.add('hullPaint', new THREE.TorusGeometry(0.3, 0.03, 3, 10, Math.PI).applyMatrix4(new THREE.Matrix4().compose(c.clone().addScaledVector(n, 0.05), q, V(1, 1, 1))), { tier: 2 });
}

export function buildEquipment(P, M, root) {
  const rnd = mulberry32(1986);
  const L = LAYOUT;

  // ---------------------------------------------------- portholes and scuppers along the hull
  // [P: one row about 1.2 m under the deck edge along most of the length, a second about 3.7 m
  // lower amidships; irregular spacing as photographed]
  for (const side of [-1, 1]) {
    for (const [dy, z0, z1, step] of [[-1.1, -86, 66, 3.1], [-3.75, -48, 60, 4.2]]) {
      for (let z = z0; z < z1; z += step * (0.7 + rnd() * 0.6)) {
        if (rnd() < 0.2) continue;
        if (dy < -3 && z > -29 && z < -20) continue; // keep the hull number clear
        porthole(P, side, z, D(z) + dy);
      }
    }
    for (let z = -80; z < 92; z += 6 + rnd() * 5) {
      if (Math.abs(z - 69.6) < 1.5) continue;
      const y = D(z) - 0.3, x = hullX(z, y);
      P.add('black', box(0.06, 0.15, 0.5, side * (x + 0.02), y, z), { tier: 1 });
    }
  }

  // ---------------------------------------------------- torpedo-tube shutters (both sides)
  for (const side of [-1, 1]) {
    const T = L.torpedo, z = (T.z0 + T.z1) / 2, y = (T.y0 + T.y1) / 2, w = T.z1 - T.z0, h = T.y1 - T.y0;
    const x = hullX(z, y), n = hullNormal(z, y);
    n.x *= side;
    const c = V(side * (x + 0.02), y, z), along = V(0, 0, -side);
    onWall(P, 'dark', box(w, h + 0.2, 0.04), c, along, n, { tier: 1, tint: 0xc8cccc });
    onWall(P, 'hullPaint', box(w - 0.2, h, 0.05, 0, 0, 0.02), c, along, n, { tier: 1, tint: 0xe2e6e6 });
    for (let k = 1; k < 5; k++) onWall(P, 'dark', box(0.04, h, 0.06, -w / 2 + (w * k) / 5, 0, 0.03), c, along, n, { tier: 2 });
  }

  // ---------------------------------------------------- roofs: machinery, searchlights, EW drums
  for (const s of [-1, 1]) {
    roofKit(P, rnd, s * 2.0, L.fwdHouse.roof2, -34.0, 1.8, 3.0);
    roofKit(P, rnd, s * 4.5, L.bridgeBlock.roof, -13.0, 2.4, 3.0);
    roofKit(P, rnd, s * 4.2, L.mainBlock.roof, 1.5, 2.6, 4.0);
    roofKit(P, rnd, s * 4.8, L.aftBlock.roof, 53.0, 2.6, 4.0);
    searchlight(P, s * 5.6, L.bridgeBlock.roof, -27.5, s * 0.4);
    searchlight(P, s * 5.2, L.mainBlock.roof, 9.6, Math.PI + s * 0.6);
    searchlight(P, s * 5.4, L.aftBlock.roof, 51.5, s * 0.5);
    ewDrum(P, s * 5.9, L.bridgeBlock.roof + 0.25, -19.5, 0.55, 1.0);
    ewDrum(P, s * 5.6, L.mainBlock.roof + 0.25, -3.4, 0.6, 1.1);
    // small radomes on the bridge roof corners
    P.add('paint', yTube(L.bridgeBlock.roof, L.bridgeBlock.roof + 0.7, 0.3, 0.3, 10, s * 5.0, -30.0), { tier: 1 });
    P.add('radome', sphere(0.55, s * 5.0, L.bridgeBlock.roof + 1.2, -30.0, 1, 1, 1, 14));
  }

  // ---------------------------------------------------- rust streaks under the anchor pockets
  {
    const list = [];
    const streak = (z, yTop, len, w, side) => {
      const g = new THREE.PlaneGeometry(w, len, 2, 6), p = g.attributes.position, uv = g.attributes.uv;
      const variant = Math.floor(rnd() * 4);
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i), v = p.getY(i), yy = yTop - len / 2 + v, zz = z - u * side;
        p.setXYZ(i, side * (hullX(zz, yy) + 0.03), yy, zz);
        uv.setXY(i, (variant + uv.getX(i)) / 4, uv.getY(i));
      }
      g.computeVertexNormals();
      list.push(g);
    };
    for (const side of [-1, 1]) {
      streak(-88.3, D(-88.3) - 2.2, 5.0, 1.8, side);
      for (let z = -78; z < 90; z += 8 + rnd() * 9) { if (z > -31 && z < -18) continue; streak(z, D(z) - 0.35, 1.8 + rnd() * 3.2, 0.8 + rnd() * 0.7, side); }
    }
    const g = mergeAll(list);
    const mat = new THREE.MeshStandardMaterial({ map: rustTexture(), transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3 });
    const m = new THREE.Mesh(g, mat);
    m.name = 'slava-rust-streaks';
    m.receiveShadow = true;
    m.renderOrder = 1;
    root.add(m);
  }
  void bar; void rod; void rail; void whip; void D;
}

let rustTex;
function rustTexture() {
  if (rustTex) return rustTex;
  const W = 256, H = 512, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const r = mulberry32(77);
  for (let v = 0; v < 4; v++) {
    const x0 = v * 64 + 32;
    for (let k = 0; k < 7; k++) {
      const x = x0 + (r() - 0.5) * 22, w = 1.5 + r() * 5, len = H * (0.35 + r() * 0.6);
      const grad = g.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, `rgba(96,52,26,${0.5 + r() * 0.3})`);
      grad.addColorStop(0.3, `rgba(110,64,34,${0.3 + r() * 0.2})`);
      grad.addColorStop(1, 'rgba(110,70,40,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x - w, 0);
      for (let y = 0; y <= len; y += 16) g.lineTo(x - w * (1 - y / len * 0.6) + Math.sin(y * 0.05 + k) * 1.5, y);
      for (let y = len; y >= 0; y -= 16) g.lineTo(x + w * (1 - y / len * 0.6) + Math.sin(y * 0.05 + k) * 1.5, y);
      g.closePath();
      g.fill();
    }
  }
  rustTex = new THREE.CanvasTexture(cv);
  rustTex.colorSpace = THREE.SRGBColorSpace;
  rustTex.anisotropy = 8;
  return rustTex;
}
