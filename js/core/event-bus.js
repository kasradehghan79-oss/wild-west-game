/* ==========================================================================
   The Wild West - js/core/event-bus.js
   A tiny publish/subscribe bus so systems can react to each other without
   knowing each other.
   Provides:  Bus
   Expects:   - (no dependencies, loads early)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// Missions, the law system and the audio director all need to know about things
// owned by other systems - a kill, a gunshot, a new wanted level - without
// reaching into them. One bus keeps those edges one-directional: the emitter
// never learns who is listening, and a listener that throws can never take the
// frame down with it.
const Bus = (() => {
  const map = new Map();
  function on(evt, fn) {
    if (typeof fn !== 'function') return () => {};
    let list = map.get(evt);
    if (!list) { list = []; map.set(evt, list); }
    list.push(fn);
    return () => off(evt, fn);
  }
  function off(evt, fn) {
    const list = map.get(evt);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
  function once(evt, fn) {
    const un = on(evt, (...args) => { un(); fn(...args); });
    return un;
  }
  function emit(evt, payload) {
    const list = map.get(evt);
    if (!list || !list.length) return;
    // iterate a copy: a handler is allowed to unsubscribe itself while running
    const snapshot = list.slice();
    for (let i = 0; i < snapshot.length; i++) {
      try { snapshot[i](payload); }
      catch (e) { console.error('[Bus] listener for "' + evt + '" threw:', e); }
    }
  }
  function clear(evt) { if (evt === undefined) map.clear(); else map.delete(evt); }
  // how many listeners a channel has, for the debug tools
  function count(evt) { const l = map.get(evt); return l ? l.length : 0; }
  return { on, off, once, emit, clear, count };
})();
