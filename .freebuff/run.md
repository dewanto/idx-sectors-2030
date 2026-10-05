# Run doc — IDX Sectors 2030 (dev preview)

Stack: Next.js 16 App Router (Turbopack) + PostgreSQL 17 + Drizzle ORM.
Dev server command is the project default:  npm run dev
Next.js self-selects the port — the log line "Local: http://localhost:<port>" is
authoritative, never assume 3000 or a previously seen port.

## 1. Reproduce the artifacts

1. Node is NOT on the inherited PATH in Git Bash. Prefix every shell with:
       export PATH="/c/Program Files/nodejs:$PATH"
2. Dependencies (lockfile present):
       npm install
   npm warns that install scripts for esbuild / sharp / unrs-resolver were blocked
   ("npm warn allow-scripts"). Harmless: platform binaries arrive via optional
   dependencies and tsx works normally.
3. Environment file. Copy the env file from the main checkout into this worktree
   when it is missing (copy, never symlink; some values such as ports may need
   adapting per worktree):
       copy "C:UsersUSERDocumentsemergents-sdg-execution-intelligence.env" .env
   NEVER record its values in this doc, in code comments, or in transcripts.
   Keys that matter: DATABASE_URL (local Postgres), DIRECT_URL (optional, empty is
   treated as unset by drizzle.config.ts pick()), SECTORS_API_KEY (optional —
   without it the app serves the seeded demo dataset), and the SECTORS_* quota
   knobs (WATCHLIST_LIMIT, TOTAL_CREDIT_BUDGET, FUNDAMENTAL_MAX_AGE_DAYS, ...).
   Templates for a fresh environment: .env.example and .env.production.example.
4. PostgreSQL 17 must be RUNNING before any page renders — the query layer opens a
   connection on every request. Service postgresql-x64-17 autostarts with Windows:
       sc query postgresql-x64-17
   Local DB app_db, superuser postgres. The service does not autostart inside WSL
   or after a container rebuild.
5. Schema (drizzle-kit, env driven):
       npm run db:push
   Needed whenever schema.ts is ahead of the database — e.g. after the quota-policy
   work added the watchlist table and sync_state.empty_streak.
6. Data (both optional, zero API credits):
       npm run db:seed      # deterministic demonstration dataset
       npm run db:smoke:gann # 45 assertions, 0 credits
   Live data costs plan credits — run only when intended:
       npm run db:sync -- --dry-run   # cost plan, 0 API calls
       npm run db:sync                 # probe 1 credit on a closed day, ~21 on a trading day
   db:sync refuses up-front when the lifetime budget (1,000 credits) cannot cover
   the estimated run cost.

## 2. Run the server

Interactive (fine for a quick look; dies with the shell):
       export PATH="/c/Program Files/nodejs:$PATH"
       npm run dev
       # read the port from .freebuff/dev-server.log, then open
       # http://localhost:<port>/en

Detached (Windows PowerShell) — use this when the server must outlive the
conversation. stdout and stderr MUST go to different files or PowerShell fails:
       powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -RedirectStandardOutput '<workspace>.freebuffpreview-<threadId>.log' -RedirectStandardError '<workspace>.freebuffpreview-<threadId>.log.err' -WindowStyle Hidden -PassThru).Id"
       powershell -NoProfile -Command "Get-Process -Id <pid>"
Name the executable exactly (npm.cmd, node.exe) — Start-Process does not resolve
shell shims. Confirm the pid is alive a few seconds later, then wait until the
URL actually answers before registering.

Which pid to register: the npm wrapper is not the server. The listening socket is
owned by the next dev child (a node.exe pid). Find it with:
       netstat -ano | grep LISTENING | grep <port>
Register the preview with THAT pid.

Registering: call register_preview with the URL and the pid. Use a route that
renders in under ~2s on first hit — the register probe times out on slower
dev-compiled routes. In practice /en took 3.8-7.8s to render while /en/about
answered in 803ms, so a slow landing route is the usual cause of the
"did not answer an HTTP request" error even though curl works.

Verify before reporting success:
       curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/en
       curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/en/about
       curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/id/gann
   All three must print 200. Then preview_snapshot / preview_screenshot /
   preview_logs to confirm the page renders and the console is clean.

Current state of the live instance (re-verify, do not assume):
   port 64003 (binds 0.0.0.0 and [::]), wrapper pid 12636, next dev child pid 4272,
   log .freebuff/dev-server.log, registered preview URL http://localhost:64003/en/about
   The port changes on every restart — always read the log line.
