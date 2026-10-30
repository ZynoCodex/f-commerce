# Review, feat/business-timezone, 2026-10-31 (fourth pass)

**Reviewed by**: GLM-5.3-Flash (author on DeepSeek-V4.1-Flash-1017)
**Scope**: 91 tracked files plus uncommitted changes, and 8 untracked files (4 feature/test, 4 earlier review notes), branch vs `main` (merge base `012ffb9`)
**Spec**: `docs/specs/0008-business-timezone/index.md` (governing) · `docs/specs/0007-orders/index.md`
**Previous passes**: `2026-10-30-feat-business-timezone-whole-branch.md` (Approve with nits) · `2026-10-31-…-review.md`, `…-review-2.md`, `…-review-3.md` (Approve with nits; the third raised 0 minors and 9 nits)
**Verdict**: Approve

> This is the **fourth review pass dated 2026-10-31** (the ninth over the branch). Its only job was to verify, with fresh eyes, the nine nits the third pass raised and the sweep then addressed — and to hunt regressions the fixes might have introduced. Every one of the nine is genuinely closed in this tree; each was re-derived from the code and its tests, not taken from the fix notes. All four earlier fixed findings were re-verified as still holding. One new nit (a stale test count in the verification record) and no majors or blockers. Suites re-run by this review, not quoted: contracts **113/113**, frontend **300/300**, backend **390/390** with the real-PostgreSQL integration tests.

## Summary

The post-pass-3 sweep did exactly what the third pass asked and nothing more: it removed dead statements and a dead re-export, aligned one fallback operator, corrected one comment to the real error payload, typed the draft from the contracts, explained one dependency suppression, deleted the backend's duplicated zone rule in favour of the contracts helper, pinned the zone→country map with a test, and moved the customer profile onto the shared money format with its browser test updated. I verified each closing in code and confirmed the tests pin the new state. I paid particular attention to the suspicion that the backend zone check now silently accepts whitespace-padded zone strings it used to reject: **it does not** — the committed local copy already trimmed its input before the pattern test, so the delegation to `resolveTimeZone` is behaviour-preserving; evidence below. The four earlier fixes (pure cache read, exact `Onboarding required` gate, logo `''` normalization on every read path, shared customer money format) all hold, each now with named tests pinning it.

## Nit-sweep verification (all nine closed, with evidence)

1. **Dead `void cancelled;` removed** — `frontend/src/app/onboarding/page.tsx` and `frontend/src/app/settings/page.tsx` no longer contain the no-op statements; `cancelled` is still declared, set in the cleanup, and read in every `.then`/`.catch`/`.finally` guard, so the cancellation semantics are unchanged.
2. **`browserTimeZone` re-export removed** — `frontend/src/components/business/timezone-select.tsx` no longer defines or re-exports it, the component test's duplicated stub and `browserTimeZone` describe are gone, and no file imports it from the component (grep: only `TimezoneSelect` is imported there). The real coverage now lives in `frontend/src/lib/timezone.test.ts:53-73` with three cases, including a throwing `Intl.DateTimeFormat`.
3. **Fallback operator aligned** — `frontend/src/app/onboarding/page.tsx:193,197` now use `countryForTimeZone(timezone) ?? DEFAULT_COUNTRY`, matching `frontend/src/app/settings/page.tsx:95`. The remaining `||` at `onboarding/page.tsx:225` is the deliberate empty-string replacement, as recorded.
4. **Login comment quotes the real payload** — `frontend/src/app/login/page.tsx:18-20` now says `error: "Onboarding required"`, which I confirmed is byte-for-byte what `backend/src/presentation/controllers/business.controller.ts:81` sends.
5. **`onboardingDraft` typed from the contracts** — `onboarding/page.tsx:112` is `OnboardingDraft | null` with a doc comment; every field access (`draft.currency`, `draft.timezone`, `draft.address`, `draft.logoUrl`) is already guarded, and the page compiles unchanged.
6. **Suppression explained** — the `react-hooks/exhaustive-deps` disable at `onboarding/page.tsx:248` now carries the comment naming what a re-run would overwrite.
7. **Backend zone check shares the contracts rule** — `backend/src/domain/timezone.ts:11-13` delegates to `resolveTimeZone`. See the section below: verified behaviour-preserving. The backend reject corpus (`'', '  ', '+06:00', 'Japan', 'GMT', 'CET', 'BST', 'Mars/Olympus', non-strings`) is intact in `backend/src/domain/timezone.test.ts:11-27`, and the contracts tests (`packages/contracts/src/index.test.ts:132-150`) pin the shared accept/trim cases the backend now inherits.
8. **`TIMEZONE_COUNTRY` pinned** — `frontend/src/lib/countries.test.ts:86-99` proves every map value is a code `COUNTRIES` can display over a map of 400+ entries, through the documented `timezoneCountryMap()` accessor (`countries.ts:735`). The fix notes record the author setting one code to `XX` and watching the test fail on `Africa/Accra` before restoring it — the test bites.
9. **Customer profile uses the shared money format** — `frontend/src/app/customers/[id]/page.tsx:25` imports `formatMoney` from `@/lib/catalog-format`; the local device-locale copy is deleted and all six call sites (order columns, spend summary, mobile record cards) use the shared one. The e2e assertions moved from `$1,200.00` to `1,200 USD` (`frontend/e2e/customers.spec.ts:300-310`), desktop and narrow viewport both.

## The suspected regression (backend accepts padded zones now) — refuted

The delegation change does **not** widen the accepted input class. The committed pre-sweep copy (`git show HEAD:backend/src/domain/timezone.ts`) already trimmed before validating:

```ts
const zone = value.trim();
if (zone.length === 0 || zone.length > 64) return false;
if (zone !== 'UTC' && !IANA_ID_PATTERN.test(zone)) return false;
```

`resolveTimeZone` (`packages/contracts/src/business.ts:22-32`) performs the same `trim()`, the same length bounds, the same regex with the same `UTC` carve-out, and the same runtime resolution. Both old and new reject whitespace-only input and accept `' Asia/Dhaka '`; there is no input class whose verdict changed. The only deletions are the duplicated pattern constant and the boolean wrapper's discarded detail (the helper additionally returns the runtime's canonical ID, which the boolean check ignores). The trim behaviour is pinned where the code now lives — `index.test.ts:134` (`resolveTimeZone(' asia/dhaka ')` → `'Asia/Dhaka'`) and `index.test.ts:141` (`'   '` → null) — so the backend's semantics are covered transitively. The judgement: this is a correct, zero-drift deduplication, and it retires the drift surface the third pass flagged rather than moving it.

## Minor

None.

## Nits

- ⚪ `docs/specs/0008-business-timezone/verify.md:58` — the re-run record says "Contracts 113 and **frontend 301** passed", but the current frontend suite is **300** (28 files, 300 passed, 0 skipped, run twice this session), and the third pass's own resolved section also recorded 300. One test moved, not kept: the browserTimeZone block left the component test (−2) and reappeared in `lib/timezone.test.ts` (+3). Correct the count so the verification log the branch treats as evidence stays exact.

## Earlier-fix verification (all four still hold)

- **Render-pure cache read (fixed 2026-10-30)** — holds, and is now defended at three levels: `readBusinessSettingsCache` (`business-settings-cache.ts:47-61`) never writes or resets `lastRead` on any path, `parseBusinessSettingsCache` is a pure function with its own `JSON.parse` guard, and `pruneBusinessSettingsCache` (`:64-75`) re-reads the raw value at commit time so a valid cross-tab write landing between render and prune is kept. The provider prunes only inside the mount effect (`business-settings-provider.tsx:193`), never during render. New tests pin it: the spy test proves `removeItem` is never called and the raw entry survives across five malformed payloads (`business-settings-cache.test.ts:69-88`), and the prune/keep-valid companions cover removal and preservation.
- **Onboarding gate matches the exact field (fixed 2026-10-30)** — holds. `data.error === 'Onboarding required'` at `onboarding/page.tsx:157`, matching the controller's real payload, and the new negative test (`onboarding/page.test.tsx:849-869`) proves a different 403 renders Access denied and never fetches `/onboarding`.
- **`logoUrl: ''` normalization (fixed 2026-10-31)** — holds on every read path, re-audited in this tree: `toBusiness` maps `'' → undefined` (`business.repository.ts:14`), `updateProfile` writes `'' → null` so the column holds one shape (`:49`), sign-in and `/auth/me` map `'' → null` (`auth.repository.ts:123`), all four controller response sites answer `business.logoUrl ?? null`, and `BusinessResponseSchema` rejects `''` by test (`business.test.ts:57-64`). The two new integration tests prove both directions against real PostgreSQL — a legacy `''` row reads as `undefined`, and a fresh `''` write stores `null` at the raw column — and they are deterministic: the file's `beforeEach` truncates and seeds exactly one row, so the un-scoped `update` and the `raw[0]` assertion cannot see another business.
- **Stale fixtures (fixed 2026-10-31, pass 2)** — holds. `incompleteBusiness.logoUrl` is `null` in the onboarding tests, the route test's mock entity carries `logoUrl: undefined` like its neighbour, and the remaining `''` literals sit only inside `onboardingDraft` fixtures where `OnboardingDraftSchema` legitimately allows them.
- **Shared customer money format (fixed in this sweep)** — holds, with the mechanism proved end to end: the page renders the shared `en-US`-plus-code format on all six sites, and the browser test's update from `$1,200.00` to `1,200 USD` was verified to fail before the change and pass after (fix notes; the assertion is exact-text, so it cannot pass accidentally).

## Strengths

- The deduplication was done without any semantic drift, which is the hard part of replacing a copied validator: I compared the committed and current accepted/reject classes line by line and they are identical, and the shared corpus tests at the contracts level now protect both consumers at once.
- The cache purity fix is finished in full: pure read, commit-time prune in the one effect that may write, a spy test that proves no storage write happens during render for five distinct malformed payloads, plus the "keeps a valid entry when pruning" companion guarding the cross-tab case the earlier pass worried about.
- The logo contract is now proven from the column up: real-PostgreSQL integration tests assert the raw stored value, the contracts test rejects `''` at the boundary, the fixtures depict only shapes that can occur, and the e2e asserts the profile answers `null` and that no `img[src=""]` ever renders — a regression class the unit suites cannot see.
- The new onboarding tests pin all three country-prefill sources separately (browser zone via a real `timezoneId: 'Europe/Berlin'` context in e2e, a draft zone without an address, and a saved country that wins), and the negative 403 test closes the exact bug class the wizard gate had before.

## Test coverage

- Every one of the nine fixes arrived with a test that fails without the fix: the cache spy/prune/keep-valid trio, the zone→country prefill tests on onboarding and settings, the negative gate test, the countries referential-integrity test (demonstrated to bite), the contracts `''`-rejection case, the two logo integration tests, and the updated customer e2e assertions. Coverage was not weakened anywhere I checked: the moved `browserTimeZone` tests landed in their new home with one case more than they had in the component file.
- Re-run by this review: contracts 113/113, frontend 300/300, backend 390/390 (real-PostgreSQL integration included, serial as configured).
- Not re-run this pass: e2e (recorded 42/42 across desktop and mobile on 2026-10-31 in both prior sessions; the only e2e edits in this sweep are the money-format and country-value assertions verified above) and `npm run build` (recorded clean in the verify record).
