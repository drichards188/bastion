import * as THREE from 'three';
import { V, box, bar, rod, xf, yTube, mergeAll, mulberry32, hRing } from './kit.js';
import { louvre, onWall } from './fittings.js';
import { wallPoint } from './walls.js';

// The layered clutter that makes a Soviet warship's superstructure read as busy rather than as
// clean blocks (1983 port-amidships and 1985 bow photographs, 1989 colour frames): weld seams and
// butts on the plating, cable trays with drops to junction boxes, small equipment housings on
// brackets, pipe runs with flanges, recessed doorways, antenna brackets high up, and the grey rain
// streaks that hang under every roof edge and ledge. Item positions are deterministic per wall but
// representative, not surveyed [E].

const grimeQuads = [];

// Recessed doorway: jambs, header and sill projecting from the face, a dark reveal, the leaf set
// back between them. Origin at the sill on the face.
function recessedDoor(P, c, u, n, w = 0.85, h = 1.8) {
  const d = 0.32;
  onWall(P, 'black', box(w + 0.1, h + 0.1, 0.02, 0, h / 2, 0.01), c.clone(), u, n, { tier: 1, tint: 0x9a9e9e });
  for (const s of [-1, 1]) onWall(P, 'paint', box(0.16, h + 0.22, d, s * (w / 2 + 0.13), (h + 0.22) / 2, d / 2), c.clone(), u, n, { tier: 1, tint: 0xdde1e1 });
  onWall(P, 'paint', box(w + 0.42, 0.2, d + 0.04, 0, h + 0.2, d / 2), c.clone(), u, n, { tier: 1, tint: 0xe6eaea });
  onWall(P, 'paint', box(w + 0.1, 0.22, 0.08, 0, 0.11, d - 0.04), c.clone(), u, n, { tier: 1, tint: 0xd2d6d6 });
  // the leaf, ajar on some doors, with its dogs
  onWall(P, 'paint', box(w - 0.06, h - 0.12, 0.05, 0, h / 2, 0.06), c.clone(), u, n, { tier: 1, tint: 0xb8bebf });
  for (const yy of [0.25, 0.5, 0.75]) onWall(P, 'steel', box(0.1, 0.05, 0.05, w / 2 - 0.08, yy * h, 0.11), c.clone(), u, n, { tier: 2 });
}

// Cable tray (ladder type) between two points on a wall, standing `out` off the face on brackets.
function tray(P, a, b, n, wide = 0.28) {
  P.add('dark', bar(a, b, 0.05, wide), { tier: 2, tint: 0xa4aaab });
  const len = a.distanceTo(b), k = Math.max(1, Math.round(len / 1.2));
  for (let i = 0; i <= k; i++) {
    const p = a.clone().lerp(b, i / k);
    P.add('steel', bar(p, p.clone().addScaledVector(n, -0.14), 0.04, 0.04), { tier: 2 });
  }
}

// A grime streak hanging down a wall from the point top (on the face), length l, width w.
function grime(top, w, l, uDir, n, variant) {
  const g = new THREE.PlaneGeometry(w, l, 1, 2);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(uDir.clone(), V(0, 1, 0), n.clone()));
  g.applyMatrix4(new THREE.Matrix4().compose(top.clone().add(V(0, -l / 2, 0)), q, V(1, 1, 1)));
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (variant + uv.getX(i)) / 4);
  grimeQuads.push(g);
}

// Dress one wall. `heavy` walls (towers, big block faces) get the full set.
export function clutterWall(P, w, rnd, { heavy = false, doors = true, high = false } = {}) {
  const h = w.y1 - w.y0;
  if (w.len < 1.8 || h < 1.2) return;
  // --- plating seams: horizontal welds about every 1.6 m of height, vertical butts every 5 m
  for (let y = w.y0 + 1.55; y < w.y1 - 0.4; y += 1.55 + rnd() * 0.2) {
    P.add('paint', bar(wallPoint(w, 0.02, y, 0.012), wallPoint(w, 0.98, y, 0.012), 0.022, 0.03), { tier: 1, tint: 0xd8dcdc });
  }
  if (w.len > 6) {
    const nb = Math.floor(w.len / 5);
    for (let i = 1; i <= nb; i++) {
      const t = i / (nb + 1) + (rnd() - 0.5) * 0.05;
      P.add('paint', bar(wallPoint(w, t, w.y0 + 0.1, 0.012), wallPoint(w, t, w.y1 - 0.1, 0.012), 0.022, 0.03), { tier: 2, tint: 0xd8dcdc });
    }
  }
  // --- grime: streaks under the roof edge and under the seams
  const ns = Math.max(1, Math.round(w.len / 2.6));
  for (let i = 0; i < ns; i++) {
    const t = (i + 0.2 + rnd() * 0.6) / ns;
    grime(wallPoint(w, t, w.y1 - 0.05, 0.02), 0.4 + rnd() * 0.9, Math.min(h * 0.95, 0.8 + rnd() * 2.6), w.u, w.n, Math.floor(rnd() * 4));
  }
  // --- cable tray under the roof edge and its drops to junction boxes
  if (w.len > 3.5 && (heavy || rnd() < 0.55)) {
    const yT = w.y1 - 0.35 - rnd() * 0.3;
    const t0 = 0.05 + rnd() * 0.1, t1 = 0.95 - rnd() * 0.1;
    tray(P, wallPoint(w, t0, yT, 0.16), wallPoint(w, t1, yT, 0.16), w.n);
    const drops = heavy ? 2 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < drops; i++) {
      const t = t0 + (t1 - t0) * rnd(), yb = w.y0 + 0.9 + rnd() * Math.max(0.2, h * 0.4);
      P.add('dark', bar(wallPoint(w, t, yT, 0.1), wallPoint(w, t, yb + 0.25, 0.1), 0.07, 0.05), { tier: 2, tint: 0xa0a6a7 });
      onWall(P, 'paint', box(0.38, 0.48, 0.16, 0, 0, 0.08), wallPoint(w, t, yb, 0.0), w.u, w.n, { tier: 1, tint: 0xc8cdcd });
      onWall(P, 'steel', box(0.06, 0.06, 0.05, 0.12, -0.18, 0.18), wallPoint(w, t, yb, 0.0), w.u, w.n, { tier: 2 });
    }
  }
  // --- small equipment housings on brackets, high on the wall
  const nh = heavy ? 1 + Math.floor(rnd() * 3) : rnd() < 0.45 ? 1 : 0;
  for (let i = 0; i < nh && w.len > 3; i++) {
    const t = 0.15 + rnd() * 0.7, bw = 0.7 + rnd() * 0.8, bh = 0.5 + rnd() * 0.6, bd = 0.45 + rnd() * 0.35;
    const y = w.y0 + h * (0.45 + rnd() * 0.35);
    if (y + bh > w.y1 - 0.2) continue;
    const c = wallPoint(w, t, y, 0.0);
    onWall(P, 'paint', box(bw, bh, bd, 0, bh / 2, bd / 2 + 0.05), c.clone(), w.u, w.n, { tier: 1, tint: 0xe2e6e6 });
    onWall(P, 'paint', box(bw + 0.08, 0.05, bd + 0.1, 0, bh + 0.025, bd / 2 + 0.05), c.clone(), w.u, w.n, { tier: 2 });
    for (const s of [-1, 1]) onWall(P, 'paint', bar(V(s * bw * 0.35, 0, bd), V(s * bw * 0.35, -0.45, 0.02), 0.06, 0.06), c.clone(), w.u, w.n, { tier: 2 });
    if (rnd() < 0.5) louvre(P, wallPoint(w, t, y + bh * 0.5, bd + 0.06), w.u, w.n, { w: bw * 0.6, h: bh * 0.5, tier: 2 });
  }
  // --- a pipe run with flanges at mid height on some walls
  if (w.len > 4 && rnd() < (heavy ? 0.7 : 0.35)) {
    const y = w.y0 + 0.6 + rnd() * Math.min(1.2, h * 0.3);
    const a = wallPoint(w, 0.08, y, 0.14), b = wallPoint(w, 0.92, y, 0.14);
    P.add('paint', rod(a, b, 0.05, 6), { tier: 2, tint: 0xd5d9d9 });
    const k = Math.max(1, Math.round(a.distanceTo(b) / 2.2));
    for (let i = 0; i <= k; i++) {
      const p = a.clone().lerp(b, i / k);
      onWall(P, 'paint', new THREE.CylinderGeometry(0.085, 0.085, 0.05, 8).rotateZ(Math.PI / 2), p, w.u, w.n, { tier: 2 });
    }
    // a valve with its handwheel at one end
    onWall(P, 'red', yTube(-0.1, 0.12, 0.07, 0.07, 6), b.clone().add(V(0, 0.12, 0)), w.u, w.n, { tier: 2 });
  }
  // --- recessed doorway on long walls at deck level
  if (doors && w.len > 4.5 && h > 2.1 && rnd() < (heavy ? 0.5 : 0.3)) {
    recessedDoor(P, wallPoint(w, 0.2 + rnd() * 0.6, w.y0 + 0.02, 0.0), w.u, w.n);
  }
  // --- antenna brackets with small dipoles high up
  if (high && rnd() < 0.6) {
    const c = wallPoint(w, 0.2 + rnd() * 0.6, w.y1 - 0.6, 0.0);
    onWall(P, 'paint', bar(V(0, 0, 0), V(0, 0, 0.9), 0.07, 0.07), c.clone(), w.u, w.n, { tier: 2 });
    onWall(P, 'steel', rod(V(-0.6, 0, 0.9), V(0.6, 0, 0.9), 0.02, 4), c.clone(), w.u, w.n, { tier: 2 });
    onWall(P, 'white', yTube(-0.15, 0.15, 0.05, 0.05, 6, 0, 0.9), c.clone(), w.u, w.n, { tier: 2 });
  }
}

// Underside of a platform or overhang: an edge girder and brackets back to the wall every 1.5 m.
export function platformUnderside(P, x0, x1, z0, z1, y, wallX = null) {
  P.add('paint', box(x1 - x0, 0.28, 0.12, (x0 + x1) / 2, y - 0.2, z0), { tier: 1, tint: 0xc4c9c9 });
  P.add('paint', box(x1 - x0, 0.28, 0.12, (x0 + x1) / 2, y - 0.2, z1), { tier: 1, tint: 0xc4c9c9 });
  if (wallX !== null) {
    const outer = Math.abs(x0 - wallX) > Math.abs(x1 - wallX) ? x0 : x1;
    for (let z = z0 + 0.5; z < z1; z += 1.5) P.add('paint', bar(V(outer, y - 0.3, z), V(wallX, y - 1.6, z), 0.1, 0.1), { tier: 1 });
  }
}

let grimeTex;
function grimeTexture() {
  if (grimeTex) return grimeTex;
  const W = 256, H = 256, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  const r = mulberry32(5151);
  for (let v = 0; v < 4; v++) {
    for (let k = 0; k < 9; k++) {
      const x = v * 64 + 8 + r() * 48, w = 1 + r() * 4, len = H * (0.3 + r() * 0.7);
      const grad = g.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, `rgba(255,255,255,${0.5 + r() * 0.4})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x - w, 0);
      for (let y = 0; y <= len; y += 16) g.lineTo(x - w * (1 - (y / len) * 0.7) + Math.sin(y * 0.07 + k) * 1.2, y);
      for (let y = len; y >= 0; y -= 16) g.lineTo(x + w * (1 - (y / len) * 0.7) + Math.sin(y * 0.07 + k) * 1.2, y);
      g.closePath();
      g.fill();
    }
    // a soft band at the top where water collects under the edge
    const grad = g.createLinearGradient(0, 0, 0, 30);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(v * 64 + 2, 0, 60, 30);
  }
  grimeTex = new THREE.CanvasTexture(cv);
  grimeTex.anisotropy = 8;
  return grimeTex;
}

// One mesh for every grime streak added since the last flush (one draw call).
export function flushGrime(root) {
  if (!grimeQuads.length) return null;
  const g = mergeAll(grimeQuads.splice(0));
  // grey-brown dirt: a darkening alpha layer over the paint
  const mat = new THREE.MeshStandardMaterial({ color: 0x5d5f58, alphaMap: grimeTexture(), transparent: true, opacity: 0.26, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  const m = new THREE.Mesh(g, mat);
  m.name = 'grime-streaks';
  m.receiveShadow = true;
  m.renderOrder = 1;
  root.add(m);
  return m;
}
void xf; void hRing;
