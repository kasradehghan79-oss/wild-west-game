/* ==========================================================================
   The Wild West - tests/phone.controls.spec.mjs
   The touch build only: the stick, the look drag and every on screen button,
   driven with real CDP touch events rather than synthetic clicks.
   ========================================================================== */
import { test, expect, resetGame } from './support/fixtures.mjs';
import { gameState, patch, expectNoErrors, touchButton, stickMove, lookDrag, touchDrag } from './support/game.mjs';

test.describe('touch controls', () => {
  test('the stick walks, sprints at the rim, and shows and hides itself', async ({ game }) => {
    const log = await resetGame(game);
    // walk: a gentle push, short of the sprint radius
    await patch(game, { pos: [0, 0], yaw: 0 });
    await game.evaluate(() => { stam = 100; stamLock = false; });
    await stickMove(game, 0, -26);
    const walk = await game.evaluate(() => ({ x: player.g.position.x, z: player.g.position.z, stam }));

    // sprint: the same push, out at the rim
    await patch(game, { pos: [0, 0], yaw: 0 });
    await game.evaluate(() => { stam = 100; stamLock = false; });
    await stickMove(game, 0, -42, { sprint: true });
    const run = await game.evaluate(() => ({ x: player.g.position.x, z: player.g.position.z, stam }));

    const dist = p => Math.hypot(p.x, p.z);
    expect(dist(walk), 'the stick moved the player').toBeGreaterThan(0.15);
    expect(dist(run), 'and the rim push ran further').toBeGreaterThan(dist(walk) * 1.2);
    expect(run.stam, 'sprinting cost stamina').toBeLessThan(walk.stam);

    // the stick is only on screen while a finger is down, and releases cleanly
    expect(await game.evaluate(() => getComputedStyle(document.getElementById('stick')).display)).toBe('none');
    const cdp = await game.context().newCDPSession(game);
    const vp = game.viewportSize();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: vp.width * 0.2, y: vp.height * 0.6, radiusX: 6, radiusY: 6, force: 1, id: 1 }]
    });
    const shown = await game.evaluate(() => ({
      display: getComputedStyle(document.getElementById('stick')).display,
      placed: document.getElementById('stick').style.left !== ''
    }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    expect(shown.display).toBe('block');
    expect(shown.placed).toBe(true);
    const released = await game.evaluate(() => ({
      display: getComputedStyle(document.getElementById('stick')).display,
      held: Object.keys(keys).filter(k => keys[k])
    }));
    expect(released.display).toBe('none');
    expect(released.held, 'no key left stuck down').toEqual([]);
    expectNoErrors(log);
  });

  test('a swipe can come about: holding at the screen edge keeps turning', async ({ game }) => {
    const log = await resetGame(game);
    const vp = game.viewportSize();
    const deg = (a, b) => +(((b - a) * 180) / Math.PI).toFixed(0);

    const before = await game.evaluate(() => yaw);
    // A thumb can only travel from the right edge to the middle of the screen, which caps
    // a bare drag at about 115 degrees. Holding a finger in the edge zone has to keep the
    // camera turning, or the player can never come about.
    await touchDrag(game, [vp.width * 0.6, vp.height * 0.5], [vp.width - 14, vp.height * 0.5],
      // 4 seconds of wall clock is only about a second of game time under the software
      // renderer, and the turn is per second of game time
      { steps: 8, stepMs: 14, hold: 4200 });
    const after = await game.evaluate(() => yaw);
    const turned = deg(before, after);
    expect(Math.abs(turned), 'one swipe turned ' + turned + ' degrees').toBeGreaterThan(170);
    expectNoErrors(log);
  });

  test('dragging on the right half turns the camera', async ({ game }) => {
    await resetGame(game);
    const before = await game.evaluate(() => ({ yaw, pitch }));
    await lookDrag(game, 140, 0);
    const turned = await game.evaluate(() => ({ yaw, pitch }));
    expect(Math.abs(turned.yaw - before.yaw), 'yaw changed').toBeGreaterThan(0.1);
    await lookDrag(game, 0, 110);
    const pitched = await game.evaluate(() => ({ yaw, pitch }));
    expect(Math.abs(pitched.pitch - turned.pitch), 'pitch changed').toBeGreaterThan(0.1);
  });

  test('FIRE, AIM and RELOAD all reach the game', async ({ game }) => {
    await resetGame(game);
    // FIRE: a tap spends a round, a held press keeps firing at the weapon rate
    const before = await game.evaluate(() => ammo);
    await touchButton(game, '#btnFire');
    await game.waitForTimeout(350);
    expect(await game.evaluate(() => ammo), 'the tap fired').toBeLessThan(before);
    const held = await game.evaluate(async () => {
      const start = ammo;
      fireHold = true;
      await new Promise(r => setTimeout(r, 800));
      fireHold = false;
      return { start, end: ammo };
    });
    expect(held.end, 'held fire spent more rounds').toBeLessThan(held.start);

    // AIM: toggles, and lights the button
    await touchButton(game, '#btnAim');
    await game.waitForFunction(() => aiming === true);
    await expect(game.locator('#btnAim')).toHaveClass(/active/);
    await touchButton(game, '#btnAim');
    await game.waitForFunction(() => aiming === false);
    await expect(game.locator('#btnAim')).not.toHaveClass(/active/);

    // RELOAD
    await game.evaluate(() => setAmmo(1));
    await touchButton(game, '#btnReload');
    await game.waitForFunction(() => reloading === true);
    await game.waitForFunction(() => reloading === false, null, { timeout: 8000 });
    const s = await gameState(game);
    expect(s.ammo).toBe(s.magSize);

    // the weapon switch cycles the knife in, which is the phone's whole reason for
    // having the button: there are no number keys on glass
    const cycled = await game.evaluate(async () => {
      const seen = [curWeapon];
      const owned = ['revolver', 'rifle', 'knife'].filter(k => playerWeapons[k].owned);
      for (let i = 0; i < owned.length; i++) {
        cycleWeapon(1);
        seen.push(curWeapon);
        await new Promise(r => requestAnimationFrame(r));
      }
      return seen;
    });
    expect(cycled, 'cycling walks through the weapons').toContain('knife');
    expect(cycled[0], 'and a full lap comes back to where it started').toBe(cycled[cycled.length - 1]);
  });

  test('PAUSE freezes, and the contextual pill mounts and dismounts', async ({ game }) => {
    await resetGame(game);
    await touchButton(game, '#btnPause');
    await game.waitForFunction(() => Mode.current() === 'paused');
    await expect(game.locator('#pause')).toBeVisible();
    const frozen = await game.evaluate(async () => {
      const npc = npcs.find(n => !n.dead);
      const p0 = [npc.g.position.x, npc.g.position.z];
      const t0 = roundT;
      await new Promise(r => setTimeout(r, 800));
      return { moved: Math.hypot(npc.g.position.x - p0[0], npc.g.position.z - p0[1]), dt: t0 - roundT };
    });
    expect(frozen.moved).toBe(0);
    expect(frozen.dt).toBe(0);
    await game.locator('#resumeBtn').click();
    await game.waitForFunction(() => Mode.live());

    // stand next to the horse: the loop offers MOUNT on the pill
    const offered = await game.evaluate(async () => {
      player.g.position.set(horse.g.position.x + 1.2, horse.g.position.y, horse.g.position.z);
      await new Promise(r => setTimeout(r, 400));
      return { on: btnContext.classList.contains('on'), action: btnContext.dataset.action, label: ctxLabel.textContent };
    });
    expect(offered.on, 'the pill is offered').toBe(true);
    expect(offered.action).toBe('mount');
    expect(offered.label).toContain('MOUNT');

    await touchButton(game, '#btnContext');
    await game.waitForFunction(() => mounted === true);
    await game.waitForFunction(() => ctxLabel.textContent.includes('DISMOUNT'), null, { timeout: 5000 });
    await touchButton(game, '#btnContext');
    await game.waitForFunction(() => mounted === false);
  });

  test('the camera trails the player while riding, and yields to a thumb on the glass', async ({ game }) => {
    const log = await resetGame(game);
    const res = await game.evaluate(async () => {
      const settle = async frames => { for (let i = 0; i < frames; i++) await new Promise(r => requestAnimationFrame(r)); };
      // put the rider on the horse, facing somewhere the camera is not
      player.g.position.set(horse.g.position.x, horse.g.position.y, horse.g.position.z);
      if (!mounted) toggleMount();
      yaw = 0;                                    // camera looking along -z
      player.g.rotation.y = Math.PI / 2;          // player facing +x, ninety degrees off
      horse.g.rotation.y = Math.PI / 2;
      keys['KeyW'] = true;                        // stick pushed forward
      const before = yaw;
      await settle(30);
      const after = yaw;
      const want = player.g.rotation.y - Math.PI;
      keys['KeyW'] = false;
      return {
        before: +before.toFixed(3), after: +after.toFixed(3), want: +want.toFixed(3),
        movedToward: Math.abs(after - want) < Math.abs(before - want),
        mounted
      };
    });
    expect(res.mounted, 'he is riding').toBe(true);
    expect(res.movedToward, 'the camera comes round behind the horse').toBe(true);
    expect(Math.abs(res.after - res.want), 'and gets most of the way there').toBeLessThan(0.5);

    // A real finger on the glass: the follow must stop instantly, or the camera fights
    // the player for the view. Held open with CDP rather than faked with a flag.
    const cdp = await game.context().newCDPSession(game);
    const vp = game.viewportSize();
    const held = await game.evaluate(() => { keys['KeyW'] = true; return yaw; });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: vp.width * 0.75, y: vp.height * 0.5, radiusX: 6, radiusY: 6, force: 1, id: 1 }]
    });
    await game.evaluate(async () => { for (let i = 0; i < 24; i++) await new Promise(r => requestAnimationFrame(r)); });
    const withThumb = await game.evaluate(() => { keys['KeyW'] = false; return yaw; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    expect(Math.abs(withThumb - held), 'a thumb on the glass keeps the view').toBeLessThan(0.03);
    expectNoErrors(log);
  });

  test('the stick is a rein: a nudge walks, the rim gallops, and speed widens the turn', async ({ game }) => {
    // Riding is measured in frames of game time, and this environment renders at about four
    // frames a second, so this is a slow test on purpose rather than a broken one.
    test.setTimeout(150000);
    const log = await resetGame(game);
    const ride = (pushY, leanX, frames, startSpeed) => game.evaluate(async o => {
      const settle = async n => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)); };
      // ride him out in the open: a horse against a wall loses its speed to the collision
      // code every frame, which would read as a control bug when it is the scenery
      horse.g.position.set(0, heightAt(0, 0), 0);
      player.g.position.set(0, heightAt(0, 0), 0);
      if (!mounted) toggleMount();
      stam = 100; stamLock = false;
      // a turn is measured from a running start, so the gait under test is set directly
      horse.speed = o.startSpeed;
      horse.g.rotation.y = 0;
      const before = horse.g.rotation.y;
      // a real stick reading, the shape touch.js publishes
      window.touchStick = { x: o.leanX, y: o.pushY, d: Math.hypot(o.leanX, o.pushY) };
      await settle(o.frames);
      const out = { speed: +horse.speed.toFixed(2), turned: +(horse.g.rotation.y - before).toFixed(3), stam: +stam.toFixed(1) };
      window.touchStick = null;
      return out;
    }, { pushY, leanX, frames, startSpeed });

    const idle = await ride(0, 0, 24, 0);
    const walked = await ride(-12, 0, 30, 0);
    const trotted = await ride(-24, 0, 30, 0);
    const galloped = await ride(-42, 0, 30, 0);

    expect(idle.speed, 'no push, no movement').toBeLessThan(0.4);
    expect(walked.speed, 'a nudge walks').toBeGreaterThan(1.5);
    expect(trotted.speed, 'a firm push trots').toBeGreaterThan(walked.speed + 1);
    expect(galloped.speed, 'the rim gallops').toBeGreaterThan(trotted.speed + 1);
    expect(galloped.stam, 'and the gallop costs the rider wind').toBeLessThan(walked.stam);

    // the same lean, at two speeds: a walk pivots, a gallop carves
    const turnWalk = await ride(-12, -34, 16, 3.4);
    const turnGallop = await ride(-42, -34, 16, 11.5);
    expect(turnWalk.turned, 'the walk turns sharply').toBeGreaterThan(0.5);
    expect(turnGallop.turned, 'the gallop turns far less for the same lean').toBeLessThan(turnWalk.turned);
    expect(Math.abs(turnGallop.turned), 'but it does still turn').toBeGreaterThan(0.05);
    expectNoErrors(log);
  });

  test('the help button opens the touch cheat sheet', async ({ game }) => {
    await resetGame(game);
    await touchButton(game, '#btnHelp');
    await game.waitForFunction(() => getComputedStyle(helpText).display === 'block');
    const sheet = await game.evaluate(() => ({
      text: helpText.innerText,
      pc: getComputedStyle(document.querySelector('#helptext .pc')).display,
      tv: getComputedStyle(document.querySelector('#helptext .tv')).display
    }));
    expect(sheet.tv).toBe('inline');
    expect(sheet.pc).toBe('none');
    expect(sheet.text).toContain('TOUCH');
    expect(sheet.text).not.toContain('WASD');
    await touchButton(game, '#btnHelp');
    await game.waitForFunction(() => getComputedStyle(helpText).display === 'none');
  });
});
