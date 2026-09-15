/* ==========================================================================
   The Wild West - js/core/utils.js
   Small maths, colour and scratch-vector helpers used everywhere.
   Provides:  clamp, lerp, lerpAngle, angDiff, headX/headZ, TAU, rnd, pick, tmpV
   Expects:   THREE (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// =====================================================================
//  THE WILD WEST  -  bounty hunter / outlaw third-person shooter
// =====================================================================
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, k) { return a + (b - a) * k; }
function lerpAngle(cur, target, k) {
  let d = (target - cur) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return cur + d * k;
}
// shortest signed difference between two angles
function angDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
// A "heading" is the same value we store in g.rotation.y, where the model's local
// +Z (its face) maps to (sin, cos). Always convert headings with these two.
function headX(a) { return Math.sin(a); }
function headZ(a) { return Math.cos(a); }
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
// Touch device? Decided here because several systems need it: the renderer (pixel
// ratio), the quality defaults, the input layer and the on screen controls.
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

