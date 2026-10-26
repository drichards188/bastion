import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const executablePath = process.env.CHROMIUM_PATH || '/home/david/.cache/ms-playwright/chromium-1247/chrome-linux64/chrome';
const url = process.env.ORLAN_URL || 'http://127.0.0.1:5202';
const browser = await chromium.launch({executablePath, headless:true, args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport:{width:1440,height:900}});
page.setDefaultTimeout(60000);
const errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const state=()=>page.evaluate(()=>({running:__orlan.sim.running,paused:__orlan.sim.paused,time:__orlan.sim.time,view:__orlan.view,weapon:__orlan.weapon,radar:__orlan.sim.player.radar,auto:__orlan.sim.player.autoDefense,ammo:{...__orlan.sim.player.ammo},heading:__orlan.sim.player.heading,desiredHeading:__orlan.sim.player.desiredHeading,speed:__orlan.sim.player.speed,desiredSpeed:__orlan.sim.player.desiredSpeed,result:__orlan.sim.result}));
async function click(selector){await page.locator(selector).click();await page.evaluate(()=>__orlan.step(0));}
try {
  await page.goto(url+(url.includes('?')?'&':'?')+'play=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.__orlan,{timeout:120000});
  await page.evaluate(()=>__orlan.stop?.());
  assert.equal(await page.locator('#intro').isVisible(),true);assert.equal((await state()).running,false);checks.push('title loads with simulation stopped');
  assert.equal((await state()).running,true);assert.equal(await page.locator('#intro').isVisible(),false);checks.push('start enters command session');
  await click('#sound');
  const shipId=await page.evaluate(()=>__orlan.sim.contacts.find(c=>c.type==='ship').id);
  await click(`#contacts [data-id="${shipId}"]`);await click('[data-weapon="granit"]');
  const ammo=(await state()).ammo.granit;assert.equal(await page.locator('#fire').isDisabled(),false);await click('#fire');assert.equal((await state()).ammo.granit,ammo-1);checks.push('contact selection and Granit launch spend exactly one round');
  await click('[data-weapon="fort"]');assert.equal(await page.locator('#fire').isDisabled(),true);assert.match(await page.locator('#weapon-status').textContent(),/aircraft|incoming|target/i);checks.push('wrong weapon/target pairing rejected with explanation');
  await click('#radar-toggle');assert.equal((await state()).radar,false);await click('#radar-toggle');assert.equal((await state()).radar,true);
  await click('#auto-toggle');assert.equal((await state()).auto,false);await click('#auto-toggle');assert.equal((await state()).auto,true);checks.push('radar and automatic-defense switches affect simulation');
  await click('#pause');const paused=(await state()).time;await page.evaluate(()=>__orlan.sim.update(5));assert.equal((await state()).time,paused);await click('#pause');checks.push('pause prevents simulation time advancing');
  await click('#time-up');assert.equal((await page.locator('#time-scale').textContent()).trim(),'2×');await click('#time-down');assert.equal((await page.locator('#time-scale').textContent()).trim(),'1×');checks.push('time compression controls update');
  const helm=await state();await click('#starboard');await click('#faster');let ordered=await state();assert.ok(ordered.desiredHeading>helm.desiredHeading);assert.ok(ordered.desiredSpeed>helm.desiredSpeed);
  await page.evaluate(()=>__orlan.step(5));ordered=await state();assert.ok(ordered.heading>helm.heading);assert.ok(ordered.speed>helm.speed);checks.push('helm orders cause actual heading and speed changes');
  await click('[data-view="external"]');assert.equal((await state()).view,'external');await page.evaluate(()=>__orlan.render());
  await fs.mkdir('shots',{recursive:true});await page.screenshot({path:'shots/functional-exterior.png'});
  await click('[data-view="bridge"]');assert.equal((await state()).view,'bridge');assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('bridge')),true);await page.evaluate(()=>__orlan.render());await page.screenshot({path:'shots/functional-bridge.png'});
  const camera=await page.evaluate(()=>({position:__orlan.camera.position.toArray(),ship:__orlan.sim.player.pos.toArray()}));assert.ok(Math.hypot(camera.position[0]-camera.ship[0],camera.position[2]-camera.ship[2])<160);assert.ok(camera.position[1]>10&&camera.position[1]<60);checks.push('exterior and bridge cameras render; bridge sits on ship');
  await click('[data-view="missile"]');assert.equal((await state()).view,'missile');await page.evaluate(()=>__orlan.render());checks.push('missile camera available for live missile');
  await click('#help');assert.equal((await state()).paused,true);await click('#help-close');assert.equal((await state()).paused,false);checks.push('help pauses and restores prior running state');
  const final=await page.evaluate(()=>{
    const s=__orlan.sim;let next=s.time;
    // The visual integration has already been exercised; deterministic simulation
    // stepping now checks the entire real session without hundreds of GPU frames.
    const t0=performance.now();
    while(!s.result&&s.time<800){if(s.time>=next){const c=s.contacts.find(c=>c.alive&&c.type==='ship'&&s.missiles.filter(m=>m.alive&&m.kind==='granit'&&m.targetId===c.id).length<3);if(c)s.fire('granit',c.id);next=s.time+4;}s.update(.5);}
    __orlan.step(0);
    return {result:s.result,reason:s.resultReason,time:s.time,hp:s.player.hp,stats:s.stats,ammo:s.player.ammo,simulationMs:performance.now()-t0,renderCalls:__orlan.renderer.info.render.calls,triangles:__orlan.renderer.info.render.triangles};
  });
  assert.equal(final.result,'victory');assert.equal(final.stats.ships,2);assert.ok(final.stats.planes>0);assert.ok(final.stats.munitions>0);assert.equal(await page.locator('#debrief').isVisible(),true);assert.match(await page.locator('#result-title').textContent(),/accomplished|complete/i);checks.push('complete session wins and shows debrief after all three encounter types');
  assert.deepEqual(errors,[],'Browser must not report application or rendering errors');
  console.log(JSON.stringify({ok:true,checks,errors,final},null,2));
} catch(error) {
  console.error(JSON.stringify({ok:false,checks,errors,failure:error.message},null,2));
  await fs.mkdir('shots',{recursive:true});await page.screenshot({path:'shots/functional-failure.png'}).catch(()=>{});process.exitCode=1;
} finally {await browser.close();}
