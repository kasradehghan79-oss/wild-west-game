/* ==========================================================================
   The Wild West - js/entities/mount.js
   Mounting and dismounting the horse, including the rider leg pose switch.
   Provides:  showPlayerLegs, toggleMount
   Expects:   player, horse (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- mount ----------
function showPlayerLegs(v) { player.legL.visible = v; player.legR.visible = v; }
function toggleMount() {
  if (paused || shopOpen) return;
  if (mounted) {
    mounted = false;
    const hx = Math.sin(horse.g.rotation.y), hz = Math.cos(horse.g.rotation.y);
    const px = horse.g.position.x + hz * 1.6, pz = horse.g.position.z - hx * 1.6;
    player.g.position.set(px, heightAt(px, pz), pz);
    showPlayerLegs(true);
    Sound.click();
  } else {
    if (player.g.position.distanceTo(horse.g.position) < 3.8) {
      mounted = true;
      player.armL.rotation.x = -0.65; player.armR.rotation.x = -0.6;
      player.elbowL.rotation.x = -0.8; player.elbowR.rotation.x = -0.75;
      player.legL.rotation.x = -1.2; player.legR.rotation.x = -1.2;
      player.legL.rotation.z = -0.35; player.legR.rotation.z = 0.35;
      player.kneeL.rotation.x = 1.35; player.kneeR.rotation.x = 1.35;
      showPlayerLegs(true);
      Sound.gallop(2);
    } else {
      feed('No horse close by', '');
    }
  }
}
showPlayerLegs(true);
player.gun.visible = false;
