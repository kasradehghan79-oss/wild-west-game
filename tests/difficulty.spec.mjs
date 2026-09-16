/* ==========================================================================
   The Wild West - tests/difficulty.spec.mjs
   The five difficulty levels: what they change, that they persist, that the
   picker works on both screens, and that they actually reach the world (a brutal
   level has to spawn tougher men, not just a different number in a table).
   ========================================================================== */
import { test, expect, resetGame } from './support/fixtures.mjs';
import { expectNoErrors, openGame } from './support/game.mjs';

const picker = page => page.evaluate(() => ({
  title: document.querySelectorAll('#diffTitle .diffbtn').length,
  pause: document.querySelectorAll('#diffPause .diffbtn').length,
  selectedTitle: document.querySelector('#diffTitle .diffbtn.sel')
    ? document.querySelector('#diffTitle .diffbtn.sel').dataset.diff : null,
  selectedPause: document.querySelector('#diffPause .diffbtn.sel')
    ? document.querySelector('#diffPause .diffbtn.sel').dataset.diff : null,
  blurb: diffBlurb.textContent,
  pauseBlurb: diffBlurbPause.textContent
}));

test.describe('difficulty levels', () => {
  test('there are five, in order, each with a name and a blurb', async ({ game }) => {
    const log = await resetGame(game);
    const levels = await game.evaluate(() => Difficulty.all.map(d => ({
      id: d.id, name: d.name, tag: d.tag, blurb: d.blurb
    })));
    expect(levels.length).toBe(5);
    expect(levels.map(l => l.id)).toEqual(['greenhorn', 'deputy', 'gunhand', 'outlaw', 'legend']);
    for (const l of levels) {
      expect(l.name.length, l.id + ' has a name').toBeGreaterThan(3);
      expect(l.tag.length, l.id + ' has a tag').toBeGreaterThan(2);
      expect(l.blurb.length, l.id + ' explains itself').toBeGreaterThan(10);
    }
    // the default is the balanced one
    expect(await game.evaluate(() => Difficulty.id)).toBe('deputy');
    expectNoErrors(log);
  });

  test('each level scales foes, the player, the economy and the AI', async ({ game }) => {
    await resetGame(game);
    const table = await game.evaluate(() => Difficulty.all.map(d => {
      Difficulty.set(d.id);
      const law = ARCH.deputy;
      return {
        id: d.id,
        foeHp: Difficulty.foeHp(law.hp),
        sheriffHp: Difficulty.foeHp(ARCH.sheriff.hp),
        enemyDmg: +Difficulty.foeDmg(1).toFixed(2),
        fireRate: +Difficulty.fireRate(1).toFixed(2),
        reaction: +Difficulty.reaction(1).toFixed(2),
        engage: Math.round(Difficulty.engage(law.engage)),
        senseRange: Math.round(Difficulty.senseRange(30)),
        playerDmg: +Difficulty.playerDmg(1).toFixed(2),
        heal: +Difficulty.healRate(1).toFixed(2),
        price: Difficulty.price(25),
        reward: Difficulty.reward(100),
        objectiveCount: Difficulty.objectiveCount(3),
        objectiveTime: Difficulty.objectiveTime(28),
        assist: +Difficulty.assistRange(60).toFixed(0),
        reinforceWanted: Difficulty.reinforceWanted()
      };
    }));
    // put the level back inside the page: the table above left it on LEGEND
    await game.evaluate(() => Difficulty.set('deputy'));
    const by = id => table.find(t => t.id === id);
    const [easy, normal, hard, veryHard, brutal] = ['greenhorn', 'deputy', 'gunhand', 'outlaw', 'legend'].map(by);

    // foes get tougher strictly in order
    const hpOrder = table.map(t => t.foeHp);
    expect(hpOrder, 'foe health rises with the level').toEqual([...hpOrder].sort((a, b) => a - b));
    expect(brutal.foeHp).toBeGreaterThan(normal.foeHp * 2);
    expect(brutal.senseRange, 'they see further').toBeGreaterThan(easy.senseRange * 1.5);
    expect(brutal.engage, 'and start earlier').toBeGreaterThan(easy.engage);
    expect(brutal.reaction, 'and react faster').toBeLessThan(easy.reaction);
    expect(brutal.fireRate, 'and shoot faster').toBeLessThan(easy.fireRate);
    expect(brutal.enemyDmg, 'and hit harder').toBeGreaterThan(easy.enemyDmg);

    // the player's side gets weaker
    expect(brutal.playerDmg, 'you hit softer').toBeLessThan(easy.playerDmg);
    expect(brutal.heal, 'and heal slower').toBeLessThan(easy.heal);
    expect(brutal.assist, 'and get less aim assist').toBeLessThan(easy.assist);
    expect(veryHard.price, 'and pay more').toBeGreaterThan(easy.price);
    expect(veryHard.reward, 'and earn less').toBeLessThan(easy.reward);

    // missions get bigger and tighter
    expect(brutal.objectiveCount, 'more to do').toBeGreaterThan(normal.objectiveCount);
    expect(brutal.objectiveTime, 'in less time').toBeLessThan(normal.objectiveTime);
  });

  test('the picker works on the title screen and in the pause menu, and sticks', async ({ page }) => {
    // a fresh page with empty storage, so a choice made by an earlier test cannot
    // leak in through the shared browser profile
    const log = await openGame(page);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => typeof Difficulty === 'object');
    const before = await picker(page);
    expect(before.title, 'five buttons on the title screen').toBe(5);
    expect(before.pause, 'five in the pause menu').toBe(5);
    expect(before.selectedTitle, 'the current level is marked').toBe('deputy');
    expect(before.selectedPause).toBe('deputy');
    expect(before.blurb.length).toBeGreaterThan(10);

    await page.click('#diffTitle .diffbtn[data-diff="legend"]');
    await page.waitForFunction(() => Difficulty.id === 'legend');
    const after = await picker(page);
    expect(after.selectedTitle, 'the selection moved').toBe('legend');
    expect(after.selectedPause, 'on both rows').toBe('legend');
    expect(after.blurb, 'and the blurb changed with it').not.toBe(before.blurb);
    expect(after.blurb.length).toBeGreaterThan(10);
    expect(after.blurb).toBe(before.blurb === after.blurb ? before.blurb : after.blurb);
    expect(after.pauseBlurb).toBe(after.blurb);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wildwest.settings')).difficulty)).toBe('legend');

    // and it is still legend after a reload
    await page.reload();
    await page.waitForFunction(() => typeof Difficulty === 'object');
    expect(await page.evaluate(() => Difficulty.id)).toBe('legend');
    const reloaded = await picker(page);
    expect(reloaded.selectedTitle).toBe('legend');
    expectNoErrors(log);
  });

  test('a brutal level really does spawn tougher, more alert men', async ({ game }) => {
    await resetGame(game);
    const sample = async id => {
      await game.evaluate(level => { Difficulty.set(level); startRound(); }, id);
      await game.waitForFunction(() => Mode.live());
      await game.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      return game.evaluate(() => ({
        level: Difficulty.id,
        lawHp: npcs.find(n => !n.civil).hp,
        sheriffHp: npcs.find(n => n.isSheriff).hp,
        sense: Math.round(Perceive.senses(npcs.find(n => !n.civil)).range)
      }));
    };
    const easy = await sample('greenhorn');
    const brutal = await sample('legend');
    expect(brutal.lawHp, 'a lawman is much harder to put down').toBeGreaterThan(easy.lawHp * 1.8);
    expect(brutal.sheriffHp, 'and so is the sheriff').toBeGreaterThan(easy.sheriffHp * 1.8);
    expect(brutal.sense, 'and they notice you from further').toBeGreaterThan(easy.sense * 1.5);
    await game.evaluate(() => Difficulty.set('deputy'));
  });

  test('mission difficulty scales the crowd but never the sheriff', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(() => {
      const num = s => {
        const str = String(s || '');
        const m = str.indexOf('/') >= 0 ? str.split('/')[1] : str;
        const d = String(m).match(/(\d+)/);
        return d ? +d[1] : null;
      };
      const read = level => {
        Difficulty.set(level);
        Missions.abortAll('test');
        const bounty = Missions.start('round_bounty');
        const holdup = Missions.start('side_holdup');
        return {
          level,
          sheriff: num((bounty.objectives.find(o => o.id === 'kill_sheriff') || {}).detail),
          crowd: num((bounty.objectives.find(o => o.id === 'bonus_posse') || {}).detail),
          holdupKill: num((((holdup.objectives[0] || {}).children || []).find(c => c.type === 'killTargets') || {}).detail),
          survive: num((((holdup.objectives[0] || {}).children || []).find(c => c.type === 'surviveDuration') || {}).detail)
        };
      };
      const easy = read('greenhorn');
      const brutal = read('legend');
      Missions.abortAll('test');
      Difficulty.set('deputy');
      return { easy, brutal };
    });
    expect(res.brutal.sheriff, 'one sheriff is always one sheriff').toBe(1);
    expect(res.easy.sheriff, 'at every level').toBe(1);
    expect(res.brutal.crowd, 'but a crowd scales up').toBeGreaterThan(res.easy.crowd);
    expect(res.brutal.holdupKill, 'and a side job asks for more men').toBeGreaterThan(res.easy.holdupKill);
    expect(res.brutal.survive, 'while the hold-out gets shorter').toBeLessThan(res.easy.survive);
  });

  test('friendlier levels are friendlier: cheaper, richer, and a wider assist window', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(() => {
      const out = {};
      ['greenhorn', 'legend'].forEach(id => {
        Difficulty.set(id);
        out[id] = {
          bandage: Difficulty.price(25),
          ammo: Difficulty.price(12),
          bounty: Difficulty.reward(60),
          cone: +Difficulty.assistCone().toFixed(2),
          alive: 0
        };
      });
      Difficulty.set('deputy');
      return out;
    });
    expect(res.greenhorn.bandage, 'a bandage is cheaper on easy').toBeLessThan(res.legend.bandage);
    expect(res.greenhorn.ammo).toBeLessThan(res.legend.ammo);
    expect(res.greenhorn.bounty, 'and the same job pays more').toBeGreaterThan(res.legend.bounty);
    expect(res.greenhorn.cone, 'and the aim assist cone is wider').toBeLessThan(res.legend.cone);
  });

  test('an aborted mission does not leave its crates behind', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      const missionItems = () => pickups.filter(p => p.mission).length;
      Missions.running.filter(x => x.kind !== 'main').forEach(x => Missions.abort(x, 'test'));
      const before = missionItems();
      const m = Missions.start('side_cache', {});
      const spawned = missionItems();
      Missions.abort(m, 'test');
      await new Promise(r => requestAnimationFrame(r));
      return { before, spawned, after: missionItems() };
    });
    expect(res.spawned, 'the crates appeared').toBeGreaterThan(res.before);
    expect(res.after, 'and were cleaned up with the mission').toBe(res.before);
  });
});
