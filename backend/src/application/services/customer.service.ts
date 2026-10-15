import {
  CustomerCreateRequest,
  CustomerOrderPageDto,
  CustomerPageDto,
  CustomerProfileDto,
} from '@f-commerce/contracts';
import { Customer } from '../../domain/entities/customer.entity.js';
import { OrderStatus } from '../../domain/entities/order.entity.js';
import {
  CustomerUpdateData,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.js';
import { cleanPhone, normalizePhonePrefix } from '../../domain/customer-phone.js';
import {
  decodeCustomerCursor,
  decodeOrderCursor,
  effectivePageSize,
  encodeCustomerCursor,
  encodeOrderCursor,
} from '../../domain/customer-cursor.js';
import {
  CustomerArchivedError,
  CustomerChangedError,
  CustomerNotArchivedError,
  DuplicatePhoneError,
  NotFoundError,
  PhoneInUseError,
  ValidationError,
} from '../../domain/errors.js';

/** Order statuses left out of a customer's spend summary. */
const EXCLUDED_SPEND_STATUSES = [OrderStatus.CANCELLED, OrderStatus.RETURNED];

const AUDIT_ENTITY_TYPE = 'CUSTOMER';

const DUPLICATE_KEY_CODE = 11000;

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === DUPLICATE_KEY_CODE
  );
}

function toDto(customer: Customer) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email ?? null,
    address: customer.address ?? null,
    notes: customer.notes ?? null,
    archivedAt: customer.archivedAt ? customer.archivedAt.toISOString() : null,
    version: customer.version,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

export interface CustomerActor {
  businessId: string;
  userId: string;
}

export class CustomerService {
  constructor(private readonly repository: ICustomerRepository) {}

  async create(input: CustomerCreateRequest, actor: CustomerActor) {
    const phone = cleanPhone(input.phone);
    if (phone === null) {
      throw new ValidationError(['phone']);
    }

    const existing = await this.repository.findByPhone(phone);
    if (existing) {
      throw new DuplicatePhoneError(existing.id, existing.archivedAt !== undefined);
    }

    try {
      const created = await this.repository.insert({
        id: '',
        businessId: actor.businessId,
        name: input.name,
        phone,
        email: input.email,
        address: input.address,
        notes: input.notes,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return toDto(created);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw await this.duplicateFromIndex(phone);
      }
      throw error;
    }
  }

  async get(id: string): Promise<Customer> {
    const customer = await this.repository.findById(id);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    return customer;
  }

  async update(
    id: string,
    input: {
      version: number;
      name?: string;
      phone?: string;
      email?: string | null;
      address?: string | null;
      notes?: string | null;
    },
  ) {
    const customer = await this.get(id);

    // Archived customers are locked before the version check.
    if (customer.archivedAt !== undefined) {
      throw new CustomerArchivedError();
    }

    if (input.version !== customer.version) {
      throw new CustomerChangedError();
    }

    const changes: CustomerUpdateData = {};
    if (input.name !== undefined && input.name !== customer.name) {
      changes.name = input.name;
    }

    if (input.phone !== undefined) {
      const phone = cleanPhone(input.phone);
      if (phone === null) {
        throw new ValidationError(['phone']);
      }
      if (phone !== customer.phone) {
        changes.phone = phone;
      }
    }

    for (const field of ['email', 'address', 'notes'] as const) {
      const value = input[field];
      const stored = customer[field];
      if (value === undefined) continue;
      // null from validation means the seller cleared the field.
      if (value === null) {
        if (stored !== undefined) changes[field] = null;
        continue;
      }
      if (value !== stored) changes[field] = value;
    }

    // Nothing actually changed after trimming: return without writing.
    if (Object.keys(changes).length === 0) {
      return toDto(customer);
    }

    if (changes.phone !== undefined) {
      const holder = await this.repository.findByPhone(changes.phone, id);
      if (holder) {
        throw new DuplicatePhoneError(holder.id, holder.archivedAt !== undefined);
      }
    }

    try {
      const updated = await this.repository.update(
        id,
        customer.version,
        changes,
        customer.version + 1,
      );
      if (!updated) {
        throw new CustomerChangedError();
      }
      return toDto(updated);
    } catch (error) {
      if (isDuplicateKeyError(error) && changes.phone !== undefined) {
        throw await this.duplicateFromIndex(changes.phone, id);
      }
      throw error;
    }
  }

  async search(
    rawQuery: string | undefined,
    rawLimit: string | undefined,
    rawCursor: string | undefined,
  ): Promise<CustomerPageDto> {
    const query = (rawQuery ?? '').trim();
    const limit = effectivePageSize(rawLimit === undefined ? undefined : Number(rawLimit));

    let anchor: { name: string; id: string } | undefined;
    if (rawCursor !== undefined && rawCursor !== '') {
      const decoded = decodeCustomerCursor(rawCursor, query, limit);
      if (!decoded) {
        throw new ValidationError(['cursor']);
      }
      anchor = { name: decoded.name, id: decoded.id };
    }

    const result = await this.repository.search({
      nameQuery: query,
      phonePrefix: normalizePhonePrefix(query),
      limit,
      name: anchor?.name,
      id: anchor?.id,
    });

    const last = result.items[result.items.length - 1];
    const nextCursor =
      result.hasMore && last
        ? encodeCustomerCursor({ name: last.name, id: last.id, q: query, limit })
        : null;

    return { items: result.items.map(toDto), nextCursor };
  }

  async getProfile(id: string, currency: string): Promise<CustomerProfileDto> {
    const customer = await this.get(id);
    const spend = await this.repository.aggregateSpend(id, EXCLUDED_SPEND_STATUSES);

    return {
      ...toDto(customer),
      orderCount: spend.orderCount,
      totalSpent: spend.totalSpent,
      totalDue: spend.totalDue,
      currency,
    };
  }

  async listOrders(
    id: string,
    rawLimit: string | undefined,
    rawCursor: string | undefined,
  ): Promise<CustomerOrderPageDto> {
    await this.get(id);

    const limit = effectivePageSize(rawLimit === undefined ? undefined : Number(rawLimit));

    let anchor: { createdAt: Date; id: string } | undefined;
    if (rawCursor !== undefined && rawCursor !== '') {
      const decoded = decodeOrderCursor(rawCursor, limit);
      if (!decoded) {
        throw new ValidationError(['cursor']);
      }
      anchor = { createdAt: decoded.createdAt, id: decoded.id };
    }

    const result = await this.repository.listOrders({
      customerId: id,
      limit,
      createdAt: anchor?.createdAt,
      id: anchor?.id,
    });

    const last = result.items[result.items.length - 1];
    const nextCursor =
      result.hasMore && last
        ? encodeOrderCursor({ createdAt: last.createdAt, id: last.id, limit })
        : null;

    return {
      items: result.items.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt.toISOString(),
        status: order.status,
        total: order.total,
        dueAmount: order.dueAmount,
      })),
      nextCursor,
    };
  }

  async archive(id: string, version: number, actor: CustomerActor) {
    const customer = await this.get(id);

    if (customer.archivedAt !== undefined) {
      throw new CustomerArchivedError();
    }

    if (version !== customer.version) {
      throw new CustomerChangedError();
    }

    const updated = await this.repository.archiveWithAudit(id, version, {
      businessId: actor.businessId,
      userId: actor.userId,
      action: 'CUSTOMER_ARCHIVED',
      entityType: AUDIT_ENTITY_TYPE,
      entityId: id,
    });

    if (!updated) {
      throw new CustomerChangedError();
    }
    return toDto(updated);
  }

  async restore(id: string, version: number, actor: CustomerActor) {
    const customer = await this.get(id);

    if (version !== customer.version) {
      throw new CustomerChangedError();
    }

    if (customer.archivedAt === undefined) {
      throw new CustomerNotArchivedError();
    }

    const holder = await this.repository.findLiveByPhone(customer.phone);
    if (holder) {
      throw new PhoneInUseError(holder.id);
    }

    const updated = await this.repository.restoreWithAudit(id, version, {
      businessId: actor.businessId,
      userId: actor.userId,
      action: 'CUSTOMER_RESTORED',
      entityType: AUDIT_ENTITY_TYPE,
      entityId: id,
    });

    if (!updated) {
      throw new CustomerChangedError();
    }
    return toDto(updated);
  }

  /** Look up the conflicting customer after a unique index race. */
  private async duplicateFromIndex(
    phone: string,
    excludeId?: string,
  ): Promise<DuplicatePhoneError> {
    const holder = await this.repository.findByPhone(phone, excludeId);
    if (!holder) {
      throw new NotFoundError('Customer not found');
    }
    return new DuplicatePhoneError(holder.id, holder.archivedAt !== undefined);
  }
}
