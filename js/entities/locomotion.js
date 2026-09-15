/* ==========================================================================
   The Wild West - js/entities/locomotion.js
   Procedural walking and running: gait profile, foot planting, idle pose, steering, NPC brains.
   Provides:  gaitProfile, applyLocomotion, walkCycle, idlePose, stepTowards, faceMove, BODY_R, updateNPC
   Expects:   heightAt, blocks, collide, tmpV (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// =====================================================================
//  PROCEDURAL LOCOMOTION
//  Stride phase advances with distance travelled (so the feet never skate),
//  walk and run are separate pose sets blended by speed, and everything is
//  driven off the articulated rig: ankles roll through heel-strike and
//  toe-off, the pelvis rotates, the shoulders counter-rotate and the head
//  stays level.
// =====================================================================
// Stride length and hip swing are derived from the character's leg length, so the
// cadence always matches the ground speed and the feet plant instead of skating.
const LEG_LEN = 0.92;
function gaitProfile(v) {
  const run = clamp((v - 3.4) / 4.2, 0, 1);           // 0 = strolling, 1 = full sprint
  const stride = clamp(0.45 + 0.17 * v, 0.5, 1.78);   // units travelled per single step
  const hip = clamp(Math.asin(clamp(stride / (2 * LEG_LEN), 0.06, 0.97)), 0.12, 1.0);
  return {
    run, stride, hip,
    kneeBase: lerp(0.10, 0.24, run),
    kneeSwing: lerp(0.85, 1.65, run),
    kneeAbsorb: lerp(0.16, 0.80, run),
    ankleSwing: lerp(-0.16, -0.28, run),
    anklePush: lerp(0.26, 0.50, run),
    armA: hip * lerp(0.70, 0.95, run),
    elbowBend: lerp(0.25, 1.20, run),
    lean: lerp(0.040, 0.34, run),
    bob: lerp(0.028, 0.075, run),
    pelvisYaw: lerp(0.05, 0.13, run),
    pelvisRoll: lerp(0.020, 0.055, run),
    chestYaw: lerp(0.08, 0.19, run)
  };
}
// Spawns the footstep at the exact instant a foot takes the weight, with the
// matching burst of dust, so audio and animation stay locked together.
function footPlant(h, sp, run, left) {
  h.footT = 0;
  const inWater = inLake(h.g.position.x, h.g.position.z, -0.8) && h.g.position.y < -0.02;
  if (h.isPlayer) {
    Sound.step(inWater ? 'water' : 'dirt');
    if (inWater) {
      // wading: spray instead of dust
      FX.splash(tmpV2.set(h.g.position.x + rnd(-0.2, 0.2), h.g.position.y + 0.04, h.g.position.z + rnd(-0.2, 0.2)), run > 0.5 ? 9 : 6);
    } else if (sp > 5.4) {
      FX.dustRing(tmpV2.set(h.g.position.x + rnd(-0.15, 0.15), h.g.position.y + 0.05, h.g.position.z + rnd(-0.15, 0.15)), run > 0.5 ? 5 : 3);
    }
  } else {
    // you can hear lawmen coming: footsteps fade in over ~20 units
    const d = Math.hypot(h.g.position.x - player.g.position.x, h.g.position.z - player.g.position.z);
    if (d < 20) Sound.step(inWater ? 'water' : 'dirt', 0.55 * (1 - d / 20));
  }
}
// moveSpeed: signed ground speed along the way the body is facing (negative means
// backpedalling, which reverses the stride). opts.headFree: let the head bob.
function applyLocomotion(h, dt, moveSpeed, opts) {
  opts = opts || {};
  const t = clock.elapsedTime;
  const spd = Math.abs(moveSpeed);
  const backing = moveSpeed < -0.2;
  const P = gaitProfile(spd);
  const moving = spd > 0.2;
  // smooth walk<->idle weight so starts and stops read as a weight shift, not a snap
  h.walkW = lerp(h.walkW, moving ? 1 : 0, Math.min(1, dt * (moving ? 7 : 5)));
  h.runW = lerp(h.runW, moving ? P.run : 0, Math.min(1, dt * 5));
  const W = h.walkW, R = h.runW;
  const accel = (spd - h.lastSp) / Math.max(dt, 0.001);
  h.lastSp = spd;
  h.accel = lerp(h.accel, clamp(accel, -30, 30), Math.min(1, dt * 6));
  const prevPhase = h.phase;
  // half a cycle per step: cadence = speed / stride, so the feet never slide.
  // The sign matters: walking backwards runs the cycle in reverse, which is
  // exactly what a backpedal looks like.
  h.phase += dt * (moving ? Math.PI * moveSpeed / P.stride : 0.85);
  if (h.phase > TAU * 1000) h.phase -= TAU * 1000;
  else if (h.phase < -TAU * 1000) h.phase += TAU * 1000;
  const phi = h.phase;
  const s = Math.sin(phi), c = Math.cos(phi);
  const swR = Math.max(0, c), swL = Math.max(0, -c);          // swing progress (leg in the air)
  const stR = Math.max(0, -c), stL = Math.max(0, c);          // stance progress (foot planted)
  const idle = 1 - W;
  // --- legs ---
  const hipAmp = P.hip * W;
  h.legR.rotation.x = lerp(h.legR.rotation.x, -hipAmp * s, Math.min(1, dt * 16));
  h.legL.rotation.x = lerp(h.legL.rotation.x, hipAmp * s, Math.min(1, dt * 16));
  const kneeR = P.kneeBase * W + P.kneeSwing * W * Math.pow(swR, 1.25) + P.kneeAbsorb * W * Math.pow(stR, 2.2) + idle * 0.06;
  const kneeL = P.kneeBase * W + P.kneeSwing * W * Math.pow(swL, 1.25) + P.kneeAbsorb * W * Math.pow(stL, 2.2) + idle * 0.06;
  h.kneeR.rotation.x = lerp(h.kneeR.rotation.x, kneeR, Math.min(1, dt * 18));
  h.kneeL.rotation.x = lerp(h.kneeL.rotation.x, kneeL, Math.min(1, dt * 18));
  h.ankleR.rotation.x = lerp(h.ankleR.rotation.x, W * (P.ankleSwing * swR + P.anklePush * stR), Math.min(1, dt * 16));
  h.ankleL.rotation.x = lerp(h.ankleL.rotation.x, W * (P.ankleSwing * swL + P.anklePush * stL), Math.min(1, dt * 16));
  // side-stepping: splay the legs toward the step so a crab walk is not a
  // forward stride dragged sideways
  const strafe = clamp(opts.strafe || 0, -1, 1);
  const side = strafe * 0.32 * W;
  h.legR.rotation.z = lerp(h.legR.rotation.z, side * (0.45 + 0.55 * Math.max(0, Math.sin(phi))), Math.min(1, dt * 9));
  h.legL.rotation.z = lerp(h.legL.rotation.z, side * (0.45 + 0.55 * Math.max(0, -Math.sin(phi))), Math.min(1, dt * 9));
  // --- pelvis: rotates with the stride, dips over the swing leg ---
  const lean = (backing ? -0.5 : 1) * P.lean;
  h.hips.rotation.y = lerp(h.hips.rotation.y, -P.pelvisYaw * W * s, Math.min(1, dt * 12));
  h.hips.rotation.z = lerp(h.hips.rotation.z, P.pelvisRoll * W * s + idle * Math.sin(t * 0.7 + h.phase * 0.2) * 0.012, Math.min(1, dt * 8));
  h.hips.rotation.x = lerp(h.hips.rotation.x, -lean * W * 0.35, Math.min(1, dt * 8));
  // --- chest counter-rotates against the pelvis and leans into the run ---
  h.chest.rotation.y = lerp(h.chest.rotation.y, P.chestYaw * W * s, Math.min(1, dt * 10));
  h.chest.rotation.x = lerp(h.chest.rotation.x, lean * W * 0.65 + h.accel * 0.006 + idle * (0.012 + Math.sin(t * 1.5 + h.phase * 3) * 0.012), Math.min(1, dt * 8));
  h.chest.rotation.z = lerp(h.chest.rotation.z, -P.pelvisRoll * W * s * 1.4, Math.min(1, dt * 8));
  // --- arms: the free arm swings hard, the gun arm is held ---
  const swingL = -Math.sin(phi) * P.armA * W;
  const gunCarry = h.gunDrawn ? 0.45 : 0.3;
  const swingR = Math.sin(phi) * P.armA * W * gunCarry;
  h.armL.rotation.x = lerp(h.armL.rotation.x, swingL, Math.min(1, dt * 14));
  h.armR.rotation.x = lerp(h.armR.rotation.x, swingR, Math.min(1, dt * 14));
  h.elbowL.rotation.x = lerp(h.elbowL.rotation.x, -P.elbowBend * W * (0.5 + 0.5 * Math.max(0, -Math.sin(phi))) - idle * 0.2, Math.min(1, dt * 12));
  h.elbowR.rotation.x = lerp(h.elbowR.rotation.x, -P.elbowBend * W * 0.55 * gunCarry - idle * 0.2, Math.min(1, dt * 12));
  h.wristL.rotation.x = lerp(h.wristL.rotation.x, -0.15 * P.elbowBend * W, Math.min(1, dt * 10));
  // --- head stays level while the body rolls underneath it ---
  if (opts.headFree !== false) {
    h.head.rotation.y = (-(h.hips.rotation.y + h.chest.rotation.y) * 0.8 + Math.sin(t * 0.5) * 0.05) * 1;
    h.head.rotation.z = -(h.hips.rotation.z + h.chest.rotation.z) * 0.7;
  }
  // --- torso breathing + vertical travel of the body ---
  h.torso.scale.y = 1 + Math.sin(t * 1.6 + h.phase * 2) * 0.012 * (1 - W * 0.4);
  // feet strike the ground half a cycle apart; fire the event on the cross-over
  if (moving) {
    const a = Math.floor((prevPhase + Math.PI / 2) / Math.PI);
    const b = Math.floor((phi + Math.PI / 2) / Math.PI);
    if (a !== b) footPlant(h, spd, R, (b % 2) === 0);
  }
  // two vertical dips per cycle, peaking between steps for the run
  h.bob = W * P.bob * (P.run > 0.35 ? (0.5 - 0.5 * Math.cos(2 * phi)) : (0.5 + 0.5 * Math.cos(2 * phi)));
  h.leanX = lean * W + h.accel * 0.004;
  return { W, R, moving };
}
function walkCycle(n, sp, dt, strafe) {
  applyLocomotion(n, dt, sp, { headFree: false, strafe: strafe || 0 });
  n.g.position.y = lerp(n.g.position.y, heightAt(n.g.position.x, n.g.position.z) + n.bob, Math.min(1, dt * 8));
  n.g.rotation.x = lerp(n.g.rotation.x, n.leanX, Math.min(1, dt * 6));
  n.g.rotation.z = lerp(n.g.rotation.z, Math.sin(n.phase) * 0.025 * n.walkW, Math.min(1, dt * 6));
}
function idlePose(n, dt, t) {
  applyLocomotion(n, dt, 0, { headFree: false });
  n.head.rotation.y = lerpAngle(n.head.rotation.y, Math.sin(t * 0.6 + n.phase * 4) * 0.4, Math.min(1, dt * 2));
  n.g.rotation.x = lerp(n.g.rotation.x, 0, Math.min(1, dt * 4));
  n.g.rotation.z = lerp(n.g.rotation.z, Math.sin(t * 1.1 + n.phase * 3) * 0.02, Math.min(1, dt * 4));
  n.gun.rotation.x = lerp(n.gun.rotation.x, n.gunRest.x, Math.min(1, dt * 8));
  n.gun.position.y = lerp(n.gun.position.y, n.gunRest.py, Math.min(1, dt * 8));
  n.gun.position.z = lerp(n.gun.position.z, n.gunRest.pz, Math.min(1, dt * 8));
}
// Body radius used for walking so people stop at a wall instead of sinking into it.
const BODY_R = 0.42;
function stepTowards(n, tx, tz, sp, dt) {
  const g = n.g.position;
  const dx = tx - g.x, dz = tz - g.z;
  const d = Math.hypot(dx, dz);
  n.moveDx = 0; n.moveDz = 0;
  if (d < 0.02) return 0;
  const ux = dx / d, uz = dz / d;
  const step = Math.min(sp * dt, 0.6);
  const ox = g.x, oz = g.z;
  // axis separated move gives free wall sliding
  if (!collide(g.x + ux * step, g.z, BODY_R)) g.x += ux * step;
  if (!collide(g.x, g.z + uz * step, BODY_R)) g.z += uz * step;
  if (g.x === ox && g.z === oz) {
    // wedged into a corner: try to slip along the obstacle instead of grinding
    const px = -uz, pz = ux;
    if (!collide(g.x + px * step, g.z, BODY_R)) g.x += px * step;
    else if (!collide(g.x, g.z + pz * step, BODY_R)) g.z += pz * step;
  }
  // last resort: if a spawn or a shove put them inside something, push them out
  resolveCollision(g, BODY_R);
  g.x = clamp(g.x, -138, 138);
  g.z = clamp(g.z, -138, 138);
  g.y = lerp(g.y, heightAt(g.x, g.z), Math.min(1, dt * 5));
  n.moveDx = g.x - ox; n.moveDz = g.z - oz;
  return d;
}
// Turn the body toward the way it is actually travelling. Without this an NPC
// stares at its target while its legs carry it elsewhere, which reads as
// walking backwards.
function faceMove(n, dt, rate) {
  const m = Math.hypot(n.moveDx || 0, n.moveDz || 0);
  if (!(m > 0.0004)) return;
  n.g.rotation.y = lerpAngle(n.g.rotation.y, Math.atan2(n.moveDx, n.moveDz), Math.min(1, dt * (rate || 4)));
}
// Signed speed along the body's own facing: positive = forward, negative = backpedal.
function localSpeed(n, sp) {
  const m = Math.hypot(n.moveDx || 0, n.moveDz || 0);
  if (!(m > 0.0004)) return sp;
  const fx = Math.sin(n.g.rotation.y), fz = Math.cos(n.g.rotation.y);
  return sp * clamp((n.moveDx * fx + n.moveDz * fz) / m, -1, 1);
}
function updateCivil(n, dt, dx, dz, pd) {
  const t = clock.elapsedTime;
  const panic = wanted > 0 && pd < 30;
  if (panic) {
    n.retreatT = 0.4;
  }
  if (n.retreatT > 0) {
    n.retreatT -= dt;
    const sp = ARCH.civil.speed * 2.9;
    stepTowards(n, n.g.position.x - dx, n.g.position.z - dz, sp, dt);
    faceMove(n, dt, 8);
    walkCycle(n, localSpeed(n, sp), dt);
    n.armL.rotation.x = lerp(n.armL.rotation.x, -2.4, Math.min(1, dt * 6));
    n.armR.rotation.x = lerp(n.armR.rotation.x, -2.4, Math.min(1, dt * 6));
    n.elbowL.rotation.x = lerp(n.elbowL.rotation.x, -0.5, Math.min(1, dt * 6));
    n.elbowR.rotation.x = lerp(n.elbowR.rotation.x, -0.5, Math.min(1, dt * 6));
    n.head.rotation.y = lerpAngle(n.head.rotation.y, 0, Math.min(1, dt * 6));
    n.torso.scale.y = 1;
    return;
  }
  if (!n.target) pickNpcTarget(n);
  const d = stepTowards(n, n.target.x, n.target.z, ARCH.civil.speed * 0.55, dt);
  if (d < 0.35) { n.target = null; n.waitT = rnd(1, 4); }
  if (n.waitT > 0) { n.waitT -= dt; idlePose(n, dt, t); return; }
  faceMove(n, dt, 3);
  walkCycle(n, localSpeed(n, ARCH.civil.speed * 0.55), dt);
  const toPlayer = angDiff(Math.atan2(dx, dz), n.g.rotation.y);
  n.head.rotation.y = lerpAngle(n.head.rotation.y, Math.abs(toPlayer) < 1 && pd < 14 ? toPlayer : Math.sin(t * 0.7 + n.phase) * 0.4, Math.min(1, dt * 3));
}
function updateNPC(n, dt) {
  const t = clock.elapsedTime;
  if (n.dead) {
    if (n.deathTwist === undefined) { n.deathTwist = rnd(-0.45, 0.45); n.deathRoll = rnd(-0.32, 0.32); n.deathArm = rnd(0.2, 0.75); }
    const limp = Math.min(1, dt * 3.2);
    n.fall = Math.min(1, n.fall + dt * 3);
    n.g.rotation.x = lerp(n.g.rotation.x, -n.fall * Math.PI / 2, Math.min(1, dt * 10));
    n.g.rotation.z = lerp(n.g.rotation.z, n.deathRoll, limp);
    n.hips.rotation.set(0, 0, 0);
    n.hips.position.y = 0.72;
    n.chest.rotation.x = lerp(n.chest.rotation.x, -0.18, limp);
    n.chest.rotation.y = lerp(n.chest.rotation.y, n.deathTwist, limp);
    n.chest.rotation.z = lerp(n.chest.rotation.z, n.deathRoll * 0.5, limp);
    n.legL.rotation.x = lerp(n.legL.rotation.x, 0.3, limp);
    n.legR.rotation.x = lerp(n.legR.rotation.x, -0.15, limp);
    n.kneeL.rotation.x = lerp(n.kneeL.rotation.x, 0.7, limp);
    n.kneeR.rotation.x = lerp(n.kneeR.rotation.x, 0.25, limp);
    n.ankleL.rotation.x = lerp(n.ankleL.rotation.x, 0.25, limp);
    n.ankleR.rotation.x = lerp(n.ankleR.rotation.x, 0.1, limp);
    n.armL.rotation.x = lerp(n.armL.rotation.x, n.deathArm, limp);
    n.armR.rotation.x = lerp(n.armR.rotation.x, n.deathArm * 0.6, limp);
    n.elbowL.rotation.x = lerp(n.elbowL.rotation.x, -0.5, limp);
    n.elbowR.rotation.x = lerp(n.elbowR.rotation.x, -0.3, limp);
    n.g.position.y = lerp(n.g.position.y, heightAt(n.g.position.x, n.g.position.z), Math.min(1, dt * 5));
    return;
  }
  blinkH(n, dt);
  n.recoil = Math.max(0, n.recoil - dt * 0.4);
  n.fireT = Math.max(0, n.fireT - dt);
  n.muzzleT = Math.max(0, n.muzzleT - dt);
  if (n.reactT > 0) n.reactT -= dt;
  n.strafeT -= dt;
  if (n.strafeT <= 0) { n.strafeT = rnd(0.8, 2.2); n.strafe *= -1; }
  const dx = player.g.position.x - n.g.position.x;
  const dz = player.g.position.z - n.g.position.z;
  const pd = Math.hypot(dx, dz);
  if (n.civil) { updateCivil(n, dt, dx, dz, pd); return; }

  const A = ARCH[n.archetype];
  const engage = A.engage + wanted * 4;
  const combat = !playerDead && wanted > 0 && pd <= engage;
  const chase = !playerDead && wanted > 0;

  if (combat) {
    if (!n.gunDrawn) { n.gunDrawn = true; n.drawT = n.isSheriff ? 0.12 : rnd(0.3, 0.6); }
    else n.drawT = Math.max(0, n.drawT - dt);
    n.waitT = 0;
    n.target = null;
    const toPl = Math.atan2(dx, dz);                       // heading toward the player
    n.g.rotation.y = lerpAngle(n.g.rotation.y, toPl, Math.min(1, dt * 8));
    if (n.retreatT > 0) n.retreatT -= dt;
    else if (n.hp <= 1 && n.archetype !== 'sheriff' && Math.random() < dt * 0.35) n.retreatT = rnd(1.2, 2.4);

    let mvHeading = null, sp = A.speed, backpedal = false, strafeAmt = 0;
    if (n.retreatT > 0) {
      mvHeading = toPl + Math.PI;                          // break contact, facing him
      sp = A.speed * 1.5; backpedal = true;
    } else if (pd > A.range * 1.12) {
      mvHeading = toPl;                                    // close the distance
      sp = A.speed * (n.archetype === 'shotgunner' ? 1.9 : 1.5);
    } else if (pd < A.range * 0.5) {
      mvHeading = toPl + Math.PI;                          // too close, back off
      sp = A.speed * 1.1; backpedal = true;
    } else {
      // in the pocket: crab step, never a full 90 degree sideways slide
      strafeAmt = n.strafe * 0.6;
      mvHeading = toPl + strafeAmt;
      sp = A.speed * 0.85;
    }
    if (mvHeading !== null) {
      const tx = n.g.position.x + headX(mvHeading) * 4;    // heading -> world direction
      const tz = n.g.position.z + headZ(mvHeading) * 4;
      stepTowards(n, tx, tz, sp, dt);
      // twist the body into the step, but keep it mostly squared up on the player
      if (strafeAmt) n.g.rotation.y = lerpAngle(n.g.rotation.y, toPl + strafeAmt * 0.5, Math.min(1, dt * 5));
      else faceMove(n, dt, 4);
      walkCycle(n, localSpeed(n, sp) * 0.95, dt, strafeAmt * 1.67);
    }
    if (n.drawT <= 0) faceAndShoot(n, dt, pd, 1);
    else {
      n.armR.rotation.x = lerp(n.armR.rotation.x, -0.3, Math.min(1, dt * 8));
      n.armL.rotation.x = lerp(n.armL.rotation.x, -0.2, Math.min(1, dt * 8));
    }
    return;
  }

  if (chase) {
    if (!n.gunDrawn) { n.gunDrawn = true; n.drawT = rnd(0.3, 0.6); }
    else n.drawT = Math.max(0, n.drawT - dt);
    n.waitT = 0;
    // run mostly straight at the player, with just a little lateral drift, so the
    // direction they travel is the direction they are looking
    const chaseHeading = Math.atan2(dx, dz) + Math.sin(n.chaseA) * 0.5;
    const stopR = Math.max(4, A.range * 0.55);
    n.target = {
      x: player.g.position.x - headX(chaseHeading) * stopR,
      z: player.g.position.z - headZ(chaseHeading) * stopR
    };
    n.chaseA += rnd(-0.5, 0.5) * dt;
    const chaseSp = A.speed * (1.4 + wanted * 0.1);
    const d = stepTowards(n, n.target.x, n.target.z, chaseSp, dt);
    if (d > 0.4) {
      n.g.rotation.y = lerpAngle(n.g.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 6));
      walkCycle(n, localSpeed(n, chaseSp), dt);
    }
    n.head.rotation.y = lerpAngle(n.head.rotation.y, 0, Math.min(1, dt * 4));
    n.head.rotation.x = lerp(n.head.rotation.x, 0, Math.min(1, dt * 4));
    if (n.drawT <= 0) {
      n.armR.rotation.x = lerp(n.armR.rotation.x, -Math.PI / 2 - 0.2, Math.min(1, dt * 10));
      n.elbowR.rotation.x = lerp(n.elbowR.rotation.x, 0.2, Math.min(1, dt * 10));
      n.gun.rotation.x = lerp(n.gun.rotation.x, n.gunAim.x, Math.min(1, dt * 10));
      n.gun.position.y = lerp(n.gun.position.y, n.gunAim.py, Math.min(1, dt * 10));
      n.gun.position.z = lerp(n.gun.position.z, n.gunAim.pz - n.recoil, Math.min(1, dt * 10));
      if (n.shootT === undefined) n.shootT = rnd(0.6, 1.4);
      n.shootT -= dt;
      if (n.shootT <= 0) {
        n.shootT = rnd(A.cdMin, A.cdMax) * 1.5;
        fireNpc(n, pd, 0.55);
      }
    }
    return;
  }

  // idle / patrol
  if (n.gunDrawn) { n.gunDrawn = false; n.shootT = undefined; }
  if (n.waitT > 0) {
    n.waitT -= dt;
    idlePose(n, dt, t);
    const la = clamp(angDiff(Math.atan2(dx, dz), n.g.rotation.y), -1.2, 1.2);
    if (pd < 18) n.head.rotation.y = lerpAngle(n.head.rotation.y, la, Math.min(1, dt * 2));
    return;
  }
  if (!n.target) {
    pickNpcTarget(n);
    if (!n.target) { n.waitT = rnd(0.6, 1.8); idlePose(n, dt, t); return; }
  }
  // pivot on the spot before marching off, instead of setting off sideways
  const wantHeading = Math.atan2(n.target.x - n.g.position.x, n.target.z - n.g.position.z);
  const turnErr = Math.abs(angDiff(wantHeading, n.g.rotation.y));
  if (turnErr > 1.5) {
    n.g.rotation.y = lerpAngle(n.g.rotation.y, wantHeading, Math.min(1, dt * 5));
    idlePose(n, dt, t);
    return;
  }
  const walkSp = n.speed * (turnErr > 0.8 ? 0.55 : 1);
  const d = stepTowards(n, n.target.x, n.target.z, walkSp, dt);
  if (d < 0.35) { n.target = null; n.waitT = rnd(1.5, 4.5); return; }
  // wedged against something (a wall, a wagon): give up and pick a new spot
  const moved = Math.hypot(n.moveDx, n.moveDz);
  n.blockT = moved < walkSp * dt * 0.35 ? (n.blockT || 0) + dt : 0;
  if (n.blockT > 0.7) { n.blockT = 0; n.target = null; n.waitT = rnd(0.2, 0.9); return; }
  faceMove(n, dt, 4.5);                       // walk the way you are looking
  walkCycle(n, localSpeed(n, walkSp), dt);
  const la = clamp(angDiff(Math.atan2(dx, dz), n.g.rotation.y), -1.1, 1.1);
  n.head.rotation.y = lerpAngle(n.head.rotation.y, pd < 20 ? la : Math.sin(n.phase * 0.35) * 0.5, Math.min(1, dt * 2.5));
  n.head.rotation.x = lerp(n.head.rotation.x, Math.sin(n.phase * 2) * 0.04, Math.min(1, dt * 4));
  n.gun.rotation.x = lerp(n.gun.rotation.x, n.gunRest.x, Math.min(1, dt * 6));
  n.gun.position.y = lerp(n.gun.position.y, n.gunRest.py, Math.min(1, dt * 6));
  n.gun.position.z = lerp(n.gun.position.z, n.gunRest.pz, Math.min(1, dt * 6));
}

