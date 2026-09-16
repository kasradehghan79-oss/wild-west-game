/* ==========================================================================
   The Wild West - js/entities/archetypes.js
   Archetype table, the player instance and the camp boundary ring.
   Provides:  ARCH, player, CAMP_R, campZone
   Expects:   makeHuman, scene (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- archetypes ----------
const ARCH = {};
ARCH.deputy = { hp: 2, speed: 1.35, engage: 26, range: 15, dmgMin: 0.55, dmgMax: 0.95, accBase: 0.30, accAim: 0.17, cdMin: 1.0, cdMax: 1.9, bounty: 10, name: 'DEPUTY' };
ARCH.sheriff = { hp: 6, speed: 1.75, engage: 34, range: 19, dmgMin: 0.8, dmgMax: 1.3, accBase: 0.46, accAim: 0.26, cdMin: 0.45, cdMax: 0.95, bounty: 60, name: 'SHERIFF' };
ARCH.rifleman = { hp: 3, speed: 1.15, engage: 54, range: 34, dmgMin: 0.9, dmgMax: 1.5, accBase: 0.38, accAim: 0.24, cdMin: 1.6, cdMax: 2.7, bounty: 20, name: 'RIFLEMAN' };
ARCH.shotgunner = { hp: 5, speed: 1.5, engage: 19, range: 8, dmgMin: 1.2, dmgMax: 2.0, accBase: 0.5, accAim: 0.33, cdMin: 1.4, cdMax: 2.3, bounty: 26, name: 'SHOTGUNNER' };
ARCH.civil = { hp: 2, speed: 1.7, engage: 0, range: 0, dmgMin: 0, dmgMax: 0, accBase: 0, accAim: 0, cdMin: 9, cdMax: 9, bounty: 0, name: 'CIVILIAN' };
// A bandit is on the table for the camps and road agents of later phases: he fights
// on sight rather than needing a reason, which is what makes him a different animal.
ARCH.hunter = { hp: 4, speed: 1.9, engage: 46, range: 26, dmgMin: 1.0, dmgMax: 1.6, accBase: 0.42, accAim: 0.26, cdMin: 0.7, cdMax: 1.4, bounty: 0, name: 'BOUNTY HUNTER' };
ARCH.bandit = { hp: 3, speed: 1.6, engage: 30, range: 12, dmgMin: 0.7, dmgMax: 1.2, accBase: 0.34, accAim: 0.2, cdMin: 0.9, cdMax: 1.8, bounty: 28, name: 'BANDIT', hostile: true };

const player = makeHuman(0xe0452c, 0x35509e, 0x8a5a2c, false, false, 'civil');
player.isPlayer = true;
player.archetype = 'civil';
player.civil = false;
player.g.scale.set(1, 1, 1);
player.g.position.set(0, 0, 0);
player.hp = 1;

const CAMP_R = 28;
const zoneMat = new THREE.MeshBasicMaterial({ color: 0xffd75a, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
const zonePts = [];
for (let i = 0; i < 64; i++) {
  const a = i / 64 * TAU;
  const zx = Math.cos(a) * CAMP_R, zz = Math.sin(a) * CAMP_R;
  zonePts.push(new THREE.Vector3(zx, heightAt(zx, zz) + 0.12, zz));
}
const campZone = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(zonePts, true), 200, 0.055, 5, true), zoneMat);
scene.add(campZone);

