import mongoose, { Schema, Document } from 'mongoose';
import { OrderStatus } from '../../../../domain/entities/order.entity.js';
import { tenantPlugin, baseSchemaOptions } from './BaseSchema.js';

export interface OrderDocument extends Document {
  customerId: mongoose.Types.ObjectId;
  orderNumber: string;
  status: OrderStatus;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paidAmount: number;
  dueAmount: number;
  shippingAddress?: string;
  courierId?: mongoose.Types.ObjectId;
  trackingNumber?: string;
  source?: string;
  notes?: string;
  idempotencyKey?: string;
  businessId: mongoose.Types.ObjectId;
}

const OrderSchema = new Schema<OrderDocument>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    orderNumber: { type: String, required: true },
    status: { type: String, enum: Object.values(OrderStatus), default: OrderStatus.PENDING },
    subtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    dueAmount: { type: Number, required: true, min: 0 },
    shippingAddress: { type: String },
    courierId: { type: Schema.Types.ObjectId, ref: 'Courier' },
    trackingNumber: { type: String },
    source: { type: String },
    notes: { type: String },
    idempotencyKey: { type: String },
  },
  baseSchemaOptions,
);

OrderSchema.plugin(tenantPlugin);

// Index for quick lookup by order number within a business
OrderSchema.index({ businessId: 1, orderNumber: 1 }, { unique: true });

// Index for idempotency keys
OrderSchema.index(
  { businessId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true, $type: 'string' } } },
);

// Serves customer order history: scoped lookup plus newest first sort
OrderSchema.index({ businessId: 1, customerId: 1, createdAt: -1 });

export const OrderModel = mongoose.model<OrderDocument>('Order', OrderSchema);

export interface OrderItemDocument extends Document {
  orderId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  productNameSnapshot: string;
  priceSnapshot: number;
  costSnapshot: number;
  quantity: number;
  subtotal: number;
  businessId: mongoose.Types.ObjectId;
}

const OrderItemSchema = new Schema<OrderItemDocument>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productNameSnapshot: { type: String, required: true },
    priceSnapshot: { type: Number, required: true, min: 0 },
    costSnapshot: { type: Number, default: 0, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  baseSchemaOptions,
);

OrderItemSchema.plugin(tenantPlugin);

// Index by orderId for fast fetching of items for an order
OrderItemSchema.index({ orderId: 1 });

export const OrderItemModel = mongoose.model<OrderItemDocument>('OrderItem', OrderItemSchema);
