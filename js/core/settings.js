/* ==========================================================================
   The Wild West - js/core/settings.js
   Player settings (persisted to localStorage) and the sRGB colour helper.
   Provides:  settings, loadSettings, saveSettings, srgb, C_SKYB
   Expects:   - (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- settings ----------
const settings = { sens: 0.0022, volume: 0.7, quality: 2, invertY: false };
// did this device already have saved settings? a first launch on a phone should
// not inherit the desktop quality default
let settingsWereSaved = false;
try {
  const s = JSON.parse(localStorage.getItem('wildwest.settings') || 'null');
  if (s) { Object.assign(settings, s); settingsWereSaved = true; }
} catch (e) {}
function saveSettings() { try { localStorage.setItem('wildwest.settings', JSON.stringify(settings)); } catch (e) {} }

// ---------- colour space ----------
// Colours are authored the way they look in an image editor (sRGB). three treats
// material colours as linear, so they get converted on the way in and the whole
// frame is encoded back to sRGB at the end of the pipeline. That round trip is
// what buys soft shadow detail and filmic highlights instead of the flat
// "everything is mid grey" look.
function srgb(c) { return new THREE.Color(c).convertSRGBToLinear(); }
const tmpCol = new THREE.Color();
const C_SKYB = new THREE.Color();

