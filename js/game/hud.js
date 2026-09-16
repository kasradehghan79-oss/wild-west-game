/* ==========================================================================
   The Wild West - js/game/hud.js
   The heads up display: the vitals, ammo, money and score readouts, the low
   health and damage overlays, the price on your head, and the mission tracker.
   Provides:  updateHUD, updateMissionTracker, missionSig
   Expects:   dom.js (the element handles), state.js, Missions, Law, Difficulty
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
function updateHUD(dt) {
  for (let i = 0; i < heartsEl.children.length; i++) {
    const frac = clamp(hp - i, 0, 1);
    const cell = heartsEl.children[i];
    cell.firstChild.style.width = (frac * 100) + '%';
    cell.classList.toggle('on', frac > 0);
  }
  stamFill.style.width = (stam / maxStam * 100) + '%';
  stamFill.style.background = stamLock ? 'linear-gradient(180deg,#c98a4a,#8a4a20)' : 'linear-gradient(180deg,#8fd96a,#3f8f30)';
  if (ammoCountEl.textContent !== String(ammo)) ammoCountEl.textContent = ammo;
  ammoCountEl.classList.toggle('empty', ammo === 0);
  ammoNameEl.textContent = WEAPONS[curWeapon].name;
  reloadBar.classList.toggle('on', reloading);
  if (reloading) reloadFill.style.width = (clamp(reloadT / reloadDur, 0, 1) * 100) + '%';
  const stars = wanted > 0 ? '\u2605'.repeat(wanted) + '\u2606'.repeat(5 - wanted) : '\u2606\u2606\u2606\u2606\u2606';
  if (wantedEl.__s !== stars) { wantedEl.innerHTML = '<i>' + stars.slice(0, wanted) + '</i>' + stars.slice(wanted); wantedEl.__s = stars; }
  cashEl.textContent = '$' + cash;
  pOutEl.textContent = outlawPts;
  pLawEl.textContent = lawPts;
  scoreSub.textContent = matchState === 'play' ? 'ROUND ' + roundNum + '/' + MAX_ROUNDS : matchState === 'over' ? 'ROUND OVER' : 'READY';
  const secs = Math.max(0, Math.ceil(roundT));
  if (scoreTime.textContent !== String(secs)) scoreTime.textContent = secs;
  scoreTime.classList.toggle('low', roundT <= 10 && matchState === 'play');
  const hh = String(Math.floor((dayTime * 24 + 6) % 24)).padStart(2, '0');
  let st = (mounted ? 'On horse' : 'On foot') + '  \u00b7  Kills ' + kills + '  \u00b7  ' + hh + ':00';
  if (WEAPONS[curWeapon].name === 'WINCHESTER') st += '  \u00b7  Rifle';
    // key prompts only make sense with a keyboard; the touch build has the pill
    if (nearStore()) st += isTouch ? '  \u00b7  Store open' : '  \u00b7  [F] GENERAL STORE';
    else if (!mounted && player.g.position.distanceTo(horse.g.position) < 3.8) st += isTouch ? '  \u00b7  Mount' : '  \u00b7  [E] Mount';
  statusEl.textContent = st;
  const spread = 1 + bloom * 0.7 + (runT > 0 ? 0.35 : 0);
  crossEl.style.opacity = (matchState === 'play' && !playerDead) ? (0.3 + aimAmt * 0.7) : 0;
  crossEl.style.transform = 'translate(-50%,-50%) scale(' + spread.toFixed(2) + ')';
  const lowP = !playerDead && hp <= maxHp * 0.34 && matchState === 'play';
  lowEl.style.opacity = lowP ? (0.45 + Math.sin(clock.elapsedTime * 3.4) * 0.25) : 0;
  dmgEl.style.opacity = dmgFlash * 0.8;
  // the price on your head, only while there is one
  if (bountyEl) {
    const b = Law.bounty;
    if (b > 0) { bountyEl.textContent = 'BOUNTY $' + b; bountyEl.classList.add('on'); }
    else if (bountyEl.classList.contains('on')) { bountyEl.classList.remove('on'); bountyEl.textContent = ''; }
  }
  updateMissionTracker();
}

// The mission tracker: name plus the live objectives, with a tick when one is done.
// It only touches the DOM when the text actually changes, because this runs every
// frame and rebuilding three spans sixty times a second is pure waste.
let missionSig = '';
function updateMissionTracker() {
  if (!missionEl) return;
  const list = Missions.hud();
  if (!list.length) {
    if (missionSig !== '') { missionSig = ''; missionEl.classList.remove('on'); missionListEl.innerHTML = ''; }
    return;
  }
  const m = list[0];
  // A branching objective is a choice, so the tracker shows the roads themselves rather
  // than the group: "Break the ambush / pick one" tells a player nothing.
  const flatten = (objs, prefix) => {
    const out = [];
    objs.forEach(o => {
      if (o.children && o.children.length) {
        o.children.forEach(c => out.push({
          label: prefix + (c.optional ? 'Optional: ' : '') + c.label, detail: c.detail, state: c.state
        }));
      } else {
        out.push({ label: prefix + (o.optional ? 'Optional: ' : '') + o.label, detail: o.detail, state: o.state });
      }
    });
    return out;
  };
  const lines = flatten(m.objectives, '').slice(0, 5);
  // side jobs ride along one line each, prefixed with the job's name so it is obvious
  // that a second thing is asking for something
  list.slice(1).forEach(s => {
    flatten(s.objectives.filter(o => o.state !== 'done'), s.name + ': ').forEach(l => lines.push(l));
  });
  const kindLabel = m.kind === 'main' ? 'MISSION' : 'SIDE JOB';
  const sig = kindLabel + '|' + m.name + '|' + lines.map(o => o.label + o.detail + o.state).join('|');
  if (sig === missionSig) return;
  missionSig = sig;
  missionEl.classList.add('on');
  if (missionLabelEl) missionLabelEl.textContent = kindLabel;
  missionNameEl.textContent = m.name.toUpperCase();
  missionListEl.innerHTML = '';
  lines.slice(0, 5).forEach(o => {
    const d = document.createElement('div');
    d.className = 'mline ' + (o.state === 'done' ? 'done' : o.state === 'failed' ? 'failed' : '');
    d.textContent = o.label + (o.detail ? '  ' + o.detail : '');
    missionListEl.appendChild(d);
  });
}

