/* ==========================================================================
   The Wild West - tests/structure.spec.mjs
   The project's own house rules, enforced rather than trusted.

   The game is classic scripts in one shared global scope, which buys a game that
   runs from file:// inside the Android WebView with no build step, and costs the
   safety net a module system would give. These tests are that safety net:

     - every top level name is declared exactly once (the linter's no-redeclare)
     - nothing top level is dead weight
     - every file on disk is loaded by index.html, in a documented place
     - tools/globals.json - what the linter believes exists - matches the code

   tools/audit-structure.mjs does the walking; this spec is the gate.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

function runAudit(args) {
  return new Promise(done => {
    execFile('node', ['tools/audit-structure.mjs', ...args], { cwd: ROOT, timeout: 60000 },
      (err, stdout, stderr) => done({ code: err ? (err.code || 1) : 0, out: (stdout || '') + (stderr || '') }));
  });
}

test.describe('project structure', () => {
  test('the house rules hold: no dead globals, no unloaded files, linter inventory in sync', async ({}, testInfo) => {
    // a Node-side check, so it runs once rather than once per browser project
    test.skip(testInfo.project.name !== 'desktop', 'not browser specific');

    const res = await runAudit(['--check']);
    const report = res.out;
    if (res.code !== 0) console.log(report);
    expect(res.code, 'audit-structure --check failed:\n' + report).toBe(0);

    expect(report, 'every js file is loaded').toContain('not loaded: (none)');
    expect(report, 'nothing is loaded that does not exist').toContain('loaded but absent: (none)');
    expect(report, 'no top level name is dead weight').toMatch(/names nothing references \(0\)/);
    expect(report, 'the linter inventory matches the code').toContain('tools/globals.json is up to date');
  });

  test('the linter itself passes', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'not browser specific');
    const res = await new Promise(done => {
      execFile(process.execPath, ['node_modules/eslint/bin/eslint.js', 'js', 'tests', 'tools', 'playwright.config.mjs'],
        { cwd: ROOT, timeout: 120000 },
        (err, stdout, stderr) => done({ code: err ? (err.code || 1) : 0, out: (stdout || '') + (stderr || '') }));
    });
    expect(res.code, 'eslint found problems:\n' + res.out).toBe(0);
  });
});
