import type {
  ProductImageStorage,
  UploadedProductImage,
} from '../../application/ports/product-image-storage.js';
import { CloudinaryService } from './cloudinary.service.js';

/** Adapts the concrete Cloudinary client to the application storage port. */
export class CloudinaryProductImageStorage implements ProductImageStorage {
  constructor(private readonly cloudinary: CloudinaryService = new CloudinaryService()) {}

  async uploadProductImage(
    buffer: Buffer,
    businessId: string,
    variant = false,
  ): Promise<UploadedProductImage> {
    const uploaded = await this.cloudinary.uploadProductImage(buffer, businessId, variant);
    return { url: uploaded.secure_url, publicId: uploaded.public_id };
  }

  async deleteProductImage(publicId: string): Promise<void> {
    await this.cloudinary.destroyImage(publicId);
  }
}
