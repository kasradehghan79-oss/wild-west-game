/* ==========================================================================
   The Wild West - tests/support/fixtures.mjs
   Booting the game's world costs seconds: procedural geometry, canvas textures, a
   PMREM environment bake and a pile of shader compiles. That dwarfs every
   assertion in these specs, and paying it once per test is what turns a five
   minute suite into an hour long one.

   So each spec *file* shares one page - a worker scoped fixture, and Playwright
   gives each file its own worker - and every test starts from `resetGame`, which
   closes any menu, clears storage and starts a clean round. A spec that genuinely
   needs a fresh browser profile (first launch defaults, a shell that injects a
   global before load) uses the plain `page` fixture instead.
   ========================================================================== */
import { test as base, expect } from '@playwright/test';
import { watchConsole, setViewport } from './game.mjs';
import { BASE_URL } from './port.mjs';

export { expect };

export const test = base.extend({
  game: [async ({ browser }, use, workerInfo) => {
    const cfg = workerInfo.project.use;
    const context = await browser.newContext({
      viewport: cfg.viewport,
      deviceScaleFactor: cfg.deviceScaleFactor,
      hasTouch: cfg.hasTouch,
      isMobile: cfg.isMobile,
      userAgent: cfg.userAgent
    });
    const page = await context.newPage();
    page.__log = watchConsole(page);
    page.__viewport = cfg.viewport;
    // Seed the cheapest quality tier before the page loads: the world build is the
    // expensive part, and the post chain and shadow maps only add to it. Only when
    // nothing is stored, so a spec can still plant its own settings payload.
    await page.addInitScript(q => {
      try {
        if (!localStorage.getItem('wildwest.settings')) {
          localStorage.setItem('wildwest.settings', JSON.stringify({ quality: q, sens: 0.0022, volume: 0.7, invertY: false }));
        }
      } catch (e) { /* storage blocked: the game copes */ }
    }, 0);
    await page.goto(`${BASE_URL}/index.html`);
    await page.waitForFunction(() => typeof Mode === 'object' && typeof Save === 'object');
    await page.waitForFunction(() => frame > 2);
    await use(page);
    await context.close();
  }, { scope: 'worker' }]
});

// Back to a known, live, menu-free round. Returns a console view that only covers
// what happened after the reset, so one test's noise cannot fail the next.
export async function resetGame(page, { storage = true, quality = null } = {}) {
  const log = page.__log;
  const mark = { e: log.errors.length, w: log.warnings.length };
  if (page.__viewport) await setViewport(page, page.__viewport.width, page.__viewport.height);
  await page.evaluate(({ storage, quality }) => {
    if (shopOpen) closeShop();
    if (paused) setPaused(false);
    // the fixture boots straight into a round rather than clicking PLAY, so the
    // title screen has to be taken down here or it would sit over every overlay
    startEl.classList.remove('show');
    savesEl.classList.remove('show');
    helpText.style.display = 'none';
    btnContext.classList.remove('on');
    // no input may leak from the previous test
    for (const k in keys) keys[k] = false;
    // difficulty is a setting, not round state, but tests must not inherit one
    if (typeof Difficulty === 'object' && Difficulty.id !== 'deputy') Difficulty.set('deputy', { save: false });
    fireHold = false;
    recoilKick = 0; bloom = 0; playerShotT = 0;
    shooting = false;
    looking = false;
    aiming = false;
    if (storage) localStorage.clear();
    if (quality !== null) { settings.quality = quality; applyQuality(); }
    // a full baseline, so no test inherits what the previous one did
    cash = 0;
    kills = 0;
    headshots = 0;
    totalKills = 0;
    survivedRounds = 0;
    roundNum = 1;
    outlawPts = 0;
    lawPts = 0;
    dayTime = 0.26;
    playtime = 0;
    upgrades.mag = 0;
    upgrades.hp = 0;
    upgrades.reload = 0;
    upgrades.steady = 0;
    upgrades.rifle = 0;
    playerWeapons.rifle.owned = false;
    playerWeapons.rifle.ammo = 0;
    curWeapon = 'revolver';
    maxHp = maxHpNow();
    refreshHearts();
    startRound();
  }, { storage, quality });
  await page.waitForFunction(() => Mode.live() && frame > 2);
  await page.evaluate(() => refreshContinue());
  return {
    get errors() { return log.errors.slice(mark.e); },
    get warnings() { return log.warnings.slice(mark.w); },
    get all() { return log.all; }
  };
}
