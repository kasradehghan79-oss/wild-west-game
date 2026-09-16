/* ==========================================================================
   The Wild West - js/core/input.js
   Keyboard, mouse and pointer-lock look, plus the settings panel bindings.
   Provides:  requestLock, setPaused, applyQuality
   Expects:   dom.js, state.js, settings (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- input ----------
// First launch on a phone or tablet: default to the cheap quality tier instead of
// the desktop default, so the first impression is a playable frame rate. Once the
// player changes it in the settings panel, their choice is remembered.
if (isTouch && !settingsWereSaved) { settings.quality = 0; saveSettings(); }
let fireHold = false, lockBroken = false, looking = false, lockTries = 0, lastLockLoss = 0;
const renderer3 = renderer.domElement;
function requestLock() {
  if (isTouch || lockBroken) return;
  try {
    const p = renderer3.requestPointerLock && renderer3.requestPointerLock();
    if (p && p.catch) p.catch(() => { if (++lockTries >= 3) lockBroken = true; });
  } catch (e) { if (++lockTries >= 3) lockBroken = true; }
}
document.addEventListener('pointerlockchange', () => {
  const was = locked;
  locked = !!document.pointerLockElement;
  if (locked) lockTries = 0;
  if (was && !locked && !isTouch && matchState === 'play' && !paused && !shopOpen) {
    // pressing Esc makes the browser drop the lock: treat that as "pause"
    lastLockLoss = performance.now();
    setPaused(true);
  }
});
document.addEventListener('pointerlockerror', () => { if (++lockTries >= 3) lockBroken = true; });
renderer3.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousedown', e => {
  if (isTouch || paused || shopOpen) return;
  if (e.target !== renderer3) return;
  if (e.button === 0) {
    if (!document.pointerLockElement && !lockBroken) requestLock();
    else { shooting = true; shoot(); }
  }
  if (e.button === 2) { aiming = true; looking = true; }
});
addEventListener('mouseup', e => {
  if (e.button === 0) shooting = false;
  if (e.button === 2) { aiming = false; looking = false; }
});
addEventListener('mousemove', e => {
  if (paused || shopOpen || matchState !== 'play') return;
  // Pointer lock keeps the cursor captive and gives us raw deltas. If a browser refuses
  // the lock we still rotate on plain movement, so mouse look never dies.
  if (!locked && !looking && !lockBroken) return;
  const mx = e.movementX || 0, my = e.movementY || 0;
  if (!mx && !my) return;
  yaw -= mx * settings.sens;
  pitch = clamp(pitch + (settings.invertY ? -my : my) * settings.sens, -1.0, 1.15);
});
// never leave a button stuck down after alt-tab / focus loss
addEventListener('blur', () => {
  shooting = false; fireHold = false; looking = false; aiming = false;
  for (const k in keys) keys[k] = false;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && matchState === 'play' && !paused) setPaused(true);
});
addEventListener('keydown', e => {
  if (e.code === 'Escape') {
    if (shopOpen) { closeShop(); return; }
    if (performance.now() - lastLockLoss < 500) return;   // already paused by the lock drop
    setPaused(!paused);
    return;
  }
  if (paused || shopOpen) return;
  keys[e.code] = true;
  // E is the universal "act on what is in front of me": a mission objective here
  // takes priority over mounting, the same way the on screen pill does
  if (e.code === 'KeyE' && !e.repeat) { if (!Witnesses.use() && !Missions.interact()) toggleMount(); }
  if (e.code === 'KeyR' && !e.repeat) startReload();
  if (e.code === 'KeyF' && !e.repeat && nearStore()) openShop();
  if (e.code === 'Digit1') switchWeapon('revolver');
  if (e.code === 'Digit2') switchWeapon('rifle');
  if (e.code === 'Digit3') switchWeapon('knife');
  if (e.code === 'KeyV') cycleWeapon(1);
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });

function setPaused(v) {
  if (v && matchState !== 'play') return;
  Mode.set(v ? MODE.PAUSED : MODE.PLAYING);
  if (v) {
    pauseEl.classList.add('show');
    if (document.pointerLockElement) document.exitPointerLock();
    aiming = false; shooting = false;
  } else {
    pauseEl.classList.remove('show');
    if (!isTouch) requestLock();
  }
}
document.getElementById('resumeBtn').addEventListener('click', e => { e.stopPropagation(); setPaused(false); });
document.getElementById('restartBtn').addEventListener('click', e => {
  e.stopPropagation();
  outlawPts = 0; lawPts = 0; roundNum = 1; kills = 0; headshots = 0; cash = 0;
  upgrades.mag = 0; upgrades.hp = 0; upgrades.reload = 0; upgrades.steady = 0; upgrades.rifle = 0;
  playerWeapons.rifle.owned = false; playerWeapons.rifle.ammo = 0; curWeapon = 'revolver';
  setPaused(false);
  startRound();
  Save.autosave();
});
document.getElementById('shopClose').addEventListener('click', e => { e.stopPropagation(); closeShop(); });
document.getElementById('startBtn').addEventListener('click', e => { e.stopPropagation(); startMatch(); });
document.getElementById('btnHelp').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggleHelp(); });
function toggleHelp() { helpText.style.display = helpText.style.display === 'block' ? 'none' : 'block'; }

const setSens = document.getElementById('setSens'), setVol = document.getElementById('setVol'), setQual = document.getElementById('setQual');
setSens.value = Math.round(settings.sens * 10000);
setVol.value = Math.round(settings.volume * 100);
setQual.value = settings.quality;
setSens.addEventListener('input', () => { settings.sens = +setSens.value / 10000; saveSettings(); });
setVol.addEventListener('input', () => { settings.volume = +setVol.value / 100; Sound.setVolume(settings.volume); saveSettings(); });
setQual.addEventListener('input', () => { settings.quality = +setQual.value; saveSettings(); applyQuality(); });
const setInvert = document.getElementById('setInvert');
function refreshInvert() { setInvert.textContent = settings.invertY ? 'INVERTED' : 'NORMAL'; }
setInvert.addEventListener('click', e => {
  e.stopPropagation();
  settings.invertY = !settings.invertY;
  refreshInvert();
  saveSettings();
});
refreshInvert();
function applyQuality() {
  const q = settings.quality;
  const hi = q > 1, on = q > 0;
  renderer.shadowMap.enabled = on;
  sun.castShadow = on;
  const size = hi ? 2048 : 1024;
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
    // Resolution and effect quality are separate knobs. A phone screen is DPR 3,
    // so drawing at 1x is visibly blocky; touch therefore starts at 1.5x even with
    // the effects off, and the quality slider takes it up to 2x. Desktop keeps its
    // old rule.
    const scale = isTouch
      ? Math.min(devicePixelRatio, 1.5 + 0.25 * settings.quality)
      : Math.min(devicePixelRatio, on ? 2 : 1);
    renderer.setPixelRatio(scale);
  // with the post chain the frame is written in linear light and encoded at the
  // end; without it the renderer has to do that job itself
  Post.setEnabled(on);
  renderer.outputEncoding = on ? THREE.LinearEncoding : THREE.sRGBEncoding;
  renderer.toneMapping = on ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  Post.setSize(innerWidth, innerHeight);
  scene.traverse(o => {
    const list = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of list) m.needsUpdate = true;
  });
}

const btnFsPc = document.getElementById('btnFsPc');
function goFs() {
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}
btnFsPc.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); goFs(); });

