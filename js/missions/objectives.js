/* ==========================================================================
   The Wild West - js/missions/objectives.js
   The reusable objective components a mission is built from. Each one is a small
   state machine with the same surface, so a mission can mix them freely:

     label      what the HUD shows
     detail     '2/3', '18m', '12s' - whatever fits that objective
     progress   0..1 for the tracker bar
     state      'active' | 'done' | 'failed'
     setup()    subscribe, spawn, snapshot targets (called once)
     update(dt) polling objectives: timers, distances, dwell counters
     marker()   { x, z, label } for the minimap, or null
     prompt()   { label } when the player is standing somewhere they can act
     use()      the player pressed the interact key / tapped the pill
     snapshot()/restore()  everything needed to survive a save and load

   Provides:  OBJ_TYPES, objectiveType, makeObjective, finishObjective,
              failObjective, spawnMissionItem, spawnMissionCrate, clearMissionProps
   Expects:   Bus, player, npcs, pickups, scene, THREE, linMat/srgb, clamp
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
const OBJ_TYPES = new Map();
function objectiveType(name, factory) { OBJ_TYPES.set(name, factory); }
function finishObjective(o, note) {
  if (o.state !== 'active') return;
  o.state = 'done';
  o.progress = 1;
  if (note) o.detail = note;
  Bus.emit('mission:objective', { objective: o, mission: o.mission, state: 'done' });
}
function failObjective(o, reason) {
  if (o.state !== 'active') return;
  o.state = 'failed';
  o.detail = reason || 'failed';
  Bus.emit('mission:objective', { objective: o, mission: o.mission, state: 'failed', reason });
}

// Worlds items a mission can ask for: a small glowing crate the player walks over.
// They go into the same `pickups` list the loop already animates and tests against,
// flagged `mission` so the loop hands them to Missions instead of paying cash.
const missionProps = [];
function spawnMissionItem(x, z, label) {
  const y = heightAt(x, z);
  const g = new THREE.Group();
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.34, 0.34),
    linMat({ color: srgb(0xc9a227), roughness: 0.55, metalness: 0.25, emissive: srgb(0x3a2a06) })
  );
  crate.castShadow = true;
  crate.receiveShadow = true;
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.47, 0.07, 0.37),
    linMat({ color: srgb(0x5a3a18), roughness: 0.8 })
  );
  g.add(crate); g.add(band);
  g.position.set(x, y + 0.6, z);
  scene.add(g);
  const p = {
    type: 'mission', mission: true, label: label || 'cache',
    g, base: y + 0.6, phase: rnd(0, 6), taken: false
  };
  pickups.push(p);
  missionProps.push(p);
  return p;
}
function spawnMissionCrate(x, z, label) { return spawnMissionItem(x, z, label); }
function clearMissionProps() {
  for (const p of missionProps) {
    if (p.g && p.g.parent) p.g.parent.remove(p.g);
    const i = pickups.indexOf(p);
    if (i >= 0) pickups.splice(i, 1);
  }
  missionProps.length = 0;
}

// ---------------------------------------------------------------- objectives
objectiveType('killTargets', (def) => {
  // a count of 1 stays 1 (the sheriff is one man), a crowd scales with the level
  const n = Math.max(1, def.n > 1 ? Difficulty.objectiveCount(def.n) : (def.n || 1));
  const match = def.match || (() => true);
  let killed = 0, off = null;
  return {
    label: def.label || 'Kill the targets',
    detail: '0/' + n,
    setup() {
      off = Bus.on('npc:died', e => {
        if (this.state !== 'active' || !e.npc || !match(e.npc)) return;
        killed++;
        this.progress = killed / n;
        this.detail = Math.min(killed, n) + '/' + n;
        if (killed >= n) finishObjective(this);
      });
    },
    teardown() { if (off) off(); off = null; },
    snapshot() { return { state: this.state, count: killed }; },
    restore(s) {
      killed = s.count || 0;
      this.detail = Math.min(killed, n) + '/' + n;
      this.progress = killed / n;
      if (s.state === 'done') { this.state = 'done'; this.progress = 1; }
    }
  };
});

objectiveType('reachLocation', (def) => ({
  label: def.label || 'Reach the marker',
  _x: def.x, _z: def.z, _r: def.r || 4, _show: def.marker !== false,
  update() {
    if (this.state !== 'active') return;
    const d = Math.hypot(player.g.position.x - this._x, player.g.position.z - this._z);
    this.detail = Math.max(0, Math.round(d)) + 'm';
    // fades in as the player closes in, so the tracker bar means something on the way
    this.progress = clamp(1 - d / 60, 0, 0.95);
    if (d <= this._r) finishObjective(this, 'arrived');
  },
  marker() { return (this._show && this.state === 'active') ? { x: this._x, z: this._z, label: this.label } : null; },
  snapshot() { return { state: this.state }; }
}));

objectiveType('escapeArea', (def) => ({
  label: def.label || 'Get clear',
  _x: def.x, _z: def.z, _r: def.r || 30,
  update() {
    if (this.state !== 'active') return;
    const d = Math.hypot(player.g.position.x - this._x, player.g.position.z - this._z);
    this.detail = Math.max(0, Math.round(d)) + 'm';
    this.progress = clamp(d / this._r, 0, 0.95);
    if (d > this._r) finishObjective(this, 'clear');
  },
  marker() { return this.state === 'active' ? { x: this._x, z: this._z, label: this.label, danger: true } : null; },
  snapshot() { return { state: this.state }; }
}));

objectiveType('surviveDuration', (def) => {
  const total = Difficulty.objectiveTime(def.seconds || 20);
  let elapsed = 0;
  return {
    label: def.label || 'Stay alive',
    detail: total + 's',
    _x: def.x, _z: def.z, _r: def.r || 0,
    setup() { this.elapsed = 0; this.held = 0; },
    update(dt) {
      if (this.state !== 'active') return;
      if (this._x !== undefined) {
        const d = Math.hypot(player.g.position.x - this._x, player.g.position.z - this._z);
        if (d > this._r) {
          this.detail = 'return to the marker';
          this.progress = clamp(1 - d / 60, 0, 0.9);
          this.held = 0;                 // leaving resets the stand-off, not the clock
          return;
        }
      }
      elapsed += dt;
      this.progress = clamp(elapsed / total, 0, 1);
      this.detail = Math.max(0, Math.ceil(total - elapsed)) + 's';
      if (elapsed >= total) finishObjective(this, 'held');
    },
    marker() { return (this.state === 'active' && this._x !== undefined) ? { x: this._x, z: this._z, label: this.label, area: this._r } : null; },
    snapshot() { return { state: this.state, elapsed }; },
    restore(s) { elapsed = s.elapsed || 0; }
  };
});

objectiveType('protectNpc', (def) => {
  let off = null;
  return {
    label: def.label || 'Keep them alive',
    _find: def.find || (() => null),
    setup() {
      this.npc = def.npc || this._find();
      // a follow escort puts the NPC on the player's heels for as long as this
      // objective lives (see the hook in locomotion.js)
      if (this.npc && def.follow) this.npc.followPlayer = true;
      off = Bus.on('npc:died', e => {
        if (this.state !== 'active' || !this.npc || e.npc !== this.npc) return;
        failObjective(this, 'they died');
      });
    },
    teardown() {
      if (off) off(); off = null;
      if (this.npc && def.follow) this.npc.followPlayer = false;
    },
    update() {
      if (this.state !== 'active') return;
      if (!this.npc || this.npc.dead) { failObjective(this, 'they died'); return; }
      const d = Math.hypot(player.g.position.x - this.npc.g.position.x, player.g.position.z - this.npc.g.position.z);
      this.detail = Math.round(d) + 'm';
      this.progress = clamp(1 - d / 40, 0, 0.9);
      // done once whatever it was guarding against is over: the mission says when
      if (def.until && def.until(this.mission)) finishObjective(this, 'safe');
    },
    marker() { return (this.state === 'active' && this.npc) ? { x: this.npc.g.position.x, z: this.npc.g.position.z, label: this.label, friendly: true } : null; },
    snapshot() { return { state: this.state, npc: this.npc ? npcs.indexOf(this.npc) : -1 }; },
    restore(s) { if (s.npc >= 0) this.npc = npcs[s.npc]; }
  };
});

objectiveType('collectItems', (def) => {
  const n = Difficulty.objectiveCount(def.n || 1);
  let got = 0;
  return {
    label: def.label || 'Collect the cache',
    detail: '0/' + n,
    setup() {
      this.items = [];
      const spots = def.spots || [];
      for (let i = 0; i < n; i++) {
        const s = spots[i] || [rnd(-60, 60), rnd(-60, 60)];
        this.items.push(spawnMissionItem(s[0], s[1], def.label));
      }
      this.items.forEach(it => { it.objective = this; });
    },
    teardown() {
      // Take the crates out of the world *and* out of the pickups list: dropping them
      // from the scene alone left them in the array for ever, so every aborted or
      // finished collect mission leaked three invisible objects.
      (this.items || []).forEach(it => {
        if (it.g && it.g.parent) it.g.parent.remove(it.g);
        const i = pickups.indexOf(it);
        if (i >= 0) pickups.splice(i, 1);
        it.taken = true;
      });
    },
    // called by the loop through Missions.onPickup()
    take(item) {
      if (this.state !== 'active' || !this.items.includes(item)) return false;
      item.taken = true;
      if (item.g) item.g.visible = false;
      got++;
      this.progress = got / n;
      this.detail = Math.min(got, n) + '/' + n;
      if (got >= n) finishObjective(this);
      return true;
    },
    update() {
      if (this.state !== 'active') return;
      if (def.until && def.until(this.mission)) finishObjective(this, 'enough');
    },
    marker() {
      if (this.state !== 'active') return null;
      const left = (this.items || []).filter(i => !i.taken);
      if (!left.length) return null;
      const it = left[0];
      return { x: it.g.position.x, z: it.g.position.z, label: this.label };
    },
    use() {
      // walking within arm's reach also counts, so a fast pass is not a miss
      const near = (this.items || []).find(i => !i.taken &&
        Math.hypot(i.g.position.x - player.g.position.x, i.g.position.z - player.g.position.z) < 2.2);
      if (near) this.take(near);
    },
    snapshot() { return { state: this.state, count: got, taken: (this.items || []).map(i => !!i.taken) }; },
    restore(s) {
      got = s.count || 0;
      this.detail = Math.min(got, n) + '/' + n;
      this.progress = got / n;
      (this.items || []).forEach((it, i) => {
        if (s.taken && s.taken[i]) { it.taken = true; if (it.g) it.g.visible = false; }
      });
      if (s.state === 'done') { this.state = 'done'; this.progress = 1; }
    }
  };
});

// Anything that is "go here and do a thing": talk, steal, capture, search, deliver.
// `seconds` makes it a hold rather than a press, and `auto` makes it a dwell that
// needs no input at all (investigating a spot, waiting for a wagon).
objectiveType('interactWith', (def) => {
  const r = def.r || 3.2;
  const need = def.seconds ? Difficulty.objectiveTime(def.seconds) : 0;
  let held = 0;
  return {
    label: def.label || (def.verb ? def.verb + ' it' : 'Interact'),
    verb: def.verb || '',
    _find: def.find || null,
    setup() {
      if (def.follow) this.npc = (typeof def.follow === 'function' ? def.follow() : def.follow);
      if (def.npc) this.npc = def.npc;
    },
    at() {
      if (this.npc && !this.npc.dead) return { x: this.npc.g.position.x, z: this.npc.g.position.z };
      if (def.x !== undefined) return { x: def.x, z: def.z };
      return null;
    },
    update(dt) {
      if (this.state !== 'active') return;
      const p = this.at();
      if (!p) { failObjective(this, 'nothing to act on'); return; }
      const d = Math.hypot(player.g.position.x - p.x, player.g.position.z - p.z);
      this.detail = Math.max(0, Math.round(d)) + 'm';
      this.progress = clamp(1 - d / 40, 0, 0.9);
      if (need && d <= r) {
        held += dt;
        this.progress = clamp(held / need, 0, 1);
        this.detail = Math.max(0, Math.ceil(need - held)) + 's';
        if (held >= need) finishObjective(this, 'done');
      } else {
        held = 0;
      }
      if (def.auto && !def.seconds && d <= r) finishObjective(this, 'found it');
    },
    marker() { const p = this.at(); return (this.state === 'active' && p) ? { x: p.x, z: p.z, label: this.label } : null; },
    prompt() {
      if (this.state !== 'active') return null;
      const p = this.at();
      if (!p) return null;
      const d = Math.hypot(player.g.position.x - p.x, player.g.position.z - p.z);
      if (d > r) return null;
      if (def.auto) return null;                       // dwell objectives need no input
      // the pill reads as one instruction, not "REPORT report at the store"
      const verb = (def.verb || (def.seconds ? 'HOLD' : 'USE')).toUpperCase();
      const label = this.label.toUpperCase();
      return { label: label.startsWith(verb) ? label : verb + ' ' + label };
    },
    use() {
      if (this.state !== 'active') return;
      const p = this.at();
      if (!p) return;
      const d = Math.hypot(player.g.position.x - p.x, player.g.position.z - p.z);
      if (d > r) return;
      if (def.seconds) return;                         // hold objectives finish in update()
      if (def.check && !def.check(this)) return;
      finishObjective(this, 'done');
    },
    snapshot() { return { state: this.state, elapsed: held }; },
    restore(s) { held = s.elapsed || 0; }
  };
});

// Capture, not kill: the target has to be alive and worn down first.
objectiveType('captureTarget', (def) => ({
  label: def.label || 'Capture the target',
  setup() { this.npc = def.npc || (def.find ? def.find() : null); },
  update() {
    if (this.state !== 'active') return;
    const npc = this.npc;
    if (!npc || npc.dead) { failObjective(this, 'they died'); return; }
    const d = Math.hypot(player.g.position.x - npc.g.position.x, player.g.position.z - npc.g.position.z);
    const worn = npc.hp <= 1;
    this.detail = worn ? 'worn down - move in' : 'they are still fighting (' + Math.max(0, Math.ceil(npc.hp)) + ' hp)';
    this.progress = worn ? clamp(1 - d / 20, 0, 0.9) : clamp(1 - npc.hp / 5, 0, 0.6);
    if (worn && d <= 3) finishObjective(this, 'taken alive');
  },
  marker() { return (this.state === 'active' && this.npc) ? { x: this.npc.g.position.x, z: this.npc.g.position.z, label: this.label } : null; },
  snapshot() { return { state: this.state, npc: this.npc ? npcs.indexOf(this.npc) : -1 }; },
  restore(s) { if (s.npc >= 0) this.npc = npcs[s.npc]; }
}));

// Group objectives: run several at once, wait for any of them (branching), or run
// them one after another. This is what lets a mission branch without new plumbing.
objectiveType('all', (def, mission) => ({
  label: def.label || 'Objectives',
  setup() {
    this.children = (def.list || []).map(d => makeObjective(d, mission)).filter(Boolean);
    this.children.forEach(c => c.setup());
  },
  teardown() { (this.children || []).forEach(c => c.teardown()); },
  update(dt) {
    if (this.state !== 'active') return;
    (this.children || []).forEach(c => c.update(dt));
    const active = this.children.filter(c => !c.optional);
    this.progress = active.length ? active.filter(c => c.state === 'done').length / active.length : 1;
    this.detail = active.filter(c => c.state === 'done').length + '/' + active.length;
    if (active.every(c => c.state === 'done')) finishObjective(this);
    // Any child failing breaks the group, optional ones included: an optional guard
    // that dies is still a failure of the thing it was guarding, which is exactly how
    // an escort says "the witness is dead".
    else if ((this.children || []).some(c => c.state === 'failed')) failObjective(this, 'one part failed');
  },
  marker() { return (this.children || []).map(c => c.marker()).find(m => m) || null; },
  snapshot() { return { state: this.state, children: (this.children || []).map(c => c.snapshot()) }; },
  restore(s) { (this.children || []).forEach((c, i) => { if (s.children && s.children[i]) c.restore(s.children[i]); }); }
}));

objectiveType('any', (def, mission) => ({
  label: def.label || 'Choose your way in',
  setup() {
    this.children = (def.list || []).map(d => makeObjective(d, mission)).filter(Boolean);
    this.children.forEach(c => c.setup());
  },
  teardown() { (this.children || []).forEach(c => c.teardown()); },
  update(dt) {
    if (this.state !== 'active') return;
    (this.children || []).forEach(c => c.update(dt));
    const won = this.children.find(c => c.state === 'done');
    this.progress = won ? 1 : Math.max(...this.children.map(c => c.progress || 0), 0);
    this.detail = won ? 'done' : 'pick one';
    if (won) {
      // the roads not taken are settled, not left hanging
      this.children.forEach(c => { if (c !== won && c.state === 'active') c.state = 'skipped'; });
      finishObjective(this);
    }
  },
  marker() { return (this.children || []).map(c => c.marker()).find(m => m) || null; },
  snapshot() { return { state: this.state, children: (this.children || []).map(c => c.snapshot()) }; },
  restore(s) { (this.children || []).forEach((c, i) => { if (s.children && s.children[i]) c.restore(s.children[i]); }); }
}));

// ---------------------------------------------------------------- the factory
function makeObjective(def, mission) {
  const factory = OBJ_TYPES.get(def.type);
  if (!factory) {
    console.warn('[Missions] unknown objective type: ' + def.type);
    return null;
  }
  const o = factory(def, mission);
  o.type = def.type;
  o.id = def.id || (def.type + '#' + Math.random().toString(36).slice(2, 7));
  o.label = def.label || o.label || def.type;
  o.optional = !!def.optional;
  o.hidden = !!def.hidden;
  o.state = 'active';
  o.progress = 0;
  o.detail = o.detail || '';
  o.mission = mission;
  o.children = o.children || null;
  const setup = o.setup, update = o.update, teardown = o.teardown;
  o.setup = () => { if (setup) setup.call(o); };
  o.update = dt => { if (update) update.call(o, dt); };
  o.teardown = () => { if (teardown) teardown.call(o); };
  for (const m of ['marker', 'prompt', 'use', 'take', 'snapshot', 'restore']) {
    const fn = o[m];
    o[m] = (...args) => (fn ? fn.apply(o, args) : (m === 'marker' || m === 'prompt' ? null : undefined));
  }
  return o;
}
