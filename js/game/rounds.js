/* ==========================================================================
   The Wild West - js/game/rounds.js
   Round and match flow: start, end, scoring and respawns.
   Provides:  startRound, endRound, nextAfterEnd, startMatch
   Expects:   npcs, state.js, shop.js, dom.js (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
function endRound(who, reason) {
  if (matchState !== 'play') return;
  matchState = 'over';
  aiming = false; shooting = false;
  if (who === 'outlaw') { outlawPts++; survivedRounds++; cash += 25; }
  else lawPts++;
  Sound.stinger(who === 'outlaw');
  Mode.set(MODE.OVER);
  // no side job survives the end of a round: the next round brings its own
  Missions.abortAll('round ended');
  Bus.emit('round:end', { who, reason, outlaws: outlawPts, law: lawPts, round: roundNum });
  // the round boundary is the checkpoint: score, cash and upgrades are all final
  // by this line, and the player is standing somewhere safe
  Save.autosave();
  const matchOver = outlawPts >= WIN_PTS || lawPts >= WIN_PTS;
  // Release the pointer before showing the card. While the pointer is locked every
  // mouse event is delivered to the canvas, so a player on desktop could not click
  // "tap to continue" at all until they thought to press Esc first. The store and
  // the pause menu already do this for their own overlays.
  if (document.pointerLockElement) document.exitPointerLock();
  if (reason === 'dead') {
    // the death card is already on screen: write the result onto it instead of
    // stacking a second overlay on top and overprinting the two
    deadSub.textContent = 'The law takes the round  \u00b7  Outlaws ' + outlawPts + ' \u2014 ' + lawPts + ' Law  \u00b7  tap to continue';
    if (matchOver) {
      deadTitle.textContent = outlawPts >= WIN_PTS ? 'THE OUTLAWS WIN!' : 'THE LAW PREVAILS!';
      deadSub.textContent = 'Final ' + outlawPts + ' \u2014 ' + lawPts + '  \u00b7  tap for a new match';
    }
    return;
  }
  if (matchOver) {
    showRoundEnd(outlawPts >= WIN_PTS ? 'THE OUTLAWS WIN!' : 'THE LAW PREVAILS!',
      'Final ' + outlawPts + ' - ' + lawPts + '  \u00b7  Kills ' + kills + '  \u00b7  Headshots ' + headshots + '  \u00b7  tap for a new match');
  } else {
    const t = who === 'outlaw' ? 'SHERIFF DOWN \u2014 OUTLAWS SCORE' : (reason === 'timeout' ? 'TIME UP \u2014 THE LAW SCORES' : 'THE LAW TAKES THE ROUND');
    showRoundEnd(t, 'Outlaws ' + outlawPts + ' \u2014 ' + lawPts + ' Law  \u00b7  tap for round ' + Math.min(MAX_ROUNDS, roundNum + 1));
  }
}
function clearFight() {
  while (bloodPools.length) scene.remove(bloodPools.pop());
  while (decals.length) scene.remove(decals.pop());
  splats.forEach(s => s.parent && s.parent.remove(s));
  splats.length = 0;
  casings.forEach(c => scene.remove(c.m));
  casings.length = 0;
  FX.clear();
}
function startRound() {
  matchState = 'play';
  reEl.classList.remove('show');
  deadEl.classList.remove('show');
  // the one author of the frozen flags: this also clears paused and shopOpen
  Mode.set(MODE.PLAYING);
  pauseEl.classList.remove('show');
  roundT = ROUND_TIME;
  playerDead = false;
  maxHp = maxHpNow();
  hp = maxHp;
  refreshHearts();
  zoneT = 0;
  sinceDmg = 99;
  reloading = false; reloadT = 0;
  playerWeapons[curWeapon].ammo = magFor(curWeapon);
  syncWeapon();
  wanted = 0; wantedT = 0; wantedKills = 0;
  stam = maxStam; stamLock = false;
  vy = 0; grounded = true;
  player.fall = 0; player.dead = false;
  player.g.position.set(0, heightAt(0, 0), 0);
  player.g.rotation.set(0, 0, 0);
  resetHumanAnim(player);
  player.gun.visible = false;
  if (mounted) { mounted = false; showPlayerLegs(true); }
  horse.g.position.set(3, heightAt(3, 1.5), 1.5);
  horse.g.rotation.y = 2.5;
  horse.speed = 0; horse.airY = 0;
  yaw = 0; pitch = 0.14;
  pistol.rotation.set(1.22, Math.PI, 0);
  pistol.position.set(0, -0.358, 0.066);
  rifleModel.rotation.set(1.5, Math.PI, 0);
  rifleModel.position.set(0, -0.3, 0.12);
  drawWeapons();
  clearFight();
  // The posse is exactly what this difficulty says it is: rebuilt here so a change of level
  // takes effect from the next round, and so a round never starts short-handed.
  spawnGarrison();
  // every round the whole town is reshuffled, so the sheriff has to be hunted down again
  scatterNpcs();
  sheriffRevealed = false;
  npcs.forEach(n => {
    n.dead = false; n.fall = 0;
    n.deathTwist = undefined; n.deathRoll = undefined; n.deathArm = undefined;
    n.hp = Difficulty.foeHp(n.archetype === 'sheriff' ? ARCH.sheriff.hp + Math.min(5, roundNum - 1) : ARCH[n.archetype].hp + Math.floor((roundNum - 1) / 2));
    n.g.position.set(n.spawn.x, n.spawn.y, n.spawn.z);
    n.g.rotation.set(0, n.spawn.rot, 0);
    resetHumanAnim(n);
    n.gun.visible = !n.civil;
  });
  pickups.forEach(p => { p.g.visible = true; });
  // A reshuffled town is a town that has not seen you yet: without this, lawmen kept
  // last round's suspicion and opened fire the moment a round began.
  if (typeof Perceive === 'object') {
    npcs.forEach(n => { Perceive.forget(n); n.hitT = 0; n.ai = null; n.searchT = 0; n.coverT = 0; n.cover = null; n.squadRole = 'advance'; });
    if (typeof Squads === 'object') Squads.squads.forEach(sq => { sq.contact = null; sq.order = 'hold'; sq.orderT = 0; });
  }
  // The round's objectives, banner and rewards belong to the mission layer now:
  // rounds.js keeps the match skeleton (rounds, score, respawns, the clock) and
  // Missions decides what this round is actually about.
  Missions.beginRound(roundNum);
  // the town forgets who was chasing whom, but the record against you stands
  if (typeof Witnesses === 'object') Witnesses.clear();
  // the manhunt starts over, the bounty on the books does not
  if (typeof Law === 'object') Law.beginRound();
  feed('Round ' + roundNum + ' \u2014 the sheriff could be anywhere in town', '');
  Bus.emit('round:start', { round: roundNum, outlaws: outlawPts, law: lawPts });
}
function nextAfterEnd() {
  if (matchState === 'intro') { startMatch(); return; }
  if (matchState !== 'over') return;
  if (outlawPts >= WIN_PTS || lawPts >= WIN_PTS) {
    outlawPts = 0; lawPts = 0; roundNum = 1;
    cash = 0; kills = 0; headshots = 0; totalKills = 0; survivedRounds = 0;
    upgrades.mag = 0; upgrades.hp = 0; upgrades.reload = 0; upgrades.steady = 0; upgrades.rifle = 0;
    playerWeapons.rifle.owned = false; playerWeapons.rifle.ammo = 0;
    curWeapon = 'revolver';
    maxHp = maxHpNow(); refreshHearts();
    showObjective('NEW MATCH', 'Upgrades and cash have been reset', 3000);
  } else {
    roundNum = Math.min(MAX_ROUNDS, roundNum + 1);
  }
  startRound();
  Save.autosave();
}
function startMatch() {
  Sound.resume();
  Sound.ambientStart();
  Sound.musicStart();
  startEl.classList.remove('show');
  if (!isTouch) requestLock();
  startRound();
  // a fresh run gets a checkpoint straight away, so CONTINUE always has one
  Save.autosave();
}
reEl.addEventListener('click', e => { e.stopPropagation(); nextAfterEnd(); });

