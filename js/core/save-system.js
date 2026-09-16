/* ==========================================================================
   The Wild West - js/core/save-system.js
   Persistent progress: versioned snapshots in localStorage, three manual slots
   plus a rolling autosave, and a reader that never trusts what it finds.
   Provides:  Save, SAVE_SLOTS
   Expects:   state.js, weapons.js, rounds.js (startRound), mount.js, Mode, Bus
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
const SAVE_KEY = 'wildwest.save';
const SAVE_VERSION = 1;
const SAVE_SLOTS = ['auto', '1', '2', '3'];
const SAVE_SLOT_NAMES = { auto: 'AUTOSAVE', 1: 'SLOT 1', 2: 'SLOT 2', 3: 'SLOT 3' };

const Save = (() => {
  // localStorage itself can throw (private mode, blocked cookies, quota). Every
  // access goes through here so one hostile browser cannot break the game.
  function store() {
    try {
      const s = window.localStorage;
      if (!s) return null;
      return s;
    } catch (e) { return null; }
  }
  function keyFor(slot) { return SAVE_KEY + '.' + slot; }
  function backupKeyFor(slot) { return SAVE_KEY + '.' + slot + '.bak'; }
  function q2(v) { return Math.round(v * 100) / 100; }
  function q3(v) { return Math.round(v * 1000) / 1000; }

  // ---------- writing ----------
  function snapshot() {
    return {
      v: SAVE_VERSION,
      t: Date.now(),
      play: { dayTime: q3(dayTime), seconds: Math.max(0, Math.round(playtime)) },
      match: {
        round: roundNum, time: Math.round(roundT),
        outlaws: outlawPts, law: lawPts,
        kills: kills, total: totalKills, headshots: headshots, survived: survivedRounds,
        wanted: wanted, wantedT: Math.round(wantedT), revealed: !!sheriffRevealed
      },
      player: {
        x: q2(player.g.position.x), z: q2(player.g.position.z),
        yaw: q3(yaw), pitch: q3(pitch),
        hp: hp, mounted: !!mounted
      },
      horse: { x: q2(horse.g.position.x), z: q2(horse.g.position.z), rot: q3(horse.g.rotation.y) },
      wallet: { cash: cash },
      weapons: {
        cur: curWeapon,
        revolver: { owned: !!playerWeapons.revolver.owned, ammo: playerWeapons.revolver.ammo },
        rifle: { owned: !!playerWeapons.rifle.owned, ammo: playerWeapons.rifle.ammo }
      },
      upgrades: {
        mag: upgrades.mag, hp: upgrades.hp, reload: upgrades.reload,
        steady: upgrades.steady, rifle: upgrades.rifle
      },
      // Reserved for the mission and campaign layers: the flags are written by
      // mission rewards, and the running missions carry their own progress.
      // { chapter, flags, history, missions: [...] } - the mission layer's own shape,
      // spread rather than nested so the reader finds an array where it expects one
      story: Object.assign({ chapter: 1 }, Missions.snapshot()),
      // the record the law has on you outlives the round it was earned in
      law: Law.snapshot(),
      faction: { law: 0, outlaws: 0, townsfolk: 0 },
      inventory: {}
    };
  }
  function write(slot) {
    const s = store();
    if (!s) return false;
    try {
      // keep the previous contents as a fallback before overwriting: a save
      // taken in a broken moment should never be the only copy left
      const prev = s.getItem(keyFor(slot));
      if (prev) s.setItem(backupKeyFor(slot), prev);
      s.setItem(keyFor(slot), JSON.stringify(snapshot()));
      return true;
    } catch (e) {
      console.warn('[Save] could not write "' + slot + '" (' + (e && e.name) + ')');
      return false;
    }
  }

  // ---------- reading ----------
  // Nothing in a save file is trusted: every field is type checked, clamped to
  // the range the game can actually run with, and defaults fill anything the
  // file is missing. A tampered or half written file can therefore cost the
  // player progress but can never put the world into an impossible state.
  function nn(v, lo, hi, dflt) {
    const n = (typeof v === 'number' && isFinite(v)) ? v : dflt;
    return clamp(n, lo, hi);
  }
  function obj(v) { return (v && typeof v === 'object') ? v : {}; }
  function bool(v) { return v === true; }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.v !== SAVE_VERSION) return null;
    const p = obj(raw.player), m = obj(raw.match), w = obj(raw.weapons),
      wp = obj(w.revolver), wr = obj(w.rifle), u = obj(raw.upgrades),
      pl = obj(raw.play), h = obj(raw.horse), wl = obj(raw.wallet);
    const uHp = Math.round(nn(u.hp, 0, 3, 0));
    return {
      v: SAVE_VERSION,
      t: nn(raw.t, 0, Date.now() + 86400000, Date.now()),
      play: { dayTime: nn(pl.dayTime, 0, 1, 0.26), seconds: Math.round(nn(pl.seconds, 0, 1e7, 0)) },
      match: {
        round: Math.round(nn(m.round, 1, MAX_ROUNDS, 1)),
        time: nn(m.time, 5, ROUND_TIME, ROUND_TIME),
        outlaws: Math.round(nn(m.outlaws, 0, 99, 0)), law: Math.round(nn(m.law, 0, 99, 0)),
        kills: Math.round(nn(m.kills, 0, 1e6, 0)), total: Math.round(nn(m.total, 0, 1e6, 0)),
        headshots: Math.round(nn(m.headshots, 0, 1e6, 0)), survived: Math.round(nn(m.survived, 0, 1e6, 0)),
        wanted: Math.round(nn(m.wanted, 0, 5, 0)), wantedT: nn(m.wantedT, 0, 60, 0),
        revealed: bool(m.revealed)
      },
      player: {
        x: nn(p.x, -140, 140, 0), z: nn(p.z, -140, 140, 0),
        yaw: nn(p.yaw, -1e3, 1e3, 0), pitch: nn(p.pitch, -1.0, 1.15, 0.14),
        hp: Math.max(1, Math.round(nn(p.hp, 1, 5 + uHp, 5 + uHp))), mounted: bool(p.mounted)
      },
      horse: { x: nn(h.x, -140, 140, 3), z: nn(h.z, -140, 140, 1.5), rot: nn(h.rot, -1e3, 1e3, 2.5) },
      wallet: { cash: Math.round(nn(wl.cash, 0, 1e7, 0)) },
      weapons: {
        cur: w.cur === 'rifle' ? 'rifle' : 'revolver',
        revolver: { owned: true, ammo: Math.round(nn(wp.ammo, 0, 99, WEAPONS.revolver.mag)) },
        rifle: { owned: bool(wr.owned), ammo: Math.round(nn(wr.ammo, 0, 99, 0)) }
      },
      upgrades: {
        mag: Math.round(nn(u.mag, 0, 3, 0)), hp: uHp,
        reload: Math.round(nn(u.reload, 0, 2, 0)), steady: Math.round(nn(u.steady, 0, 2, 0)),
        rifle: Math.round(nn(u.rifle, 0, 1, 0))
      },
      // The story block (flags and the running missions) is handed straight back to
      // the mission layer, which type checks what it consumes. It is passed through
      // rather than rebuilt, because its shape belongs to that layer, not this one.
      story: (raw.story && typeof raw.story === 'object' && !Array.isArray(raw.story))
        ? {
          chapter: Math.round(nn(obj(raw.story).chapter, 1, 99, 1)),
          flags: (raw.story.flags && typeof raw.story.flags === 'object') ? raw.story.flags : {},
          missions: Array.isArray(raw.story.missions) ? raw.story.missions : []
        }
        : { chapter: 1, flags: {}, missions: [] },
      law: (raw.law && typeof raw.law === 'object' && !Array.isArray(raw.law)) ? raw.law : { heat: 0, bounty: 0, crimes: [], sent: [] }
    };
  }
  // returns null for "no save here"; a save that exists but cannot be read is
  // reported separately by status() so the UI can say so instead of lying
  function read(slot, rawIn) {
    const s = store();
    let raw = rawIn;
    if (raw === undefined) {
      if (!s) return null;
      try { raw = s.getItem(keyFor(slot)); } catch (e) { return null; }
    }
    if (!raw) return null;
    let parsed = null;
    try { parsed = JSON.parse(raw); }
    catch (e) { console.warn('[Save] slot "' + slot + '" is not valid JSON'); return null; }
    const data = normalize(parsed);
    if (!data) console.warn('[Save] slot "' + slot + '" is from another version or incomplete');
    return data;
  }
  // the main copy, falling back to the pre-overwrite backup if it is unreadable
  function load_data(slot) {
    const data = read(slot);
    if (data) return data;
    const s = store();
    if (!s) return null;
    let raw = null;
    try { raw = s.getItem(backupKeyFor(slot)); } catch (e) { return null; }
    if (!raw) return null;
    const backup = read(slot, raw);
    if (backup) console.warn('[Save] recovered slot "' + slot + '" from its backup');
    return backup;
  }
  function status(slot) {
    const s = store();
    if (!s) return 'unavailable';
    let raw = null;
    try { raw = s.getItem(keyFor(slot)); } catch (e) { return 'unavailable'; }
    if (raw && read(slot)) return 'ok';
    // the main copy is missing or unreadable: the pre-overwrite backup still
    // counts as a usable slot, and load() will prefer whatever is readable
    let backup = null;
    try { backup = s.getItem(backupKeyFor(slot)); } catch (e) { backup = null; }
    if (backup && read(slot, backup)) return 'ok';
    return (raw || backup) ? 'corrupt' : 'empty';
  }

  // ---------- applying ----------
  function apply(data, slot) {
    // Build a clean round first and stamp the saved progress over it: every
    // derived system (NPC respawn, spawn points, pickups, effects) then starts
    // from a state the game knows how to run.
    roundNum = data.match.round;
    outlawPts = data.match.outlaws;
    lawPts = data.match.law;
    kills = data.match.kills;
    totalKills = data.match.total;
    headshots = data.match.headshots;
    survivedRounds = data.match.survived;
    cash = data.wallet.cash;
    upgrades.mag = data.upgrades.mag;
    upgrades.hp = data.upgrades.hp;
    upgrades.reload = data.upgrades.reload;
    upgrades.steady = data.upgrades.steady;
    upgrades.rifle = data.upgrades.rifle;
    playerWeapons.revolver.owned = true;
    playerWeapons.rifle.owned = data.weapons.rifle.owned;
    curWeapon = (data.weapons.cur === 'rifle' && data.weapons.rifle.owned) ? 'rifle' : 'revolver';
    // hold the mission layer off while the world is rebuilt, then hand it the save
    Missions.suspend(true);
    startRound();
    // startRound just cleared the UI overlays; make sure the state machine agrees
    // before anything (like mounting) checks it
    Mode.set(MODE.PLAYING);
    // anything startRound resets has to be stamped *after* it, not before: the
    // wanted level, its timer and the sheriff tip all belong to the saved round
    wanted = data.match.wanted;
    wantedT = data.match.wantedT;
    sheriffRevealed = data.match.revealed;
    maxHp = maxHpNow();
    refreshHearts();
    hp = clamp(data.player.hp, 1, maxHp);
    yaw = data.player.yaw;
    pitch = clamp(data.player.pitch, -1.0, 1.15);
    roundT = data.match.time;
    dayTime = data.play.dayTime;
    playtime = data.play.seconds;
    // put the horse down first, then the player, then re-mount if that is how
    // the save was taken
    const hx = data.horse.x, hz = data.horse.z;
    horse.g.position.set(hx, heightAt(hx, hz), hz);
    horse.g.rotation.y = data.horse.rot;
    horse.speed = 0; horse.airY = 0;
    let px = data.player.x, pz = data.player.z;
    // The world is rebuilt as a fresh round, so a point that was clear when the
    // save was taken can now be inside a house. Look for the nearest clear spot
    // around it before giving up and using the town spawn.
    if (collide(px, pz, 0.5)) {
      const ring = [[1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6], [3, 0], [-3, 0], [0, 3], [0, -3],
        [3, 3], [-3, -3], [3, -3], [-3, 3], [5, 0], [-5, 0], [0, 5], [0, -5]];
      let found = false;
      for (let i = 0; i < ring.length && !found; i++) {
        const tx = clamp(data.player.x + ring[i][0], -140, 140);
        const tz = clamp(data.player.z + ring[i][1], -140, 140);
        if (!collide(tx, tz, 0.5)) { px = tx; pz = tz; found = true; }
      }
      if (!found) { px = 0; pz = 0; }
      console.warn('[Save] player position was blocked, moved to ' + px.toFixed(1) + ', ' + pz.toFixed(1));
    }
    player.g.position.set(px, heightAt(px, pz), pz);
    player.g.rotation.set(0, yaw, 0);
    if (data.player.mounted && !mounted) toggleMount();
    // per weapon ammo, clamped to what those weapons hold with the upgrades
    playerWeapons.revolver.ammo = clamp(data.weapons.revolver.ammo, 0, magFor('revolver'));
    playerWeapons.rifle.ammo = data.weapons.rifle.owned ? clamp(data.weapons.rifle.ammo, 0, magFor('rifle')) : 0;
    syncWeapon();
    drawWeapons();
    stam = maxStam; stamLock = false;
    clearFight();
    // missions last: their objectives re-point themselves at the world that was
    // just rebuilt, which is why they are restored instead of merely reloaded
    if (data.story) Missions.restore(data.story.missions ? data.story : { flags: data.story.flags });
    Law.restore(data.law);
    Missions.suspend(false);
    showObjective('GAME LOADED',
      'Round ' + roundNum + '  \u00b7  $' + cash + '  \u00b7  ' + (SAVE_SLOT_NAMES[slot] || 'save'), 3200);
    Bus.emit('save:loaded', data);
    return true;
  }
  function load(slot) {
    const data = load_data(slot);
    if (!data) return false;
    apply(data, slot);
    feed('Loaded ' + (SAVE_SLOT_NAMES[slot] || slot) + ' \u2014 round ' + roundNum + ', $' + cash, 'good');
    return true;
  }

  // ---------- slots ----------
  function autosave() {
    // only ever overwrite the autosave from a live, loaded round: a snapshot
    // taken on the start screen would be an empty world
    if (matchState !== 'play' && Mode.current() !== MODE.OVER) return false;
    return write('auto');
  }
  function clear(slot) {
    const s = store();
    if (!s) return false;
    try {
      s.removeItem(keyFor(slot));
      s.removeItem(backupKeyFor(slot));
      return true;
    } catch (e) { return false; }
  }
  function info(slot) {
    const st = status(slot);
    if (st !== 'ok') return { slot, name: SAVE_SLOT_NAMES[slot] || slot, state: st };
    const d = load_data(slot);
    if (!d) return { slot, name: SAVE_SLOT_NAMES[slot] || slot, state: 'corrupt' };
    const hh = String(Math.floor((d.play.dayTime * 24 + 6) % 24)).padStart(2, '0');
    const when = new Date(d.t);
    const mins = Math.floor(d.play.seconds / 60);
    // short stamp: the year is noise on a slot that was written today
    const pad = n => String(n).padStart(2, '0');
    const sameYear = when.getFullYear() === new Date().getFullYear();
    const dateStr = sameYear ? (when.getMonth() + 1) + '/' + when.getDate()
      : (when.getMonth() + 1) + '/' + when.getDate() + '/' + String(when.getFullYear()).slice(2);
    return {
      slot, name: SAVE_SLOT_NAMES[slot] || slot, state: 'ok', t: d.t,
      round: d.match.round, cash: d.wallet.cash, dayTime: d.play.dayTime, time: hh + ':00',
      played: mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + 'm',
      stamp: dateStr + ' ' + pad(when.getHours()) + ':' + pad(when.getMinutes()),
      hp: d.player.hp, wanted: d.match.wanted,
      // true when the live copy was unreadable and the backup had to stand in
      recovered: !read(slot)
    };
  }
  function all() { return SAVE_SLOTS.map(info); }
  // the most recent readable slot, for CONTINUE on the title screen
  function newest() {
    let best = null;
    SAVE_SLOTS.forEach(slot => {
      const inf = info(slot);
      if (inf.state !== 'ok') return;
      if (!best || inf.t > best.t) best = inf;
    });
    return best;
  }
  return { write, load, autosave, clear, info, all, newest, status, snapshot, normalize, apply, slots: SAVE_SLOTS };
})();
