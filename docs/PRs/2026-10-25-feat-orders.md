# PR: feat(orders): add order creation, status workflow, and tracking

## What

Adds the orders slice from spec 0007. Sellers create an order in about 60 seconds by picking a customer and products with live totals, the order gets a per-business number (`ORD-0001`), and the queue lists, searches, and filters orders with status chips and cursor paging. The detail page shows stored snapshots, a status timeline, and in-place editing under optimistic version locking; status moves follow the allowed transition table and write history rows with the actor. A 24 hour duplicate guard, `Idempotency-Key` replay, and an optional promised delivery date with a derived `Overdue` badge round out the workflow.

## Why

Implements `docs/specs/0007-orders/index.md`, the workflow core of Slice 2. Payments and inventory build on the order states, totals, and history this slice introduces, and the spec's snapshot rules keep past orders readable no matter how customers and products change later.

## Changes

- **Data and contracts**: order DTOs and schemas in `packages/contracts/src/order.ts`; the `order_status_history` and `business_order_counters` tables; snapshot columns for customer name and phone, variant label, and product name on lines, plus `position`, `version`, and a nullable `variant_id`; migrations `0002_slow_overlord.sql` to `0005_amusing_bug.sql` create the tables, backfill legacy rows (`Legacy Buyer`, `Unknown customer`), enforce `NOT NULL` after the backfill, and add the nullable `delivery_deadline` date column.
- **Numbering and create path**: a serialized per-business counter issues zero padded numbers inside the create transaction, so races produce distinct sequential numbers and a failed create leaves no counter drift; duplicate product and variant lines merge under the 50 line rule (200 raw rows max), totals are computed server side with money caps, and every create writes an audit row.
- **Duplicate guard and idempotency**: a best effort 24 hour duplicate check returns `DUPLICATE_ORDER` with the existing order and can be overridden with `confirmDuplicate`; an `Idempotency-Key` replays the first response (200) before body validation and wins create races, so exactly one order exists per key.
- **List and search**: cursor pagination bound to the active filter set (a replayed cursor with different filters returns 400), `limit=500` rejected, status chip sets with Active as the default, and search that matches order numbers, customer names, and phone numbers on digits with `%` and `_` escaped.
- **Detail, edit, and lock**: detail returns stored snapshots that later customer or product edits cannot change; edits replace lines by `lineId`, follow array positions, and bump the version (stale versions return `ORDER_CHANGED`, no-op writes do not); orders past `PENDING`/`CONFIRMED` refuse edits with `ORDER_LOCKED`.
- **Status workflow**: the transition table rejects invalid moves with `INVALID_STATUS_TRANSITION` before the version check, each accepted move writes exactly one history row with the actor and optional note even under same-version races, and cancel and return require confirmation.
- **Delivery deadline**: an optional real calendar date validated on create and edit, a past date warns in the form but still saves, the detail and list derive an `Overdue` badge from the viewer's local today, and deadline edits audit under `deliveryDeadline`.
- **Frontend**: the `/orders` queue with chips, search, skeletons, and Load more; the `/orders/new` form with live totals, duplicate dialog, and deadline picker; the `/orders/[id]` page with timeline, actions, and in-place edit — keyboard complete with `role="status"` and `role="alert"` announcements at the WCAG AA baseline.
- **Tenant isolation and privacy**: every query scopes on the business, the auth matrix returns 401, 401, 400, and 403 for missing, bad, contextless, and non member requests, and customer names, phones, addresses, and notes stay out of backend logs.

## How to test / verify

- Run `npm run test --workspace @f-commerce/contracts` and expect 93 passing tests.
- Run `npm run test --workspace @f-commerce/backend` and expect 363 passing tests.
- Run `npm run test --workspace @f-commerce/frontend` and expect 166 passing tests.
- Run `npm run typecheck`, `npm run lint`, and `npm run format:check` from the repository root.
- Run `npm run e2e --workspace @f-commerce/frontend -- e2e/orders.spec.ts` against the dev stack (backend with `RATE_LIMIT_DISABLED=true`) and expect 6 passing runs on desktop and mobile.
- The full runtime checklist lives in [verify.md](../specs/0007-orders/verify.md): all 19 acceptance criteria were verified at runtime against the live stack, most recently with a 57 check API pass on 2026-10-25.

## Risk & rollout

Migrations `0002` to `0005` add two tables and `ALTER` the existing `orders` and `order_items` tables. The backfill in `0003` snapshots legacy rows before `0004` enforces `NOT NULL`, and the counter is seeded from the highest existing number per business, so a legacy `ORD-0007` makes the next order `ORD-0008`. The tables are small at this stage, so the plain `CREATE INDEX` write locks are momentary. Rolling back the code leaves the tables, columns, and indexes in place, which is harmless; there is no feature flag. The digit phone search runs `regexp_replace` per candidate row without a dedicated index — an accepted MVP tradeoff recorded in the spec's follow-up notes, to revisit as a generated digits column or trigram index if it ever measures slow.

## Notes for reviewers

- The fresh model review verdict is approve with nits ([2026-10-24](../reviews/2026-10-24-feat-orders.md)); the reviewed tree has no major findings.
- An idempotent replay answers before body validation by design, so a changed payload still returns the first order.
- The duplicate check is best effort and reads only the 100 most recent orders per customer; the limit is a documented safeguard against a pathological 24 hour window.
- The create form refuses a second line for the same product and variant, while the API merges duplicates; both behaviors are pinned by tests and recorded as findings in verify.md.
- There is no UI control for line reorder; the API accepts array positions and the spec does not require one.
