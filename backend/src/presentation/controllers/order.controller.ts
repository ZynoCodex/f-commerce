import { Request, Response, Router } from 'express';
import {
  OrderCreateSchema,
  OrderStatusChangeSchema,
  OrderUpdateSchema,
} from '@f-commerce/contracts';
import { OrderService } from '../../application/services/order.service.js';
import { requireAuth, requireBusinessRole } from '../middlewares/auth.middleware.js';
import { DrizzleOrderRepository } from '../../infrastructure/database/drizzle/repositories/order.repository.js';
import { getTenantId } from '../../infrastructure/database/drizzle/context.js';
import { sendInternalError } from './internal-error.js';
import {
  CustomerArchivedError,
  DomainError,
  DuplicateOrderError,
  InvalidStatusTransitionError,
  NotFoundError,
  OrderChangedError,
  OrderLockedError,
  ValidationError,
} from '../../domain/errors.js';

export const orderRouter = Router();

const orderService = new OrderService(new DrizzleOrderRepository());
const ALLOWED_ROLES: ('OWNER' | 'STAFF')[] = ['OWNER', 'STAFF'];

function invalidFields(issues: { path: PropertyKey[] }[]): string[] {
  return Array.from(new Set(issues.map((issue) => String(issue.path[0] ?? '')))).filter(
    (field) => field !== '',
  );
}

/** Map a domain error to the order error contract. */
function sendError(res: Response, error: unknown): void {
  if (error instanceof ValidationError) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: error.message,
      fields: error.fields,
    });
    return;
  }

  if (error instanceof DuplicateOrderError) {
    res.status(409).json({
      error: 'DUPLICATE_ORDER',
      message: error.message,
      existingOrder: {
        id: error.existingOrder.id,
        orderNumber: error.existingOrder.orderNumber,
        status: error.existingOrder.status,
        total: error.existingOrder.total,
        createdAt: error.existingOrder.createdAt.toISOString(),
      },
    });
    return;
  }

  if (error instanceof CustomerArchivedError) {
    res.status(409).json({ error: 'CUSTOMER_ARCHIVED', message: error.message });
    return;
  }

  if (error instanceof OrderLockedError) {
    res.status(409).json({ error: 'ORDER_LOCKED', message: error.message });
    return;
  }

  if (error instanceof OrderChangedError) {
    res.status(409).json({ error: 'ORDER_CHANGED', message: error.message });
    return;
  }

  if (error instanceof InvalidStatusTransitionError) {
    res.status(409).json({ error: 'INVALID_STATUS_TRANSITION', message: error.message });
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

  sendInternalError(res, error);
}

function actorFromContext(req: Request) {
  const businessId = getTenantId();
  if (!businessId) {
    throw new NotFoundError('No business context');
  }
  const user = req.user as { userId?: string } | undefined;
  return { businessId, userId: user?.userId ?? '' };
}

/** Express types a route param as string or string[]; take the first value. */
function paramId(req: Request): string {
  const raw = req.params.id;
  return Array.isArray(raw) ? (raw[0] ?? '') : raw;
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

orderRouter.use(requireAuth);
orderRouter.use(requireBusinessRole(ALLOWED_ROLES));

orderRouter.post('/', async (req: Request, res: Response) => {
  try {
    const rawKey = req.get('Idempotency-Key');
    let idempotencyKey: string | null = null;
    if (rawKey !== undefined) {
      const trimmed = rawKey.trim();
      if (trimmed.length < 1 || trimmed.length > 100) {
        throw new ValidationError(['Idempotency-Key']);
      }
      idempotencyKey = trimmed;

      // A replay answers before body validation, reference checks, or the duplicate check.
      const existing = await orderService.findIdempotent(idempotencyKey);
      if (existing) {
        res.status(200).json({ success: true, data: existing, message: 'Order retrieved' });
        return;
      }
    }

    const parsed = OrderCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(invalidFields(parsed.error.issues));
    }

    const result = await orderService.create(parsed.data, actorFromContext(req), idempotencyKey);
    res.status(result.replayed ? 200 : 201).json({
      success: true,
      data: result.order,
      message: result.replayed ? 'Order retrieved' : 'Order created',
    });
  } catch (error) {
    sendError(res, error);
  }
});

orderRouter.get('/', async (req: Request, res: Response) => {
  try {
    const page = await orderService.list(
      queryString(req.query.status),
      queryString(req.query.q),
      queryString(req.query.limit),
      queryString(req.query.cursor),
    );
    res.status(200).json({ success: true, data: page, message: 'Orders retrieved' });
  } catch (error) {
    sendError(res, error);
  }
});

orderRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const order = await orderService.get(paramId(req));
    res.status(200).json({ success: true, data: order, message: 'Order retrieved' });
  } catch (error) {
    sendError(res, error);
  }
});

orderRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const parsed = OrderUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(invalidFields(parsed.error.issues));
    }

    const updated = await orderService.update(paramId(req), parsed.data, actorFromContext(req));
    res.status(200).json({ success: true, data: updated, message: 'Order updated' });
  } catch (error) {
    sendError(res, error);
  }
});

orderRouter.post('/:id/status', async (req: Request, res: Response) => {
  try {
    const parsed = OrderStatusChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(invalidFields(parsed.error.issues));
    }

    const updated = await orderService.changeStatus(
      paramId(req),
      parsed.data,
      actorFromContext(req),
    );
    res.status(200).json({ success: true, data: updated, message: 'Order status updated' });
  } catch (error) {
    sendError(res, error);
  }
});
