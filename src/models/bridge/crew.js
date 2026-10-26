import * as THREE from 'three';
import { buildNavalCrewman } from '../kirov-crew.js';

// The bridge watch, built with the crew module (src/models/kirov-crew.js): helmsman on the helm grips,
// a rating on the telegraph lever that follows the ordered speed, a lookout with binoculars at the
// starboard bow window, the navigator over the chart, a talker in his headset, and the weapons
// officer at the repeat station, whose hands and head follow the firing sequence.
// Every station is in the bridge group's frame; anchors are Object3Ds on the moving controls.

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// A grip target that rides on a moving control (child of its pivot group).
function anchorOn(a) {
  const o = new THREE.Object3D();
  o.position.copy(a.p);
  (a.group || null)?.add(o);
  return o;
}

// opts: { window (where the weapons officer looks at launch), lookoutRy } for other room plans.
export function buildBridgeCrew(group, anchors, stations, opts = {}) {
  const figures = [];
  const add = (role, seed, x, z, ry, opts = {}) => {
    const f = buildNavalCrewman({ role, seed, ...opts });
    f.root.position.set(x, 0, z);
    f.root.rotation.y = ry;
    f.root.name = `bridge-crew:${role}`;
    group.add(f.root);
    figures.push(f);
    return f;
  };
  const S = stations;

  // helmsman: both hands on the turning grips
  const helm = add('helmsman', 3, S.helm.x, S.helm.z + 0.28, 0);
  const grips = anchors.helmGrips.map(anchorOn);
  helm.hold('L', grips[0], { style: 'post', fade: 0 });
  helm.hold('R', grips[1], { style: 'post', fade: 0 });

  // telegraph: right hand on the starboard lever's knob, which moves with the ordered speed
  const tg = anchors.telegraphGrips.map(anchorOn);
  const tele = add('telegraph', 11, S.telegraph.x + 0.105 - 0.26, S.telegraph.z - 0.06 + 0.36, 0);
  tele.hold('R', tg[1], { style: 'knob', fade: 0 });
  tele.lookAt(new THREE.Vector3(0.2, 1.5, -2), 0.4);

  // lookout with binoculars, turned a little to starboard
  const look = add('lookout', 7, S.lookout.x, S.lookout.z, opts.lookoutRy ?? -0.35);

  // navigator leaning over the chart table (he faces aft, the table's working side)
  const nav = add('navigator', 5, S.chart.x, S.chart.z, Math.PI);

  // talker with the headset, by the aft telephones
  const talk = add('talker', 9, S.talker.x, S.talker.z, S.talker.ry);

  // weapons officer at the repeat station
  const wo = add('officer', 2, S.repeat.x, S.repeat.z, S.repeat.ry);
  wo.setPose('console', { fade: 0 });
  const panel = new THREE.Object3D();
  panel.position.copy(anchors.repeatPanel.p);
  group.add(panel);
  const window = new THREE.Object3D();
  window.position.copy(opts.window ?? new THREE.Vector3(0.5, 1.2, -6));
  group.add(window);
  const button = anchors.launchButton ? anchorOn(anchors.launchButton) : null;
  let lastStage = '';

  // Stage reactions: watch the panel while the sequence runs, a hand on the guarded push once armed,
  // eyes out of the window on launch and after the salvo, a step back when the order is aborted.
  function react(stage) {
    if (stage === lastStage) return;
    lastStage = stage;
    if (stage === 'armed' && button) { wo.setPose('console'); wo.hold('R', button, { style: 'button', fade: 0.5 }); wo.lookAt(panel, 1); }
    else if (stage === 'firing') { wo.release('R', 0.6); wo.setPose('console'); wo.lookAt(window, 1); }
    else if (stage === 'complete') { wo.release('R'); wo.setPose('stand'); wo.lookAt(window, 0.8); }
    else if (stage === 'aborted') { wo.release('R'); wo.setPose('atEase'); wo.lookAt(panel, 0.5); }
    else if (['tracking', 'tracked', 'preparing', 'ready'].includes(stage)) { wo.release('R'); wo.setPose('console'); wo.lookAt(panel, 1); }
    else { wo.release('R'); wo.setPose('console'); wo.lookAt(null, 0); }
  }

  return {
    figures,
    update(dt, stage) {
      react(stage);
      for (const f of figures) f.update(dt);
    },
    dispose() { for (const f of figures) f.dispose?.(); },
  };
}
