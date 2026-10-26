// Kirov (Project 1144, as fitted in 1985): hull lines and general arrangement as plain numbers.
// No THREE here, so the hull loft, the superstructure and the exported MOUNTS table all read the
// same deck heights. Ship-local metres: bow toward -Z (stem head at z = -126), stern +Z (transom
// top at z = +126), +X starboard, design waterline at y = 0.
//
// Evidence (refs/README.md):
//   [P] measured on the near-orthographic USN port-beam photograph of 26 Oct 1983 (Commons
//       BCGN_Kirov_1983.JPG, about 10.3 px/m over the 252 m length) and the closer port-amidships
//       frame of the same day (about 23 px/m); heights from the waterline in those frames.
//   [D] the USN All Hands profile drawing of 1986 (Commons Kirov-class_battlecruiser_profile_1986.png).
//   [E] estimate: hidden or unmeasurable (underwater body, plan widths between photographed points).
// Published: length 252 m overall, 230 m waterline, beam 28.5 m, draught 9.1 m.

export const LENGTH = 252;
export const BEAM = 28.5;
export const DRAFT = 9.1;

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

// Piecewise-linear table lookup; rows are [z, value...], sorted by z.
function table(rows, z, k = 1) {
  if (z <= rows[0][0]) return rows[0][k];
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    if (z <= b[0]) return lerp(a[k], b[k], (z - a[0]) / (b[0] - a[0]));
  }
  return rows[rows.length - 1][k];
}

// Smooth (Catmull-Rom) lookup for hull curves, so the loft has no visible facets between stations.
function spline(rows, z) {
  const n = rows.length;
  if (z <= rows[0][0]) return rows[0][1];
  if (z >= rows[n - 1][0]) return rows[n - 1][1];
  let i = 0;
  while (i < n - 2 && rows[i + 1][0] < z) i++;
  const p0 = rows[Math.max(0, i - 1)], p1 = rows[i], p2 = rows[i + 1], p3 = rows[Math.min(n - 1, i + 2)];
  const t = (z - p1[0]) / (p2[0] - p1[0]);
  // tangents scaled to the uneven spacing
  const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0] || 1)) * (p2[0] - p1[0]);
  const m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0] || 1)) * (p2[0] - p1[0]);
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
}

// ------------------------------------------------------------------ deck levels
// Forecastle deck: stem head about 13.1 m, falling to 10.85 m at the forecastle break (z = -71),
// where a step of about 1.3 m drops to the main deck [P, D; a ladder at the break shows on the 1985
// foredeck photograph]. The 1983 profile frame gives 13.9 m at the stem; sailors and rail stanchions
// on the anchored 1985 bow photograph read lower (11 to 12 m) while that frame's overlay on a
// matched render wants more freeboard forward: 13.1 m is the compromise [P, E]. Main deck 9.2 to 9.5 m [P, and 9.0 m from
// sailors amidships in the 1985 frame]. Quarterdeck step of about 2 m at z = +83 [P, D] to the
// helicopter deck at 7.3 m.
export const FORECASTLE_BREAK = -71;
export const QUARTERDECK_STEP = 83;
const FORECASTLE = [[-126, 13.1], [-115, 12.45], [-100, 11.75], [-85, 11.2], [-71, 10.85]];
const MAIN = [[-71, 9.55], [-50, 9.4], [-20, 9.3], [20, 9.25], [60, 9.3], [83, 9.35]];
const QUARTER = [[83, 7.3], [105, 7.35], [126, 7.55]];
const STEP = 1.1; // length of the sloped break between deck levels

export function deckHeightAt(z) {
  if (z < FORECASTLE_BREAK - STEP / 2) return spline(FORECASTLE, z);
  if (z < FORECASTLE_BREAK + STEP / 2) {
    const t = smooth((z - (FORECASTLE_BREAK - STEP / 2)) / STEP);
    return lerp(spline(FORECASTLE, FORECASTLE_BREAK), spline(MAIN, FORECASTLE_BREAK), t);
  }
  if (z < QUARTERDECK_STEP - STEP / 2) return spline(MAIN, z);
  if (z < QUARTERDECK_STEP + STEP / 2) {
    const t = smooth((z - (QUARTERDECK_STEP - STEP / 2)) / STEP);
    return lerp(spline(MAIN, QUARTERDECK_STEP), spline(QUARTER, QUARTERDECK_STEP), t);
  }
  return spline(QUARTER, z);
}

// ------------------------------------------------------------------ plan widths
// Half-beam at the deck edge. 28.5 m overall beam amidships; the forecastle entry and the broad,
// round-cornered transom follow the 1985 foredeck and 1986 stern-quarter photographs [P, E].
const DECK_HALF = [
  [-126, 0.35], [-123, 1.9], [-118, 3.9], [-110, 6.3], [-100, 8.75], [-90, 10.6], [-80, 11.9], [-70, 12.8],
  [-55, 13.6], [-35, 14.1], [-15, 14.25], [45, 14.25], [70, 14.05], [90, 13.55], [105, 12.95], [116, 12.35],
  [121, 12.0], [124, 11.6], [125.4, 11.0], [126, 10.2],
];
export function deckHalfBeamAt(z) { return Math.max(0.05, spline(DECK_HALF, z)); }

// Waterline half-beam: about 24 m waterline beam [E from published figures]; the forefoot meets
// the waterline about 15 m aft of the stem head [P]; the transom meets it at z = +120 [P].
const WL_HALF = [
  [-111, 0.0], [-105, 1.9], [-95, 4.7], [-85, 7.0], [-70, 9.6], [-50, 11.2], [-25, 11.9], [0, 12.0],
  [50, 12.0], [75, 11.7], [95, 11.0], [110, 10.2], [120, 9.4], [126, 9.0],
];
export function waterlineHalfBeamAt(z) { return Math.max(0, spline(WL_HALF, z)); }

// Stem: raked about 48 degrees above the waterline (the stem head is 15 m ahead of the forefoot
// [P]), nearly upright below it. The large bow sonar dome is below water and not modelled [E].
const STEM_RAKE = 16.0, STEM_EXP = 0.95, FOREFOOT_RAKE = 0.4, STEM_TOP = 13.1;
export function stemZ(y) {
  if (y >= 0) return -111 - Math.pow(Math.min(1, y / STEM_TOP), STEM_EXP) * STEM_RAKE;
  return -111 - y * FOREFOOT_RAKE;
}

// Lowest point of the section at z: on the stem forward, the flat keel at -8.0 m, rising aft to
// the transom's lower edge just under the waterline [P for the transom, E below water].
export function keelAt(z) {
  if (z < -111) return STEM_TOP * Math.pow(Math.min(1, (-111 - z) / STEM_RAKE), 1 / STEM_EXP);
  if (z < -111 + 8 * FOREFOOT_RAKE) return -(z + 111) / FOREFOOT_RAKE;
  // aft: the run rises to a transom immersed about 0.6 m (it meets the wake at the waterline in
  // the 1986 stern-quarter photograph)
  if (z < 78) return -8.0;
  return lerp(-8.0, -0.6, smooth(Math.min(1, (z - 78) / 46)));
}

// Knuckle: the hard chine along the side. About 2.8 m under the forecastle deck edge, stepping
// down just aft of the hull number (z = -86 to -78) to about 5.6 m along the main deck [P: 1985
// bow photograph, overlaid on a matched render, and the 1983 port-amidships frame], and following
// the quarterdeck step [D].
export function knuckleAt(z) {
  if (z < -86) return deckHeightAt(z) - 2.8 - Math.max(0, (-112 - z) / 14) * 0.9;
  if (z < -78) return lerp(deckHeightAt(-86) - 2.8, 5.6, smooth((z + 86) / 8));
  if (z < 78) return 5.6;
  if (z < 86) return lerp(5.6, 4.4, smooth((z - 78) / 8));
  return 4.4;
}

// ------------------------------------------------------------------ general arrangement
// z ranges of the main blocks, measured as above. Heights are top surfaces.
export const LAYOUT = {
  stemHead: -126,
  rbu6000Z: -104,
  metelZ: -93,
  fort: { z0: -70.6, z1: -56.9 }, // 12 hatches, 3 across x 4 along [P foredeck 1985]
  granit: { z0: -55.5, z1: -35.5 }, // 20 cells, 4 across x 5 along [P]
  galleries: { z0: -51.4, z1: -38.7, top: 12.2, x0: 8.7 }, // raised AK-630 galleries [P]
  superFront: -34, // forward end of the 01-level deckhouse [P]
  level01: 12.9, // 01-level roof (top of the oval-cut screen) [P]
  level02: 15.6,
  level03: 17.6, // director platforms on the forward block [P]
  bridgeFront: -17.5, // navigation bridge front face [P]
  bridgeRoof: 23.25, // [P: roofline 23.0 +- 0.5 m in the 1983 and 1985 frames]
  towerFwd: { z0: 4.0, z1: 16.3, base: 14.7, top: 31.5, capY: 37.9, capZ0: 3.2, capZ1: 21.2, mastZ: 10.85, mastTop: 50.4 },
  uptakeFwd: { z0: 16.5, z1: 21.2, top: 31.7 },
  aftBlock: { z0: 22, z1: 62, roof: 16.4 },
  towerAft: { z0: 30.5, z1: 40.7, top: 28.5, mastZ: 36.2, mastTop: 34.7 },
  latticeAft: { z: 29.5, top: 35.5 },
  ak100Fwd: { z: 64.5, top: 12.2 },
  ak100Aft: { z: 76.5, top: 10.0 },
  quarterStep: 83,
  heliDeck: { z0: 100, z1: 123 }, // [P: open deck from z 99.5, 1983 profile]
  elevator: { z: 109, w: 8.2, l: 12.6 }, // [P: 1986 stern quarter, position +-3 m]
  quarterPlatforms: { z0: 85.0, z1: 99.5, top: 8.9 }, // aft AK-630 platforms [P: profile z 84 to 99]
};
