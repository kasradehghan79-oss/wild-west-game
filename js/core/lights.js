/* ==========================================================================
   The Wild West - js/core/lights.js
   Key lights: hemisphere, ambient, sun with its shadow camera, moon, camp glow.
   Provides:  hemi, ambient, sun, moon, campGlow
   Expects:   scene (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.5);
hemi.color.copy(srgb(0xa9c6e8));
hemi.groundColor.copy(srgb(0x6b5a3a));
scene.add(hemi);
const ambient = new THREE.AmbientLight(0xffffff, 0.30);
ambient.color.copy(srgb(0xcfd8e6));
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.color.copy(srgb(0xffe9c4));
sun.position.set(60, 90, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 1; sc.far = 400;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.045;
scene.add(sun);
scene.add(sun.target);
const moon = new THREE.DirectionalLight(0xffffff, 0);
moon.color.copy(srgb(0x9db4e6));
scene.add(moon);
scene.add(moon.target);
const campGlow = new THREE.PointLight(0xff9a3a, 0, 46, 2);
scene.add(campGlow);

