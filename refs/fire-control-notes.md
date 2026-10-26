# Manual fire-control workflow

`FireControl` is a player-facing simulation workflow. It is **not an exact reconstruction of Soviet operating procedures**, a firing manual, or a claim about real crew preparation times.

The player must designate a contact, acquire a solution, start timed weapon preparation, arm the prepared weapon and authorize the order. Separate actions matter: changing target or weapon removes readiness; changing salvo/profile invalidates the prepared solution; loss of radar support safes SAM preparation; ammunition and geometry are rechecked before every round. No missile is expended during preparation. An abort cancels only unfired rounds.

## Mechanisms represented

- **Granit:** target solution, flooding the launchers and opening their lids. The flooding step replaced an earlier generic circuit check once two sources were found that state the launcher must be filled with sea water before firing: A. Kuzin's history of pr.1144 ("перед стрельбой в ПУ на крейсере необходимо было закачать забортную воду") and militaryrussia.ru's Granit entry ("старт мокрый"). Its 2 s duration is game timing; the lids are hydraulically driven (missilery.info). The weapons model shows each step on deck: see the Weapons section of `docs/MODELLED.md`.
- **Fort:** fire-control channel assignment, rotary-magazine indexing and an ejection/ignition check. Actual visible cold ejection followed by ignition remains in the existing missile simulation (`coldLaunch` and `ignite` events); this wrapper does not invent a second missile launch. On deck the drums index under shut hatches during PREPARE and the order's hatches open when it is armed (the hatch timing is reconstructed).
- **Osa:** raising the launcher out of its magazine (the ZIF-122 stows below deck with its two arms vertical: missilery.info), aligning launcher and director, and checking command guidance. Preparation duration is a pacing value.

Public reference trail: the original Kirov US Navy foredeck photograph already indexed in the project's `refs/README.md` provides primary visual evidence for the distinct deck installations. The existing historical notes hold the platform/weapon characteristic sources. Searches also surfaced [Osa imagery](https://weaponsystems.net/system/464-M-4%20Osa-M), [Fort description](https://missilery.info/missile/fort), and [Granit description](https://en.missilery.info/missile/granit); these are secondary cross-checks, not sufficient authority for exact operational procedures. Accordingly all step labels are explicit game abstractions.

The current acquisition times (3 / 2 / 1.5 seconds) and preparation times (8 / 5 / 6.5 seconds for Granit / Fort / Osa) are authored game timing. The simulation's existing per-weapon launch interval still determines spacing inside an authorized salvo. Completion means **launch order complete**, not a confirmed target kill; players must assess the radar.

## Integration

Copy `fire-control.js` to `src/fire-control.js` beside `sim.js`. Instantiate `new FireControl(sim)`. Call `update(simulationDt)` after `sim.update(simulationDt)`; paused or zero-delta updates do not advance the workflow. Render `status()` to display progress and button availability. Rebind selection and weapon controls to `designate(id)` / `setWeapon(kind)`. The fire command must call `authorize()`, not `sim.fire()`.

`events.prepare` and `events.step` contain `kind`, `targetId`, stage and step information for physical launcher animation. `events.fire` receives the missile. Other lifecycle events return status snapshots. Optional `onChange(snapshot)` mirrors `events.change`.

During manual SAM control, `sim.manualFireTargetId` is set. In `Simulation.automaticDefense`, skip that ID only in the SAM assignment loop, preserving the full contact list for emergency CIWS. The marker clears on abort or completion.

Optional Granit profile selection sets the dispatched missile's `profile`. If exposing this UI, the existing Granit guidance line should be:

```js
const high = m.profile === 'high' || (m.profile !== 'low' && m.launchPos.distanceTo(t.pos) > 100000);
```

The profile is a rendering/trajectory abstraction. The shared published maximum range is not a claim that every chosen flight profile can achieve that range in real conditions.

## Validation

Thirteen tests cover the ordered workflow, arm/authorization interlocks, three-round timing, abort before/after launch, radar failure, reconnaissance targeting with radar silent, target changes, pause, ammunition, wrong target role, target destruction, distinct preparation steps, profile reset and range/altitude gates while a launcher cycles. The staged test imports need changing to `../src/sim.js` and `../src/fire-control.js` when installed under the final project's `tools/`.
