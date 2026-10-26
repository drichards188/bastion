// Fire-control sound: the crew's Russian callouts over the ship's intercom, with subtitles, and the
// machinery of every step of the firing cycle (radar lock tones, relays, hydraulic pumps, launcher
// flooding, hatches, the Fort drum ratchet, the guarded arming switch, the firing howler "ревун").
//
// Everything plays through the AudioEngine's context and buses. Mechanisms are placed at the launcher
// (so on the bridge they arrive muffled through the glass, and in the launcher view they are close);
// lock tones, the howler and the intercom are ship-wide. The voice lines are generated offline by
// tools/make-voices.py into public/audio/voice/ (lines.json indexes them); missing files are skipped.
//
//   const cues = new FireCues(audio, { where, subtitle });   where(kind, slot) -> world Vector3
//   cues.load();                                              fetch the voice files (decoded once audio starts)
//   cues.update(dt, fireControl.state, { view, slot, paused });  every frame: follows the sequence's stages
//
// Timing (queue ages, throttles, pips) runs on wall-clock seconds, not the game clock, so speech
// pacing does not depend on frame rate or time compression.
//   cues.designated(), cues.refused(reason), cues.kill(contact, weapon), cues.incoming(), cues.hit(), cues.start()

const MAX_AGE = { 0: 2.5, 1: 6, 2: 8, 3: 10 }; // seconds a queued line may wait, by priority
const TAU = Math.PI * 2;
const now = () => performance.now() / 1000;

export class FireCues {
  constructor(audio, { where = () => null, subtitle = () => {} } = {}) {
    this.audio = audio;
    this.where = where;
    this.subtitle = subtitle;
    this.enabled = true;
    this.lines = {};
    this.raw = {};
    this.buffers = {};
    this.decoding = false;
    this.queue = [];
    this.speaking = null;
    this.clock = 0;
    this.last = {};
    this.stage = 'idle';
    this.stepIndex = -1;
    this.fired = 0;
    this.nextBeep = 0;
    this.nextTick = 0;
    this.recon = false;
    this.fx = null;
  }

  // ---------------------------------------------------------------- loading

  async load() {
    const base = import.meta.env?.BASE_URL ?? '/';
    try {
      const response = await fetch(`${base}audio/voice/lines.json`);
      if (!response.ok) return;
      this.lines = await response.json();
      await Promise.all(Object.entries(this.lines).map(async ([id, line]) => {
        try {
          const r = await fetch(`${base}audio/voice/${line.file}`);
          if (r.ok) this.raw[id] = await r.arrayBuffer();
        } catch { /* a missing line is simply not spoken */ }
      }));
    } catch { /* no voice pack: the machinery and tones still play */ }
  }

  ensure() {
    const c = this.audio.ctx;
    if (!c) return false;
    if (!this.fx) this.build(c);
    if (!this.decoding && Object.keys(this.raw).length) {
      this.decoding = true;
      for (const [id, data] of Object.entries(this.raw)) {
        c.decodeAudioData(data.slice(0)).then((b) => { this.buffers[id] = b; }).catch(() => {});
      }
      this.raw = {};
    }
    return true;
  }

  // The intercom: band-limited, a little overdriven, with a key click and a breath of line noise.
  build(c) {
    const input = c.createGain();
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 330;
    const presence = c.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = 2200; presence.Q.value = 1; presence.gain.value = 6;
    const drive = c.createWaveShaper(); drive.curve = shaper(2.4); drive.oversample = '2x';
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3500;
    const out = c.createGain(); out.gain.value = 0.8;
    input.connect(hp); hp.connect(presence); presence.connect(drive); drive.connect(lp); lp.connect(out); out.connect(this.audio.master);
    const room = c.createGain(); room.gain.value = 0; out.connect(room); room.connect(this.audio.reverb);
    this.intercom = { input, out, room };
    this.fx = {
      click: render(c, 0.06, (t) => (t < 0.004 ? (Math.random() * 2 - 1) : 0) * 0.6 + (Math.random() * 2 - 1) * 0.12 * Math.exp(-t * 60)),
      hiss: render(c, 1.0, () => (Math.random() * 2 - 1) * 0.5),
      beep: tone(c, 0.05, 1250, 0.5),
      lockOn: render(c, 0.45, (t) => (t < 0.16 ? Math.sin(TAU * 1250 * t) : t > 0.2 ? Math.sin(TAU * 1660 * t) : 0) * 0.45 * ramp(t, 0.45)),
      tick: tone(c, 0.06, 900, 0.25),
      chime: render(c, 1.1, (t) => (Math.sin(TAU * 880 * t) + 0.6 * Math.sin(TAU * 1320 * t) * (t > 0.18 ? 1 : 0) + 0.2 * Math.sin(TAU * 2640 * t)) * Math.exp(-t * 3.2) * 0.32),
      refuse: render(c, 0.4, (t) => square(TAU * 160 * t, 5) * (0.6 + 0.4 * Math.sin(TAU * 30 * t)) * ramp(t, 0.4) * 0.35),
      abort: render(c, 0.7, (t) => Math.sin(TAU * (900 * t - 420 * t * t)) * ramp(t, 0.7) * 0.4),
      howler: howler(c),
      relay: relay(c),
      switch: render(c, 0.4, (t) => clack(t, 0, 2600, 0.5) + clack(t, 0.14, 1500, 1) + thud(t, 0.14, 110, 0.6)),
      servo: motor(c, 1.6, 170, 330, 0.35),
      servoLong: motor(c, 2.6, 120, 260, 0.4),
      pump: pump(c, 2.2),
      flood: flood(c, 2.2),
      hatch: hatch(c),
      ratchet: ratchet(c),
      turbine: turbine(c),
    };
  }

  // ---------------------------------------------------------------- speech

  say(id, { priority = 1 } = {}) {
    this.clock = now();
    if (!this.enabled || !this.lines[id]) return;
    // A newer line of the same kind replaces a queued one instead of piling up; a newer preparation
    // step makes an older one still waiting stale.
    const step = id.startsWith('step_');
    this.queue = this.queue.filter((q) => q.id !== id && !(step && q.id.startsWith('step_')));
    this.queue.push({ id, priority, at: this.clock });
    this.queue.sort((a, b) => b.priority - a.priority || a.at - b.at);
    if (this.queue.length > 5) this.queue.length = 5;
  }

  speakNext() {
    while (this.queue.length) {
      const item = this.queue.shift();
      if (this.clock - item.at > MAX_AGE[item.priority]) continue;
      const buffer = this.buffers[item.id];
      if (!buffer) { if (this.decoding && this.clock - item.at < 1) { this.queue.unshift(item); return; } continue; }
      const c = this.audio.ctx, s = c.createBufferSource(), line = this.lines[item.id];
      s.buffer = buffer;
      s.connect(this.intercom.input);
      this.play(this.fx.click, null, 0.5);
      const hiss = c.createBufferSource(), hg = c.createGain();
      hiss.buffer = this.fx.hiss; hiss.loop = true; hg.gain.value = 0.012; hiss.connect(hg); hg.connect(this.intercom.input);
      const at = c.currentTime + 0.05;
      s.start(at); hiss.start(c.currentTime); hiss.stop(at + buffer.duration + 0.08);
      this.speaking = { until: this.clock + buffer.duration + 0.35 };
      // The next line follows as soon as this one ends, not on the next frame.
      s.onended = () => { this.play(this.fx.click, null, 0.35); s.disconnect(); hiss.disconnect(); hg.disconnect(); this.speaking = null; this.clock = now(); setTimeout(() => { if (!this.speaking) this.speakNext(); }, 250); };
      this.subtitle(`«${line.ru}» ${line.en}`, buffer.duration + 1.2);
      return;
    }
  }

  // ---------------------------------------------------------------- the firing cycle

  update(dt, s, { view = 'external', slot = 0, paused = false } = {}) {
    this.clock = now();
    if (!this.ensure() || !this.audio.enabled) return;
    // Intercom level and room: a bridge loudspeaker in the room, a deck speaker outside.
    const bridge = view === 'bridge', c = this.audio.ctx;
    this.intercom.out.gain.setTargetAtTime(bridge ? 0.9 : 0.62, c.currentTime, 0.2);
    this.intercom.room.gain.setTargetAtTime(bridge ? 0.35 : 0.08, c.currentTime, 0.2);
    if (!this.speaking || this.clock > this.speaking.until) { this.speaking = null; this.speakNext(); }

    // Rounds away come after the firing order and before "salvo complete", even when they fall in the
    // same update as either stage change.
    const away = () => {
      if ((s.stage === 'firing' || s.stage === 'complete') && s.fired > this.fired) {
        for (let n = this.fired + 1; n <= s.fired; n++) this.say(`away_${Math.min(4, n)}`, { priority: 2 });
        this.fired = s.fired;
      }
    };
    if (s.stage !== this.stage && s.stage === 'complete') away();
    if (s.stage !== this.stage) { this.onStage(this.stage, s.stage, s, slot); this.stage = s.stage; }
    away();
    if (s.stage === 'preparing' && s.stepIndex !== this.stepIndex && s.stepIndex >= 0) this.onStep(s.weapon, s.stepIndex, slot);
    this.stepIndex = s.stage === 'preparing' ? s.stepIndex : -1;
    if (s.stage === 'tracking' && !paused) {
      if (/RECONNAISSANCE/.test(s.stepLabel || s.reason || '')) this.recon = true;
      // Acquisition tone: pips that quicken as the director closes on the track.
      if (this.clock >= this.nextBeep) { this.play(this.fx.beep, null, 0.22); this.nextBeep = this.clock + 0.42 - 0.33 * (s.progress || 0); }
    }
    if (s.stage === 'armed' && !paused && this.clock >= this.nextTick) { this.play(this.fx.tick, null, 0.12); this.nextTick = this.clock + 1.6; }
    if (s.stage === 'idle' || s.stage === 'tracking' || s.stage === 'aborted') this.fired = 0;
    else this.fired = s.fired || 0;
  }

  onStage(from, to, s, slot) {
    const at = this.where(s.weapon, slot);
    if (to === 'tracking') { this.recon = false; this.nextBeep = this.clock; this.say('acquire'); this.play(this.fx.servo, at, 0.5, 60); }
    else if (to === 'tracked' && from === 'tracking') { this.play(this.fx.lockOn, null, 0.35); this.say(this.recon ? 'tracked_recon' : 'tracked'); }
    else if (to === 'preparing') { this.play(this.fx.relay, at, 0.7, 30); this.say(`prepare_${s.weapon}`); }
    else if (to === 'ready') { this.play(this.fx.chime, null, 0.3); this.say('ready'); }
    else if (to === 'armed') {
      this.play(this.fx.switch, null, 0.55);
      if (s.weapon === 'fort') this.play(this.fx.hatch, at, 0.9, 30);
      this.nextTick = this.clock + 1.2;
      this.say('arm'); this.say('armed');
    } else if (to === 'firing') {
      this.play(this.fx.howler, null, 0.42);
      this.say(s.salvo > 1 ? 'fire_salvo' : 'fire_1', { priority: 2 });
    } else if (to === 'complete') this.say(/NEUTRALIZED/.test(s.reason || '') ? 'neutralized' : 'complete', { priority: 2 });
    else if (to === 'aborted') {
      this.play(this.fx.abort, null, 0.3); this.play(this.fx.relay, at, 0.6, 30);
      this.say(/radar|track|horizon|illumination/i.test(s.reason || '') ? 'track_lost' : 'abort', { priority: 2 });
    }
  }

  // Each preparation step has its own machinery, matching what the launcher model shows.
  onStep(weapon, i, slot) {
    const at = this.where(weapon, slot), f = this.fx;
    const plan = {
      granit: [[f.relay, 0.6], [f.pump, 0.7, f.flood, 0.8], [f.pump, 0.5, f.hatch, 1]],
      // Bazalt: designation, the domed covers swing up, then the turbojets spool up in the containers.
      bazalt: [[f.relay, 0.6], [f.hatch, 1, f.pump, 0.4], [f.turbine, 0.8]],
      fort: [[f.relay, 0.6], [f.ratchet, 0.9], [f.relay, 0.5, f.pump, 0.35]],
      osa: [[f.hatch, 0.9, f.servoLong, 0.7], [f.servo, 0.7], [f.relay, 0.5]],
    }[weapon]?.[i] || [f.relay, 0.5];
    for (let k = 0; k < plan.length; k += 2) this.play(plan[k], at, plan[k + 1], 30);
    this.say(`step_${weapon}_${i}`);
  }

  // ---------------------------------------------------------------- other events

  designated() { if (this.throttle('designated', 1.5)) this.say('designated', { priority: 0 }); }

  refused(reason = '') {
    if (!this.ensure() || !this.throttle('refused', 0.6)) return;
    this.play(this.fx.refuse, null, 0.3);
    if (this.throttle('refusedVoice', 4)) this.say(/envelope|range|floor|altitude|horizon/i.test(reason) ? 'out_of_zone' : 'refused');
  }

  kill(contact, weapon) {
    if (/AK-630/.test(weapon || '')) return;
    if (this.throttle('kill', contact?.type === 'munition' ? 6 : 2)) this.say('kill', { priority: 2 });
  }

  incoming() { if (this.throttle('incoming', 25)) this.say('incoming', { priority: 3 }); }

  hit() { if (this.throttle('hit', 10)) this.say('hit_us', { priority: 3 }); }

  start() { this.say('battle_stations', { priority: 3 }); }

  throttle(key, seconds) {
    this.clock = now();
    if (this.clock - (this.last[key] ?? -1e9) < seconds) return false;
    this.last[key] = this.clock;
    return true;
  }

  play(buffer, pos, level, ref = 130) {
    if (!buffer || !this.audio.ctx) return;
    this.audio.play(buffer, pos || null, { level, ref, direct: !pos, cutoff: pos ? 9000 : 16000 });
  }
}

// ---------------------------------------------------------------- synthesis (rendered once to buffers)

function render(c, seconds, fn) {
  const n = Math.floor(c.sampleRate * seconds), b = c.createBuffer(1, n, c.sampleRate), a = b.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < n; i++) { a[i] = fn(i / c.sampleRate, i); peak = Math.max(peak, Math.abs(a[i])); }
  // Layered transients can sum past full scale: keep every cue under 0.9 so nothing clips before the mix.
  if (peak > 0.9) for (let i = 0; i < n; i++) a[i] *= 0.9 / peak;
  return b;
}
const ramp = (t, len, attack = 0.006, release = 0.05) => Math.min(1, t / attack, Math.max(0, (len - t) / release));
const tone = (c, len, f, level) => render(c, len, (t) => Math.sin(TAU * f * t) * ramp(t, len) * level);
const square = (phase, harmonics) => { let v = 0; for (let k = 1; k <= harmonics * 2; k += 2) v += Math.sin(phase * k) / k; return v * 0.9; };
function shaper(k) { const n = 1024, curve = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(k * x) / Math.tanh(k); } return curve; }
// A sharp metallic contact: a noise tick and a short inharmonic ring.
function clack(t, at, f, level) {
  const u = t - at;
  if (u < 0 || u > 0.12) return 0;
  return level * ((u < 0.003 ? (Math.random() * 2 - 1) * 0.8 : 0) + (Math.sin(TAU * f * u) + 0.5 * Math.sin(TAU * f * 1.73 * u)) * Math.exp(-u * 70) * 0.35);
}
const thud = (t, at, f, level) => { const u = t - at; return u < 0 || u > 0.2 ? 0 : level * Math.sin(TAU * f * u) * Math.exp(-u * 28); };

function relay(c) {
  return render(c, 0.2, (t) => clack(t, 0, 2100, 0.6) + clack(t, 0.028, 1700, 0.45) + thud(t, 0, 140, 0.3));
}

// An electric motor and gearbox: a saw whine sliding to speed, a gear-mesh partial and brush noise.
function motor(c, seconds, f0, f1, level) {
  let phase = 0, low = 0;
  const r = c.sampleRate;
  return render(c, seconds, (t) => {
    const k = Math.min(1, t / (seconds * 0.35)), f = f0 + (f1 - f0) * k * k * (3 - 2 * k);
    phase += f / r;
    const saw = 2 * (phase % 1) - 1;
    low = 0.85 * low + 0.15 * (Math.random() * 2 - 1);
    return (saw * 0.35 + Math.sin(TAU * phase * 2.97) * 0.25 + low * 0.25) * ramp(t, seconds, 0.12, 0.35) * level;
  });
}

// A hydraulic pump: piston pulses on a low hum, with fluid hiss.
function pump(c, seconds) {
  let hiss = 0;
  return render(c, seconds, (t) => {
    hiss = 0.6 * hiss + 0.4 * (Math.random() * 2 - 1);
    const pulse = Math.pow(0.5 + 0.5 * Math.sin(TAU * 14 * t), 3);
    return (Math.sin(TAU * 92 * t) * 0.5 + Math.sin(TAU * 184 * t) * 0.2) * (0.5 + 0.5 * pulse) * 0.6 + hiss * 0.12 * pulse;
  });
}

// Sea water rushing into the launcher: low turbulent noise with bubbles.
function flood(c, seconds) {
  let low = 0, bubble = 0, bf = 400, bt = 1;
  const r = c.sampleRate;
  return render(c, seconds, (t) => {
    low = 0.96 * low + 0.04 * (Math.random() * 2 - 1);
    if (Math.random() < 18 / r) { bt = 0; bf = 260 + Math.random() * 700; }
    bt += 1 / r;
    bubble = Math.sin(TAU * bf * (1 + bt * 3) * bt) * Math.exp(-bt * 40);
    return (low * 3.2 + bubble * 0.35) * ramp(t, seconds, 0.3, 0.6) * 0.5;
  });
}

// A heavy hatch: the latch knocks off, hydraulics drive it over, it stops against its hinge.
function hatch(c) {
  const len = 1.5;
  let phase = 0;
  const r = c.sampleRate;
  return render(c, len, (t) => {
    phase += (140 + 40 * Math.sin(t * 3)) / r;
    const drive = t > 0.12 && t < 1.15 ? (Math.sin(TAU * phase) * 0.25 + Math.sin(TAU * phase * 2.1) * 0.1) * Math.min(1, (t - 0.12) * 6, (1.15 - t) * 6) : 0;
    const creak = t > 0.2 && t < 1.0 ? Math.sin(TAU * (520 + 90 * Math.sin(TAU * 7 * t)) * t) * 0.05 : 0;
    return clack(t, 0, 950, 0.9) + clack(t, 0.03, 620, 0.6) + drive + creak + thud(t, 1.15, 75, 0.9) + clack(t, 1.15, 430, 0.7);
  });
}

// The Fort drum indexing: a motor under a run of pawl clicks, ending on the detent.
function ratchet(c) {
  const len = 1.7;
  return render(c, len, (t) => {
    let v = Math.sin(TAU * 130 * t) * 0.18 * Math.min(1, t * 5, Math.max(0, (1.45 - t) * 5));
    const step = 0.085, k = Math.floor(t / step);
    if (t < 1.4) v += clack(t, k * step, 2500 + (k % 3) * 160, 0.45);
    return v + thud(t, 1.42, 95, 0.9) + clack(t, 1.42, 700, 0.8);
  });
}

// A turbojet spooling up on its air starter: the starter's whine climbs, then the engine lights with a
// roar that settles into a steady scream (Bazalt's sustainer, brought up in its container before launch).
function turbine(c) {
  const len = 4.2;
  let phase = 0, roar = 0;
  const r = c.sampleRate;
  return render(c, len, (t) => {
    const spool = Math.min(1, t / 3), f = 220 + 2300 * spool * spool;
    phase += f / r;
    roar = 0.9 * roar + 0.1 * (Math.random() * 2 - 1);
    const lit = t > 1.4 ? Math.min(1, (t - 1.4) * 2) : 0;
    return (Math.sin(TAU * phase) * 0.22 + Math.sin(TAU * phase * 1.5) * 0.08) * ramp(t, len, 0.2, 0.6) + roar * lit * 0.9 * ramp(t, len, 0.2, 0.6);
  });
}

// The "ревун": the Soviet navy's electric howler sounded at the moment of firing. A buzzing horn that
// rises onto its note, rough with the vibrator's chatter.
function howler(c) {
  const len = 1.9;
  let phase = 0;
  const r = c.sampleRate;
  return render(c, len, (t) => {
    const f = 300 + 120 * Math.min(1, t / 0.25);
    phase += f / r;
    const chatter = 0.75 + 0.25 * Math.sin(TAU * 50 * t);
    return square(TAU * phase, 6) * chatter * ramp(t, len, 0.12, 0.35) * 0.55;
  });
}
