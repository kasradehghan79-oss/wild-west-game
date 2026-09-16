/* ==========================================================================
   The Wild West - js/entities/shooting.js
   The player's attacks: the gunshot (hitscan, penetration, impacts, blood, recoil)
   and the knife, which shares the wound path so both have the same consequences.
   Provides:  shoot, hurtHuman, meleeAttack, canAssassinate, ray
   Expects:   player, npcs, FX, Sound, decals (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- shooting ----------
const ray = new THREE.Raycaster();
const losRay = new THREE.Raycaster();
const losDir = new THREE.Vector3();
const gunObj = () => (curWeapon === 'rifle' ? rifleModel : pistol);

// ---------------------------------------------------------------- wounds
// Every wound in the game goes through here, bullet or blade. One place is what makes
// the consequences consistent: the man who was hurt knows roughly who did it and from
// where, the county only hears about it if somebody saw, and a death is a death whatever
// caused it. Note what is *not* here: the wanted level. That belongs to the law system,
// which derives it from the crimes it is told about - so a kill nobody witnessed leaves
// no trace at all, which is exactly what makes a knife worth carrying.
function hurtHuman(h, opts) {
  const o = opts || {};
  const isHead = !!o.isHead;
  // raw means the caller has already decided the number: a knife is lethal by rule
  // rather than by damage, so difficulty must not scale it a second time
  const dmg = o.raw ? (o.dmg || 0) : Difficulty.playerDmg(o.dmg || 0);
  if (isHead) headshots++;
  const wasAlive = h.hp > 0;
  h.hp -= dmg;
  // being hurt settles the question of who the enemy is: he is looking, and he knows
  // roughly where it came from, even if it came from behind
  h.hitT = 6;
  h.susp = 1;
  h.sees = true;
  h.lastKnown = { x: player.g.position.x, z: player.g.position.z, age: 0 };
  if (h.ai && (h.ai.state === 'wander' || h.ai.state === 'work')) h.ai.state = 'combat';
  if (h.isSheriff) {
    h.shots++;
    // it takes two hits before the star is uncovered - only then is he marked
    if (h.shots >= 2) {
      if (h.badge) h.badge.visible = true;
      if (!sheriffRevealed) {
        sheriffRevealed = true;
        feed('The star came loose \u2014 he is the sheriff, marked on your map', 'good');
      }
    }
  }
  // A backstab is not a wound, it is a death: the murder case below covers it, and a man
  // taken from behind never gets to shout about it.
  if (!o.assassinate) {
    Witnesses.witnessed('assault', h.g.position.x, h.g.position.z, { victim: h, silent: true });
  }
  if (o.object && o.hitPoint) {
    const nrm = o.normal || new THREE.Vector3(0, 1, 0);
    addSplat(o.object, o.hitPoint, nrm, o.assassinate ? 0.09 : rnd(0.05, 0.1));
    FX.impact(o.hitPoint, nrm, 'flesh');
    FX.blood(o.hitPoint, o.dir || new THREE.Vector3(0, 0, 1), isHead ? 22 : 12);
    if (!o.assassinate) {
      damageNumber(o.hitPoint, isHead ? (Math.round(dmg * 10) / 10) + ' HEAD' : String(Math.round(dmg * 10) / 10), isHead ? 'head' : '');
    }
    Sound.hit(isHead ? 'head' : 'flesh');
  }
  if (h.hp <= 0 && wasAlive) {
    h.dead = true;
    kills++; totalKills++;
    // the one place a person dies: missions, the law system and the audio director all
    // hang off this
    Bus.emit('npc:died', {
      npc: h, headshot: isHead, civilian: !!h.civil,
      archetype: h.archetype, byPlayer: true, assassination: !!o.assassinate
    });
    // murder, or the one crime the county never forgives. It only reaches the law if
    // somebody saw it, which is what makes silencing a witness worth trying.
    Witnesses.witnessed(
      h.civil ? 'murder'
        : (h.archetype === 'sheriff' || h.archetype === 'deputy' || h.archetype === 'rifleman' || h.archetype === 'shotgunner' ? 'lawman' : 'murder'),
      h.g.position.x, h.g.position.z, { victim: h }
    );
    spawnBloodPool(h.g.position);
    const A = ARCH[h.archetype];
    const bounty = A.bounty * (isHead ? 1.5 : 1);
    if (h.civil) {
      addCash(-15, h.g.position);
      feed('CIVILIAN KILLED \u2014 bounty cut', 'bad');
      hitmark('kill');
    } else {
      addCash(Math.round(bounty), h.g.position);
      Sound.coin();
      hitmark('kill');
      feed('Killed ' + A.name + (isHead ? ' \u2014 headshot' : '') + '  +$' + Math.round(bounty), 'good');
      // Dead lawmen still count, but the wanted level itself belongs to the law system
      // now: it escalates from the record it has on you, not from a counter.
      wantedKills++;
      if (wantedKills >= 2) {
        wantedKills = 0;
        Sound.whistle();
        showObjective('THE POSSE IS OUT', 'Lawmen are flooding the streets \u2014 stay sharp', 2600);
      }
      if (h.isSheriff) endRound('outlaw');
    }
  } else if (h.hp > 0) {
    hitmark(isHead ? 'head' : 'hit');
  }
  return wasAlive && h.hp <= 0;
}

// ---------------------------------------------------------------- the knife
// Any man within arm's reach and roughly in front of the player. The knife is a weapon
// first: it works on anyone, not only on backs.
function nearestInReach(reach) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);           // where the player faces
  let best = null, bd = reach, bdist = Infinity;
  for (const n of npcs) {
    if (n.dead) continue;
    const dx = n.g.position.x - player.g.position.x, dz = n.g.position.z - player.g.position.z;
    const d = Math.hypot(dx, dz);
    if (d > bd) continue;
    if (d > 0.01 && (dx * fx + dz * fz) / d < 0.35) continue;  // roughly in front of you
    bd = d; bdist = d; best = n;
  }
  return best ? { npc: best, d: bdist } : null;
}
// A man who has not seen you, with his back to you, close enough to reach. That - and
// only that - is what makes a silent kill possible.
function canAssassinate(target, reach) {
  if (!target) return false;
  if (target.sees || (target.susp || 0) >= 0.34) return false;
  const toUs = Math.atan2(player.g.position.x - target.g.position.x, player.g.position.z - target.g.position.z);
  let off = toUs - target.g.rotation.y;
  off = Math.atan2(Math.sin(off), Math.cos(off));
  return Math.abs(off) > 1.9;
}
// Starting a swing does not resolve it. The blow lands partway through the animation, at
// the moment that reads as the impact, which is the difference between an attack that
// looks like a knife and one that looks like a number going down.
function meleeAttack() {
  const W = WEAPONS[curWeapon];
  knifeSwingT = 0;
  knifeSwingHit = false;
  Sound.dry();                                    // the blade leaving its sheath
  playerFireT = W.swing * 0.5;
}

// Resolve the blow, at the impact frame. Distance, facing and awareness are read *now*,
// not when the button went down: a man who has stepped back out of reach is not stabbed.
function resolveKnifeHit() {
  const W = WEAPONS[curWeapon];
  const found = nearestInReach(W.reach);
  if (!found) return false;
  const target = found.npc;
  const dx = player.g.position.x - target.g.position.x, dz = player.g.position.z - target.g.position.z;
  const dd = Math.max(0.001, Math.hypot(dx, dz));
  const dir = new THREE.Vector3(dx / dd, 0, dz / dd);
  const hitPoint = new THREE.Vector3(target.g.position.x, target.g.position.y + 1.15, target.g.position.z)
    .addScaledVector(dir, -0.2);
  const opts = { object: target.torso, hitPoint, normal: dir.clone().negate(), dir, isHead: false };

  // From behind and unnoticed it is silent, and the record stays clean whatever follows:
  // no shot, no shout, no noise, unless somebody else was watching.
  const backstab = found.d <= W.backstab && canAssassinate(target, W.backstab);

  // A knife kills any man in one blow. The sheriff is the single exception, because he is
  // the round's target: he takes two, and the first one shows on him.
  const need = target.isSheriff ? W.sheriffHits : 1;
  target.knifeHits = (target.knifeHits || 0) + 1;
  const kills = target.knifeHits >= need;
  const dmg = kills ? target.hp + 1 : Math.max(1, target.hp * 0.35);

  if (!backstab) Perceive.noise(player.g.position.x, player.g.position.z, 11, 'stab');
  hurtHuman(target, Object.assign({}, opts, {
    dmg,
    raw: true,                                    // the number is decided above, not scaled
    silent: backstab,
    assassinate: backstab
  }));
  addShake(backstab ? 0.05 : 0.07);
  if (backstab && target.dead) feed('Taken silently \u2014 nobody heard a thing', 'good');
  else if (target.isSheriff && !target.dead) {
    feed('The sheriff is wounded \u2014 finish him', 'bad');
  }
  return true;
}

function shoot() {
  if (playerDead || matchState !== 'play' || paused || shopOpen) return;
  const W = WEAPONS[curWeapon];
  const now = performance.now();
  // The knife comes first, and deliberately so: it has no rounds to run out of, and a
  // melee swing should not be blocked by the gun in the other hand being reloaded.
  if (W.melee) {
    if (now - lastShot < W.rate) return;
    lastShot = now;
    meleeAttack();
    return;
  }
  if (now - lastShot < W.rate) return;
  if (ammo <= 0) {
    if (now - lastDry > 260) { lastDry = now; Sound.dry(); startReload(); }
    return;
  }
  lastShot = now;
  setAmmo(ammo - 1);
  const wObj = gunObj();
  const gdir = new THREE.Vector3();
  camera.getWorldDirection(gdir);
  const gpos = new THREE.Vector3();
  wObj.getWorldPosition(gpos);
  const flash = curWeapon === 'rifle' ? muzzleR : muzzle;
  flash.visible = true;
  // a flash that is a different shape every shot, plus a barrel light so the
  // blast actually lights the gun and the ground in front of you
  flash.scale.set(rnd(0.8, 1.7), rnd(0.7, 1.4), rnd(1.0, 2.2));
  flash.rotation.z = rnd(0, TAU);
  muzzleLight.position.copy(gpos);
  muzzleLight.intensity = curWeapon === 'rifle' ? 5.5 : 3.6;
  muzzleLight.distance = curWeapon === 'rifle' ? 16 : 11;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flash.visible = false;
    muzzleLight.intensity = 0;
  }, curWeapon === 'rifle' ? 60 : 70);
  recoilKick = Math.min(0.24, recoilKick + W.recoil);
  bloom = Math.min(1.8, bloom + W.bloom * 0.42);
  addShake(curWeapon === 'rifle' ? 0.16 : 0.1);
  Sound.shoot(W.sound);
  // A gunshot carries. Everyone inside earshot turns towards it, and a lawman close
  // enough works out roughly where it came from without seeing the muzzle flash -
  // which is what makes shooting from cover a decision rather than a free action.
  playerShotT = 3;
  Perceive.noise(player.g.position.x, player.g.position.z, 42, 'shot');
  // Public gunfire is a crime when somebody sees it, and the law only hears about it
  // once per burst rather than once per round.
  if (clock.elapsedTime - (lastGunCrime || -99) > 8) {
    lastGunCrime = clock.elapsedTime;
    Witnesses.witnessed('gunfire', player.g.position.x, player.g.position.z, { silent: true });
  }
  FX.impact(gpos.clone().addScaledVector(gdir, curWeapon === 'rifle' ? 0.62 : 0.26), gdir, 'muzzle');
  ejectCasing(gpos.clone().add(new THREE.Vector3(rnd(-0.05, 0.05), 0.02, rnd(-0.05, 0.05))), gdir);
  const spread = (aiming ? W.ads : W.spread) * spreadMult() * (mounted ? 1.7 : 1) * (1 + bloom) * (runT > 0 ? 1.4 : 1);
  const dir = gdir.clone();
  dir.x += rnd(-1, 1) * spread;
  dir.y += rnd(-1, 1) * spread;
  dir.z += rnd(-1, 1) * spread;
  dir.normalize();
  const origin = camera.position.clone().addScaledVector(dir, 0.35);
  ray.set(origin, dir);
  ray.far = 400;
  // The muzzle of the ray is the camera, which on foot is 4.6m behind the player and on
  // horseback 6.4m behind the horse. Two things follow, and both were wrong before:
  //   - anything nearer than the player is behind him, so it must not be hit (a shot
  //     forward used to be able to hit a fence, or a man, standing at your back)
  //   - the horse you are riding sits between the camera and everything else, so its neck
  //     stopped every shot the moment you fired from the saddle
  const minDist = camera.position.distanceTo(player.g.position) - 0.5;
  const hits = ray.intersectObjects(shootables, false)
    .filter(h => {
      const u = h.object.userData;
      if (u.human && u.human.isPlayer) return false;
      if (u.horse && mounted) return false;
      return h.distance >= minDist;
    });
  let end = origin.clone().addScaledVector(dir, 300);
  lastShotEnd = end;
  let hitTarget = null;
  if (hits.length) {
    const h0 = hits[0];
    end = h0.point.clone();
    const o = h0.object;
    const h = o.userData.human;
    const normal = h0.face ? h0.face.normal.clone().transformDirection(o.matrixWorld) : dir.clone();
    if (h && !h.isPlayer) {
      hitTarget = h;
      const headP = new THREE.Vector3();
      h.head.getWorldPosition(headP);
      const isHead = h0.point.distanceTo(headP) < 0.34 * h.g.scale.y;
      hurtHuman(h, {
        dmg: W.dmg * (isHead ? W.head : 1),
        isHead,
        object: o,
        hitPoint: end,
        normal,
        dir,
        silent: false
      });
    } else if (o.userData.horse) {
      addSplat(o, end, normal, rnd(0.04, 0.08));
      FX.impact(end, normal, 'flesh');
      FX.blood(end, dir, 8);
      Sound.hit('flesh');
      hitmark('hit');
    } else {
      addDecal(end, normal, 0xffffff, rnd(0.055, 0.1));
      FX.impact(end, normal, o.geometry && o.geometry.type === 'BoxGeometry' && Math.random() < 0.5 ? 'wood' : 'dirt');
      Sound.hit('dirt');
    }
  }
  let ft = hitTarget;
  if (!ft) {
    const vx = -Math.sin(yaw), vz = -Math.cos(yaw);
    let bd = Infinity;
    for (const c of npcs) {
      if (c.dead || c.civil) continue;
      const dx = c.g.position.x - player.g.position.x, dz = c.g.position.z - player.g.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5 || d > 60 || d >= bd) continue;
      if ((dx * vx + dz * vz) / d < 0.9) continue;
      bd = d; ft = c;
    }
  }
  if (ft) { playerFireT = 0.3; fireTarget = ft; }
  const from = new THREE.Vector3();
  wObj.getWorldPosition(from);
  addTracer(from, end);
}

