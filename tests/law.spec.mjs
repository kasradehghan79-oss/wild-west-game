/* ==========================================================================
   The Wild West - tests/law.spec.mjs
   Phase 5: crimes, witnesses and the law's response.

   The rule the whole system hangs on is that a crime is only worth what somebody
   saw, so most of these tests are about who was looking.
   ========================================================================== */
import { test, expect, resetGame } from './support/fixtures.mjs';
import { expectNoErrors } from './support/game.mjs';


test.describe('crimes and witnesses', () => {
  test('a crime nobody sees costs nothing, and a room full of people costs a lot', async ({ game }) => {
    const log = await resetGame(game);
    const res = await game.evaluate(async () => {
      Law.clearRecord();
      // unseen: put everyone far away first
      npcs.forEach(n => { if (!n.dead) n.g.position.set(-120, heightAt(-120, -120), -120); });
      await new Promise(r => requestAnimationFrame(r));
      const unseen = (Witnesses.witnessed('murder', 0, 0, { silent: true }), Law.status());
      Law.clearRecord();
      // seen: bring them back and stand them in a ring around the scene
      npcs.filter(n => !n.dead).slice(0, 3).forEach((n, i) => {
        const a = i / 3 * Math.PI * 2;
        n.g.position.set(Math.cos(a) * 6, heightAt(Math.cos(a) * 6, Math.sin(a) * 6), Math.sin(a) * 6);
        n.g.rotation.y = Math.atan2(0 - n.g.position.x, 0 - n.g.position.z);
        Perceive.forget(n);
      });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const witnesses = Witnesses.whoSaw(0, 0).length;
      const c = Witnesses.witnessed('murder', 0, 0, { silent: true });
      return { unseen, witnesses, caseWitnesses: c ? c.witnesses.length : 0 };
    });
    expect(res.unseen.heat, 'an unseen murder leaves no trace in the record').toBe(0);
    expect(res.unseen.wanted).toBe(0);
    expect(res.witnesses, 'the ring of people can see it').toBeGreaterThan(1);
    expect(res.caseWitnesses, 'so they are on the case').toBe(res.witnesses);
    expectNoErrors(log);
  });

  test('witnesses run for the law, and reaching it turns a crime into heat', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      Law.clearRecord();
      // one witness, standing next to the scene
      const npcsLive = npcs.filter(n => !n.dead);
      const witness = npcsLive.find(n => n.civil) || npcsLive[0];
      npcsLive.forEach(n => { if (n !== witness) n.g.position.set(-120, heightAt(-120, -120), -120); });
      witness.g.position.set(0, heightAt(0, 0), 0);
      Perceive.forget(witness);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const c = Witnesses.witnessed('murder', 0, 0, { silent: true });
      const opened = Law.status().heat;
      const running = witness.reportTo ? 'running' : 'still';
      // stand the witness on top of the law so the report lands
      const lawman = npcs.find(n => !n.civil && !n.dead);
      witness.g.position.set(lawman.g.position.x + 2, lawman.g.position.y, lawman.g.position.z);
      for (let i = 0; i < 30 && !c.reported; i++) await new Promise(r => requestAnimationFrame(r));
      return {
        opened, running,
        reported: c.reported,
        heat: Law.status().heat,
        wanted: Law.status().wanted,
        caseState: (c.witnesses[0] || {}).state
      };
    });
    expect(res.opened, 'an open case is not heat yet').toBe(0);
    expect(res.running, 'the witness is on his way to the law').toBe('running');
    expect(res.reported, 'and the report lands when he gets there').toBe(true);
    expect(res.heat, 'which is when the record grows').toBeGreaterThan(0);
    expect(res.wanted, 'and the law comes looking').toBeGreaterThan(0);
  });

  test('killing the witness before they talk keeps it off the record', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      Law.clearRecord();
      const npcsLive = npcs.filter(n => !n.dead);
      const witness = npcsLive.find(n => n.civil) || npcsLive[0];
      npcsLive.forEach(n => { if (n !== witness) n.g.position.set(-120, heightAt(-120, -120), -120); });
      witness.g.position.set(0, heightAt(0, 0), 0);
      Perceive.forget(witness);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const c = Witnesses.witnessed('murder', 0, 0, { silent: true });
      // silence him
      witness.dead = true;
      Bus.emit('npc:died', { npc: witness, civilian: true, byPlayer: true });
      for (let i = 0; i < 20; i++) await new Promise(r => requestAnimationFrame(r));
      return { cold: c.cold, reported: c.reported, heat: Law.status().heat, running: Witnesses.status().running };
    });
    expect(res.reported, 'the report never lands').toBe(false);
    expect(res.cold, 'and the case goes cold').toBe(true);
    expect(res.heat, 'so the record stays clean').toBe(0);
    expect(res.running).toBe(0);
  });

  test('a witness can be bought off, and the price is his silence', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      Law.clearRecord();
      const npcsLive = npcs.filter(n => !n.dead);
      const witness = npcsLive.find(n => n.civil) || npcsLive[0];
      npcsLive.forEach(n => { if (n !== witness) n.g.position.set(-120, heightAt(-120, -120), -120); });
      witness.g.position.set(0, heightAt(0, 0), 0);
      Perceive.forget(witness);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const c = Witnesses.witnessed('murder', 0, 0, { silent: true });
      cash = 500;
      // stand at the witness's shoulder
      player.g.position.set(witness.g.position.x + 1, player.g.position.y, witness.g.position.z);
      const prompt = Witnesses.prompt();
      const used = Witnesses.use();
      await new Promise(r => requestAnimationFrame(r));
      return {
        prompt: prompt ? prompt.label : null,
        price: prompt ? prompt.price : 0,
        used, cash, cold: c.cold,
        state: (c.witnesses[0] || {}).state,
        heat: Law.status().heat
      };
    });
    expect(res.prompt, 'the pill offers a price').toContain('BRIBE');
    expect(res.price, 'and it is a real price').toBeGreaterThan(0);
    expect(res.used).toBe(true);
    expect(res.cash, 'the money is gone').toBe(500 - res.price);
    expect(res.state, 'the witness takes it and forgets').toBe('bought');
    expect(res.cold, 'and the case dies with his memory').toBe(true);
    expect(res.heat).toBe(0);
  });

  test('putting a gun on a witness makes him drop it', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      Law.clearRecord();
      const npcsLive = npcs.filter(n => !n.dead);
      const witness = npcsLive.find(n => n.civil) || npcsLive[0];
      npcsLive.forEach(n => { if (n !== witness) n.g.position.set(-120, heightAt(-120, -120), -120); });
      witness.g.position.set(player.g.position.x + 5, player.g.position.y, player.g.position.z);
      witness.g.rotation.y = Math.atan2(player.g.position.x - witness.g.position.x, player.g.position.z - witness.g.position.z);
      Perceive.forget(witness);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const c = Witnesses.witnessed('murder', player.g.position.x, player.g.position.z, { silent: true });
      const started = (c.witnesses[0] || {}).state;
      // aim at him and hold it
      aiming = true;
      for (let i = 0; i < 60 && (c.witnesses[0] || {}).state === 'running'; i++) {
        await new Promise(r => requestAnimationFrame(r));
      }
      aiming = false;
      return { started, state: (c.witnesses[0] || {}).state, cold: c.cold, heat: Law.status().heat };
    });
    expect(res.started, 'he starts out running for the law').toBe('running');
    expect(res.state, 'and a levelled gun changes his mind').toBe('scared');
    expect(res.cold, 'the case goes cold').toBe(true);
    expect(res.heat).toBe(0);
  });
});

test.describe('the law responds', () => {
  test('the posse is a fixed size for the difficulty, and nobody is created mid round', async ({ game }) => {
    const log = await resetGame(game);
    const sizes = [];
    for (const level of ['greenhorn', 'deputy', 'gunhand', 'outlaw', 'legend']) {
      sizes.push(await game.evaluate(async id => {
        Difficulty.set(id);
        const expected = Difficulty.garrisonSize();
        startRound();
        for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
        return { id, expected, actual: npcs.filter(n => !n.civil && !n.dead).length, all: npcs.length };
      }, level));
    }
    for (const s of sizes) expect(s.actual, s.id + ' fields ' + s.expected + ' lawmen').toBe(s.expected);
    await game.evaluate(() => Difficulty.set('gunhand'));

    // now stir up as much trouble as possible and watch the headcount
    const count = () => game.evaluate(() => ({ law: npcs.filter(n => !n.civil && !n.dead).length, total: npcs.length }));
    const before = await count();
    await game.evaluate(async () => {
      Difficulty.set('gunhand');
      Law.clearRecord();
      Law.crime('lawman', { witnesses: 3, x: 0, z: 0 });
      Law.crime('lawman', { witnesses: 3, x: 0, z: 0 });
      Law.crime('murder', { witnesses: 3, x: 0, z: 0 });
      for (let i = 0; i < 60; i++) await new Promise(r => requestAnimationFrame(r));
    });
    const after = await count();
    expect(after.total, 'the world did not grow a single man').toBe(before.total);
    expect(after.law, 'and no lawman was created').toBeLessThanOrEqual(before.law);
    expect(await game.evaluate(() => Law.status().wanted), 'even at a high wanted level').toBeGreaterThanOrEqual(3);
    await game.evaluate(() => Difficulty.set('deputy'));
    expectNoErrors(log);
  });

  test('firing at the dirt gets you a deputy, not a fusillade', async ({ game }) => {
    const log = await resetGame(game);
    const res = await game.evaluate(async () => {
      // count every NPC shot, so "they are shooting me" is measured rather than guessed
      window.__shots = 0;
      if (!window.__shotWrap) {
        window.__shotWrap = true;
        const inner = window.fireNpc;
        window.fireNpc = function (n, pd, m) { window.__shots++; return inner(n, pd, m); };
      }
      const law = npcs.find(n => !n.civil && !n.isSheriff);
      const wit = npcs.find(n => n.civil);
      npcs.forEach(n => { if (n !== law && n !== wit) n.g.position.set(-120, heightAt(-120, -120), -120); });
      law.g.position.set(player.g.position.x + 11, player.g.position.y, player.g.position.z);
      wit.g.position.set(player.g.position.x + 6, player.g.position.y, player.g.position.z + 2);
      Law.clearRecord();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const hp0 = hp;
      // three shots into the ground, the way a bored player does
      for (let i = 0; i < 3; i++) {
        pitch = 1.1; lastShot = 0; lastGunCrime = -99;
        shoot();
        for (let f = 0; f < 10; f++) await new Promise(r => requestAnimationFrame(r));
      }
      wit.g.position.set(law.g.position.x + 1, law.g.position.y, law.g.position.z);
      for (let f = 0; f < 60; f++) await new Promise(r => requestAnimationFrame(r));
      const quiet = { wanted, violent: Law.violentNow(), mayFire: Law.mayOpenFire(law), shots: window.__shots, hpLost: +(hp0 - hp).toFixed(2) };
      // Now draw blood: one murder with witnesses, which is what a player does by shooting a
      // person. That is the line - not the wanted level - that starts the gunfight.
      window.__shots = 0;
      Law.clearRecord();
      Law.crime('murder', { witnesses: 3, x: 0, z: 0 });
      const armed = { wanted, violent: Law.violentNow(), mayFire: Law.mayOpenFire(law) };
      const hp1 = hp;
      for (let f = 0; f < 150; f++) await new Promise(r => requestAnimationFrame(r));
      return { quiet, armed, after: { wanted, shots: window.__shots, hpLost: +(hp1 - hp).toFixed(2), state: law.ai.state } };
    });
    expect(res.quiet.violent, 'shooting the dirt is not violence').toBe(false);
    expect(res.quiet.mayFire, 'so nobody is cleared to shoot you').toBe(false);
    expect(res.quiet.shots, 'not one shot was fired at the player').toBe(0);
    expect(res.quiet.hpLost).toBe(0);
    expect(res.armed.violent, 'shooting a person is').toBe(true);
    expect(res.armed.wanted, 'a single murder is only a middling wanted level').toBeLessThanOrEqual(3);
    expect(res.armed.mayFire, 'and that is enough to start the shooting, whatever the level').toBe(true);
    expect(res.after.shots, 'so they chase and shoot').toBeGreaterThan(0);
    expectNoErrors(log);
  });

  test('a new round is a new day: the manhunt resets, the bounty stays', async ({ game }) => {
    const log = await resetGame(game);
    const res = await game.evaluate(async () => {
      Law.clearRecord();
      Law.crime('lawman', { witnesses: 3, x: 0, z: 0 });
      Law.crime('murder', { witnesses: 3, x: 0, z: 0 });
      for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
      const armed = Law.status().wanted;
      const bounty = Law.bounty;
      endRound('law', 'timeout');
      await new Promise(r => requestAnimationFrame(r));
      nextAfterEnd();
      for (let i = 0; i < 20; i++) await new Promise(r => requestAnimationFrame(r));
      return {
        armed, bounty, wanted: Law.status().wanted, heat: +Law.heat.toFixed(2),
        bountyAfter: Law.bounty,
        hot: npcs.filter(n => !n.dead && !n.civil && n.ai &&
          (n.ai.state === 'combat' || n.ai.state === 'cover' || n.ai.state === 'flank')).length,
        injured: hp < maxHp
      };
    });
    expect(res.armed, 'the crimes earned a manhunt').toBeGreaterThan(0);
    expect(res.wanted, 'the new round starts with a clean slate, not the old record').toBe(0);
    expect(res.hot, 'and nobody is hunting the player').toBe(0);
    expect(res.injured, 'so the player is not being shot at on spawn').toBe(false);
    expect(res.bountyAfter, 'but the price on your head is still on the books').toBe(res.bounty);
    expectNoErrors(log);
  });

  test('firing the gun still works, and a witnessed shot opens a case', async ({ game }) => {
    const log = await resetGame(game);
    const res = await game.evaluate(async () => {
      Law.clearRecord();
      // stand a witness in front of the player so the shot is seen
      const witness = npcs.find(n => n.civil && !n.dead);
      npcs.forEach(n => { if (n !== witness && !n.dead) n.g.position.set(-120, heightAt(-120, -120), -120); });
      witness.g.position.set(player.g.position.x + 7, player.g.position.y, player.g.position.z);
      witness.g.rotation.y = Math.atan2(player.g.position.x - witness.g.position.x, player.g.position.z - witness.g.position.z);
      Perceive.forget(witness);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const before = { ammo, cases: Witnesses.cases.length };
      let threw = null;
      try { lastGunCrime = -99; lastShot = 0; pitch = -1; shoot(); } catch (e) { threw = e.message; }
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      // a second shot has to work too: the crime bookkeeping is rate limited
      let threw2 = null;
      try { lastShot = 0; shoot(); } catch (e) { threw2 = e.message; }
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      Law.update(0.02);
      return {
        threw, threw2,
        spent: before.ammo - ammo,
        cases: Witnesses.cases.length, opened: Witnesses.cases.length - before.cases,
        heat: +Law.heat.toFixed(2)
      };
    });
    expect(res.threw, 'the first shot does not throw').toBeNull();
    expect(res.threw2, 'and neither does the second').toBeNull();
    expect(res.spent, 'rounds are actually spent').toBe(2);
    expect(res.opened, 'a witnessed shot opens a case').toBeGreaterThan(0);
    // a case is not heat: the record only grows when the witness reaches the law
    expect(res.heat, 'the case is open but the law has not been told yet').toBe(0);
    expectNoErrors(log);
  });

  test('the wanted level comes from the record, and the response escalates with it', async ({ game }) => {
    const log = await resetGame(game);
    const out = await game.evaluate(async () => {
      // the law's own rate is difficulty scaled, so this measures the escalation at the
      // neutral baseline rather than at whatever the default happens to be
      Difficulty.set('gunhand');
      const steps = [];
      Law.clearRecord();
      const add = (kind, n) => { Law.crime(kind, { witnesses: n, x: 0, z: 0 }); Law.update(0.016); };
      const snap = () => ({
        heat: +Law.heat.toFixed(1), wanted: Law.status().wanted,
        commit: Law.status().response.commit,
        label: Law.status().response.label
      });
      steps.push(snap());
      add('gunfire', 2);
      const nuisance = { heat: +Law.heat.toFixed(1) };
      add('gunfire', 2); steps.push(snap());
      add('assault', 2); steps.push(snap());
      add('murder', 3); steps.push(snap());
      add('lawman', 3); steps.push(snap());
      add('lawman', 3); add('murder', 3); steps.push(snap());
      return { steps, nuisance };
    });
    const res = out.steps;
    expect(out.nuisance.heat, 'one witnessed burst is a nuisance, not a manhunt').toBeGreaterThan(0);
    expect(res[0].wanted, 'a clean record is no wanted level').toBe(0);
    expect(res[1].wanted, 'repeated gunfire in public gets you noticed').toBeGreaterThanOrEqual(1);
    expect(res[2].wanted, 'assault on top of it').toBeGreaterThanOrEqual(res[1].wanted);
    expect(res[3].wanted, 'murder is worse than both').toBeGreaterThan(res[2].wanted);
    expect(res[5].wanted, 'and killing lawmen gets you hunted').toBeGreaterThanOrEqual(4);
    // and the escalation itself: deputies, then the sheriff, then a party, then hunters
    // The ladder itself: each level commits more of the standing posse, and says so.
    const table = await game.evaluate(() => [0, 1, 2, 3, 4, 5].map(l => Law.responseFor(l)));
    expect(table[0].commit, 'no heat, nobody sent').toBe(0);
    expect(table[1].commit, 'one deputy asks around').toBe(1);
    expect(table[2].commit, 'then a pair').toBe(2);
    expect(table[3].label, 'the sheriff rides out at 3').toContain('sheriff');
    expect(table[4].label, 'a search party at 4').toContain('search party');
    expect(table[5].label, 'the whole posse at 5').toContain('posse');
    for (let i = 2; i <= 4; i++) {
      expect(table[i].commit, 'level ' + i + ' commits more than level ' + (i - 1))
        .toBeGreaterThan(table[i - 1].commit);
    }
    expectNoErrors(log);
  });

  test('the law actually turns out, and cools off when nobody is looking', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      Difficulty.set('gunhand');
      Law.clearRecord();
      const before = npcs.filter(n => !n.dead).length;
      const live = () => npcs.filter(n => !n.dead).length;
      const lawmen = () => npcs.filter(n => !n.dead && !n.civil).length;
      const lawBefore = lawmen();
      Law.crime('lawman', { witnesses: 3, x: 0, z: 0 });
      Law.crime('lawman', { witnesses: 3, x: 0, z: 0 });
      Law.crime('murder', { witnesses: 3, x: 0, z: 0 });
      const peak = Law.status();
      // Ask for the response directly. The automatic path has a cooldown on purpose (a
      // posse is not sent twice), so driving it here keeps this assertion about the
      // response table rather than about how many frames the test happened to wait.
      const sent = Law.escalate();
      const diag = { npcs: npcs.length, lawBefore, lawAfter: lawmen(), wanted: peak.wanted, heat: peak.heat, sent, response: peak.response, sentLevels: Law.snapshot().sent };
      // and the loop does reach it on its own: clear the answered marker and wait for
      // the event rather than for the men
      Law.resetResponses();
      let autoFired = false;
      const off = Bus.on('law:response', () => { autoFired = true; });
      for (let i = 0; i < 120 && !autoFired; i++) await new Promise(r => requestAnimationFrame(r));
      off();
      // nobody can see the player any more: the record should cool
      npcs.forEach(n => Perceive.forget(n));
      const heat0 = Law.heat;
      for (let i = 0; i < 160; i++) { Law.update(0.2); }
      return { before, live: live(), sent, diag, peak: peak.wanted, peakHeat: +peak.heat.toFixed(1), heat0: +heat0.toFixed(1), heat1: +Law.heat.toFixed(1), cold: Law.status().wanted };
    });
    expect(res.sent, 'the law commits men on its own: ' + JSON.stringify(res.diag)).toBeGreaterThan(0);
    expect(res.diag.lawAfter, 'and not one of them was created for it').toBeLessThanOrEqual(res.diag.lawBefore);
    expect(res.peak, 'and the level went up').toBeGreaterThanOrEqual(3);
    expect(res.heat1, 'the record cools when nobody has eyes on you').toBeLessThan(res.heat0);
    expect(res.cold, 'and eventually the trail goes cold').toBeLessThan(res.peak);
  });

  test('a price on your head shows in the HUD, and a save keeps the record', async ({ game }) => {
    const log = await resetGame(game);
    const shown = await game.evaluate(async () => {
      Law.clearRecord();
      Law.crime('lawman', { witnesses: 3, x: 0, z: 0 });
      Law.update(0.016);
      for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r));
      return { bounty: Law.bounty, text: bountyEl.textContent, on: bountyEl.classList.contains('on') };
    });
    expect(shown.bounty, 'there is a price on your head').toBeGreaterThan(0);
    expect(shown.on, 'and the HUD says so').toBe(true);
    expect(shown.text).toContain('BOUNTY');

    const kept = await game.evaluate(async () => {
      const heat = Law.heat;
      const snap = Law.snapshot();
      cash = 300;
      Save.write('1');
      Law.clearRecord();
      const cleared = Law.heat;
      Save.load('1');
      return { heat, snap: !!snap, cleared, restored: Law.heat, wanted: Law.status().wanted };
    });
    expect(kept.cleared, 'the record was wiped before the load').toBe(0);
    expect(kept.restored, 'and the save put it back').toBeCloseTo(kept.heat, 1);
    expect(kept.wanted, 'with the wanted level that goes with it').toBeGreaterThan(0);
    expectNoErrors(log);
  });
});
