/* ==========================================================================
   The Wild West - js/game/difficulty-ui.js
   The difficulty picker: one row of five, on the title screen and in the pause
   menu, so a run can be started at the right level and changed mid-campaign.
   Provides:  buildDifficultyUI, refreshDifficultyUI
   Expects:   Difficulty, DIFFICULTIES, dom.js, Bus
   ========================================================================== */
"use strict";
function buildDifficultyUI(container) {
  if (!container) return;
  container.innerHTML = '';
  DIFFICULTIES.forEach(d => {
    const b = document.createElement('button');
    b.className = 'diffbtn';
    b.dataset.diff = d.id;
    b.innerHTML = '<b>' + d.name + '</b><small>' + d.tag + '</small>';
    b.addEventListener('click', e => {
      e.stopPropagation();
      Difficulty.set(d.id);
      feed('Difficulty: ' + d.name, '');
    });
    container.appendChild(b);
  });
}
function refreshDifficultyUI() {
  const cur = Difficulty.id;
  const level = Difficulty.level;
  document.querySelectorAll('.diffbtn').forEach(b => b.classList.toggle('sel', b.dataset.diff === cur));
  if (diffBlurb) diffBlurb.textContent = level.blurb;
  if (diffBlurbPause) diffBlurbPause.textContent = level.blurb;
}
buildDifficultyUI(diffTitle);
buildDifficultyUI(diffPause);
refreshDifficultyUI();
Bus.on('difficulty:change', refreshDifficultyUI);
