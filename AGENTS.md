# F Commerce Order Manager

## Stack

- **Language and runtime**: TypeScript, Node.js 24 LTS
- **Framework**: Next.js app router, Express
- **Key dependencies**: PostgreSQL with Drizzle ORM, JWT authentication, BullMQ with Redis, Cloudinary
- **Package manager**: npm 11 with npm workspaces

## Build approach

Tracer Bullet, build each feature as a thin complete path through the database, API, and UI.

## Commands

```bash
# Install
npm ci

# Dev servers
npm run dev

# Build
npm run build

# Test
npm run test

# Quality checks
npm run lint
npm run typecheck
npm run format:check
```

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title.md`.

## Deployment

Host agnostic. The frontend and the API deploy as two independent services to any Node.js 24 platform: a managed PaaS, a container host, or a plain VM, with no code change between them.

- Use no host-specific APIs, config files, build hooks, or SDKs.
- Read every host value (port, public origin, database URL, secrets, service URLs) from a validated environment variable. Never hardcode a host name.
- The browser calls the frontend origin only. The Next.js server proxies `/api/*` to `API_ORIGIN`, so no CORS and no `NEXT_PUBLIC_` variable is needed in production.
- Deployment builds the `packages/contracts` workspace before the application workspace, then starts it with that workspace's `start` script.
- Keep `/health` unauthenticated and free of external dependencies so any platform can probe it.
- Keep background work in its own process entry point so it can run as a separate service on hosts that require it.

## Rules

- Keep the four Clean Architecture layers separate: `domain`, `application`, `infrastructure`, and `presentation`.
- Keep domain logic independent from frameworks, databases, HTTP clients, and other I/O.
- Make outer layers depend on inner layers, never the reverse.
- Keep use cases as thin orchestrators and enforce business invariants in entities.
- Use DTOs or plain objects across layer boundaries. Do not expose domain entities to presentation code.
- Use strict TypeScript. Avoid `any` and require exhaustive types.
- Organize application code by layer, with clear and consistent naming.
- Document public APIs and use one consistent error handling pattern.
- Validate environment variables at startup and use named exports only.
- Keep the UI accessible to the WCAG AA baseline.
- Use conventional commit messages.

## Tooling

- Use the standard ESLint and Prettier setup for Next.js and Express.
- Run lint, format, and typecheck before each commit.
- Use unit and integration tests.
- Run basic continuous integration checks on push for lint, typecheck, and tests.

## Git

- integration: on
- branch prefix: `feat/`
- commit: per milestone

## Agent skills

- [lucide-icons](.agents/skills/lucide-icons/): `aksuharun/skills`, Lucide icons across frontend frameworks.
- [vercel-composition-patterns](.agents/skills/vercel-composition-patterns/): `vercel-labs/agent-skills`, React composition patterns.
- [deploy-to-vercel](.agents/skills/deploy-to-vercel/): `vercel-labs/agent-skills`, deployment workflows when Vercel happens to be the chosen host.
- [vercel-react-best-practices](.agents/skills/vercel-react-best-practices/): `vercel-labs/agent-skills`, React and Next.js practices.
- [vercel-react-native-skills](.agents/skills/vercel-react-native-skills/): `vercel-labs/agent-skills`, React Native practices if mobile code is added.
- [vercel-react-view-transitions](.agents/skills/vercel-react-view-transitions/): `vercel-labs/agent-skills`, view transition patterns.
- [vercel-cli-with-tokens](.agents/skills/vercel-cli-with-tokens/): `vercel-labs/agent-skills`, CLI workflows when Vercel happens to be the chosen host.
- [vercel-optimize](.agents/skills/vercel-optimize/): `vercel-labs/agent-skills`, web performance optimization.
- [web-design-guidelines](.agents/skills/web-design-guidelines/): `vercel-labs/agent-skills`, web design and accessibility guidance.
- [writing-guidelines](.agents/skills/writing-guidelines/): `vercel-labs/agent-skills`, clear writing guidance.

MCP servers: `@modelcontextprotocol/server-postgres` (recommended), `@modelcontextprotocol/server-git` (recommended). Host-specific MCP servers, such as `https://mcp.vercel.com`, are optional and only useful when that host is the chosen target.

## Context files

<!-- Nested AGENTS.md files are listed here as they are created -->

- [backend/AGENTS.md](backend/AGENTS.md) (Express API workspace conventions and commands)
- [frontend/AGENTS.md](frontend/AGENTS.md) (Next.js generated guidance)
- [packages/contracts/AGENTS.md](packages/contracts/AGENTS.md) (shared DTO and schema boundary)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
