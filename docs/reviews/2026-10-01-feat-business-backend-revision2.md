# Review, feat/business-backend, 2026-10-01

**Reviewed by**: Claude (following session review)
**Scope**: 10 files, uncommitted changes
**Verdict**: Approve with nits

## Summary

This change implements draft save functionality in the onboarding wizard, fixes auth response format consistency, persists logo URLs after upload, and fixes tenant isolation in business handlers. All tests pass (134 total). The implementation is solid overall, but there are a few concerns about the draft save approach.

## Blockers

None

## Major

### 🟠 Module-level global state in draft save implementation, `frontend/src/app/onboarding/page.tsx:30-37`

**Problem**: The draft save functionality uses module-level global variables (`savedDraftCache`, `pendingSave`, `draftDebounceTimer`) instead of React state or a proper hook.

**Why it matters**: This is an anti-pattern in React. Module-level mutable state:

- Can cause memory leaks if not properly cleaned up (partially mitigated by the cleanup effect)
- Doesn't work correctly with Fast Refresh during development
- Makes the code harder to test and reason about
- Could cause issues if multiple onboarding pages are opened simultaneously (unlikely but possible)
- The cleanup is done in a useEffect but the global state persists between component instances

**Suggested fix**: Consider wrapping this in a custom hook `useDraftSave()` that encapsulates the debounce logic and state management, or lift the state to the component level using useRef for mutable values that persist across renders without triggering re-renders.

### 🟠 Tenant isolation fix may have edge cases, `backend/src/presentation/controllers/business.controller.ts:253-255` (onboarding)

**Problem**: The `/onboarding` endpoint now uses `getTenantId()` which gets the businessId from the `requireBusinessRole` middleware context. However, looking at the middleware, it requires an `x-business-id` header to work. If this header is missing or invalid, the endpoint returns 400.

**Why it matters**: The middleware enforces tenant isolation at route entry, which is correct. However, there's a potential concern that the onboarding flow might need different tenant context handling (e.g., for creating a new business that doesn't exist yet in the membership list).

**Suggested fix**: Verify that the `requireBusinessRole(['OWNER'])` middleware works correctly for the onboarding use case. The user should be a member of the business with OWNER role, and the `x-business-id` header should point to their business.

## Minor

- The unused import `useCallback` was removed after initial implementation
- The `requireAuth` mock in tests has an unused `res` parameter - this is a known pattern for mocks but could be cleaned up
- The JSDoc comment in auth-guard.ts was fixed to correctly say "when complete" instead of just "when"

## Nits

- ⚪ `frontend/src/app/onboarding/page.tsx:3` - Removed unused `useRef` and `useCallback` imports
- ⚪ `frontend/src/app/onboarding/page.tsx:8` - `BusinessProfile` type import uses `type` modifier which could be just the import

## Strengths

- Consistent auth response format across all endpoints (register, login, oauth return `businessId`)
- Proper magic byte validation for image uploads prevents content-type spoofing
- Logo URL persistence ensures uploaded logos aren't lost on page refresh
- Tests added for new functionality (business.controller.test.ts, updated business.service.test.ts)
- Debounced draft saving prevents excessive API calls while typing
- Change detection cache avoids saving identical values

## Test coverage

The new logic has adequate test coverage:

- Backend: 10 test files, 88 tests covering auth controllers, business service, and business controller
- Frontend: 7 test files, 44 tests covering onboarding page, login, auth-guard

New tests added:

- `business.controller.test.ts` - 5 integration tests for logo upload persistence workflow
- Updated `business.service.test.ts` - 1 test for `updateBusiness` with logo URL

The draft save UI behavior could benefit from an E2E test that simulates typing in fields, refreshing the page, and verifying the draft is restored, but this would require Playwright setup verification.

---

Overall this is a solid implementation that addresses the review comments. The main concern is the global state pattern for draft saving, which works but isn't idiomatic React. Consider refactoring to a custom hook or using useRef for the debounce timer if you want extra polish.
