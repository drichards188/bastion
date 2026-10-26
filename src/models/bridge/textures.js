import * as THREE from 'three';
import { pnoise, pfbm, hashI, mulberry32, lin2srgb, sstep, clamp, interiorFinish } from './kit.js';

// Generated surface textures for the bridge interior. No photographs: everything is painted here
// from noise, following the colours and wear seen in Oleg Kuleshov's 2015 photographs (pale
// sea-green steel, cream cast fittings, grey hammer-finish pedestals, varnished timber, brown deck).

const canvasTex = (c, { srgb = true, repeat = true, aniso = 8 } = {}) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  return t;
};
const mkCanvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// Height field (size x size, tiling) to a tangent-space normal map canvas (Drumfire).
function normalCanvas(h, w, hgt, strength) {
  const cv = mkCanvas(w, hgt), ctx = cv.getContext('2d'), img = ctx.createImageData(w, hgt);
  const at = (x, y) => h[((y + hgt) % hgt) * w + ((x + w) % w)];
  for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5, dy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
    const nx = -dx * strength, ny = dy * strength, l = 1 / Math.hypot(nx, ny, 1);
    const i = (y * w + x) * 4;
    img.data[i] = (nx * l * 0.5 + 0.5) * 255;
    img.data[i + 1] = (ny * l * 0.5 + 0.5) * 255;
    img.data[i + 2] = (l * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

function writeRGB(cv, w, h, rgb, srgb = true) {
  const ctx = cv.getContext('2d'), img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 3; c++) img.data[i * 4 + c] = srgb ? lin2srgb(rgb[i * 3 + c]) : clamp(rgb[i * 3 + c], 0, 1) * 255;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- shared noise fields

// One set of tiling fields shared by every paint: mottling, roller marks, chips, scratches, runs.
// The paints differ by colour and by thresholds, so the cost is paid once.
let fields;
function noiseFields(S = 512) {
  if (fields) return fields;
  const N = S * S;
  const f = { S, big: new Float32Array(N), mid: new Float32Array(N), fine: new Float32Array(N), roll: new Float32Array(N),
    chipMask: new Float32Array(N), chip: new Float32Array(N), run: new Float32Array(N), scratch: new Float32Array(N), peel: new Float32Array(N) };
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const u = px / S, v = py / S, i = py * S + px;
    f.big[i] = pfbm(u, v, 3, 3, 3, 11);
    f.mid[i] = pfbm(u, v, 12, 12, 3, 21);
    f.fine[i] = pnoise(u, v, 180, 180, 31) * 0.6 + pnoise(u, v, 90, 90, 32) * 0.4;
    f.roll[i] = pfbm(u, v, 2, 40, 2, 41); // roller strokes run vertically
    f.chipMask[i] = pfbm(u, v, 5, 5, 3, 51);
    f.chip[i] = pnoise(u, v, 70, 70, 61) * 0.55 + pnoise(u, v, 160, 160, 62) * 0.45;
    f.run[i] = pfbm(u, v, 48, 3, 2, 71);
    f.peel[i] = pfbm(u, v, 24, 24, 2, 81);
  }
  // scratches: thin random strokes, mostly horizontal (things slid along ledges and panels)
  const rnd = mulberry32(1144);
  for (let k = 0; k < 140; k++) {
    let x = rnd() * S, y = rnd() * S;
    const a = (rnd() - 0.5) * 0.9 + (rnd() < 0.3 ? Math.PI / 2 : 0), len = 8 + rnd() * 70, depth = 0.4 + rnd() * 0.6;
    for (let t = 0; t < len; t += 0.5) {
      const xi = ((Math.round(x + Math.cos(a) * t) % S) + S) % S, yi = ((Math.round(y + Math.sin(a) * t) % S) + S) % S;
      f.scratch[yi * S + xi] = Math.max(f.scratch[yi * S + xi], depth * (1 - t / len * 0.5));
    }
  }
  fields = f;
  return f;
}

// ---------------------------------------------------------------- painted steel

// A metric tile of painted steel (tile metres set by the material's uvScale). Returns {map, rough,
// normal}. Colours are linear-ish THREE.Color inputs; `under` shows in the chips, `primer` deeper.
const paintCache = new Map();
export function paintTextures(name, { base, under, primer = 0x6b3a26, chips = 0.6, runs = 0.35, mottle = 0.12, gloss = 0.55, orange = 0.6 } = {}) {
  if (paintCache.has(name)) return paintCache.get(name);
  const f = noiseFields(), S = f.S, N = S * S;
  const B = new THREE.Color(base), U = new THREE.Color(under ?? base).multiplyScalar(under ? 1 : 0.8), P = new THREE.Color(primer);
  const dirt = new THREE.Color(0x4b4537), light = B.clone().lerp(new THREE.Color(0xffffff), 0.12);
  const rgb = new Float32Array(N * 3), rr = new Float32Array(N * 3), ht = new Float32Array(N);
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    col.copy(B);
    // mottled repaints and roller marks
    col.lerp(light, sstep(0.45, 0.75, f.big[i]) * mottle * 1.6);
    col.multiplyScalar(1 + (f.mid[i] - 0.5) * mottle + (f.roll[i] - 0.5) * 0.05 + (f.fine[i] - 0.5) * 0.03);
    // a hint of grime and runs down from fittings
    const run = sstep(0.62, 0.86, f.run[i]) * runs;
    col.lerp(dirt, run * 0.35 + sstep(0.6, 0.8, f.big[i]) * 0.06);
    // chips: older paint first, primer where deeper
    const cm = f.chipMask[i], ch = f.chip[i];
    const chip = cm > 1 - chips * 0.45 && ch > 0.72 ? 1 : 0;
    const deep = chip && ch > 0.84 ? 1 : 0;
    if (chip) col.copy(deep ? P : U).multiplyScalar(0.85 + f.fine[i] * 0.3);
    // scratches cut through to the undercoat
    const sc = f.scratch[i];
    if (sc > 0.3) col.lerp(U, 0.6 * sc);
    rgb[i * 3] = col.r; rgb[i * 3 + 1] = col.g; rgb[i * 3 + 2] = col.b;
    // roughness: semi-gloss enamel, duller in the chips and the grime
    const rough = clamp(1 - gloss + (f.mid[i] - 0.5) * 0.12 + run * 0.15 + chip * 0.25 + sc * 0.1, 0.05, 1);
    rr[i * 3] = f.run[i]; rr[i * 3 + 1] = rough; rr[i * 3 + 2] = f.big[i];
    // height: orange peel, the brushed edge of each chip, scratch grooves
    ht[i] = (f.fine[i] - 0.5) * 0.5 * orange + (f.peel[i] - 0.5) * 0.25 - chip * 0.7 - deep * 0.3 - sc * 0.8 + (f.roll[i] - 0.5) * 0.25;
  }
  const cvA = mkCanvas(S), cvR = mkCanvas(S);
  writeRGB(cvA, S, S, rgb, true);
  writeRGB(cvR, S, S, rr, false);
  const out = { map: canvasTex(cvA), rough: canvasTex(cvR, { srgb: false }), normal: canvasTex(normalCanvas(ht, S, S, 2.2), { srgb: false }) };
  paintCache.set(name, out);
  return out;
}

// Grey hammer finish on the cast pedestals (helm, telegraph): a cellular dimpled skin.
let hammerSet;
export function hammerTextures(base = 0x9aa1a3) {
  if (hammerSet) return hammerSet;
  const S = 256, N = S * S, f = noiseFields();
  const rnd = mulberry32(77);
  const cells = Array.from({ length: 900 }, () => [rnd(), rnd()]);
  const grid = new Map();
  const G = 30;
  for (const c of cells) { const k = Math.floor(c[0] * G) + Math.floor(c[1] * G) * G; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c); }
  const B = new THREE.Color(base), rgb = new Float32Array(N * 3), rr = new Float32Array(N * 3), ht = new Float32Array(N);
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const u = px / S, v = py / S, i = py * S + px;
    let d1 = 9, d2 = 9;
    const gx = Math.floor(u * G), gy = Math.floor(v * G);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const kx = (gx + ox + G) % G, ky = (gy + oy + G) % G;
      for (const c of grid.get(kx + ky * G) || []) {
        let dx = Math.abs(c[0] - u); dx = Math.min(dx, 1 - dx);
        let dy = Math.abs(c[1] - v); dy = Math.min(dy, 1 - dy);
        const d = Math.hypot(dx, dy);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
    }
    const cell = clamp((d2 - d1) * G * 1.2, 0, 1); // ridges between dimples
    const fi = (py * 2 % 512) * 512 + (px * 2 % 512);
    const k = 0.97 + cell * 0.05 + (f.mid[fi] - 0.5) * 0.05;
    rgb[i * 3] = B.r * k; rgb[i * 3 + 1] = B.g * k; rgb[i * 3 + 2] = B.b * k * 1.01;
    rr[i * 3] = f.run[fi]; rr[i * 3 + 1] = 0.42 + (1 - cell) * 0.12; rr[i * 3 + 2] = f.big[fi];
    ht[i] = cell * 0.5 - d1 * G * 0.35;
  }
  const cvA = mkCanvas(S), cvR = mkCanvas(S);
  writeRGB(cvA, S, S, rgb, true);
  writeRGB(cvR, S, S, rr, false);
  hammerSet = { map: canvasTex(cvA), rough: canvasTex(cvR, { srgb: false }), normal: canvasTex(normalCanvas(ht, S, S, 1.6), { srgb: false }) };
  return hammerSet;
}

// Varnished timber (the sill, door trim, chart table top): long grain along U, a few boards,
// darker figure and the varnish worn pale where hands rest. Tile 2 m along the grain.
let woodSet;
export function woodTextures() {
  if (woodSet) return woodSet;
  const W = 1024, H = 256, N = W * H;
  const base = new THREE.Color(0xa26a36), dark = new THREE.Color(0x5e3818), pale = new THREE.Color(0xc89a5e);
  const rgb = new Float32Array(N * 3), rr = new Float32Array(N * 3), ht = new Float32Array(N), col = new THREE.Color();
  const boards = 3;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const u = px / W, v = py / H, i = py * W + px;
    const bi = Math.floor(v * boards), bv = (v * boards) % 1, shift = hashI(bi, 3, 5);
    const warp = pfbm(u + shift, bv, 3, 2, 2, 301 + bi) * 0.6;
    const grain = 0.5 + 0.5 * Math.sin((bv * 9 + warp * 7 + pfbm(u, v, 8, 3, 2, 311) * 1.5) * 6.283);
    const fleck = pnoise(u + shift, bv, 60, 12, 321);
    col.copy(base).lerp(dark, Math.pow(grain, 3) * 0.55 + (hashI(bi, 7, 9) - 0.5) * 0.2);
    col.lerp(pale, sstep(0.7, 0.9, fleck) * 0.25);
    col.multiplyScalar(0.94 + pfbm(u, v, 40, 6, 2, 331) * 0.1);
    const seam = bv < 0.012 || bv > 0.988 ? 1 : 0;
    if (seam) col.multiplyScalar(0.5);
    rgb[i * 3] = col.r; rgb[i * 3 + 1] = col.g; rgb[i * 3 + 2] = col.b;
    rr[i * 3] = pfbm(u, v, 30, 4, 2, 341); rr[i * 3 + 1] = 0.34 + grain * 0.1 + seam * 0.4; rr[i * 3 + 2] = pfbm(u, v, 5, 5, 3, 351);
    ht[i] = (grain - 0.5) * 0.35 - seam * 1.2 + (fleck - 0.5) * 0.2;
  }
  const cvA = mkCanvas(W, H), cvR = mkCanvas(W, H);
  writeRGB(cvA, W, H, rgb, true);
  writeRGB(cvR, W, H, rr, false);
  woodSet = { map: canvasTex(cvA), rough: canvasTex(cvR, { srgb: false }), normal: canvasTex(normalCanvas(ht, W, H, 1.2), { srgb: false }) };
  return woodSet;
}

// Perforated overhead panel, one panel per tile (0.6 m): a square grid of holes, a pressed border
// and slight oil-canning. The holes are dark (the void above the ceiling).
let ceilSet;
export function ceilingTextures() {
  if (ceilSet) return ceilSet;
  const S = 512, N = S * S, f = noiseFields();
  const base = new THREE.Color(0xcdcdc3), rgb = new Float32Array(N * 3), rr = new Float32Array(N * 3), ht = new Float32Array(N);
  const pitch = 8, rad = 1.9, border = 22;
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const i = py * S + px, fi = i;
    const inField = px > border && px < S - border && py > border && py < S - border;
    const hx = (px % pitch) - pitch / 2 + 0.5, hy = (py % pitch) - pitch / 2 + 0.5;
    const hole = inField && hx * hx + hy * hy < rad * rad ? 1 : 0;
    const edge = Math.min(px, py, S - 1 - px, S - 1 - py);
    const press = sstep(border - 8, border - 2, edge) - sstep(border - 2, border + 2, edge) * 0.6;
    const stain = sstep(0.6, 0.85, f.big[fi]) * 0.12;
    let k = 0.96 + (f.mid[fi] - 0.5) * 0.06 - stain + (edge < 2 ? -0.35 : 0);
    if (hole) k = 0.12;
    rgb[i * 3] = base.r * k; rgb[i * 3 + 1] = base.g * k; rgb[i * 3 + 2] = base.b * k * (1 - stain * 0.3);
    rr[i * 3] = f.run[fi]; rr[i * 3 + 1] = hole ? 1 : 0.62; rr[i * 3 + 2] = f.big[fi];
    ht[i] = press * 1.2 - hole * 1.4 + (f.big[fi] - 0.5) * 0.6 - (edge < 2 ? 1 : 0);
  }
  const cvA = mkCanvas(S), cvR = mkCanvas(S);
  writeRGB(cvA, S, S, rgb, true);
  writeRGB(cvR, S, S, rr, false);
  ceilSet = { map: canvasTex(cvA), rough: canvasTex(cvR, { srgb: false }), normal: canvasTex(normalCanvas(ht, S, S, 1.4), { srgb: false }) };
  return ceilSet;
}

// The wear noise for interiorFinish: R fine, G mid, B patches. Tiles at 1 / scale metres.
let wearTex;
export function wearTexture() {
  if (wearTex) return wearTex;
  const S = 256, cv = mkCanvas(S), ctx = cv.getContext('2d'), img = ctx.createImageData(S, S);
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const u = px / S, v = py / S, i = (py * S + px) * 4;
    img.data[i] = pfbm(u, v, 32, 32, 2, 401) * 255;
    img.data[i + 1] = pfbm(u, v, 8, 8, 3, 402) * 255;
    img.data[i + 2] = pfbm(u, v, 3, 3, 3, 403) * 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  wearTex = canvasTex(cv, { srgb: false });
  return wearTex;
}

// Fine grain for bare metal, chrome, bakelite and rubber (Drumfire's grainTextures).
let grainSet;
export function grainTextures() {
  if (grainSet) return grainSet;
  const S = 256, N = S * S, ht = new Float32Array(N), cvR = mkCanvas(S), ctxR = cvR.getContext('2d'), imR = ctxR.createImageData(S, S);
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const u = px / S, v = py / S, i = py * S + px;
    const scratch = pnoise(u, v, 6, 140, 201) * 0.6 + pnoise(u, v, 9, 90, 202) * 0.4;
    ht[i] = (pfbm(u, v, 40, 40, 3, 211) - 0.5) * 0.8 + (scratch - 0.5) * 0.6;
    imR.data[i * 4] = pfbm(u, v, 24, 3, 3, 221) * 255;
    imR.data[i * 4 + 1] = (0.75 + pfbm(u, v, 30, 30, 2, 231) * 0.25) * 255;
    imR.data[i * 4 + 2] = pfbm(u, v, 5, 5, 4, 241) * 255;
    imR.data[i * 4 + 3] = 255;
  }
  ctxR.putImageData(imR, 0, 0);
  grainSet = { rough: canvasTex(cvR, { srgb: false }), normal: canvasTex(normalCanvas(ht, S, S, 0.8), { srgb: false }) };
  return grainSet;
}

// ---------------------------------------------------------------- the deck

// The deck covering mapped once over the whole room (x -8..8, z -5..5): brown linoleum laid in
// strips with welded seams, worn paler and glossier along the paths the watch walks (doors to the
// helm and the windows), heel scuffs, a few repairs. Detail comes from a tiling grain normal map.
export function deckTextures(paths = []) {
  const W = 1536, H = 960, cv = mkCanvas(W, H), g = cv.getContext('2d');
  const rv = mkCanvas(W, H), r = rv.getContext('2d');
  const toPx = (x, z) => [(x + 8) / 16 * W, (z + 5) / 10 * H];
  const rnd = mulberry32(810);
  g.fillStyle = '#5c3626';
  g.fillRect(0, 0, W, H);
  r.fillStyle = 'rgb(128,150,128)'; // R streak, G roughness 0.59, B patch
  r.fillRect(0, 0, W, H);
  // mottled lino: blotches of a slightly different brown
  for (let i = 0; i < 2200; i++) {
    const x = rnd() * W, y = rnd() * H, s = 3 + rnd() * 26;
    g.fillStyle = `rgba(${rnd() < 0.5 ? '120,74,50' : '86,52,36'},${0.04 + rnd() * 0.07})`;
    g.beginPath(); g.ellipse(x, y, s, s * (0.5 + rnd()), rnd() * 3, 0, 6.283); g.fill();
  }
  for (let i = 0; i < 26000; i++) {
    const x = rnd() * W, y = rnd() * H;
    g.fillStyle = `rgba(${rnd() < 0.5 ? '160,112,80' : '50,30,22'},${0.05 + rnd() * 0.1})`;
    g.fillRect(x, y, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  // worn walking paths: wide soft strokes, paler and polished
  g.lineCap = r.lineCap = 'round';
  g.lineJoin = r.lineJoin = 'round';
  for (const path of paths) {
    for (const [width, alpha] of [[150, 0.08], [95, 0.1], [50, 0.1]]) {
      g.strokeStyle = `rgba(150,108,78,${alpha})`;
      g.lineWidth = width * (path.w || 1);
      g.beginPath();
      path.pts.forEach(([x, z], k) => { const [px, py] = toPx(x, z); if (k) g.lineTo(px, py); else g.moveTo(px, py); });
      g.stroke();
      r.strokeStyle = `rgba(128,90,128,${alpha * 1.6})`;
      r.lineWidth = width * (path.w || 1);
      r.beginPath();
      path.pts.forEach(([x, z], k) => { const [px, py] = toPx(x, z); if (k) r.lineTo(px, py); else r.moveTo(px, py); });
      r.stroke();
    }
  }
  // heel scuffs and rubber marks, densest along the paths and before the consoles
  for (let i = 0; i < 320; i++) {
    let x, y;
    if (paths.length && rnd() < 0.75) {
      const p = paths[Math.floor(rnd() * paths.length)].pts, k = Math.floor(rnd() * (p.length - 1)), t = rnd();
      const [ax, ay] = toPx(...p[k]), [bx, by] = toPx(...p[k + 1]);
      x = ax + (bx - ax) * t + (rnd() - 0.5) * 120; y = ay + (by - ay) * t + (rnd() - 0.5) * 120;
    } else { x = rnd() * W; y = rnd() * H; }
    g.strokeStyle = `rgba(28,18,14,${0.05 + rnd() * 0.12})`;
    g.lineWidth = 0.8 + rnd() * 1.2;
    g.beginPath();
    const a = rnd() * 6.28, l = 3 + rnd() * 8;
    g.arc(x, y, l, a, a + 0.3 + rnd() * 0.6);
    g.stroke();
  }
  // strips of lino 2 m wide running athwartships, with a welded seam line
  g.strokeStyle = 'rgba(40,24,16,0.55)';
  g.lineWidth = 1.5;
  for (let z = -5 + 2; z < 5; z += 2) {
    const [, py] = toPx(0, z);
    g.beginPath(); g.moveTo(0, py + Math.sin(z) * 2); g.lineTo(W, py - Math.sin(z) * 2); g.stroke();
  }
  // a patched repair and a couple of dark stains (oil, tea)
  g.fillStyle = 'rgba(96,58,40,0.9)';
  g.fillRect(...toPx(-2.4, 1.2), 70, 48);
  g.strokeStyle = 'rgba(40,24,16,0.6)';
  g.strokeRect(...toPx(-2.4, 1.2), 70, 48);
  for (const [x, z, s] of [[2.6, 2.4, 40], [-5.8, -1.9, 26], [0.5, 3.6, 30]]) {
    const [px, py] = toPx(x, z), gr = g.createRadialGradient(px, py, 0, px, py, s);
    gr.addColorStop(0, 'rgba(40,26,18,0.3)'); gr.addColorStop(1, 'rgba(40,26,18,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, s, 0, 6.283); g.fill();
  }
  // grime collects along the bulkheads
  for (const [x0, y0, x1, y1] of [[0, 0, 0, 60], [0, H, 0, H - 60], [0, 0, 60, 0], [W, 0, W - 60, 0]]) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(30,20,14,0.5)'); gr.addColorStop(1, 'rgba(30,20,14,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  const map = canvasTex(cv, { repeat: false, aniso: 8 }), rough = canvasTex(rv, { srgb: false, repeat: false });
  return { map, rough };
}

// ---------------------------------------------------------------- window glass

// Salt and grime on a bridge window (u across, v up), as an alpha map: clear in the arc the
// wiper sweeps, crusted at the bottom corners, with dried droplet spots and runs elsewhere.
let glassTex;
export function windowGlassTexture() {
  if (glassTex) return glassTex;
  const S = 256, cv = mkCanvas(S), ctx = cv.getContext('2d'), img = ctx.createImageData(S, S);
  const rnd = mulberry32(4);
  const spots = new Float32Array(S * S);
  for (let k = 0; k < 900; k++) { // dried spray droplets
    const x = rnd() * S, y = rnd() * S, r = 0.6 + rnd() * 2.2;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      const xi = Math.floor(x + dx), yi = Math.floor(y + dy);
      if (xi < 0 || yi < 0 || xi >= S || yi >= S) continue;
      spots[yi * S + xi] = Math.max(spots[yi * S + xi], (d > r - 1 ? 0.9 : 0.4) * (0.5 + rnd() * 0.5));
    }
  }
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const u = px / S, v = 1 - py / S, i = py * S + px;
    // wiper arc: pivot at the bottom centre, sweep 100 degrees, blade from 0.15 to 0.9 of the height
    const dx = u - 0.5, dy = v + 0.02, rr = Math.hypot(dx, dy * 1.1), ang = Math.abs(Math.atan2(dx, dy));
    const swept = sstep(0.12, 0.17, rr) * (1 - sstep(0.86, 0.92, rr)) * (1 - sstep(0.82, 0.9, ang));
    const corner = Math.max(0, 1 - v / 0.22) * (0.5 + 0.5 * Math.abs(dx) * 2);
    const streak = sstep(0.6, 0.9, pnoise(u, v, 40, 3, 7)) * 0.35 * (1 - v);
    const haze = 0.05 + pfbm(u, v, 4, 4, 3, 9) * 0.06;
    let a = haze * 0.8 + spots[i] * 0.22 + corner * 0.4 + streak * 0.7;
    a *= 1 - swept * 0.85;
    a += swept * sstep(0.84, 0.9, rr) * 0.25; // the dirt ridge at the end of the sweep
    const k = clamp(a, 0, 1) * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = k;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  glassTex = canvasTex(cv, { srgb: false, repeat: false });
  return glassTex;
}

// ---------------------------------------------------------------- the material set

const std = (color, rough, metal, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, vertexColors: true, ...extra });

// Interior environment light is held down: the sky environment map knows nothing of the walls.
export const INTERIOR_ENV = 0.55;

export function bridgeMaterials() {
  const wear = wearTexture(), grain = grainTextures();
  const greenT = paintTextures('green', { base: 0x86a594, under: 0x748d7d, primer: 0x5e5a4b, chips: 0.42, runs: 0.3, mottle: 0.1, gloss: 0.5 });
  const darkT = paintTextures('dark', { base: 0x627a63, under: 0x55654f, primer: 0x58483a, chips: 0.5, runs: 0.4, mottle: 0.12, gloss: 0.45 });
  const creamT = paintTextures('cream', { base: 0xcfc6a2, under: 0xb0a88c, primer: 0x6b6256, chips: 0.35, runs: 0.25, mottle: 0.08, gloss: 0.6 });
  const greyT = paintTextures('grey', { base: 0x8e9699, under: 0x767b7d, primer: 0x5f5650, chips: 0.35, runs: 0.3, mottle: 0.08, gloss: 0.5 });
  const hullT = paintTextures('hull', { base: 0x8d9a9b, under: 0x6d7778, primer: 0x6d3b2a, chips: 0.6, runs: 0.8, mottle: 0.12, gloss: 0.3 });
  const hammer = hammerTextures(0x8e979a), wood = woodTextures(), ceil = ceilingTextures();
  const set = (m, t, uvScale, ns = 0.6, env = INTERIOR_ENV) => {
    if (t.map) m.map = t.map;
    m.roughnessMap = t.rough;
    m.normalMap = t.normal;
    m.normalScale.set(ns, ns);
    m.envMapIntensity = env;
    m.userData.uvScale = uvScale;
    return m;
  };
  const M = {
    green: interiorFinish(set(std(0xffffff, 1, 0.08), greenT, 1.4, 0.55), 'br-green', wear, { chipColor: 0x6d826f, bare: 0x8a8c88, scuff: 0.6 }),
    darkGreen: interiorFinish(set(std(0xffffff, 1, 0.08), darkT, 1.4, 0.55), 'br-dark', wear, { chipColor: 0x515c4c, bare: 0x868883, scuff: 0.8 }),
    cream: interiorFinish(set(std(0xffffff, 1, 0.05), creamT, 0.5, 0.45), 'br-cream', wear, { chip: 1, chipColor: 0x958d73, bare: 0x8f8b80, bareMetal: 0.45 }),
    grey: interiorFinish(set(std(0xffffff, 1, 0.12), greyT, 1.0, 0.5), 'br-grey', wear, { chipColor: 0x6b7072, bare: 0x9ea1a1 }),
    hammer: interiorFinish(set(std(0xffffff, 1, 0.3), hammer, 0.16, 0.28), 'br-hammer', wear, { chip: 0.9, chipColor: 0x77797a, bare: 0xb0b3b4, bareMetal: 0.8, scuff: 0.7 }),
    hull: interiorFinish(set(std(0xffffff, 1, 0.1), hullT, 2.5, 0.6, 1.0), 'br-hull', wear, { chipColor: 0x6a7273, bare: 0x6e5a4c, scuff: 0, grime: 0, dust: 0.1 }),
    wood: interiorFinish(set(std(0xffffff, 1, 0.0), wood, 2.0, 0.5), 'br-wood', wear, { chip: 0.9, chipColor: 0xcf9e66, bare: 0xd0a874, bareMetal: 0, scuff: 0.2, grime: 0.4 }),
    ceiling: set(std(0xffffff, 1, 0.05), ceil, 0.6, 0.6),
    black: interiorFinish(set(std(0x1d201f, 0.55, 0.1), grain, 0.3, 0.3), 'br-black', wear, { chip: 0.6, chipColor: 0x55575a, bare: 0x7d7f80, bareMetal: 0.7, scuff: 0, dust: 0.15 }),
    bakelite: set(std(0x121212, 0.3, 0.05), grain, 0.2, 0.15, 0.7),
    rubber: set(std(0x1c1d1c, 0.92, 0.0), grain, 0.3, 0.4),
    chrome: set(std(0xd6dadb, 0.14, 1.0), grain, 0.15, 0.08, 1.1),
    steel: interiorFinish(set(std(0x8f9294, 0.38, 0.85), grain, 0.3, 0.4, 0.9), 'br-steel', wear, { chip: 0, scuff: 0.3, grime: 0.3 }),
    alu: set(std(0xb4b8b8, 0.32, 0.9), grain, 0.3, 0.3, 0.9),
    brass: set(std(0xb08c48, 0.3, 0.95), grain, 0.2, 0.25, 0.9),
    red: interiorFinish(set(std(0x8e2219, 0.45, 0.05), grain, 0.3, 0.3), 'br-red', wear, { chipColor: 0x5a3b32, bare: 0x8a8a86 }),
    cable: set(std(0x3a3d3a, 0.75, 0.0), grain, 0.3, 0.3),
    tan: set(std(0x8a6a3e, 0.62, 0.0), grain, 0.15, 0.5),
    velour: set(std(0x5a2c26, 0.98, 0.0), grain, 0.08, 1.2),
    paper: set(std(0xd9d2b8, 0.9, 0.0), grain, 0.2, 0.2),
    lamp: new THREE.MeshStandardMaterial({ color: 0xf4ead2, roughness: 0.4, metalness: 0, emissive: 0xffe2b0, emissiveIntensity: 0.6, vertexColors: true }),
    lens: new THREE.MeshStandardMaterial({ color: 0x5a1010, roughness: 0.2, metalness: 0, emissive: 0xff2a10, emissiveIntensity: 0.0, vertexColors: true }),
    dialGlass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false, envMapIntensity: 1.2 }),
  };
  // the dark under-ceiling void and the CRT surrounds do not need texture
  M.void = std(0x1b1f1d, 0.95, 0.0);
  M.void.userData.noAO = true;
  M.lamp.userData.noAO = true;
  M.lens.userData.noAO = true;
  for (const k of ['ceiling', 'bakelite', 'rubber', 'chrome', 'alu', 'brass', 'cable', 'tan', 'velour', 'paper']) M[k].userData.uvScale ??= 0.3;
  M.chrome.userData.uvScale = 0.15;
  return M;
}

// Window glass with its salt and grime, double sided so it reads from the wings too.
export function windowGlassMaterial() {
  const a = windowGlassTexture();
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xd8dfd6, roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.5, alphaMap: a,
    depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.9, specularIntensity: 0.9,
  });
  m.name = 'bridge-window-glass';
  return m;
}
