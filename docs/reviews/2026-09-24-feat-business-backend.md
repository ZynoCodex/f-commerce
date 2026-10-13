# Review, feat/business-backend, 2026-09-24

**Reviewed by**: claude-sonnet-4-6
**Scope**: 24 files changed (15 new, 9 modified), branch `feat/business-backend` vs `main` merge-base `4907b53f`
**Verdict**: Changes requested

## Summary

This branch implements business profile onboarding (spec 0004): a business profile entity extension, Mongoose schema, repository, service, Express controller with four endpoints, onboarding gate middleware, shared Zod contracts, Cloudinary upload service, frontend onboarding wizard, settings page, login page, and dashboard. The feature is well-scoped and architecturally sound at the domain/application layer, but contains a critical security defect (the onboarding gate DB call bypasses tenant isolation), several correctness bugs in the draft-save and logo-upload paths, a dead-code middleware, and frontend code that bypasses auth token forwarding. Tests cover the happy paths but miss error branches for the new business endpoints and the draft-save type-injection vulnerability.

## Blockers

### 🔴 Onboarding gate DB query bypasses tenant isolation and is unguarded, `backend/src/presentation/controllers/business.controller.ts:40-57`

**Problem**: The router-level onboarding gate middleware calls `BusinessModel.findById(membership.businessId)` directly. The Business model does not use the `tenantPlugin`, so this query is not scoped by tenant context — it reads any business document by arbitrary ID. Worse, `membership.businessId` is taken from the JWT (trusted), but the query itself is a raw `findById` with no tenant context wrapper, meaning the `runWithContext` guard from `requireBusinessRole` has already exited its callback scope by the time this middleware's `.then()` fires asynchronously. This creates a window where the AsyncLocalStorage context is empty, and the query could match unintended documents.

**Why it matters**: Tenant isolation is the foundational security guarantee for this multi-tenant app (spec 0003). A query that bypasses the tenant context can read another business's data or, combined with the unguarded `.catch(() => next())`, silently allow access.

**Suggested fix**: Either (a) move the onboarding gate check into the same `runWithContext` callback as `requireBusinessRole` so the tenant context is active during the query, or (b) use the `BusinessService` (which depends on a repository that should respect tenant isolation) rather than a raw `BusinessModel.findById`. Additionally, the `.catch(() => next())` swallows all errors and lets requests through — replace with proper error handling that returns 500 or denies access.

### 🔴 Draft-save endpoint accepts arbitrary field names with no whitelist, `backend/src/presentation/controllers/business.controller.ts:214-233`

**Problem**: The `PUT /onboarding/draft` endpoint accepts any string `field` value from the request body and passes it to `saveDraft`, which constructs a MongoDB update path via `update[`onboardingDraft.${field}`] = value`. There is no validation that `field` is one of `name`, `currency`, `address`, or `logoUrl`. An attacker can send `field: "$where"` or `field: "isAdmin"` or any arbitrary dotted path.

**Why it matters**: While Mongoose's `$set` operator with string keys does not directly allow operator injection (`$set` treats the key as a literal field name), the lack of input validation is a correctness and maintainability hazard. More critically, the `field` value is used to construct a dynamic object key — if the frontend ever changes to use `updateOne({ $set: { ... } })` with user-controlled keys, it becomes a direct NoSQL injection vector. Even now, sending `field: "currency"` with a non-enum value like `field: "XYZ"` stores garbage data that bypasses the Zod enum validation applied elsewhere.

**Suggested fix**: Validate `field` against a whitelist: `['name', 'currency', 'address', 'logoUrl']`. Use a Zod schema: `z.object({ field: z.enum(['name', 'currency', 'address', 'logoUrl']), value: z.unknown() })`.

### 🔴 Dead onboarding middleware file never wired into the server, `backend/src/presentation/middlewares/onboarding.middleware.ts:1-39`

**Problem**: A standalone `onboardingGate` middleware is implemented in `onboarding.middleware.ts` but is never imported in `server.ts` or `business.controller.ts`. The actual gate logic lives inline as `businessRouter.use(...)` in the controller. The dead file references `getTenantId()` from the context module, which will be empty in a standalone router middleware (no `runWithContext` wrapper), making it non-functional even if wired in.

**Why it matters**: Dead code causes confusion during maintenance. The verify.md even notes this: "onboarding.middleware.ts exists but is dead code." It also suggests the gate was started in one approach and partially duplicated.

**Suggested fix**: Delete the dead `onboarding.middleware.ts` file and consolidate the gate into the controller (as currently done), or properly wire it in with the correct tenant context. Do not leave both implementations existing.

## Major

### 🟠 Logo upload rejects valid image sizes at the wrong layer, `backend/src/presentation/controllers/business.controller.ts:130-165`

**Problem**: Multer is configured with `limits: { fileSize: 5 * 1024 * 1024 }` (5MB) at the middleware level, but the handler also re-checks `req.file.size > maxSize`. The spec (AC-3) requires MIME type validation "before the Cloudinary upload reaches the service." However, the mimetype check `allowedTypes.includes(req.file.mimetype)` can be spoofed — `req.file.mimetype` comes from the browser's Content-Type header on the multipart part, which is attacker-controlled. No server-side magic-number validation is performed.

**Why it matters**: MIME type spoofing allows uploading non-image payloads disguised as images. The spec explicitly lists "Add image MIME type and size validation before the Cloudinary upload reaches the service" as a follow-up, but this should be in the current implementation, not deferred.

**Suggested fix**: Validate the file's magic bytes server-side (e.g., check the first few bytes for PNG/JPEG/WebP/GIF signatures) in addition to the mimetype check. Alternatively, use a library like `file-type` to sniff the actual content type from the buffer.

### 🟠 Frontend pages bypass auth-client on direct fetch calls, `frontend/src/app/onboarding/page.tsx` (original diff: lines 1036-1039, 1107-1111, 1132-1143)

**Problem**: The original onboarding page (before the auth-client refactor) uses raw `fetch('/api/business/me')` calls without auth headers. The newer version correctly uses `apiFetch`, but the **settings page** (`frontend/src/app/settings/page.tsx:1511`) still uses raw `fetch('/api/business/me', { credentials: 'include' })` without forwarding the JWT token via `apiFetch`. The `credentials: 'include'` only sends cookies, but this backend uses Bearer token auth — there are no auth cookies being set for the access token.

**Why it matters**: The settings page cannot actually load or save business data because it doesn't send the Authorization or x-business-id headers. The verify.md notes this as a blocker: "no token forwarding from frontend to backend." The test for settings mocks global fetch and passes because the mock ignores auth, but in production, the API calls will return 401.

**Suggested fix**: Replace all raw `fetch` calls in frontend pages with `apiFetch` from `@/lib/auth-client`. Ensure `login/page.tsx` uses `apiFetch` consistently (it currently does). Remove `credentials: 'include'` since auth is token-based, not cookie-based for the access token.

### 🟠 `saveDraft` in repository has special-case branching for `logoUrl`, `backend/src/infrastructure/database/mongoose/repositories/business.repository.ts:74-85`

**Problem**: The `saveDraft` method branches: `if (field === 'logoUrl') { update['onboardingDraft.logoUrl'] = value; } else { update[`onboardingDraft.${field}`] = value; }`. The `logoUrl` branch sets the same path as the else branch would (`onboardingDraft.logoUrl`), making the special case redundant.

**Why it matters**: This dead conditional suggests either a leftover from a different approach or an intended difference that was never implemented. It's confusing and could mask intended behavior (e.g., if `logoUrl` was meant to be set at the top-level `logoUrl` field, not the draft).

**Suggested fix**: Remove the `if/else` branch; `update[\`onboardingDraft.${field}\`] = value` handles all fields uniformly. If `logoUrl` truly needs different handling (setting top-level instead of draft), document and implement that.

## Minor

### 🟡 `BusinessService.currency` typed as `string` not `Currency`, `backend/src/application/services/business.service.ts:17`

**Problem**: `BusinessUpdateData.currency` is typed as `string`, but the domain entity `Business.currency` is `Currency` (a union of specific string literals). The service passes `data.currency` through to `updateProfile`, which builds a `Record<string, unknown>` and passes it to Mongoose. The Mongoose schema does enforce the enum, but the TypeScript layer does not.

**Why it matters**: Type safety is a project rule (AGENTS.md: "Use strict TypeScript"). The service layer should use the domain `Currency` type or the contracts `Currency` type, not `string`.

**Suggested fix**: Import and use `Currency` type from the domain entity: `currency?: Currency`.

### 🟡 `completeOnboarding` does not validate required fields, `backend/src/application/services/business.service.ts:46-64`

**Problem**: The `completeOnboarding` method sets `onboardingComplete: true` but never validates that `name`, `currency`, and `address` are populated. The spec states: "Business.onboardingComplete is only set to true when name, currency, and address are all populated." The Zod `BusinessProfileSchema` enforces `address` as required (via `AddressSchema`), but `logoUrl` is optional and `name`/`currency` are validated. However, the service trusts the controller's validation entirely — business rules (invariants) should be enforced in the domain/service layer, not rely solely on controller-level Zod validation.

**Why it matters**: If the service is called directly (e.g., from another API path, a job, or a test), the invariant is violated. The spec explicitly lists this as a key invariant.

**Suggested fix**: Add invariant checks in `completeOnboarding`: if `!data.name || !data.currency || !data.address`, throw a `BadRequestError` before persisting.

### 🟡 Frontend `OnboardingForm` types `logoUrl` as `string` but initializes to `''`, `frontend/src/app/onboarding/page.tsx:97-98`

**Problem**: `OnboardingForm.logoUrl` is typed as `string` (not `string | undefined`), but the logo upload is optional. When the user skips the logo, `logoUrl` remains `''` (empty string). The `StepFour` review step checks `form.logoUrl ?` to decide whether to show the image or initials — an empty string is falsy, so this works, but the type is misleading. Also, when the user uploads a logo and then the form is submitted, an empty `logoUrl` of `''` is sent to the backend's `PUT /onboarding` endpoint, which the `BusinessProfileSchema` accepts via `.or(z.literal(''))`.

**Suggested fix**: Type `logoUrl` as `string | undefined` and omit it from the submission body when undefined, rather than sending `logoUrl: ''`.

### 🟡 `onboarding.middleware.ts` uses `getTenantId()` but no `runWithContext` is active, `backend/src/presentation/middlewares/onboarding.middleware.ts:16,22-23`

**Problem**: If this middleware were actually wired in, `getTenantId()` would return `undefined` because the AsyncLocalStorage context (`runWithContext`) is only set inside `requireBusinessRole`'s callback. This middleware does not call `runWithContext` itself.

**Why it matters**: Even though this file is dead code (see Blocker #3), its pattern is wrong and could be copied as a template for future middleware.

**Suggested fix**: Delete this file (recommended in Blocker #3). If keeping a standalone middleware, it must call `runWithContext` or use a different tenant-resolution mechanism.

### 🟡 E2E spec references a non-existent 403 staff permission path for settings, `frontend/e2e/business-onboarding.spec.ts:64-74`

**Problem**: The E2E test for "staff can view settings but not save" expects `page.getByRole('alert', { name: /insufficient permissions/i })`. However, the current `settings/page.tsx` does not enforce role-based UI — it always shows the edit form and the save button. The 403 would come from the backend `PUT /api/business/me` endpoint (which correctly returns 403 for STAFF). But the test expects a status alert from the frontend error handler, which would need to display `res.status === 403` errors as alerts. The settings page's `saveProfile` catch block does `setError(err.message)`, which would render a `FormMessage` (role="alert"), not a status with the `insufficient permissions` accessible name.

**Suggested fix**: The E2E test expectation should match the actual error display mechanism, or the settings page should handle 403 specifically with the expected alert text.

### 🟡 `next.config.ts` rewrite proxy doesn't handle multipart FormData correctly, `frontend/next.config.ts`

**Problem**: The `rewrites()` proxy forwards all `/api/*` to the backend port 4000. However, Next.js `rewrites` does not always correctly forward multipart/form-data requests, especially when it needs to stream file buffers. The spec AC-3 requires logo upload to work through the proxy.

**Why it matters**: If the rewrite doesn't properly forward multipart bodies, the logo upload will fail with malformed requests or empty file fields.

**Suggested fix**: Verify end-to-end that `POST /api/business/logo` with FormData works through the Next.js proxy. Consider using `app.use('/api', proxy('/api'))` via `http-proxy-middleware` if `rewrites` has issues with streaming.

## Nits

- ⚪ `backend/src/presentation/controllers/business.controller.ts:417` — `BadRequestError` is imported but never used.
- ⚪ `backend/src/application/services/business.service.ts:68` — `_businessId` parameter is prefixed with underscore (unused convention) but could simply be removed since the method signature is fixed by the interface.
- ⚪ `frontend/src/app/onboarding/page.tsx:1353` — `void setForm` in StepThree is a leftover; the component receives `setForm` but never uses it after the upload completes (the form update is done inline via `setForm({ ...form, logoUrl })`).
- ⚪ `.gitignore` adds `.claude/settings-openrouter.local.json` — unclear if this is project-specific or should be in a global ignore.
- ⚪ `package.json` line 194: `cloudinary` and `multer` are listed as `dependencies` in the root workspace package but should only be in `backend/package.json` dependencies (they are backend-only packages).
- ⚪ `frontend/e2e/business-onboarding.spec.ts:4` — comment says "3-step onboarding wizard" but the actual implementation is 4 steps (AC-1 spec says "three-step" but the wizard has 4 steps: name, address, currency+logo, review). This is a spec/wizard mismatch.

## Strengths

- Clean architecture separation is maintained: domain entities, repository interface, application service, and presentation controller are each in their proper layer with correct dependency direction (outer depends on inner).
- Zod contracts package properly isolates shared schemas (`BusinessProfileSchema`, `CurrencyEnum`, `AddressSchema`) from backend and frontend implementation code.
- Onboarding gate middleware correctly exempts `/onboarding` and `/onboarding/draft` routes, and the `requireBusinessRole` middleware is applied per-route with correct OWNER/STAFF role enforcement.
- The `completeOnboarding` method clears the draft via `$unset` after promoting fields, matching the spec's data lifecycle.
- Test coverage exists for the frontend wizard (happy path, draft restore, non-image rejection, error handling) and auth client (token storage, header forwarding, edge cases).
- The verify.md file thoroughly documents API-level verification with curl evidence against a live MongoDB Atlas instance.

## Test coverage

- **Backend**: No new test files were added for `business.controller.ts`, `business.service.ts`, `business.repository.ts`, or `cloudinary.service.ts`. The existing test suite covers auth service and middleware, but the new business endpoints have zero test coverage. The `onboarding.middleware.ts` (dead code) has no tests.
- **Frontend**: Good unit test coverage for onboarding page (5 tests covering loading, error, wizard flow, draft restore, file validation), settings page (5 tests covering loading, error, form population, save success, save failure), login page (5 tests covering render, register toggle, auth routing, no-business error, invalid credentials), auth-client (8 tests covering storage, headers, apiFetch), and dashboard (2 tests covering rendering and navigation).
- **E2E**: One Playwright spec file with 4 browser tests covering the full wizard flow, settings edit, and staff permission denial.
- **Gaps**: Backend business controller/service/repository have no unit or integration tests. The draft-save type-injection vulnerability is untested. The 502 Cloudinary error path is untested. The onboarding gate middleware behavior is untested. The `clearDraft` `$unset` operation is untested.
