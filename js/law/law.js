/* ==========================================================================
   The Wild West - js/law/law.js
   The wanted system proper: what a crime is worth, how much of it the law knows
   about, what it sends, and what is on your head afterwards.

   Heat is the record of evidence, not a timer. A crime only adds heat if someone
   can see it happen (that is Witnesses' job), the amount depends on the crime and
   on how many people saw it, and the wanted level is derived from the running
   total. That is why shooting a man in an empty canyon costs nothing while doing
   it in the middle of Main Street turns the county out.

   Provides:  Law, CRIMES, HEAT_LEVELS
   Expects:   npcs, player, Perceive, Squads, Difficulty, feed
   ========================================================================== */
"use strict";
const CRIMES = {
  gunfire: { heat: 0.4, label: 'public gunfire' },
  menace: { heat: 0.3, label: 'threatening a townsfolk' },
  assault: { heat: 0.8, label: 'assault' },
  theft: { heat: 1.0, label: 'theft' },
  property: { heat: 0.7, label: 'property damage' },
  robbery: { heat: 1.6, label: 'armed robbery' },
  horseTheft: { heat: 1.2, label: 'horse theft' },
  murder: { heat: 2.8, label: 'murder' },
  lawman: { heat: 4.2, label: 'killing a lawman' }
};
// Crimes that are violence against a person rather than noise, vandalism or theft. These
// are what turn a confrontation into a gunfight, whatever the wanted level happens to be.
const VIOLENT = { assault: 1, murder: 1, lawman: 1, robbery: 1 };
// heat needed for each wanted level: 0..5
const HEAT_LEVELS = [0, 0.9, 2.0, 4.4, 8.0, 13.0];
// what the law sends at each level. Counts are men, not multipliers, because the
// point of the escalation is that you can see it coming.
// How much of the standing posse a wanted level commits. Nobody is created: this is a
// share of the lawmen that already exist, which is why the town never grows.
const RESPONSE = [
  { level: 0, commit: 0, shoot: false, label: 'Nothing' },
  // The law does not shoot a man for making noise. One or two deputies come and stand in
  // front of you with their guns out; the shooting starts when the county decides you are
  // worth a fight, or the moment you draw blood.
  { level: 1, commit: 1, shoot: false, label: 'A deputy is asking around' },
  { level: 2, commit: 2, shoot: false, label: 'A pair of deputies is on you' },
  { level: 3, commit: 4, shoot: true, label: 'The sheriff has ridden out' },
  { level: 4, commit: 6, shoot: true, label: 'A search party is out' },
  { level: 5, commit: 99, shoot: true, label: 'The whole posse is hunting you' }
];

const Law = (() => {
  let heat = 0;              // what the law can prove right now
  let ledger = 0;            // the price on your head, which never goes down
  let bounty = 0;
  let crimes = [];                  // the record: { kind, label, x, z, witnesses, t }
  let responseSent = [];            // which levels have already been answered
  let callT = 0;
  let seenT = 0;
  let violentUntil = 0;      // while the record includes blood, the law shoots on sight

  function levelFor(h) {
    let lv = 0;
    for (let i = 1; i < HEAT_LEVELS.length; i++) if (h >= HEAT_LEVELS[i]) lv = i;
    return lv;
  }
  function syncWanted() {
    const lv = levelFor(heat);
    if (lv === wanted) return false;
    const up = lv > wanted;
    wanted = lv;
    // a fresh offence buys the law more time to find you; cooling off is the slow road
    wantedT = Difficulty.lawPressure(up ? 16 : 10);
    Bus.emit('law:wanted', { level: lv, heat, up });
    if (up) {
      if (lv === 5) feed('A price of $' + bounty + ' on your head \u2014 they are sending hunters', 'bad');
      else feed('WANTED ' + lv + ' \u2014 the law is on you', 'bad');
    } else if (lv === 0) {
      feed('The law has lost your trail', 'good');
    }
    return true;
  }
  // How much of this crime reaches the law: one witness is enough, and a crowd
  // makes it worse, but a lynch mob has the same story as five men do.
  function severity(kind, witnessCount) {
    const c = CRIMES[kind] || CRIMES.menace;
    const crowd = clamp(0.6 + 0.4 * Math.min(3, witnessCount), 0.6, 1.8);
    return c.heat * crowd;
  }
  // `witnesses` is a count supplied by the witness layer; without one nothing is
  // reported and nothing is added.
  function crime(kind, opts) {
    const o = opts || {};
    const n = o.witnesses || 0;
    if (!n) return 0;
    const c = CRIMES[kind] || CRIMES.menace;
    const amount = severity(kind, n) * Difficulty.lawPressure(1);
    heat = Math.min(22, heat + amount);
    bounty = Math.max(ledger, Math.round(heat * 22));
    ledger = Math.max(ledger, bounty);
    crimes.push({ kind, label: c.label, x: o.x || 0, z: o.z || 0, witnesses: n, t: clock.elapsedTime });
    // shooting a man is not the same as shooting a wall: from here the law is hunting, not
    // asking questions, and it stays that way while the offence is fresh
    if (VIOLENT[kind]) violentUntil = clock.elapsedTime + 60;
    if (crimes.length > 24) crimes.shift();
    Bus.emit('law:crime', { kind, label: c.label, heat, amount, witnesses: n, x: o.x, z: o.z });
    if (syncWanted()) { /* the level moved: escalation happens in update() */ }
    return amount;
  }
  // A witness got through: heat lands without a body attached (the difference is
  // only how it was reported)
  function report(kind, x, z, witnesses) { return crime(kind, { x, z, witnesses: witnesses || 1 }); }
  // Someone the law believes: a witness who talks, or a man who was shot at
  function tip(x, z, text) {
    Bus.emit('law:tip', { x, z });
    if (text) feed(text, 'bad');
  }

  function responseFor(level) { return RESPONSE[clamp(level, 0, 5)]; }
  // Has blood been drawn recently? This is what the law leans on when deciding to shoot.
  function violentNow() { return clock.elapsedTime < violentUntil; }
  // May the law open fire at the current level? Levels 1 and 2 are a confrontation, not a
  // firefight, which is what the labels have always promised.
  function allowedToShoot() { return !!responseFor(wanted).shoot; }
  // May this particular man fire? The county's rules, plus self defence: a man who has been
  // shot at does not need permission.
  function mayOpenFire(n) {
    if (n && (n.hitT || 0) > 0) return true;            // self defence
    if (clock.elapsedTime < violentUntil) return true;  // you have already drawn blood
    return allowedToShoot();
  }

  // Send what this level of heat deserves, once per level: a posse that has already
  // been sent is not sent again, and never more men than the town can hold.
  // The law only ever sends the men it already has. A rising wanted level commits more of
  // the standing posse, and the count is reported rather than conjured, so the number of
  // lawmen in the world stays exactly what the difficulty says.
  function escalate() {
    const r = responseFor(wanted);
    if (!r || wanted === 0) return 0;
    if (responseSent.includes(wanted)) return 0;
    responseSent.push(wanted);
    const living = npcs.filter(n => !n.dead && !n.civil);
    const committed = Math.min(r.commit, living.length);
    living.forEach(n => {
      // they come in knowing roughly where to look, which is what makes heat frightening
      if (typeof Witnesses === 'object') {
        const lead = Witnesses.lastLead ? Witnesses.lastLead() : null;
        if (lead) n.lastKnown = { x: lead.x, z: lead.z, age: 0 };
      }
      n.susp = Math.max(n.susp || 0, 0.9);
      n.reactT = Math.max(n.reactT || 0, Difficulty.reaction(0.4));
    });
    if (committed) {
      Bus.emit('law:response', { level: wanted, sent: committed, of: living.length, response: r, label: r.label });
      feed(r.label + ' \u2014 ' + committed + ' of ' + living.length + ' still standing', 'bad');
    }
    return committed;
  }

  function update(dt) {
    callT -= dt; seenT += dt;
    // The record cools when nobody is actually *after* you. A deputy standing in front of
    // you with his gun out because you fired into the dirt is not a reason for the county to
    // keep a standing price on your head.
    const watched = npcs.some(n => !n.civil && !n.dead && n.sees && (n.susp || 0) >= 0.9);
    if (!watched) heat = Math.max(0, heat - dt * Difficulty.lawPressure(0.25));
    const before = wanted;
    syncWanted();
    if (wanted < before) responseSent = responseSent.filter(l => l <= wanted);
    if (wanted > 0 && callT <= 0) { callT = 2.5; escalate(); }
    // the price on your head tracks the record, but never falls below the books
    bounty = Math.max(ledger, Math.round(heat * 22));
    ledger = Math.max(ledger, bounty);
  }

  // A new round is a new day in town. The manhunt restarts - nobody is hunting a man for
  // something they cannot prove today - but the bounty on the books stays, so the county
  // remembers what you did even after the trail goes cold. Without this the law opened
  // fire the instant a round began, because the wanted level was re-derived from the old
  // record on the first frame.
  function beginRound() {
    heat = Math.min(heat * 0.2, 0.85);
    violentUntil = 0;
    responseSent = [];
    wanted = 0;
    wantedT = 0;
    Bus.emit('law:newDay', { bounty: ledger, heat: +heat.toFixed(2) });
  }
  // Forget which levels have already been answered, without touching the record:
  // used when the trail goes cold and the same level has to be able to answer again.
  function resetResponses() { responseSent = []; }
  function clearRecord() {
    heat = 0; bounty = 0; crimes = []; responseSent = []; violentUntil = 0;
    wanted = 0; wantedT = 0;
  }
  // what the law knows about right now, for the HUD and for tests
  function status() {
    return {
      heat: +heat.toFixed(2), bounty, wanted, level: levelFor(heat),
      crimes: crimes.length, response: responseFor(wanted),
      following: npcs.filter(n => !n.civil && !n.dead && (n.susp || 0) >= 0.9).length
    };
  }
  function snapshot() { return { heat, bounty, ledger, crimes: crimes.slice(-12), sent: responseSent.slice() }; }
  function restore(data) {
    if (!data || typeof data !== 'object') return false;
    heat = clamp(typeof data.heat === 'number' ? data.heat : 0, 0, 22);
    bounty = clamp(Math.round(typeof data.bounty === 'number' ? data.bounty : heat * 22), 0, 100000);
    ledger = clamp(Math.round(typeof data.ledger === 'number' ? data.ledger : bounty), 0, 100000);
    crimes = Array.isArray(data.crimes) ? data.crimes.slice(-12) : [];
    responseSent = Array.isArray(data.sent) ? data.sent.filter(l => typeof l === 'number') : [];
    syncWanted();
    return true;
  }

  return { CRIMES, VIOLENT, crime, report, tip, update, escalate, responseFor, allowedToShoot, mayOpenFire, violentNow, status, clearRecord, resetResponses, beginRound, snapshot, restore, levelFor,
    get heat() { return heat; },
    get bounty() { return bounty; },
    get ledger() { return ledger; },
    get crimeCount() { return crimes.length; } };
})();
