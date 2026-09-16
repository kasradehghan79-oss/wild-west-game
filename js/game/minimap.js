/* ==========================================================================
   The Wild West - js/game/minimap.js
   The minimap: the town, the people in it, the mission markers and the pulse of
   whoever is currently worth watching.
   Provides:  drawMinimap
   Expects:   dom.js (mm, mmCv), npcs, Missions, clock, TAU
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
function drawMinimap() {
  const S = mmCv.width, half = S / 2, scale = S / 300;
  const wx = x => half + x * scale, wy = z => half + z * scale;
  mm.clearRect(0, 0, S, S);
  mm.save();
  mm.beginPath(); mm.arc(half, half, half - 1, 0, TAU); mm.clip();
  mm.fillStyle = 'rgba(24,30,18,0.8)'; mm.fillRect(0, 0, S, S);
  mm.strokeStyle = 'rgba(150,120,80,0.45)'; mm.lineWidth = 4;
  mm.beginPath(); mm.moveTo(wx(0), wy(-160)); mm.lineTo(wx(0), wy(160)); mm.stroke();
  mm.beginPath(); mm.moveTo(wx(-160), wy(0)); mm.lineTo(wx(160), wy(0)); mm.stroke();
  mm.strokeStyle = 'rgba(255,215,90,0.45)'; mm.lineWidth = 1.4;
  mm.beginPath(); mm.arc(half, half, CAMP_R * scale, 0, TAU); mm.stroke();
  mm.fillStyle = 'rgba(190,160,115,0.9)';
  houseMarkers.forEach(h => mm.fillRect(wx(h[0]) - 3.5, wy(h[1]) - 3.5, 7, 7));
  mm.fillStyle = '#ffd97a';
  mm.fillRect(wx(STORE.x) - 4.5, wy(STORE.z) - 4.5, 9, 9);
  for (const p of pickups) {
    if (!p.g.visible) continue;
    mm.globalAlpha = 0.7;
    mm.fillStyle = p.type === 'health' ? '#e05a4a' : p.type === 'cash' ? '#9de08a' : '#d4af37';
    mm.fillRect(wx(p.g.position.x) - 1.5, wy(p.g.position.z) - 1.5, 3, 3);
    mm.globalAlpha = 1;
  }
  for (const n of npcs) {
    if (n.dead) continue;
    // the sheriff only reads differently on the map once he has been identified
    const showAsSheriff = n.isSheriff && sheriffRevealed;
    const c = n.civil ? '#9de08a' : showAsSheriff ? '#ffd75a' : n.archetype === 'rifleman' && !n.isSheriff ? '#ff9a3a' : n.archetype === 'shotgunner' && !n.isSheriff ? '#c78fd6' : '#ff5a4a';
    mm.fillStyle = c;
    mm.beginPath(); mm.arc(wx(n.g.position.x), wy(n.g.position.z), showAsSheriff ? 4.6 : 2.6, 0, TAU); mm.fill();
    if (showAsSheriff) {
      mm.strokeStyle = 'rgba(255,215,90,.55)'; mm.lineWidth = 1.4;
      mm.beginPath(); mm.arc(wx(n.g.position.x), wy(n.g.position.z), 7.5 + Math.sin(clock.elapsedTime * 5) * 1.6, 0, TAU); mm.stroke();
    }
  }
  // mission markers: a pulsing diamond, drawn last so the current job is never
  // hidden under the town
  const pulse = 0.6 + Math.sin(clock.elapsedTime * 4) * 0.4;
  for (const k of Missions.markers()) {
    const x = wx(k.x), y = wy(k.z);
    mm.save();
    mm.translate(x, y);
    mm.rotate(Math.PI / 4);
    mm.fillStyle = k.danger ? 'rgba(224,90,74,.95)' : k.friendly ? 'rgba(157,224,138,.95)' : 'rgba(240,217,168,.95)';
    mm.fillRect(-3.6, -3.6, 7.2, 7.2);
    mm.restore();
    mm.strokeStyle = 'rgba(240,217,168,' + (0.25 + pulse * 0.45).toFixed(2) + ')';
    mm.lineWidth = 1.4;
    mm.beginPath(); mm.arc(x, y, 6 + pulse * 5, 0, TAU); mm.stroke();
  }
  mm.fillStyle = '#c9a227';
  mm.beginPath(); mm.arc(wx(horse.g.position.x), wy(horse.g.position.z), 3, 0, TAU); mm.fill();
  mm.save();
  mm.translate(wx(player.g.position.x), wy(player.g.position.z));
  mm.rotate(Math.PI - player.g.rotation.y);
  mm.fillStyle = '#ffffff';
  mm.beginPath(); mm.moveTo(0, -6.5); mm.lineTo(4.4, 5.5); mm.lineTo(0, 3.4); mm.lineTo(-4.4, 5.5); mm.closePath(); mm.fill();
  mm.restore();
  mm.restore();
  mm.strokeStyle = 'rgba(211,169,92,.85)'; mm.lineWidth = 2.5;
  mm.beginPath(); mm.arc(half, half, half - 1.5, 0, TAU); mm.stroke();
}

