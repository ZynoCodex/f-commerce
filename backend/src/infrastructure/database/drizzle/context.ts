import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestContext {
  userId?: string;
  businessId?: string;
  role?: 'OWNER' | 'STAFF';
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getTenantId(): string | undefined {
  const store = requestContext.getStore();
  return store?.businessId;
}

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return requestContext.run(context, fn);
}
