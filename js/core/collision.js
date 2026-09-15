/* ==========================================================================
   The Wild West - js/core/collision.js
   Static collision circles and the resolver every actor uses when moving.
   Provides:  blocks, collide, resolveCollision
   Expects:   clamp (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- collision ----------
const blocks = [];
// pad lets a body be treated as a disc of its own radius instead of a point
function collide(x, z, pad) {
  const p = pad || 0;
  for (const b of blocks) {
    const dx = x - b.x, dz = z - b.z, rr = b.r + p;
    if (dx * dx + dz * dz < rr * rr) return true;
  }
  return false;
}
// shove anything that ended up inside a blocker back out to the surface, so a body
// can never be left embedded in (or wander through) a wall
function resolveCollision(pos, pad) {
  const p = pad || 0;
  let hit = false;
  for (const b of blocks) {
    const dx = pos.x - b.x, dz = pos.z - b.z;
    const rr = b.r + p, d2 = dx * dx + dz * dz;
    if (d2 < rr * rr) {
      const d = Math.sqrt(d2) || 0.0001;
      pos.x = b.x + (dx / d) * rr;
      pos.z = b.z + (dz / d) * rr;
      hit = true;
    }
  }
  return hit;
}
// the lakes are shallow enough to wade, so they get no collision blockers:
// water just slows you down and throws spray off your boots

