/* ==========================================================================
   The Wild West - js/entities/weapons.js
   Weapon stats, ammo and upgrade state, the held models and the muzzle flashes.
   Provides:  WEAPONS, pistol, rifleModel, muzzle, drawWeapons, switchWeapon, startReload
   Expects:   makeRevolver, makeRifle, player (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// =====================================================================
//  WEAPONS
// =====================================================================
const WEAPONS = {
  revolver: { name: 'REVOLVER', mag: 8, dmg: 1.0, head: 2.6, rate: 250, reload: 1.5, spread: 0.015, ads: 0.0038, bloom: 0.9, recoil: 0.075, sound: 'revolver' },
  rifle: { name: 'WINCHESTER', mag: 10, dmg: 1.75, head: 3.1, rate: 620, reload: 2.3, spread: 0.009, ads: 0.0016, bloom: 1.4, recoil: 0.15, sound: 'rifle' }
};
const playerWeapons = { revolver: { owned: true, ammo: 8 }, rifle: { owned: false, ammo: 0 } };
let curWeapon = 'revolver';
const upgrades = { mag: 0, hp: 0, reload: 0, steady: 0, rifle: 0 };
let ammo = 8, magSize = 8, maxHp = 5, reloadDur = 1.5;
function magFor(w) { return WEAPONS[w].mag + upgrades.mag * 2; }
function reloadFor(w) { return WEAPONS[w].reload * (1 - 0.25 * upgrades.reload); }
function spreadMult() { return 1 - 0.3 * upgrades.steady; }
function syncWeapon() {
  magSize = magFor(curWeapon);
  ammo = playerWeapons[curWeapon].ammo;
  reloadDur = reloadFor(curWeapon);
}
function setAmmo(v) { ammo = clamp(v, 0, magSize); playerWeapons[curWeapon].ammo = ammo; }

const pistol = makeRevolver();
pistol.rotation.y = Math.PI;
pistol.rotation.x = 1.22;
pistol.position.set(0, -0.358, 0.066);
pistol.traverse(o => { if (o.isMesh) o.castShadow = false; });
player.elbowR.add(pistol);
const rifleModel = makeRifle();
rifleModel.rotation.y = Math.PI;
rifleModel.rotation.x = 1.5;
rifleModel.position.set(0, -0.3, 0.12);
rifleModel.visible = false;
rifleModel.traverse(o => { if (o.isMesh) o.castShadow = false; });
player.elbowR.add(rifleModel);
const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffdd55 }));
muzzle.position.set(0, 0, -0.27);
muzzle.visible = false;
pistol.add(muzzle);
const muzzleR = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffdd55 }));
muzzleR.position.set(0, 0, -0.66);
muzzleR.visible = false;
rifleModel.add(muzzleR);
// the flash is a light too, so a shot throws real illumination down the barrel
const muzzleLight = new THREE.PointLight(0xffd18a, 0, 12, 2);
scene.add(muzzleLight);
let flashTimer = 0;
function drawWeapons() {
  pistol.visible = curWeapon === 'revolver';
  rifleModel.visible = curWeapon === 'rifle';
  Sound.click();
}
function switchWeapon(k) {
  if (reloading || playerDead || matchState !== 'play' || paused) return;
  if (!playerWeapons[k] || !playerWeapons[k].owned || k === curWeapon) return;
  playerWeapons[curWeapon].ammo = ammo;
  curWeapon = k;
  syncWeapon();
  pistol.visible = curWeapon === 'revolver';
  rifleModel.visible = curWeapon === 'rifle';
  playerFireT = 0;
  Sound.click();
}
function startReload() {
  if (reloading || playerDead || matchState !== 'play' || paused) return;
  if (ammo >= magSize) return;
  reloadDur = reloadFor(curWeapon);
  reloading = true; reloadT = 0;
  Sound.reload(reloadDur);
}

