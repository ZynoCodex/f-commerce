import { TenantEntity } from './base.entity.js';

export enum PaymentMethod {
  CASH = 'CASH',
  CASH_ON_DELIVERY = 'CASH_ON_DELIVERY',
  BKASH = 'BKASH',
  NAGAD = 'NAGAD',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CARD = 'CARD',
  PAYPAL = 'PAYPAL',
  OTHER = 'OTHER',
}

export interface Payment extends TenantEntity {
  orderId: string;
  amount: number;
  method: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
  paymentDate: Date;
}

export interface ExpenseCategory extends TenantEntity {
  name: string;
  description?: string;
}

export interface Expense extends TenantEntity {
  categoryId?: string;
  amount: number;
  date: Date;
  referenceNumber?: string;
  notes?: string;
}
