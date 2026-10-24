# Review, feat/orders, 2026-10-24

**Reviewed by**: GLM-5.3-Flash Free (author on DeepSeek V4.1 Flash Free)
**Scope**: 66 files, feat/orders vs base (merge base 29ab63537f8907e68fcd25d2a09f52774717bef8)
**Verdict**: Approve with nits

## Summary

The branch adds the full order lifecycle: create with merged lines and a serialized per-business order number, list/search with cursor pagination, edit with optimistic version locking, allowed status transitions with a history trail, and retrieval of detail/summaries — across contracts, domain, repository, service, controller, UI, and a 2357-line route test file. Compared to the previous review (2026-10-23, plus its second pass, review2), every raised issue is resolved: the raw-items uniform cap is now 200 with the merge-first 50-line rule as the single semantic (contract tested on both create and edit), the load-more race is guarded by a request epoch with a test, missing/blank-token actors are rejected 401 at the middleware with tests, and the per-line UPDATE now scopes on `orderId` with a regression test. What remains is one small untested boundary and a handful of cosmetic nits; nothing blocks merge.

## Minor

### 🟡 Edit path never rejects a payload above the raw 200-row cap in tests, `packages/contracts/src/order.ts:150`

**Problem**: `OrderUpdateSchema.items` carries `.max(MAX_RAW_ORDER_LINES)` (200), but no contract test asserts the rejection — the create side has "a line list above the raw payload cap" (`order.test.ts:98-100`), while the edit side only has the positive merge test accepting 60 rows (`order.test.ts:259-267`). No route test covers it either.

**Why it matters**: With TESTS = configured, each new or changed limit boundary should have a rejection case; otherwise a regression that drops `.max(200)` from the edit schema (e.g. in a refactor) ships silently, and the create/edit schemas drift apart in guarantee without any failing test to say so.

**Suggested fix**: Add one assertion mirroring the create-side case: `OrderUpdateSchema.safeParse({ version: 2, items: Array.from({ length: 201 }, …) }).success === false` (a 201-row edit list is rejected even though only some rows merge).

## Nits

- ⚪ `backend/src/application/services/order.service.ts:643-649`, `parseLimit` uses `Number(raw)`, which silently accepts `1e2`/`0x10`/padded forms; since the value is still range-checked, this is harmless, but a stricter parse (e.g. `/^\d+$/` first) would match the intent.
- ⚪ `backend/src/infrastructure/database/drizzle/repositories/order.repository.ts:303`, the match summary reports `itemCount: stored.size`, where `stored` is a set of `productId:unitPrice` pair keys — the reported count is pair count, not line count, and can mismatch a UI reader's expectation; worth a one-word rename or a comment.
- ⚪ `frontend/src/app/orders/page.tsx:334-339`, the initial list skeletons are purely visual: no `aria-busy`/live region announces the loading state, so a screen-reader user gets silence until rows arrive (against the WCAG AA baseline the project targets).
- ⚪ `frontend/src/components/orders/customer-picker.tsx:41-44` and `frontend/src/components/orders/product-picker.tsx:31-34`, clearing the search input bails out of the fetch effect and leaves the previous narrowed results on screen instead of refreshing toward the default list.
- ⚪ `backend/src/presentation/controllers/order.controller.ts:98`, `req.user as { userId?: string } | undefined` is an unchecked cast; it is now well-mitigated (the middleware 401s a missing or blank actor before this code runs), but typing `req.user` once in a declaration file would remove the cast entirely.
- ⚪ `frontend/src/lib/catalog-format.ts:22-27`, the `formatDateOnly` doc comment claims the month names "come from `formatDateTime` on a fixed UTC date", but the implementation uses the hardcoded `MONTH_LABELS` array (`:32`); the comment describes an earlier iteration and reads misleadingly today.
- ⚪ `backend/src/application/services/order.service.ts:189-192`, when two raw rows for the same product/price pair carry two different existing lineIds, the first id wins and the second is silently dropped (its quantity folds into the survivor's line); today that shape is not constructible via the API, so this only needs a guard or a comment if the input schema ever relaxes.

## Strengths

- The optimistic locking core is genuinely sound: the version guard sits in the `WHERE` of the UPDATE (not re-checked in app code afterward), status transitions are applied in the same statement, and the new "never rewrites a line that belongs to another order" test proves the per-line UPDATE is scoped by `eq(orderItems.orderId, id)`.
- The per-business order counter is serialized by a real unique index upsert (`orders_business_order_number_unq`) rather than a read-then-write, and the concurrency tests exercise the retry path.
- Test breadth is the standout: the route-level suite covers the spec's ACs 1–19 end to end, including concurrent edits to the same row, atomicity across lines, tenant isolation, the duplicate order-number window, idempotency, and cursor staleness binding.
- Keeping the delivery deadline as a date string all the way to display (`formatDateOnly` hand-splits `YYYY-MM-DD` instead of parsing into a `Date`) keeps the promised day timezone-stable — a detail most implementations get wrong.

## Test coverage

Coverage is very strong for a branch of this size. The 2357-line `order.controller.route.test.ts` walks ACs 1–19 over real HTTP with a real database, and the contract suite locks the merge-before-50 semantics, the uniform 200-row create cap, money caps inclusive, and the status-note limit. All four prior review findings now have their regression tests: the raw-cap raise, the load-more epoch drop ("drops a load more response that lands after the filter changed"), the missing/blank-actor 401, and the cross-order line UPDATE guard. The one remaining gap is the Minor above: the edit-side raw row cap has no rejection test, positive paths only. E2E coverage in `orders.spec.ts` exercises create, edit, and status flows at the UI level; the date-only deadline display and picker behaviors rely mainly on unit tests rather than e2e, which is acceptable.
