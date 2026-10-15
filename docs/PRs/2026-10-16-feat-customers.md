# PR: feat(customers): add customer CRUD, search, archive, and order history

## What

Complete customer management feature including creation, editing, search, profile, order history, archive, and restore functionality. All 12 acceptance criteria from spec 0005 are implemented and verified.

## Why

Customers feature is Slice 1 core functionality that allows sellers to record buyers, track their order history and spend, and manage their records through archive/restore. This enables the core order management workflow.

## Changes

- **Backend API**: Customer CRUD endpoints with validation, version-based concurrency control, and tenant isolation
- **Phone Normalization**: Bengali digit support (০-৯ → 0-9), phone cleaning with country code validation
- **Search**: Name prefix search (case-insensitive collation), phone prefix matching, cursor-based pagination
- **Archive/Restore**: Soft delete with audit log entries in MongoDB transactions
- **Order History**: Links to customer profile, excludes cancelled/returned orders from spend totals
- **Frontend**: Customer list page with search, create form with duplicate detection, profile page with spend summary and order history

## How to test / verify

- Run tests: `npm run test --workspace @f-commerce/backend` (245 tests) and `npm run test --workspace @f-commerce/frontend` (55 tests)
- Run E2E: `npm run e2e --workspace @f-commerce/frontend` (18 tests)
- All acceptance criteria verified at runtime through dev servers

## Risk & rollout

Low risk, no migrations, no flags. The feature is wrapped in the existing tenant isolation middleware. Already tested with 245 backend tests and 18 E2E tests.

## Notes for reviewers

- All code follows Clean Architecture separation
- Mongoose `{ new: true }` option changed to `{ returnDocument: 'after' }` for API compatibility
- API returns structured error codes (`VALIDATION_ERROR`, `DUPLICATE_PHONE`, `CUSTOMER_CHANGED`) per the new customer contract
- 10-minute client timeout on archive/restore triggers automatic state reload