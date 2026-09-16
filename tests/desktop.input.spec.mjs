/* ==========================================================================
   The Wild West - tests/desktop.input.spec.mjs
   The desktop build only: keyboard, mouse look and the browser chrome that must
   *not* appear on a phone.
   ========================================================================== */
import { test, expect, resetGame } from './support/fixtures.mjs';
import { gameState, patch, expectNoErrors, layout } from './support/game.mjs';

test.describe('desktop', () => {
  test('the chrome is the desktop one: no touch layer, PC sheet, fullscreen offered', async ({ game }) => {
    await resetGame(game);
    const chrome = await game.evaluate(() => {
      const h = document.getElementById('btnHelp').getBoundingClientRect();
      const panel = document.getElementById('rightpanel').getBoundingClientRect();
      return {
        touchClass: document.body.classList.contains('touch'),
        maxTouchPoints: navigator.maxTouchPoints,
        touchUI: getComputedStyle(document.getElementById('touchUI')).display,
        hint: getComputedStyle(document.getElementById('touchhint')).display,
        fullscreen: getComputedStyle(document.getElementById('btnFsPc')).display,
        pcSheet: getComputedStyle(document.querySelector('#helptext .pc')).display,
        touchSheet: getComputedStyle(document.querySelector('#helptext .tv')).display,
        helpRight: h.right,
        helpTop: h.y,
        // a real overlap needs both axes: the panel grows downwards with the wanted
        // stars, and the button may sit beside the rail as long as it clears it
        overlapWithMinimap: (() => {
          const ox = Math.min(h.right, panel.right) - Math.max(h.left, panel.left);
          const oy = Math.min(h.bottom, panel.bottom) - Math.max(h.top, panel.top);
          return (ox > 1 && oy > 1) ? Math.round(Math.min(ox, oy)) : 0;
        })(),
        vw: innerWidth
      };
    });
    expect(chrome.touchClass, 'no touch class on a desktop').toBe(false);
    expect(chrome.maxTouchPoints).toBe(0);
    expect(chrome.touchUI).toBe('none');
    expect(chrome.hint).toBe('none');
    expect(chrome.fullscreen, 'the browser fullscreen button is offered').toBe('flex');
    expect(chrome.pcSheet).toBe('inline');
    expect(chrome.touchSheet).toBe('none');
    expect(chrome.helpRight, 'the help glyph hugs the right edge').toBeGreaterThan(chrome.vw - 60);
    expect(chrome.helpTop, 'and stays in the top band').toBeLessThan(260);
    expect(chrome.overlapWithMinimap, 'without sitting on the minimap rail').toBeLessThanOrEqual(1);
  });

  test('keyboard: WASD, Shift, Space, R, 1/2 and Esc all do their job', async ({ game }) => {
    const log = await resetGame(game);
    await patch(game, { pos: [0, 0] });

    await game.keyboard.down('w');
    await game.waitForTimeout(700);
    const walked = await gameState(game);
    await game.keyboard.up('w');
    expect(Math.hypot(walked.pos.x, walked.pos.z), 'W walked').toBeGreaterThan(0.4);
    const released = await game.evaluate(() => ({ w: !!keys['KeyW'], a: !!keys['KeyA'], s: !!keys['KeyS'], d: !!keys['KeyD'] }));
    expect(released, 'every movement key came back up').toEqual({ w: false, a: false, s: false, d: false });

    await patch(game, { pos: [0, 0] });
    await game.keyboard.down('Shift');
    await game.keyboard.down('w');
    await game.waitForTimeout(700);
    const sprint = await game.evaluate(() => ({ x: player.g.position.x, stam, shift: !!keys['ShiftLeft'] }));
    await game.keyboard.up('w');
    await game.keyboard.up('Shift');
    expect(sprint.shift, 'the sprint key was down').toBe(true);
    expect(sprint.stam, 'stamina spent').toBeLessThan(100);

    const air = await game.evaluate(async () => {
      let peak = 0;
      keys['Space'] = true;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => requestAnimationFrame(r));
        peak = Math.max(peak, player.g.position.y - heightAt(player.g.position.x, player.g.position.z));
        if (i === 3) keys['Space'] = false;
      }
      keys['Space'] = false;
      return peak;
    });
    expect(air, 'Space jumped').toBeGreaterThan(0.3);

    await patch(game, { rifle: true, ammo: 1 });
    await game.keyboard.press('r');
    await game.waitForFunction(() => reloading === true);
    await game.waitForFunction(() => reloading === false, null, { timeout: 8000 });
    expect((await gameState(game)).ammo, 'R reloaded').toBeGreaterThan(1);

    await game.keyboard.press('1');
    expect(await game.evaluate(() => curWeapon)).toBe('revolver');
    await game.keyboard.press('2');
    expect(await game.evaluate(() => curWeapon)).toBe('rifle');

    await game.keyboard.press('Escape');
    await game.waitForFunction(() => Mode.current() === 'paused');
    await expect(game.locator('#pause')).toBeVisible();
    await game.keyboard.press('Escape');
    await game.waitForFunction(() => Mode.current() === 'playing');
    await expect(game.locator('#pause')).toBeHidden();
    expectNoErrors(log);
  });

  test('mouse look turns the camera when pointer lock is unavailable', async ({ game }) => {
    const log = await resetGame(game);
    const before = await game.evaluate(() => ({ yaw, pitch }));
    const box = await game.locator('#view').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await game.mouse.move(cx, cy);
    await game.mouse.down({ button: 'right' });
    for (let i = 1; i <= 8; i++) await game.mouse.move(cx + i * 12, cy + i * 4);
    await game.mouse.up({ button: 'right' });
    const after = await game.evaluate(() => ({ yaw, pitch }));
    expect(after.yaw, 'yaw followed the drag').not.toBe(before.yaw);
    expect(after.pitch, 'pitch followed the drag').not.toBe(before.pitch);

    // and the pointer lock failure path stays quiet
    for (let i = 0; i < 4; i++) await game.mouse.click(box.x + 100 + i, box.y + 100);
    await game.waitForTimeout(300);
    expect(log.errors.filter(e => /pointer/i.test(e))).toEqual([]);
    expectNoErrors(log);
  });

  test('the desktop layout has room for everything', async ({ game }) => {
    await resetGame(game);
    const l = await layout(game);
    expect(l.clashes).toEqual([]);
    const overlap = await game.evaluate(() => {
      const a = document.getElementById('btnHelp').getBoundingClientRect();
      const b = document.getElementById('rightpanel').getBoundingClientRect();
      return Math.round(Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    });
    expect(overlap).toBeLessThanOrEqual(1);
  });
});
