import type { NextConfig } from 'next';

/**
 * The API origin the browser's /api/* calls are proxied to. Read when Next
 * evaluates this config (at build time for `next build`), so every deploy
 * supplies the value from its environment instead of relying on a host name
 * baked into the code. Trailing slashes are trimmed so the proxy path never
 * becomes `/api//...`.
 */
const apiOrigin = (process.env.API_ORIGIN ?? 'http://localhost:4000').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
