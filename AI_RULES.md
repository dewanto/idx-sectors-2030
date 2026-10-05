# AI Rules

## Tech Stack

- **Framework:** Next.js 16 (App Router) with React 19 — all routes live under `src/app/` using the `[lang]` dynamic segment for i18n.
- **Language:** TypeScript (strict mode) with `tsconfig.json` path alias `@/*` → `./src/*`.
- **Styling:** Tailwind CSS v4 (via `postcss`) — no CSS-in-JS; use Tailwind utility classes for all layout, spacing, and colors.
- **Database:** PostgreSQL accessed through **Drizzle ORM** (`drizzle-orm/node-postgres` + `pg` Pool). Schema is defined in `src/db/schema.ts`; migrations run via `drizzle-kit push` (`npm run db:push`).
- **Animations:** `framer-motion` for declarative motion; `lucide-react` for all icons.
- **Fonts:** `next/font/google` — Space Grotesk (body) and IBM Plex Mono (mono), exposed as CSS variables `--font-grotesk` / `--font-mono`.
- **Environment:** `dotenv` loaded in `drizzle.config.ts`; runtime env vars read from `process.env` (never hard-code secrets).
- **i18n:** Custom lightweight i18n — locale is the first URL segment (`/[lang]/...`); dictionaries live in `src/i18n/`.

## Library Usage Rules

| Concern | Library | Notes |
|---|---|---|
| UI components | shadcn/ui | Prefer prebuilt components; do **not** edit the generated files in `src/components/ui/`. |
| Icons | `lucide-react` | Import named icons only. |
| Animations | `framer-motion` | Use for page transitions, hover states, and motion; keep variants in the same file. |
| Database | `drizzle-orm` | All queries go through `src/db/index.ts` (`db` export). Never use raw `pg` queries outside the db layer. |
| DB migrations | `drizzle-kit` | Run via `npm run db:push`. Never hand-write SQL migration files. |
| Styling | Tailwind CSS | Use utility classes; extend via `globals.css` only. No styled-components. |
| Routing | Next.js App Router | Routes are file-based under `src/app/`. Keep all routes in the App Router (no `pages/` directory). |
| HTTP API | Next.js Route Handlers | API endpoints live in `src/app/api/` as `route.ts` files. |
| Environment | `process.env` | Read via `process.env.VAR`. Server-only secrets must never reach the client bundle. |
| Fonts | `next/font/google` | Use the existing Space Grotesk / IBM Plex Mono setup. |

## Project Conventions

- **Source layout:** `src/app/` (routes), `src/components/` (UI), `src/db/` (data layer), `src/lib/` (domain logic), `src/i18n/` (translations).
- **Path alias:** Use `@/` for all internal imports (e.g. `@/components/Nav`).
- **Type safety:** Keep `strict: true`; run `npm run typecheck` before committing.
- **Linting:** Run `npm run lint` — ESLint with `eslint-config-next`.
- **Dev workflow:** `npm run dev` starts the local server on `http://localhost:3000`.
