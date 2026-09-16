/* ==========================================================================
   The Wild West - js/law/witnesses.js
   Who saw it, what they do about it, and what you can do about them.

   A crime opens a case, and a case is only worth what its witnesses are worth. A
   witness runs for the law; if he gets there the case is reported and the heat
   lands. Until then the case is open, which is the window where the player has
   options: run him down, put a gun on him, or pay him off.

   Provides:  Witnesses
   Expects:   npcs, player, Perceive, Law, Squads, Perceive.canSee, Difficulty
   ========================================================================== */
"use strict";
const Witnesses = (() => {
  const cases = [];
  let nextId = 1;
  const BRIBES = [40, 75, 120, 200];

  // Everything about a case that the rest of the game can see
  function openCase(kind, x, z, opts) {
    const o = opts || {};
    const c = {
      id: nextId++, kind, x, z, at: clock.elapsedTime, reported: false, cold: false,
      witnesses: [], bribed: 0, silenced: 0
    };
    cases.push(c);
    if (cases.length > 12) cases.shift();
    return c;
  }
  // Who can actually see the scene: line of sight, field of view and distance, the
  // same senses the AI uses. `exclude` keeps the victim out of his own case.
  function whoSaw(x, z, exclude) {
    const out = [];
    for (const n of npcs) {
      if (n.dead || n === exclude || n.isPlayer) continue;
      if (Perceive.canSee(n, x, z)) out.push(n);
    }
    return out;
  }
  // A crime happened: find the witnesses, and put them on the road to the law.
  function witnessed(kind, x, z, opts) {
    const o = opts || {};
    const seen = o.witnesses || whoSaw(x, z, o.victim);
    if (!seen.length) {
      // nobody saw it: the case never opens, and nothing is added to the record
      Bus.emit('law:unseen', { kind, x, z });
      return null;
    }
    const c = openCase(kind, x, z, o);
    seen.forEach(n => {
      c.witnesses.push({ npc: n, state: 'running', reportT: reportDelay(n, x, z), identified: !n.civil });
      // and they leg it: a witness running for the law is the visible consequence of
      // a crime, which is what the player reacts to
      n.witness = c.id;
      n.reportTo = runTo(n);
      n.shoutT = 0.4;
      n.susp = 1;
      n.lastKnown = { x, z, age: 0 };
    });
    Law.tip(x, z, o.silent ? '' : witnessLine(c));
    Bus.emit('law:witnessed', { case: c, kind, witnesses: c.witnesses.length });
    return c;
  }

  function reportDelay(n, x, z) {
    // the further a witness is from the law, the longer the player has
    const lead = runTo(n);
    const d = lead ? Math.hypot(lead.x - x, lead.z - z) : 60;
    return clamp(2.2 + d / 26, 2.2, 9) * Difficulty.lawPressure(1);
  }
  // Where a witness runs: the nearest lawman, or the store if the street is empty
  function runTo(n) {
    let best = null, bd = 1e9;
    for (const m of npcs) {
      if (m.dead || m.civil) continue;
      const d = Math.hypot(m.g.position.x - n.g.position.x, m.g.position.z - n.g.position.z);
      if (d < bd) { bd = d; best = m; }
    }
    if (best) return { x: best.g.position.x, z: best.g.position.z, npc: best };
    if (typeof STORE === 'object') return { x: STORE.x, z: STORE.z, npc: null };
    return null;
  }
  function witnessLine(c) {
    const who = c.witnesses.length === 1 ? 'Somebody saw that' : c.witnesses.length + ' people saw that';
    return who + ' \u2014 they are running for the law';
  }
  // the freshest case with a live witness, which is the lead the law follows
  function lastLead() {
    for (let i = cases.length - 1; i >= 0; i--) {
      const c = cases[i];
      if (!c.reported && !c.cold && c.witnesses.some(w => w.state === 'running')) return { x: c.x, z: c.z };
    }
    return null;
  }

  function update(dt) {
    for (const c of cases) {
      if (c.reported || c.cold) continue;
      let live = 0;
      for (const w of c.witnesses) {
        const n = w.npc;
        if (w.state !== 'running') continue;
        if (!n || n.dead) { w.state = 'dead'; continue; }
        w.reportT -= dt;
        // he keeps his target on the nearest lawman as the street moves
        const lead = runTo(n);
        if (lead) n.reportTo = lead;
        // intimidation: a gun levelled at him for a moment is its own argument
        const d = Math.hypot(n.g.position.x - player.g.position.x, n.g.position.z - player.g.position.z);
        if (aiming && d < 12 && Perceive.canSee(player, n.g.position.x, n.g.position.z)) {
          w.scared = (w.scared || 0) + dt;
          if (w.scared > 1.0) { w.state = 'scared'; n.reportTo = null; n.witness = null; Bus.emit('law:witnessIntimidated', { npc: n, case: c }); }
        } else {
          w.scared = Math.max(0, (w.scared || 0) - dt * 0.5);
        }
        if (w.state !== 'running') continue;
        // reaching the law is what turns a crime into heat
        const near = lead && lead.npc && !lead.npc.dead &&
          Math.hypot(lead.npc.g.position.x - n.g.position.x, lead.npc.g.position.z - n.g.position.z) < 7;
        if (near || w.reportT <= 0) {
          w.state = 'reported';
          c.reported = true;
          n.witness = null;
          n.reportTo = null;
          Law.report(c.kind, c.x, c.z, c.witnesses.length);
          Squads.alarm(n.g.position.x, n.g.position.z, 55);
          Bus.emit('law:reported', { case: c, npc: n });
        }
      }
      // counted at the end, so a witness who just went quiet this pass counts as gone
      live = c.witnesses.filter(w => w.state === 'running' && w.npc && !w.npc.dead).length;
      if (live === 0) {
        // no witnesses left: the case goes cold and never reaches the law
        c.cold = true;
        Bus.emit('law:cold', { case: c });
      }
    }
    for (let i = cases.length - 1; i >= 0; i--) {
      if (cases[i].at > 0 && clock.elapsedTime - cases[i].at > 90) cases.splice(i, 1);
    }
  }

  // ---- what the player can do about a witness -------------------------------
  // The bribe price scales with the case: the more they saw, the more they want.
  function bribePrice(w) {
    const c = cases.find(x => x.witnesses.some(y => y.npc === w));
    const weight = c ? Math.min(3, c.witnesses.length - 1) : 0;
    const heat = c ? Law.CRIMES[c.kind].heat : 1;
    return Math.round(BRIBES[weight] * clamp(heat / 1.6, 0.6, 2.2));
  }
  function liveWitnessNear(radius) {
    for (const c of cases) {
      if (c.reported || c.cold) continue;
      for (const w of c.witnesses) {
        if (w.state !== 'running' || !w.npc || w.npc.dead) continue;
        const d = Math.hypot(w.npc.g.position.x - player.g.position.x, w.npc.g.position.z - player.g.position.z);
        if (d <= (radius || 4)) return { c, w };
      }
    }
    return null;
  }
  // the contextual pill: "BRIBE $75" when you are close enough to buy a silence
  function prompt() {
    const near = liveWitnessNear(4);
    if (!near) return null;
    const price = bribePrice(near.w.npc);
    return { label: cash >= price ? 'BRIBE $' + price : 'NO CASH TO BRIBE', price, npc: near.w.npc, case: near.c };
  }
  function use() {
    const near = liveWitnessNear(4);
    if (!near) return false;
    const price = bribePrice(near.w.npc);
    if (cash < price) {
      feed('You cannot cover a $' + price + ' bribe', 'bad');
      return true;
    }
    cash -= price;
    near.w.state = 'bought';
    near.w.npc.witness = null;
    near.w.npc.reportTo = null;
    // buying one man does not buy the case: the others still talk
    const stillRunning = near.c.witnesses.filter(w => w.state === 'running').length;
    near.c.bribed++;
    feed(stillRunning ? 'Bribed one of them \u2014 ' + stillRunning + ' still running' : 'The witness takes your money and forgets your face', 'good');
    Bus.emit('law:witnessBribed', { npc: near.w.npc, case: near.c, price, remaining: stillRunning });
    if (!stillRunning) near.c.cold = true;
    return true;
  }

  function clear() {
    cases.length = 0;
    npcs.forEach(n => { n.witness = null; n.reportTo = null; n.shoutT = 0; });
  }
  function status() {
    const open = cases.filter(c => !c.reported && !c.cold);
    const running = open.reduce((n, c) => n + c.witnesses.filter(w => w.state === 'running').length, 0);
    return {
      open: open.length, running, reported: cases.filter(c => c.reported).length,
      cold: cases.filter(c => c.cold).length, total: cases.length
    };
  }
  function snapshot() { return { cases: status() }; }
  function restore() { clear(); return true; }

  return { witnessed, whoSaw, openCase, update, prompt, use, clear, status, snapshot, restore, lastLead,
    get cases() { return cases; } };
})();
