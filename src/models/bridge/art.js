import * as THREE from 'three';
import { mulberry32 } from './kit.js';

// Original artwork for the bridge: dial faces, placards, stencilled frame numbers, the telegraph
// drum bands and the chart, painted into one atlas so every static label merges into one draw.
// Russian wording follows Soviet naval usage; makers' plates are generic, not copied marks.

const FONT = '"DejaVu Sans Condensed", "Liberation Sans Narrow", "Arial Narrow", "DejaVu Sans", sans-serif';
const MONO = '"DejaVu Sans Mono", "Liberation Mono", monospace';
const SERIF = '"DejaVu Serif", "Liberation Serif", serif';
export { FONT, MONO, SERIF };

// Canvas atlas with a guillotine packer: each item takes the best-fitting free rectangle, whose
// remainder splits in two. add(w, h, draw) paints into a padded cell and returns its UV rect.
export class Atlas {
  constructor(w = 2048, h = 2048, pad = 4) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.pad = pad;
    this.free = [{ x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 }];
    this.cache = new Map();
    this.items = [];
    this.area = 0;
    // a neutral dark plate, the fallback if the atlas ever fills
    this.blank = this.add(16, 16, (c, w, h) => { c.fillStyle = '#1b201d'; c.fillRect(0, 0, w, h); });
  }

  add(w, h, draw, key = null) {
    if (key && this.cache.has(key)) return this.cache.get(key);
    w = Math.ceil(w);
    h = Math.ceil(h);
    const W = this.canvas.width, H = this.canvas.height, p = this.pad;
    let best = -1, bestScore = Infinity;
    this.free.forEach((f, i) => {
      if (w + p > f.w || h + p > f.h) return;
      const score = Math.min(f.w - w, f.h - h) * 1e6 + (f.w * f.h - w * h);
      if (score < bestScore) { bestScore = score; best = i; }
    });
    if (best < 0) {
      // never break the build: reuse the neutral plate drawn first and say so once
      if (!this.warned) { console.warn(`bridge atlas full (${this.items.length} items, ${(this.area / (W * H) * 100).toFixed(0)}% area): reusing a blank plate`); this.warned = true; }
      return this.blank;
    }
    const f = this.free.splice(best, 1)[0];
    const x = f.x, y = f.y, rw = f.w - w - p, rh = f.h - h - p;
    // split along the longer leftover so the big remainder stays big
    if (rw > rh) {
      if (rw > 8) this.free.push({ x: x + w + p, y, w: rw, h: f.h });
      if (rh > 8) this.free.push({ x, y: y + h + p, w: w + p, h: rh });
    } else {
      if (rh > 8) this.free.push({ x, y: y + h + p, w: f.w, h: rh });
      if (rw > 8) this.free.push({ x: x + w + p, y, w: rw, h: h + p });
    }
    this.items.push([w, h]);
    this.area += w * h;
    const c = this.ctx;
    c.save();
    c.beginPath();
    c.rect(x - p / 2, y - p / 2, w + p, h + p);
    c.clip();
    c.translate(x, y);
    draw(c, w, h);
    c.restore();
    const r = { u0: (x + 0.5) / W, v0: 1 - (y + h - 0.5) / H, u1: (x + w - 0.5) / W, v1: 1 - (y + 0.5) / H, w, h };
    if (key) this.cache.set(key, r);
    return r;
  }

  get used() { return this.area / (this.canvas.width * this.canvas.height); }

  texture() {
    if (!this.tex) {
      this.tex = new THREE.CanvasTexture(this.canvas);
      this.tex.colorSpace = THREE.SRGBColorSpace;
      this.tex.anisotropy = 8;
    }
    return this.tex;
  }
}

// Fit text to a width by shrinking the font.
export function fitText(c, text, x, y, maxW, size, weight = 600, font = FONT) {
  let f = size;
  c.font = `${weight} ${f}px ${font}`;
  while (c.measureText(text).width > maxW && f > 5) { f *= 0.94; c.font = `${weight} ${f}px ${font}`; }
  c.fillText(text, x, y);
  return f;
}

// Slight print grime over any face: speckle and a darker rim (aged paper and enamel).
function age(c, w, h, seed, k = 1) {
  const r = mulberry32(seed);
  for (let i = 0; i < (w * h) / 90; i++) {
    c.fillStyle = `rgba(${r() < 0.5 ? '70,60,40' : '255,250,235'},${(0.03 + r() * 0.05) * k})`;
    c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

// ---------------------------------------------------------------- placards

// Engraved or painted plate: background, border, centred lines of text.
export function placardArt(atlas, lines, { w = 384, h = 72, bg = '#1c2a24', ink = '#d9d6bd', border = '#8d927a', font = FONT, weight = 700, screws = true, seed = 1 } = {}) {
  const key = `pl:${lines.join('|')}:${w}x${h}:${bg}:${ink}`;
  return atlas.add(w, h, (c) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0.12)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    if (border) { c.strokeStyle = border; c.lineWidth = Math.max(2, h * 0.04); c.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16); }
    if (screws) for (const sx of [h * 0.2, w - h * 0.2]) {
      c.fillStyle = '#3b3b34'; c.beginPath(); c.arc(sx, h / 2, h * 0.075, 0, 7); c.fill();
      c.strokeStyle = '#9d9a88'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(sx - h * 0.05, h / 2); c.lineTo(sx + h * 0.05, h / 2); c.stroke();
    }
    c.fillStyle = ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const n = lines.length, lh = (h * 0.8) / n;
    lines.forEach((t, i) => fitText(c, t, w / 2, h * 0.1 + lh * (i + 0.5), w - (screws ? h * 0.7 : h * 0.2), lh * 0.72, i === 0 ? weight : 500, font));
    age(c, w, h, seed, 0.8);
  }, key);
}

// Stencilled marking on a transparent ground (frame numbers, cable labels), for the decal material.
export function stencilArt(atlas, text, { w = 256, h = 96, ink = 'rgba(150,40,28,0.92)', weight = 700, seed = 3 } = {}) {
  return atlas.add(w, h, (c) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, text, w / 2, h / 2, w * 0.92, h * 0.8, weight, FONT);
    // stencil bridges and a dry brush: knock random speckles out of the paint
    const r = mulberry32(seed);
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.7})`; c.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2); }
    c.fillRect(0, h * 0.47, w, h * 0.04);
    c.globalCompositeOperation = 'source-over';
  }, `st:${text}:${w}x${h}`);
}

// ---------------------------------------------------------------- dial faces

const rad = (deg) => (deg * Math.PI) / 180;

// Round instrument face on a square cell. spec: { kind, label, sub, min, max, step, major, red, green, ... }.
// Angles: 0 at twelve o'clock, clockwise; arc spans spec.a0..spec.a1 degrees.
export function dialArt(atlas, spec) {
  const S = spec.size || 256;
  const key = `dial:${JSON.stringify(spec)}`;
  return atlas.add(S, S, (c) => {
    const R = S / 2, cx = R, cy = R;
    const face = spec.face || '#e4dcc0', ink = spec.ink || '#1d1d18';
    c.fillStyle = '#121312';
    c.fillRect(0, 0, S, S);
    const g = c.createRadialGradient(cx, cy * 0.8, R * 0.1, cx, cy, R);
    g.addColorStop(0, face);
    g.addColorStop(1, shade(face, 0.82));
    c.fillStyle = g;
    c.beginPath(); c.arc(cx, cy, R * 0.98, 0, 7); c.fill();
    c.strokeStyle = ink;
    c.fillStyle = ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const kind = spec.kind || 'gauge';
    if (kind === 'gauge') drawGauge(c, R, spec, ink);
    else if (kind === 'rudder') drawRudder(c, R, spec, ink);
    else if (kind === 'compass') drawCompass(c, R, spec, ink);
    else if (kind === 'clock') drawClock(c, R, spec, ink);
    else if (kind === 'clino') drawClino(c, R, spec, ink);
    else if (kind === 'order') drawOrder(c, R, spec, ink);
    age(c, S, S, spec.seed || 7, 0.7);
  }, key);
}

function shade(hex, k) {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return `#${c.getHexString()}`;
}

function ticks(c, R, a0, a1, n, r0, r1, w) {
  c.lineWidth = w;
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n), s = Math.sin(a), k = -Math.cos(a);
    c.beginPath(); c.moveTo(R + s * r0, R + k * r0); c.lineTo(R + s * r1, R + k * r1); c.stroke();
  }
}

function arcBand(c, R, a0, a1, r0, r1, color) {
  c.fillStyle = color;
  c.beginPath();
  c.arc(R, R, r1, rad(a0) - Math.PI / 2, rad(a1) - Math.PI / 2);
  c.arc(R, R, r0, rad(a1) - Math.PI / 2, rad(a0) - Math.PI / 2, true);
  c.closePath();
  c.fill();
}

function drawGauge(c, R, s, ink) {
  const a0 = s.a0 ?? -135, a1 = s.a1 ?? 135, min = s.min ?? 0, max = s.max ?? 100;
  const major = s.major ?? 10, minor = s.minor ?? 5;
  const at = (v) => a0 + ((v - min) / (max - min)) * (a1 - a0);
  if (s.red) arcBand(c, R, at(s.red[0]), at(s.red[1]), R * 0.72, R * 0.8, '#a3281c');
  if (s.green) arcBand(c, R, at(s.green[0]), at(s.green[1]), R * 0.72, R * 0.8, '#3d7046');
  if (s.amber) arcBand(c, R, at(s.amber[0]), at(s.amber[1]), R * 0.72, R * 0.8, '#c08a2a');
  c.strokeStyle = ink;
  ticks(c, R, a0, a1, major * minor, R * 0.8, R * 0.86, 1.4);
  ticks(c, R, a0, a1, major, R * 0.76, R * 0.88, 3);
  c.beginPath(); c.lineWidth = 1.5; c.arc(R, R, R * 0.88, rad(a0) - Math.PI / 2, rad(a1) - Math.PI / 2); c.stroke();
  c.font = `600 ${R * 0.15}px ${FONT}`;
  c.fillStyle = ink;
  for (let i = 0; i <= major; i++) {
    const v = min + ((max - min) * i) / major, a = rad(at(v));
    if (s.skipLabels && i % s.skipLabels) continue;
    c.fillText(String(Math.round(v * 10) / 10).replace('.', ','), R + Math.sin(a) * R * 0.6, R - Math.cos(a) * R * 0.6);
  }
  c.font = `700 ${R * 0.15}px ${FONT}`;
  if (s.label) fitTextC(c, s.label, R, R * 1.34, R * 0.95, R * 0.15);
  c.font = `500 ${R * 0.1}px ${FONT}`;
  if (s.sub) fitTextC(c, s.sub, R, R * 1.55, R * 0.9, R * 0.1, 500);
  if (s.top) { c.font = `600 ${R * 0.11}px ${FONT}`; fitTextC(c, s.top, R, R * 0.66, R * 0.8, R * 0.11); }
  c.font = `500 ${R * 0.075}px ${FONT}`;
  c.fillText('СДЕЛАНО В СССР', R, R * 1.72);
}

function fitTextC(c, t, x, y, w, size, weight = 700) {
  let f = size;
  c.font = `${weight} ${f}px ${FONT}`;
  while (c.measureText(t).width > w && f > 4) { f *= 0.94; c.font = `${weight} ${f}px ${FONT}`; }
  c.fillText(t, x, y);
}

// Rudder angle indicator: 0 at the top, 35 degrees each way; port red, starboard green.
function drawRudder(c, R, s, ink) {
  const span = 120;
  const at = (deg) => (deg / 35) * span;
  arcBand(c, R, -span, -2, R * 0.7, R * 0.8, '#a3281c');
  arcBand(c, R, 2, span, R * 0.7, R * 0.8, '#3a6e43');
  c.strokeStyle = ink;
  ticks(c, R, -span, span, 70, R * 0.8, R * 0.85, 1.2);
  ticks(c, R, -span, span, 14, R * 0.76, R * 0.88, 2.6);
  c.font = `600 ${R * 0.13}px ${FONT}`;
  c.fillStyle = ink;
  for (let d = -35; d <= 35; d += 10) {
    if (d === -35 || d === 35) continue;
    const a = rad(at(d === -5 || d === 5 ? d : d));
    c.fillText(String(Math.abs(d)), R + Math.sin(a) * R * 0.6, R - Math.cos(a) * R * 0.6);
  }
  for (const d of [-35, 35, 0]) { const a = rad(at(d)); c.fillText(String(Math.abs(d)), R + Math.sin(a) * R * 0.6, R - Math.cos(a) * R * 0.6); }
  c.font = `700 ${R * 0.14}px ${FONT}`;
  c.fillStyle = '#8f2318'; c.fillText('ЛЕВО', R * 0.62, R * 1.22);
  c.fillStyle = '#2f5f39'; c.fillText('ПРАВО', R * 1.38, R * 1.22);
  c.fillStyle = ink;
  c.font = `700 ${R * 0.12}px ${FONT}`;
  c.fillText(s.label || 'АКСИОМЕТР', R, R * 1.48);
  c.font = `500 ${R * 0.08}px ${FONT}`;
  c.fillText('ГРАДУСЫ ПЕРЕКЛАДКИ РУЛЯ', R, R * 1.63);
}

// Gyrocompass repeater card: 360 degrees, numbers every 10, a rose in the centre.
function drawCompass(c, R, s, ink) {
  c.strokeStyle = ink;
  ticks(c, R, 0, 360, 360, R * 0.9, R * 0.95, 0.8);
  ticks(c, R, 0, 360, 72, R * 0.86, R * 0.95, 1.6);
  ticks(c, R, 0, 360, 36, R * 0.82, R * 0.95, 2.6);
  c.font = `700 ${R * 0.1}px ${FONT}`;
  c.fillStyle = ink;
  for (let d = 0; d < 360; d += 10) {
    const a = rad(d);
    c.save();
    c.translate(R + Math.sin(a) * R * 0.74, R - Math.cos(a) * R * 0.74);
    c.rotate(a);
    c.fillText(String(d), 0, 0);
    c.restore();
  }
  c.beginPath(); c.lineWidth = 1.2; c.arc(R, R, R * 0.66, 0, 7); c.stroke();
  // rose
  for (let i = 0; i < 8; i++) {
    const a = rad(i * 45), l = i % 2 ? R * 0.3 : R * 0.55;
    c.fillStyle = i === 0 ? '#9b2418' : i % 2 ? '#5d5a4f' : ink;
    c.beginPath();
    c.moveTo(R + Math.sin(a) * l, R - Math.cos(a) * l);
    c.lineTo(R + Math.sin(a + 0.25) * R * 0.08, R - Math.cos(a + 0.25) * R * 0.08);
    c.lineTo(R, R);
    c.lineTo(R + Math.sin(a - 0.25) * R * 0.08, R - Math.cos(a - 0.25) * R * 0.08);
    c.closePath();
    c.fill();
  }
  c.font = `700 ${R * 0.12}px ${FONT}`;
  c.fillStyle = '#9b2418';
  c.fillText('С', R, R * 0.4);
}

// Ship's clock: 12 hours with the 24 hour inner ring and a small seconds dial.
function drawClock(c, R, s, ink) {
  c.strokeStyle = ink;
  ticks(c, R, 0, 360, 60, R * 0.86, R * 0.92, 1.2);
  ticks(c, R, 0, 360, 12, R * 0.8, R * 0.92, 3.4);
  c.font = `700 ${R * 0.17}px ${FONT}`;
  c.fillStyle = ink;
  for (let h = 1; h <= 12; h++) { const a = rad(h * 30); c.fillText(String(h), R + Math.sin(a) * R * 0.66, R - Math.cos(a) * R * 0.66); }
  c.font = `500 ${R * 0.075}px ${FONT}`;
  c.fillStyle = '#8b2016';
  for (let h = 13; h <= 24; h++) { const a = rad((h - 12) * 30); c.fillText(String(h % 24 === 0 ? 24 : h), R + Math.sin(a) * R * 0.48, R - Math.cos(a) * R * 0.48); }
  c.fillStyle = ink;
  c.beginPath(); c.lineWidth = 1; c.arc(R, R * 1.36, R * 0.15, 0, 7); c.stroke();
  ticks2(c, R, R * 1.36, R * 0.15);
  c.font = `600 ${R * 0.075}px ${FONT}`;
  c.fillText('ВМФ СССР', R, R * 0.36);
}
function ticks2(c, cx, cy, r) {
  for (let i = 0; i < 12; i++) { const a = rad(i * 30); c.beginPath(); c.moveTo(cx + Math.sin(a) * r * 0.75, cy - Math.cos(a) * r * 0.75); c.lineTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r); c.stroke(); }
}

// Clinometer: an arc across the lower half, 0 at the bottom, 50 degrees each way.
function drawClino(c, R, s, ink) {
  c.strokeStyle = ink;
  const at = (d) => 180 + d * 1.6;
  ticks(c, R, at(-50), at(50), 50, R * 0.78, R * 0.86, 1.1);
  ticks(c, R, at(-50), at(50), 10, R * 0.72, R * 0.88, 2.4);
  arcBand(c, R, at(-50), at(-30), R * 0.88, R * 0.93, '#a3281c');
  arcBand(c, R, at(30), at(50), R * 0.88, R * 0.93, '#a3281c');
  c.font = `600 ${R * 0.12}px ${FONT}`;
  c.fillStyle = ink;
  for (let d = -50; d <= 50; d += 10) { const a = rad(at(d)); c.fillText(String(Math.abs(d)), R + Math.sin(a) * R * 0.6, R - Math.cos(a) * R * 0.6); }
  c.font = `700 ${R * 0.14}px ${FONT}`;
  c.fillText('КРЕНОМЕР', R, R * 0.5);
  c.font = `500 ${R * 0.09}px ${FONT}`;
  c.fillText('ЛЕВЫЙ БОРТ        ПРАВЫЙ БОРТ', R, R * 0.72);
}

// Telegraph end face: order sectors (ahead above, astern below) round a central STOP.
function drawOrder(c, R, s, ink) {
  const orders = [['САМЫЙ ПОЛНЫЙ', 'ahead'], ['ПОЛНЫЙ', 'ahead'], ['СРЕДНИЙ', 'ahead'], ['МАЛЫЙ', 'ahead'], ['САМЫЙ МАЛЫЙ', 'ahead'], ['СТОП', 'stop'],
    ['САМЫЙ МАЛЫЙ', 'astern'], ['МАЛЫЙ', 'astern'], ['СРЕДНИЙ', 'astern'], ['ПОЛНЫЙ', 'astern'], ['САМЫЙ ПОЛНЫЙ', 'astern']];
  const n = orders.length, a0 = -165, a1 = 165;
  for (let i = 0; i < n; i++) {
    const aa = a0 + ((a1 - a0) * i) / n, ab = a0 + ((a1 - a0) * (i + 1)) / n;
    const type = orders[i][1];
    arcBand(c, R, aa + 0.6, ab - 0.6, R * 0.3, R * 0.95, type === 'stop' ? '#d8d1b6' : type === 'ahead' ? '#20271f' : '#6a1f17');
    c.save();
    const mid = rad((aa + ab) / 2);
    c.translate(R + Math.sin(mid) * R * 0.63, R - Math.cos(mid) * R * 0.63);
    c.rotate(mid + (Math.cos(mid) < 0 ? Math.PI : 0));
    c.fillStyle = type === 'stop' ? '#1d1d18' : '#e8e0c4';
    fitTextC(c, orders[i][0], 0, 0, R * 0.58, R * 0.1);
    c.restore();
  }
  c.fillStyle = '#e8e0c4';
  c.beginPath(); c.arc(R, R, R * 0.28, 0, 7); c.fill();
  c.fillStyle = ink;
  c.font = `700 ${R * 0.11}px ${FONT}`;
  c.fillText(s.label || 'ЛЕВАЯ', R, R * 0.94);
  c.fillText('МАШИНА', R, R * 1.07);
  c.font = `700 ${R * 0.1}px ${FONT}`;
  c.fillStyle = '#20271f'; c.fillText('ВПЕРЁД', R, R * 0.12 + R * 0.05);
  c.fillStyle = '#6a1f17'; c.fillText('НАЗАД', R, R * 1.88);
}

// ---------------------------------------------------------------- telegraph drum band

// The lettered band round a telegraph drum: black enamel with polished letters (u runs round).
export function drumBandArt(atlas) {
  return atlas.add(1024, 72, (c, w, h) => {
    c.fillStyle = '#141615';
    c.fillRect(0, 0, w, h);
    const words = ['ПОЛНЫЙ', 'СРЕДНИЙ', 'МАЛЫЙ', 'СТОП', 'МАЛЫЙ', 'СРЕДНИЙ', 'ПОЛНЫЙ', 'НАЗАД', 'ВПЕРЁД', 'ГОТОВЬ'];
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    words.forEach((t, i) => {
      const x = (i + 0.5) * (w / words.length);
      c.fillStyle = '#7f8282';
      c.fillRect(x - w / words.length / 2 + 4, 6, w / words.length - 8, h - 12);
      c.fillStyle = '#101211';
      c.fillRect(x - w / words.length / 2 + 7, 9, w / words.length - 14, h - 18);
      c.fillStyle = i === 3 ? '#e0dccb' : '#c7cac6';
      fitText(c, t, x, h / 2 + 1, w / words.length - 18, h * 0.42, 700);
    });
    age(c, w, h, 21, 1.2);
  }, 'drumband');
}

// ---------------------------------------------------------------- chart

// A working chart of the Norwegian Sea: graticule, coast, soundings, the plotted track with fixes.
export function chartArt(atlas) {
  return atlas.add(896, 560, (c, w, h) => {
    const r = mulberry32(65);
    c.fillStyle = '#dcd6bb';
    c.fillRect(0, 0, w, h);
    // land (ochre) along the right edge with a fringe of islands
    c.fillStyle = '#cdb98b';
    c.beginPath();
    c.moveTo(w, 0);
    for (let y = 0; y <= h; y += 8) c.lineTo(w * 0.78 + Math.sin(y * 0.021) * 40 + Math.sin(y * 0.09) * 12 + (r() - 0.5) * 6, y);
    c.lineTo(w, h);
    c.fill();
    for (let i = 0; i < 26; i++) { c.beginPath(); c.ellipse(w * (0.68 + r() * 0.1), r() * h, 3 + r() * 9, 2 + r() * 6, r() * 3, 0, 7); c.fill(); }
    // depth contours
    c.strokeStyle = 'rgba(80,120,140,0.5)';
    for (let k = 1; k <= 3; k++) {
      c.beginPath();
      for (let y = 0; y <= h; y += 8) { const x = w * (0.78 - k * 0.07) + Math.sin(y * 0.02 + k) * 36; if (y) c.lineTo(x, y); else c.moveTo(x, y); }
      c.stroke();
    }
    // graticule
    c.strokeStyle = 'rgba(70,70,60,0.55)';
    c.lineWidth = 1;
    c.font = `500 12px ${FONT}`;
    c.fillStyle = '#4a4a3e';
    for (let x = 40; x < w; x += 110) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); c.fillText(`${2 + Math.round(x / 110) * 2}°В`, x + 3, 14); }
    for (let y = 30; y < h; y += 100) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); c.fillText(`${70 - Math.round(y / 100)}°С`, 4, y - 3); }
    // soundings
    c.font = `400 10px ${SERIF}`;
    c.fillStyle = '#3d4f58';
    for (let i = 0; i < 150; i++) { const x = r() * w * 0.74, y = 20 + r() * (h - 20); c.fillText(String(Math.round(400 + r() * 2600)), x, y); }
    c.font = `italic 600 22px ${SERIF}`;
    c.fillStyle = '#3d5560';
    c.fillText('НОРВЕЖСКОЕ МОРЕ', w * 0.18, h * 0.48);
    // compass rose
    c.strokeStyle = '#6a3b30';
    c.beginPath(); c.arc(w * 0.16, h * 0.78, 52, 0, 7); c.stroke();
    for (let i = 0; i < 36; i++) { const a = rad(i * 10); c.beginPath(); c.moveTo(w * 0.16 + Math.sin(a) * 46, h * 0.78 - Math.cos(a) * 46); c.lineTo(w * 0.16 + Math.sin(a) * 52, h * 0.78 - Math.cos(a) * 52); c.stroke(); }
    // the track: pencil line, fixes as circled dots with times
    c.strokeStyle = '#2c2a26';
    c.lineWidth = 1.6;
    const pts = [[90, 520], [200, 430], [320, 360], [430, 310], [520, 230], [600, 170]];
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
    c.font = `500 12px ${MONO}`;
    c.fillStyle = '#2c2a26';
    pts.forEach(([x, y], i) => { c.beginPath(); c.arc(x, y, 6, 0, 7); c.stroke(); c.fillText(`${String(4 + i).padStart(2, '0')}.${(i * 20) % 60 || '00'}`, x + 9, y + 4); });
    // a red bearing line to a contact
    c.strokeStyle = '#9a2a1d';
    c.setLineDash([8, 5]);
    c.beginPath(); c.moveTo(520, 230); c.lineTo(380, 70); c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#9a2a1d';
    c.fillText('ЦЕЛЬ 1  Д=180 КБ', 300, 60);
    age(c, w, h, 66, 1.4);
    // fold lines
    c.strokeStyle = 'rgba(90,80,60,0.25)';
    c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
  }, 'chart');
}

// Log book page (handwritten watch entries in pencil).
export function logbookArt(atlas) {
  return atlas.add(256, 320, (c, w, h) => {
    c.fillStyle = '#e2dcc6';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(90,110,140,0.45)';
    for (let y = 30; y < h; y += 14) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.strokeStyle = 'rgba(160,50,40,0.5)';
    c.beginPath(); c.moveTo(42, 0); c.lineTo(42, h); c.stroke();
    c.fillStyle = '#2f3440';
    c.font = `italic 500 11px ${SERIF}`;
    const r = mulberry32(9);
    const entries = ['Курс 000, ход 18 уз', 'РЛС в режиме излуч.', 'Обнаружены 2 НК', 'Боевая тревога', 'Ц/У получено', 'Пуск разрешён'];
    for (let i = 0; i < 18; i++) c.fillText(`${String(4 + (i >> 2)).padStart(2, '0')}.${String((i * 13) % 60).padStart(2, '0')}  ${entries[i % entries.length]}`, 6 + r() * 3, 42 + i * 14);
  }, 'logbook');
}

// Generic equipment face: rows of knob legends and lamp rings on a cream panel (radio, intercom).
export function panelArt(atlas, title, rows, { w = 384, h = 256, bg = '#cfc6a6', ink = '#2a2a22', seed = 5 } = {}) {
  return atlas.add(w, h, (c) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, title, w / 2, h * 0.09, w * 0.9, h * 0.09, 700);
    rows.forEach((row, j) => {
      const y = h * (0.25 + (j * 0.7) / rows.length);
      row.forEach((t, i) => {
        const x = w * ((i + 0.5) / row.length);
        c.strokeStyle = '#3c3a32';
        c.lineWidth = 2;
        c.beginPath(); c.arc(x, y, Math.min(w / row.length, h / rows.length) * 0.22, 0, 7); c.stroke();
        fitText(c, t, x, y + h * 0.1, w / row.length - 6, h * 0.05, 600);
      });
    });
    age(c, w, h, seed, 1);
  }, `panel:${title}`);
}
