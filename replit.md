# FinCommand — Executive Treasury

A private executive treasury control system for an MD and payment assistants to manage bills, vendor payments, wallet balances, and approvals.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `SESSION_SECRET` — random secret for express-session (throws at startup if missing)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + express-session (cookie-based auth)
- DB: PostgreSQL + Drizzle ORM
- Session store: custom `DrizzleSessionStore` (Drizzle-backed, stored in `sessions` table)
- Auth: bcrypt password hashing, session-based identity, `requireAuth` middleware
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Mobile: Expo + React Native (Expo Router)

## Where things live

- `artifacts/api-server/src/app.ts` — Express app setup, session middleware, CORS allowlist
- `artifacts/api-server/src/routes/` — all API routes (auth, bills, dashboard, notifications, reports, users, wallets, vendors)
- `artifacts/api-server/src/lib/requireAuth.ts` — `requireAuth` middleware (attaches `req.user` from session)
- `artifacts/api-server/src/lib/session-store.ts` — `DrizzleSessionStore` implementation
- `artifacts/api-server/src/lib/seed.ts` — seed script (users, bills, vendors, wallets, notifications)
- `lib/db/src/schema.ts` — canonical DB schema (source of truth)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contracts)
- `artifacts/mobile/context/AuthContext.tsx` — `AuthContext` + `useAuth()` hook
- `artifacts/mobile/app/(tabs)/alerts.tsx` — alerts/notifications screen

## Seeded credentials

| Role | Email | Password |
|------|-------|----------|
| MD (Chief Executive) | `md@fincommand.ng` | `FinCommand2026!` |
| Payment Assistant A | `mra@fincommand.ng` | `MrA@2026` |
| Payment Assistant B | `mrb@fincommand.ng` | `MrB@2026` |
| Payment Assistant C | `mrc@fincommand.ng` | `MrC@2026` |

## Architecture decisions

- **Custom DrizzleSessionStore** rather than `connect-pg-simple` — keeps sessions in the same Drizzle-managed DB, avoids a separate raw-PG dependency, and stays fully typed.
- **Session cookie** `fincommand.sid`: `httpOnly`, `secure` in production, `sameSite: none` in production / `lax` in dev; `trust proxy: 1` set so cookies work behind Replit's HTTPS proxy.
- **Role-based data scoping on the server**: non-MD users are always scoped to `req.user.id` regardless of query params; MD can optionally filter by `?userId=` or see all. Applied to bills, dashboard, reports, notifications.
- **MD-only actions**: `/approve`, `/reject`, `/hold`, `/partial-approve` on bills return 403 for non-MD roles.
- **CORS**: explicit allowlist built from `REPLIT_DOMAINS` env var; `credentials: true` is safe because origin is constrained.

## Product

- **Bills**: payment assistants submit bills for vendor payments; MD reviews and approves/rejects/holds/partially approves.
- **Dashboard**: real-time summary of scheduled payments, outstanding liabilities, wallet balances, overdue bills.
- **Wallets**: track fund balances across multiple accounts.
- **Notifications**: role-scoped alerts for bill status changes and comments.
- **Reports**: outstanding liabilities, pending approvals, paid today, partial payments — all role-scoped.
- **Audit trail**: every bill action is logged with actor identity and timestamp.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `pnpm --filter @workspace/db run push` requires a TTY — run from the shell, not from a script. For CI-like environments, use `psql` directly.
- Session store table is `sessions` (not `user_sessions`). If the table is missing, the server will crash on login.
- `REPLIT_DOMAINS` is set automatically by Replit in the runtime env — no need to set it manually in dev.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
