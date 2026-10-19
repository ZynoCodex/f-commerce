This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font/google`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to load DM Sans and IBM Plex Mono, with local system fallbacks.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

## Deployment

The app is host agnostic and must build and run on any Node.js 24 platform: a managed PaaS, a container host, or a plain VM.

- Install from the repository root with `npm ci`.
- Build the shared contracts first: `npm run build --workspace @f-commerce/contracts`.
- Build and start this workspace: `npm run build --workspace @f-commerce/frontend`, then `npm run start --workspace @f-commerce/frontend` (`next start`).
- Set `API_ORIGIN` to the deployed API origin. The Next.js server proxies `/api/*` to it, so the browser only ever calls this app's own origin and no CORS or public API URL is involved.
- No provider-specific config file belongs in the repository. If your host asks for a project root or install directory, point it at `frontend` and install from the repository root.

See the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for host specific details.
