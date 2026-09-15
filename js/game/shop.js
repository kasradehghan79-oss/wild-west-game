/* ==========================================================================
   The Wild West - js/game/shop.js
   The general store economy: catalogue, purchase logic and the shop panel.
   Provides:  SHOP_ITEMS, buyItem, openShop, closeShop, nearStore
   Expects:   state.js, dom.js (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- economy / shop ----------
const SHOP_ITEMS = [
  { id: 'bandage', name: 'Bandage', desc: 'Patch yourself up to full health', price: 25, repeat: true },
  { id: 'ammo', name: 'Ammo Box', desc: 'Refill every weapon you own', price: 12, repeat: true },
  { id: 'mag', name: 'Extended Cylinder', desc: '+2 rounds in every magazine', price: 70, max: 3 },
  { id: 'hp', name: 'Iron Constitution', desc: '+1 maximum health', price: 90, max: 3 },
  { id: 'reload', name: 'Quick Hands', desc: '25% faster reloads', price: 75, max: 2 },
  { id: 'steady', name: 'Steady Aim', desc: '30% tighter bullet spread', price: 65, max: 2 },
  { id: 'rifle', name: 'Winchester Rifle', desc: 'Lever-action rifle. Hits far harder', price: 200, max: 1 }
];
function ownedCount(id) { return id === 'bandage' || id === 'ammo' ? 0 : (upgrades[id] || 0); }
function refreshShop() {
  shopCashEl.textContent = '$' + cash;
  shopItemsEl.innerHTML = '';
  SHOP_ITEMS.forEach(it => {
    const owned = ownedCount(it.id);
    const maxed = !it.repeat && owned >= it.max;
    const row = document.createElement('div');
    row.className = 'item' + (maxed ? ' owned' : '');
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.innerHTML = '<b>' + it.name + (it.max > 1 && !it.repeat ? ' (' + owned + '/' + it.max + ')' : '') + '</b><small>' + it.desc + '</small>';
    const pr = document.createElement('div');
    pr.className = 'pr';
    pr.textContent = maxed ? '' : '$' + it.price;
    const btn = document.createElement('button');
    btn.textContent = maxed ? 'OWNED' : 'BUY';
    btn.disabled = maxed || cash < it.price;
    btn.addEventListener('click', e => { e.stopPropagation(); buyItem(it); });
    row.appendChild(nm); row.appendChild(pr); row.appendChild(btn);
    shopItemsEl.appendChild(row);
  });
}
function buyItem(it) {
  if (cash < it.price) return;
  const owned = ownedCount(it.id);
  if (!it.repeat && owned >= it.max) return;
  cash -= it.price;
  if (it.id === 'bandage') { hp = maxHp; Sound.pickup(); }
  else if (it.id === 'ammo') { Object.keys(playerWeapons).forEach(k => { if (playerWeapons[k].owned) playerWeapons[k].ammo = magFor(k); }); syncWeapon(); Sound.pickup(); }
  else if (it.id === 'hp') { upgrades.hp++; maxHp = maxHpNow(); hp = maxHp; refreshHearts(); Sound.coin(); }
  else if (it.id === 'mag') { upgrades.mag++; syncWeapon(); Sound.coin(); }
  else if (it.id === 'reload') { upgrades.reload++; reloadDur = reloadFor(curWeapon); Sound.coin(); }
  else if (it.id === 'steady') { upgrades.steady++; Sound.coin(); }
  else if (it.id === 'rifle') { upgrades.rifle = 1; playerWeapons.rifle.owned = true; playerWeapons.rifle.ammo = magFor('rifle'); Sound.coin(); feed('Purchased the Winchester rifle \u2014 press 2', 'good'); }
  feed('Bought ' + it.name + ' for $' + it.price, 'good');
  refreshShop();
}
function openShop() {
  if (shopOpen || playerDead || matchState !== 'play') return;
  shopOpen = true;
  refreshShop();
  shopEl.classList.add('show');
  if (document.pointerLockElement) document.exitPointerLock();
  aiming = false; shooting = false;
}
function closeShop() {
  shopOpen = false;
  shopEl.classList.remove('show');
  if (!isTouch) requestLock();
}
function nearStore() {
  return Math.hypot(player.g.position.x - STORE.x, player.g.position.z - STORE.z) < STORE.r + 1.8;
}
