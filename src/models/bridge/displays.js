import * as THREE from 'three';
import { FONT, MONO } from './art.js';

// Live displays on the bridge: the navigation radar PPI, the Fort channel scope, and the weapons
// repeat station's annunciator tiles and status window. All are canvases redrawn from the game
// state; screens are emissive so they read in the dark and bloom slightly.

const TAU = Math.PI * 2;

function screenMaterial(tex, { intensity = 1 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0x050605, roughness: 0.25, metalness: 0, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: intensity, vertexColors: false });
  m.userData.screen = true;
  return m;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { c, g: c.getContext('2d'), t };
}

// ---------------------------------------------------------------- fire-control vocabulary

export const STAGES = {
  idle: ['ОЖИДАНИЕ', 'STANDBY'],
  designated: ['ЦЕЛЬ НАЗНАЧЕНА', 'DESIGNATED'],
  tracking: ['ЗАХВАТ ЦЕЛИ', 'TRACKING'],
  tracked: ['СОПРОВОЖДЕНИЕ', 'TRACKED'],
  preparing: ['ПОДГОТОВКА', 'PREPARING'],
  ready: ['ГОТОВ · НА ПРЕДОХР.', 'READY · SAFE'],
  armed: ['ВЗВЕДЕНО', 'ARMED'],
  firing: ['ПУСК', 'FIRING'],
  complete: ['ВЫПОЛНЕНО', 'COMPLETE'],
  aborted: ['ОТБОЙ', 'ABORTED'],
};
const STEPS = {
  'LOAD TARGET SOLUTION': 'ВВОД ДАННЫХ ЦУ',
  'CHECK LAUNCH CIRCUITS': 'ПРОВЕРКА ЦЕПЕЙ ПУСКА',
  'CLEAR INCLINED LAUNCH PATH': 'ОТКРЫТИЕ КРЫШКИ ПУ',
  'ASSIGN FIRE-CONTROL CHANNEL': 'НАЗНАЧЕНИЕ КАНАЛА',
  'INDEX ROTARY MAGAZINE': 'ПОВОРОТ БАРАБАНА',
  'CHECK EJECTION / IGNITION': 'ПРОВЕРКА СТАРТА',
  'RAISE TWIN-RAIL LAUNCHER': 'ПОДЪЁМ ПУ',
  'TRAIN LAUNCHER / DIRECTOR': 'НАВЕДЕНИЕ ПУ',
  'CHECK COMMAND GUIDANCE': 'ПРОВЕРКА ТЕЛЕУПРАВЛЕНИЯ',
  'ACQUIRING DIRECTOR TRACK': 'ЗАХВАТ РЛС УПРАВЛЕНИЯ',
  'CORRELATING RECONNAISSANCE TRACK': 'ОТОЖДЕСТВЛЕНИЕ ЦУ',
  'WAITING FOR LAUNCHER CYCLE': 'ПЕРЕЗАРЯДКА ПУ',
  'SALVO IN PROGRESS': 'ЗАЛП',
  'SALVO AUTHORIZED': 'ПУСК РАЗРЕШЁН',
  'TRACK CONFIRMED': 'ЦЕЛЬ НА СОПРОВОЖДЕНИИ',
  'PREPARATION COMPLETE': 'ПОДГОТОВКА ЗАВЕРШЕНА',
  'ARMED': 'ВЗВЕДЕНО · ЖДУ КОМАНДЫ',
  'LAUNCH ORDER COMPLETE': 'ПУСК ВЫПОЛНЕН',
  'CEASE FIRE': 'ПРЕКРАТИТЬ ОГОНЬ',
};
export const WEAPON_NAMES = { granit: 'П-700 ГРАНИТ', bazalt: 'П-500 БАЗАЛЬТ', fort: 'С-300Ф ФОРТ', osa: 'ОСА-М', ak130: 'АК-130', gun: 'АК-630' };

// The stage the repeat station shows: an idle sequence with a designated target reads "designated".
export function displayStage(fc = {}) {
  const s = fc.stage || 'idle';
  if (s === 'idle' && fc.targetId != null) return 'designated';
  return STAGES[s] ? s : 'idle';
}

// Annunciator tiles: label, and for each stage the tile's state ('off' | colour | colour + '!' to flash).
const TILES = [
  { t: ['ЦЕЛЬ', 'НАЗНАЧЕНА'], on: { designated: 'amber', tracking: 'green', tracked: 'green', preparing: 'green', ready: 'green', armed: 'green', firing: 'green' } },
  { t: ['ЗАХВАТ'], on: { tracking: 'amber!', tracked: 'green', preparing: 'green', ready: 'green', armed: 'green', firing: 'green' } },
  { t: ['СОПРОВОЖ-', 'ДЕНИЕ'], on: { tracked: 'green', preparing: 'green', ready: 'green', armed: 'green', firing: 'green' } },
  { t: ['ПОДГОТОВКА'], on: { preparing: 'amber!', ready: 'green', armed: 'green', firing: 'green' } },
  { t: ['ГОТОВ'], on: { ready: 'green', armed: 'green', firing: 'green' } },
  { t: ['ВЗВЕДЕНО'], on: { armed: 'red', firing: 'red' } },
  { t: ['ПУСК'], on: { firing: 'red!' } },
  { t: ['ВЫПОЛНЕНО'], on: { complete: 'white' } },
  { t: ['ОТБОЙ'], on: { aborted: 'red!' } },
];
const LIT = { amber: ['#ffb43c', '#5a3408'], green: ['#8dff8a', '#103d12'], red: ['#ff4a32', '#4d0d07'], white: ['#f4f1dc', '#3d3b30'] };

// ---------------------------------------------------------------- the builder

export function createDisplays(group) {
  const meshes = [];
  const place = (mat4, geom, mat) => {
    const m = new THREE.Mesh(geom, mat);
    mat4.decompose(m.position, m.quaternion, m.scale);
    m.renderOrder = 1;
    group.add(m);
    meshes.push(m);
    return m;
  };
  const ppi = canvas(512, 512), fort = canvas(512, 512), ann = canvas(512, 280), stat = canvas(512, 116);
  const ppiMat = screenMaterial(ppi.t, { intensity: 1.1 }), fortMat = screenMaterial(fort.t, { intensity: 1.0 });
  const annMat = screenMaterial(ann.t, { intensity: 1.3 }), statMat = screenMaterial(stat.t, { intensity: 1.2 });
  const hooks = {
    ppi: (m4, r) => place(m4, new THREE.CircleGeometry(r, 48), ppiMat),
    fort: (m4, r) => place(m4, new THREE.CircleGeometry(r, 48), fortMat),
    annunciator: (m4, w, h) => place(m4, new THREE.PlaneGeometry(w, h), annMat),
    status: (m4, w, h) => place(m4, new THREE.PlaneGeometry(w, h), statMat),
  };
  // radar afterglow: the PPI canvas keeps its previous frame and fades it
  ppi.g.fillStyle = '#020803';
  ppi.g.fillRect(0, 0, 512, 512);
  let sweepPrev = 0, lastRadar = -1, lastFort = -1, lastAnn = '', lastStatus = -1, lastStatusKey = '';

  function drawPPI(state, time) {
    const g = ppi.g, C = 256, R = 236;
    const p = state.pos || state.player?.pos || { x: 0, z: 0 };
    const heading = state.heading || 0, on = state.radar !== false;
    // fade the afterglow, then the sweep sector since the last frame
    g.fillStyle = 'rgba(1,6,2,0.09)';
    g.fillRect(0, 0, 512, 512);
    const sweep = on ? (time * 1.25) % TAU : sweepPrev;
    if (on) {
      let a0 = sweepPrev, a1 = sweep;
      if (a1 < a0) a1 += TAU;
      if (a1 - a0 > 1.2) a0 = a1 - 1.2;
      for (let a = a0; a <= a1; a += 0.01) {
        const s = Math.sin(a), c = -Math.cos(a);
        // sea clutter near the centre, speckled
        for (let r = 4; r < 70; r += 3) if (Math.random() < 0.25) { g.fillStyle = `rgba(150,255,140,${0.12 + Math.random() * 0.2})`; g.fillRect(C + s * r, C + c * r, 1.6, 1.6); }
        if (Math.random() < 0.08) { const r = 70 + Math.random() * 160; g.fillStyle = 'rgba(150,255,140,0.12)'; g.fillRect(C + s * r, C + c * r, 1.2, 1.2); }
      }
      // contacts brighten as the sweep passes them (head-up display: relative to the ship's head)
      const range = 48000;
      for (const e of state.tracks || state.contacts || []) {
        if (e.alive === false || e.detected === false || !e.pos) continue;
        const dx = e.pos.x - p.x, dz = e.pos.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist > range) continue;
        let brg = Math.atan2(dx, -dz) - heading;
        brg = ((brg % TAU) + TAU) % TAU;
        let rel = brg;
        let b0 = sweepPrev % TAU, b1 = sweep % TAU;
        const crossed = b0 <= b1 ? rel >= b0 && rel <= b1 : rel >= b0 || rel <= b1;
        if (!crossed) continue;
        const r = (dist / range) * R, x = C + Math.sin(rel) * r, y = C - Math.cos(rel) * r;
        const big = e.type === 'ship' ? 5 : 3;
        const gr = g.createRadialGradient(x, y, 0, x, y, big * 2.2);
        gr.addColorStop(0, 'rgba(220,255,200,1)'); gr.addColorStop(1, 'rgba(120,255,120,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, big * 2.2, 0, TAU); g.fill();
      }
    }
    sweepPrev = sweep;
    // the overlay is redrawn every time: rings, heading line, bezel scale, sweep line
    const o = g;
    o.save();
    o.strokeStyle = 'rgba(110,200,110,0.35)';
    o.lineWidth = 1;
    for (let k = 1; k <= 4; k++) { o.beginPath(); o.arc(C, C, (R * k) / 4, 0, TAU); o.stroke(); }
    o.strokeStyle = 'rgba(170,255,160,0.55)';
    o.beginPath(); o.moveTo(C, C); o.lineTo(C, C - R); o.stroke();
    if (on) {
      o.strokeStyle = 'rgba(200,255,190,0.9)';
      o.lineWidth = 2;
      o.beginPath(); o.moveTo(C, C); o.lineTo(C + Math.sin(sweep) * R, C - Math.cos(sweep) * R); o.stroke();
    }
    o.restore();
  }

  function drawFort(state, time) {
    const g = fort.g, W = 512;
    g.fillStyle = '#04080a';
    g.fillRect(0, 0, W, W);
    const glow = g.createRadialGradient(256, 256, 20, 256, 256, 250);
    glow.addColorStop(0, '#0d2a1c'); glow.addColorStop(1, '#02070a');
    g.fillStyle = glow; g.beginPath(); g.arc(256, 256, 250, 0, TAU); g.fill();
    // B-scope: bearing across (-60..60 deg off the head), range up (0..90 km)
    const x0 = 66, x1 = 446, y0 = 400, y1 = 110;
    g.strokeStyle = 'rgba(120,220,150,0.35)';
    g.lineWidth = 1;
    for (let k = 0; k <= 6; k++) { const x = x0 + ((x1 - x0) * k) / 6; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
    for (let k = 0; k <= 3; k++) { const y = y0 + ((y1 - y0) * k) / 3; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
    g.fillStyle = 'rgba(150,240,170,0.8)';
    g.font = `600 17px ${MONO}`;
    g.textAlign = 'left';
    g.fillText('ФОРТ  КАНАЛ 1', 70, 90);
    g.textAlign = 'right';
    g.fillText(state.radar === false ? 'РЛС ВЫКЛ' : 'ИЗЛУЧЕНИЕ', 446, 90);
    const p = state.pos || { x: 0, z: 0 }, heading = state.heading || 0;
    const fc = state.fireControl || {};
    for (const e of state.tracks || []) {
      if (e.alive === false || !e.pos || e.type === 'ship') continue;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z, dist = Math.hypot(dx, dz);
      let rel = Math.atan2(dx, -dz) - heading;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      if (Math.abs(rel) > Math.PI / 3 || dist > 90000) continue;
      const x = x0 + ((rel / (Math.PI / 3)) * 0.5 + 0.5) * (x1 - x0), y = y0 + (dist / 90000) * (y1 - y0);
      g.fillStyle = e.type === 'munition' ? '#ffd27a' : '#b4ffb8';
      g.fillRect(x - 5, y - 2, 10, 4);
      if (e.id === fc.targetId) {
        g.strokeStyle = ['tracked', 'preparing', 'ready', 'armed', 'firing'].includes(fc.stage) ? '#e8ffe0' : '#ffd27a';
        g.lineWidth = 2;
        const s = fc.stage === 'tracking' ? 16 - 8 * (fc.progress || 0) : 9;
        g.strokeRect(x - s, y - s, s * 2, s * 2);
      }
    }
    g.textAlign = 'left';
    g.font = `500 15px ${MONO}`;
    g.fillStyle = 'rgba(150,240,170,0.75)';
    g.fillText(`КУРС ${String(Math.round(((heading * 180) / Math.PI + 360) % 360)).padStart(3, '0')}°`, 70, 432);
    const fortAmmo = state.ammo?.fort;
    if (fortAmmo != null) { g.textAlign = 'right'; g.fillText(`БК ${fortAmmo}`, 446, 432); }
    for (let y = 0; y < W; y += 3) { g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, y, W, 1); }
    fort.t.needsUpdate = true;
  }

  function drawAnnunciator(stage, flash, weapon) {
    const g = ann.g, W = 512, H = 280;
    g.fillStyle = '#0b0c0b';
    g.fillRect(0, 0, W, H);
    const cw = W / 3, ch = H / 3;
    TILES.forEach((tile, i) => {
      const x = (i % 3) * cw, y = Math.floor(i / 3) * ch;
      let st = tile.on[stage] || 'off';
      const blink = st.endsWith('!');
      st = st.replace('!', '');
      const lit = st !== 'off' && (!blink || flash);
      const [on, dim] = LIT[st] || ['#2a2a26', '#151513'];
      g.fillStyle = '#1a1b19';
      g.fillRect(x + 3, y + 3, cw - 6, ch - 6);
      g.fillStyle = lit ? on : st !== 'off' ? dim : '#232420';
      g.fillRect(x + 7, y + 7, cw - 14, ch - 14);
      if (lit) {
        const gr = g.createRadialGradient(x + cw / 2, y + ch / 2, 4, x + cw / 2, y + ch / 2, cw * 0.6);
        gr.addColorStop(0, 'rgba(255,255,240,0.35)'); gr.addColorStop(1, 'rgba(255,255,240,0)');
        g.fillStyle = gr; g.fillRect(x + 7, y + 7, cw - 14, ch - 14);
      }
      g.fillStyle = lit ? '#1a120a' : '#6c6b60';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const n = tile.t.length;
      tile.t.forEach((line, k) => {
        let f = 26;
        g.font = `700 ${f}px ${FONT}`;
        while (g.measureText(line).width > cw - 24 && f > 10) { f -= 1; g.font = `700 ${f}px ${FONT}`; }
        g.fillText(line, x + cw / 2, y + ch / 2 + (k - (n - 1) / 2) * 28);
      });
    });
    ann.t.needsUpdate = true;
  }

  function drawStatus(fc, stage, flash) {
    const g = stat.g, W = 512, H = 116;
    g.fillStyle = '#030a08';
    g.fillRect(0, 0, W, H);
    const ink = stage === 'aborted' ? '#ff8a6a' : stage === 'armed' || stage === 'firing' ? '#ffb39a' : '#8ff0c4';
    g.fillStyle = ink;
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.font = `700 22px ${MONO}`;
    g.fillText(WEAPON_NAMES[fc.weapon] || 'ОРУЖИЕ', 12, 26);
    g.textAlign = 'right';
    g.font = `600 18px ${MONO}`;
    if (fc.salvo) g.fillText(`ЗАЛП ${fc.salvo}  ОСТ ${fc.stage === 'firing' ? fc.remaining ?? fc.salvo : fc.salvo}`, W - 12, 26);
    const [ru, en] = STAGES[stage];
    g.textAlign = 'left';
    g.font = `700 26px ${FONT}`;
    if (!(stage === 'aborted' && !flash)) g.fillText(ru, 12, 60);
    g.font = `600 16px ${MONO}`;
    g.textAlign = 'right';
    g.fillText(en, W - 12, 58);
    // step or reason, and the progress bar
    const label = String(fc.stepLabel || fc.reason || '').toUpperCase();
    const ruStep = STEPS[label.replace(/ \u2014.*/, '').trim()] || label;
    g.textAlign = 'left';
    g.font = `500 15px ${MONO}`;
    g.fillText(ruStep.slice(0, 44), 12, 86);
    g.strokeStyle = ink;
    g.lineWidth = 1.5;
    g.strokeRect(12, 96, W - 24, 12);
    const prog = ['tracking', 'preparing'].includes(fc.stage) ? fc.progress || 0 : ['ready', 'armed', 'firing', 'complete', 'tracked'].includes(fc.stage) ? 1 : 0;
    g.fillRect(14, 98, (W - 28) * Math.min(1, Math.max(0, prog)), 8);
    for (let y = 0; y < H; y += 3) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y, W, 1); }
    stat.t.needsUpdate = true;
  }

  let stageNow = 'idle', weaponNow = 'granit';
  function update(state = {}) {
    const time = state.time || 0;
    const fc = state.fireControl || {};
    const stage = displayStage(fc);
    stageNow = stage;
    weaponNow = fc.weapon || 'granit';
    const flash = Math.floor(time * 2.5) % 2 === 0;
    const key = `${stage}|${flash}|${weaponNow}`;
    if (key !== lastAnn) { drawAnnunciator(stage, flash, weaponNow); lastAnn = key; }
    // the status window redraws at 8 Hz, or at once when the stage changes
    const tick = Math.floor(time * 8);
    if (tick !== lastStatus || key !== lastStatusKey) { drawStatus(fc, stage, flash); lastStatus = tick; lastStatusKey = key; }
    if (Math.floor(time * 12) !== lastRadar) { lastRadar = Math.floor(time * 12); drawPPI(state, time); ppi.t.needsUpdate = true; }
    if (Math.floor(time * 4) !== lastFort) { lastFort = Math.floor(time * 4); drawFort(state, time); }
  }
  update({});
  return { hooks, update, meshes, materials: [ppiMat, fortMat, annMat, statMat], get stage() { return stageNow; }, get weapon() { return weaponNow; } };
}
