/* ==========================================================================
   The Wild West - js/game/save-ui.js
   The save / load screen: slot rows, the pause menu entries and CONTINUE.
   Provides:  openSaves, closeSaves, refreshSaves, refreshContinue, continueGame
   Expects:   Save, dom.js, state.js, Mode, Sound
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- save / load screen ----------
function slotLine(inf) {
  if (inf.state === 'ok') {
    // one line, always: the row is a fixed height in a scrollable list
    return 'Round ' + inf.round + '  \u00b7  $' + inf.cash + '  \u00b7  ' + inf.time +
      (inf.played === '0m' ? '' : '  \u00b7  played ' + inf.played) +
      (inf.wanted > 0 ? '  \u00b7  wanted ' + inf.wanted : '') + '  \u00b7  ' + inf.stamp +
      (inf.recovered ? '  \u00b7  recovered from backup' : '');
  }
  if (inf.state === 'corrupt') return 'unreadable \u2014 saving over it will clear the slot';
  if (inf.state === 'unavailable') return 'this browser is not letting the game use storage';
  return 'empty';
}
function smallBtn(label, disabled, fn) {
  const b = document.createElement('button');
  b.textContent = label;
  b.disabled = !!disabled;
  b.addEventListener('click', e => { e.stopPropagation(); if (!b.disabled) fn(); });
  return b;
}
function refreshSaves() {
  if (!saveSlotsEl) return;
  saveSlotsEl.innerHTML = '';
  Save.all().forEach(inf => {
    const row = document.createElement('div');
    row.className = 'item slot' + (inf.state === 'ok' ? '' : ' empty');
    const nm = document.createElement('div');
    nm.className = 'nm';
    const b = document.createElement('b');
    b.textContent = inf.name;
    const small = document.createElement('small');
    small.textContent = slotLine(inf);
    nm.appendChild(b); nm.appendChild(small);
    const btns = document.createElement('div');
    btns.className = 'sbtns';
    // the autosave is the game's own slot: readable and loadable, never manual
    if (inf.slot !== 'auto') btns.appendChild(smallBtn('SAVE', inf.state === 'unavailable', () => writeSlot(inf.slot)));
    btns.appendChild(smallBtn('LOAD', inf.state !== 'ok', () => loadSlot(inf.slot)));
    btns.appendChild(smallBtn('CLEAR', inf.state === 'empty' || inf.state === 'unavailable', () => clearSlot(inf.slot)));
    row.appendChild(nm); row.appendChild(btns);
    saveSlotsEl.appendChild(row);
  });
}
function writeSlot(slot) {
  if (Save.write(slot)) feed('Saved ' + (SAVE_SLOT_NAMES[slot] || slot) + ' \u2014 round ' + roundNum + ', $' + cash, 'good');
  else feed('Could not write that slot', 'bad');
  refreshSaves();
  refreshContinue();
}
function clearSlot(slot) {
  Save.clear(slot);
  refreshSaves();
  refreshContinue();
  feed('Cleared ' + (SAVE_SLOT_NAMES[slot] || slot), '');
}
function loadSlot(slot) {
  const fromMenu = startEl.classList.contains('show');
  // try the read first: a failed load must leave the player exactly where they
  // were, with the menu still up, instead of dropping them into a dead screen
  if (!Save.load(slot)) {
    feed('That save could not be read', 'bad');
    refreshSaves();
    return;
  }
  if (fromMenu) {
    // the load has already put the match into play, so finish what PLAY does:
    // start the audio, drop the title screen and take the pointer back
    Sound.resume();
    Sound.ambientStart();
    Sound.musicStart();
    startEl.classList.remove('show');
    if (!isTouch) requestLock();
  }
  closeSaves();
  refreshContinue();
}
function openSaves() {
  if (!savesEl || shopOpen) return;
  // a running match freezes behind the panel; on the title screen there is
  // nothing to freeze yet
  if (matchState === 'play') {
    if (!paused) setPaused(true);
    Mode.set(MODE.PAUSED);
  }
  if (savesSubEl) savesSubEl.textContent = 'Autosave writes at every round boundary \u00b7 three manual slots' +
    (matchState === 'play' ? ' \u00b7 the match is paused while this is open' : '');
  refreshSaves();
  savesEl.classList.add('show');
}
function closeSaves() {
  if (!savesEl) return;
  savesEl.classList.remove('show');
  // back to the pause menu if the match was running and is still frozen; a load
  // has already put us back in play, and then there is nothing to reopen
  if (Mode.is(MODE.PAUSED) && !playerDead) pauseEl.classList.add('show');
  else if (matchState === 'intro') Mode.set(MODE.MENU);
}
// CONTINUE only exists while a readable save does
function refreshContinue() {
  if (!continueBtn) return;
  const best = Save.newest();
  continueBtn.classList.toggle('on', !!best);
  if (best) continueBtn.textContent = 'CONTINUE \u00b7 ROUND ' + best.round;
}
function continueGame() {
  const best = Save.newest();
  if (!best) { refreshContinue(); return; }
  loadSlot(best.slot);
}
if (pauseSaveBtn) pauseSaveBtn.addEventListener('click', e => { e.stopPropagation(); openSaves(); });
if (pauseLoadBtn) pauseLoadBtn.addEventListener('click', e => { e.stopPropagation(); openSaves(); });
if (startLoadBtn) startLoadBtn.addEventListener('click', e => { e.stopPropagation(); openSaves(); });
if (savesCloseEl) savesCloseEl.addEventListener('click', e => { e.stopPropagation(); closeSaves(); });
if (continueBtn) continueBtn.addEventListener('click', e => { e.stopPropagation(); continueGame(); });
// a save can be written from the pause menu and read from the title screen, so
// the button state has to be re-derived at load and whenever a slot changes
refreshContinue();
Bus.on('save:loaded', refreshContinue);
Bus.on('round:end', () => { if (!savesEl.classList.contains('show')) refreshContinue(); });
