/* ==========================================================================
   The Wild West - js/game/loop.js
   Player input, camera, HUD drawing, day/night update and the main frame loop.
   Provides:  animate, updateHUD, drawMinimap
   Expects:   everything above (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// =====================================================================
//  MAIN LOOP
// =====================================================================
const clock = new THREE.Clock();
const camRay = new THREE.Raycaster();
const houseMarkers = [[-18, -14], [-4, -17], [10, -15], [20, -8], [-22, 6], [-16, 18], [8, 20], [22, 10], [12, 4]];
const dirV = new THREE.Vector3(), backV = new THREE.Vector3();
let frame = 0, camDistMul = 1, heartT = 0, envTimer = 0.1;
let landK = 0, smoothTurn = 0, slopeP = 0, slopeR = 0;
deadEl.addEventListener('click', e => { e.stopPropagation(); nextAfterEnd(); });

function playerInputVector() {
  let mx = 0, mz = 0;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  if (keys['KeyW'] || keys['ArrowUp']) { mx += fx; mz += fz; }
  if (keys['KeyS'] || keys['ArrowDown']) { mx -= fx; mz -= fz; }
  if (keys['KeyD'] || keys['ArrowRight']) { mx += rx; mz += rz; }
  if (keys['KeyA'] || keys['ArrowLeft']) { mx -= rx; mz -= rz; }
  return [mx, mz, Math.hypot(mx, mz)];
}

function updateHUD(dt) {
  for (let i = 0; i < heartsEl.children.length; i++) {
    const frac = clamp(hp - i, 0, 1);
    const cell = heartsEl.children[i];
    cell.firstChild.style.width = (frac * 100) + '%';
    cell.classList.toggle('on', frac > 0);
  }
  stamFill.style.width = (stam / maxStam * 100) + '%';
  stamFill.style.background = stamLock ? 'linear-gradient(180deg,#c98a4a,#8a4a20)' : 'linear-gradient(180deg,#8fd96a,#3f8f30)';
  if (ammoCountEl.textContent !== String(ammo)) ammoCountEl.textContent = ammo;
  ammoCountEl.classList.toggle('empty', ammo === 0);
  ammoNameEl.textContent = WEAPONS[curWeapon].name;
  reloadBar.classList.toggle('on', reloading);
  if (reloading) reloadFill.style.width = (clamp(reloadT / reloadDur, 0, 1) * 100) + '%';
  const stars = wanted > 0 ? '\u2605'.repeat(wanted) + '\u2606'.repeat(5 - wanted) : '\u2606\u2606\u2606\u2606\u2606';
  if (wantedEl.__s !== stars) { wantedEl.innerHTML = '<i>' + stars.slice(0, wanted) + '</i>' + stars.slice(wanted); wantedEl.__s = stars; }
  cashEl.textContent = '$' + cash;
  pOutEl.textContent = outlawPts;
  pLawEl.textContent = lawPts;
  scoreSub.textContent = matchState === 'play' ? 'ROUND ' + roundNum + '/' + MAX_ROUNDS : matchState === 'over' ? 'ROUND OVER' : 'READY';
  const secs = Math.max(0, Math.ceil(roundT));
  if (scoreTime.textContent !== String(secs)) scoreTime.textContent = secs;
  scoreTime.classList.toggle('low', roundT <= 10 && matchState === 'play');
  const hh = String(Math.floor((dayTime * 24 + 6) % 24)).padStart(2, '0');
  let st = (mounted ? 'On horse' : 'On foot') + '  \u00b7  Kills ' + kills + '  \u00b7  ' + hh + ':00';
  if (WEAPONS[curWeapon].name === 'WINCHESTER') st += '  \u00b7  Rifle';
    // key prompts only make sense with a keyboard; the touch build has the pill
    if (nearStore()) st += isTouch ? '  \u00b7  Store open' : '  \u00b7  [F] GENERAL STORE';
    else if (!mounted && player.g.position.distanceTo(horse.g.position) < 3.8) st += isTouch ? '  \u00b7  Mount' : '  \u00b7  [E] Mount';
  statusEl.textContent = st;
  const spread = 1 + bloom * 0.7 + (runT > 0 ? 0.35 : 0);
  crossEl.style.opacity = (matchState === 'play' && !playerDead) ? (0.3 + aimAmt * 0.7) : 0;
  crossEl.style.transform = 'translate(-50%,-50%) scale(' + spread.toFixed(2) + ')';
  const lowP = !playerDead && hp <= maxHp * 0.34 && matchState === 'play';
  lowEl.style.opacity = lowP ? (0.45 + Math.sin(clock.elapsedTime * 3.4) * 0.25) : 0;
  dmgEl.style.opacity = dmgFlash * 0.8;
}

function drawMinimap() {
  const S = mmCv.width, half = S / 2, scale = S / 300;
  const wx = x => half + x * scale, wy = z => half + z * scale;
  mm.clearRect(0, 0, S, S);
  mm.save();
  mm.beginPath(); mm.arc(half, half, half - 1, 0, TAU); mm.clip();
  mm.fillStyle = 'rgba(24,30,18,0.8)'; mm.fillRect(0, 0, S, S);
  mm.strokeStyle = 'rgba(150,120,80,0.45)'; mm.lineWidth = 4;
  mm.beginPath(); mm.moveTo(wx(0), wy(-160)); mm.lineTo(wx(0), wy(160)); mm.stroke();
  mm.beginPath(); mm.moveTo(wx(-160), wy(0)); mm.lineTo(wx(160), wy(0)); mm.stroke();
  mm.strokeStyle = 'rgba(255,215,90,0.45)'; mm.lineWidth = 1.4;
  mm.beginPath(); mm.arc(half, half, CAMP_R * scale, 0, TAU); mm.stroke();
  mm.fillStyle = 'rgba(190,160,115,0.9)';
  houseMarkers.forEach(h => mm.fillRect(wx(h[0]) - 3.5, wy(h[1]) - 3.5, 7, 7));
  mm.fillStyle = '#ffd97a';
  mm.fillRect(wx(STORE.x) - 4.5, wy(STORE.z) - 4.5, 9, 9);
  for (const p of pickups) {
    if (!p.g.visible) continue;
    mm.globalAlpha = 0.7;
    mm.fillStyle = p.type === 'health' ? '#e05a4a' : p.type === 'cash' ? '#9de08a' : '#d4af37';
    mm.fillRect(wx(p.g.position.x) - 1.5, wy(p.g.position.z) - 1.5, 3, 3);
    mm.globalAlpha = 1;
  }
  for (const n of npcs) {
    if (n.dead) continue;
    // the sheriff only reads differently on the map once he has been identified
    const showAsSheriff = n.isSheriff && sheriffRevealed;
    const c = n.civil ? '#9de08a' : showAsSheriff ? '#ffd75a' : n.archetype === 'rifleman' && !n.isSheriff ? '#ff9a3a' : n.archetype === 'shotgunner' && !n.isSheriff ? '#c78fd6' : '#ff5a4a';
    mm.fillStyle = c;
    mm.beginPath(); mm.arc(wx(n.g.position.x), wy(n.g.position.z), showAsSheriff ? 4.6 : 2.6, 0, TAU); mm.fill();
    if (showAsSheriff) {
      mm.strokeStyle = 'rgba(255,215,90,.55)'; mm.lineWidth = 1.4;
      mm.beginPath(); mm.arc(wx(n.g.position.x), wy(n.g.position.z), 7.5 + Math.sin(clock.elapsedTime * 5) * 1.6, 0, TAU); mm.stroke();
    }
  }
  mm.fillStyle = '#c9a227';
  mm.beginPath(); mm.arc(wx(horse.g.position.x), wy(horse.g.position.z), 3, 0, TAU); mm.fill();
  mm.save();
  mm.translate(wx(player.g.position.x), wy(player.g.position.z));
  mm.rotate(Math.PI - player.g.rotation.y);
  mm.fillStyle = '#ffffff';
  mm.beginPath(); mm.moveTo(0, -6.5); mm.lineTo(4.4, 5.5); mm.lineTo(0, 3.4); mm.lineTo(-4.4, 5.5); mm.closePath(); mm.fill();
  mm.restore();
  mm.restore();
  mm.strokeStyle = 'rgba(211,169,92,.85)'; mm.lineWidth = 2.5;
  mm.beginPath(); mm.arc(half, half, half - 1.5, 0, TAU); mm.stroke();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  frame++;
  const active = matchState === 'play' && !paused && !shopOpen;
  const [mx0, mz0, len0] = playerInputVector();
  const moving = len0 > 0 && active && !playerDead;
  const pos = mounted ? horse.g.position : player.g.position;
  let sprinting = false;
  runT = Math.max(0, runT - dt);
  bloom = Math.max(0, bloom - dt * 2.4);
  recoilKick = Math.max(0, recoilKick - dt * 0.9);
  shake = Math.max(0, shake - dt * 3.4);
  zoneMat.opacity = 0.3 + Math.sin(t * 2.2) * 0.18;

  if (matchState === 'play' && !playerDead && !paused && !shopOpen) {
    if (Math.hypot(pos.x, pos.z) > CAMP_R) {
      zoneT -= dt;
      if (zoneT <= 0) { zoneT = 1; hurtPlayer(0.25); }
    } else zoneT = 0;
  }

  // ---------------- mounted ----------------
  if (active && mounted) {
    const fwdKey = keys['KeyW'] || keys['ArrowUp'];
    const backKey = keys['KeyS'] || keys['ArrowDown'];
    const galloping = (keys['ShiftLeft'] || keys['ShiftRight']) && fwdKey && stam > 0 && !stamLock;
    if (galloping) { sprinting = true; stam = Math.max(0, stam - 18 * dt); if (stam <= 0) stamLock = true; }
    const throttle = fwdKey ? (galloping ? 15 : 9) : backKey ? -2.5 : 0;
    horse.speed = lerp(horse.speed, throttle, Math.min(1, dt * (throttle > horse.speed ? 0.9 : 2.2)));
    const turning = (keys['KeyA'] || keys['ArrowLeft']) ? 1 : (keys['KeyD'] || keys['ArrowRight']) ? -1 : 0;
    if (turning) {
      const dir = horse.speed < 0 ? -1 : 1;
      horse.g.rotation.y += turning * dir * (0.5 + Math.abs(horse.speed) * 0.15) * dt;
    }
    if (keys['Space'] && horse.airY < 0.02) { horse.vy = 5.4; Sound.gallop(3); }
    horse.vy -= GRAVITY * dt;
    horse.airY = Math.max(0, horse.airY + horse.vy * dt);
    if (horse.airY <= 0 && horse.vy < 0) horse.vy = 0;
    horse.lean = lerp(horse.lean, turning * Math.min(1, Math.abs(horse.speed) / 9) * 0.14, Math.min(1, dt * 3));
    if (Math.abs(horse.speed) > 0.05) {
      const hx = Math.sin(horse.g.rotation.y), hz = Math.cos(horse.g.rotation.y);
      const nx = pos.x + hx * horse.speed * dt, nz = pos.z + hz * horse.speed * dt;
      if (!collide(nx, pos.z, 0.72)) pos.x = nx; else horse.speed *= 0.3;
      if (!collide(pos.x, nz, 0.72)) pos.z = nz; else horse.speed *= 0.3;
      resolveCollision(pos, 0.72);
      pos.x = clamp(pos.x, -140, 140);
      pos.z = clamp(pos.z, -140, 140);
      gallopT -= dt;
      if (Math.abs(horse.speed) > 1.5 && gallopT <= 0) {
        gallopT = clamp(0.5 - Math.abs(horse.speed) * 0.018, 0.15, 0.5);
        Sound.gallop(Math.abs(horse.speed));
      }
    }
    let mRel = yaw + Math.PI - horse.g.rotation.y;
    mRel = Math.atan2(Math.sin(mRel), Math.cos(mRel));
    const mTwist = aiming ? clamp(mRel, -1.2, 1.2) : 0;
    player.g.rotation.y = lerpAngle(player.g.rotation.y, horse.g.rotation.y + mTwist, Math.min(1, dt * 8));
    const gallopM = Math.min(1, Math.abs(horse.speed) / 9);
    // seat height: the rider's hips belong just above the saddle, not floating
    player.g.position.set(pos.x, horse.g.position.y + 0.97 + Math.abs(Math.sin(horse.horsePhase)) * 0.07 * gallopM, pos.z);
    player.g.rotation.z = horse.lean * 0.6;
    player.g.rotation.x = lerp(player.g.rotation.x, Math.sin(horse.horsePhase) * 0.04 * gallopM - horse.tilt * 0.7, Math.min(1, dt * 6));
    player.armL.rotation.x = lerp(player.armL.rotation.x, -0.65, Math.min(1, dt * 6));
    player.elbowL.rotation.x = lerp(player.elbowL.rotation.x, -0.8, Math.min(1, dt * 6));
    if (aiming) {
      player.armR.rotation.x = lerp(player.armR.rotation.x, -Math.PI / 2 + pitch * 0.7, Math.min(1, dt * 10));
      player.elbowR.rotation.x = lerp(player.elbowR.rotation.x, 0.1, Math.min(1, dt * 10));
      player.head.rotation.y = lerpAngle(player.head.rotation.y, clamp(mRel - mTwist, -0.6, 0.6), Math.min(1, dt * 8));
    } else {
      player.armR.rotation.x = lerp(player.armR.rotation.x, -0.6, Math.min(1, dt * 6));
      player.elbowR.rotation.x = lerp(player.elbowR.rotation.x, -0.75, Math.min(1, dt * 6));
      player.head.rotation.y = lerpAngle(player.head.rotation.y, 0, Math.min(1, dt * 6));
    }
    player.head.rotation.x = lerp(player.head.rotation.x, 0, Math.min(1, dt * 6));
    player.legL.rotation.x = lerp(player.legL.rotation.x, -1.2, Math.min(1, dt * 6));
    player.legR.rotation.x = lerp(player.legR.rotation.x, -1.2, Math.min(1, dt * 6));
    player.legL.rotation.z = lerp(player.legL.rotation.z, -0.35, Math.min(1, dt * 6));
    player.legR.rotation.z = lerp(player.legR.rotation.z, 0.35, Math.min(1, dt * 6));
    player.kneeL.rotation.x = lerp(player.kneeL.rotation.x, 1.35, Math.min(1, dt * 6));
    player.kneeR.rotation.x = lerp(player.kneeR.rotation.x, 1.35, Math.min(1, dt * 6));
    player.ankleL.rotation.x = lerp(player.ankleL.rotation.x, 0.12, Math.min(1, dt * 6));
    player.ankleR.rotation.x = lerp(player.ankleR.rotation.x, 0.12, Math.min(1, dt * 6));
    // settle the torso back to a riding posture
    player.hips.rotation.y = lerp(player.hips.rotation.y, 0, Math.min(1, dt * 6));
    player.hips.rotation.z = lerp(player.hips.rotation.z, 0, Math.min(1, dt * 6));
    player.hips.rotation.x = lerp(player.hips.rotation.x, 0, Math.min(1, dt * 6));
    player.hips.position.y = 0.72;
    player.chest.rotation.y = lerp(player.chest.rotation.y, 0, Math.min(1, dt * 6));
    player.chest.rotation.z = lerp(player.chest.rotation.z, 0, Math.min(1, dt * 6));
    player.chest.rotation.x = lerp(player.chest.rotation.x, 0.08, Math.min(1, dt * 6));
    player.torso.scale.y = 1;
  // ---------------- on foot ----------------
  } else if (active && !playerDead) {
    const running = (keys['ShiftLeft'] || keys['ShiftRight']) && stam > 0 && !stamLock && moving;
    let sp = 0;
    if (moving) {
      const mx = mx0 / len0, mz = mz0 / len0;
      sp = running ? 7.6 : 4.6;
      if (aiming) sp *= 0.55;
      // wading drag: knee-deep water costs you a good part of your pace
      const wading = inLake(pos.x, pos.z, -0.8) && pos.y < -0.02;
      if (wading) sp *= 0.45;
      if (running) { sprinting = true; runT = 0.15; stam = Math.max(0, stam - 14 * dt); if (stam <= 0) stamLock = true; }
      const nx = pos.x + mx * sp * dt, nz = pos.z + mz * sp * dt;
      if (!collide(nx, pos.z, 0.36)) pos.x = nx;
      if (!collide(pos.x, nz, 0.36)) pos.z = nz;
      resolveCollision(pos, 0.36);
      pos.x = clamp(pos.x, -140, 140);
      pos.z = clamp(pos.z, -140, 140);
      const wantYaw = Math.atan2(mx, mz);
      const dYaw = ((wantYaw - player.g.rotation.y + Math.PI * 3) % TAU) - Math.PI;
      if (!aiming) {
        player.g.rotation.y = lerpAngle(player.g.rotation.y, wantYaw, Math.min(1, dt * 10));
        smoothTurn = lerp(smoothTurn, clamp(dYaw / Math.max(dt, 0.001), -8, 8), Math.min(1, dt * 7));
      } else {
        smoothTurn = lerp(smoothTurn, 0, Math.min(1, dt * 7));
      }
    } else {
      smoothTurn = lerp(smoothTurn, 0, Math.min(1, dt * 7));
    }
    // full procedural gait (also fires footsteps at each foot plant)
    applyLocomotion(player, dt, sp, { headFree: true });
    // --- gravity / jump ---
    if (keys['Space'] && grounded) {
      vy = JUMP_V; grounded = false;
      Sound.step('dirt');
      FX.dustRing(tmpV2.set(pos.x, pos.y + 0.06, pos.z), 6);
      player.kneeL.rotation.x += 0.5; player.kneeR.rotation.x += 0.5;
    }
    vy -= GRAVITY * dt;
    pos.y += vy * dt;
    const gy = heightAt(pos.x, pos.z);
    if (pos.y <= gy) {
      if (!grounded && vy < -4) {
        landK = Math.max(landK, clamp(-vy / 13, 0.15, 1));
        FX.dustRing(tmpV2.set(pos.x, gy + 0.06, pos.z), 12);
        Sound.step('dirt');
      }
      pos.y = gy;
      vy = 0;
      grounded = true;
    }
    landK = Math.max(0, landK - dt * 3.4);
    if (grounded) pos.y = gy + player.bob;
    // --- airborne tuck ---
    if (!grounded) {
      const fall = clamp(-vy / 9, -1, 1);
      player.legR.rotation.x = lerp(player.legR.rotation.x, -0.55 - fall * 0.3, Math.min(1, dt * 9));
      player.legL.rotation.x = lerp(player.legL.rotation.x, 0.30 + fall * 0.2, Math.min(1, dt * 9));
      player.kneeR.rotation.x = lerp(player.kneeR.rotation.x, 1.0, Math.min(1, dt * 9));
      player.kneeL.rotation.x = lerp(player.kneeL.rotation.x, 0.35, Math.min(1, dt * 9));
      player.ankleR.rotation.x = lerp(player.ankleR.rotation.x, -0.30, Math.min(1, dt * 9));
      player.ankleL.rotation.x = lerp(player.ankleL.rotation.x, 0.22, Math.min(1, dt * 9));
      player.chest.rotation.x = lerp(player.chest.rotation.x, 0.06 - fall * 0.12, Math.min(1, dt * 7));
      player.armL.rotation.x = lerp(player.armL.rotation.x, -0.75, Math.min(1, dt * 9));
      player.armR.rotation.x = lerp(player.armR.rotation.x, -0.42, Math.min(1, dt * 9));
      player.elbowL.rotation.x = lerp(player.elbowL.rotation.x, -0.55, Math.min(1, dt * 9));
    } else if (landK > 0.02) {
      // absorb the impact through the knees and hips
      const k = landK;
      player.kneeL.rotation.x += k * 0.65;
      player.kneeR.rotation.x += k * 0.65;
      player.ankleL.rotation.x -= k * 0.3;
      player.ankleR.rotation.x -= k * 0.3;
      player.chest.rotation.x += k * 0.22;
      player.hips.position.y = 0.72 - k * 0.07;
      player.armL.rotation.x -= k * 0.35;
    }
    if (landK <= 0.02) player.hips.position.y = 0.72;
    // --- lean into slopes and corners ---
    const hf = heightAt(pos.x + Math.sin(player.g.rotation.y) * 0.7, pos.z + Math.cos(player.g.rotation.y) * 0.7);
    const hb = heightAt(pos.x - Math.sin(player.g.rotation.y) * 0.7, pos.z - Math.cos(player.g.rotation.y) * 0.7);
    const hr = heightAt(pos.x + Math.cos(player.g.rotation.y) * 0.55, pos.z - Math.sin(player.g.rotation.y) * 0.55);
    const hl = heightAt(pos.x - Math.cos(player.g.rotation.y) * 0.55, pos.z + Math.sin(player.g.rotation.y) * 0.55);
    slopeP = lerp(slopeP, Math.atan2(hf - hb, 1.4) * 0.65, Math.min(1, dt * 5));
    slopeR = lerp(slopeR, Math.atan2(hr - hl, 1.1) * 0.45, Math.min(1, dt * 5));
    if (grounded) {
      player.g.rotation.x = lerp(player.g.rotation.x, player.leanX - slopeP, Math.min(1, dt * 8));
      player.g.rotation.z = lerp(player.g.rotation.z, -smoothTurn * 0.05 + slopeR + Math.sin(player.phase) * 0.022 * player.walkW, Math.min(1, dt * 8));
    } else {
      player.g.rotation.z = lerp(player.g.rotation.z, -smoothTurn * 0.05, Math.min(1, dt * 5));
      player.g.rotation.x = lerp(player.g.rotation.x, player.leanX * 0.5, Math.min(1, dt * 5));
    }
    horse.speed = lerp(horse.speed, 0, Math.min(1, dt * 0.8));
  } else {
    if (!playerDead) applyLocomotion(player, dt, 0, { headFree: true });
    landK = Math.max(0, landK - dt * 3.4);
    if (landK <= 0.02) player.hips.position.y = 0.72;
    horse.speed = lerp(horse.speed, 0, Math.min(1, dt * 0.8));
    horse.lean = lerp(horse.lean, 0, Math.min(1, dt * 3));
    if (!playerDead) {
      player.g.position.y = lerp(player.g.position.y, heightAt(player.g.position.x, player.g.position.z), Math.min(1, dt * 6));
      player.g.rotation.z = lerp(player.g.rotation.z, 0, Math.min(1, dt * 5));
      player.g.rotation.x = lerp(player.g.rotation.x, 0, Math.min(1, dt * 5));
      if (!mounted) {
        player.head.rotation.x = lerp(player.head.rotation.x, 0, Math.min(1, dt * 6));
      }
    }
  }

  if (stamLock && stam >= 30) stamLock = false;
  if (!sprinting) stam = Math.min(maxStam, stam + (stamLock ? 8 : 19) * dt);
  sinceDmg += dt;
  if (matchState === 'play' && !playerDead && sinceDmg > 7 && hp < maxHp) hp = Math.min(maxHp, hp + dt * 0.5);

  // ---------------- weapon / aim pose ----------------
  aimAmt = lerp(aimAmt, (aiming && !playerDead && active) ? 1 : 0, Math.min(1, dt * 8));
  const wObj = gunObj();
  const restX = curWeapon === 'rifle' ? 1.5 : 1.22;
  const restY = curWeapon === 'rifle' ? -0.3 : -0.358;
  const restZ = curWeapon === 'rifle' ? 0.12 : 0.066;
  const aimY = curWeapon === 'rifle' ? -0.22 : -0.24;
  const aimZ = curWeapon === 'rifle' ? 0.02 : 0.05;
  const kick = recoilKick;
  if (aimAmt > 0.01 && !mounted) {
    player.g.rotation.y = lerpAngle(player.g.rotation.y, yaw + Math.PI, Math.min(1, dt * 9));
  }
  const aimingNow = aimAmt > 0.35 || playerFireT > 0;
  if (aimingNow && !mounted) {
    const pitchAdj = aiming ? pitch : 0;
    player.armR.rotation.x = lerp(player.armR.rotation.x, -Math.PI / 2 + pitchAdj - (playerFireT > 0 ? 0 : 0.2), Math.min(1, dt * 13));
    player.elbowR.rotation.x = lerp(player.elbowR.rotation.x, playerFireT > 0 ? 0 : 0.2, Math.min(1, dt * 13));
    if (curWeapon === 'rifle') {
      player.armL.rotation.x = lerp(player.armL.rotation.x, -Math.PI / 2 - 0.45, Math.min(1, dt * 11));
      player.elbowL.rotation.x = lerp(player.elbowL.rotation.x, 0.55, Math.min(1, dt * 11));
    }
  }
  wObj.rotation.x = lerp(wObj.rotation.x, (aiming || playerFireT > 0) ? Math.PI / 2 : restX, Math.min(1, dt * 12));
  wObj.rotation.y = Math.PI;
  wObj.position.y = lerp(wObj.position.y, (aiming || playerFireT > 0) ? aimY : restY, Math.min(1, dt * 12));
  wObj.position.z = lerp(wObj.position.z, (aiming || playerFireT > 0 ? aimZ : restZ) - kick, Math.min(1, dt * 14));
  if (playerFireT > 0) {
    playerFireT -= dt;
    if (fireTarget && !fireTarget.dead && !mounted) {
      const fx2 = fireTarget.g.position.x - player.g.position.x, fz2 = fireTarget.g.position.z - player.g.position.z;
      player.g.rotation.y = lerpAngle(player.g.rotation.y, Math.atan2(fx2, fz2), Math.min(1, dt * 12));
    }
  }
  if (reloading) {
    reloadT += dt;
    const k = Math.sin(clamp(reloadT / reloadDur, 0, 1) * Math.PI);
    wObj.rotation.z = k * 0.55;
    player.armR.rotation.x = lerp(player.armR.rotation.x, -1.1 - k * 0.25, Math.min(1, dt * 10));
    player.elbowR.rotation.x = lerp(player.elbowR.rotation.x, -1.0, Math.min(1, dt * 10));
    if (curWeapon === 'rifle') {
      player.armL.rotation.x = lerp(player.armL.rotation.x, -1.2, Math.min(1, dt * 10));
      player.elbowL.rotation.x = lerp(player.elbowL.rotation.x, -0.6, Math.min(1, dt * 10));
    }
    if (reloadT >= reloadDur) { reloading = false; setAmmo(magSize); wObj.rotation.z = 0; }
  } else if (wObj.rotation.z !== 0) {
    wObj.rotation.z = lerp(wObj.rotation.z, 0, Math.min(1, dt * 10));
  }

  updateHorse(dt);
  if (matchState === 'play') npcs.forEach(n => updateNPC(n, dt));
  if (!playerDead) blinkH(player, dt);
  if (active && (fireHold || shooting)) shoot();
  if (matchState === 'play' && wanted > 0) {
    wantedT -= dt;
    if (wantedT <= 0) { wanted--; wantedT = 16; }
  }
  if (playerDead) {
    player.fall = Math.min(1, player.fall + dt * 3);
    player.g.rotation.x = -player.fall * Math.PI / 2;
    // go limp rather than hitting the ground in a frozen pose
    const limp = Math.min(1, dt * 3.2);
    player.chest.rotation.x = lerp(player.chest.rotation.x, -0.12, limp);
    player.chest.rotation.y = lerp(player.chest.rotation.y, 0.1, limp);
    player.hips.rotation.set(0, 0, 0);
    player.hips.position.y = 0.72;
    player.armL.rotation.x = lerp(player.armL.rotation.x, 0.4, limp);
    player.armR.rotation.x = lerp(player.armR.rotation.x, 0.25, limp);
    player.elbowL.rotation.x = lerp(player.elbowL.rotation.x, -0.45, limp);
    player.elbowR.rotation.x = lerp(player.elbowR.rotation.x, -0.35, limp);
    player.kneeL.rotation.x = lerp(player.kneeL.rotation.x, 0.55, limp);
    player.kneeR.rotation.x = lerp(player.kneeR.rotation.x, 0.35, limp);
    player.ankleL.rotation.x = lerp(player.ankleL.rotation.x, 0.2, limp);
    player.head.rotation.z = lerp(player.head.rotation.z, 0.15, limp);
    aiming = false; shooting = false; fireHold = false;
  }

  // ---------------- pickups ----------------
  for (const p of pickups) {
    if (!p.g.visible) continue;
    p.phase += dt;
    const gy = heightAt(p.g.position.x, p.g.position.z);
    p.base = gy + 0.6;
    p.g.position.y = p.base + Math.sin(p.phase * 2) * 0.1;
    p.g.rotation.y += dt * 1.2;
    if (playerDead) continue;
    if (Math.hypot(p.g.position.x - player.g.position.x, p.g.position.z - player.g.position.z) < 1.35) {
      if (p.type === 'health') { if (hp < maxHp) { hp = Math.min(maxHp, hp + 1); p.g.visible = false; Sound.pickup(); feed('Picked up a bandage +1 health', 'good'); } }
      else if (p.type === 'ammo') { if (ammo < magSize) { setAmmo(magSize); p.g.visible = false; Sound.pickup(); } }
      else { addCash(15, p.g.position); cash += 0; p.g.visible = false; Sound.coin(); feed('Found $15', 'good'); }
    }
  }

  // ---------------- timers ----------------
  if (matchState === 'play' && !playerDead) {
    roundT -= dt;
    if (roundT <= 0) { roundT = 0; endRound('law', 'timeout'); }
  }
  // if the posse is still standing when the sand runs low, a tip comes in and
  // the sheriff is finally marked on the map
  if (matchState === 'play' && !sheriffRevealed && roundT < ROUND_TIME * 0.5) {
    const sh = npcs.find(n => n.isSheriff && !n.dead);
    if (sh) {
      sheriffRevealed = true;
      const b = Math.atan2(sh.g.position.x - player.g.position.x, -(sh.g.position.z - player.g.position.z));
      const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
      const dir = names[((Math.round(b / (Math.PI / 4)) % 8) + 8) % 8];
      feed('Bounty tip: the sheriff was seen to the ' + dir + ' \u2014 marked on your map', 'good');
      showObjective('SHERIFF SPOTTED', 'He is to the ' + dir + ' of you', 3000);
    }
  }
  dmgFlash = Math.max(0, dmgFlash - dt * 1.6);
  heartT -= dt;
  if (!playerDead && hp <= maxHp * 0.34 && matchState === 'play' && heartT <= 0) {
    heartT = 0.72;
    Sound.heart();
  }
  if (Sound && settings.quality > 0) Sound.ambientUpdate(nightF, dt);
  Sound.musicUpdate(matchState === 'play' && !playerDead ? Math.min(1, wanted / 4 + (roundT < 12 ? 0.3 : 0)) : 0.05);
  FX.update(dt);
  updateCasings(dt);
  // grass: wind clock plus the trample pads that follow whoever is walking
  const gt = clock.elapsedTime;
  for (let i = 0; i < grassShaders.length; i++) grassShaders[i].uniforms.uTime.value = gt;
  updateGrassPads(dt);

  // ---------------- camera ----------------
  // The view direction comes straight from yaw/pitch, so mouse look is always exactly
  // 1:1 with the crosshair. Terrain clamping, camera collision and screen shake only
  // move the camera along that direction - they can never twist the rotation.
  const focusY = mounted ? horse.g.position.y + 2.3 : player.g.position.y + 1.62 + aimAmt * 0.7;
  const fx3 = (mounted ? horse.g.position.x : player.g.position.x);
  const fz3 = (mounted ? horse.g.position.z : player.g.position.z);
  const shoulder = aimAmt * (mounted ? 0.32 : 0.62);
  const wantDist = (mounted ? 6.4 : 4.6) - aimAmt * (mounted ? 0.4 : 1.5);
  // rotational screen shake: jitter the view, never the stored yaw/pitch
  const vYaw = yaw + shake * rnd(-0.028, 0.028);
  const vPitch = clamp(pitch + shake * rnd(-0.024, 0.024), -1.32, 1.36);
  const vcp = Math.cos(vPitch);
  dirV.set(-Math.sin(vYaw) * vcp, -Math.sin(vPitch), -Math.cos(vYaw) * vcp).normalize();
  const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
  camRay.set(tmpV.set(fx3, focusY, fz3), backV.set(-dirV.x, -dirV.y, -dirV.z));
  camRay.far = wantDist + 0.8;
  const camHit = camRay.intersectObjects(solid, false)[0];
  const camWant = (camHit ? Math.max(0.9, camHit.distance - 0.32) : wantDist) / wantDist;
  // snap in hard when a wall appears, ease back out once it is clear
  camDistMul = lerp(camDistMul, camWant, Math.min(1, dt * (camWant < camDistMul ? 40 : 9)));
  const back = wantDist * camDistMul;
  const camX = fx3 - dirV.x * back + rightX * shoulder;
  let camY = focusY - dirV.y * back - aimAmt * 0.25;
  const camZ = fz3 - dirV.z * back + rightZ * shoulder;
  camY = Math.max(camY, heightAt(camX, camZ) + 0.45);
  camera.position.set(camX, camY, camZ);
  camera.lookAt(camX + dirV.x, camY + dirV.y, camZ + dirV.z);
  camera.fov = lerp(camera.fov, aiming ? 36 : (sprinting ? 76 : 70), Math.min(1, dt * 8));
  camera.updateProjectionMatrix();

  // ---------------- day / night ----------------
  if (matchState === 'play' && !paused && !shopOpen) dayTime = (dayTime + dt / DAY_LENGTH) % 1;
  const A = dayTime * Math.PI * 2;
  const sunEl = Math.sin(A);
  const d = Math.max(0, sunEl), n = Math.max(0, -sunEl);
  const tw = Math.max(0, 1 - Math.abs(sunEl) * 4);
  const sx = Math.cos(A) * 80, sy = sunEl * 90, sz = 40;
  sun.position.set(pos.x + sx, Math.max(5, sy), pos.z + sz);
  sun.target.position.set(pos.x, 0, pos.z);
  sun.intensity = 1.72 * d + 0.68 * tw;
  cSunC.set(0xffe9c4).lerp(C_TWIL, tw * 0.9);
  sun.color.copy(cSunC).convertSRGBToLinear();
  moon.position.set(pos.x - sx, Math.max(20, -sy), pos.z - sz);
  moon.target.position.set(pos.x, 0, pos.z);
  moon.intensity = 0.58 * n;
  if (sunEl >= 0) { cSky.copy(C_DAY).lerp(C_TWIL, tw * 0.85); cZen.copy(C_ZEND).lerp(C_TWIL, tw * 0.85); }
  else { cSky.copy(C_NIGHT).lerp(C_TWIL, tw * 0.75); cZen.copy(C_NIGHTZ).lerp(C_TWIL, tw * 0.7); }
  // The filmic curve sits on top of everything, so the sky is fed in a little
  // brighter than authored and fog uses the exact same value - that keeps the
  // horizon seamless after tonemapping.
  C_SKYB.copy(cSky).multiplyScalar(1.12);
  skyU.uHorizon.value.copy(C_SKYB).convertSRGBToLinear();
  skyU.uZenith.value.copy(cZen).convertSRGBToLinear();
  skyU.uGround.value.copy(C_SKYB).lerp(C_AMB_NIGHT, 0.75).convertSRGBToLinear();
  skyU.uSunCol.value.copy(cSunC).convertSRGBToLinear();
  skyU.uSunDir.value.copy(vDir);
  skyU.uNight.value = n;
  // water reads the same sky and sun the dome does, so lakes go gold at dusk
  // and navy at night along with everything else
  const wtime = clock.elapsedTime;
  for (let i = 0; i < waterMats.length; i++) {
    const u = waterMats[i].uniforms;
    u.uTime.value = wtime;
    u.uSky.value.copy(C_SKYB).convertSRGBToLinear();
    u.uSunDir.value.copy(vDir);
    u.uSunCol.value.copy(cSunC).convertSRGBToLinear();
    u.uNight.value = n;
  }
  scene.fog.color.copy(C_SKYB).convertSRGBToLinear();
  scene.fog.near = 95 - 60 * n;
  scene.fog.far = 340 - 190 * n;
  skyDome.position.set(pos.x, 0, pos.z);
  envTimer -= dt;
  if (envTimer <= 0) { envTimer = 3.5; bakeEnvironment(C_SKYB, vDir, n); }
  nightF = n;
  windows.forEach(w => {
    const on = w.on && n > 0.25;
    w.m.emissive.setRGB(on ? 0.55 : 0, on ? 0.38 : 0, on ? 0.15 : 0);
  });
  const lf = performance.now() * 0.001;
  lamps.forEach(l => {
    const on = n > 0.15;
    const tk = on ? 0.95 + Math.sin(lf * 13 + l.f) * 0.06 + Math.sin(lf * 29 + l.f * 2) * 0.04 : 0;
    l.light.intensity = tk;
    l.m.emissive.setRGB(on ? 0.7 : 0, on ? 0.45 : 0, on ? 0.15 : 0);
  });
  hemi.intensity = 0.26 * d + 0.16 * tw + 0.10 * n;
  // the ridge line is unlit, so it dims on its own schedule: full daylight,
  // moonlit silhouette, and a touch of blue in the dark
  const mb = d + 0.42 * tw + 0.22 * n;
  // at low sun the peaks should catch the same warm light as the sky instead of
  // staying cold blue against an orange horizon
  const warm = tw * 0.7;
  const mr = mb * (0.94 + 0.50 * warm), mg = mb * (0.98 + 0.16 * warm), mbl = Math.min(1, mb * (1.12 - 0.52 * warm));
  for (let i = 0; i < mtnMats.length; i++) mtnMats[i].color.setRGB(mr, mg, mbl);
  // the sky signature is unlit too, so it must not read as a neon sign at night
  const sb = 0.34 + 0.66 * (d + 0.6 * tw);
  skyText.material.color.setRGB(sb, sb, sb);
  // Clouds lose their key light with the sun, and the warm environment bake is all
  // that is left holding them up - which turned them into brown smudges against a
  // black sky. A weak cool emissive keeps them reading as moonlit cloud instead.
  const cl = 0.012 + 0.062 * n + 0.022 * tw;
  cloudMat.emissive.setRGB(cl * 0.80, cl * 0.90, cl * 1.30);
  ambient.intensity = 0.10 * d + 0.065 * tw + 0.048 * n;
  cAmb.set(0xcfd8e6).lerp(C_TWIL, tw * 0.7).lerp(C_AMB_NIGHT, n * 0.7);
  ambient.color.copy(cAmb);
  vDir.set(sx, sy, sz).normalize();
  sunBall.position.set(pos.x + vDir.x * 260, vDir.y * 260, pos.z + vDir.z * 260);
  sunBall.visible = sunEl > -0.06;
  sunGlow.position.copy(sunBall.position);
  sunGlow.visible = sunEl > -0.12;
  sunGlow.material.opacity = clamp(0.35 + d * 0.65, 0, 1);
  moonBall.position.set(pos.x - vDir.x * 260, Math.max(15, -vDir.y) * 260, pos.z - vDir.z * 260);
  moonBall.visible = sunEl < 0.06;
  moonGlow.position.copy(moonBall.position);
  moonGlow.visible = sunEl < 0.1;
  moonGlow.material.opacity = clamp(0.3 + n * 0.55, 0, 1);
  stars.position.set(pos.x, 0, pos.z);
  stars.material.opacity = Math.min(1, n * 1.5);
  campGlow.position.set(fire.pos.x, fire.pos.y + 1.1, fire.pos.z);
  campGlow.intensity = 0.4 + n * 1.3;

  skyText.position.y = 62 + Math.sin(t * 0.5) * 1.2;
  skyText.lookAt(camera.position);
  clouds.forEach(c => {
    c.position.x += dt * 1.6;
    if (c.position.x > 260) c.position.x = -260;
  });
  smokePuffs.forEach(s => {
    s.userData.t += dt * s.userData.spd;
    if (s.userData.t > 1) s.userData.t -= 1;
    const k = s.userData.t, src = s.userData.src;
    s.position.set(src.x + k * 1.4 + Math.sin(k * 6 + s.userData.spd * 9) * 0.18, src.y + k * 4.5, src.z + k * 0.5);
    s.scale.setScalar(0.4 + k * 1.9);
    s.material.opacity = 0.3 * (1 - k);
  });
  birds.forEach(b => {
    b.g.visible = nightF < 0.6;
    b.t += dt;
    const a = b.t * 0.15 + b.o;
    b.g.position.set(Math.cos(a) * b.r + b.cx, b.h + Math.sin(b.t * 0.7 + b.o) * 1.5, Math.sin(a) * b.r + b.cz);
    b.g.rotation.y = Math.PI / 2 - a;
    const f = Math.sin(b.t * 9 + b.o) * 0.7;
    b.wl.rotation.z = f;
    b.wr.rotation.z = -f;
  });
  fire.phase += dt;
  const fp = fire.phase;
  for (let i = 0; i < fire.flames.length; i++) fire.flames[i].uniforms.uTime.value = fp;
  // the logs pulse: burning cracks flare and settle on their own rhythm
  fire.logMat.emissiveIntensity = 0.55 + Math.sin(fp * 5.3) * 0.18 + Math.sin(fp * 13.7) * 0.1 + Math.sin(fp * 31.0) * 0.05;
  fire.emberMats.forEach(e => {
    const k = 0.35 + 0.65 * Math.max(0, Math.sin(fp * 2.3 + e.seed) * 0.5 + 0.5 + Math.sin(fp * 7.1 + e.seed) * 0.25);
    e.m.color.setRGB(k, k * 0.34, k * 0.08);
  });
  fire.core.opacity = 0.42 + Math.sin(fp * 8.5) * 0.07 + Math.sin(fp * 21.0) * 0.04;
  fire.light.intensity = 1.5 + Math.sin(fp * 11) * 0.28 + Math.sin(fp * 29) * 0.16 + Math.sin(fp * 53) * 0.07;
  if (settings.quality > 0) {
    // embers lifting off the fire
    if (Math.random() < dt * 9) {
      FX.emit(FX.glow, {
        x: fire.pos.x + rnd(-0.22, 0.22), y: fire.pos.y + rnd(0.45, 1.1), z: fire.pos.z + rnd(-0.22, 0.22),
        vx: rnd(-0.35, 0.35), vy: rnd(0.8, 2.2), vz: rnd(-0.35, 0.35),
        color: new THREE.Color(rnd(0, 1) < 0.5 ? 0xffa030 : 0xffd060),
        life: rnd(0.6, 1.5), size: rnd(0.04, 0.1), gravity: 0.8, drag: 1.1, alpha: 0.95
      });
    }
    // smoke rolling off the top
    if (Math.random() < dt * 6) {
      FX.emit(FX.dust, {
        x: fire.pos.x + rnd(-0.25, 0.25), y: fire.pos.y + rnd(1.05, 1.5), z: fire.pos.z + rnd(-0.25, 0.25),
        vx: rnd(-0.25, 0.25), vy: rnd(0.55, 1.15), vz: rnd(-0.25, 0.25),
        color: new THREE.Color(rnd(0, 1) < 0.5 ? 0x37312c : 0x4a423a),
        life: rnd(1.4, 2.8), size: rnd(0.22, 0.4), gravity: 0.12, drag: 0.7, grow: 0.85, alpha: 0.34
      });
    }
  }

  for (const tu of tumble) {
    tu.life -= dt;
    tu.x += tu.vx * dt;
    tu.z += tu.vz * dt;
    if (Math.abs(tu.x) > 145 || Math.abs(tu.z) > 145 || tu.life <= 0) {
      tu.x = clamp(pos.x + rnd(-70, 70), -140, 140);
      tu.z = clamp(pos.z + rnd(-70, 70), -140, 140);
      tu.vx = rnd(-4, 4); tu.vz = rnd(-4, 4);
      tu.life = rnd(6, 22);
    }
    if (collide(tu.x, tu.z)) { tu.vx = -tu.vx; tu.vz = -tu.vz; }
    tu.m.position.set(tu.x, heightAt(tu.x, tu.z) + 0.42, tu.z);
    tu.m.rotation.x += tu.spin * dt * 0.7;
    tu.m.rotation.z += tu.spin * dt;
  }

  for (const b of bloodPools) {
    const u = b.userData;
    if (u.dot) continue;
    u.grow = Math.min(u.grow + dt * 0.6, u.target);
    b.scale.setScalar(u.grow);
  }
  for (let i = tracers.length - 1; i >= 0; i--) {
    const tr = tracers[i];
    tr.life -= dt;
    if (tr.life <= 0) {
      scene.remove(tr.m);
      tr.m.material.dispose();
      tr.m.geometry.dispose();
      tracers.splice(i, 1);
    } else {
      tr.m.material.opacity = 0.85 * (tr.life / tr.max);
    }
  }
  if (storeMarker) {
    storeMarker.rotation.y += dt * 1.1;
    storeMarker.position.y = heightAt(STORE.x, STORE.z) + 4.4 + Math.sin(t * 1.8) * 0.18;
    storeMarker.visible = matchState === 'play';
  }
    // Contextual touch action: STORE when standing at the store, MOUNT / DISMOUNT
    // when beside the horse. One pill instead of two fixed buttons, and it is only
    // ever shown when the action actually applies.
    if (btnContext) {
      const atStore = nearStore();
      const besideHorse = player.g.position.distanceTo(horse.g.position) < 3.8;
      const action = atStore ? 'shop' : (besideHorse ? 'mount' : '');
      if (action && matchState === 'play') {
        btnContext.dataset.action = action;
        ctxLabel.textContent = atStore ? 'OPEN STORE' : (mounted ? 'DISMOUNT' : 'MOUNT HORSE');
        btnContext.classList.add('on');
      } else {
        btnContext.classList.remove('on');
      }
    }

  updateHUD(dt);
  if (frame % 2 === 0) drawMinimap();
  Post.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  Post.setSize(innerWidth, innerHeight);
});

// bring the finished world into the linear working space, then light it
linearizeMaterials(scene);
bakeEnvironment(C_DAY, vDir.set(0.6, 0.5, 0.4).normalize(), 0);
applyQuality();
refreshHearts();
drawMinimap();
animate();
