import * as THREE from 'three';

// Ride a missile, Drumfire style (its ChaseCamera.followShell): the camera sits behind and above the
// round, looking a little ahead along its path; dragging orbits round it and the wheel zooms. When the
// round is gone (hit, miss or shot down) a fixed "tripod" shot holds on the burst for a few seconds from
// the side it came from, then onEnd(point) hands the camera back.
//
//   const follow = new MissileFollow(camera, { seaLevel: (x, z) => ocean.heightAt(x, z) });
//   follow.start(missile, { onEnd, aim, ship })  missile: { pos, prev?, vel, alive } (sim missile);
//                                              aim() -> where it is going, ship() -> the launching ship
//                                              (both optional Vector3 getters, used while it climbs out)
//   follow.update(dt, alpha)                   every frame; alpha interpolates prev -> pos between sim steps
//   follow.orbit(dx, dy), follow.zoom(deltaY)  pointer drag (pixels) and wheel
//   follow.stop()                              release at once (no tripod, no onEnd)
//   follow.mode                                'ride' | 'tripod' | null

const _f = new THREE.Vector3(), _h = new THREE.Vector3();
// Clear of Kirov's masts while a round climbs out of its cell.
const SHIP_CLEAR_RADIUS = 160, SHIP_CLEAR_HEIGHT = 62;

export class MissileFollow {
  constructor(camera, { seaLevel = () => 0 } = {}) {
    this.camera = camera;
    this.seaLevel = seaLevel;
    this.ride = null;
    this.tripod = null;
    this.focus = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.dist = 45;
    this.goalDist = 45;
  }

  get mode() {
    return this.tripod ? 'tripod' : this.ride ? 'ride' : null;
  }

  get missile() {
    return this.ride?.obj ?? null;
  }

  start(missile, { onEnd = null, aim = null, ship = null } = {}) {
    this.tripod = null;
    const dir = missile.vel.clone();
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
    this.ride = { obj: missile, onEnd, aim, ship, yaw: 0, pitch: 0.22, last: missile.pos.clone(), dir: dir.normalize(), dead: 0 };
    // Cold-launched and boosting rounds start slow and close to the ship: begin near, then settle back.
    this.dist = 30;
    this.goalDist = 45;
    this.focus.copy(missile.pos);
  }

  stop() {
    this.ride = null;
    this.tripod = null;
  }

  orbit(dx, dy) {
    if (!this.ride) return;
    this.ride.yaw -= dx * 0.005;
    this.ride.pitch = THREE.MathUtils.clamp(this.ride.pitch + dy * 0.004, -0.6, 1.3);
  }

  zoom(deltaY) {
    this.goalDist = THREE.MathUtils.clamp(this.goalDist * Math.exp(deltaY * 0.001), 12, 600);
  }

  update(dt, alpha = 1) {
    if (this.tripod) return this.updateTripod(dt);
    if (this.ride) return this.updateRide(dt, alpha);
    return false;
  }

  updateRide(dt, alpha) {
    const S = this.ride, o = S.obj;
    if (o.alive) {
      if (o.prev) S.last.lerpVectors(o.prev, o.pos, THREE.MathUtils.clamp(alpha, 0, 1));
      else S.last.copy(o.pos);
      if (o.vel.lengthSq() > 1) S.dir.lerp(_f.copy(o.vel).normalize(), 1 - Math.exp(-dt * 5)).normalize();
    } else S.dead += dt;
    this.focus.copy(S.last);
    this.dist += (this.goalDist - this.dist) * (1 - Math.exp(-dt * 3));

    // Behind the flight path, raised by the pitch and swung by the player's orbit.
    const dir = S.dir;
    // A round going nearly straight up (Fort's cold launch, a booster pitching over) has no "behind":
    // take the horizontal from where it is heading instead, and stay above its path.
    _h.set(dir.x, 0, dir.z);
    const steep = _h.length() < 0.5;
    if (steep && S.aim) {
      const a = S.aim();
      if (a) _h.set(a.x - this.focus.x, 0, a.z - this.focus.z);
    }
    if (_h.lengthSq() < 1e-6) _h.set(0, 0, -1);
    _h.normalize();
    const yaw = Math.atan2(-_h.x, -_h.z) + S.yaw;
    const baseElev = steep ? 0.35 : Math.atan2(-dir.y, Math.max(Math.hypot(dir.x, dir.z), 1e-3));
    const el = THREE.MathUtils.clamp(baseElev + S.pitch, -0.4, 1.5);
    const cp = Math.cos(el), cam = this.camera.position;
    cam.set(this.focus.x + Math.sin(yaw) * cp * this.dist, this.focus.y + Math.sin(el) * this.dist, this.focus.z + Math.cos(yaw) * cp * this.dist);
    let floor = this.seaLevel(cam.x, cam.z) + 3;
    const ship = S.ship?.();
    if (ship && Math.hypot(cam.x - ship.x, cam.z - ship.z) < SHIP_CLEAR_RADIUS) floor = Math.max(floor, ship.y + SHIP_CLEAR_HEIGHT);
    if (cam.y < floor) cam.y = floor;
    // Look a little ahead so the way it is going shows.
    this.lookAt.copy(this.focus).addScaledVector(steep ? _h : dir, this.dist * 0.45);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.lookAt);

    if (!o.alive && S.dead > 0.05) {
      const point = this.focus.clone(), onEnd = S.onEnd;
      this.ride = null;
      // The tripod stands back along the path it came in on, off to one side, a little above the sea.
      const back = _f.set(-dir.x, 0, -dir.z);
      if (back.lengthSq() < 0.04) back.set(1, 0, 0);
      back.normalize();
      const from = new THREE.Vector3(point.x + back.x * 260 - back.z * 95, 0, point.z + back.z * 260 + back.x * 95);
      from.y = Math.max(this.seaLevel(from.x, from.z) + 14, point.y - 25);
      this.tripod = { point, from, t: 0, seconds: 4, onEnd };
    }
    return true;
  }

  updateTripod(dt) {
    const T = this.tripod;
    T.t += dt;
    const cam = this.camera.position;
    cam.copy(T.from).lerp(T.point, Math.min(0.08, T.t * 0.015));
    this.lookAt.copy(T.point);
    this.lookAt.y += 10 + Math.min(40, T.t * 10);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.lookAt);
    if (T.t >= T.seconds) {
      this.tripod = null;
      T.onEnd?.(T.point);
      return false;
    }
    return true;
  }
}
