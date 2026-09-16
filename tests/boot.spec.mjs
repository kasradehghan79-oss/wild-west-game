/* ==========================================================================
   The Wild West - tests/boot.spec.mjs
   The game loads, builds its world and starts a match. Three tests, because every
   test costs a full WebGL boot.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { openGame, startMatch, boot, expectNoErrors, gameState } from './support/game.mjs';

test.describe('boot', () => {
  test('every system module is present, the world is built and a round is live', async ({ page }) => {
    const log = await openGame(page);
    const world = await page.evaluate(() => ({
      bus: typeof Bus === 'object' && typeof Bus.emit === 'function' && typeof Bus.on === 'function',
      modeApi: typeof Mode === 'object' && typeof MODE === 'object',
      save: typeof Save === 'object' && typeof Save.snapshot === 'function',
      sceneChildren: scene.children.length,
      shootables: shootables.length,
      solids: solid.length,
      npcs: npcs.length,
      pickups: pickups.length,
      clouds: clouds.length,
      grassShaders: grassShaders.length,
      waterMats: waterMats.length,
      lights: scene.children.filter(o => o.isLight).length,
      hasSky: scene.children.some(o => o.isMesh && o.material && o.material.uniforms && o.material.uniforms.uZenith),
      state: Mode.current()
    }));
    expect(world.bus, 'Bus').toBe(true);
    expect(world.modeApi, 'Mode').toBe(true);
    expect(world.save, 'Save').toBe(true);
    expect(world.state, 'starts on the title screen').toBe('boot');
    expect(world.sceneChildren).toBeGreaterThan(50);
    expect(world.shootables, 'things a bullet can hit').toBeGreaterThan(50);
    expect(world.solids, 'things that block movement').toBeGreaterThan(10);
    expect(world.npcs).toBeGreaterThan(4);
    expect(world.lights).toBeGreaterThan(2);
    expect(world.grassShaders).toBeGreaterThan(0);
    expect(world.waterMats).toBeGreaterThan(0);
    expect(world.hasSky, 'the sky dome shader is in the scene').toBe(true);

    const before = (await gameState(page)).frame;
    await page.locator('#startBtn').click();
    await page.waitForFunction(() => Mode.live());
    expect(await page.locator('#start')).toBeHidden();
    const s = await gameState(page);
    expect(s.mode).toBe('playing');
    expect(s.roundNum).toBe(1);
    expect(s.hp).toBe(s.maxHp);
    expect(s.ammo).toBe(s.magSize);
    expect(s.playerDead).toBe(false);
    expect(s.roundT).toBeGreaterThan(50);
    await page.waitForTimeout(600);
    expect((await gameState(page)).frame, 'and the loop is running').toBeGreaterThan(before + 2);
    expectNoErrors(log);
  });

  test('a fresh phone profile starts on the cheap tier and has nothing to continue', async ({ page }) => {
    // the one boot in this file that does not seed settings: it is checking the
    // first launch defaults themselves
    const log = await openGame(page, { seedSettings: false });
    const fresh = await page.evaluate(() => ({
      touch: isTouch,
      quality: settings.quality,
      saved: settingsWereSaved,
      continueClass: continueBtn.className,
      start: startEl.classList.contains('show'),
      pcSheet: getComputedStyle(document.querySelector('#helptext .pc')).display
    }));
    if (fresh.touch) {
      expect(fresh.quality, 'a phone with no saved settings gets the cheap tier').toBe(0);
      expect(fresh.saved).toBe(false);
    } else {
      expect(fresh.quality, 'a desktop keeps the full tier').toBe(2);
    }
    expect(fresh.start).toBe(true);
    expect(fresh.continueClass).not.toContain('on');
    expect(fresh.pcSheet, 'the cheat sheet matches the device').toBe(fresh.touch ? 'none' : 'inline');
    expectNoErrors(log);
  });

  test('a stored save is offered as CONTINUE', async ({ page }) => {
    await boot(page);
    await page.waitForFunction(() => Save.status('auto') === 'ok');
    await page.reload();
    await page.waitForFunction(() => continueBtn.classList.contains('on'));
    await expect(page.locator('#continueBtn')).toContainText('CONTINUE');
    await expect(page.locator('#continueBtn')).toContainText('ROUND 1');
  });
});
