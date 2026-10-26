import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';

// Screenshots of preview/weapons.html. Usage: node tools/weapons-preview.mjs <name> <query> [js]
// e.g. node tools/weapons-preview.mjs granit-open "weapon=granit&stage=ready&t=8&view=granit&clean=1"
// Extra JS (run in the page, with __preview) can be given as the third argument.
const executablePath = process.env.CHROMIUM_PATH || '/home/david/.cache/ms-playwright/chromium-1247/chrome-linux64/chrome';
const base = process.env.ORLAN_URL || 'http://127.0.0.1:5202';
const out = process.env.ORLAN_SCREENSHOTS || 'shots/weapons';
const jobs = [];
for (let i = 2; i < process.argv.length; i += 3) jobs.push([process.argv[i], process.argv[i + 1] || '', process.argv[i + 2] || '']);
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { const O = window.WebSocket; window.WebSocket = function (u, p) { if (p === 'vite-hmr') return { send() {}, close() {}, addEventListener() {}, removeEventListener() {}, readyState: 1 }; return new O(u, p); }; });
await fs.mkdir(out, { recursive: true });
const results = [];
try {
  for (const [name, query, js] of jobs) {
    await page.goto(`${base}/preview/weapons.html?frozen=1&${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__preview, null, { timeout: 120000 });
    const info = await page.evaluate(async (code) => { if (code) await (new Function('p', `return (async()=>{${code}})()`))(window.__preview); window.__preview.render(); return window.__preview.info(); }, js);
    await page.screenshot({ path: `${out}/${name}.png` });
    results.push({ name, ...info });
  }
} catch (e) { errors.push(e.message); }
console.log(JSON.stringify({ results, errors }, null, 1));
await browser.close();
