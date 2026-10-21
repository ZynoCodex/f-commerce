# Verify: products and categories · spec 0006 · updated 2026-10-21

_Steps derived from spec 0006 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

> **Run 2026-10-21**: real backend on `:4000` and real frontend on `:3000`. 58 API checks, 5 Playwright flows, 22 product route tests, 291 backend tests, 87 frontend tests and 32 contract tests passed. The live database query confirmed the catalog tables and indexes, including both `text_pattern_ops` prefix indexes.

## UI / manual

- [x] Open `/products` in a business with no catalog → the Products heading, the "No products yet" empty state, and the Categories and Add product actions render → AC-1, AC-12
- [x] Open Categories, create `UI Shirts` and `UI Hats`, rename `UI Hats` to `UI Caps`, and close the sheet → the new names appear and the rename saves → AC-3, AC-12
- [x] Create a category with a product, try to delete it, and confirm the guard → the sheet says the category still has products and does not delete it → AC-12
- [x] Add a non variant product with name, price, category, lowercase sku, stock, threshold, description and one image → the list shows the trimmed name, uppercased sku, first image and in stock badge; detail shows the name, sku, category, stock status and image → AC-1, AC-2, AC-5, AC-6
- [x] Search `ui ox`, then `UI-OX`, then `ford` → the first two find the product by name prefix and sku prefix, and `ford` shows the no match state because search is prefix only → AC-7
- [x] Filter stock to out of stock and then in stock, clear it, archive a product, search it without and with Include archived → out of stock shows no match, in stock finds the product, and the archived product appears only with the toggle and carries the Archived badge → AC-6, AC-7
- [x] Add a variant product with Size `S, M` and Color `Red, Blue` → the builder shows 4 variants, each row takes its own sku and stock, and list and detail show all 4 combinations, low stock and summed available stock 10 → AC-4, AC-6
- [x] Edit the product name and save → the heading and list show the new name and the updated notice appears → AC-9
- [x] Remove the product image, then upload and remove an image for variant `S / Red` → the product shows no images, the variant image appears after upload and disappears after removal → AC-5
- [x] Archive the product, search the default list, then check Include archived and restore from detail → the product hides, then appears with the badge, and restore clears the archived state → AC-10
- [x] Archive again and delete the product permanently → the product leaves the list after the confirmation → AC-10, AC-11
- [x] Hold the archive request open past 10 seconds → the screen shows the timeout message, makes one archive request, reloads the product and shows the committed archived state → AC-15
- [x] Create a second product with an existing sku → the duplicate message names the existing product and the link opens it → AC-2
- [x] Add 21 products and page the list with Next and Previous → page 1 shows 20 rows and page 2 shows the remaining row, and Previous returns to page 1 → AC-8
- [x] Upload a text file renamed to png in the create form → the form rejects it before upload with the image type message → AC-5

## API / runtime

- [x] Create categories with valid, blank, duplicate, stale rename and empty delete inputs → trimming, absent blank description, 409 `DUPLICATE_CATEGORY`, 409 `CATEGORY_CHANGED`, 204, and `lower(name)` sort → AC-3, AC-12
- [x] Create a product with unknown category and invalid required fields, then a valid product with blank and null optional fields → 400 with the named fields, then trimmed and absent storage with version 1 → AC-1, AC-3
- [x] Create a product with 6 images, a non Cloudinary URL, invalid option and variant shapes, more than 50 variants and a missing variant stock → 400 with the right fields → AC-1, AC-4, AC-5
- [x] Create product and variant skus in different case, repeat them including against an archived product, and race two creates on one sku → 409 `DUPLICATE_SKU` with the existing id and archived flag, and one 201 plus one 409 for the race → AC-2
- [x] Create products with stock 0, 3 with threshold 5, 5 with threshold 5 and 10, and a variant product with mixed stock → out of stock, low stock, low stock, in stock, and the variant aggregate rules → AC-6
- [x] Search by name prefix, sku prefix, contains, whitespace and combined category, stock and archived filters → prefix matches, contains misses, whitespace lists by filters alone, and filters AND together → AC-7
- [x] Walk 25 rows with a cursor, request limit 500, use a malformed cursor, and reuse a cursor with a different q, size or filter → all rows once, 50 rows, 400 `VALIDATION_ERROR` with `fields: [cursor]`, and 400 on reuse → AC-8, AC-16
- [x] Edit with a changed payload, a no op payload, a stale version, cleared description and sku, null required fields, a duplicate sku and a shape switch → one version step, no version change on no op, `PRODUCT_CHANGED`, cleared fields, 400 on required fields, 409 `DUPLICATE_SKU`, and a valid shape switch → AC-1, AC-2, AC-4, AC-9
- [x] Edit an archived product with a stale version and archive an already archived product → `PRODUCT_ARCHIVED` before the version check in both cases → AC-9, AC-10
- [x] Archive, restore and delete with matching versions, then repeat archive on an archived product and restore on an active product → archived fields set and cleared, then `PRODUCT_ARCHIVED` and `PRODUCT_NOT_ARCHIVED` → AC-10
- [x] Delete a live product, an archived product referenced by an order, and an archived product never ordered → `PRODUCT_NOT_ARCHIVED`, `PRODUCT_IN_USE`, and 204 with variant rows cascaded → AC-11
- [x] Delete a category referenced by an archived product, then delete an empty category → `CATEGORY_IN_USE` with the count including archived, then 204 → AC-12
- [x] Send requests with no token, no `x-business-id`, a non member business, a bad token, malformed ids and another business's ids → 401, 400, 403, 401, 404 and 404, and the other business list stays empty → AC-13, AC-16
- [x] Sign in as STAFF and create, edit, archive, restore and delete → every action succeeds inside the business → AC-13
- [x] Read audit rows after archive, restore and delete, then make the audit insert fail during archive → one row per action with all fields, then 500 with the product unchanged and no row → AC-14
- [x] Upload a text file renamed to png, a file over 2 MB, a sixth product image, and valid png, jpg and webp files → 400 on the first three, Cloudinary secure URLs on the valid files, variant image preserve and clear, archived upload rejection, and removed assets still present in Cloudinary → AC-5
- [x] Inspect the backend and frontend logs after the run → seller text, product names and search terms are absent, and the deliberate audit failure logs ids and action only → AC-14, AC-16

## Commands

- [x] `npm run db:migrate --workspace @f-commerce/backend` → migrations apply cleanly and the live schema matches → AC-2, AC-7, AC-8, AC-12, AC-14
- [x] Query the live database for the catalog tables and indexes → `products`, `product_variants`, `categories` and `audit_logs` exist with the sku, name, category and archive indexes, including `products_business_lower_name_pattern_idx` and `products_business_sku_pattern_idx` → AC-2, AC-7, AC-8, AC-12, AC-14
- [x] `cd backend && npx vitest run src/presentation/controllers/product.controller.route.test.ts` → 22 tests pass, including the name prefix explain test → AC-7, AC-8
- [x] `npm run test --workspace @f-commerce/backend` → 291 tests pass across 19 files → AC-1 to AC-16 (regression gate)
- [x] `npm run test --workspace @f-commerce/frontend` → 87 tests pass across 11 files → AC-1, AC-15 (regression gate)
- [x] `npm run test --workspace @f-commerce/contracts` → 32 tests pass across 2 files → AC-1, AC-4, AC-9 (contract gate)

## Acceptance-criteria coverage

- AC-1 create fields, trimming, defaults and validation · covered by the create UI step, the valid and invalid create API steps and the backend suite
- AC-2 sku trimming, uniqueness, archived reservation and the concurrent race · covered by the create UI step, the duplicate UI step and the duplicate sku API step
- AC-3 category creation, trimming, duplicate names and unknown category ids · covered by the category UI step and the category and invalid create API steps
- AC-4 variant matrix, options, cross product, limits and summed stock · covered by the variant UI step, the invalid matrix API step and the shape switch edit step
- AC-5 image count, magic bytes, size limit, Cloudinary URLs, variant image preserve and clear, asset retention · covered by the image UI steps and the upload API step
- AC-6 derived stock status and threshold boundaries · covered by the filter and variant UI steps and the stock API step
- AC-7 prefix search, filters and include archived · covered by the search and filter UI steps and the search API step
- AC-8 cursor paging, default and maximum limit, cursor binding · covered by the paging UI step and the paging API step
- AC-9 edit, clearing, version, no op, stale and check order · covered by the edit UI step, the edit API steps and the archived edit step
- AC-10 archive, restore, hidden list and repeat guards · covered by the archive and restore UI steps and the archive API steps
- AC-11 hard delete guards and variant cascade · covered by the delete UI step and the delete API step
- AC-12 category list, rename, delete guard and count · covered by the category UI steps and the category API steps
- AC-13 tenant isolation and OWNER or STAFF access · covered by the auth API step and the STAFF API step
- AC-14 one audit row per transition and atomic rollback · covered by the audit API step, the rollback case and the log check
- AC-15 client timeout and reload reconciliation · covered by the timeout UI step
- AC-16 malformed ids, clamped limit, empty search and log privacy · covered by the auth and limit API steps and the log check
