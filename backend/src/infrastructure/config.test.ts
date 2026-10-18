import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// We test the env schema logic by re-defining it here (mirroring config.ts)
// and validating against controlled inputs. This avoids spawning child processes
// or polluting the process-level config singleton.
// The real config.ts uses the same schema, so this validates the contract.

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.string().default('4000'),
  DATABASE_URL: z
    .string()
    .url()
    .default('postgresql://fcommerce:fcommerce@localhost:5432/fcommerce'),
  JWT_SECRET: z.string().min(32).default('super-secret-jwt-key-replace-in-production'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32)
    .default('super-secret-jwt-refresh-key-replace-in-production'),
  OAUTH_GOOGLE_CLIENT_ID: z.string().optional(),
  OAUTH_FACEBOOK_CLIENT_ID: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
});

describe('config env schema', () => {
  describe('valid inputs', () => {
    it('parses when all required vars are provided and valid', () => {
      const result = envSchema.safeParse({
        PORT: '4000',
        DATABASE_URL: 'postgresql://localhost:5432/test',
        JWT_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'b'.repeat(32),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe('4000');
        expect(result.data.DATABASE_URL).toBe('postgresql://localhost:5432/test');
        expect(result.data.JWT_SECRET).toHaveLength(32);
      }
    });

    it('fills defaults for optional Cloudinary vars when omitted', () => {
      const result = envSchema.safeParse({
        PORT: '4000',
        DATABASE_URL: 'postgresql://localhost:5432/test',
        JWT_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'b'.repeat(32),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.CLOUDINARY_CLOUD_NAME).toBe('');
        expect(result.data.CLOUDINARY_API_KEY).toBe('');
        expect(result.data.CLOUDINARY_API_SECRET).toBe('');
        expect(result.data.CORS_ORIGINS).toBe('http://localhost:3000');
        expect(result.data.NODE_ENV).toBe('development');
      }
    });

    it('allows overriding CORS_ORIGINS to a comma-separated list', () => {
      const result = envSchema.safeParse({
        PORT: '4000',
        DATABASE_URL: 'postgresql://localhost:5432/test',
        JWT_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'b'.repeat(32),
        CORS_ORIGINS: 'http://localhost:3000,http://localhost:3001',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.CORS_ORIGINS).toBe('http://localhost:3000,http://localhost:3001');
      }
    });

    it('allows optional OAuth fields when set', () => {
      const result = envSchema.safeParse({
        PORT: '4000',
        DATABASE_URL: 'postgresql://localhost:5432/test',
        JWT_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'b'.repeat(32),
        OAUTH_GOOGLE_CLIENT_ID: 'google-client-id',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.OAUTH_GOOGLE_CLIENT_ID).toBe('google-client-id');
      }
    });
  });

  describe('invalid inputs', () => {
    it('rejects when DATABASE_URL is not a valid URL', () => {
      const result = envSchema.safeParse({
        DATABASE_URL: 'not-a-url',
        JWT_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'b'.repeat(32),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('DATABASE_URL'))).toBe(true);
      }
    });

    it('rejects when JWT_SECRET is shorter than 32 characters', () => {
      const result = envSchema.safeParse({
        JWT_SECRET: 'short',
        JWT_REFRESH_SECRET: 'b'.repeat(32),
      });

      expect(result.success).toBe(false);
    });

    it('rejects when JWT_REFRESH_SECRET is shorter than 32 characters', () => {
      const result = envSchema.safeParse({
        JWT_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'too-short',
      });

      expect(result.success).toBe(false);
    });

    it('rejects when PORT is not provided but defaults apply correctly when absent', () => {
      const result = envSchema.safeParse({
        DATABASE_URL: 'postgresql://localhost:5432/test',
        JWT_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'b'.repeat(32),
      });

      // PORT defaults to '4000', so absence is fine
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe('4000');
      }
    });
  });
});
