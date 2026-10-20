import type { ProductCreateRequest, ProductDto, ProductUpdateRequest } from '@f-commerce/contracts';

/** Shared limits mirrored from the contracts so the browser can fail fast. */
export const MAX_PRODUCT_IMAGES = 5;
export const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_VARIANTS = 50;
export const MAX_OPTIONS = 3;

export interface ProductFormState {
  name: string;
  categoryId: string;
  price: string;
  cost: string;
  sku: string;
  stockCount: string;
  lowStockThreshold: string;
  description: string;
}

export interface OptionDraft {
  name: string;
  valuesText: string;
}

export interface VariantDraft {
  combination: Record<string, string>;
  sku: string;
  price: string;
  cost: string;
  stockCount: string;
  imageUrl?: string | null;
  /** A file picked in the create form, uploaded after the product exists. */
  imageFile?: File | null;
}

export interface OptionDraftResult {
  options: { name: string; values: string[] }[];
  error: string | null;
}

export interface CombinationResult {
  combinations: Record<string, string>[];
  error: string | null;
}

export function emptyProductForm(categoryId = ''): ProductFormState {
  return {
    name: '',
    categoryId,
    price: '',
    cost: '',
    sku: '',
    stockCount: '0',
    lowStockThreshold: '5',
    description: '',
  };
}

export function emptyVariant(combination: Record<string, string>): VariantDraft {
  return {
    combination,
    sku: '',
    price: '',
    cost: '',
    stockCount: '0',
  };
}

/**
 * Turn the editable option rows into normalized option values. A completely
 * empty row is ignored while the seller is still adding options; a partially
 * filled row is an error.
 */
export function parseOptionRows(rows: OptionDraft[]): OptionDraftResult {
  const options: { name: string; values: string[] }[] = [];
  const optionNames = new Set<string>();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const name = row.name.trim();
    const values = row.valuesText
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value !== '');

    if (name === '' && values.length === 0) continue;

    if (name === '') {
      return { options: [], error: `Option ${index + 1} needs a name.` };
    }
    if (name.length > 30) {
      return { options: [], error: 'Option names must be 30 characters or fewer.' };
    }
    if (values.length === 0) {
      return { options: [], error: `Add at least one value for ${name}.` };
    }
    if (values.length > 20) {
      return { options: [], error: `${name} can have at most 20 values.` };
    }

    const nameKey = name.toLowerCase();
    if (optionNames.has(nameKey)) {
      return { options: [], error: 'Option names must be unique.' };
    }
    optionNames.add(nameKey);

    const valueKeys = new Set<string>();
    for (const value of values) {
      if (value.length > 30) {
        return { options: [], error: 'Option values must be 30 characters or fewer.' };
      }
      const valueKey = value.toLowerCase();
      if (valueKeys.has(valueKey)) {
        return {
          options: [],
          error: `Remove the duplicate “${value}” value from ${name}.`,
        };
      }
      valueKeys.add(valueKey);
    }

    options.push({ name, values });
  }

  if (options.length > MAX_OPTIONS) {
    return { options: [], error: `Use at most ${MAX_OPTIONS} options.` };
  }

  return { options, error: null };
}

/** Build the full cross product of the configured options. */
export function buildCombinations(rows: OptionDraft[]): CombinationResult {
  const parsed = parseOptionRows(rows);
  if (parsed.error !== null) {
    return { combinations: [], error: parsed.error };
  }
  if (parsed.options.length === 0) {
    return { combinations: [], error: null };
  }

  let combinations: Record<string, string>[] = [{}];
  for (const option of parsed.options) {
    const next: Record<string, string>[] = [];
    for (const combination of combinations) {
      for (const value of option.values) {
        next.push({ ...combination, [option.name]: value });
      }
    }
    combinations = next;
    if (combinations.length > MAX_VARIANTS) {
      return {
        combinations: [],
        error: `This option matrix creates more than ${MAX_VARIANTS} variants. Remove an option value.`,
      };
    }
  }

  return { combinations, error: null };
}

/** A stable key that ignores option and value casing. */
export function combinationKey(combination: Record<string, string>): string {
  return JSON.stringify(
    Object.entries(combination)
      .map(([name, value]) => [name.trim().toLowerCase(), value.trim().toLowerCase()])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

/**
 * Keep the values a seller already typed when the option matrix changes.
 * Existing rows are matched by a normalized combination, so reordering the
 * option rows or changing casing does not wipe the grid.
 */
export function reconcileVariants(
  combinations: Record<string, string>[],
  previous: VariantDraft[],
): VariantDraft[] {
  const existing = new Map(
    previous.map((variant) => [combinationKey(variant.combination), variant]),
  );

  return combinations.map((combination) => {
    const match = existing.get(combinationKey(combination));
    if (match) return { ...match, combination };
    return emptyVariant(combination);
  });
}

function numberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  return Number(trimmed);
}

function requiredNumber(value: string): number {
  const trimmed = value.trim();
  return trimmed === '' ? Number.NaN : Number(trimmed);
}

function variantRequestRows(rows: OptionDraft[], variants: VariantDraft[]) {
  const matrix = buildCombinations(rows);
  if (matrix.error !== null || matrix.combinations.length === 0) return [];

  return reconcileVariants(matrix.combinations, variants).map((variant) => ({
    combination: variant.combination,
    sku: variant.sku.trim() === '' ? undefined : variant.sku,
    price: numberOrUndefined(variant.price),
    cost: numberOrUndefined(variant.cost),
    stockCount: numberOrUndefined(variant.stockCount) ?? 0,
    imageUrl: variant.imageUrl ?? undefined,
  }));
}

/** Build the create payload. Zod validates and normalizes it before the API call. */
export function toCreateInput(
  form: ProductFormState,
  optionRows: OptionDraft[],
  variants: VariantDraft[],
): ProductCreateRequest {
  const parsedOptions = parseOptionRows(optionRows).options;
  const isVariant = parsedOptions.length > 0;

  return {
    name: form.name,
    description: form.description.trim() === '' ? undefined : form.description,
    categoryId: form.categoryId,
    sku: form.sku.trim() === '' ? undefined : form.sku,
    price: requiredNumber(form.price),
    cost: numberOrUndefined(form.cost),
    stockCount: isVariant ? 0 : (numberOrUndefined(form.stockCount) ?? 0),
    lowStockThreshold: numberOrUndefined(form.lowStockThreshold) ?? 5,
    images: [],
    options: parsedOptions,
    variants: isVariant ? variantRequestRows(optionRows, variants) : [],
  };
}

/** Build the edit payload, always carrying variant image URLs so edits keep them. */
export function toUpdateInput(
  form: ProductFormState,
  optionRows: OptionDraft[],
  variants: VariantDraft[],
  version: number,
): ProductUpdateRequest {
  const parsedOptions = parseOptionRows(optionRows).options;
  const isVariant = parsedOptions.length > 0;

  return {
    version,
    name: form.name,
    description: form.description,
    categoryId: form.categoryId,
    sku: form.sku,
    price: requiredNumber(form.price),
    cost: numberOrUndefined(form.cost),
    stockCount: isVariant ? undefined : (numberOrUndefined(form.stockCount) ?? 0),
    lowStockThreshold: numberOrUndefined(form.lowStockThreshold),
    options: parsedOptions,
    variants: isVariant ? variantRequestRows(optionRows, variants) : [],
  };
}

/** Populate the edit form from a product, including its variant image URLs. */
export function formFromProduct(product: ProductDto): {
  form: ProductFormState;
  options: OptionDraft[];
  variants: VariantDraft[];
} {
  return {
    form: {
      name: product.name,
      categoryId: product.categoryId,
      price: String(product.price),
      cost: product.cost === null ? '' : String(product.cost),
      sku: product.sku ?? '',
      stockCount: String(product.stockCount),
      lowStockThreshold: String(product.lowStockThreshold),
      description: product.description ?? '',
    },
    options: product.options.map((option) => ({
      name: option.name,
      valuesText: option.values.join(', '),
    })),
    variants: product.variants.map((variant) => ({
      combination: variant.combination,
      sku: variant.sku ?? '',
      price: variant.price === null ? '' : String(variant.price),
      cost: variant.cost === null ? '' : String(variant.cost),
      stockCount: String(variant.stockCount),
      imageUrl: variant.imageUrl,
    })),
  };
}

/**
 * Check an image's size and magic bytes. The server repeats this check; this
 * one exists so the seller gets useful feedback before an upload starts.
 */
export function validateImageSelection(bytes: Uint8Array, size: number): string | null {
  if (size <= 0) return 'Choose a non-empty image file.';
  if (size > MAX_PRODUCT_IMAGE_BYTES) return 'Each image must be 2 MB or smaller.';

  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (isJpeg) return null;

  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  if (isPng) return null;

  const isWebp =
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (isWebp) return null;

  return 'Choose a JPG, PNG, or WebP image.';
}

export async function validateImageFile(file: File): Promise<string | null> {
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
    return 'Each image must be 2 MB or smaller.';
  }
  if (file.size === 0) {
    return 'Choose a non-empty image file.';
  }

  const buffer = await file.arrayBuffer();
  return validateImageSelection(new Uint8Array(buffer), file.size);
}
