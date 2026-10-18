# 0001. Adopt the project stack and architecture

**Date**: 2026-09-08
**Status**: Accepted

> **Revision (2026-10-18)**: The database choice changed from MongoDB + Mongoose to PostgreSQL 18 + Drizzle ORM after the first three features shipped, and the stack table and constraints below now record the new decision. In practice: `DATABASE_URL` replaces `MONGODB_URI`; Drizzle repositories replaced the Mongoose models and `backend/src/infrastructure/database/drizzle/schema.ts` is the source of truth for the data model; Docker Compose runs `postgres` and `redis` with no replica set; the JWT settings are `JWT_SECRET` and `JWT_REFRESH_SECRET` with token lifetimes fixed in code (15 minutes for access tokens, 7 days for refresh tokens); and backend tests run against a real PostgreSQL database that the test setup creates and migrates. Why: the catalog, orders, and customers are relational, and PostgreSQL enforces that shape with foreign keys, partial unique indexes, and transactions.

## Summary

The project will use one repository with separate frontend and backend workspaces. The Next.js app will deploy to Vercel and the Express API will deploy to Render, so deployment boundaries stay clear while local development and shared TypeScript contracts stay simple. PostgreSQL 18 with Drizzle ORM, JWT authentication, BullMQ with Redis, and Cloudinary form the chosen service foundation.

## Context

A small F-commerce SaaS needs a clean separation between the seller-facing web app and the API that serves it. The product targets solo developers and small teams building for the Bangladesh market (BDT currency, Bengali language). Key forces: mobile-first responsiveness, multi-tenant data isolation, subscription billing in the future, and a 2-3 month MVP timeline with one developer. The current project is already one Git repository, so the repository shape must support two applications without adding unnecessary repository coordination.

## Options considered

### Option 1: Monorepo with two workspaces (chosen)

One repository contains a `frontend` workspace for Next.js and a `backend` workspace for Express. The workspaces share TypeScript contracts when useful, but each keeps its own dependencies, scripts, and deployment configuration. The frontend deploys to Vercel and the backend deploys to Render.

**Pros**: One remote and one review history, simple local setup, shared contracts, and independent deployment targets.

**Cons**: Workspace scripts and dependency boundaries need discipline. A repository change can affect both deployment pipelines, and the two applications still require separate deployment configuration.

### Option 2: Separate frontend and backend repos

Two independent repositories are deployed separately. The frontend runs on Vercel and the backend runs on Render.

**Pros**: Strong repository isolation, independent history, and independent tooling and access control.

**Cons**: Two remotes, two review histories, duplicated setup, and more coordination for one developer. Shared contracts become harder to change safely.

### Option 3: Full-stack Next.js (API routes)

Frontend and API in one Next.js app deployed to Vercel.

**Pros**: Fastest to ship, no cross-origin issues, one deployment.

**Cons**: The user's product spec explicitly calls for a separate backend API. Mixing API routes with the frontend app makes it harder to scale the backend independently later. Not the right shape for a multi-tenant SaaS that may eventually split.

## Decision

**Chosen option**: Option 1: Monorepo with two workspaces.

The repository will contain `frontend` and `backend` workspaces. The Next.js app deploys independently to Vercel, and the Express API deploys independently to Render. npm workspaces provide the initial workspace tooling because they are built into npm, require no additional task runner, and are sufficient for two applications.

**Implementation skills**: `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.agents/skills/vercel-react-best-practices/`) · `deploy-to-vercel` (`vercel-labs/agent-skills`, `.agents/skills/deploy-to-vercel/`)

## Rationale

The product needs a separate frontend and backend, but separate deployment does not require separate repositories. A monorepo fits the existing Git remote and keeps shared TypeScript contracts close to both applications. npm workspaces avoid adding Turborepo or Nx before the project has enough packages to justify another task runner. Vercel and Render still build and deploy each workspace independently, so the deployment boundary chosen for the product is preserved.

## Proposed stack

| Layer                       | Choice                                                | Reason                                                                                                                                                                                                                                          |
| --------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language                    | TypeScript                                            | The user's spec requires TypeScript strict mode. Shared types between frontend and backend reduce bugs.                                                                                                                                         |
| Runtime and package manager | Node.js 22 LTS, npm 10                                | Pinning the runtime family and package manager keeps local, CI, Vercel, and Render dependency resolution consistent.                                                                                                                            |
| Frontend framework          | Next.js (app router)                                  | The user chose this over React + Vite. App router gives built-in routing, server components, and SEO readiness if marketing pages are added later.                                                                                              |
| Backend framework           | Node.js + Express                                     | Matches the user's spec. Minimal and proven. The controller → service → repository pattern fits naturally.                                                                                                                                      |
| Primary DB                  | PostgreSQL 18 + Drizzle ORM                           | The catalog, orders, and customers are relational, so the database itself enforces foreign keys, partial unique indexes, and transactions. Drizzle keeps one typed schema file as the source of truth and stays behind the repository boundary. |
| Auth                        | JWT with custom endpoints and rotated refresh cookies | Short lived access tokens and rotated secure refresh cookies support separate frontend and backend origins without putting long lived tokens in browser storage.                                                                                |
| Background jobs             | BullMQ + Redis                                        | Async email sending and order processing. Adds Redis dependency but is the robust choice for a SaaS that will send notifications.                                                                                                               |
| File storage                | Cloudinary                                            | The user's spec lists Cloudinary first. Generous free tier, simple API, and easy to swap behind a service abstraction later.                                                                                                                    |
| Hosting                     | Frontend: Vercel, Backend: Render                     | Matches the user's spec. Both have generous free tiers for MVP. Vercel auto-deploys from GitHub; Render handles Node.js simply.                                                                                                                 |
| Repository shape            | Monorepo with `frontend` and `backend` npm workspaces | Keeps one repository and shared contracts while preserving independent deployment targets.                                                                                                                                                      |
| Shared contracts            | `packages/contracts`, types and Zod schemas only      | Both applications can share runtime checked request and response contracts without importing domain or infrastructure code.                                                                                                                     |
| API shape                   | Versioned REST JSON at `/api/v1`                      | Keeps the API explicit and evolvable. Responses use `{success, data, message}` and Zod validates runtime input and output boundaries.                                                                                                           |
| Observability               | Winston with structured logging                       | Matches the data model spec and provides JSON logs with a clear path to request IDs and secret redaction.                                                                                                                                       |
| Rate limiting               | Simple per-IP limiter                                 | One global limiter (e.g., 100 requests/min). Easy to implement, protects against abuse without complex config.                                                                                                                                  |

## Scaffold constraints

**Workspace layout**:

```text
frontend/                 Next.js application
backend/                  Express application
packages/contracts/       TypeScript DTOs, Zod schemas, enums, and API error types only
```

The contracts workspace must not import domain, application, infrastructure, or presentation code. The frontend must not import backend internals. Shared tooling dependencies belong at the repository root. Application dependencies belong to their own workspace.

**Scaffold acceptance**:

- The root workspace installs successfully with `npm ci`.
- The frontend starts on port 3000 and serves a working Next.js app.
- The backend starts on port 4000 and serves `/health`.
- The contracts workspace can be imported by both applications without importing backend internals.
- The root `dev`, `build`, `lint`, `typecheck`, `test`, and `format` scripts are present and document any command that is intentionally a no op before feature code exists.
- Docker Compose starts local PostgreSQL and Redis with credentials and ports documented in the environment examples.
- Each workspace has a minimal smoke test and an environment example file.

**Workspace contract**:

- The root package uses npm workspaces for `frontend`, `backend`, and `packages/contracts`.
- Workspace package names are `@f-commerce/frontend`, `@f-commerce/backend`, and `@f-commerce/contracts`.
- Node.js 22 and npm 10 are declared in the root `engines` field and documented in the contributor setup.
- TypeScript uses strict mode. Backend code targets Node.js 22 with native ESM. Frontend code follows the Next.js compiler defaults. Contracts compile to declarations and JavaScript that both applications can import.
- The initial scaffold pins compatible current major versions for Next.js, Express, Drizzle ORM, the `pg` driver, Zod, TypeScript, and Vitest in `package-lock.json`. Patch upgrades do not change this decision.
- The root scripts run `dev`, `build`, `lint`, `typecheck`, `test`, and `format` for all relevant workspaces. The root `dev` script uses one process for each application and does not start contracts as a server.
- Each application exposes explicit `dev`, `build`, `start`, `lint`, `typecheck`, and `test` scripts. The backend health smoke test runs without PostgreSQL or Redis. The other backend tests need a reachable PostgreSQL server, and the test setup creates and migrates a separate test database.
- The backend ships Drizzle SQL migrations under `backend/drizzle/migrations`, generated with `npm run db:generate` and applied with `npm run db:migrate`. Both scripts are configured by `backend/drizzle.config.ts`, which points drizzle-kit at the schema and the migrations folder.

**Boundary enforcement**:

The repository uses `frontend`, `backend`, and `packages/contracts` as the initial package boundaries. Backend folders follow `presentation`, `application`, `domain`, and `infrastructure`. TypeScript project references and ESLint import boundary rules reject frontend imports from backend internals, contracts imports from application or infrastructure code, and domain imports from framework or I/O packages.

**Runtime and commands**:

The repository uses npm workspaces with one root `package-lock.json`, a Node.js 22 LTS version policy, and npm 10. The root package must expose `dev`, `build`, `lint`, `typecheck`, `test`, and `format` commands. The root `dev` command runs the two workspace development servers together, using ports 3000 for the frontend and 4000 for the backend. The root build, lint, typecheck, and test commands must run the affected workspace commands consistently in local development and CI. Dependency installation uses `npm ci`.

**Local services**:

PostgreSQL and Redis run through a repository Docker Compose file for repeatable local development. Compose uses pinned PostgreSQL 18 and Redis 7.4 images, services named `postgres` and `redis`, persistent named volumes, local ports 5432 and 6379, authenticated local credentials, and health checks. The backend exposes `/health`, which returns HTTP 200 and a stable JSON success response without requiring either dependency.

The backend environment contract includes `NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGINS`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`, plus an optional `TEST_DATABASE_URL` for the test suite. The frontend environment contract includes `NEXT_PUBLIC_API_URL`. Required values are validated at startup. The `PORT` variable defaults to 4000 for local development and is supplied by the hosting platform in production. Development values are documented in `.env.example` files, while production secrets are supplied by the hosting providers.

A managed PostgreSQL service is the database target for the MVP, with the provider chosen before the first production deploy. Render Redis is the managed Redis target for the MVP. Cloudinary remains the file storage provider. The scaffold defines their connection and credential variables but does not require production credentials to run local smoke tests.

**Deployment boundaries**:

Vercel uses `frontend` as its project root, installs from the repository root, runs the frontend workspace build, and starts the Next.js application. Render uses `backend` as its service root, installs from the repository root, builds the backend workspace, and starts the backend workspace. Shared contracts are built or resolved from the root workspace graph in both deployments. Neither deployment runs the other application. Production deployment is not required for scaffold acceptance.

**Architecture mapping**:

In the backend, Express routes and controllers are the presentation layer, use cases are the application layer, entities and value objects are the domain layer, and Drizzle repositories and migration files, Redis workers, Cloudinary adapters, and Winston setup are the infrastructure layer. The domain layer has no framework or I/O imports. The frontend is a presentation client that depends on contracts and API responses, never on backend domain or infrastructure modules.

**Security and configuration defaults**:

The backend derives tenant context from verified authentication data and applies it to every business query. Each repository filters by `businessId` explicitly, and repository tests cover tenant isolation. Access JWTs are short lived. Refresh tokens are rotated and kept in secure HTTP only cookies. Cookie based endpoints use an explicit CSRF defense. CORS reads an allowlist from validated environment variables and includes local and approved preview origins only. Server secrets stay in the backend environment. Only the public API URL may use a `NEXT_PUBLIC_` variable in the frontend.

**CI boundaries**:

GitHub Actions runs on pull requests and the default branch. Frontend changes run frontend lint, typecheck, test, and build checks. Backend changes run backend lint, typecheck, test, and build checks. Changes to `packages/contracts`, root configuration, lockfiles, or shared tooling run checks for both workspaces. The workflow rejects a change when any check fails; path filters that skip unaffected checks are a follow up, and until they land every change runs the full check set. Vitest is the unit and integration test runner, each workspace includes one smoke test, and Playwright runs the end to end tests. CI starts a PostgreSQL service, applies Drizzle migrations, and runs the Playwright suite against the running applications. The backend health smoke test starts the application without PostgreSQL or Redis.

## Consequences

**Positive**:

- One repository keeps the frontend, backend, and shared contracts in sync.
- Clean application boundaries let each workspace evolve independently.
- TypeScript shared types make the API contract explicit and catch bugs at compile time.
- PostgreSQL enforces the relational data model with foreign keys, partial unique indexes, and transactions, and Drizzle migrations keep every environment aligned.
- Cloudinary's free tier handles product images without storage infrastructure.
- Render's free tier keeps backend costs near zero for the MVP window.

**Negative / tradeoffs**:

- One repository can trigger work across both deployment pipelines, so CI must identify affected workspaces.
- Workspace boundaries need clear scripts and dependency ownership.
- Cross-origin setup (CORS) adds a small configuration burden and a potential security misconfig point.
- Local development still needs two `npm run dev` processes.
- Redis adds one more infrastructure dependency for background jobs.
- Schema changes ship as Drizzle migrations, and backend tests need a reachable PostgreSQL server, so local test runs require the database to be running.

**Neutral**:

- Next.js app router uses server components by default; the frontend team must decide which components are server vs client.
- BullMQ requires a Redis instance; Render offers Redis as an add-on or a separate service.

## Follow-up

- [ ] Reconcile workspace commands and paths in `AGENTS.md` after the scaffold is up.
- [ ] Set up CORS config early (the first cross-origin request will fail without it).
- [ ] Add workspace aware CI path filters so unaffected checks are skipped.
- [ ] Confirm current provider pricing and limits before production deployment.
- [ ] Choose the managed PostgreSQL provider before the first production deploy.
- [ ] Apply Drizzle migrations during production deploys and document the rollback path before the first production deploy.
