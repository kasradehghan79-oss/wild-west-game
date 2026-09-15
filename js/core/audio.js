/* ==========================================================================
   The Wild West - js/core/audio.js
   WebAudio synth: shots, steps, impacts, splashes and stingers. No asset files.
   Provides:  Sound
   Expects:   settings (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// =====================================================================
//  PROCEDURAL AUDIO
// =====================================================================
const Sound = (() => {
  let ctx = null, master = null, sfxBus = null, musBus = null, noiseBuf = null;
  let droneGain = null, beatT = 0, beat = 0, ambOn = false, crickT = 0, wolfT = 20;
  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = settings.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 8;
    comp.attack.value = 0.004; comp.release.value = 0.24;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    musBus = ctx.createGain(); musBus.gain.value = 0.4; musBus.connect(master);
    const len = Math.floor(ctx.sampleRate * 1.6);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  function resume() { if (!init()) return; if (ctx.state === 'suspended') ctx.resume(); }
  const now = () => (ctx ? ctx.currentTime : 0);
  function noise(dur, o) {
    if (!ctx) return;
    o = o || {};
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    src.playbackRate.value = o.rate || 1;
    const f = ctx.createBiquadFilter(); f.type = o.filter || 'lowpass';
    f.frequency.value = o.freq || 1200; f.Q.value = o.q || 1;
    const g = ctx.createGain();
    const t = now() + (o.delay || 0);
    const atk = o.attack === undefined ? 0.003 : o.attack;
    const gain = o.gain === undefined ? 0.4 : o.gain;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(50, o.sweep), t + dur);
    src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
    src.start(t); src.stop(t + dur + 0.06);
  }
  function tone(freq, dur, o) {
    if (!ctx) return;
    o = o || {};
    const osc = ctx.createOscillator(); osc.type = o.type || 'sine'; osc.frequency.value = freq;
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const t = now() + (o.delay || 0);
    const atk = o.attack === undefined ? 0.004 : o.attack;
    const gain = o.gain === undefined ? 0.18 : o.gain;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    osc.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t); osc.stop(t + dur + 0.06);
  }
  function shoot(kind) {
    if (!ctx) return;
    const cfg = kind === 'rifle' ? { g: 0.34, f: 1500, tg: 0.15, tail: 0.42 }
      : kind === 'shotgun' ? { g: 0.46, f: 820, tg: 0.2, tail: 0.55 }
      : kind === 'enemy' ? { g: 0.15, f: 1150, tg: 0.07, tail: 0.16 }
      : { g: 0.32, f: 1320, tg: 0.14, tail: 0.34 };
    noise(0.1, { gain: cfg.g, filter: 'lowpass', freq: cfg.f * 2.2, sweep: cfg.f * 0.32, q: 0.8 });
    noise(cfg.tail, { gain: cfg.g * 0.3, filter: 'lowpass', freq: 640, attack: 0.02 });
    tone(118, 0.14, { type: 'sine', gain: cfg.tg, slide: 38, attack: 0.001 });
    tone(cfg.f * 2.5, 0.05, { type: 'square', gain: cfg.g * 0.14, slide: cfg.f, attack: 0.001 });
  }
  function dry() { noise(0.04, { gain: 0.16, filter: 'bandpass', freq: 2400, q: 6 }); tone(880, 0.03, { type: 'square', gain: 0.05 }); }
  function reload(sec) {
    if (!ctx) return;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const st = 0.05 + (i / n) * (sec - 0.22);
      tone(rnd(680, 1150), 0.035, { type: 'square', gain: 0.05, delay: st, slide: 420 });
      noise(0.03, { gain: 0.07, filter: 'bandpass', freq: 2400, q: 5, delay: st });
    }
    tone(200, 0.1, { type: 'square', gain: 0.09, delay: sec - 0.14, slide: 110 });
    noise(0.06, { gain: 0.12, filter: 'lowpass', freq: 900, delay: sec - 0.1 });
  }
  function hit(kind) {
    if (kind === 'flesh') { noise(0.14, { gain: 0.3, filter: 'lowpass', freq: 520, sweep: 190 }); tone(92, 0.13, { type: 'sine', gain: 0.11, slide: 42 }); }
    else if (kind === 'head') { noise(0.18, { gain: 0.34, filter: 'lowpass', freq: 700, sweep: 180 }); tone(1400, 0.07, { type: 'square', gain: 0.07, slide: 500 }); }
    else if (kind === 'wood') noise(0.1, { gain: 0.2, filter: 'bandpass', freq: 900, q: 2.4 });
    else if (kind === 'metal') { tone(rnd(1700, 2600), 0.18, { type: 'sawtooth', gain: 0.08, slide: 620 }); noise(0.1, { gain: 0.12, filter: 'highpass', freq: 1900 }); }
    else noise(0.12, { gain: 0.17, filter: 'lowpass', freq: 700, attack: 0.006 });
  }
  function pickup() { tone(660, 0.09, { type: 'triangle', gain: 0.13 }); tone(990, 0.12, { type: 'triangle', gain: 0.11, delay: 0.08 }); }
  function coin() { tone(1240, 0.07, { type: 'square', gain: 0.09 }); tone(1760, 0.1, { type: 'square', gain: 0.07, delay: 0.06 }); }
  function hurt() { tone(210, 0.18, { type: 'square', gain: 0.13, slide: 120 }); noise(0.12, { gain: 0.15, filter: 'lowpass', freq: 620 }); }
  function die() { [300, 240, 190, 140].forEach((f, i) => tone(f, 0.4, { type: 'triangle', gain: 0.14, delay: i * 0.16, slide: f * 0.6 })); }
  function step(surface, vol) {
    const g = vol === undefined ? 1 : clamp(vol, 0, 1);
    if (g <= 0.01) return;
    if (surface === 'wood') noise(0.06, { gain: 0.08 * g, filter: 'lowpass', freq: 1800 });
    else if (surface === 'water') {
      // wet splash: a bright band of noise with a short low thump under it
      noise(0.14, { gain: 0.11 * g, filter: 'bandpass', freq: rnd(1400, 2600), q: 0.7, attack: 0.003 });
      noise(0.1, { gain: 0.06 * g, filter: 'lowpass', freq: 420, attack: 0.004 });
    }
    else noise(0.07, { gain: rnd(0.05, 0.1) * g, filter: 'lowpass', freq: rnd(1500, 2800), attack: 0.005 });
  }
  function gallop(spd) { noise(0.09, { gain: 0.05 + spd * 0.012, filter: 'lowpass', freq: 260, attack: 0.006 }); }
  function click() { tone(1500, 0.02, { type: 'square', gain: 0.045 }); }
  function heart() {
    tone(58, 0.16, { type: 'sine', gain: 0.22, slide: 34, attack: 0.006 });
    tone(48, 0.2, { type: 'sine', gain: 0.16, slide: 28, delay: 0.16, attack: 0.006 });
  }
  function whistle() {
    if (!ctx) return;
    const t = now();
    const osc = ctx.createOscillator(); osc.type = 'sine';
    const lfo = ctx.createOscillator(); lfo.frequency.value = 7;
    const lg = ctx.createGain(); lg.gain.value = 70;
    lfo.connect(lg); lg.connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.06);
    g.gain.setValueAtTime(0.09, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    osc.frequency.setValueAtTime(1500, t);
    osc.frequency.linearRampToValueAtTime(1050, t + 0.9);
    osc.connect(g); g.connect(sfxBus);
    osc.start(t); osc.stop(t + 1); lfo.start(t); lfo.stop(t + 1);
  }
  function wolf() {
    if (!ctx) return;
    const t = now();
    const osc = ctx.createOscillator(); osc.type = 'sine';
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5;
    const lg = ctx.createGain(); lg.gain.value = 40;
    lfo.connect(lg); lg.connect(osc.frequency);
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.linearRampToValueAtTime(620, t + 0.4);
    osc.frequency.linearRampToValueAtTime(380, t + 1.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
    osc.connect(g); g.connect(sfxBus);
    osc.start(t); osc.stop(t + 1.8); lfo.start(t); lfo.stop(t + 1.8);
  }
  function stinger(win) {
    if (!ctx) return;
    const notes = win ? [261.6, 329.6, 392, 523.3] : [261.6, 233.1, 196, 155.6];
    notes.forEach((f, i) => {
      tone(f, 0.7, { type: 'triangle', gain: 0.12, delay: i * 0.11, bus: musBus });
      tone(f * 2, 0.5, { type: 'sine', gain: 0.05, delay: i * 0.11, bus: musBus });
    });
  }
  function ambientStart() {
    if (!ctx || ambOn) return;
    ambOn = true;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 360; f.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.055;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
    const lg = ctx.createGain(); lg.gain.value = 0.035;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(); lfo.start();
  }
  function ambientUpdate(night, dt) {
    if (!ctx) return;
    crickT -= dt;
    if (night > 0.45 && crickT <= 0) {
      crickT = rnd(0.3, 1.5);
      const f = rnd(3600, 5200);
      for (let i = 0; i < 3; i++) tone(f, 0.028, { type: 'square', gain: 0.012 * night, delay: i * 0.055 });
    }
    wolfT -= dt * (night > 0.5 ? 1 : 0.2);
    if (night > 0.5 && wolfT <= 0) { wolfT = rnd(35, 80); wolf(); }
  }
  function musicStart() {
    if (!ctx || droneGain) return;
    droneGain = ctx.createGain(); droneGain.gain.value = 0.0001; droneGain.connect(musBus);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.7;
    f.connect(droneGain);
    [55, 82.41].forEach(fr => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr;
      const og = ctx.createGain(); og.gain.value = 0.16;
      o.connect(og); og.connect(f); o.start();
    });
  }
  function musicUpdate(intensity) {
    if (!ctx || !droneGain) return;
    droneGain.gain.setTargetAtTime(0.02 + 0.09 * intensity, now(), 0.6);
    const bpm = 58 + intensity * 40;
    if (now() >= beatT) {
      beatT = Math.max(now(), beatT) + 60 / bpm;
      const scale = [0, 3, 5, 7, 10, 12, 15, 17];
      const root = 146.83;
      if (Math.random() < 0.5 + intensity * 0.35) {
        const freq = root * Math.pow(2, pick(scale) / 12);
        tone(freq, 0.55, { type: 'triangle', gain: 0.04 + 0.05 * intensity, attack: 0.006, bus: musBus });
      }
      if (beat % 4 === 0) tone(root / 2, 1.0, { type: 'sine', gain: 0.08 + 0.06 * intensity, attack: 0.02, bus: musBus });
      beat++;
    }
  }
  function setVolume(v) { if (master) master.gain.setTargetAtTime(v, now(), 0.05); }
  return { init, resume, shoot, dry, reload, hit, pickup, coin, hurt, die, step, gallop, click, heart, whistle, wolf, stinger, ambientStart, ambientUpdate, musicStart, musicUpdate, setVolume };
})();

