# Review, feat/products, 2026-10-21

**Reviewed by**: MiniMax M3.1 Flash Free (author on DeepSeek V4.1 Flash Free)
**Scope**: 59 files, branch vs base (22 tracked diff from merge base `9bf9931` + 37 untracked)
**Verdict**: Approve with nits

## Summary

This is the third and final pass over the products, categories, and variants slice for spec 0006, covering the delta since my last review: the `updatedAt` fixture was reordered to make the regression test actually armed, the login page now prefers the server's `message`, and the search module documents the two dependencies I had flagged. I verified each one against the code rather than against the report. The fixture is genuinely armed now: with the new declaration order (`Color` then `Size`) the stored jsonb comes back as `{"Size":"One","Color":"Red"}` while the incoming combination is `{"Color":"Red","Size":"One"}`, so the old `JSON.stringify` comparison would flag both rows as changed and the test would fail against the pre-fix code, while the current `combinationKey` comparison leaves `BULK-2` untouched. I confirmed both halves of that by reproducing the fixture against a live PostgreSQL. The login change is safe: every 4xx the auth controller returns carries `error` and no `message`, so `data.message || data.error` falls through to the same text the page showed before, and only the 5xx path changes. The two search comments record the default-collation dependency and the custom-plan versus generic-plan trade-off, which closes the last two nits from my previous pass. No Minor or Major findings remain; the three nits below are housekeeping and test-suite robustness, none of which should hold the merge.

## Nits

- ⚪ `frontend/src/app/products/page.test.tsx:354`, "uploads a selected variant image after creating the product" is timing-sensitive. Under CPU contention (I ran the backend and frontend suites against the same machine at the same time) it took 5.1 seconds and failed the default one second `waitFor` at line 424; it passes reliably when the suite runs on its own. Giving that `waitFor` an explicit longer timeout, or replacing the `userEvent` typing with direct `fireEvent` calls, would keep a loaded CI machine from reporting a red build for a green change.
- ⚪ `docs/scope/scope.md:155`, "Test it: `/test products`" is still unticked even though the slice now has 290 backend, 87 frontend and 32 contract tests passing; the "Review it" line below it can be ticked when this review lands.
- ⚪ `backend/drizzle/migrations/0001_misty_tempest.sql:1`, plain `CREATE INDEX` takes a write lock on `products`. Fine for an empty catalog, worth remembering if this ever runs against a large table.

## Strengths

- The fixture reorder is the fix I asked for, done properly. Declaring `Color` before `Size` puts the client's option order opposite to jsonb's length-then-bytewise key order, so the test now exercises the exact mismatch that broke the previous comparison, and the inline comment at `product.controller.route.test.ts:969` records why the order matters so a future reader does not "tidy" it back into a shape that silently disarms the guard.
- The search module now explains the two things a reader could otherwise get wrong: that the pattern and the column must share the database default collation, with the consequence spelled out ("if `products.name` ever gets an explicit COLLATE, move this predicate and the expression index with it"), and that keeping the pattern parameter bound is what lets the planner derive the byte-wise upper bound, with the generic-plan fallback described. That is the kind of comment that saves the next person an afternoon.
- The login page now reads `data.message || data.error || 'Authentication failed'`, which is the same precedence the settings and customers pages already use, so a failed login shows "The server could not complete the request." instead of the bare string "INTERNAL_ERROR", while every 4xx still shows its original message because those bodies carry no `message` field.
- The search rework itself is the strongest part of this slice and it has now held up under two rounds of scrutiny: both sides of the name comparison are lowercased by the same PostgreSQL function, the `text_pattern_ops` range is index backed with a planner-derived upper bound, and the `U+0130` case that the old JavaScript-side lowercasing got wrong is now a named test.

## Test coverage

I re-ran everything myself: backend `vitest run` 290 passed / 1 skipped across 19 files, frontend 87 passed across 11 files, contracts 32 passed, and `tsc --noEmit` plus ESLint are clean in backend, frontend and contracts. The targeted numbers in the report check out: 22 cases in the product route file, 26 in the auth controller file, 30 across the frontend login, products and primitives files. No regression came out of the delta: the only frontend failure I saw was the timing-sensitive case in the nit above, which does not reproduce when the suite runs alone, and the backend suite is unchanged and green.

The one gap left in the suite is the one I raised before, and it is now closed: the `updatedAt` test can fail against the pre-fix code, so the invariant it names is actually held. What remains uncovered is the search under a column collation that differs from the database default, which the new comment in `product-search.ts` records as a constraint rather than a promise; if anyone ever adds an explicit `COLLATE` to `products.name`, that comment is the reminder to move the index with it.

Verification notes: all database work for this review ran against `f-commerce-test` or in throwaway temp tables that were dropped afterwards; the rows used to reproduce the `updated_at` behaviour were created in the development database by mistake and have been deleted, restoring it to its prior state.
