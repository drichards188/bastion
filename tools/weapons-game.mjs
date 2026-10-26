import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';

// Screenshot series of each weapon's firing sequence in the real game (view 4, the launcher
// inspection camera), driven through the fire-control workflow. Usage:
//   ORLAN_SCREENSHOTS=shots/weapons node tools/weapons-game.mjs [granit|fort|osa|guns|all]
const executablePath = process.env.CHROMIUM_PATH || '/home/david/.cache/ms-playwright/chromium-1247/chrome-linux64/chrome';
const url = process.env.ORLAN_URL || 'http://127.0.0.1:5202';
const out = process.env.ORLAN_SCREENSHOTS || 'shots/weapons';
const which = process.argv[2] || 'all';
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(180000);
const errors = [], shots = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { const O = window.WebSocket; window.WebSocket = function (u, p) { if (p === 'vite-hmr') return { send() {}, close() {}, addEventListener() {}, removeEventListener() {}, readyState: 1 }; return new O(u, p); }; });
const tick = (s) => page.evaluate((s) => { for (let t = 0; t < s - 1e-8; t += 0.05) __orlan.step(0.05); }, s);
// (setView snaps the inspection camera onto its current framing; the game smooths it every frame)
const shot = async (name) => { await page.evaluate(() => { document.body.classList.add('clean'); if (__orlan.view === 'weapon') __orlan.setView('weapon'); __orlan.render(); }); await page.screenshot({ path: `${out}/${name}.png` }); shots.push(name); };
const call = (fn, ...a) => page.evaluate(([fn, a]) => { const r = __orlan.fireControl[fn](...a); __orlan.step(0); return r; }, [fn, a]);
const stage = () => page.evaluate(() => __orlan.fireControl.state.stage);
try {
  await fs.mkdir(out, { recursive: true });
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'play=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__orlan?.fireControl, null, { timeout: 180000 });
  await page.evaluate(() => __orlan.stop());
  await page.evaluate(() => { __orlan.audio.enabled = false; __orlan.sim.player.autoDefense = false; __orlan.step(0); });

  async function sequence(kind, targetType, prefix, { salvo = 2, prep = [2, 4.5, 7] } = {}) {
    await page.evaluate(([kind, type, salvo]) => {
      __orlan.setWeapon(kind);
      const s = __orlan.sim;
      // bring an aircraft into the SAM envelopes for the demonstration
      let t = s.contacts.find((c) => c.alive && c.type === type);
      // a crossing target well inside the order's envelope for the whole sequence
      if (type === 'plane') { const far = kind === 'fort' ? [11000, 2500, -16000] : [4200, 900, -5200]; t.pos.copy(s.player.pos).add(new s.player.pos.constructor(...far)); t.vel.set(0, 0, -9); t.attackAt = 1e9; t.detected = true; }
      __orlan.designate(t.id);
      __orlan.fireControl.setSalvo(salvo);
      __orlan.setView('weapon');
      __orlan.step(0);
    }, [kind, targetType, salvo]);
    await shot(`${prefix}-0-safe`);
    await call('acquire');
    await tick(1.2);
    await shot(`${prefix}-1-acquire`);
    await tick(2.1);
    await call('prepare');
    let t = 0;
    for (const [i, at] of prep.entries()) { await tick(at - t); t = at; await shot(`${prefix}-2-prepare-${i + 1}`); }
    await tick(Math.max(0.2, 9 - t));
    await shot(`${prefix}-3-ready`);
    await call('arm');
    await tick(2.5);
    await shot(`${prefix}-4-armed`);
    await call('authorize');
    for (const [i, at] of [0.15, 0.6, 1.4, 3.2].entries()) { await tick(at - (i ? [0.15, 0.6, 1.4, 3.2][i - 1] : 0)); await shot(`${prefix}-5-fire-${i + 1}`); }
    await tick(6);
    await shot(`${prefix}-6-after`);
    await tick(10);
    await shot(`${prefix}-7-reset`);
    return stage();
  }
  const res = {};
  if (which === 'all' || which === 'granit') res.granit = await sequence('granit', 'ship', 'granit');
  if (which === 'all' || which === 'fort') res.fort = await sequence('fort', 'plane', 'fort', { prep: [1, 2.6, 4.2] });
  if (which === 'all' || which === 'osa') res.osa = await sequence('osa', 'plane', 'osa', { prep: [1.3, 3.5, 5.8] });
  if (which === 'all' || which === 'guns') {
    await page.evaluate(() => { const s = __orlan.sim; s.player.autoDefense = true; const p = s.player.pos.clone(); const c = s.addContact('munition', 'TEST INBOUND', p.add(new p.constructor(1800, 15, -1200)), new p.constructor(-150, 0, 100)); c.detected = true; __orlan.setView('external'); __orlan.camera.position.copy(s.player.pos).add(new p.constructor(30, 22, -60)); __orlan.step(0); });
    for (let i = 0; i < 3; i++) { await tick(0.4); await shot(`guns-${i + 1}`); }
  }
  const info = await page.evaluate(() => ({ calls: __orlan.renderer.info.render.calls, triangles: __orlan.renderer.info.render.triangles }));
  console.log(JSON.stringify({ ok: !errors.length, res, shots, errors, info }, null, 1));
} catch (e) {
  console.log(JSON.stringify({ ok: false, failure: e.message, shots, errors }, null, 1));
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally { await browser.close(); }
