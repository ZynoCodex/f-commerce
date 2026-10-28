# Review, feat/business-timezone, 2026-10-28

**Reviewed by**: GLM-5.3-Flash Free (fresh reviewer, did not author the change)
**Scope**: 69 files, branch vs `main` (merge base `012ffb9`)
**Verdict**: Approve with nits

## Summary

The change implements spec 0008: a `businesses.timezone` IANA column with a `Asia/Dhaka` default and migration, canonicalizing `TimezoneSchema` in contracts, backend profile/onboarding/draft support, a client `BusinessSettingsProvider` with a per-business localStorage cache and auth subscription, the grouped `TimezoneSelect`, the settings confirmation dialog, and business-zone timestamps, day label, deadline warning, and Overdue badge across the console. The implementation tracks the spec closely, the layer separation holds (pure domain helper, validated contracts, no DTO leaks), and the test coverage is unusually deep — hydration, midnight, DST, two-zone, in-flight sign-out, and corrupt-state cases are all exercised, and the staged shell and customer-timestamp tests pin the badge and `formatDateTime` behavior. I found no blocker or major; the remaining findings are edge-case minors around wasted requests, an in-flight-save race, and two untested defensive branches.

## Major

None.

## Minor

### 🟡 Business switch sends a profile request for the previous business, `frontend/src/components/business/business-settings-provider.tsx:187-223`

**Problem**: When the active business changes, the old effect's `subscribeToAuth(load)` listener fires a `load()` for the _previous_ `targetBusinessId` before React runs the cleanup. The response is dropped by the `active.businessId !== targetBusinessId` guard, but `apiFetch('/api/business/me')` is actually sent with stale auth headers — one wasted network request per business switch (a second fetch is expected by AC-7, this is a third that always throws its result away).
**Why it matters**: Every switch costs an unnecessary authenticated backend request; with a slow backend the stale response can land before the guarded one and momentarily compete for response ordering.
**Suggested fix**: Either capture the request token per effect (AbortController or an `isCurrent` flag shared by the listener) or skip listener-driven loads whose captured business id no longer matches the snapshot before `apiFetch` is called. The spec's follow-up ("collapse the duplicate profile fetch when the business switcher lands") covers a related dedupe, so documenting one of the two is also acceptable.

### 🟡 In-flight timezone save overwrites a selection made while saving, `frontend/src/app/settings/page.tsx:150-160`

**Problem**: `submitProfile`'s success path does `setForm((prev) => ({ ...prev, timezone: nextTimeZone }))`. If the user changes the select again while a confirmed save is in flight (the save button is disabled, but the select is not), the resolved save silently resets `form.timezone` to the already-saved value and the select jumps back — the newer choice is lost with no message.
**Why it matters**: It misleads the owner about which zone the business now uses right after a deliberately scary confirmation step; a second confirm click would also send the wrong baseline relationship.
**Suggested fix**: Disable (or effectively freeze) the select while `isSaving`, or merge the newer pending selection with the saved baseline and re-open the confirmation instead of overwriting it.

### 🟡 Defensive invalid-timezone branches on both screens are untested, `frontend/src/app/onboarding/page.tsx:265-272` and `frontend/src/app/settings/page.tsx:160-166`

**Problem**: Two branching guards lack coverage: step 3's `continueWithTimeZone` inline `Choose a valid timezone.` message (blocking completion per AC-5) and settings' `saveProfile` early return (`Choose a valid timezone.`). The test suites cover the prefill/fallback/dialog paths thoroughly but never drive either branch, so a regression that removes the validation from step 3's continue button would pass CI.
**Why it matters**: This is the requirement the spec calls out explicitly ("a missing or invalid value blocks completion with an inline message"), and it is exactly the kind of code that silently erodes later.
**Suggested fix**: Add one test pressing Continue on step 3 with the form state forced to an invalid value (rejecting the mocked draft with a bad zone and stubbing the verifier), and one settings test hitting the early return. `/test` can pick this up.

## Nits

- ⚪ `backend/src/domain/timezone.ts:8-19`, `IANA_ID_PATTERN`, the `UTC` special case, and the 64-char bound are copy-pasted from contracts instead of reusing `resolveTimeZone` — the backend already imports contracts runtime values, so the policy has three homes (two of them here) that can drift.
- ⚪ `frontend/src/components/business/business-settings-provider.tsx:86-115`, `computeSnapshot()` does a `localStorage` read on every store check including each post-commit consistency check; the parse is memoized in the cache module but the storage and `getAuth()` reads are not.
- ⚪ `backend/src/presentation/controllers/business.controller.ts:123`, `GET /me` returns `onboardingDraft` while `BusinessResponseSchema` does not declare it — preexisting schema drift adjacent to this diff, worth aligning when contracts change next.
- ⚪ `backend/src/presentation/controllers/business.controller.ts:315-340`, the draft endpoint answers `200 "Draft saved"` even when the repository now silently drops the write for a completed business; a `draftDropped` flag or at least a code comment at the controller would make that contract explicit.
- ⚪ `backend/src/domain/entities/financial.entity.ts:2-11`, `CASH_ON_DELIVERY`/`CARD`/`PAYPAL` enum values are referenced by no contract or code path yet (accepted scope from the 0007 follow-up; flagging only so they are not mistaken for timezone work).

## Strengths

- The draft race fix is a genuine improvement beyond the letter of the spec: `saveDraft` refusing writes to completed rows closes a real in-flight-write window, and two dedicated integration tests pin both the resurrect and the stale-preserve behaviors.
- The zone resolution design is careful in the right places: canonicalization via `resolvedOptions().timeZone` instead of a hardcoded alias table, a `WeakMap` cache keyed by the current `Intl.DateTimeFormat` constructor (so a test-swapped constructor is always honored, with a test proving it), and DST-stability breakpoints tweeted both in the backend helper and the frontend formatter caches with tests on both sides of spring-forward/fall-back and a leap day.
- Coverage is anchored to the spec: test names cite AC ids, and the hard cases the spec calls out (hydration renders nothing before mount, day equal to today is not overdue, corrupt stored value falls back without failing the profile fetch, late responses after sign out are dropped, another business's cache is never read) each have a matching test, plus e2e coverage of the settings cancel/confirm/failure dialog including focus return.

## Test coverage

Verified by running, not just reading: contracts (106 tests), the seven frontend timezone/lib/provider/component suites (95 tests), and the backend domain/service/controller suites (78 tests) all pass; `typecheck`, `lint`, and `format:check` are clean across the workspaces. What is covered: both IANA validators and all rejection classes, the two `todayInTimeZone` copies (DST sides, leap day, two-zone same instant, fallback), contracts canonicalization including alias and 65-char cases, the backend repository (column default, partial update, draft race), controller routes (canonical draft save, 400 on invalid), the provider (cache-first load, auth subscription including token-only change, sign-out clearing, late/mismatched saves, per-field sanitize), the select (grouping/labels/fallback list/current-value presence), screens (settings load/baseline/corrupt value/dialog flows including focus trap and in-flight guard, onboarding prefill/draft-resume/completion settings update), the shell badge/day label with a rerender-after-midnight case, and STAGED customer-timestamp and shell tests asserting exact zone-specific strings. Untested: the two defensive branches listed as the third Minor, and the newly added (unused) `PaymentMethod` members. Backend integration suites were not run here (they need the live PostgreSQL test database); the integration changes were read and they look consistent with the migration.
