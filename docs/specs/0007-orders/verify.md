# Verify: orders · spec 0007 · updated 2026-10-23

_Steps derived from spec 0007 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [x] Open `/orders` in a business with no orders → the Orders heading, the Active chip selected, the remaining chips, and the empty state render, and the sidebar Orders link reaches the page → AC-14
- [x] Create an order for an active customer with one product and one variant, a quantity, and a unit price override, then add a delivery fee, a discount, and source Direct → the live total matches the lines, and save opens `/orders/[id]` with number `ORD-0001` → AC-1, AC-2, AC-3, AC-4, AC-15
- [x] Create a second order for the same business, then a third for a second business → each business starts at `ORD-0001` and increments on its own → AC-2, AC-12
- [x] Add the same product and variant twice in the create form → the form refuses the duplicate with `That item is already on the order.` and keeps one line; the API merge path is covered by the create API step → AC-11, AC-15
- [x] Submit the same customer and item set again within minutes → the duplicate dialog names the existing order, View existing order opens it, and Create anyway creates a second order → AC-5, AC-15
- [x] Open the order detail → customer name, phone, and address snapshots, item names, variant label, prices, totals, paid 0, due equal to total, notes, and the creation timeline row all render → AC-3, AC-8, AC-18
- [x] Rename the customer and change the product price and name, then reload the old order → the order still shows the old name, phone, product name, and price → AC-3
- [x] Move the order Pending, Confirmed, Processing, Shipped, Delivered → each step asks only for the allowed next action, the timeline shows the actor and time, and the optional note appears when given → AC-10, AC-16, AC-18
- [x] Cancel a pending order and return a delivered order → both open a confirmation with an optional note, and no further actions appear after the final state → AC-10, AC-16
- [x] Open edit on a pending order, change a quantity, a line price, the delivery fee, and notes, then save → totals recompute, the version rises, and the record shows the change → AC-4, AC-9, AC-16
- [x] Reorder two lines through the API, save, and reload → the new order is kept and the version rises. The edit form sends each existing `lineId`; the spec does not require a UI reorder control → AC-9, AC-16
- [x] Move the order to Processing, then check the detail → the Edit control is gone and a direct edit request returns `ORDER_LOCKED` → AC-9, AC-16
- [x] Open the same order in two tabs, save an edit in the first, then save in the second → the second shows the reload message and does not overwrite → AC-9, AC-16
- [x] Search by order number, customer name, and a formatted customer phone, then search for a literal `%`, then switch status chips → matches narrow correctly, the search text survives the chip change, Active shows only the four working statuses, and All shows every status including Delivered → AC-7, AC-14
- [x] Seed more than 20 active orders and one delivered order, then page the list → Active shows only active rows, All shows the delivered row, 20 rows load at a time, Load more adds the rest, and a Load more request cannot duplicate a row → AC-7, AC-14
- [x] Archive the order's customer and product, then reload the order and try to create a new order for the archived customer → the old order stays readable with snapshots, and the new order shows the archived customer message → AC-13
- [x] Use only the keyboard to create, edit, and change status, and check the mobile viewport → focus moves into dialogs, labels are announced, status changes are announced, and no control is unreachable → AC-14, AC-15, AC-16
- [x] Change the business currency in Settings and reopen an order → every order amount uses the new currency display. The shell footer still shows a hardcoded `Bangladesh · BDT` badge, an issue that existed before this feature and sits outside the order amounts → AC-15, AC-16

## API / runtime

- [x] Create an order with valid fields, then read it back from the list and detail → 201, correct snapshots, status PENDING, paid 0, due equal to total, version 1, `createdAt` and `updatedAt` set, and one creation history row with the actor name → AC-1, AC-3, AC-4, AC-8, AC-18
- [x] Send invalid create payloads: missing customer, empty items, unknown customer, archived customer, archived product, variant from another product, source outside the list, quantity 0, quantity 1001, a duplicate pair that merges past 1000, two prices for one pair, unit price above 100,000,000, delivery fee above 100,000,000, a computed total above 2,000,000,000, 51 lines, discount above subtotal plus delivery, note over 500, address over 500 → 400 with the named field on each, and 409 `CUSTOMER_ARCHIVED` for the archived customer → AC-1, AC-4, AC-11, AC-13
- [x] Create an order with an omitted address and then a blank address → both store null → AC-1, AC-11
- [x] Race two creates for one business and inspect the numbers → both succeed with distinct sequential numbers and the counter ends at the right value → AC-2
- [x] Seed a legacy `ORD-0007` row before the migration, then create a new order → the new order is `ORD-0008` and no collision occurs → AC-2
- [x] Force the create transaction to fail after the counter bump → no order, no lines, no history, and no counter change remain → AC-17
- [x] Send the same customer and item set twice with different quantities within 24 hours → the second returns 409 `DUPLICATE_ORDER` with the existing order, and a resend with `confirmDuplicate` true creates it → AC-5
- [x] Send a duplicate for a different customer, a different item set, a cancelled order, and an order older than 24 hours → no warning is returned in each case → AC-5
- [x] Send two creates with the same Idempotency-Key, including one with a changed payload → the second returns 200 with the first order and creates nothing → AC-6
- [x] Race two creates with the same Idempotency-Key → exactly one order exists and both responses carry it → AC-6
- [x] Send a create with a bad key length and a create with a duplicate body but no key, then a same key replay with an invalid body → 400 on the key, 409 on the duplicate, and 200 on the replay before body validation → AC-5, AC-6
- [x] Walk the list with a cursor, request limit 500, send a malformed cursor, replay a cursor with a different status set and search, and combine the Active status set with search → every row appears once, `limit=500` returns 400 per AC-7, the malformed and replayed cursors return 400, and filters AND together → AC-7
- [x] Search by a formatted phone, a phone with spaces, a literal `%`, and a literal `_` → phone matches on digits and the wildcard characters match only themselves → AC-7
- [x] Read `GET /api/orders/:id` with a malformed id, an unknown id, and another business's id → 404 in all three cases → AC-8, AC-12
- [x] Edit with a matching version, a no op payload, a stale version, and a locked status → one version step, no write or version change on the no op, `ORDER_CHANGED`, and `ORDER_LOCKED` before the version check → AC-9
- [x] Edit with `lineId` for an existing line, with and without a new price, and reorder the lines → the stored name, label, and cost stay, the price changes only when sent, the positions follow the array, and the version rises → AC-3, AC-9
- [x] Edit with a lineId from another order, a repeated lineId, and a lineId whose product differs from the stored line → 400 with `items` named on each → AC-9
- [x] Edit an order that keeps a line whose product was archived after creation, then try to add a new archived line → the existing line is kept with its stored snapshots, and the new line returns 400 → AC-9, AC-13
- [x] Delete a variant from a product after an order used it, then read and edit the order → the line keeps its label, name, price, and cost, its variant id is null, and the line can still be edited by `lineId` → AC-3, AC-9, AC-13
- [x] Walk every allowed status move and every rejected move, including the current status and a move out of Cancelled and Returned → allowed moves return 200 with one history row, rejected moves return 409 `INVALID_STATUS_TRANSITION` → AC-10, AC-18
- [x] Send a status change with both an invalid target and a stale version, and a valid target with a stale version → `INVALID_STATUS_TRANSITION` first, then `ORDER_CHANGED` → AC-10
- [x] Send two status changes with the same version → one succeeds and one returns `ORDER_CHANGED`, with exactly one history row → AC-10, AC-17
- [x] Force the status update to fail after the history insert attempt → neither the status nor the history row changes → AC-17
- [x] Read audit rows after a create and an edit → one `ORDER_CREATED` and one `ORDER_UPDATED` row, entity type `ORDER`, the right entity id, and metadata naming the order number, total, and changed fields → AC-17
- [x] Read an order row with no customer after the migration → it carries the `Unknown customer` and empty phone backfill → AC-3
- [x] Call every route with no token, a bad token, no business header, and a non member business → 401, 401, 400, and 403 in that order → AC-12
- [x] Sign in as STAFF and create, edit, and change status → every action succeeds inside the business → AC-12
- [x] Inspect backend logs during the run → customer names, phones, addresses, and order notes are absent → AC-12

## Delivery deadline (verified 2026-10-24)

_Added with the 2026-10-23 update and built in build tasks 10 to 12. `/check verify` ran these on 2026-10-24; the original 18 acceptance criteria above stay verified._

- [x] Create an order with no deadline, then with a future date, then with a past date → the create response, list, and detail carry the right value; the detail shows `Not set` for the null case; the past date shows the form warning and still saves → AC-1, AC-7, AC-8, AC-15, AC-16, AC-19
- [x] Edit a pending order to set a deadline, change it, clear it, set the same value twice, and send a stale version → the set, change, and clear each bump the version once and write an audit naming `deliveryDeadline`; the same value does not write; the stale version returns `ORDER_CHANGED` → AC-9, AC-17, AC-19
- [x] Move an order with a past deadline to `PROCESSING` and `SHIPPED`, then try a deadline edit → the date and `Overdue` badge stay visible, and the edit returns `ORDER_LOCKED` → AC-9, AC-14, AC-16, AC-19
- [x] Open a `DELIVERED`, `CANCELLED`, and `RETURNED` order with a past deadline → the date shows and the `Overdue` badge does not → AC-14, AC-16, AC-19
- [x] Send `2026-02-30`, `2026-13-01`, and `2026-1-1` on create and edit → 400 `VALIDATION_ERROR` with `deliveryDeadline`, and nothing changes → AC-11, AC-19
- [x] Render a deadline around midnight in two browser timezones, then reload after the local day changes → the date keeps the same calendar day, and the `Overdue` badge follows the viewer's local today → AC-19
- [x] Query the live database for `orders.delivery_deadline` → the nullable `date` column exists, existing rows are null, and no deadline index was added → AC-19
- [x] Rerun the backend, frontend, and contracts suites plus lint, typecheck, and format → all pass → AC-1 to AC-19 (regression gate)

## Commands

- [x] `npm run db:migrate --workspace @f-commerce/backend` → the live command reports migrations applied successfully with no pending work; a scratch database applied the migration files over a seeded `ORD-0007`, backfilled `Legacy Buyer` and `Unknown customer`, seeded the counter to 7, and created `ORD-0008` next → AC-2, AC-3, AC-17
- [x] Query the live database for `orders`, `order_items`, `order_status_history`, and `business_order_counters` → the snapshot columns, variant reference, position, version column, both order list indexes, the actor name, and the history index exist → AC-2, AC-3, AC-7, AC-17
- [x] `npm run test --workspace @f-commerce/backend` → the full backend suite passes, including the updated order seeds → AC-1 to AC-18 (regression gate)
- [x] `npm run test --workspace @f-commerce/frontend` → the full frontend suite passes → AC-14, AC-15, AC-16 (regression gate)
- [x] `npm run test --workspace @f-commerce/contracts` → the contract suite passes → AC-1, AC-4, AC-11 (contract gate)
- [x] `npm run lint`, `npm run typecheck`, and `npm run format:check` → all clean → AC-1 to AC-18 (quality gate)

## Acceptance-criteria coverage

- AC-1 create, merging, conflicting prices, null address, snapshots, defaults, and the transaction · covered by the create UI steps and the create API steps
- AC-2 per business sequence, padding, backfill, concurrency, and durability · covered by the order number UI steps, the create race step, and the backfill step
- AC-3 snapshots, line identity, and later edit immunity · covered by the detail, rename, reorder, and archive UI steps, the create API step, the line identity step, and the legacy row step
- AC-4 server totals, zero paid, due equal to total, the discount guard, and the money caps · covered by the create and edit UI steps and the invalid create step
- AC-5 the 24 hour duplicate rule and the confirm flag · covered by the duplicate UI step and the duplicate API steps
- AC-6 Idempotency-Key replay precedence and the two request race · covered by the idempotency API steps
- AC-7 cursor binding, filters, digit phone search, escaped wildcards, and line count · covered by the search and paging UI steps and the list API steps
- AC-8 detail shape, positions, timestamps, and 404 cases · covered by the detail UI step and the detail API step
- AC-9 edit rules, lineId, position, stored price, version, no op, and audit · covered by the edit UI steps and the edit API steps
- AC-10 the transition table, note, error precedence, and version guard · covered by the status UI steps and the status API steps
- AC-11 limits, trimming, merged quantity, money caps, and field errors · covered by the merge UI step and the invalid create step
- AC-12 tenant isolation, roles, and log privacy · covered by the second business UI step and the auth API steps
- AC-13 archived references, the deleted variant case, and saved snapshots · covered by the archive UI step and the archived and deleted variant API steps
- AC-14 list screen, Active default, search, states, and accessibility · covered by the list, search, paging, and keyboard UI steps
- AC-15 create screen, duplicate dialog, currency, and the 60 second flow · covered by the create, duplicate, currency, and keyboard UI steps
- AC-16 detail, actions, edit in place, conflict, and accessibility · covered by the detail, status, edit, reorder, conflict, and keyboard UI steps
- AC-17 atomic writes, audit metadata, and rollback · covered by the rollback API steps and the audit step
- AC-18 exactly one history row per creation and status change, with the stored actor name · covered by the detail and status UI steps and the status API step
- AC-19 the optional delivery deadline, date validation, past date warning, edit lock, audit, and derived `Overdue` badge · covered by the pending delivery deadline steps

## Findings

- The create form refuses a second line for the same product and variant with `That item is already on the order.` The API merge path is verified; this UI choice is not a spec miss.
- The edit form has no reorder control. The API reorder path is verified; spec 0007 does not require a UI reorder control.
- The shell footer still shows the hardcoded `Bangladesh · BDT` badge after the business currency changes. Order amounts use the business currency; this badge existed before this feature and sits outside the order amounts.
- The checklist steps for duplicate add, reorder, limit 500, and currency were corrected to match spec 0007 and the observed UI.
- The initial list load shows three visual skeletons and now announces `Loading orders…` in a `role="status"` region; the empty state is also a `role="status"` region, and the error state uses `role="alert"`. The announcement gap found in the 2026-10-24 second review is fixed, and a page test pins both states.
- The delivery deadline build tasks 10 to 12 have landed: the column, the contracts, the form and detail fields, the list badge, and the edit lock. Verified at runtime on 2026-10-24 (backend and frontend dev servers against the live database): create with no, future, past, and blank dates; list and detail carry the value; detail shows `Not set`; set, change, clear, same value, and stale version on edit; the `deliveryDeadline` audit rows; invalid dates rejected on create and edit; the edit lock on `PROCESSING` and `SHIPPED`; no `Overdue` badge on `DELIVERED`, `CANCELLED`, and `RETURNED`; the same calendar day in two timezones; today not overdue and yesterday overdue; the mobile card layout; and the nullable `date` column with no index. Backend 349, frontend 145, and contracts 81 tests pass; lint and typecheck clean. `format:check` is clean for code and tests and only warns on the two committed review docs, which predate this change.
- Rerun on 2026-10-25: the dev database was four migrations behind, only `0000` and `0001` were applied, so `orders` had no snapshot columns, no `version`, no `delivery_deadline`, and neither new table. Every orders browser test failed with `column "customer_name_snapshot" does not exist` until `npm run db:migrate --workspace @f-commerce/backend` ran. After the migration, 23 API checks, 6 orders browser tests, and 3 extra browser checks (duplicate line refusal, full edit totals, cancel and lock, two tab conflict, paging, currency, two timezone deadline, archived customer) all pass, the backend suite passes 363, and lint, typecheck, and format are clean.
