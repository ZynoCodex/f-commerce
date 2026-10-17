import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { CustomerService, CustomerActor } from './customer.service.js';
import { Customer } from '../../domain/entities/customer.entity.js';
import { ICustomerRepository } from '../../domain/repositories/customer.repository.js';
import {
  CustomerArchivedError,
  CustomerChangedError,
  CustomerNotArchivedError,
  NotFoundError,
  PhoneInUseError,
  ValidationError,
} from '../../domain/errors.js';

const mockCustomerRepository = {
  findById: vi.fn(),
  findByPhone: vi.fn(),
  findLiveByPhone: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  search: vi.fn(),
  listOrders: vi.fn(),
  aggregateSpend: vi.fn(),
  archiveWithAudit: vi.fn(),
  restoreWithAudit: vi.fn(),
} as unknown as Mocked<ICustomerRepository>;

const MOCK_DATE = new Date('2026-01-01');
const DUPLICATE_KEY = { code: 11000 };

const ACTOR: CustomerActor = { businessId: 'biz1', userId: 'user1' };

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    businessId: 'biz1',
    name: 'Rahim',
    phone: '+8801712345678',
    version: 1,
    createdAt: MOCK_DATE,
    updatedAt: MOCK_DATE,
    ...overrides,
  } as Customer;
}

describe('CustomerService', () => {
  let service: CustomerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CustomerService(mockCustomerRepository);
  });

  describe('create', () => {
    // covers AC-2: a phone that cannot be cleaned is rejected before any lookup
    it('rejects an invalid phone without touching the repository', async () => {
      await expect(service.create({ name: 'Rahim', phone: '017' } as never, ACTOR)).rejects.toThrow(
        ValidationError,
      );

      expect(mockCustomerRepository.findByPhone).not.toHaveBeenCalled();
      expect(mockCustomerRepository.insert).not.toHaveBeenCalled();
    });

    // covers AC-3: a phone already held by a live customer returns DUPLICATE_PHONE and saves nothing
    it('returns a duplicate error with the existing id when the phone is taken', async () => {
      mockCustomerRepository.findByPhone.mockResolvedValueOnce(makeCustomer({ id: 'c2' }));

      await expect(
        service.create({ name: 'Karim', phone: '+880 1712-345678' } as never, ACTOR),
      ).rejects.toMatchObject({ existingCustomerId: 'c2', archived: false });

      expect(mockCustomerRepository.findByPhone).toHaveBeenCalledWith('+8801712345678');
      expect(mockCustomerRepository.insert).not.toHaveBeenCalled();
    });

    // covers AC-3: an archived holder is reported with archived true so the screen can offer restore
    it('reports archived true when the existing holder is archived', async () => {
      mockCustomerRepository.findByPhone.mockResolvedValueOnce(
        makeCustomer({ id: 'c2', archivedAt: MOCK_DATE }),
      );

      await expect(
        service.create({ name: 'Karim', phone: '+8801712345678' } as never, ACTOR),
      ).rejects.toMatchObject({ existingCustomerId: 'c2', archived: true });
    });

    // covers AC-3: a concurrent create that loses the unique index race is remapped to DUPLICATE_PHONE
    it('remaps a duplicate-key error from the unique index to DUPLICATE_PHONE', async () => {
      mockCustomerRepository.findByPhone
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeCustomer({ id: 'c3' }));
      mockCustomerRepository.insert.mockRejectedValueOnce(DUPLICATE_KEY);

      await expect(
        service.create({ name: 'Karim', phone: '+8801712345678' } as never, ACTOR),
      ).rejects.toMatchObject({ existingCustomerId: 'c3', archived: false });
    });

    // covers AC-1: a new customer is saved at version 1
    it('inserts a new customer at version 1 with the cleaned phone', async () => {
      mockCustomerRepository.findByPhone.mockResolvedValueOnce(null);
      mockCustomerRepository.insert.mockImplementationOnce(async (data) => ({
        ...data,
        id: 'c9',
      }));

      const result = await service.create(
        { name: 'Karim', phone: '+880 1712-345678' } as never,
        ACTOR,
      );

      expect(mockCustomerRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: 'biz1', phone: '+8801712345678', version: 1 }),
      );
      expect(result).toMatchObject({ id: 'c9', version: 1, archivedAt: null });
    });
  });

  describe('get', () => {
    // covers AC-11: an id that does not exist in this business returns NotFound
    it('throws NotFoundError when the customer is missing', async () => {
      mockCustomerRepository.findById.mockResolvedValueOnce(null);

      await expect(service.get('missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('update', () => {
    // covers AC-8: an archived customer is locked before the version is compared
    it('returns CUSTOMER_ARCHIVED even when the version is stale', async () => {
      mockCustomerRepository.findById.mockResolvedValueOnce(
        makeCustomer({ archivedAt: MOCK_DATE, version: 4 }),
      );

      await expect(service.update('c1', { version: 1, name: 'New' })).rejects.toThrow(
        CustomerArchivedError,
      );
      expect(mockCustomerRepository.update).not.toHaveBeenCalled();
    });

    // covers AC-4: a stale version returns CUSTOMER_CHANGED and writes nothing
    it('returns CUSTOMER_CHANGED when the version does not match', async () => {
      mockCustomerRepository.findById.mockResolvedValueOnce(makeCustomer({ version: 3 }));

      await expect(service.update('c1', { version: 2, name: 'New' })).rejects.toThrow(
        CustomerChangedError,
      );
      expect(mockCustomerRepository.update).not.toHaveBeenCalled();
    });

    // covers AC-4: trimmed values equal to the stored values return the customer without a write
    it('returns the current customer without writing when nothing changed', async () => {
      mockCustomerRepository.findById.mockResolvedValueOnce(makeCustomer({ version: 2 }));

      const result = await service.update('c1', {
        version: 2,
        name: 'Rahim',
        phone: '+880 1712-345678',
        email: null,
      });

      expect(result).toMatchObject({ id: 'c1', version: 2 });
      expect(mockCustomerRepository.findByPhone).not.toHaveBeenCalled();
      expect(mockCustomerRepository.update).not.toHaveBeenCalled();
    });

    // covers AC-2: an invalid phone on edit is rejected before any write
    it('rejects an invalid phone on edit', async () => {
      mockCustomerRepository.findById.mockResolvedValueOnce(makeCustomer({ version: 1 }));

      await expect(service.update('c1', { version: 1, phone: '12' })).rejects.toThrow(
        ValidationError,
      );
      expect(mockCustomerRepository.update).not.toHaveBeenCalled();
    });

    // covers AC-4: a phone held by another customer returns DUPLICATE_PHONE and does not write
    it('returns DUPLICATE_PHONE when another customer holds the new phone', async () => {
      mockCustomerRepository.findById.mockResolvedValueOnce(makeCustomer({ version: 1 }));
      mockCustomerRepository.findByPhone.mockResolvedValueOnce(
        makeCustomer({ id: 'c2', archivedAt: MOCK_DATE }),
      );

      await expect(
        service.update('c1', { version: 1, phone: '+8801811111111' }),
      ).rejects.toMatchObject({ existingCustomerId: 'c2', archived: true });
      expect(mockCustomerRepository.findByPhone).toHaveBeenCalledWith('+8801811111111', 'c1');
      expect(mockCustomerRepository.update).not.toHaveBeenCalled();
    });

    // covers AC-4: a real change writes with the version raised by exactly one
    it('writes changes with the next version', async () => {
      mockCustomerRepository.findById.mockResolvedValueOnce(makeCustomer({ version: 5 }));
      mockCustomerRepository.update.mockResolvedValueOnce(
        makeCustomer({ name: 'Karim', version: 6 }),
      );

      const result = await service.update('c1', { version: 5, name: 'Karim' });

      expect(mockCustomerRepository.update).toHaveBeenCalledWith('c1', 5, { name: 'Karim' }, 6);
      expect(result).toMatchObject({ name: 'Karim', version: 6 });
    });

    // covers AC-4: a conditional write that matches no row means another request won the race
    it('returns CUSTOMER_CHANGED when the conditional write matches nothing', async () => {
      mockCustomerRepository.findById.mockResolvedValueOnce(makeCustomer({ version: 5 }));
      mockCustomerRepository.update.mockResolvedValueOnce(null);

      await expect(service.update('c1', { version: 5, name: 'Karim' })).rejects.toThrow(
        CustomerChangedError,
      );
    });

    // covers AC-3: a duplicate-key error from a concurrent phone edit is remapped to DUPLICATE_PHONE
    it('remaps a duplicate-key error on phone change to DUPLICATE_PHONE', async () => {
      mockCustomerRepository.findById.mockResolvedValueOnce(makeCustomer({ version: 1 }));
      mockCustomerRepository.findByPhone
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeCustomer({ id: 'c4' }));
      mockCustomerRepository.update.mockRejectedValueOnce(DUPLICATE_KEY);

      await expect(
        service.update('c1', { version: 1, phone: '+8801811111111' }),
      ).rejects.toMatchObject({ existingCustomerId: 'c4', archived: false });
    });
  });

  describe('archive', () => {
    // covers AC-8: archiving an archived customer returns CUSTOMER_ARCHIVED and writes nothing
    it('returns CUSTOMER_ARCHIVED for an already archived customer', async () => {
      mockCustomerRepository.findById.mockResolvedValueOnce(
        makeCustomer({ archivedAt: MOCK_DATE, version: 2 }),
      );

      await expect(service.archive('c1', 2, ACTOR)).rejects.toThrow(CustomerArchivedError);
      expect(mockCustomerRepository.archiveWithAudit).not.toHaveBeenCalled();
    });

    // covers AC-8: a stale version on an active customer returns CUSTOMER_CHANGED
    it('returns CUSTOMER_CHANGED when the version is stale', async () => {
      mockCustomerRepository.findById.mockResolvedValueOnce(makeCustomer({ version: 3 }));

      await expect(service.archive('c1', 2, ACTOR)).rejects.toThrow(CustomerChangedError);
      expect(mockCustomerRepository.archiveWithAudit).not.toHaveBeenCalled();
    });

    // covers AC-10: archive writes the state change and one audit entry through the repository
    it('archives with an audit entry carrying the actor and action', async () => {
      mockCustomerRepository.findById.mockResolvedValueOnce(makeCustomer({ version: 3 }));
      mockCustomerRepository.archiveWithAudit.mockResolvedValueOnce(
        makeCustomer({ archivedAt: MOCK_DATE, version: 4 }),
      );

      const result = await service.archive('c1', 3, ACTOR);

      expect(mockCustomerRepository.archiveWithAudit).toHaveBeenCalledWith('c1', 3, {
        businessId: 'biz1',
        userId: 'user1',
        action: 'CUSTOMER_ARCHIVED',
        entityType: 'CUSTOMER',
        entityId: 'c1',
      });
      expect(result).toMatchObject({ version: 4, archivedAt: MOCK_DATE.toISOString() });
    });

    // covers AC-8: a conditional archive that matches nothing reports CUSTOMER_CHANGED
    it('returns CUSTOMER_CHANGED when the conditional archive matches nothing', async () => {
      mockCustomerRepository.findById.mockResolvedValueOnce(makeCustomer({ version: 3 }));
      mockCustomerRepository.archiveWithAudit.mockResolvedValueOnce(null);

      await expect(service.archive('c1', 3, ACTOR)).rejects.toThrow(CustomerChangedError);
    });
  });

  describe('restore', () => {
    // covers AC-9: version is checked before the archived state
    it('checks version before archived state', async () => {
      mockCustomerRepository.findById.mockResolvedValueOnce(makeCustomer({ version: 3 }));

      await expect(service.restore('c1', 2, ACTOR)).rejects.toThrow(CustomerChangedError);
      expect(mockCustomerRepository.findLiveByPhone).not.toHaveBeenCalled();
    });

    // covers AC-9: restoring an active customer returns CUSTOMER_NOT_ARCHIVED and changes nothing
    it('returns CUSTOMER_NOT_ARCHIVED for an active customer', async () => {
      mockCustomerRepository.findById.mockResolvedValueOnce(makeCustomer({ version: 3 }));

      await expect(service.restore('c1', 3, ACTOR)).rejects.toThrow(CustomerNotArchivedError);
      expect(mockCustomerRepository.restoreWithAudit).not.toHaveBeenCalled();
    });

    // covers AC-9: another live customer with the same phone returns PHONE_IN_USE and changes nothing
    it('returns PHONE_IN_USE when another live customer holds the phone', async () => {
      for (let call = 0; call < 2; call++) {
        mockCustomerRepository.findById.mockResolvedValueOnce(
          makeCustomer({ archivedAt: MOCK_DATE, version: 2 }),
        );
        mockCustomerRepository.findLiveByPhone.mockResolvedValueOnce(makeCustomer({ id: 'c7' }));
      }

      await expect(service.restore('c1', 2, ACTOR)).rejects.toThrow(PhoneInUseError);
      await expect(service.restore('c1', 2, ACTOR)).rejects.toMatchObject({
        liveCustomerId: 'c7',
      });
      expect(mockCustomerRepository.restoreWithAudit).not.toHaveBeenCalled();
    });

    // covers AC-10: restore writes the state change and one audit entry through the repository
    it('restores with an audit entry carrying the actor and action', async () => {
      mockCustomerRepository.findById.mockResolvedValueOnce(
        makeCustomer({ archivedAt: MOCK_DATE, version: 2 }),
      );
      mockCustomerRepository.findLiveByPhone.mockResolvedValueOnce(null);
      mockCustomerRepository.restoreWithAudit.mockResolvedValueOnce(makeCustomer({ version: 3 }));

      const result = await service.restore('c1', 2, ACTOR);

      expect(mockCustomerRepository.restoreWithAudit).toHaveBeenCalledWith('c1', 2, {
        businessId: 'biz1',
        userId: 'user1',
        action: 'CUSTOMER_RESTORED',
        entityType: 'CUSTOMER',
        entityId: 'c1',
      });
      expect(result).toMatchObject({ version: 3, archivedAt: null });
    });
  });

  describe('search', () => {
    // covers AC-5: a query that is not a phone prefix is searched by name only
    it('passes a null phone prefix for a name query', async () => {
      mockCustomerRepository.search.mockResolvedValueOnce({ items: [], hasMore: false });

      const page = await service.search('  Rahim  ', undefined, undefined);

      expect(mockCustomerRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({ nameQuery: 'Rahim', phonePrefix: null, limit: 20 }),
      );
      expect(page).toEqual({ items: [], nextCursor: null });
    });

    // covers AC-5: a partial phone with separators is normalized into a phone prefix
    it('normalizes a partial phone into a prefix', async () => {
      mockCustomerRepository.search.mockResolvedValueOnce({ items: [], hasMore: false });

      await service.search('+880 17', undefined, undefined);

      expect(mockCustomerRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({ phonePrefix: '+88017' }),
      );
    });

    // covers AC-5: a cursor that does not decode returns VALIDATION_ERROR on cursor
    it('rejects a malformed cursor', async () => {
      await expect(service.search('', undefined, 'not valid!')).rejects.toThrow(ValidationError);
      expect(mockCustomerRepository.search).not.toHaveBeenCalled();
    });

    // covers AC-5: limit above the maximum is clamped to 50, not rejected
    it('clamps the requested limit to 50', async () => {
      mockCustomerRepository.search.mockResolvedValueOnce({ items: [], hasMore: false });

      await service.search('', '500', undefined);

      expect(mockCustomerRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 }),
      );
    });
  });

  describe('getProfile', () => {
    // covers AC-6: a missing customer returns NotFound and spend is not computed
    it('throws NotFoundError and skips spend when the customer is missing', async () => {
      mockCustomerRepository.findById.mockResolvedValueOnce(null);

      await expect(service.getProfile('missing', 'BDT')).rejects.toThrow(NotFoundError);
      expect(mockCustomerRepository.aggregateSpend).not.toHaveBeenCalled();
    });
  });
});
