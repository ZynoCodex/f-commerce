const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

/**
 * Drizzle wraps driver errors, so the PostgreSQL code sits on the cause chain
 * rather than on the error the caller catches.
 */
function hasPostgresCode(error: unknown, code: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current !== null && current !== undefined; depth += 1) {
    if ((current as { code?: unknown }).code === code) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export function isUniqueViolation(error: unknown): boolean {
  return hasPostgresCode(error, UNIQUE_VIOLATION);
}

export function isForeignKeyViolation(error: unknown): boolean {
  return hasPostgresCode(error, FOREIGN_KEY_VIOLATION);
}
