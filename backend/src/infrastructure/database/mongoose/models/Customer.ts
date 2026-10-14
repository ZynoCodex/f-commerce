import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, baseSchemaOptions } from './BaseSchema.js';

export interface CustomerDocument extends Document {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  archivedAt?: Date;
  version: number;
  businessId: mongoose.Types.ObjectId;
}

const CustomerSchema = new Schema<CustomerDocument>(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String },
    address: { type: String },
    notes: { type: String },
    archivedAt: { type: Date },
    version: { type: Number, required: true, default: 1 },
  },
  baseSchemaOptions,
);

CustomerSchema.plugin(tenantPlugin);

// Unique phone per business, archived records included
CustomerSchema.index({ businessId: 1, phone: 1 }, { unique: true });

// Prefix search by name, case insensitive
CustomerSchema.index({ businessId: 1, name: 1 }, { collation: { locale: 'en', strength: 2 } });

export const CustomerModel = mongoose.model<CustomerDocument>('Customer', CustomerSchema);