/* ==========================================================================
   The Wild West - js/entities/weapons.js
   Weapon stats, ammo and upgrade state, the held models and the muzzle flashes.
   Provides:  WEAPONS, pistol, rifleModel, knife, muzzle, drawWeapons, switchWeapon, cycleWeapon, startReload
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
  rifle: { name: 'WINCHESTER', mag: 10, dmg: 1.75, head: 3.1, rate: 620, reload: 2.3, spread: 0.009, ads: 0.0016, bloom: 1.4, recoil: 0.15, sound: 'rifle' },
  // The knife is a melee weapon rather than a third gun: no magazine, no reload, and
  // two different attacks. `reach` is how far a swing lands; `backstab` is the shorter
  // distance at which an unaware man can be taken without a sound.
  // The knife is lethal by rule rather than by damage numbers: one blow kills any man,
  // and the sheriff is the only exception, because he is the round's target. Behind his
  // back and unaware it is also silent, which is the part that matters for a clean record.
  knife: {
    name: 'KNIFE', melee: true, mag: 0, rate: 420, reload: 0, recoil: 0.05, sound: 'click',
    reach: 2.0, backstab: 1.6, sheriffHits: 2,
    swing: 0.46,          // seconds the animation runs
    impact: 0.15          // and when in it the blow actually lands
  }
};
const playerWeapons = {
  revolver: { owned: true, ammo: 8 },
  rifle: { owned: false, ammo: 0 },
  // carried from the start: a knife is a tool, not a purchase
  knife: { owned: true, ammo: 0 }
};
let curWeapon = 'revolver';
const upgrades = { mag: 0, hp: 0, reload: 0, steady: 0, rifle: 0 };
let ammo = 8, magSize = 8, maxHp = 5, reloadDur = 1.5;
function isMelee(w) { return !!(WEAPONS[w] && WEAPONS[w].melee); }
function magFor(w) { return isMelee(w) ? 0 : WEAPONS[w].mag + upgrades.mag * 2; }
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
const knife = makeKnife();
knife.rotation.y = Math.PI;
knife.rotation.x = 1.35;
knife.position.set(0, -0.34, 0.1);
knife.visible = false;
knife.traverse(o => { if (o.isMesh) o.castShadow = false; });
player.elbowR.add(knife);
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
  knife.visible = curWeapon === 'knife';
  Sound.click();
}
function switchWeapon(k) {
  if (reloading || playerDead || matchState !== 'play' || paused) return;
  if (!playerWeapons[k] || !playerWeapons[k].owned || k === curWeapon) return;
  playerWeapons[curWeapon].ammo = ammo;
  const wasGun = !isMelee(curWeapon);
  curWeapon = k;
  syncWeapon();
  pistol.visible = curWeapon === 'revolver';
  rifleModel.visible = curWeapon === 'rifle';
  knife.visible = curWeapon === 'knife';
  playerFireT = 0;
  // a knife has to be explained once: it is the only silent way to kill a man
  if (isMelee(k) && wasGun) {
    feed('Knife drawn \u2014 take a man from behind, unseen, for a silent kill', '');
  }
  Sound.click();
}
// The knife is reachable without a third key: tapping the ammo readout cycles the
// weapons, which is also how it works on a phone where there is no keyboard.
function cycleWeapon(dir) {
  const list = ['revolver', 'rifle', 'knife'].filter(k => playerWeapons[k].owned);
  if (list.length < 2) return;
  const i = list.indexOf(curWeapon);
  const next = list[(i + (dir || 1) + list.length) % list.length];
  switchWeapon(next);
}
function startReload() {
  if (reloading || playerDead || matchState !== 'play' || paused) return;
  if (ammo >= magSize) return;
  reloadDur = reloadFor(curWeapon);
  reloading = true; reloadT = 0;
  Sound.reload(reloadDur);
}

