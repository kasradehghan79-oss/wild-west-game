/* ==========================================================================
   The Wild West - js/core/engine.js
   Renderer, scene, camera and the resize handler. Owns the canvas.
   Provides:  scene, camera, renderer
   Expects:   settings (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- scene ----------
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x8fb8d8, 55, 260);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.12, 1600);
// antialias: with the post chain on, the scene is rendered into a multisampled
// render target, but with it off (quality 0, the phone default) the frame goes
// straight to the canvas - and without MSAA there it is visibly jagged, especially
// on a high density phone screen. Mobile GPUs are tiled and handle MSAA cheaply.
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
// initial value only; applyQuality() owns the real pixel ratio policy
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.LinearEncoding;   // the post pass does the sRGB encode
renderer.toneMapping = THREE.NoToneMapping;       // and the filmic curve
// Named, because it is no longer the only canvas on the page: the opening
// screen adds one of its own, and "the canvas" has to mean the world.
renderer.domElement.id = 'view';
document.body.appendChild(renderer.domElement);
scene.add(camera);

