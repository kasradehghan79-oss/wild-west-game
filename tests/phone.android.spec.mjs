/* ==========================================================================
   The Wild West - tests/android.spec.mjs
   The Android shell is a WebView around the same page, and it is detected by a
   `WildWestApp` object the activity injects before any page script runs. These
   specs fake that injection, so the shell-only behaviour is covered without an
   emulator: the browser fullscreen affordance has to disappear, and everything
   else has to keep working - including storage, which is where saves actually
   live inside the app.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { boot, gameState, patch, expectNoErrors, touchButton } from './support/game.mjs';

test.describe('inside the Android shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { window.WildWestApp = { shell: 'test' }; });
  });

  test('the page detects the shell, hides the fullscreen button and still plays and saves', async ({ page }) => {
    const log = await boot(page);
    const detected = await page.evaluate(() => ({
      shell: typeof WildWestApp !== 'undefined',
      fsInline: document.getElementById('btnFs').style.display,
      fsPc: getComputedStyle(document.getElementById('btnFsPc')).display,
      touchUI: getComputedStyle(document.getElementById('touchUI')).display,
      touch: document.body.classList.contains('touch')
    }));
    expect(detected.shell).toBe(true);
    expect(detected.fsInline, 'the touch fullscreen button is hidden in the app').toBe('none');
    expect(detected.fsPc, 'and so is the desktop one').toBe('none');
    expect(detected.touch).toBe(true);
    expect(detected.touchUI, 'the on screen controls are still there').toBe('block');

    // the game plays
    await patch(page, { pos: [0, 0] });
    await page.evaluate(() => { keys['KeyW'] = true; });
    await page.waitForTimeout(600);
    await page.evaluate(() => { keys['KeyW'] = false; });
    const s = await gameState(page);
    expect(s.live).toBe(true);
    expect(Math.hypot(s.pos.x, s.pos.z), 'moved').toBeGreaterThan(0.3);

    // pausing has to come from the on screen button: there is no keyboard or Esc
    await touchButton(page, '#btnPause');
    await page.waitForFunction(() => Mode.current() === 'paused');
    expect(await page.evaluate(() => Mode.live())).toBe(false);
    await page.evaluate(() => setPaused(false));

    // storage works, which is what saves depend on inside the WebView
    await patch(page, { cash: 77, roundNum: 2 });
    expect(await page.evaluate(() => Save.write('1')), 'the WebView gave us storage').toBe(true);
    await page.reload();
    await page.waitForFunction(() => continueBtn.classList.contains('on'));
    await page.locator('#continueBtn').click();
    await page.waitForFunction(() => Mode.live());
    const loaded = await gameState(page);
    expect(loaded.cash).toBe(77);
    expect(loaded.roundNum).toBe(2);
    expectNoErrors(log);
  });
});
