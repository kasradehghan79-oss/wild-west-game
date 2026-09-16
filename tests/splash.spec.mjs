/* ==========================================================================
   The Wild West - tests/splash.spec.mjs
   The opening screen: a day painted behind the title, six rounds of index, and
   a stop when the match starts. It runs from the boot, before PLAY, so every
   test here reloads rather than using the shared reset - a reset starts a round
   and that is exactly what takes the opening down.

   The animation clock counts painted frames, so a still frame is also asserted:
   after the six rounds the picture must stop changing, or a machine that has
   stopped animating would look like one that is doing its job.
   ========================================================================== */
import { test, expect } from './support/fixtures.mjs';
import { expectNoErrors } from './support/game.mjs';

/** A corner of the canvas, sampled from the live 2D context. */
async function skyPixel(page) {
  return page.evaluate(() => {
    const cv = document.getElementById('splash');
    const [r, g, b, a] = cv.getContext('2d').getImageData(30, 30, 1, 1).data;
    return { r, g, b, a };
  });
}

async function bootOpening(page) {
  await page.reload();
  await page.waitForFunction(() => typeof Splash === 'object' && Splash.state.frame > 0);
}

test.describe('the opening screen', () => {
  test('paints a full-screen sky, dark as a night, and walks it into day', async ({ game }) => {
    await bootOpening(game);
    const box = await game.evaluate(() => {
      const r = document.getElementById('splash').getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    const vp = game.viewportSize();
    expect(box.w, 'the opening covers the width').toBe(vp.width);
    expect(box.h, 'the opening covers the height').toBe(vp.height);

    const early = await skyPixel(game);
    expect(early.a, 'the sky is painted, not left transparent').toBe(255);

    // The clock counts painted frames, so on a loaded machine the first sample
    // can land well into the day: the honest claim is that the sky moves, not
    // which palette it was wearing when the test looked.
    await game.waitForFunction(() => Splash.state.progress >= 0.7, null, { timeout: 60000 });
    const late = await skyPixel(game);
    expect(late, 'the day walks the sky').not.toEqual(early);
    expectNoErrors(game.__log);
  });

  test('is six rounds of index, then holds the finished frame', async ({ game }) => {
    await bootOpening(game);
    expect(await game.evaluate(() => Splash.state.steps), 'six chambers, six steps').toBe(6);

    await game.waitForFunction(() => Splash.state.progress >= 1, null, { timeout: 60000 });
    expect(await game.evaluate(() => Splash.running), 'the opening stops animating at the end').toBe(false);
    // the title screen is still up, so the picture has to stay
    expect(await game.evaluate(() => document.getElementById('splash').classList.contains('gone'))).toBe(false);

    const held = await skyPixel(game);
    await game.waitForTimeout(700);
    expect(await skyPixel(game), 'the held frame does not drift').toEqual(held);
    expectNoErrors(game.__log);
  });

  test('PLAY takes the opening down and gives the menu its own background', async ({ game }) => {
    await bootOpening(game);
    await game.click('#startBtn');
    await game.waitForFunction(() => document.getElementById('start')
      && !document.getElementById('start').classList.contains('show'), null, { timeout: 30000 });

    const after = await game.evaluate(() => ({
      running: Splash.running,
      gone: document.getElementById('splash').classList.contains('gone'),
      solid: document.getElementById('start').classList.contains('solid')
    }));
    expect(after.running, 'the clock stops with the match').toBe(false);
    expect(after.gone, 'the canvas leaves the compositor').toBe(true);
    expect(after.solid, 'the menu brings back its own background').toBe(true);

    await game.waitForTimeout(700);
    expect(await game.evaluate(() => document.getElementById('splash').style.display),
      'and it is out of the layout a moment later').toBe('none');
    expectNoErrors(game.__log);
  });
});

test.describe('the opening screen, when motion is turned down', () => {
  test('draws the finished day once and leaves the machine alone', async ({ browser, game }) => {
    const url = new URL('/index.html', game.url()).href;
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => typeof Splash === 'object' && Splash.state.frame > 0);

    const first = await page.evaluate(() => ({
      reduced: Splash.state.reduced, running: Splash.running, progress: Splash.state.progress
    }));
    expect(first.reduced, 'the preference is read').toBe(true);
    expect(first.running, 'nothing is scheduled').toBe(false);
    expect(first.progress, 'the finished day is what is drawn').toBe(1);

    const held = await skyPixel(page);
    expect(held.a, 'a real frame, not an empty canvas').toBe(255);
    await page.waitForTimeout(600);
    expect(await skyPixel(page), 'and it does not move').toEqual(held);
    expect(errors, 'no page errors').toEqual([]);
    await ctx.close();
  });
});
