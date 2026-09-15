/* ==========================================================================
   The Wild West - js/world/terrain.js
   Terrain height function and the lake basins carved into it.
   Provides:  LAKES, lakeDip, inLake, heightAt
   Expects:   clamp (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
const LAKES = [
  { x: -32, z: 26, r: 10.0, depth: 1.15, level: 0.50 },
  { x: 47, z: -40, r: 7.5, depth: 0.95, level: 0.42 },
  { x: -64, z: -48, r: 8.5, depth: 1.05, level: 0.45 }
];
function lakeDip(x, z) {
  let d = 0;
  for (const L of LAKES) {
    const dd = Math.hypot(x - L.x, z - L.z);
    if (dd < L.r) {
      const t = 1 - dd / L.r;
      d -= L.depth * t * t * (3 - 2 * t);
    }
  }
  return d;
}
function inLake(x, z, pad) {
  const p = pad || 0;
  for (const L of LAKES) if (Math.hypot(x - L.x, z - L.z) < L.r + p) return true;
  return false;
}
function heightAt(x, z) {
  const r = Math.hypot(x, z);
  let f = clamp((48 - r) / 20, 0, 1); f = f * f * (3 - 2 * f);
  let F = f;
  for (const L of LAKES) {
    let fl = clamp((L.r + 9 - Math.hypot(x - L.x, z - L.z)) / 7, 0, 1);
    fl = fl * fl * (3 - 2 * fl);
    F = Math.max(F, fl);
  }
  const h = 1.7 * Math.sin(x * 0.045 + 1.7) * Math.sin(z * 0.038 + 0.4)
    + 1.15 * Math.sin(x * 0.093 + 4.1) * Math.sin(z * 0.071 + 2.2)
    + 0.5 * Math.sin(x * 0.21 + 1.2) * Math.sin(z * 0.17 + 0.9);
  const bowl = 12 * Math.pow(Math.max(0, r - 70) / 230, 1.7);
  return (h + bowl) * (1 - F) + lakeDip(x, z);
}
