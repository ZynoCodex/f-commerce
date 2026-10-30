# PR: feat(timezone): make the console follow the business timezone

## What

Every business now stores one IANA timezone, and the seller console uses it for the Overdue badge, the delivery date warning, every displayed timestamp, the shell badge, and the header day. Onboarding asks for the zone, settings can change it behind a confirmation, and existing businesses start on `Asia/Dhaka`. The stored delivery date is still a plain calendar day and never shifts.

## Why

Implements `docs/specs/0008-business-timezone/index.md`, which closes the gap recorded in spec 0007. The Overdue badge and the past date warning compared the promise with the viewer's browser day, so two people in one business could disagree about the same order near midnight. One stored business timezone makes the console agree on every device.

## Changes

- **Data and contract**: `businesses.timezone` text not null default `Asia/Dhaka`, with one generated migration that backfills existing rows. No order column changes, and `orders.delivery_deadline` stays a nullable `date` in string mode. New `TimezoneSchema` and `resolveTimeZone` in `packages/contracts/src/business.ts` trim, bound to 64 characters, reject fixed offsets and abbreviations, and store the runtime's canonical ID.
- **API**: `GET` and `PUT /api/business/me` carry `timezone` (read for OWNER and STAFF, write for OWNER). Onboarding completion requires it, and `PUT /api/business/onboarding/draft` accepts it as a field. A missing or invalid value returns 400 and writes nothing. No new endpoint or permission. The draft route now answers `409 ONBOARDING_COMPLETE` for a write skipped once onboarding is complete, instead of a false `200`; spec 0008 records it in its 2026-10-29 Update.
- **Shared client settings**: one `BusinessSettingsProvider` in the root layout holds currency and timezone, loads `GET /api/business/me` once per app load and per auth change, caches per business under `f-commerce:business-settings:v1:<businessId>` with per field validation, and drops saves and responses that land after a sign out or switch. The auth client gained a subscription that `setAuth` and `clearAuth` notify. Five screens that each fetched the profile for the currency now read the provider instead.
- **Onboarding and settings**: a grouped native timezone select built from `Intl.supportedValuesOf('timeZone')` with a short fallback list, browser prefill on a fresh wizard, draft resume, required validation, and a settings confirmation dialog that warns a change moves the Overdue badge for historical orders while stored dates stay put.
- **Display**: `formatDateTime(value, timeZone)` renders every console timestamp in the business zone. `todayInTimeZone` drives the deadline warning and the Overdue badge, which render nothing until the provider is mounted so the server and hydration render match. An invalid or missing stored zone falls back to `Asia/Dhaka` and never crashes a screen.
- **Backend day helper**: `DEFAULT_TIME_ZONE`, `isValidTimeZone`, and `todayInTimeZone` in `backend/src/domain/timezone.ts`, built from `formatToParts` with a fixed locale. No endpoint calls it yet; it exists so reports and the dashboard do not invent their own day rule.
- **Docs**: spec 0007 updated in place so its Overdue badge and warning rule point at the business timezone, and its timezone follow up is closed by 0008. Session context files updated for the new rules.

## How to test / verify

- `npm run test` runs contracts (112), backend (387 passing, 1 skipped, including the integration suites against a real PostgreSQL test database), and frontend (277 across 26 files).
- `npm run lint`, `npm run typecheck`, and `npm run format:check` are clean. `npm run build` passes for the backend and frontend with the generated contracts.
- `npm run e2e --workspace @f-commerce/frontend` passes on desktop and mobile, including a business on `Pacific/Kiritimati` proving the badge and timestamps follow the business zone, and a sign in that never shows the wizard to a completed owner. Set `RATE_LIMIT_DISABLED=true` for a local run.
- By hand, confirm the spec's list in `docs/specs/0008-business-timezone/verify.md`: onboarding prefill and resume, settings cancel and confirm, two browser zones agreeing on one deadline, the corrupt stored zone falling back to `Asia/Dhaka` without a crash, and keyboard plus screen reader use of the select and the dialog.

## Risk & rollout

One migration adds the column and backfills every existing business to `Asia/Dhaka`, which keeps current behavior correct for the first audience. Rollback is dropping the column; no order data is touched and no stored deadline is rewritten. No feature flag, new dependency, environment variable, background job, or permission.

Accepted tradeoffs, all recorded in the spec: a timezone change moves the Overdue badge for historical orders; old orders follow the current business zone; a tab left open while the zone changes elsewhere keeps the old value until its next render; and a corrupt stored zone silently falls back to Dhaka.

## Notes for reviewers

- Review history is in `docs/reviews/` under `2026-10-2*-feat-business-timezone*.md` and `2026-10-29-feat-business-timezone.md`. The latest pass, on GLM-5.3-Flash, found no blockers or majors and one docs minor, now fixed by the 0007 update.
- This branch also carries `4cefe5d chore(payments): extend payment method enum`, which adds `CASH_ON_DELIVERY`, `CARD`, and `PAYPAL` for feature 10. Nothing consumes them yet; five reviews have flagged it as deliberate preparation.
- The day helper exists twice, in `backend/src/domain/timezone.ts` and `frontend/src/lib/timezone.ts`, and both are tested against the same fixed instants. They can drift if a future change touches only one.
- The timezone change is not audited, because no business profile edit is audited today. The spec records adding an audit row as a follow up.
