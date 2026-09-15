/* ==========================================================================
   The Wild West - js/entities/shooting.js
   The player shot: hitscan, penetration, impacts, blood, damage and recoil.
   Provides:  shoot, ray
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
function shoot() {
  if (playerDead || matchState !== 'play' || paused || shopOpen) return;
  const W = WEAPONS[curWeapon];
  const now = performance.now();
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
  const hits = ray.intersectObjects(shootables, false)
    .filter(h => { const u = h.object.userData.human; return !(u && u.isPlayer); });
  let end = origin.clone().addScaledVector(dir, 300);
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
      if (isHead) headshots++;
      const dmg = W.dmg * (isHead ? W.head : 1);
      const wasAlive = h.hp > 0;
      h.hp -= dmg;
      if (wanted === 0) { wanted = 1; wantedT = 16; Sound.whistle(); }
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
      addSplat(o, end, normal, rnd(0.05, 0.1));
      FX.impact(end, normal, 'flesh');
      FX.blood(end, dir, isHead ? 22 : 12);
      damageNumber(end, isHead ? (Math.round(dmg * 10) / 10) + ' HEAD' : String(Math.round(dmg * 10) / 10), isHead ? 'head' : '');
      Sound.hit(isHead ? 'head' : 'flesh');
      if (h.hp <= 0 && wasAlive) {
        h.dead = true;
        kills++; totalKills++;
        spawnBloodPool(h.g.position);
        const A = ARCH[h.archetype];
        const bounty = A.bounty * (isHead ? 1.5 : 1);
        if (h.civil) {
          wanted = Math.min(5, wanted + 2); wantedT = 20;
          addCash(-15, h.g.position);
          feed('CIVILIAN KILLED \u2014 wanted level up, bounty cut', 'bad');
          hitmark('kill');
        } else {
          addCash(Math.round(bounty), h.g.position);
          Sound.coin();
          hitmark('kill');
          feed('Killed ' + A.name + (isHead ? ' \u2014 headshot' : '') + '  +$' + Math.round(bounty), 'good');
          wantedKills++;
          if (wantedKills >= 2) {
            if (wanted < 5) { wanted++; wantedT = 16; }
            Sound.whistle();
            spawnReinforcement(wanted >= 3 && Math.random() < 0.45 ? 'rifleman' : 'deputy');
            if (wanted >= 4 && Math.random() < 0.5) spawnReinforcement('shotgunner');
            feed('Wanted level ' + wanted + ' \u2014 reinforcements inbound', 'bad');
            showObjective('WANTED LEVEL ' + wanted, 'Lawmen are flooding the streets \u2014 stay sharp', 2600);
            wantedKills = 0;
          }
          if (h.isSheriff) endRound('outlaw');
        }
      } else if (h.hp > 0) {
        hitmark(isHead ? 'head' : 'hit');
      }
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

