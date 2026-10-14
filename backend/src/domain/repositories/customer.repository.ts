import { Customer } from '../entities/customer.entity.js';
import { Order, OrderStatus } from '../entities/order.entity.js';

export interface CustomerSearchQuery {
  /** Trimmed search text. Empty means every active customer. */
  nameQuery: string;
  /** Normalized phone prefix, or null when the query cannot be a phone. */
  phonePrefix: string | null;
  limit: number;
  name?: string;
  id?: string;
}

export interface CustomerSearchResult {
  items: Customer[];
  /** One extra row beyond the page size, used to decide whether more exist. */
  hasMore: boolean;
}

export interface CustomerUpdateData {
  name?: string;
  phone?: string;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface CustomerOrderQuery {
  customerId: string;
  limit: number;
  createdAt?: Date;
  id?: string;
}

export interface CustomerOrderResult {
  items: Order[];
  hasMore: boolean;
}

export interface CustomerSpendSummary {
  orderCount: number;
  totalSpent: number;
  totalDue: number;
}

export interface CustomerAuditEntry {
  businessId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
}

export interface ICustomerRepository {
  findById(id: string): Promise<Customer | null>;
  /** Any customer with this phone, archived included. Used for duplicate checks. */
  findByPhone(phone: string, excludeId?: string): Promise<Customer | null>;
  /** A non archived customer holding this phone, used by the restore guard. */
  findLiveByPhone(phone: string): Promise<Customer | null>;
  insert(data: Customer): Promise<Customer>;
  update(
    id: string,
    expectedVersion: number,
    changes: CustomerUpdateData,
    nextVersion: number,
  ): Promise<Customer | null>;
  search(query: CustomerSearchQuery): Promise<CustomerSearchResult>;
  listOrders(query: CustomerOrderQuery): Promise<CustomerOrderResult>;
  aggregateSpend(customerId: string, excludedStatuses: OrderStatus[]): Promise<CustomerSpendSummary>;
  archiveWithAudit(
    id: string,
    expectedVersion: number,
    audit: CustomerAuditEntry,
  ): Promise<Customer | null>;
  restoreWithAudit(
    id: string,
    expectedVersion: number,
    audit: CustomerAuditEntry,
  ): Promise<Customer | null>;
}