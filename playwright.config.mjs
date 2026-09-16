/* ==========================================================================
   The Wild West - playwright.config.mjs
   Two projects, because there are two ways to play: a desktop browser with a
   keyboard and mouse, and a touch device in landscape. Both run the same game
   and the same specs; only the input fixtures differ.
   ========================================================================== */
import { defineConfig, devices } from '@playwright/test';

// A port of its own so the suite never collides with serve.cmd on 8080.
const PORT = 8137;

export default defineConfig({
  testDir: './tests',
  // Every test drives a full WebGL scene on a software GL driver at 4-6 frames a
  // second, so the budget has to be per test and generous, but not so generous
  // that a hung wait burns a minute before it gives up.
  timeout: 60000,
  expect: { timeout: 8000 },
  // One worker: the headless GL driver is software, and two of them starve each
  // other enough to make timing based assertions flaky.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'tests/.report' }]
  ],
  outputDir: 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  webServer: {
    command: `node tests/support/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: true,
    timeout: 30000,
    stdout: 'ignore'
  },
  projects: [
    {
      name: 'desktop',
      // The phone-only specs drive the on screen stick and buttons; the desktop
      // build has neither
      testIgnore: [/phone\./],
      use: {
        ...devices['Desktop Chrome'],
        // A small laptop window rather than 720p: every assertion in here is
        // relative, and halving the pixels roughly halves the frame time, which is
        // what the whole suite's runtime is made of.
        viewport: { width: 960, height: 540 },
        hasTouch: false,
        isMobile: false,
        deviceScaleFactor: 1
      }
    },
    {
      name: 'phone',
      testIgnore: [/desktop\./],
      use: {
        // A Nothing Phone (2a) held sideways: the shape the touch layout was
        // designed for, and the one in the bug reports.
        //
        // deviceScaleFactor stays at 1 even though the real phone is 2.625: the
        // layout is measured in CSS pixels, and rendering 2412x1084 per frame in
        // software is what made this suite take an hour. The render scale the
        // device ratio feeds into is checked explicitly in perf.spec.mjs, with the
        // ratio emulated for that one test.
        viewport: { width: 919, height: 413 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; A065) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'
      }
    }
  ]
});
