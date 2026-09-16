/* ==========================================================================
   The Wild West - js/game/state.js
   Match state: health, stamina, score, wanted level, and the HUD feedback helpers.
   Provides:  keys, yaw, pitch, hp, feed, hurtPlayer, addCash, refreshHearts
   Expects:   dom.js, Sound (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
const keys = {};
let yaw = 0, pitch = 0.14, locked = false, mounted = false, kills = 0;
let lastShot = 0, lastDry = 0, recoilKick = 0, bloom = 0, aiming = false, aimAmt = 0;
let playerFireT = 0, fireTarget = null, shooting = false;
let playerDead = false, dmgFlash = 0, zoneT = 0, sinceDmg = 99, hurtFrom = null;
let stam = 100, maxStam = 100, stamLock = false;
let reloading = false, reloadT = 0;
let wanted = 0, wantedT = 0, wantedKills = 0, sheriffRevealed = false;
let outlawPts = 0, lawPts = 0, roundNum = 1, roundT = 60;
let matchState = 'intro', paused = false, shopOpen = false;
// seconds since the player last fired: how long the muzzle flash keeps giving him away
let playerShotT = 0;
// when public gunfire last opened a case: it is rate limited, so it has to be declared
let lastGunCrime = -99;
let cash = 0, shake = 0, runT = 0, vy = 0, grounded = true, gallopT = 0;
let totalKills = 0, headshots = 0, survivedRounds = 0, hp = 5;
// wall clock seconds actually played, kept for the save screen
let playtime = 0;
const WIN_PTS = 3, MAX_ROUNDS = 5, ROUND_TIME = 60;
const GRAVITY = 20, JUMP_V = 6.4;

function addShake(a) { shake = Math.min(1.2, shake + a); }
function feed(text, cls) {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = text;
  feedEl.appendChild(d);
  while (feedEl.children.length > 5) feedEl.removeChild(feedEl.firstChild);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 4200);
}
function damageNumber(pos, text, cls) {
  if (settings.quality === 0) return;
  const v = pos.clone().project(camera);
  if (v.z > 1) return;
  const b = document.createElement('b');
  b.textContent = text;
  if (cls) b.className = cls;
  b.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px';
  b.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
  dmgNumsEl.appendChild(b);
  while (dmgNumsEl.children.length > 22) dmgNumsEl.removeChild(dmgNumsEl.firstChild);
  setTimeout(() => { if (b.parentNode) b.parentNode.removeChild(b); }, 880);
}
function hitmark(kind) {
  hitEl.className = 'hit ' + (kind || '');
  setTimeout(() => { hitEl.className = ''; }, 230);
}
function showObjective(title, sub, ms) {
  objTitle.textContent = title;
  objSub.textContent = sub || '';
  objEl.classList.add('show');
  clearTimeout(showObjective._t);
  showObjective._t = setTimeout(() => objEl.classList.remove('show'), ms || 3400);
}
function showRoundEnd(title, sub) { reTitle.textContent = title; reSub.textContent = sub; reEl.classList.add('show'); }

function maxHpNow() { return 5 + upgrades.hp; }
function refreshHearts() {
  while (heartsEl.children.length < maxHp) {
    const i = document.createElement('i');
    i.appendChild(document.createElement('u'));
    heartsEl.appendChild(i);
  }
  while (heartsEl.children.length > maxHp) heartsEl.removeChild(heartsEl.lastChild);
}
refreshHearts();

function hurtPlayer(dmg, from) {
  if (playerDead || matchState !== 'play') return;
  hp = Math.max(0, hp - (dmg || 1));
  dmgFlash = Math.min(1, dmgFlash + 0.55 + (dmg || 1) * 0.25);
  sinceDmg = 0;
  addShake(0.22 + (dmg || 1) * 0.16);
  if (from) hurtFrom = { x: from.g.position.x, z: from.g.position.z };
  Sound.hurt();
  Bus.emit('player:hurt', { dmg: dmg || 1, from: from || null, hp: hp });
  if (hp <= 0) {
    playerDead = true;
    player.fall = 0;
    if (mounted) { mounted = false; showPlayerLegs(true); }
    Sound.die();
    Bus.emit('player:died', { kills: kills, headshots: headshots, cash: cash });
    deadTitle.textContent = 'YOU DIED';
    deadSub.textContent = 'tap to continue';
    deadStat.textContent = 'Kills ' + kills + '  \u00b7  Headshots ' + headshots + '  \u00b7  Cash $' + cash;
    deadEl.classList.add('show');
    endRound('law', 'dead');
    Mode.set(MODE.DEAD);
  }
}
function addCash(n, pos) {
  cash = Math.max(0, cash + n);
  if (pos) damageNumber(pos.clone().add(new THREE.Vector3(0, 1.6, 0)), (n > 0 ? '+$' : '-$') + Math.abs(n), 'money');
}

