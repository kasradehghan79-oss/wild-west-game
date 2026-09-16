/* ==========================================================================
   The Wild West - js/missions/catalog.js
   The missions themselves, as data. Nothing here knows how an objective works:
   it composes the components from objectives.js and lets manager.js run them.

   Main missions are the round's business (the sheriff hunt). Side missions are
   optional jobs that ride along with a round and pay their own way. Everything is
   gated with `when`, which reads the story flags and the round number, so content
   can unlock as the player gets further without new plumbing.
   Provides:  (registers definitions into Missions, sets Missions.pickMain/pickSide)
   Expects:   Missions, Squads, Difficulty, freeSpot, STORE, heightAt
   ========================================================================== */
"use strict";
// a clear spot between min and max metres from the player
function missionSpot(minR, maxR) {
  for (let i = 0; i < 24; i++) {
    const a = rnd(0, TAU), r = rnd(minR, maxR);
    const x = clamp(player.g.position.x + Math.cos(a) * r, -130, 130);
    const z = clamp(player.g.position.z + Math.sin(a) * r, -130, 130);
    if (!collide(x, z, 2)) return [x, z];
  }
  const s = freeSpot(clamp(player.g.position.x + minR, -130, 130), clamp(player.g.position.z, -130, 130), 3, 30);
  return [s.x, s.z];
}
// build a few distinct spots at once, and keep them apart from each other
function missionSpots(n, minR, maxR) {
  const out = [];
  for (let i = 0; i < n; i++) {
    for (let tries = 0; tries < 12; tries++) {
      const s = missionSpot(minR, maxR);
      if (out.every(o => Math.hypot(o[0] - s[0], o[1] - s[1]) > 12)) { out.push(s); break; }
      if (tries === 11) out.push(s);
    }
  }
  return out;
}

// ---------------------------------------------------------------- main missions
const M_BOUNTY = Missions.define({
  id: 'round_bounty',
  kind: 'main',
  name: 'The Sheriff',
  brief: 'Find and kill the sheriff before the sand runs out.',
  stages: [{
    name: 'Hunt him down',
    objectives: [
      {
        id: 'kill_sheriff', type: 'killTargets', n: 1,
        match: n => n.isSheriff,
        label: 'Kill the sheriff'
      },
      {
        // a bonus that never blocks the round, and never could: the sheriff is
        // still the only thing that scores
        id: 'bonus_posse', type: 'killTargets', n: 2, optional: true,
        match: n => !n.civil && !n.isSheriff,
        label: 'kill lawmen for the bounty board'
      }
    ]
  }],
  fail: [{ type: 'playerDead' }],
  reward: { cash: 60, flags: { sheriffDown: true } },
  onStart() {
    showObjective('FIND AND KILL THE SHERIFF',
      'Bounty $' + ARCH.sheriff.bounty + ' \u00b7 he is hiding in the posse \u2014 nobody knows where', 4600);
  }
});

// ---------------------------------------------------------------- side missions
const M_HOLDUP = Missions.define({
  id: 'side_holdup',
  kind: 'side',
  name: 'Ambush on the trail',
  brief: 'Deputies have boxed you in. Break them or outlast them.',
  when: () => wanted === 0 && npcs.some(n => !n.civil && !n.dead),
  onStart(m) {
    const [x, z] = missionSpot(16, 26);
    m.seen.holdAt = { x, z, r: 24 };
    // No new men: the ambush is the standing posse being sent to this spot, which is why
    // it is worth picking where you make your stand.
    if (typeof Squads === 'object') {
      Squads.alarm(x, z, 120);
      npcs.filter(n => !n.dead && !n.civil).forEach(n => {
        n.lastKnown = { x, z, age: 0 };
        n.susp = Math.max(n.susp || 0, 0.9);
        n.reactT = Math.max(n.reactT || 0, Difficulty.reaction(1.2));
      });
    }
    showObjective('AMBUSH!', 'They came for the bounty on your head \u2014 fight or hold out', 3600);
    feed('Ambush: deputies are closing in', 'bad');
  },
  stages: [{
    name: 'Break the ambush',
    // two ways through, which is what `any` is for
    objectives: [{
      id: 'break_out', type: 'any', label: 'Break the ambush',
      list: [
        {
          id: 'outlast', type: 'surviveDuration', seconds: 28, r: 26,
          label: 'hold out at the ambush', x: 0, z: 0
        },
        {
          id: 'cut_down', type: 'killTargets', n: 3,
          match: n => !n.civil,
          label: 'kill the deputies'
        }
      ]
    }]
  }],
  fail: [{ type: 'playerDead' }],
  reward: { cash: 90 }
});
M_HOLDUP.onRef = m => {
  const r = m.seen.holdAt || { x: player.g.position.x, z: player.g.position.z };
  const o = m.def.stages[0].objectives[0].list[0];
  o.x = r.x; o.z = r.z;
};

const M_CACHE = Missions.define({
  id: 'side_cache',
  kind: 'side',
  name: 'The lost cache',
  brief: 'Three crates went missing off the stagecoach. Somewhere out here.',
  onStart(m) {
    m.seen.spots = missionSpots(3, 25, 70);
    showObjective('THE LOST CACHE', 'Three crates are scattered nearby \u2014 marked on your map', 3600);
  },
  stages: [{
    name: 'Find every crate',
    objectives: [{ id: 'crates', type: 'collectItems', n: 3, label: 'find the crates' }]
  }],
  fail: [{ type: 'playerDead' }],
  reward: { cash: 75, flags: { foundCache: true } }
});
// the crates were chosen when the mission started, so hand them back on a load
M_CACHE.onRef = m => { m.def.stages[0].objectives[0].spots = m.seen.spots; };

const M_LOOKOUT = Missions.define({
  id: 'side_lookout',
  kind: 'side',
  name: 'Scout the ridge',
  brief: 'Ride out, look the place over, and report back to the store.',
  when: () => roundNum >= 2,
  onStart(m) {
    m.seen.ridge = missionSpot(70, 100);
    showObjective('SCOUT THE RIDGE', 'Find the lookout point, then report to the General Store', 3600);
  },
  stages: [
    {
      name: 'Reach the lookout',
      objectives: [{ id: 'ridge', type: 'reachLocation', r: 8, label: 'reach the lookout', x: 0, z: 0 }]
    },
    {
      name: 'Report in',
      objectives: [{ id: 'report', type: 'interactWith', verb: 'REPORT', r: 4.5, seconds: 2.5, label: 'report to the General Store', x: STORE.x, z: STORE.z }]
    }
  ],
  fail: [{ type: 'playerDead' }],
  reward: { cash: 70 }
});
M_LOOKOUT.onRef = m => { m.def.stages[0].objectives[0].x = m.seen.ridge[0]; m.def.stages[0].objectives[0].z = m.seen.ridge[1]; };

const M_WITNESS = Missions.define({
  id: 'side_witness',
  kind: 'side',
  name: 'Walk the witness in',
  brief: 'Somebody saw who did it. Keep them breathing all the way to the store.',
  when: () => roundNum >= 2 && wanted === 0,
  onStart(m) {
    const witness = npcs.find(n => n.civil && !n.dead);
    m.seen.witness = witness ? npcs.indexOf(witness) : -1;
    if (witness) {
      witness.followPlayer = true;
      witness.hp = Math.max(witness.hp, 3);       // a witness worth escorting is not frail
    }
    showObjective('WALK THE WITNESS IN',
      'They will follow you \u2014 get them to the General Store alive', 4000);
    feed('The witness is on your heels. Keep them alive to the store', '');
  },
  stages: [{
    name: 'Get them to the store',
    objectives: [{
      id: 'escort', type: 'all', label: 'Escort the witness',
      list: [
        {
          id: 'witness_safe', type: 'protectNpc', optional: true, follow: true,
          find: () => npcs.find(n => n.followPlayer) || null,
          label: 'keep the witness alive', until: () => false
        },
        {
          id: 'walk_in', type: 'reachLocation', r: 4.5,
          label: 'get the witness to the General Store', x: STORE.x, z: STORE.z
        }
      ]
    }]
  }],
  fail: [{ type: 'playerDead' }, { type: 'timeLimit', seconds: 120 }],
  reward: { cash: 110, flags: { witnessSaved: true } }
});

const M_CAPTURE = Missions.define({
  id: 'side_capture',
  kind: 'side',
  name: 'Bring one in alive',
  brief: 'The marshal pays double for a prisoner. Wound him, then walk him down.',
  when: () => roundNum >= 2,
  onStart() {
    showObjective('BRING ONE IN ALIVE', 'Wound a lawman, then close in and take him', 3600);
  },
  stages: [{
    name: 'Take a prisoner',
    objectives: [{
      id: 'capture', type: 'captureTarget', label: 'wound a lawman, then take him alive',
      find: () => npcs.find(n => !n.dead && !n.civil) || null
    }]
  }],
  fail: [{ type: 'playerDead' }],
  reward: { cash: 130, flags: { madeAnArrest: true } }
});

// ---------------------------------------------------------------- scheduling
// The round's main mission is fixed for now; the campaign in a later phase will
// choose from a chapter list instead.
Missions.pickMain = round => M_BOUNTY;

const SIDE_POOL = [M_HOLDUP, M_CACHE, M_LOOKOUT, M_WITNESS, M_CAPTURE];
const SIDE_ODDS = 0.65;
Missions.pickSide = (round, flags) => {
  // a side job in the opening round sets the tone; after that it is a coin toss
  const roll = round <= 1 ? 1 : (Math.random() < SIDE_ODDS ? 1 : 0);
  if (!roll) return null;
  const pool = SIDE_POOL.filter(d => !d.when || d.when({ flags, round, wanted, playerDead, missionCount: 1 }));
  if (!pool.length) return null;
  return pool[(round + Math.floor(Math.random() * pool.length)) % pool.length];
};
