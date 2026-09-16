/* ==========================================================================
   The Wild West - js/entities/horse.js
   The horse: loft/sheet surface builders, cartoon horse rig and updateHorse.
   Provides:  loft, sheet, makeHorse, horse, updateHorse
   Expects:   scene, mat, srgb, heightAt (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- horse ----------
function furCanvas(w, base, cols, n, len) {
  const cv = document.createElement('canvas'); cv.width = cv.height = w;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, w);
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * w;
    ctx.strokeStyle = cols[(Math.random() * cols.length) | 0];
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 2, y + len * (0.5 + Math.random()));
    ctx.stroke();
  }
  return cv;
}
function furBumpCanvas(w, n, len) {
  const cv = document.createElement('canvas'); cv.width = cv.height = w;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, w, w);
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * w;
    ctx.strokeStyle = Math.random() < 0.5 ? '#8a8a8a' : '#767676';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 2, y + len * (0.5 + Math.random()));
    ctx.stroke();
  }
  return cv;
}
const coatMap = new THREE.CanvasTexture(furCanvas(256, '#96602f', ['#9d6733', '#8e5a2c', '#a06a38', '#8a5629', '#9a6432'], 2400, 13));
coatMap.repeat.set(3.2, 2.4);
const coatBump = new THREE.CanvasTexture(furBumpCanvas(256, 2400, 13));
coatBump.repeat.set(3.2, 2.4);
const maneMap = new THREE.CanvasTexture(furCanvas(128, '#2e1d0d', ['#341f0e', '#28170a', '#382312', '#2c1a0c'], 700, 9));
maneMap.repeat.set(2, 2);
const maneBump = new THREE.CanvasTexture(furBumpCanvas(128, 700, 9));
maneBump.repeat.set(2, 2);
const lowLegMap = new THREE.CanvasTexture(furCanvas(128, '#63421f', ['#6a4823', '#5c3d1c', '#6f4c26'], 500, 8));
const muzzleMap = new THREE.CanvasTexture(furCanvas(128, '#c9a583', ['#cfab8a', '#c29e7c', '#d4b08f'], 500, 8));
const hoofMap = new THREE.CanvasTexture(furCanvas(64, '#150f0a', ['#1a130d', '#100b07', '#1d1610'], 220, 6));
const leatherMap = new THREE.CanvasTexture(furCanvas(128, '#6b4526', ['#714a29', '#654023', '#764e2c'], 450, 6));
const coatMat = new THREE.MeshStandardMaterial({ map: coatMap, bumpMap: coatBump, bumpScale: 0.12, roughness: 0.95 });
const maneMat = new THREE.MeshStandardMaterial({ map: maneMap, bumpMap: maneBump, bumpScale: 0.2, roughness: 1 });
const lowLegMat = new THREE.MeshStandardMaterial({ map: lowLegMap, bumpMap: coatBump, bumpScale: 0.08, roughness: 0.95 });
const muzzleMat = new THREE.MeshStandardMaterial({ map: muzzleMap, bumpMap: coatBump, bumpScale: 0.08, roughness: 0.9 });
const hoofMat = new THREE.MeshStandardMaterial({ map: hoofMap, roughness: 0.8, metalness: 0.0 });
const leatherMat = new THREE.MeshStandardMaterial({ map: leatherMap, bumpMap: coatBump, bumpScale: 0.05, roughness: 0.85 });
const innerEarMat = new THREE.MeshStandardMaterial({ color: 0xa8846c, roughness: 0.9 });
const scleraMat = new THREE.MeshStandardMaterial({ color: 0xf3ece0, roughness: 0.35 });
const irisMat = new THREE.MeshStandardMaterial({ color: 0x4a2c12, roughness: 0.28 });
const pupilMat = new THREE.MeshStandardMaterial({ color: 0x120c07, roughness: 0.22 });
const eyeHiMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x2b1c12, roughness: 0.6 });
const mouthMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.75 });
const blanketMat = new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (ctx, W, H) => {
  ctx.fillStyle = '#8a2f2f'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#6e2424'; ctx.fillRect(0, H * 0.4, W, H * 0.2);
  ctx.fillStyle = '#c9a24a'; ctx.fillRect(0, H * 0.42, W, 2); ctx.fillRect(0, H * 0.56, W, 2);
}), roughness: 0.95 });
// ---------- cartoon horse geometry ----------
// Built the way a cartoon horse is drawn: one fat oval barrel (taller than it is
// wide), a chunky neck arcing up out of the shoulders, a big head about a
// quarter of the nose-to-tail length, thick cylinder legs with rounded joints,
// and a mane and tail with real volume. Everything is lofted so there are no
// seams where the parts meet.
const gHTorso = loft([
  { t: 0.84, rx: 0.07, ry: 0.09, oy: 0.07 },
  { t: 0.80, rx: 0.15, ry: 0.2, oy: 0.055 },
  { t: 0.74, rx: 0.22, ry: 0.27, oy: 0.04 },
  { t: 0.66, rx: 0.255, ry: 0.3, oy: 0.025 },
  { t: 0.56, rx: 0.285, ry: 0.325, oy: 0.012 },
  { t: 0.44, rx: 0.305, ry: 0.34, oy: 0.0 },
  { t: 0.3, rx: 0.313, ry: 0.345, oy: -0.006 },
  { t: 0.16, rx: 0.315, ry: 0.345, oy: -0.01 },
  { t: 0.02, rx: 0.315, ry: 0.345, oy: -0.008 },
  { t: -0.12, rx: 0.313, ry: 0.344, oy: -0.004 },
  { t: -0.24, rx: 0.309, ry: 0.34, oy: 0.004 },
  { t: -0.36, rx: 0.305, ry: 0.335, oy: 0.015 },
  { t: -0.48, rx: 0.296, ry: 0.32, oy: 0.026 },
  { t: -0.58, rx: 0.285, ry: 0.305, oy: 0.035 },
  { t: -0.68, rx: 0.26, ry: 0.28, oy: 0.046 },
  { t: -0.76, rx: 0.21, ry: 0.235, oy: 0.056 },
  { t: -0.82, rx: 0.14, ry: 0.16, oy: 0.062 },
  { t: -0.86, rx: 0.06, ry: 0.07, oy: 0.066 }
], 26, 'z');
// the neck is narrow from the front and deep from the side, the way a real
// horse's neck is - a circular cross section turns it into a funnel
const gHNeck = loft([
  { t: -0.2, rx: 0.195, ry: 0.26, oy: 0.03 },
  { t: -0.06, rx: 0.175, ry: 0.24, oy: 0.0 },
  { t: 0.08, rx: 0.162, ry: 0.225, oy: -0.02 },
  { t: 0.2, rx: 0.152, ry: 0.21, oy: -0.035 },
  { t: 0.3, rx: 0.146, ry: 0.2, oy: -0.045 },
  { t: 0.38, rx: 0.142, ry: 0.195, oy: -0.05 }
], 18, 'y');
const gHNeck2 = loft([
  { t: -0.06, rx: 0.158, ry: 0.212, oy: -0.048 },
  { t: 0.06, rx: 0.148, ry: 0.2, oy: -0.035 },
  { t: 0.16, rx: 0.138, ry: 0.186, oy: -0.02 },
  { t: 0.25, rx: 0.13, ry: 0.176, oy: -0.008 },
  { t: 0.31, rx: 0.124, ry: 0.17, oy: -0.004 }
], 18, 'y');
const gHHead = loft([
  { t: -0.11, rx: 0.075, ry: 0.095, oy: 0.055 },
  { t: -0.03, rx: 0.12, ry: 0.145, oy: 0.04 },
  { t: 0.06, rx: 0.13, ry: 0.155, oy: 0.02 },
  { t: 0.15, rx: 0.124, ry: 0.158, oy: -0.015 },
  { t: 0.24, rx: 0.106, ry: 0.136, oy: -0.05 },
  { t: 0.32, rx: 0.09, ry: 0.112, oy: -0.074 },
  { t: 0.39, rx: 0.083, ry: 0.096, oy: -0.09 },
  { t: 0.44, rx: 0.078, ry: 0.088, oy: -0.098 },
  { t: 0.47, rx: 0.04, ry: 0.045, oy: -0.1 }
], 18, 'z');
const gHMuzzle = loft([
  { t: 0.24, rx: 0.117, ry: 0.147, oy: -0.05 },
  { t: 0.32, rx: 0.101, ry: 0.123, oy: -0.074 },
  { t: 0.39, rx: 0.094, ry: 0.107, oy: -0.09 },
  { t: 0.44, rx: 0.089, ry: 0.099, oy: -0.098 },
  { t: 0.475, rx: 0.052, ry: 0.057, oy: -0.1 }
], 18, 'z');
// The first rings of each leg are buried inside the barrel and taper away, so the
// limb emerges through the belly instead of butting against its side and leaving
// a gap you can see through.
const gHForeleg = loft([
  { t: 0.28, rx: 0.045, ry: 0.047 },
  { t: 0.18, rx: 0.08, ry: 0.083 },
  { t: 0.07, rx: 0.115, ry: 0.12 },
  { t: -0.04, rx: 0.146, ry: 0.151 },
  { t: -0.12, rx: 0.15, ry: 0.155 },
  { t: -0.2, rx: 0.136, ry: 0.141 },
  { t: -0.28, rx: 0.12, ry: 0.125 },
  { t: -0.36, rx: 0.106, ry: 0.11 },
  { t: -0.42, rx: 0.098, ry: 0.102 },
  { t: -0.46, rx: 0.095, ry: 0.098 }
], 14, 'y');
const gHHindleg = loft([
  { t: 0.3, rx: 0.055, ry: 0.06 },
  { t: 0.19, rx: 0.095, ry: 0.105 },
  { t: 0.08, rx: 0.135, ry: 0.15 },
  { t: -0.02, rx: 0.168, ry: 0.188 },
  { t: -0.1, rx: 0.175, ry: 0.195, oy: 0.006 },
  { t: -0.18, rx: 0.163, ry: 0.183, oy: -0.002 },
  { t: -0.26, rx: 0.145, ry: 0.163, oy: -0.016 },
  { t: -0.34, rx: 0.122, ry: 0.137, oy: -0.032 },
  { t: -0.4, rx: 0.106, ry: 0.113, oy: -0.043 },
  { t: -0.46, rx: 0.098, ry: 0.102, oy: -0.05 }
], 14, 'y');
// Cannons are sleeved over the upper leg and the hoof over the cannon, so the
// joints read as joints instead of separate collars bolted onto the limb.
const gHCannon = loft([
  { t: 0.04, rx: 0.096, ry: 0.099 },
  { t: -0.04, rx: 0.094, ry: 0.097 },
  { t: -0.12, rx: 0.084, ry: 0.087 },
  { t: -0.2, rx: 0.078, ry: 0.081 },
  { t: -0.28, rx: 0.078, ry: 0.081 },
  { t: -0.34, rx: 0.083, ry: 0.086 },
  { t: -0.4, rx: 0.089, ry: 0.093 }
], 12, 'y');
const gHCannonHind = loft([
  { t: 0.04, rx: 0.1, ry: 0.106, oy: -0.05 },
  { t: -0.04, rx: 0.098, ry: 0.103, oy: -0.04 },
  { t: -0.12, rx: 0.088, ry: 0.092, oy: -0.028 },
  { t: -0.2, rx: 0.081, ry: 0.084, oy: -0.016 },
  { t: -0.28, rx: 0.081, ry: 0.084, oy: -0.006 },
  { t: -0.34, rx: 0.085, ry: 0.089, oy: 0 },
  { t: -0.4, rx: 0.091, ry: 0.095, oy: 0 }
], 12, 'y');
const gHHoof = loft([
  { t: 0.02, rx: 0.105, ry: 0.109 },
  { t: -0.04, rx: 0.116, ry: 0.126, oy: -0.008 },
  { t: -0.09, rx: 0.122, ry: 0.132, oy: -0.014 },
  { t: -0.14, rx: 0.083, ry: 0.089, oy: -0.02 },
  { t: -0.17, rx: 0.03, ry: 0.03, oy: -0.024 }
], 12, 'y');
// tail: a short fleshy dock off the croup, then a full hair fall that widens
// before ending in a blunt bundle rather than a spear point
const gHTailDock = loft([
  { t: 0.15, rx: 0.07, ry: 0.065 },
  { t: 0.04, rx: 0.085, ry: 0.08 },
  { t: -0.06, rx: 0.097, ry: 0.092 }
], 12, 'y');
const gHTailHair = loft([
  { t: 0.05, rx: 0.1, ry: 0.094 },
  { t: -0.06, rx: 0.14, ry: 0.12 },
  { t: -0.18, rx: 0.174, ry: 0.144, oy: -0.012 },
  { t: -0.32, rx: 0.19, ry: 0.154, oy: -0.032 },
  { t: -0.46, rx: 0.182, ry: 0.147, oy: -0.056 },
  { t: -0.58, rx: 0.154, ry: 0.124, oy: -0.073 },
  { t: -0.68, rx: 0.112, ry: 0.092, oy: -0.084 },
  { t: -0.74, rx: 0.052, ry: 0.046, oy: -0.09 }
], 12, 'y');
const gHEar = new THREE.ConeGeometry(0.062, 0.18, 10);
const gHEarIn = new THREE.ConeGeometry(0.038, 0.12, 8);
const gHEye = new THREE.SphereGeometry(0.02, 12, 9);
// the hock is a real point at the back of the hind leg, worth keeping
const gHHock = new THREE.ConeGeometry(0.055, 0.14, 8);
// chunky hair clumps: a small tapered loft, used along the crest and the tail so
// the mane has volume instead of reading as a flat sheet
const gHClump = loft([
  { t: 0.1, rx: 0.02, ry: 0.02 },
  { t: 0.0, rx: 0.048, ry: 0.046 },
  { t: -0.1, rx: 0.052, ry: 0.05 },
  { t: -0.2, rx: 0.044, ry: 0.042 },
  { t: -0.3, rx: 0.03, ry: 0.028 },
  { t: -0.36, rx: 0.012, ry: 0.012 }
], 10, 'y');
// saddle pad: a curved sheet following the barrel (partial loft, top ~130 deg)
const gHBlanket = loft([
  { t: 0.46, rx: 0.302, ry: 0.337, oy: 0.0 },
  { t: 0.2, rx: 0.327, ry: 0.358, oy: -0.008 },
  { t: -0.1, rx: 0.327, ry: 0.358, oy: -0.003 },
  { t: -0.36, rx: 0.317, ry: 0.348, oy: 0.017 },
  { t: -0.5, rx: 0.302, ry: 0.327, oy: 0.03 }
], 16, 'z', Math.PI / 2 - 1.15, Math.PI / 2 + 1.15);
// saddle shell: same idea as the pad, a curved shell hugging the back
const gHSeat = loft([
  { t: 0.28, rx: 0.335, ry: 0.368, oy: -0.004 },
  { t: 0.12, rx: 0.35, ry: 0.385, oy: -0.006 },
  { t: -0.1, rx: 0.35, ry: 0.385, oy: -0.002 },
  { t: -0.28, rx: 0.335, ry: 0.368, oy: 0.004 }
], 14, 'z', Math.PI / 2 - 0.92, Math.PI / 2 + 0.92);
// girth: a band right around the barrel
const gHGirth = loft([
  { t: -0.035, rx: 0.331, ry: 0.361, oy: -0.007 },
  { t: 0.035, rx: 0.331, ry: 0.361, oy: -0.007 }
], 22, 'z');
function hMesh(geo, m, x, y, z, parent, sx, sy, sz) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  if (sx) mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function makeHorse() {
  const g = new THREE.Group();
  const bodyG = new THREE.Group(); bodyG.position.set(0, 1.22, 0); g.add(bodyG);
  hMesh(gHTorso, coatMat, 0, 0, 0, bodyG);
  const neckG = new THREE.Group();
  neckG.position.set(0, 0.18, 0.46); neckG.rotation.x = 0.6;
  bodyG.add(neckG);
  hMesh(gHNeck, coatMat, 0, 0.02, 0, neckG);
  const neckG2 = new THREE.Group();
  neckG2.position.set(0, 0.36, 0); neckG2.rotation.x = 0.12;
  neckG.add(neckG2);
  hMesh(gHNeck2, coatMat, 0, 0, 0, neckG2);
  // mane: a sheet laid just outside the crest with clumps over it for volume
  hMesh(sheet([
    { y: -0.2, z: -0.25, w: 0.088 },
    { y: -0.06, z: -0.258, w: 0.096 },
    { y: 0.08, z: -0.263, w: 0.094 },
    { y: 0.2, z: -0.263, w: 0.09 },
    { y: 0.3, z: -0.263, w: 0.084 },
    { y: 0.39, z: -0.262, w: 0.078 },
    { y: 0.45, z: -0.3, w: 0.07 },
    { y: 0.43, z: -0.36, w: 0.062 },
    { y: 0.35, z: -0.4, w: 0.052 },
    { y: 0.23, z: -0.412, w: 0.042 },
    { y: 0.09, z: -0.39, w: 0.032 }
  ]), maneSheet, 0, 0, 0, neckG);
  // clumps laid along the crest, stubby and lying back so the mane reads as hair
  // rather than as a row of teeth
  for (let i = 0; i < 15; i++) {
    const k = i / 14;
    const cl = new THREE.Mesh(gHClump, maneMat);
    cl.position.set(rnd(-0.01, 0.01), -0.04 + k * 0.48, -0.256 - k * 0.002);
    cl.rotation.set(-0.82 - k * 0.05, rnd(-0.16, 0.16), rnd(-0.1, 0.1));
    cl.scale.set(rnd(0.62, 0.78), rnd(0.4, 0.5), rnd(0.62, 0.78));
    cl.castShadow = true;
    neckG.add(cl);
  }
  hMesh(sheet([
    { y: -0.07, z: -0.278, w: 0.084 },
    { y: 0.05, z: -0.255, w: 0.08 },
    { y: 0.15, z: -0.226, w: 0.074 },
    { y: 0.25, z: -0.204, w: 0.068 },
    { y: 0.32, z: -0.215, w: 0.06 },
    { y: 0.31, z: -0.265, w: 0.05 },
    { y: 0.23, z: -0.3, w: 0.04 },
    { y: 0.11, z: -0.31, w: 0.03 }
  ]), maneSheet, 0, 0, 0, neckG2);
  for (let i = 0; i < 11; i++) {
    const k = i / 10;
    const cl = new THREE.Mesh(gHClump, maneMat);
    cl.position.set(rnd(-0.012, 0.012), -0.04 + k * 0.36, -0.264 + k * 0.085);
    cl.rotation.set(-0.86 - k * 0.04, rnd(-0.16, 0.16), rnd(-0.1, 0.1));
    cl.scale.set(rnd(0.56, 0.7), rnd(0.36, 0.46), rnd(0.56, 0.7));
    cl.castShadow = true;
    neckG2.add(cl);
  }
  const headG = new THREE.Group();
  headG.position.set(0, 0.3, 0);
  headG.scale.setScalar(1.17);
  neckG2.add(headG);
  hMesh(gHHead, coatMat, 0, 0, 0, headG);
  hMesh(gHMuzzle, muzzleMat, 0, -0.002, 0.002, headG);
  // cheeks / jowl
  hMesh(gHEye, coatMat, 0, -0.062, 0.09, headG, 6.0, 4.6, 7.5);
  // nostrils and a soft mouth line
  [-1, 1].forEach(s => hMesh(gHEye, nostrilMat, s * 0.042, -0.115, 0.432, headG, 1.1, 0.85, 0.95));
  hMesh(gHEye, mouthMat, 0, -0.142, 0.43, headG, 3.3, 0.55, 1.1);
  // big friendly eyes: mostly iris, sitting in the socket rather than on it
  [-1, 1].forEach(s => {
    hMesh(gHEye, scleraMat, s * 0.102, 0.048, 0.076, headG, 1.6, 1.75, 1.5);
    hMesh(gHEye, irisMat, s * 0.108, 0.047, 0.082, headG, 1.9, 2.05, 1.8);
    hMesh(gHEye, pupilMat, s * 0.112, 0.047, 0.086, headG, 1.4, 1.55, 1.4);
    hMesh(gHEye, eyeHiMat, s * 0.104, 0.064, 0.078, headG, 0.72, 0.72, 0.58);
  });
  const ears = [];
  [-1, 1].forEach(s => {
    const eg = new THREE.Group();
    eg.position.set(s * 0.072, 0.128, -0.035); headG.add(eg);
    const ear = new THREE.Mesh(gHEar, coatMat);
    ear.position.set(0, 0.055, 0); ear.rotation.set(-0.18, 0, -s * 0.26); ear.scale.set(0.92, 0.66, 0.8);
    ear.castShadow = true; eg.add(ear);
    const ein = new THREE.Mesh(gHEarIn, innerEarMat);
    ein.position.set(-s * 0.008, 0.045, 0.014); ein.rotation.set(-0.18, 0, -s * 0.26); ein.scale.set(0.9, 0.56, 0.8);
    eg.add(ein);
    ears.push(eg);
  });
  // forelock: laid on top of the head, from the poll forward over the forehead
  hMesh(sheet([
    { y: 0.19, z: -0.05, w: 0.078 },
    { y: 0.196, z: 0.02, w: 0.082 },
    { y: 0.176, z: 0.1, w: 0.072 },
    { y: 0.148, z: 0.16, w: 0.058 },
    { y: 0.115, z: 0.212, w: 0.044 }
  ]), maneSheet, 0, 0, 0, headG);
  const tailG = new THREE.Group();
  tailG.position.set(0, 0.24, -0.7); tailG.rotation.x = 0.14;
  bodyG.add(tailG);
  // the dock is body colour, the hair dark, so the tail reads as growing out of
  // the croup instead of being a dark cone glued to it
  hMesh(gHTailDock, coatMat, 0, 0.02, 0, tailG);
  const tailG2 = new THREE.Group();
  tailG2.position.set(0, -0.06, 0); tailG2.rotation.x = 0.1;
  tailG.add(tailG2);
  hMesh(gHTailHair, maneMat, 0, 0, 0, tailG2);
  // strands along the lower half so the tip breaks up instead of ending in a point
  for (let i = 0; i < 7; i++) {
    const k = i / 6;
    const cl = new THREE.Mesh(gHClump, maneMat);
    cl.position.set(rnd(-0.055, 0.055), -0.24 - k * 0.4, rnd(-0.055, 0.01));
    cl.rotation.set(rnd(-0.12, 0.12), rnd(-0.35, 0.35), rnd(-0.18, 0.18));
    cl.scale.set(rnd(1.3, 1.8), rnd(0.8, 1.1), rnd(1.2, 1.7));
    cl.castShadow = true;
    tailG2.add(cl);
  }
  // tack: a curved pad on the barrel, a girth band right around it, and a
  // western saddle on top with skirts hiding where it meets the back
  hMesh(gHBlanket, blanketMat, 0, 0, 0, bodyG);
  hMesh(gHGirth, leatherMat, 0, 0, 0, bodyG);
  hMesh(gHSeat, leatherMat, 0, 0, 0, bodyG);
  const saddle = new THREE.Group();
  saddle.position.set(0, 0.36, 0); bodyG.add(saddle);
  hMesh(gHEye, leatherMat, 0, 0.045, -0.25, saddle, 2.9, 2.7, 1.5);
  hMesh(gHEye, leatherMat, 0, 0.04, 0.23, saddle, 2.6, 2.0, 1.5);
  hMesh(new THREE.CylinderGeometry(0.02, 0.024, 0.06, 8), leatherMat, 0, 0.1, 0.22, saddle);
  [-1, 1].forEach(s => {
    hMesh(new THREE.BoxGeometry(0.02, 0.22, 0.44), leatherMat, s * 0.15, -0.13, 0, saddle);
    // stirrup strap leans outward as it drops, following the barrel's bulge
    // instead of floating above it or sinking through it
    const st = hMesh(new THREE.BoxGeometry(0.022, 0.46, 0.038), leatherMat, s * 0.255, -0.3, 0.03, saddle);
    st.rotation.z = -s * 0.2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.007, 6, 12), revSteel);
    ring.position.set(s * 0.3, -0.53, 0.03); ring.rotation.y = Math.PI / 2; saddle.add(ring);
  });
  // bridle
  // bridle: a browband arc across the poll and cheek strips down each side, built
  // from the head's own radii so they lie on the surface. Straight straps between
  // two points chord through a round head and stick out as loose planks.
  const browband = loft([
    { t: -0.035, rx: 0.134, ry: 0.159, oy: 0.04 },
    { t: 0.012, rx: 0.144, ry: 0.169, oy: 0.018 }
  ], 16, 'z', Math.PI / 2 - 1.15, Math.PI / 2 + 1.15);
  hMesh(browband, leatherMat, 0, 0, 0, headG);
  const cheek = side => loft([
    { t: 0.35, rx: 0.11, ry: 0.124, oy: -0.062 },
    { t: 0.22, rx: 0.127, ry: 0.142, oy: -0.032 },
    { t: 0.08, rx: 0.141, ry: 0.167, oy: 0.018 },
    { t: -0.03, rx: 0.134, ry: 0.159, oy: 0.04 }
  ], 4, 'z', side > 0 ? -0.1 : Math.PI - 0.1, side > 0 ? 0.1 : Math.PI + 0.1);
  hMesh(cheek(1), leatherMat, 0, 0, 0, headG);
  hMesh(cheek(-1), leatherMat, 0, 0, 0, headG);
  const nb = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.008, 6, 20), leatherMat);
  nb.position.set(0, -0.05, 0.3); nb.rotation.x = 0.08; nb.castShadow = true; headG.add(nb);
  const bit = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.007, 6, 12), revSteel);
  bit.position.set(0, -0.17, 0.33); bit.rotation.y = Math.PI / 2; headG.add(bit);
  const legs = [];
  // front legs column straight, hind legs angled back at the hock
  [[-0.19, 0.42, 1.05, 0], [0.19, 0.42, 1.05, 0], [-0.215, -0.5, 1.06, 1], [0.215, -0.5, 1.06, 1]].forEach(([lx, lz, ly, hind]) => {
    const legG = new THREE.Group(); legG.position.set(lx, ly, lz); g.add(legG);
    hMesh(hind ? gHHindleg : gHForeleg, coatMat, 0, 0, 0, legG);
    const knee = new THREE.Group(); knee.position.set(0, -0.45, 0); legG.add(knee);
    if (hind) {
      const hk = hMesh(gHHock, lowLegMat, 0, -0.01, -0.09, knee, 1.1, 1.1, 1.1);
      hk.rotation.x = -Math.PI / 2;
    }
    hMesh(hind ? gHCannonHind : gHCannon, lowLegMat, 0, 0, 0, knee);
    hMesh(gHHoof, hoofMat, 0, -0.43, 0.006, knee);
    legs.push({ g: legG, knee });
  });
  g.traverse(o => {
    if (o.isMesh) { o.userData.horse = true; shootables.push(o); }
  });
  scene.add(g);
  return { g, legs, body: bodyG, bodyG, neckG, neckG2, headG, tailG, tailG2, ears, horsePhase: 0, speed: 0, gaitA: 0, lean: 0, tilt: 0, vy: 0 };
}
// rings are (t, rx, ry/rz, ox, oy/oz); axis 'y' lofts upward, axis 'z' forward.
// a0/a1 optionally sweep a partial arc instead of a full tube, which is how the
// saddle pad wraps the barrel instead of floating over it like a plank.
function loft(rings, segs, axis, a0, a1) {
  const pos = [], uv = [], idx = [];
  const n = segs, R = rings.length;
  const A0 = a0 === undefined ? 0 : a0;
  const A1 = a1 === undefined ? TAU : a1;
  // Rings can be authored front-to-back or back-to-front. The winding has to
  // follow, or the surface faces inward and backface culling makes the body look
  // transparent because you end up seeing the far wall from the inside.
  const flip = rings[R - 1].t < rings[0].t;
  for (let i = 0; i < R; i++) {
    const r = rings[i];
    for (let s = 0; s <= n; s++) {
      const a = A0 + (s / n) * (A1 - A0), c = Math.cos(a), sn = Math.sin(a);
      if (axis === 'y') {
        // vertical parts are authored with ry/oy meaning the radius and offset
        // across the section, which for this axis is z
        const rz = r.rz === undefined ? (r.ry || 0) : r.rz;
        const oz = r.oz === undefined ? (r.oy || 0) : r.oz;
        pos.push((r.ox || 0) + c * r.rx, r.t, oz + sn * rz);
      } else {
        pos.push((r.ox || 0) + c * r.rx, (r.oy || 0) + sn * r.ry, r.t);
      }
      uv.push(s / n, i / (R - 1));
    }
  }
  for (let i = 0; i < R - 1; i++) {
    for (let s = 0; s < n; s++) {
      const a = i * (n + 1) + s, b = a + n + 1;
      if (axis === 'y') {
        if (flip) idx.push(a + 1, b, a, b + 1, b, a + 1);
        else idx.push(a, b, a + 1, a + 1, b, b + 1);
      } else {
        if (flip) idx.push(a + 1, a, b, b, b + 1, a + 1);
        else idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  // Caps. A tube with an open end shows its own interior wherever the end is
  // not buried inside another volume - the neck's top rim sat outside the head
  // and let you see straight through it. The rim vertices are duplicated so the
  // caps keep flat normals instead of smearing the tube's shading.
  if (a0 === undefined && a1 === undefined) {
    for (let ci = 0; ci < 2; ci++) {
      const r = rings[ci === 0 ? 0 : R - 1];
      const start = ci === 0;
      const first = pos.length / 3;
      const rz0 = r.rz === undefined ? (r.ry || 0) : r.rz;
      const oz0 = r.oz === undefined ? (r.oy || 0) : r.oz;
      for (let s = 0; s <= n; s++) {
        const a = A0 + (s / n) * (A1 - A0), c = Math.cos(a), sn = Math.sin(a);
        if (axis === 'y') pos.push((r.ox || 0) + c * r.rx, r.t, oz0 + sn * rz0);
        else pos.push((r.ox || 0) + c * r.rx, (r.oy || 0) + sn * r.ry, r.t);
        uv.push(0.5 + c * 0.5, 0.5 + sn * 0.5);
      }
      const cIdx = pos.length / 3;
      if (axis === 'y') pos.push(r.ox || 0, r.t, oz0);
      else pos.push(r.ox || 0, r.oy || 0, r.t);
      uv.push(0.5, 0.5);
      const rev = axis === 'z' ? (start ? !flip : flip) : (start ? flip : !flip);
      for (let s = 0; s < n; s++) {
        const v0 = first + s, v1 = first + s + 1;
        if (rev) idx.push(cIdx, v1, v0); else idx.push(cIdx, v0, v1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
// a thin sheet of hair: rows of (y, z, half width) in the yz plane
function sheet(rows) {
  const pos = [], uv = [], idx = [];
  rows.forEach((r, i) => {
    const v = i / (rows.length - 1);
    pos.push((r.ox || 0) - r.w, r.y, r.z); uv.push(0, v);
    pos.push((r.ox || 0) + r.w, r.y, r.z); uv.push(1, v);
  });
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
const maneSheet = maneMat.clone();
maneSheet.side = THREE.DoubleSide;

const horse = makeHorse();
horse.g.position.set(3, heightAt(3, 1.5), 1.5);
horse.g.rotation.y = 2.5;

function updateHorse(dt) {
  const t = clock.elapsedTime;
  const hs = Math.abs(horse.speed);
  const gallop = Math.min(1, hs / 9);
  const movingH = hs > 0.15;
  horse.gaitA = lerp(horse.gaitA, movingH ? 1 : 0, Math.min(1, dt * 4));
  if (movingH) horse.horsePhase += dt * (2.5 + hs * 0.8);
  const hp = horse.horsePhase;
  const swing = Math.sin(hp) * (0.25 + 0.55 * gallop);
  const kf = Math.cos(hp);
  for (let i = 0; i < 4; i++) {
    const dir = (i === 0 || i === 3) ? 1 : -1;
    const sw = movingH ? swing * dir : 0;
    const flex = movingH ? 0.06 + Math.max(0, -kf * dir) * (0.45 + 0.35 * gallop) : 0.06;
    horse.legs[i].g.rotation.x = lerp(horse.legs[i].g.rotation.x, sw, Math.min(1, dt * (movingH ? 12 : 3)));
    horse.legs[i].knee.rotation.x = lerp(horse.legs[i].knee.rotation.x, flex, Math.min(1, dt * (movingH ? 10 : 3)));
  }
  const bob = Math.abs(Math.sin(hp)) * 0.07 * gallop;
  horse.bodyG.position.y = lerp(horse.bodyG.position.y, 1.26 + bob, Math.min(1, dt * 12));
  horse.bodyG.rotation.x = lerp(horse.bodyG.rotation.x, Math.sin(hp) * 0.03 * gallop, Math.min(1, dt * 6));
  horse.bodyG.scale.y = 1 + Math.sin(t * 1.6) * 0.012 * (1 - horse.gaitA);
  const lookA = movingH ? 0 : Math.sin(t * 0.45) * 0.3;
  horse.headG.rotation.y = lerp(horse.headG.rotation.y, lookA, Math.min(1, dt * 2));
  horse.headG.rotation.x = lerp(horse.headG.rotation.x, movingH ? -0.05 : Math.sin(t * 0.45 + 1) * 0.12 - 0.05, Math.min(1, dt * 3));
  horse.earT = (horse.earT === undefined ? 1.5 : horse.earT) - dt;
  if (horse.earT <= 0) { horse.earT = 1.2 + Math.random() * 2.8; horse.earKickT = 0; horse.earI = Math.random() < 0.5 ? 0 : 1; horse.earA = rnd(0.25, 0.65); }
  if (horse.earKickT !== undefined) horse.earKickT += dt;
  const tw = horse.earKickT !== undefined && horse.earKickT < 0.8 ? Math.sin(horse.earKickT * 9) * horse.earA : 0;
  horse.ears.forEach((eg, i) => { eg.rotation.y = i === horse.earI ? tw : 0; });
  // neck: down and forward when idle (grazing), lifted when carrying a rider or
  // on the move so the head is not hanging under the rider's hands
  const neckTarget = (mounted || movingH) ? 0.0 - 0.06 * gallop : 0.3;
  horse.neckG2.rotation.x = lerp(horse.neckG2.rotation.x, neckTarget, Math.min(1, dt * 4));
  // tail hangs at rest, streams back as the horse speeds up
  horse.tailG.rotation.x = 0.08 + gallop * 0.32 + Math.sin(t * 0.9) * 0.05;
  horse.tailG2.rotation.x = 0.05 + gallop * 0.2 + Math.sin(t * 1.3) * 0.1 * (0.5 + gallop);
  horse.g.rotation.z = lerp(horse.g.rotation.z, horse.lean, Math.min(1, dt * 4));
  const hx = Math.sin(horse.g.rotation.y), hz = Math.cos(horse.g.rotation.y);
  const hF = heightAt(horse.g.position.x + hx * 0.9, horse.g.position.z + hz * 0.9);
  const hB = heightAt(horse.g.position.x - hx * 0.9, horse.g.position.z - hz * 0.9);
  horse.g.position.y = lerp(horse.g.position.y, heightAt(horse.g.position.x, horse.g.position.z) + horse.airY, Math.min(1, dt * 6));
  horse.tilt = lerp(horse.tilt, Math.atan2(hF - hB, 1.8), Math.min(1, dt * 6));
  horse.g.rotation.x = -horse.tilt;
}
horse.airY = 0;

