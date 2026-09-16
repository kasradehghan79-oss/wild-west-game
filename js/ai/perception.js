/* ==========================================================================
   The Wild West - js/ai/perception.js
   What an NPC can notice, and what it remembers afterwards.

   Three senses, all archetype driven:
     sight    a range and a field of view, and an actual line of sight test against
              the buildings (not just a distance), re-checked a few times a second
              rather than every frame
     hearing  noise events with a radius: gunshots, screams, a body hitting the
              dirt. Being shot at from behind still gets noticed
     memory   a suspicion level that rises while the player is visible and decays
              while he is not, plus the place he was last seen and how stale that is

   Provides:  Perceive, SENSES
   Expects:   npcs, player, solid, THREE, clamp, ARCH
   ========================================================================== */
"use strict";
const SENSES = {
  //            sight  fov   hearing sharp  courage  suspicion gain
  deputy: { range: 30, fov: 1.15, hearing: 26, sharp: 0.55, courage: 0.70, gain: 1.6 },
  sheriff: { range: 38, fov: 1.25, hearing: 32, sharp: 1.00, courage: 1.00, gain: 2.2 },
  rifleman: { range: 46, fov: 0.95, hearing: 22, sharp: 0.80, courage: 0.55, gain: 1.5 },
  shotgunner: { range: 22, fov: 1.35, hearing: 20, sharp: 0.50, courage: 0.90, gain: 1.8 },
  bandit: { range: 34, fov: 1.20, hearing: 24, sharp: 0.70, courage: 0.80, gain: 1.9 },
  civil: { range: 26, fov: 1.20, hearing: 22, sharp: 0.40, courage: 0.10, gain: 2.4 }
};
const Perceive = (() => {
  const losRay = new THREE.Raycaster();
  const from = new THREE.Vector3(), to = new THREE.Vector3(), dir = new THREE.Vector3();
  let noiseMark = 0;                     // bumped when anything loud happens

  // the base table, scaled by the difficulty level: on LEGEND they see further and
  // sharpen up faster, on GREENHORN they are half blind and slow on the uptake
  function senses(n) {
    const base = SENSES[n.archetype] || SENSES.deputy;
    const s = n.__senses;
    const range = Difficulty.senseRange(base.range);
    const hearing = Difficulty.senseRange(base.hearing);
    if (s && s.range === range && s.hearing === hearing) return s;
    n.__senses = {
      range, hearing, fov: base.fov, sharp: base.sharp, courage: base.courage,
      gain: base.gain * Difficulty.senseGain(), base
    };
    return n.__senses;
  }

  // Straight line between two eye heights, against the buildings only. `solid` is
  // the same list the movement resolver uses, so what blocks a bullet's line and
  // what blocks a body are the same thing, which is what a player expects.
  function clearLine(ax, az, ay, bx, bz, by) {
    from.set(ax, ay, az);
    to.set(bx, by, bz);
    dir.copy(to).sub(from);
    const dist = dir.length();
    if (dist < 0.001) return true;
    dir.divideScalar(dist);
    losRay.set(from, dir);
    losRay.far = Math.max(0, dist - 0.4);
    const hit = losRay.intersectObjects(solid, false);
    return hit.length === 0;
  }
  function eyeY(n) { return n.g.position.y + 1.5; }

  function canSee(n, x, z) {
    const S = senses(n);
    const dx = x - n.g.position.x, dz = z - n.g.position.z;
    const d = Math.hypot(dx, dz);
    if (d > S.range) return false;
    if (d > 2.5) {
      // field of view: how far off the NPC's heading the target is
      const facing = Math.atan2(Math.sin(n.g.rotation.y), Math.cos(n.g.rotation.y));
      const toTarget = Math.atan2(dx, dz);
      let off = toTarget - facing;
      off = Math.atan2(Math.sin(off), Math.cos(off));
      // someone sprinting past in the open should still be caught by peripheral
      // vision, so the cone widens with proximity
      const widen = d < 8 ? 0.6 : 0;
      if (Math.abs(off) > S.fov + widen) return false;
    }
    return clearLine(n.g.position.x, n.g.position.z, eyeY(n), x, z, heightAt(x, z) + 1.2);
  }

  // A noise event: any NPC inside the radius (clamped by its own hearing) turns to
  // look, and remembers where it came from.
  function noise(x, z, radius, kind, loud) {
    noiseMark++;
    const near = [];
    for (const n of npcs) {
      if (n.dead) continue;
      const S = senses(n);
      const d = Math.hypot(n.g.position.x - x, n.g.position.z - z);
      const hear = Math.min(radius, S.hearing * (loud === 'silent' ? 0.4 : 1));
      if (d > hear) continue;
      if (!n.heard || d < n.heard.d) n.heard = { x, z, d, age: 0, kind };
      // a gunshot this close is enough on its own to put a lawman on the alert
      n.susp = clamp((n.susp || 0) + (kind === 'shot' ? 0.55 : 0.3) * S.sharp * (1 - d / Math.max(1, hear)), 0, 1);
      near.push(n);
    }
    return near;
  }

  function update(n, dt) {
    const S = senses(n);
    // memory decays whether or not he can see you, slowly: nobody forgets a
    // gunfight in two seconds
    n.susp = n.susp === undefined ? 0 : n.susp;
    if (n.lastKnown) n.lastKnown.age += dt;

    // sight is the expensive part, so it runs on a stagger: everyone re-checks a
    // few times a second, spread out so the cost per frame is even
    n.seeT = (n.seeT === undefined ? (npcs.indexOf(n) % 7) / 7 : n.seeT) - dt;
    if (n.seeT <= 0) {
      n.seeT = 0.18 + (npcs.indexOf(n) % 5) * 0.02;
      const px = player.g.position.x, pz = player.g.position.z;
      n.sees = !playerDead && canSee(n, px, pz);
      if (n.sees) {
        n.lastKnown = { x: px, z: pz, age: 0 };
        // Suspicion settles towards what he is looking at rather than climbing
        // forever: a stranger walking down the street levels off well below the
        // "go and ask him some questions" line, while a drawn gun, a shot or a
        // price on your head takes him straight over it.
        const alarm = 0.25 + (wanted > 0 ? 0.75 : 0) + (aiming ? 0.5 : 0) +
          ((typeof playerShotT === 'number' && playerShotT > 0) ? 0.9 : 0) + ((n.hitT || 0) > 0 ? 1 : 0);
        const target = clamp(alarm, 0, 1.2);
        const rate = S.gain * (target > n.susp ? 1.1 : 0.5);
        n.susp = clamp(n.susp + (target - n.susp) * clamp(rate * dt * 1.4, 0, 1), 0, 1);
      } else if (n.susp > 0) {
        n.susp = Math.max(0, n.susp - dt * (n.susp > 0.8 ? 0.08 : 0.22));
      }
    }
    if (n.heard) n.heard.age += dt;
  }

  function aware(n) { return !!n.sees && (n.susp || 0) >= 0.99; }
  function suspicious(n) { return (n.susp || 0) >= 0.34; }
  function lastKnown(n) { return n.lastKnown && n.lastKnown.age < 25 ? n.lastKnown : null; }
  function heard(n) { return n.heard && n.heard.age < 12 ? n.heard : null; }
  // the place an NPC should go and look: what it saw beats what it heard
  function pointOfInterest(n) { return lastKnown(n) || heard(n); }
  function forget(n) { n.susp = 0; n.sees = false; n.lastKnown = null; n.heard = null; n.alertT = undefined; }

  return { SENSES, senses, canSee, clearLine, noise, update, aware, suspicious, lastKnown, heard, pointOfInterest, forget, get noiseMark() { return noiseMark; } };
})();
