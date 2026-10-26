import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim.js';
import { FireControl } from '../src/fire-control.js';

function setup(kind='granit') {const sim=new Simulation();sim.start();sim.player.autoDefense=false;sim.player.ciwsAuto=false;const control=new FireControl(sim);control.setWeapon(kind);control.designate(sim.contacts[kind==='granit'?0:2].id);return {sim,control};}
function tick(sim,control,seconds) {for(let t=0;t<seconds-1e-8;t+=.05){sim.update(.05);control.update(.05);}}
function ready(sim,control) {assert.equal(control.acquire().ok,true);tick(sim,control,3.1);assert.equal(control.state.stage,'tracked');assert.equal(control.prepare().ok,true);tick(sim,control,8.1);assert.equal(control.state.stage,'ready');}

test('manual launch requires acquisition, preparation and separate arming authorization',()=>{const {sim,control:c}=setup();assert.equal(c.authorize().ok,false);assert.equal(c.arm().ok,false);assert.equal(c.prepare().ok,false);ready(sim,c);assert.equal(sim.player.ammo.granit,20);assert.equal(c.status().canArm,true);assert.equal(c.status().canAuthorize,false);assert.equal(c.arm().ok,true);assert.equal(c.authorize().ok,true);assert.equal(sim.player.ammo.granit,19);assert.equal(c.state.stage,'complete');});
test('salvo spends one missile per launcher interval, preserving first-shot cooldown',()=>{const {sim,control:c}=setup();c.setSalvo(3);ready(sim,c);c.arm();c.authorize();assert.equal(sim.player.ammo.granit,19);tick(sim,c,2.9);assert.equal(sim.player.ammo.granit,19);tick(sim,c,.2);assert.equal(sim.player.ammo.granit,18);tick(sim,c,3.1);assert.equal(sim.player.ammo.granit,17);assert.equal(c.state.stage,'complete');assert.equal(c.state.fired,3);});
test('aborting preparation spends no ammunition and clears manual target reservation',()=>{const {sim,control:c}=setup('fort');c.acquire();assert.equal(sim.manualFireTargetId,c.state.targetId);tick(sim,c,2.1);c.prepare();tick(sim,c,1);c.abort();assert.equal(sim.player.ammo.fort,96);assert.equal(c.state.stage,'aborted');assert.equal(sim.manualFireTargetId,null);});
test('radar interruption during SAM preparation safes the weapon',()=>{const {sim,control:c}=setup('fort');c.acquire();tick(sim,c,2.1);c.prepare();sim.player.radar=false;tick(sim,c,.1);assert.equal(c.state.stage,'aborted');assert.match(c.state.reason,/Radar/);assert.equal(c.arm().ok,false);assert.equal(sim.player.ammo.fort,96);});
test('reconnaissance Granit solution remains valid in radar silence',()=>{const {sim,control:c}=setup();sim.player.radar=false;ready(sim,c);assert.equal(c.arm().ok,true);assert.equal(c.authorize().ok,true);});
test('changing designated target clears readiness and never fires at stale designation',()=>{const {sim,control:c}=setup();ready(sim,c);c.arm();c.designate(sim.contacts[1].id);assert.equal(c.state.stage,'idle');assert.equal(c.authorize().ok,false);assert.equal(sim.player.ammo.granit,20);});
test('pause and zero dt freeze preparation',()=>{const {sim,control:c}=setup();c.acquire();c.update(0);assert.equal(c.state.progress,0);sim.paused=true;c.update(4);assert.equal(c.state.progress,0);sim.paused=false;tick(sim,c,3.1);assert.equal(c.state.stage,'tracked');});
test('salvo inventory and incompatible target roles are interlocked',()=>{const {sim,control:c}=setup();c.setSalvo(4);sim.player.ammo.granit=3;assert.match(c.acquire().reason,/Insufficient/);sim.player.ammo.granit=20;c.designate(sim.contacts[2].id);assert.match(c.acquire().reason,/surface/);assert.equal(c.setSalvo(0).ok,false);assert.equal(c.setWeapon('harpoon').ok,false);});
test('target loss during armed state cancels without expending a weapon',()=>{const {sim,control:c}=setup();ready(sim,c);c.arm();sim.contacts[0].alive=false;tick(sim,c,.1);assert.equal(c.state.stage,'aborted');assert.equal(sim.player.ammo.granit,20);});
test('abort during salvo cancels only rounds not yet launched',()=>{const {sim,control:c}=setup();c.setSalvo(4);ready(sim,c);c.arm();c.authorize();c.abort();tick(sim,c,10);assert.equal(sim.player.ammo.granit,19);assert.equal(sim.missiles.filter(m=>m.kind==='granit').length,1);});
test('preparation steps identify actual different mechanisms and emit lifecycle events',()=>{const {sim,control:c}=setup('fort');const stages=[];c.events.step=s=>stages.push(s.stepLabel);ready(sim,c);assert.equal(stages.length,3);assert.ok(stages.includes('INDEX ROTARY MAGAZINE'));let cold=false;sim.events.coldLaunch=()=>cold=true;c.arm();c.authorize();assert.equal(cold,true);});
test('Granit profile changes revoke readiness and are transferred to dispatched missiles',()=>{const {sim,control:c}=setup();ready(sim,c);c.setProfile('low');assert.equal(c.state.stage,'tracked');c.prepare();tick(sim,c,8.1);c.arm();const r=c.authorize();assert.equal(r.missile.profile,'low');});
test('out-of-altitude target is interlocked even while launcher cycles',()=>{const {sim,control:c}=setup('fort');sim.cooldowns.fort=100;sim.contacts[2].pos.y=15;assert.match(c.acquire().reason,/altitude/);});
test('each weapon reports its mechanical preparation steps in order',()=>{const order={granit:['LOAD TARGET SOLUTION','FLOOD LAUNCHERS','OPEN LAUNCHER LIDS'],fort:['ASSIGN FIRE-CONTROL CHANNEL','INDEX ROTARY MAGAZINE','CHECK EJECTION / IGNITION'],osa:['RAISE LAUNCHER FROM MAGAZINE','TRAIN LAUNCHER / DIRECTOR','CHECK COMMAND GUIDANCE']};for(const kind of Object.keys(order)){const {sim,control:c}=setup(kind);if(kind==='osa'){const t=sim.contacts[2];t.pos.set(0,500,-6000);}const steps=[];c.events.step=s=>steps.push([s.stepIndex,s.stepLabel]);assert.equal(c.acquire().ok,true,kind);tick(sim,c,3.1);assert.equal(c.prepare().ok,true,kind);tick(sim,c,8.1);assert.deepEqual(steps.map(s=>s[1]),order[kind]);assert.deepEqual(steps.map(s=>s[0]),[0,1,2]);assert.equal(c.state.stage,'ready');}});
test('Slava runs the Bazalt sequence: covers, engines, an 8 s salvo interval, no Granit', () => {
  const sim = new Simulation({ ship: 'slava' }); sim.start(); sim.player.autoDefense = false; sim.player.ciwsAuto = false;
  const control = new FireControl(sim);
  assert.equal(control.setWeapon('bazalt').ok, true);
  control.designate(sim.contacts.find(c => c.type === 'ship').id);
  assert.equal(control.setSalvo(2).ok, true);
  assert.equal(control.acquire().ok, true); tick(sim, control, 3.1); assert.equal(control.state.stage, 'tracked');
  assert.equal(control.prepare().ok, true);
  assert.deepEqual(control.state.steps.map(x => x.label), ['LOAD TARGET DESIGNATION', 'OPEN CONTAINER COVERS', 'START SUSTAINER ENGINES']);
  tick(sim, control, 9.6); assert.equal(control.state.stage, 'ready'); assert.equal(sim.player.ammo.bazalt, 16);
  assert.equal(control.arm().ok, true); assert.equal(control.authorize().ok, true); assert.equal(sim.player.ammo.bazalt, 15);
  tick(sim, control, 7.8); assert.equal(sim.player.ammo.bazalt, 15); tick(sim, control, 0.4); assert.equal(sim.player.ammo.bazalt, 14);
  assert.equal(control.state.stage, 'complete');
  control.setWeapon('granit'); control.designate(sim.contacts.find(c => c.type === 'ship').id);
  assert.equal(control.acquire().ok, false);
});

