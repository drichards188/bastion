// Preview-only stand-ins for the Slava weapons, drawn at SLAVA_MOUNTS so the exterior's silhouette
// can be compared with the photographs before slava-weapons.js exists (?proxies=1 in slava.html).
// Simple grey shapes at the photographed sizes; never used by the game.
import * as THREE from 'three';

export function buildWeaponProxies(MOUNTS) {
  const g = new THREE.Group();
  g.name = 'weapon-proxies';
  const mat = new THREE.MeshStandardMaterial({ color: 0xb4babb, roughness: 0.7, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a5254, roughness: 0.7 });
  const add = (geo, m = mat) => { const mesh = new THREE.Mesh(geo, m); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); return mesh; };
  // Bazalt containers: cylinders along each tube axis with a rounded front cap
  for (const L of MOUNTS.bazalt) for (const t of L.tubes) {
    const a = new THREE.Vector3(t.front.x, t.front.y, t.front.z), b = new THREE.Vector3(t.rear.x, t.rear.y, t.rear.z);
    const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
    const m = add(new THREE.CylinderGeometry(L.diameter / 2, L.diameter / 2, len, 20));
    m.position.copy(mid);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(b).normalize());
    const cap = add(new THREE.SphereGeometry(L.diameter / 2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2));
    cap.position.copy(a);
    cap.quaternion.copy(m.quaternion);
    cap.scale.set(1, 0.45, 1);
  }
  // AK-130 gunhouse: a rounded turret 4.9 m across, 4.4 m tall, with two barrels
  {
    const k = MOUNTS.ak130;
    const t = add(new THREE.SphereGeometry(2.45, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.62));
    t.position.set(k.x, k.y + 1.0, k.z); t.scale.set(1, 1.25, 1.2);
    add(new THREE.CylinderGeometry(2.5, 2.5, 1.0, 24)).position.set(k.x, k.y + 0.5, k.z);
    for (const s of [-1, 1]) { const b = add(new THREE.CylinderGeometry(0.12, 0.14, 7.5, 8), dark); b.rotation.x = Math.PI / 2; b.position.set(k.x + s * 0.6, k.y + 2.2, k.z - 5.6); }
  }
  // AK-630: a squat turret and a barrel
  for (const k of MOUNTS.ak630) {
    const t = add(new THREE.SphereGeometry(0.95, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2));
    t.position.set(k.x, k.y, k.z); t.scale.set(1, 1.2, 1.1);
    const b = add(new THREE.CylinderGeometry(0.1, 0.1, 2.0, 8), dark);
    const dir = new THREE.Vector3(-Math.sin(k.ry), 0, -Math.cos(k.ry));
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    b.position.set(k.x + dir.x * 1.4, k.y + 0.7, k.z + dir.z * 1.4);
  }
  // RBU-6000: a vertical bundle
  for (const k of MOUNTS.rbu6000) add(new THREE.CylinderGeometry(0.75, 0.75, 2.4, 12)).position.set(k.x, k.y + 1.6, k.z);
  // Top Dome: drum and dome; Pop Group and Kite Screech: drums with a dish
  for (const k of MOUNTS.directors.fort) {
    add(new THREE.CylinderGeometry(1.9, 2.0, 1.4, 20)).position.set(k.x, k.y + 0.7, k.z);
    add(new THREE.SphereGeometry(2.15, 20, 12)).position.set(k.x, k.y + 2.5, k.z + 0.8);
  }
  for (const k of [...MOUNTS.directors.osa, ...MOUNTS.directors.ak130]) {
    add(new THREE.CylinderGeometry(0.8, 0.9, 1.2, 14)).position.set(k.x, k.y + 0.6, k.z);
    const d = add(new THREE.CylinderGeometry(1.1, 1.1, 0.25, 18));
    d.rotation.x = Math.PI / 2; d.position.set(k.x, k.y + 1.9, k.z + (Math.cos(k.ry) > 0 ? -0.6 : 0.6));
  }
  // Osa well housings
  for (const k of MOUNTS.osa) add(new THREE.CylinderGeometry(k.tubRadius, k.tubRadius, 1.2, 24)).position.set(k.x, k.y + 0.6, k.z);
  return g;
}
