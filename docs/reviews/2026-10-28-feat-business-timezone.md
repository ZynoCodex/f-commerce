# Review, feat/business-timezone, 2026-10-28

**Reviewed by**: GLM 5.3 Flash Free (author on DeepSeek V4.1 Flash Free, so a different family)
**Scope**: 69 files (67 tracked + 2 untracked), branch vs main (merge base `012ffb9`)
**Verdict**: Approve with nits

## Summary

The branch adds one `businesses.timezone` column with an `Asia/Dhaka` default, a canonicalizing `TimezoneSchema` in the contracts package, an OWNER-gated profile API path, a client `BusinessSettingsProvider` with a per-business validated localStorage cache, a grouped IANA select on onboarding and settings with a change-confirmation dialog, business-zone timestamps everywhere, a render-time Overdue badge driven by `todayInTimeZone`, and a tested backend day helper. The spec's hardest promises — deduplication of writes during in-flight auth switches, canonical ID storage, fallback-on-corrupt-data without crashing, and no day memoization — are actually implemented and tested, not just claimed. No blockers or majors found; the remaining items are small robustness and tidiness notes.

## Minor

### 🟡 Single-slot draft scheduler can silently drop a timezone draft saved from step 3 — `frontend/src/app/onboarding/page.tsx:41,67,70`

**Problem**: `pendingSave` is one module-level slot and `draftDebounceTimer` one timer. Changing the timezone and then the currency (or the reverse) inside the 500 ms debounce window overwrites `pendingSave` and clears the first field's timer, so the first field's draft is never sent — but `savedDraftCache[field]` was already marked saved at line 64, so no later interaction in the session retries it. The pre-existing mechanism only ever had `currency` and `address` draft fields on different steps; this branch puts a second draft-capable select (`timezone`) directly beside `currency` on step 3, making the overlap a realistic interaction rather than a theoretical one. The effect is a lost draft resume: after a refresh the zone silently falls back to the browser prefill instead of the seller's explicit choice, with no signal.

**Why it matters**: AC-5 promises "changing the field saves the draft through the existing debounce"; here the existing debounce quietly eats the first change. It does not lose real data (completion still sends the field), but the draft-resume feature fails nondeterministically exactly when a seller fixes two settings together.

**Suggested fix**: Keep per-field pending state (e.g. a `Map<DraftField, unknown>` plus one timer per field), or store the last `pendingSave` per field and flush all pending fields from the shared timer. Add a test that changes timezone then currency within the debounce window and asserts both draft PUTs land.

### 🟡 `PaymentMethod` widening still rides in the timezone branch with no consumer or test — `backend/src/domain/entities/financial.entity.ts:5,6,9`

**Problem**: `CASH_ON_DELIVERY`, `CARD`, and `PAYPAL` join `PaymentMethod`, but nothing in the branch reads or writes them: no order or payment creation path validates against the new values, and no test covers them. The change has its own commits (`4cefe5d`, `6bca3ae`) and a scope.md paragraph, so it is deliberate groundwork, but it is still unrelated payload carried in a branch whose review, verify, and e2e pass focus on timezone.

**Why it matters**: If the payments feature later validates methods against this enum, dead values ship ahead of their UI and contract with no coverage; the widening also obscured the timezone diff on two previous reviews that flagged it, and it is still un-consumed three reviews later.

**Suggested fix**: Either cherry-pick the payments commits onto the payments feature branch when it exists, or add a one-line contracts/backend test pinning the accepted set so the widened enum stops being unobserved code.

## Nits

- ⚪ `frontend/src/app/settings/page.tsx:59`, `void cancelled;` is a dead statement (the guard below uses `cancelled` normally); drop the line.
- ⚪ `frontend/src/app/onboarding/page.tsx:541` vs `:226`, label says "Max 5MB" while the client rejects above 2MB ("File must be under 2MB"; the backend enforces 5MB). Pre-existing, but the branch re-rendered this step.
- ⚪ `frontend/src/lib/timezone.test.ts:91-105` and `frontend/src/lib/catalog-format.test.ts:60-75`, constructor-count assertions depend on the exact cache state produced by earlier tests in the same file; reordering or adding an earlier test that touches the same zone silently breaks the expected count.
- ⚪ `frontend/src/components/business/timezone-select.tsx:98`, `supportedTimeZones()` enumerates ~430 zones and regroups them on every `value` change though the runtime list never changes within a session; hoisting the enumeration out of the memo (or memoizing the module-level list) is free and removes the doubt.
- ⚪ `nextTask.txt:1`, the tracked scratch file now holds the leftover agent instruction "/document business timezone"; it will otherwise ride into the merge.

## Strengths

- `backend/src/domain/timezone.ts` is exactly what AC-10 ordered: `formatToParts` with a fixed locale and no string slicing, with tests covering each side of a DST transition, a leap day, two zones on different calendar days at the same instant, and the invalid fallback.
- The repository-level draft race fix (`backend/src/.../business.repository.ts:69-79`, `saveDraft` refused once `onboardingComplete = true`) closes the late-landing-draft hole at the only place it can be closed, and the integration tests reproduce the race both directions (draft landing after `clearDraft`, and a completed row still carrying a draft).
- The provider test suite (`business-settings-provider.test.tsx`) is unusually rigorous: late profile responses after sign out, saves that land after a business switch, per-field sanitization keeping the last valid value, and a token-change refetch for the same business — all behaviors the spec demands by AC-7 and previously flagged reviews asked to guard.
- The settings confirm/cancel flow is covered at three levels: unit (fallback baseline from a corrupt stored value, cancel reverts and saves nothing, focus restore, Escape, Tab trap) and real-stack e2e (routed 400 keeping the chosen value with focus on Save).

## Test coverage

Coverage is strong and genuinely behavior-level, not mock-level. Backend: the day helper unit suite, contracts `TimezoneSchema` (canonicalization, once-per-parse construction, every reject class), service timezone-required path, controller routes for `PUT /me`, `PUT /onboarding`, and `PUT /onboarding/draft` writing canonical IDs and 400-ing without writes, and the repository integration suite including the `Asia/Dhaka` row default and both draft-race scenarios. Frontend: the shared formatters (DST reuse, fallback-in-catch, invalid pass-through), day helpers, select grouping/labels/short-list, cache parsing and storage failure, provider races, settings baselines and dialog accessibility, onboarding prefill/draft-resume/completion races, customer detail timestamps, and shell badge/header day. E2E extends the onboarding spec with the real confirm and failure paths on both desktop and mobile projects. Remaining gaps are small: the lost-draft overlap case in the Minor above is untested (the existing tests only resume a valid draft and retry a later save after unmount), and nothing exercises a store where the timezone value is one trimmed character short of an alias boundary — both cheap to add. The suite claims (381 backend / 257 frontend / 106 contracts) were not re-run in this review; the tests read consistent with passing.
