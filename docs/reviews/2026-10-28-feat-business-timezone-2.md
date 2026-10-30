# Review, feat/business-timezone, 2026-10-28

**Reviewed by**: GLM-5.3-Flash-Free (author on DeepSeek V4.1 Flash Free)
**Scope**: 73 files, branch vs main (67 tracked + 6 untracked, merge base `012ffb9`)
**Verdict**: Approve with nits

## Summary

The change adds one not-null `businesses.timezone` column through a single generated migration with an `Asia/Dhaka` default, validates and canonicalizes every write through a shared `TimezoneSchema` (trim, 1–64 chars, IANA-shape regex, runtime resolution), maps the field through entity, service, repository, and all four business endpoints, and then uses the stored zone on every surface the spec names: the onboarding and settings grouped selects, the change-confirmation dialog, the shell badge and header day, every console timestamp, the delivery-date warning, and the derived Overdue badge. A client `BusinessSettingsProvider` on `useSyncExternalStore`, a versioned per-business `localStorage` cache, and a new `subscribeToAuth` signal replace the per-page currency fetches. Independently, I traced the schema, fallback chains, fetch/save races, the draft guard, the DST and two-zone paths, the migration, the dialog flow, and the AC-5/AC-6/AC-9/AC-11 rules; the implementation tracks spec 0008 AC by AC and the test suite is behavioral, not mock-level. No blockers or majors; what remains are defensive edges on the settings write path, a confirmable dialog escape hatch, an unrelated enum rider, and branch tidiness.

## Minor

### 🟡 The shared-provider update is skipped when the save response has no string currency, dropping the new timezone, `frontend/src/app/settings/page.tsx:143-145`

**Problem**: `submitProfile` only calls `updateSettings` inside `if (typeof saved.currency === 'string')`. If `data.data` carries a non-string or missing `currency` (for whatever future reason), the whole call is skipped and the just-saved `timezone` never reaches the provider, cache, badge, or timestamp surfaces. The same pattern exists at `frontend/src/app/onboarding/page.tsx:298`, where a missing `timezone` string in the response also drops the currency.
**Why it matters**: Unreachable against today's controller, which always returns both fields as strings. But it couples two independent fields: a one-field contract change in the backend would silently break timezone propagation while `Profile updated` still shows, and AC-6 says the page updates the shared settings from the response `data`. The provider's own `sanitizeSettings` already keeps the last valid value per field, so the page could call it unconditionally and get the same malformed-currency protection the test at settings/page.test.tsx:168 checks.
**Suggested fix**: Call `updateSettings({ currency: saved.currency as unknown, timezone: nextTimeZone }, targetBusinessId)` unguarded and let the provider's existing per-field sanitization decide, or split the two fields so each falls back independently.

### 🟡 Focus can escape the timezone confirmation dialog behind an open backdrop, `frontend/src/components/ui/primitives.tsx:284-315` (consumed by the new dialog at `frontend/src/app/settings/page.tsx:321-343`)

**Problem**: The `useOverlay` Tab trap only corrects focus when the active element is the dialog root, the first, or the last focusable node. If focus ever sits outside the dialog while it is open — clicking the backdrop moves focus to `body` — the next Tab is not intercepted, so focus moves into the page content behind the modal, out of the trap.
**Why it matters**: The trap is a pre-existing primitive, but AC-12 now rests on it for this new dialog ("the dialog traps and restores focus"), and the settings dialog is where a stray routine save lives behind a destructive-timing change. Escape still cancels, so the user is never stranded, but a keyboard user who clicks the backdrop and Tabs on gets an unfocused modal.
**Suggested fix**: In the `Tab` branch, treat an active element outside the dialog as out-of-trap and `event.preventDefault()` + focus the first (or, with shift, the last) focusable node; or mark the page inert while the dialog is open.

### 🟡 Escape while a confirmed save is in flight reverts the select before the outcome is known, `frontend/src/app/settings/page.tsx:175-178, 321-326`

**Problem**: The dialog's Cancel and Confirm buttons are gated by `isSaving`, but the `useOverlay` Escape path is not: `onClose` → `cancelTimeZoneChange` resets `form.timezone` to the baseline while the `PUT /api/business/me` is still running. If the save then succeeds, `submitProfile` re-syncs the select and baseline, so state heals; if it fails, the select silently sits on the baseline while the error tells the user nothing about the reversion.
**Why it matters**: It is a transient inconsistency between what the user chose and what the select shows, on the exact dialog the spec invests in (AC-6: "On failure the existing error message shows and the form keeps the chosen value").
**Suggested fix**: Either ignore Escape (drop `onClose`) while `isSaving` is true, or keep a `changeWasConfirmed`-style flag so the failure path does not have to re-derive it from the reverted select.

### 🟡 Unrelated `PaymentMethod` widening rides in the timezone branch, `backend/src/domain/entities/financial.entity.ts:3-11`

**Problem**: `CASH_ON_DELIVERY`, `CARD`, and `PAYPAL` join the enum, but nothing in the branch reads or writes them: no order or payment path validates against the new values and no test covers them. `docs/scope/scope.md` now documents the intended method set and the change has its own commits (`4cefe5d`, `6bca3ae`), so it is deliberate feature-10 prep.
**Why it matters**: History hygiene. A payments reviewer will meet a three-line enum widening without its consumers, and a future `Record<PaymentMethod, …>` exhaustion map would compile here with no review of the consequences.
**Suggested fix**: If prep shipping early is a standing choice, remember it for feature 10: the extension method set deserves its own review there, and any exhaustive map added later must be checked against these values.

### 🟡 Untracked test files and scratch artifacts threaten silent coverage loss, `frontend/src/app/customers/[id]/page.test.tsx`, `frontend/src/components/shell/shell.test.tsx`, `nul`, `nextTask.txt`, `frontend/test-results/.last-run.json`

**Problem**: The new customer-detail and shell test files are not staged for the branch; if the merge goes ahead without them, CI on a clean checkout runs without the very coverage the scope entry claims (shell business day, customer timestamps), and nothing fails because the files simply do not exist there. Alongside them sit a zero-byte Windows-reserved `nul` file at the repo root (hard to delete normally), a `nextTask.txt` scratch note churned to `/document business timezone`, and a tracked `frontend/test-results/.last-run.json` Playwright artifact modified in the working tree.
**Why it matters**: The verified counts (258 frontend, 32 Playwright) are only true for the working tree; they are not guaranteed for the pushed branch until these files are committed — or the artifacts properly ignored.
**Suggested fix**: `git add` the two test files, delete `nul` (`del \\.\G:\Bulbul\f-commerce\nul` or `git clean` from WSL/bash), move `nextTask.txt` content into the relevant spec's follow-up section or delete it, and add `test-results/` to `.gitignore` with `git rm --cached frontend/test-results/.last-run.json`.

## Nits

- ⚪ `frontend/src/app/settings/page.tsx:59`, `frontend/src/app/onboarding/page.tsx:141`, `void cancelled;` no-op statements are dead code left over from introducing the guard; delete them.
- ⚪ `frontend/src/components/business/business-settings-provider.tsx:178-214`, a business-id change fires two identical `GET /api/business/me` requests (the auth subscription's `load` plus the effect re-run). Both are guarded and last-write-wins, and the spec already records collapsing it when the switcher lands — noting it here so the follow-up line stays honest.
- ⚪ `frontend/src/app/onboarding/page.tsx:542`, the timezone description says "delivery deadlines" while settings says "delivery dates"; one wording across both screens would read cleaner.

## Strengths

- The race story is coherent end to end: saves capture the target business id before the request and drop on landing (`updateSettings(next, targetBusinessId)`), late profile responses are checked against the active auth, `clearAuth` removes only the active business's cache, and the repository's `onboardingComplete = false` filter closes the stale-draft-write race — with a real PostgreSQL integration test proving a completed row is never resurrected.
- Validation lives at one contract boundary: `TimezoneSchema` trims, bounds, shape-checks, and canonicalizes through the runtime, lowercase IDs and aliases resolve to their canonical form, and both app copies count constructor calls in tests to prove reuses instead of re-parses on the render hot path.
- The fallback chain is consistent everywhere — DB default, `DEFAULT_TIME_ZONE` in both helpers, provider, and formatter catch — and corrupt data is exercised at every layer (stored value, cache entry, profile response) without a crash or a blank screen.
- Tests assert behavior, not mocks: DST both directions, leap day, `Pacific/Kiritimati`-vs-`Midway` style two-zone days, badge exclusion for final statuses, dialog Escape/Tab/focus-return, draft debounce coalescing across fields, and E2E coverage of cancel, confirm, failure, and select reversion.

## Test coverage

Test signal is configured and the recorded run passes (106 contracts, 381 backend with 1 skipped, 258 frontend, 32 Playwright; E2E with `RATE_LIMIT_DISABLED=true`). Every AC maps to named, behavior-level tests, including the previously reviewed gaps (mobile shell badge, stale draft guard, validated settings write, dialog focus trap, token refetch, storage failure). Remaining small gaps, none blocking: the settings write path is only tested with an empty-string currency (not a missing one), the Escape-while-saving sequence has no test, and focus return after a confirmed successful change is covered manually in verify.md rather than in the suite. The two new untracked test files must land with the branch or the frontend suite regresses silently (see minor).
