import type { NextConfig } from 'next';

/**
 * The API origin the browser's /api/* calls are proxied to. Read when Next
 * evaluates this config (at build time for `next build`), so every deploy
 * supplies the value from its environment instead of relying on a host name
 * baked into the code. A production build fails loudly when it is missing,
 * because the local development fallback would deploy a proxy that points at
 * localhost. Trailing slashes are trimmed so the proxy path never becomes
 * `/api//...`.
 */
const configuredApiOrigin = process.env.API_ORIGIN?.trim();

if (!configuredApiOrigin && process.env.NODE_ENV === 'production') {
  throw new Error('API_ORIGIN must be set to the deployed API origin for a production build.');
}

function parseApiOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`API_ORIGIN must be an absolute URL. Received: "${value}"`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`API_ORIGIN must use http or https. Received: "${value}"`);
  }

  return value.replace(/\/+$/, '');
}

const apiOrigin = parseApiOrigin(configuredApiOrigin ?? 'http://localhost:4000');

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
