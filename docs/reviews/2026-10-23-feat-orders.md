# Review, orders, 2026-10-23

**Reviewed by**: glm-5.3-flash-free (author on deepseek-v4.1-flash-free)
**Scope**: 54 files, branch vs main (merge base 29ab635)
**Verdict**: Changes requested

## Summary

Spec 0007 is implemented end to end: contracts, three migrations with backfills, transactional repository, thin domain entity and cursor, application service, controller, and the three seller screens, backed by a genuinely strong test suite (postgres integration tests with concurrency, atomicity, and tenant-isolation cases, plus contracts, unit, and E2E tests). The optimistic-locking core, idempotency replay, error precedence, and duplicate guard match the spec. One real deviation remains: the contract rejects any item array of more than 50 raw rows before the spec-mandated merge step, so the "merge before the limit is checked" rule of AC-1/AC-11 cannot happen, and the route test that appears to cover this actually exercises the price-conflict path instead.

## Major

### 🟠 Item array limit is enforced before the merge step, contradicting AC-1/AC-11 — `packages/contracts/src/order.ts:96` (also `:108`)

**Problem**: `OrderCreateSchema.items` and `OrderUpdateSchema.items` are `.min(1).max(50)` on the raw array, so a payload with 51 rows is rejected with 400 before `mergeLines` in the service ever runs. The spec is explicit the other way round: AC-1 "1 to 50 lines after merging", AC-11 "Lines are 1 to 50 distinct product and variant pairs, and same pair lines are merged before the limit is checked". The service already implements the merged check (`backend/src/application/services/order.service.ts:192-194`, ValidationError `['items']`), and `mergeLines` would correctly collapse duplicates — but the contract never lets it. Coverage is also misleading: `order.controller.route.test.ts:584-593` ("too many lines") sends 51 lines all sharing one product but with *distinct* `unitPrice` values, so a 400 would also occur under a merge-first rule (price conflict); the test passes for the wrong reason and neither the schema max nor the merged-limit path is distinguished.

**Why it matters**: An API client (or a future bulk import) sending predictable duplicate rows — e.g. 60 rows for 40 distinct pairs — gets a hard 400 where the contract says it must merge down and succeed. The error also names `items` for a payload the spec declares valid, so callers have no way to recover. This is a persistent behavioral mismatch with the governing spec, not a transient bug.

**Suggested fix**: Raise (or drop) the raw Zod cap to a generous anti-DoS bound (e.g. 200) while keeping `.min(1)`, and let the existing `mergeLines` 50-line check be the single source of truth for the AC-11 limit. Fix the route test so it sends 51 *mergeable* rows (same pair, same unit price) that collapse to fewer than 50 distinct pairs and asserts 201, plus a case that merges past 50 distinct pairs and asserts 400.

## Minor

### 🟡 "Load more" can append rows from a stale filter/search into the new view — `frontend/src/app/orders/page.tsx:112-130`

**Problem**: Unlike the main fetch effect (which guards with a `cancelled` flag, `page.tsx:68-95`), `loadMore` has no staleness guard. If the user clicks Load more and then changes the status chip or types (debounced) before the request lands, `changeFilter`/the search change clear `rows`, then the in-flight promise appends the *previous* filter's rows and sets `nextCursor` from the *previous* page's cursor. The list then mixes rows of two different status sets and paging continues on a cursor bound to the abandoned filter (the server rejects a rebound cursor with 400, surfacing a confusing error on the next Load more).

**Why it matters**: A seller filtering Active who clicks Load more on a slow link can see Delivered/Cancelled rows inside the Active queue — the exact confusion the status chips exist to prevent.

**Suggested fix**: Add the same request-token (or `cancelled`) pattern the initial effect uses, and discard the response when `filter`/`debouncedQuery` changed since the request started; or key the effect on filter+query and let a single effect own both initial and page loads.

### 🟡 A missing actor id degrades into a 500 inside the transaction — `backend/src/presentation/controllers/order.controller.ts:93-100`

**Problem**: `actorFromContext` falls back to `userId: ''` when `req.user` has no id. Every downstream write then stores `''` in the uuid columns `changed_by_user_id` / `audit_logs.userId`, which fails deep inside the create/edit/status transaction after several statements have run (saved by rollback), surfacing as a generic 500.

**Why it matters**: It converts a recoverable middleware/configuration problem into a 500 with no diagnostic field, and the rollback test at `order.controller.route.test.ts:1613-1662` only covers this path via the deliberate `not-a-uuid` token rather than the `''` case the code itself produces.

**Suggested fix**: Treat a missing `userId` as a request problem and return a 400/401 (e.g. `ValidationError(['userId'])` or re-trigger auth) before any service call, so the invariant "every write carries a real actor" is enforced at the boundary.

### 🟡 Per-line UPDATE loop without an order scoping filter — `backend/src/infrastructure/database/drizzle/repositories/order.repository.ts:512-529`

**Problem**: Existing lines are rewritten one statement at a time inside the edit transaction (up to 50 round trips per edit), and each UPDATE matches on `(orderItems.id, orderItems.businessId)` but *not* `orderItems.orderId`. The service currently guarantees ids belong to the order, so this is not exploitable today, but it is the one order-item query in the new repository that skips the owning-order filter — the same defense-in-depth the delete above it (`:501-510`) keeps.

**Why it matters**: Any future refactor that relaxes the service-side `lineId` ownership check turns this into cross-order corruption within a tenant, and the loop makes large edits measurably slower.

**Suggested fix**: Add `eq(orderItems.orderId, id)` to the per-item UPDATE where-clause now, and (optionally) batch the position/quantity/price rewrites with a single `UPDATE ... FROM (...) values` or Drizzle case expression when profiling shows it matters.

## Nits

- ⚪ `backend/src/infrastructure/database/drizzle/repositories/order.repository.ts:298`, the duplicate summary sets `itemCount` to the distinct *pair* count, not the line count; fine while unused, but it will report the wrong number if ever displayed.
- ⚪ `frontend/src/app/orders/page.tsx:315-321`, the initial loading skeleton rows are not announced (`role="status"`/text), only the Load more and error states are; self-acknowledged in `docs/specs/0007-orders/verify.md:93`.
- ⚪ `backend/src/application/services/order.service.ts:632-639`, `parseLimit` accepts numeric forms like `0x20` or `1e1` (`Number` semantics); harmless today, but stricter parsing would keep the query contract clean.
- ⚪ `backend/src/presentation/controllers/order.controller.ts:98`, `req.user as { userId?: string }` cast; a narrow Zod parse of the decoded auth payload would keep the boundary checked.

## Strengths

- The transaction/locking core is done right: version is checked inside the `UPDATE ... WHERE` (`order.repository.ts:476-486`), losers get `ORDER_CHANGED` from a race, and the counter upsert serializes order numbers — all proven under `Promise.all` concurrency in `order.controller.route.test.ts:1528-1609`.
- Idempotency is handled beyond the happy path: replay before body validation (`order.controller.ts:126-131`), unique-violation catch-and-replay for the two-request race (`order.service.ts:272-279`), and an E2E + unit test that the duplicate-confirm resubmit reuses the same key only because nothing was stored.
- The integration suite covers error precedence (ORDER_LOCKED before the version check), invalid transitions before stale versions, tenant isolation for every route, wildcard escaping with `%`/`_` literal cases, the 24-hour duplicate window boundary, and rollback of counter/order/lines/history/audit via a broken-actor token — a clever atomicity probe.
- Cursor design binds the status set, search text, and page size into a validated base64url payload (`order-cursor.ts`), with thorough malformed/tamper tests.
- Migration discipline: snapshot backfill and counter seeding run in separate steps before the NOT NULL constraint (`0002`–`0004`), and the counter seed uses `GREATEST` on `ORD-` parsing so a pre-existing `ORD-0007` never collides.

## Test coverage

Strong overall. Backend: two Postgres integration files (`order.controller.route.test.ts` ~1664 lines, plus updated customer/product seed files) covering create/merge/totals/snapshots, duplicate window incl. near-boundary timing, idempotency replay and same-key race, list/search/cursor binding and paging, edit line identity (existing/new/unknown/repeated/mismatched lineId, archived references, deleted variant), full status walks + rejected moves + error precedence, concurrency on counter/edits/status, and create/edit/status rollback. Domain: transition table and cursor codec unit tests; contracts: create/update/status schemas, boundaries, trim semantics, response shapes; frontend: list/create/detail page behavior tests including the hidden-iidempotency-key assertion and duplicate dialog, `order-form` math/parsing, `order-client` wire format and error mapping; E2E: the full create → confirm → edit → search/filter flow and the duplicate warn-then-confirm flow. Gaps worth noting: (1) the merge-before-limit rule is not truly exercised — the "too many lines" test passes on a different rule (see Major); (2) no test drives a >50-row mergeable payload to the service-level 50-distinct-pairs rejection; (3) the `loadMore` staleness race is untested (see Minor).
