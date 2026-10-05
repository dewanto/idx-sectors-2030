import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Env-driven Drizzle config.
 *
 * - Local dev: DATABASE_URL (localhost Postgres)
 * - Production migrations: DIRECT_URL or SUPABASE_DIRECT_URL (Supabase direct,
 *   port 5432 — drizzle-kit needs the direct connection; pgbouncer in
 *   transaction mode on the pooled endpoint breaks schema introspection).
 *
 * Empty-string env vars are treated as unset so a stub `DIRECT_URL=` in .env
 * doesn't shadow DATABASE_URL.
 */
const pick = (...vals: (string | undefined)[]): string =>
  vals.find((v) => v && v.trim()) ?? "";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: pick(
      process.env.DIRECT_URL,
      process.env.SUPABASE_DIRECT_URL,
      process.env.DATABASE_URL,
    ),
  },
});
