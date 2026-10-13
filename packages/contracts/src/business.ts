import { z } from 'zod';

export const CurrencyEnum = z.enum(['BDT', 'USD', 'EUR', 'GBP']);

export const AddressSchema = z.object({
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required'),
  region: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().min(1, 'Country is required'),
});

export const BusinessProfileSchema = z.object({
  name: z.string().min(1, 'Business name is required'),
  currency: CurrencyEnum,
  logoUrl: z.string().url('Invalid logo URL').optional().or(z.literal('')),
  address: AddressSchema,
  onboardingComplete: z.boolean().optional(),
});

/**
 * Partial update for PUT /me. Every field is optional and only the fields
 * present in the body are written back. No defaults, so an absent currency
 * does not silently reset the stored value.
 */
export const BusinessProfileUpdateSchema = z.object({
  name: z.string().min(1, 'Business name is required').optional(),
  currency: CurrencyEnum.optional(),
  logoUrl: z.string().url('Invalid logo URL').optional().or(z.literal('')).optional(),
  address: AddressSchema.optional(),
});

/**
 * Draft save. The value is validated per field so an invalid currency or
 * malformed address is rejected at the boundary instead of being stored
 * verbatim in the draft.
 */
export const DraftSaveSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('name'), value: z.string().min(1) }),
  z.object({ field: z.literal('currency'), value: CurrencyEnum }),
  z.object({ field: z.literal('address'), value: AddressSchema }),
  z.object({ field: z.literal('logoUrl'), value: z.string().url().or(z.literal('')) }),
]);

export const BusinessResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    name: z.string(),
    currency: CurrencyEnum,
    logoUrl: z.string().url().nullable(),
    address: AddressSchema.nullable(),
    onboardingComplete: z.boolean(),
  }),
  message: z.string(),
});

export type Currency = z.infer<typeof CurrencyEnum>;
export type Address = z.infer<typeof AddressSchema>;
export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;
export type BusinessProfileUpdate = z.infer<typeof BusinessProfileUpdateSchema>;
export type DraftSaveRequest = z.infer<typeof DraftSaveSchema>;
export type BusinessResponse = z.infer<typeof BusinessResponseSchema>;
