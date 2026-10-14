import { z } from 'zod';

/** Action codes recorded when a customer's visibility changes. */
export const CustomerAuditAction = {
  ARCHIVED: 'CUSTOMER_ARCHIVED',
  RESTORED: 'CUSTOMER_RESTORED',
} as const;

/** Error codes returned by the customer endpoints. */
export const CustomerErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DUPLICATE_PHONE: 'DUPLICATE_PHONE',
  CUSTOMER_ARCHIVED: 'CUSTOMER_ARCHIVED',
  CUSTOMER_CHANGED: 'CUSTOMER_CHANGED',
  CUSTOMER_NOT_ARCHIVED: 'CUSTOMER_NOT_ARCHIVED',
  PHONE_IN_USE: 'PHONE_IN_USE',
} as const;

export type CustomerAuditActionType =
  (typeof CustomerAuditAction)[keyof typeof CustomerAuditAction];
export type CustomerErrorCodeType = (typeof CustomerErrorCode)[keyof typeof CustomerErrorCode];

const MAX_OPTIONAL_TEXT = 500;

/** Create treats omitted, null, and blank optional fields the same way: absent. */
const createOptionalText = z
  .string()
  .max(MAX_OPTIONAL_TEXT)
  .nullable()
  .optional()
  .transform((value) => {
    if (value === null || value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  });

const createOptionalEmail = z
  .string()
  .email('Invalid email format')
  .nullable()
  .optional()
  .transform((value) => {
    if (value === null || value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  });

/**
 * Edit keeps omitted fields unchanged, while null or blank clears the field.
 * The transform maps omitted to undefined and clearing to null so the two are
 * told apart downstream.
 */
const editOptionalText = z
  .string()
  .max(MAX_OPTIONAL_TEXT)
  .nullable()
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  });

const editOptionalEmail = z
  .string()
  .email('Invalid email format')
  .nullable()
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  });

export const CustomerCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or fewer'),
  phone: z.string(),
  email: createOptionalEmail,
  address: createOptionalText,
  notes: createOptionalText,
});

export const CustomerUpdateSchema = z.object({
  version: z.number().int().min(1),
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(120, 'Name must be 120 characters or fewer')
    .optional(),
  phone: z.string().optional(),
  email: editOptionalEmail,
  address: editOptionalText,
  notes: editOptionalText,
});

export const CustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  archivedAt: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CustomerSummarySchema = CustomerSchema.pick({ id: true, name: true, phone: true });

export const CustomerPageSchema = z.object({
  items: z.array(CustomerSchema),
  nextCursor: z.string().nullable(),
});

export const CustomerProfileSchema = CustomerSchema.extend({
  orderCount: z.number().int(),
  totalSpent: z.number(),
  totalDue: z.number(),
  currency: z.string(),
});

export const CustomerOrderSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  createdAt: z.string(),
  status: z.string(),
  total: z.number(),
  dueAmount: z.number(),
});

export const CustomerOrderPageSchema = z.object({
  items: z.array(CustomerOrderSchema),
  nextCursor: z.string().nullable(),
});

export const DuplicatePhoneErrorSchema = z.object({
  error: z.literal(CustomerErrorCode.DUPLICATE_PHONE),
  message: z.string(),
  existingCustomerId: z.string(),
  archived: z.boolean(),
});

export type CustomerCreateRequest = z.infer<typeof CustomerCreateSchema>;
export type CustomerUpdateRequest = z.infer<typeof CustomerUpdateSchema>;
export type CustomerDto = z.infer<typeof CustomerSchema>;
export type CustomerSummaryDto = z.infer<typeof CustomerSummarySchema>;
export type CustomerPageDto = z.infer<typeof CustomerPageSchema>;
export type CustomerProfileDto = z.infer<typeof CustomerProfileSchema>;
export type CustomerOrderDto = z.infer<typeof CustomerOrderSchema>;
export type CustomerOrderPageDto = z.infer<typeof CustomerOrderPageSchema>;
export type DuplicatePhoneError = z.infer<typeof DuplicatePhoneErrorSchema>;