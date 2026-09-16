/* ==========================================================================
   The Wild West - js/game/dom.js
   Every DOM handle the HUD and menus need, resolved once here.
   Provides:  the *El handles and the minimap context
   Expects:   the markup in index.html (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// =====================================================================
//  GAME STATE + HUD REFS
// =====================================================================
const statusEl = document.getElementById('status');
const helpText = document.getElementById('helptext');
const dmgEl = document.getElementById('dmg');
const lowEl = document.getElementById('lowhp');
const deadEl = document.getElementById('dead');
const deadTitle = document.getElementById('deadTitle');
const deadSub = document.getElementById('deadSub');
const deadStat = document.getElementById('deadStat');
const pOutEl = document.getElementById('pOut');
const pLawEl = document.getElementById('pLaw');
const scoreSub = document.getElementById('scoreSub');
const scoreTime = document.getElementById('scoreTime');
const cashEl = document.getElementById('cash');
const wantedEl = document.getElementById('wanted');
const heartsEl = document.getElementById('hearts');
const stamFill = document.getElementById('stamfill');
const gaitEl = document.getElementById('gait');
const ammoCountEl = document.getElementById('ammoCount');
const ammoNameEl = document.getElementById('ammoName');
const reloadBar = document.getElementById('reloadBar');
const reloadFill = document.getElementById('reloadFill');
const crossEl = document.getElementById('crosshair');
const hitEl = document.getElementById('hitmarker');
const dmgNumsEl = document.getElementById('dmgNums');
const feedEl = document.getElementById('killfeed');
const objEl = document.getElementById('objective');
const objTitle = document.getElementById('objTitle');
const objSub = document.getElementById('objSub');
const reEl = document.getElementById('roundend');
const reTitle = document.getElementById('reTitle');
const reSub = document.getElementById('reSub');
const startEl = document.getElementById('start');
const pauseEl = document.getElementById('pause');
const shopEl = document.getElementById('shop');
const shopItemsEl = document.getElementById('shopItems');
const shopCashEl = document.getElementById('shopCash');
// save / load surfaces
const savesEl = document.getElementById('saves');
const saveSlotsEl = document.getElementById('saveSlots');
const savesSubEl = document.getElementById('savesSub');
const savesCloseEl = document.getElementById('savesClose');
const continueBtn = document.getElementById('continueBtn');
const startLoadBtn = document.getElementById('startLoadBtn');
const pauseSaveBtn = document.getElementById('pauseSaveBtn');
const pauseLoadBtn = document.getElementById('pauseLoadBtn');
// mission tracker
const missionEl = document.getElementById('mission');
const missionLabelEl = document.getElementById('missionLabel');
const missionNameEl = document.getElementById('missionName');
// price on the player's head
const bountyEl = document.getElementById('bounty');
const missionListEl = document.getElementById('missionList');
// difficulty picker
const diffTitle = document.getElementById('diffTitle');
const diffPause = document.getElementById('diffPause');
const diffBlurb = document.getElementById('diffBlurb');
const diffBlurbPause = document.getElementById('diffBlurbPause');
const btnContext = document.getElementById('btnContext');
// label inside the contextual pill (STORE / MOUNT / DISMOUNT)
const ctxLabel = document.getElementById('ctxLabel');
const mmCv = document.getElementById('minimap');
const mm = mmCv.getContext('2d');

