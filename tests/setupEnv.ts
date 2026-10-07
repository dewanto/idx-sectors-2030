/**
 * Runs before every test file (jest.config.js → `setupFiles`), BEFORE the
 * test modules are imported.
 *
 * - SECTORS_MIN_INTERVAL_MS = "0": `src/lib/sectors.ts` reads this constant at
 *   module load to configure the global pacer. Zeroing it here means pace()
 *   never sleeps between calls, so retry tests can drive backoff purely with
 *   jest fake timers.
 * - SECTORS_API_KEY gets a dummy default. Key-validation tests delete/restore
 *   it with save/restore inside their own before/after hooks.
 */
process.env.SECTORS_MIN_INTERVAL_MS = "0";
process.env.SECTORS_API_KEY = process.env.SECTORS_API_KEY || "unit-test-dummy-key";

export {};