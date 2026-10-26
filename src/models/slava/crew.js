import { buildDeckCrew, defaultCrewFactory } from '../exterior/crew.js';

// Deck crew posts for the Slava exterior (same figures and factory as Kirov's, from kirov-crew.js):
// lookouts on the bridge wings and the foremast gallery, a watch officer, a signalman on the bridge
// roof, deckhands on the forecastle, by the boat and on the quarterdeck under the helicopter pad.
// Positions are ship-local (deck surface under the feet); heading is the root's rotation.y (0 faces
// the bow; +PI/2 faces port). Representative watch positions, not photographed individuals.
export const SLAVA_CREW_POSTS = [
  { name: 'lookout-port-wing', role: 'lookout', pos: [-8.0, 17.4, -26.9], heading: Math.PI * 0.3, seed: 21 },
  { name: 'lookout-stbd-wing', role: 'lookout', pos: [8.0, 17.4, -26.9], heading: -Math.PI * 0.3, seed: 22 },
  { name: 'watch-officer-stbd-wing', role: 'watchOfficer', pos: [7.9, 17.4, -24.6], heading: -0.25, seed: 23 },
  { name: 'signalman-bridge-roof', role: 'signalman', pos: [-5.6, 20.1, -24.2], heading: Math.PI * 0.35, pose: 'atEase', seed: 24 },
  { name: 'lookout-foremast-gallery', role: 'lookout', pos: [2.4, 26.0, -19.6], heading: -0.2, seed: 25 },
  { name: 'deckhand-forecastle-port', role: 'deckhand', pos: [-6.1, 7.7, -70.0], heading: Math.PI * 0.5, pose: 'rail', seed: 26 },
  { name: 'deckhand-boat-port', role: 'deckhand', pos: [-9.9, 6.0, 38.6], heading: Math.PI * 0.5, pose: 'rail', seed: 27 },
  { name: 'sailor-quarterdeck-port', role: 'sailor', pos: [-7.7, 4.3, 79.0], heading: Math.PI * 0.6, pose: 'atEase', seed: 28 },
  { name: 'deckhand-quarterdeck-stbd', role: 'deckhand', pos: [9.0, 4.3, 84.0], heading: -Math.PI * 0.5, pose: 'rail', seed: 29 },
];

export { buildDeckCrew, defaultCrewFactory };
