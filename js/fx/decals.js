/* ==========================================================================
   The Wild West - js/fx/decals.js
   Impact holes, blood splats and pools, tracers and their pooled lifetimes.
   Provides:  addDecal, addSplat, spawnBloodPool, addTracer
   Expects:   scene, heightAt, canvasTex, srgb (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- decals / blood / tracers ----------
// Impact marks are textured plates now: a punched hole with a scorched rim, and
// blood drawn as an irregular mask so every splat is tinted by its material.
function holeTex() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(0,0,0,0.95)');
  g.addColorStop(0.35, 'rgba(26,17,10,0.72)');
  g.addColorStop(0.7, 'rgba(52,38,22,0.3)');
  g.addColorStop(1, 'rgba(60,44,26,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(6,4,2,1)';
  ctx.beginPath(); ctx.arc(32, 32, 6.4, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(168,136,94,0.9)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU + Math.random() * 0.5;
    ctx.beginPath();
    ctx.moveTo(32 + Math.cos(a) * 6, 32 + Math.sin(a) * 6);
    ctx.lineTo(32 + Math.cos(a) * rnd(9, 16), 32 + Math.sin(a) * rnd(9, 16));
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  return t;
}
// white blob + droplets, used as an alpha mask so the material colour tints it
function blobMaskTex(blobs, drops, spread, core) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < blobs; i++) {
    const a = rnd(0, TAU), rr = rnd(0, spread);
    ctx.beginPath();
    ctx.ellipse(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr, rnd(core * 0.5, core), rnd(core * 0.45, core * 0.95), rnd(0, TAU), 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < drops; i++) {
    const a = rnd(0, TAU), rr = rnd(spread * 1.1, 58);
    ctx.beginPath();
    ctx.arc(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr, rnd(1.5, 5.5), 0, TAU);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  return t;
}
const holeMap = holeTex();
const splatMap = blobMaskTex(7, 9, 12, 16);
const poolMap = blobMaskTex(10, 14, 24, 26);
const decals = [], bloodPools = [], splats = [];
function addDecal(point, normal, color, size) {
  const mat = new THREE.MeshBasicMaterial({
    map: holeMap, color: color && color.isColor ? color : srgb(color),
    transparent: true, opacity: 0.95, depthWrite: false, depthTest: true
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size * 2.6, size * 2.6), mat);
  m.position.copy(point).addScaledVector(normal, 0.02);
  m.lookAt(point.clone().add(normal));
  m.rotateZ(Math.random() * TAU);
  m.scale.setScalar(rnd(0.75, 1.35));
  scene.add(m);
  decals.push(m);
  if (decals.length > 130) {
    const old = decals.shift();
    scene.remove(old);
    old.material.dispose();
    old.geometry.dispose();
  }
}
function addSplat(mesh, worldPoint, worldNormal, size) {
  const localP = mesh.worldToLocal(worldPoint.clone());
  const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
  const localN = worldNormal.clone().transformDirection(inv);
  const m = new THREE.Mesh(new THREE.CircleGeometry(size, 12), new THREE.MeshBasicMaterial({
    map: splatMap, color: srgb(rnd(0, 1) < 0.35 ? 0x4a0606 : 0x7a0f10),
    transparent: true, opacity: 0.96, depthWrite: false, side: THREE.DoubleSide
  }));
  m.position.copy(localP).addScaledVector(localN, 0.012);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), localN);
  m.rotateZ(Math.random() * TAU);
  m.scale.set(rnd(0.85, 1.5), rnd(0.85, 1.5), 1);
  mesh.add(m);
  splats.push(m);
  // drips running off the wound
  if (Math.random() < 0.6) {
    const drip = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.3, size * rnd(1.2, 2.6)), new THREE.MeshBasicMaterial({
      color: srgb(0x5a0808), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide
    }));
    drip.position.copy(m.position).add(new THREE.Vector3(0, -size * 1.1, 0));    drip.quaternion.copy(m.quaternion);
    mesh.add(drip);
    splats.push(drip);
  }
}
function spawnBloodPool(pos) {
  const bmat = new THREE.MeshBasicMaterial({ map: poolMap, color: srgb(0x52060a), transparent: true, opacity: 0.92, depthWrite: false });
  const bh = heightAt(pos.x, pos.z) + 0.03;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 20), bmat);
  pool.rotation.x = -Math.PI / 2;
  pool.rotation.z = rnd(0, TAU);
  pool.position.set(pos.x, bh, pos.z);
  pool.scale.setScalar(0.05);
  pool.userData = { grow: 0.05, target: rnd(0.8, 1.3) };
  scene.add(pool);
  bloodPools.push(pool);
  for (let i = 0; i < 6; i++) {
    const dot = new THREE.Mesh(new THREE.CircleGeometry(rnd(0.04, 0.13), 8), bmat);
    dot.rotation.x = -Math.PI / 2;
    const a = Math.random() * TAU, r = rnd(0.4, 1.2);
    dot.position.set(pos.x + Math.cos(a) * r, bh + 0.001, pos.z + Math.sin(a) * r);
    dot.userData = { dot: true };
    scene.add(dot);
    bloodPools.push(dot);
  }
  while (bloodPools.length > 70) scene.remove(bloodPools.shift());
}
const tracers = [];
function addTracer(a, b) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 0.05) return;
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.017, 0.017, len, 4),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85 })
  );
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.lookAt(b);
  m.rotateX(Math.PI / 2);
  scene.add(m);
  tracers.push({ m, life: 0.09, max: 0.09 });
}

