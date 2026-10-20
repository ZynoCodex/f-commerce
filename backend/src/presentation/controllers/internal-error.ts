import type { Response } from 'express';

/** Public message for unexpected failures; details stay in the server log. */
export const INTERNAL_ERROR_MESSAGE = 'The server could not complete the request.';

/**
 * Log the underlying failure for operators and return a fixed body so driver
 * errors never leak schema names, constraints, or SQL fragments to clients.
 */
export function sendInternalError(res: Response, error: unknown): void {
  // Keep query strings out of logs; AC-16 forbids logging seller supplied text.
  console.error(`Unhandled ${res.req.method} ${res.req.path} error:`, error);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: INTERNAL_ERROR_MESSAGE });
}
