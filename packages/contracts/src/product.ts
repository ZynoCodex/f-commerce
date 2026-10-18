import { z } from 'zod';

// Re-declare StockStatus enum in contracts for frontend use without importing backend
export const ProductStockStatus = {
  IN_STOCK: 'inStock',
  LOW_STOCK: 'lowStock',
  OUT_OF_STOCK: 'outOfStock',
} as const;
export type ProductStockStatus = (typeof ProductStockStatus)[keyof typeof ProductStockStatus];

/** Action codes recorded when a product's state changes. */
export const ProductAuditAction = {
  ARCHIVED: 'PRODUCT_ARCHIVED',
  RESTORED: 'PRODUCT_RESTORED',
  DELETED: 'PRODUCT_DELETED',
} as const;

/** Error codes returned by the product endpoints. */
export const ProductErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DUPLICATE_SKU: 'DUPLICATE_SKU',
  PRODUCT_CHANGED: 'PRODUCT_CHANGED',
  PRODUCT_ARCHIVED: 'PRODUCT_ARCHIVED',
  PRODUCT_NOT_ARCHIVED: 'PRODUCT_NOT_ARCHIVED',
  PRODUCT_IN_USE: 'PRODUCT_IN_USE',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
} as const;

export const CategoryErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DUPLICATE_CATEGORY: 'DUPLICATE_CATEGORY',
  CATEGORY_CHANGED: 'CATEGORY_CHANGED',
  CATEGORY_IN_USE: 'CATEGORY_IN_USE',
} as const;

export type ProductErrorCodeType = (typeof ProductErrorCode)[keyof typeof ProductErrorCode];
export type CategoryErrorCodeType = (typeof CategoryErrorCode)[keyof typeof CategoryErrorCode];

// --- Helper transforms ---

const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_CATEGORY_NAME_LENGTH = 80;
const MAX_CATEGORY_DESCRIPTION_LENGTH = 500;
const MAX_OPTION_NAME_LENGTH = 30;
const MAX_OPTION_VALUE_LENGTH = 30;
const MAX_VALUES_PER_OPTION = 20;
const MAX_OPTIONS = 3;
const MAX_VARIANTS = 50;
const MAX_IMAGES = 5;

/** Optional text: trim, treat blank as absent. */
function optionalTextSchema(max: number) {
  return z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => {
      if (value === null || value === undefined) return undefined;
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    });
}

// --- Category DTOs ---

export const CategoryCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(MAX_CATEGORY_NAME_LENGTH, `Name must be ${MAX_CATEGORY_NAME_LENGTH} characters or fewer`),
  description: optionalTextSchema(MAX_CATEGORY_DESCRIPTION_LENGTH),
});

export const CategoryUpdateSchema = z.object({
  version: z.number().int().min(1),
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(MAX_CATEGORY_NAME_LENGTH, `Name must be ${MAX_CATEGORY_NAME_LENGTH} characters or fewer`)
    .optional(),
  description: optionalTextSchema(MAX_CATEGORY_DESCRIPTION_LENGTH),
});

export const CategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CategoryListSchema = z.array(CategorySchema);

export const DuplicateCategoryErrorSchema = z.object({
  error: z.literal(CategoryErrorCode.DUPLICATE_CATEGORY),
  message: z.string(),
  existingCategoryId: z.string(),
});

export type CategoryCreateRequest = z.infer<typeof CategoryCreateSchema>;
export type CategoryUpdateRequest = z.infer<typeof CategoryUpdateSchema>;
export type CategoryDto = z.infer<typeof CategorySchema>;
export type DuplicateCategoryError = z.infer<typeof DuplicateCategoryErrorSchema>;

// --- Product DTOs ---

const VariantSchema = z.object({
  combination: z.record(z.string(), z.string()),
  sku: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? v.trim().toUpperCase() : undefined)),
  price: z.number().min(0).optional(),
  cost: z.number().min(0).optional(),
  stockCount: z.number().int().min(0),
  imageUrl: z.string().optional(),
});

const OptionSchema = z.object({
  name: z.string().trim().min(1).max(MAX_OPTION_NAME_LENGTH),
  values: z
    .array(z.string().trim().min(1).max(MAX_OPTION_VALUE_LENGTH))
    .min(1, `Each option must have at least 1 value`)
    .max(MAX_VALUES_PER_OPTION, `Each option may have at most ${MAX_VALUES_PER_OPTION} values`),
});

export const ProductCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or fewer`),
  description: optionalTextSchema(MAX_DESCRIPTION_LENGTH),
  categoryId: z.string().min(1, 'Category is required'),
  sku: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? v.trim().toUpperCase() : undefined)),
  price: z.number().min(0, 'Price must be at least 0'),
  cost: z.number().min(0).optional(),
  stockCount: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
  images: z.array(z.string()).max(MAX_IMAGES, `At most ${MAX_IMAGES} images are allowed`),
  options: z.array(OptionSchema).max(MAX_OPTIONS, `At most ${MAX_OPTIONS} options are allowed`),
  variants: z
    .array(VariantSchema)
    .max(MAX_VARIANTS, `At most ${MAX_VARIANTS} variants are allowed`),
});

export const ProductUpdateSchema = z.object({
  version: z.number().int().min(1),
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
  description: optionalTextSchema(MAX_DESCRIPTION_LENGTH),
  categoryId: z.string().min(1).optional(),
  sku: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? v.trim().toUpperCase() : undefined)),
  price: z.number().min(0).optional(),
  cost: z.number().min(0).optional(),
  stockCount: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  images: z.array(z.string()).max(MAX_IMAGES).optional(),
  options: z.array(OptionSchema).max(MAX_OPTIONS).optional(),
  variants: z.array(VariantSchema).max(MAX_VARIANTS).optional(),
});

export const VariantDtoSchema = z.object({
  combination: z.record(z.string(), z.string()),
  sku: z.string().nullable(),
  price: z.number().nullable(),
  cost: z.number().nullable(),
  stockCount: z.number().int(),
  imageUrl: z.string().nullable(),
  stockStatus: z.enum(['inStock', 'lowStock', 'outOfStock']),
});

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  categoryId: z.string(),
  categoryName: z.string().nullable(),
  sku: z.string().nullable(),
  price: z.number(),
  cost: z.number().nullable(),
  stockCount: z.number().int(),
  lowStockThreshold: z.number().int(),
  availableStock: z.number().int(),
  stockStatus: z.enum(['inStock', 'lowStock', 'outOfStock']),
  images: z.array(z.string()),
  options: z.array(
    z.object({
      name: z.string(),
      values: z.array(z.string()),
    }),
  ),
  variants: z.array(VariantDtoSchema),
  isArchived: z.boolean(),
  archivedAt: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ProductPageSchema = z.object({
  items: z.array(ProductSchema),
  nextCursor: z.string().nullable(),
});

export const DuplicateSkuErrorSchema = z.object({
  error: z.literal(ProductErrorCode.DUPLICATE_SKU),
  message: z.string(),
  existingProductId: z.string(),
  existingVariantId: z.string().nullable(),
  archived: z.boolean(),
});

export const CategoryNotFoundErrorSchema = z.object({
  error: z.literal(ProductErrorCode.CATEGORY_NOT_FOUND),
  message: z.string(),
  fields: z.array(z.string()),
});

export type ProductCreateRequest = z.infer<typeof ProductCreateSchema>;
export type ProductUpdateRequest = z.infer<typeof ProductUpdateSchema>;
export type ProductDto = z.infer<typeof ProductSchema>;
export type ProductPageDto = z.infer<typeof ProductPageSchema>;
export type VariantDto = z.infer<typeof VariantDtoSchema>;
export type ProductAuditActionType = (typeof ProductAuditAction)[keyof typeof ProductAuditAction];
export type DuplicateSkuError = z.infer<typeof DuplicateSkuErrorSchema>;
export type CategoryNotFoundErrorDto = z.infer<typeof CategoryNotFoundErrorSchema>;
