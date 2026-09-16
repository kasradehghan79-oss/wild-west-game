/* ==========================================================================
   The Wild West - js/ai/behavior.js
   The state machine that turns what an NPC has noticed into what it is doing.

   States: idle, wander, work, suspicious, investigate, search, combat, cover,
   flank, reload, retreat, flee, dead. The one that matters for feel is the chain
   the game did not have before: an NPC can notice you without being ordered to
   fight, walk over to look, lose you, sweep the area, and only then go loud.

   It writes exactly one thing: `n.ai = { state, moveTo, speed, note }`. The
   movement and shooting code in locomotion.js reads that, so this file never has
   to know how a leg bends.
   Provides:  Behavior
   Expects:   Perceive, Squads, npcs, player, solid, ARCH, clamp, rnd
   ========================================================================== */
"use strict";
const Behavior = (() => {
  const COVER_R = 9.5;              // how far a man will break off to reach cover
  const SEARCH_T = 6.5;             // how long he sweeps an area before giving up

  function state(n) { return (n.ai && n.ai.state) || 'wander'; }

  // A point that puts something solid between this NPC and the player.
  function findCover(n, px, pz) {
    let best = null, bestD = COVER_R + 1;
    for (const o of solid) {
      const g = o.geometry;
      if (!g || (g.type !== 'BoxGeometry' && g.type !== 'CylinderGeometry')) continue;
      o.getWorldPosition(tmpCover);
      const d = Math.hypot(tmpCover.x - n.g.position.x, tmpCover.z - n.g.position.z);
      if (d > bestD) continue;
      // stand on the far side of it from the player
      const away = Math.atan2(tmpCover.x - px, tmpCover.z - pz);
      const cx = tmpCover.x + headX(away) * 1.4;
      const cz = tmpCover.z + headZ(away) * 1.4;
      if (collide(cx, cz, 0.6)) continue;
      if (Perceive.clearLine(px, pz, heightAt(px, pz) + 1.2, cx, cz, heightAt(cx, cz) + 1.4)) continue;  // still exposed
      const score = d + Math.hypot(cx - n.g.position.x, cz - n.g.position.z) * 1.4;
      if (score < bestD) { bestD = score; best = { x: cx, z: cz }; }
    }
    return best;
  }
  const tmpCover = new THREE.Vector3();

  function update(n, dt) {
    const S = Perceive.senses(n);
    const prev = state(n);
    const ai = n.ai || (n.ai = { state: 'wander', moveTo: null, speed: 0, note: '' });
    ai.tPrev = dt;
    n.searchT = n.searchT || 0;
    n.scanT = n.scanT || 0;
    n.coverT = n.coverT || 0;
    n.coverCheckT = (n.coverCheckT || 0) - dt;
    n.reactT = n.reactT || 0;

    if (n.dead) { ai.state = 'dead'; ai.moveTo = null; return; }

    // ---------------- civilians ----------------
    if (n.civil) {
      const threat = wanted > 0 && n.sees;
      if (threat) {
        ai.state = 'flee';
        // screaming brings the law running: this is the bridge between the people
        // and the posse, and it is why a witnessed crime is worth more than a
        // quiet one
        if (!n.shouted || n.shouted <= 0) {
          n.shouted = 9;
          Squads.alarm(player.g.position.x, player.g.position.z, 45);
          Perceive.noise(player.g.position.x, player.g.position.z, 30, 'shout');
          if (Math.random() < 0.5) feed('A townsfolk is screaming for the law', 'bad');
        }
        n.shouted -= dt;
        ai.note = 'fleeing';
      } else {
        ai.state = 'work';
        ai.note = '';
        n.shouted = Math.max(0, (n.shouted || 0) - dt);
      }
      return;
    }

    // ---------------- armed NPCs ----------------
    const engage = ARCH[n.archetype].engage + wanted * 4;
    const pd = Math.hypot(player.g.position.x - n.g.position.x, player.g.position.z - n.g.position.z);
    const seen = !!n.sees;
    const susp = n.susp || 0;
    const poi = Perceive.pointOfInterest(n);
    const job = Squads.orders(n);
    const contactFresh = job.contact && job.contact.age < 26;

    // being shot at, or seeing a comrade drop, is not something you walk off
    if (n.reactT > 0) n.reactT -= dt;
    if (n.hitT > 0) n.hitT -= dt;

    // 1. hard alert: he can see you and he has decided you are a problem, or the
    //    squad is already engaged with a fresh sighting
    const hot = !playerDead && (contactFresh && job.order === 'engage') ||
      (!playerDead && wanted > 0 && pd <= engage) ||
      (!playerDead && seen && susp >= 0.99 && pd <= engage);
    if (hot) {
      n.searchT = 0;
      ai.note = '';
      if (job.order === 'withdraw') {
        ai.state = 'retreat';
        ai.moveTo = job.moveTo;
        ai.speed = ARCH[n.archetype].speed * 1.6;
        return;
      }
      // take cover when hurt or when told to pin him down, then peek and shoot
      if (n.coverT > 0) n.coverT -= dt;
      const wantsCover = (n.hp <= 2 || job.role === 'suppress') && pd > 5;
      if (wantsCover && n.coverT <= 0 && n.coverCheckT <= 0) {
        n.coverCheckT = 1.1;
        const spot = findCover(n, player.g.position.x, player.g.position.z);
        if (spot) { n.cover = spot; n.coverT = rnd(2.2, 4.2); }
      }
      if (n.cover && n.coverT > 0) {
        const d = Math.hypot(n.cover.x - n.g.position.x, n.cover.z - n.g.position.z);
        if (d > 0.9) {
          ai.state = 'cover';
          ai.moveTo = n.cover;
          ai.speed = ARCH[n.archetype].speed * 1.85;
          return;
        }
        // in cover: hold the position and keep shooting from it
        ai.state = 'combat';
        ai.moveTo = null;
        ai.note = 'in cover';
        return;
      }
      if (job.role === 'flank' && job.moveTo && pd > 8) {
        const d = Math.hypot(job.moveTo.x - n.g.position.x, job.moveTo.z - n.g.position.z);
        if (d > 2.5) {
          ai.state = 'flank';
          ai.moveTo = job.moveTo;
          ai.speed = ARCH[n.archetype].speed * 1.7;
          return;
        }
      }
      if (n.retreatT > 0 || (n.hp <= 1 && S.courage < 0.7)) {
        ai.state = 'retreat';
        ai.moveTo = job.moveTo || null;
        return;
      }
      ai.state = 'combat';
      ai.moveTo = job.moveTo && job.role === 'suppress' ? job.moveTo : null;
      return;
    }

    // 2. he has something to go on but has not made you: walk over and look
    if ((susp >= 0.34 || (poi && poi.age < 14)) && !playerDead) {
      const target = poi || (n.heard ? { x: n.heard.x, z: n.heard.z } : null);
      if (target) {
        const d = Math.hypot(target.x - n.g.position.x, target.z - n.g.position.z);
        if (d > 2.2) {
          ai.state = susp >= 0.7 ? 'investigate' : 'suspicious';
          ai.moveTo = { x: target.x, z: target.z };
          ai.speed = ARCH[n.archetype].speed * (susp >= 0.7 ? 1.5 : 0.95);
          ai.note = 'checking it out';
          n.searchT = 0;
          return;
        }
        // arrived: sweep the area, a few seconds of looking around
        n.searchT = Math.max(n.searchT, susp >= 0.7 ? SEARCH_T : SEARCH_T * 0.6);
        if (!n.searchPoint || Math.hypot(n.searchPoint.x - n.g.position.x, n.searchPoint.z - n.g.position.z) < 1.4) {
          const a = rnd(0, TAU), r = rnd(4, 11);
          n.searchPoint = {
            x: clamp(target.x + Math.cos(a) * r, -138, 138),
            z: clamp(target.z + Math.sin(a) * r, -138, 138)
          };
        }
      }
      if (n.searchT > 0) {
        n.searchT -= dt;
        n.scanT += dt;
        ai.state = 'search';
        ai.moveTo = n.searchPoint || null;
        ai.speed = ARCH[n.archetype].speed * 0.9;
        ai.note = 'sweeping';
        return;
      }
      // nothing found: suspicion drains, and he goes back to his round
      Perceive.forget(n);
      n.searchPoint = null;
      ai.state = 'wander';
      ai.moveTo = null;
      ai.note = '';
      return;
    }

    // 3. nothing going on
    if (n.searchT > 0) n.searchT -= dt;
    ai.state = wanted > 0 || contactFresh ? 'combat' : 'wander';
    ai.moveTo = null;
    ai.speed = 0;
    ai.note = '';
  }

  return { update, state, findCover, COVER_R, SEARCH_T };
})();
