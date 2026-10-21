import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config.js';

cloudinary.config({
  cloud_name: config.CLOUDINARY_CLOUD_NAME,
  api_key: config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET,
});

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
}

export class CloudinaryService {
  async uploadImage(buffer: Buffer, businessId?: string): Promise<CloudinaryUploadResult> {
    return this.upload(buffer, businessId ? `business-logos/${businessId}` : 'business-logos');
  }

  /** Product images live under the business, with variants in their own folder. */
  async uploadProductImage(
    buffer: Buffer,
    businessId: string,
    variant = false,
  ): Promise<CloudinaryUploadResult> {
    const folder = variant ? `products/${businessId}/variants` : `products/${businessId}`;
    return this.upload(buffer, folder);
  }

  /** Remove an uploaded asset. Only called for assets the database does not reference. */
  async destroyImage(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  }

  private upload(buffer: Buffer, folder: string): Promise<CloudinaryUploadResult> {
    return new Promise<CloudinaryUploadResult>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }
          resolve({
            secure_url: result!.secure_url,
            public_id: result!.public_id,
          });
        },
      );
      stream.end(buffer);
    });
  }
}
