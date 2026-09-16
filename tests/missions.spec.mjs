/* ==========================================================================
   The Wild West - tests/missions.spec.mjs
   Phase 3: the mission framework. Objectives, stages, failure, rewards, the HUD
   tracker, the interact prompt, the minimap markers, and a save round trip that
   keeps a mission's spawned items where they were.
   ========================================================================== */
import { test, expect, resetGame } from './support/fixtures.mjs';
import { patch, gameState, expectNoErrors, waitFrames } from './support/game.mjs';

test.describe('the mission framework', () => {
  test('a round starts its main mission and a side job, and the tracker shows both', async ({ game }) => {
    const log = await resetGame(game);
    const started = await game.evaluate(() => ({
      running: Missions.running.map(m => m.id + ':' + m.kind),
      main: Missions.running.filter(m => m.kind === 'main').length,
      hud: Missions.hud().map(m => m.name),
      tracker: missionEl.innerText.replace(/\n/g, ' | '),
      sideName: (Missions.hud()[1] || {}).name || '',
      shown: getComputedStyle(missionEl).display,
      flags: Missions.allFlags()
    }));
    expect(started.running.length, 'a main mission plus a side job').toBeGreaterThanOrEqual(2);
    expect(started.main, 'exactly one main mission').toBe(1);
    expect(started.running.some(r => r.startsWith('round_bounty'))).toBe(true);
    expect(started.shown).toBe('flex');
    expect(started.shown, 'tracker is up').toBe('flex');
    expect(started.tracker).toContain('THE SHERIFF');
    expect(started.tracker, 'the job itself').toContain('Kill the sheriff');
    expect(started.sideName, 'a side job rides along').not.toBe('');
    expect(started.tracker.toLowerCase(), 'and it is on screen').toContain(started.sideName.toLowerCase().slice(0, 8));
    expectNoErrors(log);
  });

  test('the tracker explains itself: what kind of job, what is optional, what the choices are', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      Missions.running.filter(m => m.kind !== 'main').forEach(m => Missions.abort(m, 'test'));
      Missions.abortAll('test');
      Missions.start('round_bounty');
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const main = missionEl.innerText;
      // a branching side job: both roads should be visible, not a group label
      Missions.start('side_holdup');
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const branch = missionEl.innerText;
      return { main, branch, label: missionLabelEl.textContent };
    });
    expect(res.label, 'the block says what it is').toBe('MISSION');
    expect(res.main, 'and spells out the optional line instead of leaving it to a colon')
      .toContain('Optional:');
    expect(res.main, 'the required objective is named plainly').toContain('Kill the sheriff');
    expect(res.branch, 'a choice shows both roads').toContain('hold out at the ambush');
    expect(res.branch, 'and the one not taken').toContain('kill the deputies');
    expect(res.branch, 'with the side job named').toContain('Ambush on the trail:');
  });

  test('objectives tick as the world reports events, and the mission pays out', async ({ game }) => {
    const log = await resetGame(game);
    const before = await game.evaluate(() => { window.__paid = []; Bus.on('mission:done', e => window.__paid.push(e.mission.id + ':' + e.cash)); return cash; });
    // two armed men, not the sheriff: that is the bonus objective
    const bonus = await game.evaluate(async () => {
      const armed = npcs.filter(n => !n.dead && !n.civil && !n.isSheriff).slice(0, 2);
      armed.forEach(n => { n.hp = 0.1; n.dead = true; Bus.emit('npc:died', { npc: n, byPlayer: true, civilian: false }); });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const m = Missions.running.find(x => x.id === 'round_bounty');
      return m.objectives.map(o => o.label + '=' + o.state);
    });
    expect(bonus, 'the optional objective is ticked').toContain('kill lawmen for the bounty board=done');
    expect(bonus, 'the sheriff is still the requirement').toContain('Kill the sheriff=active');

    const paid = await game.evaluate(async () => {
      const sh = npcs.find(n => n.isSheriff && !n.dead);
      sh.dead = true;
      Bus.emit('npc:died', { npc: sh, byPlayer: true, civilian: false });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { cash, paid: window.__paid, expected: Difficulty.reward(60), flags: Missions.allFlags(), stillRunning: Missions.running.map(m => m.id) };
    });
    expect(paid.paid, 'the round mission paid its reward at this level').toContain('round_bounty:' + paid.expected);
    expect(paid.cash, 'and the money is in the wallet').toBeGreaterThanOrEqual(before + paid.expected);
    expect(paid.flags.sheriffDown).toBe(true);
    expect(paid.stillRunning, 'the completed mission is no longer running').not.toContain('round_bounty');
  });

  test('a mission with two ways through completes on either one', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      const m = (Missions.running.filter(m => m.kind !== 'main').forEach(m => Missions.abort(m)), Missions.start('side_holdup', {}, 'side'));
      const group = m.objectives[0];
      const labels = group.children.map(c => c.label);
      // walk the kill road rather than the survival one
      const kills = group.children.find(c => c.type === 'killTargets');
      npcs.filter(n => !n.dead && !n.civil).slice(0, 3)
        .forEach(n => { n.dead = true; Bus.emit('npc:died', { npc: n, byPlayer: true, civilian: false }); });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return {
        labels,
        childStates: group.children.map(c => c.type + '=' + c.state),
        groupState: group.state,
        missionState: m.state,
        spawnedDeputies: npcs.filter(n => !n.civil).length
      };
    });
    expect(res.labels.length, 'two roads').toBe(2);
    expect(res.childStates.join(' ')).toContain('killTargets=done');
    expect(res.childStates, 'the road not taken is settled, not left hanging').toContain('surviveDuration=skipped');
    expect(res.groupState).toBe('done');
    expect(res.missionState, 'and the mission closes itself out').toBe('done');
    expect(res.spawnedDeputies, 'the ambush really spawned men').toBeGreaterThan(4);
  });

  test('an escort fails when the protected NPC dies, and the failure is reported', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      const failed = [];
      Bus.on('mission:failed', e => failed.push(e.mission.id + ':' + e.reason));
      const m = (Missions.running.filter(m => m.kind !== 'main').forEach(m => Missions.abort(m)), Missions.start('side_witness', {}, 'side'));
      const witness = npcs.find(n => n.followPlayer);
      const followed = !!witness;
      if (witness) { witness.dead = true; Bus.emit('npc:died', { npc: witness, civilian: true }); }
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return {
        followed, failed,
        state: m.state,
        running: Missions.running.map(x => x.id),
        followCleared: witness ? !witness.followPlayer : true
      };
    });
    expect(res.followed, 'the witness followed the player').toBe(true);
    expect(res.failed.join(' '), 'the mission reported its failure').toContain('side_witness');
    expect(res.state).toBe('failed');
    expect(res.running).not.toContain('side_witness');
    expect(res.followCleared, 'and the follow flag was cleared with it').toBe(true);
  });

  test('a collect mission marks its crates and takes them one at a time', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      const m = (Missions.running.filter(m => m.kind !== 'main').forEach(m => Missions.abort(m)), Missions.start('side_cache', {}, 'side'));
      const step = async () => { await new Promise(r => requestAnimationFrame(r)); Missions.update(0.05); };
      const items = m.objectives[0].items || [];
      const markers = Missions.markers().length;
      const detail0 = m.objectives[0].detail;
      // walk onto the first two crates
      for (let i = 0; i < 2 && i < items.length; i++) {
        player.g.position.set(items[i].g.position.x, items[i].g.position.y, items[i].g.position.z);
        await step();
      }
      const collect = m.objectives[0];
      const midDetail = collect.detail;
      // and the third completes it
      if (items[2]) {
        player.g.position.set(items[2].g.position.x, items[2].g.position.y, items[2].g.position.z);
        await step();
      }
      return {
        crates: items.length, expected: Difficulty.objectiveCount(3), markers, detail0, midDetail,
        state: collect.state, missionState: m.state,
        taken: items.map(i => !!i.taken).join(',')
      };
    });
    expect(res.crates, 'the crates spawned for this difficulty').toBe(res.expected);
    expect(res.markers, 'the minimap is marking them').toBeGreaterThan(0);
    expect(res.detail0).toBe('0/' + res.crates);
    expect(res.midDetail, 'picked up as you walk over them').toBe('2/' + res.crates);
    expect(res.state).toBe('done');
    expect(res.missionState).toBe('done');
    expect(res.taken.split(',').every(v => v === 'true'), 'every crate was collected').toBe(true);
  });

  test('an interact objective labels the pill and only fires inside range', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      const m = (Missions.running.filter(m => m.kind !== 'main').forEach(m => Missions.abort(m)), Missions.start('side_lookout', {}, 'side'));
      // jump to the second stage, the one that wants a report at a place
      const spot = { x: player.g.position.x + 22, z: player.g.position.z + 6 };
      m.def.stages[1].objectives[0].x = spot.x;
      m.def.stages[1].objectives[0].z = spot.z;
      m.loadStage(1);
      const far = Missions.prompt();
      player.g.position.set(spot.x - 1, player.g.position.y, spot.z);
      for (let i = 0; i < 4; i++) await new Promise(r => requestAnimationFrame(r));
      const near = Missions.prompt();
      const used = Missions.interact();
      // it is a held action, so the first press alone must not finish it
      const afterPress = m.objectives[0].state;
      for (let i = 0; i < 90; i++) await new Promise(r => requestAnimationFrame(r));
      return { far, near, used, afterPress, state: m.objectives[0].state };
    });
    expect(res.far, 'no prompt from across the map').toBeNull();
    expect(res.near, 'a labelled prompt in range').not.toBeNull();
    expect(res.near.label).toContain('REPORT');
    expect(res.used).toBe(true);
    expect(res.afterPress, 'a hold objective needs the full hold').toBe('active');
  });

  test('the mission layer is quiet while a menu is open', async ({ game }) => {
    await resetGame(game);
    const frozen = await game.evaluate(async () => {
      const m = Missions.running[0];
      const t0 = m.time;
      setPaused(true);
      for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(r));
      const paused = m.time;
      setPaused(false);
      for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
      return { t0, paused, after: m.time };
    });
    expect(frozen.paused, 'mission clocks stop with the world').toBe(frozen.t0);
    expect(frozen.after, 'and run again afterwards').toBeGreaterThan(frozen.paused);
  });

  test('a save keeps the mission, its counters and its spawned crates', async ({ game }) => {
    await resetGame(game);
    await patch(game, { cash: 120 });
    const before = await game.evaluate(async () => {
      const m = (Missions.running.filter(m => m.kind !== 'main').forEach(m => Missions.abort(m)), Missions.start('side_cache', {}, 'side'));
      const items = m.objectives[0].items;
      player.g.position.set(items[0].g.position.x, items[0].g.position.y, items[0].g.position.z);
      await new Promise(r => requestAnimationFrame(r));
      Missions.update(0.05);
      const snap = Missions.snapshot();
      return {
        detail: m.objectives[0].detail,
        taken: m.objectives[0].items.map(i => !!i.taken).join(','),
        spots: m.seen.spots ? m.seen.spots.map(s => s.map(v => +v.toFixed(1)).join(',')).sort() : null,
        spawnSpots: m.objectives[0].items.map(i => [+i.g.position.x.toFixed(1), +i.g.position.z.toFixed(1)].join(',')).sort(),
        savedCount: snap.missions.length
      };
    });
    expect(before.detail, 'one crate in, at whatever count this level asks for').toMatch(/^1\/\d+$/);

    const after = await game.evaluate(b => {
      // a hard save/load cycle: snapshot into storage, then rebuild from it
      localStorage.setItem('wildwest.save.1', JSON.stringify({
        v: 1, t: Date.now(),
        play: { dayTime: 0.3, seconds: 60 },
        match: { round: 2, time: 40, outlaws: 0, law: 0, kills: 0, total: 0, headshots: 0, survived: 0, wanted: 0, wantedT: 0 },
        player: { x: 4, z: 4, yaw: 0, pitch: 0.14, hp: 5, mounted: false },
        horse: { x: 3, z: 1.5, rot: 2.5 },
        wallet: { cash: 120 },
        weapons: { cur: 'revolver', revolver: { owned: true, ammo: 8 }, rifle: { owned: false, ammo: 0 } },
        upgrades: { mag: 0, hp: 0, reload: 0, steady: 0, rifle: 0 },
        story: Object.assign({ chapter: 1 }, Missions.snapshot()),
        faction: {}, inventory: {}
      }));
      Save.load('1');
      const m = Missions.running.find(x => x.id === 'side_cache');
      return {
        running: Missions.running.map(x => x.id),
        detail: m ? m.objectives[0].detail : null,
        taken: m ? m.objectives[0].items.map(i => !!i.taken).join(',') : null,
        spots: m && m.seen.spots ? m.seen.spots.map(s => s.map(v => +v.toFixed(1)).join(',')) : null,
        cratePositions: m ? m.objectives[0].items.map(i => [+i.g.position.x.toFixed(1), +i.g.position.z.toFixed(1)].join(',')) : null
      };
    }, before);
    expect(after.running, 'the mission came back').toContain('side_cache');
    expect(after.running, 'and the round main mission with it').toContain('round_bounty');
    expect(after.detail, 'progress restored').toBe(before.detail);
    expect(after.taken).toBe(before.taken);
    expect(after.cratePositions.length, 'every crate came back').toBe(before.spawnSpots.length);
    for (const crate of after.cratePositions) {
      expect(after.spots, 'crate ' + crate + ' is at one of the saved spots').toContain(crate);
    }
    expect(after.spots.slice().sort(), 'and the saved spots themselves survived the trip').toEqual(before.spots);
    const state = await gameState(game);
    expect(state.live).toBe(true);
  });

  test('the round ending clears the side jobs', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      const during = Missions.running.map(m => m.id);
      endRound('law', 'timeout');
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { during, after: Missions.running.map(m => m.id), tracker: getComputedStyle(missionEl).display };
    });
    expect(res.during.length).toBeGreaterThan(1);
    expect(res.after, 'nothing survives the round boundary').toEqual([]);
    expect(res.tracker).toBe('none');
  });
});
