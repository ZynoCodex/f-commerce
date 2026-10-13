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
    return new Promise<CloudinaryUploadResult>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: businessId ? `business-logos/${businessId}` : 'business-logos',
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
