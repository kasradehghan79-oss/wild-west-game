/* ==========================================================================
   The Wild West - js/game/splash.js
   The opening screen: a day passing over the desert, told with the game's own
   six-shooter. A revolver cylinder stands where the sun would be - six
   chambers, each holding a sunset - and it indexes one chamber at a time,
   sixty degrees a round, while the sky behind it walks through the same
   palette the world itself uses (night, first light, dawn, morning, noon,
   golden hour, dusk). Six rounds, six steps of daylight, and the last one
   leaves the cylinder standing on the horizon exactly as the icon draws it.

   It is a 2D canvas on purpose: the WebGL renderer is already building the
   town behind this screen, and the opening must not compete with it. Nothing
   here touches three.js or the world.

   Provides:  Splash  ({ stop, running, state })
   Expects:   settings (quality), the #splash canvas and #start overlay in
              index.html, and the mode:change event the game already emits
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
const Splash = (() => {
  const cv = document.getElementById('splash');
  const startEl = document.getElementById('start');
  const ctx = cv && cv.getContext('2d');
  const state = { step: 0, steps: 6, progress: 0, frame: 0, running: false, reduced: false };
  // An opening with no canvas, or a browser that has asked for no motion, has
  // nothing to animate: everything below is happy to be a no-op.
  if (!cv || !ctx || !startEl) return { stop() {}, running: false, state };

  const STEP_MS = 900, STEPS = 6, TOTAL = STEP_MS * STEPS;
  const prefersStill = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  state.reduced = prefersStill;

  // The sky, key by key, in the game's own colours: day gradient top, middle,
  // and the warm band that sits on the horizon.
  const SKY = [
    ['#0b1226', '#121d42', '#241c12'], // night
    ['#14204a', '#3a3452', '#6a3a34'], // first light
    ['#2a3a6a', '#8a5a6a', '#ff9a4a'], // dawn
    ['#3a72b8', '#8fc4e8', '#ffe9c4'], // morning
    ['#3d7cc4', '#9ed2ee', '#ffe0a0'], // noon
    ['#3a5590', '#c9805a', '#ff9a4a'], // golden hour
    ['#241c4a', '#7a3a52', '#ff7a3a']  // dusk
  ];
  const STARS_AT = [1, 0.8, 0.3, 0, 0, 0, 0.18];

  const rgb = hex => [
    parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)
  ];
  const SKY_RGB = SKY.map(k => k.map(rgb));
  const mix = (a, b, t) => `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},`
    + `${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;

  // a fixed starfield: generated once so it does not crawl between frames
  const stars = Array.from({ length: 46 }, () => ({
    x: Math.random(), y: Math.random() * 0.82, r: 0.4 + Math.random() * 1.5,
    phase: Math.random() * Math.PI * 2
  }));
  const quality = (typeof settings === 'object' && settings && typeof settings.quality === 'number')
    ? settings.quality : 1;

  let w = 0, h = 0, dpr = 1, horizon = 0, raf = 0, elapsed = 0, last = 0;
  const ease = t => 1 - Math.pow(1 - t, 3);
  // One radius for the whole file, so the resting pose and the animation can
  // never disagree about where the sun is.
  const radius = () => Math.max(30, Math.min(h * (h < 560 ? 0.11 : 0.15), w * 0.075));
  // Below 780px tall the menu owns the screen, so the sun never climbs into it:
  // it stays mostly behind the horizon and the light on the ground is the show.
  const shortScreen = () => h < 780;

  function fit() {
    dpr = Math.min(window.devicePixelRatio || 1, quality > 0 ? 2 : 1);
    // the element is sized by CSS (100% of the viewport); the backing store is
    // that size times the pixel ratio, and the context is scaled to match, so
    // every coordinate below is a plain CSS pixel
    w = window.innerWidth;
    h = window.innerHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The horizon is set by how much room the menu needs, not by a taste in
    // composition: the sky keeps about half the screen where there is space,
    // but always leaves the title, its buttons and the difficulty row a place
    // to stand. Below 620px tall - a landscape phone - there is no room at all
    // and the menu keeps its own layout, with the sun passing behind it.
    // A landscape phone is all width and no height, so the sky takes a band at
    // the top and the menu gets the rest: the sun stays in view, standing on the
    // horizon, instead of being driven out of sight behind the panel.
    horizon = shortScreen()
      ? Math.round(h * 0.34)
      : Math.round(Math.min(h * 0.52, Math.max(h * 0.32, h - 540)));
    // css/menus.css reads this back, so #start and the canvas can never
    // disagree about where the ground starts
    document.documentElement.style.setProperty('--horizon', horizon + 'px');
  }

  /** The cylinder. rot is radians; chambers index through it, the live one waits at the top. */
  function cylinder(cx, cy, r, rot, live) {
    const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2.1);
    glow.addColorStop(0, 'rgba(255,221,85,.34)');
    glow.addColorStop(0.5, 'rgba(255,154,74,.12)');
    glow.addColorStop(1, 'rgba(255,154,74,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    // steel face
    const steel = ctx.createLinearGradient(-r * 0.7, -r, r * 0.7, r);
    steel.addColorStop(0, '#475372');
    steel.addColorStop(0.55, '#2b2b33');
    steel.addColorStop(1, '#241c12');
    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    // brass rim
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.beginPath();
    ctx.arc(0, 0, r - ctx.lineWidth * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    // flutes, and the six sunsets in their chambers
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const fa = a + Math.PI / 6;
      ctx.strokeStyle = '#241c12';
      ctx.lineWidth = r * 0.13;
      ctx.beginPath();
      ctx.moveTo(Math.cos(fa) * r * 0.77, Math.sin(fa) * r * 0.77);
      ctx.lineTo(Math.cos(fa) * r * 1.03, Math.sin(fa) * r * 1.03);
      ctx.stroke();

      const cxx = Math.cos(a) * r * 0.57, cyy = Math.sin(a) * r * 0.57;
      ctx.fillStyle = '#241c12';
      ctx.beginPath();
      ctx.arc(cxx, cyy, r * 0.145, 0, Math.PI * 2);
      ctx.fill();
      const warm = ctx.createLinearGradient(0, cyy + r * 0.1, 0, cyy - r * 0.1);
      warm.addColorStop(0, '#ff9a4a');
      warm.addColorStop(1, '#ffdd55');
      ctx.fillStyle = warm;
      ctx.beginPath();
      ctx.arc(cxx, cyy, r * 0.095, 0, Math.PI * 2);
      ctx.fill();
    }
    // hub
    ctx.fillStyle = '#241c12';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = Math.max(1.5, r * 0.04);
    ctx.stroke();
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // The chamber in battery: a steady warm light at the top, so the eye reads
    // the index as rounds coming up rather than the whole wheel turning.
    const px = cx, py = cy - r * 0.57;
    const live_ = ctx.createRadialGradient(px, py, 0, px, py, r * 0.42);
    live_.addColorStop(0, `rgba(255,231,150,${0.75 * live})`);
    live_.addColorStop(0.4, `rgba(255,209,102,${0.35 * live})`);
    live_.addColorStop(1, 'rgba(255,209,102,0)');
    ctx.fillStyle = live_;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }

  function ground() {
    const g = ctx.createLinearGradient(0, horizon, 0, h);
    // fully opaque: below the horizon nothing of the sun is meant to show, and a
    // translucent ground let the wheel glow through the menu on a phone
    g.addColorStop(0, '#2a2014');
    g.addColorStop(1, '#0d0906');
    ctx.fillStyle = g;
    ctx.fillRect(0, horizon, w, h - horizon);
    // the desert, in shapes too dark to compete with the menu text: they are
    // place, not subject
    ctx.fillStyle = 'rgba(22,13,7,.55)';
    const s = Math.max(70, h * 0.12);
    // a mesa on the left: flat top, sloped sides
    ctx.beginPath();
    ctx.moveTo(w * 0.05, horizon);
    ctx.lineTo(w * 0.05 + s * 0.34, horizon - s * 0.5);
    ctx.lineTo(w * 0.05 + s * 0.92, horizon - s * 0.5);
    ctx.lineTo(w * 0.05 + s * 1.26, horizon);
    ctx.closePath();
    ctx.fill();
    // a saguaro on the right: a trunk and two arms
    const cx0 = w * 0.93, top = horizon - s * 0.78;
    const arm = (y, dir) => {
      ctx.beginPath();
      ctx.moveTo(cx0, y);
      ctx.lineTo(cx0 + dir * s * 0.26, y);
      ctx.lineTo(cx0 + dir * s * 0.26, y - s * 0.26);
      ctx.lineTo(cx0 + dir * s * 0.12, y - s * 0.26);
      ctx.lineTo(cx0 + dir * s * 0.12, y - s * 0.06);
      ctx.lineTo(cx0, y - s * 0.06);
      ctx.closePath();
      ctx.fill();
    };
    ctx.fillRect(cx0 - s * 0.07, top, s * 0.14, horizon - top);
    arm(horizon - s * 0.46, -1);
    arm(horizon - s * 0.62, 1);
    ctx.strokeStyle = 'rgba(240,216,168,.75)';
    ctx.lineWidth = Math.max(1, h * 0.002);
    ctx.beginPath();
    ctx.moveTo(0, horizon + 0.5);
    ctx.lineTo(w, horizon + 0.5);
    ctx.stroke();
  }

  function draw(progress) {
    const k = progress * STEPS;
    const i = Math.min(STEPS - 1, Math.floor(k));
    const f = Math.min(1, Math.max(0, k - i));
    const a = SKY_RGB[i], b = SKY_RGB[i + 1] || SKY_RGB[i];
    const sky = ctx.createLinearGradient(0, 0, 0, horizon * 1.06);
    sky.addColorStop(0, mix(a[0], b[0], f));
    sky.addColorStop(0.55, mix(a[1], b[1], f));
    sky.addColorStop(1, mix(a[2], b[2], f));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon + 1);

    const starA = STARS_AT[i] + (STARS_AT[i + 1] - STARS_AT[i]) * f;
    if (starA > 0.02 && quality > 0) {
      const tw = performance.now() / 900;
      ctx.fillStyle = '#fff';
      for (const s of stars) {
        ctx.globalAlpha = starA * (0.5 + 0.5 * Math.sin(tw + s.phase)) * 0.85;
        ctx.fillRect(s.x * w, s.y * horizon, s.r, s.r);
      }
      ctx.globalAlpha = 1;
    }

    const r = radius();
    // half-set to standing: the last frame is the icon's own pose
    const cy = horizon - r * (0.28 + 0.72 * ease(progress));
    // 60 degrees of index per round, settling rather than snapping
    const step = Math.min(STEPS, Math.floor(progress * STEPS + 1e-6));
    const inner = Math.min(1, progress * STEPS - step);
    const rot = -(step + (step < STEPS ? ease(inner) : 0)) * Math.PI / 3;

    // The sun goes down first and the ground is laid over it: that is what makes
    // the horizon a horizon. It also means a phone, where the sun never rises
    // above the line, shows only its light on the sky and none of the wheel.
    cylinder(w * 0.5, cy, r, rot, 0.35 + 0.65 * Math.min(1, progress * 2));
    ground();
    // The menu has to stay readable over a midday sky as well as a night one:
    // one vignette does that better than darkening six palettes by hand.
    const vig = ctx.createRadialGradient(w * 0.5, h * 0.42, Math.min(w, h) * 0.2,
      w * 0.5, h * 0.42, Math.max(w, h) * 0.78);
    vig.addColorStop(0, 'rgba(6,4,2,0)');
    vig.addColorStop(0.62, 'rgba(6,4,2,.30)');
    vig.addColorStop(1, 'rgba(6,4,2,.72)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, horizon + 1);
    state.step = Math.min(STEPS, Math.round(progress * STEPS));
    state.progress = progress;
    state.frame++;
  }

  function loop(now) {
    if (!state.running) return;
    // The clock counts painted frames, not wall time. The world is still being
    // built behind this screen, so the first frame can arrive seconds late and
    // a slow device may only manage a few frames a second: capping what any one
    // frame can be worth means the opening always plays right through instead
    // of starting a third of the way in.
    const raw = last ? now - last : 16;
    last = now;
    elapsed += Math.min(250, Math.max(0, raw));
    const progress = Math.min(1, elapsed / TOTAL);
    draw(progress);
    if (progress >= 1) {
      // the composition is finished; the stars keep breathing, nothing else moves
      state.running = false;
      raf = requestAnimationFrame(breathe);
      return;
    }
    raf = requestAnimationFrame(loop);
  }

  // After the six rounds the scene is done. A slow breath on the chamber light
  // is the whole of the "it is still alive" budget on the title screen.
  let bT0 = 0;
  function breathe(now) {
    if (!state.running) return;
    if (!bT0) bT0 = now;
    const p = 1 + 0.06 * Math.sin((now - bT0) / 1400);
    draw(1);
    const r = radius();
    const cy = horizon - r;
    const pulse = ctx.createRadialGradient(w * 0.5, cy - r * 0.57, 0, w * 0.5, cy - r * 0.57, r * 0.5);
    pulse.addColorStop(0, `rgba(255,231,150,${0.2 * p})`);
    pulse.addColorStop(1, 'rgba(255,209,102,0)');
    ctx.fillStyle = pulse;
    ctx.beginPath();
    ctx.arc(w * 0.5, cy - r * 0.57, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    raf = requestAnimationFrame(breathe);
  }

  function start() {
    fit();
    if (prefersStill) {
      // one honest frame of the finished day, then leave the machine alone
      draw(1);
      return;
    }
    state.running = true;
    elapsed = 0;
    last = 0;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    if (!state.running && !raf) return;
    state.running = false;
    cancelAnimationFrame(raf);
    raf = 0;
    // the game is behind this now: hand the title screen its own background
    // back, then get the canvas out of the compositor
    startEl.classList.add('solid');
    cv.classList.add('gone');
    setTimeout(() => { cv.style.display = 'none'; }, 520);
  }

  window.addEventListener('resize', () => {
    fit();
    if (!state.running) draw(Math.max(state.progress, prefersStill ? 1 : 0));
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.running) { state.running = false; cancelAnimationFrame(raf); raf = 0; }
    } else if (!cv.classList.contains('gone') && !prefersStill && !state.running
      && raf === 0 && state.progress < 1) {
      state.running = true;
      elapsed = state.progress * TOTAL;
      last = 0;
      raf = requestAnimationFrame(loop);
    }
  });
  // The game already announces this whenever the title screen goes away, from
  // PLAY or from loading a save, so the opening needs no hook in either place.
  if (typeof Bus === 'object' && Bus && Bus.on) {
    Bus.on('mode:change', d => { if (d && d.to && d.to !== MODE.BOOT && d.to !== MODE.MENU) stop(); });
  }

  start();
  return { stop, get running() { return state.running; }, state };
})();
