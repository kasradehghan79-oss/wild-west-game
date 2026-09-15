/* ==========================================================================
   The Wild West - js/world/textures.js
   Canvas texture helpers and the shingle/plank maps the buildings use.
   Provides:  canvasTex, softBumpTex, bumpSoft, bumpCoarse, shingleTex, plankTex
   Expects:   - (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// ---------- ground ----------
// Colour maps are authored in sRGB and must be decoded to linear by the shader.
function canvasTex(w, h, fn) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  fn(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.encoding = THREE.sRGBEncoding;
  return t;
}
// Grayscale height data - stays linear, used as bumpMap.
function softBumpTex(size, blobs, rad, amount) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const x = cv.getContext('2d');
  x.fillStyle = '#808080';
  x.fillRect(0, 0, size, size);
  for (let i = 0; i < blobs; i++) {
    const cx = Math.random() * size, cy = Math.random() * size, r = rad * (0.45 + Math.random());
    const v = Math.random() < 0.5 ? 0 : 255;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(' + v + ',' + v + ',' + v + ',' + amount + ')');
    g.addColorStop(1, 'rgba(' + v + ',' + v + ',' + v + ',0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
  }
  for (let i = 0; i < size * 60; i++) {
    const v = 110 + Math.floor(Math.random() * 36);
    x.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.35)';
    x.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const bumpSoft = softBumpTex(256, 90, 42, 0.5);   // plaster / cloth
const bumpCoarse = softBumpTex(256, 40, 90, 0.65); // ground / dirt
function shingleTex() {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6f3a22';
    ctx.fillRect(0, 0, w, h);
    const rows = 9, cols = 7;
    for (let r = 0; r < rows; r++) {
      for (let c = -1; c <= cols; c++) {
        const off = (r % 2) * (w / cols) * 0.5;
        const x = c * (w / cols) + off, y = r * (h / rows);
        const s = 0.78 + Math.random() * 0.42;
        ctx.fillStyle = 'rgb(' + Math.floor(150 * s) + ',' + Math.floor(78 * s) + ',' + Math.floor(46 * s) + ')';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w / cols - 3, y);
        ctx.lineTo(x + w / cols - 3, y + h / rows - 3);
        ctx.lineTo(x, y + h / rows - 3);
        ctx.closePath();
        ctx.fill();
      }
    }
  });
}
function plankTex() {
  return canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#7d4c27';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) {
      const y = i * (h / 5);
      ctx.fillStyle = 'rgba(0,0,0,' + (0.05 + Math.random() * 0.09).toFixed(3) + ')';
      ctx.fillRect(0, y, w, h / 5 - 2);
      ctx.strokeStyle = 'rgba(38,20,8,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      for (let g = 0; g < 26; g++) {
        const gy = y + Math.random() * (h / 5);
        ctx.strokeStyle = 'rgba(58,30,12,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(w * 0.3, gy + rnd(-2, 2), w * 0.7, gy + rnd(-2, 2), w, gy);
        ctx.stroke();
      }
    }
  });
}
// Water bodies. Each one carves a real basin into the terrain, so the water sits
// inside a dip with a visible bank instead of being a disc laid on flat ground.
