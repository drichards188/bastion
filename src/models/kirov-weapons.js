import * as THREE from 'three';
import * as Exterior from './kirov-exterior.js';
import { WEAPONS } from '../sim.js';
import { V, DEG, Parts, weaponMats, DeckCutouts, LampSet, LAMP } from './weapons/kit.js';
import { buildGranit, GRANIT } from './weapons/granit.js';
import { buildFort, FORT } from './weapons/fort.js';
import { buildOsa } from './weapons/osa.js';
import { buildAk630s, buildAk100s } from './weapons/guns.js';
import { buildDirectors, TOP_DOME } from './weapons/directors.js';
import { buildAsw } from './weapons/asw.js';
import { buildFlightMissile, ROUNDS } from './weapons/missiles.js';

// Kirov's weapons as working machines (1985 fit): 20 P-700 Granit cells, 12 B-203A drums of S-300F
// Fort with their two 3R41 Top Dome directors, two ZIF-122 Osa-M launchers with their 4R33 directors,
// eight AK-630s, two AK-100s with the MR-184 director, Metel, RBU-6000 and RBU-1000. Placed from the
// exterior's MOUNTS table (ship-local metres, bow -Z, waterline Y = 0).
//
// The mechanisms are driven by state, not by scripted clips: every frame the fire-control status, the
// automatic defence's posture and the launches in flight decide what each launcher, gun and director
// should be doing, and each mechanism runs toward that at its own rates. The mapping of the fire-
// control steps (src/fire-control.js) onto the machinery:
//   Granit  ACQUIRE: the solution is built on the bridge (no director moves; the order's lamps show
//           green). PREPARE: LOAD TARGET SOLUTION blinks them amber; FLOOD LAUNCHERS fills the tubes;
//           OPEN LAUNCHER LIDS swings the lids up on their hinge arms. ARM: lamps red. FIRE: each round
//           leaves its tube on its booster at the launcher interval; its lid stays up while the smoke
//           clears, then shuts. ABORT: lids shut and the tubes drain.
//   Fort    ACQUIRE: the Top Dome(s) with the target in their arc slew onto it and hold it. PREPARE:
//           channel lamp; INDEX ROTARY MAGAZINE turns the drums (hatches shut) to bring a loaded
//           container under each hatch; the ejection/ignition check. ARM: the order's hatches open
//           on the loaded containers. FIRE: cold ejection, ignition above the deck; the hatch shuts and
//           that drum indexes its next round. ABORT: hatches shut.
//   Osa     ACQUIRE: the 4R33 director(s) slew onto the target. PREPARE: doors open and the launcher
//           rises with its arms vertical; the arms come down to the firing elevation and the head
//           trains with the director; the guidance check. FIRE: a round leaves its arm. With both arms
//           empty the launcher goes down to reload and comes back up loaded if still needed.
// Under automatic defence the same machinery follows the crew's posture: Top Domes and Pop Groups
// track the nearest air threat in their arcs, the next Fort hatch stands open while a threat is inside
// the envelope, the Osa launchers stand up while a threat is near, the AK-630s follow close threats
// and fire when the simulation fires them. The AK-100s are laid by their director onto the designated
// or nearest threat; their firing is presentation only (the simulation has no AK-100 engagement).

const STAGES_ON = new Set(['tracking', 'tracked', 'preparing', 'ready', 'armed', 'firing']);
const TRAIN_ARC = 150 * DEG; // a Top Dome's clear arc either side of its stowed bearing

const _v = V(), _w = V(), _d = V(), _inv = new THREE.Matrix4();

export function buildWeapons({ mounts = Exterior.MOUNTS, deckHeightAt = Exterior.deckHeightAt } = {}) {
  const M = weaponMats(), group = new THREE.Group();
  group.name = 'kirov-weapons';
  const staticParts = new Parts(M), wellParts = new Parts(M), cutouts = new DeckCutouts(48), lamps = new LampSet(group, 96);
  // the Granit field stands on its plinth unless the exterior already raises the deck there
  const g0 = mounts.granit[0], raise = !deckHeightAt || Math.abs(g0.y - deckHeightAt(g0.z)) < 0.05;
  const granit = buildGranit(group, M, mounts.granit, staticParts, wellParts, cutouts, lamps, { raise });
  const fort = buildFort(group, M, mounts.fort, staticParts, wellParts, cutouts, lamps);
  const osa = buildOsa(group, M, mounts.osa, staticParts, wellParts, cutouts, lamps, { deckHeightAt });
  const ak630 = buildAk630s(group, M, mounts.ak630, staticParts);
  const ak100 = buildAk100s(group, M, mounts.ak100, staticParts);
  const dirs = mounts.directors || {};
  const topDomes = buildDirectors(group, M, 'topDome', dirs.fort || [], staticParts);
  const popGroups = buildDirectors(group, M, 'popGroup', dirs.osa || [], staticParts);
  const kiteScreech = buildDirectors(group, M, 'kiteScreech', dirs.ak100 || [], staticParts);
  // the MR-123 radomes are modelled complete by the exterior when it says so
  const bassTilt = buildDirectors(group, M, 'bassTilt', (dirs.ak630 || []).filter((d) => !d.modelledByExterior), staticParts);
  buildAsw(M, mounts, staticParts);
  staticParts.build(group, { name: 'weapons-static' });
  wellParts.build(group, { name: 'weapons-wells', shadow: false });

  // launch anchors for the simulation's fallback and its choice of AK-630 mount
  const launchPoints = {
    granit: granit.cells.map((c, i) => granit.roundFrame(i).pos),
    fort: fort.launchers.map((l, i) => fort.roundFrame(i).pos),
    osa: [0, 1, 2, 3].map((slot) => osa.roundFrame(slot).pos),
    gun: ak630.rigs.map((g, i) => ak630.anchor(i)),
  };

  let fx = null, time = 0, shipMatrix = new THREE.Matrix4();
  const flights = []; // recent launches: { kind, slot, m (the simulation's round), t0 }
  const st = { fc: null, tracks: [], threats: [], auto: false, radar: true, ammo: {}, designated: null };
  const toLocal = (world, out = V()) => out.copy(world).applyMatrix4(_inv);
  const toWorld = (local, out = V()) => out.copy(local).applyMatrix4(shipMatrix);
  // bearing and elevation (ship terms) from a ship-local point to a ship-local target
  const aimFrom = (from, target) => {
    const d = _w.subVectors(target, from);
    return { train: Math.atan2(-d.x, -d.z), elev: Math.atan2(d.y, Math.hypot(d.x, d.z)), range: d.length() };
  };
  const relArc = (train, stow) => Math.abs(Math.atan2(Math.sin(train - stow), Math.cos(train - stow)));
  const nextSlot = (kind) => WEAPONS[kind].ammo - (st.ammo[kind] ?? WEAPONS[kind].ammo);
  // the slots an order will fire: from the next round on, as many as remain in it
  function orderSlots(kind) {
    const fc = st.fc;
    if (!fc || fc.weapon !== kind || !STAGES_ON.has(fc.stage)) return [];
    const k = fc.stage === 'firing' ? fc.remaining : fc.salvo, from = nextSlot(kind), out = [];
    for (let i = 0; i < k && from + i < WEAPONS[kind].ammo; i++) out.push(from + i);
    return out;
  }
  const blink = (rate = 2.2) => (Math.sin(time * rate * Math.PI * 2) > 0 ? 1 : 0.15);

  // ---------------------------------------------------------------- per weapon

  function runGranit(dt) {
    const fc = st.fc, slots = new Set(orderSlots('granit').map((s) => s % granit.cells.length));
    const on = fc?.weapon === 'granit', stage = fc?.stage, step = fc?.stepIndex ?? -1;
    for (const c of granit.cells) {
      const ordered = on && slots.has(c.i) && c.loaded;
      const open = ordered && ((stage === 'preparing' && step >= 2) || ['ready', 'armed', 'firing'].includes(stage));
      // flooded from the FLOOD LAUNCHERS step on; a launcher left unfired is drained once shut
      if (ordered && ((stage === 'preparing' && step >= 1) || open)) c.flooded = true;
      else if (!ordered && c.lid < 0.01) c.flooded = false;
      c.lidTarget = open || c.hold > 0 ? 1 : 0;
      let col = LAMP.off, k = 1;
      if (ordered) {
        if (stage === 'preparing') { col = LAMP.ready; k = step === 0 ? blink() : step === 1 ? blink(4) : 1; }
        else if (stage === 'ready') col = LAMP.ready;
        else if (stage === 'armed' || stage === 'firing') col = LAMP.armed;
        else if (stage === 'tracked' || stage === 'tracking') col = LAMP.safe;
      }
      if (c.lamp >= 0) lamps.set(c.lamp, col, k);
      // smoke still welling out of an open, emptied tube
      if (fx && !c.loaded && c.hold > 0 && dt > 0) fx.hatchSmoke(toWorld(granit.top(c.i), _v), Math.min(1, c.hold / 4), 1.4);
    }
    granit.update(dt);
  }

  function runFort(dt) {
    const fc = st.fc, on = fc?.weapon === 'fort', stage = fc?.stage, step = fc?.stepIndex ?? -1;
    const n = fort.launchers.length, slots = orderSlots('fort'), next = nextSlot('fort');
    const ordered = new Map(slots.map((s) => [s % n, Math.floor(s / n)]));
    // under automatic defence with a threat inside the envelope the next launcher stands ready
    const alertSlot = st.auto && st.radar && st.threats.some((t) => t.range > WEAPONS.fort.minRange * 0.8 && t.range < WEAPONS.fort.range && t.alt >= WEAPONS.fort.minAlt) && next < WEAPONS.fort.ammo ? next % n : -1;
    for (const l of fort.launchers) {
      // the next round this launcher holds
      const fired = Math.max(0, Math.ceil((next - l.i) / n));
      const cellNext = Math.min(FORT.cells - 1, fired);
      const inOrder = on && ordered.has(l.i);
      // indexing: during PREPARE for the order's launchers, otherwise whenever the hatch is shut
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
      if (fx && l.hold > 0 && dt > 0) fx.hatchSmoke(toWorld(fort.hatch(l), _v), Math.min(1, l.hold / 2.5) * 0.7, 0.6);
    }
    fort.update(dt);
  }

  function runOsa(dt) {
    const fc = st.fc, on = fc?.weapon === 'osa', stage = fc?.stage, step = fc?.stepIndex ?? -1;
    const n = osa.rigs.length, slots = orderSlots('osa'), mountsInOrder = new Set(slots.map((s) => s % n));
    const target = on ? st.designated : null;
    for (const g of osa.rigs) {
      const pos = V(g.mount.x, g.mount.y + 3.3, g.mount.z);
      const manual = on && mountsInOrder.has(g.i) && ['preparing', 'ready', 'armed', 'firing'].includes(stage);
      // automatic posture: up while an air threat is close, laid on the nearest one
      const near = st.auto && st.radar ? nearest(st.threats.filter((t) => t.range < 14000 && t.alt >= 15)) : null;
      if (manual || near) g.until = time + 5;
      g.want = time < (g.until ?? -1) && (st.ammo.osa ?? 1) > 0;
      const aimAt = manual ? target : (on && STAGES_ON.has(stage) && target) || near;
      g.aim = aimAt && (!manual || step >= 1 || stage !== 'preparing') ? aimFrom(pos, aimAt.local) : null;
      let col = LAMP.off, k = 1;
      if (manual) {
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

  // the target a director set should follow: the manual order's, else a live round's, else the posture
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

  function runDirectors(dt) {
    const tFort = directorTarget('fort', WEAPONS.fort.range * 1.05);
    for (const g of topDomes.rigs) {
      const pos = V(g.mount.x, g.mount.y + TOP_DOME.centreY, g.mount.z);
      const aim = tFort ? aimFrom(pos, tFort.local) : null;
      g.target = aim && relArc(aim.train, g.stow) < TRAIN_ARC ? aim : null;
    }
    const tOsa = directorTarget('osa', WEAPONS.osa.range * 1.4);
    for (const g of popGroups.rigs) {
      // each director serves the launcher on its own side
      const mine = flights.filter((f) => f.kind === 'osa' && f.m?.alive && f.slot % osa.rigs.length === g.i).pop();
      const t = (mine && st.tracks.find((c) => c.id === mine.m.targetId)) || tOsa;
      g.target = t ? aimFrom(V(g.mount.x, g.mount.y + 1.5, g.mount.z), t.local) : null;
    }
    // the AK-100s' director: the designated contact inside gun range, else the nearest threat
    const d = st.designated && st.designated.range < 20000 ? st.designated : st.auto ? nearest(st.threats.filter((t) => t.range < 9000)) : null;
    for (const g of kiteScreech.rigs) g.target = d ? aimFrom(V(g.mount.x, g.mount.y + 2, g.mount.z), d.local) : null;
    for (const g of ak100.rigs) {
      const aim = d ? aimFrom(V(g.mount.x, g.mount.y + 1.5, g.mount.z), d.local) : null;
      g.target = aim && relArc(aim.train, g.stow) < 155 * DEG ? aim : null;
    }
    for (const g of ak630.rigs) {
      const pos = V(g.mount.x, g.mount.y + 0.8, g.mount.z);
      const close = st.auto && st.radar ? nearest(st.threats.filter((t) => t.range < 4500 && Math.sign(t.local.x - g.mount.x) === Math.sign(g.mount.side || g.mount.x))) : null;
      if (g.burstAim && time < g.burstUntil) g.target = g.burstAim;
      else g.target = close ? aimFrom(pos, close.local) : null;
    }
    topDomes.update(dt, time); popGroups.update(dt, time); kiteScreech.update(dt, time); bassTilt.update(dt, time);
    ak630.update(dt); ak100.update(dt);
  }

  // ---------------------------------------------------------------- inspection camera

  const cam = { kind: null, eye: V(), target: V(), init: false };
  // ship-local eye and look target for the launcher inspection view of `kind`
  function inspectView(kind, status, dt = 0.016, snap = false) {
    dt = Number.isFinite(dt) ? Math.min(0.25, Math.max(0, dt)) : 0;
    if (snap) cam.init = false;
    const last = flights.filter((f) => f.kind === kind).pop();
    const recent = last && time - last.t0 < (kind === 'fort' ? 5 : 4.5);
    const slot = recent ? last.slot : nextSlot(kind);
    const eye = V(), look = V();
    // during acquisition the shot is the director slewing onto the track
    const acquiring = status && (status.stage === 'tracking' || status.stage === 'tracked') && status.weapon === kind;
    const dir = acquiring && (kind === 'fort' ? topDomes.rigs.find((g) => g.target) || topDomes.rigs[0] : kind === 'osa' ? popGroups.rigs[slot % Math.max(1, popGroups.rigs.length)] : null);
    if (dir) {
      const d = dir.mount, aft = d.z > 0 ? 1 : -1, sx = d.x < -0.1 ? -1 : 1;
      const h = kind === 'fort' ? TOP_DOME.centreY : 1.5;
      eye.set(d.x + sx * (kind === 'fort' ? 13 : 7), d.y + h + (kind === 'fort' ? 5 : 3), d.z + aft * (kind === 'fort' ? 15 : 8));
      look.set(d.x, d.y + h, d.z);
    } else if (kind === 'granit') {
      const c = granit.cells[slot % granit.cells.length], p = V(c.mount.x, c.y, c.mount.z), sx = c.mount.x < 0 ? -1 : 1;
      // from forward and outboard, low enough to look into the opening and the tube's mouth
      eye.set(p.x + sx * 7.5, p.y + 6.5, p.z - 11);
      look.set(p.x, p.y - 0.6, p.z - 0.4);
    } else if (kind === 'fort') {
      const l = fort.launchers[slot % fort.launchers.length], h = V(l.mount.x, l.mount.y, l.mount.z), sx = l.mount.x < -0.1 ? -1 : 1;
      eye.set(h.x + sx * 6.5, h.y + 7.5, h.z - 8.5);
      look.set(h.x, h.y - 0.3, h.z);
    } else {
      const g = osa.rigs[slot % osa.rigs.length], p = V(g.mount.x, g.mount.y + 1.3, g.mount.z), sx = g.side;
      // from forward and outboard of the bay (the 4R33 stands inboard of it), so the open doors, the
      // rising launcher and the laid arms all show against the superstructure
      eye.set(p.x + sx * 5, p.y + 4.8, p.z - 8.5);
      look.set(p.x, p.y + 1.4 * g.lift + 0.2, p.z - 0.4);
    }
    // follow a round just launched up out of its cell, keeping the launcher in the frame, then come
    // back down to the next one
    if (recent && last.m) {
      const age = time - last.t0, w = Math.min(1, age / 0.4) * Math.max(0, 1 - Math.max(0, age - 2.8) / 1.4);
      const m = toLocal(last.m.pos, V());
      if (w > 0 && m.distanceTo(look) < 4000) {
        eye.sub(look).multiplyScalar(1 + 0.45 * w).add(look);
        const dl = V().subVectors(look, eye), dist = dl.length();
        dl.divideScalar(dist);
        const dm = V().subVectors(m, eye).normalize(), ang = Math.acos(Math.max(-1, Math.min(1, dl.dot(dm))));
        // both in view while they fit; beyond that the launcher sits at the frame's edge
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
    group, launchPoints, cutouts, mounts,
    parts: { granit, fort, osa, ak630, ak100, topDomes, popGroups, kiteScreech },
    attachFx(f) { fx = f; },
    // The simulation's launch-frame hook: ship-local tail position and bore for the round in `slot`.
    launchFrame(kind, slot, targetDir) {
      if (kind === 'granit') { const f = granit.roundFrame(slot); return { pos: f.pos.addScaledVector(f.dir, -ROUNDS.granit.L / 2), dir: f.dir, speed: 30 }; }
      if (kind === 'fort') { const f = fort.roundFrame(slot); return { pos: f.pos, dir: f.dir, speed: 28 }; }
      if (kind === 'osa') {
        // a launcher still in its well is brought up and laid at once: the order came from the crew
        if (!osa.ready(slot)) {
          const g = osa.rigs[slot % osa.rigs.length], train = Math.atan2(-targetDir.x, -targetDir.z), elev = Math.max(10 * DEG, Math.atan2(targetDir.y, Math.hypot(targetDir.x, targetDir.z)));
          osa.snapUp(slot, { train, elev });
        }
        const f = osa.roundFrame(slot);
        return { pos: f.pos.addScaledVector(f.dir, -ROUNDS.osa.L / 2), dir: f.dir, speed: 70 };
      }
      return null;
    },
    // Called on the simulation's launch event with the round itself.
    animateLaunch(kind, slot = 0, m = null) {
      const f = { kind, slot, m, t0: time };
      flights.push(f);
      if (flights.length > 40) flights.shift();
      if (kind === 'granit') {
        const c = granit.cells[slot % granit.cells.length];
        c.loaded = false; c.hold = 6; c.lid = Math.max(c.lid, 0.98); c.lidTarget = 1;
        if (fx) {
          const mouth = toWorld(granit.mouth(c.i), V()), dir = V(0, Math.sin(GRANIT.incline), -Math.cos(GRANIT.incline)).transformDirection(shipMatrix);
          fx.deckLaunch(mouth, dir, toWorld(granit.top(c.i), _v).y, 1.6);
        }
      } else if (kind === 'fort') {
        const l = fort.launchers[slot % fort.launchers.length];
        // an automatic launch can come with the hatch still shut: it is thrown open with the round
        l.loaded[l.cell] = false; l.hold = 2.2; l.lid = Math.max(l.lid, 0.98); l.lidTarget = 1;
      } else if (kind === 'osa') {
        const fr = osa.roundFrame(slot);
        osa.launched(slot);
        if (fx) {
          const mt = fr.mount.mount, tail = toWorld(fr.pos.addScaledVector(fr.dir, -ROUNDS.osa.L / 2), V());
          fx.deckLaunch(tail, fr.dir.clone().transformDirection(shipMatrix), toWorld(V(mt.x, mt.y + 1.3, mt.z), _v).y, 0.45);
        }
      }
    },
    // The 5V55 blown out of its container (the simulation's coldLaunch event): gas out of the hatch.
    coldLaunch(m) {
      if (!fx || !m) return;
      const h = toWorld(fort.hatch(fort.launchers[m.slot % fort.launchers.length]), V());
      fx.deckColdLaunch(h, h.y, 1.4);
    },
    // The 5V55's motor lighting (the simulation's ignite event), its wash reaching the deck below.
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
          // a couple of tracers from each mount in the burst, a little dispersed
          const range = mz.distanceTo(targetWorld);
          for (let k = 0; k < 2; k++) fx.tracer(mz, _d.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.008).add(dir).normalize(), 1000, range + 50);
          if (g === lead) out.copy(mz);
        }
      }
      // the 100 mm guns join in on the same threat when their director has it in their arcs
      for (const g of ak100.rigs) {
        if (g.target && time - (g.lastShot ?? -9) > 1 && relArc(g.train, g.target.train) < 0.05) {
          g.lastShot = time; ak100.fire(g.i);
          if (fx) {
            const mz = toWorld(ak100.muzzle(g.i, V()), V()), port = toWorld(ak100.port(g.i, V()), V());
            fx.gunBlast(mz, V().subVectors(targetWorld, mz).normalize(), 1.3);
            // the spent 100 mm case is thrown out forward and down from the port under the embrasure
            const out = V().subVectors(mz, port).setY(0).normalize().multiplyScalar(3 + Math.random()).add(V(0, -1.5, 0));
            fx.brass(port, out, 0.11, 0.58);
          }
        }
      }
      return out.lengthSq() ? out : anchorWorld.clone();
    },
    // Compatibility with the previous exterior API (main.js calls these).
    prepareWeapon() {},
    safeWeapon() {},
    aimWeapons() {},
    getLaunchPoint(kind, slot = 0) {
      const f = kind === 'granit' ? granit.roundFrame(slot) : kind === 'fort' ? fort.roundFrame(slot) : kind === 'osa' ? osa.roundFrame(slot) : null;
      return f ? f.pos : launchPoints[kind]?.[slot % launchPoints[kind].length]?.clone();
    },
    inspectView,
    buildMissile: buildFlightMissile,
    // Per frame: time, dt (simulation time, 0 when paused), state = player plus tracks and fire control.
    animate(t = 0, dt = 0, state = {}) {
      // (the game's first frame can hand in a negative or stale step; the mechanisms only run forward)
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
        const t = { id: c.id, type: c.type, local, range, alt: c.pos.y, munition: c.type === 'munition' };
        st.tracks.push(t);
        if (c.type !== 'ship') st.threats.push(t);
      }
      st.designated = st.fc?.targetId ? st.tracks.find((c) => c.id === st.fc.targetId) || null : null;
      runGranit(dt); runFort(dt); runOsa(dt); runDirectors(dt);
    },
  };
  return api;
}

export { buildFlightMissile };
