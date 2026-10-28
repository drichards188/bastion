import { Vector3 } from 'three';

// SI units throughout. Public envelope figures, not a classified weapons model.
// Guidance/closest-approach and fixed-step design adapted from Echelon's simulation.
// Source discussion and fit uncertainties: docs/HISTORY.md.
export const WEAPONS = {
  granit: { name: 'P-700 GRANIT', designation: 'SS-N-19', range: 550000, minRange: 7000, speed: 510, highSpeed: 750, minAlt: 0, maxAlt: 50, ammo: 20, interval: 3, channels: 20, turn: 0.32, fuze: 24, damage: 72, description: 'Active radar anti-ship · Mach ~1.5 at sea level, ~2.5 at high altitude · 750 kg conventional warhead' },
  bazalt: { name: 'P-500 BAZALT', designation: 'SS-N-12', range: 550000, minRange: 7000, speed: 650, highSpeed: 750, minAlt: 0, maxAlt: 50, ammo: 16, interval: 8, channels: 16, turn: 0.3, fuze: 24, damage: 85, description: 'Active radar anti-ship · Mach ~2.5 at altitude, ~2 on the final run · 1,000 kg conventional warhead · 8 s between rounds' },
  fort: { name: 'S-300F FORT', designation: '5V55RM / SA-N-6', range: 75000, minRange: 7000, speed: 1700, minAlt: 25, maxAlt: 25000, ammo: 96, interval: 3, channels: 6, turn: 1.3, fuze: 35, damage: 100, description: 'Radar-supported area defense · 7–75 km · 25–25,000 m · six target channels' },
  osa: { name: 'OSA-M', designation: '9M33 / SA-N-4', range: 10000, minRange: 1500, speed: 500, minAlt: 25, maxAlt: 5000, ammo: 40, interval: 8, channels: 2, turn: 1.8, fuze: 18, damage: 100, description: 'Command-guided point defense · 1.5–10 km · 25–5,000 m · two directors' },
  gun: { name: 'AK-630', designation: '30 mm / 6 barrels', range: 2500, minRange: 0, speed: 900, minAlt: 0, maxAlt: 2000, ammo: 16000, interval: 0.2, channels: 2, damage: 14, description: 'Eight mounts · 4,000–5,000 rounds/min per mount · 2,000 rounds per mount; effective anti-missile gate 2.5 km' },
  harpoon: { name: 'RGM/AGM-84 HARPOON', range: 100000, minRange: 0, speed: 267, turn: 0.65, fuze: 20, damage: 29, description: 'Early conventional Harpoon · active radar terminal seeker · subsonic sea-skimmer' },
};
// Anti-ship missiles share guidance, targeting and launch rules.
export const ANTI_SHIP = new Set(['granit', 'bazalt']);
// Anti-ship flight profiles (docs/MODELLED.md, Simulation). Documented: Granit flies at Mach ~1.5
// low and ~2.5 high, cruises at about 14,000 m on long shots and runs in at about 25 m; Bazalt flies
// a high-low profile, up to about 5 km high and 40 to 50 m low, at Mach 2 to 2.5, off two solid
// boosters burning about 2 s; once its wings unfold the ship's Argon datalink brings it onto course.
// Estimated (no published figures): booster thrust (Granit's burn time too), how long each flies
// the launcher's line, the g available to turn, the ranges at which each switches to its high
// profile, and the length of the low attack run. Slava's containers lie only 4 to 7 m off the
// centreline, so a Bazalt bound for a target on the other side crosses the bow as soon as it turns.
//   boost       s of booster burn
//   boostAccel  m/s2 while the booster burns
//   straight    s of unguided flight along the launcher's axis before guidance starts
//   climbG      g available to pitch over and turn in the first seconds of guided flight
//   g           g available to turn in cruise (turns at Mach 1.5 are kilometres wide)
// Granit salvos: open sources report that one round of a salvo climbs higher and designates the
// target for the rest, which stay low; that it "climbs in short pop-ups, so as to be harder to
// intercept"; and that if it is destroyed the next round rises to take its place (en.wikipedia P-700
// Granit, an article under an accuracy dispute that notes the description has been doubted). Nothing
// is published on heights or timing, so these are estimates. Rounds rippled at one target (no more
// than 1.5 launcher intervals apart) form a salvo; a lone round has nobody to scout for and flies low.
//   scout       m a pop-up climbs toward (it tops out near 550 m before dropping back)
//   popUp       s of climb in each pop-up
//   popEvery    s from one pop-up to the next; a new scout pops up at once
//   scoutTo     m to go, inside which the scout stops popping up and no round takes over
export const ASM = {
  granit: { boost: 2.5, boostAccel: 120, straight: 2.5, climbG: 8, g: 6, cruiseLow: 25, cruiseHigh: 14000, highBeyond: 100000, attackLeg: 40000, scout: 1000, popUp: 4, popEvery: 15, scoutTo: 12000 },
  bazalt: { boost: 2, boostAccel: 150, straight: 2.5, climbG: 4, g: 5, cruiseLow: 45, cruiseHigh: 5000, highBeyond: 60000, attackLeg: 30000 },
};
// Helm response, shared with the helm display's time estimates: rad/s of turn, m/s2 gaining and losing way.
export const HELM = { turn: 0.012, accel: 0.06, decel: 0.12 };
// Playable ships. Magazines and the anti-ship weapon differ; Fort, Osa and the AK-630s work the same.
// damageScale: Slava displaces about half as much as Kirov, so each hit costs her more integrity.
export const SHIPS = {
  kirov: { id: 'kirov', name: 'KIROV', native: 'КИРОВ', project: 'PROJECT 1144', type: 'nuclear-powered missile cruiser', antiShip: 'granit', ammo: { granit: 20, fort: 96, osa: 40, gun: 16000 }, damageScale: 1, hull: '065' },
  slava: { id: 'slava', name: 'SLAVA', native: 'СЛАВА', project: 'PROJECT 1164', type: 'missile cruiser', antiShip: 'bazalt', ammo: { bazalt: 16, fort: 64, osa: 40, gun: 16000 }, damageScale: 1.4, hull: '108' },
};
const STEP = 0.05, KNOT = 0.514444, TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const forward = heading => new Vector3(Math.sin(heading), 0, -Math.cos(heading));
const horizon = (a,b) => 4120 * (Math.sqrt(Math.max(0,a)) + Math.sqrt(Math.max(0,b)));
function rng(seed) { return () => { let t = seed += 0x6d2b79f5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function turn(f, d, rate, dt) { const angle = Math.acos(clamp(f.dot(d),-1,1)); if(angle < 1e-6) return; const axis = new Vector3().crossVectors(f,d); if(axis.lengthSq() < 1e-8) axis.set(1,0,0); f.applyAxisAngle(axis.normalize(),Math.min(angle,rate*dt)).normalize(); }
function swept(a,b,p,q) { const r = a.clone().sub(p), v = b.clone().sub(a).sub(q.clone().sub(p)); const t = clamp(-r.dot(v)/Math.max(1e-9,v.lengthSq()),0,1); return r.addScaledVector(v,t).length(); }

export class Simulation {
  constructor({seed = 1985, ship = 'kirov'} = {}) {
    this.ship = SHIPS[ship] || SHIPS.kirov;
    this.random = rng(seed); this.seed = seed; this.time = 0; this.accumulator = 0; this.running = false; this.paused = false; this.result = null; this.resultReason = null; this.events = {}; this.launchPoints = {};
    this.nextId = 1; this.contacts = []; this.missiles = []; this.log = []; this.phase = 'AWAITING ORDERS';
    this.stats = {ships:0,planes:0,munitions:0,launched:0,damageTaken:0,encountered:{ships:2,planes:2,munitions:0}};
    this.player = {id:this.ship.id,pos:new Vector3(),prev:new Vector3(),vel:new Vector3(0,0,-18*KNOT),heading:0,speed:18*KNOT,desiredHeading:0,desiredSpeed:18*KNOT,hp:100,radar:true,auto:{[this.ship.antiShip]:false,fort:false,osa:false,gun:true},ammo:{...this.ship.ammo},systems:{radar:100,propulsion:100,weapons:100}};
    // Crew automation is per weapon (player.auto). autoDefense and ciwsAuto remain as views of it:
    // autoDefense reads true while either SAM crew is automatic and sets both; ciwsAuto is the AK-630s.
    { const auto=this.player.auto; Object.defineProperties(this.player,{
      autoDefense:{enumerable:true,get:()=>auto.fort||auto.osa,set:v=>{auto.fort=auto.osa=!!v;}},
      ciwsAuto:{enumerable:true,get:()=>auto.gun,set:v=>{auto.gun=!!v;}} }); }
    this.cooldowns = {granit:0,bazalt:0,fort:0,osa:0,gun:0,chaff:0}; this.chaffCharges = 8; this.chaffUntil = 0; this.chaffPos = new Vector3(); this.lastAuto = 0; this.lastSweep = -3; this.completedWaves = new Set(); this.missionDuration = 780;
    this.addContact('ship','Sierra 01 · frigate',new Vector3(11500,0,-23500),new Vector3(-4,0,3),{intel:true,nextAttack:110,shots:0,samRounds:4,nextSam:0});
    this.addContact('ship','Sierra 02 · frigate',new Vector3(-17000,0,-28000),new Vector3(4,0,2),{intel:true,nextAttack:175,shots:0,samRounds:4,nextSam:0});
    this.addContact('plane','Raid 01 · A-6E',new Vector3(15000,2200,-27000),new Vector3(-95,0,150),{attackAt:75,escaped:false});
    this.addContact('plane','Raid 02 · A-6E',new Vector3(15500,2300,-27500),new Vector3(-95,0,150),{attackAt:79,escaped:false});
    this.waveVariation=Array.from({length:5},()=>({bearing:(this.random()-0.5)*28,range:0.94+this.random()*0.12}));
    this.note('GENERAL QUARTERS. Two surface contacts reported by reconnaissance.');
    this.note('MISSION: disable both frigates and defeat the air/missile raid.');
    this.note('Automatic air defense is active. Select a surface contact and launch GRANIT.');
  }
  note(text) { this.log.unshift({time:this.time,text}); if(this.log.length > 80) this.log.length = 80; }
  addContact(type,name,pos,vel,extra={}) {
    const c = {id:`c${this.nextId++}`,name,type,pos,vel,hp:100,alive:true,detected:true,lastSeen:0,heading:Math.atan2(vel.x,-vel.z),baseHeading:Math.atan2(vel.x,-vel.z),maneuverPhase:this.nextId*1.7,chaffCharges:3,defenseRounds:10,nextDefense:0,nextChaff:0,bank:0,...extra}; this.contacts.push(c); return c;
  }
  setLaunchPoints(points) { for(const kind of ['granit','bazalt','fort','osa','gun']) if(points[kind]?.length) this.launchPoints[kind]=points[kind].map(p=>p.clone()); }
  // Optional model hook: (kind, slot, localTargetDirection) -> { pos, dir, speed } in ship-local terms, so a
  // round leaves from its actual cell or rail along its tube or arm. Without it the anchors above are used.
  setLaunchFrames(fn) { this.launchFrame = typeof fn === 'function' ? fn : null; }
  worldAnchor(local) { return local.clone().applyAxisAngle(new Vector3(0,1,0),-this.player.heading).add(this.player.pos); }
  start() { if(this.result) return; this.running = true; this.paused = false; this.phase = 'SURFACE STRIKE'; }
  setHeading(degrees) { if(Number.isFinite(degrees)) this.player.desiredHeading = ((degrees%360)+360)%360*Math.PI/180; }
  setSpeed(knots) { if(Number.isFinite(knots)) this.player.desiredSpeed = clamp(knots,0,31)*KNOT; }
  toggleRadar() { this.player.radar = !this.player.radar; this.note(`SEARCH RADAR ${this.player.radar?'TRANSMITTING':'SILENT — SAM guidance unavailable'}.`); }
  // Each weapon's crew engages on its own while its auto is on; manual orders still work alongside.
  setAuto(kind, on) { const a=this.player.auto; if(!(kind in a)) return false; a[kind]=!!on; this.note(`${kind==='gun'?'AK-630 CLOSE-IN GUNS':WEAPONS[kind].name} ${on?'AUTOMATIC':kind==='gun'?'HOLD FIRE':'MANUAL'}.`); return true; }
  toggleAuto(kind) { return this.setAuto(kind, !this.player.auto[kind]); }
  setAllAuto(on) { for(const k of Object.keys(this.player.auto)) this.player.auto[k]=!!on; this.note(on?'ALL WEAPONS AUTOMATIC: the crews engage on their own.':'ALL WEAPONS MANUAL: nothing fires without your order.'); }
  get allAuto() { return Object.values(this.player.auto).every(Boolean); }
  // The overall switch: everything automatic, or (from all automatic) everything manual.
  toggleAutoDefense() { this.setAllAuto(!this.allAuto); }
  toggleCiws() { this.toggleAuto('gun'); }
  deployChaff() {
    if(!this.running || this.paused || this.result || this.cooldowns.chaff>this.time || !this.chaffCharges) return false;
    this.chaffCharges--; this.cooldowns.chaff=this.time+35; this.chaffUntil=this.time+18; this.chaffPos.copy(this.player.pos).addScaledVector(forward(this.player.heading+Math.PI/2),200);
    this.note('CHAFF AWAY. Maneuver to separate from decoy cloud.'); this.events.chaff?.(this.chaffPos.clone()); return true;
  }
  canFire(kind,targetId) {
    const w=WEAPONS[kind], t=this.contacts.find(c=>c.id===targetId), p=this.player;
    const no=reason=>({ok:false,reason});
    if(!this.running || this.result) return no('Battle is not active'); if(this.paused) return no('Battle paused');
    if(!w || kind==='harpoon') return no('Unknown weapon'); if(!t?.alive) return no('Select a live contact');
    if(!t.detected) return no('No current track'); if(p.ammo[kind]<=0) return no('Magazine empty');
    if(p.systems.weapons<15) return no('Weapons systems disabled');
    if(this.cooldowns[kind]>this.time) return no(`Launcher cycling · ${Math.ceil(this.cooldowns[kind]-this.time)}s`);
    if(!(this.player.ammo[kind]>=0)) return no(`${w.name} is not fitted to ${this.ship.name}`);if(ANTI_SHIP.has(kind) !== (t.type==='ship')) return no(ANTI_SHIP.has(kind)?`${w.name.replace(/^.* /,'')} requires surface target`:'Select aircraft or incoming missile');
    const dist=p.pos.distanceTo(t.pos);
    if(dist<w.minRange) return no(`Inside minimum range · ${(w.minRange/1000).toFixed(1)} km`);
    if(dist>w.range) return no(`Beyond ${(w.range/1000).toFixed(0)} km envelope`);
    if(!ANTI_SHIP.has(kind)) {
      if(t.pos.y<w.minAlt) return no(`Below ${w.minAlt} m engagement floor — use CIWS`);
      if(t.pos.y>w.maxAlt) return no('Above altitude envelope');
      if(!p.radar || p.systems.radar<15) return no('Radar illumination unavailable');
      if(dist>horizon(35,t.pos.y)) return no('Below radar horizon');
      const channelIds=new Set(this.missiles.filter(m=>m.alive&&m.kind===kind).map(m=>m.targetId));
      if(channelIds.size>=w.channels && !channelIds.has(t.id)) return no('All fire-control channels occupied');
      if(kind==='gun') return no('AK-630 is operated by automatic defense');
    }
    return {ok:true,reason:'READY',range:dist};
  }
  fire(kind,targetId) {
    const check=this.canFire(kind,targetId); if(!check.ok) return check;
    const p=this.player,w=WEAPONS[kind], t=this.contacts.find(c=>c.id===targetId);
    p.ammo[kind]--; this.cooldowns[kind]=this.time+w.interval; this.stats.launched++;
    // Ship-local launch anchor rotates and translates with the moving hull.
    const slot=w.ammo-p.ammo[kind]-1, defaults=ANTI_SHIP.has(kind)?new Vector3(slot%2?5:-5,9,-85+Math.floor(slot/2)*4):kind==='fort'?new Vector3(slot%2?6:-6,10,-38):new Vector3(slot%2?12:-12,12,-12);
    const anchors=this.launchPoints[kind], up=new Vector3(0,1,0);
    const frame=this.launchFrame?.(kind,slot,t.pos.clone().sub(p.pos).applyAxisAngle(up,p.heading).normalize());
    const local=frame?.pos?frame.pos.clone():anchors?.length?anchors[slot%anchors.length].clone():defaults;
    const angle=-p.heading; local.applyAxisAngle(up,angle);
    const pos=p.pos.clone().add(local), dir=frame?.dir?frame.dir.clone().applyAxisAngle(up,angle).normalize():kind==='fort'?new Vector3(0,1,0):forward(p.heading).setY(ANTI_SHIP.has(kind)?0.7:0.6).normalize();
    const speed=frame?.speed??(kind==='fort'?28:70);
    // A round leaving a moving ship keeps the ship's velocity while it clears its launcher (carry).
    const m={id:`m${this.nextId++}`,kind,pos,vel:dir.clone().multiplyScalar(speed),fwd:dir,alive:true,hostile:false,targetId,age:0,speed,distance:0,blind:0,launchPos:pos.clone(),launchTime:this.time,slot,motor:kind!=='fort',carry:frame?p.vel.clone():null};
    // A round rippled after the last one at the same target joins its salvo; otherwise it starts one.
    if(ANTI_SHIP.has(kind)) { const last=[...this.missiles].reverse().find(x=>x.salvo&&x.kind===kind&&x.targetId===targetId); m.salvo=last&&this.time-last.launchTime<=w.interval*1.5?last.salvo:m.id; }
    this.missiles.push(m); this.note(`${w.name} AWAY → ${t.name}`); this.events.launch?.(m); if(kind==='fort')this.events.coldLaunch?.(m); return {ok:true,reason:'LAUNCHED',missile:m};
  }
  launchHostile(origin,{altitude=60,name='Harpoon',offset=0}={}) {
    const pos=origin.clone(); pos.y=altitude; pos.x+=offset;
    const dir=this.player.pos.clone().sub(pos).setY(0).normalize();
    const c=this.addContact('munition',`${name} ${this.nextId}`,pos,dir.clone().multiplyScalar(267),{detected:false,source:'seeker'});
    const m={id:`m${this.nextId++}`,kind:'harpoon',pos:c.pos,vel:c.vel,fwd:dir,alive:true,hostile:true,targetId:'kirov',contactId:c.id,age:0,speed:267,distance:0,cruiseAltitude:altitude,decoyChecked:false};
    this.missiles.push(m); this.stats.encountered.munitions++; this.events.launch?.(m); return m;
  }
  // Fraction of the next fixed step already accumulated: render interpolation between prev and pos.
  get alpha() { return this.accumulator/STEP; }
  update(dt) {
    if(!this.running || this.paused || this.result || !Number.isFinite(dt) || dt<=0) return;
    this.accumulator+=Math.min(dt,10);
    while(this.accumulator>=STEP && !this.result) { this.step(STEP); this.accumulator-=STEP; }
  }
  step(dt) {
    this.time+=dt; const p=this.player;p.prev.copy(p.pos);
    // Missiles keep their previous step position so the renderer and the follow camera can interpolate.
    for(const m of this.missiles) if(m.alive) (m.prev||(m.prev=m.pos.clone())).copy(m.pos);
    const yaw=wrap(p.desiredHeading-p.heading); p.heading=wrap(p.heading+clamp(yaw,-HELM.turn*dt,HELM.turn*dt));
    const wanted=p.desiredSpeed*clamp(p.systems.propulsion/100,0.15,1); p.speed+=clamp(wanted-p.speed,-HELM.decel*dt,HELM.accel*dt); p.vel.copy(forward(p.heading)).multiplyScalar(p.speed);p.pos.addScaledVector(p.vel,dt);
    this.script();
    for(const c of this.contacts) {
      c.prev=c.pos.clone(); if(!c.alive || c.type==='munition') continue;
      if(c.type==='plane') {
        if(this.time>=c.attackAt && !c.attacked) { c.attacked=true; for(let i=0;i<2;i++) this.launchHostile(c.pos,{altitude:60,offset:i*85,name:'AGM-84'}); this.note(`${c.name}: missile launch detected. Aircraft turning away.`); c.escapeHeading=c.heading+Math.PI; }
        if(c.attacked && this.time>c.attackAt+180) { c.alive=false; c.escaped=true; this.note(`${c.name} has withdrawn.`); continue; }
        const desired=c.attacked?c.escapeHeading:c.baseHeading+Math.sin(this.time*0.018+c.maneuverPhase)*0.08;
        const yaw=clamp(wrap(desired-c.heading),-0.025*dt,0.025*dt);c.heading+=yaw;c.bank+= (clamp(Math.atan(180*yaw/dt/9.81),-0.8,0.8)-c.bank)*Math.min(1,dt*3);
        c.vel.copy(forward(c.heading)).multiplyScalar(180);
      } else {
        this.enemyDefense(c,dt);
        if(this.time>=c.nextAttack && c.shots<3) {
        c.nextAttack+=140; c.shots++; for(let i=0;i<4;i++) this.launchHostile(c.pos,{offset:i*60}); this.note(`${c.name}: four anti-ship missiles launched.`);
        }
      }
      c.pos.addScaledVector(c.vel,dt); c.heading=Math.atan2(c.vel.x,-c.vel.z);
    }
    if(this.time-this.lastSweep>=2.5) { this.lastSweep=this.time; for(const c of this.contacts) {
      if(!c.alive) continue; const distance=c.pos.distanceTo(p.pos);
      const seen=p.radar&&p.systems.radar>=15&&distance<horizon(35,Math.max(c.type==='ship'?20:0,c.pos.y))&&distance<150000;
      if(seen||c.intel) { if(!c.detected && c.type==='munition') this.events.incoming?.(c); if(!c.detected && c.type==='munition') this.note(`INCOMING MISSILE · bearing ${((Math.atan2(c.pos.x-p.pos.x,p.pos.z-c.pos.z)*180/Math.PI+360)%360).toFixed(0)}°`); c.detected=true;c.lastSeen=this.time; }
      else if(this.time-c.lastSeen>8)c.detected=false;
    } }
    if(Object.values(p.auto).some(Boolean) && this.time-this.lastAuto>=0.25) { this.lastAuto=this.time;this.automaticDefense(); }
    this.assignScouts();
    for(const m of this.missiles) if(m.alive) this.updateMissile(m,dt);
    if(p.hp<=0) this.finish('defeat','KIROV LOST. Damage-control teams cannot contain the flooding.');
    else if(this.time>=640 && !this.contacts.some(c=>c.alive) && !this.missiles.some(m=>m.alive&&m.hostile)) this.finish('victory','MISSION COMPLETE. Surface group disabled; incoming raid defeated.');
    else if(this.time>=this.missionDuration) {
      const ships=this.contacts.some(c=>c.type==='ship'&&c.alive), threats=this.contacts.some(c=>c.alive&&c.type!=='ship')||this.missiles.some(m=>m.alive&&m.hostile);
      this.finish(ships||threats?'defeat':'victory',ships?'MISSION FAILED. Hostile surface group remains operational.':threats?'MISSION INCOMPLETE. Active air or missile threats remain at the operational deadline.':'MISSION COMPLETE. Surface group disabled; no active air or missile threats remain.');
    }
  }
  script() {
    const waves=[{time:35,bearing:290,range:27500,count:3,alt:60},{time:160,bearing:75,range:25000,count:3,alt:60},{time:330,bearing:210,range:15000,count:3,alt:15},{time:485,bearing:340,range:24000,count:4,alt:60},{time:600,bearing:110,range:17000,count:2,alt:15}];
    for(let i=0;i<waves.length;i++) { const w=waves[i]; if(this.time>=w.time&&!this.completedWaves.has(i)) {
      this.completedWaves.add(i); this.phase=i<2?'MISSILE RAID':i===4?'FINAL DEFENSIVE ENGAGEMENT':'LAYERED AIR DEFENSE';
      const pos=this.player.pos.clone().addScaledVector(forward((w.bearing+this.waveVariation[i].bearing)*Math.PI/180),w.range*this.waveVariation[i].range);
      for(let j=0;j<w.count;j++) this.launchHostile(pos,{altitude:w.alt,offset:j*100,name:'Inbound AGM-84'});
      this.note(`RAID REPORT ${i+1}/5. Previously launched carrier-aircraft missiles approaching.`);
    } }
    if(this.time>=250&&!this.completedWaves.has('air2')) { this.completedWaves.add('air2'); this.stats.encountered.planes+=2;
      for(let i=0;i<2;i++) this.addContact('plane',`Raid ${3+i} · A-6E`,this.player.pos.clone().add(new Vector3(-26000-i*300,1600+i*60,16000)),new Vector3(140,0,-90),{attackAt:310+i*4});
      this.note('SECOND AIR RAID. Two A-6E tracks from southwest.');
    }
  }
  enemyDefense(c,dt) {
    // Finite defensive response, not a full Perry combat-system model.
    // Evasion, chaff seduction and CIWS success are gameplay abstractions.
    const inbound=this.missiles.filter(m=>m.alive&&ANTI_SHIP.has(m.kind)&&m.targetId===c.id).sort((a,b)=>a.pos.distanceToSquared(c.pos)-b.pos.distanceToSquared(c.pos));
    const nearest=inbound[0],range=nearest?nearest.pos.distanceTo(c.pos):Infinity;
    const desired=range<9000?Math.atan2(nearest.pos.x-c.pos.x,c.pos.z-nearest.pos.z)+Math.PI/2:c.baseHeading+Math.sin(this.time*0.025+c.maneuverPhase)*0.28;
    const yaw=clamp(wrap(desired-c.heading),-0.008*dt,0.008*dt);c.heading+=yaw;c.heel=-yaw/dt*2.5;
    c.vel.copy(forward(c.heading)).multiplyScalar((range<9000?13:9)*clamp(c.hp/100,0.45,1));
    if(range<5000&&c.chaffCharges>0&&this.time>=c.nextChaff) {
      c.chaffCharges--;c.nextChaff=this.time+35;this.note(`${c.name}: evasive turn and chaff deployed.`);this.events.chaff?.(c.pos.clone().add(new Vector3(100,15,0)));
      if(this.random()<0.16) {nearest.alive=false;this.events.explosion?.(nearest.pos.clone(),0.4);this.note('GRANIT seeker seduced by enemy countermeasures.');}
    }
    if(nearest?.alive&&range<1800&&c.defenseRounds>0&&this.time>=c.nextDefense) {
      c.defenseRounds--;c.nextDefense=this.time+2.5;this.events.ciws?.(c.pos.clone().add(new Vector3(0,15,0)),nearest.pos.clone());
      if(this.random()<0.16) {nearest.alive=false;this.events.explosion?.(nearest.pos.clone(),0.6);this.note(`${c.name}: defensive gunfire destroyed an incoming GRANIT.`);}
    }
    // The frigate's area SAM (Standard SM-1MR) engages a salvo's scout while it is popped up; a scout
    // back down among the sea-skimmers when the SAM arrives is lost to it. Gameplay rule: rounds still
    // climbing out after launch are left alone. One SAM in the air at a time, abstract odds.
    const scout=inbound.find(m=>m.scout&&m.pos.y>200&&m.pos.distanceTo(c.pos)<25000);
    if(scout&&c.samRounds>0&&!c.sam&&this.time>=c.nextSam) {c.samRounds--;c.nextSam=this.time+8;c.sam={m:scout,at:this.time+scout.pos.distanceTo(c.pos)/900};this.note(`${c.name}: SAM launched at the ${WEAPONS[scout.kind].name.replace(/^.* /,'')} scout.`);}
    if(c.sam&&this.time>=c.sam.at) {const m=c.sam.m,name=WEAPONS[m.kind].name.replace(/^.* /,'');c.sam=null;
      if(m.alive&&m.pos.y<=200) this.note(`${c.name}: SAM lost the ${name} scout as it dropped back to the sea.`);
      else if(m.alive&&this.random()<0.4){m.alive=false;this.events.explosion?.(m.pos.clone(),0.5);this.note(`${c.name}: SAM destroyed the ${name} scout.`);}}
  }
  // Salvo roles (ASM scout to scoutTo): the earliest round still far enough out scouts while the salvo
  // has two or more rounds in the air, popping up every popEvery seconds. Losing it hands the job to
  // the next round that has the room, which pops up at once.
  assignScouts() {
    const salvos=new Map();
    for(const m of this.missiles) if(m.alive&&m.salvo&&ASM[m.kind]?.scout) (salvos.get(m.salvo)||salvos.set(m.salvo,[]).get(m.salvo)).push(m);
    for(const [id,rounds] of salvos) {
      const P=ASM[rounds[0].kind],t=this.contacts.find(c=>c.id===rounds[0].targetId);
      let lead=rounds.find(m=>m.scout);
      if(rounds.length<2) {if(lead)lead.scout=false;continue;}
      if(!lead&&t) {
        lead=rounds.find(m=>m.pos.distanceTo(t.pos)>P.scoutTo); if(!lead) continue;
        lead.scout=true; lead.nextPop=this.time;
        if(this.scouted?.has(id)) this.note(`${WEAPONS[lead.kind].name.replace(/^.* /,'')} SALVO: scout lost; round ${this.missiles.filter(m=>m.salvo===id).indexOf(lead)+1} rising to take over.`);
        (this.scouted||=new Set()).add(id);
      }
      if(lead&&t&&this.time>=lead.nextPop&&lead.pos.distanceTo(t.pos)>P.scoutTo) {lead.popUntil=this.time+P.popUp;lead.nextPop=this.time+P.popEvery;}
    }
  }
  automaticDefense() {
    const p=this.player,targets=this.contacts.filter(c=>c.alive&&c.detected&&c.type!=='ship').sort((a,b)=>(a.type==='munition'?0:1)-(b.type==='munition'?0:1)||a.pos.distanceToSquared(p.pos)-b.pos.distanceToSquared(p.pos));
    // SAMs: one round per air target from the first automatic crew that can engage it.
    if(p.auto.fort||p.auto.osa) for(const c of targets) {
      if(c.id===this.manualFireTargetId)continue;
      const assigned=this.missiles.filter(m=>m.alive&&!m.hostile&&m.targetId===c.id).length;
      if(!assigned) { for(const kind of ['fort','osa']) if(p.auto[kind]&&this.canFire(kind,c.id).ok) { this.fire(kind,c.id);break; } }
    }
    // Anti-ship: keep up to two rounds in flight at each detected hostile ship, so the crew assesses
    // each pair before firing again; the player's own designated target is left to the player.
    const anti=this.ship.antiShip;
    if(p.auto[anti]) for(const c of this.contacts) {
      if(!c.alive||!c.detected||c.type!=='ship'||c.id===this.manualFireTargetId)continue;
      const inFlight=this.missiles.filter(m=>m.alive&&!m.hostile&&m.kind===anti&&m.targetId===c.id).length;
      if(inFlight<2&&this.canFire(anti,c.id).ok) { this.fire(anti,c.id);break; }
    }
    if(!p.auto.gun||this.time<this.cooldowns.gun||p.ammo.gun<=0||p.systems.weapons<15||!p.radar||p.systems.radar<15)return;
    const close=targets.filter(c=>c.pos.distanceTo(p.pos)<WEAPONS.gun.range).slice(0,2);
    if(!close.length)return; this.cooldowns.gun=this.time+0.2;
    for(const c of close) {
      // Two engaged directors; each controls a pair of mounts (~150 rounds/s).
      const rounds=Math.min(30,p.ammo.gun);p.ammo.gun-=rounds;
      const range=c.pos.distanceTo(p.pos), effectiveness=clamp(1-range/3200,0.15,1);
      c.hp-=rounds*0.62*effectiveness;
      const localTarget=c.pos.clone().sub(p.pos).applyAxisAngle(new Vector3(0,1,0),p.heading);
      const mounts=this.launchPoints.gun||[new Vector3(-13,16,-10),new Vector3(13,16,-10),new Vector3(-13,13,80),new Vector3(13,13,80)];
      const bearingMounts=mounts.filter(a=>Math.sign(a.x)===Math.sign(localTarget.x));
      const choices=bearingMounts.length?bearingMounts:mounts;
      const anchor=choices.reduce((best,a)=>a.distanceToSquared(localTarget)<best.distanceToSquared(localTarget)?a:best);
      this.events.ciws?.(this.worldAnchor(anchor),c.pos.clone());
      if(c.hp<=0)this.kill(c,'AK-630');
    }
  }
  updateMissile(m,dt) {
    m.age+=dt;const w=WEAPONS[m.kind],p=this.player,old=m.pos.clone();
    let t=m.hostile?p:this.contacts.find(c=>c.id===m.targetId);
    if(m.hostile&&!this.contacts.find(c=>c.id===m.contactId)?.alive) {m.alive=false;return;}
    if(!t || t.alive===false || m.age>(ANTI_SHIP.has(m.kind)?1200: m.hostile?450:110)) {m.alive=false;return;}
    const dist=m.pos.distanceTo(t.pos),aim=t.pos.clone();
    if(!m.hostile && !ANTI_SHIP.has(m.kind) && (!p.radar||p.systems.radar<15||!t.detected)) {m.blind+=dt;if(m.blind>3){m.alive=false;this.events.explosion?.(m.pos.clone(),0.3);return;}} else m.blind=0;
    let targetSpeed=w.speed;
    if(ANTI_SHIP.has(m.kind)) {
      const P=ASM[m.kind],high=m.profile==='high'||(m.profile!=='low'&&m.launchPos.distanceTo(t.pos)>P.highBeyond);
      // Cruise height: low over the sea, or high on long shots, gliding down (about 8.5 degrees) to
      // reach the low attack run with attackLeg still to go; the last 3 km close on the target itself.
      let cruise=high?clamp((dist-P.attackLeg)*0.15,P.cruiseLow,P.cruiseHigh):P.cruiseLow;
      // A salvo's scout climbs out of the pack in short pop-ups, then drops back down to it.
      if(m.scout&&this.time<m.popUntil) cruise=Math.max(cruise,P.scout);
      // Faster in the thin air up high: Mach 2.5 near the top of the profile, sea-level speed low down.
      targetSpeed=w.speed+(w.highSpeed-w.speed)*clamp(m.pos.y/(P.cruiseHigh*0.6),0,1);
      aim.addScaledVector(t.vel||new Vector3(),Math.min(dist/targetSpeed,45));
      // Hold the cruise height instead of flying a straight line at the target: steer for a point a
      // short way ahead on the horizontal track, raised or lowered by twice the height error (at most
      // about 15 degrees of climb or dive), so a round settles from its climb-out or a pop-up in seconds;
      // three times the error overshoots Bazalt into the sea. The last 3 km close on the target itself.
      if(dist>3000) {
        const look=2500,hx=aim.x-m.pos.x,hz=aim.z-m.pos.z,hl=Math.hypot(hx,hz)||1;
        aim.set(m.pos.x+hx/hl*look,m.pos.y+clamp((cruise-m.pos.y)*2,-look*0.27,look*0.27),m.pos.z+hz/hl*look);
      } else aim.y=6;
    } else if(m.hostile) {
      aim.addScaledVector(p.vel,Math.min(dist/267,15));
      aim.y=dist<9000?15:m.cruiseAltitude;
      if(this.time<this.chaffUntil&&dist<4500&&!m.decoyChecked) {m.decoyChecked=true;if(this.random()<0.45){m.decoy=this.chaffPos.clone();this.note('A Harpoon seeker has transferred to the chaff cloud.');}}
      if(m.decoy) {aim.copy(m.decoy);aim.y=15;}
    } else aim.addScaledVector(t.vel||new Vector3(),Math.min(dist/Math.max(m.speed+250,300),12));
    if(m.kind==='fort'&&m.age<0.9){m.speed=Math.max(12,m.speed-9.81*dt);} else {
      if(m.kind==='fort'&&!m.motor){m.motor=true;this.events.ignite?.(m);}
      if(ANTI_SHIP.has(m.kind)) {
        // Booster: straight out along the launcher, unguided, accelerating to about Mach 1. The
        // sustainer then holds speed; once the straight leg is flown the missile pitches over and
        // turns under a g limit.
        const P=ASM[m.kind];
        if(m.age<P.boost) m.speed+=P.boostAccel*dt;
        else m.speed+=clamp(targetSpeed-m.speed,-60*dt,60*dt);
        if(m.age>=P.straight) {
          const g=m.age<P.straight+6?P.climbG:P.g;
          turn(m.fwd,aim.sub(m.pos).normalize(),Math.min(w.turn,g*9.81/Math.max(m.speed,80)),dt);
        }
      } else {
        m.speed+=Math.min(targetSpeed-m.speed,(m.hostile?80:m.kind==='fort'?420:140)*dt);
        if(!m.blind)turn(m.fwd,aim.sub(m.pos).normalize(),w.turn,dt);
      }
    }
    m.vel.copy(m.fwd).multiplyScalar(m.speed);m.pos.addScaledVector(m.vel,dt);m.distance+=m.speed*dt;
    if(m.carry){const k=m.age<1?1:Math.max(0,1-(m.age-1)/2);m.pos.addScaledVector(m.carry,dt*k);if(!k)m.carry=null;}
    if(m.distance>w.range*1.1||m.pos.y<-3){this.expire(m);return;}
    if(m.hostile&&m.decoy&&m.pos.distanceTo(m.decoy)<100){this.expire(m);this.stats.munitions++;this.events.explosion?.(m.pos.clone(),0.5);return;}
    const prev=t.prev||t.pos;
    if(swept(old,m.pos,prev,t.pos)<(m.hostile?30:w.fuze)) {
      m.alive=false;
      if(m.hostile) {
        const c=this.contacts.find(c=>c.id===m.contactId);if(c)c.alive=false;
        const dealt=w.damage*this.ship.damageScale;p.hp=Math.max(0,p.hp-dealt);this.stats.damageTaken+=dealt;
        const part=['radar','propulsion','weapons'][Math.floor(this.random()*3)];p.systems[part]=Math.max(15,p.systems[part]-20);
        this.note(`MISSILE HIT. Hull ${Math.ceil(p.hp)}%. ${part.toUpperCase()} damaged.`);this.events.hit?.(p.pos.clone());this.events.explosion?.(p.pos.clone().add(new Vector3(0,12,0)),2.5);
      } else {
        // Documented warheads, abstract damage/hit probabilities. No claim of real Pk.
        const probability=ANTI_SHIP.has(m.kind)?0.83:m.kind==='fort'?0.88:0.8;
        this.events.explosion?.(m.pos.clone(),ANTI_SHIP.has(m.kind)?2:0.7);
        if(this.random()<probability){t.hp-=w.damage;if(t.hp<=0)this.kill(t,w.name);else this.note(`${t.name} HIT · ${Math.ceil(t.hp)}% integrity.`);}else this.note(`${w.name}: no confirmed kill; target remains active.`);
      }
    }
  }
  expire(m){m.alive=false;if(m.contactId){const c=this.contacts.find(c=>c.id===m.contactId);if(c)c.alive=false;}}
  kill(c,weapon) {if(!c.alive)return;this.events.kill?.(c,weapon);c.alive=false;c.hp=0;const key=c.type==='ship'?'ships':c.type==='plane'?'planes':'munitions';this.stats[key]++;this.note(`${c.name} DESTROYED · ${weapon}`);this.events.explosion?.(c.pos.clone(),c.type==='ship'?3:1);if(c.type==='munition'){const m=this.missiles.find(m=>m.contactId===c.id);if(m)m.alive=false;}}
  finish(result,text){this.result=result;this.resultReason=text;this.running=false;this.phase=result==='victory'?'MISSION COMPLETE':'MISSION FAILED';this.note(text);this.events.end?.(result);}
}
