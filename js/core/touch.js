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
      } else if (lookT[t.identifier]) {
        const p = lookT[t.identifier];
        yaw -= (t.clientX - p.x) * 0.005;
        pitch = clamp(pitch + (t.clientY - p.y) * 0.005, -1.0, 1.15);
        lookT[t.identifier] = { x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: false });
  const endTouch = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) {
        moveId = null;
        stick.style.display = 'none';
        for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft']) keys[k] = false;
      }
      delete lookT[t.identifier];
    }
  };
  cv.addEventListener('touchend', endTouch);
  cv.addEventListener('touchcancel', endTouch);
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
  bindBtn('btnJump', () => { keys['Space'] = true; setTimeout(() => { keys['Space'] = false; }, 130); });
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

