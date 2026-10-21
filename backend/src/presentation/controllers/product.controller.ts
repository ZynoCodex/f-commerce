import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import {
  ProductCreateSchema,
  ProductListQuerySchema,
  ProductUpdateSchema,
  ProductVersionSchema,
} from '@f-commerce/contracts';
import { ProductService } from '../../application/services/product.service.js';
import { requireAuth, requireBusinessRole } from '../middlewares/auth.middleware.js';
import { uploadRateLimiter } from '../middlewares/rate-limit.middleware.js';
import { DrizzleProductRepository } from '../../infrastructure/database/drizzle/repositories/product.repository.js';
import { DrizzleCategoryRepository } from '../../infrastructure/database/drizzle/repositories/category.repository.js';
import { CloudinaryProductImageStorage } from '../../infrastructure/services/cloudinary-product-image-storage.js';
import { MAX_PRODUCT_IMAGE_BYTES } from '../../domain/product-image.js';
import { getTenantId } from '../../infrastructure/database/drizzle/context.js';
import { sendInternalError } from './internal-error.js';
import {
  DomainError,
  DuplicateSkuError,
  NotFoundError,
  ProductArchivedError,
  ProductChangedError,
  ProductInUseError,
  ProductNotFoundError,
  ProductNotArchivedError,
  ValidationError,
} from '../../domain/errors.js';

export const productRouter = Router();

const productService = new ProductService(
  new DrizzleProductRepository(),
  new DrizzleCategoryRepository(),
  new CloudinaryProductImageStorage(),
);

const ALLOWED_ROLES: ('OWNER' | 'STAFF')[] = ['OWNER', 'STAFF'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PRODUCT_IMAGE_BYTES, files: 5 },
});

function invalidFields(issues: { path: PropertyKey[] }[]): string[] {
  return Array.from(new Set(issues.map((issue) => String(issue.path[0] ?? '')))).filter(
    (field) => field !== '',
  );
}

/** Optional version on an image mutation, so a stale tab reloads instead of overwriting. */
function optionalVersion(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new ValidationError(['version']);
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ValidationError(['version']);
  }
  return parsed;
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

  if (error instanceof DuplicateSkuError) {
    res.status(409).json({
      error: 'DUPLICATE_SKU',
      message: error.message,
      existingProductId: error.existingProductId,
      existingVariantId: error.existingVariantId,
      archived: error.archived,
    });
    return;
  }

  if (error instanceof ProductChangedError) {
    res.status(409).json({ error: 'PRODUCT_CHANGED', message: error.message });
    return;
  }

  if (error instanceof ProductArchivedError) {
    res.status(409).json({ error: 'PRODUCT_ARCHIVED', message: error.message });
    return;
  }

  if (error instanceof ProductNotArchivedError) {
    res.status(409).json({ error: 'PRODUCT_NOT_ARCHIVED', message: error.message });
    return;
  }

  if (error instanceof ProductInUseError) {
    res.status(409).json({ error: 'PRODUCT_IN_USE', message: error.message });
    return;
  }

  if (error instanceof ProductNotFoundError) {
    res.status(404).json({ error: 'NOT_FOUND', message: error.message });
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

/** Read the acting user and business from the verified request context. */
function actorFromContext(req: Request): { businessId: string; userId: string } {
  const businessId = getTenantId();
  if (!businessId) {
    throw new NotFoundError('No business context');
  }
  const user = req.user as { userId?: string } | undefined;
  return { businessId, userId: user?.userId ?? '' };
}

function paramId(req: Request): string {
  const raw = req.params.id;
  return Array.isArray(raw) ? (raw[0] ?? '') : raw;
}

function paramNumber(req: Request, name: string): number {
  const raw = req.params[name];
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new ValidationError([name]);
  }
  return value;
}

function filesFromRequest(req: Request): Express.Multer.File[] {
  return (req.files as Express.Multer.File[] | undefined) ?? [];
}

productRouter.use(requireAuth);
productRouter.use(requireBusinessRole(ALLOWED_ROLES));

productRouter.get('/', async (req: Request, res: Response) => {
  try {
    const parsed = ProductListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(invalidFields(parsed.error.issues));
    }

    const page = await productService.search(parsed.data);
    res.status(200).json({ success: true, data: page, message: 'Products retrieved' });
  } catch (error) {
    sendError(res, error);
  }
});

productRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = ProductCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(invalidFields(parsed.error.issues));
    }

    const created = await productService.create(parsed.data, actorFromContext(req));
    res.status(201).json({ success: true, data: created, message: 'Product created' });
  } catch (error) {
    sendError(res, error);
  }
});

productRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const product = await productService.get(paramId(req));
    res.status(200).json({ success: true, data: product, message: 'Product retrieved' });
  } catch (error) {
    sendError(res, error);
  }
});

productRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const parsed = ProductUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(invalidFields(parsed.error.issues));
    }

    const updated = await productService.update(paramId(req), parsed.data);
    res.status(200).json({ success: true, data: updated, message: 'Product updated' });
  } catch (error) {
    sendError(res, error);
  }
});

productRouter.post('/:id/archive', async (req: Request, res: Response) => {
  try {
    const parsed = ProductVersionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(invalidFields(parsed.error.issues));
    }

    const archived = await productService.archive(
      paramId(req),
      parsed.data.version,
      actorFromContext(req),
    );
    res.status(200).json({ success: true, data: archived, message: 'Product archived' });
  } catch (error) {
    sendError(res, error);
  }
});

productRouter.post('/:id/restore', async (req: Request, res: Response) => {
  try {
    const parsed = ProductVersionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(invalidFields(parsed.error.issues));
    }

    const restored = await productService.restore(
      paramId(req),
      parsed.data.version,
      actorFromContext(req),
    );
    res.status(200).json({ success: true, data: restored, message: 'Product restored' });
  } catch (error) {
    sendError(res, error);
  }
});

productRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const parsed = ProductVersionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(invalidFields(parsed.error.issues));
    }

    await productService.delete(paramId(req), parsed.data.version, actorFromContext(req));
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

productRouter.post(
  '/:id/images',
  uploadRateLimiter,
  upload.array('images', 5),
  async (req: Request, res: Response) => {
    try {
      const files = filesFromRequest(req);
      if (files.length === 0) {
        throw new ValidationError(['images'], 'At least one image is required');
      }

      const updated = await productService.addImages(
        paramId(req),
        files.map((file) => file.buffer),
        actorFromContext(req),
        optionalVersion(req.body?.version),
      );
      res.status(200).json({ success: true, data: updated, message: 'Product images updated' });
    } catch (error) {
      sendError(res, error);
    }
  },
);

productRouter.delete('/:id/images/:index', async (req: Request, res: Response) => {
  try {
    const index = paramNumber(req, 'index');
    const updated = await productService.removeImage(
      paramId(req),
      index,
      optionalVersion(req.query.version),
    );
    res.status(200).json({ success: true, data: updated, message: 'Product image removed' });
  } catch (error) {
    sendError(res, error);
  }
});

productRouter.post(
  '/:id/variants/:variantIndex/image',
  uploadRateLimiter,
  upload.single('image'),
  async (req: Request, res: Response) => {
    try {
      const variantIndex = paramNumber(req, 'variantIndex');
      if (!req.file) {
        throw new ValidationError(['image'], 'An image is required');
      }

      const updated = await productService.setVariantImage(
        paramId(req),
        variantIndex,
        req.file.buffer,
        actorFromContext(req),
        optionalVersion(req.body?.version),
      );
      res.status(200).json({ success: true, data: updated, message: 'Variant image updated' });
    } catch (error) {
      sendError(res, error);
    }
  },
);

// Multer raises size and file count failures before a route handler runs, so
// map them to the same validation shape instead of a generic 500.
productRouter.use((error: unknown, req: Request, res: Response, next: NextFunction): void => {
  if (error instanceof multer.MulterError) {
    const field = req.path.includes('/variants/') ? 'image' : 'images';
    const message =
      error.code === 'LIMIT_FILE_SIZE' ? 'Images must be 2 MB or smaller' : 'Invalid image upload';
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message,
      fields: [error.field ?? field],
    });
    return;
  }
  next(error);
});
