// Title screen and loading screen. This module is tiny and imports only the WebGL check, so the title is up
// as soon as the page is. TAKE COMMAND (or a restart, `?seed=`, or `?play=1`) shows the loading screen and
// imports main.js, which builds the world and the ship stage by stage, reporting through __orlanBoot.progress,
// and starts the mission itself when everything is ready.
import { checkGpu } from './gpu.js';

const $ = (id) => document.getElementById(id);
let begun = false;
// without WebGL (graphics acceleration off) gpu.js's card says how to turn it on and the mission never starts
const gpu = checkGpu();

window.__orlanBoot = {
  progress(text, fraction) {
    $('loading-label').textContent = text;
    $('loading-bar').style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
  },
  done() {
    $('loading').classList.add('hidden');
  },
  fail(message) {
    if (window.__orlan) return;
    $('loading').classList.remove('hidden');
    $('loading').classList.add('failed');
    $('loading-label').textContent = `Startup failed: ${message}. Details are in the browser console; reload to retry.`;
  },
};

async function begin() {
  if (begun || gpu === 'none') return;
  begun = true;
  // main.js reads the ship from the URL; keeping it there also makes a restart keep the ship.
  window.__orlanShip = ship;
  try { localStorage.setItem('orlan.ship', ship); } catch { /* storage may be blocked */ }
  const q = new URLSearchParams(location.search);
  if (q.get('ship') !== ship) { q.set('ship', ship); history.replaceState(null, '', `?${q}`); }
  $('intro').classList.add('hidden');
  $('loading').classList.remove('hidden');
  window.__orlanBoot.progress('Loading game modules', 0.02);
  try {
    await import('./main.js');
  } catch (error) {
    console.error(error);
    window.__orlanBoot.fail(error?.message || String(error));
  }
}

addEventListener('error', (e) => { if (begun) window.__orlanBoot.fail(e.message); });
addEventListener('unhandledrejection', (e) => { if (begun) window.__orlanBoot.fail(e.reason?.message || String(e.reason)); });

// Ship choice: the cards on the title, ?ship= in the URL, else the last one played in this browser.
const BLURB = {
  kirov: ['A nuclear-powered cruiser. Twenty Granit missiles.', 'Granits', 'GRANIT'],
  slava: ['A missile cruiser half Kirov\'s size. Sixteen Bazalt missiles.', 'Bazalts', 'BAZALT'],
};
const query = new URLSearchParams(location.search);
let ship = 'kirov';
try { ship = localStorage.getItem('orlan.ship') || ship; } catch { /* storage may be blocked */ }
if (BLURB[query.get('ship')]) ship = query.get('ship');
function chooseShip(id) {
  if (!BLURB[id] || begun) return;
  ship = id;
  for (const card of document.querySelectorAll('[data-ship]')) {
    const on = card.dataset.ship === id;
    card.classList.toggle('active', on);
    card.setAttribute('aria-checked', String(on));
  }
  $('ship-blurb').innerHTML = `${BLURB[id][0]}<br>Three threats. One ship under your command.`;
  for (const el of document.querySelectorAll('.anti-name')) el.textContent = BLURB[id][1];
  for (const el of document.querySelectorAll('.anti-name-up')) el.textContent = BLURB[id][2];
  $('loading-ship').textContent = `NORTHERN FLEET · ${id.toUpperCase()} · 1985`;
}
for (const card of document.querySelectorAll('[data-ship]')) card.onclick = () => chooseShip(card.dataset.ship);
chooseShip(ship);

$('start').disabled = gpu === 'none';
$('start').onclick = begin;
if (query.has('play') || query.has('seed')) begin();
