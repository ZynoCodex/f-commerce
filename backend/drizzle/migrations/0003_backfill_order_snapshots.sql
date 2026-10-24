-- Backfill the customer snapshots for rows created before this feature. Legacy
-- rows with no customer keep a readable placeholder, matching the spec.
UPDATE "orders" AS o
SET
  "customer_name_snapshot" = c."name",
  "customer_phone_snapshot" = c."phone"
FROM "customers" AS c
WHERE o."customer_id" = c."id"
  AND o."customer_name_snapshot" IS NULL;
--> statement-breakpoint
UPDATE "orders"
SET
  "customer_name_snapshot" = 'Unknown customer',
  "customer_phone_snapshot" = ''
WHERE "customer_name_snapshot" IS NULL;
--> statement-breakpoint
-- Seed each business counter from the highest existing ORD- number so the
-- first order after the migration never collides with an earlier row.
INSERT INTO "business_order_counters" ("business_id", "last_number", "updated_at")
SELECT
  b."id",
  COALESCE(
    MAX(
      CASE
        WHEN o."order_number" ~ '^ORD-[0-9]+$'
          THEN SUBSTRING(o."order_number" FROM 5)::integer
        ELSE 0
      END
    ),
    0
  ),
  now()
FROM "businesses" AS b
LEFT JOIN "orders" AS o ON o."business_id" = b."id"
GROUP BY b."id"
ON CONFLICT ("business_id") DO UPDATE
SET
  "last_number" = GREATEST("business_order_counters"."last_number", excluded."last_number"),
  "updated_at" = now();
