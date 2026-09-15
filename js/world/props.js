/* ==========================================================================
   The Wild West - js/world/props.js
   Street furniture: barrels, crates, wheels, hay bales, troughs, tumbleweeds and pickups.
   Provides:  makeBarrel, makeCrate, makeWheel, makeHayBale, makeTrough, townProps, tumble, pickups
   Expects:   scene, blocks, shootables, heightAt, plankMat (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- town props ----------
// Barrels, crates, wheels, hay bales and troughs. They are clustered around the
// buildings rather than sprinkled at random, so the town reads as lived in.
const gBarrelMid = new THREE.CylinderGeometry(0.355, 0.355, 0.9, 12);
const gBarrelHoop = new THREE.CylinderGeometry(0.365, 0.365, 0.07, 12);
const barrelWood = plankMat(0x9c6432, 3, 1);
const barrelWoodDark = plankMat(0x7a4c26, 3, 1);
const hoopMat = mat(0x4a4640, 0.45, 0.65);
function makeBarrel(x, z, ry) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(gBarrelMid, Math.random() < 0.5 ? barrelWood : barrelWoodDark);
  body.position.y = 0.45; g.add(body);
  [0.16, 0.45, 0.74].forEach(y => {
    const h = new THREE.Mesh(gBarrelHoop, hoopMat);
    h.position.y = y; g.add(h);
  });
  g.position.set(x, heightAt(x, z), z);
  g.rotation.y = ry === undefined ? rnd(0, TAU) : ry;
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; shootables.push(o); } });
  scene.add(g);
  blocks.push({ x, z, r: 0.5 });
  return g;
}
const crateMat = plankMat(0xcaa063, 1.6, 1.6);
const crateTrim = mat(0x8a6a45, 0.9);
function makeCrate(x, z) {
  const g = new THREE.Group();
  const s = rnd(0.7, 0.95);
  const b = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
  b.position.y = s / 2; g.add(b);
  [-1, 1].forEach(sgn => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(s * 1.04, s * 0.09, s * 1.04), crateTrim);
    t.position.y = sgn * s * 0.36 + s / 2; g.add(t);
  });
  g.position.set(x, heightAt(x, z), z);
  g.rotation.y = rnd(0, TAU);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; shootables.push(o); } });
  scene.add(g);
  blocks.push({ x, z, r: 0.65 });
  return g;
}
const gWheel = new THREE.TorusGeometry(0.46, 0.055, 6, 16);
const gSpoke = new THREE.BoxGeometry(0.055, 0.86, 0.055);
const gHub = new THREE.CylinderGeometry(0.09, 0.09, 0.14, 8);
const wheelWood = mat(0x7a5230, 0.88), wheelSteel = mat(0x50483e, 0.5, 0.5);
function makeWheel(x, z, ry) {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(gWheel, wheelWood); g.add(rim);
  for (let i = 0; i < 3; i++) {
    const sp = new THREE.Mesh(gSpoke, wheelWood);
    sp.rotation.z = i * Math.PI / 3; g.add(sp);
  }
  const hub = new THREE.Mesh(gHub, wheelSteel);
  hub.rotation.x = Math.PI / 2; g.add(hub);
  // leaning against whatever is next to it
  g.rotation.z = Math.PI / 2 - rnd(0.12, 0.3);
  g.rotation.y = ry === undefined ? rnd(0, TAU) : ry;
  g.position.set(x, heightAt(x, z) + 0.46, z);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; shootables.push(o); } });
  scene.add(g);
  blocks.push({ x, z, r: 0.45 });
  return g;
}
const hayMat = mat(0xd8be72, 0.98);
const hayBind = mat(0x8a6f38, 0.95);
function makeHayBale(x, z, ry) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.15, 12), hayMat);
  b.rotation.z = Math.PI / 2; b.position.y = 0.5; g.add(b);
  [-0.32, 0.32].forEach(o => {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.51, 0.022, 4, 12), hayBind);
    t.rotation.y = Math.PI / 2; t.position.set(o, 0.5, 0); g.add(t);
  });
  g.position.set(x, heightAt(x, z), z);
  g.rotation.y = ry === undefined ? rnd(0, TAU) : ry;
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; shootables.push(o); } });
  scene.add(g);
  blocks.push({ x, z, r: 0.85 });
  return g;
}
const troughWood = plankMat(0x8a5f36, 2, 1);
const troughWaterMat = linMat({ color: srgb(0x1e6f86), roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.9 });
troughWaterMat.envMapIntensity = 0.9;
function makeTrough(x, z, ry) {
  const g = new THREE.Group();
  const w = 1.5, d = 0.6, h = 0.5;
  const long = new THREE.BoxGeometry(w, h, 0.09);
  [-1, 1].forEach(sgn => {
    const s = new THREE.Mesh(long, troughWood);
    s.position.set(0, h / 2, sgn * d / 2); g.add(s);
  });
  const short = new THREE.BoxGeometry(0.09, h, d);
  [-1, 1].forEach(sgn => {
    const s = new THREE.Mesh(short, troughWood);
    s.position.set(sgn * w / 2, h / 2, 0); g.add(s);
  });
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, d), troughWood);
  bottom.position.y = 0.04; g.add(bottom);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.14, d - 0.14), troughWaterMat);
  water.rotation.x = -Math.PI / 2; water.position.y = h - 0.13; g.add(water);
  g.position.set(x, heightAt(x, z), z);
  g.rotation.y = ry === undefined ? rnd(0, TAU) : ry;
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; shootables.push(o); } });
  scene.add(g);
  blocks.push({ x, z, r: 0.8 });
  return g;
}
function propSpot(x, z, rr) {
  for (let i = 0; i < 12; i++) {
    const a = rnd(0, TAU), d = rr + rnd(-0.6, 0.9);
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (collide(px, pz, 0.55) || inLake(px, pz, 1.5)) continue;
    return { x: px, z: pz };
  }
  return null;
}
const townProps = [];
houseSpots.forEach(hs => {
  const n = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const s = propSpot(hs.x, hs.z, 3.0);
    if (!s) continue;
    const t = Math.random();
    if (t < 0.42) townProps.push(makeBarrel(s.x, s.z));
    else if (t < 0.72) townProps.push(makeCrate(s.x, s.z));
    else if (t < 0.88) townProps.push(makeWheel(s.x, s.z));
    else townProps.push(makeHayBale(s.x, s.z));
  }
});
// a few more along the street, plus water troughs by the road
for (let i = 0; i < 10; i++) {
  const along = Math.random() < 0.5;
  const t = rnd(-40, 40);
  const x = along ? t : rnd(-4, 4) + (Math.random() < 0.5 ? 4.5 : -4.5);
  const z = along ? (Math.random() < 0.5 ? 4.5 : -4.5) : t;
  if (collide(x, z, 0.6) || inLake(x, z, 1.5)) continue;
  const r = Math.random();
  if (r < 0.4) townProps.push(makeBarrel(x, z));
  else if (r < 0.7) townProps.push(makeCrate(x, z));
  else if (r < 0.85) townProps.push(makeWheel(x, z));
  else townProps.push(makeHayBale(x, z));
}
[[6, 4.6], [-9, -4.6], [16, -4.6]].forEach(([x, z]) => {
  if (collide(x, z, 0.9) || inLake(x, z, 1.5)) return;
  townProps.push(makeTrough(x, z, Math.random() < 0.5 ? 0 : Math.PI / 2));
});
const tumble = [];
for (let i = 0; i < 5; i++) {
  const twMat = mat(0x8a7440, 0.96);
  twMat.transparent = true; twMat.opacity = 0.94; twMat.side = THREE.DoubleSide;
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), twMat);
  m.castShadow = true;
  scene.add(m);
  tumble.push({ m, vx: rnd(-4, 4), vz: rnd(-4, 4), spin: rnd(2, 6), life: rnd(4, 20), x: rnd(-90, 90), z: rnd(-90, 90) });
}

// ---------- pickups ----------
const pickups = [];
function addPickup(type, range) {
  let x = 0, z = 0, tries = 0;
  do { x = rnd(-range / 2, range / 2); z = rnd(-range / 2, range / 2); tries++; } while (collide(x, z) && tries < 24);
  const g = new THREE.Group();
  if (type === 'health') {
    box(0.4, 0.3, 0.4, 0xffffff, 0, 0, 0, g);
    box(0.42, 0.1, 0.42, 0xd63b2f, 0, 0, 0, g);
    box(0.1, 0.32, 0.42, 0xd63b2f, 0, 0, 0, g);
  } else if (type === 'cash') {
    box(0.42, 0.14, 0.3, 0x2f5d34, 0, 0, 0, g);
    box(0.44, 0.04, 0.32, 0xd4af37, 0, 0.09, 0, g);
    box(0.1, 0.16, 0.32, 0x2f5d34, 0, 0, 0, g);
  } else {
    box(0.4, 0.3, 0.3, 0x3a3129, 0, 0, 0, g);
    box(0.42, 0.08, 0.32, 0xd4af37, 0, 0.1, 0, g);
  }
  const base = heightAt(x, z) + 0.6;
  g.position.set(x, base, z);
  scene.add(g);
  pickups.push({ g, type, phase: Math.random() * 6, x, z, base });
}
for (let i = 0; i < 7; i++) addPickup('health', 110);
for (let i = 0; i < 9; i++) addPickup('ammo', 170);
for (let i = 0; i < 8; i++) addPickup('cash', 150);

