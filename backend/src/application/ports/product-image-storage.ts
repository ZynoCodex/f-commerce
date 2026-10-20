/** The storage boundary the product use cases depend on. */
export interface UploadedProductImage {
  url: string;
  publicId: string;
}

export interface ProductImageStorage {
  /**
   * Upload one validated image. Product images and variant images live in
   * separate Cloudinary folders, so the caller says which kind this is.
   */
  uploadProductImage(
    buffer: Buffer,
    businessId: string,
    variant?: boolean,
  ): Promise<UploadedProductImage>;

  /** Best effort cleanup for an upload that the database never referenced. */
  deleteProductImage(publicId: string): Promise<void>;
}
