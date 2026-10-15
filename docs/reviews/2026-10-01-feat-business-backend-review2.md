# Review, feat/business-backend, 2026-10-01

**Reviewed by**: GPT-5 (author on Claude Code)
**Scope**: 10 files, branch vs main
**Verdict**: Changes requested

## Summary

The change adds the business profile API, Cloudinary upload handling, onboarding UI, and auth redirects. The onboarding gate now properly establishes tenant context with `runWithContext`. Tests pass but there are remaining issues: handlers use `memberships[0].businessId` instead of tenant context, logo uploads don't persist the URL, and draft saves aren't implemented in the wizard.

## Blockers

### 🔴 Route handlers select the first membership instead of the authorized tenant, `backend/src/presentation/controllers/business.controller.ts:74`

**Problem**: Handlers pick `memberships[0].businessId` instead of using the tenant context or `x-business-id` header.

**Why it matters**: In accounts with multiple businesses, requests authorized for one business may read or update another business.

**Suggested fix**: This is a pre-existing pattern used throughout the handlers. The `requireBusinessRole` middleware validates access via `x-business-id` header. To fully address this, either use the tenant context businessId from `runWithContext` or the `x-business-id` header resolved in middleware. Add tests with multiple memberships to verify correct tenant selection.

## Major

### 🟠 Logo upload URL is never persisted, `backend/src/presentation/controllers/business.controller.ts:219`

**Problem**: The upload handler returns the Cloudinary URL but does not persist it to the Business document.

**Why it matters**: A user who uploads a logo and leaves before completing onboarding loses the URL on reload.

**Suggested fix**: Persist the returned URL to the authorized business after upload using `businessService.updateBusiness(businessId, { logoUrl: result.logoUrl })`.

### 🟠 Onboarding draft is never saved by the wizard, `frontend/src/app/onboarding/page.tsx:132`

**Problem**: The page reads `onboardingDraft` on initial load but no UI action calls `PUT /api/business/onboarding/draft`.

**Why it matters**: Refreshing or closing the tab discards all progress, contrary to the spec's draft-resume behavior.

**Suggested fix**: Call `PUT /api/business/onboarding/draft` whenever a field changes in the wizard. Consider debouncing to avoid excessive requests. Add a test that fills the wizard, refreshes, and verifies draft is restored.

## Minor

### 🟡 Auth controller response format inconsistency, `backend/src/presentation/controllers/auth.controller.ts:102`

The register endpoint now returns `{ accessToken, businessId }` but OAuth login endpoint only returns `{ accessToken }`.

**Suggested fix**: Apply the same pattern to all authentication endpoints for consistency.

## Nits

- ⚪ `frontend/src/app/login/page.tsx:57` - The JSDoc comment references "/dashboard" but the code redirects to "/onboarding"

## Strengths

- Business controller gate properly establishes tenant context with `runWithContext` before the query
- Magic byte validation for image uploads prevents content-type spoofing attacks
- Login page uses `businessId` from API response with graceful fallback to JWT decode
- Frontend auth-guard correctly redirects authenticated users to `/onboarding`
- Comprehensive test coverage: 125 tests pass (backend 81, frontend 44)

## Test coverage

- Backend: 81 tests pass across 9 test files
- Frontend: 44 tests pass across 7 test files
- Contracts: 2 tests pass

Tests cover happy paths, validation, and error cases. Auth controller tests verify the new `businessId` field in register/login responses. Frontend tests cover onboarding redirect behavior.
