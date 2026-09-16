/* ==========================================================================
   The Wild West - tests/apk.spec.mjs
   The Android artifact itself: the APK has to contain the same web build that
   this suite just tested, and it has to be signed and aligned. This runs the
   build script's own --verify mode so there is one implementation of the checks
   rather than two that can drift.

   It is skipped (not failed) when nothing has been built, so a fresh clone can
   run `npm test` before it has a toolchain.
   ========================================================================== */
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

function runVerify() {
  const args = ['android/build_apk.py', '--verify'];
  const sdk = process.env.ANDROID_SDK || (process.env.TEMP ? join(process.env.TEMP, 'kilotools', 'sdk') : '');
  const javaHome = process.env.JAVA_HOME || (process.env.TEMP ? join(process.env.TEMP, 'kilotools', 'jdk') : '');
  if (sdk && existsSync(sdk)) args.push('--sdk', sdk);
  if (javaHome && existsSync(javaHome)) args.push('--java-home', javaHome);
  return new Promise((done) => {
    execFile('python', args, { cwd: ROOT, timeout: 300000 }, (err, stdout, stderr) => {
      done({ code: err ? (err.code || 1) : 0, out: (stdout || '') + (stderr || '') });
    });
  });
}

test.describe('android artifact', () => {
  test('the APK ships this exact web build, signed and aligned', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'not browser specific');
    const apk = join(ROOT, 'dist', 'The Wild West.apk');
    test.skip(!existsSync(apk), 'no APK built yet - run: python android/build_apk.py');

    const res = await runVerify();
    testInfo.annotations.push({ type: 'build_apk.py --verify', description: res.out.trim().split('\n').slice(-6).join(' | ') });
    expect(res.code, 'verify exited ' + res.code + ':\n' + res.out).toBe(0);
    expect(res.out, 'the assets inside the APK are compared').toMatch(/assets.*compared|assets match/i);
    expect(res.out, 'the verify report must contain no failure lines').not.toMatch(/\bFAIL:/);
  });
});
