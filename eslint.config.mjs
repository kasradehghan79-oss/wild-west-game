/* ==========================================================================
   The Wild West - eslint.config.mjs
   Lint rules chosen for correctness, not for taste.

   The game's files are classic scripts sharing one global scope, which is what
   makes `no-undef` the single most valuable rule here: it is what catches a
   misspelled identifier, a name used before it exists, or something that only
   works because it happens to be a browser global. tools/globals.json is the
   inventory of what legitimately exists, and tools/audit-structure.mjs keeps it
   honest.

   Formatting rules are deliberately absent: the code has a consistent style by
   hand, and a linter that argues about quotes and spacing produces churn without
   making anything work.
   ========================================================================== */
import globals from 'globals';
import { readFileSync } from 'node:fs';

// read rather than imported: a JSON import hands back a namespace, and depending on the
// Node version the parsed object is under .default, which silently yields no globals.
const shared = JSON.parse(readFileSync(new URL('./tools/globals.json', import.meta.url), 'utf8'));

export default [
  {
    ignores: [
      'js/vendor/**',
      'node_modules/**',
      'dist/**',
      'android/build/**',
      'tests/.report/**',
      'test-results/**'
    ]
  },
  {
    // the game: classic scripts, one shared global scope
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ...shared.globals }
    },
    rules: {
      'no-undef': 'error',
      // our globals are genuinely declared in files; the list exists for no-undef, so it must
      // not also read as a builtin being redeclared
      'no-redeclare': ['error', { builtinGlobals: false }],
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-dupe-class-members': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-cond-assign': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-sparse-arrays': 'error',
      'no-unsafe-negation': 'error',
      'no-prototype-builtins': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-var': 'error',
      // prefer-const is off for the game: a name declared with let in one file is assigned
      // from another, which the rule cannot see, so every one of them reads as a false hit.
      'prefer-const': 'off',
      'eqeqeq': ['error', 'smart'],
      'no-throw-literal': 'error',
      'no-return-assign': 'error',
      'no-sequences': 'error',
      'no-template-curly-in-string': 'error',
      'require-atomic-updates': 'off'
    }
  },
  {
    // tests and tooling: ES modules on Node
    files: ['tests/**/*.mjs', 'tools/**/*.mjs', 'playwright.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // tests run on Node but their page.evaluate callbacks are executed *in the page*,
      // so they legitimately reference the browser and the game's shared globals
      globals: { ...globals.node, ...globals.browser, ...shared.globals }
    },
    rules: {
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'eqeqeq': ['error', 'smart'],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  }
];
