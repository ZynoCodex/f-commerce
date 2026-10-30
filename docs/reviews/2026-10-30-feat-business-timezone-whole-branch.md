# Review, feat business timezone (whole branch), 2026-10-30

**Reviewed by**: GLM-5.3-Flash Free (author on DeepSeek V4.1 Flash Free)
**Scope**: 89 tracked files (73 code, 16 docs/config) + 4 untracked feature files, branch vs `main` (merge base `012ffb9`)
**Spec**: `docs/specs/0008-business-timezone/index.md` (governing) · `docs/specs/0007-orders/index.md`
**Verdict**: Approve with nits

## Summary

The branch delivers spec 0008 end to end: the `businesses.timezone` column with the `Asia/Dhaka` default and backfill migration, the `TimezoneSchema`/`resolveTimeZone` boundary in contracts, profile and draft API support (including the honest `409 ONBOARDING_COMPLETE` draft answer), the shared client `BusinessSettingsProvider` with a per-business localStorage cache, the timezone picker and confirm dialog on onboarding and settings, the shifted timestamp/Overdue rendering, and the duplicated server day helper. The newest uncommitted slice adds the country picker with timezone→country and device prefill. Overall quality is high: the tricky rules (canonicalize on write, presence-only read, calendar-day storage untouched, mounted-gated badges, untrusted-response handling at the provider write path) are all implemented as specified and covered by unit, integration, route, and contract tests. No blockers or majors were found; the remaining items are small edge and hygiene issues.

## Minor

### 🟡 localStorage is mutated during render inside the settings snapshot read — `frontend/src/lib/business-settings-cache.ts:27-42,54-61`

**Problem**: `readBusinessSettingsCache` is called from `computeSnapshot`, which runs inside `getSnapshot` during every React render. On the malformed-entry and JSON-throw paths it calls `removeBusinessSettingsCache` and therefore `window.localStorage.removeItem` — a side effect and writes during render. The module-level `lastRead` memo is also reset (`lastRead = null`) from the same render path.

**Why it matters**: React render functions must be pure; a render that mutates the outside world can run twice under Strict Mode and can surprise concurrent rendering. In practice the removal is idempotent so nothing breaks today, but it undermines the `useSyncExternalStore` contract the provider is otherwise careful about, and a future change building on this path could observe stale `lastRead` state.

**Suggested fix**: Keep the render path read-only — return `null` for a malformed entry and defer the actual `removeItem` to an effect or a microtask (a queued removal the provider's effect performs), or move the parse-and-prune out of `getSnapshot` and notify the store from a subscription-side effect instead.

### 🟡 Onboarding detects the onboarding gate by matching backend error copy — `frontend/src/app/onboarding/page.tsx:152-160`

**Problem**: The wizard decides whether a 403 from `GET /api/business/me` means "unfinished business" via `data.error?.includes('Onboarding') || data.message?.includes('Onboarding')`. The backend's stable field is `error: 'Onboarding required'`; the check only needs `data.error` and works by substring luck on the textual message.

**Why it matters**: Any rewording of the backend gate message (including casing or translation) silently turns the wizard into an "Access denied" dead end for every fresh owner. That is the primary entry path for the whole product.

**Suggested fix**: Compare `data.error === 'Onboarding required'` (the stable, non-display error string the gate returns), and fall back on `error` only — not `message`, which is display copy that changes.

### 🟡 New E2E coverage was added but not executed — `frontend/e2e/business-onboarding.spec.ts:103-165,285-410,437-520`

**Problem**: The majority of the AC-5/AC-6 E2E protection is new in this change: the prefill/draft-resume/country follow test, the settings cancel-and-confirm test, the failed-change test, and the corrupt-zone test. The unit suite (28 files, 298 tests) passed, but the Playwright suite was not run because the dev stack and PostgreSQL were not started.

**Why it matters**: The unit suite mocks `GET /api/business/me` and `Intl`; the un-mocked wiring (provider fetch against the real Next proxy, the draft debounce against the real `409`, the dialog focus restore, the badge after reload, the country prefill against a real `timezoneId`) is only proven by these tests. The country assertion is in exactly one E2E test.

**Suggested fix**: Run `npm run e2e --workspace @f-commerce/frontend` against the dev stack before merge. If a stack is not yet available in this environment, record in the PR that the E2E gate is pending and run it at `/check verify` time.

**Resolved 2026-10-31**: all three minors are closed. The cache read path is now pure (`readBusinessSettingsCache` returns `null` for a malformed entry and leaves `lastRead` to the reader), with the `removeItem` deferred to `pruneBusinessSettingsCache` inside the provider's effect. Onboarding compares the stable gate string, `data.error === 'Onboarding required'`. The E2E suite was executed against the live dev stack (PostgreSQL and Redis up, backend started with `RATE_LIMIT_DISABLED=true` as CI does): 42 passed on desktop and mobile, including the prefill/draft-resume, settings cancel/confirm/failure, and corrupt-zone tests. `typecheck`, `lint`, and `format:check` are clean across all workspaces.

## Nits

- ⚪ `backend/src/login`-adjacent `frontend/src/app/login/page.tsx:12`, the `landingPath` comment cites a `403 ONBOARDING_REQUIRED` code that does not exist in the codebase; the backend sends `error: 'Onboarding required'`. Quote the real value.
- ⚪ `frontend/src/components/business/timezone-select.tsx:5-7`, `browserTimeZone` moved to `frontend/src/lib/timezone.ts` but the component still imports it only to re-export it (`export { browserTimeZone }`); app code no longer consumes the re-export — drop it (and the duplicated `describe('browserTimeZone')` in `timezone-select.test.tsx`).
- ⚪ `backend/src/domain/timezone.ts:8` and `packages/contracts/src/business.ts:10` duplicate the `IANA_ID_PATTERN` and acceptance rules. The spec records the drift risk as a tradeoff; consider one shared test fixture that runs the same accept/reject corpus against both copies so drift fails a test instead of production.
- ⚪ `frontend/src/app/settings/page.tsx:96` uses `countryForTimeZone(timezone) ?? DEFAULT_COUNTRY` while `frontend/src/app/onboarding/page.tsx:189-193` uses `countryForTimeZone(timezone) || DEFAULT_COUNTRY` for the same missing-country fallback — same outcome, inconsistent operator; pick one.
- ⚪ `backend/src/domain/entities/financial.entity.ts:3-11`, `CASH` and `CASH_ON_DELIVERY` and `CARD`/`PAYPAL` were added with no schema, API, or validation counterpart; keep-alive only as long as the payments slice lands soonest, otherwise it documents a state the API cannot produce.
- ⚪ `frontend/src/app/onboarding/page.tsx:101-109`, `BusinessData['onboardingDraft']` is typed as `OnboardingForm | null`, but the API draft is a partial (`OnboardingDraftSchema` — every field optional). Runtime access is guarded (`draft.currency || ...`, `savedAddress` truthiness), but the type claims required fields; typing it as the contracts `OnboardingDraft` would make the guards self-evident.
- ⚪ `frontend/src/app/onboarding/page.tsx:241`, the effect suppresses `react-hooks/exhaustive-deps`; `businessId`/`updateSettings` are intentionally excluded (the flush captures the owner at call time). A short comment naming the excluded dep and why would keep the next reader from "fixing" it.

## Strengths

- The day rule is implemented once per side as specified and is tested the hard way: DST-transition instants on both sides, two zones on different calendar days at the same instant, a leap day, and the invalid fallback, for both `backend/src/domain/timezone.ts` and `frontend/src/lib/timezone.ts`.
- `packages/contracts/src/business.ts` gets the write-path details right: trim, 1–64 bound, alias canonicalization through the runtime (`resolvedOptions().timeZone`), rejection of offsets and bare abbreviations, and a presence-only response schema so a corrupt stored value cannot fail a read. The "one formatter construction per parse" claim is verified by a spy, not just stated.
- The provider handles the ugly concurrency cases with genuine tests: a save or fetch resolving after sign-out or business switch is dropped, an untrusted 200 response cannot blank a field (each field keeps its last valid value), a malformed cache entry is removed, and cross-business cache leakage is prevented — `frontend/src/components/business/business-settings-provider.test.tsx` (397 lines) reads like a checklist for AC-7.
- The `409 ONBOARDING_COMPLETE` change is honest end to end: the repository reports whether the write landed, the service forwards it, the route answers 409 only for a real skip, and the repository integration test proves both directions against real PostgreSQL (late draft write cannot resurrect a cleared draft; a completed row that still carries a draft is left untouched).
- Full Braille-safe detail is not needed here, but the a11y wiring is real: programmatic `Field` label/description/error id plumbing on both screens, Escape-and-focus-trap dialog with the new backdrop-click focus guard in `useOverlay`, and hydration-safe `mounted` gating so nothing guesses the day before the client clock is known.
- The promise itself never shifts: `formatDateOnly` splits the stored `YYYY-MM-DD` by hand and the Overdue comparison is a lexicographic compare of two plain calendar days, with "deadline equals today" correctly not overdue.

## Test coverage

Strong across all four layers for the governing feature:

- **Contracts**: `TimezoneSchema`/`resolveTimeZone` accept/reject corpus (blank, offsets, abbreviations, unknown, >64), alias canonicalization, draft presence-only reads, and field-injection rejections (`index.test.ts`, `business.test.ts`).
- **Backend**: 61 route tests on the controller covering canonical writes, 400-without-write for invalid zones, the draft `409` both ways, gate exemptions, and the logo 502 path; service tests for the new required-timezone invariant; integration tests for repository mapping, the DB default on a bare insert, and both skip directions on `saveDraft`.
- **Frontend unit**: 28 files / 298 tests pass, including the provider's race matrix, corrupt-cache handling, `TimezoneSelect` grouping/labeling/fallback list, the frontend day helper's DST/two-zone/leap-day cases, and the new country data (unique codes/names, sorted, timezone→country, device fallback).
- **E2E**: extended for prefill (real `timezoneId: Europe/Berlin` context), draft resume, settings cancel/confirm/failure, corrupt stored zone, and the sign-in landing split — but not executed this session (dev stack down). This is the one coverage action item; see the Minor above.

Not covered anywhere: cross-tab behavior for the settings cache (documented tradeoff in the spec's consequences) and the duplicate profile fetch collapse (spec follow-up) — no new finding, both are recorded design outcomes.
