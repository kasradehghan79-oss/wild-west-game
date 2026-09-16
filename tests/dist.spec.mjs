/* ==========================================================================
   The Wild West - tests/dist.spec.mjs
   The build that ships, as opposed to the one that is read.

   tools/make-dist.mjs folds the game into one compiled script with the shared
   globals renamed, which is what stops the APK and the setup file from being a
   readable copy of the repository. That has a consequence for testing: none of
   the usual handles exist any more. There is no `Mode`, no `Splash`, no
   `player` - by design - so this spec drives the shipped build the way a player
   does, through the page: the title, the canvas, the ammo counter.

   If it passes, the obfuscation did not change what the game does. If it fails,
   nothing else about the release matters.
   ========================================================================== */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './support/fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist', 'www');
const APP = path.join(DIST, 'app.js');

/** file:// URLs need forward slashes and escaped spaces. */
function fileUrl(...parts) {
  return 'file:///' + parts.join('/').split(path.sep).join('/').replace(/ /g, '%20');
}

/** Read a pixel out of a canvas the page owns, by element id. */
async function pixel(page, id, x, y) {
  return page.evaluate(([id_, x_, y_]) => {
    const cv = document.getElementById(id_);
    const d = cv.getContext('2d').getImageData(x_, y_, 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  }, [id, x, y]);
}

test.describe('the build that ships', () => {
  test('is not the source: the names, the comments and the file layout are gone', async () => {
    test.skip(!existsSync(APP), 'no distribution built: node tools/make-dist.mjs');
    const app = readFileSync(APP, 'utf8');
    const page = readFileSync(path.join(DIST, 'index.html'), 'utf8');

    for (const leaked of ['startMatch', 'function shoot', 'Splash', 'makeHuman', 'js/game/']) {
      expect(app.includes(leaked), `app.js still mentions ${leaked}`).toBe(false);
    }
    expect(app.includes('====='), 'the banner comments are gone').toBe(false);
    expect(/^[ \t]*\/\//.test(app), 'and no line comments either').toBe(false);
    expect(page.includes('js/game/'), 'the page no longer loads the sources').toBe(false);
    expect(page.includes('js/vendor/'), 'but it still loads the vendor script').toBe(true);
    expect(page.includes('app.js'), 'and the bundle').toBe(true);
  });

  test('still plays, driven only through the page', async ({ game }) => {
    test.skip(!existsSync(APP), 'no distribution built: node tools/make-dist.mjs');
    const errors = [];
    game.on('pageerror', e => errors.push(e.message));
    game.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await game.goto(fileUrl(DIST, 'index.html'));
    await game.waitForSelector('#start.show', { timeout: 60000 });
    await expect(game.locator('#startBtn'), 'the title screen is up').toBeVisible();

    // the opening screen paints on its own canvas, which is decoration only
    const opening = await pixel(game, 'splash', 30, 30);
    expect(opening[3], 'the opening canvas is painted').toBeGreaterThan(0);

    const before = await game.textContent('#ammoCount');
    await game.click('#startBtn');
    await game.waitForFunction(() => !document.getElementById('start').classList.contains('show'),
      null, { timeout: 30000 });
    await expect(game.locator('#view'), 'the world canvas is there').toBeAttached();

    // fire: the round counter is the cheapest honest proof the compiled game runs
    await game.mouse.click(560, 380);
    await expect(game.locator('#ammoCount'), 'a shot leaves the cylinder').not.toHaveText(before, { timeout: 10000 });

    const hud = await game.evaluate(() => ({
      status: document.getElementById('status').textContent.length,
      minimap: (() => {
        const cv = document.getElementById('minimap');
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
        return false;
      })()
    }));
    expect(hud.status, 'the status line is filled in').toBeGreaterThan(0);
    expect(hud.minimap, 'the minimap draws').toBe(true);
    expect(errors, 'no page or console errors').toEqual([]);
  });
});
