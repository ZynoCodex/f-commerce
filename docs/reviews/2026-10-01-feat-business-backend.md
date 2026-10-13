# Review, feat/business-backend, 2026-10-01

**Reviewed by**: claude-sonnet-4-6 (author on qwen-family via proxy)
**Scope**: 36 files (24 prior diff + 8 new/modified since prior review + untracked controller test), branch `feat/business-backend` vs `main` merge-base `4907b53f`
**Prior review**: `docs/reviews/2026-09-24-feat-business-backend.md` (3 blockers, 3 majors, 6 minors, 6 nits, Changes requested). This review focuses on the changes since that pass.
**Verdict**: Changes requested

## Summary

Since the 2026-09-24 review, the author has addressed all three prior blockers (onboarding gate refactored to use `businessService.getBusiness`, dead `onboarding.middleware.ts` deleted, draft-save field whitelist via `DraftSaveSchema`) and both prior majors (MIME-type replaced with magic-byte validation, frontend pages now use `apiFetch`). The new `business.controller.test.ts` (469 lines, 28 cases) is a strong addition that locks in the magic-byte behavior and the gate exemptions. The uncommitted refactor in `business.controller.ts` is well-scoped. However, one real bug remains: the auth middleware returns `{ error: 'Insufficient permissions' }` without a `message` field, but the settings page reads `data.message` — so a STAFF user saving the profile will see "Failed to save profile" instead of the actual reason, and the e2e "staff can view settings but not save" test will fail. The remaining items are smaller — minor and nit findings about tenant-context coupling, dead test surface, and a few over-strict checks.

## Major

### 🟠 Auth middleware 403s do not carry `message`; settings page reads `data.message`, e2e "staff can view settings but not save" will fail, `backend/src/presentation/middlewares/auth.middleware.ts:52` (response) → `frontend/src/app/settings/page.tsx:112` (consumer)

**Problem**: `requireBusinessRole` returns `{ error: 'Insufficient permissions' }` (no `message` field). The settings page handler does `throw new Error(data.message || 'Failed to save profile')`, so when a STAFF user saves, the user-visible alert reads "Failed to save profile" — not "Insufficient permissions". The unit test at `frontend/src/app/settings/page.test.tsx:147` mocks the response with `{ message: 'Insufficient permissions' }`, so it passes, but the e2e at `frontend/e2e/business-onboarding.spec.ts:67` will fail against the real backend because the alert's accessible name does not match `/insufficient permissions/i`. Every `requireBusinessRole` 403 path has the same shape (`auth.middleware.ts:14,24,35,41,47,52`), so the same bug applies to missing token, expired token, missing `x-business-id`, and cross-tenant access.

**Why it matters**: The e2e is the only test that exercises the role check end-to-end, and the unit test passes by mocking a response shape the backend never produces. This is a test-mocking-mismatch that hides a real user-facing failure: a STAFF member who tries to save gets a generic error and has no idea it's a permission issue. The prior review flagged this as a Minor (#5); it has not been addressed, and the unaddressed gap now has a concrete test failure to back it.

**Suggested fix**: Pick one. Either (a) normalize the middleware to return `{ error, message }` like the controller does (e.g. `res.status(403).json({ error: 'Insufficient permissions', message: 'You do not have permission to perform this action' })`); or (b) make the frontend robust to either shape: `throw new Error(data.message || data.error || 'Failed to save profile')`. Option (a) is cleaner and matches the rest of the controller's response shape; option (b) is one-line and fixes the same bug for all five other 403 paths at once.

## Minor

### 🟡 Onboarding gate calls `businessService.getBusiness` outside any `runWithContext`, `backend/src/presentation/controllers/business.controller.ts:90`

**Problem**: The gate calls `businessService.getBusiness(membership.businessId)` directly. The Business model uses `baseSchemaOptions` (not `tenantSchemaOptions`) and does not apply the `tenantPlugin`, so the query works today. But the rest of the backend relies on `requireBusinessRole` wrapping the request in `runWithContext({ userId, businessId, role })`. The gate bypasses that wrapper, so this query relies on a specific implementation detail of one model — if anyone later adds `tenantSchemaOptions` to the Business model (e.g. to support a SaaS multi-tenant layer where the Business is itself a tenant record), the gate will fail with "Tenant isolation failed: no businessId found in context". The verify.md already documents this: "the gate runs the `BusinessModel.findById` query inside `runWithContext`" — that documentation is now stale because the uncommitted refactor removed the `runWithContext` wrapper.

**Why it matters**: Fragile coupling between two security-sensitive systems. The prior review's Blocker #1 was the SAME shape of bug (raw `BusinessModel.findById` outside tenant context). The fix this time was to use the service, not to wrap in context — so the shape of the issue moved but the underlying fragility persists.

**Suggested fix**: Wrap the call in `runWithContext({ userId, businessId, role: 'OWNER' }, () => businessService.getBusiness(membership.businessId))` before the gate's logic, even though the current Business model doesn't need it. The cost is one line; the upside is the gate stops depending on a model implementation detail.

### 🟡 Redundant `req.file.size > maxSize` check in `/logo` handler, `backend/src/presentation/controllers/business.controller.ts:194-198`

**Problem**: Multer is configured with `limits: { fileSize: 5 * 1024 * 1024 }` at the top of the file. When a file exceeds that, multer short-circuits the request with a `MulterError('LIMIT_FILE_SIZE')` before the handler runs. The handler's `req.file.size > maxSize` check is therefore unreachable in practice — multer already rejected anything > 5MB. There is no test for this path either; the controller test only covers the magic-byte cases and "no file attached" and "Cloudinary failure".

**Why it matters**: Dead code is a maintenance hazard — the next person to refactor will think the handler-level check is the source of truth, change the multer limit, and not notice they need to update two places. The test gap means a regression in multer's size handling would also go undetected.

**Suggested fix**: Remove the redundant handler-level check and let multer be the single source of truth for the size limit. Add a test that uploads a 6MB file and asserts the multer error is caught and returned as a 400 (which means wiring a multer error handler — currently the default Express error handler will return 500 with a `MulterError`).

### 🟡 The `onboarding.middleware.ts` references still linger in the test file's expectations, `backend/src/presentation/controllers/business.controller.test.ts:139` (and the file path `docs/reviews/2026-09-24-feat-business-backend.md`)

**Problem**: This is a small housekeeping item — the prior review's Blocker #3 is fixed (the file is gone), but the test descriptions and the commit narrative still talk about "the onboarding gate (inline middleware)" in a way that suggests two implementations used to exist. A future reader will wonder if there's a separate file they should know about. Not a bug; just a leftover from the prior context.

**Why it matters**: Low-priority clarity issue. The test file itself is clear enough.

**Suggested fix**: None required. If touching the file, drop the parenthetical "(inline middleware)" in the test describe block.

### 🟡 `detectImageType` over-strict: requires 12 bytes for formats that need only 3–8, `backend/src/presentation/controllers/business.controller.ts:28`

**Problem**: The function early-returns `null` if `buffer.length < 12`, but a real JPEG can be detected from 3 bytes, PNG from 8, and GIF from 6. The 12-byte floor is set by the WebP check, which is the only format that needs that much. A 1×1 transparent PNG is 67 bytes; a 1×1 JPEG is ~125 bytes. So in practice this never rejects a valid file. But a polyglot attacker who constructs a 3-byte header followed by an arbitrary payload would be caught by the floor, not the magic bytes — which means the floor is doing security work it shouldn't be doing, and the real magic-byte tests are effectively never exercised in isolation.

**Why it matters**: Low-impact code smell. The current behavior is correct, but the function's intent ("validate magic bytes") is muddied by mixing it with a length precondition.

**Suggested fix**: Move the length check into the WebP branch only — return `'image/webp'` only when `buffer.length >= 12`, and let the other branches work on their natural minimums. The test at `business.controller.test.ts:328` (rejects a 3-byte "JPEG" header) would need to be updated to a 4-byte payload that is genuinely not a JPEG, e.g. `FF D8 00 ...` to exercise the actual `FF D8 FF` check.

### 🟡 Test mocks `requireAuth` and `requireBusinessRole`, so the controller test never exercises the real auth flow, `backend/src/presentation/controllers/business.controller.test.ts:16-31`

**Problem**: The controller test mocks `requireAuth` to inject a canned `req.user` and mocks `requireBusinessRole` to always `next()`. This means the 28 cases test the controller's logic in isolation but never verify that the route is actually protected by these middlewares. The only place the auth integration is tested end-to-end is the e2e suite, and as the Major above shows, the e2e has a real failure waiting.

**Why it matters**: Mocks passing is not the same as integration passing. The unit test will keep being green while the real wiring is broken.

**Suggested fix**: Add one or two integration tests that don't mock the auth middleware — use a real JWT (signed with a test `JWT_SECRET`) and a real `x-business-id` header, then assert 401 for missing token, 403 for STAFF-on-OWNER-route, and 200 for OWNER. This is a small file but it locks the contract between the controller and the middleware.

## Nits

- ⚪ `backend/src/application/services/business.service.ts:66` — `_businessId` parameter is still unused. Either drop it (and the matching `uploadLogo(businessId, buffer)` callers in the controller) or use it (e.g. include the businessId in the Cloudinary `public_id` so logos are namespaced per business).
- ⚪ `backend/src/presentation/controllers/business.controller.ts:82,111,150,212,243,296` — six copies of the same `(req.user as { memberships: { businessId: string }[] }).memberships[0]?.businessId` dance. The project already has `JwtPayload` in `backend/src/types/express.d.ts`; the `as` casts are unnecessary and a single `getBusinessId(req)` helper at the top of the file would be clearer.
- ⚪ `backend/src/presentation/controllers/business.controller.ts:99` — the `catch` in the gate swallows the error without logging. A `console.error(error)` (or the project's logger) would help debug a `getBusiness` failure in production.
- ⚪ `backend/src/infrastructure/services/cloudinary.service.ts:21` — every business logo goes to the same `business-logos/` folder. If two businesses upload the same `public_id`, the second silently overwrites the first. The `uploadLogo` service already has a `_businessId` parameter that could be used to namespace (e.g. `folder: \`business-logos/${businessId}\`` or `public_id: businessId-${Date.now()}`).
- ⚪ `backend/src/application/services/business.service.ts:51` — `if (!data.name || !data.currency || !data.address)` rejects `name: ''` and `address: undefined` but accepts a whitespace-only name (`'   '`) and an address object with empty `street`/`city` (the Zod schema requires `min(1)` but only at the controller layer, not the service invariant). Trim before checking, or rely on the Zod schema and drop the service-level check.
- ⚪ `backend/src/presentation/controllers/business.controller.ts:75` — the gate exempts `req.path === '/logo'`, but Express 5 router-level path matching already excludes sub-paths. The three checks could be one: `if (req.path === '/logo' || req.path.startsWith('/onboarding'))`. Minor consolidation.
- ⚪ `docs/specs/0004-business-profile-onboarding/verify.md:84` — verify.md still says "no magic-byte validation is implemented — tracked as a follow-up". This is stale; the current code DOES implement it. Worth a quick `sync` pass.

## Strengths

- Magic-byte validation in the logo handler is a meaningful security upgrade from the prior mimetype-only check. The 9-case test (`business.controller.test.ts:267-368`) directly exercises the spoofing attack (`attach('image', textBuffer, { filename: 'malicious.png', contentType: 'image/png' })`) and confirms the buffer check fires, not the mimetype. The `verify.md` follow-up note is now satisfied.
- The onboarding gate refactor is a net improvement: from a raw `BusinessModel.findById().lean().select('onboardingComplete')` (3 hops into infrastructure) to `businessService.getBusiness()` (1 hop, testable, and consistent with the rest of the controller). The `.catch(() => next())` swallow was also replaced with a typed 500 response, which is correct.
- `DraftSaveSchema.field` is now a Zod enum (`['name', 'currency', 'address', 'logoUrl']`) — the prior blocker #2 is closed at the schema level, not at the controller, which is the right place for input validation.
- `business.service.test.ts` covers the `completeOnboarding` invariant checks (name/currency/address required → `BadRequestError`) that the prior review flagged as a minor gap. The `business.repository.test.ts` covers `clearDraft`'s `$unset` shape. Together with the new controller test, the diff brings the business feature from "0 backend tests" to a defensible suite.
- Frontend settings and onboarding pages consistently use `apiFetch` (no raw `fetch` with `credentials: 'include'`); the prior Major #2 is closed.
- The `OnboardingDraftSchema` in the Mongoose model uses `{ strict: false }` (line 48 of `Business.ts`), which is the right call given the draft is keyed by user-supplied field names from the wizard and we want it to round-trip cleanly through Mongoose without schema-stripping.

## Test coverage

The new tests materially improve the situation. The untracked `business.controller.test.ts` (28 cases) plus the tracked `business.service.test.ts` (10 cases), `business.repository.test.ts` (10 cases), and `config.test.ts` (10 cases) bring backend business-feature coverage from 0 to ~58 cases. The major gaps that remain:

- The settings page unit test mocks the 403 response with `{ message: 'Insufficient permissions' }` — the real backend response is `{ error: 'Insufficient permissions' }`. The unit test passes against the mock and the e2e will fail against the real backend. This is the Major above.
- The multer file-size limit (> 5MB) is not tested in the controller test. The handler's redundant size check is dead in practice; no test covers either multer's `LIMIT_FILE_SIZE` path or a hypothetical handler-level rejection.
- The gate's `runWithContext` is not asserted. There's no test that proves the Business model would behave correctly if the tenant plugin were later applied — i.e. the Minor above ("fragile coupling") is not locked down.
- The `saveDraft` `$set` for the `address` sub-document is tested in the repository test, but the contract that `DraftSaveSchema.field === 'address'` with a malformed value would be rejected by Zod (and not reach Mongo) is only tested for the field name, not the value shape. The `value: z.unknown()` allows any object through; a non-object would be stored as-is. A test that confirms `saveDraft('biz1', 'address', 'not-an-object')` either succeeds (and the service normalizes) or fails (and the controller returns 400) would tighten this.
- The e2e suite is the only end-to-end check of the `requireBusinessRole` integration, and the "staff can view settings but not save" test will fail with the current backend response shape (see Major).
