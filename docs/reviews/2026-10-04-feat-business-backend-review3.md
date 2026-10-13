# Review, feat/business-backend, 2026-10-04

**Reviewed by**: Qwen3.8-Max (author on Claude Code)
**Scope**: 28 files, branch vs main
**Verdict**: Blocked

## Summary

The branch delivers the business profile API, Cloudinary logo upload, onboarding wizard, settings/login/dashboard pages, and shared contracts, and it correctly resolves the tenant-isolation and draft-field-injection blockers from earlier reviews. However, the update contract applies a Zod default that silently resets `currency` to BDT on any partial `PUT /me`, the onboarding gate leaks onboarding status of businesses the caller is not a member of, the draft-save value is unvalidated despite verify.md claiming otherwise, and the frontend name pre-fill branch is dead code that can never execute. Several findings rest on behavior that verify.md marks as verified, so the verify evidence should be re-run after fixes.

## Blockers

### 🔴 Partial `PUT /me` silently resets currency to BDT, `packages/contracts/src/business.ts:15`

**Problem**: `BusinessProfileUpdateSchema` is derived from `BusinessProfileSchema`, whose `currency` field carries `.default('BDT')`. Zod fills defaults during `safeParse`, so a request body that omits `currency` parses successfully with `parsed.data.currency === 'BDT'`. The `PUT /me` handler (`backend/src/presentation/controllers/business.controller.ts:176`) passes `parsed.data` straight to `businessService.updateBusiness`, and the repository writes every defined field. The schema name and REST verb promise a partial update, but omitting `currency` overwrites the stored value.
**Why it matters**: Any API consumer updating only `name` or `address` silently corrupts the business's currency. The settings UI happens to send the full form today, which masks the bug — one new caller (or a future UI change) loses data with no error.
**Suggested fix**: Make all fields optional in the update schema (`.partial()` or a dedicated schema with no defaults), and only forward fields actually present in the request. Add a test: PUT with only `{ name }` must not change `currency`.

## Major

### 🟠 Onboarding gate probes businesses the user is not a member of, `backend/src/presentation/controllers/business.controller.ts:96-119`

**Problem**: The gate looks up membership but continues regardless: for a non-member, `membership` is `undefined` and the context role falls back to `'STAFF'` (line 103), then `businessService.getBusiness(businessId)` runs against an arbitrary business ID. The response distinguishes "business exists, not onboarded" (403 Onboarding required) from "onboarded, proceed" (next(), then 403 from `requireBusinessRole`).
**Why it matters**: An authenticated attacker can enumerate business IDs and learn each one's existence and onboarding status — cross-tenant information disclosure. It also executes a DB read for a tenant the caller has no right to touch.
**Suggested fix**: When no membership matches the `x-business-id` header, return 403 immediately in the gate, before any DB access. Add a test for the non-member path.

### 🟠 Draft save value is unvalidated, contradicting verify.md evidence, `packages/contracts/src/business.ts:25`

**Problem**: `DraftSaveSchema` whitelists `field` but declares `value: z.unknown()`. The controller and `MongooseBusinessRepository.saveDraft` store whatever arrives at `onboardingDraft.<field>` verbatim. verify.md claims `field:"currency"` with `value:"INVALID_CURRENCY"` returns 400 — the current code returns 200.
**Why it matters**: Arbitrary JSON (wrong types, huge payloads, nested objects) lands in the draft and is later spread into wizard form state on resume, which can break rendering. The documented verification no longer matches the code, which undermines trust in the other verify claims.
**Suggested fix**: Replace the flat schema with a discriminated union keyed on `field` (name: string, currency: CurrencyEnum, address: AddressSchema, logoUrl: url-string), and add a test per field including an invalid-currency rejection.

### 🟠 Business-name pre-fill branch can never execute, `frontend/src/app/onboarding/page.tsx:165-166`

**Problem**: The 403 fallback reads `const biz = authData.businesses?.[0]?.businessId; if (biz?.name)`. `businessId` is a string, so `biz?.name` is always `undefined` and `setForm` never runs. The code likely meant `authData.businesses?.[0]` (or the auth profile's business name field) — and `/api/auth/me`'s actual response shape should be checked, since `businesses` may not exist either.
**Why it matters**: The wizard does not pre-fill the name registered at sign-up — the exact behavior commit 6315507 and verify.md ("wizard pre-fills the business name from the auth profile") claim to deliver. Users re-enter data they already gave.
**Suggested fix**: Read the correct property from the real `/api/auth/me` response, and add a unit test asserting the name lands in the form when `GET /api/business/me` returns 403.

### 🟠 `aria-invalid` inverted on the wizard's required field, `frontend/src/app/onboarding/page.tsx:373`

**Problem**: `aria-invalid={Boolean(form.name)}` marks the input invalid when it HAS a value and valid when empty — the opposite of the intended semantics and of the adjacent `error` prop logic.
**Why it matters**: AGENTS.md mandates the WCAG AA baseline. Screen readers announce the field as erroneous precisely when the user has typed correctly, and as fine when it is empty.
**Suggested fix**: Invert the condition (`!form.name`, or only after a touched/attempt state), and grep for other `aria-invalid` uses with the same pattern.

### 🟠 Frontend hardcodes localhost backend and bypasses its own proxy, `frontend/src/lib/auth-client.ts:3,41-48`

**Problem**: `apiFetch` rewrites every `/api/...` call to `NEXT_PUBLIC_API_URL || 'http://localhost:4000'`, deliberately skipping the Next.js rewrites added in `next.config.ts`. In any deployment without `NEXT_PUBLIC_API_URL` set, the browser calls `http://localhost:4000` and the whole app silently fails; with it set, cross-origin credentialed calls depend on `CORS_ORIGINS` being configured in lockstep. Meanwhile the `rewrites()` config is dead code on the client.
**Why it matters**: The project's stated path is Vercel deployment. As written, a production build breaks at runtime with no build-time signal, and two conflicting routing mechanisms (rewrites vs direct URL) will drift.
**Suggested fix**: Pick one path: use same-origin `/api/...` through the Next rewrites (they work for client fetches too), or keep direct calls but fail fast at build/start when `NEXT_PUBLIC_API_URL` is unset in production. Document the CORS pairing requirement either way.

## Minor

### 🟡 `GET /me` exposes the onboarding draft to STAFF members, `backend/src/presentation/controllers/business.controller.ts:140`

**Problem**: The route allows `['OWNER', 'STAFF']` and the response includes `onboardingDraft` unconditionally.
**Why it matters**: Draft setup data (address, currency choices) is owner-in-progress data; STAFF members need the live profile, not the owner's unfinished edits.
**Suggested fix**: Include `onboardingDraft` only for OWNER, or only when `onboardingComplete` is false.

### 🟡 Logo endpoint labels every failure as a Cloudinary 502, `backend/src/presentation/controllers/business.controller.ts:244-246`

**Problem**: The catch wraps upload AND the subsequent `updateBusiness` persistence; a repository failure or `NotFoundError` returns `502 {"error":"Cloudinary upload failed"}`.
**Why it matters**: Misleading status and message make production triage wrong; the upload succeeded but persistence failed — the URL is lost with an error that points at Cloudinary.
**Suggested fix**: Separate the two phases: Cloudinary errors → 502, persistence errors → 500/404 per existing patterns.

### 🟡 Multer size overflow surfaces as unhandled middleware error, `backend/src/presentation/controllers/business.controller.ts:213-216`

**Problem**: Multer already enforces the 5MB limit and raises a `MulterError` via `next(err)` before the handler's redundant `req.file.size > maxSize` check ever runs. No error middleware exists in `server.ts`, so Express's default handler emits an HTML 500.
**Why it matters**: API clients get a non-JSON error for an expected validation case; the in-handler size check is dead code.
**Suggested fix**: Add an error handler that maps `MulterError` (and generally non-HTTP errors) to the JSON `{error, message}` shape, and drop the redundant check.

### 🟡 Module-global draft-save state persists from prior review, `frontend/src/app/onboarding/page.tsx:30-37`

**Problem**: `savedDraftCache`, `pendingSave`, and `draftDebounceTimer` are still module-level mutable globals — the Major from the 2026-10-01 review2 was left unaddressed. State survives unmount, breaks under Fast Refresh, and the single `pendingSave` slot can drop a save when two different fields change inside the 500ms window.
**Why it matters**: Test isolation and dev-mode correctness suffer; a dropped draft contradicts the resume-on-reload promise.
**Suggested fix**: Move the debounce/cache into a `useRef`-based custom hook (`useDraftSave`) as previously suggested, or queue pending saves per field.

### 🟡 Auth guard reads localStorage during render, causing hydration mismatch, `frontend/src/lib/auth-guard.ts:29`

**Problem**: `authed` is computed in render from `typeof window !== 'undefined' && !!getAuth()`. Server renders the fallback; an authenticated client renders the full page on first paint — a hydration mismatch on every protected route.
**Why it matters**: React logs mismatch warnings and may re-render the whole subtree; the "no flicker" comment describes the opposite of what happens for authenticated users on SSR pages.
**Suggested fix**: Decide auth state in `useEffect`/`useSyncExternalStore`, or accept the one-tick fallback render uniformly.

### 🟡 JWT decode triplicated in auth controller, `backend/src/presentation/controllers/auth.controller.ts:62-72`

**Problem**: The identical base64-decode-and-pick-`memberships[0]` block is copy-pasted across register, login, and oauth routes, and each swallows decode errors silently. It also hardcodes "first membership" as the primary business for multi-membership users.
**Why it matters**: Three places to keep in sync; the silent catch hides token-shape regressions; arbitrary primary-business selection for multi-membership users (known limitation, but now baked into three copies).
**Suggested fix**: Extract one helper (e.g. `extractPrimaryBusinessId(accessToken)`) and use it in all three routes.

### 🟡 Onboarding completion is two non-atomic writes, `backend/src/application/services/business.service.ts:56-67`

**Problem**: `completeOnboarding` updates the profile, then clears the draft in a second statement. If the second write fails, the business is complete but still carries a stale draft that the wizard resume logic will re-apply.
**Why it matters**: Rare, but leaves inconsistent documents with no recovery path.
**Suggested fix**: Combine into one update (`$set` profile fields + `$unset: { onboardingDraft: '' }`) in a single repository call.

### 🟡 Test gaps in newly added gate and update paths

**Problem**: With tests configured, the following changed logic has no covering test: the gate's non-member branch (the new Major), partial `PUT /me` without currency, draft value rejection, and the settings-page save flow.
**Why it matters**: These are exactly the branches where this review found bugs; regression tests would have caught all four.
**Suggested fix**: Hand to /test with this list.

## Nits

- ⚪ `.gitignore:6`, missing trailing newline at end of file.
- ⚪ Repo root carries untracked manual-test fixtures `test-png.png`, `test-spoof.png`, `test-valid.png` — delete before merge.
- ⚪ `frontend/src/app/onboarding/page.tsx:111`, `void cancelled;` is dead — the variable is used later; drop the statement.
- ⚪ `frontend/src/app/onboarding/page.tsx:27`, `DraftField` omits `'logoUrl'` although the backend `DraftSaveSchema` allows it.
- ⚪ `frontend/src/app/onboarding/page.tsx:368`, hardcoded placeholder "Maya Traders" appears in two inputs.

## Fixes applied

All 1 Blocker and 5 Major findings from this review have been fixed on the branch. The review text above is preserved as the audit record; the fixes are listed below.

### 🔴 Partial `PUT /me` silently resets currency — FIXED

`packages/contracts/src/business.ts`: `BusinessProfileUpdateSchema` is now a dedicated schema with all fields `.optional()` and no currency default. A partial update that omits `currency` leaves it unchanged. Regression tests added to `packages/contracts/src/index.test.ts`.

### 🟠 Onboarding gate probes businesses the user is not a member of — FIXED

`backend/src/presentation/controllers/business.controller.ts`: the gate now returns `403 {"error":"Insufficient permissions","message":"You are not a member of this business"}` before any DB access when the caller has no membership for the targeted `x-business-id`. Added `business.controller.route.test.ts` covering the non-member path.

### 🟠 Draft save value is unvalidated — FIXED

`packages/contracts/src/business.ts`: `DraftSaveSchema` is now a `z.discriminatedUnion` keyed on `field`, with per-field value validation (name: non-empty string, currency: CurrencyEnum, address: AddressSchema, logoUrl: URL or empty string). The `INVALID_CURRENCY` case now correctly returns 400. Tests added to `packages/contracts/src/index.test.ts`.

### 🟠 Business-name pre-fill branch can never execute — FIXED

`frontend/src/app/onboarding/page.tsx:159-171`: the 403 fallback now reads `authData.businesses` and matches the current `businessId` from localStorage to find the correct business name. The test mock was updated to return the correct response shape and now asserts the name lands in the form.

### 🟠 `aria-invalid` inverted — FIXED

`frontend/src/app/onboarding/page.tsx:373`: changed to `aria-invalid={!valid}` so the field is marked invalid only when empty. Added a regression test asserting `aria-invalid` is `true` when empty and `false` when filled.

### 🟠 Frontend hardcodes localhost backend — FIXED

`frontend/src/lib/auth-client.ts`: `apiFetch` now passes relative paths directly to `fetch`, letting the Next.js rewrites in `next.config.ts` handle routing in both dev and production. The `API_BASE_URL` constant and `NEXT_PUBLIC_API_URL` fallback were removed. Existing tests updated to assert `/api/...` paths instead of `http://localhost:4000/api/...`.

## Strengths

- Magic-byte image detection (JPEG/PNG/GIF/WebP) is implemented correctly and defeats Content-Type spoofing, verified end to end.
- The draft `field` whitelist closes the prior field-injection hole, and the tenant gate now resolves the business from `x-business-id` with a membership lookup instead of `memberships[0]`, fixing the multi-membership STAFF bug.
- `requireBusinessRole` establishes an `AsyncLocalStorage` tenant context and all handlers consistently use `getTenantId()` — clean, uniform tenant wiring.
- Error responses now carry a consistent `{error, message}` shape across middleware and controllers.
- Substantial test growth (backend repository/config/service/controller suites plus frontend page tests), and the contracts package keeps schemas shared across the boundary.

## Test coverage

Test signal is configured and suites pass (88 backend, 46 frontend per verify.md; two new untracked suites: `business.controller.test.ts`, `cloudinary.service.test.ts`). Coverage is good for happy paths, magic-byte rejection, role gating, and auth redirects.

**New regression tests added alongside the fixes above:**
- `packages/contracts/src/index.test.ts`: 9 new tests — `BusinessProfileUpdateSchema` partial update doesn't reset currency, rejects invalid currency, all fields optional; `DraftSaveSchema` per-field value validation including `INVALID_CURRENCY` rejection.
- `backend/src/presentation/controllers/business.controller.route.test.ts`: 2 new tests — non-member rejected before DB access (no `getBusiness` call), 403 onboarding gate includes `message` field.
- `frontend/src/app/onboarding/page.test.ts`: 1 new test — `aria-invalid` is true when empty and false when filled; existing pre-fill test updated to correct response shape.

Untested changed logic remaining: the settings save round-trip (`PUT /me` from the settings page) — flagged for `/test` follow-up.