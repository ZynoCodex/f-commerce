import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.string().default('4000'),
  MONGODB_URI: z.string().url().default('mongodb://localhost:27017/f-commerce'),
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
