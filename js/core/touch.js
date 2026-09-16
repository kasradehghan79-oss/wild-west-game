/* ==========================================================================
   The Wild West - js/core/touch.js
   Touch controls for mobile.
   Provides:  virtual sticks and buttons
   Expects:   state.js, input.js (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- touch ----------
if (isTouch) {
  const $ = id => document.getElementById(id);
  // lets the stylesheets adapt: the keyboard cheat sheet on the start screen is
  // pointless with on screen controls, and it costs vertical space
  document.body.classList.add('touch');
  $('touchUI').style.display = 'block';
  $('touchhint').style.display = 'block';
  const stick = $('stick'), knob = $('knob'), cv = renderer3;
  let moveId = null, moveO = { x: 0, y: 0 };
  const lookT = {};
  cv.addEventListener('touchstart', e => {
    e.preventDefault();
    Sound.resume();
    if (shopOpen || paused) return;
    for (const t of e.changedTouches) {
      if (moveId === null && t.clientX < innerWidth / 2) {
        moveId = t.identifier;
        moveO = { x: t.clientX, y: t.clientY };
        stick.style.display = 'block';
        stick.style.left = t.clientX + 'px';
        stick.style.top = t.clientY + 'px';
        knob.style.transform = 'translate(-50%, -50%)';
      } else if (t.identifier !== moveId && t.clientX >= innerWidth / 2) {
        lookT[t.identifier] = { x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: false });
  cv.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) {
        let dx = t.clientX - moveO.x, dy = t.clientY - moveO.y;
        const d = Math.hypot(dx, dy);
        if (d > 44) { dx = dx / d * 44; dy = dy / d * 44; }
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        keys['KeyW'] = dy < -14; keys['KeyS'] = dy > 14;
        keys['KeyA'] = dx < -14; keys['KeyD'] = dx > 14;
        // pushing the stick to its edge sprints, so touch players get the run the
        // keyboard gets from Shift, without another button on screen
        keys['ShiftLeft'] = d > 38;
        if (d > 14) hintUsed();
        // The raw stick, for anything that wants an analog reading rather than a key: the
        // horse's reins use how hard it is pushed and which way it leans.
        window.touchStick = { x: dx, y: dy, d };
      } else if (lookT[t.identifier]) {
        const p = lookT[t.identifier];
        const dx = t.clientX - p.x;
        yaw -= dx * 0.005;
        pitch = clamp(pitch + (t.clientY - p.y) * 0.005, -1.0, 1.15);
        // remember the last movement so a flick can carry on after the finger lifts
        lookVel = dx * 0.005;
        lookT[t.identifier] = { x: t.clientX, y: t.clientY };
        lookX = t.clientX;
      }
    }
  }, { passive: false });
  const endTouch = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) {
        moveId = null;
        window.touchStick = null;
        stick.style.display = 'none';
        for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft']) keys[k] = false;
      }
      if (lookT[t.identifier]) {
        delete lookT[t.identifier];
        lookHeld = false;
      }
    }
  };
  cv.addEventListener('touchend', endTouch);
  cv.addEventListener('touchcancel', endTouch);

  /* Turning is the one thing a thumb cannot do properly: the finger can only travel
     from the right edge to the middle of the screen before it runs out of glass, which
     caps a single swipe at about 115 degrees - not enough to come about. So a finger
     held near either edge keeps turning, and a flick keeps turning for a moment after
     it is lifted. Both are the standard answer on a phone, and without them the camera
     simply stops at an angle the player cannot explain. */
  const EDGE_TURN = 4.2;              // radians per second at the very edge (~240 deg/s)
  let lookVel = 0;                    // last swipe speed, for the flick
  let lookX = 0, lookHeld = false;
  function edgeZone() { return Math.min(110, innerWidth * 0.12); }
  function touchLookInner(dt) {
    // Look for the look finger *first*. The guard has to come after that, or the very
    // first frame of a hold returns early, lookHeld is never set, and the edge turn
    // never starts - which is exactly how this silently did nothing.
    const zone = edgeZone();
    let rate = 0, held = false;
    for (const id in lookT) {
      const t = lookT[id];
      if (!t) continue;
      held = true;
      const x = t.x;
      // squared response: barely there at the inner edge of the zone, a fast spin when the
      // finger is pinned to the glass, so the player can find it without lurching
      if (x > innerWidth - zone) rate = -Math.pow((x - (innerWidth - zone)) / zone, 1.4);
      else if (x < zone) rate = Math.pow((zone - x) / zone, 1.4);
      lookX = x;
      break;
    }
    lookHeld = held;
    if (rate) yaw += rate * EDGE_TURN * dt;
    // the flick: it decays fast, so it is a nudge rather than a spin
    if (!held && Math.abs(lookVel) > 0.0005) {
      yaw -= lookVel * 6 * dt;
      lookVel *= Math.pow(0.02, dt);
      if (Math.abs(lookVel) < 0.001) lookVel = 0;
    }
  }
  // Published on window because this entire layer is scoped by the isTouch block: the
  // frame loop asks for window.touchLook, and a bare declaration in here is invisible.
  window.touchLook = touchLookInner;
  // the camera uses this to know when a thumb is on the glass: an auto-follow must never
  // fight the player for the view
  window.touchLooking = () => lookHeld || Object.keys(lookT).length > 0;

  /* The controls get out of the way when they are not in use. After a couple of seconds
     without a touch the whole layer fades back, and the first touch brings it up again -
     so the screen is the game's unless you are reaching for something. */
  const layer = document.getElementById('touchUI');
  const hint = document.getElementById('touchhint');
  let dimT = null, hintT = null;
  function wakeControls() {
    if (layer) layer.classList.remove('dim');
    clearTimeout(dimT);
    // never dim while a finger is down: mid-drag is exactly when you need to see them
    if (moveId !== null || Object.keys(lookT).length) return;
    dimT = setTimeout(() => { if (layer && moveId === null && !Object.keys(lookT).length) layer.classList.add('dim'); }, 2600);
  }
  window.addEventListener('touchstart', wakeControls, { passive: true });
  window.addEventListener('touchend', wakeControls, { passive: true });

  // Onboarding text earns its space once and then gives it back: the first time the
  // player moves, the hint line starts a timer and fades out.
  function hintUsed() {
    if (!hint || hintT) return;
    hintT = setTimeout(() => hint.classList.add('fade'), 9000);
  }
  // a phone has no number keys, so the weapon switch is a button of its own, in the
  // top left strip where neither thumb lives
  // Backgrounding the app can swallow the touchend, which would leave the stick
  // stuck on screen and its identifier claimed forever. Drop everything instead.
  const releaseAllTouch = () => {
    moveId = null;
    for (const k in lookT) delete lookT[k];
    stick.style.display = 'none';
    for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft']) keys[k] = false;
  };
  addEventListener('blur', releaseAllTouch);
  document.addEventListener('visibilitychange', releaseAllTouch);
  const bindBtn = (id, down, up) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); el.classList.add('pressed'); down(); }, { passive: false });
    const release = e => { e.stopPropagation(); el.classList.remove('pressed'); if (up) up(); };
    el.addEventListener('touchend', release, { passive: false });
    el.addEventListener('touchcancel', release, { passive: false });
  };
  bindBtn('btnFire', () => { fireHold = true; shoot(); }, () => { fireHold = false; });
  const btnAimEl = $('btnAim');
  const setAim = v => { aiming = v; if (btnAimEl) btnAimEl.classList.toggle('active', v); };
  bindBtn('btnAim', () => setAim(!aiming));
  bindBtn('btnReload', () => startReload());
  wakeControls();
  // a phone has no number keys, so the weapon switch is a button of its own, in the
  // top left strip where neither thumb lives
  bindBtn('btnWeapon', () => cycleWeapon(1));
  // without this a phone has no way to pause, and therefore no way to reach the
  // quality, volume and look settings
  bindBtn('btnPause', () => setPaused(true));
  // One contextual button covers both low-frequency actions; the loop decides
  // which is relevant and labels it, this just dispatches.
  bindBtn('btnContext', () => {
    const el = $('btnContext');
    const action = el && el.dataset ? el.dataset.action : '';
    if (action === 'shop') openShop();
    else if (action === 'mount') toggleMount();
    else if (action === 'mission') Missions.interact();
    else if (action === 'bribe') Witnesses.use();
  });
  const btnFs = $('btnFs');
  // WildWestApp is injected by the Android activity before any page script runs
  const inAndroidApp = typeof WildWestApp !== 'undefined';
  // audio needs a gesture; do it once on the first touch wherever it lands
  addEventListener('touchstart', function unlockAudio() { Sound.resume(); }, { once: true, passive: true });
  if (btnFs && !inAndroidApp) {
    btnFs.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); btnFs.classList.add('pressed'); goFs(); }, { passive: false });
    btnFs.addEventListener('touchend', e => { btnFs.classList.remove('pressed'); }, { passive: false });
    btnFs.addEventListener('touchcancel', e => { btnFs.classList.remove('pressed'); }, { passive: false });
    btnFs.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); goFs(); }, { passive: false });
    addEventListener('touchstart', function fsOnce() { goFs(); }, { once: true, passive: true });
    document.addEventListener('fullscreenchange', () => { btnFs.style.display = document.fullscreenElement ? 'none' : 'flex'; });
  } else if (btnFs) {
    // Inside the app the activity is already immersive fullscreen and element
    // fullscreen would need native plumbing, so the button is never usable. It has
    // to be hidden *after* the listeners above would have re-shown it.
    btnFs.style.display = 'none';
  }
}
addEventListener('fullscreenchange', () => {
  const b = document.getElementById('btnFsPc');
  if (b) b.style.display = (document.fullscreenElement || isTouch) ? 'none' : 'flex';
});

