import mongoose, { Schema, Document } from 'mongoose';
import { baseSchemaOptions } from './BaseSchema.js';

export interface BusinessDocument extends Document {
  name: string;
  currency: string;
  logoUrl?: string;
  address?: {
    street: string;
    city: string;
    region?: string;
    postalCode?: string;
    country: string;
  };
  onboardingComplete: boolean;
  onboardingDraft?: {
    name?: string;
    currency?: string;
    address?: {
      street: string;
      city: string;
      region?: string;
      postalCode?: string;
      country: string;
    };
    logoUrl?: string;
  };
}

const AddressSchema = new Schema(
  {
    street: { type: String, required: true },
    city: { type: String, required: true },
    region: { type: String },
    postalCode: { type: String },
    country: { type: String, required: true },
  },
  { _id: false },
);

const OnboardingDraftSchema = new Schema(
  {
    name: { type: String },
    currency: { type: String, enum: ['BDT', 'USD', 'EUR', 'GBP'] },
    address: { type: AddressSchema },
    logoUrl: { type: String },
  },
  { _id: false, strict: false },
);

const BusinessSchema = new Schema<BusinessDocument>(
  {
    name: { type: String, required: true },
    currency: { type: String, enum: ['BDT', 'USD', 'EUR', 'GBP'], default: 'BDT' },
    logoUrl: { type: String },
    address: { type: AddressSchema },
    onboardingComplete: { type: Boolean, default: false },
    onboardingDraft: { type: OnboardingDraftSchema },
  },
  baseSchemaOptions,
);

export const BusinessModel = mongoose.model<BusinessDocument>('Business', BusinessSchema);
