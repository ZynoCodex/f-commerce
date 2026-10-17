import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin, baseSchemaOptions } from './BaseSchema.js';

export interface AuditLogDocument extends Document {
  userId: mongoose.Types.ObjectId;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: string;
  newValue?: string;
  metadata?: string;
  businessId: mongoose.Types.ObjectId;
}

const AuditLogSchema = new Schema<AuditLogDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    previousValue: { type: String },
    newValue: { type: String },
    metadata: { type: String },
  },
  baseSchemaOptions,
);

AuditLogSchema.plugin(tenantPlugin);

// Indexes for searching audit logs by entity or user
AuditLogSchema.index({ businessId: 1, entityType: 1, entityId: 1 });
AuditLogSchema.index({ businessId: 1, entityType: 1, entityId: 1, createdAt: -1 });
AuditLogSchema.index({ businessId: 1, userId: 1 });
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 }); // 365 days retention

export const AuditLogModel = mongoose.model<AuditLogDocument>('AuditLog', AuditLogSchema);
