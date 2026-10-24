# Review, orders, 2026-10-23 (second pass)

**Reviewed by**: glm-5.3-flash-free (author on deepseek-v4.1-flash-free)
**Scope**: 54 files, branch vs main (merge base 29ab635)
**Verdict**: Approve with nits

## Summary

Spec 0007 is implemented end to end and the first-pass blocker-grade finding is now resolved: the raw `items` array cap was raised to a documented anti-DoS bound of 200 (`packages/contracts/src/order.ts:60`) with `mergeLines` as the single source of truth for the 50-line limit, and the regression tests were fixed to exercise the real rule — 60 mergeable rows now assert 201, merged-quantity-past-1000 and 51 distinct pairs assert 400, and 201 raw rows assert the defensive cap, in both the contracts suite and the Postgres route suite. The change also fixed customer email/text validation to trim before validating, with new contract and route tests. The three minors from the first review (Load more staleness race, missing actor id degrading to a 500, per-line UPDATE without an order-scoped filter) are all still present and are re-confirmed here; none block merge.

## Fix verification (prior major)

### Prior major: item array limit enforced before the merge step — FIXED

- `packages/contracts/src/order.ts:60,104,116` — `MAX_RAW_ORDER_LINES = 200` replaces the raw `.max(50)` on both create and edit arrays, with a comment explaining why the defensive bound is not the line limit.
- `backend/src/application/services/order.service.ts:192-194` (`mergeLines`) now enforces the real 1–50 distinct-pairs limit, so AC-11 merge-first semantics take effect.
- `backend/src/presentation/controllers/order.controller.route.test.ts:502-522` — 60 raw rows with one shared product and price merge to a single qty-60 line and assert 201 with the correct subtotal; `:594-603` asserts merged quantity past 1000 → 400 `['items']`; `:609-630` asserts 51 distinct products → 400; `:632-645` asserts 201 raw rows → 400, separating the defensive cap from the spec limit.
- `packages/contracts/src/order.test.ts:120-128,184-192,97-99` — the same merge-accepted and over-cap cases at the contract level, for both create and edit.

The previous "too many lines" test's misleading shape was also corrected: it now uses 51 distinct products, so a 400 is asserted only under the merged rule.

### Additional contract fix verified in this pass (customer text/email)

- `packages/contracts/src/customer.ts` — `.trim()` now runs before `.max(...)` and the email is validated via `.pipe(emailSchema)` after trimming/blank handling, so a blank email is absent rather than invalid and padded emails/notes are accepted, matching spec 0005's "text fields are trimmed". Covered by the new `packages/contracts/src/customer.test.ts` and `customer.controller.route.test.ts:322-355`. Order text schemas (`order.ts:65-87,127-137`, status note) got the same trim-first treatment with boundary tests at 500/200 after trimming.

## Minor

### 🟡 "Load more" can append rows from a stale filter/search into the new view — `frontend/src/app/orders/page.tsx:112-130`

**Problem**: Still no staleness guard. `loadMore` captures `filter`/`debouncedQuery`/`nextCursor` at call time and neither checks a request token nor compares against current state when it resolves. `changeFilter` (:144-151) and the search `onChange` (:272-278) reset `rows`/`nextCursor`, and the main effect copies them (:68-95 with `cancelled`), but an in-flight `loadMore` is not cancelled. If its response lands after the fresh fetch has painted (slow link, or a later debounce in the wrong order), `setRows` appends the abandoned filter's rows onto the new list and `setNextCursor` stores a cursor bound to the abandoned status set/search, so the next Load more returns 400 `fields ['cursor']` per AC-7 binding.

**Why it matters**: A seller filtering Active can momentarily see rows of another status inside the Active queue, and then hit a confusing pagination error — the exact confusion the chips and cursor binding exist to prevent.

**Suggested fix**: Give the load-more request the same `cancelled`-flag (or request-token) treatment keyed on `filter`/`debouncedQuery`, discarding the result when either changed since the request started.

### 🟡 A missing actor id degrades into a 500 inside the transaction — `backend/src/presentation/controllers/order.controller.ts:93-100`

**Problem**: `actorFromContext` still falls back to `userId: ''` when `req.user` lacks `id`. `findActorName` short-circuits to `'Unknown user'`, so history gets an actor name, then the write of `''` into the uuid columns (`order.repository.ts:435,443`) fails after several statements have run, surfacing as a 500 with every write rolled back. Today's tokens are server-issued and always carry `userId`, so this needs a token-schema change or legacy token to trigger — but the boundary currently hides a config/drift problem as a 500.

**Why it matters**: Every create/edit/status write in a business would fail with a generic 500 that looks like a server fault rather than an auth-payload problem.

**Suggested fix**: Treat a missing/empty `userId` as a request problem (400/401 with a diagnostic field) before any service call; a narrow Zod parse of the decoded JWT payload in `requireAuth` would close it at the source.

### 🟡 Per-line UPDATE loop without an order scoping filter — `backend/src/infrastructure/database/drizzle/repositories/order.repository.ts:512-529`

**Problem**: Unchanged. Kept lines are rewritten one statement at a time (up to 50 round trips per edit), and each UPDATE matches `(orderItems.id, orderItems.businessId)` but not `orderItems.orderId`, while the delete above it (:501-510) and every other order-item query keep the owning-order filter.

**Why it matters**: Not exploitable today because the service validates each `lineId` against the order's own lines, but any future relaxation of that check becomes cross-order corruption inside a tenant, and the loop makes large or reordered edits measurably slower.

**Suggested fix**: Add `eq(orderItems.orderId, id)` to the per-item UPDATE where-clause; batch the rewrites only if profiling shows the cost matters.

## Nits

- ⚪ `backend/src/application/services/order.service.ts:632-639`, `parseLimit` accepts numeric forms like `0x20` or `1e1` (`Number` semantics); harmless, but stricter parsing keeps the query contract exact.
- ⚪ `backend/src/infrastructure/database/drizzle/repositories/order.repository.ts:298`, the duplicate summary sets `itemCount` to the distinct _pair_ count rather than the line count; unused today, wrong if ever displayed.
- ⚪ `frontend/src/app/orders/page.tsx:315-321`, initial loading skeletons are not announced (`role="status"`), unlike the Load more and error states; self-acknowledged in `docs/specs/0007-orders/verify.md:93`.
- ⚪ `frontend/src/components/orders/customer-picker.tsx:41-45` and `frontend/src/components/orders/product-picker.tsx:31-34`, clearing the search box leaves the previous result list visible (the effect early-returns without resetting results).

## Strengths

- The optimistic-locking core is right: the version predicate lives inside the `UPDATE ... WHERE` (`order.repository.ts:476-486,585-595`), the counter upsert serializes order numbers, and both races are now proven under `Promise.all` concurrency (`order.controller.route.test.ts:1576-1658`), including the counter resuming from a pre-seeded `lastNumber: 7` without collision (:388-394).
- The AC-11 merge rule is now genuinely tested end to end, with a case grid that separates merge success (60 rows → 1 line, 201), merged-quantity overflow (1000 + 1 → 400), distinct-pair overflow (51 products → 400), and the raw DoS cap (201 rows → 400).
- Test coverage breadth is excellent for this branch size: error precedence (transition before version, lock before version), the 24-hour duplicate window on both sides of the boundary, idempotent replay before body validation and the same-key race, cursor rebinding on status/search/limit plus a no-repeat 20-row paging run, live-search escaping of `_` as verified against two similar names, tenant isolation on every route including a foreign status move, staff parity across all three screens' actions, and transaction rollback of counter/order/lines/history/audit via a broken-actor token.
- The trim-before-validate contract rework is exactly the right shape (`z.string().trim().max(...)`, email validated through `.pipe` after trimming), with pointer-to-the-boundary tests at 500 and 200 characters after trimming.

## Test coverage

Strong. Backend: the 1,712-line Postgres suite covers create/snapshot/totals/audit, validation-grid and references, duplicate window including near-boundary timing, idempotency (replay precedence, invalid-body replay, same-key race), list/search/escaping/cursor binding/paging, edit line identity (existing/new/unknown/repeated/mismatched lineId, archived references, deleted variant), the full status walk with precedence cases, concurrency on counter/edits/status, and create/edit/status rollback. New untracked suites cover the transition table and cursor codec in the domain, both order and customer contracts including the new trim/email semantics, and the frontend order client's wire format and error mapping (including malformed `existingOrder` tolerance). Frontend page tests now also cover cancel and return through the confirmation dialogs with exact request bodies, and the orders E2E drives create → confirm → edit-in-place → search/filter plus the duplicate warn-then-confirm path. Remaining gaps, all modest: the `loadMore` staleness race is untested (see Minor); the edit path has no raw-cap-over-200 route test (only the contracts test and create route test cover that); and the exact "created 24 hours ago inclusive" boundary is only verified from both sides (23:59:59 in, 24:01 out), which is the practical, unflaky equivalent.
