/**
 * CLI entry point for the sync pipeline (`npm run db:sync`).
 *
 * Kept separate from `src/db/sync.ts` so that importing `runSync()` from the
 * cron API route (`/api/sync`) never triggers an automatic sync — this file
 * is the only place that starts one from argv and exits the process.
 */
import "dotenv/config";
import { pool } from "./index";
import { runSync } from "./sync";

/* sync.ts parses the same process.argv into its stage flags (--full, --index,
   --dry-run), so the CLI flags keep working exactly as before. */
const flowArg = process.argv.find((a) => a === "--flow" || a.startsWith("--flow="));

runSync({
  dryRun: process.argv.includes("--dry-run"),
  full: process.argv.includes("--full"),
  flowLimit: flowArg
    ? flowArg.includes("=")
      ? Number(flowArg.split("=")[1]) || 10
      : 10
    : undefined,
})
  .then(async (result) => {
    await pool.end();
    process.exit(result.exitCode);
  })
  .catch(async (err) => {
    console.error("Sync failed:", err instanceof Error ? err.message : err);
    await pool.end().catch(() => {});
    process.exit(1);
  });