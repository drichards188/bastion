// Browser check of the second playable ship: choose Slava on the title screen, load, then run a full
// Bazalt engagement and a Fort engagement through the real controls, and visit every view.
// ORLAN_URL (default http://127.0.0.1:5202), ORLAN_SCREENSHOTS (default shots/slava-game).
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const executablePath = process.env.CHROMIUM_PATH || '/home/david/.cache/ms-playwright/chromium-1247/chrome-linux64/chrome';
const url = process.env.ORLAN_URL || 'http://127.0.0.1:5202';
const out = process.env.ORLAN_SCREENSHOTS || 'shots/slava-game';
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(60000);
const errors = [], checks = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => {
  const Original = window.WebSocket;
  window.WebSocket = function (u, proto) { if (proto === 'vite-hmr') return { send() {}, close() {}, addEventListener() {}, removeEventListener() {}, readyState: 1 }; return new Original(u, proto); };
});
const state = () => page.evaluate(() => ({ stage: __orlan.fireControl.state.stage, ammo: { ...__orlan.sim.player.ammo } }));
const click = async (sel) => { await page.locator(sel).click(); await page.evaluate(() => __orlan.step(0)); };
const tick = (s) => page.evaluate((s) => { for (let t = 0; t < s - 1e-8; t += 0.05) __orlan.step(0.05); }, s);
const shot = async (name) => { await page.evaluate(() => { __orlan.render(); __orlan.render(); }); await page.locator('#viewport').screenshot({ path: `${out}/${name}.png` }); };

try {
  await fs.mkdir(out, { recursive: true });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('#start:not([disabled])').waitFor();
  await page.locator('[data-ship="slava"]').click();
  assert.match(await page.locator('#ship-blurb').textContent(), /Bazalt/);
  await page.screenshot({ path: `${out}/title.png` });
  await page.locator('#start').click();
  await page.waitForFunction(() => !!window.__orlan?.fireControl, null, { timeout: 180000 });
  await page.evaluate(() => { __orlan.stop(); __orlan.audio.enabled = false; });
  assert.match(page.url(), /ship=slava/);
  assert.deepEqual((await state()).ammo, { bazalt: 16, fort: 64, osa: 40, gun: 16000 });
  assert.equal(await page.locator('[data-weapon="bazalt"]').count(), 1);
  assert.equal(await page.locator('[data-weapon="granit"]').count(), 0);
  assert.match(await page.locator('.brand small').textContent(), /SLAVA/);
  checks.push('title selects Slava; the game loads her loadout, labels and Bazalt card');

  const ship = await page.evaluate(() => __orlan.sim.contacts.find((c) => c.type === 'ship').id);
  await page.evaluate((id) => { __orlan.designate(id); __orlan.step(0); }, ship);
  await click('[data-weapon="bazalt"]'); await click('[data-salvo="2"]');
  await page.evaluate(() => __orlan.setView('weapon'));
  await click('#acquire'); await tick(3.2); assert.equal((await state()).stage, 'tracked');
  await click('#prepare'); await tick(4); await shot('bazalt-covers'); await tick(5.7); assert.equal((await state()).stage, 'ready');
  assert.equal((await state()).ammo.bazalt, 16);
  await click('#arm'); await click('#fire'); assert.equal((await state()).ammo.bazalt, 15);
  await tick(0.6); await shot('bazalt-launch');
  await tick(7.6); assert.equal((await state()).ammo.bazalt, 14); assert.equal((await state()).stage, 'complete');
  checks.push('Bazalt: acquire, prepare (covers, engines), arm, two-round salvo 8 s apart');
  await page.keyboard.press('KeyF'); await page.evaluate(() => __orlan.step(0));
  assert.equal(await page.evaluate(() => __orlan.follow.mode), 'ride');
  await tick(2); await shot('bazalt-ride');
  await page.keyboard.press('KeyF'); await page.evaluate(() => __orlan.step(0));
  checks.push('F rides a Bazalt');

  const plane = await page.evaluate(() => __orlan.sim.contacts.find((c) => c.type === 'plane' && c.alive)?.id);
  await page.evaluate((id) => { __orlan.designate(id); __orlan.step(0); }, plane);
  await click('[data-weapon="fort"]'); await click('[data-salvo="1"]');
  await click('#acquire'); await tick(2.2); await click('#prepare'); await tick(5.2); await click('#arm'); await click('#fire');
  assert.equal((await state()).ammo.fort, 63);
  await page.evaluate(() => __orlan.setView('weapon')); await tick(0.5); await shot('fort-launch');
  checks.push('Fort fires from Slava\'s B-204 drums');

  for (const v of ['external', 'bridge']) { await page.evaluate((v) => __orlan.setView(v), v); await tick(0.2); await shot(`view-${v}`); }
  checks.push('exterior and bridge views render');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks, errors }, null, 2));
} catch (e) {
  console.error(JSON.stringify({ ok: false, checks, errors, failure: e.message }, null, 2));
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
