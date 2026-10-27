import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {Simulation,WEAPONS,SHIPS} from '../src/sim.js';
function advance(s,seconds){for(let i=0;i<Math.ceil(seconds*20);i++)s.update(0.05);}
function start(){const s=new Simulation();s.start();s.player.autoDefense=false;s.player.ciwsAuto=false;return s;}

test('initial fit, mission contacts and magazines match selected ship',()=>{
 const s=start(); assert.equal(s.player.ammo.granit,20);assert.equal(s.player.ammo.fort,96);assert.equal(s.player.ammo.osa,40);assert.equal(s.player.ammo.gun,16000);
 assert.equal(s.contacts.filter(c=>c.type==='ship').length,2);assert.equal(s.contacts.filter(c=>c.type==='plane').length,2);
 assert.equal(WEAPONS.fort.minAlt,25);
});
test('weapons validate target roles, radar, altitude, minimum range and magazine before spending ammunition',()=>{
 const s=start(),ship=s.contacts[0],plane=s.contacts[2];assert.equal(s.fire('fort',ship.id).ok,false);assert.equal(s.fire('granit',plane.id).ok,false);
 s.player.radar=false;assert.match(s.canFire('fort',plane.id).reason,/Radar/);s.player.radar=true;
 plane.pos.set(10000,15,0);assert.match(s.canFire('fort',plane.id).reason,/Below/);
 plane.pos.set(3000,100,0);assert.match(s.canFire('fort',plane.id).reason,/minimum/);
 s.player.ammo.granit=0;assert.match(s.canFire('granit',ship.id).reason,/empty/);assert.equal(s.player.ammo.fort,96);
});
test('launch anchor follows translated and rotated ship; launcher cycle prevents double shot',()=>{
 const s=start();s.player.pos.set(2000,0,1000);s.player.heading=Math.PI/2;
 const r=s.fire('granit',s.contacts[0].id);assert.equal(r.ok,true);assert.equal(s.player.ammo.granit,19);
 assert.ok(Math.abs(r.missile.pos.x-2085)<0.001);assert.ok(Math.abs(r.missile.pos.z-995)<0.001);
 assert.equal(s.fire('granit',s.contacts[0].id).ok,false);assert.equal(s.player.ammo.granit,19);
});
test('guidance channels constrain simultaneous independent targets',()=>{
 const s=start();s.player.ammo.fort=96;
 for(let i=0;i<6;i++)s.missiles.push({alive:true,kind:'fort',targetId:`other${i}`});
 assert.match(s.canFire('fort',s.contacts[2].id).reason,/channels/);
});
test('SAM loses guidance and self destructs when transmitting radar goes silent',()=>{
 const s=start(),r=s.fire('fort',s.contacts[2].id);assert.equal(r.ok,true);s.player.radar=false;advance(s,4);assert.equal(r.missile.alive,false);
});
test('missile encounter occurs even when all initial launch platforms destroyed',()=>{
 const s=start();for(const c of s.contacts)c.alive=false;advance(s,36);
 assert.ok(s.contacts.some(c=>c.type==='munition'&&c.alive));assert.equal(s.stats.encountered.munitions,3);
});
test('pause and invalid timesteps do not advance the battle',()=>{
 const s=start();s.paused=true;advance(s,3);assert.equal(s.time,0);s.paused=false;s.update(NaN);s.update(-1);assert.equal(s.time,0);
});
test('chaff has finite charges and a cooldown',()=>{
 const s=start();assert.equal(s.deployChaff(),true);assert.equal(s.chaffCharges,7);assert.equal(s.deployChaff(),false);advance(s,36);assert.equal(s.deployChaff(),true);assert.equal(s.chaffCharges,6);
});
test('mission can be won by deliberate surface attack and layered automatic defense',()=>{
 const s=new Simulation();s.start();s.player.autoDefense=true;let next=0;
 while(!s.result&&s.time<800){if(s.time>=next){const target=s.contacts.find(c=>c.alive&&c.type==='ship');if(target)s.fire('granit',target.id);next=s.time+6;}s.update(0.5);}
 assert.equal(s.result,'victory');assert.equal(s.stats.ships,2);assert.ok(s.stats.planes>=1);assert.ok(s.stats.munitions>=1);assert.equal(s.completedWaves.size,6);assert.ok(s.player.hp>0);
});
test('ship starts with manual SAM fire and automatic AK-630 close-in guns',()=>{
 const s=new Simulation();s.start();
 assert.equal(s.player.autoDefense,false);assert.equal(s.player.ciwsAuto,true);
 const launched=s.stats.launched;for(let i=0;i<400;i++)s.update(0.5);
 assert.ok(!s.missiles.some(m=>!m.hostile&&(m.kind==='fort'||m.kind==='osa')),'no SAM fires without an order');assert.equal(s.stats.launched,launched);
 s.toggleCiws();assert.equal(s.player.ciwsAuto,false);
});
test('each weapon has its own auto switch; the overall switch sets them all',()=>{
 const s=new Simulation();s.start();
 assert.deepEqual({...s.player.auto},{granit:false,fort:false,osa:false,gun:true});
 // Fort automatic only: aircraft are engaged with Fort, never Osa or Granit.
 s.setAuto('gun',false);s.setAuto('fort',true);
 for(let i=0;i<240&&!s.missiles.some(m=>!m.hostile);i++)s.update(0.5);
 const own=s.missiles.filter(m=>!m.hostile);assert.ok(own.length>0,'Fort crew engages on its own');assert.ok(own.every(m=>m.kind==='fort'));
 // Anti-ship automatic: Granit goes at a ship, at most two in flight per target.
 const g=new Simulation();g.start();g.setAllAuto(false);g.setAuto('granit',true);
 for(let i=0;i<40;i++)g.update(0.5);
 const granits=g.missiles.filter(m=>!m.hostile&&m.kind==='granit');assert.ok(granits.length>0,'Granit crew engages ships');
 const perTarget={};for(const m of granits.filter(m=>m.alive))perTarget[m.targetId]=(perTarget[m.targetId]||0)+1;assert.ok(Object.values(perTarget).every(n=>n<=2));
 // The overall switch: all automatic, then all manual; the compatibility views follow.
 g.toggleAutoDefense();assert.equal(g.allAuto,true);assert.equal(g.player.autoDefense,true);assert.equal(g.player.ciwsAuto,true);
 g.toggleAutoDefense();assert.ok(Object.values(g.player.auto).every(v=>v===false));
 // A manual sequence's target is left alone by the automatic crew.
 const h=new Simulation();h.start();h.setAllAuto(false);const ship=h.contacts.find(c=>c.type==='ship');h.manualFireTargetId=ship.id;h.setAuto('granit',true);
 for(let i=0;i<40;i++)h.update(0.5);assert.ok(!h.missiles.some(m=>!m.hostile&&m.targetId===ship.id));
});
test('Slava carries her own loadout: 16 Bazalt, 64 Fort, no Granit, and takes heavier damage',()=>{
 const s=new Simulation({ship:'slava'});s.start();s.player.autoDefense=false;s.player.ciwsAuto=false;
 assert.equal(s.player.id,'slava');assert.deepEqual({...s.player.ammo},{bazalt:16,fort:64,osa:40,gun:16000});
 const ship=s.contacts.find(c=>c.type==='ship'),plane=s.contacts.find(c=>c.type==='plane');
 assert.equal(s.canFire('granit',ship.id).ok,false);assert.match(s.canFire('granit',ship.id).reason,/not fitted/);
 assert.equal(s.canFire('bazalt',plane.id).ok,false);
 const shot=s.fire('bazalt',ship.id);assert.ok(shot.ok,shot.reason);assert.equal(s.player.ammo.bazalt,15);
 const m=s.missiles.at(-1);assert.equal(m.kind,'bazalt');for(let i=0;i<200&&m.alive;i++)s.update(0.5);assert.ok(m.age>20,'Bazalt flies the anti-ship profile');
 const k=new Simulation({ship:'kirov'});assert.equal(SHIPS.slava.damageScale>SHIPS.kirov.damageScale,true);assert.deepEqual({...k.player.ammo},{granit:20,fort:96,osa:40,gun:16000});
});
test('undefended missiles can defeat player; seeded battle results repeat exactly',()=>{
 const a=start(),b=start();while(!a.result)a.update(0.5);while(!b.result)b.update(0.5);
 assert.equal(a.result,'defeat');assert.equal(a.player.hp,0);assert.equal(a.time,b.time);assert.deepEqual(a.stats,b.stats);assert.deepEqual(a.player.systems,b.player.systems);
});
test('high speed interceptor uses swept closest approach rather than skipping its target',()=>{
 const s=start();for(const c of s.contacts)c.alive=false;
 const t=s.addContact('plane','Crossing target',new Vector3(0,100,-50),new Vector3());
 s.random=()=>0;
 s.missiles.push({id:'test',kind:'fort',pos:new Vector3(0,100,0),vel:new Vector3(0,0,-1700),fwd:new Vector3(0,0,-1),alive:true,hostile:false,targetId:t.id,age:2,speed:1700,distance:0,blind:0});
 s.update(0.05);assert.equal(t.alive,false);
});
test('model-provided launch cells are used without mutating their local coordinates',()=>{
 const s=start(),local=new Vector3(3,11,-60);s.setLaunchPoints({granit:[local]});s.player.pos.set(20,0,50);
 const r=s.fire('granit',s.contacts[0].id);assert.deepEqual(r.missile.pos.toArray(),[23,11,-10]);assert.deepEqual(local.toArray(),[3,11,-60]);
});
test('Fort cold eject precedes motor ignition',()=>{
 const s=start(),events=[];s.events.coldLaunch=()=>events.push('cold');s.events.ignite=()=>events.push('ignite');
 const {missile}=s.fire('fort',s.contacts[2].id);assert.equal(missile.motor,false);assert.deepEqual(events,['cold']);advance(s,1.1);assert.equal(missile.motor,true);assert.deepEqual(events,['cold','ignite']);
});
test('frigates maneuver and spend a finite defensive inventory against inbound missiles',()=>{
 const s=start(),c=s.contacts[0],oldHeading=c.heading;s.random=()=>0.99;
 const m={id:'inbound',alive:true,kind:'granit',targetId:c.id,pos:c.pos.clone().add(new Vector3(1000,6,0))};s.missiles.push(m);
 s.enemyDefense(c,0.05);assert.notEqual(c.heading,oldHeading);assert.equal(c.chaffCharges,2);assert.equal(c.defenseRounds,9);
 s.enemyDefense(c,0.05);assert.equal(c.chaffCharges,2);assert.equal(c.defenseRounds,9);
});
test('a surviving hostile threat prevents victory at the operational deadline',()=>{
 const s=start();for(const c of s.contacts)c.alive=false;s.time=779.95;s.completedWaves=new Set([0,1,2,3,4,'air2']);
 s.addContact('plane','Unresolved raid',new Vector3(100000,1000,0),new Vector3(),{attackAt:Infinity});s.update(0.1);
 assert.equal(s.result,'defeat');assert.match(s.resultReason,/Active air or missile threats/);
});
test('new seeds vary attack bearings while the same seed reproduces them',()=>{
 const a=new Simulation({seed:100}),b=new Simulation({seed:101}),c=new Simulation({seed:100});
 assert.notDeepEqual(a.waveVariation,b.waveVariation);assert.deepEqual(a.waveVariation,c.waveVariation);
});
test('model launch frames place the round in its cell along its bore, carried by the moving ship',()=>{
 const s=start(),calls=[];s.player.pos.set(100,0,200);s.player.heading=Math.PI/2;s.player.vel.set(10,0,0);
 s.setLaunchFrames((kind,slot,dir)=>{calls.push({kind,slot,dir:dir.clone()});return {pos:new Vector3(0,4,-50),dir:new Vector3(0,Math.sin(Math.PI/3),-Math.cos(Math.PI/3)),speed:25};});
 const r=s.fire('granit',s.contacts[0].id),m=r.missile;assert.equal(calls.length,1);assert.equal(calls[0].kind,'granit');assert.equal(calls[0].slot,0);assert.ok(Math.abs(calls[0].dir.length()-1)<1e-9);
 // ship-local (0,4,-50) at heading 090 is 50 m east of the ship; the bore turns with the ship
 assert.ok(Math.abs(m.pos.x-150)<1e-6&&Math.abs(m.pos.y-4)<1e-6&&Math.abs(m.pos.z-200)<1e-6);assert.ok(Math.abs(m.fwd.x-0.5)<1e-6&&Math.abs(m.fwd.y-Math.sin(Math.PI/3))<1e-6);assert.equal(m.speed,25);
 const x0=m.pos.x;s.updateMissile(m,0.05);assert.ok(Math.abs(m.pos.x-x0-(m.fwd.x*m.speed+10)*0.05)<0.05,'round keeps the ship velocity while clearing the launcher');
 s.setLaunchFrames(null);s.cooldowns.granit=0;const d=s.fire('granit',s.contacts[0].id).missile;assert.equal(d.carry,null);
});
test('a rippled Granit salvo runs in low while one scout pops up; a lone round just flies low',()=>{
 const s=start(),t=s.contacts[0],fired=[];t.samRounds=0;
 while(fired.length<3){if(s.canFire('granit',t.id).ok)fired.push(s.fire('granit',t.id).missile);advance(s,0.05);}
 assert.equal(new Set(fired.map(m=>m.salvo)).size,1);assert.deepEqual(fired.map(m=>!!m.scout),[true,false,false]);
 advance(s,24-s.time);assert.ok(fired[0].pos.y>400,'scout popped up');assert.ok(fired.slice(1).every(m=>m.pos.y<100),'pack stays low');
 advance(s,10);assert.ok(fired[0].pos.y<80,'scout back down with the pack');
 const lone=start(),r=lone.fire('granit',lone.contacts[0].id).missile;advance(lone,30);assert.ok(!r.scout);assert.ok(r.pos.y<60);
 advance(lone,10);const later=lone.fire('granit',lone.contacts[0].id).missile;assert.notEqual(later.salvo,r.salvo,'rounds far apart are separate salvos');
});
test('when the scout is lost the next round with room rises to take over',()=>{
 const s=start(),t=s.contacts[0],fired=[];t.samRounds=0;
 while(fired.length<3){if(s.canFire('granit',t.id).ok)fired.push(s.fire('granit',t.id).missile);advance(s,0.05);}
 advance(s,20-s.time);fired[0].alive=false;advance(s,6);
 assert.equal(fired[1].scout,true);assert.ok(fired[1].pos.y>400);assert.ok(fired[2].pos.y<100);
 assert.ok(s.log.some(l=>/scout lost; round 2 rising/.test(l.text)));
});
test('the frigate SAM engages only a popped-up scout, never a lone sea-skimmer',()=>{
 const s=start(),t=s.contacts[0];let fired=0;
 for(let i=0;i<20*60;i++){if(fired<4&&s.canFire('granit',t.id).ok){s.fire('granit',t.id);fired++;}s.update(0.05);}
 const sam=s.log.filter(l=>/SAM/.test(l.text));assert.ok(sam.length>0);assert.ok(sam.every(l=>/scout/.test(l.text)));
 const lone=start(),u=lone.contacts[0];lone.fire('granit',u.id);advance(lone,60);assert.equal(u.samRounds,4);
});
