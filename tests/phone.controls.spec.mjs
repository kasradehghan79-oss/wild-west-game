/* ==========================================================================
   The Wild West - tests/phone.controls.spec.mjs
   The touch build only: the stick, the look drag and every on screen button,
   driven with real CDP touch events rather than synthetic clicks.
   ========================================================================== */
import { test, expect, resetGame } from './support/fixtures.mjs';
import { gameState, patch, expectNoErrors, touchButton, stickMove, lookDrag, touchDrag } from './support/game.mjs';

test.describe('touch controls', () => {
  test('the stick walks, sprints at the rim, and shows and hides itself', async ({ game }) => {
    const log = await resetGame(game);
    // walk: a gentle push, short of the sprint radius
    await patch(game, { pos: [0, 0], yaw: 0 });
    await game.evaluate(() => { stam = 100; stamLock = false; });
    await stickMove(game, 0, -26);
    const walk = await game.evaluate(() => ({ x: player.g.position.x, z: player.g.position.z, stam }));

    // sprint: the same push, out at the rim
    await patch(game, { pos: [0, 0], yaw: 0 });
    await game.evaluate(() => { stam = 100; stamLock = false; });
    await stickMove(game, 0, -42, { sprint: true });
    const run = await game.evaluate(() => ({ x: player.g.position.x, z: player.g.position.z, stam }));

    const dist = p => Math.hypot(p.x, p.z);
    expect(dist(walk), 'the stick moved the player').toBeGreaterThan(0.15);
    expect(dist(run), 'and the rim push ran further').toBeGreaterThan(dist(walk) * 1.2);
    expect(run.stam, 'sprinting cost stamina').toBeLessThan(walk.stam);

    // the stick is only on screen while a finger is down, and releases cleanly
    expect(await game.evaluate(() => getComputedStyle(document.getElementById('stick')).display)).toBe('none');
    const cdp = await game.context().newCDPSession(game);
    const vp = game.viewportSize();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: vp.width * 0.2, y: vp.height * 0.6, radiusX: 6, radiusY: 6, force: 1, id: 1 }]
    });
    const shown = await game.evaluate(() => ({
      display: getComputedStyle(document.getElementById('stick')).display,
      placed: document.getElementById('stick').style.left !== ''
    }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    expect(shown.display).toBe('block');
    expect(shown.placed).toBe(true);
    const released = await game.evaluate(() => ({
      display: getComputedStyle(document.getElementById('stick')).display,
      held: Object.keys(keys).filter(k => keys[k])
    }));
    expect(released.display).toBe('none');
    expect(released.held, 'no key left stuck down').toEqual([]);
    expectNoErrors(log);
  });

  test('a swipe can come about: holding at the screen edge keeps turning', async ({ game }) => {
    const log = await resetGame(game);
    const vp = game.viewportSize();
    const deg = (a, b) => +(((b - a) * 180) / Math.PI).toFixed(0);

    const before = await game.evaluate(() => yaw);
    // A thumb can only travel from the right edge to the middle of the screen, which caps
    // a bare drag at about 115 degrees. Holding a finger in the edge zone has to keep the
    // camera turning, or the player can never come about.
    await touchDrag(game, [vp.width * 0.6, vp.height * 0.5], [vp.width - 14, vp.height * 0.5],
      // 4 seconds of wall clock is only about a second of game time under the software
      // renderer, and the turn is per second of game time
      { steps: 8, stepMs: 14, hold: 4200 });
    const after = await game.evaluate(() => yaw);
    const turned = deg(before, after);
    expect(Math.abs(turned), 'one swipe turned ' + turned + ' degrees').toBeGreaterThan(170);
    expectNoErrors(log);
  });

  test('dragging on the right half turns the camera', async ({ game }) => {
    await resetGame(game);
    const before = await game.evaluate(() => ({ yaw, pitch }));
    await lookDrag(game, 140, 0);
    const turned = await game.evaluate(() => ({ yaw, pitch }));
    expect(Math.abs(turned.yaw - before.yaw), 'yaw changed').toBeGreaterThan(0.1);
    await lookDrag(game, 0, 110);
    const pitched = await game.evaluate(() => ({ yaw, pitch }));
    expect(Math.abs(pitched.pitch - turned.pitch), 'pitch changed').toBeGreaterThan(0.1);
  });

  test('FIRE, AIM, RELOAD and JUMP all reach the game', async ({ game }) => {
    await resetGame(game);
    // FIRE: a tap spends a round, a held press keeps firing at the weapon rate
    const before = await game.evaluate(() => ammo);
    await touchButton(game, '#btnFire');
    await game.waitForTimeout(350);
    expect(await game.evaluate(() => ammo), 'the tap fired').toBeLessThan(before);
    const held = await game.evaluate(async () => {
      const start = ammo;
      fireHold = true;
      await new Promise(r => setTimeout(r, 800));
      fireHold = false;
      return { start, end: ammo };
    });
    expect(held.end, 'held fire spent more rounds').toBeLessThan(held.start);

    // AIM: toggles, and lights the button
    await touchButton(game, '#btnAim');
    await game.waitForFunction(() => aiming === true);
    await expect(game.locator('#btnAim')).toHaveClass(/active/);
    await touchButton(game, '#btnAim');
    await game.waitForFunction(() => aiming === false);
    await expect(game.locator('#btnAim')).not.toHaveClass(/active/);

    // RELOAD
    await game.evaluate(() => setAmmo(1));
    await touchButton(game, '#btnReload');
    await game.waitForFunction(() => reloading === true);
    await game.waitForFunction(() => reloading === false, null, { timeout: 8000 });
    const s = await gameState(game);
    expect(s.ammo).toBe(s.magSize);

    // JUMP
    await game.evaluate(() => {
      window.__peak = 0;
      window.__watching = true;
      (function watch() {
        if (!window.__watching) return;
        window.__peak = Math.max(window.__peak,
          player.g.position.y - heightAt(player.g.position.x, player.g.position.z));
        requestAnimationFrame(watch);
      })();
    });
    await touchButton(game, '#btnJump');
    await game.waitForTimeout(600);
    const peak = await game.evaluate(() => { window.__watching = false; return window.__peak; });
    expect(peak, 'left the ground').toBeGreaterThan(0.3);
  });

  test('PAUSE freezes, and the contextual pill mounts and dismounts', async ({ game }) => {
    await resetGame(game);
    await touchButton(game, '#btnPause');
    await game.waitForFunction(() => Mode.current() === 'paused');
    await expect(game.locator('#pause')).toBeVisible();
    const frozen = await game.evaluate(async () => {
      const npc = npcs.find(n => !n.dead);
      const p0 = [npc.g.position.x, npc.g.position.z];
      const t0 = roundT;
      await new Promise(r => setTimeout(r, 800));
      return { moved: Math.hypot(npc.g.position.x - p0[0], npc.g.position.z - p0[1]), dt: t0 - roundT };
    });
    expect(frozen.moved).toBe(0);
    expect(frozen.dt).toBe(0);
    await game.locator('#resumeBtn').click();
    await game.waitForFunction(() => Mode.live());

    // stand next to the horse: the loop offers MOUNT on the pill
    const offered = await game.evaluate(async () => {
      player.g.position.set(horse.g.position.x + 1.2, horse.g.position.y, horse.g.position.z);
      await new Promise(r => setTimeout(r, 400));
      return { on: btnContext.classList.contains('on'), action: btnContext.dataset.action, label: ctxLabel.textContent };
    });
    expect(offered.on, 'the pill is offered').toBe(true);
    expect(offered.action).toBe('mount');
    expect(offered.label).toContain('MOUNT');

    await touchButton(game, '#btnContext');
    await game.waitForFunction(() => mounted === true);
    await game.waitForFunction(() => ctxLabel.textContent.includes('DISMOUNT'), null, { timeout: 5000 });
    await touchButton(game, '#btnContext');
    await game.waitForFunction(() => mounted === false);
  });

  test('the help button opens the touch cheat sheet', async ({ game }) => {
    await resetGame(game);
    await touchButton(game, '#btnHelp');
    await game.waitForFunction(() => getComputedStyle(helpText).display === 'block');
    const sheet = await game.evaluate(() => ({
      text: helpText.innerText,
      pc: getComputedStyle(document.querySelector('#helptext .pc')).display,
      tv: getComputedStyle(document.querySelector('#helptext .tv')).display
    }));
    expect(sheet.tv).toBe('inline');
    expect(sheet.pc).toBe('none');
    expect(sheet.text).toContain('TOUCH');
    expect(sheet.text).not.toContain('WASD');
    await touchButton(game, '#btnHelp');
    await game.waitForFunction(() => getComputedStyle(helpText).display === 'none');
  });
});
