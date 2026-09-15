/* ==========================================================================
   The Wild West - js/core/materials.js
   Material and mesh factories, plus the sweep that moves hand-built colours into linear space.
   Provides:  mat, linMat, linearizeMaterials, box
   Expects:   scene, srgb (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
function mat(c, rough, metal) {
  const m = new THREE.MeshStandardMaterial({ color: srgb(c) });
  m.roughness = rough === undefined ? 0.84 : rough;
  m.metalness = metal === undefined ? 0.02 : metal;
  m.envMapIntensity = 0.22;
  m.__lin = true;
  return m;
}
// Materials whose colours were already pushed through srgb() build their own
// linear space, so the sweep below must leave them alone (flagging stops a
// second decode, which used to turn foliage and smoke black).
function linMat(opts) {
  const m = new THREE.MeshStandardMaterial(opts);
  m.__lin = true;
  return m;
}
// One sweep over the finished world converts every hand-built material into the
// linear working space and flags its textures, so nothing is double corrected.
function linearizeMaterials(root) {
  root.traverse(o => {
    const list = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of list) {
      if (m.__lin) continue;
      m.__lin = true;
      if (m.color) m.color.convertSRGBToLinear();
      if (m.emissive) m.emissive.convertSRGBToLinear();
      if (m.map) m.map.encoding = THREE.sRGBEncoding;
      if (m.envMapIntensity === undefined && m.isMeshStandardMaterial) m.envMapIntensity = 0.22;
    }
  });
}
function box(w, h, d, c, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  (parent || scene).add(m);
  return m;
}
