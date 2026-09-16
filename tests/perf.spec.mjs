/* ==========================================================================
   The Wild West - tests/perf.spec.mjs
   Performance is a feature that regresses quietly, so it gets a budget. These are
   ceilings, not targets: the headless GL driver is software, so frame *rate* here
   means nothing, but the work per frame, the draw call count and the quality tiers
   mean the same thing on any driver.

   This is the one file that runs the real pipeline (shadows, post chain), which is
   why the other specs seed the cheap tier.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { boot, gameState, expectNoErrors } from './support/game.mjs';

test.describe('frame budget', () => {
  test('the heaviest tier stays inside its per frame budget and does not leak', async ({ page }) => {
    const log = await boot(page, { quality: 2, seedSettings: false });
    await page.evaluate(() => { settings.quality = 2; saveSettings(); applyQuality(); });
    await page.waitForTimeout(1200);
    const info = await page.evaluate(() => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      textures: renderer.info.memory.textures,
      programs: renderer.info.programs ? renderer.info.programs.length : 0,
      geometries: renderer.info.memory.geometries,
      scene: scene.children.length
    }));
    test.info().annotations.push({ type: 'draw calls / triangles', description: info.calls + ' / ' + info.triangles });
    expect(info.calls, 'draw calls per frame').toBeLessThan(1200);
    expect(info.triangles, 'triangles per frame').toBeLessThan(900000);
    expect(info.textures, 'textures held').toBeLessThan(400);
    expect(info.programs, 'shader programs').toBeLessThan(80);

    // A stretch of play, shooting, must not grow the scene without bound. The real
    // question is not "did the count rise" - pools fill up on purpose - but "does it
    // keep rising", so this samples twice and compares the two rises.
    const shootFor = async (rounds) => {
      await page.evaluate(async n => {
        keys['KeyW'] = true;
        for (let i = 0; i < n; i++) {
          lastShot = 0;
          shoot();
          await new Promise(r => requestAnimationFrame(r));
        }
        keys['KeyW'] = false;
      }, rounds);
      await page.evaluate(async () => {
        for (let i = 0; i < 8; i++) await new Promise(r => requestAnimationFrame(r));
      });
      return page.evaluate(() => ({
        geometries: renderer.info.memory.geometries,
        scene: scene.children.length
      }));
    };
    const first = await shootFor(30);
    const second = await shootFor(30);
    const grew = { geometries: second.geometries - first.geometries, scene: second.scene - first.scene };
    test.info().annotations.push({ type: 'object growth (2nd batch)', description: JSON.stringify(grew) });
    expect(grew.geometries, 'a second batch of shooting must not keep allocating').toBeLessThan(40);
    expect(grew.scene, 'scene children must plateau').toBeLessThan(40);
    expect(await page.evaluate(() => Mode.live())).toBe(true);
    expectNoErrors(log);
  });

  test('every quality tier changes the right knobs, renders, and is remembered', async ({ page }) => {
    const log = await boot(page, { quality: 2, seedSettings: false });
    const touch = await page.evaluate(() => isTouch);
    for (const q of [0, 1, 2]) {
      const applied = await page.evaluate(async tier => {
        settings.quality = tier;
        saveSettings();
        applyQuality();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return {
          shadows: renderer.shadowMap.enabled,
          sunShadow: sun.castShadow,
          map: sun.shadow.mapSize.x,
          ratio: renderer.getPixelRatio(),
          dpr: devicePixelRatio,
          post: Post.enabled,
          frames: frame
        };
      }, q);
      const want = Math.min(applied.dpr, touch ? 1.5 + 0.25 * q : (q > 0 ? 2 : 1));
      expect(applied.shadows, 'tier ' + q + ' shadows').toBe(q > 0);
      expect(applied.sunShadow, 'tier ' + q + ' sun shadow').toBe(q > 0);
      expect(applied.post, 'tier ' + q + ' post chain').toBe(q > 0);
      expect(applied.map, 'tier ' + q + ' shadow map').toBe(q > 1 ? 2048 : 1024);
      expect(applied.ratio, 'tier ' + q + ' render scale').toBeCloseTo(want, 2);
      expect(applied.frames).toBeGreaterThan(0);
    }
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wildwest.settings')).quality)).toBe(2);
    expectNoErrors(log);
  });

  test('a real phone device ratio scales the drawing buffer up, without stalling', async ({ page, context }) => {
    // The suite runs the phone project at ratio 1 to stay quick; this one test
    // emulates the real 2.625 and checks the buffer the renderer actually allocates.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 919, height: 413, deviceScaleFactor: 2.625, mobile: true,
      screenOrientation: { type: 'landscapePrimary', angle: 90 }
    });
    const log = await boot(page, { quality: 2, seedSettings: false });
    const res = await page.evaluate(async () => {
      applyQuality();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const canvas = renderer.domElement;
      const times = [];
      let last = performance.now();
      for (let i = 0; i < 12; i++) {
        await new Promise(r => requestAnimationFrame(r));
        const now = performance.now();
        times.push(now - last);
        last = now;
      }
      times.sort((a, b) => a - b);
      return {
        dpr: devicePixelRatio,
        ratio: renderer.getPixelRatio(),
        buffer: [canvas.width, canvas.height],
        css: [canvas.clientWidth, canvas.clientHeight],
        median: +times[times.length >> 1].toFixed(1)
      };
    });
    test.info().annotations.push({ type: 'buffer / median frame ms', description: res.buffer.join('x') + ' / ' + res.median });
    expect(res.dpr).toBeCloseTo(2.625, 2);
    const touch = await page.evaluate(() => isTouch);
    if (touch) {
      expect(res.ratio, 'a phone renders above 1x so the image is not a blocky upscale').toBeGreaterThan(1.4);
      expect(res.ratio).toBeLessThanOrEqual(2);
    } else {
      expect(res.ratio).toBeLessThanOrEqual(2);
    }
    expect(Math.abs(res.buffer[0] - res.css[0] * res.ratio), 'the drawing buffer is the canvas times the render scale').toBeLessThanOrEqual(1);
    expect(res.median, 'even in software this must not be a stall').toBeLessThan(8000);
    expectNoErrors(log);
  });
});
