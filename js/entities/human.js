/* ==========================================================================
   The Wild West - js/entities/human.js
   Shared human body geometry and makeHuman: the articulated rig used by the player and every NPC.
   Provides:  makeHuman and its part geometries
   Expects:   scene, mat (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- shared human body geometry ----------
const gThigh = new THREE.CylinderGeometry(0.078, 0.09, 0.36, 8);
const gKnee = new THREE.SphereGeometry(0.08, 8, 6);
const gShin = new THREE.CylinderGeometry(0.05, 0.06, 0.3, 8);
const gBootCuff = new THREE.CylinderGeometry(0.062, 0.07, 0.14, 8);
const gBoot = new THREE.SphereGeometry(0.07, 8, 6);
const gShoulder = new THREE.SphereGeometry(0.085, 8, 6);
const gUpperArm = new THREE.CylinderGeometry(0.052, 0.062, 0.28, 8);
const gElbow = new THREE.SphereGeometry(0.055, 8, 6);
const gForearm = new THREE.CylinderGeometry(0.038, 0.048, 0.26, 8);
const gHand = new THREE.SphereGeometry(0.048, 8, 6);
const gThumb = new THREE.SphereGeometry(0.022, 6, 5);
const gTorsoMain = new THREE.CylinderGeometry(0.26, 0.22, 0.5, 14);
const gTorsoTop = new THREE.SphereGeometry(0.26, 14, 8);
const gTorsoBot = new THREE.SphereGeometry(0.22, 14, 8);
const gVestMain = new THREE.CylinderGeometry(0.275, 0.235, 0.42, 14);
const gVestTop = new THREE.SphereGeometry(0.275, 14, 8);
const gBelt = new THREE.TorusGeometry(0.225, 0.035, 8, 18);
const gNeck = new THREE.CylinderGeometry(0.06, 0.075, 0.12, 8);
const gHead = new THREE.SphereGeometry(0.16, 12, 10);
const gNose = new THREE.SphereGeometry(0.03, 6, 5);
const gEar = new THREE.SphereGeometry(0.03, 6, 5);
const gEye = new THREE.SphereGeometry(0.018, 6, 5);
const gBeard = new THREE.SphereGeometry(0.095, 8, 6);
const badgeShape = new THREE.Shape();
for (let i = 0; i < 10; i++) {
  const r = i % 2 === 0 ? 0.045 : 0.019, a = -Math.PI / 2 + i * Math.PI / 5;
  const px = Math.cos(a) * r, py = Math.sin(a) * r;
  if (i === 0) badgeShape.moveTo(px, py); else badgeShape.lineTo(px, py);
}
badgeShape.closePath();
const gBadge = new THREE.ShapeGeometry(badgeShape);

// ---------- humans ----------
function makeHuman(shirt, pants, hat, law, sheriff, archetype) {
  archetype = archetype || (law ? 'deputy' : 'civil');
  const civil = archetype === 'civil';
  const g = new THREE.Group();
  const skins = [0xd9a878, 0xc98f5f, 0xb5794e, 0xe8c39e, 0x9c6b42];
  const skin = pick(skins);
  const matSkin = mat(skin), matShirt = mat(shirt), matPants = mat(pants);
  const matDark = mat(0x241c12), matEye = mat(0x1a1410);
  // one vest colour for the law, so rank never shows in the cloth
  const vestPal = law ? [0x2e2a38] : civil ? [0x8a7048, 0x6f84b0, 0x9c5f5f] : [0x4a3220, 0x3a2a1c, 0x52382a, 0x33302e];
  const matVest = mat(pick(vestPal));
  const matBandana = mat(pick([0x8a2f22, 0x3a3a3a, 0x274060, 0x6a3020]));
  const part = (geo, m, parent, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true;
    (parent || g).add(o);
    return o;
  };
  // articulated rig: feet -> knee -> hip -> waist -> chest, so the body can really bend,
  // counter-rotate and absorb impacts instead of swinging like a pendulum
  const hips = new THREE.Group(); hips.position.set(0, 0.72, 0); g.add(hips);
  const chest = new THREE.Group(); chest.position.set(0, 0.33, 0); hips.add(chest);   // waist pivot
  const legP = x => {
    const p = new THREE.Group(); p.position.set(x, 0, 0);
    hips.add(p);
    part(gThigh, matPants, p, 0, -0.18, 0);
    const k = new THREE.Group(); k.position.set(0, -0.36, 0); p.add(k);
    part(gKnee, matPants, k, 0, 0, 0);
    part(gShin, matPants, k, 0, -0.15, 0);
    const a = new THREE.Group(); a.position.set(0, -0.28, 0); k.add(a);   // ankle
    part(gBootCuff, matDark, a, 0, 0.04, 0.01);
    part(gBoot, matDark, a, 0, -0.017, 0.045, 0.85, 0.9, 1.8);
    box(0.05, 0.06, 0.055, 0x1c150e, 0, -0.04, -0.055, a);
    return [p, k, a];
  };
  const armP = x => {
    const p = new THREE.Group(); p.position.set(x, 0.27, 0);
    chest.add(p);
    part(gShoulder, matShirt, p, 0, 0, 0);
    part(gUpperArm, matShirt, p, 0, -0.16, 0);
    const e = new THREE.Group(); e.position.set(0, -0.31, 0); p.add(e);
    part(gElbow, matShirt, e, 0, 0, 0);
    part(gForearm, matShirt, e, 0, -0.14, 0);
    const w = new THREE.Group(); w.position.set(0, -0.27, 0); e.add(w);   // wrist
    part(gHand, matSkin, w, 0, -0.04, 0, 0.75, 1.25, 0.9);
    part(gThumb, matSkin, w, -x * 0.07, -0.02, -0.02);
    return [p, e, w];
  };
  const [legL, kneeL, ankleL] = legP(-0.13), [legR, kneeR, ankleR] = legP(0.13);
  const [armL, elbowL, wristL] = armP(-0.30), [armR, elbowR, wristR] = armP(0.30);
  armL.rotation.z = -(0.04 + Math.random() * 0.06);
  armR.rotation.z = 0.04 + Math.random() * 0.06;
  const torso = new THREE.Group(); torso.position.set(0, 0, 0); chest.add(torso);
  part(gTorsoMain, matShirt, torso, 0, 0, 0, 1, 1, 0.62);
  part(gTorsoTop, matShirt, torso, 0, 0.25, 0, 1, 0.55, 0.62);
  part(gTorsoBot, matShirt, torso, 0, -0.25, 0, 1, 0.5, 0.62);
  part(gVestMain, matVest, torso, 0, 0.06, 0, 1, 0.85, 0.66);
  part(gVestTop, matVest, torso, 0, 0.24, 0, 1, 0.5, 0.66);
  const belt = part(gBelt, matDark, hips, 0, 0.06, 0);
  belt.rotation.x = Math.PI / 2; belt.scale.set(1, 0.62, 1);
  box(0.055, 0.065, 0.03, 0xd4af37, 0, 0.06, 0.148, hips);
  if (!civil) box(0.11, 0.17, 0.15, 0x5b3a21, 0.25, 0.14, 0.07, hips);
  part(gNeck, matSkin, chest, 0, 0.37, 0);
  const headG = new THREE.Group(); headG.position.set(0, 0.45, 0); chest.add(headG);
  part(gHead, matSkin, headG, 0, 0.08, 0, 1, 1.18, 1.05);
  part(gNose, matSkin, headG, 0, 0.045, 0.155, 0.8, 1.4, 1);
  part(gEar, matSkin, headG, -0.155, 0.06, 0.01, 0.4, 1, 0.7);
  part(gEar, matSkin, headG, 0.155, 0.06, 0.01, 0.4, 1, 0.7);
  const eyes = [];
  [-0.055, 0.055].forEach(ex => eyes.push(part(gEye, matEye, headG, ex, 0.1, 0.155)));
  if (!law) {
    const bandana = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.03, 6, 14), matBandana);
    bandana.position.set(0, -0.015, 0.015); bandana.rotation.x = 0.3; bandana.castShadow = true; headG.add(bandana);
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.045), matBandana);
    knot.position.set(0, -0.06, 0.105); knot.castShadow = true; headG.add(knot);
  }
  if (hat) {
    const hmat = linMat({ color: srgb(hat), side: THREE.DoubleSide, roughness: 0.88 });
    hmat.__lin = true;
    const brimPts = [[0.14, 0], [0.22, 0.002], [0.28, 0.014], [0.33, 0.04], [0.345, 0.065]].map(p => new THREE.Vector2(p[0], p[1]));
    const brim = new THREE.Mesh(new THREE.LatheGeometry(brimPts, 28), hmat);
    brim.position.y = 0.21; brim.castShadow = true; headG.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.178, 0.19, 12), hmat);
    crown.position.y = 0.295; crown.castShadow = true; headG.add(crown);
    const crownTop = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 6, 0, TAU, 0, Math.PI / 2), hmat);
    crownTop.scale.set(1, 0.55, 1); crownTop.position.y = 0.39; crownTop.castShadow = true; headG.add(crownTop);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.182, 0.045, 12), mat(0x17120c));
    band.position.y = 0.245; headG.add(band);
  } else {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.165, 10, 8), mat(0x241c12));
    hair.scale.set(1.02, 0.85, 1.02); hair.position.set(0, 0.12, -0.03); hair.castShadow = true;
    headG.add(hair);
  }
  let badgeRef = null;
  if (!law) {
    box(0.07, 0.018, 0.028, 0x241c12, 0, -0.012, 0.148, headG);
    if (Math.random() < 0.3) part(gBeard, matDark, headG, 0, -0.04, 0.1, 0.95, 0.9, 0.85);
  } else if (sheriff) {
    const bmat = linMat({ color: srgb(0xd4af37), metalness: 0.88, roughness: 0.24, side: THREE.DoubleSide, emissive: srgb(0x6a5210) });
    bmat.envMapIntensity = 0.5;
    // the one and only tell: it is uncovered after two hits, never before
    const badge = new THREE.Group();
    const s1 = new THREE.Mesh(gBadge, bmat);
    const s2 = new THREE.Mesh(gBadge, bmat); s2.rotation.z = Math.PI / 2;
    s1.scale.set(1.5, 1.5, 1.5); s2.scale.set(1.5, 1.5, 1.5);
    badge.add(s1); badge.add(s2);
    badge.position.set(0, 0.62, 0);
    badge.visible = false;
    headG.add(badge);
    badgeRef = badge;
  }
  scene.add(g);
  const hgt = 0.93 + Math.random() * 0.13, wid = 0.9 + Math.random() * 0.22;
  g.scale.set(wid, hgt, wid);

  const gun = archetype === 'rifleman' ? makeRifle() : makeRevolver();
  const gunRest = archetype === 'rifleman'
    ? { x: 1.5, y: Math.PI, z: 0, px: 0, py: -0.30, pz: 0.12 }
    : { x: 1.22, y: Math.PI, z: 0, px: 0, py: -0.358, pz: 0.066 };
  const gunAim = archetype === 'rifleman'
    ? { x: Math.PI / 2, y: Math.PI, z: 0, px: 0, py: -0.22, pz: 0.02 }
    : { x: Math.PI / 2, y: Math.PI, z: 0, px: 0, py: -0.24, pz: 0.05 };
  gun.rotation.set(gunRest.x, gunRest.y, gunRest.z);
  gun.position.set(gunRest.px, gunRest.py, gunRest.pz);
  gun.visible = false;
  elbowR.add(gun);

  const human = {
    g, hips, chest, torso, head: headG, gun, eyes,
    legL, legR, kneeL, kneeR, ankleL, ankleR,
    armL, armR, elbowL, elbowR, wristL, wristR,
    blinkT: 1 + Math.random() * 4, gaitAmp: 0.3 + Math.random() * 0.18, phase: Math.random() * 6,
    dead: false, fall: 0, waitT: 0, target: null, chaseA: Math.random() * TAU, isPlayer: false,
    gunRest, gunAim, hp: 1, isSheriff: false, badge: badgeRef, shots: 0, recoil: 0, fireT: 0,
    archetype, civil, gunDrawn: false, drawT: 0, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: rnd(0.6, 1.8),
    reactT: 0, retreatT: 0, muzzleT: 0, speed: 1, spawn: null, home: null,
    walkW: 0, runW: 0, bob: 0, leanX: 0, leanZ: 0, lastSp: 0, accel: 0, footT: 0, stepSide: 1, turnRate: 0,
    moveDx: 0, moveDz: 0
  };
  ARCH[archetype] && (human.speed = ARCH[archetype].speed);
  g.traverse(o => {
    if (o.isMesh) { o.userData.human = human; shootables.push(o); }
  });
  return human;
}

