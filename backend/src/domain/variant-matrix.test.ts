import { describe, expect, it } from 'vitest';
import { ValidationError } from './errors.js';
import { validateVariantMatrix, type OptionShape, type VariantShape } from './variant-matrix.js';

function expectValidationError(run: () => unknown, field: string): void {
  try {
    run();
    expect.unreachable('Expected a ValidationError');
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fields).toContain(field);
  }
}

function variant(
  combination: Record<string, string>,
  stockCount = 0,
  extra: Partial<VariantShape> = {},
): VariantShape {
  return { combination, stockCount, ...extra };
}

describe('validateVariantMatrix', () => {
  it('accepts the full cross product and returns trimmed, declared values in option order', () => {
    const options: OptionShape[] = [
      { name: ' Size ', values: [' S ', 'M'] },
      { name: 'Color', values: ['White', 'Black'] },
    ];
    const variants = [
      variant({ Size: 'S', Color: 'White' }, 0, { sku: ' v-sw ' }),
      variant({ Size: 'S', Color: 'Black' }, 5),
      variant({ Size: 'M', Color: 'White' }, 1),
      variant({ Size: 'M', Color: 'Black' }, 0),
    ];

    const result = validateVariantMatrix(options, variants);

    expect(result.options).toEqual([
      { name: 'Size', values: ['S', 'M'] },
      { name: 'Color', values: ['White', 'Black'] },
    ]);
    expect(result.variants).toHaveLength(4);
    expect(Object.keys(result.variants[0].combination)).toEqual(['Size', 'Color']);
    expect(result.variants[0].sku).toBe('V-SW');
    expect(result.variants[2].stockCount).toBe(1);
  });

  it('matches option names and values ignoring case and stores the declared casing', () => {
    const result = validateVariantMatrix(
      [{ name: 'Size', values: ['Small', 'Large'] }],
      [variant({ size: ' small ' }, 2), variant({ SIZE: 'LARGE' }, 0)],
    );

    expect(result.variants.map((entry) => entry.combination)).toEqual([
      { Size: 'Small' },
      { Size: 'Large' },
    ]);
  });

  it('treats a blank variant sku as absent', () => {
    const result = validateVariantMatrix(
      [{ name: 'Size', values: ['One'] }],
      [variant({ Size: 'One' }, 0, { sku: '   ' })],
    );
    expect(result.variants[0].sku).toBeUndefined();
  });

  it('rejects a missing combination', () => {
    expectValidationError(
      () =>
        validateVariantMatrix([{ name: 'Size', values: ['S', 'M'] }], [variant({ Size: 'S' }, 0)]),
      'variants',
    );
  });

  it('rejects a duplicate combination', () => {
    expectValidationError(
      () =>
        validateVariantMatrix(
          [{ name: 'Size', values: ['S', 'M'] }],
          [variant({ Size: 'S' }, 0), variant({ Size: 'S' }, 1)],
        ),
      'variants',
    );
  });

  it('rejects variants when there are no options', () => {
    expectValidationError(() => validateVariantMatrix([], [variant({}, 1)]), 'variants');
  });

  it('rejects duplicate option names and values ignoring case', () => {
    expectValidationError(
      () =>
        validateVariantMatrix(
          [
            { name: 'Size', values: ['S'] },
            { name: ' size ', values: ['M'] },
          ],
          [variant({ Size: 'S', ' size ': 'M' }, 0)],
        ),
      'options',
    );

    expectValidationError(
      () => validateVariantMatrix([{ name: 'Size', values: ['S', ' s '] }], []),
      'options',
    );
  });

  it('rejects more than 50 variants', () => {
    const variants = Array.from({ length: 51 }, () => variant({ Size: 'S' }, 0));
    expectValidationError(
      () => validateVariantMatrix([{ name: 'Size', values: ['S'] }], variants),
      'variants',
    );
  });

  it('rejects invalid variant numbers and undeclared values', () => {
    expectValidationError(
      () => validateVariantMatrix([{ name: 'Size', values: ['S'] }], [variant({ Size: 'S' }, -1)]),
      'variants',
    );

    expectValidationError(
      () => validateVariantMatrix([{ name: 'Size', values: ['S'] }], [variant({ Size: 'XL' }, 0)]),
      'variants',
    );
  });

  it('returns an empty matrix for a non variant product', () => {
    expect(validateVariantMatrix([], [])).toEqual({ options: [], variants: [] });
  });
});
