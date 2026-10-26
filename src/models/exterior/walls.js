import { V } from './kit.js';

// Wall descriptors shared by the superstructure and the clutter pass. A wall is one face of a
// lofted plan (base outline at y0, top outline at y1, possibly raked): A-B along the base, At-Bt
// along the top, u the unit direction along the base, n the horizontal outward normal.

export function wallsOf(base, top, y0, y1, cx, cz) {
  const walls = [];
  for (let i = 0; i < base.length; i++) {
    const a = base[i], b = base[(i + 1) % base.length], at = top[i], bt = top[(i + 1) % top.length];
    const A = V(a[0], y0, a[1]), B = V(b[0], y0, b[1]);
    const At = V(at[0], y1, at[1]), Bt = V(bt[0], y1, bt[1]);
    const len = A.distanceTo(B);
    if (len < 1e-3) continue;
    const u = B.clone().sub(A).normalize();
    const n = V(u.z, 0, -u.x);
    const mid = A.clone().lerp(B, 0.5);
    if (n.dot(V(mid.x - cx, 0, mid.z - cz)) < 0) n.negate();
    walls.push({ A, B, At, Bt, u, n, len, y0, y1 });
  }
  return walls;
}

// Point on a wall at fraction t along it, height y, `out` metres proud of the face (follows rake).
export function wallPoint(w, t, y, out = 0.02) {
  const k = (y - w.y0) / Math.max(0.01, w.y1 - w.y0);
  const lo = w.A.clone().lerp(w.B, t), hi = w.At.clone().lerp(w.Bt, t);
  const p = lo.lerp(hi, k);
  p.addScaledVector(w.n, out);
  p.y = y;
  return p;
}

// Width of the wall at height y (raked faces shorten toward the top).
export function wallLenAt(w, y) {
  const k = (y - w.y0) / Math.max(0.01, w.y1 - w.y0);
  return w.len + (w.At.distanceTo(w.Bt) - w.len) * k;
}
