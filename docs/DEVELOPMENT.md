# Development

## Run and build

```bash
npm install
npm run dev
npm test
npm run build
```

The development server uses port 5202. `npm run preview` serves the production build on that port. A modern desktop browser with WebGL2 is required. The production output is static: serve `dist/` with an HTTP server. A game host needs the contents of `dist/`, not the project directory or reference photographs.

## Modules

| File | Responsibility |
|---|---|
| `src/boot.js` | Title and loading screens. Imports nothing, so the title shows at once; TAKE COMMAND (or `?play=1`, or a restart's `?seed=`) imports `main.js` behind the loading screen. |
| `src/main.js` | Builds the world in stages (reporting to the loading screen, then precompiling shaders) and starts the mission; scene, camera modes, input, UI integration, the fire-control coach, visual/audio effects and frame loop. |
| `src/fire-cues.js` | Fire-control sound: Russian crew callouts over a shipboard intercom chain with subtitles, and synthesized machinery for each step (lock tones, relays, pumps, flooding, hatches, the Fort drum ratchet, the arming switch, the firing howler), driven by the fire-control state. |
| `tools/make-voices.py`, `tools/voice-lines.json` | Offline generator for `public/audio/voice/` (Piper TTS); the JSON holds each line's Russian text, stress-marked TTS text, English subtitle, speaker and synthesis settings. |
| `src/follow-camera.js` | Missile ride (port of Drumfire's `followShell`): behind the round, orbit and zoom, a tripod shot of the burst, then a callback; stays clear of the ship while a round climbs out. |
| `src/sim.js` | `SHIPS` (per-ship magazines, anti-ship weapon, damage scale) and `ANTI_SHIP` (Granit and Bazalt share anti-ship rules and guidance). |
| `src/sim.js` (core) | Deterministic combat state, weapons, contacts, sensors, encounter scheduling and outcomes. |
| `src/audio.js` | Recorded and synthesized ambient/combat audio, spatialization, travel delay and view-dependent mixing. |
| `src/models.js` | Composes Kirov: `buildExterior({ weapons:false })`, `buildWeapons()` and `buildBridge({ anchor })`, plus the deck cut-outs for weapon hatches; re-exports the legacy opposing ships, aircraft and missiles. |
| `src/models/kirov-exterior.js`, `src/models/exterior/` | Hull, superstructure, masts and sensors, deck fittings, boats, deck crew. Exports `MOUNTS` (every weapon and director position), `deckHeightAt(z)` and `BRIDGE_ANCHOR`; measured layout in `exterior/lines.js`. |
| `src/models/kirov-weapons.js`, `src/models/weapons/` | Granit, Fort, Osa, AK-630, AK-100, Metel and RBU mounts, the fire-control directors, their mechanisms through each fire-control step, launch frames and launch effects. |
| `src/models/kirov-bridge.js`, `src/models/bridge/` | Navigation bridge interior, its instruments and repeat displays, lighting and bridge crew. |
| `src/models/slava.js`, `src/models/slava-exterior.js`, `src/models/slava/`, `src/models/slava-weapons.js`, `weapons/bazalt.js`, `weapons/ak130.js` | The second playable ship. `buildSlava()` has the same interface as `buildKirov()`; main.js picks one from `SHIPS` (sim.js) and the `?ship=` the title screen sets, and loads Slava's modules only when she is chosen. Previews: `preview/slava.html`, `preview/slava-weapons.html`. |
| `src/models/kirov-crew.js` | Skinned Soviet naval crew figures (ported from Drumfire's crew rig): outfits, poses, hand holds on moving controls. |
| `src/ocean.js` | Gerstner-wave ocean, foam and wakes, adapted from Battle Stations. |
| `src/noise.js`, `src/shaderlib.js` | Shared procedural and shader utilities from Battle Stations. |
| `src/atmosphere.js`, `src/clouds.js` | Physical sky, sun/night lighting and procedural cloud rendering from Battle Stations. |
| `src/post.js` | Drumfire HDR post-processing, shared depth, ambient occlusion, exposure, bloom, grading and shockwaves. |
| `src/fx.js` | Echelon smoke, missile motors, fireballs, sparks and debris. |
| `src/style.css` | Game interface and responsive layout. |
| `tools/sim.test.js` | Headless simulation tests. |
| `refs/README.md` | Source, authorship and evidence index for model references. |
| `preview/*.html` | Dev-server-only model viewers: `exterior.html` (`?full=1` composes the whole ship), `weapons.html`, `bridge.html`, `crew.html`. Not build inputs. |

Simulation vectors use meters, velocities use meters per second, and heading is compass clockwise from north. Ship models face local negative Z; the ship render rotation is the negative compass heading. User-facing speed is in knots.

## Verification

`npm test` exercises launch validation, guidance, moving launches, encounter coverage and outcomes without rendering. A production build checks module bundling. Browser verification must additionally cover loading, starting, each camera, contact selection, firing, pause/time changes, all conditions/quality presets, sound and the debrief. A build alone does not verify WebGL shaders or the visibility of bridge windows.

## Source and assets

The new project is standalone; its runtime imports are local modules and installed npm dependencies. Reused source comes from the owner's Battle Stations, Echelon and Drumfire projects. Reference photos are local research material, not runtime assets. Keep `refs/photos/` and downloaded HTML excluded from source publication. Bridge photographs are copyrighted and may not be redistributed merely because they were used as reference.

## Firing workflow and split view

`src/fire-control.js` wraps manual simulation launches with explicit track/preparation/arming/authorization states. The automatic crew still uses the simulation's lower-level launch API. `src/models.js` composes the exterior, weapons and bridge modules (see Modules); the weapons sit at the exterior's `MOUNTS` and the bridge at `BRIDGE_ANCHOR`, so move a mount or the bridge only there. Distant enemy assets remain in `models-legacy.js`. Renderer size, camera aspect and contact projection use the actual viewport, not the browser width. The radar has a separate DPI-scaled canvas and hit mapping.

`npm test` runs combat and fire-control tests; `npm run test:browser` verifies the staged UI and complete mission against the local server, and `node tools/browser-slava.mjs` picks Slava on the title screen and runs a Bazalt and a Fort engagement (set `ORLAN_URL` to test a server on another port). Its screenshots include the 1440px and 1280px split layouts.
