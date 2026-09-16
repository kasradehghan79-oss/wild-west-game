/* Packs the Windows icon for the setup file and its shortcuts.
 *
 * The artwork is the same Six Suns mark, drawn per pixel by
 * android/tools/make-icon.cjs, which already writes it at five sizes. Rather
 * than keep a second copy of that code (or a second rendering of the mark that
 * could drift), this packs the sizes that script produced straight into an
 * .ico. Windows scales down for the 16 and 32 pixel slots, which is fine for a
 * mark this simple, and it keeps one drawing for both platforms.
 *
 *     node windows/tools/make-ico.cjs
 *
 * Output: windows/build/brand.ico
 */
'use strict';

const fs = require('fs');
const path = require('path');

const RES = path.join(__dirname, '..', '..', 'android', 'app', 'src', 'main', 'res');
const OUT = path.join(__dirname, '..', 'build', 'brand.ico');

// the mipmap sizes, smallest first, which is the order Windows reads them in
const SIZE_DIRS = [
  ['mipmap-mdpi', 48], ['mipmap-hdpi', 72], ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144], ['mipmap-xxxhdpi', 192]
];

const images = SIZE_DIRS.map(([dir, size]) => {
  const file = path.join(RES, dir, 'ic_launcher.png');
  if (!fs.existsSync(file)) {
    console.error(`missing ${path.relative(process.cwd(), file)}`);
    console.error('run: node android/tools/make-icon.cjs');
    process.exit(1);
  }
  return { size, data: fs.readFileSync(file) };
});

// ICONDIR, then one 16 byte directory entry per image, then the PNG payloads.
// Windows accepts PNG-compressed entries from Vista onwards, which is every
// version this installer runs on.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);              // reserved
header.writeUInt16LE(1, 2);              // 1 = icon
header.writeUInt16LE(images.length, 4);  // image count

let offset = 6 + images.length * 16;
const entries = images.map(({ size, data }) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size >= 256 ? 0 : size, 0);   // 0 means 256
  e.writeUInt8(size >= 256 ? 0 : size, 1);
  e.writeUInt8(0, 2);                        // palette size
  e.writeUInt8(0, 3);                        // reserved
  e.writeUInt16LE(1, 4);                     // colour planes
  e.writeUInt16LE(32, 6);                    // bits per pixel
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += data.length;
  return e;
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([header, ...entries, ...images.map(i => i.data)]));
const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`wrote brand.ico  ${images.map(i => i.size).join(', ')} px  ${kb} KB`);
