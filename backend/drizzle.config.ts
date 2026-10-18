import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: 'drizzle/migrations',
  schema: 'src/infrastructure/database/drizzle/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://fcommerce:fcommerce@localhost:5432/fcommerce',
  },
});
