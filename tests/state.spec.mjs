/* ==========================================================================
   The Wild West - tests/state.spec.mjs
   Mode is the one author of "the game is frozen", so these specs check two
   things: that every UI takes the world down with it, and that when it is up
   again the world wakes back up. A world that keeps ticking behind a menu - or
   that never restarts once a menu has closed - are both failures.
   ========================================================================== */
import { test, expect, resetGame } from './support/fixtures.mjs';
import { gameState, probe, expectNoErrors, waitForMode } from './support/game.mjs';

async function flagsAgree(game) {
  return game.evaluate(() => {
    const m = Mode.current();
    const wantPaused = m === MODE.PAUSED || m === MODE.DIALOGUE || m === MODE.INVENTORY;
    return { m, paused, shopOpen, ok: paused === wantPaused && shopOpen === (m === MODE.SHOP) };
  });
}

test.describe('state machine', () => {
  test('pause freezes every clock in the world, resume wakes all of them', async ({ game }) => {
    const log = await resetGame(game);
    expect((await flagsAgree(game)).ok).toBe(true);

    await game.evaluate(() => setPaused(true));
    await waitForMode(game, 'paused');
    expect((await flagsAgree(game)).ok).toBe(true);
    await expect(game.locator('#pause')).toBeVisible();

    const frozen = await probe(game, 6);
    expect(frozen.npcMoved, 'no NPC moved').toBe(0);
    expect(frozen.playerMoved).toBe(0);
    expect(frozen.horseMoved).toBe(0);
    expect(frozen.roundTDelta, 'the round clock stopped').toBe(0);
    expect(frozen.dayTimeDelta, 'the day clock stopped').toBe(0);
    expect(frozen.hpDelta, 'passive healing stopped').toBe(0);
    expect(frozen.playtimeDelta, 'play time stopped').toBe(0);
    expect(frozen.framesRendered, 'but it is still drawing the menu backdrop').toBeGreaterThan(1);

    await game.evaluate(() => setPaused(false));
    await waitForMode(game, 'playing');
    const awake = await probe(game, 6);
    expect(awake.npcMoved, 'the town is alive again').toBeGreaterThan(0.15);
    expect(awake.roundTDelta, 'the clock runs again').toBeLessThan(0);
    expect(awake.dayTimeDelta).toBeGreaterThan(0);
    expect(awake.playtimeDelta).toBeGreaterThan(0);
    expect((await flagsAgree(game)).ok).toBe(true);

    // the events later systems subscribe to are actually emitted
    const seen = await game.evaluate(async () => {
      const hits = [];
      ['mode:change', 'round:start', 'round:end', 'player:hurt', 'player:died']
        .forEach(c => Bus.on(c, () => hits.push(c)));
      setPaused(true); setPaused(false);
      hurtPlayer(1);
      hp = 0.5; hurtPlayer(1);
      await new Promise(r => setTimeout(r, 200));
      return { hits, listeners: Bus.count('mode:change') };
    });
    expect(seen.hits).toContain('mode:change');
    expect(seen.hits).toContain('player:hurt');
    expect(seen.hits).toContain('player:died');
    expect(seen.listeners).toBeGreaterThan(0);
    expectNoErrors(log);
  });

  test('the store and the save screen freeze the world and hand back cleanly', async ({ game }) => {
    await resetGame(game);

    // the store
    await game.evaluate(() => openShop());
    await waitForMode(game, 'shop');
    await expect(game.locator('#shop')).toBeVisible();
    expect((await flagsAgree(game)).ok).toBe(true);
    const inShop = await probe(game, 6);
    expect(inShop.npcMoved).toBe(0);
    expect(inShop.roundTDelta).toBe(0);
    // ESC closes the store rather than stacking the pause menu on top of it
    await game.keyboard.press('Escape');
    await expect(game.locator('#shop')).toBeHidden();
    expect(await game.evaluate(() => Mode.current())).toBe('playing');
    await expect(game.locator('#pause')).toBeHidden();

    // the save screen, which opens over the pause menu
    await game.evaluate(() => setPaused(true));
    await game.locator('#pauseSaveBtn').click();
    await game.waitForFunction(() => getComputedStyle(savesEl).display !== 'none');
    expect((await probe(game, 6)).npcMoved).toBe(0);
    await game.locator('#savesClose').click();
    await game.waitForFunction(() => getComputedStyle(savesEl).display === 'none');
    await expect(game.locator('#pause')).toBeVisible();
    expect(await game.evaluate(() => Mode.current())).toBe('paused');
  });

  test('the round card and death freeze the world, and both tap through to play', async ({ game }) => {
    await resetGame(game);

    // the round card
    await game.evaluate(() => endRound('law', 'timeout'));
    await waitForMode(game, 'over');
    const over = await probe(game, 6);
    expect(over.npcMoved).toBe(0);
    expect(over.roundTDelta).toBe(0);
    await game.locator('#roundend').click();
    await waitForMode(game, 'playing');
    expect((await probe(game, 6)).npcMoved).toBeGreaterThan(0.1);

    // death
    await game.evaluate(() => { hp = 1; hurtPlayer(3); });
    await waitForMode(game, 'dead');
    expect(await game.evaluate(() => Mode.live())).toBe(false);
    await expect(game.locator('#dead')).toBeVisible();
    await game.locator('#dead').click();
    await waitForMode(game, 'playing');
    const s = await gameState(game);
    expect(s.playerDead).toBe(false);
    expect(s.hp).toBe(s.maxHp);
  });

  test('a throwing listener is reported but cannot take the frame down', async ({ game }) => {
    const log = await resetGame(game);
    await game.evaluate(() => {
      Bus.on('round:start', () => { throw new Error('listener blew up on purpose'); });
    });
    await game.evaluate(() => startRound());
    const s = await gameState(game);
    expect(s.live).toBe(true);
    expect(log.errors.join('\n'), 'the failure is reported, not swallowed').toContain('listener blew up on purpose');
  });
});
