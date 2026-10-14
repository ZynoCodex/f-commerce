import { Request, Response, Router } from 'express';
import { CustomerCreateSchema, CustomerUpdateSchema } from '@f-commerce/contracts';
import { CustomerService } from '../../application/services/customer.service.js';
import { requireAuth, requireBusinessRole } from '../middlewares/auth.middleware.js';
import { MongooseCustomerRepository } from '../../infrastructure/database/mongoose/repositories/customer.repository.js';
import { MongooseBusinessRepository } from '../../infrastructure/database/mongoose/repositories/business.repository.js';
import { getTenantId, requestContext } from '../../infrastructure/database/mongoose/context.js';
import {
  CustomerArchivedError,
  CustomerChangedError,
  CustomerNotArchivedError,
  DomainError,
  DuplicatePhoneError,
  NotFoundError,
  PhoneInUseError,
  ValidationError,
} from '../../domain/errors.js';

export const customerRouter = Router();

const customerService = new CustomerService(new MongooseCustomerRepository());
const businessRepository = new MongooseBusinessRepository();

const ALLOWED_ROLES: ('OWNER' | 'STAFF')[] = ['OWNER', 'STAFF'];

function actorFromContext() {
  const context = requestContext.getStore();
  if (!context?.businessId) {
    throw new NotFoundError('No business context');
  }
  return { businessId: context.businessId };
}

/** Collect the invalid field names from a Zod failure, in first seen order. */
function invalidFields(issues: { path: PropertyKey[] }[]): string[] {
  return Array.from(new Set(issues.map((issue) => String(issue.path[0] ?? '')))).filter(
    (field) => field !== '',
  );
}

/**
 * Map a domain error to the customer error contract: a code plus a plain
 * message, with a `fields` array for validation failures.
 */
function sendError(res: Response, error: unknown): void {
  if (error instanceof ValidationError) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: error.message,
      fields: error.fields,
    });
    return;
  }

  if (error instanceof DuplicatePhoneError) {
    res.status(409).json({
      error: 'DUPLICATE_PHONE',
      message: error.message,
      existingCustomerId: error.existingCustomerId,
      archived: error.archived,
    });
    return;
  }

  if (error instanceof CustomerChangedError) {
    res.status(409).json({ error: 'CUSTOMER_CHANGED', message: error.message });
    return;
  }

  if (error instanceof CustomerArchivedError) {
    res.status(409).json({ error: 'CUSTOMER_ARCHIVED', message: error.message });
    return;
  }

  if (error instanceof CustomerNotArchivedError) {
    res.status(409).json({ error: 'CUSTOMER_NOT_ARCHIVED', message: error.message });
    return;
  }

  if (error instanceof PhoneInUseError) {
    res.status(409).json({
      error: 'PHONE_IN_USE',
      message: error.message,
      liveCustomerId: error.liveCustomerId,
    });
    return;
  }

  if (error instanceof NotFoundError) {
    res.status(404).json({ error: 'NOT_FOUND', message: error.message });
    return;
  }

  if (error instanceof DomainError) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });
    return;
  }

  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : 'Unknown error',
  });
}

/** Read the acting user id from the verified token. */
function actingUserId(req: Request): string {
  const user = req.user as { userId?: string } | undefined;
  return user?.userId ?? '';
}

/** Express types a route param as string or string[]; take the first value. */
function paramId(req: Request): string {
  const raw = req.params.id;
  return Array.isArray(raw) ? (raw[0] ?? '') : raw;
}

customerRouter.use(requireAuth);

customerRouter.post('/', requireBusinessRole(ALLOWED_ROLES), async (req: Request, res: Response) => {
  try {
    const parsed = CustomerCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(invalidFields(parsed.error.issues));
    }

    const actor = { ...actorFromContext(), userId: actingUserId(req) };
    const created = await customerService.create(parsed.data, actor);
    res.status(201).json({ success: true, data: created, message: 'Customer created' });
  } catch (error) {
    sendError(res, error);
  }
});

customerRouter.get('/', requireBusinessRole(ALLOWED_ROLES), async (req: Request, res: Response) => {
  try {
    const page = await customerService.search(
      typeof req.query.q === 'string' ? req.query.q : undefined,
      typeof req.query.limit === 'string' ? req.query.limit : undefined,
      typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
    );
    res.status(200).json({ success: true, data: page, message: 'Customers retrieved' });
  } catch (error) {
    sendError(res, error);
  }
});

customerRouter.get(
  '/:id',
  requireBusinessRole(ALLOWED_ROLES),
  async (req: Request, res: Response) => {
    try {
      const businessId = getTenantId();
      const business = businessId ? await businessRepository.findById(businessId) : null;
      const profile = await customerService.getProfile(paramId(req), business?.currency ?? 'BDT');
      res.status(200).json({ success: true, data: profile, message: 'Customer retrieved' });
    } catch (error) {
      sendError(res, error);
    }
  },
);

customerRouter.patch(
  '/:id',
  requireBusinessRole(ALLOWED_ROLES),
  async (req: Request, res: Response) => {
    try {
      const parsed = CustomerUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(invalidFields(parsed.error.issues));
      }

      const updated = await customerService.update(paramId(req), parsed.data);
      res.status(200).json({ success: true, data: updated, message: 'Customer updated' });
    } catch (error) {
      sendError(res, error);
    }
  },
);

customerRouter.get(
  '/:id/orders',
  requireBusinessRole(ALLOWED_ROLES),
  async (req: Request, res: Response) => {
    try {
      const page = await customerService.listOrders(
        paramId(req),
        typeof req.query.limit === 'string' ? req.query.limit : undefined,
        typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
      );
      res.status(200).json({ success: true, data: page, message: 'Orders retrieved' });
    } catch (error) {
      sendError(res, error);
    }
  },
);

customerRouter.post(
  '/:id/archive',
  requireBusinessRole(ALLOWED_ROLES),
  async (req: Request, res: Response) => {
    try {
      const version = Number((req.body as { version?: unknown }).version);
      if (!Number.isInteger(version) || version < 1) {
        throw new ValidationError(['version']);
      }

      const actor = { ...actorFromContext(), userId: actingUserId(req) };
      const archived = await customerService.archive(paramId(req), version, actor);
      res.status(200).json({ success: true, data: archived, message: 'Customer archived' });
    } catch (error) {
      sendError(res, error);
    }
  },
);

customerRouter.post(
  '/:id/restore',
  requireBusinessRole(ALLOWED_ROLES),
  async (req: Request, res: Response) => {
    try {
      const version = Number((req.body as { version?: unknown }).version);
      if (!Number.isInteger(version) || version < 1) {
        throw new ValidationError(['version']);
      }

      const actor = { ...actorFromContext(), userId: actingUserId(req) };
      const restored = await customerService.restore(paramId(req), version, actor);
      res.status(200).json({ success: true, data: restored, message: 'Customer restored' });
    } catch (error) {
      sendError(res, error);
    }
  },
);