import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Kirov crew: Soviet Navy, Northern Fleet, at sea in autumn 1985. Officers in the black tuzhurka and
 * the large naval furazhka, ratings in the blue working dress (roba) with the telnyashka at the neck
 * and the bezkozyrka with its "СЕВЕРНЫЙ ФЛОТ" ribbon, deck watches in the black bushlat and ushanka,
 * talkers with headsets and chest microphones, lookouts with 7x50 binoculars, the orange life jacket
 * for upper deck crew. References: refs/README.md ("Crew"), photos in refs/photos/crew/.
 *
 * The rig is ported from Drumfire's crew (src/models/v/crew.js in that project): one THREE.SkinnedMesh
 * per figure (one draw call plus its shadow pass), rigid skinning (every vertex on one bone, the parts
 * overlap at the joints), geometry cached per outfit and shared, one material for every figure,
 * poses with cross-fade blending, two-bone IK for arms and legs, and no per-frame allocation.
 * About 4.0k to 5.0k triangles per figure (crewTriangles(outfit) reports the exact count).
 *
 * Coordinates: metres, a 1.78 m man in figure space. The root's origin is the ground point between
 * the feet, the figure faces -Z, his right hand is on +X, +Y up. `height` scales the root uniformly,
 * so "root space" below is figure space (multiply by height / 1.78 for world metres).
 *
 * QUICK START
 *   import { buildNavalCrewman, patchCrewMaterial } from './models/kirov-crew.js';
 *   const helm = buildNavalCrewman({ role: 'helmsman', seed: 3 });
 *   parent.add(helm.root); helm.root.position.set(x, deckY, z); helm.root.rotation.y = heading;
 *   helm.hold('L', gripLeftObject3D, { style: 'post' });   // world objects are followed every frame
 *   helm.hold('R', gripRightObject3D, { style: 'post' });
 *   // every frame (after the controls have moved):
 *   helm.update(dt);
 *
 * HIGH LEVEL API
 *   buildNavalCrewman({ role, outfit, seed, height, pose, skin, moustache, ...outfitOverrides }) -> fig
 *     role     'officer' | 'watchOfficer' | 'helmsman' | 'lookout' | 'talker' | 'telegraph' | 'navigator'
 *              | 'sailor' | 'deckhand' | 'signalman'. Picks the outfit and the starting pose (CREW_ROLES).
 *     outfit   a NAVAL_OUTFITS key (see below) or an options object; overrides the role's outfit.
 *     seed     integer: skin tone, hair, moustache, stature (1.70 to 1.86 m) and idle phases.
 *     height   stature in metres (overrides the seed's).
 *   fig.root      THREE.Group to place.  fig.mesh  the SkinnedMesh (castShadow / receiveShadow on).
 *   fig.bones     { hips, spine, chest, neck, head, upperArmL, forearmL, handL, ...R, thighL, shinL, footL,
 *                 ...R, binoc, pencil, fingersL, fingersR }.
 *   fig.anchors   { handL, handR (grip point inside each fist), carry, eyes (between the eyes, child of head) }.
 *   fig.setPose(name, { fade = 0.45 s, rate = 1, t }): cross-fades to a pose (see POSES) over `fade` seconds.
 *   fig.hold(side, target, opts)  keeps hand 'L' | 'R' on a control every frame, after the pose.
 *                 target: an Object3D (its world position is followed: a lever knob, a helm grip) or a
 *                 Vector3 in root space (the caller may mutate it every frame).
 *                 opts: { style: 'post' | 'knob' | 'rail' | 'flat' | 'button', fade = 0.35 s,
 *                 fingers, palm, pole (root space Vector3s overriding the style), curl (0 open .. 1.6 fist) }.
 *                 'post' grips a vertical handle (the helm), 'knob' and 'rail' an overhand grip of a lever
 *                 knob or horizontal bar, 'flat' rests the palm on a surface, 'button' presses with the fingers.
 *   fig.release(side, fade = 0.35)  lets go (the pose's own arm returns).
 *   fig.lookAt(target | null, weight = 1)  turns the head toward an Object3D or root space Vector3.
 *   fig.brace(seconds = 1.6)  a hit: braces (knees bent, head down) and then returns to the current pose;
 *                 holds stay on, so a helmsman keeps his grips.
 *   fig.update(dt, ctx?)  advances the pose phase, the cross-fade, idle motion (breathing, weight shift,
 *                 head turns and glances, with per-figure phases so a group is never in lockstep), then
 *                 solves the holds and the look. ctx is optional: { speed } (m/s, drives the walk phase so
 *                 the feet do not slide: move the root forward by the same distance yourself).
 *   fig.idle = false  turns idle motion off (fig.idle = true again to restore it).
 *   fig.dispose()  frees the skeleton's bone texture (never the shared geometry or material).
 *
 * LOW LEVEL (Drumfire's API, still available on every figure)
 *   fig.pose(name, t = 0, blend = 1)  sets the bones for pose `name` at phase t; blend < 1 moves that
 *                 fraction of the way from the current bones (cross-fade). Call update() OR pose(), not both.
 *   fig.reach(side, point, blend = 1, fingers?, palm?, pole?)  after pose(): two-bone IK of a hand's grip
 *                 point onto `point` (root space). fingers / palm orient the hand, pole is where the elbow points.
 *   buildCrewman(opts)  the figure without the naval presets.  crewGeometry(opts), crewMaterial().
 *
 * POSES (CREW_POSES; t in [0, 1) is one cycle of the pose's own motion)
 *   stand, attention, atEase (hands clasped behind the back), walk (CREW_GAITS.walk.stride per cycle),
 *   binoculars (raised to the eyes, scanning the horizon slowly), helm (both hands on two vertical grips
 *   0.44 m apart at 1.08 m, 0.40 m ahead; drive them with hold()), telegraph (right hand on a lever knob at
 *   (0.26, 1.12, -0.34); hold('R', knob, { style: 'knob' }) follows the moving lever), chart (leaning over a
 *   chart table 0.92 m high, left hand flat, right hand writing with a pencil), headset / phone (talker:
 *   left hand pressing the earphone, right hand on the chest microphone's switch), console (standing at a
 *   display, left hand on the edge at 1.0 m, right hand working the controls), operate (both hands on a
 *   panel at 1.1 m), rail (both hands on a guard rail 1.05 m high, 0.32 m ahead; hold() them onto the real rail),
 *   point, salute (Soviet style: right hand flat to the visor), brace (knees bent, hands
 *   forward low on a console edge; use hold() to put them on a rail), sit (on a seat 0.46 m high, root at
 *   the ground under the hips, hands on the knees).
 *
 * OUTFITS (NAVAL_OUTFITS; any key may be overridden: { outfit: 'rating', headgear: 'pilotka' })
 *   officer       furazhka, black tuzhurka (white shirt, black tie), gold sleeve rings, shoulder boards
 *   officerJunior the same, junior ranks (one stripe, plain visor)
 *   watchOfficer  furazhka, black officer's jacket with a fur collar, binoculars on the chest
 *   rating        bezkozyrka, blue working dress tucked in with the belt, telnyashka at the neck
 *   ratingPilotka the working dress with the black pilotka
 *   talker        pilotka, working dress, headset and chest microphone
 *   flannel       bezkozyrka, navy flannel jumper with the blue guyus collar
 *   bushlat       ushanka, black bushlat (cold weather deck watch)
 *   lookout       ushanka, bushlat, gloves, binoculars
 *   deckhand      ushanka, bushlat, gloves, orange life jacket
 *   deckhandCap   bezkozyrka, working dress, orange life jacket
 *   Options: headgear 'furazhka' | 'bezkozyrka' | 'ushanka' | 'pilotka' | 'none'; top 'tuzhurka' | 'kurtka'
 *   | 'roba' | 'flannel' | 'bushlat'; lifejacket, headset, binoculars, gloves (booleans); rank 'senior' |
 *   'junior' | 'rating'; skin 0..3; hair 0..3; moustache (boolean).
 *
 * STATIONS (root at the deck point where the man stands, rotation.y so that -Z faces the control)
 *   helmsman   stand 0.40 m behind the grips: buildNavalCrewman({ role: 'helmsman' }); then
 *              hold('L', gripL, { style: 'post' }), hold('R', gripR, { style: 'post' }) with gripL / gripR
 *              Object3Ds at the middle of each vertical handle (children of the turning grip parts).
 *   lookout    buildNavalCrewman({ role: 'lookout' }) needs nothing else: binoculars raised, scanning.
 *              Turn the root toward the sector he watches; lookAt() biases the head further.
 *   telegraph  stand 0.26 m to the left of and 0.34 m behind the knob: role 'telegraph', then
 *              hold('R', knobObject3D, { style: 'knob' }); the knob anchor rides on the lever's pivot.
 *   deck crew  role 'deckhand' (life jacket) or 'signalman'; setPose('rail') plus hold() onto rail points,
 *              setPose('walk') with update(dt, { speed }) while moving the root along -Z at that speed.
 *   The binoculars prop exists only on outfits with binoculars: true (watchOfficer, lookout); give any
 *   other outfit { binoculars: true } before using the binoculars pose.
 *
 * Keeping hands on moving controls: hold() with an Object3D placed at the grip point of the control (a child
 * of the lever, wheel or grip mesh) is enough; update() reads its world position each frame, so update the
 * controls before the crew. The figure's root must be in the scene graph (or at least have a parent chain)
 * for world targets; root-space Vector3 targets need nothing.
 *
 * Fog and lighting: a plain MeshStandardMaterial (vertex colours times a small procedural atlas for the
 * faces, the cap ribbon lettering and the battle number patch), so patchSceneFog(scene) patches figures
 * added before it runs. For figures added later: patchCrewMaterial(patchMaterial) once (shaderlib.js).
 */

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fract = (x) => x - Math.floor(x);
const gauss = (x, y) => Math.exp(-(x * x + y * y));

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// cheap deterministic hash noise for fur and cloth variation at build time
const hash3 = (x, y, z) => fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453);

// ---------------------------------------------------------------- skeleton (bind pose, model space)

export const CREW_BONES = ['hips', 'spine', 'chest', 'neck', 'head',
  'upperArmL', 'forearmL', 'handL', 'upperArmR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
  'binoc', 'pencil', 'fingersL', 'fingersR'];
const BI = Object.fromEntries(CREW_BONES.map((b, i) => [b, i]));
const PARENT = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  upperArmL: 'chest', forearmL: 'upperArmL', handL: 'forearmL', upperArmR: 'chest', forearmR: 'upperArmR', handR: 'forearmR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR',
  binoc: 'chest', pencil: 'handR', fingersL: 'handL', fingersR: 'handR',
};
const PBI = CREW_BONES.map((b) => PARENT[b] ? BI[PARENT[b]] : -1);
const L_TH = 0.425, L_SH = 0.415, L_UA = 0.295, L_FA = 0.26; // thigh, shin, upper arm, forearm (joint to joint)
const SH_X = 0.185, SH_Y = 1.445, SH_Z = 0.012, HIP_X = 0.092, HIP_Y = 0.93, ANKLE_Y = 0.09;
const WR_Y = SH_Y - L_UA - L_FA; // wrist height in the bind pose
const KN_Y = WR_Y - 0.095; // knuckles
// joint centres of a 1.78 m man standing straight, arms hanging (index 0 left, 1 right; SIDE -1 / +1)
const J = {
  hips: [0, 0.98, 0], spine: [0, 1.08, 0], chest: [0, 1.27, 0], neck: [0, 1.495, 0.012], head: [0, 1.6, 0.005],
  upperArmL: [-SH_X, SH_Y, SH_Z], forearmL: [-SH_X, SH_Y - L_UA, SH_Z], handL: [-SH_X, WR_Y, SH_Z],
  upperArmR: [SH_X, SH_Y, SH_Z], forearmR: [SH_X, SH_Y - L_UA, SH_Z], handR: [SH_X, WR_Y, SH_Z],
  thighL: [-HIP_X, HIP_Y, 0], shinL: [-HIP_X, HIP_Y - L_TH, 0], footL: [-HIP_X, ANKLE_Y, 0],
  thighR: [HIP_X, HIP_Y, 0], shinR: [HIP_X, HIP_Y - L_TH, 0], footR: [HIP_X, ANKLE_Y, 0],
  // props: the binoculars' eyepieces (barrels along -Z in the bone frame), the pencil at the right fist's grip
  binoc: [0, 1.25, -0.162], pencil: [SH_X - 0.032, WR_Y - 0.092, SH_Z],
  fingersL: [-SH_X, KN_Y, SH_Z], fingersR: [SH_X, KN_Y, SH_Z],
};
const SIDE = [-1, 1];
const SFX = ['L', 'R'];
const rel = (b) => { const p = PARENT[b], a = J[b]; return p ? new V3(a[0] - J[p][0], a[1] - J[p][1], a[2] - J[p][2]) : new V3(...a); };
const OFF = Object.fromEntries(CREW_BONES.map((b) => [b, rel(b)]));
// grip point in hand space: the inside of the curled fingers (the hand anchors sit here)
const GRIP = SIDE.map((s) => new V3(-0.032 * s, -0.092, 0));
// the binoculars' eyepieces in head space (just in front of the eyes)
const BINOC_EYES = new V3(0, 0.071, -0.112);

// ---------------------------------------------------------------- colours (sRGB hex)

const COL = {
  black: 0x1e2028, // naval black wool: a very dark blue-black
  blackLeg: 0x1c1d23,
  band: 0x111114, visor: 0x0b0b0d,
  roba: 0x435471, // the blue cotton working dress, a little faded
  flannel: 0x222c4a, guyus: 0x2d55a8,
  white: 0xeeeeea, shirt: 0xcfd1ce, tie: 0x131317,
  telWhite: 0xe8e9e5, telBlue: 0x1c2b63,
  gold: 0xcaa24a, goldDark: 0x9c7a32, brass: 0xb8923e, yellow: 0xd6b440,
  red: 0xb1251d, board: 0x15161b,
  orange: 0xe45a1b, tape: 0xdadad2,
  fur: 0x19191b, furCloth: 0x1f2026, furBrown: 0x2a2521,
  shoe: 0x111113, sole: 0x0b0b0b, glove: 0x161618,
  headset: 0x1b1b1c, mic: 0x34383a, binoc: 0x1d201f, lens: 0x3c5466, pencil: 0x8e2a1f,
  skin: [0xc2937a, 0xb08268, 0xcfa58c, 0x9c745a],
  hair: [0x3b2d21, 0x6a5236, 0x231b15, 0x8c7350],
};
const SKIN_EAR = 1.03; // ears a little redder: multiplier on red

// ---------------------------------------------------------------- the atlas (linear multipliers on the vertex colour)

const TEX = 512;
const WHITE_UV = [0.25, 0.3];
const FACE = [{ u0: 0.5, v0: 0.5, w: 0.5, h: 0.5 }, { u0: 0.0, v0: 0.5, w: 0.5, h: 0.5 }]; // clean shaven, moustache
const FX0 = -0.09, FY0 = 1.55, FS = 0.18; // the face window in model space: x, y, size (metres)
const RIBBON = { v0: 0.006, v1: 0.056, half: 0.1 }; // the cap ribbon: u 0..1 covers -half..half metres round the front
const PATCH = { u0: 0.02, u1: 0.23, v0: 0.07, v1: 0.118 }; // the battle number patch

let texture = null, material = null;
const geoCache = new Map();

// Face paint as a multiplier on the skin colour, from model-space (x, y) on the face.
function facePaint(x, y, moustache, out) {
  const ax = Math.abs(x);
  let r = 1, g = 1, b = 1;
  const mul = (k, kr = k, kg = k, kb = k) => { r *= kr; g *= kg; b *= kb; };
  const mix = (w, kr, kg, kb) => { r *= lerp(1, kr, w); g *= lerp(1, kg, w); b *= lerp(1, kb, w); };
  // eye sockets, then the almond of the eye a little lighter, the iris, the upper lid's lash line
  mix(gauss((ax - 0.034) / 0.021, (y - 1.672) / 0.013), 0.62, 0.55, 0.57);
  const ex = (ax - 0.034) / 0.0135, ey = (y - 1.6705) / 0.0052;
  const inEye = ex * ex + ey * ey;
  if (inEye < 1) {
    mul(1, 1.38, 1.5, 1.55); // undo most of the socket inside the eye
    const d = Math.hypot(ax - 0.0335, y - 1.6703);
    if (d < 0.0058) mul(1, 0.16, 0.15, 0.15);
    else if (d < 0.007) mul(1, 0.5, 0.46, 0.44);
  }
  const lid = 1.6705 + 0.0052 * Math.sqrt(Math.max(0, 1 - ex * ex));
  if (Math.abs(ex) < 1.12) mix(sstep(0.0028, 0.0009, Math.abs(y - lid)), 0.14, 0.12, 0.12);
  mix(sstep(0.0026, 0.001, Math.abs(y - (1.6705 - 0.0048 * Math.sqrt(Math.max(0, 1 - ex * ex))))) * (Math.abs(ex) < 0.9 ? 0.5 : 0), 0.7, 0.62, 0.6);
  // brows: thick arcs, thinning outward
  if (ax > 0.009 && ax < 0.06) {
    const k = (ax - 0.009) / 0.051, yb = 1.6875 + 0.0045 * Math.sin(Math.PI * Math.min(1, k * 1.25)) - 0.003 * k;
    const th = 0.0052 * (1 - 0.5 * k);
    mix(sstep(th, th * 0.4, Math.abs(y - yb)) * sstep(0, 0.12, k), 0.2, 0.17, 0.15);
  }
  // nose: shadow under the tip, nostrils, the wings
  mix(gauss(x / 0.013, (y - 1.624) / 0.004), 0.85, 0.78, 0.76);
  for (const s of SIDE) mix(gauss((x - s * 0.0088) / 0.0045, (y - 1.6265) / 0.0024), 0.38, 0.3, 0.29);
  for (const s of SIDE) mix(gauss((x - s * 0.018) / 0.004, (y - 1.629) / 0.006) * 0.6, 0.85, 0.8, 0.8);
  // nasolabial folds and the philtrum
  for (const s of SIDE) {
    const t = clamp((1.628 - y) / 0.03, 0, 1), fx = s * lerp(0.02, 0.029, t);
    if (y < 1.63 && y > 1.596) mix(gauss((x - fx) / 0.0025, 0) * 0.5, 0.86, 0.8, 0.8);
  }
  // mouth: lip line, upper and lower lips, the shadow under the lower lip
  const ym = 1.5985 + 0.0012 * (1 - (x / 0.024) ** 2);
  if (ax < 0.026) {
    const edge = sstep(0.026, 0.02, ax);
    mix(sstep(0.0019, 0.0005, Math.abs(y - ym)) * edge, 0.25, 0.17, 0.17);
    if (y > ym && y < ym + 0.0062) mix(edge * sstep(ym + 0.0062, ym + 0.004, y), 0.82, 0.6, 0.6);
    if (y < ym && y > ym - 0.0085) mix(edge * sstep(ym - 0.0085, ym - 0.005, y), 0.88, 0.68, 0.67);
  }
  mix(gauss(x / 0.016, (y - 1.587) / 0.003) * 0.6, 0.86, 0.82, 0.82);
  // cheeks a little warm, the jaw a little blue (shaved), the temples cooler
  for (const s of SIDE) mix(gauss((x - s * 0.046) / 0.017, (y - 1.632) / 0.014) * 0.6, 1, 0.9, 0.88);
  if (y < 1.612 && y > 1.566 && ax < 0.055) mix(sstep(1.612, 1.59, y) * sstep(1.566, 1.578, y) * sstep(0.004, 0.02, Math.abs(y - ym) + ax * 0.2) * 0.2, 0.92, 0.91, 0.96);
  // a full moustache over the whole upper lip, its ends drooping past the corners of the mouth
  if (moustache && ax < 0.034) {
    const k = ax / 0.034, top = 1.6185 - 0.007 * k * k, bot = ym + 0.0018 - 0.006 * k ** 3;
    if (y > bot && y < top) mix(sstep(top, top - 0.002, y) * sstep(bot, bot + 0.0015, y) * sstep(1, 0.85, k), 0.45, 0.37, 0.32);
  }
  out[0] = r; out[1] = g; out[2] = b;
}

function atlasTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = TEX;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, TEX, TEX);
  // faces: canvas row 0 is v = 1 (the texture is flipped on upload)
  const img = ctx.getImageData(0, 0, TEX, TEX), d = img.data, m = [1, 1, 1];
  for (let f = 0; f < 2; f++) {
    const F = FACE[f], x0 = Math.round(F.u0 * TEX), w = Math.round(F.w * TEX), y0 = Math.round((1 - F.v0 - F.h) * TEX), h = Math.round(F.h * TEX);
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const x = FX0 + ((px + 0.5) / w) * FS, y = FY0 + (1 - (py + 0.5) / h) * FS;
      facePaint(x, y, f === 1, m);
      const i = ((y0 + py) * TEX + x0 + px) * 4;
      d[i] = Math.round(clamp(m[0], 0, 1) * 255); d[i + 1] = Math.round(clamp(m[1], 0, 1) * 255); d[i + 2] = Math.round(clamp(m[2], 0, 1) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  // the ribbon: black with gold lettering (linear values: the texture is not decoded from sRGB)
  const ry0 = Math.floor((1 - RIBBON.v1) * TEX) - 2, ry1 = Math.ceil((1 - RIBBON.v0) * TEX) + 2;
  ctx.fillStyle = 'rgb(3,3,4)';
  ctx.fillRect(0, ry0, TEX, ry1 - ry0);
  const tmp = document.createElement('canvas');
  tmp.width = 640; tmp.height = 64;
  const tc = tmp.getContext('2d');
  tc.fillStyle = 'rgb(3,3,4)'; tc.fillRect(0, 0, 640, 64);
  tc.fillStyle = 'rgb(150,100,24)';
  tc.font = 'bold 52px "DejaVu Serif", Georgia, "Times New Roman", serif';
  tc.textAlign = 'center'; tc.textBaseline = 'middle';
  tc.fillText('СЕВЕРНЫЙ ФЛОТ', 320, 35, 630);
  // 0.13 m of lettering, 1.2 cm high, on the 0.2 m of ribbon round the front
  const tw = (0.13 / (2 * RIBBON.half)) * TEX, th = (ry1 - ry0) * 0.42;
  ctx.drawImage(tmp, (TEX - tw) / 2, (ry0 + ry1) / 2 - th / 2, tw, th);
  // the battle number on its white patch
  const px0 = PATCH.u0 * TEX, px1 = PATCH.u1 * TEX, py0 = (1 - PATCH.v1) * TEX, py1 = (1 - PATCH.v0) * TEX;
  ctx.fillStyle = '#fff'; ctx.fillRect(px0, py0, px1 - px0, py1 - py0);
  ctx.fillStyle = 'rgb(8,8,10)';
  ctx.font = 'bold 20px "DejaVu Sans", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('2-12-34', (px0 + px1) / 2, (py0 + py1) / 2 + 1, px1 - px0 - 8);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace; // linear multipliers on the vertex colour
  t.anisotropy = 4;
  return t;
}

/** The one material every figure shares (created on first use). */
export function crewMaterial() {
  if (!material) {
    if (!texture && typeof document !== 'undefined') texture = atlasTexture();
    material = new THREE.MeshStandardMaterial({ vertexColors: true, map: texture, roughness: 0.82, metalness: 0 });
    material.name = 'kirov-crew';
  }
  return material;
}

/** For figures built after patchSceneFog: pass shaderlib's patchMaterial. */
export function patchCrewMaterial(patchMaterial) {
  const m = crewMaterial();
  if (!m.userData.patched) patchMaterial(m, 'fog');
  return m;
}

// ---------------------------------------------------------------- geometry helpers (from Drumfire)

// Smooth solid through rings stacked along +Y; ring { y, rx, rz, cx, cz, ex (superellipse), dome }.
// UVs: around from the front in metres (u = 0 at the front), along Y. `mod(p)` may move vertices first.
function ringLoft(rings, n = 16, capBottom = false, capTop = false, mod = null) {
  const pos = [], uv = [], idx = [], cols = n + 1;
  for (const R of rings) {
    const e = 2 / (R.ex || 2), per = Math.PI * (R.rx + R.rz);
    for (let i = 0; i <= n; i++) {
      const a = Math.PI / 2 + (i / n) * TAU, c = Math.cos(a), s = Math.sin(a);
      pos.push((R.cx || 0) + Math.sign(c) * Math.abs(c) ** e * R.rx, R.y, (R.cz || 0) + Math.sign(s) * Math.abs(s) ** e * R.rz);
      uv.push((i / n - 0.5) * per, R.y);
    }
  }
  const at = (k, i) => k * cols + i;
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < n; i++) {
    idx.push(at(k, i), at(k + 1, i), at(k, i + 1), at(k, i + 1), at(k + 1, i), at(k + 1, i + 1));
  }
  const capTris = [];
  const cap = (k, up) => {
    const R = rings[k], c = pos.length / 3;
    pos.push(R.cx || 0, R.y + (up ? 1 : -1) * (R.dome || 0), R.cz || 0);
    uv.push(0, R.y);
    for (let i = 0; i < n; i++) capTris.push(...(up ? [at(k, i), c, at(k, i + 1)] : [at(k, i), at(k, i + 1), c]));
  };
  if (capBottom) cap(0, false);
  if (capTop) cap(rings.length - 1, true);
  const g = new THREE.BufferGeometry();
  const P = new THREE.Float32BufferAttribute(pos, 3);
  if (mod) { const p = new V3(); for (let i = 0; i < P.count; i++) { p.fromBufferAttribute(P, i); mod(p); P.setXYZ(i, p.x, p.y, p.z); } }
  g.setAttribute('position', P);
  g.setIndex(idx.concat(capTris));
  g.computeVertexNormals();
  const N = g.attributes.normal, a = new V3(), b = new V3();
  for (let k = 0; k < rings.length; k++) {
    a.fromBufferAttribute(N, at(k, 0)); b.fromBufferAttribute(N, at(k, n)); a.add(b).normalize();
    N.setXYZ(at(k, 0), a.x, a.y, a.z); N.setXYZ(at(k, n), a.x, a.y, a.z);
  }
  // split the caps off onto their own copies of the rim (sharp edge at the cap)
  const np = [...P.array], nn = [...N.array], remap = new Map(), ix = idx.slice();
  const capN = new V3();
  for (let j = 0; j < capTris.length; j++) {
    const v = capTris[j];
    let w = remap.get(v);
    if (w === undefined) {
      w = np.length / 3; np.push(P.getX(v), P.getY(v), P.getZ(v));
      const up = v >= cols * rings.length ? P.getY(v) > rings[0].y : P.getY(v) > (rings[0].y + rings[rings.length - 1].y) / 2;
      capN.set(N.getX(v), N.getY(v), N.getZ(v)).lerp(_upDown(up), 0.6).normalize();
      nn.push(capN.x, capN.y, capN.z); uv.push(uv[v * 2], uv[v * 2 + 1]); remap.set(v, w);
    }
    ix.push(w);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(np, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(ix);
  g.dispose();
  return out;
}
const _UP = new V3(0, 1, 0), _DOWN = new V3(0, -1, 0);
const _upDown = (up) => (up ? _UP : _DOWN);

// Surface of revolution about +Y through (x, y, z) from [dy, r] pairs listed bottom to top.
function lathe(prof, seg, x, y, z, sx = 1, sz = 1) {
  const g = new THREE.LatheGeometry(prof.map(([dy, r]) => new THREE.Vector2(Math.max(r, 1e-4), dy)), seg);
  return g.scale(sx, 1, sz).translate(x, y, z);
}

function ellipsoid(rx, ry, rz, x, y, z, w = 10, h = 7) {
  return new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz).translate(x, y, z);
}

function box(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  return xform(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
}

function cyl(r0, r1, h, seg, x, y, z, rx = 0, ry = 0, rz = 0) {
  return xform(new THREE.CylinderGeometry(r1, r0, h, seg), x, y, z, rx, ry, rz);
}

const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _e4 = new THREE.Euler(), _one = new V3(1, 1, 1), _p4 = new V3();
function xform(g, x, y, z, rx = 0, ry = 0, rz = 0) {
  return g.applyMatrix4(_m4.compose(_p4.set(x, y, z), _q4.setFromEuler(_e4.set(rx, ry, rz)), _one));
}

// a round cord through points (gold chin cords, headset bands, straps)
function cord(points, r, seg = 12, radial = 5) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new V3(...p)));
  return new THREE.TubeGeometry(curve, seg, r, radial, false);
}

// a flat disc facing -Z (badges, buttons), ellipse rx by ry, thickness t, at (x, y, z) tilted back by tilt
function disc(rx, ry, t, x, y, z, tilt = 0, seg = 8) {
  return xform(lathe([[0, 1], [t * 0.7, 0.92], [t, 0]], seg, 0, 0, 0).scale(rx, 1, ry), 0, 0, 0, -Math.PI / 2, 0, 0)
    .applyMatrix4(_m4.compose(_p4.set(x, y, z), _q4.setFromEuler(_e4.set(tilt, 0, 0)), _one));
}

// The front (or back) surface of a set of lofts at (x, y): the outermost of the pieces covering y.
function surfaceZ(sets, x, y, back) {
  let best = back ? -Infinity : Infinity;
  for (const rings of sets) {
    if (y < rings[0].y || y > rings[rings.length - 1].y) continue;
    let k = 0;
    while (k < rings.length - 2 && rings[k + 1].y < y) k++;
    const A = rings[k], B = rings[k + 1], t = (y - A.y) / Math.max(1e-6, B.y - A.y);
    const rx = lerp(A.rx, B.rx, t), rz = lerp(A.rz, B.rz, t), cz = lerp(A.cz || 0, B.cz || 0, t), ex = lerp(A.ex || 2, B.ex || 2, t);
    const q = Math.min(0.999, Math.abs(x / rx)), zz = rz * (1 - q ** ex) ** (1 / ex);
    const z = back ? cz + zz : cz - zz;
    best = back ? Math.max(best, z) : Math.min(best, z);
  }
  return Number.isFinite(best) ? best : 0;
}

// A patch lying on the body between x = xl(y) and xr(y) for y in [y0, y1], `off` proud of the surface.
function strip(sets, y0, y1, xl, xr, off, back = false, rows = 4, cols = 3) {
  const pos = [], idx = [], uv = [];
  for (let j = 0; j <= rows; j++) {
    const y = lerp(y0, y1, j / rows), a = xl(y), b = xr(y);
    for (let i = 0; i <= cols; i++) {
      const x = lerp(a, b, i / cols), z = surfaceZ(sets, x, y, back);
      pos.push(x, y, back ? z + off : z - off);
      uv.push(0, 0);
    }
  }
  const c = cols + 1;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * c + i, b = a + 1, d = a + c, e = d + 1;
    if (back) idx.push(a, b, d, b, e, d); else idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- the body, part by part

class Body {
  constructor(o) { this.o = o; this.list = []; this.sets = []; }
  // colour: hex or (x, y, z) => hex; uvf: null (flat colour) or (x, y, z, u, v) => [u, v] into the atlas
  add(g, bone, colour, uvf = null) {
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.clearGroups();
    const n = g.attributes.position.count, p = g.attributes.position, uv = g.attributes.uv;
    const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const h = typeof colour === 'function' ? colour(x, y, z) : colour;
      if (typeof h === 'number') c.setHex(h); else c.copy(h);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      si[i * 4] = BI[bone];
      sw[i * 4] = 1;
      if (uvf) { const r = uvf(x, y, z, uv.getX(i), uv.getY(i)); uv.setXY(i, r[0], r[1]); } else uv.setXY(i, WHITE_UV[0], WHITE_UV[1]);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    this.list.push(g.index ? g : g.setIndex([...Array(n).keys()]));
  }
  // a patch on the torso: split at the chest / spine / hips bone boundaries so every piece bends with its bone
  patch(y0, y1, xl, xr, off, colour, uvf = null, back = false, rows = 4, cols = 3) {
    const cuts = [[0, 1.0, 'hips'], [1.0, 1.2, 'spine'], [1.2, 9, 'chest']];
    for (const [a, b, bone] of cuts) {
      const lo = Math.max(y0, a), hi = Math.min(y1, b);
      if (hi - lo < 0.004) continue;
      const r = Math.max(1, Math.round(rows * (hi - lo) / (y1 - y0)));
      this.add(strip(this.sets, lo, hi, xl, xr, off, back, r, cols), bone, colour, uvf);
    }
  }
  // a small part sitting on the torso surface at (x, y), `off` proud
  onFront(g, x, y, off, bone, colour, uvf = null) {
    this.add(g.translate(x, y, surfaceZ(this.sets, x, y, false) - off), bone, colour, uvf);
  }
  geometry() {
    const g = mergeGeometries(this.list, false);
    for (const x of this.list) x.dispose();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const boneForY = (y) => (y >= 1.2 ? 'chest' : y >= 1.0 ? 'spine' : 'hips');

// UV mappers into the atlas
// Sides and back of the head go to the face window's blank top corners: a triangle between a side vertex
// and a back vertex then samples only the margin, and one across the back of the head only the top row.
const faceUV = (F) => (x, y, z) => {
  let u = clamp((x - FX0) / FS, 0.004, 0.996), v = clamp((y - FY0) / FS, 0.004, 0.996);
  if (z > -0.03) { u = x < 0 ? 0.004 : 0.996; v = 0.996; }
  return [F.u0 + u * F.w, F.v0 + v * F.h];
};
// ringLoft's u is metres round from the front, positive toward the figure's right (the viewer's left)
const ribbonUV = (y0, y1) => (x, y, z, u) => [clamp(0.5 - u / (2 * RIBBON.half), 0.002, 0.998), lerp(RIBBON.v0, RIBBON.v1, clamp((y - y0) / (y1 - y0), 0, 1))];
const patchUV = (x0, x1, y0, y1) => (x, y) => [lerp(PATCH.u0, PATCH.u1, clamp((x1 - x) / (x1 - x0), 0, 1)), lerp(PATCH.v0, PATCH.v1, clamp((y - y0) / (y1 - y0), 0, 1))];

// --- the head
const HEAD_RINGS = [
  [1.556, 0.03, 0.022, -0.068], [1.566, 0.047, 0.038, -0.056], [1.58, 0.0585, 0.061, -0.034], [1.598, 0.0655, 0.079, -0.017],
  [1.618, 0.0705, 0.089, -0.007], [1.64, 0.0725, 0.0965, 0.0], [1.662, 0.0765, 0.1005, 0.004], [1.686, 0.079, 0.1025, 0.006],
  [1.712, 0.0802, 0.1025, 0.008], [1.738, 0.0778, 0.0985, 0.01], [1.758, 0.0695, 0.0885, 0.012], [1.774, 0.054, 0.071, 0.013],
  [1.784, 0.03, 0.041, 0.013],
].map(([y, rx, rz, cz]) => ({ y, rx, rz, cz, ex: 2.15 }));
HEAD_RINGS[HEAD_RINGS.length - 1].dome = 0.004;

function headShape(p) {
  const front = sstep(-0.05, -0.088, p.z), ax = Math.abs(p.x);
  if (front <= 0) return;
  p.z += front * (
    0.0075 * gauss((ax - 0.034) / 0.016, (p.y - 1.671) / 0.0105) // eye sockets
    - 0.0045 * gauss(p.x / 0.05, (p.y - 1.689) / 0.008) // brow ridge
    - 0.004 * gauss((ax - 0.052) / 0.016, (p.y - 1.646) / 0.014) // cheekbones
    - 0.0035 * gauss(p.x / 0.026, (p.y - 1.6) / 0.011) // the mouth
    + 0.003 * gauss(p.x / 0.03, (p.y - 1.585) / 0.006) // under the lower lip
  );
}

function hairAt(x, y, z) {
  if (z < -0.055) return y > 1.738 - 0.04 * Math.max(0, Math.abs(x) - 0.04) / 0.04; // forehead hairline
  if (z < 0.004) return y > 1.7 - (Math.abs(x) > 0.066 ? 0.036 : 0); // temples, sideburns in front of the ears
  return y > 1.618; // back of the head down to the nape
}

function buildHead(B, o) {
  const skin = COL.skin[o.skin], hair = COL.hair[o.hair];
  const F = FACE[o.moustache ? 1 : 0], fuv = faceUV(F);
  B.add(ringLoft(HEAD_RINGS, 20, true, true, headShape), 'head', (x, y, z) => (hairAt(x, y, z) ? hair : skin), fuv);
  // nose: bridge to tip to the wings, cap underneath
  B.add(ringLoft([
    { y: 1.623, rx: 0.0152, rz: 0.009, cz: -0.093, dome: 0.001 },
    { y: 1.628, rx: 0.0156, rz: 0.0138, cz: -0.0985 },
    { y: 1.6355, rx: 0.0115, rz: 0.0152, cz: -0.1015 },
    { y: 1.648, rx: 0.0086, rz: 0.0126, cz: -0.0985 },
    { y: 1.662, rx: 0.0072, rz: 0.009, cz: -0.0945 },
    { y: 1.675, rx: 0.007, rz: 0.0055, cz: -0.0915 },
  ], 9, true, false), 'head', skin, fuv);
  B.add(ellipsoid(0.021, 0.0085, 0.0058, 0, 1.5975, -0.0925, 8, 4), 'head', skin, fuv); // lips
  B.add(ellipsoid(0.022, 0.011, 0.008, 0, 1.568, -0.085, 7, 4), 'head', skin, fuv); // chin
  const ear = new THREE.Color(skin); ear.r = Math.min(1, ear.r * SKIN_EAR); ear.g *= 0.94; ear.b *= 0.92;
  for (const s of SIDE) {
    B.add(xform(ellipsoid(0.0105, 0.03, 0.019, 0, 0, 0, 6, 5), s * 0.077, 1.659, 0.013, 0, s * 0.25, s * 0.08), 'head', ear);
    B.add(xform(ellipsoid(0.006, 0.019, 0.011, 0, 0, 0, 5, 3), s * 0.0835, 1.659, 0.012, 0, s * 0.25, s * 0.08), 'head', 0x8a5f50);
  }
  B.add(lathe([[-0.05, 0.059], [0.0, 0.057], [0.1, 0.053], [0.13, 0.05]], 10, 0, 1.495, 0.018), 'neck', skin);
}

// --- headgear (head bone)
function buildHeadgear(B, o) {
  const SG = 22;
  // caps sit on the upper forehead, clear of the brows: built at their reference height, then lifted
  const lift = { furazhka: 0.021, bezkozyrka: 0.022, pilotka: 0.0, ushanka: 0.01 }[o.headgear] || 0;
  const add = (g, bone, c, uvf) => { B.add(g, bone, c, uvf); g.translate(0, lift, 0); };
  if (o.headgear === 'furazhka') {
    // the large naval cap: a black band, the crown flaring to a wide oval top raised in front, the
    // lacquered visor, the gold chin cord and the officer's badge ("krab") on the band
    const raise = (p) => { p.y += 0.017 * sstep(0.02, -0.14, p.z) * sstep(1.738, 1.79, p.y); };
    add(ringLoft([{ y: 1.686, rx: 0.0905, rz: 0.1075, cz: 0.006 }, { y: 1.737, rx: 0.0925, rz: 0.1095, cz: 0.006 }], SG), 'head', COL.band);
    add(ringLoft([
      { y: 1.735, rx: 0.0915, rz: 0.1085, cz: 0.006 },
      { y: 1.752, rx: 0.101, rz: 0.12, cz: 0.004 },
      { y: 1.772, rx: 0.12, rz: 0.139, cz: 0.0 },
      { y: 1.788, rx: 0.1325, rz: 0.1495, cz: -0.003 },
      { y: 1.796, rx: 0.1335, rz: 0.1505, cz: -0.003 },
      { y: 1.801, rx: 0.127, rz: 0.144, cz: -0.003 },
      { y: 1.805, rx: 0.08, rz: 0.09, cz: -0.003, dome: 0.003 },
    ], SG, false, true, raise), 'head', o.whiteTop ? COL.white : COL.black);
    add(visor(0.0905, 0.1075, 0.064, 1.689, 0.018), 'head', (x, y, z) => (o.rank === 'senior' && z < -0.155 ? COL.gold : COL.visor));
    // chin cord: two gold cords across the front above the visor, a small button at each end
    for (const dy of [0.0, 0.0065]) {
      const pts = [];
      for (let i = 0; i <= 8; i++) { const a = lerp(-1.25, 1.25, i / 8); pts.push([Math.sin(a) * 0.0935, 1.6965 + dy, 0.006 - Math.cos(a) * 0.1105]); }
      add(cord(pts, 0.0021, 10, 3), 'head', COL.gold);
    }
    for (const s of SIDE) add(ellipsoid(0.005, 0.005, 0.005, s * Math.sin(1.25) * 0.0935, 1.7, 0.006 - Math.cos(1.25) * 0.1105, 6, 4), 'head', COL.gold);
    // the badge: a gold wreath round a black oval with the gold anchor, a red star above
    add(disc(0.03, 0.019, 0.004, 0, 1.716, -0.1035), 'head', COL.gold);
    add(disc(0.0115, 0.0135, 0.004, 0, 1.716, -0.106), 'head', COL.band);
    add(box(0.003, 0.014, 0.003, 0, 1.716, -0.1095), 'head', COL.gold);
    add(disc(0.0045, 0.0045, 0.002, 0, 1.7305, -0.107, 0, 5), 'head', COL.red);
  } else if (o.headgear === 'bezkozyrka') {
    // the rating's peakless cap: the ribbon round the band with its lettering, a flat crown wider
    // than the head with white piping, the cockade above the ribbon, the two tails behind
    const y0 = 1.684, y1 = 1.726;
    add(ringLoft([{ y: y0, rx: 0.0905, rz: 0.1072, cz: 0.006 }, { y: y1, rx: 0.0922, rz: 0.1088, cz: 0.006 }], SG), 'head', COL.white, ribbonUV(y0, y1));
    const raise = (p) => { p.y += 0.006 * sstep(0.02, -0.13, p.z) * sstep(1.728, 1.76, p.y); };
    add(ringLoft([
      { y: 1.724, rx: 0.0915, rz: 0.108, cz: 0.006 },
      { y: 1.742, rx: 0.109, rz: 0.122, cz: 0.004 },
      { y: 1.756, rx: 0.1255, rz: 0.137, cz: 0.003 },
      { y: 1.764, rx: 0.1275, rz: 0.139, cz: 0.003 },
      { y: 1.768, rx: 0.118, rz: 0.129, cz: 0.003 },
      { y: 1.771, rx: 0.06, rz: 0.066, cz: 0.003, dome: 0.002 },
    ], SG, false, true, raise), 'head', o.whiteTop ? COL.white : COL.black);
    add(ringLoft([{ y: 1.7585, rx: 0.1282, rz: 0.1397, cz: 0.003 }, { y: 1.7625, rx: 0.1286, rz: 0.1401, cz: 0.003 }], SG, false, false, raise), 'head', COL.white); // piping
    add(ringLoft([{ y: y0 - 0.002, rx: 0.0915, rz: 0.1082, cz: 0.006 }, { y: y0 + 0.004, rx: 0.0918, rz: 0.1085, cz: 0.006 }], SG), 'head', COL.band); // band edge
    add(disc(0.0165, 0.0145, 0.004, 0, 1.739, -0.1205, 0.6), 'head', COL.gold);
    add(disc(0.0085, 0.0085, 0.003, 0, 1.7395, -0.1235, 0.6, 5), 'head', COL.red);
    // ribbon tails: hanging from the back of the band, a gold anchor near each end
    // (about 0.26 m long, lying on the collar and the upper back)
    for (const s of SIDE) {
      const ang = s * 0.1, len = 0.26, tilt = 0.015;
      const cx = s * 0.016 - Math.sin(ang) * len * 0.5, cy = 1.7 - len * 0.5, cz = 0.121 + Math.sin(tilt) * len * 0.5;
      add(box(0.024, len, 0.003, cx, cy, cz, tilt, 0, ang), 'head', COL.band);
      add(box(0.011, 0.016, 0.0024, s * 0.016 - Math.sin(ang) * (len - 0.025), 1.7 - (len - 0.025), 0.1225 + Math.sin(tilt) * (len - 0.025), tilt, 0, ang), 'head', COL.gold);
    }
  } else if (o.headgear === 'ushanka') {
    // black fur ushanka with the ear flaps tied up over the crown, the front flap turned up, the cockade
    const furCol = (x, y, z) => { const n = hash3(x * 61, y * 67, z * 59); return n < 0.33 ? 0x141416 : n < 0.66 ? COL.fur : 0x232326; };
    const fluff = (amp) => (p) => {
      const r = Math.hypot(p.x, p.z - 0.006) || 1, n = hash3(Math.round(p.x * 400), Math.round(p.y * 400), Math.round(p.z * 400)) - 0.5;
      p.x += (p.x / r) * n * amp; p.z += ((p.z - 0.006) / r) * n * amp;
    };
    add(ringLoft([
      { y: 1.732, rx: 0.093, rz: 0.11, cz: 0.006 },
      { y: 1.775, rx: 0.095, rz: 0.111, cz: 0.006 },
      { y: 1.805, rx: 0.086, rz: 0.1, cz: 0.006 },
      { y: 1.818, rx: 0.06, rz: 0.07, cz: 0.006, dome: 0.006 },
    ], 18, false, true), 'head', COL.furCloth);
    add(ringLoft([
      { y: 1.664, rx: 0.098, rz: 0.115, cz: 0.008 },
      { y: 1.68, rx: 0.106, rz: 0.123, cz: 0.008 },
      { y: 1.715, rx: 0.109, rz: 0.126, cz: 0.008 },
      { y: 1.742, rx: 0.104, rz: 0.12, cz: 0.008 },
      { y: 1.75, rx: 0.094, rz: 0.11, cz: 0.008 },
    ], 18, false, false, fluff(0.006)), 'head', furCol);
    // ear flaps tied up: lying against the crown's sides, their tips meeting over the top
    for (const s of SIDE) add(xform(ellipsoid(0.017, 0.042, 0.088, 0, 0, 0, 8, 6), s * 0.092, 1.774, 0.01, 0, 0, -s * 0.14), 'head', furCol);
    add(cord([[-0.035, 1.816, 0.01], [0, 1.822, 0.008], [0.035, 1.816, 0.01]], 0.0022, 6, 3), 'head', COL.fur); // the tie
    add(xform(ellipsoid(0.094, 0.036, 0.02, 0, 0, 0, 12, 6), 0, 1.75, -0.113, -0.12, 0, 0), 'head', furCol); // front flap turned up
    add(disc(0.014, 0.0125, 0.004, 0, 1.755, -0.133, -0.12), 'head', COL.gold);
    add(disc(0.0075, 0.0075, 0.003, 0, 1.7555, -0.1365, -0.12, 5), 'head', COL.red);
  } else if (o.headgear === 'pilotka') {
    // the black side cap: tall and narrow, enclosing the crown of the head, the small cockade in front
    // a tent over the crown of the head: flat sides converging to a ridge, the front and back points higher
    const boat = (p) => { const e = Math.abs(p.z - 0.008) / 0.13; p.y += 0.014 * sstep(1.76, 1.81, p.y) * (e * e - 0.45); };
    add(ringLoft([
      { y: 1.716, rx: 0.0855, rz: 0.1115, cz: 0.008, ex: 2.3 },
      { y: 1.75, rx: 0.0845, rz: 0.117, cz: 0.008, ex: 2.6 },
      { y: 1.772, rx: 0.0745, rz: 0.122, cz: 0.008, ex: 3.2 },
      { y: 1.792, rx: 0.052, rz: 0.1255, cz: 0.008, ex: 4 },
      { y: 1.81, rx: 0.025, rz: 0.1275, cz: 0.008, ex: 4.5 },
      { y: 1.822, rx: 0.005, rz: 0.1265, cz: 0.008, ex: 4.5 },
    ], SG, false, true, boat), 'head', (x, y, z) => (y < 1.722 ? COL.band : COL.black));
    add(disc(0.0085, 0.0085, 0.003, 0, 1.748, -0.1175, 0.15, 5), 'head', COL.red);
    add(disc(0.012, 0.012, 0.002, 0, 1.748, -0.1165, 0.15), 'head', COL.gold);
  }
  if (o.headset) {
    // sound-powered telephone headset: band over the cap, two earphones
    const top = o.headgear === 'pilotka' ? 1.834 : o.headgear === 'none' ? 1.792 : o.headgear === 'ushanka' ? 1.836 : 1.8;
    const pts = [];
    for (let i = 0; i <= 10; i++) { const a = lerp(-1, 1, i / 10) * Math.PI / 2; pts.push([Math.sin(a) * 0.097, 1.67 + Math.cos(a) * (top - 1.67), 0.012]); }
    B.add(cord(pts, 0.004, 18, 5), 'head', COL.headset);
    for (const s of SIDE) {
      B.add(xform(lathe([[0, 0.034], [0.012, 0.035], [0.022, 0.026], [0.024, 0]], 12, 0, 0, 0), s * 0.084, 1.66, 0.012, 0, 0, -s * Math.PI / 2), 'head', COL.headset);
    }
  }
}

// The cap's visor: a curved peak round the front of the band, sloping down.
function visor(rx, rz, len, y, droop) {
  const pos = [], idx = [], uv = [], n = 12;
  const a0 = -Math.PI * 0.5 - 1.1, a1 = -Math.PI * 0.5 + 1.1;
  for (let i = 0; i <= n; i++) {
    const a = lerp(a0, a1, i / n), c = Math.cos(a), s = Math.sin(a), w = Math.sin((Math.PI * i) / n) ** 0.8;
    const ix = c * rx, iz = 0.006 + s * rz, ox = c * (rx + len * 0.85 * w), oz = 0.006 + s * (rz + len * w);
    for (const dy of [0.0035, -0.0015]) {
      pos.push(ix, y + dy, iz, ox, y - droop * w + dy, oz);
      uv.push(0, 0, 0, 0);
    }
  }
  for (let i = 0; i < n; i++) {
    const a = i * 4, b = a + 4;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
    idx.push(a + 2, b + 2, a + 3, b + 2, b + 3, a + 3);
    idx.push(a + 1, a + 3, b + 1, b + 1, a + 3, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// --- torso
function torsoRings(o) {
  const ex = 2.5;
  const R = (list) => list.map(([y, rx, rz, cz = 0]) => ({ y, rx, rz, cz, ex }));
  const coat = o.top === 'bushlat' || o.top === 'tuzhurka', tucked = o.top === 'roba' || o.top === 'flannel';
  const hem = o.top === 'bushlat' ? 0.73 : o.top === 'tuzhurka' ? 0.745 : o.top === 'kurtka' ? 0.86 : 0.765;
  const bulk = o.top === 'bushlat' ? 0.008 : o.top === 'kurtka' ? 0.01 : 0;
  const hips = R([
    [hem, 0.19 + (coat ? 0.006 : 0), 0.135 + (coat ? 0.006 : 0), 0.01],
    [0.84, 0.193, 0.137, 0.01], [0.93, 0.191, 0.134, 0.006],
    // tucked tops change colour between two close rings hidden under the belt
    ...(tucked ? [[0.976, 0.182, 0.128, 0.003], [0.98, 0.181, 0.127, 0.003]] : []),
    [1.01, tucked ? 0.177 : 0.183, tucked ? 0.124 : 0.127, 0.002], [1.08, 0.176, 0.122],
  ].map((r) => (r[0] > 0.8 && bulk ? [r[0], r[1] + bulk, r[2] + bulk, r[3]] : r)));
  hips[0].dome = 0.012;
  const spine = R([[0.99, 0.18 + bulk, 0.125 + bulk], [1.05, tucked ? 0.184 : 0.178 + bulk, tucked ? 0.129 : 0.124 + bulk], [1.16, 0.183 + bulk, 0.127 + bulk, -0.003], [1.23, 0.189 + bulk, 0.129 + bulk, -0.005]]);
  const chest = R([[1.15, 0.183 + bulk, 0.126 + bulk], [1.25, 0.191 + bulk, 0.131 + bulk, -0.007], [1.33, 0.197 + bulk, 0.133 + bulk, -0.01], [1.4, 0.198 + bulk, 0.127 + bulk, -0.006], [1.445, 0.189 + bulk * 0.6, 0.116 + bulk * 0.6, 0.002]]);
  chest.push({ y: 1.482, rx: 0.133, rz: 0.091, cz: 0.01 }, { y: 1.505, rx: 0.072, rz: 0.066, cz: 0.014 });
  return { hips, spine, chest, hem };
}

function buildTorso(B, o) {
  const T = torsoRings(o), top = o.topColour, leg = o.legColour;
  const tucked = o.top === 'roba' || o.top === 'flannel';
  const SG = 18;
  B.sets.push(T.hips, T.spine, T.chest);
  B.add(ringLoft(T.hips, SG, true, false), 'hips', tucked ? (x, y) => (y > 0.978 ? top : leg) : top);
  B.add(ringLoft(T.spine, SG), 'spine', top);
  B.add(ringLoft(T.chest, SG, false, true), 'chest', top);
  for (const s of SIDE) B.add(ellipsoid(0.052, 0.048, 0.058, s * 0.17, 1.418, 0.01, 8, 6), 'chest', top); // shoulders
  const ex = 2.5;
  if (tucked) {
    // the black belt with its brass buckle (anchor and star)
    B.add(ringLoft([{ y: 0.972, rx: 0.1835, rz: 0.1295, ex }, { y: 1.018, rx: 0.1835, rz: 0.1295, ex }], SG), 'hips', COL.shoe);
    B.add(box(0.062, 0.05, 0.008, 0, 0.995, -0.128), 'hips', COL.brass);
    B.add(box(0.004, 0.03, 0.004, 0, 0.993, -0.133), 'hips', COL.goldDark);
    B.add(box(0.02, 0.004, 0.004, 0, 1.004, -0.133), 'hips', COL.goldDark);
  }
  const V = (yTop, yBot, wTop) => (y) => wTop * clamp((y - yBot) / (yTop - yBot), 0, 1);
  if (o.top === 'tuzhurka') {
    // open lapels over the white shirt and black tie, double-breasted below (2 x 3 gold buttons)
    const vw = V(1.47, 1.25, 0.046);
    B.patch(1.25, 1.475, (y) => -vw(y) - 0.002, (y) => vw(y) + 0.002, 0.002, (x, y) => COL.shirt, null, false, 6, 4);
    B.patch(1.255, 1.462, (y) => -0.0125 * clamp((y - 1.235) / 0.2, 0.55, 1), (y) => 0.0125 * clamp((y - 1.235) / 0.2, 0.55, 1), 0.0045, COL.tie, null, false, 4, 2);
    B.onFront(ellipsoid(0.0095, 0.009, 0.006, 0, 0, 0, 6, 4), 0, 1.459, 0.007, 'chest', COL.tie); // the knot
    for (const s of SIDE) {
      const lw = (y) => 0.02 + 0.036 * Math.sin(Math.PI * clamp((y - 1.235) / 0.26, 0, 1)) ** 0.8;
      B.patch(1.235, 1.48, s < 0 ? (y) => -vw(y) - lw(y) : (y) => vw(y), s < 0 ? (y) => -vw(y) : (y) => vw(y) + lw(y), 0.0055, COL.black, null, false, 6, 3);
      for (const y of [1.205, 1.105, 1.005]) B.onFront(disc(0.0085, 0.0085, 0.004, 0, 0, 0, 0, 6), s * 0.072, y, 0.006, boneForY(y), COL.gold);
      B.onFront(box(0.13, 0.014, 0.012, 0, 0, 0, 0, 0, 0), s * 0.11, 0.87, 0.004, 'hips', COL.black); // pocket flaps
    }
    B.onFront(box(0.1, 0.008, 0.008, 0, 0, 0, 0, 0, 0.12), -0.095, 1.35, 0.004, 'chest', COL.black); // breast pocket welt
    B.add(lathe([[0.0, 0.08], [0.045, 0.079], [0.06, 0.073]], 16, 0, 1.47, 0.02, 1, 0.95), 'chest', COL.black); // collar
    B.add(lathe([[0.0, 0.066], [0.03, 0.064]], 14, 0, 1.478, 0.012, 1, 0.95), 'chest', COL.shirt); // shirt collar
  } else if (o.top === 'roba' || o.top === 'flannel') {
    // V neck showing the telnyashka (stripes as separate strips so the colours stay sharp)
    const vBot = 1.355, vTop = 1.478, vw = V(vTop, vBot, 0.058);
    const stripe = 0.0165, blue = 0.0055;
    for (let y = vBot; y < vTop; y += stripe) {
      B.patch(y, Math.min(vTop, y + stripe - blue), (yy) => -vw(yy) - 0.004, (yy) => vw(yy) + 0.004, 0.0015, COL.telWhite, null, false, 1, 3);
      if (y + stripe - blue < vTop) B.patch(y + stripe - blue, Math.min(vTop, y + stripe), (yy) => -vw(yy) - 0.004, (yy) => vw(yy) + 0.004, 0.0015, COL.telBlue, null, false, 1, 3);
    }
    for (const s of SIDE) {
      const cw = 0.026;
      if (o.top === 'flannel') {
        // the guyus' front ends along the V: blue with three white lines
        B.patch(vBot, 1.49, s < 0 ? (y) => -vw(y) - cw : (y) => vw(y), s < 0 ? (y) => -vw(y) : (y) => vw(y) + cw, 0.005,
          (x, y) => COL.guyus, null, false, 5, 2);
        for (const k of [0.006, 0.0115, 0.017]) B.patch(vBot + k, 1.485, s < 0 ? (y) => -vw(y) - cw + k : (y) => vw(y) + cw - k - 0.0025, s < 0 ? (y) => -vw(y) - cw + k + 0.0025 : (y) => vw(y) + cw - k, 0.0058, COL.white, null, false, 5, 1);
      } else {
        // the working jumper's narrow turn-down collar along the V
        B.patch(vBot, vTop + 0.01, s < 0 ? (y) => -vw(y) - cw * 0.7 : (y) => vw(y), s < 0 ? (y) => -vw(y) : (y) => vw(y) + cw * 0.7, 0.005, top, null, false, 5, 2);
      }
    }
    B.add(lathe([[0.0, 0.079], [0.035, 0.077], [0.045, 0.07]], 16, 0, 1.468, 0.02, 1, 0.95), 'chest', o.top === 'flannel' ? COL.guyus : top);
    if (o.top === 'flannel') {
      // the guyus square on the back, white lines along its edges
      B.patch(1.3, 1.485, () => -0.142, () => 0.142, 0.004, COL.guyus, null, true, 4, 6);
      for (const k of [0.008, 0.0145, 0.021]) {
        B.patch(1.3 + k, 1.3 + k + 0.003, () => -0.142 + k, () => 0.142 - k, 0.0052, COL.white, null, true, 1, 6);
        for (const s of SIDE) B.patch(1.3 + k, 1.485, s < 0 ? () => -0.142 + k : () => 0.142 - k - 0.003, s < 0 ? () => -0.142 + k + 0.003 : () => 0.142 - k, 0.0052, COL.white, null, true, 3, 1);
      }
    } else {
      // battle number patch on the left breast
      B.patch(1.315, 1.343, () => -0.135, () => -0.055, 0.003, COL.white, patchUV(-0.135, -0.055, 1.315, 1.343), false, 1, 4);
    }
  } else if (o.top === 'bushlat') {
    // the black pea coat: wide collar and lapels buttoned high, 2 x 5 gold anchor buttons, slanted pockets
    const vw = V(1.49, 1.37, 0.05), tw = V(1.49, 1.43, 0.034);
    B.patch(1.37, 1.49, (y) => -vw(y) - 0.002, (y) => vw(y) + 0.002, 0.002, COL.flannel, null, false, 3, 3);
    for (let y = 1.43; y < 1.48; y += 0.0165) {
      B.patch(y, y + 0.011, (yy) => -tw(yy) - 0.003, (yy) => tw(yy) + 0.003, 0.003, COL.telWhite, null, false, 1, 2);
      B.patch(y + 0.011, y + 0.0165, (yy) => -tw(yy) - 0.003, (yy) => tw(yy) + 0.003, 0.003, COL.telBlue, null, false, 1, 2);
    }
    for (const s of SIDE) {
      const lw = (y) => 0.03 + 0.065 * Math.sin(Math.PI * clamp((y - 1.33) / 0.18, 0, 1)) ** 0.6;
      B.patch(1.33, 1.5, s < 0 ? (y) => -vw(y) - lw(y) : (y) => vw(y), s < 0 ? (y) => -vw(y) : (y) => vw(y) + lw(y), 0.007, COL.black, null, false, 6, 3);
      for (let k = 0; k < 5; k++) { const y = 1.315 - k * 0.095; B.onFront(disc(0.0095, 0.0095, 0.0045, 0, 0, 0, 0, 6), s * 0.078, y, 0.006, boneForY(y), COL.gold); }
      B.onFront(box(0.012, 0.13, 0.01, 0, 0, 0, 0, 0, -s * 0.35), s * 0.13, 0.9, 0.003, 'hips', COL.blackLeg); // pocket welts
    }
    B.add(lathe([[0.0, 0.085], [0.05, 0.088], [0.075, 0.084]], 12, 0, 1.455, 0.024, 1, 0.97), 'chest', COL.black); // collar, standing a little
  } else if (o.top === 'kurtka') {
    // officer's black jacket: zip front, knitted waistband and cuffs, a dark fur collar
    B.patch(0.87, 1.45, () => -0.003, () => 0.003, 0.002, 0x272930, null, false, 8, 1);
    B.add(ringLoft([{ y: 0.855, rx: 0.192, rz: 0.137, ex, cz: 0.008 }, { y: 0.905, rx: 0.19, rz: 0.135, ex, cz: 0.007 }], SG), 'hips', 0x16171b);
    B.add(lathe([[-0.01, 0.086], [0.012, 0.106], [0.05, 0.108], [0.078, 0.086]], 16, 0, 1.45, 0.022, 1, 0.97), 'chest', (x, y, z) => (hash3(x * 80, y * 80, z * 80) > 0.5 ? 0x3d3530 : 0x2c2622));
    for (const s of SIDE) B.onFront(box(0.012, 0.15, 0.01, 0, 0, 0, 0, 0, -s * 0.3), s * 0.12, 1.08, 0.004, 'spine', 0x15161a);
  }
  // shoulder boards
  for (const s of SIDE) {
    const sx = s * 0.128, sy = 1.474, tilt = -s * 0.2;
    const place = (g, dx, dy) => B.add(xform(g, sx + dx * Math.cos(tilt), sy + 0.003 + dy + dx * Math.sin(tilt), 0.008, 0, 0, tilt), 'chest', g.userData.c);
    const piece = (g, c) => { g.userData.c = c; return g; };
    if (o.rank === 'senior' || o.rank === 'junior') {
      place(piece(new THREE.BoxGeometry(0.125, 0.008, 0.05), COL.board), 0, 0);
      const lines = o.rank === 'senior' ? [-0.009, 0.009] : [0];
      for (const lz of lines) B.add(xform(new THREE.BoxGeometry(0.115, 0.003, 0.0035), sx, sy + 0.0075, 0.008 + lz, 0, 0, tilt), 'chest', COL.gold);
      const stars = o.rank === 'senior' ? [[-0.03, 0], [0.0, -0.016], [0.0, 0.016]] : [[-0.035, 0.012], [-0.005, -0.012], [0.025, 0.012], [-0.005, 0.012]];
      for (const [dx, dz] of stars) B.add(xform(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 5), sx + dx * Math.cos(tilt), sy + 0.008 + dx * Math.sin(tilt), 0.008 + dz, 0, 0, tilt), 'chest', COL.gold);
      B.add(xform(new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 8), sx - s * 0.055, sy + 0.009 - s * 0.055 * Math.sin(tilt), 0.008, 0, 0, tilt), 'chest', COL.gold); // button
    } else if (o.top === 'bushlat' || o.top === 'flannel') {
      // ratings: black boards with the yellow letters of the fleet (СФ)
      place(piece(new THREE.BoxGeometry(0.12, 0.008, 0.048), COL.board), 0, 0);
      for (const [dx, w] of [[-0.012, 0.014], [0.012, 0.016]]) B.add(xform(new THREE.BoxGeometry(w, 0.003, 0.02), sx + s * dx, sy + 0.0075 + s * dx * Math.sin(tilt), 0.008, 0, 0, tilt), 'chest', COL.yellow);
    }
  }
  // life jacket: an orange canvas vest over everything, a pillow collar behind the neck, white ties
  if (o.lifejacket) {
    const lj = (rings) => rings.map(([y, rx, rz, cz = 0]) => ({ y, rx, rz, cz, ex: 3 }));
    const b = o.top === 'bushlat' ? 0.012 : 0;
    const seam = (x, y, z) => (Math.abs(x) < 0.004 && z < 0 ? 0xc84a14 : COL.orange);
    B.add(ringLoft(lj([[1.04, 0.212 + b, 0.152 + b, 0.0], [1.1, 0.214 + b, 0.154 + b, -0.002], [1.2, 0.214 + b, 0.156 + b, -0.004]]), 14, true, false), 'spine', seam);
    B.add(ringLoft(lj([[1.19, 0.214 + b, 0.156 + b, -0.004], [1.3, 0.218 + b, 0.16 + b, -0.008], [1.4, 0.214 + b, 0.152 + b, -0.006], [1.45, 0.19 + b, 0.135 + b, 0.0], [1.485, 0.14, 0.104, 0.01]]), 14, false, false), 'chest', seam);
    B.add(xform(ellipsoid(0.115, 0.055, 0.05, 0, 0, 0, 12, 7), 0, 1.515, 0.06, 0.35, 0, 0), 'chest', COL.orange);
    for (const s of SIDE) B.add(xform(ellipsoid(0.05, 0.03, 0.08, 0, 0, 0, 8, 5), s * 0.09, 1.488, -0.02, 0, 0, s * 0.3), 'chest', COL.orange);
    for (const y of [1.12, 1.24]) B.add(box(0.07, 0.012, 0.006, 0, y, -0.16 - b - (y > 1.2 ? 0.006 : 0)), boneForY(y), COL.tape);
  }
  // binoculars hanging at the chest are a prop on their own bone, see buildProps
}

// --- arms and hands
function buildArms(B, o) {
  const top = o.topColour, AS = 9;
  for (const s of SIDE) {
    const sf = SFX[SIDE.indexOf(s)], x = s * SH_X;
    const bulk = o.top === 'bushlat' || o.top === 'kurtka' ? 1.08 : 1;
    B.add(lathe([[-0.345, 0], [-0.33, 0.042], [-0.28, 0.05], [-0.14, 0.054], [-0.05, 0.056], [0.0, 0.052], [0.03, 0.036], [0.044, 0]].map(([d, r]) => [d, r * bulk]), AS, x, SH_Y, SH_Z, 1, 1.06), 'upperArm' + sf, top);
    const ey = SH_Y - L_UA;
    B.add(lathe([[-0.262, 0], [-0.252, 0.045], [-0.2, 0.047], [-0.08, 0.052], [0.0, 0.054], [0.032, 0.04], [0.048, 0]].map(([d, r]) => [d, r * bulk]), AS, x, ey, SH_Z, 1, 1.06), 'forearm' + sf, top);
    // cuffs: officers' gold rings, the jacket's knitted cuffs
    if (o.top === 'tuzhurka') {
      const rings = o.rank === 'senior' ? [[-0.225, 0.012], [-0.207, 0.005], [-0.197, 0.005], [-0.187, 0.005]] : [[-0.222, 0.005], [-0.21, 0.005]];
      for (const [d, w] of rings) B.add(lathe([[d - w / 2, 0.0495], [d + w / 2, 0.0495]], AS, x, ey, SH_Z, 1, 1.06), 'forearm' + sf, COL.gold);
    } else if (o.top === 'kurtka') {
      B.add(lathe([[-0.262, 0.04], [-0.255, 0.045], [-0.225, 0.046], [-0.22, 0.0]], AS, x, ey, SH_Z, 1, 1.06), 'forearm' + sf, 0x16171b);
    }
    // hand: wrist and palm on the hand bone, the fingers on their own bone so they can open or close
    const hc = o.gloves ? COL.glove : COL.skin[o.skin];
    B.add(lathe([[-0.034, 0.029], [-0.026, 0.035], [0.012, 0.034], [0.022, 0.029]], 7, x, WR_Y, SH_Z), 'hand' + sf, hc);
    B.add(ellipsoid(0.021, 0.05, 0.043, x, WR_Y - 0.05, SH_Z, 7, 5), 'hand' + sf, hc); // palm
    B.add(xform(ellipsoid(0.0135, 0.031, 0.0145, 0, 0, 0, 5, 4), x - s * 0.012, WR_Y - 0.055, SH_Z - 0.04, 0.35, 0, -s * 0.35), 'hand' + sf, hc); // thumb
    // fingers: a slightly curled mitt of four fingers from the knuckles
    // (the proximal part reaches back over the knuckle and a knuckle roll sits on the palm, so the joint stays closed)
    B.add(ellipsoid(0.0175, 0.017, 0.041, x - s * 0.002, KN_Y + 0.006, SH_Z + 0.001, 5, 3), 'hand' + sf, hc);
    B.add(ellipsoid(0.0135, 0.032, 0.039, x - s * 0.001, KN_Y - 0.016, SH_Z + 0.001, 6, 4), 'fingers' + sf, hc);
    B.add(xform(ellipsoid(0.0115, 0.024, 0.035, 0, 0, 0, 6, 4), x - s * 0.008, KN_Y - 0.05, SH_Z + 0.002, 0, 0, -s * 0.42), 'fingers' + sf, hc);
  }
}

// --- legs: straight navy trousers over low black boots or shoes
function buildLegs(B, o) {
  const leg = o.legColour, AS = 8;
  for (const s of SIDE) {
    const sf = SFX[SIDE.indexOf(s)], x = s * HIP_X;
    B.add(lathe([[-0.48, 0], [-0.462, 0.058], [-0.425, 0.074], [-0.33, 0.083], [-0.18, 0.093], [-0.06, 0.099], [0.02, 0.097], [0.065, 0.064], [0.085, 0]], AS, x, HIP_Y, -0.004, 1, 1.06), 'thigh' + sf, leg);
    const ky = HIP_Y - L_TH;
    // trousers to the instep, a little flared, over the boot
    B.add(lathe([[-0.43, 0], [-0.428, 0.066], [-0.38, 0.063], [-0.22, 0.06], [-0.08, 0.068], [0.0, 0.072], [0.04, 0.058], [0.062, 0]], AS, x, ky, 0.004, 1, 1.08), 'shin' + sf, leg);
    B.add(lathe([[-0.025, 0.05], [0.03, 0.051], [0.06, 0.05], [0.065, 0.0]], 8, x, ANKLE_Y, 0.008, 1, 1.12), 'shin' + sf, COL.shoe);
    B.add(ringLoft([
      { y: -0.08, rx: 0.03, rz: 0.03, cz: 0.045, ex: 2.5, dome: 0.008 },
      { y: -0.066, rx: 0.042, rz: 0.046, cz: 0.05, ex: 2.5 },
      { y: -0.02, rx: 0.047, rz: 0.056, cz: 0.06, ex: 2.5 },
      { y: 0.03, rx: 0.051, rz: 0.055, cz: 0.056, ex: 2.5 },
      { y: 0.09, rx: 0.053, rz: 0.043, cz: 0.044, ex: 2.5 },
      { y: 0.15, rx: 0.052, rz: 0.035, cz: 0.034, ex: 2.5 },
      { y: 0.195, rx: 0.046, rz: 0.03, cz: 0.03, ex: 2.5 },
      { y: 0.224, rx: 0.032, rz: 0.023, cz: 0.026, dome: 0.008 },
    ], 8, true, true, (p) => { if (p.z < 0) p.z = 0; }).rotateX(-Math.PI / 2).translate(x, 0, 0), 'foot' + sf, (px, py) => (py < 0.022 ? COL.sole : COL.shoe));
  }
}

// --- props on their own bones
function buildProps(B, o) {
  if (o.binoculars) {
    // 7x50 binoculars in the binoc bone's frame: eyepieces at the bone, barrels along -Z
    const [bx, by, bz] = J.binoc, g = [];
    for (const s of SIDE) {
      const x = bx + s * 0.034;
      const barrel = lathe([[0, 0.016], [0.02, 0.022], [0.075, 0.025], [0.088, 0.03], [0.166, 0.03], [0.17, 0.0]], 8, 0, 0, 0);
      g.push([xform(barrel, x, by, bz, -Math.PI / 2, 0, 0), COL.binoc]);
      g.push([box(0.046, 0.05, 0.06, x + s * 0.008, by - 0.004, bz - 0.05), COL.binoc]); // prism housing
      g.push([disc(0.024, 0.024, 0.002, x, by, bz - 0.171), COL.lens]);
      g.push([lathe([[0, 0.0175], [0.014, 0.0185], [0.016, 0]], 8, 0, 0, 0).rotateX(Math.PI / 2).translate(x, by, bz + 0.012), COL.headset]); // eyecups
    }
    g.push([cyl(0.009, 0.009, 0.05, 8, bx, by + 0.006, bz - 0.03, 0, 0, Math.PI / 2), COL.binoc]); // hinge
    g.push([cyl(0.008, 0.008, 0.02, 8, bx, by + 0.02, bz - 0.02), COL.mic]); // focus wheel
    for (const [geo, c] of g) B.add(geo, 'binoc', c);
  }
  // the pencil through the right fist, along the grip axis
  const [px, py, pz] = J.pencil;
  B.add(cyl(0.0035, 0.0035, 0.15, 6, px, py, pz + 0.01, Math.PI / 2, 0, 0), 'pencil', COL.pencil);
  B.add(cyl(0.0035, 0.0006, 0.018, 6, px, py, pz - 0.074, -Math.PI / 2, 0, 0), 'pencil', 0xd9c09a);
  // the talker's chest microphone: a plate with a mouthpiece horn, on a neck strap
  if (o.headset) {
    const z = surfaceZ(B.sets, 0, 1.33, false);
    const lj = o.lifejacket ? -0.03 : 0;
    B.add(box(0.075, 0.07, 0.03, 0, 1.33, z - 0.016 + lj), 'chest', COL.mic);
    B.add(xform(lathe([[0, 0.012], [0.03, 0.016], [0.045, 0.024], [0.05, 0]], 10, 0, 0, 0), 0, 1.36, z - 0.035 + lj, -0.6, 0, 0), 'chest', COL.headset);
    B.add(box(0.018, 0.012, 0.01, 0.03, 1.31, z - 0.033 + lj), 'chest', COL.headset); // press-to-talk switch
    for (const s of SIDE) B.add(cord([[s * 0.03, 1.36, z - 0.01 + lj], [s * 0.06, 1.44, -0.08], [s * 0.065, 1.5, 0.0]], 0.0035, 8, 4), 'chest', COL.headset);
  }
}

function buildGeometry(o) {
  const B = new Body(o);
  buildTorso(B, o);
  buildHead(B, o);
  buildHeadgear(B, o);
  buildArms(B, o);
  buildLegs(B, o);
  buildProps(B, o);
  return B.geometry();
}

// ---------------------------------------------------------------- outfits and roles

export const NAVAL_OUTFITS = {
  officer: { headgear: 'furazhka', top: 'tuzhurka', rank: 'senior' },
  officerJunior: { headgear: 'furazhka', top: 'tuzhurka', rank: 'junior' },
  watchOfficer: { headgear: 'furazhka', top: 'kurtka', rank: 'junior', binoculars: true },
  rating: { headgear: 'bezkozyrka', top: 'roba', rank: 'rating' },
  ratingPilotka: { headgear: 'pilotka', top: 'roba', rank: 'rating' },
  talker: { headgear: 'pilotka', top: 'roba', rank: 'rating', headset: true },
  flannel: { headgear: 'bezkozyrka', top: 'flannel', rank: 'rating' },
  bushlat: { headgear: 'ushanka', top: 'bushlat', rank: 'rating' },
  lookout: { headgear: 'ushanka', top: 'bushlat', rank: 'rating', gloves: true, binoculars: true },
  deckhand: { headgear: 'ushanka', top: 'bushlat', rank: 'rating', gloves: true, lifejacket: true },
  deckhandCap: { headgear: 'bezkozyrka', top: 'roba', rank: 'rating', lifejacket: true },
};

// role -> outfit and the pose it starts in
export const CREW_ROLES = {
  officer: { outfit: 'officer', pose: 'atEase' },
  watchOfficer: { outfit: 'watchOfficer', pose: 'binoculars' },
  helmsman: { outfit: 'rating', pose: 'helm' },
  lookout: { outfit: 'lookout', pose: 'binoculars' },
  signalman: { outfit: 'bushlat', pose: 'stand' },
  talker: { outfit: 'talker', pose: 'headset' },
  telegraph: { outfit: 'ratingPilotka', pose: 'telegraph' },
  navigator: { outfit: 'officerJunior', pose: 'chart' },
  sailor: { outfit: 'rating', pose: 'console' },
  deckhand: { outfit: 'deckhand', pose: 'stand' },
};

function options(opts) {
  let base = {};
  if (typeof opts.outfit === 'string') base = NAVAL_OUTFITS[opts.outfit] || {};
  else if (opts.outfit && typeof opts.outfit === 'object') base = opts.outfit;
  const src = { ...base, ...opts };
  const o = {
    headgear: src.headgear || 'none',
    top: ['tuzhurka', 'kurtka', 'roba', 'flannel', 'bushlat'].includes(src.top) ? src.top : 'roba',
    rank: src.rank || (src.top === 'tuzhurka' || src.top === 'kurtka' ? 'junior' : 'rating'),
    lifejacket: !!src.lifejacket, headset: !!src.headset, binoculars: !!src.binoculars, gloves: !!src.gloves,
    whiteTop: !!src.whiteTop,
    skin: Math.abs(Math.floor(src.skin ?? 0)) % 4,
    hair: Math.abs(Math.floor(src.hair ?? src.skin ?? 0)) % 4,
    moustache: !!src.moustache,
  };
  o.topColour = o.top === 'roba' ? COL.roba : o.top === 'flannel' ? COL.flannel : COL.black;
  o.legColour = o.top === 'roba' ? COL.roba : COL.blackLeg;
  o.key = ['headgear', 'top', 'rank', 'lifejacket', 'headset', 'binoculars', 'gloves', 'whiteTop', 'skin', 'hair', 'moustache'].map((k) => o[k]).join('|');
  return o;
}

export function crewGeometry(opts = {}) {
  const o = options(opts);
  if (!geoCache.has(o.key)) geoCache.set(o.key, buildGeometry(o));
  return geoCache.get(o.key);
}

/** Triangle count of an outfit's shared geometry. */
export function crewTriangles(opts = {}) {
  const g = crewGeometry(typeof opts === 'string' ? { outfit: opts } : opts);
  return g.index.count / 3;
}

export function buildCrewman(opts = {}) {
  const o = options(opts);
  const geo = crewGeometry(o);
  const bones = {}, list = [];
  for (const name of CREW_BONES) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.copy(OFF[name]);
    if (PARENT[name]) bones[PARENT[name]].add(b);
    bones[name] = b;
    list.push(b);
  }
  const mesh = new THREE.SkinnedMesh(geo, crewMaterial());
  mesh.name = 'crewman';
  mesh.add(bones.hips);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(list));
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.boundingSphere = new THREE.Sphere(new V3(0, 1.0, -0.1), 1.35); // covers every pose
  const root = new THREE.Group();
  root.name = 'crew';
  root.add(mesh);
  if (opts.height) root.scale.setScalar(opts.height / 1.78);
  const handL = new THREE.Object3D(), handR = new THREE.Object3D(), carry = new THREE.Object3D(), eyes = new THREE.Object3D();
  handL.name = 'handL'; handR.name = 'handR'; carry.name = 'carry'; eyes.name = 'eyes';
  handL.position.copy(GRIP[0]); handR.position.copy(GRIP[1]); eyes.position.set(0, 0.0705, -0.09);
  bones.handL.add(handL); bones.handR.add(handR); bones.head.add(eyes); root.add(carry);
  const fig = {
    root, mesh, bones, anchors: { handL, handR, carry, eyes }, grip: opts.grip ?? 0.2, outfit: o,
    groundSlope: { x: 0, z: 0 },
    pose: (name, t = 0, blend = 1) => solvePose(fig, name, t, blend),
    reach: (side, point, blend = 1, fingers = null, palm = null, pole = null) => reach(fig, side, point, blend, fingers, palm, pole),
    dispose: () => mesh.skeleton.dispose(),
  };
  fig.pose('stand', 0, 1);
  return fig;
}

// ---------------------------------------------------------------- the naval figure with its driver

const HOLD_STYLES = {
  // fingers, palm (given for the right hand, mirrored for the left), elbow pole, finger curl
  post: { fingers: [0, -0.25, -1], palm: [-1, 0, 0], pole: [0.55, -1, 0.25], curl: 1.45 },
  knob: { fingers: [0, -0.7, -1], palm: [0, -1, 0.1], pole: [0.6, -1, 0.15], curl: 1.25 },
  rail: { fingers: [0, -0.6, -1], palm: [0, -1, 0.2], pole: [0.7, -1, 0.2], curl: 1.45 },
  flat: { fingers: [0, -0.2, -1], palm: [0, -1, 0], pole: [0.6, -1, 0.3], curl: 0.08 },
  button: { fingers: [0, -0.55, -1], palm: [0, -1, 0.3], pole: [0.6, -1, 0.3], curl: 0.45 },
};

const PERIOD = { walk: 0.98, binoculars: 14, helm: 7, chart: 3.2, console: 3, operate: 3, brace: 0.5, telegraph: 6, headset: 5, phone: 5, salute: 4, point: 4 };
// idle weights per pose: breathing, weight shift, head turns
const IDLE = {
  stand: [1, 1, 1], attention: [0.4, 0.15, 0.15], atEase: [1, 0.9, 1], walk: [0.4, 0, 0.35], binoculars: [0.6, 0.35, 0],
  helm: [0.7, 0.35, 0.7], telegraph: [0.8, 0.6, 1], chart: [0.6, 0.15, 0.25], headset: [1, 0.8, 0.9], phone: [1, 0.8, 0.9],
  console: [0.8, 0.45, 0.6], operate: [0.8, 0.45, 0.6], rail: [1, 0.5, 1], point: [0.6, 0.2, 0.1], salute: [0.4, 0.05, 0], brace: [0, 0, 0], sit: [1, 0, 1],
};

export function buildNavalCrewman(opts = {}) {
  const role = CREW_ROLES[opts.role] ? opts.role : 'sailor';
  const R = CREW_ROLES[role], seed = Math.floor(opts.seed ?? 1);
  const r = rng(seed * 7919 + 13);
  const skin = opts.skin ?? [0, 0, 2, 1, 0, 2, 3, 1][Math.floor(r() * 8)];
  const hair = opts.hair ?? Math.floor(r() * 4);
  const officer = /officer|navigator/.test(role);
  const moustache = opts.moustache ?? r() < (officer ? 0.3 : 0.18);
  const height = opts.height ?? 1.7 + r() * 0.16;
  const outfit = opts.outfit ?? R.outfit;
  const fig = buildCrewman({ ...opts, outfit, skin, hair, moustache, height });
  fig.role = role;
  fig.seed = seed;
  const st = fig._st = {
    pose: opts.pose || R.pose, t: r(), rate: 1, fade: 0, base: opts.pose || R.pose, braceT: 0,
    holds: [null, null], look: null, lookW: 0, lookTarget: 0, lookP: new V3(),
  };
  // per-figure idle state (phases from the seed, a deterministic random stream for the glances)
  const I = fig._idle = {
    on: true, time: 0, breath: 0, sway: 0, look: 0, up: 0, glance: 0, glanceTo: 0, next: 1 + r() * 4,
    p: [r() * TAU, r() * TAU, r() * TAU, r() * TAU, r() * TAU], breathRate: 0.22 + r() * 0.06, rand: rng(seed * 104729 + 7),
  };
  Object.defineProperty(fig, 'idle', { get: () => I.on, set: (v) => { I.on = !!v; } });
  fig.setPose = (name, o2 = {}) => {
    if (st.braceT > 0) { st.base = name; return fig; }
    if (name !== st.pose) { st.pose = name; st.fade = o2.fade ?? 0.45; }
    st.base = name;
    if (o2.rate != null) st.rate = o2.rate;
    if (o2.t != null) st.t = o2.t;
    return fig;
  };
  fig.hold = (side, target, o2 = {}) => {
    const i = side === 'L' || side === 0 ? 0 : 1, s = SIDE[i];
    const style = HOLD_STYLES[o2.style] || HOLD_STYLES.post;
    const mirror = (a, out) => out.set(a[0] * (a === style.pole || a === style.palm ? s : 1), a[1], a[2]);
    const h = st.holds[i] || { target: null, w: 0, fade: 0.35, release: false, p: new V3(), fingers: new V3(), palm: new V3(), pole: new V3(), curl: 1 };
    h.target = target; h.release = false; h.fade = Math.max(1e-3, o2.fade ?? 0.35);
    if (o2.fingers) h.fingers.copy(o2.fingers); else mirror(style.fingers, h.fingers);
    if (o2.palm) h.palm.copy(o2.palm); else mirror(style.palm, h.palm);
    if (o2.pole) h.pole.copy(o2.pole); else mirror(style.pole, h.pole);
    h.curl = o2.curl ?? style.curl;
    if (o2.fade === 0) h.w = 1;
    st.holds[i] = h;
    return fig;
  };
  fig.release = (side, fade = 0.35) => {
    const h = st.holds[side === 'L' || side === 0 ? 0 : 1];
    if (h) { h.release = true; h.fade = Math.max(1e-3, fade); }
    return fig;
  };
  fig.lookAt = (target, weight = 1) => { if (target) st.look = target; st.lookTarget = target ? weight : 0; return fig; };
  fig.brace = (seconds = 1.6) => {
    if (st.braceT <= 0) { st.base = st.pose; st.pose = 'brace'; st.fade = 0.15; }
    st.braceT = Math.max(st.braceT, seconds);
    return fig;
  };
  fig.update = (dt, ctx = null) => updateFigure(fig, dt, ctx);
  fig.update(0);
  fig.pose(st.pose, st.t, 1);
  return fig;
}

function updateFigure(fig, dt, ctx) {
  const st = fig._st, I = fig._idle;
  dt = Math.max(0, Math.min(dt, 0.1));
  if (st.braceT > 0) {
    st.braceT -= dt;
    if (st.braceT <= 0) { st.pose = st.base; st.fade = 0.7; }
  }
  // phase: the walk is driven by distance when a speed is given, everything else by time
  if (st.pose === 'walk' && ctx && ctx.speed != null) st.t = fract(st.t + (dt * ctx.speed) / CREW_GAITS.walk.stride);
  else st.t = fract(st.t + (dt * st.rate) / (PERIOD[st.pose] || 4.2));
  // idle signals
  I.time += dt;
  const T = I.time, P = I.p;
  I.breath = Math.sin(TAU * I.breathRate * T + P[0]);
  I.sway = 0.65 * Math.sin(0.23 * T + P[1]) + 0.35 * Math.sin(0.083 * T + P[2]);
  I.next -= dt;
  if (I.next <= 0) { I.glanceTo = (I.rand() - 0.5) * (I.rand() < 0.25 ? 1.4 : 0.6); I.next = 2.5 + I.rand() * 6; }
  I.glance += (I.glanceTo - I.glance) * (1 - Math.exp(-dt * 3));
  I.look = 0.12 * Math.sin(0.17 * T + P[3]) + I.glance;
  I.up = 0.04 * Math.sin(0.13 * T + P[4]);
  // look target in root space
  st.lookW += (st.lookTarget - st.lookW) * (1 - Math.exp(-dt * 4));
  if (st.lookW > 1e-3 && st.look) resolveTarget(fig, st.look, st.lookP);
  // the pose, cross-faded: each frame covers dt of the remaining fade time
  let k = 1;
  if (st.fade > 0) { k = dt > 0 ? clamp(dt / st.fade, 0, 1) : 0; st.fade = Math.max(0, st.fade - dt); }
  if (k > 0) solvePose(fig, st.pose, st.t, k);
  // holds after the pose
  for (let i = 0; i < 2; i++) {
    const h = st.holds[i];
    if (!h) continue;
    h.w = clamp(h.w + (h.release ? -dt : dt) / h.fade, 0, 1);
    if (h.release && h.w <= 0) { st.holds[i] = null; continue; }
    if (h.w <= 0) continue;
    resolveTarget(fig, h.target, h.p);
    const w = sstep(0, 1, h.w);
    reach(fig, i, h.p, w, h.fingers, h.palm, h.pole);
    setCurl(fig.mesh.skeleton.bones[19 + i], i, h.curl, w);
  }
}

const _wq = new THREE.Quaternion();
function resolveTarget(fig, target, out) {
  if (target && target.isObject3D) {
    target.getWorldPosition(out);
    fig.mesh.updateWorldMatrix(true, false);
    out.applyMatrix4(_m4.copy(fig.mesh.matrixWorld).invert());
  } else if (target) out.copy(target);
  return out;
}

function setCurl(bone, i, curl, w) {
  _wq.setFromAxisAngle(ZAXIS, -SIDE[i] * curl);
  bone.quaternion.slerp(_wq, w);
}

// ---------------------------------------------------------------- poses

export const CREW_POSES = ['stand', 'attention', 'atEase', 'walk', 'binoculars', 'helm', 'telegraph', 'chart', 'headset', 'phone', 'console', 'operate', 'rail', 'point', 'salute', 'brace', 'sit'];
export const CREW_GAITS = { walk: { stride: 1.25, period: 0.98 } };

// The pose specification each pose function fills in (root space unless noted). Torso angles are
// Euler 'YXZ' with x < 0 leaning forward; feet: ankle target, rotation (x > 0 toe up), knee pole;
// arms: FK angles (ua: x forward, z outward for the right arm; fa: elbow flexion) or IK onto a grip
// point with the hand's finger and palm directions and the elbow's pole; `on` attaches the grip to a
// frame: null (root), 'head', 'hips', 'chest' or 'binoc'. curl closes the fingers (0 open, 1.5 a fist).
function makeSpec() {
  const foot = () => ({ ankle: new V3(), rot: new THREE.Euler(0, 0, 0, 'YXZ'), pole: new V3() });
  const arm = () => ({ ik: false, on: null, ua: new THREE.Euler(), fa: 0, hand: new THREE.Euler(), grip: new V3(), fingers: new V3(), palm: new V3(), pole: new V3(), curl: 0.5 });
  return {
    hips: new V3(), hipsRot: new THREE.Euler(0, 0, 0, 'YXZ'), spine: new THREE.Euler(0, 0, 0, 'YXZ'), chest: new THREE.Euler(0, 0, 0, 'YXZ'),
    neck: new THREE.Euler(0, 0, 0, 'YXZ'), head: new THREE.Euler(0, 0, 0, 'YXZ'), shrug: [0, 0], feet: [foot(), foot()], arms: [arm(), arm()],
    binoc: 0, pencil: 0,
  };
}
const S = makeSpec();

function reset(S) {
  S.hips.set(0, 0.972, 0);
  S.hipsRot.set(0, 0, 0); S.spine.set(0, 0, 0); S.chest.set(0, 0, 0); S.neck.set(0, 0, 0); S.head.set(0, 0, 0);
  S.shrug[0] = S.shrug[1] = 0;
  S.binoc = 0; S.pencil = 0;
  for (let i = 0; i < 2; i++) {
    const s = SIDE[i], f = S.feet[i], a = S.arms[i];
    f.ankle.set(s * 0.115, ANKLE_Y, 0); f.rot.set(0, -s * 0.12, 0); f.pole.set(s * 0.15, 0, -1);
    a.ik = false; a.on = null; a.ua.set(0.03, 0, s * 0.1); a.fa = 0.2; a.hand.set(0, 0, 0); a.curl = 0.8;
  }
}

// Ankle of a foot whose flat ankle would be at (x, z), pitched by p (> 0 toe up), lifted by `lift`.
const SOLE = [[0.08, 0.015], [0.066, 0.002], [0.02, 0], [-0.03, 0], [-0.09, 0], [-0.15, 0], [-0.195, 0], [-0.224, 0.002]];
function ankleAt(out, x, z, p, lift, yaw = 0) {
  const c = Math.cos(p), s = Math.sin(p);
  let y = -Infinity, pivotZ = 0, pivotY = 0;
  for (const pt of SOLE) {
    const support = (ANKLE_Y - pt[1]) * c + pt[0] * s;
    if (support > y) { y = support; pivotZ = pt[0]; pivotY = pt[1]; }
  }
  const dz = pivotZ * (1 - c) + (ANKLE_Y - pivotY) * s;
  out.set(x + Math.sin(yaw) * dz, y + lift, z + Math.cos(yaw) * dz);
  return out;
}

// One foot of a walking gait at its own phase: stance (heel strike, flat, heel off) then swing.
function gaitFoot(f, ph, stride, duty, x, yaw, lift) {
  const A = (stride * duty) / 2;
  let z, p, l = 0;
  if (ph < duty) {
    const k = ph / duty;
    z = -A + 2 * A * k;
    p = 0.22 * (1 - sstep(0, 0.18, k)) - 0.48 * sstep(0.7, 1, k);
  } else {
    const k = (ph - duty) / (1 - duty);
    z = A * (1 - 2 * sstep(0, 1, k)) + stride * (1 - duty) * k * (1 - k) * (1 - 2 * k);
    p = lerp(-0.48, 0.22, sstep(0, 0.82, k));
    l = lift * Math.sin(Math.PI * k) ** 2;
  }
  ankleAt(f.ankle, x, z, p, l, yaw);
  f.rot.set(p, yaw, 0);
}

function setIK(a, gx, gy, gz, fx, fy, fz, nx, ny, nz, px, py, pz, curl = 1.4, on = null) {
  a.ik = true; a.on = on; a.curl = curl;
  a.grip.set(gx, gy, gz); a.fingers.set(fx, fy, fz); a.palm.set(nx, ny, nz); a.pole.set(px, py, pz);
}

function walkLegs(S, t, stride, duty, hy, bob, lift) {
  const c = Math.cos(TAU * t), c2 = Math.cos(2 * TAU * t), sn = Math.sin(TAU * t);
  S.hips.set(-0.035 * sn, hy - bob * c2, -0.008);
  S.hipsRot.set(-0.035, -0.065 * c, -0.025 * sn);
  S.spine.set(-0.015, 0.035 * c, 0.018 * sn);
  S.chest.set(0.0, 0.06 * c, 0.012 * sn);
  S.neck.set(0.03, -0.03 * c, 0);
  S.head.set(-0.03 + 0.015 * c2, 0, 0);
  for (let i = 0; i < 2; i++) {
    const s = SIDE[i];
    gaitFoot(S.feet[i], fract(t + (i ? 0.5 : 0)), stride, duty, s * 0.105, -s * 0.08, lift);
    S.feet[i].pole.set(s * 0.12, 0, -1);
  }
  return c;
}

const feet = (S, lx, lz, rx, rz, ly = 0.12, ry = 0.12) => {
  S.feet[0].ankle.set(lx, ANKLE_Y, lz); S.feet[0].rot.set(0, ly, 0);
  S.feet[1].ankle.set(rx, ANKLE_Y, rz); S.feet[1].rot.set(0, -ry, 0);
};

const POSES = {
  stand(S, t) {
    const b = Math.sin(TAU * t);
    S.hips.set(0.012, 0.972, 0.004);
    S.hipsRot.set(0, 0.02, 0.02);
    S.spine.set(-0.02, 0, -0.012);
    S.chest.set(0.02 + 0.006 * b, -0.02, -0.01);
    S.neck.set(0.05, 0, 0); S.head.set(-0.05, 0.03, 0.01);
    feet(S, -0.125, 0.02, 0.115, -0.02);
    for (let i = 0; i < 2; i++) { const s = SIDE[i], a = S.arms[i]; a.ua.set(0.04, 0, s * 0.11); a.fa = 0.22; a.hand.set(0.05, 0, s * 0.06); a.curl = 0.8; }
  },
  attention(S) {
    S.hips.set(0, 0.975, 0.0);
    S.spine.set(0.0, 0, 0); S.chest.set(0.03, 0, 0); S.neck.set(0.02, 0, 0); S.head.set(-0.04, 0, 0);
    feet(S, -0.06, 0.0, 0.06, 0.0, 0.38, 0.38);
    for (let i = 0; i < 2; i++) { const s = SIDE[i], a = S.arms[i]; a.ua.set(0.0, 0, s * 0.07); a.fa = 0.06; a.hand.set(0, 0, s * 0.02); a.curl = 0.35; }
  },
  // hands clasped behind the back, weight on the left leg (an officer on the bridge)
  atEase(S) {
    S.hips.set(-0.018, 0.968, 0.006);
    S.hipsRot.set(0.01, 0.0, -0.025);
    S.spine.set(0.0, 0, 0.012); S.chest.set(0.035, 0, 0.01); S.neck.set(0.02, 0, 0); S.head.set(-0.04, 0, 0);
    S.shrug[0] = S.shrug[1] = -0.005;
    feet(S, -0.14, 0.0, 0.15, -0.03, 0.2, 0.25);
    setIK(S.arms[0], -0.035, 0.03, 0.182, 0.45, -1, 0.25, 0.2, 0, 1, -0.55, -0.3, 1, 0.9, 'hips');
    setIK(S.arms[1], 0.02, 0.055, 0.19, -0.6, -1, 0.1, -0.4, 0.1, 1, 0.55, -0.3, 1, 1.2, 'hips');
  },
  walk(S, t) {
    const c = walkLegs(S, t, CREW_GAITS.walk.stride, 0.6, 0.944, 0.022, 0.075);
    for (let i = 0; i < 2; i++) {
      const s = SIDE[i], a = S.arms[i], sw = s * 0.36 * c;
      a.ua.set(sw, 0, s * 0.1); a.fa = 0.28 + 0.22 * Math.max(0, sw / 0.36); a.hand.set(0.1, 0, s * 0.05); a.curl = 0.7;
    }
  },
  // binoculars at the eyes, elbows out and down, scanning slowly across the horizon (t: one sweep and back)
  binoculars(S, t) {
    const sweep = Math.sin(TAU * t), dwell = sweep * (0.75 + 0.25 * Math.cos(2 * TAU * t));
    S.hips.set(0.0, 0.968, 0.01);
    S.hipsRot.set(0.0, 0.1 * dwell, 0);
    S.spine.set(0.02, 0.1 * dwell, 0); S.chest.set(0.03, 0.12 * dwell, 0);
    S.neck.set(0.02, 0.12 * dwell, 0); S.head.set(-0.03, 0.12 * dwell, 0);
    S.shrug[0] = S.shrug[1] = 0.012;
    feet(S, -0.16, 0.02, 0.16, -0.04, 0.22, 0.26);
    S.binoc = 1;
    for (let i = 0; i < 2; i++) {
      const s = SIDE[i];
      setIK(S.arms[i], s * 0.036, -0.004, -0.085, -s * 0.15, 1, -0.3, -s, 0, 0, s * 0.8, -1, 0.1, 1.35, 'binoc');
    }
  },
  // both hands on two vertical grips (the helm's chrome handles), standing square to the console
  helm(S, t) {
    const b = Math.sin(TAU * t);
    S.hips.set(0.0, 0.962, 0.03);
    S.hipsRot.set(-0.04, 0, 0);
    S.spine.set(-0.04, 0, 0); S.chest.set(-0.02 + 0.006 * b, 0.0, 0); S.neck.set(0.06, 0, 0); S.head.set(-0.04, 0, 0);
    feet(S, -0.15, 0.04, 0.15, 0.02, 0.15, 0.15);
    for (let i = 0; i < 2; i++) {
      const s = SIDE[i];
      setIK(S.arms[i], s * 0.22, 1.08 + 0.005 * Math.sin(TAU * t * 2 + i), -0.4, 0, -0.25, -1, -s, 0, 0, s * 0.55, -1, 0.25, 1.45);
    }
  },
  // right hand on the telegraph lever's knob, half turned to it, the left hand resting at the side
  telegraph(S, t) {
    S.hips.set(0.02, 0.966, 0.02);
    S.hipsRot.set(-0.02, -0.18, 0.01);
    S.spine.set(-0.04, -0.06, 0.02); S.chest.set(-0.03, -0.05, 0.0); S.neck.set(0.1, 0.12, 0); S.head.set(0.08, 0.1, 0);
    feet(S, -0.12, 0.0, 0.16, -0.06, 0.3, 0.05);
    setIK(S.arms[1], 0.26, 1.12, -0.34, 0, -0.7, -1, 0, -1, 0.1, 0.6, -1, 0.15, 1.25);
    const a = S.arms[0];
    a.ua.set(0.05, 0, -0.12); a.fa = 0.3; a.hand.set(0.05, 0, -0.06); a.curl = 0.6;
  },
  // leaning over a chart table 0.92 m high: left hand flat on the chart, right hand writing with the pencil
  chart(S, t) {
    const w = Math.sin(TAU * t * 3), drift = Math.sin(TAU * t);
    S.hips.set(0.0, 0.95, 0.09);
    S.hipsRot.set(-0.28, 0.04, 0);
    S.spine.set(-0.2, 0.03, 0); S.chest.set(-0.12, 0.05, 0); S.neck.set(0.12, 0, 0); S.head.set(-0.05, 0.06, 0);
    feet(S, -0.15, 0.06, 0.15, 0.02, 0.2, 0.2);
    S.pencil = 1;
    setIK(S.arms[0], -0.2, 0.955, -0.45, 0.15, -0.2, -1, 0, -1, 0, -0.6, -1, 0.3, 0.12);
    setIK(S.arms[1], 0.1 + 0.03 * drift + 0.006 * w, 0.955 + 0.003 * Math.max(0, w), -0.42 - 0.01 * drift, -0.4, -0.55, -1, 0.1, -1, 0.3, 0.7, -1, 0.3, 1.35);
  },
  // the talker: left hand pressing the earphone, right hand on the chest microphone's switch
  headset(S, t) {
    const b = Math.sin(TAU * t);
    S.hips.set(0.008, 0.97, 0.02);
    S.hipsRot.set(0, 0.06, 0.015);
    S.spine.set(-0.03, 0, 0); S.chest.set(-0.02, 0.03, 0); S.neck.set(0.1, 0, 0.04); S.head.set(0.06, -0.05 + 0.04 * b, 0.06);
    feet(S, -0.14, 0.02, 0.13, -0.02);
    setIK(S.arms[0], -0.112, 0.06, 0.008, 0.25, 1, 0.1, 1, 0, 0, -0.5, -1, -0.15, 0.25, 'head');
    setIK(S.arms[1], 0.045, 0.045, -0.2, -0.5, -0.6, -1, 0, -1, 0.3, 0.8, -1, 0.1, 1.2, 'chest');
  },
  phone(S, t) { POSES.headset(S, t); },
  // standing at a display: left hand on the console edge, right hand working the controls
  console(S, t) {
    const a = TAU * t, press = Math.max(0, Math.sin(a * 2)) ** 4;
    S.hips.set(0.0, 0.966, 0.04);
    S.hipsRot.set(-0.05, 0.02, 0);
    S.spine.set(-0.06, 0, 0); S.chest.set(-0.04, 0.02 * Math.sin(a), 0); S.neck.set(0.14, 0, 0); S.head.set(0.1, 0.05 * Math.sin(a * 0.5), 0);
    feet(S, -0.14, 0.03, 0.13, -0.02);
    setIK(S.arms[0], -0.22, 1.0, -0.36, 0.1, -0.4, -1, 0, -1, 0, -0.6, -1, 0.3, 0.9);
    setIK(S.arms[1], 0.12 + 0.04 * Math.sin(a), 1.035 - 0.01 * press, -0.42, -0.15, -0.6, -1, 0, -1, 0.3, 0.7, -1, 0.3, 0.5);
  },
  operate(S, t) {
    const a = TAU * t;
    S.hips.set(0.0, 0.968, 0.04);
    S.hipsRot.set(-0.03, 0, 0);
    S.spine.set(-0.05, 0, 0); S.chest.set(-0.04, 0.02 * Math.sin(a), 0); S.neck.set(0.14, 0, 0); S.head.set(0.18, 0.04 * Math.sin(a * 0.5), 0);
    feet(S, -0.13, 0.02, 0.13, -0.02);
    const pr = Math.max(0, Math.sin(a * 2)) ** 4;
    setIK(S.arms[0], -0.15 + 0.01 * Math.sin(a), 1.11, -0.42, 0.1, -0.45, -1, 0, -1, 0.45, -0.7, -0.6, 0.6, 1.0);
    setIK(S.arms[1], 0.13, 1.115 - 0.012 * pr, -0.43, -0.05, -0.55, -1, 0, -1, 0.55, 0.7, -0.6, 0.6, 0.6);
  },
  point(S, t) {
    const b = Math.sin(TAU * t);
    S.hips.set(0.0, 0.97, 0.0);
    S.hipsRot.set(0.0, -0.2, 0.0);
    S.spine.set(0.0, -0.1, 0); S.chest.set(0.0, -0.15, 0); S.neck.set(0.0, 0.2, 0); S.head.set(-0.08, 0.28, 0);
    feet(S, -0.18, 0.03, 0.17, -0.1, 0.12, 0.3);
    setIK(S.arms[1], 0.2 + 0.01 * b, 1.46, -0.66, 0, 0.1, -1, -1, 0, 0, 0.7, -0.3, 0.5, 0.15);
    const a = S.arms[0];
    a.ua.set(0.04, 0, -0.12); a.fa = 0.25; a.hand.set(0.05, 0, -0.05); a.curl = 0.6;
  },
  // Soviet salute: right hand flat, fingers together at the visor's right edge, elbow at shoulder height
  salute(S) {
    S.hips.set(0, 0.975, 0.0);
    S.spine.set(0.0, 0, 0); S.chest.set(0.03, 0, 0); S.neck.set(0.02, 0, 0); S.head.set(-0.04, 0, 0);
    feet(S, -0.06, 0.0, 0.06, 0.0, 0.38, 0.38);
    setIK(S.arms[1], 0.135, 0.085, -0.075, -1, 0.15, -0.45, 0, -1, 0.35, 1, 0.1, -0.2, -0.05, 'head');
    const a = S.arms[0];
    a.ua.set(0.0, 0, -0.07); a.fa = 0.06; a.hand.set(0, 0, -0.02); a.curl = 0.35;
  },
  // the ship is hit: knees bent, wide stance, hands forward low on the console edge, head pulled in
  brace(S, t) {
    const sh = Math.sin(TAU * t) * Math.exp(-0.0), j = Math.sin(TAU * t * 2.3);
    S.hips.set(0.01 * j, 0.86, 0.08);
    S.hipsRot.set(-0.3, 0.0, 0.02 * sh);
    S.spine.set(-0.14, 0, 0.01 * j); S.chest.set(-0.06, 0, 0); S.neck.set(0.18, 0, 0); S.head.set(0.12, 0, 0);
    S.shrug[0] = S.shrug[1] = 0.03;
    feet(S, -0.21, 0.06, 0.2, -0.06, 0.3, 0.3);
    S.feet[0].pole.set(-0.35, 0, -1); S.feet[1].pole.set(0.35, 0, -1);
    for (let i = 0; i < 2; i++) { const s = SIDE[i]; setIK(S.arms[i], s * 0.24, 0.98 + 0.006 * j, -0.38, 0, -0.6, -1, 0, -1, 0.2, s * 0.7, -1, 0.2, 1.45); }
  },
  // at a guard rail 1.05 m high and 0.32 m ahead, both hands on it overhand, weight a little forward
  rail(S, t) {
    const b = Math.sin(TAU * t);
    S.hips.set(0.01, 0.966, 0.0);
    S.hipsRot.set(-0.06, 0.02, 0.015);
    S.spine.set(-0.06, 0, 0); S.chest.set(-0.03 + 0.006 * b, 0, 0); S.neck.set(0.08, 0, 0); S.head.set(-0.06, 0, 0);
    feet(S, -0.14, 0.04, 0.13, 0.0, 0.18, 0.2);
    for (let i = 0; i < 2; i++) { const s = SIDE[i]; setIK(S.arms[i], s * 0.25, 1.065, -0.32, 0, -0.6, -1, 0, -1, 0.2, s * 0.7, -1, 0.25, 1.45); }
  },
  // seated on a seat 0.46 m high (root on the ground under the hip joints), hands on the knees
  sit(S, t) {
    const b = Math.sin(TAU * t);
    S.hips.set(0, 0.56, 0.0);
    S.hipsRot.set(0.05, 0, 0);
    S.spine.set(-0.06, 0, 0); S.chest.set(-0.03 + 0.006 * b, 0, 0); S.neck.set(0.08, 0, 0); S.head.set(-0.04, 0, 0);
    S.feet[0].ankle.set(-0.14, ANKLE_Y, -0.4); S.feet[1].ankle.set(0.14, ANKLE_Y, -0.38);
    S.feet[0].rot.set(0, 0.1, 0); S.feet[1].rot.set(0, -0.1, 0);
    S.feet[0].pole.set(-0.1, 0.6, -1); S.feet[1].pole.set(0.1, 0.6, -1);
    for (let i = 0; i < 2; i++) { const s = SIDE[i]; setIK(S.arms[i], s * 0.13, 0.6, -0.32, s * 0.1, -0.5, -1, 0, -1, 0, s * 0.6, -1, 0.3, 0.7); }
  },
};

// ---------------------------------------------------------------- solver (from Drumfire, with the prop bones)

const NB = CREW_BONES.length;
const TQ = Array.from({ length: NB }, () => new THREE.Quaternion());
const _qh = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _qw = new THREE.Quaternion();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _qx = new THREE.Quaternion();
const _qhead = new THREE.Quaternion(), _phead = new V3();
const _qbin = new THREE.Quaternion(), _pbin = new V3(), _pbinL = new V3();
const _oldP = new V3(), _oldQ = new THREE.Quaternion(), _targetQ = new THREE.Quaternion();
const _shoulders = [new V3(), new V3()], _support = new V3();
const _limbA = new V3(), _limbB = new V3(), _limbEnd = new V3(), _limbAxis = new V3(), _limbQ = new THREE.Quaternion();
const _groundQ = new THREE.Quaternion(), _groundNormal = new V3(), UP = new V3(0, 1, 0);
const _pS = new V3(), _pC = new V3(), _pA = new V3(), _pT = new V3(), _sh = new V3();
const _d = new V3(), _pp = new V3(), _u = new V3(), _X = new V3(), _Y = new V3(), _Z = new V3(), _M = new THREE.Matrix4();
const XAXIS = new V3(1, 0, 0), ZAXIS = new V3(0, 0, 1), _qr = new THREE.Quaternion();
const HANG = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.48, 0, 0)); // binoculars hanging, root space
const BEND = new Float64Array(1);

// Two-bone IK from joint A to target T (lengths l1, l2), the middle joint bent toward `pole`.
function solve2(A, T, l1, l2, pole, s, outQ) {
  _d.subVectors(T, A);
  let d = _d.length();
  if (d < 1e-6) { _d.set(0, -1, 0); d = 1e-6; } else _d.divideScalar(d);
  d = clamp(d, Math.abs(l1 - l2) + 1e-4, l1 + l2 - (s > 0 ? 0.002 : 0.0001));
  _pp.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_pp.lengthSq() < 1e-8) {
    _pp.set(Math.abs(_d.x) < 0.8 ? 1 : 0, Math.abs(_d.x) < 0.8 ? 0 : 1, 0);
    _pp.addScaledVector(_d, -_pp.dot(_d));
  }
  _pp.normalize();
  const ca = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
  _u.copy(_d).multiplyScalar(ca).addScaledVector(_pp, sa);
  const cg = clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1);
  _Y.copy(_u).negate();
  _Z.copy(_pp).addScaledVector(_Y, -_pp.dot(_Y)).normalize().multiplyScalar(s);
  _X.crossVectors(_Y, _Z);
  outQ.setFromRotationMatrix(_M.makeBasis(_X, _Y, _Z));
  BEND[0] = Math.PI - Math.acos(cg);
}

// Hand rotation (root space) from finger and palm directions: bind pose fingers -Y, palm -X*side.
function handBasis(f, n, s, outQ) {
  _Y.copy(f).negate().normalize();
  if (_Y.lengthSq() < 1e-8) _Y.set(0, 1, 0);
  _X.copy(n).multiplyScalar(-s);
  _X.addScaledVector(_Y, -_X.dot(_Y));
  if (_X.lengthSq() < 1e-8) {
    _X.set(Math.abs(_Y.x) < 0.8 ? 1 : 0, Math.abs(_Y.x) < 0.8 ? 0 : 1, 0);
    _X.addScaledVector(_Y, -_X.dot(_Y));
  }
  _X.normalize(); _Z.crossVectors(_X, _Y).normalize();
  return outQ.setFromRotationMatrix(_M.makeBasis(_X, _Y, _Z));
}

const MAX_BEND = 1.0, MAX_TWIST = 1.6;
const _qt = new THREE.Quaternion(), _qsw = new THREE.Quaternion(), _qid = new THREE.Quaternion();
function armIK(i, a, qC, sh) {
  const b = 5 + i * 3;
  handBasis(a.fingers, a.palm, SIDE[i], _qw);
  let beta = 0;
  for (let pass = 0; pass < 5; pass++) {
    _pT.copy(GRIP[i]).applyQuaternion(_qw);
    _pT.subVectors(a.grip, _pT);
    solve2(sh, _pT, L_UA, L_FA, a.pole, 1, _qa);
    beta = BEND[0];
    _qb.copy(_qa).multiply(_qx.setFromAxisAngle(XAXIS, beta));
    _qr.copy(_qb).invert().multiply(_qw);
    _qt.set(0, _qr.y, 0, _qr.w).normalize();
    let tw = 2 * Math.atan2(_qt.y, _qt.w);
    tw = tw > Math.PI ? tw - TAU : tw < -Math.PI ? tw + TAU : tw;
    _qsw.copy(_qr).multiply(_qi.copy(_qt).invert());
    const bend = 2 * Math.acos(Math.min(1, Math.abs(_qsw.w)));
    if (pass === 4 || (bend <= MAX_BEND + 0.01 && Math.abs(tw) <= MAX_TWIST + 0.01)) break;
    if (Math.abs(tw) > MAX_TWIST) _qt.setFromAxisAngle(_Y.set(0, 1, 0), Math.sign(tw) * MAX_TWIST);
    if (bend > MAX_BEND) _qsw.copy(_qid.slerp(_qsw, MAX_BEND / bend)), _qid.identity();
    _qw.copy(_qb).multiply(_qsw).multiply(_qt);
  }
  TQ[b].copy(_qi.copy(qC).invert()).multiply(_qa);
  TQ[b + 1].setFromAxisAngle(XAXIS, beta);
  TQ[b + 2].copy(_qb.invert()).multiply(_qw);
}

function jointFrame(B, index, p, q) {
  p.set(0, 0, 0); q.identity();
  for (let j = index; j >= 0; j = PBI[j]) {
    p.applyQuaternion(B[j].quaternion).add(B[j].position);
    q.premultiply(B[j].quaternion);
  }
}

function blendPole(B, first, pole, k) {
  jointFrame(B, first, _limbA, _limbQ);
  jointFrame(B, first + 1, _limbB, _limbQ);
  jointFrame(B, first + 2, _limbEnd, _limbQ);
  _limbAxis.subVectors(_limbEnd, _limbA).normalize();
  _limbB.sub(_limbA);
  _limbB.addScaledVector(_limbAxis, -_limbB.dot(_limbAxis));
  if (_limbB.lengthSq() > 1e-8) pole.normalize().lerp(_limbB.normalize(), 1 - k).normalize();
}

function blendGrip(B, i, a, k) {
  if (k >= 1) return;
  jointFrame(B, 7 + i * 3, _oldP, _oldQ);
  _oldP.add(_support.copy(GRIP[i]).applyQuaternion(_oldQ));
  a.grip.lerpVectors(_oldP, a.grip, k);
  handBasis(a.fingers, a.palm, SIDE[i], _targetQ);
  _oldQ.slerp(_targetQ, k);
  a.fingers.set(0, -1, 0).applyQuaternion(_oldQ);
  a.palm.set(-SIDE[i], 0, 0).applyQuaternion(_oldQ);
  blendPole(B, 5 + i * 3, a.pole, k);
}

function soleHeight(q, gx = 0, gz = 0) {
  let y = 0;
  for (const pt of SOLE) for (const side of SIDE) {
    _support.set(side * 0.053, pt[1] - ANKLE_Y, pt[0]).applyQuaternion(q);
    y = Math.max(y, gx * _support.x + gz * _support.z - _support.y);
  }
  return y;
}

function inclineFeet(gx, gz) {
  _groundNormal.set(-gx, 1, -gz).normalize();
  _groundQ.setFromUnitVectors(UP, _groundNormal);
  for (const foot of S.feet) {
    _targetQ.setFromEuler(foot.rot);
    const flatSupport = soleHeight(_targetQ);
    _targetQ.premultiply(_groundQ);
    foot.ankle.y += gx * foot.ankle.x + gz * foot.ankle.z + soleHeight(_targetQ, gx, gz) - flatSupport;
    foot.rot.setFromQuaternion(_targetQ, 'YXZ');
  }
}

function shoulderFor(i, a, qC, pC, shrug, out) {
  out.copy(OFF[i ? 'upperArmR' : 'upperArmL']);
  out.y += shrug; out.x -= SIDE[i] * shrug * 0.3;
  if (!a.ik) return;
  _sh.copy(out).applyQuaternion(qC).add(pC);
  _support.subVectors(a.grip, _sh).applyQuaternion(_qi.copy(qC).invert());
  const extension = sstep(0.36, 0.59, _support.length());
  out.z += clamp(_support.z, -1, 1) * 0.045 * extension;
  out.x += clamp(_support.x, -0.4, 0.4) * 0.035 * extension;
  out.y += 0.018 * sstep(0, 0.42, _support.y);
}

// idle motion and the look target, layered onto the pose specification
function applyIdle(fig, name) {
  const I = fig._idle, st = fig._st;
  if (I && I.on) {
    const w = IDLE[name] || IDLE.stand, br = I.breath * w[0], sw = I.sway * w[1], lk = I.look * w[2];
    S.chest.x += 0.012 * br; S.shrug[0] += 0.003 * br; S.shrug[1] += 0.003 * br;
    S.hips.x += 0.016 * sw; S.hipsRot.z -= 0.014 * sw; S.spine.z += 0.008 * sw; S.chest.z += 0.007 * sw;
    S.neck.y += 0.35 * lk; S.head.y += 0.45 * lk; S.head.x += I.up * w[2];
  }
  if (st && st.lookW > 1e-3) {
    const p = st.lookP, dx = p.x - S.hips.x, dz = p.z - S.hips.z, dy = p.y - 1.67;
    const body = S.hipsRot.y + S.spine.y + S.chest.y;
    let yaw = Math.atan2(-dx, -dz) - body;
    yaw = clamp(yaw > Math.PI ? yaw - TAU : yaw < -Math.PI ? yaw + TAU : yaw, -1.2, 1.2);
    const pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.6, 0.5);
    const k = st.lookW;
    S.neck.y = lerp(S.neck.y, 0.4 * yaw, k); S.head.y = lerp(S.head.y, 0.6 * yaw, k);
    S.neck.x = lerp(S.neck.x, 0.3 * pitch, k); S.head.x = lerp(S.head.x, 0.7 * pitch, k);
  }
}

const _frameQ = new THREE.Quaternion(), _frameP = new V3();
function solvePose(fig, name, t, blend) {
  const fn = POSES[name] || POSES.stand;
  const B = fig.mesh.skeleton.bones, k = clamp(blend, 0, 1);
  if (k <= 0) return;
  reset(S);
  fn(S, t, fig);
  applyIdle(fig, name);
  const grounded = name !== 'sit';
  const gx = grounded ? (fig.groundSlope?.x || 0) : 0, gz = grounded ? (fig.groundSlope?.z || 0) : 0;
  if (gx || gz) inclineFeet(gx, gz);
  TQ[0].setFromEuler(S.hipsRot);
  TQ[1].setFromEuler(S.spine); TQ[2].setFromEuler(S.chest); TQ[3].setFromEuler(S.neck); TQ[4].setFromEuler(S.head);
  if (k < 1) {
    S.hips.lerpVectors(B[0].position, S.hips, k);
    for (let j = 0; j < 5; j++) TQ[j].slerp(B[j].quaternion, 1 - k);
    for (let i = 0; i < 2; i++) {
      const f = S.feet[i];
      jointFrame(B, 13 + i * 3, _oldP, _oldQ);
      const fk = CREW_GAITS[name] && fig._poseName === name ? 1 : k;
      f.ankle.lerpVectors(_oldP, f.ankle, fk);
      _oldQ.slerp(_targetQ.setFromEuler(f.rot), fk);
      f.rot.setFromQuaternion(_oldQ, 'YXZ');
      if (grounded) f.ankle.y = Math.max(f.ankle.y, gx * f.ankle.x + gz * f.ankle.z + soleHeight(_oldQ, gx, gz));
      blendPole(B, 11 + i * 3, f.pole, k);
    }
  }
  _qh.copy(TQ[0]);
  _qs.copy(_qh).multiply(TQ[1]);
  _qc.copy(_qs).multiply(TQ[2]);
  // let the pelvis settle if a planted ankle would otherwise be beyond a straight leg
  if (grounded) {
    const reachL = L_TH + L_SH - 0.003;
    for (let i = 0; i < 2; i++) {
      _pA.copy(OFF[i ? 'thighR' : 'thighL']).applyQuaternion(_qh);
      const f = S.feet[i].ankle, dx = S.hips.x + _pA.x - f.x, dz = S.hips.z + _pA.z - f.z;
      const vertical = Math.sqrt(Math.max(0.04, reachL * reachL - dx * dx - dz * dz));
      S.hips.y = Math.min(S.hips.y, f.y + vertical - _pA.y);
    }
  }
  _pS.copy(OFF.spine).applyQuaternion(_qh).add(S.hips);
  _pC.copy(OFF.chest).applyQuaternion(_qs).add(_pS);
  _qhead.copy(_qc).multiply(TQ[3]);
  _phead.copy(OFF.head).applyQuaternion(_qhead).add(_pC).add(_support.copy(OFF.neck).applyQuaternion(_qc));
  _qhead.multiply(TQ[4]);
  // binoculars: raised (held in the head's frame at the eyes) or hanging plumb from the neck strap
  const bin = B[17];
  if (S.binoc) {
    _qbin.copy(_qhead);
    _pbin.copy(BINOC_EYES).applyQuaternion(_qhead).add(_phead);
  } else {
    _qbin.copy(HANG);
    _pbin.copy(OFF.binoc).applyQuaternion(_qc).add(_pC);
  }
  // to chest space
  _qi.copy(_qc).invert();
  TQ[17].copy(_qi).multiply(_qbin);
  _pbinL.copy(_pbin).sub(_pC).applyQuaternion(_qi);
  if (k < 1) { TQ[17].slerp(bin.quaternion, 1 - k); _pbinL.lerpVectors(bin.position, _pbinL, k); }
  _qbin.copy(_qc).multiply(TQ[17]);
  _pbin.copy(_pbinL).applyQuaternion(_qc).add(_pC);
  for (let i = 0; i < 2; i++) {
    const a = S.arms[i];
    if (a.on) {
      if (a.on === 'head') { _frameQ.copy(_qhead); _frameP.copy(_phead); }
      else if (a.on === 'chest') { _frameQ.copy(_qc); _frameP.copy(_pC); }
      else if (a.on === 'hips') { _frameQ.copy(_qh); _frameP.copy(S.hips); }
      else { _frameQ.copy(_qbin); _frameP.copy(_pbin); }
      a.grip.applyQuaternion(_frameQ).add(_frameP); a.fingers.applyQuaternion(_frameQ); a.palm.applyQuaternion(_frameQ); a.pole.applyQuaternion(_frameQ);
    }
    if (a.ik) blendGrip(B, i, a, a.on && fig._poseName === name ? 1 : k);
  }
  // legs
  for (let i = 0; i < 2; i++) {
    const f = S.feet[i], b = 11 + i * 3;
    _pA.copy(OFF[i ? 'thighR' : 'thighL']).applyQuaternion(_qh).add(S.hips);
    solve2(_pA, f.ankle, L_TH, L_SH, f.pole, -1, _qa);
    const beta = BEND[0];
    TQ[b].copy(_qi.copy(_qh).invert()).multiply(_qa);
    TQ[b + 1].setFromAxisAngle(XAXIS, -beta);
    _qb.copy(_qa).multiply(TQ[b + 1]);
    _qx.setFromEuler(f.rot);
    TQ[b + 2].copy(_qb.invert()).multiply(_qx);
  }
  // arms
  for (let i = 0; i < 2; i++) {
    const a = S.arms[i], b = 5 + i * 3;
    shoulderFor(i, a, _qc, _pC, S.shrug[i], _shoulders[i]);
    if (k < 1) _shoulders[i].lerpVectors(B[b].position, _shoulders[i], k);
    if (a.ik) {
      _sh.copy(_shoulders[i]).applyQuaternion(_qc).add(_pC);
      armIK(i, a, _qc, _sh);
    } else {
      TQ[b].setFromEuler(a.ua);
      TQ[b + 1].setFromAxisAngle(XAXIS, a.fa);
      TQ[b + 2].setFromEuler(a.hand);
      if (k < 1) for (let j = b; j < b + 3; j++) TQ[j].slerp(B[j].quaternion, 1 - k);
    }
    TQ[19 + i].setFromAxisAngle(ZAXIS, -SIDE[i] * a.curl);
    if (k < 1) TQ[19 + i].slerp(B[19 + i].quaternion, 1 - k);
  }
  TQ[18].identity();
  for (let i = 0; i < NB; i++) B[i].quaternion.copy(TQ[i]);
  B[0].position.copy(S.hips);
  for (let i = 0; i < 2; i++) B[5 + i * 3].position.copy(_shoulders[i]);
  bin.position.copy(_pbinL);
  // the pencil is shown (scale 1) or hidden (scale ~0); it switches once a cross-fade is under way
  if (k > 0.25 || fig._poseName === name) B[18].scale.setScalar(S.pencil ? 1 : 1e-4);
  fig._poseName = name;
}

const _rf = new V3(), _rn = new V3(), _rp = new V3();
const RA = { ik: true, grip: new V3(), fingers: new V3(), palm: new V3(), pole: new V3() };
function reach(fig, side, point, blend, fingers, palm, pole) {
  const i = side === 'L' || side === 0 ? 0 : 1, s = SIDE[i], B = fig.mesh.skeleton.bones, b = 5 + i * 3;
  const k = clamp(blend, 0, 1);
  if (k <= 0) return;
  _qh.copy(B[0].quaternion);
  _qs.copy(_qh).multiply(B[1].quaternion);
  _qc.copy(_qs).multiply(B[2].quaternion);
  _pS.copy(B[1].position).applyQuaternion(_qh).add(B[0].position);
  _pC.copy(B[2].position).applyQuaternion(_qs).add(_pS);
  _sh.copy(B[b].position).applyQuaternion(_qc).add(_pC);
  RA.grip.copy(point);
  RA.fingers.copy(fingers || _rf.set(0, -0.3, -1));
  RA.palm.copy(palm || _rn.set(-s, 0, 0));
  RA.pole.copy(pole || _rp.set(s * 0.4, -1, 0.18).applyQuaternion(_qc));
  blendGrip(B, i, RA, k);
  armIK(i, RA, _qc, _sh);
  for (let j = b; j < b + 3; j++) B[j].quaternion.copy(TQ[j]);
}

/** A varied group: n figures for the given roles (cycled), seeds offset so no two are alike. */
export function buildNavalCrew(roles, seed = 1) {
  return roles.map((role, i) => buildNavalCrewman({ role, seed: seed * 31 + i * 7 }));
}
