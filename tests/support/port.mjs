/* ==========================================================================
   The Wild West - tests/support/port.mjs
   One place for the port the test server listens on, shared by the config, the
   server and the page fixtures so they cannot drift apart.
   ========================================================================== */
export const PORT = 8137;
export const BASE_URL = `http://127.0.0.1:${PORT}`;
