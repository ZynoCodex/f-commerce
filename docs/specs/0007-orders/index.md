# 0007. Orders with a strict status workflow

**Date**: 2026-10-22
**Updated**: 2026-10-23
**Status**: Accepted

## Summary

This decision adds the daily order workflow: create an order from a saved customer and catalog items, keep the prices and buyer details as they were at sale time, move the order along a strict status path, and show its full timeline. Each order can also carry an optional promised delivery date, recorded as the delivery deadline, the calendar day the seller promised, which the screens show with an Overdue badge while the order is still active. It deliberately leaves payment recording and stock movement to features 10 and 11, so the paid amount stays at zero and the due amount equals the total for now. The build uses the existing PostgreSQL tables, Express layers, shared contracts, and seller console.

## Requirements

**User stories**:

- As a seller, I want to create an order from a saved customer and catalog items in under a minute so that a phone or social channel sale is recorded before I forget it.
- As a seller, I want to see each order's status and full history so that I know what has been confirmed, shipped, delivered, cancelled, or returned.
- As a seller, I want the buyer details, item names, and prices frozen at sale time so that later catalog or customer edits do not rewrite history.
- As a seller, I want a warning when I am about to create a likely duplicate so that a slow network or a double tap does not record the same sale twice.
- As a seller, I want to record the promised delivery date and see when an active order has passed it so that I can follow up before the buyer complains.
- As a staff member, I want the same order actions as the owner so that the counter keeps moving when the owner is away.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: `POST /api/orders` creates an order for the active business when given `customerId` (required uuid), `items` (required array of 1 to 50 lines after merging), `source` (required channel), and optional `deliveryFee`, `discount`, `shippingAddress`, `notes`, `deliveryDeadline`, and `confirmDuplicate`. Each line has `productId` (required uuid), `variantId` (optional uuid), `quantity` (integer 1 to 1000), and `unitPrice` (optional integer 0 to 100,000,000). The server resolves the customer, products, and variants from the same business, merges lines with the same product and variant by summing quantity, and snapshots the customer name and phone plus each line's product name, price, cost, variant label, and position. Lines that resolve to different unit prices are rejected with 400, and a merged quantity outside 1 to 1000 is rejected. The server computes the totals, assigns the next order number, sets status `PENDING`, `paidAmount` 0, and `version` 1, and writes the order, its items, the initial status history row with the current user's name, one `ORDER_CREATED` audit row, and the counter bump in one transaction. An omitted or blank `shippingAddress` is stored as null and is never copied from the customer by the server. Success returns 201 with the full order. Invalid fields return 400 `VALIDATION_ERROR` with `fields`. An archived customer returns 409 `CUSTOMER_ARCHIVED`. An unknown or other business customer, product, or variant returns 400 `VALIDATION_ERROR` with `fields`.
- **AC-2**: Each business has an independent order number sequence. The first order is `ORD-0001` and each later order increments by one, padded to at least four digits. The number is assigned inside the create transaction from `business_order_counters` and is unique per business. The migration seeds each counter from the highest existing `ORD-` number in that business, so the first order after the migration never collides with a row created before this feature. Concurrent creates never share a number, a rolled back create leaves no gap, and the sequence survives process restarts.
- **AC-3**: Every order stores the customer name and phone at creation. Every line stores the product name, the variant label when a variant is used, and the unit price and cost at creation. Later edits to the customer record, product, variant, or product price never change an existing order or its lines. Changing the order's customer updates the customer snapshots to the new customer's current values. Changing an existing line's quantity or unit price keeps its name, variant label, and cost snapshot. List, detail, and timeline reads show the stored snapshots.
- **AC-4**: `subtotal` equals the sum of `quantity` times `priceSnapshot` across lines. `total` equals `subtotal` plus `deliveryFee` minus `discount`. `dueAmount` equals `total` minus `paidAmount`, and `paidAmount` stays 0 in this slice. The server computes every money value and ignores any `subtotal`, `total`, `paidAmount`, or `dueAmount` sent by the client. All money values are integers at least 0. A discount greater than subtotal plus delivery fee returns 400 `VALIDATION_ERROR` with `fields` naming `discount` and changes nothing. A computed subtotal or total above 2,000,000,000 returns 400 `VALIDATION_ERROR` and changes nothing.
- **AC-5**: After field validation and reference checks pass, a create is a possible duplicate when another order in the same business has the same `customerId` and exactly the same set of product and variant pairs, ignoring quantity, was created within the previous 24 hours, and is not `CANCELLED`. The window uses the database clock and includes an order created exactly 24 hours ago. The first create returns 409 `DUPLICATE_ORDER` with `existingOrder` (id, orderNumber, status, total, createdAt) and changes nothing. Resending the same payload with `confirmDuplicate` true creates the order. A different item set, a different customer, an order older than 24 hours, or a cancelled order does not trigger the warning. Edits never run the check.
- **AC-6**: `POST /api/orders` accepts an optional `Idempotency-Key` header of 1 to 100 characters. On every create the server authenticates, validates the key length, looks up the key in the business, and returns the stored order with 200 before body validation, reference checks, or the duplicate check. A second request with the same key creates nothing, even when the payload differs. A different key creates a separate order. Keys are unique per business. When two creates race on one key, the loser rolls back and returns the winner's order, so exactly one order exists.
- **AC-7**: `GET /api/orders` returns orders for the active business, newest first by `createdAt` then `id`. Optional query values are `status` (one status or a comma separated list of statuses, matched with `IN`), `q` (1 to 100 characters, matched case insensitively as a contains against order number, customer name snapshot, or customer phone snapshot, with `%` and `_` treated as literals and phone matching on digits only), `cursor`, and `limit` (1 to 50, default 20). Each row includes id, order number, status, customer name snapshot, total, due amount, source, `deliveryDeadline`, `createdAt`, `updatedAt`, and item count, where item count is the number of lines and `deliveryDeadline` is a `YYYY-MM-DD` date or null. The response includes `nextCursor` when more rows exist. A cursor is bound to the status set, `q`, and limit that built it, and replaying it against a different query returns 400 `VALIDATION_ERROR` with `fields` naming `cursor`. A malformed cursor or limit also returns 400. The list is tenant scoped.
- **AC-8**: `GET /api/orders/:id` returns the order, its item lines ordered by position then creation time, and its status history oldest first. Each line includes its id, product id, variant id, product name snapshot, variant label snapshot, price snapshot, cost snapshot, quantity, subtotal, and position. History rows include `fromStatus`, `toStatus`, `note`, `changedByName`, and `createdAt`. The response includes the customer name and phone snapshots, shipping address, source, notes, `deliveryDeadline`, subtotal, delivery fee, discount, total, paid amount, due amount, version, `createdAt`, and `updatedAt`. A malformed id, an unknown id, and an id from another business all return 404 `NOT_FOUND`.
- **AC-9**: `PATCH /api/orders/:id` accepts `version` (required integer) and any of `customerId`, `items` (full replacement), `deliveryFee`, `discount`, `shippingAddress`, `source`, `notes`, and `deliveryDeadline`. Status is not accepted. Edits are allowed only while status is `PENDING` or `CONFIRMED`. Omitted fields are unchanged. A `deliveryDeadline` of null or blank clears the stored date; setting the same date, or clearing an already null date, is a no op. A changed deadline follows the same version and audit rules as the other fields, and a past date is accepted. Changing `customerId` replaces the customer name and phone snapshots with that customer's current values. Each item accepts the create fields plus optional `lineId`, which must be the id of an existing line on this order. An unknown, other order, or repeated `lineId` returns 400 `VALIDATION_ERROR` with `fields` naming `items`, and a `lineId` whose supplied product or variant differs from the stored line also returns 400. A line with a `lineId` keeps its stored product, variant, product name, variant label, and cost, and keeps its stored unit price unless a new `unitPrice` is sent. A line without a `lineId` is new and resolves the catalog. The array order after merging, using the first occurrence of a pair, sets each line's position, and a reorder alone counts as an actual change. The same merging, conflicting price, quantity, and total rules as create apply. An archived product, or a variant that no longer exists, is accepted only for a line that already exists and carries its `lineId`. A status outside `PENDING` and `CONFIRMED` returns 409 `ORDER_LOCKED` before the version check. A matching version with an actual change writes once, increments version by 1, bumps `updatedAt`, and writes one `ORDER_UPDATED` audit row. A matching version with no change returns 200 with the current order without writing or incrementing. A stale version returns 409 `ORDER_CHANGED` and changes nothing. The archived customer rule from create applies.
- **AC-10**: `POST /api/orders/:id/status` accepts `status` (required order status), `note` (optional, at most 200 characters), and `version` (required integer). Allowed moves: `PENDING` to `CONFIRMED` or `CANCELLED`, `CONFIRMED` to `PROCESSING` or `CANCELLED`, `PROCESSING` to `SHIPPED` or `CANCELLED`, `SHIPPED` to `DELIVERED` or `RETURNED`, `DELIVERED` to `RETURNED`, and no moves out of `CANCELLED` or `RETURNED`. Checks run in order: order existence (404), transition validity against the stored status (409 `INVALID_STATUS_TRANSITION`), then version (409 `ORDER_CHANGED`). Any other move, including the current status, returns 409 `INVALID_STATUS_TRANSITION`. Success updates the status, increments version by 1, bumps `updatedAt`, appends exactly one history row with the old status, new status, current user's stored name, the note when given, and the time, and changes no money value. Returns 200 with the updated detail.
- **AC-11**: Lines are 1 to 50 distinct product and variant pairs, and same pair lines are merged before the limit is checked. Quantity is an integer 1 to 1000, and a merged quantity must stay in that range. Unit price, delivery fee, and discount are integers 0 to 100,000,000. A computed subtotal or total above 2,000,000,000 is invalid. Two lines that resolve to different unit prices are invalid. Shipping address is at most 500 characters after trimming, and null or blank clears it on edit. Notes is at most 500 characters after trimming, and null or blank clears it on edit. Source is one of `FACEBOOK`, `WHATSAPP`, `INSTAGRAM`, `TIKTOK`, `DIRECT`, `OTHER`. `deliveryDeadline` is a real calendar date in `YYYY-MM-DD`, or null or blank for no deadline, and a past date is accepted. Status note is at most 200 characters. Every invalid input returns 400 `VALIDATION_ERROR` with a `fields` array naming the invalid fields and changes nothing. Text fields are trimmed.
- **AC-12**: Every route requires a bearer token and an `x-business-id` header, and both `OWNER` and `STAFF` members may read and write. A missing or bad token returns 401. A missing business header returns 400. A non member business returns 403. Every query filters by the active business, an order in another business returns 404, and a customer, product, or variant from another business is rejected. Creating or editing never reads or writes another business's data.
- **AC-13**: An archived customer returns 409 `CUSTOMER_ARCHIVED` on create and when changed on edit. An archived product, or a variant that no longer exists, returns 400 `VALIDATION_ERROR` with `fields` naming `items` on create, and is accepted on edit only for a line that already exists and carries its `lineId`. A variant must belong to its product. Variants have no archive state in this slice. When a product edit deletes a variant, the order line keeps its name, variant label, price, and cost snapshots, its `variant_id` becomes null, and the line can still be read and edited by `lineId`. An order whose customer or catalog item was archived later remains readable and keeps its snapshots.
- **AC-14**: `/orders` opens on an Active filter (`PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`) and offers Active, All, and each status as a filter. Delivered and the final states appear under All or their own chip. It shows order number, customer name, status, delivery deadline when set, the `Overdue` badge defined in AC-19, total, due amount, source, and creation date on both the desktop table and the phone card layout. Search accepts an order number, customer name, or phone, is debounced, survives filter changes, and matches formatted phone numbers by their digits. It loads 20 rows at a time with a Load more control. Empty, no match, loading, and error states are present and announced. The Orders nav link reaches the page. The layout works on a phone and a desktop and meets WCAG AA.
- **AC-15**: `/orders/new` is one page that picks an existing active customer (search by name or phone), prefills their address, adds products with an optional variant, quantity, and optional unit price override, shows a live line and order total, takes delivery fee, discount, source (`DIRECT` preselected), an optional delivery deadline, and notes, and saves. A deadline before the viewer's local today shows a non blocking warning but does not block the save. An empty address saves as null. Inline validation names the field. On 409 `DUPLICATE_ORDER` the page shows the existing order and offers View existing order or Create anyway, and Create anyway resubmits with `confirmDuplicate` true. A successful save navigates to `/orders/[id]`. Amounts display in the business currency. The flow supports a simple order in about 60 seconds.
- **AC-16**: `/orders/[id]` shows the order number, status, source, date, customer name, phone and address, delivery deadline or `Not set`, the `Overdue` badge defined in AC-19 when applicable, item lines with snapshots, totals, paid and due, notes, and the status timeline oldest first with status, actor, note, and time. It offers only the allowed next status actions. Cancel and Return open a confirmation with an optional note. Edit appears only for `PENDING` or `CONFIRMED` and turns the page into the edit form, sends version, sends each existing line's id back as `lineId`, and includes the delivery deadline with a way to clear it. A 409 `ORDER_CHANGED` shows a reload message. Archived references stay visible from snapshots. Amounts display in the business currency. The page is keyboard reachable and meets WCAG AA.
- **AC-17**: Create writes the order, items, initial history, one `ORDER_CREATED` audit row, and the counter bump in one transaction. The audit row uses entity type `ORDER`, the order id, and metadata with the order number and total. Edit writes the order, replacement items, and one `ORDER_UPDATED` audit row in one transaction, with metadata naming the changed fields and the previous and new totals. When the edit changes `deliveryDeadline`, the metadata names `deliveryDeadline` among the changed fields. The create audit metadata stays the order number and total. Status change writes the order and history row in one transaction, and the history row is its audit record. If any write fails, nothing from that request is stored, including the counter and history. Order history is append only and has no update or delete path.
- **AC-18**: Every order has exactly one history row at creation (`fromStatus` null, `toStatus` `PENDING`) and exactly one row per successful status change, in time order. Each row carries the actor's display name captured from the users table when the row is written, so a later rename does not rewrite history, and the note when one was given. The detail timeline matches these rows one to one. An edit does not add a status row.
- **AC-19**: An order has an optional `deliveryDeadline`, the promised delivery date, which is the calendar day the seller promised to deliver. It is stored as a nullable PostgreSQL `date`, has no time and no timezone, and is returned as a `YYYY-MM-DD` string or null. Create accepts it as an optional field; omitted, null, or blank stores null. Edit accepts it as an optional field; omitted leaves it unchanged, and null or blank clears it. A non blank value must be a real calendar date in `YYYY-MM-DD`, so `2026-02-30` and `2026-13-01` are rejected with 400 `VALIDATION_ERROR` and `fields` naming `deliveryDeadline`. A past date is accepted on create and edit. The full create response, each list row, and the detail response include `deliveryDeadline`. The list and its phone card layout show the date when set. The detail shows the date or `Not set`. The UI label is `Delivery deadline`. The screens format the stored value as a calendar date and never pass it through a timestamp, so the day does not shift with a timezone. The create and edit forms show a non blocking warning when the chosen date is before the viewer's local today (the calendar date in the browser's time zone), and the save is still allowed. The list and detail show an `Overdue` badge only when the deadline is set, is before the viewer's local today, and the status is `PENDING`, `CONFIRMED`, `PROCESSING`, or `SHIPPED`. The badge does not appear for `DELIVERED`, `CANCELLED`, or `RETURNED`, and a deadline of today is not overdue. The badge is derived in the browser at render time and updates on the next render or reload, not on a timer. It does not change the status, write a history row, or appear in the API. A deadline change is allowed only while the order is `PENDING` or `CONFIRMED`, follows the version, no op, and audit rules of AC-9 and AC-17, and bumps `updatedAt` when it is an actual change. The deadline does not affect totals, duplicate detection, search, filtering, sorting, or the status workflow. No index is added in this slice.

## Decision

**Chosen option**: Option 1, a strict workflow with snapshots, append only history, and a visible duplicate guard.

The order record is the financial and operational record of a sale. It keeps what was sold, to whom, at what price, and how it moved from Pending to its final state. Status changes go through their own endpoint so the transition rules and the editable fields never share a payload.

The promised delivery date is carried as a nullable calendar date on the order, set at create, editable only while the order is editable, and surfaced as a derived `Overdue` badge. It is a promise, not a courier event, so it changes no totals and no status.

**Implementation skills**: `web-design-guidelines` (`vercel-labs/agent-skills`, `.agents/skills/web-design-guidelines/`) · `lucide-icons` (`aksuharun/skills`, `.agents/skills/lucide-icons/`)

## Feature design

**Data model sketch**:

Existing `orders` gains:

- `customer_name_snapshot` text not null, the customer name at creation.
- `customer_phone_snapshot` text not null, the customer phone at creation.
- `version` integer not null default 1, used by edits and status changes.
- `delivery_deadline` date nullable, the promised delivery date. It has no time or timezone, existing rows stay null, and there is no backfill. No index is added because this slice does not filter or sort by it. The Drizzle column uses string mode (`date('delivery_deadline', { mode: 'string' })`), so the driver returns a `YYYY-MM-DD` string and the API never constructs a JavaScript `Date`.
- New index `orders_business_status_created_idx` on `(business_id, status, created_at, id)` for the filtered list.
- New index `orders_business_created_idx` on `(business_id, created_at, id)` for the unfiltered newest first list. The existing customer and creation index stays.

Existing `order_items` gains:

- `variant_id` uuid nullable references `product_variants(id)` with `on delete set null`, so a catalog change never blocks an order and the snapshot stays readable.
- `variant_label_snapshot` text nullable, for example `Blue / Large`.
- `position` integer not null default 0. The line `id` is the stable `lineId` an edit sends back. New lines receive positions from the request array after merging, using the first occurrence of a pair. Legacy rows keep 0 and sort by creation time.
- The existing `order_items_order_idx` on `order_id` stays.

New `order_status_history`:

- `id` uuid primary key.
- `business_id` uuid not null references `businesses(id)`.
- `order_id` uuid not null references `orders(id)` on delete cascade.
- `from_status` text typed to the order status enum, nullable only on the creation row.
- `to_status` text typed to the order status enum, not null.
- `note` text nullable, at most 200 characters at the API.
- `changed_by_user_id` uuid not null, matching the `audit_logs` convention with no foreign key.
- `changed_by_name` text not null, the actor name captured when the row is written.
- `created_at` timestamptz not null default now. No updated timestamp, because rows never change.
- Index `order_status_history_business_order_created_idx` on `(business_id, order_id, created_at, id)`.

New `business_order_counters`:

- `business_id` uuid primary key references `businesses(id)`.
- `last_number` integer not null default 0.
- `updated_at` timestamptz not null default now.

The migration backfills the customer snapshots from `customers` where `customer_id` is present, and uses `Unknown customer` with an empty phone only for legacy rows with no customer. It seeds each counter from the highest parsed `ORD-` number in that business, so a new order never collides with a row created before this feature. The same migration adds the nullable `delivery_deadline` column and leaves every existing row null; there is no backfill for it.

The contract parses the date in two steps. Create and update first map an omitted field, `null`, and a blank string to null, then check a non null value with `z.iso.date()` (a real calendar date in `YYYY-MM-DD`). Read schemas use `z.iso.date().nullable()`. The blank mapping must run before the date check, because the date schema rejects an empty string.

Existing `orders` fields keep their meaning. `customer_id` stays nullable in the database for legacy test seeds, and every API write requires it. `paid_amount` stays 0 and `due_amount` equals `total` in this slice. `source` stores the contract channel value. `idempotency_key` already has a per business partial unique index.

**State transitions**:

| From         | Allowed to                |
| ------------ | ------------------------- |
| `PENDING`    | `CONFIRMED`, `CANCELLED`  |
| `CONFIRMED`  | `PROCESSING`, `CANCELLED` |
| `PROCESSING` | `SHIPPED`, `CANCELLED`    |
| `SHIPPED`    | `DELIVERED`, `RETURNED`   |
| `DELIVERED`  | `RETURNED`                |
| `CANCELLED`  | none                      |
| `RETURNED`   | none                      |

Every successful move appends one history row. Edits are allowed only in `PENDING` and `CONFIRMED`. The delivery deadline follows that edit lock, so it changes only in `PENDING` and `CONFIRMED`. The `Overdue` badge is a derived view and never moves the order.

**API surface**:

| Endpoint                 | Method | Key inputs                                                                                                                                | Key outputs                               | Auth                   | Key errors                                                 |
| ------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------- | ---------------------------------------------------------- |
| `/api/orders`            | POST   | customerId, items, source (required), deliveryFee, discount, shippingAddress, notes, deliveryDeadline, confirmDuplicate, Idempotency-Key  | full order with items and history         | bearer, OWNER or STAFF | 400 validation, 409 CUSTOMER_ARCHIVED, 409 DUPLICATE_ORDER |
| `/api/orders`            | GET    | status list, q, cursor, limit                                                                                                             | rows with deliveryDeadline and nextCursor | bearer, OWNER or STAFF | 400 validation                                             |
| `/api/orders/:id`        | GET    | id                                                                                                                                        | full order with items and history         | bearer, OWNER or STAFF | 404 NOT_FOUND                                              |
| `/api/orders/:id`        | PATCH  | version (required), customerId, items (optional lineId per line), deliveryFee, discount, shippingAddress, source, notes, deliveryDeadline | full order                                | bearer, OWNER or STAFF | 400 validation, 404, 409 ORDER_LOCKED, 409 ORDER_CHANGED   |
| `/api/orders/:id/status` | POST   | status, version (required), note                                                                                                          | full order                                | bearer, OWNER or STAFF | 404, 409 ORDER_CHANGED, 409 INVALID_STATUS_TRANSITION      |

Error bodies follow the customer convention: an `error` code, a `message`, a `fields` array for validation, and `existingOrder` for a duplicate. The full code list is `VALIDATION_ERROR`, `NOT_FOUND`, `CUSTOMER_ARCHIVED`, `ORDER_LOCKED`, `ORDER_CHANGED`, `INVALID_STATUS_TRANSITION`, and `DUPLICATE_ORDER`.

All order representations carry `deliveryDeadline` as a `YYYY-MM-DD` string or null. The status endpoint does not accept it, and no new endpoint, error code, permission, or configuration is added.

**Value sourcing**:

| Action              | Value produced or displayed                 | Source                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create              | Order number                                | `business_order_counters.last_number` incremented in the same transaction, seeded by the migration                                                                                                                                                         |
| Create              | Customer name and phone snapshots           | `customers.name` and `customers.phone` at creation                                                                                                                                                                                                         |
| Edit                | Customer snapshots after a buyer change     | The new customer's `customers.name` and `customers.phone`                                                                                                                                                                                                  |
| Create and edit     | Shipping address prefill and value          | `customers.address` in the screen, then the client input; omitted or blank stores null                                                                                                                                                                     |
| Create              | Product name and cost snapshots             | `products` or the variant override in `product_variants`                                                                                                                                                                                                   |
| Edit, existing line | Product name and cost                       | The line's stored `product_name_snapshot` and `cost_snapshot`                                                                                                                                                                                              |
| Create              | Unit price                                  | Client `unitPrice` override, else the variant price, else the product price                                                                                                                                                                                |
| Edit, existing line | Unit price                                  | Client `unitPrice`, else the line's stored `price_snapshot`                                                                                                                                                                                                |
| Create and edit     | Variant label                               | The product option names and the variant combination, or the stored label for an existing line                                                                                                                                                             |
| Create and edit     | Line position                               | The request array order after merging, using the first occurrence of a pair                                                                                                                                                                                |
| Create and edit     | Line subtotal                               | Derived: quantity times unit price                                                                                                                                                                                                                         |
| Create and edit     | Subtotal, total, due amount                 | Derived from lines, delivery fee, discount, and paid amount                                                                                                                                                                                                |
| Create              | Initial status                              | Fixed `PENDING`                                                                                                                                                                                                                                            |
| Create and edit     | Source channel                              | Client select, one of the contract channel values                                                                                                                                                                                                          |
| Create and edit     | Promised delivery date (`deliveryDeadline`) | Client date input as a `YYYY-MM-DD` value; omitted, null, or blank stores null on create, omitted leaves it unchanged on edit, and a past date is accepted                                                                                                 |
| List and detail     | Delivery deadline display                   | `orders.delivery_deadline` passed straight through to a date only formatter that splits the string, never constructs a `Date`                                                                                                                              |
| List and detail     | `Overdue` badge                             | Derived by comparing the stored `YYYY-MM-DD` string with `localToday()` (the viewer's calendar day from `getFullYear`, `getMonth`, `getDate`), and the status is in the existing `ORDER_ACTIVE_STATUSES` (`PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`) |
| Edit                | Delivery deadline changed field             | The stored date compared with the request value; a difference is an actual change named in the audit                                                                                                                                                       |
| Status change       | Actor display name                          | `users.name` captured into `changed_by_name` when the row is written                                                                                                                                                                                       |
| Any write           | Actor and tenant                            | `requestContext` filled by the auth middleware (`userId`, `businessId`)                                                                                                                                                                                    |
| Any write           | Timestamps                                  | Database `now()`, with `updatedAt` bumped on edit and status change                                                                                                                                                                                        |
| List                | Item count                                  | Derived line count of `order_items` per order                                                                                                                                                                                                              |
| List                | Next cursor                                 | Encoded `created_at` and `id` of the last row                                                                                                                                                                                                              |
| List                | Duplicate window                            | `orders.created_at` compared with the database clock and the 24 hour rule in this spec                                                                                                                                                                     |
| Detail and list     | Currency display                            | `businesses.currency` from spec 0004 through `/api/business/me`                                                                                                                                                                                            |
| Edit and status     | Version guard                               | `orders.version`                                                                                                                                                                                                                                           |

**Key invariants**:

- Every order and every line belongs to exactly one business, and every referenced customer, product, and variant belongs to that business.
- Every order has 1 to 50 distinct product and variant pairs, with quantity 1 to 1000 per line.
- `subtotal` equals the sum of line subtotals. `total` equals subtotal plus delivery fee minus discount. `dueAmount` equals total minus paid amount. No money value is negative.
- Every money input is at most 100,000,000, and every computed subtotal or total is at most 2,000,000,000.
- `paidAmount` is never written by this feature.
- `orderNumber` is unique per business and matches `ORD-` followed by at least four digits.
- `status` only moves along the table above, and every move appends one history row.
- Every line has a position, and detail reads order by position then creation time.
- History rows store the actor name when written and are never updated or deleted.
- `version` increments by exactly 1 on an actual edit or status change and does not move on a no op edit.
- `deliveryDeadline` is null or a real calendar date in `YYYY-MM-DD`; it has no time or timezone, and it is never derived from a customer, order, or courier value.
- The delivery deadline changes only through an edit while the order is `PENDING` or `CONFIRMED`, and an actual change follows the version and audit rules.
- The deadline never affects totals, duplicate detection, search, filtering, sorting, or the status workflow.
- The `Overdue` badge is derived from the stored deadline and the viewer's local today. It is never stored and never changes the order.
- The date only formatter and the `localToday()` helper compare `YYYY-MM-DD` strings and never construct a `Date`, and the badge reuses the existing `ORDER_ACTIVE_STATUSES` constant. The badge is computed at render, so it is never refreshed by a timer.
- Item name, variant label, and cost snapshots never change after creation. Unit price and quantity can change only through an edit that sends the line id. Customer snapshots change only when the order's customer changes.
- A create writes the counter, order, items, history, and audit row atomically. A status change writes the order and history atomically.

**Security model**:

- Every route is authenticated and tenant scoped. `OWNER` and `STAFF` have the same order permissions.
- The business id comes from the `x-business-id` header and is verified against the token memberships before the request context is set.
- Every repository method filters on `businessId`. Cross tenant ids return 404 rather than revealing that the row exists.
- Orders contain customer personal data (name, phone, address) already held by the customer feature. No card data or payment credentials enter this feature. There is no new regulated data class and no PCI scope.
- The existing global rate limiter applies. No new limiter is needed for these authenticated routes.
- The delivery deadline is ordinary order data and uses the same tenant scope and the same `OWNER` and `STAFF` permissions. No new permission or regulated data class is added.

**Configuration required**: none. No new environment variables or third party credentials. The date input is native, so no new dependency is added.

**Critical test scenarios**:

- Happy path: create an order with a customer, two products, one variant, delivery fee, and discount, then read it from the list and detail with the correct number, snapshots, totals, positions, and timeline, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-8**, **AC-18**.
- Duplicate path: create the same customer and item set twice within 24 hours, confirm the 409, then resend with confirmation and get a second order, verifies **AC-5**, **AC-15**.
- Idempotency: replay one key with the same and a changed payload, then race two creates on one key, verifies **AC-6**.
- Concurrency: send two creates that share a counter, two edits with the same version, and two status changes with the same version, verifies **AC-2**, **AC-9**, **AC-10**.
- Line identity: edit an existing line by `lineId` with and without a new price, reorder the lines, and edit a line whose variant was deleted from the catalog, verifies **AC-3**, **AC-9**, **AC-13**.
- Boundaries: exceed the money cap, merge past quantity 1000, send two prices for one pair, and send a discount above subtotal plus delivery, verifies **AC-4**, **AC-11**.
- Invalid state: edit a shipped order, send a move from `DELIVERED` to `PENDING`, and edit with a stale version, verifies **AC-9**, **AC-10**.
- Search: match a formatted phone by digits, search for a literal `%` and `_`, and replay a cursor with a different status set or search, verifies **AC-7**.
- Archived references: create with an archived customer or product, edit an order whose line was archived after creation, and read an order whose customer was archived, verifies **AC-13**.
- Auth and tenant: call every route with no token, no business header, a non member business, and another business's order id, verifies **AC-12**.
- Failure atomicity: force the audit insert to fail during create and edit, then confirm no counter bump, order, line, or history remains, verifies **AC-17**.
- Screen flow: create an order in the browser, search and filter it, move it through the full path, edit it in place, trigger the duplicate dialog, and reach the conflict message, verifies **AC-14**, **AC-15**, **AC-16**.
- Delivery deadline data path: create with a future date and read it from the full create response, list, and detail; create with a past date and confirm it saves; clear it on edit and confirm the audit names `deliveryDeadline`; set the same date and confirm a no op; send `2026-02-30` and `2026-13-01` and get 400; edit it on a `SHIPPED` order and get 409 `ORDER_LOCKED`, verifies **AC-1**, **AC-7**, **AC-8**, **AC-9**, **AC-11**, **AC-17**, **AC-19**.
- Delivery deadline display: enter a past date in the create and edit forms and confirm the warning is non blocking; read an order with no deadline and confirm the detail shows `Not set`; render the date and the `Overdue` badge for `PENDING`, `CONFIRMED`, `PROCESSING`, and `SHIPPED`, and no badge for `DELIVERED`, `CANCELLED`, and `RETURNED`; use dates around midnight in two browser timezones and reload after midnight to confirm the day and badge follow the viewer's local today, verifies **AC-14**, **AC-15**, **AC-16**, **AC-19**.

## Build plan

Tracer Bullet: stand up a thin create, list, and detail path through the database, API, and UI first, then thicken it with editing, the workflow, duplicate handling, and hardening.

1. [x] Add the migration for the confirmed model: order snapshots and version, order item variant reference, variant label, and position, `order_status_history` with the actor name, `business_order_counters`, both order list indexes, and the counter and snapshot backfills. Update the existing order seeds in the four test files that insert orders. Add the contract schemas, enums, DTOs, and error codes. Satisfies **AC-2**, **AC-3**, **AC-11**, **AC-17**.
2. [x] Build the thin create path: repository insert with the counter and snapshots, service validation including merged lines, conflicting prices, money caps, and totals, the initial history row, the audit row, and `POST /api/orders`. Satisfies **AC-1**, **AC-2**, **AC-4**, **AC-11**, **AC-17**.
3. [x] Build the first usable screen thread: `/orders` reading real rows (the first slice of **AC-14**), `/orders/new` creating a working order (the first slice of **AC-15**), and a minimal `/orders/[id]` landing page. Satisfies **AC-3**.
4. [x] Build detail and timeline: `GET /api/orders/:id` with items ordered by position, stored actor names, and history, then the full detail screen with totals and the timeline. Satisfies **AC-8**, **AC-16**, **AC-18**.
5. [x] Add list search, status filters, and cursor paging: the query path, line item count, digit only phone search, escaped wildcards, cursor binding, the chip bar, debounced search, and Load more. Satisfies **AC-7**, **AC-14**.
6. [x] Add edits and concurrency: `PATCH` with full item replacement, `lineId` matching, position, stored price and snapshot rules, the deleted variant case, version handling, no op behavior, the audit row, and edit in place on the detail screen. Satisfies **AC-3**, **AC-9**, **AC-13**, **AC-16**.
7. [x] Add the status workflow: `POST /api/orders/:id/status` with the transition table, the error precedence order, the stored actor name, history write, conflict handling, and the allowed action controls with the note dialog. Satisfies **AC-10**, **AC-16**, **AC-18**.
8. [x] Add duplicate and idempotency handling: the key replay before body checks, the two request key race, the best effort 24 hour duplicate query, the 409 body with the existing order, the confirm flag, and the duplicate dialog. Satisfies **AC-5**, **AC-6**, **AC-15**.
9. [x] Harden the feature: tenant and role coverage, archived reference cases, legacy row behavior, rollback tests, malformed ids and cursors, money boundary cases, empty and error states, keyboard access, and WCAG AA checks. Satisfies **AC-12**, **AC-13**, **AC-17**, **AC-14**, **AC-15**, **AC-16**.

The promised delivery date is a second thin path over the shipped feature:

10. [x] Add the nullable `delivery_deadline` date column in string mode, the migration with no backfill, and the `deliveryDeadline` field on the create, update, summary, and detail contracts, including the blank to null parse before the date check. Satisfies **AC-1**, **AC-7**, **AC-8**, **AC-9**, **AC-11**, **AC-19**.
11. [x] Build the thin deadline path: repository create and read, the field on the create form and detail screen, the date only formatter that splits the `YYYY-MM-DD` string and never constructs a date, the `localToday()` helper, the `Not set` state, and the past date warning. The form sends `''` when the field is empty on create and when the seller clears it on edit, and the contract owns the blank to null rule. Satisfies **AC-1**, **AC-8**, **AC-15**, **AC-16**, **AC-19**.
12. [x] Thicken it: `PATCH` set and clear behavior, the list field and `Overdue` badge from `ORDER_ACTIVE_STATUSES` with no timer, the edit form field with a clear control, the changed field audit, the edit lock, validation tests, and the timezone display test. Satisfies **AC-7**, **AC-9**, **AC-14**, **AC-16**, **AC-17**, **AC-19**.

## Consequences

**Positive**:

- One reliable order record carries the buyer, items, prices, and history, so later reports and invoices have a stable source.
- Snapshots protect history from catalog and customer edits.
- The strict status path and append only history make the timeline and later reports truthful.
- The duplicate warning prevents the most common phone and weak network mistake without blocking a real repeat sale.
- The feature ships independently of payments and inventory, so the seller workflow exists early.
- The seller can record the promise inside the order and see overdue active orders while working the list or detail, without a separate reminder tool.

**Negative / tradeoffs**:

- Paid amount is always 0 and due amount always equals total until feature 10, so the money view is incomplete.
- Stock is not reserved or deducted, so an order can oversell until feature 11.
- A strict path requires one step at a time, which can feel slow when a seller wants to jump from Pending to Delivered.
- The duplicate warning can appear for a legitimate repeat purchase within 24 hours, though the seller can confirm and continue.
- The duplicate check is best effort. Two requests with different keys sent at the same moment can both pass before either inserts. Reusing one key for every retry of a submit closes the common case, and the warning catches a later repeat.
- A reused Idempotency-Key returns the first order even when the payload differs. The client must generate a new key for each distinct submit.
- A variant deleted by a product edit leaves the line as a readable snapshot with no live variant, so it no longer matches a new catalog pair. The line can still be edited by `lineId`.
- Legacy orders with no customer show `Unknown customer` and an empty phone until they are cleaned up.
- The Active filter hides Delivered, so a seller uses All or the Delivered chip to find it.
- The deadline is locked once the order moves past `CONFIRMED`, so a promise that slips during processing or shipping cannot be corrected in this slice.
- Past deadlines are allowed, so the warning is advisory and a typo can still be saved if the seller ignores it.
- The `Overdue` badge uses the viewer's local today because the business has no timezone, so two viewers in different timezones can disagree near midnight.
- There is no filter, sort, or reminder for overdue orders, so the badge helps only while the seller is looking at the list or detail.
- Money inputs are capped at 100,000,000 and totals at 2,000,000,000, which is far above a small seller order but not unlimited.
- Order search uses contains matching without a trigram index, which is fine at MVP volume and will need an index when order counts grow.

**Neutral**:

- Adds two tables, three order line columns, and one nullable order date column, and changes the existing order seed data.
- The deadline adds one form field, one list display, one detail display, and one derived badge. It adds no table, endpoint, permission, configuration, or dependency.
- The order number counter is one row per business and serializes creates for that business.
- Every create and edit writes an audit row, and every status change writes a history row.
- The dashboard keeps its sample recent orders until feature 14.

## Follow-up

- [ ] Feature 10 must own `paidAmount` and `dueAmount` writes, and must decide how an edit or cancel behaves once a payment exists. It must also extend order creation to capture an optional first payment and its type, and decide how that first payment reaches the create contract, the order totals, and an idempotent replay.
- [ ] Feature 11 must reserve and deduct stock, and must decide the response when stock changes under an existing order.
- [ ] Feature 12 owns courier and tracking fields already present on the order. It should decide whether a delivery event can update or clear the promised deadline, or whether the deadline stays locked after `CONFIRMED`.
- [ ] Products should gain variant archiving (scope feature 21) so a retired variant keeps its identity and an order line keeps its reference.
- [ ] Clean up or keep the legacy `Unknown customer` rows once the old test data is no longer needed.
- [ ] If duplicate warnings prove noisy or a parallel race shows up in practice, serialize creates per customer.
- [ ] Add a trigram or prefix index for order search if measured volume makes the contains query slow.
- [ ] Revisit the fixed source list if sellers need their own channels; a per business list would replace it.
- [ ] The business has no timezone field, so screens show browser local time and the `Overdue` badge uses the viewer's local today. Add a business timezone when reports or the badge need a fixed day boundary.
- [ ] Add deadline reminders or notifications if sellers need them.
- [ ] Add a filter or sort by delivery deadline, with an index suited to it, when the order list needs it.
- [ ] Feature 14 replaces the dashboard sample orders with real recent orders and may surface the delivery deadline or an overdue count.

## Rationale

Reasoning, options, and context: see [rationale.md](rationale.md).
