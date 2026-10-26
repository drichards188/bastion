// Slava (Project 1164 Atlant, lead ship, hull number 108 as photographed in 1984 to 1986): hull
// lines and general arrangement as plain numbers. No THREE here, so the hull loft, the
// superstructure and the exported SLAVA_MOUNTS table all read the same deck heights.
// Ship-local metres: bow toward -Z (stem head at z = -93.2), stern +Z (transom at z = +93.2),
// +X starboard, design waterline at y = 0.
//
// Evidence (refs/README.md, "Slava exterior"):
//   [P] measured on the near-orthographic USN port-beam colour photograph of 28 January 1986
//       (refs/photos/slava/slava-1986-port-beam.jpg, about 11.75 px/m over the 186.4 m length;
//       stem head at x 305, stern at x 2495, waterline at y 1664 in the 3000 px frame); heights
//       from the waterline in that frame, z from the stem.
//       At high zoom the hull's own ends read at z -92.3 (stem head) and +92.5 (transom top) on
//       that calibration, so measured lengths are about 0.9 % short; the published length is kept
//       and the difference left inside the measurement error.
//   [A] plan widths and x positions from cameras solved on the high frames (refs/README.md):
//       1984 elevated port beam (16 points, rms 9 px), 1985 aerial over the bow (12 points with
//       the tube x positions free, rms 17 px), 1983 port bow (18 points, rms 13 px), 1983/85
//       starboard bow (8 points, rms 22 px), 1986 port quarter (16 points, rms 19 px); rays from
//       the 1984 camera intersected with known deck heights, about +-0.5 m. The arrangement of
//       the Fort plinths, the Osa drums, the hangar lid and the pad from the Marshal Ustinov 1988
//       aerials (sister ship, same layout), scaled by the 1984 camera.
//   [D] the USN All Hands profile drawing of 1986 (cross-check only).
//   [E] estimate: hidden or unmeasurable (underwater body, plan widths not seen square on).
// Published: length 186.4 m overall, beam 20.8 m, draught 6.28 m (8.4 m over the sonar dome).

export const LENGTH = 186.4;
export const BEAM = 20.8;
export const DRAFT = 6.3;
export const STEM_Z = -93.2;
export const STERN_Z = 93.2;

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

// Smooth (Catmull-Rom) lookup for hull curves, so the loft has no visible facets between stations.
export function spline(rows, z) {
  const n = rows.length;
  if (z <= rows[0][0]) return rows[0][1];
  if (z >= rows[n - 1][0]) return rows[n - 1][1];
  let i = 0;
  while (i < n - 2 && rows[i + 1][0] < z) i++;
  const p0 = rows[Math.max(0, i - 1)], p1 = rows[i], p2 = rows[i + 1], p3 = rows[Math.min(n - 1, i + 2)];
  const t = (z - p1[0]) / (p2[0] - p1[0]);
  const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0] || 1)) * (p2[0] - p1[0]);
  const m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0] || 1)) * (p2[0] - p1[0]);
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
}

// ------------------------------------------------------------------ deck levels
// One long weather deck from the stem to z = +69.6 with a strong sheer forward: the stem head
// stands 9.95 m above the waterline, the deck edge falls to 6.0 m by z = -20 and stays there
// [P: the top of the hull side read every 5 to 10 m]. Abaft the hangar the hull steps down
// about 1.8 m to a quarterdeck at 4.2 m [P: the step at z 69.0 to 70.0,
// sailors standing on it under the raised helicopter pad in the 1986 port-quarter frame].
export const QUARTERDECK_STEP = 69.6;
const MAIN = [[-93.2, 9.95], [-90, 9.4], [-85, 8.9], [-80, 8.4], [-75, 8.02], [-70, 7.7], [-63, 7.35], [-55, 6.8], [-50, 6.48], [-40, 6.2], [-30, 6.1], [-20, 6.03], [0, 6.0], [69.6, 6.0]];
const QUARTER = [[69.6, 4.2], [85, 4.15], [93.2, 4.2]];
const STEP = 0.9; // length of the sloped break

export function deckHeightAt(z) {
  if (z < QUARTERDECK_STEP - STEP / 2) return spline(MAIN, z);
  if (z < QUARTERDECK_STEP + STEP / 2) {
    const t = smooth((z - (QUARTERDECK_STEP - STEP / 2)) / STEP);
    return lerp(spline(MAIN, QUARTERDECK_STEP), spline(QUARTER, QUARTERDECK_STEP), t);
  }
  return spline(QUARTER, z);
}

// ------------------------------------------------------------------ plan widths
// Half-beam at the deck edge. 20.8 m overall beam over the long parallel middle body [published];
// the fine entry and the broad transom with its rounded corners follow the 1983, 1984 and 1985
// aerial frames
// [A, E]. The forecastle is narrow: about 13 m across at the AK-130 [A].
const DECK_HALF = [
  [-93.2, 0.3], [-91, 1.5], [-87, 3.0], [-80, 4.9], [-72, 6.4], [-63, 7.5], [-55, 8.35], [-45, 9.2], [-35, 9.8],
  [-20, 10.3], [0, 10.4], [45, 10.4], [65, 10.25], [78, 9.9], [86, 9.45], [90, 9.1], [91.8, 8.75], [92.7, 8.15], [93.2, 7.4],
];
export function deckHalfBeamAt(z) { return Math.max(0.05, spline(DECK_HALF, z)); }

// Waterline half-beam: 19.0 m waterline beam [E]; the stem meets the waterline at z = -83.2 [P];
// the transom's foot is just clear of the water at the stern [P].
const WL_HALF = [
  [-83.2, 0.0], [-80, 0.9], [-76, 1.9], [-68, 3.8], [-55, 6.4], [-40, 8.3], [-20, 9.3], [0, 9.5], [45, 9.5],
  [65, 9.1], [80, 8.0], [90, 6.9], [93.2, 6.4],
];
export function waterlineHalfBeamAt(z) { return Math.max(0, spline(WL_HALF, z)); }

// Stem: the stem head 10.0 m ahead of the waterline intercept [P: stem points at 0, 2.5, 5, 7.5
// and 10 m on the 1986 broadside], the profile convex (steepest under the flare, raking more
// strongly near the water: z = -83.2 - 10 (y / 9.95)^0.72), nearly upright below the water, where
// the bow sonar dome is faired into the forefoot [E: underwater].
const STEM_WL = -83.2, STEM_RAKE = 10.0, STEM_EXP = 0.72, STEM_TOP = 9.95;
export function stemZ(y) {
  if (y >= 0) return STEM_WL - Math.pow(Math.min(1, y / STEM_TOP), STEM_EXP) * STEM_RAKE;
  return STEM_WL - y * 0.35;
}

// Lowest point of the section at z: on the stem forward, the flat keel at -6.3 m, rising aft to a
// transom whose foot is about 0.9 m above the waterline [P: the wake leaves it at z 89.5].
export function keelAt(z) {
  if (z < STEM_WL) return STEM_TOP * Math.pow(Math.min(1, (STEM_WL - z) / STEM_RAKE), 1 / STEM_EXP);
  if (z < STEM_WL + DRAFT * 0.35) return -(z - STEM_WL) / 0.35;
  if (z < 52) return -DRAFT;
  return lerp(-DRAFT, 0.8, smooth(Math.min(1, (z - 52) / 38.2)));
}

// The side has no hard knuckle: a smoothly flared topside, strongly forward, nearly upright
// amidships with the flare only in the top metre or two [P, A]. Exponent of the side curve
// x = W + (B - W) t^n (t from the waterline to the deck edge).
export function flareExp(z) {
  if (z < -40) return lerp(1.5, 2.6, smooth(Math.min(1, (z + 93) / 53)));
  if (z > 60) return lerp(2.6, 1.8, smooth(Math.min(1, (z - 60) / 33)));
  return 2.6;
}

// ------------------------------------------------------------------ general arrangement
// z ranges and heights [P] unless marked; widths [A] (solved cameras on the 1984 elevated port and
// 1985 aerial frames, about +-0.5 m; the Marshal Ustinov 1988 aerials for the arrangement) or [E].
export const LAYOUT = {
  // forecastle
  breakwater: { z: -72.5 }, // V breakwater ahead of the gun [A: 1983 aerial bow]
  ak130: { z: -63.05, top: 8.7, r: 2.55, ring: 3.7 }, // barbette 7.35 to 8.7 m, gunhouse to 13.06 m [P]
  // the narrow centreline house between the Bazalt banks, from abaft the gun to the main block;
  // roof0 at z -58.1..-52.5 (forward AK-630), roof1 at -52.5..-46.4 (after AK-630), roof2 aft of it
  // (RBU-6000 pair, forward Bass Tilt); under the bridge block it is the block's lower storey [P, A]
  fwdHouse: { z0: -58.1, z1: -5.0, x: 3.3, roof0: 12.0, roof1: 13.6, roof2: 12.2 },
  bazalt: { z0: -53.3, pitch: 11.65, yFront: 10.8, incline: 15.8, length: 12.2, dia: 1.75, xIn: 4.45, xOut: 6.75 },
  //   front-centre of the first pair at z -53.3, 10.8 m; pairs every 11.65 m; containers inclined
  //   15.8 degrees, forward end up [P]; tube centres at x 4.45 and 6.75 [A]
  // the bridge block above the containers: 02 level 12.2 to 14.9 m (front z -33.5), 03 level to
  // 17.4 m (front -32.2), the navigation bridge to the 20.1 m roof, its windowed front raked out
  // from z -31.8 at the deck to -32.6 at the roof and faceted (flat front +-4.25 m, chamfers to the
  // +-7.2 m sides 3 m aft) [P: 1986 broadside; A: 1984 elevated, Ustinov 1988 aerial]
  bridgeBlock: { z0: -31.8, z1: -11.0, zBridgeAft: -8.8, x: 7.2, xFront: 4.25, x02: 5.4, x03: 6.0, base: 12.2, level1: 14.9, deck: 17.4, roof: 20.1 },
  // the faceted pylon on the bridge roof: z -21.5..-11.3 at the roof, -15.8..-13.4 at the 30.6 m top [P]
  foremast: { z0: -21.5, z1: -11.3, zm0: -18.7, zm1: -12.3, zt0: -15.8, zt1: -13.4, base: 20.1, top: 30.6, x0: 4.2, xm: 2.7, x1: 1.4, topSteerY: 32.0, topSteerZ: -14.6 },
  latticeFwd: { z: -9.9, top: 39.4, yard: 30.0 },
  // midships
  mainBlock: { z0: -4.5, z1: 10.6, x: 6.4, roof: 14.8, sponson: 8.9, z01: -5.6 },
  mainMast: { z: 7.8, r0: 1.25, r1: 0.95, top: 27.3 }, // Top Pair turntable at 27.3 m [P]
  funnel: { z0: 11.4, zc: 14.6, z1: 25.0, x: 5.6, top: 18.2, low: 14.2 }, // uptake casing [P z, heights; A width]
  crane: { z: 30.2 },
  // aft: two raised plinths of four revolvers each, 15.6 m long and 4.6 m wide, launchers 3.9 m
  // apart [A: Ustinov 1988 from above, scaled by the 1984 elevated camera]
  fort: { x: 3.05, z: [34.75, 38.65, 42.55, 46.45], lidRadius: 1.6, plinth: { x0: 0.75, x1: 5.35, z0: 32.8, z1: 48.4, h: 0.55 } },
  // the aft block: full width to z 62.8, then the narrower hangar part whose roof ends at z 64.2 and
  // slopes down to the pad's level at z 70.6 [P: 1986 broadside]
  aftBlock: { z0: 49.6, z1: 64.2, zWide: 62.8, zSlope: 70.6, x: 7.4, roof: 11.5 },
  topDome: { z: 57.5, top: 15.3 }, // the director house top [P]
  hangar: { z0: 56.0, z1: 70.6, x: 3.4, floor: 4.3 }, // [E] in the aft block, door in the sloped aft face
  // the raised helicopter pad over the quarterdeck: deck 6.6 m [P], z 73.0..92.6 [P, A], +-6.6 m
  // with chamfered forward corners [A]; the landing marking z 77.6..89.4, +-5.1 m [A: 1984 camera]
  heliPad: { z0: 74.2, z1: 92.6, y: 6.6, x: 6.6 },
  osa: { z: 70.5, x: 5.9, r: 2.3 }, // ZIF-122 drums each side of the hangar lid [A: 1984 camera, Ustinov 1988]
  torpedo: { z0: 58.8, z1: 65.4, y0: 4.3, y1: 5.5 }, // shutters in the hull side [A, E]
};
