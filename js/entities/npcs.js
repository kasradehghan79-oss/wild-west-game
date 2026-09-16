/* ==========================================================================
   The Wild West - js/entities/npcs.js
   NPC population, spawn and patrol placement, and their shooting behaviour.
   Provides:  npcs, addLawman, addCivilian, scatterNpcs, spawnGarrison, spawnReinforcement (kept for the camps of later phases; nothing in the law path uses it)
   Expects:   ARCH, makeHuman, blocks, collide, FX, Sound (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- npc population ----------
const npcs = [];
// The whole posse wears the same colours on purpose: if the law is dressed in
// random tones, the sheriff stands out by luck alone and the hunt becomes trivial.
// Individuality comes from skin tone and build instead, so nobody is a clone and
// nobody is marked either.
const lawShirts = [0xc0a878];
const lawHats = [0xa87a42];
const rifleHats = [0xa87a42];
const civilShirts = [0xd8503c, 0x3f8fc0, 0xd8a63c, 0x5fb45a, 0xa070c8, 0xe8e2d0];
function freeSpot(x, z, r, tries) {
  for (let i = 0; i < (tries || 30); i++) {
    if (!collide(x, z)) return { x, z };
    x += rnd(-r, r); z += rnd(-r, r);
  }
  return { x, z };
}
// Men who arrived because of a wanted level, rather than the town's own posse. They
// are cleared at the start of a round: without this the streets fill up with every
// man the law ever sent, until the cap stops it answering at all.
function clearExtras() {
  for (let i = npcs.length - 1; i >= 0; i--) {
    const n = npcs[i];
    if (!n.extra) continue;
    if (typeof Squads === 'object') Squads.leave(n);
    if (n.g && n.g.parent) n.g.parent.remove(n.g);
    npcs.splice(i, 1);
  }
}
function addLawman(archetype, x, z) {
  const shirt = pick(lawShirts), hat = archetype === 'rifleman' ? pick(rifleHats) : pick(lawHats);
  const n = makeHuman(shirt, 0x475372, hat, true, archetype === 'sheriff', archetype);
  const p = freeSpot(x, z, 3);
  n.g.position.set(p.x, heightAt(p.x, p.z), p.z);
  n.g.rotation.y = rnd(0, TAU);
  n.hp = Difficulty.foeHp(ARCH[archetype].hp);
  n.isSheriff = archetype === 'sheriff';
  n.spawn = { x: p.x, y: n.g.position.y, z: p.z, rot: n.g.rotation.y };
  n.gun.visible = true;
  if (n.badge) n.badge.visible = false;
  npcs.push(n);
  // lawmen fight as one posse, so a sighting by any of them is a sighting by all of
  // them and the squad can hand out roles (see js/ai/squad.js)
  Squads.join(n, 'posse', 'advance');
  return n;
}
function addCivilian(x, z) {
  const n = makeHuman(pick(civilShirts), pick([0x475372, 0x5a4a34, 0x6a5a44]), null, false, false, 'civil');
  const p = freeSpot(x, z, 6);
  n.g.position.set(p.x, heightAt(p.x, p.z), p.z);
  n.g.rotation.y = rnd(0, TAU);
  n.hp = Difficulty.foeHp(ARCH.civil.hp);
  n.gun.visible = false;
  n.spawn = { x: p.x, y: n.g.position.y, z: p.z, rot: n.g.rotation.y };
  npcs.push(n);
  return n;
}
// Fixed posts on the roads into town. The posse always comes in from the same places, so a
// player can learn where the law enters from, and nobody ever materialises beside them.
const LAW_POSTS = [
  [0, -44], [0, 44], [-44, 0], [44, 0],
  [30, -30], [-30, -30], [30, 30], [-30, 30],
  [0, -60], [0, 60], [-60, 0], [60, 0]
];
// The whole posse for the chosen difficulty: one sheriff plus a fixed list of men. This is
// the only place lawmen are ever created - nothing spawns them mid round.
function spawnGarrison() {
  for (let i = npcs.length - 1; i >= 0; i--) {
    const n = npcs[i];
    if (n.civil) continue;
    if (typeof Squads === 'object') Squads.leave(n);
    if (n.g && n.g.parent) n.g.parent.remove(n.g);
    npcs.splice(i, 1);
  }
  addLawman('sheriff', -2, -8);
  Difficulty.garrisonMix().forEach((arch, i) => {
    const post = LAW_POSTS[i % LAW_POSTS.length];
    addLawman(arch, post[0], post[1]);
  });
  return npcs.filter(n => !n.civil).length;
}
spawnGarrison();
for (let i = 0; i < 5; i++) {
  const a = rnd(0, TAU), r = rnd(7, 22);
  addCivilian(Math.cos(a) * r, Math.sin(a) * r);
}
// ---------- randomised patrol placement ----------
// Nobody, least of all the sheriff, starts the round twice in the same place.
// uniform over the disc (equal chance per unit of area), so a spot right next to
// the player is exactly as likely as one across the map - no bias toward "far away"
function randomTownSpot(minR, maxR) {
  const r0 = Math.max(0, minR), r1 = Math.max(r0 + 0.001, maxR);
  for (let i = 0; i < 40; i++) {
    const r = Math.sqrt(rnd(r0 * r0, r1 * r1));
    const a = Math.random() * TAU;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) > 132 || Math.abs(z) > 132) continue;
    if (collide(x, z)) continue;
    return { x, z };
  }
  const a = Math.random() * TAU, r = rnd(r0, r1);
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}
function scatterNpcs() {
  for (const n of npcs) {
    // completely random: the sheriff can end up anywhere, close or far
    const R = n.isSheriff ? [0, 72] : n.archetype === 'civil' ? [4, 26] : [0, 62];
    const p = randomTownSpot(R[0], R[1]);
    n.spawn = { x: p.x, y: heightAt(p.x, p.z), z: p.z, rot: Math.random() * TAU };
  }
}
let specNpc = null;
function spawnReinforcement(archetype) {
  if (npcs.length > 26) return null;
  const a = rnd(0, TAU);
  const px = player.g.position.x + Math.cos(a) * 62;
  const pz = player.g.position.z + Math.sin(a) * 62;
  const p = freeSpot(clamp(px, -135, 135), clamp(pz, -135, 135), 5, 40);
  const n = addLawman(archetype, p.x, p.z);
  n.reactT = 1.4;
  // marked so the start of the next round can send them home: without this the town
  // grows by every man the law ever sent, until the cap stops it answering at all
  n.extra = true;
  return n;
}

function blinkH(h, dt) {
  if (h.dead) return;
  h.blinkT -= dt;
  if (h.blinkT <= 0) h.blinkT = 2 + Math.random() * 4;
  const s = h.blinkT > 0.12 ? 1 : Math.max(0.1, Math.abs((h.blinkT - 0.06) / 0.06));
  h.eyes.forEach(e => e.scale.y = s);
}
function pickNpcTarget(n) {
  // a walk target inside a building means the NPC leans on the wall forever,
  // so only accept somewhere they can actually stand
  for (let i = 0; i < 10; i++) {
    const a = rnd(0, TAU), r = rnd(5, 18);
    const x = clamp(n.g.position.x + headX(a) * r, -135, 135);
    const z = clamp(n.g.position.z + headZ(a) * r, -135, 135);
    if (!collide(x, z, 0.6)) { n.target = { x, z }; return; }
  }
  n.target = null;      // nowhere good: just stand and look around
}
function resetHumanAnim(h) {
  h.g.rotation.set(0, h.g.rotation.y, 0);
  h.hips.rotation.set(0, 0, 0);
  h.chest.rotation.set(0, 0, 0);
  h.legL.rotation.set(0, 0, 0); h.legR.rotation.set(0, 0, 0);
  h.kneeL.rotation.set(0, 0, 0); h.kneeR.rotation.set(0, 0, 0);
  h.ankleL.rotation.set(0, 0, 0); h.ankleR.rotation.set(0, 0, 0);
  h.armL.rotation.set(0, 0, h.armL.rotation.z); h.armR.rotation.set(0, 0, h.armR.rotation.z);
  h.elbowL.rotation.set(0, 0, 0); h.elbowR.rotation.set(0, 0, 0);
  h.wristL.rotation.set(0, 0, 0); h.wristR.rotation.set(0, 0, 0);
  h.head.rotation.set(0, 0, 0);
  h.torso.scale.set(1, 1, 1);
  h.hips.position.y = 0.72;
  h.walkW = 0; h.runW = 0; h.bob = 0; h.leanX = 0; h.leanZ = 0; h.lastSp = 0; h.accel = 0; h.turnRate = 0;
  h.moveDx = 0; h.moveDz = 0;
  h.gunDrawn = false; h.drawT = 0; h.recoil = 0; h.fireT = 0;
  h.gun.rotation.set(h.gunRest.x, h.gunRest.y, h.gunRest.z);
  h.gun.position.set(h.gunRest.px, h.gunRest.py, h.gunRest.pz);
  h.gun.visible = h.archetype !== 'civil';
  h.target = null; h.waitT = 0; h.phase = 0; h.reactT = 0; h.retreatT = 0; h.strafeT = rnd(0.4, 1.6);
  h.shots = 0;
  if (h.badge) h.badge.visible = false;
}

// ---------- npc combat ----------
const dmgForDist = d => 1 + Math.max(0, 30 - d) / 30;
function npcGun(n) {
  const A = ARCH[n.archetype];
  return {
    muzzle: () => {
      const fwd = new THREE.Vector3(Math.sin(n.g.rotation.y), 0, Math.cos(n.g.rotation.y));
      return new THREE.Vector3(n.g.position.x + fwd.x * 0.6, n.g.position.y + 1.42, n.g.position.z + fwd.z * 0.6);
    },
    A
  };
}
function fireNpc(n, pd, hitMult) {
  const A = ARCH[n.archetype];
  const fwd = new THREE.Vector3(Math.sin(n.g.rotation.y), 0, Math.cos(n.g.rotation.y));
  const from = new THREE.Vector3(n.g.position.x + fwd.x * 0.6, n.g.position.y + 1.42, n.g.position.z + fwd.z * 0.6);
  let to = new THREE.Vector3(player.g.position.x, player.g.position.y + 1.3, player.g.position.z);
  const baseChance = aiming ? A.accAim : A.accBase;
  // the roll is a miss chance: difficulty scales it, and the multiplier inverts it
  const hit = Math.random() < Difficulty.foeMiss(baseChance) * Math.max(0.3, 1 - pd / 40) * hitMult * (1 / Difficulty.foeMissMult());
  let dmg = hit ? Difficulty.foeDmg(rnd(A.dmgMin, A.dmgMax)) : 0;
  if (!hit) to.add(new THREE.Vector3(rnd(-1, 1), rnd(-0.4, 1), rnd(-1, 1)).multiplyScalar(2.4));
  losDir.copy(to).sub(from);
  const dist = losDir.length();
  losDir.normalize();
  losRay.set(from, losDir);
  losRay.far = dist - 0.4;
  const solidHit = losRay.intersectObjects(shootables, false)
    .filter(h => { const u = h.object.userData; return !u.human && !u.horse; })
    .sort((a, b) => a.distance - b.distance)[0];
  if (solidHit) {
    to.copy(from).addScaledVector(losDir, solidHit.distance);
    dmg = 0;
    const o = solidHit.object;
    const normal = solidHit.face
      ? solidHit.face.normal.clone().transformDirection(o.matrixWorld)
      : losDir.clone();
    addDecal(to, normal, 0xffffff, rnd(0.055, 0.09));
    FX.impact(to, normal, 'dirt');
  }
  addTracer(from, to);
  FX.impact(from, losDir, 'muzzle');
  Sound.shoot(n.archetype === 'rifleman' ? 'rifle' : n.archetype === 'shotgunner' ? 'shotgun' : 'enemy');
  n.recoil = 0.07; n.fireT = 0.28; n.muzzleT = 0.06;
  if (dmg) hurtPlayer(dmg, n);
}
function faceAndShoot(n, dt, pd, mult) {
  const A = ARCH[n.archetype];
  if (n.fireT > 0) {
    n.armR.rotation.x = lerp(n.armR.rotation.x, -Math.PI / 2, Math.min(1, dt * 14));
    n.elbowR.rotation.x = lerp(n.elbowR.rotation.x, 0, Math.min(1, dt * 14));
  } else {
    n.armR.rotation.x = lerp(n.armR.rotation.x, -Math.PI / 2 - 0.2, Math.min(1, dt * 11));
    n.elbowR.rotation.x = lerp(n.elbowR.rotation.x, 0.2, Math.min(1, dt * 11));
  }
  if (n.archetype === 'rifleman') {
    n.armL.rotation.x = lerp(n.armL.rotation.x, -Math.PI / 2 - 0.35, Math.min(1, dt * 10));
    n.elbowL.rotation.x = lerp(n.elbowL.rotation.x, 0.5, Math.min(1, dt * 10));
  } else {
    n.armL.rotation.x *= Math.pow(0.001, dt);
    n.elbowL.rotation.x = lerp(n.elbowL.rotation.x, -0.2, Math.min(1, dt * 6));
  }
  n.gun.rotation.x = lerp(n.gun.rotation.x, n.gunAim.x, Math.min(1, dt * 12));
  n.gun.position.y = lerp(n.gun.position.y, n.gunAim.py, Math.min(1, dt * 12));
  n.gun.position.z = lerp(n.gun.position.z, n.gunAim.pz - n.recoil, Math.min(1, dt * 12));
  n.torso.scale.y = 1;
  n.g.rotation.x = lerp(n.g.rotation.x, 0, Math.min(1, dt * 4));
  n.g.rotation.z = lerp(n.g.rotation.z, 0, Math.min(1, dt * 4));
  n.head.rotation.y = lerpAngle(n.head.rotation.y, 0, Math.min(1, dt * 4));
  n.head.rotation.x = lerp(n.head.rotation.x, 0, Math.min(1, dt * 4));
  // Guns up, aimed, and not firing: at the lower wanted levels the law confronts the player
  // rather than shooting them, which is what the response table has always claimed. Being
  // shot at changes that immediately - self defence needs no permission.
  const mayFire = (typeof Law === 'object') ? Law.mayOpenFire(n) : wanted >= 3;
  if (n.reactT <= 0 && mayFire) {
    if (n.shootT === undefined) n.shootT = rnd(0.5, 1.2);
    n.shootT -= dt;
    if (n.shootT <= 0) {
      n.shootT = Difficulty.fireRate(rnd(A.cdMin, A.cdMax) * (n.isSheriff ? 0.85 : 1) * Math.max(0.55, 1 - wanted * 0.08));
      const rangePenalty = pd > A.range * 1.4 ? 0.6 : 1;
      fireNpc(n, pd, mult * rangePenalty);
    }
  }
}
