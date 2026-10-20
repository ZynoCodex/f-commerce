import { isTimeoutError } from './auth-client';
import { CatalogApiError } from './catalog-client';

export interface DuplicateSkuNotice {
  message: string;
  existingProductId: string;
  archived: boolean;
}

export function catalogMessage(error: unknown): string {
  if (isTimeoutError(error)) {
    return 'The request timed out. Reload before trying again.';
  }
  if (error instanceof CatalogApiError && error.status >= 500) {
    return 'The server could not complete the request. Try again.';
  }
  return error instanceof Error ? error.message : 'Something went wrong';
}

export function fieldErrorsFromServer(fields: string[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field, 'Check this value.']));
}

export function fieldErrorsFromIssues(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? '');
    if (field !== '' && fields[field] === undefined) {
      fields[field] = issue.message;
    }
  }
  return fields;
}

/** Turn a DUPLICATE_SKU response into the details the form shows. */
export function duplicateSkuFromError(error: unknown): DuplicateSkuNotice | null {
  if (!(error instanceof CatalogApiError) || error.code !== 'DUPLICATE_SKU') return null;
  const existingProductId = error.body.existingProductId;
  if (existingProductId === undefined) return null;

  return {
    message: error.message,
    existingProductId,
    archived: error.body.archived === true,
  };
}
