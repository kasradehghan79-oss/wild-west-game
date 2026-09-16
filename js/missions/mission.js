/* ==========================================================================
   The Wild West - js/missions/mission.js
   A mission: metadata, a list of stages (each a set of objectives), the
   conditions that fail it, the reward it pays and what it leaves behind.
   Provides:  createMission, missionDef
   Expects:   objectives.js (makeObjective), Bus, player, npcs, addCash, feed

   A definition looks like this:

     missionDef({
       id: 'round_bounty',
       name: 'The Sheriff',
       brief: 'Find and kill the sheriff before the sand runs out.',
       kind: 'main',                       // main | side | random
       reward: { cash: 60, flags: { sheriffDown: true } },
       stages: [{
         name: 'Hunt him down',
         objectives: [{ type: 'killTargets', n: 1, match: n => n.isSheriff, label: 'Kill the sheriff' }],
         next: () => 0                     // 0 = stop here; or an index to branch to
       }],
       fail: [{ type: 'playerDead' }, { type: 'timeLimit', seconds: 60 }]
     })
   ========================================================================== */
"use strict";
function missionDef(def) {
  if (!def || !def.id) throw new Error('[Missions] a mission definition needs an id');
  def.stages = def.stages || [{ objectives: [] }];
  def.stages.forEach((s, i) => { s.name = s.name || ('Stage ' + (i + 1)); s.objectives = s.objectives || []; });
  def.kind = def.kind || 'side';
  def.reward = def.reward || {};
  def.fail = def.fail || [];
  return def;
}

function createMission(def, params) {
  const m = {
    id: def.id,
    def,
    name: def.name || def.id,
    brief: def.brief || '',
    kind: def.kind,
    params: params || {},
    state: 'active',                 // active | done | failed
    stage: 0,
    time: 0,
    reason: '',
    objectives: [],
    // story flags this mission raised, and per-mission scratch space for its defs
    flags: {},
    seen: {}
  };

  m.loadStage = function (index) {
    m.objectives.forEach(o => o.teardown());
    const st = m.def.stages[index];
    if (!st) return false;
    m.stage = index;
    m.stageName = st.name;
    m.objectives = st.objectives.map(d => makeObjective(d, m)).filter(Boolean);
    m.objectives.forEach(o => {
      o.setup();
      // anything the definition wants to show immediately (a marker, a line in the
      // feed) can react to this
      Bus.emit('mission:objective', { objective: o, mission: m, state: 'started' });
    });
    Bus.emit('mission:stage', { mission: m, stage: index, name: st.name });
    return true;
  };

  m.start = function () {
    Bus.emit('mission:start', m);
    // onStart makes the per run choices (where the crates are, which ridge to scout),
    // and onRef copies them onto the definition template so the objectives built next
    // read them. Getting this order wrong spawns crates nowhere near the markers.
    if (m.def.onStart) m.def.onStart(m);
    if (m.def.onRef) m.def.onRef(m);
    m.loadStage(0);
    return m;
  };

  m.checkFail = function () {
    for (const f of m.def.fail) {
      if (f.type === 'playerDead' && playerDead) return 'killed';
      if (f.type === 'timeLimit' && m.time > Difficulty.objectiveTime(f.seconds)) return 'out of time';
      if (f.type === 'npcDead') {
        const npc = typeof f.npc === 'function' ? f.npc(m) : f.npc;
        if (!npc || npc.dead) return 'the target died';
      }
      if (f.type === 'leftArea') {
        const d = Math.hypot(player.g.position.x - f.x, player.g.position.z - f.z);
        if (d > f.r) return 'left the area';
      }
      if (f.type === 'wanted') {
        if (wanted < f.level) return 'the heat died down';
      }
      if (f.type === 'custom' && f.test(m)) return f.reason || 'failed';
    }
    return null;
  };

  m.complete = function () {
    if (m.state !== 'active') return;
    m.state = 'done';
    m.objectives.forEach(o => o.teardown());
    const r = m.def.reward || {};
    const paid = Difficulty.reward(r.cash || 0);
    if (paid) cash += paid;
    if (r.flags) Object.assign(m.flags, r.flags);
    if (m.def.onDone) m.def.onDone(m);
    Bus.emit('mission:done', { mission: m, cash: paid, flags: m.flags });
    if (paid) feed(m.name + '  +$' + paid, 'good');
    else feed(m.name + '  complete', 'good');
  };

  m.fail = function (reason) {
    if (m.state !== 'active') return;
    m.state = 'failed';
    m.reason = reason || 'failed';
    m.objectives.forEach(o => o.teardown());
    if (m.def.onFail) m.def.onFail(m, m.reason);
    Bus.emit('mission:failed', { mission: m, reason: m.reason });
    feed(m.name + ' failed \u2014 ' + m.reason, 'bad');
  };

  m.update = function (dt) {
    if (m.state !== 'active') return;
    m.time += dt;
    m.objectives.forEach(o => o.update(dt));
    if (m.state !== 'active') return;         // an objective may have failed it
    const reason = m.checkFail();
    if (reason) { m.fail(reason); return; }
    const required = m.objectives.filter(o => !o.optional);
    // An optional objective is allowed to fail the whole mission - that is how an
    // escort says "the witness died" without a separate failure condition.
    const broken = required.find(o => o.state === 'failed');
    if (broken) { m.fail(broken.detail || 'an objective failed'); return; }
    if (required.length && required.every(o => o.state === 'done')) {
      const st = m.def.stages[m.stage];
      const next = st && st.next ? st.next(m) : null;
      if (next !== null && next !== undefined && m.def.stages[next]) {
        m.loadStage(next);
      } else {
        m.complete();
      }
    }
  };

  m.markers = function () {
    return m.objectives.map(o => o.marker()).filter(Boolean).map(o => Object.assign({ mission: m.name }, o));
  };
  // Group objectives hide their children, so anything looking for a prompt, an
  // interaction or a pickup has to walk down into them.
  function eachLeaf(list, fn) {
    for (const o of list) {
      if (fn(o)) return true;
      if (o.children && eachLeaf(o.children, fn)) return true;
    }
    return false;
  }
  m.prompts = function () {
    let found = null;
    eachLeaf(m.objectives, o => {
      if (o.state !== 'active') return false;
      const p = o.prompt();
      if (p) { found = Object.assign({ objective: o }, p); return true; }
      return false;
    });
    return found;
  };
  m.use = function () {
    return eachLeaf(m.objectives, o => (o.state === 'active' && o.prompt()) ? (o.use(), true) : false);
  };
  m.take = function (item) {
    return eachLeaf(m.objectives, o => (o.state === 'active' && o.take) ? !!o.take(item) : false);
  };
  // the tracker shows the first few live objectives
  // the tracker shows the live objectives, and a branching objective has to bring its
  // children with it or the UI can only say "pick one"
  function hudObjective(o) {
    return {
      id: o.id, label: o.label, detail: o.detail, progress: o.progress,
      state: o.state, optional: o.optional,
      children: o.children ? o.children.map(hudObjective) : null
    };
  }
  m.hud = function () {
    return {
      name: m.name,
      kind: m.kind,
      stage: m.stageName,
      state: m.state,
      time: m.time,
      limited: (m.def.fail.find(f => f.type === 'timeLimit') || {}).seconds || 0,
      objectives: m.objectives.filter(o => !o.hidden && o.state !== 'skipped').map(hudObjective)
    };
  };
  m.snapshot = function () {
    return {
      id: m.id, stage: m.stage, state: m.state, time: m.time, reason: m.reason,
      flags: m.flags, seen: m.seen,
      objectives: m.objectives.map(o => o.snapshot())
    };
  };
  return m;
}
