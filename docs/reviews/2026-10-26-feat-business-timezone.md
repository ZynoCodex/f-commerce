# Review, feat/business-timezone, 2026-10-26

**Reviewed by**: GLM-5.3-Flash-Free (author on DeepSeek V4.1 Flash)
**Scope**: 68 files, branch vs main (66 tracked + 2 untracked)
**Verdict**: Approve with nits

## Summary

The change stores one business timezone (migration with an `Asia/Dhaka` default), validates it through the shared contracts schema on every write, adds a per-business client settings provider with a versioned cache, and switches every console timestamp, the delivery deadline warning, and the Overdue badge to the business zone. Onboarding and settings gain the grouped timezone select, the confirmation dialog, and the corrupt-value fallback the spec requires. Quality is high overall: the layers are respected, the contract and helper tests are thorough, and the two previously raised minors were addressed — the currency write is now validated centrally rather than per call site, and that fix is sound. Specifically on the previous pass's question: `commitSettings` is module-private, exactly two code paths reach it (the provider's own `GET /api/business/me` handling via `settingsFromProfile`, and `updateSettings` via the new `sanitizeSettings(next, getSnapshot())`), and `writeBusinessSettingsCache` is only reachable through `commitSettings`, so the single guard covers every current caller. I traced both new tests against a hypothetical version with `sanitizeSettings` dropped: the provider test asserts the snapshot and the cache would both read `currency: ''` and fail, and the settings page test likewise fails on the probe and the cached value. The sanitized value cannot diverge from what the UI shows, because the fallback for an invalid field is the currently displayed snapshot value, not the caller's input. Remaining issues are minor: one defensive gap on the setter path, a hot-path formatting cost, and the still-riding payment enum.

## Minor

### 🟡 `updateSettings` commits under whatever auth is active at write time, no landing guard — `frontend/src/components/business/business-settings-provider.tsx:212-217`

**Problem**: The provider's profile-fetch path resolves a race explicitly (lines 191-194: sign-out or a business switch between request and response is detected and the commit is dropped). The setter path does not: `updateSettings` reads `getAuth()` _at handler time_ and commits the (possibly stale) settings into whatever business is active then, also writing that business's cache. A save that resolves/processes after the active auth changed in the same tab writes business A's settings into business B's cache and live snapshot.
**Why it matters**: Unreachable through today's UI (login navigates with a full reload, logout nulls `getAuth`, and there is no multi-business switcher yet), but the controller's onboarding gate already anticipates STAFF users with multiple memberships, and when a switcher lands this becomes a cross-tenant settings leak into `localStorage`. The provider defends its fetches with exactly this reasoning; setters should match.
**Suggested fix**: Capture the business id the save belongs to (pass it with the settings, or let the caller capture auth when the request starts) and, inside `updateSettings`, drop the commit when `getAuth()?.businessId` no longer matches. One line of the same guard the fetch path already has.

### 🟡 Timezone validation builds `Intl.DateTimeFormat` objects repeatedly on the render hot path — `frontend/src/lib/timezone.ts:6-8` and `frontend/src/lib/catalog-format.ts:17-27`

**Problem**: The frontend `isValidTimeZone` delegates to `TimezoneSchema.safeParse`, whose refine step resolves the zone (one `Intl.DateTimeFormat` construction) and whose transform step resolves it again (a second construction). `formatDateTime` calls it and then builds its own formatter, so each rendered timestamp constructs three `Intl.DateTimeFormat` objects. The orders list renders the Created column in the table plus a phone card per row (both trees stay in the DOM on desktop), so ~100+ formatter constructions happen per list render — some are duplicated in `todayInTimeZone` consumers too.
**Why it matters**: Not a correctness issue and not a blocker at current row counts (20/page), but this multiplies with list size and page complexity, and the backend helper (`backend/src/domain/timezone.ts:14-27`) already shows the cheap shape: regex check plus a single construction, no schema round-trip.
**Suggested fix**: In `frontend/src/lib/timezone.ts`, implement `isValidTimeZone` with the same regex + single `Intl.DateTimeFormat` construction as the backend (one `resolvedOptions` call), and consider a small `Map`-based formatter cache inside `formatDateTime` keyed by zone. Optionally rework `TimezoneSchema` to a single resolve (see nit below) so writes pay the cost once.

### 🟡 Unrelated `PaymentMethod` widening still rides in this timezone branch — `backend/src/domain/entities/financial.entity.ts:3-11`

**Problem**: `CASH_ON_DELIVERY`, `CARD`, and `PAYPAL` are added to `PaymentMethod` even though feature 10 (payments) is the consumer. The widening has no runtime effect in this slice (the enum only types the schema's `method` column, no consumer switches over it, and the column is plain `text`), and `docs/scope/scope.md` now documents the intended method set — but the code change still lands here, where payments reviewers will not see it in context.
**Why it matters**: History hygiene; the timezone feature's diff, revert range, and commit narrative now include another feature's model change.
**Suggested fix**: Either move the enum widening into feature 10's branch, or if it intentionally ships here, say so in the commit message so the payments change reads as prep, not accident. Verify no `Record<PaymentMethod, …>` map breaks when feature 10 re-types the column.

## Nits

- ⚪ `packages/contracts/src/business.ts:33-39`, `TimezoneSchema` resolves the timezone via `refine` and again via `transform`; a single `transform` that reports failure (or `z.custom`) would canonicalize once instead of constructing the formatter twice per parse.
- ⚪ `frontend/src/app/settings/page.tsx:58` (and `frontend/src/app/onboarding/page.tsx:134`), `void cancelled;` is a dead statement that implies a purpose it does not serve; drop it.
- ⚪ `backend/drizzle/migrations/0006_absurd_hobgoblin.sql:1`, the generated migration lacks a trailing newline.
- ⚪ `frontend/src/app/customers/[id]/page.tsx:43-48`, this page keeps its own `formatMoney` using `style: 'currency'` while every page touched here uses the shared `formatMoney` (plain number + code). Consistent money formatting is pre-existing scope creep the currency sourcing in this slice made more visible; worth a line in a future polish pass.

## Strengths

- The write-path validation is designed, not bolted on: `sanitizeSettings` at the single choke point, per-field cache validation that removes malformed entries, and presence-only reading of the profile response. Both new tests are mutation-sensitive — removing the guard makes each fail on the snapshot and the cached file.
- The stale-draft race is covered twice (repository `WHERE onboarding_complete = false` plus the wizard's `cancelDraftSave()` before completion), with a real integration test reproducing the in-flight draft after `clearDraft`.
- Contract tests exercise the hard schema cases honestly (canonicalization of `asia/dhaka`, the `Asia/Calcutta` → `Asia/Kolkata` alias, offsets/abbreviations/legacy names rejected), and the backend day helper's tests hit both sides of a DST transition, a leap day, and two zones on different days at one instant.

## Test coverage

Strong on new logic. Backend: schema and canonicalization (contracts, 400 paths for missing/invalid timezone on `/me`, `/onboarding`, and the draft), service requirement, repository default and race (real Postgres integration), controller route coverage. Frontend: provider (fallback, cache apply, failure, sign-out, cross-business isolation, invalid write), cache module, timezone helpers and select, settings page (dialog open/cancel/confirm/fail/Escape/focus restore, fallback baseline, the `currency: ''` save), onboarding (draft resume, browser prefill, invalid draft, draft debounce, completed flow), order deadline badge/cell/summary, order form business-day warning (New York vs browser day), customer detail timestamps (America/Los_Angeles with UTC and Dhaka renderings excluded), shell day/badge, and updated E2E for the settings dialog flows.

Gaps worth noting: the cross-business race in `updateSettings` has no test (matches the finding above — add one if the guard lands); the provider's `GET`-with-invalid-currency path shares code with the PUT path but isn't asserted directly; `supportedTimeZones`' empty-list branch is untested; the E2E specs were updated but not run in this pass (stated in the scope file); and the verify ledger's two remaining unchecked manual steps (browser-console `clearAuth` + re-login, and full keyboard/screen-reader passes) are still open claims for AC-7 and AC-12.
