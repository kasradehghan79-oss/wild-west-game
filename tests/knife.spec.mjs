/* ==========================================================================
   The Wild West - tests/knife.spec.mjs
   The knife: a silent kill on a man who has not seen you, and an ordinary weapon
   on anybody else. The rule that matters to the player is the first one - nobody
   hears, nobody reports, nobody comes - so most of these tests are about who was
   looking.

   Every case stages the scene and swings in a *single* page.evaluate: an NPC's AI
   gets a frame between calls, and a man who has wandered two metres or turned to
   face you is no longer the man you staged.
   ========================================================================== */
import { test, expect, resetGame } from './support/fixtures.mjs';
import { expectNoErrors } from './support/game.mjs';

// Set the scene and swing. `facing` is 'away' for a back, 'toward' for a fight, and
// `dist` is how far in front of the player the target stands.
const stab = (game, opts) => game.evaluate(async o => {
  const target = npcs.find(n => !n.dead && !n.isSheriff && (o.kind === 'civil' ? n.civil : !n.civil));
  if (!target) return { error: 'no target' };
  npcs.forEach(n => {
    if (n === target) return;
    n.g.position.set(-124, heightAt(-124, -124), -124);
    Perceive.forget(n);
  });
  player.g.position.set(0, heightAt(0, 0), 0);
  // at yaw 0 the player looks along -z, so "in front" is negative z
  const place = d => {
    target.g.position.set(0, heightAt(0, -d), -d);
    const toPlayer = Math.atan2(player.g.position.x - target.g.position.x, player.g.position.z - target.g.position.z);
    target.g.rotation.y = o.facing === 'away' ? toPlayer + Math.PI : toPlayer;
  };
  place(o.dist);
  target.hp = o.hp === undefined ? 6 : o.hp;
  Perceive.forget(target);
  yaw = 0; pitch = 0;
  Law.clearRecord();
  switchWeapon('knife');

  const out = {};
  const swing = () => {
    lastShot = 0;
    shoot();
  };
  // A swing is an animation now, and the blow lands partway through it, so every
  // measurement has to wait for the swing to finish rather than reading on the input.
  const settle = async () => {
    let frames = 0;
    while (knifeSwingT >= 0 && frames < 120) {
      await new Promise(r => requestAnimationFrame(r));
      frames++;
    }
    return frames;
  };
  out.reach = nearestInReach(WEAPONS.knife.reach) ? +nearestInReach(WEAPONS.knife.reach).d.toFixed(2) : null;
  out.canAssassinate = canAssassinate(target, WEAPONS.knife.backstab);
  out.hpBefore = target.hp;
  swing();
  out.swingingOnInput = knifeSwingT >= 0;
  out.hpOnInput = +target.hp.toFixed(2);
  await settle();
  out.hpAfterStab = +target.hp.toFixed(2);
  out.dead = !!target.dead;
  out.kills = kills;
  out.heat = +Law.heat.toFixed(2);
  out.cases = Witnesses.status().total;
  out.violent = Law.violentNow();
  out.wanted = wanted;
  out.ammo = ammo;
  out.weapon = curWeapon;
  // and a deliberate second swing from further away, to prove the reach is real
  if (o.thenFar) {
    place(o.thenFar);
    out.hpFarBefore = +target.hp.toFixed(2);
    swing();
    await settle();
    out.hpAfterFar = +target.hp.toFixed(2);
  }
  return out;
}, opts);

test.describe('the knife', () => {
  test('an unseen kill from behind is silent: no heat, no wanted, nobody comes', async ({ game }) => {
    const log = await resetGame(game);
    const res = await stab(game, { facing: 'away', dist: 1.4 });
    expect(res.weapon, 'the knife is drawn').toBe('knife');
    expect(res.canAssassinate, 'his back is to us and he has not seen us').toBe(true);
    expect(res.dead, 'the man was taken').toBe(true);
    expect(res.kills, 'and counted').toBe(1);
    expect(res.ammo, 'the knife uses no ammunition').toBe(0);
    expect(res.heat, 'a kill nobody saw leaves no record').toBe(0);
    expect(res.wanted, 'so the law has no reason to come').toBe(0);
    expect(res.violent, 'and there is no blood on the record').toBe(false);
    expect(res.cases, 'no case was even opened').toBe(0);
    expectNoErrors(log);
  });

  test('the same kill in front of a lawman is a murder on the record', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      const target = npcs.find(n => !n.dead && !n.civil && !n.isSheriff);
      const watcher = npcs.find(n => !n.dead && n !== target);
      // a second lawman stands with the watcher: the witness has to be able to *reach*
      // the law with the news, and a man 124 metres away is a 30 second run
      const backup = npcs.find(n => !n.dead && !n.civil && n !== target && n !== watcher);
      npcs.forEach(n => { if (n !== target && n !== watcher && n !== backup) n.g.position.set(-124, heightAt(-124, -124), -124); });
      player.g.position.set(0, heightAt(0, 0), 0);
      target.g.position.set(0, heightAt(0, -1.4), -1.4);
      target.g.rotation.y = Math.atan2(0, 1.4) + Math.PI;        // his back to us
      target.hp = 6;
      watcher.g.position.set(3, heightAt(3, -0.6), -0.6);
      watcher.g.rotation.y = Math.atan2(0 - 3, -1.4 + 0.6);      // turned to watch the spot
      if (backup) backup.g.position.set(4, heightAt(4, -0.6), -0.6);
      Perceive.forget(target); Perceive.forget(watcher);
      Law.clearRecord();
      switchWeapon('knife');
      yaw = 0; pitch = 0;
      const saw = Perceive.canSee(watcher, target.g.position.x, target.g.position.z);
      lastShot = 0;
      shoot();
      for (let i = 0; i < 90; i++) await new Promise(r => requestAnimationFrame(r));
      return { saw, dead: !!target.dead, cases: Witnesses.status().total, heat: +Law.heat.toFixed(2), wanted };
    });
    expect(res.saw, 'the lawman could see the spot').toBe(true);
    expect(res.dead, 'the target died').toBe(true);
    expect(res.cases, 'a case was opened').toBeGreaterThan(0);
    expect(res.heat, 'and the report reached the law').toBeGreaterThan(0);
    expect(res.wanted, 'so the county wants you').toBeGreaterThan(0);
  });

  test('a stab at the front is just as lethal: the knife kills in one blow', async ({ game }) => {
    const log = await resetGame(game);
    const hand = await stab(game, { facing: 'toward', dist: 1.4 });
    expect(hand.canAssassinate, 'a man looking at you cannot be taken quietly').toBe(false);
    expect(hand.dead, 'but the blow still kills him').toBe(true);
    expect(hand.kills).toBe(1);
    expectNoErrors(log);
  });

  test('the blow lands during the swing, not on the button', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      const target = npcs.find(n => !n.dead && !n.civil && !n.isSheriff);   // not the two-blow exception
      npcs.forEach(n => { if (n !== target) n.g.position.set(-124, heightAt(-124, -124), -124); });
      player.g.position.set(0, heightAt(0, 0), 0);
      target.g.position.set(0, heightAt(0, -1.4), -1.4);
      target.g.rotation.y = 0;
      target.hp = 6;
      target.knifeHits = 0;
      Perceive.forget(target);
      Law.clearRecord();
      switchWeapon('knife');
      yaw = 0; lastShot = 0;
      shoot();
      const atInput = { swinging: knifeSwingT >= 0, hp: +target.hp.toFixed(2), dead: !!target.dead };
      // step to just past the impact frame
      let frames = 0;
      while (knifeSwingT >= 0 && frames < 60) {
        await new Promise(r => requestAnimationFrame(r));
        frames++;
        if (knifeSwingHit) break;
      }
      return { atInput, hit: knifeSwingHit, frames, hp: +target.hp.toFixed(2), dead: !!target.dead };
    });
    expect(res.atInput.swinging, 'the swing starts on the input').toBe(true);
    expect(res.atInput.hp, 'but nothing has been hurt yet').toBe(6);
    expect(res.hit, 'the impact frame arrives').toBe(true);
    expect(res.dead, 'and that is where he dies').toBe(true);
  });

  test('the sheriff takes two blows, everyone else takes one', async ({ game }) => {
    await resetGame(game);
    const res = await game.evaluate(async () => {
      // Settle ends as soon as the man is dead, not only when the swing finishes: killing
      // the sheriff ends the round and freezes the animation mid flight.
      const settle = async n => {
        let frames = 0;
        while (knifeSwingT >= 0 && !n.dead && frames < 60) { await new Promise(r => requestAnimationFrame(r)); frames++; }
        return n;
      };
      const sh = npcs.find(n => n.isSheriff && !n.dead);
      const deputy = npcs.find(n => !n.dead && !n.civil && !n.isSheriff);
      npcs.forEach(n => { if (n !== sh && n !== deputy) n.g.position.set(-124, heightAt(-124, -124), -124); });
      player.g.position.set(0, heightAt(0, 0), 0);
      switchWeapon('knife');
      yaw = 0;

      // the deputy first: a knife kills him in one blow
      deputy.hp = 6;
      deputy.knifeHits = 0;
      Perceive.forget(deputy);
      deputy.g.position.set(0, heightAt(0, -1.4), -1.4);
      deputy.g.rotation.y = 0;
      lastShot = 0; shoot();
      await settle(deputy);
      const deputyDead = !!deputy.dead;

      // and the sheriff last, because his death ends the round
      await new Promise(r => setTimeout(r, 500));
      sh.g.position.set(0, heightAt(0, -1.4), -1.4);
      sh.g.rotation.y = 0;
      Perceive.forget(sh);
      lastShot = 0; shoot();
      await settle(sh);
      const afterOne = { hp: +sh.hp.toFixed(2), dead: !!sh.dead };
      await new Promise(r => setTimeout(r, 500));
      sh.g.position.set(0, heightAt(0, -1.4), -1.4);
      lastShot = 0; shoot();
      await settle(sh);
      const afterTwo = { hp: +sh.hp.toFixed(2), dead: !!sh.dead };
      const near = nearestInReach(WEAPONS.knife.reach);
      return {
        afterOne, afterTwo, deputyDead: !!deputy.dead, needed: WEAPONS.knife.sheriffHits,
        deputy: { hp: +deputy.hp.toFixed(2), hits: deputy.knifeHits || 0, dist: near ? +near.d.toFixed(2) : null,
          sheriffNear: near ? !!near.npc.isSheriff : false, swinging: knifeSwingT >= 0 }
      };
    });
    expect(res.needed, 'the sheriff needs two').toBe(2);
    expect(res.afterOne.dead, 'one blow does not take him').toBe(false);
    expect(res.afterOne.hp, 'but it leaves him badly hurt').toBeLessThan(6);
    expect(res.afterTwo.dead, 'the second finishes it').toBe(true);
    expect(res.deputyDead, 'while anyone else dies to the first: ' + JSON.stringify(res.deputy)).toBe(true);
  });

  test('the knife reaches arm length and no further', async ({ game }) => {
    await resetGame(game);
    const res = await stab(game, { facing: 'toward', dist: 1.6, thenFar: 4.5 });
    expect(res.reach, 'he is within reach to start with').not.toBeNull();
    const afterNear = +res.hpAfterStab;
    expect(afterNear, 'a stab at 1.6m lands').toBeLessThan(res.hpBefore);
    expect(+res.hpAfterFar, 'a swing at 4.5m finds nothing').toBe(afterNear);
  });

  test('the knife works on anyone, and the chosen weapon survives a save', async ({ game }) => {
    await resetGame(game);
    const civilian = await stab(game, { facing: 'toward', dist: 1.4, kind: 'civil', hp: 6 });
    expect(+civilian.hpAfterStab, 'a civilian can be stabbed too').toBeLessThan(civilian.hpBefore);

    const persisted = await game.evaluate(async () => {
      switchWeapon('knife');
      cash = 100;
      Save.write('1');
      switchWeapon('revolver');
      const before = curWeapon;
      Save.load('1');
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { before, after: curWeapon, live: Mode.live(), knifeVisible: knife.visible };
    });
    expect(persisted.before).toBe('revolver');
    expect(persisted.after, 'the drawn weapon comes back as it was').toBe('knife');
    expect(persisted.knifeVisible, 'and the model with it').toBe(true);
    expect(persisted.live).toBe(true);
  });
});
