import 'dotenv/config';
import { z } from 'zod';

// An empty value means the variable is unset, matching the .env.example files.
const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url().optional(),
);

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.string().default('4000'),
  DATABASE_URL: z
    .string()
    .url()
    .default('postgresql://fcommerce:fcommerce@localhost:5432/fcommerce'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  TEST_DATABASE_URL: optionalUrl,
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

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
