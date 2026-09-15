/* ==========================================================================
   The Wild West - js/fx/casings.js
   Ejected brass casings.
   Provides:  ejectCasing, updateCasings, casings
   Expects:   scene, tmpV (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- bullet casings ----------
const casings = [];
const gCasing = new THREE.CylinderGeometry(0.0085, 0.0085, 0.023, 6);
const casingMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.85, roughness: 0.32 });
function ejectCasing(pos, dir) {
  if (settings.quality === 0) return;
  const m = new THREE.Mesh(gCasing, casingMat);
  m.position.copy(pos);
  scene.add(m);
  casings.push({
    m, life: 3.2,
    vx: dir.x * rnd(1.2, 2.4) + rnd(-0.6, 0.6),
    vy: rnd(1.4, 2.6),
    vz: dir.z * rnd(1.2, 2.4) + rnd(-0.6, 0.6),
    rx: rnd(-14, 14), rz: rnd(-14, 14)
  });
  while (casings.length > 46) { const c = casings.shift(); scene.remove(c.m); }
}
function updateCasings(dt) {
  for (let i = casings.length - 1; i >= 0; i--) {
    const c = casings[i];
    c.life -= dt;
    c.vy -= 16 * dt;
    c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z += c.vz * dt;
    const gy = heightAt(c.m.position.x, c.m.position.z) + 0.012;
    if (c.m.position.y < gy) { c.m.position.y = gy; c.vy *= -0.28; c.vx *= 0.6; c.vz *= 0.6; c.rx *= 0.4; c.rz *= 0.4; }
    c.m.rotation.x += c.rx * dt; c.m.rotation.z += c.rz * dt;
    if (c.life <= 0) { scene.remove(c.m); casings.splice(i, 1); }
  }
}

