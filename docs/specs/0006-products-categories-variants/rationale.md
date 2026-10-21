# 0006 · Products and categories: decision record

> The build contract lives in [index.md](index.md). This record keeps the context, the options and the reasoning behind the normalized variants decision.

## Context

The shop sells through Facebook, WhatsApp and similar channels and needs a catalog that is quick to add to yet accurate enough for orders, inventory and profit. Today the data model sketches a Product and Category but the catalog has no product API or screens, so every order flow that needs a product is blocked. Row 8 in the scope asks for products and categories with images, SKU, stock tracking, thresholds and archive, done when a seller can add products with variants and see stock status.

Forces that shape the decision are small team and Tracer Bullet delivery, strict per business isolation that already exists for customers and business, Cloudinary for file storage already in the stack, and the need to keep the add flow fast while still supporting shops that sell the same item in several sizes or colors. A weak choice here leaks variants into a separate tangle, breaks SKU uniqueness, or forces a rewrite when inventory and orders start to rely on variant stock.

## Options considered

### Option 1: Single products table with variants in a jsonb array

One products table. The product row holds jsonb arrays for options and variants and a text array for images. All variant sku uniqueness is enforced in application code with a per business lookup plus a partial unique index on the product level sku. Reads for list, search and detail touch one table.

**Pros**:

- Fewest tables and simplest reads for the MVP
- The stored row shape matches the API array shape directly, with no mapping

**Cons**:

- Variant sku uniqueness cannot be a single index because the skus live inside a jsonb array, so a concurrent race is caught only in application code, which is weaker than the guarantee AC-2 promises
- Editing one variant rewrites the whole array, and variant rows cannot carry their own foreign keys for the order and inventory slices that follow

### Option 2: Separate product_variants table with a product reference

Products table for common fields, product_variants table where each variant is its own row with productId and businessId.

**Pros**:

- Each variant sku gets its own partial unique index on (business_id, sku), so AC-2 is enforced by the database under concurrency
- Variant level stock and sku prefix search are index friendly, and later order and inventory work can reference a variant by foreign key
- A product edit writes the product and its variants in one transaction

**Cons**:

- Product detail and list join two tables
- More rows to manage and keep in sync on edit, archive and delete

### Option 3: Product with a variant matrix plus Cloudinary image rows referenced by id

Keeps variants normalized but extracts images to a separate media table with metadata.

**Pros**:

- Image metadata and reuse are easier to audit

**Cons**:

- Adds a media domain before it proves needed, Cloudinary already stores metadata
- More indirection for the simplest image task which is show the first image

## Rationale

The scope wants variants in the first product slice, so the design must carry a matrix without inventing a second domain. Option 3 adds a media table that Cloudinary already covers. Option 1 is the least code, but its one real weakness is now the deciding factor: with variants inside a jsonb array, a concurrent race on a variant sku can only be caught by application code, while AC-2 promises per business uniqueness across products and variants. Option 2 turns that promise into a constraint the database enforces, keeps each variant addressable by id for the order and inventory slices that follow, and costs one join per read. The flat category choice and derived stock status keep the rules simple and reversible, and the archive plus guarded hard delete keeps order history safe while still allowing cleanup of never ordered items.
