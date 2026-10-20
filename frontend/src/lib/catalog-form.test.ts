import { describe, expect, it } from 'vitest';
import type { ProductDto } from '@f-commerce/contracts';
import {
  MAX_PRODUCT_IMAGE_BYTES,
  buildCombinations,
  combinationKey,
  emptyProductForm,
  formFromProduct,
  reconcileVariants,
  toCreateInput,
  toUpdateInput,
  validateImageSelection,
  type VariantDraft,
} from './catalog-form';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

const product: ProductDto = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Tee',
  description: 'Soft cotton',
  categoryId: '22222222-2222-4222-8222-222222222222',
  categoryName: 'Tops',
  sku: 'TEE-1',
  price: 500,
  cost: null,
  stockCount: 0,
  lowStockThreshold: 5,
  availableStock: 3,
  stockStatus: 'lowStock',
  images: ['https://res.cloudinary.com/demo/image/upload/tee.png'],
  options: [{ name: 'Size', values: ['S', 'M'] }],
  variants: [
    {
      combination: { Size: 'S' },
      sku: 'TEE-S',
      price: null,
      cost: null,
      stockCount: 3,
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/tee-s.png',
      stockStatus: 'lowStock',
    },
    {
      combination: { Size: 'M' },
      sku: null,
      price: 600,
      cost: 300,
      stockCount: 0,
      imageUrl: null,
      stockStatus: 'outOfStock',
    },
  ],
  isArchived: false,
  archivedAt: null,
  version: 4,
  createdAt: '2026-10-18T10:00:00.000Z',
  updatedAt: '2026-10-18T10:00:00.000Z',
};

describe('buildCombinations', () => {
  it('builds the full cross product in option order', () => {
    const result = buildCombinations([
      { name: 'Size', valuesText: ' S, M ' },
      { name: 'Color', valuesText: 'Red,Blue' },
    ]);

    expect(result.error).toBeNull();
    expect(result.combinations).toEqual([
      { Size: 'S', Color: 'Red' },
      { Size: 'S', Color: 'Blue' },
      { Size: 'M', Color: 'Red' },
      { Size: 'M', Color: 'Blue' },
    ]);
  });

  it('skips blank rows and rejects duplicates and oversized matrices', () => {
    expect(
      buildCombinations([
        { name: '', valuesText: '' },
        { name: 'Size', valuesText: 'S' },
      ]).combinations,
    ).toEqual([{ Size: 'S' }]);

    expect(buildCombinations([{ name: 'Size', valuesText: 'S, s' }]).error).toMatch(/duplicate/i);

    const oversized = buildCombinations([
      { name: 'A', valuesText: '1,2,3,4' },
      { name: 'B', valuesText: '1,2,3,4' },
      { name: 'C', valuesText: '1,2,3,4' },
    ]);
    expect(oversized.error).toMatch(/50 variants/);
    expect(oversized.combinations).toEqual([]);
  });
});

describe('reconcileVariants', () => {
  it('keeps typed values and image URLs by normalized combination', () => {
    const previous: VariantDraft[] = [
      {
        combination: { Color: 'Red', Size: 'S' },
        sku: 'KEEP',
        price: '650',
        cost: '',
        stockCount: '4',
        imageUrl: 'https://res.cloudinary.com/demo/keep.png',
      },
      {
        combination: { Color: 'Blue', Size: 'S' },
        sku: 'BLUE',
        price: '',
        cost: '',
        stockCount: '2',
        imageUrl: null,
      },
    ];

    const next = reconcileVariants(
      [
        { Size: 'S', Color: 'Red' },
        { Size: 'M', Color: 'Red' },
      ],
      previous,
    );

    expect(next[0]).toMatchObject({
      combination: { Size: 'S', Color: 'Red' },
      sku: 'KEEP',
      stockCount: '4',
      imageUrl: 'https://res.cloudinary.com/demo/keep.png',
    });
    expect(next[1]).toMatchObject({
      sku: '',
      stockCount: '0',
      combination: { Size: 'M', Color: 'Red' },
    });
    expect(combinationKey(next[0].combination)).toBe(combinationKey({ color: 'red', size: 's' }));
  });
});

describe('form payloads', () => {
  it('turns an empty option set into a simple product', () => {
    const input = toCreateInput(
      {
        ...emptyProductForm('22222222-2222-4222-8222-222222222222'),
        name: 'Tee',
        price: '500',
        stockCount: '4',
      },
      [],
      [],
    );

    expect(input).toMatchObject({
      name: 'Tee',
      price: 500,
      stockCount: 4,
      lowStockThreshold: 5,
      images: [],
      options: [],
      variants: [],
    });
    expect(input.description).toBeUndefined();
    expect(input.sku).toBeUndefined();
  });

  it('preserves variant image URLs when editing', () => {
    const initial = formFromProduct(product);
    const input = toUpdateInput(initial.form, initial.options, initial.variants, product.version);

    expect(input.version).toBe(4);
    expect(input.options).toHaveLength(1);
    const updatedVariants = input.variants ?? [];
    expect(updatedVariants).toHaveLength(2);
    expect(updatedVariants[0].imageUrl).toBe(
      'https://res.cloudinary.com/demo/image/upload/tee-s.png',
    );
    expect(updatedVariants[1].imageUrl).toBeUndefined();
    expect(input.stockCount).toBeUndefined();
    expect(input.description).toBe('Soft cotton');
  });

  it('ignores the product stock count once options exist', () => {
    const form = { ...emptyProductForm('c1'), name: 'Tee', price: '500', stockCount: '99' };
    const input = toCreateInput(
      form,
      [{ name: 'Size', valuesText: 'S, M' }],
      reconcileVariants([{ Size: 'S' }, { Size: 'M' }], []),
    );

    expect(input.stockCount).toBe(0);
    expect(input.variants).toHaveLength(2);
  });

  it('defaults a blank threshold on create and omits it from an edit', () => {
    const form = {
      ...emptyProductForm('c1'),
      name: 'Tee',
      price: '500',
      lowStockThreshold: '',
    };

    expect(toCreateInput(form, [], []).lowStockThreshold).toBe(5);
    expect(toUpdateInput(form, [], [], 1).lowStockThreshold).toBeUndefined();
  });

  it('keeps a picked variant image file out of the JSON payload', () => {
    const variants = reconcileVariants([{ Size: 'S' }], []).map((variant) => ({
      ...variant,
      imageFile: new File([PNG], 'variant.png', { type: 'image/png' }),
    }));

    const input = toCreateInput(
      { ...emptyProductForm('c1'), name: 'Tee', price: '500' },
      [{ name: 'Size', valuesText: 'S' }],
      variants,
    );

    expect(input.variants[0]).not.toHaveProperty('imageFile');
    expect(input.variants[0].combination).toEqual({ Size: 'S' });
  });
});

describe('validateImageSelection', () => {
  it('accepts JPG, PNG, and WebP by magic bytes', () => {
    expect(validateImageSelection(PNG, PNG.length)).toBeNull();
    expect(validateImageSelection(JPEG, JPEG.length)).toBeNull();
    expect(validateImageSelection(WEBP, WEBP.length)).toBeNull();
  });

  it('rejects unsupported, empty, and oversized files', () => {
    expect(validateImageSelection(Uint8Array.from([0x47, 0x49, 0x46]), 3)).toMatch(/JPG/);
    expect(validateImageSelection(new Uint8Array(), 0)).toMatch(/non-empty/);
    expect(validateImageSelection(PNG, MAX_PRODUCT_IMAGE_BYTES + 1)).toMatch(/2 MB/);
  });
});
