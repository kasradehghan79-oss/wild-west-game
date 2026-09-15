/* Generates the launcher icon PNGs for the Android build.
 *
 * Written by hand (no image libraries): a minimal PNG encoder on top of zlib, and
 * the artwork is drawn per pixel with 4x supersampling so the star and the ring
 * come out smooth. Run it from anywhere:
 *
 *     node android/tools/make-icon.js
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
// A star badge on dark leather: outer gold ring, five point star, warm gradient.
const STAR = (() => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const r = i % 2 === 0 ? 0.60 : 0.255;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
})();

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function lerp(a, b, t) { return a + (b - a) * t; }

/** Colour for one sample point in normalised -1..1 space. Returns [r,g,b,a] 0..255. */
function sample(x, y) {
  const d = Math.hypot(x, y);

  // background: dark leather with a soft radial lift
  const lift = 1 - Math.min(1, d);
  let r = lerp(10, 46, lift), g = lerp(8, 32, lift), b = lerp(6, 18, lift);
  let a = 255;

  // vignette so the badge reads as a physical object
  if (d > 0.94) a = Math.round(255 * Math.max(0, 1 - (d - 0.94) / 0.06));

  // gold ring
  if (d > 0.855 && d < 0.925) {
    const edge = Math.min(1, Math.min(d - 0.855, 0.925 - d) / 0.012);
    const t = edge;
    r = lerp(r, 255, t); g = lerp(g, 214, t); b = lerp(b, 122, t);
  }

  // star, gold gradient from top to bottom
  if (inPolygon(x, y, STAR)) {
    const t = Math.min(1, Math.max(0, (y + 0.6) / 1.2));
    r = lerp(255, 172, t); g = lerp(226, 124, t); b = lerp(140, 52, t);
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
