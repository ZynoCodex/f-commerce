# Verify: business timezone · spec 0008

_Steps derived from spec 0008 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [x] Start a fresh onboarding as a new owner in a browser set to `Asia/Dhaka` → step 3 shows `Timezone` beside currency, prefilled with `Asia/Dhaka`, the select is grouped by region, and the review step shows the zone → AC-5
- [x] Change the onboarding timezone to `America/New_York`, continue to the review step, then go back → the zone is kept, and a page refresh resumes it from the draft → AC-5
- [x] Open onboarding in a browser set to `Europe/Berlin` with no draft → the field prefills with `Europe/Berlin`, and a browser zone that is not in the runtime list still appears as the current option → AC-5
- [x] Try to complete onboarding with an empty or malformed zone through the form and directly through `PUT /api/business/onboarding` → the form blocks with an inline message, the API returns 400, and nothing completes → AC-2, AC-5
- [x] Complete onboarding with a valid zone → the dashboard loads, the shell badge shows the chosen zone and currency from the response, and the header date is the current day in that zone → AC-5, AC-7
- [x] Log in from `/login` with an existing business and land on the dashboard without a full page reload → the shell badge and the timestamps use the fetched business settings, not the fallback → AC-7
- [x] Open Settings in a business on `Asia/Dhaka` → the `Timezone` field shows `Asia/Dhaka` and the description says it is used for delivery dates and timestamps → AC-6
- [x] Change the zone to `America/Los_Angeles` and press Save → a confirmation dialog names the new zone, warns that existing order dates do not change but overdue badges may, and offers cancel and confirm → AC-6
- [x] Press cancel in the dialog → the dialog closes, the select returns to `Asia/Dhaka`, the success message does not appear, and the stored value is unchanged → AC-6
- [x] Change the zone again, confirm in the dialog, and reload Settings → the new zone is stored, `Profile updated` appears, and the shell badge updates without a full page reload → AC-6, AC-7
- [x] Save the settings form with an unchanged zone → no dialog appears and the normal save succeeds → AC-6
- [x] Open the same business in two browsers, one in `Pacific/Kiritimati` and one in `Pacific/Midway`, with the same stored deadline around midnight → both show the same `Overdue` result for the same order, and the result follows the business zone → AC-9
- [x] With the business on `Asia/Dhaka`, open an order whose deadline is today in Dhaka → no `Overdue` badge. Open one whose deadline is yesterday → the badge appears. Move it to `DELIVERED`, `CANCELLED`, and `RETURNED` → the badge disappears in each final state → AC-9
- [x] Enter a past date in the create and edit order forms → the warning uses the business's today, not the browser's today, and the save is still allowed → AC-9
- [x] Open the orders list, an order detail with history, the duplicate warning, a product detail, and a customer detail in a business on a non browser zone → every timestamp renders in the business zone, and the stored delivery date keeps its calendar day → AC-8
- [x] Leave the app open across the business's midnight and navigate → the shell date, warning, and badge use the new day on the next render, with no timer and no error → AC-9
- [x] Corrupt `businesses.timezone` to `Mars/Olympus` directly in the database and reload the shell, orders, and settings → the console falls back to `Asia/Dhaka`, shows no crash or blank page, the settings field shows `Asia/Dhaka` as the baseline, and a normal save persists it without a timezone change dialog → AC-4, AC-6, AC-11
- [x] Stop the backend and reload an authenticated page → the provider keeps the cache or fallback, the page shows its existing error state, and no timezone related crash appears → AC-11
- [x] Call `clearAuth()` in the browser console on an authenticated page, then sign in as a different business → the previous business's cache entry is gone and the new business shows its own currency and zone → AC-7
- [x] Use only the keyboard and a screen reader on onboarding and settings → the timezone field is labelled and described, the select works, the dialog traps focus, Escape cancels, and focus returns to the Save control → AC-12

_Items 25 and 26 were exercised with harness help. The built page does not expose `clearAuth` and has no sign out control, so the real function was exposed from the served chunk at runtime and called; the previous cache was removed and the next business showed its own settings. The accessibility checks used the keyboard and the browser accessibility tree, which is the tree a screen reader reads; live screen reader speech was not captured._

## API / runtime

- [x] Run the migration on a database with an existing business → the `businesses.timezone` column exists, is `text`, is not null, defaults to `Asia/Dhaka`, and every existing row reads `Asia/Dhaka` → AC-1, AC-4
- [x] Register a new business and read it before onboarding → `timezone` is `Asia/Dhaka`. Complete onboarding with `Europe/London` → the stored value becomes `Europe/London` and the draft is cleared → AC-3, AC-4
- [x] Call `GET /api/business/me` as an OWNER and as a STAFF member → both receive `timezone`. Call `PUT /api/business/me` as STAFF → 403. Call it as OWNER → the zone is written and returned → AC-3
- [x] Call `PUT /api/business/me` with no timezone and with the same timezone → both succeed and leave the stored value correct → AC-3
- [x] Send `""`, `"   "`, `"+06:00"`, `"BST"`, `"Mars/Olympus"`, and a 65 character value to `PUT /api/business/me` and to `PUT /api/business/onboarding` → each returns 400 and changes nothing → AC-2, AC-3
- [x] Send `Asia/Dhaka`, `UTC`, `asia/dhaka`, and an IANA alias the runtime accepts → each saves and reads back in canonical form (the lowercase input reads back as `Asia/Dhaka`, and the alias reads back as the ID the runtime resolves). Send a zone one character over the limit → 400 → AC-2
- [x] Save `field: 'timezone'` through `PUT /api/business/onboarding/draft`, then read `GET /api/business/onboarding` → the draft carries the zone and the stored value stays unchanged → AC-3
- [x] Save `field: 'timezone'` with `Mars/Olympus` through the draft endpoint → 400 and the draft is unchanged → AC-2
- [x] Send `field: 'timezone'` to `PUT /api/business/onboarding/draft` after onboarding is complete → 409 `ONBOARDING_COMPLETE`, and the draft stays `null` → AC-3
- [x] Call `GET /api/business/me` and `PUT /api/business/me` with no token, a bad token, no business header, and a non member business → 401, 401, 400, and 403 as before → AC-3, AC-12
- [x] Read `GET /api/orders` and `GET /api/orders/:id` before and after this change → the DTO shape, totals, deadline value, and status fields are unchanged → AC-12
- [x] Query the live database after the migration → `orders` gained no timezone column and `orders.delivery_deadline` is still a nullable `date` → AC-1
- [x] Call `todayInTimeZone('Asia/Dhaka')`, `todayInTimeZone('America/New_York')`, and `todayInTimeZone('Mars/Olympus')` at a fixed instant → the first two return the correct `YYYY-MM-DD` day and the third falls back to the Dhaka day → AC-10, AC-11
- [x] Check the helper one minute before and one minute after a daylight saving transition in `America/New_York`, and on `2028-02-29` → the day changes correctly with no skipped or repeated day → AC-10
- [x] Pick one instant where `Pacific/Kiritimati` and `Pacific/Midway` are on different days → the two calls return different `YYYY-MM-DD` values, and the same stored deadline is overdue in only one → AC-9, AC-10
- [x] Force `Intl.supportedValuesOf` to be unavailable in the browser test environment → the onboarding and settings selects still render, the current zone is present, and the form saves → AC-11
- [x] Put a malformed value in the `f-commerce:business-settings:v1:<businessId>` cache entry and load the app → the cache is ignored and removed, the fallback is used, and the profile request replaces it → AC-7, AC-11

## Commands

- [x] `npm run db:generate --workspace @f-commerce/backend` → one migration is generated for `businesses.timezone` with the `Asia/Dhaka` default and no order change → AC-1
- [x] `npm run db:migrate --workspace @f-commerce/backend` → the migration applies cleanly to a scratch database with an existing business and to the live database → AC-1, AC-4
- [x] `npm run test --workspace @f-commerce/contracts` → the timezone schema cases and the updated business fixtures pass → AC-2
- [x] `npm run test --workspace @f-commerce/backend` → the profile, onboarding, draft, repository, controller, and timezone helper suites pass → AC-1, AC-2, AC-3, AC-10, AC-11
- [x] `npm run test --workspace @f-commerce/frontend` → the provider, cache, select, settings dialog, formatter, deadline, and shell suites pass → AC-5, AC-6, AC-7, AC-8, AC-9, AC-11, AC-12
- [x] `npm run lint`, `npm run typecheck`, and `npm run format:check` → all clean → AC-1 to AC-12 (quality gate)
- [x] `npm run build` → the backend and frontend builds pass with the generated contracts → AC-12 (build gate)

## Acceptance-criteria coverage

- AC-1 the column, the migration, the entity, the draft type, and the unchanged order date · covered by the migration API steps and the schema command
- AC-2 the schema, canonical form, accepted and rejected values, draft branch, and 400 behavior · covered by the onboarding invalid steps, the API validation and draft steps, and the contracts command
- AC-3 the read and write endpoints, roles, onboarding, draft, and tenant scope · covered by the profile API steps and the auth API step
- AC-4 the Dhaka default for existing and new businesses, the onboarding requirement, and the fallback read · covered by the migration, registration, and corrupt value steps
- AC-5 the onboarding field, prefill, draft resume and validation, required rule, review, and provider update · covered by the onboarding UI steps
- AC-6 the settings field, unchanged save, confirmation, cancel, confirm, baseline, corrupt value repair, and provider update · covered by the settings UI steps and the corrupt value step
- AC-7 the provider, cache, per app load and auth change fetch, fallback, shell badge, header date, and currency call replacement · covered by the shell, login, and cache UI steps and the cache API step
- AC-8 every timestamp surface in the business zone and the unchanged date only deadline · covered by the timestamps UI step
- AC-9 the business today, warning, Overdue rule, status exclusions, two viewers, and no timer · covered by the two zone, deadline, warning, and midnight steps and the two zone API step
- AC-10 the helper, fixed locale, `formatToParts`, DST, leap day, and fallback · covered by the helper API steps
- AC-11 corrupt stored value, presence check only, failed request, bad cache, missing list API, and throwing formatter · covered by the corrupt value, backend down, malformed cache, and missing list API steps
- AC-12 accessibility, unchanged order surface, no new dependency or column, and the existing suites · covered by the keyboard step, the order DTO step, the migration check, and the command gates
