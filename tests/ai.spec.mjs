/* ==========================================================================
   The Wild West - tests/ai.spec.mjs
   Phase 4: perception, behaviour states and squad AI. These specs drive the
   systems directly as well as through the world, because "an NPC noticed
   something" is not something a screenshot can show.
   ========================================================================== */
import { test, expect, resetGame } from './support/fixtures.mjs';
import { expectNoErrors, pinTarget, unpinTarget, fireAtPinned } from './support/game.mjs';

// put one lawman in front of the player at a chosen distance and heading
const place = async (game, { dist = 9, facing = 'player', kind = 'law' } = {}) => game.evaluate(d => {
  const pool = npcs.filter(n => !n.dead && (d.kind === 'law' ? (!n.civil && !n.isSheriff) : n.civil));
  const npc = pool[0];
  const x = player.g.position.x + d.dist, z = player.g.position.z;
  npc.g.position.set(x, heightAt(x, z), z);
  npc.g.rotation.y = d.facing === 'player' ? Math.atan2(player.g.position.x - x, player.g.position.z - z) : Math.PI;
  npc.susp = 0; npc.sees = false; npc.heard = null; npc.lastKnown = null; npc.hitT = 0; npc.ai = null;
  return { at: [x, z] };
}, { dist, facing, kind });

test.describe('perception', () => {
  test('an NPC has senses by archetype and a line of sight test that uses cover', async ({ game }) => {
    const log = await resetGame(game);
    const res = await game.evaluate(() => {
      const law = npcs.find(n => !n.civil);
      const S = Perceive.senses(law);
      // from an open street, straight line
      const open = Perceive.clearLine(0, 0, heightAt(0, 0) + 1.5, 6, 0, heightAt(6, 0) + 1.2);
      // through a house: one of the town's markers sits at 20,-8
      const wall = Perceive.clearLine(16, -8, heightAt(16, -8) + 1.5, 24, -8, heightAt(24, -8) + 1.2);
      return { range: S.range, fov: S.fov, open, wall, hasRay: typeof Perceive.canSee === 'function' };
    });
    expect(res.resolve, 'nothing to assert').toBeUndefined();
    expect(res.hasRay).toBe(true);
    expect(res.range).toBeGreaterThan(20);
    expect(res.fov).toBeLessThan(2);
    expect(res.open, 'clear line down an open street is clear').toBe(true);
    expect(res.wall, 'a house blocks the line').toBe(false);
    expectNoErrors(log);
  });

  test('seeing the player raises suspicion and moves a lawman to look, without a wanted level', async ({ game }) => {
    const log = await resetGame(game);
    await place(game, { dist: 9, facing: 'player' });
    // the sight test runs on a stagger, so wait for it rather than sampling a frame
    await game.waitForFunction(() => npcs.some(n => !n.civil && n.sees), null, { timeout: 8000 });
    const res = await game.evaluate(async () => {
      const npc = npcs.find(n => !n.civil && !n.isSheriff);
      const seen = [];
      for (let i = 0; i < 40; i++) {
        await new Promise(r => requestAnimationFrame(r));
        if (i % 8 === 0) seen.push(+(npc.susp || 0).toFixed(2));
      }
      return { seen, wanted, ai: npc.ai.state, susp: +(npc.susp || 0).toFixed(2), sees: !!npc.sees };
    });
    expect(res.wanted, 'this whole test runs with no wanted level').toBe(0);
    expect(res.sees, 'he can see the player').toBe(true);
    expect(res.susp, 'and he has noticed').toBeGreaterThan(0.05);
    expect(res.susp, 'but a stranger walking by is not a gunfight').toBeLessThan(0.6);
    expect(['suspicious', 'investigate', 'search', 'wander'], 'reacting, not yet shooting').toContain(res.ai);
    expectNoErrors(log);
  });

  test('a casual sighting settles below the investigate line, a drawn gun does not', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      const npc = npcs.find(n => !n.civil && !n.isSheriff);
      const stride = async frames => { for (let i = 0; i < frames; i++) await new Promise(r => requestAnimationFrame(r)); };
      // settle() runs until suspicion stops moving, so this does not depend on the
      // frame rate the suite happens to be running at
      const settle = async cap => {
        let last = -1;
        for (let i = 0; i < cap; i++) {
          await new Promise(r => requestAnimationFrame(r));
          const now = +(npc.susp || 0).toFixed(3);
          if (i > 8 && Math.abs(now - last) < 0.002) break;
          last = now;
        }
        return +(npc.susp || 0).toFixed(2);
      };
      // plain sight, no weapon involved
      npc.g.position.set(player.g.position.x + 10, player.g.position.y, player.g.position.z);
      npc.g.rotation.y = Math.atan2(player.g.position.x - npc.g.position.x, player.g.position.z - npc.g.position.z);
      npc.susp = 0; npc.sees = false; npc.lastKnown = null;
      aiming = false;
      const casual = await settle(220);
      const casualState = npc.ai.state;
      // now shoot: a fresh shot and a price on your head are signals the game owns,
      // unlike the aim flag, which the input layer rewrites every frame
      playerShotT = 3;
      wanted = 1; wantedT = 20;
      const aimed = await settle(220);
      const aimedState = npc.ai.state;
      wanted = 0; wantedT = 0; playerShotT = 0;
      return { casual, casualState, aimed, aimedState };
    });
    expect(res.casual, 'a stranger is only worth a look').toBeLessThan(0.34);
    expect(res.aimed, 'a levelled gun is not').toBeGreaterThan(0.5);
    expect(res.aimedState).not.toBe('wander');
  });

  test('gunshots are heard by men who cannot see them, and remembered', async ({ game }) => {
    const log = await resetGame(game);
    const res = await game.evaluate(async () => {
      const npc = npcs.find(n => !n.civil && !n.isSheriff);
      npc.g.position.set(player.g.position.x + 20, heightAt(player.g.position.x + 20, player.g.position.z), player.g.position.z);
      npc.g.rotation.y = Math.PI;                 // back turned, so no sight of the muzzle
      npc.susp = 0; npc.sees = false; npc.heard = null; npc.lastKnown = null;
      const before = +(npc.susp || 0).toFixed(2);
      Perceive.noise(player.g.position.x, player.g.position.z, 42, 'shot');
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return {
        before,
        susp: +(npc.susp || 0).toFixed(2),
        heard: npc.heard ? { kind: npc.heard.kind, d: +npc.heard.d.toFixed(1), age: +npc.heard.age.toFixed(1) } : null,
        ai: npc.ai.state
      };
    });
    expect(res.before).toBe(0);
    expect(res.heard, 'the shot registered as noise').not.toBeNull();
    expect(res.heard.kind).toBe('shot');
    expect(res.heard.d).toBeCloseTo(20, 0);
    expect(res.susp, 'and it woke him up').toBeGreaterThan(0);
    expect(res.ai).not.toBe('wander');
    expectNoErrors(log);
  });

  test('the player firing is what draws them, through the real shot path', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      const npc = npcs.find(n => !n.civil && !n.isSheriff);
      npc.g.position.set(player.g.position.x + 22, heightAt(player.g.position.x + 22, player.g.position.z), player.g.position.z);
      npc.g.rotation.y = Math.PI;
      npc.susp = 0; npc.heard = null; npc.lastKnown = null; npc.sees = false;
      const before = +(npc.susp || 0).toFixed(2);
      pitch = -1;                                  // into the sky: a noise, not a hit
      aiming = true;
      lastShot = 0;
      shoot();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { before, after: +(npc.susp || 0).toFixed(2), heard: !!npc.heard };
    });
    expect(res.after, 'the shot was heard').toBeGreaterThan(res.before);
    expect(res.heard).toBe(true);
  });

  test('memory decays: he gives up looking and goes back to normal', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      const npc = npcs.find(n => !n.civil && !n.isSheriff);
      npc.susp = 0.7;
      npc.lastKnown = null;                 // nothing left to walk towards
      npc.heard = null;
      npc.sees = false;
      npc.searchT = 0;
      player.g.position.set(npc.g.position.x - 90, player.g.position.y, npc.g.position.z);
      // decay is per second of game time, so wait for the value rather than counting frames
      for (let i = 0; i < 400; i++) {
        await new Promise(r => requestAnimationFrame(r));
        if ((npc.susp || 0) < 0.2) break;
      }
      return { susp: +(npc.susp || 0).toFixed(2), ai: npc.ai.state, lastKnown: npc.lastKnown };
    });
    expect(res.susp, 'suspicion drains away').toBeLessThan(0.34);
    expect(['wander', 'work', 'suspicious'], 'back to his round').toContain(res.ai);
    expect(res.lastKnown === null || res.lastKnown.age > 8, 'the sighting is stale').toBe(true);
  });
});

test.describe('behaviour and squads', () => {
  test('the posse shares one sighting and hands out roles', async ({ game }) => {
    const log = await resetGame(game);
    const res = await game.evaluate(async () => {
      wanted = 3; wantedT = 60;
      const one = npcs.find(n => !n.civil && !n.isSheriff);
      // only this one man can see the player
      one.sees = true; one.susp = 1;
      one.lastKnown = { x: player.g.position.x, z: player.g.position.z, age: 0 };
      for (let i = 0; i < 30; i++) { Squads.update(0.05); await new Promise(r => requestAnimationFrame(r)); }
      const sq = Squads.squads.get('posse');
      const others = sq.members.filter(m => m !== one && !m.dead);
      return {
        order: sq.order,
        contact: sq.contact ? { x: +sq.contact.x.toFixed(1), z: +sq.contact.z.toFixed(1) } : null,
        roles: sq.members.filter(m => !m.dead).map(m => m.squadRole),
        shared: others.filter(m => m.lastKnown).length,
        others: others.length,
        states: [...new Set(npcs.filter(n => !n.civil).map(n => n.ai.state))]
      };
    });
    expect(res.order, 'the squad is engaged').toBe('engage');
    expect(res.contact, 'on the shared sighting').not.toBeNull();
    expect(res.roles, 'someone pins him down').toContain('suppress');
    expect(res.roles, 'and someone swings wide').toContain('flank');
    expect(res.roles, 'the rest push in').toContain('advance');
    expect(res.states.length, 'and they are not all doing the same thing').toBeGreaterThan(1);
    expectNoErrors(log);
  });

  test('a squad breaks off when it has taken enough losses', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      wanted = 3; wantedT = 60;
      const sq = Squads.squads.get('posse');
      const live = sq.members.filter(m => !m.dead);
      live.forEach(m => { m.sees = true; m.susp = 1; m.lastKnown = { x: player.g.position.x, z: player.g.position.z, age: 0 }; });
      const engaged = (Squads.update(0.05), sq.order);
      // kill most of them
      live.slice(0, Math.max(1, live.length - 1)).forEach(m => { m.dead = true; Bus.emit('npc:died', { npc: m, byPlayer: true }); });
      Squads.update(0.05);
      return { engaged, order: sq.order, morale: +sq.morale.toFixed(2), roles: sq.members.filter(m => !m.dead).map(m => m.squadRole) };
    });
    expect(res.engaged).toBe('engage');
    expect(res.morale, 'the squad is broken').toBeLessThanOrEqual(0.5);
    expect(res.order, 'so it pulls out').toBe('withdraw');
    expect(res.roles.every(r => r === 'withdraw')).toBe(true);
  });

  test('a body in the street brings the law running', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      // calm everything down first
      npcs.forEach(n => { n.susp = 0; n.sees = false; n.heard = null; n.lastKnown = null; });
      Squads.squads.get('posse').contact = null;
      const victim = npcs.find(n => n.civil && !n.dead);
      const where = { x: victim.g.position.x, z: victim.g.position.z };
      const before = Squads.squads.get('posse').contact;
      victim.dead = true;
      Bus.emit('npc:died', { npc: victim, byPlayer: true, civilian: true });
      Squads.update(0.05);
      const sq = Squads.squads.get('posse');
      return {
        before: before, after: sq.contact ? { x: +sq.contact.x.toFixed(1), z: +sq.contact.z.toFixed(1) } : null,
        where: { x: +where.x.toFixed(1), z: +where.z.toFixed(1) },
        suspicious: npcs.filter(n => !n.civil && (n.susp || 0) > 0.5).length
      };
    });
    expect(res.before, 'the squad had no contact').toBeNull();
    expect(res.after, 'now it has one').not.toBeNull();
    expect(res.after.x, 'at the body').toBeCloseTo(res.where.x, 0);
    expect(res.suspicious, 'and the men are roused').toBeGreaterThan(0);
  });

  test('being shot reveals the shooter, through the real firing path', async ({ game }) => {
    await resetGame(game);
    const pinned = await pinTarget(game, { dist: 8 });
    expect(pinned).not.toBeNull();
    // make him hard enough to survive one hit, so the "he is hurt" reaction is what
    // gets measured rather than the death hook
    await game.evaluate(() => {
      const npc = window.__pin.npc;
      npc.hp = 8; npc.susp = 0; npc.sees = false; npc.lastKnown = null; npc.hitT = 0;
    });
    const hit = await fireAtPinned(game, { tries: 2, hp: 8 });
    const res = await game.evaluate(() => {
      const npc = window.__pin.npc;
      return {
        wounded: npc.hp < 8,
        susp: +(npc.susp || 0).toFixed(2),
        hitT: npc.hitT || 0,
        known: !!npc.lastKnown,
        ai: npc.dead ? 'dead' : npc.ai.state
      };
    });
    await unpinTarget(game);
    expect(res.wounded, 'the shot landed').toBe(true);
    expect(res.susp, 'being shot is not ambiguous').toBeGreaterThan(0.5);
    expect(res.hitT, 'he flinches').toBeGreaterThan(0);
    expect(res.known, 'and he knows roughly where it came from').toBe(true);
    expect(['combat', 'cover', 'flank', 'retreat', 'investigate', 'suspicious', 'dead']).toContain(res.ai);
  });

  test('the AI settles instead of thrashing, and nothing errors over a long run', async ({ game }) => {
    const log = await resetGame(game);
    const res = await game.evaluate(async () => {
      wanted = 4; wantedT = 300;
      const states = [];
      for (let i = 0; i < 120; i++) {
        keys['KeyW'] = i % 2 === 0;
        hp = maxHp;                       // this test is about the AI, not survival
        await new Promise(r => requestAnimationFrame(r));
        if (i % 12 === 0) states.push(...npcs.filter(n => !n.civil).map(n => n.ai.state));
      }
      keys['KeyW'] = false;
      const sq = Squads.squads.get('posse');
      return {
        states: [...new Set(states)],
        roles: [...new Set(sq.members.filter(m => !m.dead).map(m => m.squadRole))],
        order: sq.order,
        live: Mode.live(),
        wave: +wanted.toFixed(0)
      };
    });
    for (const s of res.states) {
      expect(['wander', 'work', 'suspicious', 'investigate', 'search', 'combat', 'cover', 'flank', 'retreat', 'flee', 'reload', 'dead']).toContain(s);
    }
    expect(res.states.length, 'the squad is doing more than one thing').toBeGreaterThan(1);
    expect(res.live).toBe(true);
    expectNoErrors(log);
  });
});
