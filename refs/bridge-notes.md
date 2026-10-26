# Bridge model notes

`src/models/kirov-bridge.js` and `src/models/bridge/` model the original Kirov's navigation bridge as procedural geometry with generated textures. No photograph is used as a texture: paint, timber, linoleum, perforated panels, dial faces, placards, stencils, the chart and the screens are all drawn in code (`bridge/textures.js`, `bridge/art.js`, `bridge/displays.js`).

## Evidenced (seen in the photographs)

From Oleg Kuleshov's 2015 photographs aboard the ship (`refs/photos/kirov-bridge-*.jpg`, Korabel.ru, local study only):

- **Bulkheads:** pale sea-green paint over steel, screwed panels with batten joints, a timber capping strip on the aft bulkhead. Chips at edges and around fittings; the paint is otherwise intact.
- **Windows:** each opening has its own deep cast frame with rounded corners, a sash with a seal, and dogs with large cream five-lobed knobs on swing bolts. Wide pilasters between the windows carry cream round junction boxes (window heater switches) and conduit. There is a sloped green ledge under each window, red stencilled frame numbers, and wipers outside.
- **Timber sill:** a broad varnished sill along the windows at hip height, worn pale at the nose, over a panelled green face.
- **Overhead:** perforated off-white panels with flat ribs, hanging threaded rods and clamps, and round frosted dome lamps in square recesses.
- **Deck:** a brown deck covering.
- **Helm:** a curved grey cast housing with two hand-sized vertical chromed grips.
- **Telegraph:** twin drums with chromed, bolted rims and black lettered bands, a chromed lever, and a cast pedestal whose curved face carries two round reply dials.
- **Optical sight:** a cream cast housing with round bolted bosses, a knurled black adjustment wheel on a turret, a chromed eyepiece and tubular handgrips, on a flanged column.
- **Commander's chair:** a tall chair with a tan vinyl shell and seat and a worn brown velour back.
- **Aft bulkhead:** wood-framed glazed panels into a lit space behind, a wood-trimmed doorway, a dome lamp, and the green "СИГНАЛЬНАЯ ВАХТА" cabinet with its painted name board.

Period style from other Soviet ships (Commons, CC BY-SA 3.0, see `refs/README.md`): Minsk's chart table with glass top and chromed rail, cream wall cases with dials and cable glands, red stencils; Razumny's telegraph with lettered order plates and glazed order dials on the drum ends.

## Reconstructed (not evidenced)

- **Room size and plan:** 15.5 m across, 7.1 m deep, 2.38 m to the overhead panels (2.6 m outside, from the exterior's photo measurement of the roofline). The plan has seven forward windows, chamfered forward corners with one window each, one window and a weathertight door to each wing, and the aft bulkhead.
- **Station layout:** where the helm, telegraph, sight, repeaters, chair, consoles and chart table stand. The photographs show the fittings, not their 1985 arrangement.
- **Gameplay additions:** the "Vaigach" radar indicator, the remote Fort channel scope, the command post console and the guarded weapons-command repeat station. The repeat station mirrors the game's firing sequence; it is not claimed to have existed on the navigation bridge.
- **Instrument faces and placards:** original artwork in Soviet naval style (rudder angle indicator, shaft revolutions, log, anemometer, clinometer, ship's clock, barometer, gyro repeater cards, telegraph order dials). Wording follows naval usage. Makers' plates are generic.
- **Night lighting:** red night lamps and instrument glow are a plausible watch arrangement, not documented for Kirov.

## Behaviour

- Telegraph levers step through the order notches with the ordered speed; the reply pointers follow with a lag, and the telegraph rating's hand stays on the lever (crew module IK).
- The helm bar turns with the rudder order, and the helmsman's hands stay on the grips. The gyro repeater cards turn with the ship's head. The rudder indicator, revolution counters, log and clock read live values.
- The repeat station shows every firing stage on nine annunciator tiles: designated, tracking, tracked, preparing, ready, armed, firing, complete and aborted. Tracking and preparing flash amber, and the launch tile flashes red. A status window shows the weapon, the stage in Russian and English, the current step (translated), the salvo and a progress bar. The weapon selector turns, and the red guard over the launch push lifts once armed. The weapons officer watches the panel, puts a hand on the push when armed, and looks out of the window at launch.
- The navigation radar's PPI has afterglow, sea clutter and contacts relative to the ship's head. The Fort scope shows air tracks with the track gate.
- Wipers sweep in heavy weather and park otherwise. The window glass carries salt, spray spots and grime, clear in each wiper's arc.
- Day, dusk and heavy weather bring the white dome lamps up in steps. At night the room goes to dim red night lighting with backlit dials.

## View

The eye stands 3.4 m behind the centre window, starboard of the helmsman. The vertical field of view is 72 degrees, and the wheel narrows it to 15 degrees for binoculars. Pitching down past about 7 degrees leans the eye up to 2 m toward the glass (`main.js`), so the foredeck launchers come into view over the sill.

## Slava plan (Project 1164)

`buildBridge({ anchor: SLAVA_BRIDGE_ANCHOR, plan: SLAVA_BRIDGE })` builds the room for the Slava.

- **Measured (reprojection of USN photographs by the Slava exterior, see `src/models/slava/lines.js`):**
  - the level: floor at ship y 17.4, roof at 20.1;
  - the faceted plan: flat front +-4.25 m at z -31.8, chamfers to the +-7.2 m sides 2.95 m aft;
  - the rake of the front and chamfers: 0.8 m out at the roof, chamfer ends 0.25 m forward;
  - the window band (sill 18.3, head 19.3) and window counts (8 front, 4 per chamfer, 5 per side at the exterior's z positions);
  - the wing doors (z -25.7, 0.8 by 1.8 m);
  - the level's after end at z -8.8 with round ports from z -21.0.
- **Reconstructed:**
  - the internal bulkhead that ends the navigation bridge at about z -21.6;
  - the whole interior fit and station layout;
  - the deckhead repeater panel (a common arrangement over raked windows, not evidenced for Slava).

  The equipment is the Kirov's evidenced family (the same Soviet yards and period), not a Slava survey. No Slava, Marshal Ustinov, Moskva or Varyag bridge interior photograph was found under a usable licence; the Commons photographs of these ships (Moskva 2015, Varyag 2002) show only the weather decks.
- **View:** the eye is at ship (0.5, 19.0, -30.3), behind a centre window, with a 0.4 m lean (`group.userData.lean`, read by `main.js`). The front has an even number of windows, so the centreline falls on a mullion; the eye stands 0.5 m to starboard at the centre of a window.
