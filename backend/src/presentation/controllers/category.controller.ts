import { Request, Response, Router } from 'express';
import { CategoryCreateSchema, CategoryUpdateSchema } from '@f-commerce/contracts';
import { CategoryService } from '../../application/services/category.service.js';
import { requireAuth, requireBusinessRole } from '../middlewares/auth.middleware.js';
import { DrizzleCategoryRepository } from '../../infrastructure/database/drizzle/repositories/category.repository.js';
import {
  CategoryChangedError,
  CategoryInUseError,
  DomainError,
  DuplicateCategoryError,
  NotFoundError,
  ValidationError,
} from '../../domain/errors.js';
import { sendInternalError } from './internal-error.js';

export const categoryRouter = Router();

const categoryService = new CategoryService(new DrizzleCategoryRepository());
const ALLOWED_ROLES: ('OWNER' | 'STAFF')[] = ['OWNER', 'STAFF'];

function invalidFields(issues: { path: PropertyKey[] }[]): string[] {
  return Array.from(new Set(issues.map((issue) => String(issue.path[0] ?? '')))).filter(
    (field) => field !== '',
  );
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof ValidationError) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: error.message,
      fields: error.fields,
    });
    return;
  }

  if (error instanceof DuplicateCategoryError) {
    res.status(409).json({
      error: 'DUPLICATE_CATEGORY',
      message: error.message,
      existingCategoryId: error.existingCategoryId,
    });
    return;
  }

  if (error instanceof CategoryChangedError) {
    res.status(409).json({ error: 'CATEGORY_CHANGED', message: error.message });
    return;
  }

  if (error instanceof CategoryInUseError) {
    res.status(409).json({
      error: 'CATEGORY_IN_USE',
      message: error.message,
      productCount: error.productCount,
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

  sendInternalError(res, error);
}

function paramId(req: Request): string {
  const raw = req.params.id;
  return Array.isArray(raw) ? (raw[0] ?? '') : raw;
}

categoryRouter.use(requireAuth);
categoryRouter.use(requireBusinessRole(ALLOWED_ROLES));

categoryRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const categories = await categoryService.list();
    res.status(200).json({
      success: true,
      data: categories,
      message: 'Categories retrieved',
    });
  } catch (error) {
    sendError(res, error);
  }
});

categoryRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = CategoryCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(invalidFields(parsed.error.issues));
    }

    const created = await categoryService.create(parsed.data);
    res.status(201).json({ success: true, data: created, message: 'Category created' });
  } catch (error) {
    sendError(res, error);
  }
});

categoryRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const parsed = CategoryUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(invalidFields(parsed.error.issues));
    }

    const updated = await categoryService.update(paramId(req), parsed.data);
    res.status(200).json({ success: true, data: updated, message: 'Category updated' });
  } catch (error) {
    sendError(res, error);
  }
});

categoryRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await categoryService.delete(paramId(req));
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});
