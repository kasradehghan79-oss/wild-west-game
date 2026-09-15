/* ==========================================================================
   The Wild West - js/world/buildings.js
   Houses, windows, chimney smoke sources, gas lamps and the birds.
   Provides:  makeHouse, houseSpots, lamps, windows, smokePuffs, birds
   Expects:   scene, blocks, shootables, heightAt, canvasTex (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- houses ----------
const windows = [], smokeSrc = [];
// shared surface treatments
const shingleMap = shingleTex();
const roofBump = softBumpTex(128, 50, 26, 0.4);
const plasterBump = softBumpTex(128, 70, 30, 0.55);
const plankMap = plankTex();
const woodBump = softBumpTex(128, 60, 22, 0.45);
function plasterMat(color, rx, ry) {
  const m = mat(color, 0.92);
  const b = plasterBump.clone();
  b.needsUpdate = true;
  b.repeat.set(rx || 3, ry || 2);
  m.bumpMap = b;
  m.bumpScale = 0.05;
  return m;
}
function roofMat(color) {
  const m = mat(color, 0.8);
  shingleMap.repeat.set(4, 2);
  roofBump.repeat.set(4, 2);
  m.map = shingleMap;
  m.bumpMap = roofBump;
  m.bumpScale = 0.06;
  return m;
}
function plankMat(color, rx, ry) {
  const m = mat(color, 0.86);
  m.map = plankMap.clone();
  m.map.needsUpdate = true;
  m.map.repeat.set(rx || 2, ry || 2);
  const b = woodBump.clone();
  b.needsUpdate = true;
  b.repeat.set(rx || 2, ry || 2);
  m.bumpMap = b;
  m.bumpScale = 0.02;
  return m;
}
// A town painted from a small bright palette instead of one adobe grey: the
// walls and roofs now vary house to house.
const WALL_COLS = [0xf0d8a8, 0xe8c894, 0xf4e0b8, 0xdcc092, 0xf0cfa0];
const ROOF_COLS = [0xc4442a, 0xa8432c, 0xd25a34, 0x94402b, 0xc85a3e];
function makeHouse() {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), plasterMat(pick(WALL_COLS), 3, 2));
  wall.position.y = 1.5; wall.castShadow = true; wall.receiveShadow = true; g.add(wall);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.7, 4), roofMat(pick(ROOF_COLS)));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 3.85;
  roof.castShadow = true;
  roof.receiveShadow = true;
  g.add(roof);
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.8, 0.55), plankMat(0x8a5a3e, 1, 2));
  chim.position.set(1.7, 4.4, -0.9); chim.castShadow = true; chim.receiveShadow = true; g.add(chim);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.15), plankMat(0x6b4526, 1, 2));
  door.position.set(0.9, 1.05, 2.02); door.castShadow = true; door.receiveShadow = true; g.add(door);
  const wm = linMat({ color: srgb(0x6ab6e8), roughness: 0.12, metalness: 0.1 });
  wm.envMapIntensity = 0.9;
  wm.__lin = true;
  wm.envMapIntensity = 0.9;
  const win = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.15), wm);
  win.position.set(-1.2, 1.7, 2.02); win.castShadow = true; g.add(win);
  const porch = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.12, 1.5), plankMat(0x8a6a45, 4, 1));
  porch.position.set(0, 0.08, 2.6); porch.castShadow = true; porch.receiveShadow = true; g.add(porch);
  const post = () => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.2, 0.14), plankMat(0x6a4a2c, 1, 3));
    p.castShadow = true; p.receiveShadow = true; g.add(p); return p;
  };
  const p1 = post(); p1.position.set(-2.4, 1.1, 3.25);
  const p2 = post(); p2.position.set(2.4, 1.1, 3.25);
  windows.push({ m: wm, on: Math.random() > 0.3 });
  return g;
}
const houseSpots = [];
[[-18, -14, 0.2], [-4, -17, 0.5], [10, -15, -0.3], [20, -8, 0.8],
 [-22, 6, 1.1], [-16, 18, -0.2], [8, 20, 0.4], [22, 10, 1.4], [12, 4, 0]]
.forEach(([x, z, r]) => {
  const h = makeHouse();
  h.position.set(x, heightAt(x, z), z);
  h.rotation.y = r + rnd(-0.2, 0.2);
  h.traverse(o => { if (o.isMesh) { shootables.push(o); if (o.geometry.type === 'BoxGeometry' || o.geometry.type === 'ConeGeometry') solid.push(o); } });
  scene.add(h);
  houseSpots.push({ x, z, r });
  blocks.push({ x, z, r: 3.6 });
  // the porch sticks out past the wall, so it needs its own blocker or bodies
  // walk straight through the posts and railings
  blocks.push({ x: x + headX(h.rotation.y) * 2.9, z: z + headZ(h.rotation.y) * 2.9, r: 2.3 });
  const off = new THREE.Vector3(1.7, 0, -0.9).applyAxisAngle(new THREE.Vector3(0, 1, 0), h.rotation.y);
  smokeSrc.push(new THREE.Vector3(x + off.x, 4.7 + heightAt(x, z), z + off.z));
});

// chimney smoke
const smokePuffs = [];
smokeSrc.forEach(p => {
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 5), linMat({ color: srgb(0xd8d8d8), transparent: true, opacity: 0.3, depthWrite: false, roughness: 1 }));
    m.position.copy(p);
    m.userData = { src: p, t: i / 4, spd: 0.5 + Math.random() * 0.2 };
    scene.add(m);
    smokePuffs.push(m);
  }
});

// street gas lamps
const lamps = [];
function makeLamp(x, z) {
  const g = new THREE.Group();
  box(0.14, 4.3, 0.14, 0x2b2b2b, 0, 2.15, 0, g);
  box(0.08, 4.5, 0.08, 0x2b2b2b, 0, 0, 0, g);
  const lanMat = linMat({ color: srgb(0xffe9b0), roughness: 0.3, metalness: 0.02, emissive: new THREE.Color(0, 0, 0), envMapIntensity: 0.22 });
  const lan = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 0.3), lanMat);
  lan.position.set(0.55, 4.1, 0); g.add(lan);
  box(0.62, 0.07, 0.07, 0x2b2b2b, 0.28, 4.28, 0, g);
  box(0.5, 0.06, 0.5, 0x2b2b2b, 0.55, 4.35, 0, g);
  const light = new THREE.PointLight(0xffc670, 0, 22, 2);
  light.position.set(0.55, 4.0, 0);
  g.add(light);
  g.position.set(x, heightAt(x, z), z);
  scene.add(g);
  blocks.push({ x, z, r: 0.35 });
  lamps.push({ light, m: lanMat, f: Math.random() * 10 });
}
makeLamp(-16, 3.8); makeLamp(2, 3.8); makeLamp(20, 3.8); makeLamp(-2, -9);

// birds circling overhead
const birds = [];
for (let i = 0; i < 7; i++) {
  const bm = linMat({ color: srgb(0x222222), side: THREE.DoubleSide, roughness: 0.9 });
  const wg = new THREE.PlaneGeometry(1.1, 0.35);
  wg.rotateX(-Math.PI / 2);
  wg.translate(0.55, 0, 0);
  const wr = wg.clone();
  wr.scale(-1, 1, 1);
  const wl = new THREE.Mesh(wg, bm);
  const wrr = new THREE.Mesh(wr, bm);
  const g = new THREE.Group();
  g.add(wl); g.add(wrr);
  g.scale.setScalar(1.2 + Math.random());
  scene.add(g);
  birds.push({ g, wl, wr: wrr, t: Math.random() * 20, o: Math.random() * TAU, r: 35 + Math.random() * 40, h: 28 + Math.random() * 15, cx: rnd(-60, 60), cz: rnd(-60, 60) });
}

