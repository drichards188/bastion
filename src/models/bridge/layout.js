// Bridge room layout, in the bridge group's frame: deck at y = 0, forward -Z, starboard +X.
//
// These are the ACTIVE layout's values. They are Kirov's room unless buildBridge() has switched to
// another plan for the duration of a build with useLayout(plan, anchor) (ES module bindings are
// live, so the room and fitting builders read whichever layout is active). The default is restored
// after every build.
//
// Kirov: dimensions are a reconstruction fitted to the superstructure envelope (local x +-7.9,
// y 0..2.6, z -4.95..2.9; window centres at about 1.4 m, the exterior's photo measurement);
// window, sill and fitting proportions follow the 2015 photographs.
// Slava: the plan, heights, rake, window rows and wing doors are the Slava exterior's photo
// measurement (SLAVA_BRIDGE in slava-exterior.js); see refs/bridge-notes.md.

export let CEIL = 2.38;         // perforated overhead panels (photo-measured roofline: 2.6 m outside)
export let ROOF = 2.6;          // top of the outer skin (the exterior's roof slab sits on it)
export let WALL_T = 0.16;       // bulkhead and frame depth
export let SILL_Y = 0.74;       // top of the timber sill
export let SILL_D = 0.44;       // sill depth from the window wall
export let LOWER_D = 0.32;      // the panelled face under the sill stands this far in
export let WIN = { w: 1.0, h: 1.08, y0: 0.9 }; // forward windows (opening), rounded corners
export let SIDE_WIN = { w: 0.94, h: 1.02, y0: 0.94 };
export let DOOR = { w: 0.78, h: 1.86, sill: 0.22 };
// window bay proportions: frame ring margin and corner radius, sash margin, dog offset, dog pattern
export let WINFRAME = { ring: 0.28, ringR: 0.22, sash: 0.05, dogOff: 0.085, dogs: 5 };

// Room outline in plan, clockwise from the port aft corner, each wall segment ordered so its inward
// normal is the direction rotated +90 degrees from it (see segmentFrame).
export let XI = 7.75, ZF = -4.42, XF = 6.0, ZC = -3.0, ZA = 2.7;
export let OUTLINE = [[-XI, ZA], [-XI, ZC], [-XF, ZF], [XF, ZF], [XI, ZC], [XI, ZA]];
export let FRONT_WINDOWS = [];
export let SEGMENTS = [];
// the active plan's extras (null for Kirov): name, rake, skin of the level aft of the room
export let PLAN = null;

// Where the furniture stands (centre x, z, footprint half sizes, height) for the occlusion bake.
export const FOOTPRINTS = [];

function kirov() {
  CEIL = 2.38; ROOF = 2.6; WALL_T = 0.16; SILL_Y = 0.74; SILL_D = 0.44; LOWER_D = 0.32;
  WIN = { w: 1.0, h: 1.08, y0: 0.9 };
  SIDE_WIN = { w: 0.94, h: 1.02, y0: 0.94 };
  DOOR = { w: 0.78, h: 1.86, sill: 0.22 };
  WINFRAME = { ring: 0.28, ringR: 0.22, sash: 0.05, dogOff: 0.085, dogs: 5 };
  XI = 7.75; ZF = -4.42; XF = 6.0; ZC = -3.0; ZA = 2.7;
  OUTLINE = [[-XI, ZA], [-XI, ZC], [-XF, ZF], [XF, ZF], [XI, ZC], [XI, ZA]];
  // Forward window centres along the front face, and the walls' openings by segment.
  const FRONT_PITCH = 1.62;
  FRONT_WINDOWS = [-3, -2, -1, 0, 1, 2, 3].map((i) => i * FRONT_PITCH);
  SEGMENTS = [
    // port side: door just aft of the chamfer, a window aft of it
    { name: 'port', a: [-XI, ZA], b: [-XI, ZC], windows: [{ u: 1.75, ...SIDE_WIN }], door: { u: 4.25, ...DOOR }, sill: [[0.7, 2.85]] },
    { name: 'portChamfer', a: [-XI, ZC], b: [-XF, ZF], windows: [{ u: 1.12, ...WIN }], sill: [[0, 2.25]] },
    { name: 'front', a: [-XF, ZF], b: [XF, ZF], windows: FRONT_WINDOWS.map((x) => ({ u: x + XF, ...WIN })), sill: [[0, 12]] },
    { name: 'stbdChamfer', a: [XF, ZF], b: [XI, ZC], windows: [{ u: 1.13, ...WIN }], sill: [[0, 2.25]] },
    { name: 'stbd', a: [XI, ZC], b: [XI, ZA], windows: [{ u: 3.95, ...SIDE_WIN }], door: { u: 1.45, ...DOOR }, sill: [[2.85, 5.0]] },
    // aft bulkhead: two glazed panels into the chart house and the doorway (u runs from starboard)
    { name: 'aft', a: [XI, ZA], b: [-XI, ZA], windows: [], aft: true,
      openings: [{ u: XI + 1.2, w: 0.62, h: 0.8, y0: 1.12 }, { u: XI - 4.1, w: 0.62, h: 0.8, y0: 1.12 }, { u: XI - 1.55, w: 0.82, h: 1.96, y0: 0 }] },
  ];
  PLAN = null;
}
kirov();

// ---------------------------------------------------------------- faceted plans (Slava)

// Inset a convex polygon (clockwise as OUTLINE: inward normal = edge direction turned +90 degrees)
// by t: each edge line moves inward, consecutive lines intersect at the new corners.
function inset(pts, t) {
  const n = pts.length, lines = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n], L = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx;
    lines.push({ px: ax + nx * t, pz: az + nz * t, dx, dz });
  }
  return lines.map((l1, i) => {
    const l0 = lines[(i + n - 1) % n];
    // l0.p + s l0.d = l1.p + r l1.d
    const det = l0.dx * -l1.dz - l0.dz * -l1.dx;
    const s = ((l1.px - l0.px) * -l1.dz - (l1.pz - l0.pz) * -l1.dx) / det;
    return [l0.px + l0.dx * s, l0.pz + l0.dz * s];
  });
}

// Windows spaced evenly along a run, n of them, each w wide.
const evenly = (u0, u1, n, win) => Array.from({ length: n }, (_, k) => ({ u: u0 + ((k + 0.5) * (u1 - u0)) / n, ...win }));

// The Slava's navigation bridge (Project 1164) from the exterior's SLAVA_BRIDGE measurement:
// a flat raked front, raked chamfers to the sides, sides running aft; the room ends at an internal
// bulkhead where the side windows give way to round ports (about ship z -21.6), and the level aft of
// it to z = plan.aft gets an outer skin with the ports (the exterior leaves the level open).
function slava(plan, anchor) {
  const az = anchor.z, H = plan.roof - plan.floor;
  const front = plan.front - az, xf = plan.frontHalfWidth, xs = plan.halfWidth, ch = plan.chamfer;
  const roomAft = front + 10.2; // the internal bulkhead, just aft of the last side window
  const levelAft = plan.aft - az;
  WALL_T = 0.16;
  ROOF = H - 0.02; // under the exterior's roof slab
  CEIL = H - 0.26;
  WIN = { w: 0.78, h: plan.windowHead - plan.windowSill, y0: plan.windowSill - plan.floor };
  SIDE_WIN = { w: 0.8, h: 0.9, y0: WIN.y0 + 0.1 };
  const wd = plan.wingDoor || { w: 0.8, h: 1.8 };
  DOOR = { w: wd.w, h: wd.h - 0.12, sill: 0.14 };
  SILL_Y = WIN.y0 - 0.12;
  SILL_D = 0.4;
  LOWER_D = 0.3;
  WINFRAME = { ring: 0.16, ringR: 0.14, sash: 0.035, dogOff: 0.055, dogs: 3 };
  // outer faces on the measured plan lines, inner faces WALL_T inside them
  const outer = [[-xs, roomAft], [-xs, front + ch], [-xf, front], [xf, front], [xs, front + ch], [xs, roomAft]];
  OUTLINE = inset(outer, WALL_T);
  XI = OUTLINE[5][0]; ZF = OUTLINE[2][1]; XF = OUTLINE[3][0]; ZC = OUTLINE[4][1]; ZA = OUTLINE[5][1];
  const seg = (name, i, extra) => ({ name, a: OUTLINE[i], b: OUTLINE[(i + 1) % OUTLINE.length], ...extra });
  const len = (i) => Math.hypot(OUTLINE[(i + 1) % 6][0] - OUTLINE[i][0], OUTLINE[(i + 1) % 6][1] - OUTLINE[i][1]);
  // side windows at the exterior's ship z (5 per side), the wing door between the pairs
  const sideZ = [-28.3, -27.4, -24.1, -23.2, -22.3].map((z) => z - az), doorZ = plan.wingDoorZ - az;
  const portU = (z) => ZA - z, stbdU = (z) => z - ZC; // u along the port (aft to fore) and starboard (fore to aft) sides
  const frontLen = len(2), chLen = len(1);
  FRONT_WINDOWS = evenly(0, frontLen, 8, {}).map((w) => w.u - frontLen / 2);
  const sideSill = (U) => [[Math.min(U(sideZ[0]), U(sideZ[1])) - 0.55, Math.max(U(sideZ[0]), U(sideZ[1])) + 0.55], [Math.min(U(sideZ[2]), U(sideZ[4])) - 0.55, Math.max(U(sideZ[2]), U(sideZ[4])) + 0.55]]
    .map(([a, b]) => [Math.max(0.05, a), b]);
  SEGMENTS = [
    seg('port', 0, { windows: sideZ.map((z) => ({ u: portU(z), ...SIDE_WIN })), door: { u: portU(doorZ), ...DOOR }, sill: sideSill(portU) }),
    seg('portChamfer', 1, { windows: evenly(0, chLen, 4, { ...WIN, w: 0.74 }), sill: [[0, chLen]] }),
    seg('front', 2, { windows: evenly(0, frontLen, 8, WIN), sill: [[0, frontLen]] }),
    seg('stbdChamfer', 3, { windows: evenly(0, chLen, 4, { ...WIN, w: 0.74 }), sill: [[0, chLen]] }),
    seg('stbd', 4, { windows: sideZ.map((z) => ({ u: stbdU(z), ...SIDE_WIN })), door: { u: stbdU(doorZ), ...DOOR }, sill: sideSill(stbdU) }),
    seg('aft', 5, { windows: [], aft: true,
      openings: [{ u: XI + 1.2, w: 0.62, h: 0.8, y0: 1.12 }, { u: XI - 4.1, w: 0.62, h: 0.8, y0: 1.12 }, { u: XI - 1.55, w: 0.82, h: 1.96, y0: 0 }] }),
  ];
  // The rake: the front and chamfers lean out above the sill, reaching the exterior's top plan at the
  // roof (front corners 0.3 m wider and 0.8 m forward, chamfer ends 0.25 m forward at the sides).
  const corner = [[0, 0], [0, -0.25], [-0.3, -0.8], [0.3, -0.8], [0, -0.25], [0, 0]];
  const rake = SEGMENTS.map((s, i) => (/front|Chamfer/.test(s.name) ? { a: corner[i], b: corner[(i + 1) % 6] } : null));
  PLAN = {
    name: plan.name || 'slava', height: H, rakeFrom: SILL_Y + 0.01, rakeTo: H, rake, corner,
    // the level aft of the room: outer skin with round ports (exterior: z -21.0..-11.0, 7 a side)
    aftSkin: { z0: roomAft - WALL_T, z1: levelAft, xs, cut: 1.2, ports: Array.from({ length: 7 }, (_, k) => -21.0 - az + (k * 10.0) / 6), portY: 18.9 - plan.floor, portR: 0.21 },
  };
}

// Switch the active layout: null restores Kirov's room, a plan object builds that plan.
export function useLayout(plan = null, anchor = null) {
  FOOTPRINTS.length = 0;
  if (!plan) { kirov(); return; }
  slava(plan, anchor || { x: 0, y: plan.floor, z: plan.front + 4.95 });
}
