/* ==========================================================================
   The Wild West - tests/save.spec.mjs
   Saving has to survive two enemies: a player who closes the tab, and a storage
   entry that has been edited, truncated or written by a different version. Both
   are tested here, including the requirement that a bad save costs progress but
   never produces an impossible world.
   ========================================================================== */
import { test, expect, resetGame } from './support/fixtures.mjs';
import { patch, gameState, expectNoErrors, clearStorage, refreshContinueButton, setWanted } from './support/game.mjs';

const STATE = {
  cash: 275, roundNum: 2, kills: 6, headshots: 2, totalKills: 6, survivedRounds: 1,
  wanted: 3, wantedT: 30, outlawPts: 1, hp: 4, sinceDmg: 0, pos: [6, -2],
  upgrades: { mag: 2, steady: 1 }, rifle: true, weapon: 'rifle'
};

test.describe('save slots', () => {
  test('a manual save round trips every field, and the slot list offers the right actions', async ({ game }) => {
    const log = await resetGame(game);
    await game.evaluate(() => setPaused(true));
    await game.locator('#pauseSaveBtn').click();
    await game.waitForFunction(() => getComputedStyle(savesEl).display !== 'none');

    const rows = await game.evaluate(() => [...document.querySelectorAll('#saveSlots .item')].map(r => ({
      name: r.querySelector('b').textContent,
      buttons: [...r.querySelectorAll('button')].map(b => ({ label: b.textContent, disabled: b.disabled }))
    })));
    expect(rows.length).toBe(4);
    expect(rows[0].name).toBe('AUTOSAVE');
    // the autosave is the game's own slot: loadable and clearable, never writable
    expect(rows[0].buttons.map(b => b.label)).toEqual(['LOAD', 'CLEAR']);
    for (const row of rows.slice(1)) {
      expect(row.buttons.map(b => b.label)).toEqual(['SAVE', 'LOAD', 'CLEAR']);
    }

    // the wanted level is derived from the record, so it is raised through the law before
    // the state is stamped and saved
    await setWanted(game, STATE.wanted);
    await patch(game, STATE);
    const slot2 = game.locator('#saveSlots .item').filter({ hasText: 'SLOT 2' });
    await slot2.getByRole('button', { name: 'SAVE' }).click();
    await expect(slot2.locator('small')).toContainText('$275');
    await expect(slot2.locator('small')).toContainText('Round 2');

    // wreck the live state, then load it back
    await patch(game, { cash: 5, roundNum: 1, kills: 0, wanted: 0, hp: 5, pos: [0, 0] });
    await slot2.getByRole('button', { name: 'LOAD' }).click();
    await game.waitForFunction(() => Mode.live());

    const s = await gameState(game);
    expect(s.cash).toBe(STATE.cash);
    expect(s.roundNum).toBe(STATE.roundNum);
    expect(s.kills).toBe(STATE.kills);
    expect(s.headshots).toBe(STATE.headshots);
    expect(s.wanted).toBe(STATE.wanted);
    expect(s.hp, 'health came back as saved, not regenerated').toBeGreaterThanOrEqual(STATE.hp);
    expect(s.curWeapon).toBe('rifle');
    expect(s.weapons.rifle.owned).toBe(true);
    expect(s.weapons.rifle.ammo).toBeGreaterThan(0);
    expect(s.upgrades.mag).toBe(2);
    expect(s.upgrades.steady).toBe(1);
    expect(s.pos.x).toBeCloseTo(STATE.pos[0], 0);
    expect(s.pos.z).toBeCloseTo(STATE.pos[1], 0);
    expect(s.mode).toBe('playing');
    await expect(game.locator('#saves')).toBeHidden();
    await expect(game.locator('#pause')).toBeHidden();
    expectNoErrors(log);
  });

  test('CONTINUE restores the newest slot, and the autosave follows every round boundary', async ({ game }) => {
    await resetGame(game);
    await clearStorage(game);
    await game.evaluate(() => startMatch());
    await game.waitForFunction(() => Save.status('auto') === 'ok');
    const first = await game.evaluate(() => Save.info('auto'));
    expect(first.round).toBe(1);

    await game.evaluate(() => endRound('outlaw', 'sheriff'));
    await game.waitForFunction(() => Mode.current() === 'over');
    await game.locator('#roundend').click();
    await game.waitForFunction(() => Mode.live());
    const nextRound = await game.evaluate(() => Save.info('auto'));
    expect(nextRound.round, 'the checkpoint moved with the round').toBe(2);

    // a manual slot taken now is newer than the autosave, so CONTINUE prefers it
    await patch(game, { cash: 91, roundNum: 3 });
    await game.evaluate(() => Save.write('1'));
    await game.reload();
    await game.waitForFunction(() => continueBtn.classList.contains('on'));
    await game.locator('#continueBtn').click();
    await game.waitForFunction(() => Mode.live());
    const s = await gameState(game);
    expect(await game.evaluate(() => getComputedStyle(startEl).display)).toBe('none');
    expect(s.cash).toBe(91);
    expect(s.roundNum).toBe(3);
  });

  test('CLEAR empties a slot', async ({ game }) => {
    await resetGame(game);
    await patch(game, { cash: 40 });
    await game.evaluate(() => Save.write('3'));
    expect(await game.evaluate(() => Save.info('3').state)).toBe('ok');
    // open the pause menu first: the save screen hangs off it
    await game.evaluate(() => setPaused(true));
    await game.locator('#pauseSaveBtn').click();
    await game.locator('#saveSlots .item').filter({ hasText: 'SLOT 3' })
      .getByRole('button', { name: 'CLEAR' }).click();
    expect(await game.evaluate(() => Save.info('3').state)).toBe('empty');
    await expect(game.locator('#saveSlots .item').filter({ hasText: 'SLOT 3' }).locator('small'))
      .toHaveText('empty');
  });
});

test.describe('hostile or damaged storage', () => {
  test('garbage is reported as corrupt, clamped when it can be read, and never crashes the game', async ({ game }) => {
    const log = await resetGame(game);
    await patch(game, { cash: 42, roundNum: 2 });
    const garbage = [
      '{ this is not json ',
      'null',
      '[1,2,3]',
      '{}',
      '{"cash":9999}',
      '{"v":99,"cash":9999}',
      '{"v":"1","cash":9999}',
      '{{{{{{',
      '{"v":1,"wallet":{"cash":1e308},"player":{"x":1e308,"z":-1e308}}',
      '{"v":1,"match":{"round":"lots","wanted":{}},"player":{"x":"a","hp":[]},"upgrades":"nope"}'
    ];
    for (const payload of garbage) {
      const res = await game.evaluate(p => {
        localStorage.setItem('wildwest.save.2', p);
        return { status: Save.status('2'), info: Save.info('2').state, loaded: Save.load('2') };
      }, payload);
      // a valid version with broken fields is normalized instead of refused, which
      // is the point: clamped values, never an exception
      expect(['corrupt', 'ok'], payload).toContain(res.status);
      if (res.status === 'corrupt') {
        expect(res.loaded, payload).toBe(false);
        expect(res.info, payload).toBe('corrupt');
      }
      const now = await gameState(game);
      expect(now.cash, payload + ' left cash sane').toBeGreaterThanOrEqual(0);
      expect(now.cash, payload + ' clamped the cash').toBeLessThanOrEqual(1e7);
      expect(now.roundNum, payload).toBeGreaterThanOrEqual(1);
      expect(now.roundNum, payload).toBeLessThanOrEqual(5);
      expect(now.hp, payload).toBeGreaterThanOrEqual(1);
      expect(now.upgrades.mag, payload + ' clamped the upgrade').toBeLessThanOrEqual(3);
      expect(now.pos.x, payload + ' clamped the position').toBeGreaterThanOrEqual(-141);
      expect(now.pos.x, payload).toBeLessThanOrEqual(141);
      expect(now.wanted, payload + ' clamped the wanted level').toBeLessThanOrEqual(5);
      expect(now.live, payload + ' left the game playable').toBe(true);
    }
    expectNoErrors(log, ['[Save]']);
  });

  test('a hostile save cannot pollute prototypes or globals, and a broken write falls back to the backup', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(() => {
      localStorage.setItem('wildwest.save.2', JSON.stringify({
        v: 1,
        __proto__: { polluted: true },
        player: { x: 1, z: 1, __proto__: { polluted: true } },
        'constructor': { prototype: { polluted: true } }
      }));
      Save.load('2');
      return {
        objectProto: ({}).polluted,
        protoProto: Object.prototype.polluted,
        windowPolluted: window.polluted,
        live: Mode.live()
      };
    });
    expect(res.objectProto).toBeUndefined();
    expect(res.protoProto).toBeUndefined();
    expect(res.windowPolluted).toBeUndefined();
    expect(res.live, 'the game carried on').toBe(true);

    // settings are read at boot, so plant that payload and reload
    await game.evaluate(() => {
      localStorage.setItem('wildwest.settings', '{"__proto__":{"polluted":true},"sens":0.004}');
    });
    await game.reload();
    await game.waitForFunction(() => typeof settings === 'object');
    const settingsRes = await game.evaluate(() => ({
      obj: ({}).polluted,
      viaProto: settings.polluted,
      sens: settings.sens,
      keys: Object.keys(settings).sort().join(',')
    }));
    expect(settingsRes.obj).toBeUndefined();
    expect(settingsRes.viaProto, 'the settings object kept its own prototype').toBeUndefined();
    expect(settingsRes.sens, 'the real key still applied').toBeCloseTo(0.004, 4);
    expect(settingsRes.keys, 'the known keys, including the chosen difficulty').toBe('difficulty,invertY,quality,sens,volume');

    // the previous contents of a slot survive an unreadable write
    await game.evaluate(() => { cash = 10; Save.write('2'); cash = 500; Save.write('2'); });
    const recovered = await game.evaluate(() => {
      localStorage.setItem('wildwest.save.2', '{broken');
      const info = Save.info('2');
      return { state: info.state, cash: info.cash, recovered: info.recovered };
    });
    expect(recovered.state, 'the slot is still usable').toBe('ok');
    expect(recovered.cash, 'with the older contents').toBe(10);
    expect(recovered.recovered).toBe(true);
  });

  test('a blocked position is nudged to clear ground, and a failed load changes nothing', async ({ game }) => {
    await resetGame(game);
    const nudged = await game.evaluate(() => {
      const data = Save.snapshot();
      data.player.x = 20;            // one of the town's houses
      data.player.z = -8;
      Save.apply(Save.normalize(data), '1');
      return {
        x: +player.g.position.x.toFixed(1),
        z: +player.g.position.z.toFixed(1),
        insideWall: collide(player.g.position.x, player.g.position.z, 0.5),
        live: Mode.live()
      };
    });
    expect(nudged.insideWall, 'standing inside geometry').toBe(false);
    expect(nudged.live).toBe(true);

    await patch(game, { cash: 123, roundNum: 2 });
    const before = await gameState(game);
    await game.evaluate(() => localStorage.setItem('wildwest.save.1', 'not a save at all'));
    await refreshContinueButton(game);
    await game.evaluate(() => setPaused(true));
    await game.locator('#pauseSaveBtn').click();
    await game.waitForFunction(() => getComputedStyle(savesEl).display !== 'none');
    const slot1 = game.locator('#saveSlots .item').filter({ hasText: 'SLOT 1' });
    await expect(slot1.locator('small')).toContainText('unreadable');
    await expect(slot1.getByRole('button', { name: 'LOAD' })).toBeDisabled();
    expect(await game.evaluate(() => Save.load('1'))).toBe(false);
    await game.locator('#savesClose').click();
    await game.evaluate(() => setPaused(false));
    const after = await gameState(game);
    expect(after.cash).toBe(before.cash);
    expect(after.roundNum).toBe(before.roundNum);
    expect(after.live).toBe(true);
  });
});
