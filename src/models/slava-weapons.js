import * as THREE from 'three';
import { WEAPONS } from '../sim.js';
import { V, DEG, Parts, weaponMats, DeckCutouts, LampSet, LAMP } from './weapons/kit.js';
import { buildBazalt, BAZALT } from './weapons/bazalt.js';
import { buildFort, FORT, B204 } from './weapons/fort.js';
import { buildOsa } from './weapons/osa.js';
import { buildAk630s } from './weapons/guns.js';
import { buildAk130s } from './weapons/ak130.js';
import { buildDirectors, TOP_DOME } from './weapons/directors.js';
import { buildAsw } from './weapons/asw.js';
import { buildFlightMissile, ROUNDS } from './weapons/missiles.js';

// Slava's weapons as working machines (Project 1164, 1983 to 1986 fit): sixteen P-500 Bazalt in
// eight twin SM-248 launchers, 64 S-300F Fort in eight B-204 drums with the aft 3R41 Top Dome, two
// ZIF-122 Osa-M launchers (40 rounds) with their 4R33s, the twin AK-130 with its MR-184, six AK-630s
// (their three MR-123 Bass Tilts are the exterior's) and two RBU-6000. Placed from the exterior's
// SLAVA_MOUNTS (src/models/slava-exterior.js; ship-local metres, bow -Z, waterline Y = 0). The API
// is kirov-weapons.js's, so the game drives either ship the same way; the kinds are 'bazalt',
// 'fort', 'osa', 'gun' (AK-630) and 'ak130'.
//
// As on Kirov the mechanisms are driven by state: each frame the fire-control status, the automatic
// defence's posture and the rounds in flight decide what each launcher, gun and director should be
// doing, and each mechanism runs toward that at its own rates. The fire-control steps on deck:
//   Bazalt  ACQUIRE: lamps green on the order's containers. PREPARE: LOAD TARGET DESIGNATION blinks
//           them amber; OPEN CONTAINER COVERS swings the front covers up; START SUSTAINER ENGINES
//           spools the rounds' turbojets on their air starters (haze out of the gas outlets). ARM:
//           lamps red. FIRE: each round leaves on its boosters at the launcher interval, fire and
//           smoke out of the mouth and the gas outlet; the cover stays up while the smoke clears.
//           ABORT: engines run down, covers shut. (Step list proposed in weapons/bazalt.js.)
//   Fort    as Kirov's, on the B-204 drums: ACQUIRE slews the aft Top Dome; INDEX ROTARY MAGAZINE
//           turns the order's drums (their turntables and lids with them) under the shut station
//           lid; ARM lifts the station lid; FIRE is the cold ejection, ignition above the deck, the
//           lid shutting and the drum indexing its next round.
//   Osa     as Kirov's: doors open, the launcher rises and is laid with its director.
//   AK-130  laid by the MR-184 on the designated contact inside gun range, or on the nearest close
//           threat; aimWeapons('ak130', dir) lays it on an order, fireGun('ak130') or a simulation
//           launch of kind 'ak130' fires it: alternate barrels recoil, muzzle blast, case thrown out.
//   AK-630  under automatic defence the mount pair nearest a close threat lays on it and fires with
//           the simulation's bursts.

// Full magazines (sources: docs/MODELLED.md, Slava weapons): the player's starting ammunition. The
// next round's slot is taken as sim.fire takes it, WEAPONS[kind].ammo less the rounds left (these
// figures where the simulation has no entry), so the launcher that opens is the one that fires.
export const SLAVA_MAGAZINES = { bazalt: 16, fort: 64, osa: 40, gun: 16000, ak130: 340 };

const STAGES_ON = new Set(['tracking', 'tracked', 'preparing', 'ready', 'armed', 'firing']);
const OPEN_STAGES = new Set(['ready', 'armed', 'firing']);
const TRAIN_ARC = 150 * DEG; // the Top Dome's clear arc either side of its stowed bearing
const AK130_RANGE = 23000, AK130_V = 850; // published maximum range and muzzle velocity
const env = (kind, key, fallback) => WEAPONS[kind]?.[key] ?? fallback;

const _v = V(), _w = V(), _d = V(), _inv = new THREE.Matrix4();

// The exterior's table in the shapes the weapon modules take. Bazalt: one entry per container,
// at the centre of its mouth (the cover's seam, a cover's length behind the container's front),
// from the exterior's twin launchers with each container's front and rear; firing order
// (reconstructed) alternates the sides, the forward pairs first, outboard then inboard.
export function slavaWeaponMounts(m) {
  const cover = BAZALT.coverLen + BAZALT.dome, tubes = [];
  for (const L of m.bazalt || []) {
    const list = L.tubes || [{ x: L.x, inboard: true, front: { x: L.x, y: L.y, z: L.z }, rear: null }];
    for (const t of list) {
      const f = V(t.front.x, t.front.y, t.front.z);
      const dir = t.rear ? f.clone().sub(V(t.rear.x, t.rear.y, t.rear.z)).normalize() : V(L.dir?.x ?? 0, L.dir?.y ?? Math.sin(L.incline ?? 0.28), L.dir?.z ?? -Math.cos(L.incline ?? 0.28)).normalize();
      const mouth = f.addScaledVector(dir, -cover);
      tubes.push({
        x: mouth.x, y: mouth.y, z: mouth.z, side: L.side ?? Math.sign(t.x), pair: L.pair ?? 0, inboard: !!t.inboard,
        incline: Math.asin(dir.y), ry: Math.atan2(-dir.x, -dir.z), length: L.length, diameter: L.diameter, launcher: L.launcher,
      });
    }
  }
  const rank = (t) => t.pair * 4 + (t.inboard ? 2 : 0) + (t.side > 0 ? 0 : 1);
  tubes.sort((a, b) => rank(a) - rank(b));
  const ak130 = [].concat(m.ak130 || []);
  // the Osa tubs stand about 2.4 m over the quarterdeck (Marshal Ustinov, 1988; estimated)
  const osa = (m.osa || []).map((o) => ({ ...o, bayHeight: o.bayHeight ?? 2.4, bay: 'round' }));
  // the RBU-6000 pair stand with their barrels vertical, the loading position (exterior, [P])
  const rbu6000 = (m.rbu6000 || []).map((r) => ({ ...r, elev: r.elev ?? 90 * DEG }));
  return { ...m, bazalt: tubes, ak130, osa, rbu6000 };
}

export function buildSlavaWeapons({ mounts: rawMounts, deckHeightAt = null, magazines = SLAVA_MAGAZINES } = {}) {
  if (!rawMounts) throw new Error('buildSlavaWeapons needs the exterior\'s SLAVA_MOUNTS');
  const mounts = slavaWeaponMounts(rawMounts);
  const M = weaponMats(), group = new THREE.Group();
  group.name = 'slava-weapons';
  const staticParts = new Parts(M), wellParts = new Parts(M), cutouts = new DeckCutouts(48), lamps = new LampSet(group, 48);
  const bazalt = buildBazalt(group, M, mounts.bazalt, staticParts, lamps);
  // the B-204 platforms are the exterior's when the mount stands above the deck there; its
  // lidRadius is the radius of the ring of eight hatches (their outer edges), which sets the
  // turntable's size in the photographs' proportions
  const f0 = mounts.fort[0], plinth = deckHeightAt && Math.abs(f0.y - deckHeightAt(f0.z)) < 0.05 ? 0.45 : 0;
  const discR = f0.lidRadius ? (f0.lidRadius * B204.discR) / (B204.cellR + B204.lidR) : undefined;
  const fort = buildFort(group, M, mounts.fort, staticParts, wellParts, cutouts, lamps, { variant: 'b204', plinth, discR });
  const osa = buildOsa(group, M, mounts.osa, staticParts, wellParts, cutouts, lamps, { deckHeightAt, bay: 'round' });
  const ak630 = buildAk630s(group, M, mounts.ak630, staticParts);
  const ak130 = buildAk130s(group, M, mounts.ak130, staticParts);
  const dirs = mounts.directors || {};
  const topDomes = buildDirectors(group, M, 'topDome', dirs.fort || [], staticParts);
  const popGroups = buildDirectors(group, M, 'popGroup', dirs.osa || [], staticParts);
  const kiteScreech = buildDirectors(group, M, 'kiteScreech', dirs.ak130 || [], staticParts);
  const bassTilt = buildDirectors(group, M, 'bassTilt', (dirs.ak630 || []).filter((d) => !d.modelledByExterior), staticParts);
  buildAsw(M, { rbu6000: mounts.rbu6000 }, staticParts);
  staticParts.build(group, { name: 'weapons-static' });
  wellParts.build(group, { name: 'weapons-wells', shadow: false });

  // launch anchors for the simulation's fallback and its choice of AK-630 mount
  const launchPoints = {
    bazalt: bazalt.tubes.map((t, i) => bazalt.roundFrame(i).pos),
    fort: fort.launchers.map((l, i) => fort.roundFrame(i).pos),
    osa: [0, 1, 2, 3].map((slot) => osa.roundFrame(slot).pos),
    gun: ak630.rigs.map((g, i) => ak630.anchor(i)),
    ak130: ak130.rigs.flatMap((g, i) => [0, 1].map((b) => ak130.muzzle(i, b))),
  };

  let fx = null, time = 0, shipMatrix = new THREE.Matrix4();
  const flights = []; // recent launches: { kind, slot, m (the simulation's round), t0 }
  const st = { fc: null, tracks: [], threats: [], auto: false, radar: true, ammo: {}, designated: null };
  const manual = { ak130: null }; // a laying order from aimWeapons: { train, elev, until }
  const toLocal = (world, out = V()) => out.copy(world).applyMatrix4(_inv);
  const toWorld = (local, out = V()) => out.copy(local).applyMatrix4(shipMatrix);
  const aimFrom = (from, target) => {
    const d = _w.subVectors(target, from);
    return { train: Math.atan2(-d.x, -d.z), elev: Math.atan2(d.y, Math.hypot(d.x, d.z)), range: d.length() };
  };
  const relArc = (train, stow) => Math.abs(Math.atan2(Math.sin(train - stow), Math.cos(train - stow)));
  const cap = (kind) => WEAPONS[kind]?.ammo ?? magazines[kind] ?? 0;
  const nextSlot = (kind) => cap(kind) - (st.ammo[kind] ?? cap(kind));
  function orderSlots(kind) {
    const fc = st.fc;
    if (!fc || fc.weapon !== kind || !STAGES_ON.has(fc.stage)) return [];
    const k = fc.stage === 'firing' ? fc.remaining : fc.salvo, from = nextSlot(kind), out = [];
    for (let i = 0; i < k && from + i < cap(kind); i++) out.push(from + i);
    return out;
  }
  const blink = (rate = 2.2) => (Math.sin(time * rate * Math.PI * 2) > 0 ? 1 : 0.15);
  const nB = bazalt.tubes.length;

  // ---------------------------------------------------------------- per weapon

  function runBazalt(dt) {
    const fc = st.fc, on = fc?.weapon === 'bazalt', stage = fc?.stage, step = fc?.stepIndex ?? -1;
    const slots = new Set(orderSlots('bazalt').map((s) => s % nB));
    const prep = stage === 'preparing';
    for (const t of bazalt.tubes) {
      const ordered = on && slots.has(t.i) && t.loaded;
      const covers = ordered && ((prep && step >= 1) || OPEN_STAGES.has(stage));
      const engines = ordered && ((prep && step >= 2) || OPEN_STAGES.has(stage));
      t.coverTarget = covers || t.hold > 0 ? 1 : 0;
      t.engineTarget = engines ? 1 : 0;
      let col = LAMP.off, k = 1;
      if (ordered) {
        if (prep) { col = LAMP.ready; k = step === 0 ? blink() : step === 1 ? blink(4) : 1; }
        else if (stage === 'ready') col = LAMP.ready;
        else if (stage === 'armed' || stage === 'firing') col = LAMP.armed;
        else col = LAMP.safe;
      }
      if (t.lamp >= 0) lamps.set(t.lamp, col, k);
      if (!fx || dt <= 0) continue;
      // the turbojet lighting up on its air starter (a puff of smoke out of the gas outlet), then its
      // exhaust haze while it runs
      if (t.loaded && t.engine > 0.3 && !t.lit) { t.lit = true; for (let k = 0; k < 6; k++) fx.hatchSmoke(toWorld(t.vent, _v), 0.85, 1.1); }
      if (t.engine < 0.05) t.lit = false;
      if (t.loaded && t.engine > 0.08) {
        t.puff = (t.puff ?? 0) + dt * 14 * t.engine;
        while (t.puff >= 1) { t.puff -= 1; fx.hatchSmoke(toWorld(t.vent, _v), 0.62 * t.engine, 0.9); }
      }
      // smoke still drifting out of an emptied container
      if (!t.loaded && t.hold > 0) fx.hatchSmoke(toWorld(bazalt.mouth(t.i, _d), _v), Math.min(1, t.hold / 5), 1.4);
    }
    bazalt.update(dt);
  }

  function runFort(dt) {
    const fc = st.fc, on = fc?.weapon === 'fort', stage = fc?.stage, step = fc?.stepIndex ?? -1;
    const n = fort.launchers.length, slots = orderSlots('fort'), next = nextSlot('fort');
    // (rounds actually fired from this ship's 64, whatever the simulation's slot numbering)
    const count = (magazines.fort ?? cap('fort')) - (st.ammo.fort ?? magazines.fort ?? cap('fort'));
    const ordered = new Map(slots.map((s) => [s % n, Math.floor(s / n)]));
    const alertSlot = st.auto && st.radar && st.threats.some((t) => t.range > env('fort', 'minRange', 7000) * 0.8 && t.range < env('fort', 'range', 75000) && t.alt >= env('fort', 'minAlt', 25)) && next < cap('fort') ? next % n : -1;
    for (const l of fort.launchers) {
      const fired = Math.max(0, Math.ceil((count - ((l.i - next + count) % n + n) % n) / n));
      const cellNext = Math.min(FORT.cells - 1, fired);
      const inOrder = on && ordered.has(l.i);
      if (inOrder || alertSlot === l.i || l.lid < 0.01) l.cell = cellNext;
      const loaded = l.loaded[l.cell] && fired < FORT.cells;
      const open = loaded && !l.indexing && ((inOrder && (stage === 'armed' || stage === 'firing')) || (alertSlot === l.i && !(on && STAGES_ON.has(stage))));
      l.lidTarget = open || l.hold > 0 ? 1 : 0;
      let col = LAMP.off, k = 1;
      if (inOrder) {
        if (stage === 'preparing') { col = LAMP.ready; k = step <= 1 ? blink(step === 1 ? 4 : 2) : 1; }
        else if (stage === 'ready') col = LAMP.ready;
        else if (stage === 'armed' || stage === 'firing') col = LAMP.armed;
        else col = LAMP.safe;
      } else if (alertSlot === l.i) {
        col = l.indexing ? LAMP.ready : LAMP.armed;
        k = l.indexing ? blink(4) : 1;
      } else if (l.indexing) { col = LAMP.ready; k = blink(4); }
      if (l.lamp >= 0) lamps.set(l.lamp, col, k);
      if (fx && l.hold > 0 && dt > 0) fx.hatchSmoke(toWorld(fort.hatch(l), _v), Math.min(1, l.hold / 2.5) * 0.7, 0.5);
    }
    fort.update(dt);
  }

  function runOsa(dt) {
    const fc = st.fc, on = fc?.weapon === 'osa', stage = fc?.stage, step = fc?.stepIndex ?? -1;
    const n = osa.rigs.length, slots = orderSlots('osa'), mountsInOrder = new Set(slots.map((s) => s % n));
    const target = on ? st.designated : null;
    const near = st.auto && st.radar ? nearest(st.threats.filter((t) => t.range < 14000 && t.alt >= 15)) : null;
    for (const g of osa.rigs) {
      const pos = V(g.mount.x, g.mount.y + 3.3, g.mount.z);
      const order = on && mountsInOrder.has(g.i) && ['preparing', 'ready', 'armed', 'firing'].includes(stage);
      if (order || near) g.until = time + 5;
      g.want = time < (g.until ?? -1) && (st.ammo.osa ?? 1) > 0;
      const aimAt = order ? target : (on && STAGES_ON.has(stage) && target) || near;
      g.aim = aimAt && (!order || step >= 1 || stage !== 'preparing') ? aimFrom(pos, aimAt.local) : null;
      let col = LAMP.off, k = 1;
      if (order) {
        col = stage === 'preparing' || stage === 'ready' ? LAMP.ready : LAMP.armed;
        k = stage === 'preparing' && step < 2 ? blink() : 1;
      } else if (g.phase === 'up') col = LAMP.safe;
      else if (g.phase === 'loading' || g.phase === 'sinking') { col = LAMP.ready; k = blink(3); }
      if (g.lamp >= 0) lamps.set(g.lamp, col, k);
    }
    osa.update(dt);
  }

  function nearest(list) {
    let best = null;
    for (const t of list) if (!best || (t.munition && !best.munition) || (t.munition === best.munition && t.range < best.range)) best = t;
    return best;
  }

  function directorTarget(kind, maxRange) {
    const fc = st.fc;
    if (fc?.weapon === kind && STAGES_ON.has(fc.stage) && st.designated) return st.designated;
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      if (f.kind === kind && f.m?.alive) { const t = st.tracks.find((c) => c.id === f.m.targetId); if (t) return t; }
    }
    if (!st.auto || !st.radar) return null;
    return nearest(st.threats.filter((t) => t.range < maxRange && t.alt >= 15));
  }

  // the AK-130's laying for a target at ship-local `p`: the line of sight, raised for a surface
  // target by the ballistic angle for its range (the vacuum angle with an allowance for drag)
  const superElev = (range) => Math.min(40 * DEG, 0.5 * Math.asin(Math.min(1, (9.81 * Math.min(range, AK130_RANGE)) / (AK130_V * AK130_V))) * 1.6);
  function gunLay(from, p, surface) {
    const a = aimFrom(from, p);
    if (surface) a.elev += superElev(a.range);
    return a;
  }

  function runGuns(dt) {
    const tFort = directorTarget('fort', env('fort', 'range', 75000) * 1.05);
    for (const g of topDomes.rigs) {
      const aim = tFort ? aimFrom(V(g.mount.x, g.mount.y + TOP_DOME.centreY, g.mount.z), tFort.local) : null;
      g.target = aim && relArc(aim.train, g.stow) < TRAIN_ARC ? aim : null;
    }
    const tOsa = directorTarget('osa', env('osa', 'range', 10000) * 1.4);
    for (const g of popGroups.rigs) {
      const mine = flights.filter((f) => f.kind === 'osa' && f.m?.alive && f.slot % osa.rigs.length === g.i).pop();
      const t = (mine && st.tracks.find((c) => c.id === mine.m.targetId)) || tOsa;
      g.target = t ? aimFrom(V(g.mount.x, g.mount.y + 1.5, g.mount.z), t.local) : null;
    }
    // the AK-130: a laying order, else its fire-control order, else the designated contact in gun
    // range, else the nearest close threat
    const fc = st.fc, order = manual.ak130 && time < manual.ak130.until ? manual.ak130 : null;
    const d = (fc?.weapon === 'ak130' && STAGES_ON.has(fc.stage) && st.designated) || (st.designated && st.designated.range < AK130_RANGE ? st.designated : null) || (st.auto ? nearest(st.threats.filter((t) => t.range < 9000)) : null);
    for (const g of kiteScreech.rigs) g.target = order ? { train: order.train, elev: order.elev } : d ? aimFrom(V(g.mount.x, g.mount.y + 2, g.mount.z), d.local) : null;
    for (const g of ak130.rigs) {
      const from = V(g.mount.x, g.mount.y + 2.05, g.mount.z);
      const aim = order ? { train: order.train, elev: order.elev + (order.surface ? superElev(order.range) : 0) } : d ? gunLay(from, d.local, d.type === 'ship') : null;
      g.target = aim && relArc(aim.train, g.stow) < 150 * DEG ? aim : null;
    }
    for (const g of ak630.rigs) {
      const pos = V(g.mount.x, g.mount.y + 0.8, g.mount.z), side = g.mount.side || Math.sign(g.mount.x);
      // a centreline mount covers both sides; a side mount its own
      const close = st.auto && st.radar ? nearest(st.threats.filter((t) => t.range < 4500 && (!side || Math.sign(t.local.x - g.mount.x) === side))) : null;
      if (g.burstAim && time < g.burstUntil) g.target = g.burstAim;
      else g.target = close ? aimFrom(pos, close.local) : null;
    }
    topDomes.update(dt, time); popGroups.update(dt, time); kiteScreech.update(dt, time); bassTilt.update(dt, time);
    ak630.update(dt); ak130.update(dt);
  }

  // fire one AK-130 barrel (alternating) with its blast and spent case; world muzzle position
  function fireAk130(i = 0, targetWorld = null, barrel = null) {
    const g = ak130.rigs[i];
    if (!g) return null;
    const b = ak130.fire(i, barrel), mz = toWorld(ak130.muzzle(i, b, V()), V());
    if (fx) {
      const dir = targetWorld ? V().subVectors(targetWorld, mz).normalize() : ak130.bore(i, V()).transformDirection(shipMatrix);
      fx.gunBlast(mz, dir, 1.6);
      // the spent case is thrown out forward and down from its port under the embrasure
      const port = toWorld(ak130.port(i, b, V()), V()), fwd = V().subVectors(mz, port).setY(0).normalize();
      fx.brass(port, fwd.multiplyScalar(3.5 + Math.random()).add(V(0, -1.2, 0)), 0.14, 0.68);
    }
    return mz;
  }

  // ---------------------------------------------------------------- inspection camera

  const cam = { kind: null, eye: V(), target: V(), init: false };
  function inspectView(kind, status, dt = 0.016, snap = false) {
    dt = Number.isFinite(dt) ? Math.min(0.25, Math.max(0, dt)) : 0;
    if (snap) cam.init = false;
    const last = flights.filter((f) => f.kind === kind).pop();
    const recent = last && time - last.t0 < (kind === 'fort' ? 5 : kind === 'bazalt' ? 5.5 : 4.5);
    const slot = recent ? last.slot : nextSlot(kind);
    const eye = V(), look = V();
    const acquiring = status && (status.stage === 'tracking' || status.stage === 'tracked') && status.weapon === kind;
    const dir = acquiring && (kind === 'fort' ? topDomes.rigs.find((g) => g.target) || topDomes.rigs[0] : kind === 'osa' ? popGroups.rigs[slot % Math.max(1, popGroups.rigs.length)] : kind === 'ak130' ? kiteScreech.rigs[0] : null);
    if (dir) {
      const d = dir.mount, aft = d.z > 0 ? 1 : -1, sx = d.x < -0.1 ? -1 : 1;
      const h = kind === 'fort' ? TOP_DOME.centreY : kind === 'ak130' ? 1.9 : 1.5, far = kind === 'fort' ? 1.6 : 1;
      eye.set(d.x + sx * 8 * far, d.y + h + 3 * far, d.z + aft * 9 * far);
      look.set(d.x, d.y + h, d.z);
    } else if (kind === 'bazalt') {
      const t = bazalt.tubes[slot % nB], p = bazalt.mouth(t.i, V()), sx = t.side;
      // from forward and outboard, a little above the mouth: the cover, the bore and the round's
      // nose, the gas outlet under the rear and the run of the containers behind
      eye.set(p.x + sx * 9.0, p.y + 4.2, p.z - 11.0);
      look.set(p.x - sx * 0.4, p.y - 1.8, p.z + 5.5);
    } else if (kind === 'fort') {
      // from inside the rail, aft of the station and above it, looking forward and inboard across
      // the turntable (the crane's jib runs over the platforms and the boats stand ahead of them)
      const l = fort.launchers[slot % fort.launchers.length], h = fort.hatch(l), sx = l.mount.x < -0.1 ? -1 : 1;
      eye.set(sx * 9.4, h.y + 4.6, h.z + 4.2);
      look.set(h.x - sx * 0.5, h.y + 0.1, h.z - 0.6);
    } else if (kind === 'ak130') {
      const g = ak130.rigs[0], p = V(g.mount.x, g.mount.y + 2.2, g.mount.z);
      eye.set(p.x + 12, p.y + 5.5, p.z - 15);
      look.set(p.x, p.y + 0.3, p.z - 2.5);
    } else if (kind === 'gun') {
      const g = ak630.rigs.find((r) => r.firing > 0 || r.target) || ak630.rigs[0], p = V(g.mount.x, g.mount.y + 0.7, g.mount.z), sx = (g.mount.side || 1);
      eye.set(p.x + sx * 4.5, p.y + 2.6, p.z - 5.5);
      look.set(p.x, p.y + 0.2, p.z);
    } else {
      const g = osa.rigs[slot % osa.rigs.length], p = V(g.mount.x, g.mount.y + 1.3, g.mount.z), sx = g.side;
      // the Osa tubs are on the quarterdeck: from outboard and aft of the tub, looking forward
      eye.set(p.x + sx * 6, p.y + 4.6, p.z + 8.5);
      look.set(p.x, p.y + 1.4 * g.lift + 1.0, p.z + 0.2);
    }
    if (recent && last.m && last.m.pos) {
      const age = time - last.t0, w = Math.min(1, age / 0.4) * Math.max(0, 1 - Math.max(0, age - 2.8) / 1.4);
      const m = toLocal(last.m.pos, V());
      if (w > 0 && m.distanceTo(look) < 4000) {
        eye.sub(look).multiplyScalar(1 + 0.45 * w).add(look);
        const dl = V().subVectors(look, eye), dist = dl.length();
        dl.divideScalar(dist);
        const dm = V().subVectors(m, eye).normalize(), ang = Math.acos(Math.max(-1, Math.min(1, dl.dot(dm))));
        const f = ang < 34 * DEG ? 0.5 : (17 * DEG) / ang;
        const q = new THREE.Quaternion().setFromUnitVectors(dl, dm);
        dl.applyQuaternion(new THREE.Quaternion().slerp(q, f * w));
        look.copy(eye).addScaledVector(dl, dist);
      }
    }
    if (!cam.init || cam.kind !== kind) { cam.eye.copy(eye); cam.target.copy(look); cam.init = true; cam.kind = kind; }
    const a = 1 - Math.exp(-dt * 6), b = 1 - Math.exp(-dt * 10);
    cam.eye.lerp(eye, a);
    cam.target.lerp(look, b);
    return { eye: cam.eye.clone(), target: cam.target.clone(), slot };
  }

  // ---------------------------------------------------------------- API

  const api = {
    group, launchPoints, cutouts, mounts, magazines,
    parts: { bazalt, fort, osa, ak630, ak130, topDomes, popGroups, kiteScreech, bassTilt },
    attachFx(f) { fx = f; },
    // The simulation's launch-frame hook: ship-local tail position and bore for the round in `slot`.
    launchFrame(kind, slot, targetDir) {
      if (kind === 'bazalt') { const f = bazalt.roundFrame(slot); return { pos: f.pos.addScaledVector(f.dir, -ROUNDS.bazalt.L / 2), dir: f.dir, speed: 32 }; }
      if (kind === 'fort') { const f = fort.roundFrame(slot); return { pos: f.pos, dir: f.dir, speed: 28 }; }
      if (kind === 'osa') {
        if (!osa.ready(slot)) {
          const g = osa.rigs[slot % osa.rigs.length], train = Math.atan2(-targetDir.x, -targetDir.z), elev = Math.max(10 * DEG, Math.atan2(targetDir.y, Math.hypot(targetDir.x, targetDir.z)));
          osa.snapUp(slot, { train, elev });
        }
        const f = osa.roundFrame(slot);
        return { pos: f.pos.addScaledVector(f.dir, -ROUNDS.osa.L / 2), dir: f.dir, speed: 70 };
      }
      if (kind === 'ak130' && ak130.rigs.length) {
        // the shell leaves the slot's barrel (they alternate), along its bore
        return { pos: ak130.muzzle(0, slot % 2, V()), dir: ak130.bore(0, V()), speed: AK130_V };
      }
      return null;
    },
    // Called on the simulation's launch event with the round itself.
    animateLaunch(kind, slot = 0, m = null) {
      flights.push({ kind, slot, m, t0: time });
      if (flights.length > 40) flights.shift();
      if (kind === 'bazalt') {
        const t = bazalt.tubes[slot % nB];
        t.loaded = false; t.hold = 7; t.cover = Math.max(t.cover, 0.98); t.coverTarget = 1; t.engine = 0; t.engineTarget = 0;
        if (fx) {
          // the boosters light in the container: fire and smoke out of the mouth along the round's
          // way, and the blast through the gas outlet over the side
          const mouth = toWorld(bazalt.mouth(t.i, V()), V()), dir = t.dir.clone().transformDirection(shipMatrix);
          const deckY = toWorld(V(t.mount.x, deckHeightAt ? deckHeightAt(t.mount.z) : t.mount.y - 4, t.mount.z), _v).y;
          fx.deckLaunch(mouth, dir, deckY, 1.8);
          const vent = toWorld(t.vent, V()), out = V(t.side, -0.55, 0.25).normalize().transformDirection(shipMatrix);
          fx.deckLaunch(vent, out, toWorld(V(t.vent.x, 0.4, t.vent.z), _v).y, 1.25);
        }
      } else if (kind === 'fort') {
        const l = fort.launchers[slot % fort.launchers.length];
        l.loaded[l.cell] = false; l.hold = 2.2; l.lid = Math.max(l.lid, 0.98); l.lidTarget = 1;
      } else if (kind === 'osa') {
        const fr = osa.roundFrame(slot);
        osa.launched(slot);
        if (fx) {
          const mt = fr.mount.mount, tail = toWorld(fr.pos.addScaledVector(fr.dir, -ROUNDS.osa.L / 2), V());
          fx.deckLaunch(tail, fr.dir.clone().transformDirection(shipMatrix), toWorld(V(mt.x, mt.y + 1.3, mt.z), _v).y, 0.45);
        }
      } else if (kind === 'ak130') {
        fireAk130(0, null, slot % 2);
      }
    },
    coldLaunch(m) {
      if (!fx || !m) return;
      const h = toWorld(fort.hatch(fort.launchers[m.slot % fort.launchers.length]), V());
      fx.deckColdLaunch(h, h.y, 1.3);
    },
    ignite(m) {
      if (!fx || !m) return;
      const deckY = toWorld(fort.hatch(fort.launchers[(m.slot ?? 0) % fort.launchers.length]), _v).y;
      fx.airIgnition(m.pos, m.fwd, deckY, 1.5);
    },
    // An AK-630 burst: lay and fire the mount pair nearest the simulation's anchor. Returns the
    // world muzzle position of the leading mount for the tracer.
    ciwsBurst(anchorWorld, targetWorld) {
      const a = toLocal(anchorWorld, V()), t = toLocal(targetWorld, V());
      let best = 0;
      ak630.rigs.forEach((g, i) => { if (ak630.anchor(i).distanceTo(a) < ak630.anchor(best).distanceTo(a)) best = i; });
      const lead = ak630.rigs[best];
      const pair = ak630.rigs.filter((g) => g.mount.group === lead.mount.group && Math.sign(g.mount.x) === Math.sign(lead.mount.x));
      const out = V();
      for (const g of pair) {
        g.burstAim = aimFrom(V(g.mount.x, g.mount.y + 0.8, g.mount.z), t);
        g.burstUntil = time + 0.6;
        g.firing = 0.25;
        if (fx) {
          const mz = toWorld(ak630.muzzle(g.i, V()), V()), dir = V().subVectors(targetWorld, mz).normalize();
          fx.gunBlast(mz, dir, 0.35);
          const range = mz.distanceTo(targetWorld);
          for (let k = 0; k < 2; k++) fx.tracer(mz, _d.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.008).add(dir).normalize(), 1000, range + 50);
          if (g === lead) out.copy(mz);
        }
      }
      // the 130 mm joins in on the same threat when its director has it in its arc
      for (const g of ak130.rigs) {
        if (g.target && time - (g.lastShot ?? -9) > 0.67 && relArc(g.train, g.target.train) < 0.05) { g.lastShot = time; fireAk130(g.i, targetWorld); }
      }
      return out.lengthSq() ? out : anchorWorld.clone();
    },
    // Fire the AK-130 (presentation, or the simulation's gun engagement): the next barrel recoils,
    // with its blast and spent case. Returns the world muzzle position.
    fireGun(kind = 'ak130', targetWorld = null) { return kind === 'ak130' ? fireAk130(0, targetWorld) : null; },
    prepareWeapon() {},
    safeWeapon(kind) { if (kind === 'ak130') manual.ak130 = null; },
    // Lay the AK-130 on a ship-local direction (main.js calls this while an order is active);
    // the order holds for half a second unless renewed. Other kinds follow the order by state.
    aimWeapons(kind, dir, dt) {
      if (kind !== 'ak130' || !dir) return;
      const target = st.designated;
      manual.ak130 = { train: Math.atan2(-dir.x, -dir.z), elev: Math.atan2(dir.y, Math.hypot(dir.x, dir.z)), until: time + 0.5, surface: !target || target.type === 'ship', range: target?.range ?? 12000 };
    },
    getLaunchPoint(kind, slot = 0) {
      const f = kind === 'bazalt' ? bazalt.roundFrame(slot) : kind === 'fort' ? fort.roundFrame(slot) : kind === 'osa' ? osa.roundFrame(slot) : null;
      return f ? f.pos : launchPoints[kind]?.[slot % launchPoints[kind].length]?.clone();
    },
    inspectView,
    buildMissile: buildFlightMissile,
    animate(t = 0, dt = 0, state = {}) {
      dt = Number.isFinite(dt) ? Math.min(0.25, Math.max(0, dt)) : 0;
      time += dt;
      group.updateWorldMatrix(true, false);
      shipMatrix.copy(group.matrixWorld);
      _inv.copy(shipMatrix).invert();
      cutouts.update(shipMatrix);
      st.fc = state.fireControl || null;
      st.auto = !!state.autoDefense;
      st.radar = state.radar !== false;
      st.ammo = state.ammo || {};
      st.tracks = [];
      st.threats = [];
      const ship = state.pos;
      for (const c of state.tracks || []) {
        if (!c.alive) continue;
        const local = toLocal(c.pos, V()), range = ship ? c.pos.distanceTo(ship) : local.length();
        const tr = { id: c.id, type: c.type, local, range, alt: c.pos.y, munition: c.type === 'munition' };
        st.tracks.push(tr);
        if (c.type !== 'ship') st.threats.push(tr);
      }
      st.designated = st.fc?.targetId ? st.tracks.find((c) => c.id === st.fc.targetId) || null : null;
      runBazalt(dt); runFort(dt); runOsa(dt); runGuns(dt);
    },
  };
  return api;
}

export { buildFlightMissile };
