# PR: feat(products): add catalog, categories, variants, and images

## What

Adds the products and categories slice from spec 0006. Sellers can create categories, create and edit products with options and variants, upload product and variant images, search and filter the catalog, and archive, restore, or delete products. Stock status is derived from stock counts and low stock thresholds.

## Why

Implements `docs/specs/0006-products-categories-variants/index.md`, the catalog foundation that the orders and payments slices depend on. The slice enrolls products and categories in `docs/scope/scope.md` as the next product workflow step.

## Changes

- **Data and contracts**: add category and product DTOs and schemas, the normalized `product_variants` table, product and category repositories, and migration `0001_misty_tempest.sql` with collation independent prefix search indexes.
- **Product API**: create, read, list, search, edit, archive, restore, and hard delete with optimistic version checks, tenant scoping, audit rows, SKU uniqueness across products and variants, category validation, and cursor pagination.
- **Catalog rules**: validate the variant matrix as the full cross product, derive in stock, low stock, and out of stock from available stock, keep variant product stock at zero, and preserve variant ids and images when the matrix is edited.
- **Images**: upload product and variant images through a storage port backed by Cloudinary, validate image type and size, clean up failed uploads, and require Cloudinary HTTPS URLs. Removed and deleted Cloudinary assets follow the retention policy in AC-5.
- **Search**: match case insensitive name and SKU prefixes with `text_pattern_ops` lower bounds and an exact `LIKE` filter, so results do not depend on the host database collation. The query keeps a custom plan so the planner can derive the byte wise upper bound.
- **Categories**: create, list, rename, and delete categories in place, with duplicate name protection, usage counts, and `CATEGORY_CHANGED` conflict handling.
- **Frontend**: add the catalog list and product detail screens, product and variant forms, category manager, search and stock filters, image previews and upload, archive and restore actions, and a refetching Previous button.
- **API safety**: route unexpected 500 responses through a fixed body and log only the method and path, so driver messages and seller supplied search text stay out of client responses and application logs.

## How to test / verify

- Run `npm run test --workspace @f-commerce/contracts` and expect 32 passing tests.
- Run `npm run test --workspace @f-commerce/backend` and expect 290 passing tests with 1 skipped.
- Run `npm run test --workspace @f-commerce/frontend` and expect 87 passing tests.
- Run `npm run typecheck`, `npm run lint`, and `npm run format:check` from the repository root.
- Start both apps with `npm run dev`, sign in, create a category, create a product with two options and variant images, search by name and SKU, edit a variant, then archive, restore, and delete the product.
- Check that a second business cannot read or change the first business's categories or products.

## Risk & rollout

The migration adds two btree indexes to `products` with plain `CREATE INDEX`, which takes a write lock. The catalog is new for this slice, so the table should be empty when the migration runs. There is no backfill and no feature flag. Rolling back the code leaves the indexes in place, which is harmless. Cloudinary environment values are required for image uploads; products without images still work. Cloudinary assets are retained after an image is removed or a product is hard deleted, as documented in AC-5.

## Notes for reviewers

- The search uses a lower bound only. Deriving an upper bound from a code point is not safe under every collation, so `LIKE` remains the exact filter.
- Variant reconciliation parks retained SKUs and positions before one bulk update, and only rows whose final values change get a new `updatedAt`.
- The `variants` array is a full replacement for SKU values, so an omitted variant SKU clears it. An omitted `imageUrl` preserves the stored image because images are managed separately.
- The review verdict is approve with informational nits. The reviewed tree has 0 major and 0 minor findings.
