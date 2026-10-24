# Review: feat/orders, 2026-10-24

**Reviewed by**: Claude Sonnet 4.6 (author on DeepSeek V4.1 Flash)
**Scope**: 63 files, branch vs main
**Verdict**: Approve with nits

## Summary

This change implements a comprehensive order management system with strict status workflow, price snapshots, optimistic locking, idempotency, and delivery deadline tracking. The implementation follows Clean Architecture boundaries, enforces tenant isolation, and includes extensive test coverage across unit, integration, and E2E tests. The code is generally well structured with proper separation of concerns. Some minor improvements around error handling edge cases and a few type safety considerations would strengthen the implementation, but these are not blocking.

## Minor

### 🟡 Missing snapshot column NOT NULL constraints, `backend/drizzle/migrations/0002_slow_overlord.sql:22-23`

**Problem**: The migration adds `customer_name_snapshot` and `customer_phone_snapshot` as nullable columns without a backfill, then relies on migration `0003` to backfill them and `0004` to add the NOT NULL constraint. This creates a window where new orders could theoretically be created with null snapshots if something goes wrong between migrations.

**Why it matters**: If the migration sequence is interrupted or run partially, the application could attempt to create orders with null snapshot values, which would violate the domain invariant that every order must snapshot the customer data at creation.

**Suggested fix**: The multi-step migration approach (0002 add nullable, 0003 backfill, 0004 add NOT NULL) is the standard safe pattern for adding required columns to tables with existing rows. This is actually correct and safe. The application code already enforces the NOT NULL invariant at creation time, so this is not a real issue. Disregard this finding.

### 🟡 Idempotency key replay returns before tenant check, `backend/src/presentation/controllers/order.controller.ts:126-129`

**Problem**: When an idempotency key matches, `orderService.findIdempotent` is called before the request body is parsed. The service method `findDetailByIdempotencyKey` does check `getTenantId()`, but the controller returns the order with status 200 before calling `actorFromContext(req)`, which also calls `getTenantId()` and throws if it's missing.

**Why it matters**: If the business context is somehow not set (a middleware failure or misconfiguration), the idempotent replay could return an order from the wrong tenant or fail silently instead of returning a clear 400/403 error. The repository already filters by tenant, so this is defense in depth, not a real leak, but the error path is inconsistent with the create path.

**Suggested fix**: Call `actorFromContext(req)` before the idempotency lookup, or at minimum verify `getTenantId()` is set and return a 400 if not, so the error is consistent with the rest of the endpoint.

### 🟡 Duplicate check limits to 100 rows per customer, `backend/src/infrastructure/database/drizzle/repositories/order.repository.ts:282`

**Problem**: The duplicate check limits the search to the 100 most recent orders for the customer, ordered by `created_at`. If a customer has more than 100 orders in the previous 24 hours (unlikely but not impossible for a high volume seller or a test scenario), the duplicate check could miss a matching order outside that window.

**Why it matters**: The spec calls this a "best effort" check and acknowledges that parallel requests with different keys can race. The 100 row limit is a reasonable defense against a pathological query, but it's not documented in the code or the spec, so a future reader might not understand why a legitimate duplicate was not caught.

**Suggested fix**: Add a comment explaining the limit is a performance safeguard for the pathological case where a customer has hundreds of orders in 24 hours, and that the check is best effort as documented in AC-5. Alternatively, add a check count and index on `(business_id, customer_id, created_at)` if this becomes a measured bottleneck.

### 🟡 Phone search uses server-side regex without index, `backend/src/infrastructure/database/drizzle/repositories/order.repository.ts:217-220`

**Problem**: The phone digit search strips non-digits from `customer_phone_snapshot` with `regexp_replace` at query time. This is correct for matching formatted phone numbers, but it runs the regex on every row and cannot use an index, so it becomes a full table scan on the orders table when the search term looks like a phone number.

**Why it matters**: At MVP volume this is fine, and the spec acknowledges search will need an index later. However, the query is already using the `orders_business_created_idx` for the tenant and time order, so the phone regex runs on every candidate row. For a business with tens of thousands of orders, this could be slow.

**Suggested fix**: The spec already calls this out in "Consequences > Negative / tradeoffs" and "Follow-up". The implementation is correct for now. If this becomes a measured issue, either add a GIN trigram index on `customer_phone_snapshot`, or store a `phone_digits` computed column and index that.

### 🟡 Order item count subquery runs per list row, `backend/src/infrastructure/database/drizzle/repositories/order.repository.ts:161-164`

**Problem**: The list query includes `ORDER_ITEM_COUNT` as a correlated subquery that counts `order_items` per order. This is correct SQL and reads cleanly, but Postgres executes the subquery once per row, so a 20-row page runs 20 separate count queries instead of a single join with `GROUP BY`.

**Why it matters**: For a small page size (20 rows) this is negligible, and the query plan is simple. If the page size grows or the business has orders with many items, the repeated subquery could become a bottleneck compared to a single grouped join.

**Suggested fix**: This is a premature optimization concern. The current implementation is clear and correct. If profiling shows this is slow, rewrite it as a `LEFT JOIN` with `GROUP BY` and `count(order_items.id)`. Keep it as is for now.

## Nits

- ⚪ `backend/src/application/services/order.service.ts:185`, the `mergeLines` quantity overflow message says "between 1 and 1000" but the rejection message is "must stay between", which reads oddly for an upper bound. "must not exceed 1000" would be clearer.

- ⚪ `packages/contracts/src/order.ts:59`, the comment explaining `MAX_RAW_ORDER_LINES` is helpful, but it's placed above the constant definition, so a reader scanning the file sees the comment before seeing what it explains. Move it inline as a trailing comment.

- ⚪ `frontend/src/app/orders/page.tsx:62`, `requestEpoch` is used to invalidate in-flight requests when the filter or search changes, but it's incremented in multiple places. Extract `invalidateListRequests` to a `useCallback` and call it consistently, or use an `AbortController` per request instead of an epoch counter.

- ⚪ `frontend/src/lib/order-form.ts:`, the `localToday` helper and the deadline formatter both split the `YYYY-MM-DD` string by hand to avoid constructing a `Date`. This is correct and matches the spec, but it's repeated in two places. Consider a shared `parseDateString(isoDate: string): { year, month, day }` helper if other date fields are added later.

## Strengths

- Clean Architecture boundaries are well maintained: domain entities, application services, infrastructure repositories, and presentation controllers are cleanly separated, and the domain layer has no framework dependencies.
- Tenant isolation is enforced consistently: every repository method filters on `business_id` from the async context, and the controller verifies business role membership before allowing any order operation.
- Optimistic locking and version handling are correct: the service checks version before writing, increments by exactly 1 on actual changes, and returns 409 ORDER_CHANGED on stale version.
- The idempotency implementation is robust: the key lookup happens before body validation and duplicate checks, a unique constraint prevents double inserts, and a race on one key rolls back and returns the winner's order.
- Snapshot handling is thorough: customer name and phone, and every line's product name, variant label, price, and cost are captured at creation and never change except when explicitly editing the customer or line with its id.
- The delivery deadline implementation is careful: the `YYYY-MM-DD` string is never passed through a `Date` constructor, the badge is derived at render without a timer, and the edit lock follows the order edit rules.
- Test coverage is extensive: unit tests for entities and cursors, integration tests for the repository, route tests for the controller covering success and error paths, and E2E tests for the full create, edit, and status workflow in the browser.
- Error handling is consistent: domain errors map to contract error codes with appropriate HTTP statuses, validation errors include field names, and concurrency conflicts return the conflict type (ORDER_CHANGED, ORDER_LOCKED, INVALID_STATUS_TRANSITION).

## Test coverage

Comprehensive. The change includes unit tests for domain entities (`order.entity.test.ts`, `order-cursor.test.ts`), integration tests for the repository (idempotency, concurrency, duplicate detection), extensive route tests for the controller covering the happy path and all error cases (`order.controller.route.test.ts`, 2357 lines), component tests for the frontend forms and deadline logic, and E2E tests for the full order flow (`orders.spec.ts`). The tests verify acceptance criteria AC-1 through AC-19, including edge cases like invalid dates, stale versions, archived references, and timezone handling for the overdue badge.

New domain logic is well covered. The snapshot handling, line merging, conflicting price detection, money cap enforcement, status transition rules, version increment, no-op edit behavior, delivery deadline parsing and badge derivation, and cursor binding are all tested.
