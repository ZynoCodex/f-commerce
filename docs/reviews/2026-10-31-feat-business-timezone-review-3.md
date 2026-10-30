# Review, feat/business-timezone, 2026-10-31 (third pass)

**Reviewed by**: GLM-5.3-Flash (author on DeepSeek-V4.1-Flash-1017)
**Scope**: 91 tracked files plus uncommitted changes, and 7 untracked files (4 feature/test, 3 earlier review notes), branch vs `main` (merge base `012ffb9`)
**Spec**: `docs/specs/0008-business-timezone/index.md` (governing) · `docs/specs/0007-orders/index.md` (Update 2026-10-29)
**Previous passes**: `docs/reviews/2026-10-30-feat-business-timezone-whole-branch.md` (Approve with nits) · `docs/reviews/2026-10-31-feat-business-timezone-review.md` (Approve with nits, 1 minor) · `docs/reviews/2026-10-31-feat-business-timezone-review-2.md` (Approve with nits, 1 minor)
**Verdict**: Approve with nits

> This is the **third review pass dated 2026-10-31** (the eighth over the branch). No new blockers or majors. The four findings marked fixed by the earlier passes were each re-verified in this tree, not just taken on faith; see "Earlier-fix verification" below. Eight nits survive from the earlier passes, unchanged.

## Summary

The change delivers spec 0008 end to end — the `businesses.timezone` column and migration, the `TimezoneSchema`/`resolveTimeZone` boundary, the profile and draft API with the honest `409 ONBOARDING_COMPLETE`, the shared `BusinessSettingsProvider` with its per-business cache, the onboarding and settings timezone fields with the confirmation dialog, business-zone timestamps, the shifted Overdue rule, the backend day helper, and the static country picker. Since the second pass, the only new work is the logo-normalization completion (which that pass recommended) and its test coverage; nothing else moved functionally. I re-ran every suite this session — contracts 113, backend 390 (real-PostgreSQL integration included), frontend 301, plus typecheck, lint, and format:check — all green. No new majors: one pre-existing adjacent inconsistency is flagged as a nit, and the eight carried nits are listed with their current state.

## Nits

Carried from the earlier passes; each re-checked as still open in this tree, none worsened:

- ⚪ `frontend/src/app/onboarding/page.tsx:143`, `frontend/src/app/settings/page.tsx:61` — the `void cancelled;` statements are still dead expressions; `cancelled` is genuinely used in the closures below, so the no-op lines are pure noise. Delete both.
- ⚪ `frontend/src/components/business/timezone-select.tsx:7` — the `export { browserTimeZone }` re-export has no consumer (the onboarding page imports from `@/lib/timezone`, where the function now lives and is properly tested), and `timezone-select.test.tsx:70-86` still re-tests it through the re-export. Drop both. Half the original nit is fixed: the function moved to `lib/timezone.ts` with three tests covering the device zone, an unknown reported zone, and an `Intl` that throws.
- ⚪ `frontend/src/app/onboarding/page.tsx:189` uses `countryForTimeZone(timezone) || DEFAULT_COUNTRY` (twice: also line 193) while `frontend/src/app/settings/page.tsx:96` uses `?? DEFAULT_COUNTRY` for the same fallback. Same outcome today; settle on one operator.
- ⚪ `frontend/src/app/login/page.tsx:18` — the comment cites "A 403 ONBOARDING_REQUIRED", a code that exists nowhere; the backend sends `error: 'Onboarding required'` (`backend/src/presentation/controllers/business.controller.ts:81`). Note this comment is new prose written in this branch (the `landingPath` doc block), so the branch re-introduced the exact wording-drift class that caused the 2026-10-30 wizard-gate bug, in a comment. Quote the real value.
- ⚪ `frontend/src/app/onboarding/page.tsx:108` — `onboardingDraft` is still typed as the full `OnboardingForm | null` while the API draft is partial (`OnboardingDraftSchema`, every field optional). Runtime access is guarded; typing it as the contracts' `OnboardingDraft` would make the guards self-evident.
- ⚪ `frontend/src/app/onboarding/page.tsx:241` — the `react-hooks/exhaustive-deps` suppression still carries no comment naming the excluded `businessId`/`updateSettings` and why (the flush captures the owner at call time).
- ⚪ `backend/src/domain/timezone.ts:8` and `packages/contracts/src/business.ts:10` still duplicate `IANA_ID_PATTERN` and the accept/reject rule with no shared corpus. The frontend reuses the contracts' `resolveTimeZone` (correct), so the drift surface is these two copies; the spec records the tradeoff. One shared accept/reject fixture run against both would turn drift into a test failure.
- ⚪ `frontend/src/lib/countries.ts:280` — nothing pins `TIMEZONE_COUNTRY`'s values to `COUNTRIES` entries; an orphaned code would silently return the default country. Still true. I re-verified the map is complete today: all 437 values resolve to `COUNTRIES` codes, and all 418 `Intl.supportedValuesOf('timeZone')` IDs on this Node 24 map except the documented `UTC`. The two-line invariant test proposed in the last two passes remains the cheap way to keep it true.

New in this pass:

- ⚪ `frontend/src/app/customers/[id]/page.tsx:43-51` — the local `formatMoney` uses `new Intl.NumberFormat(undefined, { style: 'currency', currency })`, so amounts render in the viewer's device locale while every other money surface uses `formatMoney` (`en-US` + currency code) from `frontend/src/lib/catalog-format.ts`. The same stored total reads `€1,234` on one device and `1.234,00 €` on another — the same cross-device inconsistency class this feature just eliminated for dates. **Pre-existing**: the function shipped at the merge base and this branch touched only the timestamps around it, so this is a holdout to fix in a follow-up, not a defect introduced here.

## Resolved 2026-10-31 (third pass, after the nit sweep)

Every nit below is fixed in the working tree, and the suites were re-run the same session: contracts 113, backend 390, frontend 300, browser suite 42 of 42, lint, typecheck and format clean.

- Dead `void cancelled;` statements: removed from `frontend/src/app/onboarding/page.tsx` and `frontend/src/app/settings/page.tsx`. The guard is still set in the cleanup function.
- `browserTimeZone` re-export: removed from `frontend/src/components/business/timezone-select.tsx`, along with the duplicated `browserTimeZone` block and its now unused stub in the component test. The real tests stay in `frontend/src/lib/timezone.test.ts`.
- `||` versus `??` fallback: onboarding now uses `??` for the zone to country lookup, the same operator settings already used. A saved country is still kept as typed, so `||` stays only where an empty string must be replaced.
- Login comment: now quotes the real `error: "Onboarding required"` payload, matching what the controller sends.
- `onboardingDraft` type: now the contracts' `OnboardingDraft`, so the partial shape is stated by the type rather than assumed. The page compiles unchanged because every field is already guarded.
- Exhaustive deps suppression: now carries a comment saying why the effect runs once per mount, and what re-running it would overwrite.
- Duplicated zone pattern: the backend `isValidTimeZone` now calls the contracts' `resolveTimeZone` instead of keeping its own copy of `IANA_ID_PATTERN` and the runtime check. Both layers ran the same accept and reject cases before, and now they share the code those cases test.
- `TIMEZONE_COUNTRY` integrity: now pinned by a test in `frontend/src/lib/countries.test.ts` that every zone maps to a code `COUNTRIES` can show, and that the map is not empty. To check it bites, one code was temporarily set to `XX` and the test failed on `Africa/Accra`, then the file was restored. A small `timezoneCountryMap()` accessor exports the map for the test.
- Customer money format: the local `formatMoney` in `frontend/src/app/customers/[id]/page.tsx` is replaced by the shared one from `frontend/src/lib/catalog-format.ts`, so the profile shows `1,200 USD` like every other money surface instead of the device currency symbol. The browser test that asserted `$1,200.00` was updated to the console format; it was the only test relying on the old shape, and it failed before the update, which confirmed the change reached the screen.

## Earlier-fix verification (why nothing is re-reported)

- **Render-pure cache read (fixed 2026-10-30)** — holds. `readBusinessSettingsCache` neither writes storage nor mutates `lastRead` on the throw path (`business-settings-cache.ts:47-61`); `pruneBusinessSettingsCache` re-reads the raw value at commit time, so a valid cross-tab write between render and prune survives (`business-settings-cache.ts:64-75`); the provider prunes only in the effect (`business-settings-provider.tsx:193`). Pinned by the spy test across five malformed payloads plus the prune and keep-valid companions (`business-settings-cache.test.ts:69-119`).
- **Onboarding gate detected by error copy (fixed 2026-10-30)** — holds. `data.error === 'Onboarding required'` at `onboarding/page.tsx:154`, with the negative test (a different 403 renders Access denied and never fetches `/onboarding`). The only surviving copy drift is the login comment nit above.
- **`logoUrl: ''` normalization (fixed 2026-10-31, pass 1)** — holds on every read path, re-audited: `toBusiness` maps `'' → undefined` (`business.repository.ts:14`), `updateProfile` writes `'' → null` so the column holds one shape (`business.repository.ts:49`), sign-in and `/auth/me` map `'' → null` in `findUserBusinesses` (`auth.repository.ts:123`), and all four business-controller response sites answer `business.logoUrl ?? null`. The entity documents the invariant (`business.entity.ts:17-22`), and `BusinessResponseSchema` stays strict (URL or `null`, never `''`) now that the API can keep that promise.
- **Stale test fixtures (fixed 2026-10-31, pass 2)** — holds. `incompleteBusiness` in the onboarding page tests now carries `logoUrl: null` (`onboarding/page.test.tsx:32`); the route test's mock entity carries `logoUrl: undefined` (`business.controller.route.test.ts:272`), matching its neighbor at line 246. Every remaining `logoUrl: ''` in tests is deliberate and inside `onboardingDraft` fixtures, where `OnboardingDraftSchema` legitimately accepts plain strings.

## Strengths

- The logo normalization was finished exactly where the last pass aimed: both repository read/write paths keep the column single-shape, the auth mirror covers the one payload `toBusiness` cannot build, and the two new integration tests prove both directions against real PostgreSQL (a legacy `''` row reads as `undefined`; a fresh `''` write stores `null` raw at `business.repository.integration.test.ts:135-152`). The contracts test pins the strict response shape from the other side.
- The e2e layer now guards the no-logo contract end to end: the onboarding spec reads the real profile and asserts `logoUrl` is `null`, then requires the settings screen to show the saved zone with zero `img[src=""]`/`img[src="null"]` elements (`e2e/business-onboarding.spec.ts:222-227`) — a regression class the unit suites cannot see.
- `browserTimeZone` gained real tests in its new home (`frontend/src/lib/timezone.test.ts:53-73`), including the case where `Intl.DateTimeFormat` construction itself throws — the fallback most copy-paste zone helpers miss.
- The static country data keeps earning its written rationale: I independently confirmed every `TIMEZONE_COUNTRY` value resolves to a `COUNTRIES` entry and every runtime zone ID maps (UTC documented miss), matching the claims recorded in the earlier passes.
- All quality gates pass this session, run by this review, not quoted from the session log: contracts 113/113, backend 390/390 (real-PostgreSQL integration included), frontend 301/301, `npm run typecheck`, `npm run lint`, and `npm run format:check` clean.

## Test coverage

- The two suites touched since pass 2 are pinned where they changed: the repository logo normalization by both integration tests (read path and write path, with the raw-column assertion), and the contract by the `''`-rejection case (`packages/contracts/src/business.test.ts:55-64`). The onboarding fixtures now exercise the `null` shape the API actually sends.
- Unchanged from the earlier passes and still acceptable: cross-tab cache staleness and the duplicate profile fetch on auth change are recorded as design outcomes in the spec's consequences/follow-up; `TIMEZONE_COUNTRY` referential integrity stays unpinned (nit above).
- Not re-run this pass: e2e (recorded 42/42 desktop and mobile on 2026-10-31 in both prior sessions; nothing in this pass's diff touches a flow those specs do not already cover) and `npm run build` (recorded clean after the fix).
