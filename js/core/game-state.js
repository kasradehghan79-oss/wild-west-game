/* ==========================================================================
   The Wild West - js/core/game-state.js
   The one place that decides whether gameplay is running, and the named states
   the menus, dialogue and mission screens move between.
   Provides:  Mode
   Expects:   state.js (paused / shopOpen / matchState), Bus
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// The full set of states, including the ones the mission, dialogue and
// inventory systems will move to in later phases, so those systems have a name
// to ask for instead of inventing their own boolean.
const MODE = {
  BOOT: 'boot',
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  SHOP: 'shop',
  DIALOGUE: 'dialogue',
  INVENTORY: 'inventory',
  MISSION_DONE: 'missionComplete',
  MISSION_FAILED: 'missionFailed',
  DEAD: 'dead',
  OVER: 'over'
};
const Mode = (() => {
  let cur = MODE.BOOT;
  function set(next) {
    if (next === cur) return cur;
    const prev = cur;
    cur = next;
    // Drive the flags the older systems still read directly. They used to be
    // written from four different call sites, which is how "NPCs keep walking
    // around while the pause menu is open" happens; from here there is exactly
    // one author.
    paused = next === MODE.PAUSED || next === MODE.DIALOGUE || next === MODE.INVENTORY;
    shopOpen = next === MODE.SHOP;
    Bus.emit('mode:change', { from: prev, to: next });
    return cur;
  }
  // What the frame loop used to spell out inline: the match is live and no UI
  // has taken it over. Everything gameplay facing asks this instead.
  function live() {
    return matchState === 'play' && !paused && !shopOpen && !playerDead;
  }
  function frozen() { return !live(); }
  function is(m) { return cur === m; }
  function current() { return cur; }
  return { S: MODE, set, live, frozen, is, current };
})();
