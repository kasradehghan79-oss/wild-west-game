/* ==========================================================================
   The Wild West - js/core/difficulty.js
   Five difficulty levels, and every knob they turn.

   Difficulty is deliberately not an enemy health slider. Each level is a table of
   multipliers read by the systems that care, so "harder" means the law shoots
   straighter and sooner, notices more, reacts faster, closes from further out,
   calls help more often and pays less, while the player hits softer, heals slower
   and finds fewer crates and bandages.

   Every system asks this module for a number instead of reading the table, so the
   shape of a level can change without touching a call site.
   Provides:  Difficulty, DIFFICULTIES
   Expects:   settings, saveSettings, Bus
   ========================================================================== */
"use strict";
const DIFFICULTIES = [
  {
    id: 'greenhorn', name: 'GREENHORN', tag: 'EASY',
    blurb: 'They miss a lot, they hesitate, and the county is generous.',
    foeHp: 0.65, foeDmg: 0.5, foeMiss: 1.5, foeReact: 1.6, foeEngage: 0.8, foeRate: 1.4,
    playerDmg: 1.45, healRate: 1.8, pickup: 1.5,
    prices: 0.75, reward: 1.2,
    sense: 0.72, senseGain: 0.6,
    objective: 0.6, objectiveTime: 1.45,
    helpAt: 4, lawPressure: 0.6, assist: 1.8,
    squad: 0.6,
    // the whole posse, fixed: 1 sheriff plus these, so the town never grows and nobody appears out of nowhere
    garrison: ['deputy', 'deputy', 'deputy']
  },
  {
    id: 'deputy', name: 'DEPUTY', tag: 'NORMAL',
    blurb: 'Forgiving, but they will still shoot back.',
    // what the old EASY tier used to be: the shift above means this is where the
    // gentler numbers now live
    foeHp: 0.75, foeDmg: 0.6, foeMiss: 1.35, foeReact: 1.5, foeEngage: 0.85, foeRate: 1.3,
    playerDmg: 1.35, healRate: 1.6, pickup: 1.4,
    prices: 0.8, reward: 1.15,
    sense: 0.8, senseGain: 0.7,
    objective: 0.7, objectiveTime: 1.3,
    helpAt: 3, lawPressure: 0.7, assist: 1.6,
    squad: 0.7,
    garrison: ['deputy', 'deputy', 'deputy', 'rifleman']
  },
  {
    id: 'gunhand', name: 'GUNHAND', tag: 'HARD',
    blurb: 'The balance the game was tuned around.',
    // every number here is the old NORMAL tier: the tuned baseline now sits at HARD
    foeHp: 1, foeDmg: 1, foeMiss: 1, foeReact: 1, foeEngage: 1, foeRate: 1,
    playerDmg: 1, healRate: 1, pickup: 1,
    prices: 1, reward: 1,
    sense: 1, senseGain: 1,
    objective: 1, objectiveTime: 1,
    helpAt: 2, lawPressure: 1, assist: 1,
    squad: 1,
    garrison: ['deputy', 'deputy', 'deputy', 'deputy', 'rifleman', 'shotgunner']
  },
  {
    id: 'outlaw', name: 'OUTLAW', tag: 'VERY HARD',
    blurb: 'Cover matters. Every shot has to count.',
    foeHp: 1.8, foeDmg: 1.5, foeMiss: 0.72, foeReact: 0.7, foeEngage: 1.2, foeRate: 0.72,
    playerDmg: 0.8, healRate: 0.5, pickup: 0.7,
    prices: 1.2, reward: 0.9,
    sense: 1.3, senseGain: 1.5,
    objective: 1.7, objectiveTime: 0.65,
    helpAt: 2, lawPressure: 1.7, assist: 0.6,
    squad: 1.3,
    garrison: ['deputy', 'deputy', 'deputy', 'deputy', 'deputy', 'rifleman', 'rifleman', 'shotgunner']
  },
  {
    id: 'legend', name: 'LEGEND', tag: 'BRUTAL',
    blurb: 'One mistake. They remember your face.',
    foeHp: 2.4, foeDmg: 1.8, foeMiss: 0.6, foeReact: 0.55, foeEngage: 1.35, foeRate: 0.62,
    playerDmg: 0.7, healRate: 0.35, pickup: 0.55,
    prices: 1.35, reward: 0.8,
    sense: 1.5, senseGain: 1.8,
    objective: 2, objectiveTime: 0.5,
    helpAt: 1, lawPressure: 2.2, assist: 0.4,
    squad: 1.45,
    garrison: ['deputy', 'deputy', 'deputy', 'deputy', 'deputy', 'rifleman', 'rifleman', 'shotgunner', 'hunter', 'hunter']
  }
];

const Difficulty = (() => {
  let cur = DIFFICULTIES[1];
  function find(id) { return DIFFICULTIES.find(d => d.id === id) || null; }
  function d() { return cur; }

  function set(id, opts) {
    const next = find(id);
    if (!next) return cur.id;
    if (next === cur) return cur.id;
    const was = cur;
    cur = next;
    if (settings) settings.difficulty = cur.id;
    if (!opts || opts.save !== false) { if (typeof saveSettings === 'function') saveSettings(); }
    Bus.emit('difficulty:change', { id: cur.id, level: cur, was: was.id });
    return cur.id;
  }
  function index() { return DIFFICULTIES.indexOf(cur); }
  // step through the list, for a menu key or a test
  function step(dir) {
    const i = clamp(index() + (dir || 1), 0, DIFFICULTIES.length - 1);
    return set(DIFFICULTIES[i].id);
  }

  // ---- what the rest of the game asks for ------------------------------------
  // everything returns a *scaled* number, so no call site needs to know the table
  return {
    get id() { return cur.id; },
    get level() { return cur; },
    get all() { return DIFFICULTIES; },
    set, step, find, index,
    // foes
    foeHp: base => Math.max(1, Math.round(base * cur.foeHp)),
    foeDmg: base => base * cur.foeDmg,
    // the value passed to the hit roll is a *miss* chance, so this inverts
    foeMiss: base => clamp(base * cur.foeMiss, 0.02, 0.95),
    foeMissMult: () => cur.foeMiss,
    reaction: base => base * cur.foeReact,
    engage: base => base * cur.foeEngage,
    fireRate: base => base * cur.foeRate,
    squadPressure: () => cur.squad,
    // how many lawmen exist at all, and what they are
    garrisonMix: () => cur.garrison.slice(),
    garrisonSize: () => cur.garrison.length + 1,
    // the wanted level at which the law calls for help: lower means sooner. This is a
    // level rather than a multiplier, because "wanted 6" simply never happens.
    reinforceWanted: () => clamp(cur.helpAt, 1, 5),
    // the player
    playerDmg: base => base * cur.playerDmg,
    healRate: base => base * cur.healRate,
    pickup: base => base * cur.pickup,
    // the world
    senseRange: base => base * cur.sense,
    senseGain: () => cur.senseGain,
    price: base => Math.max(1, Math.round(base * cur.prices)),
    reward: base => Math.max(0, Math.round(base * cur.reward)),
    objectiveCount: base => Math.max(1, Math.round(base * cur.objective)),
    objectiveTime: base => Math.max(4, Math.round(base * cur.objectiveTime)),
    lawPressure: base => base * cur.lawPressure,
    assistRange: base => base * cur.assist,
    assistCone: () => 0.9 / Math.max(0.4, cur.assist)
  };
})();
// pick up where the player left off
if (settings && settings.difficulty) Difficulty.set(settings.difficulty, { save: false });
