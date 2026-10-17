# 0005 · Customer records: decision record

## Context

Sellers in this app take most orders from chat and social channels, and repeat buyers make up much of the revenue. Right now nothing ties a buyer to their earlier orders, so a seller cannot see who owes money or what a buyer is worth. Orders in row 9 need a customer to attach to, so this record has to exist first.

Phone numbers are how sellers reach buyers, and on these channels they are the closest thing to an identity key. The same number can be typed with or without a country code, or with spaces or punctuation, and two records for one buyer would split their history. Totals shown on a profile must come from the orders already recorded, so they cannot drift from the truth.

Customers sometimes stop buying or are entered by mistake. Hard deleting a customer who has orders would break order history, so the record needs a reversible way to leave everyday lists. Archive and restore change who can see and use a buyer's record, so they must leave a trail. Without this decision, row 9 has no customer contract and each seller invents their own record shape.

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

## Rationale

Order history is the reason this record exists, so Option 1 fails for exactly the buyers who matter most. Options 2 and 3 both keep history, but the date in Option 2 answers "when did this buyer stop" without a second store, which matters because archive changes who can use a record (Context). The audit entry records who did it, and the date records when the record's state changed.

Concurrency uses an explicit integer `version` instead of comparing `updatedAt`. `updatedAt` is a server timestamp that can repeat within one millisecond or drift between app instances, so two edits can look identical. A version number that the client echoes back gives an exact comparison on every instance. `BaseSchema` enables `optimisticConcurrency: true`, which makes `__v` participate in write filters and throw `VersionError` on stale `save()` calls. This spec uses its own `version` field so the client can echo it in the request body (Mongoose `__v` is not part of the API contract), and all Customer write paths must use `findOneAndUpdate` with the `version` filter rather than `doc.save()`. If any path does call `save()`, a `VersionError` must be caught and mapped to 409 `CUSTOMER_CHANGED`.

The unique phone index from spec 0002 already covers archived records, and it stays. An archived buyer's phone cannot be reused by accident, at the cost listed under Consequences.

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
