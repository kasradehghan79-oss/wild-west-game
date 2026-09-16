/* ==========================================================================
   The Wild West - tests/phone.layout.spec.mjs
   The touch layout has to hold at every phone size the game claims to support:
   nothing overlapping, nothing off screen, every target big enough for a thumb,
   and the HUD panels clear of the buttons. One boot, measured at three sizes.
   ========================================================================== */
import { test, expect, resetGame } from './support/fixtures.mjs';
import { layout, setViewport } from './support/game.mjs';

// The shape the layout was built against, the short one that triggers the
// max-height media query, and a tablet.
const SIZES = [
  { label: 'nothing-phone-2a 919x413', width: 919, height: 413 },
  { label: 'short 844x390', width: 844, height: 390 },
  { label: 'tablet 1180x820', width: 1180, height: 820 }
];

test.describe('touch layout', () => {
  test('no overlaps and no off screen controls at any supported size', async ({ game }) => {
    await resetGame(game);
    for (const size of SIZES) {
      await setViewport(game, size.width, size.height);
      await game.waitForTimeout(250);
      const l = await layout(game);
      expect(l.viewport, size.label).toEqual([size.width, size.height]);
      expect(l.clashes, 'overlapping controls at ' + size.label).toEqual([]);
      expect(l.readoutClashes, 'controls on a HUD panel at ' + size.label).toEqual([]);
      expect(l.outside, 'controls outside the viewport at ' + size.label).toEqual([]);
    }
  });

  test('every control is thumb sized and the desktop chrome is gone', async ({ game }) => {
    await resetGame(game);
    const l = await layout(game);
    expect(l.controls.length, 'found the touch controls').toBeGreaterThan(6);
    for (const c of l.controls) {
      expect(Math.min(c.w, c.h), c.id + ' is ' + c.w + 'x' + c.h).toBeGreaterThanOrEqual(44);
    }

    const chrome = await game.evaluate(() => {
      const box = s => {
        const b = document.querySelector(s).getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      };
      return {
        touch: document.body.classList.contains('touch'),
        touchUI: getComputedStyle(document.getElementById('touchUI')).display,
        hint: getComputedStyle(document.getElementById('touchhint')).display,
        fsPc: getComputedStyle(document.getElementById('btnFsPc')).display,
        fsDisplay: document.getElementById('btnFs').style.display,
        inFullscreen: !!document.fullscreenElement,
        help: box('#btnHelp'),
        jump: box('.tbtn.jump')
      };
    });
    expect(chrome.touch).toBe(true);
    expect(chrome.touchUI).toBe('block');
    expect(chrome.hint).toBe('block');
    expect(chrome.fsPc, 'the desktop duplicate is hidden').toBe('none');
    // the first touch anywhere can auto-enter fullscreen, which hides this button on
    // purpose, so what matters here is that it is laid out and not hidden in the app
    expect(chrome.inFullscreen || chrome.fsDisplay === 'flex' || chrome.fsDisplay === '',
      'the touch fullscreen button is available: ' + JSON.stringify(chrome.fsDisplay)).toBe(true);
    const gapX = chrome.jump.x - (chrome.help.x + chrome.help.w);
    const gapY = chrome.jump.y - (chrome.help.y + chrome.help.h);
    expect(Math.max(gapX, gapY), 'the help glyph clears JUMP').toBeGreaterThan(50);
  });

  test('the help panel opens into free space and fits on screen', async ({ game }) => {
    await resetGame(game);
    await game.evaluate(() => toggleHelp());
    await game.waitForFunction(() => getComputedStyle(helpText).display === 'block');
    const help = await game.evaluate(() => {
      const panel = helpText.getBoundingClientRect();
      const others = ['#vitals', '.tbtn.fire', '.tbtn.aim', '.tbtn.jump', '.tbtn.reload', '#rightpanel', '#hud', '#score']
        .map(s => document.querySelector(s)).filter(Boolean)
        .map(el => ({ id: el.id || el.className, r: el.getBoundingClientRect() }));
      const hits = [];
      for (const o of others) {
        const ox = Math.min(panel.right, o.r.right) - Math.max(panel.left, o.r.left);
        const oy = Math.min(panel.bottom, o.r.bottom) - Math.max(panel.top, o.r.top);
        if (ox > 1 && oy > 1) hits.push(o.id + ' ' + Math.round(ox) + 'x' + Math.round(oy));
      }
      return {
        hits,
        inside: panel.left >= 0 && panel.top >= 0 && panel.right <= innerWidth + 0.5 && panel.bottom <= innerHeight + 0.5,
        box: [Math.round(panel.x), Math.round(panel.y), Math.round(panel.width), Math.round(panel.height)]
      };
    });
    expect(help.hits, 'the panel landed on something').toEqual([]);
    expect(help.inside, 'the panel fits: ' + help.box.join(',')).toBe(true);
  });

  test('the pause menu fits with its two new buttons and does not stack them', async ({ game }) => {
    await resetGame(game);
    await game.evaluate(() => setPaused(true));
    await game.waitForFunction(() => Mode.current() === 'paused');
    const pause = await game.evaluate(() => {
      const btns = [...document.querySelectorAll('#pause .btns .mbtn')];
      const boxes = btns.map(b => ({ label: b.textContent, r: b.getBoundingClientRect() }));
      const clashes = [];
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].r, b = boxes[j].r;
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 1 && oy > 1) clashes.push(boxes[i].label + ' x ' + boxes[j].label);
        }
      }
      const wrap = document.querySelector('#pause .btns').getBoundingClientRect();
      return {
        labels: boxes.map(b => b.label), clashes,
        fits: wrap.top >= 0 && wrap.bottom <= innerHeight,
        wrap: [Math.round(wrap.x), Math.round(wrap.y), Math.round(wrap.width), Math.round(wrap.height)]
      };
    });
    expect(pause.labels).toEqual(['RESUME', 'SAVE GAME', 'LOAD GAME', 'RESTART MATCH']);
    expect(pause.clashes).toEqual([]);
    expect(pause.fits, 'pause buttons fit: ' + pause.wrap.join(',')).toBe(true);
  });

  test('the save screen fits and scrolls rather than spilling off screen', async ({ game }) => {
    await resetGame(game);
    // this one is about layout, not about input, so the menu button is clicked
    // directly: the touch input path is covered in phone.controls.spec.mjs
    await game.evaluate(() => { setPaused(true); document.getElementById('pauseSaveBtn').click(); });
    await game.waitForFunction(() => getComputedStyle(savesEl).display !== 'none');
    const saves = await game.evaluate(() => {
      const panel = document.querySelector('#saves .panel').getBoundingClientRect();
      return {
        box: [Math.round(panel.x), Math.round(panel.y), Math.round(panel.width), Math.round(panel.height)],
        fits: panel.top >= 0 && panel.bottom <= innerHeight && panel.left >= 0 && panel.right <= innerWidth,
        scrollable: getComputedStyle(document.querySelector('#saveSlots')).overflowY === 'auto',
        rows: document.querySelectorAll('#saveSlots .item').length
      };
    });
    expect(saves.fits, 'the save panel fits: ' + saves.box.join(',')).toBe(true);
    expect(saves.scrollable).toBe(true);
    expect(saves.rows).toBe(4);
  });
});