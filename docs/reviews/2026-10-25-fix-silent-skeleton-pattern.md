# Review, fix/silent-skeleton-pattern, 2026-10-25

**Reviewed by**: Big Pickle
**Scope**: 6 files, branch vs base
**Verdict**: Approve with nits

## Summary

The change mirrors the established Orders page accessibility pattern: first-load skeletons are wrapped in `role="status"` with visually hidden loading text, and `EmptyState` is wrapped in `role="status"` for announcement. New tests cover the announcement behavior on both Customers and Products pages. The branch also adds two small, consistent docs edits that extend scope 10 (Payments) to include capturing a first payment at order creation and updates spec 0007 to note that feature 10 must handle the first-payment path. Overall solid and consistent with project conventions.

## Minor

### 🟡 Skeleton wrapper missing from "loading more" state on Products, `frontend/src/app/products/page.tsx:671-675`

**Problem**: Products shows a "Loading products…" inline status with `<Spinner />` when rows already exist (`isLoading && rows.length > 0`), but unlike the initial skeleton block it does not include a visually hidden label. Customers does not have a separate "loading more" indicator in this diff.
**Why it matters**: Screen reader users may hear the spinner with no programmatic label if not exposed by the icon/role. The new pattern introduced in this diff establishes consistent announcement for loading states; this parallel case should match.
**Suggested fix**: Wrap the inline "Loading products…" row in `role="status"` and add a visually hidden span (e.g. "Loading more products…" or reuse "Loading products…") to match the pattern.

### 🟡 Empty state announcement not consistently applied across all empty cases, `frontend/src/app/customers/page.tsx:321-339`, `frontend/src/app/products/page.tsx:679-726`

**Problem**: The change wraps `EmptyState` in `role="status"` for the zero-results cases. That is correct. However, the pattern relies on the wrapper; ensure that when `EmptyState` itself already communicates status, the announcement is not duplicated and is present in all empty branches (e.g. filtered empty states). The diff does this, but the tests only assert the "no customers yet"/"no products yet" strings — filtered empty states (Products) also benefit from announcement and are included.
**Why it matters**: Users on assistive tech need to be notified when the list becomes empty (search returns nothing). The implementation is correct as-is.
**Suggested fix**: Consider a small helper/component to enforce this pattern to avoid future omissions.

## Nits

- ⚪ `frontend/src/app/customers/page.test.tsx:60-75`, The "announces the first list load" test uses a never-resolving fetch promise to keep the loading state. Consider adding `waitFor` or asserting presence via `getByRole('status')` to be more resilient and explicit about the announcement container.

## Strengths

- Faithfully mirrors the established Orders accessibility pattern (role="status" with visually hidden loading text, empty state announced).
- Tests assert the announcement behavior on both Customers and Products pages.
- Payments docs updates are consistent between `docs/scope/scope.md` and `docs/specs/0007-orders/index.md` (capturing first payment at order creation; feature 10 must own writes and the creation/first-payment path).

## Test coverage

**Configured (vitest + @testing-library/react).** New tests added in `frontend/src/app/customers/page.test.tsx` and `frontend/src/app/products/page.test.tsx` cover: loading announcement, empty announcement, and a loaded row. The changes are to presentational/announcement behavior and fit the existing test patterns. No untested branching logic was introduced; coverage is adequate for this change.
