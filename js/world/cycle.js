/* ==========================================================================
   The Wild West - js/world/cycle.js
   Time of day state, sky palette and the sun/moon/stars bodies. Driven by the loop.
   Provides:  dayTime, DAY_LENGTH, C_DAY..C_NIGHTZ, sunBall, moonBall, stars
   Expects:   scene, skyU (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- day / night cycle ----------
let dayTime = 0.26;
let nightF = 0;
const DAY_LENGTH = 210;
const C_DAY = new THREE.Color(0x8fd0f2), C_ZEND = new THREE.Color(0x2f7fd6), C_TWIL = new THREE.Color(0xff9a4a), C_NIGHT = new THREE.Color(0x0b1226);
const C_NIGHTZ = new THREE.Color(0x121d42);
const cSky = new THREE.Color(), cZen = new THREE.Color(), cAmb = new THREE.Color(), cSunC = new THREE.Color(), C_AMB_NIGHT = new THREE.Color(0x303c58), vDir = new THREE.Vector3();
const sunBall = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffdd66, fog: false }));
const moonBall = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 12), new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false }));
scene.add(sunBall); scene.add(moonBall);
function glowTex(inner, outer) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(0.32, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}
const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,246,214,1)', 'rgba(255,170,60,.55)'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
sunGlow.scale.setScalar(150);
scene.add(sunGlow);
const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(226,238,255,.95)', 'rgba(120,160,255,.3)'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
moonGlow.scale.setScalar(80);
scene.add(moonGlow);
const starPos = [];
for (let i = 0; i < 600; i++) {
  const a = Math.random() * TAU, e = 0.12 + Math.random() * 1.35;
  starPos.push(Math.cos(a) * Math.cos(e) * 450, Math.sin(e) * 450, Math.sin(a) * Math.cos(e) * 450);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
scene.add(stars);

// Everything solid is a PBR material now: roughness and metalness respond to the
// sun, the sky and the environment map, which is where the surface read comes from.
