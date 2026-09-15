/* ==========================================================================
   The Wild West - js/world/store.js
   The general store building the player buys from.
   Provides:  STORE, storeMarker
   Expects:   scene, blocks, shootables, heightAt (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- general store ----------
const STORE = { x: -13, z: 12, r: 5.2 };
let storeMarker = null;
(function makeStore() {
  const g = new THREE.Group();
  const base = heightAt(STORE.x, STORE.z);
  const sw = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.4, 5), plasterMat(0xf2d39c, 4, 2));
  sw.position.set(0, 1.7, 0); g.add(sw);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.3, 5.8), roofMat(0xc0523a));
  roof.position.y = 3.55; roof.castShadow = true; g.add(roof);
  const awn = new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.22, 1.9), plankMat(0x8a5a3e, 4, 1));
  awn.position.set(0, 3.1, 3.4); g.add(awn);
  [-2.9, 2.9].forEach(px => box(0.16, 3.1, 0.16, 0x6a4a2c, px, 1.55, 4.2, g));
  box(7.0, 0.3, 0.2, 0x5b3a21, 0, 3.55, 4.35, g);
  const signMat = mat(0xffffff, 0.86);
  signMat.map = canvasTex(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#5b3a21'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#f0d9a8'; ctx.font = '700 52px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('GENERAL STORE', w / 2, h / 2 + 2);
  });
  signMat.map.repeat.set(1, 1);
  signMat.emissive = srgb(0x120c05);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.8), signMat);
  sign.position.set(0, 2.62, 4.42);
  g.add(sign);
  box(5.6, 1.05, 1.1, 0x8a6a45, 0, 0.55, 4.0, g);
  [-0.9, 0.6, 1.9].forEach(px => box(0.5, 0.5, 0.5, 0x9a7a52, px, 1.35, 4.0, g));
  box(1.2, 2.2, 0.16, 0x4a2f18, -2.4, 1.1, 2.55, g);
  box(1.2, 2.2, 0.16, 0x4a2f18, 2.4, 1.1, 2.55, g);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; shootables.push(o); solid.push(o); } });
  g.position.set(STORE.x, base, STORE.z);
  g.rotation.y = Math.atan2(-STORE.x, -STORE.z);
  scene.add(g);
  blocks.push({ x: STORE.x, z: STORE.z, r: 4.4 });
  // the awning and the counter out front
  blocks.push({ x: STORE.x + headX(g.rotation.y) * 3.7, z: STORE.z + headZ(g.rotation.y) * 3.7, r: 2.7 });

  storeMarker = new THREE.Group();
  const dm = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), new THREE.MeshBasicMaterial({ color: 0xffd97a, transparent: true, opacity: 0.85 }));
  storeMarker.add(dm);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 6, 22), new THREE.MeshBasicMaterial({ color: 0xffd97a, transparent: true, opacity: 0.5 }));
  ring.rotation.x = Math.PI / 2;
  storeMarker.add(ring);
  storeMarker.position.set(STORE.x, base + 4.4, STORE.z);
  scene.add(storeMarker);
})();

