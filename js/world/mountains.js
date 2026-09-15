/* ==========================================================================
   The Wild West - js/world/mountains.js
   Distant ridge line and the sky signature plane.
   Provides:  mountainMesh, mtnMats, skyText
   Expects:   scene, srgb (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- distant mountains ----------
// Peaks carry their own vertical gradient and opt out of the scene fog: the
// flat haze colour was bleaching them into paper cut-outs, so the ridge line
// gets its depth from the base-to-summit gradient instead.
const mtnMats = [];
function mountainMesh(radius, height, sides, baseCol, topCol) {
  const geo = new THREE.ConeGeometry(radius, height, sides);
  // unlit backdrop: a ridge this far away is mostly haze, so the authored
  // gradient is more trustworthy than whatever the sun happens to do to it.
  // Colour is scaled by the day/night weights from the main loop.
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  m.__lin = true;
  mtnMats.push(m);
  const p = geo.attributes.position;
  const arr = new Float32Array(p.count * 3);
  const a = srgb(baseCol), b = srgb(topCol), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const k = clamp((p.getY(i) + height / 2) / height, 0, 1);
    tmp.copy(a).lerp(b, k * k);
    arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  return new THREE.Mesh(geo, m);
}
(function mountains() {
  const g = new THREE.Group();
  for (let i = 0; i < 40; i++) {
    const a = i / 40 * TAU + rnd(-0.04, 0.04);
    const r = rnd(240, 330);
    const h = rnd(42, 96);
    const rad = rnd(34, 64);
    const snowy = h > 68;
    const cone = mountainMesh(rad, h, rnd(5, 7) | 0,
      snowy ? 0x2a3270 : 0x2f3d78,
      snowy ? 0xcfe0f8 : 0x6f86c8);
    cone.position.set(Math.cos(a) * r, h * 0.42 - 6, Math.sin(a) * r);
    cone.rotation.y = rnd(0, TAU);
    cone.scale.set(rnd(0.85, 1.35), rnd(0.8, 1.2), rnd(0.7, 1.3));
    g.add(cone);
  }
  for (let i = 0; i < 34; i++) {
    const a = i / 34 * TAU + rnd(-0.05, 0.05);
    const r = rnd(330, 470);
    const h = rnd(70, 150);
    const cone = mountainMesh(rnd(50, 100), h, rnd(4, 6) | 0, 0x4f60a8, 0x93a6e4);
    cone.position.set(Math.cos(a) * r, h * 0.42 - 8, Math.sin(a) * r);
    cone.rotation.y = rnd(0, TAU);
    cone.scale.set(rnd(0.9, 1.4), rnd(0.75, 1.05), rnd(0.8, 1.4));
    g.add(cone);
  }
  for (let i = 0; i < 8; i++) {
    const a = rnd(0, TAU), r = rnd(240, 340);
    const flat = mountainMesh(rnd(26, 40), rnd(16, 30), 6, 0x4a56a0, 0x7b8ad0);
    flat.position.set(Math.cos(a) * r, 4, Math.sin(a) * r);
    g.add(flat);
  }
  g.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
  scene.add(g);
})();

// ---------- sky text ----------
const skyText = (() => {
  const text = 'Created by Kasra_dn';
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 512;
  const ctx = cv.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 190;
  const font = s => `800 ${s}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
  ctx.font = font(size);
  const tw = ctx.measureText(text).width;
  if (tw > cv.width - 120) size = Math.floor(size * (cv.width - 120) / tw);
  const cx = cv.width / 2, cy = cv.height / 2;
  const grad = ctx.createLinearGradient(0, cy - size / 2, 0, cy + size / 2);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.6, '#cfeeff');
  grad.addColorStop(1, '#6fd3ff');
  ctx.font = font(size);
  const tw2 = ctx.measureText(text).width;
  ctx.shadowColor = 'rgba(90, 200, 255, 0.9)';
  ctx.shadowBlur = 60;
  ctx.fillStyle = grad;
  ctx.fillText(text, cx, cy);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, cx, cy);
  ctx.fillRect(cx - tw2 / 2, cy + size * 0.62, tw2, Math.max(6, size * 0.05));
  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  const skyMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false, side: THREE.DoubleSide });
  skyMat.__lin = true;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(188, 47), skyMat);
  m.position.set(0, 430, -430);
  scene.add(m);
  return m;
})();

