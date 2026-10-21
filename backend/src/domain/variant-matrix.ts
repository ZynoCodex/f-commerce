import { ValidationError } from './errors.js';
import { normalizeSku } from './product-sku.js';

export interface OptionShape {
  name: string;
  values: string[];
}

export interface VariantShape {
  combination: Record<string, string>;
  sku?: string;
  price?: number;
  cost?: number;
  stockCount: number;
  /** null clears a stored image; undefined preserves it. */
  imageUrl?: string | null;
}

export interface NormalizedVariantMatrix {
  options: OptionShape[];
  variants: VariantShape[];
}

const MAX_OPTIONS = 3;
const MAX_OPTION_NAME_LENGTH = 30;
const MAX_OPTION_VALUES = 20;
const MAX_OPTION_VALUE_LENGTH = 30;
const MAX_VARIANTS = 50;

/**
 * Validate and normalize the variant matrix per AC-4.
 * - options: 0 to 3, each name 1-30 chars (trimmed), unique case-insensitive
 * - each option: 1 to 20 values, each 1-30 chars (trimmed), unique case-insensitive
 * - variants: 0 to 50
 * - if options non-empty: variants must be exactly the full cross product
 * - each variant: combination has exactly one entry per option, values must be
 *   from declared values and are stored in the declared casing
 *
 * Returns the normalized options and variants so callers persist what was
 * validated. Variant order is preserved (it becomes the stored position).
 */
export function validateVariantMatrix(
  options: OptionShape[],
  variants: VariantShape[],
): NormalizedVariantMatrix {
  if (options.length > MAX_OPTIONS) {
    throw new ValidationError(['options'], `At most ${MAX_OPTIONS} options are allowed`);
  }

  const normalizedOptions: OptionShape[] = [];
  const optionNamesLower = new Set<string>();

  for (const opt of options) {
    const name = opt.name.trim();
    if (name.length < 1 || name.length > MAX_OPTION_NAME_LENGTH) {
      throw new ValidationError(
        ['options'],
        `Option name must be between 1 and ${MAX_OPTION_NAME_LENGTH} characters`,
      );
    }
    if (optionNamesLower.has(name.toLowerCase())) {
      throw new ValidationError(['options'], 'Option names must be unique ignoring case');
    }
    optionNamesLower.add(name.toLowerCase());

    if (
      !Array.isArray(opt.values) ||
      opt.values.length < 1 ||
      opt.values.length > MAX_OPTION_VALUES
    ) {
      throw new ValidationError(
        ['options'],
        `Each option must have between 1 and ${MAX_OPTION_VALUES} values`,
      );
    }

    const values: string[] = [];
    const valuesLower = new Set<string>();
    for (const rawValue of opt.values) {
      const value = rawValue.trim();
      if (value.length < 1 || value.length > MAX_OPTION_VALUE_LENGTH) {
        throw new ValidationError(
          ['options'],
          `Option value must be between 1 and ${MAX_OPTION_VALUE_LENGTH} characters`,
        );
      }
      if (valuesLower.has(value.toLowerCase())) {
        throw new ValidationError(
          ['options'],
          'Option values must be unique ignoring case within an option',
        );
      }
      valuesLower.add(value.toLowerCase());
      values.push(value);
    }

    normalizedOptions.push({ name, values });
  }

  if (variants.length > MAX_VARIANTS) {
    throw new ValidationError(['variants'], `At most ${MAX_VARIANTS} variants are allowed`);
  }

  if (normalizedOptions.length === 0) {
    if (variants.length > 0) {
      throw new ValidationError(['variants'], 'Variants require at least one option');
    }
    return { options: [], variants: [] };
  }

  const expectedCombinations = buildCrossProduct(normalizedOptions);
  if (variants.length !== expectedCombinations.length) {
    throw new ValidationError(
      ['variants'],
      'Variants must be the full cross product of option values',
    );
  }

  const expectedKeys = new Set(expectedCombinations.map(combinationKey));
  const seenCombinations = new Set<string>();
  const normalizedVariants: VariantShape[] = [];

  for (const variant of variants) {
    if (
      variant.combination === null ||
      typeof variant.combination !== 'object' ||
      Array.isArray(variant.combination)
    ) {
      throw new ValidationError(['variants'], 'Variant combination must be an object');
    }

    const rawKeys = Object.keys(variant.combination);
    if (rawKeys.length !== normalizedOptions.length) {
      throw new ValidationError(
        ['variants'],
        'Variant combination must have exactly one entry per option',
      );
    }

    const combination: Record<string, string> = {};
    for (const option of normalizedOptions) {
      const rawKey = rawKeys.find((key) => key.trim().toLowerCase() === option.name.toLowerCase());
      if (rawKey === undefined) {
        throw new ValidationError(['variants'], 'Variant combination is missing an option');
      }

      const rawValue = variant.combination[rawKey];
      if (typeof rawValue !== 'string') {
        throw new ValidationError(['variants'], 'Variant combination values must be text');
      }
      const value = option.values.find(
        (candidate) => candidate.toLowerCase() === rawValue.trim().toLowerCase(),
      );
      if (value === undefined) {
        throw new ValidationError(
          ['variants'],
          'Variant combination uses a value not declared in options',
        );
      }
      combination[option.name] = value;
    }

    const key = combinationKey(combination);
    if (!expectedKeys.has(key)) {
      throw new ValidationError(['variants'], 'Variant combination is not part of the matrix');
    }
    if (seenCombinations.has(key)) {
      throw new ValidationError(['variants'], 'Duplicate variant combination');
    }
    seenCombinations.add(key);

    if (variant.sku !== undefined && typeof variant.sku !== 'string') {
      throw new ValidationError(['variants'], 'Variant SKU must be text');
    }
    if (variant.price !== undefined && (!Number.isInteger(variant.price) || variant.price < 0)) {
      throw new ValidationError(['variants'], 'Variant price must be a whole number at least 0');
    }
    if (variant.cost !== undefined && (!Number.isInteger(variant.cost) || variant.cost < 0)) {
      throw new ValidationError(['variants'], 'Variant cost must be a whole number at least 0');
    }
    if (!Number.isInteger(variant.stockCount) || variant.stockCount < 0) {
      throw new ValidationError(
        ['variants'],
        'Variant stockCount is required and must be a whole number at least 0',
      );
    }

    const imageUrl =
      variant.imageUrl === null
        ? null
        : variant.imageUrl !== undefined && variant.imageUrl.trim() !== ''
          ? variant.imageUrl.trim()
          : undefined;
    normalizedVariants.push({
      combination,
      sku: normalizeSku(variant.sku),
      price: variant.price,
      cost: variant.cost,
      stockCount: variant.stockCount,
      imageUrl,
    });
  }

  if (seenCombinations.size !== expectedCombinations.length) {
    throw new ValidationError(['variants'], 'Variant matrix is missing a combination');
  }

  return { options: normalizedOptions, variants: normalizedVariants };
}

/**
 * Build the full cross product of option values in declared order.
 */
function buildCrossProduct(options: OptionShape[]): Record<string, string>[] {
  if (options.length === 0) return [{}];

  const [first, ...rest] = options;
  const subCombinations = buildCrossProduct(rest);
  const result: Record<string, string>[] = [];

  for (const value of first.values) {
    for (const sub of subCombinations) {
      result.push({ [first.name]: value, ...sub });
    }
  }

  return result;
}

/** Stable identity for a combination that ignores option and value casing. */
function combinationKey(combination: Record<string, string>): string {
  return JSON.stringify(
    Object.entries(combination)
      .map(([name, value]) => [name.toLowerCase(), value.toLowerCase()])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}
