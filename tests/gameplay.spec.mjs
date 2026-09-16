/* ==========================================================================
   The Wild West - tests/gameplay.spec.mjs
   The rules of the game itself: movement, stamina, shooting, damage, death and
   the round flow. Grouped so the file costs seven boots instead of thirteen.

   The input layers are tested on their own in desktop.input.spec.mjs and
   phone.controls.spec.mjs. These specs drive the shared key map that both write
   to, so they exercise the systems rather than a particular button.
   ========================================================================== */
import { test, expect, resetGame } from './support/fixtures.mjs';
import { patch, gameState, expectNoErrors, pinTarget, unpinTarget, fireAtPinned, waitFrames } from './support/game.mjs';

async function hold(game, code, ms) {
  await game.evaluate(c => { keys[c] = true; }, code);
  await game.waitForTimeout(ms);
  await game.evaluate(c => { keys[c] = false; }, code);
}

test.describe('movement', () => {
  test('walks in every direction held, and sprinting is faster and costs stamina', async ({ game }) => {
    const log = await resetGame(game);
    const moved = [];
    for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
      await patch(game, { pos: [0, 0], yaw: 0 });
      await game.waitForTimeout(100);
      await hold(game, code, 600);
      const s = await gameState(game);
      moved.push([code, +Math.hypot(s.pos.x, s.pos.z).toFixed(2)]);
    }
    for (const [code, dist] of moved) expect(dist, code + ' moved ' + dist).toBeGreaterThan(0.3);

    // Walking vs sprinting, counted in frames rather than seconds: the loop clamps
    // dt to 50ms, so a wall clock wait is not a fixed amount of game time here.
    await patch(game, { pos: [0, 0], yaw: 0 });
    const walk = await game.evaluate(async () => {
      stam = 100; stamLock = false; runT = 0;
      keys['KeyW'] = true;
      const x0 = player.g.position.x, z0 = player.g.position.z;
      for (let i = 0; i < 12; i++) await new Promise(r => requestAnimationFrame(r));
      keys['KeyW'] = false;
      return { d: Math.hypot(player.g.position.x - x0, player.g.position.z - z0), stam, runT };
    });

    await patch(game, { pos: [0, 0], yaw: 0 });
    const run = await game.evaluate(async () => {
      stam = 100; stamLock = false; runT = 0;
      keys['KeyW'] = true; keys['ShiftLeft'] = true;
      const x0 = player.g.position.x, z0 = player.g.position.z;
      for (let i = 0; i < 12; i++) await new Promise(r => requestAnimationFrame(r));
      keys['KeyW'] = false; keys['ShiftLeft'] = false;
      return { d: Math.hypot(player.g.position.x - x0, player.g.position.z - z0), stam, runT };
    });

    expect(run.d, 'sprint covered more ground over the same 12 frames').toBeGreaterThan(walk.d);
    expect(run.stam, 'and paid stamina for it').toBeLessThan(walk.stam);
    expect(run.runT, 'the sprint timer is lit while sprinting').toBeGreaterThan(0);
    expect(walk.runT, 'and not while walking').toBe(0);
    expect(walk.d, 'walking moved the player at all').toBeGreaterThan(0.3);
    expectNoErrors(log);
  });

  test('jumping leaves the ground, and walls stop the walk', async ({ game }) => {
    await resetGame(game);
    const air = await game.evaluate(async () => {
      player.g.position.set(0, heightAt(0, 0), 0);
      let peak = 0;
      keys['Space'] = true;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => requestAnimationFrame(r));
        peak = Math.max(peak, player.g.position.y - heightAt(player.g.position.x, player.g.position.z));
        if (i === 3) keys['Space'] = false;
      }
      keys['Space'] = false;
      return { peak, ground: player.g.position.y - heightAt(player.g.position.x, player.g.position.z) };
    });
    expect(air.peak, 'left the ground').toBeGreaterThan(0.3);
    expect(air.ground, 'and came back down').toBeLessThan(0.3);

    const wall = await game.evaluate(async () => {
      const house = [20, -8];
      player.g.position.set(house[0] - 5, heightAt(house[0] - 5, house[1]), house[1]);
      yaw = -Math.PI / 2;                       // face +x, straight at it
      keys['KeyW'] = true;
      for (let i = 0; i < 60; i++) await new Promise(r => requestAnimationFrame(r));
      keys['KeyW'] = false;
      return {
        x: +player.g.position.x.toFixed(2),
        insideWall: collide(player.g.position.x, player.g.position.z, 0.4)
      };
    });
    expect(wall.insideWall, 'ended up inside geometry').toBe(false);
    expect(wall.x, 'the wall stopped the walk').toBeLessThan(20);
  });
});

test.describe('gunplay', () => {
  test('a shot spends one round, the cylinder refills, and a dry fire pulls the reload', async ({ game }) => {
    const log = await resetGame(game);
    const shot = await game.evaluate(async () => {
      const before = ammo;
      lastShot = 0;
      shoot();
      await new Promise(r => requestAnimationFrame(r));
      return { before, after: ammo };
    });
    expect(shot.after).toBe(shot.before - 1);

    await game.evaluate(() => startReload());
    await game.waitForFunction(() => reloading === true);
    // the reload takes 1.5s of *game* time, which is 30 frames, which is ~7s here
    await game.waitForFunction(() => reloading === false, null, { timeout: 30000 });
    const reloaded = await game.evaluate(() => ({ ammo, magSize, reloading }));
    expect(reloaded.ammo).toBe(reloaded.magSize);

    const dry = await game.evaluate(async () => {
      setAmmo(0);
      lastShot = 0; lastDry = 0;
      shoot();
      await new Promise(r => requestAnimationFrame(r));
      return { ammo, reloading };
    });
    expect(dry.ammo, 'never goes negative').toBe(0);
    expect(dry.reloading, 'and pulls the reload').toBe(true);
    expectNoErrors(log);
  });

  test('a hit kills the target, pays the bounty, raises the wanted level; a miss costs a round', async ({ game }) => {
    const log = await resetGame(game);
    await patch(game, { cash: 0, wanted: 0 });
    const pinned = await pinTarget(game, { dist: 6 });
    expect(pinned, 'found an armed NPC to shoot').not.toBeNull();
    await waitFrames(game, 2);
    const hit = await fireAtPinned(game, { tries: 3, hp: 0.5 });
    await unpinTarget(game);
    expect(hit.dead, 'the target died (hp ' + hit.hp + ')').toBe(true);
    expect(hit.killsDelta).toBe(1);
    expect(hit.cashDelta, 'bounty paid').toBeGreaterThan(0);
    expect(hit.wantedAfter, 'shooting a lawman puts a price on you').toBeGreaterThanOrEqual(1);
    expect(hit.ammoSpent).toBeGreaterThan(0);

    const missed = await game.evaluate(async () => {
      const before = { kills, ammo };
      pitch = -1.0;               // straight up at the sky
      aiming = true;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      lastShot = 0;
      shoot();
      await new Promise(r => requestAnimationFrame(r));
      return { spent: before.ammo - ammo, killsDelta: kills - before.kills };
    });
    expect(missed.spent).toBe(1);
    expect(missed.killsDelta).toBe(0);
    expectNoErrors(log);
  });

  test('a headshot multiplies the damage, and the rifle hits harder than the revolver', async ({ game }) => {
    const log = await resetGame(game);
    const weapons = await game.evaluate(() => ({
      revolver: WEAPONS.revolver.dmg, rifle: WEAPONS.rifle.dmg,
      head: WEAPONS.revolver.head, rifleHead: WEAPONS.rifle.head
    }));
    expect(weapons.rifle).toBeGreaterThan(weapons.revolver);
    expect(weapons.rifleHead).toBeGreaterThan(weapons.head);

    const pinned = await pinTarget(game, { dist: 5, aim: 'head' });
    expect(pinned).not.toBeNull();
    await waitFrames(game, 2);
    const res = await fireAtPinned(game, { tries: 3, hp: 10 });
    await unpinTarget(game);
    const best = Math.max(...res.shots, 0);
    expect(best, 'the biggest single hit: ' + JSON.stringify(res.shots)).toBeGreaterThan(1.5);
    expectNoErrors(log);
  });
});

test.describe('damage and death', () => {
  test('damage drains hearts, zero kills the player, and the desert bites outside the camp', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      hp = 2;
      hurtPlayer(1);
      const mid = { hp, dead: playerDead };
      hurtPlayer(5);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const dead = { hp, dead: playerDead, mode: Mode.current(), card: deadEl.classList.contains('show') };
      // a fresh round, then bleed out in the desert
      nextAfterEnd();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      player.g.position.set(CAMP_R + 12, heightAt(CAMP_R + 12, 0), 0);
      const before = hp;
      // the desert bites once a second of game time: 14 frames is well past that
      for (let i = 0; i < 24; i++) await new Promise(r => requestAnimationFrame(r));
      return { mid, dead, outside: { before, after: hp } };
    });
    expect(res.mid.hp).toBe(1);
    expect(res.mid.dead).toBe(false);
    expect(res.dead.hp).toBe(0);
    expect(res.dead.dead).toBe(true);
    expect(res.dead.card, 'the death card is up').toBe(true);
    expect(res.dead.mode).toBe('dead');
    expect(res.outside.after, 'the desert bleeds you').toBeLessThan(res.outside.before);
  });

  test('the player cannot be hurt while the game is paused', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      wanted = 5; wantedT = 120;
      const npc = npcs.find(n => !n.civil && !n.dead);
      npc.g.position.set(player.g.position.x + 2.5,
        heightAt(player.g.position.x + 2.5, player.g.position.z), player.g.position.z);
      const before = hp;
      setPaused(true);
      for (let i = 0; i < 12; i++) await new Promise(r => requestAnimationFrame(r));
      const during = hp;
      setPaused(false);
      return { before, during };
    });
    expect(res.during, 'health while paused').toBe(res.before);
  });
});

test.describe('round flow', () => {
  test('the sheriff dies for the round and the card taps through to the next one', async ({ game }) => {
    await resetGame(game);
    const before = await game.evaluate(() => ({ outlaws: outlawPts, law: lawPts, cash }));
    const pinned = await pinTarget(game, { dist: 6, kind: 'sheriff' });
    expect(pinned, 'found the sheriff').not.toBeNull();
    await waitFrames(game, 2);
    const hit = await fireAtPinned(game, { tries: 3, hp: 0.5 });
    await unpinTarget(game);
    expect(hit.dead, 'the sheriff went down').toBe(true);
    await game.waitForFunction(() => Mode.current() === 'over');
    const scored = await game.evaluate(() => ({
      outlaws: outlawPts, law: lawPts, card: reEl.classList.contains('show'),
      title: reTitle.textContent, cash
    }));
    expect(scored.outlaws).toBe(before.outlaws + 1);
    expect(scored.law).toBe(before.law);
    expect(scored.card).toBe(true);
    expect(scored.title).toContain('SHERIFF DOWN');
    expect(scored.cash, 'the round bonus is paid').toBeGreaterThan(before.cash);

    // tapping the card starts the next round with the score kept
    await game.locator('#roundend').click();
    await game.waitForFunction(() => Mode.live());
    const next = await gameState(game);
    expect(next.roundNum).toBe(2);
    expect(next.outlawPts).toBe(scored.outlaws);
    expect(next.hp).toBe(next.maxHp);
    expect(next.wanted).toBe(0);

    // running the clock down gives the round to the law
    await game.evaluate(() => { endRound('outlaw', 'timeout'); });
    await game.waitForFunction(() => Mode.current() === 'over');
    const timeUp = await game.evaluate(async () => {
      const law = lawPts;
      nextAfterEnd();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      roundT = 0.05;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
      return { lawBefore: law, title: reTitle.textContent, lawAfter: lawPts };
    });
    expect(timeUp.lawAfter).toBe(timeUp.lawBefore + 1);
    expect(timeUp.title).toContain('TIME UP');
  });

  test('winning the match wipes the run back to round one', async ({ game }) => {
    await resetGame(game);
    const reset = await game.evaluate(async () => {
      outlawPts = 2;                      // WIN_PTS - 1
      cash = 400;
      upgrades.hp = 2;
      playerWeapons.rifle.owned = true;
      endRound('outlaw', 'sheriff');
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const card = { title: reTitle.textContent };
      nextAfterEnd();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return {
        card, outlawPts, lawPts, roundNum, cash,
        hpUpgrade: upgrades.hp, rifle: playerWeapons.rifle.owned, hp, maxHp
      };
    });
    expect(reset.card.title).toContain('OUTLAWS WIN');
    expect(reset.outlawPts).toBe(0);
    expect(reset.lawPts).toBe(0);
    expect(reset.roundNum).toBe(1);
    expect(reset.cash).toBe(0);
    expect(reset.hpUpgrade).toBe(0);
    expect(reset.rifle).toBe(false);
    expect(reset.hp).toBe(reset.maxHp);
  });
});
