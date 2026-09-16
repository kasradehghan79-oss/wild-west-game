/* ==========================================================================
   The Wild West - tests/hud.spec.mjs
   The HUD has to agree with the state behind it. Grouped into four tests so each
   one pays for a single boot and then checks a whole cluster.
   ========================================================================== */
import { test, expect, resetGame } from './support/fixtures.mjs';
import { patch, expectNoErrors, gameState } from './support/game.mjs';

test.describe('hud', () => {
  test('vitals, ammo, weapon name and the heart row follow the state', async ({ game }) => {
    const log = await resetGame(game);
    const base = await game.evaluate(() => ({
      hearts: heartsEl.children.length,
      maxHp,
      ammoText: ammoCountEl.textContent,
      ammo,
      name: ammoNameEl.textContent,
      weapon: WEAPONS[curWeapon].name
    }));
    expect(base.hearts).toBe(base.maxHp);
    expect(base.ammoText).toBe(String(base.ammo));
    expect(base.name).toBe(base.weapon);

    // extra health from the shop grows the row, and the rifle switches the model
    await patch(game, { upgrades: { hp: 2 }, rifle: true, weapon: 'rifle' });
    const grown = await game.evaluate(() => ({
      hearts: heartsEl.children.length,
      maxHp,
      name: ammoNameEl.textContent,
      ammoText: ammoCountEl.textContent,
      ammo,
      pistol: pistol.visible,
      rifle: rifleModel.visible
    }));
    expect(grown.hearts).toBe(grown.maxHp);
    expect(grown.hearts).toBe(base.hearts + 2);
    expect(grown.name).toBe('WINCHESTER');
    expect(grown.ammoText).toBe(String(grown.ammo));
    expect(grown.rifle).toBe(true);
    expect(grown.pistol).toBe(false);
    expectNoErrors(log);
  });

  test('cash, the wanted stars and the round score follow the state', async ({ game }) => {
    await resetGame(game);
    await patch(game, { cash: 137, outlawPts: 2, lawPts: 1, roundNum: 3 });
    await game.waitForFunction(() => cashEl.textContent === '$137' && pOutEl.textContent === '2');
    const text = await game.evaluate(() => ({
      cash: cashEl.textContent, out: pOutEl.textContent, law: pLawEl.textContent, sub: scoreSub.textContent
    }));
    expect(text.cash).toBe('$137');
    expect(text.out).toBe('2');
    expect(text.law).toBe('1');
    expect(text.sub).toContain('3');

    // five slots always, filled to the wanted level
    for (const level of [0, 1, 3, 5]) {
      await patch(game, { wanted: level, wantedT: 30 });
      await game.waitForFunction(l => wantedEl.textContent.length === 5 && (l === 0 || !!wantedEl.querySelector('i')), level);
      const info = await game.evaluate(() => ({
        slots: wantedEl.textContent.length,
        filled: wantedEl.querySelector('i') ? wantedEl.querySelector('i').textContent.length : 0
      }));
      expect(info.slots, 'always five slots').toBe(5);
      expect(info.filled, 'filled for wanted ' + level).toBe(level);
    }
  });

  test('the minimap draws, the kill feed posts and the objective banner times out', async ({ game }) => {
    await resetGame(game);
    await game.waitForTimeout(400);
    const painted = await game.evaluate(() => {
      const d = mm.getImageData(0, 0, mmCv.width, mmCv.height).data;
      let lit = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) lit++;
      return { lit, total: d.length / 4 };
    });
    expect(painted.lit, 'non transparent minimap pixels').toBeGreaterThan(painted.total * 0.2);

    await game.evaluate(() => feed('Killed Deputy +$40', 'good'));
    const line = game.locator('#killfeed div').last();
    await expect(line).toContainText('Killed Deputy');
    await expect(line).toHaveClass(/good/);

    await game.evaluate(() => showObjective('SHERIFF SPOTTED', 'He is to the north of you', 1200));
    await expect(game.locator('#objective')).toHaveClass(/show/);
    await expect(game.locator('#objTitle')).toHaveText('SHERIFF SPOTTED');
    await game.waitForFunction(() => !objEl.classList.contains('show'), null, { timeout: 6000 });
  });

  test('low health and a fresh hit light their overlays, and both clear again', async ({ game }) => {
    const log = await resetGame(game);
    // wait on frames rather than a stopwatch: the HUD only updates once per frame,
    // and in software that is a fifth of a second
    const peak = await game.evaluate(async () => {
      hp = 1;
      dmgFlash = 1;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      // the inline value is what the game asked for; #lowhp also has a .5s opacity
      // transition, so the computed value is read again below once it has caught up
      return { low: parseFloat(lowEl.style.opacity), dmg: parseFloat(getComputedStyle(dmgEl).opacity) };
    });
    expect(peak.low, 'the low health vignette is asked for').toBeGreaterThan(0.1);
    expect(peak.dmg, 'the damage flash is up').toBeGreaterThan(0.1);
    await game.waitForFunction(() => parseFloat(getComputedStyle(lowEl).opacity) > 0.1);
    await patch(game, { hp: 5 });
    await game.waitForFunction(() => parseFloat(getComputedStyle(lowEl).opacity) < 0.05);
    const s = await gameState(game);
    expect(s.hp).toBeGreaterThan(4);
    expectNoErrors(log);
  });
});
