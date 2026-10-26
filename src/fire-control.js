import { WEAPONS, ANTI_SHIP } from './sim.js';

// A player-facing command workflow, not a reproduction of classified Soviet drills.
// Public mechanics inform the distinct preparation steps. All timings here are game timings.
// Each step is shown on the ship by the weapons model (src/models/kirov-weapons.js): Granit's
// launchers are flooded before launch (Kuzin; militaryrussia.ru) and their lids then open; Fort's
// drums index under shut hatches; Osa's launcher rises out of its magazine and is laid.
const CONFIG = Object.freeze({
  granit: { acquire: 3, steps: [ ['LOAD TARGET SOLUTION', 3], ['FLOOD LAUNCHERS', 2], ['OPEN LAUNCHER LIDS', 3] ] },
  // Slava's Bazalt: covers before engines, since the running turbojet needs air; the engines are
  // brought up in the container before launch (testpilot.ru quoting the KBSM history).
  bazalt: { acquire: 3, steps: [ ['LOAD TARGET DESIGNATION', 3], ['OPEN CONTAINER COVERS', 2.5], ['START SUSTAINER ENGINES', 4] ] },
  fort: { acquire: 2, steps: [ ['ASSIGN FIRE-CONTROL CHANNEL', 1.5], ['INDEX ROTARY MAGAZINE', 2], ['CHECK EJECTION / IGNITION', 1.5] ] },
  osa: { acquire: 1.5, steps: [ ['RAISE LAUNCHER FROM MAGAZINE', 2.5], ['TRAIN LAUNCHER / DIRECTOR', 2], ['CHECK COMMAND GUIDANCE', 2] ] },
});
const ACTIVE = new Set(['tracking', 'tracked', 'preparing', 'ready', 'armed', 'firing']);
const EDITABLE = new Set(['idle', 'tracked', 'ready', 'armed', 'complete', 'aborted']);
const ok = reason => ({ ok: true, reason });
const no = reason => ({ ok: false, reason });

export class FireControl {
  constructor(sim) {
    this.sim = sim;
    this.events = {};
    this.onChange = null;
    this.state = { stage: 'idle', weapon: 'granit', targetId: null, salvo: 1, remaining: 1,
      profile: 'auto', progress: 0, reason: 'Designate a surface contact', steps: [], stepIndex: -1,
      stepLabel: 'AWAITING DESIGNATION', elapsed: 0, duration: 0, fired: 0 };
    this._announcedStep = -1;
  }

  _emit(name, payload = this.status()) {
    this.events[name]?.(payload);
    if (name === 'change') this.onChange?.(payload);
  }

  _stage(stage, reason, duration = 0) {
    Object.assign(this.state, { stage, reason, duration, elapsed: 0, progress: 0 });
    if (stage === 'ready' || stage === 'armed' || stage === 'complete') this.state.progress = 1;
    this.state.stepLabel = reason;
    this._emit('change');
  }

  _release() {
    if (this.sim.manualFireTargetId === this.state.targetId) this.sim.manualFireTargetId = null;
  }

  _claim() {
    if (!ANTI_SHIP.has(this.state.weapon)) this.sim.manualFireTargetId = this.state.targetId;
  }

  _valid({ cooldown = false, inventory = true } = {}) {
    const s = this.state, sim = this.sim, p = sim.player;
    if (!sim.running || sim.result) return no('Battle is not active');
    if (sim.paused) return no('Battle paused');
    const t = sim.contacts.find(c => c.id === s.targetId);
    if (!t?.alive) return no('Designate a live contact');
    if (!t.detected) return no('Track lost — reacquire the contact');
    if (!(this.sim.player.ammo[s.weapon] >= 0)) return no(`${WEAPONS[s.weapon]?.name || s.weapon} is not fitted to this ship`);
    if (ANTI_SHIP.has(s.weapon) !== (t.type === 'ship')) return no(ANTI_SHIP.has(s.weapon) ? `${s.weapon === 'bazalt' ? 'Bazalt' : 'Granit'} requires a surface contact` : 'Designate an aircraft or incoming missile');
    if (!ANTI_SHIP.has(s.weapon) && (!p.radar || p.systems.radar < 15)) return no('Radar support lost — sequence safed');
    // Check geometry independently: sim.canFire reports a cycling launcher before range gates.
    const envelope = WEAPONS[s.weapon], range = p.pos.distanceTo(t.pos);
    if (range < envelope.minRange) return no(`Inside minimum range · ${envelope.minRange / 1000} km`);
    if (range > envelope.range) return no(`Beyond ${envelope.range / 1000} km envelope`);
    if (!ANTI_SHIP.has(s.weapon)) {
      if (t.pos.y < envelope.minAlt || t.pos.y > envelope.maxAlt) return no(`Outside ${envelope.minAlt}–${envelope.maxAlt} m altitude envelope`);
      const radarHorizon = 4120 * (Math.sqrt(35) + Math.sqrt(Math.max(0, t.pos.y)));
      if (range > radarHorizon) return no('Target below radar horizon');
    }
    if (p.systems.weapons < 15) return no('Weapons systems disabled');
    const required = s.stage === 'firing' ? s.remaining : s.salvo;
    if (inventory && p.ammo[s.weapon] < required) return no(`Insufficient ammunition for ${required}-round order`);
    const result = sim.canFire(s.weapon, s.targetId);
    // Mechanical preparation and arming may overlap the previous launcher cycle.
    if (!cooldown && !result.ok && /^Launcher cycling/.test(result.reason)) return ok('Launcher cycling; preparation permitted');
    return result;
  }

  setWeapon(kind) {
    if (!CONFIG[kind]) return no('Unknown controllable weapon');
    if (kind === this.state.weapon) return ok('Weapon unchanged');
    this._release();
    Object.assign(this.state, { weapon: kind, remaining: this.state.salvo, fired: 0, steps: [], stepIndex: -1 });
    this._stage('idle', 'Weapon changed — acquire target again');
    return ok('Weapon selected');
  }

  designate(id) {
    if (id === this.state.targetId) return ok('Contact unchanged');
    this._release();
    Object.assign(this.state, { targetId: id, remaining: this.state.salvo, fired: 0, steps: [], stepIndex: -1 });
    this._stage('idle', id == null ? 'Select a contact on the radar' : 'Contact designated — acquire track');
    return ok('Contact designated');
  }

  setSalvo(n) {
    if (!Number.isInteger(n) || n < 1 || n > 4) return no('Choose a salvo of 1 to 4 rounds');
    if (!EDITABLE.has(this.state.stage)) return no('Abort the active sequence before changing its salvo');
    if (n === this.state.salvo) return ok('Salvo unchanged');
    Object.assign(this.state, { salvo: n, remaining: n, fired: 0 });
    if (['ready', 'armed'].includes(this.state.stage)) this._stage('tracked', 'Salvo changed — prepare the new order');
    else this._emit('change');
    return ok(`${n}-round salvo selected`);
  }

  setProfile(profile) {
    if (!['auto', 'low', 'high'].includes(profile)) return no('Unknown Granit flight profile');
    if (!ANTI_SHIP.has(this.state.weapon)) return no('Flight profile applies to anti-ship missiles only');
    if (!EDITABLE.has(this.state.stage)) return no('Abort the active sequence before changing its profile');
    if (profile === this.state.profile) return ok('Profile unchanged');
    this.state.profile = profile;
    if (['ready', 'armed'].includes(this.state.stage)) this._stage('tracked', 'Profile changed — load a new flight solution');
    else this._emit('change');
    return ok('Flight profile selected');
  }

  acquire() {
    if (!['idle', 'aborted', 'complete', 'tracked'].includes(this.state.stage)) return no('Acquisition already complete or in progress');
    const check = this._valid(); if (!check.ok) return check;
    this._claim();
    this.state.remaining = this.state.salvo; this.state.fired = 0;
    this.state.steps = []; this.state.stepIndex = -1;
    const target = this.sim.contacts.find(c => c.id === this.state.targetId);
    this._stage('tracking', ANTI_SHIP.has(this.state.weapon) && target?.intel ? 'CORRELATING RECONNAISSANCE TRACK' : 'ACQUIRING DIRECTOR TRACK', CONFIG[this.state.weapon].acquire);
    this._emit('acquire');
    return ok('Acquiring target');
  }

  prepare() {
    if (this.state.stage !== 'tracked') return no('Acquire and confirm a track before preparation');
    const check = this._valid(); if (!check.ok) return check;
    this.state.steps = CONFIG[this.state.weapon].steps.map(([label, duration]) => ({ label, duration }));
    this.state.stepIndex = 0; this._announcedStep = -1;
    const duration = this.state.steps.reduce((sum, step) => sum + step.duration, 0);
    this._stage('preparing', this.state.steps[0].label, duration);
    this._emit('prepare', { ...this.status(), kind: this.state.weapon, targetId: this.state.targetId });
    return ok('Preparation started');
  }

  arm() {
    if (this.state.stage !== 'ready') return no('Weapon preparation must be complete before arming');
    const check = this._valid(); if (!check.ok) return check;
    this._stage('armed', 'ARMED — AWAITING COMMAND AUTHORIZATION');
    this._emit('arm');
    return ok('Weapon armed');
  }

  authorize() {
    if (this.state.stage !== 'armed') return no('Prepare and arm the weapon before authorizing fire');
    const check = this._valid({ cooldown: true }); if (!check.ok) return check;
    this.state.remaining = this.state.salvo;
    this.state.fired = 0;
    this._stage('firing', 'SALVO AUTHORIZED');
    this._emit('authorize');
    return this._fireOne();
  }

  _fireOne() {
    const s = this.state;
    const check = this._valid({ cooldown: true });
    if (!check.ok) {
      if (/^Launcher cycling/.test(check.reason)) { s.reason = check.reason; s.stepLabel = 'WAITING FOR LAUNCHER CYCLE'; return check; }
      this.abort(check.reason); return check;
    }
    const launched = this.sim.fire(s.weapon, s.targetId);
    if (!launched.ok) { this.abort(launched.reason); return launched; }
    if (launched.missile && ANTI_SHIP.has(s.weapon)) launched.missile.profile = s.profile;
    s.remaining--; s.fired++; s.progress = s.fired / s.salvo;
    s.reason = `${s.weapon.toUpperCase()} AWAY — ${s.fired}/${s.salvo}`;
    s.stepLabel = s.remaining ? 'SALVO IN PROGRESS' : 'LAUNCH ORDER COMPLETE';
    this._emit('fire', launched.missile);
    if (s.remaining === 0) {
      this._release(); this._stage('complete', 'LAUNCH ORDER COMPLETE — ASSESS TARGET');
      this._emit('complete');
    } else this._emit('change');
    return { ...launched, reason: s.reason };
  }

  abort(reason = 'SEQUENCE ABORTED — WEAPON SAFE') {
    this._release();
    this.state.steps = []; this.state.stepIndex = -1;
    this._stage('aborted', reason);
    this._emit('abort');
    return ok(reason);
  }

  update(dt) {
    const s = this.state;
    if (!Number.isFinite(dt) || dt <= 0 || this.sim.paused || !ACTIVE.has(s.stage)) return;
    if (!this.sim.running || this.sim.result) { this.abort('Battle ended — weapon safe'); return; }
    const check = this._valid();
    if (!check.ok) {
      const target = this.sim.contacts.find(c => c.id === s.targetId);
      if (s.stage === 'firing' && target && !target.alive) {
        this._release(); this._stage('complete', 'CEASE FIRE — TARGET NEUTRALIZED'); this._emit('complete');
      } else this.abort(check.reason);
      return;
    }
    if (s.stage === 'tracking' || s.stage === 'preparing') {
      s.elapsed = Math.min(s.duration, s.elapsed + dt);
      s.progress = Math.min(1, s.elapsed / s.duration);
      if (s.stage === 'preparing') {
        let cumulative = 0;
        for (let i = 0; i < s.steps.length; i++) {
          cumulative += s.steps[i].duration;
          if (s.elapsed < cumulative || i === s.steps.length - 1) { s.stepIndex = i; s.stepLabel = s.steps[i].label; s.reason = s.stepLabel; break; }
        }
        if (this._announcedStep !== s.stepIndex) { this._announcedStep = s.stepIndex; this._emit('step', { ...this.status(), kind: s.weapon }); }
      }
      if (s.progress >= 1) {
        if (s.stage === 'tracking') this._stage('tracked', 'TRACK CONFIRMED — PREPARE WEAPON');
        else { this._stage('ready', 'PREPARATION COMPLETE — WEAPON SAFE'); this._emit('ready'); }
      }
    } else if (s.stage === 'firing') this._fireOne();
  }

  status() {
    const s = this.state, valid = this._valid(), launch = this._valid({ cooldown: true });
    return { ...s, steps: s.steps.map(step => ({ ...step })),
      canAcquire: ['idle', 'aborted', 'complete', 'tracked'].includes(s.stage) && valid.ok,
      canPrepare: s.stage === 'tracked' && valid.ok,
      canArm: s.stage === 'ready' && valid.ok,
      canAuthorize: s.stage === 'armed' && launch.ok,
      canAbort: ACTIVE.has(s.stage),
      interlock: valid.ok ? null : valid.reason,
      launchInterlock: launch.ok ? null : launch.reason,
    };
  }
}
