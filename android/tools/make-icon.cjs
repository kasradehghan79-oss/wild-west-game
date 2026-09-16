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

const CX = 0, CY = -0.02, R = 0.62;
const RIM = R - 0.06;            // inside edge of the brass band
const PITCH = R * 0.57;          // how far the chambers sit from the hub
const BORE = R * 0.152;          // the chamber itself
const COLLAR = BORE + R * 0.026; // brass collar around it
const ROUND = R * 0.050;         // the round sitting in the bore
const BRASS = [212, 175, 55];
const SUN_HI = [255, 221, 85], SUN_LO = [255, 154, 74];
const SHINE = [255, 244, 205];

/** Colour for one sample point in normalised -1..1 space. Returns [r,g,b,a] 0..255.
 *  opts.adaptive leaves the plate transparent: Android draws the background
 *  colour itself, and only the scene belongs to the foreground layer. */
function sample(x, y, opts) {
  opts = opts || {};
  const d = Math.hypot(x, y);
  const dc = Math.hypot(x - CX, y - CY);

  // background: dark leather with a soft radial lift
  const lift = 1 - Math.min(1, d);
  let r, g, b, a;
  if (opts.adaptive) {
    r = 0; g = 0; b = 0; a = 0;
  } else {
    r = lerp(19, 56, lift); g = lerp(14, 38, lift); b = lerp(10, 21, lift);
    a = 255;
    if (d > 0.94) a = Math.round(255 * Math.max(0, 1 - (d - 0.94) / 0.06));
  }

  // the light the cylinder gives off
  const glow = Math.pow(Math.max(0, 1 - dc / 1.12), 2.4) * 0.5;
  if (glow > 0.002) {
    const hit = mix([r, g, b], [255, 209, 102], glow);
    r = hit[0]; g = hit[1]; b = hit[2];
    if (opts.adaptive) a = Math.max(a, Math.round(230 * glow));
  }



  if (dc <= R) {
    a = 255;
    // steel face, lit from the upper left
    const t = Math.min(1, Math.max(0, ((x - CX) * 0.45 + (y - CY) * 0.9) / R + 0.5));
    let face = mix([84, 96, 128], [19, 16, 14], t);
    // a shadow just inside the rim: without it the face is a flat disc
    if (dc > RIM - 0.05 && dc <= RIM) {
      const k = 1 - (RIM - dc) / 0.05;
      face = mix(face, [12, 10, 8], 0.45 * k);
    }
    r = face[0]; g = face[1]; b = face[2];

    // the brass band, with a highlight along its upper left
    if (dc > RIM) {
      let brass = BRASS;
      if (dc > R - 0.014) brass = mix(brass, [140, 112, 34], 0.5);   // outer bevel
      const ang = Math.atan2(y - CY, x - CX);
      const lit = Math.max(0, -Math.sin(ang) * 0.82 - Math.cos(ang) * 0.5);
      brass = mix(brass, SHINE, Math.min(0.55, lit * 0.6));
      r = brass[0]; g = brass[1]; b = brass[2];
    }

    // flutes: narrow slots cut through the band between the chambers, which is
    // what makes this read as a cylinder rather than a wheel with spokes
    for (let i = 0; i < 6; i++) {
      const fa = Math.atan2(SIX[i][1], SIX[i][0]) + Math.PI / 6;
      const x1 = CX + Math.cos(fa) * R * 0.925, y1 = CY + Math.sin(fa) * R * 0.925;
      const x2 = CX + Math.cos(fa) * R * 1.02, y2 = CY + Math.sin(fa) * R * 1.02;
      if (segDist(x, y, x1, y1, x2, y2) < R * 0.017) {
        r = 24; g = 19; b = 13;
      }
    }

    // six chambers: a brass collar, a dark bore, and a sunset down inside it
    for (let i = 0; i < 6; i++) {
      const px = CX + SIX[i][0] * PITCH, py = CY + SIX[i][1] * PITCH;
      const cd = Math.hypot(x - px, y - py);
      if (cd < COLLAR) {
        r = 118; g = 92; b = 30;
      }
      if (cd < COLLAR - R * 0.012) {
        r = 22; g = 18; b = 12;
      }
      if (cd < BORE) {
        const up = Math.min(1, Math.max(0, (py - y) / (2 * BORE) + 0.5));
        const sun = mix(SUN_LO, SUN_HI, up);
        r = sun[0]; g = sun[1]; b = sun[2];
        // shading at the top of the bore reads as depth
        const shade = mix([r, g, b], [90, 52, 20], 0.35 * up);
        r = shade[0]; g = shade[1]; b = shade[2];
      }
      if (cd < ROUND * 0.55) {
        const hot = mix([r, g, b], [255, 246, 205], 0.35);
        r = hot[0]; g = hot[1]; b = hot[2];
      }
    }

    // the hub: a bore, a brass ring, and the pin at the centre
    if (dc < R * 0.205) { r = 24; g = 19; b = 13; }
    if (Math.abs(dc - R * 0.205) < R * 0.008) { r = 138; g = 118; b = 38; }
    if (dc < R * 0.026) { r = 164; g = 139; b = 52; }
  }
  return [r, g, b, a];
}

function render(size, opts) {
  const buf = Buffer.alloc(size * size * 4);
  // Six samples a side: the chambers and the flute slots are a couple of pixels
  // across at the small densities, and four was not enough to keep them round.
  const SS = 6, inv = 1 / SS;
  const shrink = (opts && opts.scale) || 1;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) * inv) / size) * 2 - 1;
          const y = ((py + (sy + 0.5) * inv) / size) * 2 - 1;
          const c = sample(x / shrink, y / shrink, opts);
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

const rel = p => path.relative(path.join(__dirname, '..'), p);
const write = (file, png, size) => {
  fs.writeFileSync(file, png);
  console.log('wrote ' + rel(file) + '  ' + size + 'x' + size + '  ' + png.length + ' bytes');
};

// The legacy icon: the whole badge, plate and all. Android below 8 uses it
// as drawn, and every launcher falls back to it if the adaptive one is missing.
for (const [dir, size] of DENSITIES) {
  const out = path.join(RES, dir);
  fs.mkdirSync(out, { recursive: true });
  write(path.join(out, 'ic_launcher.png'), render(size), size);
}

// And the adaptive icon, which is what Android 8 and later actually shows: the
// launcher supplies the shape, so the artwork has to be a foreground layer on
// transparent, drawn inside the inner 66% that no shaped mask will crop. That
// is why the scene is shrunk a little here rather than drawn at badge size.
const FOREGROUND = [
  ['drawable-mdpi', 108],
  ['drawable-hdpi', 162],
  ['drawable-xhdpi', 216],
  ['drawable-xxhdpi', 324],
  ['drawable-xxxhdpi', 432]
];
for (const [dir, size] of FOREGROUND) {
  const out = path.join(RES, dir);
  fs.mkdirSync(out, { recursive: true });
  write(path.join(out, 'ic_launcher_foreground.png'), render(size, { adaptive: true, scale: 0.92 }), size);
}

const values = path.join(RES, 'values');
fs.mkdirSync(values, { recursive: true });
fs.writeFileSync(path.join(values, 'ic_launcher_background.xml'),
  '<?xml version="1.0" encoding="utf-8"?>\n' +
  '<!-- the plate colour behind the foreground, so a shaped mask has no edges to crop -->\n' +
  '<resources>\n    <color name="ic_launcher_background">#241c12</color>\n</resources>\n');

const anydpi = path.join(RES, 'mipmap-anydpi-v26');
fs.mkdirSync(anydpi, { recursive: true });
const adaptive = '<?xml version="1.0" encoding="utf-8"?>\n' +
  '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n' +
  '    <background android:drawable="@color/ic_launcher_background"/>\n' +
  '    <foreground android:drawable="@drawable/ic_launcher_foreground"/>\n' +
  '</adaptive-icon>\n';
fs.writeFileSync(path.join(anydpi, 'ic_launcher.xml'), adaptive);
fs.writeFileSync(path.join(anydpi, 'ic_launcher_round.xml'), adaptive);
console.log('wrote mipmap-anydpi-v26/ic_launcher{,_round}.xml and values/ic_launcher_background.xml');
