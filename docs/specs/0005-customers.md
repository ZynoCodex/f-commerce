# 0005. Customer records with search, order history, and archive

**Date**: 2026-10-14
**Status**: Proposed

## Summary

Each buyer gets one customer record in the business, found by name or phone, and their profile shows their orders and total spend. Phone numbers must include the country code and can belong to only one customer in the business. Customers are archived instead of deleted, so their orders stay linked and they can come back later, and every archive and restore is written to an audit log.

## Context

Sellers in this app take most orders from chat and social channels, and repeat buyers make up much of the revenue. Right now nothing ties a buyer to their earlier orders, so a seller cannot see who owes money or what a buyer is worth. Orders in row 9 need a customer to attach to, so this record has to exist first.

Phone numbers are how sellers reach buyers, and on these channels they are the closest thing to an identity key. The same number can be typed with or without a country code, or with spaces or punctuation, and two records for one buyer would split their history. Totals shown on a profile must come from the orders already recorded, so they cannot drift from the truth.

Customers sometimes stop buying or are entered by mistake. Hard deleting a customer who has orders would break order history, so the record needs a reversible way to leave everyday lists. Archive and restore change who can see and use a buyer's record, so they must leave a trail. Without this decision, row 9 has no customer contract and each seller invents their own record shape.

## Requirements

**User stories**:

- As an owner or staff member, I want to add a buyer with a name and phone so that I can record who I sell to.
- As an owner or staff member, I want to edit a buyer's details so that they stay correct.
- As an owner or staff member, I want to search buyers by name or phone so that I find them quickly.
- As an owner or staff member, I want to open a buyer's profile with a tappable phone number, their orders, and their spend so that I can call them and see their history.
- As an owner or staff member, I want to archive a buyer I no longer serve and restore them later so that my lists stay clean without losing their orders.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: An owner or staff member can create a customer with name (1 to 120 characters after trimming) and phone required, and email (valid format), address (up to 500 characters), and notes (up to 500 characters) optional. Empty or invalid fields return 400 with `VALIDATION_ERROR` and `"fields"` naming the invalid fields. The response is 201 with the saved customer at version 1.
- **AC-2**: A phone must start with a plus sign followed by 8 to 15 digits. Spaces, dashes, and parentheses are removed before the check, and Bengali digits (০-৯) are normalized to ASCII digits. The stored value is the cleaned form. Any other phone returns 400 with `VALIDATION_ERROR` and `"fields": ["phone"]`, and nothing is saved.
- **AC-3**: Creating a customer whose cleaned phone already exists in the business returns 409 `DUPLICATE_PHONE` with the existing customer's id and whether that customer is archived. Nothing is saved. The form keeps the values the seller typed and links to the existing customer's profile. If the existing customer is archived, the screen says so and offers restore.
- **AC-4**: An edit saves only when the `version` sent matches the stored version. A match saves the change and raises `version` by exactly 1. A mismatch returns 409 `CUSTOMER_CHANGED` and changes nothing.
- **AC-5**: Search returns customers in the business that are not archived and whose name starts with the search text (ignoring case) or whose phone starts with the search text. The search query is cleaned using the same rules as AC-2 (spaces, dashes, parentheses removed; Bengali digits normalized). Results are sorted by name, then by `_id` as a tiebreaker, and paged at 20 per page with a maximum of 50. Cursor includes both `name` and `_id`. An empty result shows its own message.
- **AC-6**: The profile shows name, phone as a tappable `tel:` link, email, address, notes, and a spend summary (order count, total spent, total due) in the business currency. The summary counts only orders that are not cancelled or returned.
- **AC-7**: The order history lists the customer's orders newest first, showing order number, date, status, total (`total` field), and due amount (`dueAmount` field). It is paged at 20 per page with a maximum of 50. Cursor includes `createdAt` and `_id` as tiebreaker.
- **AC-8**: Archiving sets `archivedAt` and hides the customer from search. Their orders and profile stay reachable. An archived customer cannot be edited and returns 409 `CUSTOMER_ARCHIVED`.
- **AC-9**: Restoring clears `archivedAt` and returns the customer to search. If another live customer in the business holds the same phone, restore returns 409 `PHONE_IN_USE` with that customer's id and changes nothing.
- **AC-10**: Each archive and each restore writes one audit entry with the acting user, the action, the customer id, the business id, and the time.
- **AC-11**: Owners and staff can use every customer function. People outside the business get 403, and a customer id from another business returns 404, the same as an unknown id.

<!-- Every task in ## Build plan references the AC(s) it satisfies, and every scenario in
     Critical test scenarios maps to an AC. No AC without a build task; no build task without an AC. -->

## Options considered

### Option 1: Hard delete when no orders exist

A customer can be deleted only when they have no orders. The model is simple and nothing is hidden.

**Pros**:

- Simplest model, with no hidden records.

**Cons**:

- Most buyers have orders, so the rule blocks cleanup for most of the list.
- A mistaken delete cannot be undone.

### Option 2: Archive with an archivedAt date

A customer is hidden from everyday lists by setting a date. Orders stay linked, and restore clears the date.

**Pros**:

- Reversible, and order history survives.
- The date records when a buyer was archived, which gives the audit entry a time anchor.

**Cons**:

- An archived phone stays reserved in the business.
- Every list query has to filter on the date.

### Option 3: Boolean active flag

A true or false flag hides the customer. It is reversible like Option 2.

**Pros**:

- Simplest hidden state.

**Cons**:

- Records no time of change, so the audit trail rests on log entries alone.
- Same filtering burden as Option 2.

## Decision

**Chosen option**: Option 2: Archive with an archivedAt date

Customers are archived by setting an `archivedAt` date. Archiving hides them from search, keeps their orders, and restore reverses it.

## Rationale

Order history is the reason this record exists, so Option 1 fails for exactly the buyers who matter most. Options 2 and 3 both keep history, but the date in Option 2 answers "when did this buyer stop" without a second store, which matters because archive changes who can use a record (Context). The audit entry records who did it, and the date records when the record's state changed.

Concurrency uses an explicit integer `version` instead of comparing `updatedAt`. `updatedAt` is a server timestamp that can repeat within one millisecond or drift between app instances, so two edits can look identical. A version number that the client echoes back gives an exact comparison on every instance. `BaseSchema` enables `optimisticConcurrency: true`, which makes `__v` participate in write filters and throw `VersionError` on stale `save()` calls. This spec uses its own `version` field so the client can echo it in the request body (Mongoose `__v` is not part of the API contract), and all Customer write paths must use `findOneAndUpdate` with the `version` filter rather than `doc.save()`. If any path does call `save()`, a `VersionError` must be caught and mapped to 409 `CUSTOMER_CHANGED`.

The unique phone index from spec 0002 already covers archived records, and it stays. An archived buyer's phone cannot be reused by accident, at the cost listed under Consequences.

## Feature design

**Data model sketch**:

- `Customer` (collection `customers`, extends `TenantEntity`)
  - `businessId`: required, taken from request context
  - `name`: required, 1 to 120 characters after trimming
  - `phone`: required, cleaned form of `+` followed by 8 to 15 digits, unique per business (archived records included)
  - `email`: optional, valid email format
  - `address`: optional, up to 500 characters
  - `notes`: optional, up to 500 characters
  - `archivedAt`: optional date, empty when active
  - `version`: required integer, starts at 1
  - `createdAt`, `updatedAt`: from `BaseEntity`
  - Indexes: unique `{ businessId: 1, phone: 1 }` (existing); `{ businessId: 1, name: 1 }` with collation `{ locale: 'en', strength: 2 }` (new)
- `Order` (existing, `customerId` required): new index `{ businessId: 1, customerId: 1, createdAt: -1 }` for order history. It serves the customer lookup and the newest first sort in one index.
- `AuditLog` (existing collection `auditlogs`): extend the existing model with `businessId`, `userId` (existing field, not `actorUserId`), `action` (`CUSTOMER_ARCHIVED` or `CUSTOMER_RESTORED`), `entityType` (`CUSTOMER`), `entityId`, `createdAt`. Scoped to the business and write once: the application never updates or deletes entries. Add the index `{ businessId: 1, entityType: 1, entityId: 1, createdAt: -1 }` to the existing indexes. The existing TTL index retains entries for 365 days; customer archive and restore entries follow this retention policy.

**State transitions**:

- Active to Archived: archive request with the current version. Sets `archivedAt`, raises `version`, writes an audit entry.
- Archived to Active: restore request with the current version. Clears `archivedAt`, raises `version`, writes an audit entry.
- Edits are allowed only while Active. Neither transition changes orders.

**API surface**:

All bodies and errors use the shape `{ "error": "<CODE>", "message": "<plain message>" }`. This is a new convention: existing controllers use human sentences in `error`, not uppercase codes. The customer feature introduces codes like `VALIDATION_ERROR`, `DUPLICATE_PHONE`, and `CUSTOMER_CHANGED`. Validation errors (400) include a `fields` array naming the invalid fields. Existing controllers may be migrated to this shape in a follow-up, but both shapes coexist until then. Every route requires a bearer token, the `x-business-id` header, and the `OWNER` or `STAFF` role.

| Endpoint                    | Method | Key inputs                                                       | Key outputs                                        | Auth          | Key errors                                                                         |
| --------------------------- | ------ | ---------------------------------------------------------------- | -------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| /api/customers              | POST   | name (req), phone (req), email, address, notes                   | customer at version 1                              | bearer, role  | 400, 403, 409 DUPLICATE_PHONE                                                      |
| /api/customers              | GET    | q, limit (max 50), cursor                                        | items, nextCursor                                  | bearer, role  | 400, 403                                                                           |
| /api/customers/:id          | GET    | id                                                               | customer, orderCount, totalSpent, totalDue, currency | bearer, role | 400, 403, 404                                                                      |
| /api/customers/:id          | PATCH  | version (req), any editable field                                | customer at new version                            | bearer, role  | 400, 403, 404, 409 CUSTOMER_CHANGED, 409 CUSTOMER_ARCHIVED, 409 DUPLICATE_PHONE   |
| /api/customers/:id/orders   | GET    | limit (max 50), cursor                                           | items, nextCursor                                  | bearer, role  | 400, 403, 404                                                                      |
| /api/customers/:id/archive  | POST   | version (req)                                                    | customer with archivedAt set                       | bearer, role  | 400, 403, 404, 409 CUSTOMER_CHANGED, 409 CUSTOMER_ARCHIVED                         |
| /api/customers/:id/restore  | POST   | version (req)                                                    | customer with archivedAt cleared                   | bearer, role  | 400, 403, 404, 409 CUSTOMER_CHANGED, 409 CUSTOMER_NOT_ARCHIVED, 409 PHONE_IN_USE   |

**Value sourcing** (every value each action produces, computes, or displays names where it comes from):

| Action                  | Value produced / displayed                 | Source                                                                                              |
| ----------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Create, all            | businessId                                 | request context set by `requireBusinessRole`                                                        |
| Create, all            | name, phone, email, address, notes         | request body; phone cleaned by the `Customer` entity                                                |
| Create, all            | id, version, archivedAt, createdAt         | server: generated id, 1, empty, current time                                                        |
| Create, duplicate      | existingCustomerId, archived               | lookup by businessId and cleaned phone                                                              |
| Edit                   | version to compare                         | request body `version` against the stored `version`                                                 |
| Edit                   | new version                                | stored version plus 1, written in the same conditional update                                       |
| Search results         | name, phone, id                            | `customers` collection filtered to businessId and empty `archivedAt`                                |
| Profile                | orderCount, totalSpent, totalDue           | `orderCount` is the count of orders not cancelled or returned; `totalSpent` is the sum of `total` across those orders; `totalDue` is the sum of `dueAmount` across those orders |
| Profile                | currency                                   | business currency from spec 0004 (`Business` entity)                                                |
| Profile phone link     | `tel:` target                              | stored cleaned phone                                                                                |
| Order history          | orderNumber, createdAt, status, total, dueAmount | `orders` collection for this customer, sorted by createdAt descending                         |
| Date display           | local date and time                        | the seller's browser timezone; the API sends UTC ISO strings                                        |
| Archive, restore       | actorUserId                                | auth context from `requireBusinessRole`                                                             |
| Restore conflict       | liveCustomerId                             | lookup by businessId and phone, excluding this id (cannot match today, see Consequences)            |

**Key invariants**:

- One customer per cleaned phone per business, archived records included.
- Phone is stored as `+` followed by 8 to 15 digits, with no spaces or punctuation.
- Name is required after trimming.
- `version` rises by exactly 1 on each successful write. A write with a stale version changes nothing.
- Edit checks run in this order: business scope and existence (404), archived state (409 `CUSTOMER_ARCHIVED`), version (409 `CUSTOMER_CHANGED`), phone uniqueness (409 `DUPLICATE_PHONE`).
- Restore checks run in this order: business scope and existence (404), version (409 `CUSTOMER_CHANGED`), archived state (409 `CUSTOMER_NOT_ARCHIVED`), phone uniqueness (409 `PHONE_IN_USE`).
- Archive and restore write the customer change first, then the audit entry. If the audit write fails, the request returns 500 and the change stands. The client sees 500 and should not retry; the version has already advanced, so a retry with the same version would get `CUSTOMER_CHANGED`.
- Spend totals are computed at read time: `totalSpent` is the sum of `total` across orders not cancelled or returned; `totalDue` is the sum of `dueAmount` across the same orders.
- Every query filters on the business id from request context. A different business id returns 404.
- `limit` values above 50 are clamped to 50, not rejected.
- Malformed `:id` (non-ObjectId) returns 404, not 400, to avoid leaking whether an id exists.
- `GET /api/customers` with empty or missing `q` returns all non-archived customers in the business.
- Client requests time out after 10 seconds. There are no automatic retries. A double submit on create is safe, because the second submit hits the unique phone index and gets 409 `DUPLICATE_PHONE`.

**Security model**:

- Roles `OWNER` and `STAFF` can create, edit, search, view profiles and order history with totals, archive, and restore. Enforced by `requireBusinessRole(['OWNER', 'STAFF'])` on every customer route.
- Inferred: `STAFF` can see order history and totals. The seller confirmed `STAFF` sees totals, and spec 0003 gives `STAFF` read access to business data.
- Inferred: `STAFF` can see customer notes. Confirm under Follow-up.
- People outside the business get 403 from the membership check. Customer ids from another business return 404.
- Customer personal data (name, phone, email, address, notes) is not written to application logs. Audit entries store ids and the action, not personal fields.
- Audit entries are write once.

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements):

- Happy path: create a customer with a `+880` phone, find them by name prefix, edit with the current version, open the profile to see orders newest first and the spend summary, verifies **AC-1**, **AC-4**, **AC-5**, **AC-6**, **AC-7**
- Failure case: two edits sent with the same version. The second returns 409 `CUSTOMER_CHANGED`, and the stored record matches the first save, verifies **AC-4**
- Failure case: create with a phone that already exists returns 409 `DUPLICATE_PHONE` with the existing id, and no customer is saved. Create with an archived customer's phone returns the `archived` flag, verifies **AC-3**
- Failure case: phone without a country code returns 400 and nothing is saved. Phone with Bengali digits (০-৯) is normalized and accepted, verifies **AC-2**
- Failure case: empty name returns 400 with `"fields": ["name"]`. Invalid email returns 400 with `"fields": ["email"]`, verifies **AC-1**
- Failure case: archive, then edit returns 409 `CUSTOMER_ARCHIVED`. Restore with the current version succeeds, and both actions write audit entries, verifies **AC-8**, **AC-9**, **AC-10**
- Auth/permission: `STAFF` can create (201) and archive (200). A user outside the business gets 403. A customer id from another business returns 404, verifies **AC-11**
- Index check: the name search query uses the `{ businessId, name }` index, confirmed with an explain plan in the test suite, verifies **AC-5**
- Restore conflict: the `PHONE_IN_USE` branch is tested with a stubbed repository, because the unique index prevents the state from occurring in the database, verifies **AC-9**
- Empty state: search with no matches shows the empty message. Order history for a customer with no orders shows the empty message, verifies **AC-5**, **AC-7**
- Search: query with spaces or punctuation (e.g., `+880 17...`) is cleaned and matches the stored phone. Local number format (e.g., `01712345678` without country code) does not match, verifies **AC-5**
- Limit handling: `limit` above 50 is clamped to 50, not rejected, verifies **AC-5**, **AC-7**

## Build plan

1. Extend the existing `AuditLog` model: add the index `{ businessId, entityType, entityId, createdAt: -1 }` to support customer archive and restore queries. Acknowledge the existing 365-day TTL retention policy, satisfies **AC-10**
2. Add `archivedAt`, `version`, and the `{ businessId, name }` collation index to `Customer`. Update the domain `Customer` entity interface to include these fields. Add the `{ businessId, customerId, createdAt }` index to `Order`. Include a one time backfill that sets `version` to 1 on existing customers using `bypassTenantIsolation: true` or `runWithContext`, satisfies **AC-4**, **AC-5**, **AC-7**, **AC-8**
3. Add customer request and response DTOs and error codes to `packages/contracts`. Add the phone cleaning logic (strip spaces, dashes, parentheses; normalize Bengali digits to ASCII; require `+` and 8 to 15 digits) as a shared utility in `packages/contracts` or `backend/src/domain`, satisfies **AC-2**
4. Create use case: validate, check for a duplicate phone, save at version 1, return `DUPLICATE_PHONE` with the existing id and archived flag, satisfies **AC-1**, **AC-3**
5. Edit use case: check archived state, then version, then phone uniqueness. Save with the version raised by 1 in one conditional update, satisfies **AC-4**, **AC-8**
6. Search use case and `GET /api/customers` with the collation, cursor paging, and a maximum of 50, satisfies **AC-5**
7. Profile use case: read the customer and compute the spend summary from orders not cancelled or returned, satisfies **AC-6**
8. Order history use case and `GET /api/customers/:id/orders`, sorted newest first, satisfies **AC-7**
9. Archive and restore use cases: conditional version update, `PHONE_IN_USE` guard on restore, audit write after the update, satisfies **AC-8**, **AC-9**, **AC-10**
10. Wire every customer route to `requireBusinessRole(['OWNER', 'STAFF'])`. Confirm that another business's id returns 404 through the tenant plugin, satisfies **AC-11**
11. Frontend customers page: search, create form that shows the duplicate block with a link to the existing record, and edit form that sends `version`. Use the shared loading, empty, and error states from spec 0001 (frontend), with its own empty messages for search and history, satisfies **AC-1**, **AC-3**, **AC-4**, **AC-5**
12. Frontend profile: tappable phone, spend summary, order history, and archive and restore actions, satisfies **AC-6**, **AC-7**, **AC-8**, **AC-9**

## Consequences

**Positive**:

- Order history and totals always match recorded orders, because totals are computed on read.
- Stale edits cannot overwrite each other, and the rule is the same on every app instance.
- Archive is reversible, so a mistaken archive costs one click.
- Reuses the existing tenant plugin, role guard, and error shape, so no new patterns are needed.

**Negative / tradeoffs**:

- An archived buyer's phone stays reserved. A new buyer with that number must be handled by restoring the old record first.
- A duplicate phone blocks the create. A seller who enters a buyer twice must open the existing record and make any change there, which adds a step.
- Archive and restore are two writes (the change, then the audit entry). If the audit write fails, the change stands and the request returns 500. This is weak for an access change; a transaction would fix it when a replica set is in use.
- Restore's `PHONE_IN_USE` guard cannot trigger today, because the unique index already stops a second live record with the same phone. It stays as a guard in case archived phones are released.
- Name search matches prefixes only. Contains search needs a text index, which belongs to row 16.
- Spend summary is computed on each profile view. It is cheap at small business volume, but it grows with a buyer's order count, and there is no cache.

**Neutral**:

- Extends the existing `auditlogs` collection with a new index for customer archive and restore queries.
- Adds one new index to `orders` and one new index to `customers` (the name collation index; the phone index already exists), plus the `version` and `archivedAt` fields.
- One backfill for existing customer documents (`version` set to 1).

## Follow-up

- [ ] Owner decision: should archived customers release their phone? If yes, replace the unique phone index with a partial unique index on live records. Then the `PHONE_IN_USE` guard becomes reachable.
- [ ] Row 9 (orders) must reject new orders for archived customers.
- [ ] Put archive or restore and its audit entry in one transaction when the deployment runs a replica set.
- [ ] Row 16 (search and filters) adds contains match search with a text index.
- [ ] Confirm that `STAFF` can see customer notes (default in this spec: yes).

## References

**Project sources** (verifiable, in this repo):

- `AGENTS.md`: Clean Architecture layers, DTOs across boundaries, named exports, WCAG AA baseline
- Spec 0002 (data model): `Customer` collection, the lifetime value reporting query, and the open customer history query todo
- Spec 0003 (authentication and tenant isolation): `requireBusinessRole` and the `{ error, message }` response shape
- Spec 0004 (business profile and onboarding): business currency on the `Business` entity
- `backend/src/infrastructure/database/mongoose/models/Customer.ts`: existing unique phone index
- `backend/src/domain/entities/order.entity.ts`: order status values used by the spend summary

**Practices & standards**:

- Optimistic concurrency: a version number checked on every write
- Archive by date instead of hard delete when history must survive
- Derived totals computed at read time rather than stored
- Audit log for changes to who can use a record
- Cursor paging with a fixed maximum page size
- Unique index as the duplicate guard, so a double submit cannot create two records
- E.164 phone number format
