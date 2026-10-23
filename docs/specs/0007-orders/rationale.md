# Rationale for 0007. Orders with a strict status workflow

## Context

The seller records sales taken through Facebook, WhatsApp, Instagram, and direct conversation. The order is the record of what was sold, to whom, at what price, and where it is in fulfillment. A seller usually does this on a phone, between messages, so the create flow must stay short and forgiving. A lost or wrong order quickly becomes a wrong delivery, a wrong profit figure, and an argument with a buyer.

The database already has `orders` and `order_items` from spec 0002, with customer and product foreign keys, price and cost snapshots, a source field, a paid amount, a due amount, and an idempotency key. There is no order service, route, contract, or screen yet. Customers archive rather than delete, products and variants archive and carry their own price and cost, and every business is isolated through the request context and explicit repository filters.

Payments (feature 10), inventory (feature 11), and delivery (feature 12) are planned but not built. Orders must therefore record totals now and leave the money and stock movements to those features later. The data model must not need reshaping when they arrive.

The failure this design guards against is historical drift: a product rename, a price change, or a customer edit silently rewriting what an old order says. The second failure is duplicate sales from a double tap or a flaky network on a phone.

## Options considered

### Option 1: Strict workflow with snapshots, append only history, and a visible duplicate guard (chosen)

Orders keep the buyer and item snapshots, move through a fixed seven state path, append one history row per change, and expose a separate status endpoint. Edits send each existing line's id so the line keeps its identity, stored name, label, and cost. Create accepts an Idempotency-Key and a duplicate warning with an explicit confirmation.

**Pros**:

- History, reports, and invoices read one stable record.
- Status rules are enforced in one place and cannot be bypassed by an edit payload.
- The duplicate guard matches how a seller thinks: show the similar sale and let them decide.

**Cons**:

- Two new tables, an audit write, and a stricter create contract add build work.
- Every status step must be taken in order.
- A legitimate repeat purchase inside 24 hours needs one confirmation tap.

### Option 2: Thin order record with the current status only

One table, no history table, no snapshots beyond the product name, and status changed through the general edit endpoint.

**Pros**:

- Smallest build and the fastest first release.
- Fewer screens and fewer tests.

**Cons**:

- The scope's status timeline outcome is lost.
- Later catalog edits rewrite what an old order shows.
- Reports cannot tell when a sale moved or who moved it.
- A general edit can change status and totals in one uncontrolled payload.

### Option 3: Configurable workflow engine per business

Each business defines its own statuses and allowed transitions, and orders follow that configuration.

**Pros**:

- Fits sellers with unusual fulfillment steps.
- No code change when a business adds a stage.

**Cons**:

- Needs a settings surface, validation, seeded defaults, and migration for every existing order.
- Reports and tests multiply across configurations.
- The MVP has no evidence that sellers need custom workflows, and the scope names one workflow.

## Rationale

Option 1 fits the forces. The order is a financial record in a relational database, so it should hold the buyer and price facts it was created with, plus an append only trail of what happened. Snapshots cost a few columns and remove a whole class of historical drift. Each line keeps its id through an edit, so a product or variant change cannot rewrite a stored name, label, or cost, and a price changes only when the seller sends a new one. The separate status endpoint keeps the transition table small enough to test exhaustively, and it stops an edit from moving a delivered order back to pending. The strict path is intentional: a seller can still move quickly, but the record never claims a step that did not happen.

Option 2 would ship sooner but fails the scope's timeline outcome and weakens later reports and invoices. Option 3 is the flexible answer to a problem the product does not have yet. A configurable engine would slow this slice and make every later report handle arbitrary status shapes. If sellers ask for custom stages later, the transition table is one module to replace, not the whole feature.

The duplicate decision combines two mechanisms for two different failures. An Idempotency-Key handles a network retry of the same submit without bothering the seller. A 24 hour duplicate check handles a seller who creates the same order again on purpose or by accident. A silent idempotency check alone would hide the second case, and a warning alone could race on two in flight retries. The confirm flag keeps the warning non blocking. The check is best effort because two parallel requests with different keys can both pass before either inserts. Reusing one key for every retry of a submit closes the common case, and a later repeat still sees the warning.

The order number uses a counter row per business inside the create transaction. It gives short readable numbers, no gaps from failed creates, and no scan of the orders table. The tradeoff is that creates for one business serialize on that row, which is acceptable for a small seller and far below any concern at this scale.

Version guarded writes match customers and products. A STAFF member and the owner can both work an order, so two open phones are a real case. A stale save must fail loudly rather than overwrite a newer status or total.

Money and stock stay out of this slice because features 10 and 11 own them. The order stores `paidAmount` 0 and `dueAmount` equal to `total`, and the payments feature will become the only writer of those fields. Inventory will add reservation and deduction around the status moves. Keeping the boundary now means neither later feature has to unwind an order implementation that already moved money or stock.

## Update 2026-10-23: promised delivery date

### Context

The seller often promises a delivery day in the same chat where the order is taken. Before this update the order had no field for that promise, so it lived only in the conversation and the seller had to remember which buyers were waiting. The seller needs to record the promised delivery date on the order and see when an active order has passed it, without a new reminder system or a change to the status workflow. The field is optional because not every sale carries a promise.

The existing order is a strict record with an edit lock once the order moves past `CONFIRMED`, version guarded writes, and an append only history. The update had to fit those rules rather than create a parallel edit path.

### Options considered

**Date only versus timestamp versus free text.** A calendar date in `YYYY-MM-DD` is the chosen shape. A promise is a day, not a moment, and a timestamp would invent a time the seller never gave. It would also invite a UTC shift that shows the wrong day to a viewer west of the server. Free text cannot be validated, compared, or shown consistently. The nullable PostgreSQL `date` column and the `z.iso.date()` contract check keep the value a real day with no time or timezone.

**Edit under the existing lock versus always editable versus a separate endpoint.** The chosen rule follows the existing lock: the deadline can change only while the order is `PENDING` or `CONFIRMED`. This keeps one edit path, one version guard, and one audit row. Always editable would let a promise change after the order record is otherwise closed, with no clear rule for the version or the audit. A separate endpoint for the date is more surface than one field needs, and it would split the edit contract.

**Derived Overdue badge versus a stored flag versus no badge.** The badge is derived in the browser. It costs no column, no scheduled write, and no status change, and it can never go stale. A stored flag would need a job or a write on every read to stay true, and it would need a fixed timezone to decide when the day rolls over. No badge would leave the promise useful only when the seller opens the order. The badge is a view of the stored date, not a new order state.

**Allow past dates with a warning versus reject past dates.** Past dates are allowed. A seller may record an order after the promised day, or record a promise the buyer already missed. A hard rule would block the truth and push the seller to invent a future date. The form warns so a typo is visible, but the save is not blocked.

**Viewer local today versus a server day versus a business timezone now.** The badge compares the stored date with the viewer's local today, the calendar date in the browser's timezone. The stored value is not converted. A server day would use the server's timezone, which has no relationship to the seller. A business timezone is the right long term answer when reports or two viewers need one fixed day boundary, but the business profile has no timezone field today and adding one is a separate change. The limitation is recorded as a follow up.

**Field name `deliveryDeadline` versus `promisedDeliveryDate` versus `dueDate`.** The user asked for a promised delivery date. `deliveryDeadline` is the chosen stored and wire name: it matches the seller's word for the promise and the `Delivery deadline` UI label. `promisedDeliveryDate` is the most faithful name for the requirement, but it is longer and would rename the field, the column, and the contract after the decision was written. `dueDate` is short but reads like money owed, and the order already has `dueAmount`. The chosen name keeps the deadline distinct from the money due, and the promised delivery date stays the plain words every screen uses.

**Column mode string versus Date on `delivery_deadline`.** The Drizzle column uses string mode, so the driver hands back `YYYY-MM-DD` with no JavaScript `Date` in the path. Date mode would build a `Date` at the server's local midnight, and any later `toISOString` or `new Date` on it could shift the day before the client ever sees it. String mode makes the no shift rule structural rather than a discipline the build must remember.

### Rationale

The update is deliberately small. It adds one nullable date to the order, one field on create and edit, one date and one badge on list and detail, and no new table, endpoint, permission, configuration, dependency, filter, sort, reminder, or index. The promised delivery date is a promise about the order, so it belongs on the order and follows the order's edit rules. It is not a courier event, a payment date, or a status. Keeping it out of totals, duplicate detection, search, and the status workflow means the existing order contract does not move.

The date only choice is the important one. A promise is spoken as a day. Storing a timestamp would force a time and a timezone the seller never gave, and the same stored value would render as a different day for different viewers. A `date` column, string mode on the driver, and a date only formatter keep the day stable everywhere. The cost is that the system cannot rank promises within a day, which the product does not need.

The Overdue badge is a view, not a record. It is computed from the stored date and the viewer's local today, so it changes with the calendar without a write. It appears only for `PENDING`, `CONFIRMED`, `PROCESSING`, and `SHIPPED`, because a delivered, cancelled, or returned order no longer needs a delivery follow up. The day itself is not overdue. A deadline of today gives the seller the rest of the day.

The edit lock is a deliberate tradeoff. A promise can slip after the order moves to `PROCESSING` or `SHIPPED`, and this slice cannot record that change. The alternative is a separate date edit path, which would weaken, for one field, the rule that the order is locked once fulfillment starts. The cleaner follow up is to let feature 12, which owns delivery, decide how a courier event and a changed promise interact. Until then, the seller can record the promise while the order is `PENDING` or `CONFIRMED`, which covers the moment the promise is usually made.

Past dates are allowed because the record should match what happened. A warning is enough for the common typo, and a hard block would make a late recorded order impossible to represent honestly.

The remaining limits are intentional. No filter means the seller cannot isolate overdue orders, but the Active list already shows the active queue and the badge marks the late ones. No reminder means the seller is not notified, but the badge is visible when the list is open. No index is needed because no query filters or sorts by the deadline. Each of these is a follow up with evidence, not a guess.
