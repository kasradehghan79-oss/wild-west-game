/* ==========================================================================
   The Wild West - tests/support/game.mjs
   The vocabulary every spec is written in: booting the real game, reading its
   state, freezing/unfreezing it, driving touch and keyboard input, and measuring
   the on screen layout.

   Everything here talks to the game the way a player does - through the DOM and
   through real input events - plus one deliberate exception: reading the module
   level state (cash, npcs, Mode) so assertions can be exact instead of pixel
   guessing. The game's globals are `let`/`const` at script scope, which makes
   them reachable by name from page.evaluate but *not* as window properties.
   ========================================================================== */
import { expect } from '@playwright/test';

// ---------------------------------------------------------------- console
// Any uncaught error or console.error is a bug: the suite fails on them.
// Warnings are collected separately so a spec can assert the ones it expects.
export function watchConsole(page) {
  const log = { errors: [], warnings: [], all: [] };
  page.on('pageerror', e => log.errors.push('pageerror: ' + e.message));
  page.on('console', msg => {
    const text = msg.text();
    log.all.push(msg.type() + ': ' + text);
    if (msg.type() === 'error') log.errors.push(text);
    else if (msg.type() === 'warning') log.warnings.push(text);
  });
  return log;
}

export function expectNoErrors(log, allow = []) {
  const unexpected = log.errors.filter(t => !allow.some(a => t.includes(a)));
  expect(unexpected, 'uncaught errors or console.error output').toEqual([]);
}

// ---------------------------------------------------------------- booting
// Every test boots a whole WebGL scene, which is the most expensive thing this
// suite does. Unless a spec asks for the full pipeline, the page is seeded with
// the cheapest quality tier before it loads: no shadows, no post chain, so a boot
// costs a fraction of a second instead of several. perf.spec.mjs is the one place
// that exercises the real tiers.
export async function openGame(page, { failOnError = true, quality = 0, seedSettings = true } = {}) {
  if (seedSettings) {
    await page.addInitScript(q => {
      try {
        if (!localStorage.getItem('wildwest.settings')) {
          localStorage.setItem('wildwest.settings', JSON.stringify({ quality: q, sens: 0.0022, volume: 0.7, invertY: false }));
        }
      } catch (e) { /* storage may be blocked; the game copes */ }
    }, quality);
  }
  const log = watchConsole(page);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof Mode === 'object' && typeof Save === 'object' && typeof Bus === 'object');
  await page.waitForFunction(() => frame > 2);
  if (failOnError) expectNoErrors(log);
  return log;
}

// The title screen: PLAY. Returns once the match is actually live.
export async function startMatch(page) {
  await page.locator('#startBtn').click();
  await page.waitForFunction(() => Mode.live());
  await page.waitForFunction(() => frame > 4);
}

// The common case: fresh page, match running.
export async function boot(page, opts) {
  const log = await openGame(page, opts);
  await startMatch(page);
  return log;
}

// Empty storage without paying for another boot: the save system reads storage
// live, so the running game sees the cleared slots immediately.
export async function clearStorage(page) {
  await page.evaluate(() => localStorage.clear());
  await page.waitForFunction(() => Save.status('auto') === 'empty');
  refreshContinueButton(page);
}

export async function refreshContinueButton(page) {
  await page.evaluate(() => refreshContinue());
}

// ---------------------------------------------------------------- state
// A snapshot of everything the specs assert on.
export async function gameState(page) {
  return page.evaluate(() => ({
    mode: Mode.current(),
    live: Mode.live(),
    frozen: Mode.frozen(),
    matchState,
    paused,
    shopOpen,
    playerDead,
    frame,
    hp,
    maxHp,
    cash,
    kills,
    totalKills,
    headshots,
    survivedRounds,
    wanted,
    wantedT,
    outlawPts,
    lawPts,
    roundNum,
    roundT,
    sheriffRevealed,
    dayTime,
    playtime,
    mounted,
    curWeapon,
    ammo,
    magSize,
    stam,
    upgrades: { ...upgrades },
    weapons: {
      revolver: { owned: playerWeapons.revolver.owned, ammo: playerWeapons.revolver.ammo },
      rifle: { owned: playerWeapons.rifle.owned, ammo: playerWeapons.rifle.ammo }
    },
    pos: { x: +player.g.position.x.toFixed(2), z: +player.g.position.z.toFixed(2) },
    yaw: +yaw.toFixed(4),
    pitch: +pitch.toFixed(4),
    horsePos: { x: +horse.g.position.x.toFixed(2), z: +horse.g.position.z.toFixed(2) },
    npcCount: npcs.length,
    npcsAlive: npcs.filter(n => !n.dead).length,
    npcPositions: npcs.map(n => [+n.g.position.x.toFixed(2), +n.g.position.z.toFixed(2), n.dead ? 1 : 0])
  }));
}

// Put the game into an exact state. Only fields listed here can be set, so a spec
// cannot accidentally write a global the game does not expect.
export async function patch(page, d) {
  return page.evaluate(data => {
    if ('cash' in data) cash = data.cash;
    if ('hp' in data) hp = data.hp;
    if ('sinceDmg' in data) sinceDmg = data.sinceDmg;
    if ('kills' in data) kills = data.kills;
    if ('headshots' in data) headshots = data.headshots;
    if ('totalKills' in data) totalKills = data.totalKills;
    if ('survivedRounds' in data) survivedRounds = data.survivedRounds;
    if ('wanted' in data) wanted = data.wanted;
    if ('wantedT' in data) wantedT = data.wantedT;
    if ('outlawPts' in data) outlawPts = data.outlawPts;
    if ('lawPts' in data) lawPts = data.lawPts;
    if ('roundNum' in data) roundNum = data.roundNum;
    if ('roundT' in data) roundT = data.roundT;
    if ('sheriffRevealed' in data) sheriffRevealed = data.sheriffRevealed;
    if ('dayTime' in data) dayTime = data.dayTime;
    if ('playtime' in data) playtime = data.playtime;
    if ('ammo' in data) setAmmo(data.ammo);
    if ('upgrades' in data) {
      Object.assign(upgrades, data.upgrades);
      maxHp = maxHpNow();
      hp = Math.min(hp, maxHp);
      refreshHearts();
      syncWeapon();
    }
    if ('rifle' in data) {
      playerWeapons.rifle.owned = !!data.rifle;
      playerWeapons.rifle.ammo = data.rifle ? magFor('rifle') : 0;
      if (!data.rifle && curWeapon === 'rifle') { curWeapon = 'revolver'; drawWeapons(); }
      syncWeapon();
    }
    if ('weapon' in data) {
      curWeapon = data.weapon;
      drawWeapons();
      syncWeapon();
    }
    if ('pos' in data) {
      player.g.position.set(data.pos[0], heightAt(data.pos[0], data.pos[1]), data.pos[1]);
    }
    if ('yaw' in data) yaw = data.yaw;
    return true;
  }, d);
}

// ---------------------------------------------------------------- waiting
export async function waitForMode(page, name) {
  await page.waitForFunction(n => Mode.current() === n, name);
}

export async function waitForLive(page) {
  await page.waitForFunction(() => Mode.live());
}

// ---------------------------------------------------------------- probes
// Wait for a number of rendered frames. This matters more than it sounds: the
// loop clamps dt to 50ms, so under the software renderer (~4-6fps) the game's
// clock runs several times slower than the wall clock. Every wait in these specs
// that is about the game reacting has to be counted in frames, or it is measuring
// the CI machine rather than the game.
export async function waitFrames(page, frames = 6) {
  await page.evaluate(async n => {
    for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r));
  }, frames);
}

// Sample the world across a number of frames and report what moved. Used both
// ways round: while frozen nothing may move, while live the same numbers must.
export async function probe(page, frames = 6) {
  return page.evaluate(async n => {
    const npc = npcs.find(n => !n.dead);
    const start = {
      npc: [npc.g.position.x, npc.g.position.z],
      player: [player.g.position.x, player.g.position.z],
      horse: [horse.g.position.x, horse.g.position.z],
      roundT, dayTime, hp, playtime, frame
    };
    for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r));
    const now = {
      npc: [npc.g.position.x, npc.g.position.z],
      player: [player.g.position.x, player.g.position.z],
      horse: [horse.g.position.x, horse.g.position.z],
      roundT, dayTime, hp, playtime, frame
    };
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    return {
      frames: n,
      npcMoved: +dist(start.npc, now.npc).toFixed(3),
      playerMoved: +dist(start.player, now.player).toFixed(3),
      horseMoved: +dist(start.horse, now.horse).toFixed(3),
      roundTDelta: +(now.roundT - start.roundT).toFixed(3),
      dayTimeDelta: +(now.dayTime - start.dayTime).toFixed(6),
      hpDelta: +(now.hp - start.hp).toFixed(3),
      playtimeDelta: +(now.playtime - start.playtime).toFixed(3),
      framesRendered: now.frame - start.frame
    };
  }, frames);
}

// ---------------------------------------------------------------- input
// Real touch events through CDP: page.touchscreen.tap only taps, and the stick
// and the look drag both need a held, moving finger. `hold` keeps the finger down
// after the drag, which is what makes "walk for a moment" testable.
export async function touchDrag(page, from, to, { steps = 6, stepMs = 20, hold = 0 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const pts = (x, y) => [{ x: Math.round(x), y: Math.round(y), radiusX: 6, radiusY: 6, force: 1, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from[0], from[1]) });
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: pts(from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k)
    });
    if (stepMs) await page.waitForTimeout(stepMs);
  }
  if (hold) await page.waitForTimeout(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

export async function touchTap(page, x, y) {
  const cdp = await page.context().newCDPSession(page);
  const pts = [{ x: Math.round(x), y: Math.round(y), radiusX: 6, radiusY: 6, force: 1, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

// Tap the middle of a button the way a thumb would, wherever it happens to sit.
export async function touchButton(page, selector) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error('no box for ' + selector);
  await touchTap(page, box.x + box.width / 2, box.y + box.height / 2);
}

// Left half: walk, and push out to the rim to sprint, the way a thumb would.
export async function stickMove(page, dx, dy, { sprint = false, hold = 600 } = {}) {
  const vp = page.viewportSize();
  const from = [vp.width * 0.16, vp.height * 0.62];
  const len = Math.hypot(dx, dy) || 1;
  const want = sprint ? 42 : 26;
  const to = [from[0] + dx / len * want, from[1] + dy / len * want];
  await touchDrag(page, from, to, { steps: 4, stepMs: 20, hold });
}

// Right half: turn the camera.
export async function lookDrag(page, dx, dy) {
  const vp = page.viewportSize();
  const from = [vp.width * 0.72, vp.height * 0.5];
  await touchDrag(page, from, [from[0] + dx, from[1] + dy], { steps: 6, stepMs: 10 });
}

// Resizing through Playwright's own API fails on a mobile-emulated page ("to
// resize a minimized/maximized/fullscreen window, restore it first"), so sizes are
// driven through CDP instead - which is also how the phone project is emulated in
// the first place.
export async function setViewport(page, width, height) {
  const cdp = await page.context().newCDPSession(page);
  const touch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: await page.evaluate(() => devicePixelRatio),
    mobile: touch,
    screenOrientation: width >= height ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 }
  });
  // A metrics override can drop the touch device the page was emulated with, and
  // then every touch event silently goes nowhere. Put it back.
  if (touch) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.detach();
  await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height]);
}

// ---------------------------------------------------------------- layout
// Every element a thumb can hit, measured. Hidden ones and the non interactive
// readouts are separated so the spec can assert on each set differently.
export async function layout(page) {
  return page.evaluate(() => {
    const controls = [...document.querySelectorAll('#touchUI .tbtn, #btnHelp, #btnFsPc')];
    const readouts = ['#hud', '#score', '#rightpanel', '#vitals', '#touchhint', '#objective', '#helptext']
      .map(s => document.querySelector(s));
    const seen = new Set();
    const measure = el => {
      if (!el || seen.has(el)) return null;
      seen.add(el);
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      if (cs.display === 'none' || cs.visibility === 'hidden' || b.width < 1 || b.height < 1) return null;
      return {
        id: el.id || el.className,
        box: { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) },
        interactive: cs.pointerEvents !== 'none'
      };
    };
    const rects = controls.map(measure).filter(Boolean);
    const readRects = readouts.map(measure).filter(Boolean);
    const overlap = (a, b) => {
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      return (ox > 1 && oy > 1) ? [+ox.toFixed(0), +oy.toFixed(0)] : null;
    };
    const clashes = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const o = overlap(rects[i].box, rects[j].box);
        if (o) clashes.push(rects[i].id + ' x ' + rects[j].id + ' @ ' + o.join('x'));
      }
    }
    const readoutClashes = [];
    for (const c of rects) {
      for (const r of readRects) {
        const o = overlap(c.box, r.box);
        // the contextual pill is meant to sit over the hint line's row: it is only
        // ever shown one at a time, and the hint is text with no pointer events
        if (o && !(c.id.includes('ctx') && r.id === 'touchhint')) {
          readoutClashes.push(c.id + ' x ' + r.id + ' @ ' + o.join('x'));
        }
      }
    }
    return {
      viewport: [innerWidth, innerHeight],
      controls: rects.map(r => ({ id: r.id, ...r.box })),
      readouts: readRects.map(r => ({ id: r.id, ...r.box })),
      clashes,
      readoutClashes,
      outside: rects.filter(r => r.box.x < 0 || r.box.y < 0 ||
        r.box.x + r.box.w > innerWidth + 0.5 || r.box.y + r.box.h > innerHeight + 0.5).map(r => r.id),
      smallest: Math.min(...rects.map(r => Math.min(r.box.w, r.box.h)))
    };
  });
}

// ---------------------------------------------------------------- duels
// Shooting is a hitscan from the camera, so a test that wants a guaranteed hit has
// to control the geometry completely. This pins a chosen NPC on the ray in front
// of the camera every frame (the AI keeps trying to walk it away) and re-aims at
// its chest each frame, which is the only way to keep the shot deterministic in a
// world where everyone is moving.
export async function pinTarget(page, { dist = 6, kind = 'armed', aim = 'chest' } = {}) {
  return page.evaluate(d => {
    const pick = npcs.filter(n => !n.dead && (
      d.kind === 'sheriff' ? n.isSheriff :
        d.kind === 'civil' ? n.civil : (!n.civil && !n.isSheriff)));
    if (!pick.length) return null;
    const npc = pick.sort((a, b) =>
      a.g.position.distanceTo(player.g.position) - b.g.position.distanceTo(player.g.position))[0];
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const flat = Math.hypot(dir.x, dir.z) || 1;
    const ux = dir.x / flat, uz = dir.z / flat;
    const px = player.g.position.x + ux * d.dist;
    const pz = player.g.position.z + uz * d.dist;
    const py = heightAt(px, pz);
    const aimP = new THREE.Vector3();
    window.__pin = { on: true, npc };
    (function pin() {
      const p = window.__pin;
      if (!p || !p.on) return;
      p.npc.g.position.set(px, py, pz);
      if (d.aim === 'head') p.npc.head.getWorldPosition(aimP);
      else aimP.set(px, py + 1.05, pz);
      const cam = camera.position;
      const dx = aimP.x - cam.x, dz = aimP.z - cam.z, dy = aimP.y - cam.y;
      yaw = Math.atan2(-dx, -dz);
      pitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -1.0, 1.15);
      requestAnimationFrame(pin);
    })();
    return {
      idx: npcs.indexOf(npc), at: [+px.toFixed(1), +pz.toFixed(1)],
      hp: npc.hp, civilian: !!npc.civil, sheriff: !!npc.isSheriff, aim: d.aim
    };
  }, { dist, kind, aim });
}

export async function unpinTarget(page) {
  await page.evaluate(() => { if (window.__pin) window.__pin.on = false; });
}

// Fire at whatever is pinned. The weapon cooldown is deliberately reset between
// tries so the spec does not have to sleep out the rate limit; the aim itself is
// still the pinned, frame by frame one.
export async function fireAtPinned(page, { tries = 3, hp = 0.5 } = {}) {
  return page.evaluate(async t => {
    const npc = window.__pin && window.__pin.npc;
    if (!npc) return { error: 'nothing pinned' };
    aiming = true; bloom = 0; recoilKick = 0; runT = 0;
    npc.hp = Math.min(npc.hp, t.hp);
    const before = { kills, cash, wanted, ammo };
    const shots = [];
    for (let i = 0; i < t.tries && !npc.dead; i++) {
      const hpBefore = npc.hp;
      lastShot = 0;
      shoot();
      await new Promise(r => setTimeout(r, 150));
      shots.push(+(hpBefore - npc.hp).toFixed(2));
    }
    return {
      dead: !!npc.dead,
      hp: Math.max(0, +npc.hp.toFixed(2)),
      shots,
      killsDelta: kills - before.kills,
      cashDelta: cash - before.cash,
      wantedAfter: wanted,
      ammoSpent: before.ammo - ammo
    };
  }, { tries, hp });
}

// ---------------------------------------------------------------- save slot helpers
export async function seedSlot(page, slot, mutate) {
  return page.evaluate(({ slot, mutate }) => {
    const data = Save.snapshot();
    // eslint-disable-next-line no-new-func
    if (mutate) new Function('d', mutate)(data);
    localStorage.setItem('wildwest.save.' + slot, JSON.stringify(data));
    return JSON.parse(localStorage.getItem('wildwest.save.' + slot));
  }, { slot, mutate });
}

export async function reloadAndContinue(page) {
  await page.reload();
  await page.waitForFunction(() => typeof Save === 'object');
  await page.waitForFunction(() => continueBtn.classList.contains('on'));
  await page.locator('#continueBtn').click();
  await page.waitForFunction(() => Mode.live());
}
