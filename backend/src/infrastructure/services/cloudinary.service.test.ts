import { describe, it, expect, vi, beforeEach } from 'vitest';

const { uploadStreamMock, configMock } = vi.hoisted(() => {
  return {
    uploadStreamMock: vi.fn(),
    configMock: vi.fn(),
  };
});

vi.mock('cloudinary', () => ({
  v2: {
    config: configMock,
    uploader: { upload_stream: uploadStreamMock },
  },
}));

vi.mock('../config.js', () => ({
  config: {
    CLOUDINARY_CLOUD_NAME: 'test-cloud',
    CLOUDINARY_API_KEY: 'test-key',
    CLOUDINARY_API_SECRET: 'test-secret',
  },
}));

import { CloudinaryService } from './cloudinary.service.js';

describe('CloudinaryService', () => {
  let service: CloudinaryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CloudinaryService();
  });

  describe('uploadImage', () => {
    it('resolves with secure_url and public_id on success', async () => {
      const buffer = Buffer.from('image-data');
      uploadStreamMock.mockImplementation(
        (
          _options: unknown,
          callback: (
            error: Error | null,
            result?: { secure_url: string; public_id: string },
          ) => void,
        ) => {
          callback(null, {
            secure_url: 'https://res.cloudinary.com/test/image.png',
            public_id: 'business-logos/biz1/abc',
          });
          return { end: vi.fn() };
        },
      );

      const result = await service.uploadImage(buffer, 'biz1');

      expect(result).toEqual({
        secure_url: 'https://res.cloudinary.com/test/image.png',
        public_id: 'business-logos/biz1/abc',
      });
    });

    it('uses a business specific folder when businessId is provided', async () => {
      const buffer = Buffer.from('image-data');
      uploadStreamMock.mockImplementation(
        (
          _options: unknown,
          callback: (
            error: Error | null,
            result?: { secure_url: string; public_id: string },
          ) => void,
        ) => {
          callback(null, { secure_url: 'u', public_id: 'p' });
          return { end: vi.fn() };
        },
      );

      await service.uploadImage(buffer, 'biz42');

      expect(uploadStreamMock).toHaveBeenCalledWith(
        expect.objectContaining({ folder: 'business-logos/biz42' }),
        expect.any(Function),
      );
    });

    it('uses a generic folder when businessId is omitted', async () => {
      const buffer = Buffer.from('image-data');
      uploadStreamMock.mockImplementation(
        (
          _options: unknown,
          callback: (
            error: Error | null,
            result?: { secure_url: string; public_id: string },
          ) => void,
        ) => {
          callback(null, { secure_url: 'u', public_id: 'p' });
          return { end: vi.fn() };
        },
      );

      await service.uploadImage(buffer);

      expect(uploadStreamMock).toHaveBeenCalledWith(
        expect.objectContaining({ folder: 'business-logos' }),
        expect.any(Function),
      );
    });

    it('sets resource_type to image', async () => {
      const buffer = Buffer.from('image-data');
      uploadStreamMock.mockImplementation(
        (
          _options: unknown,
          callback: (
            error: Error | null,
            result?: { secure_url: string; public_id: string },
          ) => void,
        ) => {
          callback(null, { secure_url: 'u', public_id: 'p' });
          return { end: vi.fn() };
        },
      );

      await service.uploadImage(buffer);

      expect(uploadStreamMock).toHaveBeenCalledWith(
        expect.objectContaining({ resource_type: 'image' }),
        expect.any(Function),
      );
    });

    it('rejects when cloudinary returns an error', async () => {
      const buffer = Buffer.from('image-data');
      uploadStreamMock.mockImplementation(
        (
          _options: unknown,
          callback: (
            error: Error | null,
            result?: { secure_url: string; public_id: string },
          ) => void,
        ) => {
          callback(new Error('Upload failed'));
          return { end: vi.fn() };
        },
      );

      await expect(service.uploadImage(buffer)).rejects.toThrow('Upload failed');
    });

    it('passes the buffer to stream.end', async () => {
      const buffer = Buffer.from('image-data');
      const endMock = vi.fn();
      uploadStreamMock.mockImplementation(() => ({ end: endMock }));

      const promise = service.uploadImage(buffer);
      const callback = uploadStreamMock.mock.calls[0][1] as (
        error: Error | null,
        result?: { secure_url: string; public_id: string },
      ) => void;
      callback(null, { secure_url: 'u', public_id: 'p' });

      await promise;
      expect(endMock).toHaveBeenCalledWith(buffer);
    });
  });
});
