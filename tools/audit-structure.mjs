/* ==========================================================================
   The Wild West - tools/audit-structure.mjs
   The project's structural audit, and the generator for the shared global
   inventory ESLint needs.

   The game is classic scripts in one global scope on purpose (it has to run from
   file:// inside the Android WebView, where ES modules are blocked by CORS). The
   price of that choice is that every top-level name is public, so this script is
   what keeps the surface honest:

     node tools/audit-structure.mjs          report, and write tools/globals.json
     node tools/audit-structure.mjs --check   report only, exit 1 if out of date

   It answers four questions that are otherwise invisible:
     1. which files and how big, so the ones that need splitting are obvious
     2. every top-level name, so ESLint's no-undef can work in a shared scope
     3. names nothing references, because a dead global is a lie about the design
     4. whether index.html loads every file on disk, in a documented order
   ========================================================================== */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = join(ROOT, 'js');
const GLOBALS_FILE = join(ROOT, 'tools', 'globals.json');
const checkOnly = process.argv.includes('--check');

// Names that exist only for a later phase, or that a browser supplies. Anything
// listed here is a deliberate exception, not a place to hide a mistake.
const ALLOW_UNREFERENCED = new Set([
  // deliberately kept for a later phase, or read only from a data table
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === 'vendor') continue;              // three.js is not our surface
      walk(path, out);
    } else if (entry.endsWith('.js')) {
      out.push(path);
    }
  }
  return out;
}

const files = walk(JS_DIR).sort();
const rel = f => relative(ROOT, f).split(sep).join('/');
const sources = new Map(files.map(f => [f, readFileSync(f, 'utf8')]));

// ---- 1. size -------------------------------------------------------------
const sizes = [...sources].map(([f, src]) => ({
  file: rel(f), lines: src.split('\n').length
})).sort((a, b) => b.lines - a.lines);

// ---- 2. the shared surface ----------------------------------------------
// Every declarator, not just the first: `let yaw = 0, pitch = 0.14, locked = false;`
// declares three globals, and missing two of them is how no-undef stops working.
const HEAD = /^(const|let|var|function|class)\s+(.*)$/gm;
// The names a const/let/var statement declares. Split on top-level commas (so commas
// inside braces or calls do not count), then take what is being declared from each part:
// every identifier for a destructuring pattern, otherwise the name before the `=`.
function declarators(statement) {
  const out = [];
  const chunks = [];
  let depth = 0, start = 0;
  for (let i = 0; i < statement.length; i++) {
    const ch = statement[i];
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) { chunks.push(statement.slice(start, i)); start = i + 1; }
  }
  chunks.push(statement.slice(start));
  for (const chunk of chunks) {
    const body = chunk.split('=')[0];
    const ids = body.match(/[A-Za-z_$][\w$]*/g) || [];
    if (!ids.length) continue;
    if (body.includes('{') || body.includes('[')) ids.forEach(id => out.push(id));
    else out.push(ids[ids.length - 1]);
  }
  return out;
}
const decls = [];
for (const [f, src] of sources) {
  for (const m of src.matchAll(HEAD)) {
    if (m[1] === 'function' || m[1] === 'class') {
      const name = (m[2].match(/^[A-Za-z_$][\w$]*/) || [])[0];
      if (name) decls.push({ name, file: f });
      continue;
    }
    for (const name of declarators(m[2])) decls.push({ name, file: f });
  }
}
const names = [...new Set(decls.map(d => d.name))].sort();

// ---- 3. dead names -------------------------------------------------------
const referenced = new Map();
for (const name of names) {
  let total = 0;
  const re = new RegExp('\\b' + name.replace(/\$/g, '\\$') + '\\b', 'g');
  for (const [, src] of sources) total += (src.match(re) || []).length;
  referenced.set(name, total);
}
const dead = names.filter(n => referenced.get(n) <= 1 && !ALLOW_UNREFERENCED.has(n))
  .map(n => ({ name: n, file: rel(decls.find(d => d.name === n).file) }));

// ---- 4. the load order ---------------------------------------------------
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const loaded = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
const onDisk = files.map(rel);
const notLoaded = onDisk.filter(f => !loaded.includes(f));
const missingFiles = loaded.filter(f => !onDisk.includes(f) && f !== 'js/vendor/three.min.js');

// ---- report --------------------------------------------------------------
const lines = [];
lines.push(`files: ${files.length}   top-level names: ${names.length}   lines: ${sizes.reduce((n, s) => n + s.lines, 0)}`);
lines.push('', 'largest files (candidates to split):');
for (const s of sizes.slice(0, 8)) lines.push(`  ${String(s.lines).padStart(4)}  ${s.file}`);
lines.push('', `names nothing references (${dead.length}):`);
if (!dead.length) lines.push('  (none)');
for (const d of dead) lines.push(`  ${d.name}  (${d.file})`);
lines.push('', 'load order:');
lines.push(`  scripts in index.html: ${loaded.length}   files on disk: ${onDisk.length}`);
lines.push(`  not loaded: ${notLoaded.join(', ') || '(none)'}`);
lines.push(`  loaded but absent: ${missingFiles.join(', ') || '(none)'}`);
console.log(lines.join('\n'));

// ---- write the ESLint globals -------------------------------------------
const globals = { THREE: 'readonly', WildWestApp: 'readonly' };   // three.js, and the Android shell
for (const name of names) globals[name] = 'writable';
// read-only names: they are looked up from other files but never assigned
for (const name of ['THREE', 'player', 'npcs', 'camera', 'scene', 'renderer', 'clock']) {
  if (globals[name]) globals[name] = 'readonly';
}
const payload = JSON.stringify({ note: 'generated by tools/audit-structure.mjs', globals }, null, 2) + '\n';
let previous = '';
try { previous = readFileSync(GLOBALS_FILE, 'utf8'); } catch { /* first run */ }
if (previous !== payload) {
  if (checkOnly) {
    console.error('\ntools/globals.json is out of date - run: node tools/audit-structure.mjs');
    process.exit(1);
  }
  writeFileSync(GLOBALS_FILE, payload);
  console.log(`\nwrote tools/globals.json (${names.length} names)`);
} else {
  console.log('\ntools/globals.json is up to date');
}
if (checkOnly && (notLoaded.length || missingFiles.length || dead.length)) process.exit(1);
