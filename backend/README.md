# Backend

The Express API for F Commerce Order Manager. Workspace conventions and commands live in `AGENTS.md`; architecture and deployment decisions live in `docs/specs/0001-stack-and-architecture.md`.

## Deployment

The API is host agnostic and must build and run on any Node.js 24 platform: a managed PaaS, a container host, or a plain VM.

- Install from the repository root with `npm ci`.
- Build this workspace: `npm run build --workspace @f-commerce/backend`. Its `prebuild` script builds `packages/contracts` first, so no separate contracts step is needed.
- Apply migrations before the first start on a new database: `npm run db:migrate --workspace @f-commerce/backend`.
- Start it with `npm run start --workspace @f-commerce/backend` (`node dist/server.js`).
- Set the backend variables from `backend/.env.example`. `PORT` normally comes from the host, set `NODE_ENV=production` so the refresh cookie is `Secure`, keep the TLS mode on `DATABASE_URL` as a query parameter (for example `?sslmode=require`), and replace the development JWT secrets.
- Expose `/health` to the platform probe. It answers without PostgreSQL or Redis, so it only shows that the process is up.
- The server verifies the database connection before it binds the port, so a bad `DATABASE_URL` fails the deploy instead of serving errors.
- No provider-specific config file belongs in the repository. If your host asks for a project root or install directory, point it at `backend` and install from the repository root.
