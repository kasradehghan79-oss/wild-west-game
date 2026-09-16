/* ==========================================================================
   The Wild West - js/missions/manager.js
   The mission manager: the registry of definitions, which missions are running,
   the story flags they set, and the handful of surfaces the rest of the game
   asks about them (the HUD tracker, the minimap markers, the interact prompt).
   Provides:  Missions
   Expects:   objectives.js, mission.js, Bus, save-system.js (calls into this)
   ========================================================================== */
"use strict";
const Missions = (() => {
  const defs = new Map();
  const running = [];              // one main mission plus any side missions
  const flags = {};                // story flags, written by mission rewards
  const history = { done: {}, failed: {} };
  let suspended = false;

  function define(def) {
    const d = missionDef(def);
    defs.set(d.id, d);
    return d;
  }
  function defOf(id) { return defs.get(id) || null; }
  function get(id) { return running.find(m => m.id === id) || null; }
  function main() { return running.find(m => m.kind === 'main') || null; }
  function sides() { return running.filter(m => m.kind !== 'main'); }
  function has(id) { return !!get(id); }

  // Is this definition allowed to start right now? `when` reads the flags, the
  // round and the world, so content can be gated on progress without new plumbing.
  function allowed(def) {
    if (running.some(m => m.id === def.id)) return false;
    if (def.when && !def.when({ flags, round: roundNum, wanted, playerDead, missionCount: running.length })) return false;
    return true;
  }

  function start(id, params) {
    const d = defOf(id);
    if (!d) { console.warn('[Missions] no such mission: ' + id); return null; }
    if (d.kind === 'main') {
      // only one main mission at a time: the new one replaces whatever was running
      const old = main();
      if (old) abort(old, 'replaced');
    } else if (running.some(m => m.id === id)) {
      return null;
    }
    const m = createMission(d, params);
    running.push(m);
    m.start();
    return m;
  }
  function startIfAllowed(id, params) {
    const d = defOf(id);
    if (!d || !allowed(d)) return null;
    return start(id, params);
  }

  function abort(mission, reason) {
    const m = typeof mission === 'string' ? get(mission) : mission;
    if (!m) return;
    finish(m, 'aborted', reason);
  }
  function abortAll(reason) {
    running.slice().forEach(m => finish(m, 'aborted', reason));
  }
  function finish(m, how, reason) {
    const i = running.indexOf(m);
    if (i >= 0) running.splice(i, 1);
    m.objectives.forEach(o => o.teardown());
    if (how === 'aborted') {
      m.state = 'aborted';
      m.reason = reason || 'aborted';
      Bus.emit('mission:aborted', { mission: m, reason: m.reason });
    } else if (how === 'done') {
      history.done[m.id] = (history.done[m.id] || 0) + 1;
      Object.assign(flags, m.flags);
    } else if (how === 'failed') {
      history.failed[m.id] = (history.failed[m.id] || 0) + 1;
    }
  }
  // createMission completes and fails itself; this keeps the running list in step
  Bus.on('mission:done', e => finish(e.mission, 'done'));
  Bus.on('mission:failed', e => finish(e.mission, 'failed'));

  function update(dt) {
    // copy: a mission may finish and be removed while we walk the list
    running.slice().forEach(m => m.update(dt));
  }

  // ---------------------------------------------------------------- HUD data
  function hud() {
    const list = [];
    const m = main();
    if (m) list.push(m.hud());
    sides().forEach(s => list.push(s.hud()));
    return list;
  }
  function markers() {
    const out = [];
    running.forEach(m => m.markers().forEach(k => out.push(k)));
    return out;
  }
  function prompt() {
    const m = main();
    if (m) { const p = m.prompts(); if (p) return p; }
    for (const s of sides()) { const p = s.prompts(); if (p) return p; }
    return null;
  }
  function interact() {
    const m = main();
    if (m && m.use()) return true;
    for (const s of sides()) { if (s.use()) return true; }
    return false;
  }
  // the loop hands every mission pickup here; whichever objective wants it takes it
  function onPickup(item) {
    for (const m of running) { if (m.take(item)) return true; }
    return false;
  }

  // ---------------------------------------------------------------- round hook
  // Called by rounds.js at the start of every round: the round's main mission is
  // whatever the catalog says fits this round, and a side job may come with it.
  function beginRound(round) {
    // a load is rebuilding the world and will restore its own missions afterwards;
    // starting the round's fresh ones first would only spawn things to throw away
    if (suspended) return null;
    abortAll('new round');
    const mainDef = api.pickMain ? api.pickMain(round) : null;
    if (mainDef) start(mainDef.id);
    const sideDef = api.pickSide ? api.pickSide(round, flags) : null;
    if (sideDef) start(sideDef.id);
    return mainDef ? mainDef.id : null;
  }

  // ---------------------------------------------------------------- flags / save
  function setFlag(k, v) { flags[k] = v; }
  function getFlag(k) { return flags[k]; }
  function allFlags() { return Object.assign({}, flags); }
  function snapshot() {
    return {
      flags: allFlags(),
      history: { done: Object.assign({}, history.done), failed: Object.assign({}, history.failed) },
      missions: running.map(m => m.snapshot())
    };
  }
  // Rebuild the running missions from a save. Objectives that carried live handles
  // (a picked target, spawned crates) are re-pointed at the reborn world, which is
  // why every objective can restore() rather than just reload its counters.
  function restore(data) {
    if (!data || typeof data !== 'object') return false;
    abortAll('loading');
    Object.keys(flags).forEach(k => delete flags[k]);
    const srcFlags = (data.flags && typeof data.flags === 'object') ? data.flags : {};
    Object.keys(srcFlags).forEach(k => {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
      flags[k] = srcFlags[k];
    });
    history.done = {}; history.failed = {};
    if (data.history && data.history.done) Object.assign(history.done, data.history.done);
    if (data.history && data.history.failed) Object.assign(history.failed, data.history.failed);
    (Array.isArray(data.missions) ? data.missions : []).forEach(ms => {
      const d = defOf(ms && ms.id);
      if (!d || ms.state !== 'active') return;
      const m = createMission(d, {});
      m.seen = (ms.seen && typeof ms.seen === 'object') ? ms.seen : {};
      // the definition is a template; the per run choices (where the crates are)
      // ride on it, so they have to be handed back before the stage is built
      if (d.onRef) d.onRef(m);
      m.loadStage(ms.stage || 0);
      if (Array.isArray(ms.objectives)) {
        m.objectives.forEach((o, i) => { if (ms.objectives[i]) o.restore(ms.objectives[i]); });
      }
      m.time = ms.time || 0;
      running.push(m);
    });
    Bus.emit('mission:restored', { count: running.length });
    return true;
  }

  const api = {
    define, defOf, start, startIfAllowed, abort, abortAll, update, has, allowed,
    hud, markers, prompt, interact, onPickup, beginRound,
    setFlag, getFlag, allFlags, snapshot, restore,
    // held while a save is loading, so the round hook does not fire first
    suspend(v) { suspended = !!v; },
    get running() { return running.slice(); },
    get flags() { return flags; },
    get history() { return { done: Object.assign({}, history.done), failed: Object.assign({}, history.failed) }; },
    // the catalog fills these in so round content stays data
    pickMain: null,
    pickSide: null
  };
  return api;
})();
