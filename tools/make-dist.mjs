/* ==========================================================================
   The Wild West - tools/make-dist.mjs
   Builds the copy of the game that ships.

   The repository is meant to be read. What leaves it is not: the 57 game
   scripts are folded into one wrapped in an IIFE - which turns every shared
   global into a local, so the compiler can rename all of them - and run
   through the Closure Compiler, which drops every comment and whitespace and
   every name it can. The result is the same game with none of the prose, none
   of the structure and none of the names.

   This is deterrence, not security, and it is worth being plain about that:
   anything a machine can run, a determined person can read. What it stops is
   somebody unzipping the APK and finding the source sitting there, which is
   exactly what it looked like before this existed.

   Provides:  dist/www/ - index.html, app.js, css/, js/vendor/
   Expects:   the JDK and closure.jar (the build fetches the jar on demand)
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'www');
const WORK = path.join(ROOT, 'dist', '.dist-work');
const tools = path.join(process.env.USERPROFILE || process.env.HOME || '', '.kilotools');

const say = m => console.log('   ' + m);
const kb = n => (n / 1024).toFixed(0) + ' KB';

/** The scripts index.html loads, in order. That file is the manifest. */
function scripts() {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const list = [];
  const re = /<script src="([^"]+)"><\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) list.push(m[1]);
  return { html, list };
}

function closure() {
  const jar = path.join(tools, 'closure.jar');
  if (!existsSync(jar)) return null;
  // JAVA_HOME first, because the Android build sets it before calling this
  const javaHome = process.env.JAVA_HOME || '';
  const exe = process.platform === 'win32' ? 'java.exe' : 'java';
  const candidates = [
    javaHome ? path.join(javaHome, 'bin', exe) : null,
    path.join(tools, 'jdk', 'jdk-17.0.20.1+1', 'bin', exe),
    'java'
  ].filter(Boolean);
  const javaExe = candidates.find(c => c === 'java' || existsSync(c));
  if (!javaExe) return null;
  try {
    execFileSync(javaExe, ['-jar', jar, '--version'], { stdio: 'pipe' });
    return { java: javaExe, jar };
  } catch {
    return null;
  }
}

/** Comments gone, whitespace collapsed. The fallback when the compiler is not
 *  available: far weaker, but it never leaves the source as it was. */
function strip(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(l => l.replace(/\s+$/, ''))
    .filter(l => l.trim().length)
    .join('\n');
}

const { html, list } = scripts();
const vendor = list.filter(f => f.includes('/vendor/'));
const game = list.filter(f => !f.includes('/vendor/'));

rmSync(OUT, { recursive: true, force: true });
rmSync(WORK, { recursive: true, force: true });
mkdirSync(path.join(OUT, 'css'), { recursive: true });
mkdirSync(WORK, { recursive: true });

// one wrapped bundle: the wrapper is what lets the compiler rename the names
// that used to be shared globals between files
const bundle = '(() => {\n"use strict";\n'
  + game.map(f => `\n// ---- ${f}\n` + readFileSync(path.join(ROOT, f), 'utf8')).join('\n')
  + '\n})();\n';
const rawPath = path.join(WORK, 'bundle.js');
writeFileSync(rawPath, bundle);

let engine = 'comment strip only';
const cc = closure();
if (cc) {
  try {
    execFileSync(cc.java, [
      '-jar', cc.jar,
      '--js', rawPath,
      '--js_output_file', path.join(OUT, 'app.js'),
      '--compilation_level', 'SIMPLE_OPTIMIZATIONS',
      '--language_in', 'ECMASCRIPT_NEXT',
      '--language_out', 'ECMASCRIPT_2017',
      '--warning_level', 'QUIET'
    ], { stdio: 'pipe' });
    engine = 'Closure Compiler, simple optimisations';
  } catch (e) {
    say('the compiler refused it, falling back: ' + String(e.message).split('\n')[0]);
  }
}
if (engine === 'comment strip only') writeFileSync(path.join(OUT, 'app.js'), strip(bundle));

// vendor script: third party, already minified, and not ours to rewrite
for (const v of vendor) {
  const target = path.join(OUT, v);
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(path.join(ROOT, v), target);
}

// styles: copied, comments removed
for (const f of readdirSync(path.join(ROOT, 'css'))) {
  if (!f.endsWith('.css')) continue;
  const css = readFileSync(path.join(ROOT, 'css', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  writeFileSync(path.join(OUT, 'css', f), css);
}

// the page: same markup, the scripts replaced by the vendor and the bundle, and
// the comments taken out
const page = html
  .replace(/^[ \t]*<script src="js\/(?!vendor\/)[^"]+"><\/script>[^\n]*\n/gm, '')
  .replace('<!-- 57 -->', '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(<script src="js\/vendor\/[^"]+"><\/script>)/, '$1\n  <script src="app.js"></script>');
writeFileSync(path.join(OUT, 'index.html'), page);

rmSync(WORK, { recursive: true, force: true });

const size = f => statSync(path.join(OUT, f)).size;
const sourceSize = game.reduce((n, f) => n + statSync(path.join(ROOT, f)).size, 0);
say(`engine    ${engine}`);
say(`bundle    ${game.length} files, ${kb(sourceSize)} of source -> app.js ${kb(size('app.js'))}`);
say(`page      index.html ${kb(size('index.html'))}, css copied, ${vendor.length} vendor file kept`);
say(`output    ${path.relative(ROOT, OUT).replace(/\\/g, '/')}`);
