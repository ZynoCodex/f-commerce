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
