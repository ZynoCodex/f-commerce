import { ValidationError } from './errors.js';

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
  imageUrl?: string;
}

/**
 * Validate the variant matrix per AC-4.
 * - options: 0 to 3, each name 1-30 chars (trimmed), unique case-insensitive
 * - each option: 1 to 20 values, each 1-30 chars (trimmed), unique case-insensitive
 * - variants: 0 to 50
 * - if options non-empty: variants must be exactly the full cross product
 * - each variant: combination has exactly one entry per option, values must be from declared values
 */
export function validateVariantMatrix(options: OptionShape[], variants: VariantShape[]): void {
  // Validate options count
  if (options.length > 3) {
    throw new ValidationError([], 'At most 3 options are allowed');
  }

  // Normalize and validate each option
  const normalizedOptions: { name: string; values: string[] }[] = [];
  const optionNamesLower: string[] = [];

  for (const opt of options) {
    const name = opt.name.trim();
    if (name.length < 1 || name.length > 30) {
      throw new ValidationError([], 'Option name must be between 1 and 30 characters');
    }
    if (optionNamesLower.includes(name.toLowerCase())) {
      throw new ValidationError([], 'Option names must be unique ignoring case');
    }
    optionNamesLower.push(name.toLowerCase());

    const rawValues = opt.values;
    if (!Array.isArray(rawValues) || rawValues.length < 1 || rawValues.length > 20) {
      throw new ValidationError([], 'Each option must have between 1 and 20 values');
    }

    const values: string[] = [];
    const valuesLower: string[] = [];
    for (const v of rawValues) {
      const val = v.trim();
      if (val.length < 1 || val.length > 30) {
        throw new ValidationError([], 'Option value must be between 1 and 30 characters');
      }
      if (valuesLower.includes(val.toLowerCase())) {
        throw new ValidationError(
          [],
          'Option values must be unique ignoring case within an option',
        );
      }
      valuesLower.push(val.toLowerCase());
      values.push(val);
    }

    normalizedOptions.push({ name, values });
  }

  // Validate variants count
  if (variants.length > 50) {
    throw new ValidationError([], 'At most 50 variants are allowed');
  }

  // If no options, variant product shouldn't have variants
  if (normalizedOptions.length === 0 && variants.length > 0) {
    throw new ValidationError([], 'Variants require at least one option');
  }

  // If no options and no variants — non-variant product, valid
  if (normalizedOptions.length === 0) {
    return;
  }

  // Compute expected cross product
  const expectedCombinations = buildCrossProduct(normalizedOptions);

  if (variants.length !== expectedCombinations.length) {
    throw new ValidationError([], 'Variants must be the full cross product of option values');
  }

  // Each variant must match exactly one expected combination
  const expectedSet = new Set<string>();
  for (const combo of expectedCombinations) {
    expectedSet.add(JSON.stringify(combo));
  }

  const seenCombos = new Set<string>();

  for (const variant of variants) {
    const combo = variant.combination;
    const optionNames = normalizedOptions.map((o) => o.name);

    // Check exactly one entry per option
    const comboKeys = Object.keys(combo);
    if (comboKeys.length !== optionNames.length) {
      throw new ValidationError([], 'Variant combination must have exactly one entry per option');
    }

    for (const optName of optionNames) {
      if (!(optName in combo)) {
        throw new ValidationError([], 'Variant combination is missing an option');
      }
    }

    // Check values are from declared values
    for (const opt of normalizedOptions) {
      const variantValue = combo[opt.name];
      if (variantValue === undefined) {
        throw new ValidationError([], 'Variant combination is missing an option');
      }
      if (!opt.values.some((v) => v.toLowerCase() === variantValue.toLowerCase())) {
        throw new ValidationError([], 'Variant combination uses a value not declared in options');
      }
    }

    // Check for duplicate combinations
    const comboKey = JSON.stringify(
      Object.fromEntries(Object.entries(combo).sort(([a], [b]) => a.localeCompare(b))),
    );
    if (seenCombos.has(comboKey)) {
      throw new ValidationError([], 'Duplicate variant combination');
    }
    seenCombos.add(comboKey);

    // Validate variant fields
    if (variant.price !== undefined && variant.price < 0) {
      throw new ValidationError([], 'Variant price must be at least 0');
    }
    if (variant.cost !== undefined && variant.cost < 0) {
      throw new ValidationError([], 'Variant cost must be at least 0');
    }
    if (variant.stockCount === undefined || variant.stockCount < 0) {
      throw new ValidationError([], 'Variant stockCount is required and must be at least 0');
    }
  }

  // Check all expected combinations are present
  for (const expectedCombo of expectedCombinations) {
    const expectedKey = JSON.stringify(
      Object.fromEntries(Object.entries(expectedCombo).sort(([a], [b]) => a.localeCompare(b))),
    );
    if (!seenCombos.has(expectedKey)) {
      throw new ValidationError([], 'Variant matrix is missing a combination');
    }
  }
}

/**
 * Build the full cross product of option values.
 * Each combination is a map from option name to chosen value.
 */
function buildCrossProduct(
  options: { name: string; values: string[] }[],
): Record<string, string>[] {
  if (options.length === 0) return [{}];

  const [first, ...rest] = options;
  const subCombos = buildCrossProduct(rest);
  const result: Record<string, string>[] = [];

  for (const value of first.values) {
    for (const sub of subCombos) {
      result.push({ [first.name]: value, ...sub });
    }
  }

  return result;
}
