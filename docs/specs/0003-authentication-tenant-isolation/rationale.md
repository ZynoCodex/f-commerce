> **Note (2026-10-18)**: The mechanism below changed. Tenant isolation no longer uses a global Mongoose plugin: the request's `businessId` still travels in `AsyncLocalStorage` (`backend/src/infrastructure/database/drizzle/context.ts`), but each Drizzle repository filters on it explicitly. The rest of this record explains why isolation was enforced in one place rather than per call site; that intent still holds through the repository layer. See the note at the top of `index.md`.

## Context

The F-commerce SaaS platform manages critical business data (orders, inventory, customers) for multiple independent businesses. A user must be able to securely sign in (via Email+Password or OAuth) and act on behalf of a business. Crucially, a user acting in one business context must absolutely not be able to read or modify data belonging to another business. Without a bulletproof isolation mechanism, cross-tenant data leaks are possible.

## Options considered

### Option 1: Manual businessId filtering in repositories

Every database query explicitly includes `{ businessId: currentBusinessId }`.

**Pros**:

- Explicit control in every repository method.
- No "magic" middleware behavior.

**Cons**:

- Highly error-prone; a developer forgetting the filter causes a massive security breach.

### Option 2: Global Mongoose plugin with AsyncLocalStorage (chosen)

Node.js `AsyncLocalStorage` stores the current request's `businessId`, and a Mongoose plugin automatically appends it to all queries.

**Pros**:

- Bulletproof isolation; developers cannot accidentally forget to filter.
- Code remains clean without passing `businessId` manually everywhere.

**Cons**:

- Slightly obscures the query shape (magic behavior).
- Requires careful handling of cross-tenant or background job queries.

## Rationale

Relying on developers to manually pass `businessId` to every query is too risky for a multi-tenant SaaS. Using `AsyncLocalStorage` and a Mongoose plugin guarantees that the query filter is applied universally, protecting against human error. Separating `BusinessMember` from `User` enables future capabilities like users participating in multiple businesses, while keeping the data model flexible.
