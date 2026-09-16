/* ==========================================================================
   The Wild West - tests/regression.spec.mjs
   One test per class of bug that has actually been fixed in this project, so it
   cannot come back. Every assertion here failed at some point.
   ========================================================================== */
import { test, expect, resetGame } from './support/fixtures.mjs';
import { patch, gameState, probe, expectNoErrors, layout, setWanted } from './support/game.mjs';

test.describe('things that used to run while the game was frozen', () => {
  // NPCs kept walking, the round clock kept counting down, passive healing kept
  // ticking and the wanted level kept decaying behind the pause menu and the store.
  test('no clock, no NPC and no healing moves in any frozen state', async ({ game }) => {
    await resetGame(game);
    await setWanted(game, 3);
    await patch(game, { wantedT: 1.5, hp: 2, sinceDmg: 60 });

    await game.evaluate(() => setPaused(true));
    const paused = await probe(game, 8);
    expect(paused.roundTDelta, 'the round clock').toBe(0);
    expect(paused.hpDelta, 'passive healing').toBe(0);
    expect(paused.npcMoved, 'the NPCs').toBe(0);
    expect(paused.wantedT, 'the wanted timer').toBe(undefined);

    const wantedAfterPause = await game.evaluate(() => ({ wanted, wantedT }));
    expect(wantedAfterPause.wanted, 'the wanted level held').toBe(3);
    await game.evaluate(() => setPaused(false));
    await game.waitForFunction(() => Mode.live());

    await game.evaluate(() => { wanted = 3; wantedT = 1.5; hp = 2; sinceDmg = 60; openShop(); });
    await game.waitForFunction(() => Mode.current() === 'shop');
    const shopped = await probe(game, 8);
    expect(shopped.npcMoved, 'the NPCs while shopping').toBe(0);
    expect(shopped.wantedT).toBe(undefined);
    const wantedAfterShop = await game.evaluate(() => wanted);
    expect(wantedAfterShop, 'the wanted level did not decay in the store').toBe(3);
    await game.evaluate(() => closeShop());

    // and it all comes back to life. Calm the town first: with a wanted level up,
    // an NPC landing a shot would reset the healing timer mid-check.
    await game.waitForFunction(() => Mode.live());
    await game.evaluate(() => { wanted = 0; wantedT = 0; hp = 3; sinceDmg = 60; });
    const awake = await probe(game, 8);
    expect(awake.roundTDelta, 'the clock runs again').toBeLessThan(0);
    expect(awake.hpDelta, 'healing runs again').toBeGreaterThan(0);
    expect(awake.npcMoved).toBeGreaterThan(0.1);
  });
});

test.describe('state and save regressions', () => {
  // The wanted level used to be wiped on load, because startRound() resets it and
  // the saved value was stamped in first.
  test('the wanted level and its timer survive a save and load', async ({ game }) => {
    await resetGame(game);
    // the level lives in the record now, so the record is what gets raised and saved
    await setWanted(game, 4);
    await patch(game, { wantedT: 30 });
    await game.evaluate(() => Save.write('1'));
    await game.evaluate(() => Law.clearRecord());
    await patch(game, { wantedT: 0 });
    expect(await game.evaluate(() => wanted), 'wiped before the load').toBe(0);
    await game.evaluate(() => Save.load('1'));
    await game.waitForFunction(() => Mode.live());
    const s = await gameState(game);
    expect(s.wanted).toBe(4);
    expect(s.wantedT).toBeGreaterThan(20);
  });

  // The rider used to float above the saddle.
  test('the rider sits in the saddle', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      player.g.position.set(horse.g.position.x, horse.g.position.y, horse.g.position.z);
      hp = 5;
      toggleMount();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { mounted, seatDelta: +(player.g.position.y - horse.g.position.y).toFixed(2) };
    });
    expect(res.mounted).toBe(true);
    expect(res.seatDelta, 'rider height above the horse origin').toBeGreaterThan(0.6);
    expect(res.seatDelta, 'and not floating').toBeLessThan(1.3);
  });

  // Aim assist used to pick a target even when it was behind the player.
  test('aim assist only picks targets in front of the player', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      const npc = npcs.find(n => !n.dead && !n.civil);
      // clear the field: the assist picks the *nearest* armed NPC in the cone, so
      // any other lawman standing in front would answer instead of our subject
      npcs.forEach(n => { if (n !== npc) n.g.position.set(180, heightAt(180, 180), 180); });
      const x = player.g.position.x, z = player.g.position.z;
      const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      npc.g.position.set(x - 8, heightAt(x - 8, z), z);      // straight behind
      yaw = -Math.PI / 2;                                     // facing +x
      await settle();                                         // the camera follows yaw on a frame
      lastShot = 0;
      shoot();
      const behind = fireTarget === npc;
      npc.g.position.set(x + 8, heightAt(x + 8, z), z);      // straight ahead
      await settle();
      lastShot = 0;
      shoot();
      return { behind, ahead: fireTarget === npc };
    });
    expect(res.behind, 'a target behind the player must not be picked').toBe(false);
    expect(res.ahead, 'a target in front is picked').toBe(true);
  });
});

test.describe('presentation regressions', () => {
  // Clouds rendered as brown smudges at night, lit only by the warm environment bake.
  test('clouds share one material and are moonlit at night, not brown', async ({ game }) => {
    await resetGame(game);
    await game.evaluate(() => { dayTime = 0.78; });     // midnight in the 24h cycle
    await game.waitForTimeout(300);
    const night = await game.evaluate(() => {
      let shared = 0;
      scene.traverse(o => { if (o.isMesh && o.material === cloudMat) shared++; });
      return { shared, e: cloudMat.emissive.toArray(), n: nightF };
    });
    expect(night.shared, 'every puff uses the shared material').toBeGreaterThan(20);
    expect(night.n).toBeGreaterThan(0.9);
    expect(night.e[2], 'the night tint is cool, blue above red').toBeGreaterThan(night.e[0]);
    expect(night.e[0], 'weak enough not to glow').toBeLessThan(0.2);
    expect(night.e[0], 'but not black either').toBeGreaterThan(0.01);

    await game.evaluate(() => { dayTime = 0.26; });     // noon
    await game.waitForTimeout(300);
    const day = await game.evaluate(() => ({ e: cloudMat.emissive.toArray(), n: nightF }));
    expect(day.n, 'daytime again').toBeLessThan(0.1);
    expect(day.e[0], 'no emissive lift in daylight').toBeLessThan(0.02);
  });

  // A missing icon made every session log a favicon 404, which showed up as a
  // console error in the first phone screenshot audit.
  test('no stray favicon request, and no console noise', async ({ game }) => {
    const log = await resetGame(game);
    const href = await game.evaluate(() => {
      const l = document.querySelector('link[rel=icon]');
      return l ? l.getAttribute('href') : null;
    });
    expect(href).toBe('data:,');
    expectNoErrors(log);
  });

  // The contextual STORE/MOUNT pill used to clip the top of the control hint line.
  test('the contextual pill sits clear of the control hint', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(() => {
      btnContext.classList.add('on');
      const a = btnContext.getBoundingClientRect();
      const b = document.getElementById('touchhint').getBoundingClientRect();
      btnContext.classList.remove('on');
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return { overlapY: Math.round(oy) };
    });
    expect(res.overlapY, 'vertical overlap with the hint line').toBeLessThanOrEqual(1);
  });

  // The touch help glyph and the desktop fullscreen glyph both landed on the JUMP
  // button on a landscape phone.
  test('no control sits on top of another control', async ({ game }) => {
    await resetGame(game);
    const l = await layout(game);
    expect(l.clashes, 'overlapping controls').toEqual([]);
    expect(l.outside, 'controls outside the viewport').toEqual([]);
  });
});
