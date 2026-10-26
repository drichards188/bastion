import * as THREE from 'three';
import { V, box, xf, yTube, zTube, xTube, sphere, rod, Parts, TAU } from './kit.js';

// INTERIM inline weapons for buildExterior({ weapons: true }): simple, correctly placed stand-ins
// (hatch lids that open, Osa rails that rise, guns and Top Domes that train) so the exterior preview
// and the old API keep working on their own. The game builds the exterior with weapons:false and
// uses the working machinery of src/models/kirov-weapons.js, placed from the same MOUNTS table.

const P_ = Math.PI;

export function buildInlineWeapons(root, M, MOUNTS) {
  const g = new THREE.Group();
  g.name = 'kirov-weapons-inline';
  root.add(g);
  const S = new Parts(M);
  const launchPoints = { granit: [], fort: [], osa: [], gun: [] };
  const lids = { granit: [], fort: [] };
  const osas = [], guns = [], bigGuns = [], domes = [];
  const directions = {};

  const pivot = (x, y, z, parent = g) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };
  // the exterior materials use vertex colours (tints), so plain meshes get a white colour attribute
  const solid = (parent, key, geom) => {
    const n = geom.attributes.position.count;
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    const m = new THREE.Mesh(geom, M[key]); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };

  // Granit cells: a coaming on the deck and a lid hinged at its aft edge
  for (const c of MOUNTS.granit) {
    const [w, l] = c.footprint;
    S.add('dark', box(w, 0.14, l, c.x, c.y + 0.07, c.z));
    const hinge = pivot(c.x, c.y + 0.16, c.z + l / 2);
    solid(hinge, 'paint', box(w - 0.12, 0.12, l - 0.12, 0, 0.06, -l / 2));
    lids.granit.push({ pivot: hinge, t: 0, prepared: false });
    launchPoints.granit.push(V(c.x, c.y + 0.5, c.z));
  }
  // Fort hatches: round lid on a hinge, aperture over the drum
  for (const c of MOUNTS.fort) {
    S.add('dark', yTube(c.y, c.y + 0.12, 1.25, 1.25, 20, c.x, c.z));
    const hinge = pivot(c.x, c.y + 0.14, c.z + 0.6);
    solid(hinge, 'paint', yTube(0, 0.1, 0.55, 0.55, 18, 0, -0.6));
    lids.fort.push({ pivot: hinge, t: 0, prepared: false });
    launchPoints.fort.push(V(c.x, c.y + 0.4, c.z));
  }
  // Osa-M: tub, and a twin-arm launcher that rises out of it
  for (const c of MOUNTS.osa) {
    S.add('paint', yTube(c.y, c.y + 1.3, c.tubRadius, c.tubRadius, 8, c.x, c.z));
    const rootO = pivot(c.x, c.y + 0.4, c.z);
    const train = pivot(0, 0.6, 0, rootO), elev = pivot(0, 0.5, 0, train);
    solid(train, 'paint', yTube(-0.6, 0.4, 0.5, 0.5, 12));
    const rounds = [];
    for (const sx of [-1.0, 1.0]) {
      solid(elev, 'dark', box(0.14, 0.14, 3.2, sx, 0, -0.3));
      const r = pivot(sx, 0.18, -0.3, elev);
      solid(r, 'white', zTube(1.4, -1.6, 0.11, 0.11, 10));
      rounds.push({ group: r, reload: 0 });
    }
    osas.push({ root: rootO, base: c.y + 0.4, train, elev, rounds, t: 0, prepared: false, reload: 0 });
    for (const r of rounds) launchPoints.osa.push(V(c.x + r.group.position.x, c.y + 1.6, c.z));
  }
  // AK-630: drum mount with six barrels on a train pivot
  for (const c of MOUNTS.ak630) {
    const base = pivot(c.x, c.y, c.z);
    solid(base, 'paint', yTube(0, 0.5, 0.9, 0.8, 18));
    const train = pivot(0, 0.5, 0, base);
    solid(train, 'paint', sphere(0.85, 0, 0.3, 0, 1, 0.75, 1, 16));
    const barrel = pivot(0, 0.45, -0.4, train), rotor = pivot(0, 0, 0, barrel);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; solid(rotor, 'steel', zTube(0, -1.7, 0.04, 0.04, 6, Math.sin(a) * 0.1, Math.cos(a) * 0.1)); }
    train.rotation.y = c.ry;
    guns.push({ train, barrel, rotor, side: c.side, ry: c.ry, fire: 0 });
    launchPoints.gun.push(V(c.x + c.side * 1.5, c.y + 1.0, c.z));
  }
  // AK-100: turret and barrel on an elevation pivot
  for (const c of MOUNTS.ak100) {
    const train = pivot(c.x, c.y, c.z);
    solid(train, 'paint', box(3.2, 2.2, 4.0, 0, 1.1, 0.3));
    const elev = pivot(0, 1.4, -1.6, train);
    solid(elev, 'steel', zTube(0, -5.2, 0.12, 0.1, 10));
    train.rotation.y = c.ry;
    bigGuns.push({ train, elev, ry: c.ry });
  }
  // Top Domes: hemispherical radome on a turntable
  for (const c of MOUNTS.directors.fort) {
    const train = pivot(c.x, c.y, c.z);
    solid(train, 'radome', sphere(2.2, 0, 2.0, 0, 1, 1, 1, 24));
    solid(train, 'paint', yTube(0, 0.9, 1.6, 1.6, 18));
    train.rotation.y = c.ry;
    domes.push({ train, ry: c.ry });
  }
  S.build(g, { name: 'inline-weapons' });

  const animateLaunch = (kind, slot = 0) => {
    const list = lids[kind];
    if (list?.length) { const l = list[slot % list.length]; l.t = 4; l.prepared = false; }
    if (kind === 'osa' && osas.length) {
      const o = osas[slot % osas.length], r = o.rounds[Math.floor(slot / 2) % 2];
      o.t = 2.3; r.reload = 8; r.group.visible = false; o.reload = 8;
    }
  };
  const safeWeapon = (kind) => {
    for (const l of lids[kind] || []) l.prepared = false;
    if (kind === 'osa') for (const o of osas) o.prepared = false;
    delete directions[kind];
  };
  const prepareWeapon = (kind, slot = 0) => {
    safeWeapon(kind);
    if (lids[kind]?.length) lids[kind][slot % lids[kind].length].prepared = true;
    if (kind === 'osa' && osas.length) osas[slot % osas.length].prepared = true;
  };
  const turn = (obj, target, step) => {
    const d = Math.atan2(Math.sin(target - obj.rotation.y), Math.cos(target - obj.rotation.y));
    obj.rotation.y += THREE.MathUtils.clamp(d, -step, step);
  };
  const aimWeapons = (kind, dir, dt = 0.016) => {
    if (!dir) return;
    const d = V(dir.x, dir.y, dir.z).normalize();
    directions[kind] = d;
    const train = Math.atan2(-d.x, -d.z), el = Math.atan2(d.y, Math.hypot(d.x, d.z));
    const step = Math.max(0.01, dt) * 1.6;
    if (kind === 'fort') for (const o of domes) turn(o.train, train, step * 0.5);
    if (kind === 'osa') for (const o of osas) { turn(o.train, train, step); o.elev.rotation.x += THREE.MathUtils.clamp(el - o.elev.rotation.x, -step, step); }
    if (kind === 'gun') for (const o of guns) { o.fire = 0.22; turn(o.train, train, step); o.barrel.rotation.x += THREE.MathUtils.clamp(el - o.barrel.rotation.x, -step, step); }
    if (kind === 'ak100') for (const o of bigGuns) { turn(o.train, train, step); o.elev.rotation.x += THREE.MathUtils.clamp(el - o.elev.rotation.x, -step, step); }
  };
  const animate = (time = 0, dt = 0) => {
    for (const list of Object.values(lids)) for (const l of list) {
      l.t = Math.max(0, l.t - dt);
      const target = l.prepared || l.t > 0.7 ? -1.2 : -1.2 * l.t / 0.7;
      l.pivot.rotation.x += THREE.MathUtils.clamp(target - l.pivot.rotation.x, -dt * 1.7, dt * 1.7);
    }
    for (const o of osas) {
      o.t = Math.max(0, o.t - dt); o.reload = Math.max(0, o.reload - dt);
      for (const r of o.rounds) { r.reload = Math.max(0, r.reload - dt); r.group.visible = r.reload === 0; }
      const up = o.prepared || o.t > 0 ? 1.4 : 0;
      o.root.position.y += (o.base + up - o.root.position.y) * (1 - Math.exp(-dt * 2));
      if (!directions.osa) o.elev.rotation.x += ((up ? 0.5 : 0.05) - o.elev.rotation.x) * (1 - Math.exp(-dt * 2));
    }
    for (const o of guns) { o.fire = Math.max(0, o.fire - dt); if (o.fire > 0) o.rotor.rotation.z += dt * 60; }
    if (!directions.gun) for (const o of guns) { o.train.rotation.y = o.ry; o.barrel.rotation.x = 0.08; }
    if (!directions.fort) for (const o of domes) o.train.rotation.y = o.ry + Math.sin(time * 0.08) * 0.25;
    if (!directions.ak100) for (const o of bigGuns) o.elev.rotation.x = 0.08;
  };
  const getLaunchPoint = (kind, slot = 0) => {
    const pts = launchPoints[kind];
    return pts?.[slot % pts.length]?.clone();
  };
  return { group: g, launchPoints, animate, animateLaunch, prepareWeapon, aimWeapons, safeWeapon, getLaunchPoint };
}
void xf; void xTube; void rod; void P_;
