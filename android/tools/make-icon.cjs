/* Generates the launcher icon PNGs for the Android build.
 *
 * Written by hand (no image libraries): a minimal PNG encoder on top of zlib, and
 * the artwork is drawn per pixel with 4x supersampling so the star and the ring
 * come out smooth. Run it from anywhere:
 *
 *     node android/tools/make-icon.cjs
 *
 * Output: android/app/src/main/res/mipmap-<density>/ic_launcher.png
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------------------------------------------------------------- png writing
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;            // bit depth
  ihdr[9] = 6;            // colour type: RGBA
  ihdr[10] = 0;           // deflate
  ihdr[11] = 0;           // adaptive filtering
  ihdr[12] = 0;           // no interlace

  // one filter byte (0 = none) per scanline
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ------------------------------------------------------------------- artwork
// Six Suns: a revolver cylinder standing on the horizon where a sun would be,
// its six chambers each holding a sunset. Same artwork as the in-game logo and
// the opening screen (see js/game/splash.js), drawn here in the same way: every
// shape is a distance test in normalised -1..1 space, which is why the wheel
// needs no trigonometry beyond placing its chambers.
//
//   ink   0x241c12      brass 0xd4af37      steel 0x475372
//   sun   0xffdd55      dusk  0xff9a4a      adobe 0xf0d8a8
const INK = [36, 28, 18];
const SIX = (() => {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 3;
    out.push([Math.cos(a), Math.sin(a)]);
  }
  return out;
})();

function lerp(a, b, t) { return a + (b - a) * t; }
function mix(c1, c2, t) { return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]; }
/** Distance from a point to a segment: the flutes are capsules, not rectangles. */
function segDist(x, y, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - (ax + vx * t), y - (ay + vy * t));
}

const CX = 0, CY = -0.02, R = 0.62, HORIZON = CY + R;

/** Colour for one sample point in normalised -1..1 space. Returns [r,g,b,a] 0..255. */
function sample(x, y) {
  const d = Math.hypot(x, y);
  const dc = Math.hypot(x - CX, y - CY);

  // background: dark leather with a soft radial lift
  const lift = 1 - Math.min(1, d);
  let r = lerp(10, 46, lift), g = lerp(8, 32, lift), b = lerp(6, 18, lift);
  let a = 255;

  // vignette so the badge reads as a physical object
  if (d > 0.94) a = Math.round(255 * Math.max(0, 1 - (d - 0.94) / 0.06));

  // the ground, and the horizon the cylinder stands on
  if (y > HORIZON) {
    const t = Math.min(1, (y - HORIZON) / 0.4);
    r = lerp(r * 0.72, 9, t); g = lerp(g * 0.72, 7, t); b = lerp(b * 0.72, 4, t);
  }
  if (Math.abs(y - HORIZON) < 0.012) {
    const t = Math.min(1, Math.abs(y - HORIZON) / 0.012);
    [r, g, b] = mix([240, 216, 168], [r, g, b], t);
  }

  // the light the cylinder gives off
  if (dc < 1.5) {
    const t = Math.pow(Math.max(0, 1 - dc / 1.5), 2.2) * 0.85;
    [r, g, b] = mix([r, g, b], [255, 209, 102], t);
  }

  if (dc <= R) {
    // steel face: light from the top left
    const t = Math.min(1, Math.max(0, ((x - CX) * 0.5 + (y - CY) * 0.9) / R + 0.5));
    [r, g, b] = mix([71, 83, 114], INK, t);

    // brass rim
    if (dc > R - 0.055) [r, g, b] = [212, 175, 55];

    // flutes, cut into the rim between the chambers
    for (let i = 0; i < 6; i++) {
      const a = Math.atan2(SIX[i][1], SIX[i][0]) + Math.PI / 6;
      const w = 0.13;
      if (segDist(x, y, CX + Math.cos(a) * R * 0.77, CY + Math.sin(a) * R * 0.77,
        CX + Math.cos(a) * R * 1.03, CY + Math.sin(a) * R * 1.03) < w / 2) {
        [r, g, b] = INK;
      }
    }

    // six chambers, each one a small sunset
    for (let i = 0; i < 6; i++) {
      const px = CX + SIX[i][0] * R * 0.57, py = CY + SIX[i][1] * R * 0.57;
      const cd = Math.hypot(x - px, y - py);
      if (cd < 0.145 * R) [r, g, b] = INK;
      if (cd < 0.095 * R) {
        const t = Math.min(1, Math.max(0, (y - py) / (0.19 * R) + 0.5));
        [r, g, b] = mix([255, 221, 85], [255, 154, 74], t);
      }
    }

    // hub
    if (dc < 0.16 * R) [r, g, b] = INK;
    if (Math.abs(dc - 0.16 * R) < 0.025 * R) [r, g, b] = [212, 175, 55];
    if (dc < 0.05 * R) [r, g, b] = [212, 175, 55];
  }
  return [r, g, b, a];
}

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 4, inv = 1 / SS;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) * inv) / size) * 2 - 1;
          const y = ((py + (sy + 0.5) * inv) / size) * 2 - 1;
          const c = sample(x, y);
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
        }
      }
      const n = SS * SS;
      const o = (py * size + px) * 4;
      const alpha = a / n;
      // r/g/b are colour*alpha sums, so dividing by the alpha sum yields the
      // colour already in 0..255 - do not scale it again
      buf[o] = Math.round(a > 0 ? r / a : 0);
      buf[o + 1] = Math.round(a > 0 ? g / a : 0);
      buf[o + 2] = Math.round(a > 0 ? b / a : 0);
      buf[o + 3] = Math.round(alpha);
    }
  }
  return encodePng(size, size, buf);
}

// ---------------------------------------------------------------------- main
const RES = path.join(__dirname, '..', 'app', 'src', 'main', 'res');
const DENSITIES = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192]
];

for (const [dir, size] of DENSITIES) {
  const out = path.join(RES, dir);
  fs.mkdirSync(out, { recursive: true });
  const png = render(size);
  fs.writeFileSync(path.join(out, 'ic_launcher.png'), png);
  console.log('wrote ' + path.relative(path.join(__dirname, '..'), path.join(out, 'ic_launcher.png')) +
    '  ' + size + 'x' + size + '  ' + png.length + ' bytes');
}
