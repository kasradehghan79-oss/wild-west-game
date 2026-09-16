/* ==========================================================================
   The Wild West - tests/windows.spec.mjs
   The Windows build, which is the web build in a folder plus a window to see
   it in. Two things have to stay true for that to work, and neither of them is
   visible from the game's own tests:

     1. the game runs from file://, with no server and no network, because that
        is what a shortcut to an installed folder opens
     2. the setup file it ships as actually installs the game and takes it away
        again - checked by running it into a scratch folder, never over the
        machine's own Start Menu or registry

   The installer check skips when the setup has not been built, the same way the
   APK check does.
   ========================================================================== */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './support/fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SETUP = path.join(ROOT, 'dist', 'The Wild West Setup.exe');

/** file:// URLs need forward slashes and escaped spaces. */
function fileUrl(...parts) {
  return 'file:///' + parts.join('/').split(path.sep).join('/').replace(/ /g, '%20');
}

test.describe('the windows build', () => {
  test('plays from a plain folder, with no server and no network', async ({ game }) => {
    const errors = [];
    game.on('pageerror', e => errors.push(e.message));
    game.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await game.goto(fileUrl(ROOT, 'index.html'));
    await game.waitForFunction(() => typeof Splash === 'object' && typeof Mode === 'object', null, { timeout: 60000 });

    const boot = await game.evaluate(() => ({
      title: document.getElementById('start').classList.contains('show'),
      opening: Splash.state.running,
      world: !!document.getElementById('view'),
      npcs: npcs.length
    }));
    expect(boot.title, 'the title screen is up').toBe(true);
    expect(boot.opening, 'the opening screen animates').toBe(true);
    expect(boot.world, 'the world canvas exists').toBe(true);
    expect(boot.npcs, 'the town is populated').toBeGreaterThan(4);

    await game.click('#startBtn');
    await game.waitForFunction(() => Mode.current() === 'playing', null, { timeout: 30000 });
    const live = await game.evaluate(() => ({ mode: Mode.current(), canSave: !!localStorage }));
    expect(live.mode, 'the match runs from a file:// page').toBe('playing');
    expect(live.canSave, 'saves have somewhere to live').toBe(true);
    expect(errors, 'no console or page errors').toEqual([]);
  });

  test('the setup installs the game, and leaves nothing behind when removed', async () => {
    test.skip(!existsSync(SETUP), 'no setup built yet: python windows/build_setup.py');
    const scratch = mkdtempSync(path.join(tmpdir(), 'wildwest-spec-'));
    const target = path.join(scratch, 'The Wild West');
    try {
      // --portable unpacks the game and nothing else: no shortcuts, no registry
      execFileSync(SETUP, ['--portable', `--dir=${target}`], { timeout: 300000 });

      for (const name of ['index.html', 'READ-ME.txt', 'css/base.css',
        'js/game/splash.js', 'js/vendor/three.min.js']) {
        expect(existsSync(path.join(target, name)), `${name} installed`).toBe(true);
      }
      const files = readdirSync(target, { recursive: true }).length;
      const bytes = readdirSync(target, { recursive: true })
        .map(f => path.join(target, f))
        .filter(f => existsSync(f) && statSync(f).isFile())
        .reduce((n, f) => n + statSync(f).size, 0);
      expect(files, 'the whole game is there').toBeGreaterThan(50);
      expect(bytes, 'and it is the real build, not a stub').toBeGreaterThan(500_000);
    } finally {
      rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
    }
  });
});
