import * as THREE from 'three';
import { buildNavalCrewman } from '../kirov-crew.js';

// Deck crew posts for the exterior: lookouts on the bridge wings and tower platforms, a watch
// officer, a signalman, and deckhands aft. Positions are ship-local (deck surface under the feet);
// heading is the root's rotation.y (0 faces the bow; +PI/2 faces port). Representative watch
// positions, not photographed individuals. Nine figures: about 40k triangles and nine draw calls.
export const CREW_POSTS = [
  { name: 'lookout-port-wing', role: 'lookout', pos: [-11.7, 20.45, -16.3], heading: Math.PI * 0.3, seed: 11 },
  { name: 'lookout-stbd-wing', role: 'lookout', pos: [11.7, 20.45, -16.3], heading: -Math.PI * 0.3, seed: 12 },
  { name: 'watch-officer-stbd-wing', role: 'watchOfficer', pos: [9.6, 20.45, -12.4], heading: -0.15, seed: 13 },
  { name: 'lookout-tower-port', role: 'lookout', pos: [-6.6, 31.5, 9.5], heading: Math.PI * 0.5, seed: 14 },
  { name: 'lookout-aft-tower-stbd', role: 'lookout', pos: [4.6, 23.0, 35.5], heading: -Math.PI * 0.7, seed: 15 },
  { name: 'signalman-03-deck', role: 'signalman', pos: [7.2, 17.6, -20.8], heading: -Math.PI * 0.25, pose: 'atEase', seed: 16 },
  { name: 'deckhand-boat-deck-port', role: 'deckhand', pos: [-13.2, 11.6, 16.0], heading: Math.PI * 0.5, pose: 'rail', seed: 17 },
  { name: 'deckhand-quarterdeck-port', role: 'deckhand', pos: [-10.9, 7.35, 103.0], heading: Math.PI * 0.5, pose: 'rail', seed: 18 },
  { name: 'sailor-quarterdeck-stbd', role: 'sailor', pos: [8.2, 7.35, 112.0], heading: -Math.PI * 0.6, pose: 'atEase', seed: 19 },
];

// Default factory: one of the crew module's skinned naval figures per post.
export function defaultCrewFactory(post) {
  const fig = buildNavalCrewman({ role: post.role, seed: post.seed });
  if (post.pose) fig.setPose(post.pose, { fade: 0 });
  return fig;
}

// Builds the posts with `factory` (post -> { root, update(dt) }) into `parent`.
export function buildDeckCrew(parent, factory = defaultCrewFactory, posts = CREW_POSTS) {
  const crew = [];
  const g = new THREE.Group();
  g.name = 'kirov-deck-crew';
  parent.add(g);
  for (const post of posts) {
    let fig;
    try { fig = factory(post); } catch (e) { console.warn('crew factory failed for', post.name, e); continue; }
    if (!fig?.root) continue;
    fig.root.position.set(...post.pos);
    fig.root.rotation.y = post.heading;
    fig.root.name = post.name;
    g.add(fig.root);
    crew.push(fig);
  }
  return { group: g, crew, update: (dt) => { for (const f of crew) f.update?.(dt); } };
}
