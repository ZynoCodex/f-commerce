/** Product images are limited to JPG, PNG, and WebP at 2 MB each. */
export const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;

export type ProductImageType = 'image/jpeg' | 'image/png' | 'image/webp';

export function isProductImageType(type: string | null): type is ProductImageType {
  return type === 'image/jpeg' || type === 'image/png' || type === 'image/webp';
}
