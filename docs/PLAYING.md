# How to play

## Your mission

Take Kirov into a fictional 1985 engagement. Disable both hostile frigates and survive the air and missile attack. The session lasts up to **13 minutes of simulation time**; time compression makes quiet intervals shorter.

Two frigates are reported by reconnaissance at the start. Aircraft approach and can release Harpoons before withdrawing. Five additional incoming salvos represent weapons already airborne from the wider battle. Destroying the visible ships and planes does not cancel those salvos.

## Your ship

Pick a ship on the title screen (or open the game with `?ship=kirov` or `?ship=slava`); the choice is remembered in this browser and kept by NEW SORTIE.

| | Kirov (Project 1144) | Slava (Project 1164) |
|---|---|---|
| Anti-ship | 20 P-700 Granit, below-deck inclined launchers under the foredeck | 16 P-500 Bazalt, eight fixed twin containers along the superstructure |
| Anti-ship sequence | load solution, flood launchers, open lids; 3 s between rounds | load designation, open container covers, start the sustainer engines; 8 s between rounds |
| Fort | 96 rounds, 12 drums, two Top Dome directors | 64 rounds, 8 drums, one Top Dome aft |
| Osa | 40 rounds, 2 launchers | 40 rounds, 2 launchers on the quarterdeck |
| Guns | 2 AK-100, 8 AK-630 | twin AK-130, 6 AK-630 |
| Survivability | 24,000 t | 11,500 t: each hit costs about 40% more integrity |

The firing sequence, keys and coach work the same on both. Slava has her own bridge: the room follows her measured, narrower, raked bridge face (the instruments and their layout are reconstruction, since no usable photo of a Slava bridge interior was found); from it you look over the AK-130 to the Bazalt container fronts.

## First orders

1. Press **TAKE COMMAND**. The title appears at once; the world, ship, bridge and crew are built behind a loading screen (a few seconds), which also summarises how to fire. The mission starts when loading finishes. SAM defense starts **MANUAL**: you fire every Fort and Osa missile yourself. The AK-630 close-in guns start automatic.
2. Select a frigate on the large radar or contact list and select **Granit**. Choose a salvo of two or three rounds with the **SALVO 1 2 3 4** buttons in the FIRE CONTROL heading (or Shift+1 to 4). The radar shades the selected weapon's engagement envelope between its minimum and maximum range; choosing Fort or Osa rescales the scope to show the whole envelope and the target, and against a low target it also marks the radar horizon for that altitude. **ACQUIRE TRACK**, wait for track confirmation, then **PREPARE**. The status line identifies each mechanical/check stage. Once ready, **ARM**, then **FIRE** (or Space) to authorize the salvo. The line under FIRE CONTROL always names the next step and explains a blocked one, the next button pulses, each weapon card says whether it can engage the designated contact, and **Enter** performs the next step. Missiles leave at the launcher's firing interval; assess impacts before ordering another salvo.
3. Watch the air contacts. **Fort** covers the outer defensive layer. Engage them yourself through the same sequence, or press `A` (SAM DEFENSE AUTO) to let the crews engage automatically.
4. Use **Osa** against eligible nearby threats. Very low terminal sea-skimmers can be below its engagement floor; automatic **AK-630** guns provide the last layer.
5. Deploy **chaff** when incoming missiles are close. It is finite and has a cooldown; it is not guaranteed protection.
6. Check the log, ammunition and ship condition. Continue until the mission debrief appears.

## Controls

| Control | Action |
|---|---|
| `1` | Third-person exterior camera |
| `2` | First-person bridge camera |
| `3` / `F` | Ride your newest missile, Drumfire style: drag to orbit, wheel to zoom. On impact the camera holds on the burst, then picks up the next round of the salvo or returns. `F` again returns at once |
| `Shift+F` | Ride the nearest incoming missile |
| `V` | Russian crew callouts on or off (with English subtitles) |
| `Shift+1` to `4` | Salvo size |
| `4` | Close inspection of the selected weapon/launcher |
| Mouse drag | Orbit outside, look around on the bridge |
| Mouse wheel | Exterior zoom or bridge binocular magnification |
| Click a contact | Select the target |
| `Tab` | Cycle through detected contacts |
| Weapon buttons | Select Granit, Fort or Osa |
| `Enter` | Perform the next fire-control step (acquire, prepare, arm, fire) |
| `Space` | Authorize an already armed firing sequence |
| ACQUIRE / PREPARE / ARM | Establish the selected track, prepare the launcher, then arm the firing circuit |
| ABORT | Safe the sequence and cancel rounds not yet fired |
| Left / right arrow | Change ordered heading |
| Up / down arrow | Change ordered speed |
| `R` | Toggle radar emissions |
| `A` | Toggle automatic SAM defense (starts manual) |
| `G` | Toggle the AK-630 close-in guns between automatic and hold fire (starts automatic) |
| `C` | Deploy chaff |
| `P` | Pause or resume |
| `H` | Hide or restore labels in the 3D view |
| `[` / `]` | Slower / faster simulation: 0.5×, 1×, 2×, 4×, 8×, 16× |

The command panel also provides buttons for camera, pause, radar, defense and chaff. A rejected shot displays its reason: target type, range, altitude, ammunition, launch interval, channel occupancy or radar support.

## Presentation and sound

Choose **day, dusk, heavy weather or night** using the conditions selector. The quality button cycles **Low, Medium and High**. Lower quality reduces rendering cost; it does not change weapon effectiveness. Press `H` to hide labels in the 3D view. The radar and command panel remain visible. The 3D view occupies 46% of the desktop screen, with the larger control half dedicated to radar, tracks, helm and weapon readiness.

Audio starts when you enter the mission. The sound button mutes or restores the mix. Sea, wind and machinery continue underneath the combat; the bridge muffles outside reports. Distant explosions arrive after their sound-travel delay, so seeing a flash before hearing it is intentional. These acoustic delays use real time even when the simulation is accelerated.

Every fire-control step has its own sound. Acquisition pips quicken until the radar locks on with a steady tone. Preparation brings relays, hydraulic pumps, Granit's launchers flooding, hatches knocking open and Fort's drum ratcheting round. ARM throws a guarded switch, and firing sounds the navy's electric howler (ревун). Machinery is placed at the launcher, so from the bridge it comes through the glass, muffled. The crew call each stage in Russian over the ship's intercom, with English subtitles: the officer gives the orders ("Захватить цель", acquire the target; "Залпом, пуск!", salvo, launch!) and the operator reports back ("Есть захват", locked on; "Первая пошла", first away). Press `V` or VOICE to turn the callouts off; the choice is remembered in this browser. The voices are synthetic (see `public/audio/CREDITS.md`).

## Manual firing sequence

Preparation does not expend ammunition. Granit loads the surface solution, floods its launchers and opens their lids; Fort assigns a channel, indexes its revolver drums and checks ejection/ignition, and opens its hatches when armed; Osa raises its launcher out of the magazine and trains it with the director. Their mechanisms work on the ship; press **4** to inspect them up close (during acquisition the view shows the director slewing).

These are reconstructed playable command steps with game timings, not a claim to reproduce exact Soviet operating drills. Target/weapon changes invalidate readiness. Track loss, range/altitude gates, disabled systems and missing radar support block or cancel the order. ABORT leaves already airborne missiles in flight. During a manually controlled SAM engagement, automatic SAM crews handle other contacts; emergency AK-630 remains available.

## Weapons and sensors

**Granit is for ships.** It uses a long cruise flight and terminal approach. This mission's engagements are much closer than the public maximum range; do not confuse the map scale with a missile's theoretical envelope.

**Fort and Osa are for aircraft and incoming missiles.** A target must meet range and altitude requirements. Early Fort has a substantial inner range boundary, and both systems have a low-altitude limit. A close, low incoming missile can be inappropriate for either SAM.

**AK-630 is automatic.** The close-in guns engage leakers on their own while AK-630 shows AUTO (`G` holds them); this is independent of SAM DEFENSE. The interface reports its ammunition; you do not manually aim its barrels.

**Radar matters.** Turning it off can remove air tracks and interrupt supported missile guidance. Reconnaissance surface reports are a separate information source. Radar silence is a command choice, not a free defensive advantage in this scenario.

## Ship handling and damage

The cruiser changes course and speed gradually. Ordered heading/speed and actual motion need time to converge. Hits reduce hull integrity and can degrade radar, propulsion or weapons. There is no ammunition replenishment at sea during the mission.

Pause to inspect contacts and weapon readiness. Use 1× for the final seconds of an incoming raid and higher compression while awaiting distant missile arrivals. The bridge is a viewing and command station; this version does not include free walking through the rest of the ship.

## End of the session

The debrief records the result and engagement statistics. Survive, disable both surface ships and clear the remaining air/missile threats to meet the mission objective. Losing Kirov or leaving hostile surface ships operational at the deadline fails the mission. Restart to try another allocation of offensive salvos, defensive ammunition and chaff.

For the difference between public weapon data and gameplay rules, see [History and sources](HISTORY.md).
