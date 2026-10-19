# Backend

## Overview

The backend is the Express API workspace. It currently exposes the health endpoint and will host the application, domain, infrastructure, and presentation layers as features are added.

## Key files

| File                                             | Owns                                                          |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `src/server.ts`                                  | Express app setup, `/health`, `/api/auth`                     |
| `src/server.test.ts`                             | Health smoke test without a database or Redis                 |
| `src/infrastructure/database/drizzle/schema.ts`  | Single source of truth for every table, index, and constraint |
| `src/infrastructure/database/drizzle/client.ts`  | Pool, `getDb`, startup probe, test database override          |
| `src/infrastructure/database/drizzle/context.ts` | `AsyncLocalStorage` tenant context (`getTenantId`)            |
| `src/application/services/auth.service.ts`       | Core authentication and tenant logic (Clean Arch)             |
| `package.json`                                   | Backend scripts and dependencies                              |

## Commands

Run from the repository root with npm workspaces:

```bash
npm run dev --workspace @f-commerce/backend
npm run build --workspace @f-commerce/backend
npm run lint --workspace @f-commerce/backend
npm run typecheck --workspace @f-commerce/backend
npm run test --workspace @f-commerce/backend
npm run db:generate --workspace @f-commerce/backend
npm run db:migrate --workspace @f-commerce/backend
```

Migrations live in `backend/drizzle/migrations/`. `db:generate` derives them from `schema.ts`; never edit the SQL by hand.

## Conventions

- The workspace uses native ESM and strict TypeScript.
- Keep the health smoke test independent from external services.
- Keep backend dependencies behind the four Clean Architecture layers defined by the root context.
- Use named exports and avoid `any`.
- Take every host value (port, database URL, Redis URL, CORS origins, secrets) from validated environment variables. No host-specific API, SDK, or config file belongs in this workspace, and no host name is hardcoded.

## Gotchas

- The backend development server uses port 4000 by default.
- The server validates the required backend environment variables from docs/specs/0001-stack-and-architecture.md using Zod.
- Tenant isolation is enforced in two parts: `AsyncLocalStorage` carries the request's `businessId` (`context.ts`), and every Drizzle repository filters on `businessId` explicitly. There is no global query plugin, so a new repository method that forgets the filter leaks data across tenants. Background workers or admin scripts run outside a request must pass the tenant id themselves or use `runWithContext`.
- Integration tests run against a real PostgreSQL database, not an in-memory one, so `npm run test` needs a reachable server. `src/test-support/pg-test-database.ts` creates `<database>-test`, applies `backend/drizzle/migrations`, and truncates between tests. Test files must stay serial (`vitest.config.ts` sets `fileParallelism: false`) because they share that database.
- Foreign keys mean seeded rows need their parents first: insert a `businesses` row before customers, orders, or catalog rows.
- Timestamps use Drizzle's `Date` mode. Repositories set `updatedAt` by hand; the column default only covers inserts.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite._
