/* ==========================================================================
   The Wild West - js/ai/squad.js
   Lawmen and gangs fight as groups: one man's sighting becomes everyone's, and
   the squad hands out roles so three men do not all do the same thing.

   A squad keeps a shared picture of the player - where he was seen, how long ago,
   and whether anyone still has eyes on him - and turns that into orders:
     suppress   the closest man holds him down with fire
     flank      the next men swing around to the side, alternating
     advance    everyone else closes in
     hold       no contact: back to normal business
     withdraw   the squad has taken enough losses, break contact

   Provides:  Squads
   Expects:   npcs, player, Difficulty, feed, rnd, clamp
   ========================================================================== */
"use strict";
const Squads = (() => {
  const list = new Map();
  let tick = 0;

  function create(id, kind) {
    const sq = { id, kind: kind || 'law', members: [], leader: null, contact: null, order: 'hold', orderT: 0, morale: 1, callT: 0, flankSide: 1 };
    list.set(id, sq);
    return sq;
  }
  function of(n) { return n && n.squad ? list.get(n.squad) : null; }
  function join(n, id, role) {
    const sq = list.get(id) || create(id, n.civil ? 'civil' : 'law');
    if (sq.members.includes(n)) return sq;
    sq.members.push(n);
    n.squad = id;
    n.squadRole = role || 'advance';
    if (!sq.leader && !n.civil) sq.leader = n;
    return sq;
  }
  function leave(n) {
    const sq = of(n);
    if (!sq) return;
    const i = sq.members.indexOf(n);
    if (i >= 0) sq.members.splice(i, 1);
    if (sq.leader === n) sq.leader = sq.members.find(m => !m.dead) || null;
    n.squad = null;
  }
  function members(sq) { return sq.members.filter(m => !m.dead); }
  function contactOf(sq) {
    // the freshest, closest sighting any member has of the player
    let best = null;
    for (const m of members(sq)) {
      // Only a man who has actually made up his mind counts: a lawman glancing at a
      // stranger must not hand the whole posse a target, or the street turns into a
      // firefight every time somebody walks past.
      const sure = (m.susp || 0) >= 0.9 || (m.hitT || 0) > 0;
      if (!sure) continue;
      if (m.sees && m.lastKnown) {
        if (!best || m.lastKnown.age < best.age) best = { x: m.lastKnown.x, z: m.lastKnown.z, age: m.lastKnown.age, seen: true };
      } else if (m.lastKnown && m.lastKnown.age < 24) {
        if (!best || m.lastKnown.age < best.age) best = { x: m.lastKnown.x, z: m.lastKnown.z, age: m.lastKnown.age, seen: false };
      } else if (m.heard && m.heard.age < 14) {
        if (!best || m.heard.age < best.age) best = { x: m.heard.x, z: m.heard.z, age: m.heard.age, seen: false };
      }
    }
    return best;
  }
  // Anyone can put the squad onto a position: a sighting, a shout, a fresh body.
  function report(n, x, z) {
    const sq = of(n);
    if (!sq) return;
    if (!sq.contact || sq.contact.age > 1.2) sq.contact = { x, z, age: 0, seen: false };
    else { sq.contact.x = x; sq.contact.z = z; sq.contact.age = 0; }
  }
  // A civilian screaming or a body hitting the floor tells every squad nearby.
  function alarm(x, z, radius) {
    const r = radius || 40;
    let told = 0;
    for (const sq of list.values()) {
      if (sq.kind === 'civil') continue;
      const c = centroid(sq);
      if (!c || Math.hypot(c.x - x, c.z - z) > r) continue;
      sq.contact = { x, z, age: 0, seen: false };
      sq.order = 'advance';
      sq.orderT = 0;
      // a shout or a body is enough to put them on edge even if they saw nothing
      members(sq).forEach(m => { m.susp = Math.max(m.susp || 0, 0.6); });
      told++;
    }
    return told;
  }
  function centroid(sq) {
    const live = members(sq);
    if (!live.length) return null;
    let x = 0, z = 0;
    live.forEach(m => { x += m.g.position.x; z += m.g.position.z; });
    return { x: x / live.length, z: z / live.length };
  }

  // One pass over the squads, a few times a second: decide the order, and who does
  // what inside it.
  function update(dt) {
    tick += dt;
    for (const sq of list.values()) {
      sq.orderT -= dt;
      sq.callT = Math.max(0, sq.callT - dt);
      // drop anyone who died or was removed from the world
      sq.members = sq.members.filter(m => npcs.includes(m));
      if (sq.leader && sq.leader.dead) sq.leader = members(sq)[0] || null;

      const c = contactOf(sq);
      if (c && (!sq.contact || sq.contact.age > 0.5 || c.age < sq.contact.age)) {
        sq.contact = { x: c.x, z: c.z, age: c.age, seen: c.seen };
      } else if (sq.contact) {
        sq.contact.age += dt;
      }
      const live = members(sq);
      const total = sq.members.length;
      sq.morale = total ? live.length / total : 0;
      if (sq.orderT > 0) continue;
      sq.orderT = 0.45;

      const fresh = sq.contact && sq.contact.age < 26;
      if (!live.length) { sq.order = 'hold'; continue; }
      if (!fresh) { sq.order = 'hold'; live.forEach(m => { m.squadRole = 'advance'; }); continue; }
      // enough losses and the squad pulls out, which is what makes a fight winnable
      const broken = sq.morale <= 0.4 || (sq.leader && sq.leader.dead && sq.morale <= 0.5);
      if (broken) {
        sq.order = 'withdraw';
        live.forEach(m => { m.squadRole = 'withdraw'; });
        continue;
      }
      sq.order = 'engage';
      // closest man pins him down, the next two swing wide, the rest push in
      const sorted = live.slice().sort((a, b) =>
        Math.hypot(a.g.position.x - sq.contact.x, a.g.position.z - sq.contact.z) -
        Math.hypot(b.g.position.x - sq.contact.x, b.g.position.z - sq.contact.z));
      sorted.forEach((m, i) => {
        if (m.isSheriff) { m.squadRole = 'advance'; return; }   // he does not take orders
        if (i === 0 && sorted.length > 1) m.squadRole = 'suppress';
        else if (i <= 2 && sorted.length > 2) { m.squadRole = 'flank'; m.flankSide = (i % 2) ? 1 : -1; }
        else m.squadRole = 'advance';
      });
      // Losses do not summon anybody: they rouse the lawmen who are elsewhere, who then
      // come looking. The count of men in the world never changes.
      if (sq.kind === 'law' && sq.callT <= 0 && wanted >= Difficulty.reinforceWanted() && total - live.length >= 2) {
        sq.callT = 16;
        alarm(sq.contact.x, sq.contact.z, 90);
        feed('The law has spread the word', 'bad');
      }
    }
  }

  // What an individual should do right now. The behaviour layer turns this into
  // movement; the combat code keeps doing the shooting.
  function orders(n) {
    const sq = of(n);
    if (!sq || !sq.contact || sq.contact.age > 26) return { role: 'advance', order: 'hold', contact: null };
    const c = sq.contact;
    const role = n.squadRole || 'advance';
    const out = { role, order: sq.order, contact: { x: c.x, z: c.z, age: c.age } };
    const away = Math.atan2(n.g.position.x - c.x, n.g.position.z - c.z);
    if (role === 'flank') {
      // swing wide of the contact, to the side this man was given
      const side = (n.flankSide || 1) * 1.15;
      const a = away + side;
      out.moveTo = { x: clamp(c.x + headX(a) * 13, -138, 138), z: clamp(c.z + headZ(a) * 13, -138, 138) };
    } else if (role === 'suppress') {
      // close to shooting range and stay there
      const a = away + 0.35;
      out.moveTo = { x: clamp(c.x + headX(a) * 9, -138, 138), z: clamp(c.z + headZ(a) * 9, -138, 138) };
    } else if (role === 'withdraw') {
      out.moveTo = { x: clamp(c.x + headX(away) * 34, -138, 138), z: clamp(c.z + headZ(away) * 34, -138, 138) };
    }
    return out;
  }

  function reset() { list.clear(); }

  // A death is the loudest thing that can happen in a street. The dead man's squad
  // all learn where it happened, and every squad within earshot comes to look -
  // including when the body was a civilian, which is how the law finds out.
  Bus.on('npc:died', e => {
    const dead = e.npc;
    if (!dead) return;
    const sq = of(dead);
    if (sq) {
      for (const m of sq.members) {
        if (m === dead || m.dead) continue;
        m.susp = Math.max(m.susp || 0, 0.75);
        m.heard = { x: dead.g.position.x, z: dead.g.position.z, d: 0, age: 0, kind: 'body' };
        if (!m.lastKnown) m.lastKnown = { x: dead.g.position.x, z: dead.g.position.z, age: 0 };
        m.reactT = Math.max(m.reactT || 0, 0.4);
      }
      sq.orderT = 0;
    }
    alarm(dead.g.position.x, dead.g.position.z, dead.civil ? 30 : 36);
  });

  return { join, leave, of, update, orders, report, alarm, reset, get squads() { return list; } };
})();
