import mongoose from 'mongoose';
import { config } from '../infrastructure/config.js';
import { CustomerModel } from '../infrastructure/database/mongoose/models/Customer.js';

/**
 * One time backfill: set `version` to 1 on customer documents created before
 * the field existed. The tenant plugin is bypassed on purpose, because this
 * script runs outside a request context and must touch every business.
 */
async function backfillCustomerVersions(): Promise<void> {
  await mongoose.connect(config.MONGODB_URI);

  const result = await CustomerModel.updateMany({ version: { $exists: false } }, { $set: { version: 1 } }, {
    bypassTenantIsolation: true,
  } as Parameters<typeof CustomerModel.updateMany>[2]);

  console.log(`Backfilled version on ${result.modifiedCount} customer document(s).`);

  await mongoose.disconnect();
}

backfillCustomerVersions().catch((error) => {
  console.error('Customer version backfill failed:', error);
  process.exit(1);
});