import type { Request, Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

/** Every limiter returns the API's JSON error shape instead of Express's default text. */
function sendRateLimited(_request: Request, response: Response): void {
  response.status(429).json({
    error: 'RATE_LIMITED',
    message: 'Too many requests. Please try again later.',
  });
}

/**
 * Common header and response options. `standardHeaders: 'draft-8'` exposes the
 * `RateLimit` and `Retry-After` headers; legacy `X-RateLimit-*` headers are off
 * so clients only have one contract.
 */
const baseOptions = {
  standardHeaders: 'draft-8' as const,
  legacyHeaders: false,
  handler: sendRateLimited,
};

/**
 * Per-IP backstop for the whole API. `/health` is skipped so platform probes
 * never depend on the limiter's store. The limit is per client IP, so the
 * host's proxy must set or normalize `X-Forwarded-For`: the backend trusts
 * exactly one proxy hop (`trust proxy = 1`).
 */
export const globalRateLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60_000,
  limit: 100,
  skip: (request) => request.path === '/health',
});

/**
 * Two login limiters: one per IP and one per account. The IP bucket blocks a
 * single client spraying many accounts; the account bucket blocks a distributed
 * attack on one account. Successful sign-ins do not consume either allowance.
 */
export const loginIpRateLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
});

function loginAccountKey(request: Request): string {
  const email = (request.body as { email?: unknown } | undefined)?.email;
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (normalized === '') {
    return `login:ip:${ipKeyGenerator(request.ip ?? '')}`;
  }

  return `login:${normalized}`;
}

export const loginAccountRateLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60_000,
  limit: 20,
  skipSuccessfulRequests: true,
  keyGenerator: loginAccountKey,
});

export const registerRateLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60_000,
  limit: 5,
});

export const refreshRateLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60_000,
  limit: 60,
});

/**
 * Uploads buffer whole files in memory before Cloudinary sees them, so this
 * limiter runs before multer on the image routes. Authenticated routes key on
 * the verified user instead of a header a client can spoof.
 */
export const uploadRateLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60_000,
  limit: 10,
  keyGenerator: (request) =>
    request.user?.userId
      ? `upload:${request.user.userId}`
      : `upload:ip:${ipKeyGenerator(request.ip ?? '')}`,
});
