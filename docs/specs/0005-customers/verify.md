# Verify: customers · spec 0005 · updated 2026-10-15

_Steps derived from spec 0005 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] Add a customer with name and a `+880` phone, then confirm they appear in the list and the notice reads that they were added → AC-1
- [ ] Search by name prefix (`Nusr`) and confirm the customer still appears; search `zzzznomatch` and confirm the "No customers match" empty state → AC-5
- [ ] Open the profile and confirm the phone renders as a `tel:` link whose href is the stored cleaned phone → AC-6
- [ ] Edit the name and save, confirm the heading shows the new name and the spend summary is still visible (an edit must not blank the totals) → AC-4, AC-6
- [ ] Archive the customer and confirm the Archived badge appears and the record drops out of search → AC-8
- [ ] Restore the archived customer and confirm they return to search → AC-9
- [ ] Create with a phone that already exists and confirm the duplicate block names the existing customer, links to their profile, and keeps the typed values → AC-3
- [ ] Repeat the duplicate create against an archived customer and confirm the screen says the existing record is archived and offers restore → AC-3
- [ ] Type a phone with Bengali digits (০-৯) and confirm it is accepted and stored as ASCII → AC-2
- [ ] Create with an empty name and confirm the Name field shows its error; create with a bad email and confirm the Email field shows its error → AC-1
- [ ] Open a customer with no orders and confirm the order history shows its own empty message → AC-7
- [ ] On mobile width, open the add customer form and confirm the Save button is reachable by scrolling inside the panel → AC-1

## Commands

- [ ] `npm run typecheck --workspace @f-commerce/backend && npm run typecheck --workspace @f-commerce/frontend` → both clean → AC-1 (build gate)
- [ ] `npm run test --workspace @f-commerce/backend` → 245 tests across 17 files pass, including the 19 repository integration tests → AC-4, AC-5, AC-7, AC-10
- [ ] `npm run test --workspace @f-commerce/frontend` → 55 tests across 7 files pass → AC-1 (build gate)
- [ ] `npm run e2e --workspace @f-commerce/frontend` → 18 tests pass (3 customer tests on desktop and mobile) → AC-1, AC-3, AC-4, AC-5, AC-6, AC-8
- [ ] `npm run lint --workspace @f-commerce/backend && npm run lint --workspace @f-commerce/frontend` → no errors → AC-1 (build gate)

## Acceptance-criteria coverage

- AC-1 create with trimmed fields and optional-field rules · covered by the create UI step, the empty-name and bad-email steps, and the typecheck and test commands
- AC-2 phone cleaning and Bengali normalization · covered by the Bengali digits step and `backend/src/domain/customer-phone.test.ts`
- AC-3 duplicate phone with existing id and archived flag · covered by the two duplicate UI steps and the concurrency tests in `customer.repository.integration.test.ts`
- AC-4 version guard, trimming, field clearing, no-op edit · covered by the edit UI step and the version guard tests in `customer.repository.integration.test.ts` and `customer.service.test.ts`
- AC-5 search by name and phone prefix, paging, cursors · covered by the search UI step, the empty state step, the cursor tests in `backend/src/domain/customer-cursor.test.ts`, and the search paging tests in `customer.repository.integration.test.ts`
- AC-6 profile fields, `tel:` link, spend summary in business currency · covered by the `tel:` step, the edit step, and the order history and spend tests in `customer.repository.integration.test.ts`
- AC-7 order history newest first, paging, cursors · covered by the no-orders empty state step and the order history tests in `customer.repository.integration.test.ts`
- AC-8 archive hides from search and blocks edits · covered by the archive step and the archive tests in `customer.repository.integration.test.ts`
- AC-9 restore clears archivedAt and returns to search · covered by the restore step and the restore tests in `customer.repository.integration.test.ts`
- AC-10 one audit entry per archive and restore, atomic with the state change · covered by the transaction rollback tests in `customer.repository.integration.test.ts`
- AC-11 role and tenant access · covered by the role and tenant tests in `customer.repository.integration.test.ts` and `customer.controller.route.test.ts`; not yet driven in the browser
- AC-12 legacy unassigned orders excluded, linked orders unchanged · covered by the legacy order test in `customer.repository.integration.test.ts`; not yet driven in the browser

## Not yet covered

- Client timeout recovery: covered by the e2e test `an archive that times out reloads the customer instead of assuming failure`, on desktop and mobile → AC-8
- `PHONE_IN_USE` restore branch: covered by `customer.service.test.ts`, which stubs the repository as the spec asks, because the unique index prevents the state in the database → AC-9
- Index plan: the explain assertions in `customer.repository.integration.test.ts` now run without any environment variable, because `mongo-replset.ts` finds the cached mongod itself → AC-5, AC-7
- At the route level, a concurrent create race is open: the concurrent archive race is covered in the repository tests, and two creates racing to claim one phone are only covered there too → AC-3
- Atlas index creation and the `version` backfill have not been run against a real target database.
