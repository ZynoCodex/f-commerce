# Historical Gap Analysis: Spec 0006 (Superseded)

**Date**: 2026-10-18
**Status**: Historical only. Do not use this file to plan or verify current work; see `0006-products-categories-variants.md` and `docs/scope/scope.md`.

This snapshot records what existed before the products/categories slice was built. It predates the MongoDB → PostgreSQL/Drizzle migration. Where it lists Mongoose models, the `tenantPlugin`, or `test-support/mongo-replset.ts` as existing patterns, read the equivalents in `backend/src/infrastructure/database/drizzle/` (schema, repositories) and `backend/src/test-support/pg-test-database.ts`. The "Not started" build table below is the pre-implementation state, not current status.

---

## ✅ Strong foundations already in place

| Area                          | What exists                                                                                | Location                                                        | Spec alignment                       |
| ----------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------ |
| **Clean Architecture layers** | domain, application, infrastructure, presentation all present                              | `backend/src/{domain,application,infrastructure,presentation}/` | Matches spec's layer rules           |
| **Tenant isolation**          | `tenantPlugin` Mongoose plugin auto-scopes all queries by businessId via AsyncLocalStorage | `BaseSchema.ts`                                                 | AC-13 covered                        |
| **Auth + role guard**         | `requireAuth` + `requireBusinessRole(['OWNER','STAFF'])`                                   | `auth.middleware.ts`                                            | AC-13 covered                        |
| **Optimistic concurrency**    | `optimisticConcurrency: true` in baseSchemaOptions + numeric `version` field on Customer   | `BaseSchema.ts`, `Customer.ts` model                            | AC-9 pattern established             |
| **Cursor paging**             | base64url JSON cursor encoding anchor + query + limit, validated on decode                 | `customer-cursor.ts`                                            | AC-8 pattern established             |
| **Transactions**              | `applyTransition` uses `session.withTransaction` for archive/restore + audit               | `customer.repository.ts`                                        | AC-14 pattern established            |
| **Duplicate key catch**       | `isDuplicateKeyError` + `duplicateFromIndex` lookup on 11000                               | `customer.service.ts`                                           | AC-2 / AC-9 pattern established      |
| **AuditLog model**            | has userId, action, entityType, entityId, businessId, 365-day TTL index                    | `AuditLog.ts` model                                             | AC-14 partially covered              |
| **Cloudinary service**        | uploads to `business-logos/` folder, returns secure_url                                    | `cloudinary.service.ts`                                         | Image upload infrastructure exists   |
| **Error type hierarchy**      | DomainError / ConflictError / NotFoundError / ValidationError                              | `domain/errors.ts`                                              | Error mapping established            |
| **Contracts package**         | Zod schemas shared between frontend/backend, e.g. customer DTOs                            | `packages/contracts/src/`                                       | AC DTO/contract pattern established  |
| **Server bootstrap**          | Express app with routes mounted, CORS, env validation via Zod                              | `server.ts`                                                     | Ready to add product/category routes |
| **Replica-set test support**  | `startReplSet()` / `resetDatabase()` for integration tests                                 | `test-support/mongo-replset.ts`                                 | AC-14 test infra exists              |
| **Frontend pages**            | `app/` with `pp/customers`, `pp/dashboard`, `pp/onboarding`, `pp/settings`                 | `frontend/src/app/`                                             | Ready for product pages              |

---

## ⚠️ Existing data model gaps

### `domain/entities/product.entity.ts` (domain interface)

- ❌ **Missing fields**: `archivedAt`, `version`, `images[]`, `options[]`, `variants[]`, `isArchived` (has it)
- ❌ Currently uses `imageUrl?: string` (singular), not an array
- ❌ No `description` field at all (spec wants optional text up to 1000 chars)
- ❌ `categoryId?: string` is optional here (spec wants it required)
- ❌ `cost?` exists but spec wants cost on both product and variant
- ❌ No `lowStockThreshold` (wait, it IS there)

### `infrastructure/database/mongoose/models/Product.ts` (Mongoose schema)

- ❌ **No `version` field** — `optimisticConcurrency` is on but no `version: { type: Number, default: 1 }`
- ❌ **No `archivedAt`** — only `isArchived: { default: false }`
- ❌ **No `images` array** — single `imageUrl?: string`
- ❌ **No `options` array** with `{ name, values[] }` shape
- ❌ **No `variants` array** with `{ combination, sku, price, cost, stockCount, imageUrl }` shape
- ❌ **No description field**
- ❌ **No price validation** (spec: `min: 0` — the schema has no min on price)
- ⚠️ Existing index `{ businessId: 1, sku: 1 }` partial unique — good for AC-2 product-sku path, but variant skus can't use it

### `domain/entities/product.entity.ts` vs spec

- Spec wants `description` up to **1000** characters; existing entity has none
- Spec wants `description` on Product up to 500 (data model sketch says 500, AC-1 says 1000 — discrepancy noted)
- Existing entity has `categoryId?: string` (optional) — spec requires it

### `domain/entities/order.entity.ts` — OrderItem

- ✅ Has `productId` — matches spec's note that order items keep `productId` at item level
- ❌ Does not snapshot `variantId` or variant SKU/price (spec says future order work may add this)

---

## ✅ Category model gaps

### `domain/entities/product.entity.ts` — Category interface

- ✅ Has `name`, `description?`, `parentId?`
- ⚠️ Spec wants `parentId` treated as absent (flat categories) — can keep field but ignore logic
- ❌ No `version` field (spec AC-12 wants version guard on rename)

### `infrastructure/database/mongoose/models/Product.ts` — CategorySchema

- ❌ **No unique index** on `{ businessId: 1, name: 1 }` with collation (spec AC-3 requires case-insensitive uniqueness)
- ❌ No `version` field on Category schema
- ✅ `tenantPlugin` is applied

---

## ✅ Domain helpers — do NOT exist yet

| Helper                                                         | Spec reference   | Current status                                                   |
| -------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------- |
| SKU normalize (trim + uppercase)                               | AC-2, AC-4, AC-9 | ❌ None exists                                                   |
| Stock status derive (inStock / lowStock / outOfStock)          | AC-6             | ❌ None exists                                                   |
| Variant matrix validation (cross-product, option counts, etc.) | AC-4             | ❌ None exists                                                   |
| Cursor encode/decode for products (with filter params)         | AC-8             | ❌ None exists (customer cursor exists but is customer-specific) |

---

## ✅ Contracts package — nothing for products yet

| File                               | Spec reference                       | Current status                                                                                                                 |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Product DTOs                       | AC-1, AC-6, AC-7, AC-8               | ❌ None — only `customer.ts` and `business.ts` and `auth.ts` exist                                                             |
| Category DTOs                      | AC-3                                 | ❌ None                                                                                                                        |
| New error codes                    | AC-1, AC-2, AC-3, AC-9, AC-10, AC-11 | ❌ None — only customer error codes exist in `CustomerErrorCode`                                                               |
| `VALIDATION_ERROR` with `fields[]` | AC-1, AC-3, AC-4, AC-5               | ⚠️ `ValidationError` domain class exists with `fields[]`, but no Zod contract schema defines `VALIDATION_ERROR` response shape |

---

## ✅ Server/routes — nothing wired

| Route                            | Spec               | Current status                                   |
| -------------------------------- | ------------------ | ------------------------------------------------ |
| `POST /api/categories`           | AC-3               | ❌ Not registered in `server.ts`                 |
| `GET /api/categories`            | AC-3               | ❌                                               |
| `PATCH /api/categories/:id`      | AC-12              | ❌                                               |
| `DELETE /api/categories/:id`     | AC-12              | ❌                                               |
| `/api/products` (all sub-routes) | AC-1 through AC-16 | ❌ None exist                                    |
| `server.ts` route mounting       | —                  | Only `auth`, `business`, `customers` are mounted |

---

## ✅ No product or category service/repository

- ❌ `backend/src/application/services/` has only `auth`, `business`, `customer` services
- ❌ `backend/src/domain/repositories/` has only `auth`, `business`, `customer` repository interfaces
- ❌ `backend/src/infrastructure/database/mongoose/repositories/` has only `auth`, `business`, `customer` repository implementations
- ❌ `backend/src/presentation/controllers/` has only `auth`, `business`, `customer` controllers

---

## ✅ Frontend — scaffolding exists but no product pages

- ✅ `frontend/src/app/` has `customers/`, `dashboard/`, `onboarding/`, `settings/` — pattern to follow
- ❌ No `pp/products/` or `pp/categories/` pages yet

---

## ✅ Build plan cross-check (spec section 239–251)

| Build step                                           | Status                                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Data model + migration + backfill**             | ⚫ Not started — Product schema needs version, archivedAt, images[], options[], variants[]; Category needs version + unique collation index |
| **2. DTOs + error codes + domain helpers**           | ⚫ Not started — contracts package, errors.ts, stock/variant/cursor helpers all need creating                                               |
| **3. Category use cases + routes**                   | ⚫ Not started                                                                                                                              |
| **4. Product create/get/list (thin thread)**         | ⚫ Not started                                                                                                                              |
| **5. Image upload endpoints**                        | ⚫ Partial — CloudinaryService exists but no magic-byte validation, no 2MB check, no product/variant image endpoints                        |
| **6. Product edit PATCH**                            | ⚫ Not started                                                                                                                              |
| **7. Archive/restore/hard-delete with transactions** | ⚫ Not started — customer pattern exists as template                                                                                        |
| **8. Tenant isolation + role guard verification**    | ⚠️ Guard exists (requireAuth + requireBusinessRole), but needs product-specific route wiring                                                |
| **9. Timeout/reload client behavior**                | ⚫ Not started — frontend concern                                                                                                           |
| **10. Frontend seller catalog screens**              | ⚫ Not started                                                                                                                              |
| **11. Frontend product detail**                      | ⚫ Not started                                                                                                                              |

---

## ✅ Cloudinary service gap

The existing `CloudinaryService.uploadImage()` uploads to a hardcoded `business-logos` folder. For products, you'll need:

- ✅ Folder separation (e.g. `products/{businessId}`)
- ❌ Magic byte validation (jpg/png/webp) — not present anywhere
- ❌ 2MB file size rejection — not present
- ❌ Multipart parsing middleware — need `express.raw()` or `multer` on routes

---

## ✅ Key discrepancy to flag

**Spec AC-1 vs data model sketch vs existing schema**:

- AC-1 says description max **1000** characters
- Data model sketch (line 114) says description max **500** characters
- Existing Customer entity uses 500 for optional text fields
- **Resolution**: Use 1000 per AC-1 (the acceptance criterion is authoritative). The `createOptionalText` pattern from customer contracts uses 500 — will need a 1000 variant for products.

---

## ✅ Existing patterns to follow (template for products)

The customer feature is the **exact template** for products:

1. **Domain entity** → `domain/entities/customer.entity.ts`
2. **Domain repository interface** → `domain/repositories/customer.repository.ts`
3. **Domain errors** → `domain/errors.ts` (Customer-specific errors)
4. **Domain helpers** → `domain/customer-phone.ts`, `domain/customer-cursor.ts`
5. **Infrastructure repository** → `infrastructure/database/mongoose/repositories/customer.repository.ts`
6. **Application service** → `application/services/customer.service.ts`
7. **Presentation controller + error mapping** → `presentation/controllers/customer.controller.ts`
8. **Contracts** → `packages/contracts/src/customer.ts`
9. **Integration tests** → `customer.controller.route.test.ts` + `customer.repository.integration.test.ts` + `customer.service.test.ts`
10. **Frontend pages** → `frontend/src/app/pp/customers/`

---

## ✅ Summary: What needs building

| Priority   | Component                                                                                                                                 | Effort |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **High**   | Product + Category Mongoose schemas (version, archivedAt, images[], options[], variants[], indexes)                                       | Medium |
| **High**   | Domain entities for Product + Category (extended shape)                                                                                   | Small  |
| **High**   | Error codes (DUPLICATE_SKU, DUPLICATE_CATEGORY, PRODUCT_CHANGED, PRODUCT_ARCHIVED, PRODUCT_NOT_ARCHIVED, PRODUCT_IN_USE, CATEGORY_IN_USE) | Small  |
| **High**   | Contracts DTOs (ProductCreateSchema, ProductUpdateSchema, CategoryCreateSchema, etc.)                                                     | Medium |
| **High**   | Domain helpers (normalizeSku, deriveProductStockStatus, validateVariantMatrix, product cursor)                                            | Medium |
| **High**   | Category service + routes + repository                                                                                                    | Medium |
| **High**   | Product service + routes (create, get, list, patch, archive, restore, delete, image upload) + repository                                  | Large  |
| **Medium** | Image upload with magic-byte validation                                                                                                   | Small  |
| **Medium** | Frontend product + category pages                                                                                                         | Large  |
| **Low**    | Backfill script for existing products (set version: 1)                                                                                    | Small  |

The codebase has a very clear, well-established pattern from the customer feature. The product feature is a significant step up in complexity (variant matrices, derived stock, transactions, image uploads), but every architectural piece needed already exists as a pattern to follow.
