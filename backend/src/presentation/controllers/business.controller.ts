import { Request, Response, Router } from 'express';
import multer from 'multer';
import { BusinessService } from '../../application/services/business.service.js';
import { requireAuth, requireBusinessRole } from '../middlewares/auth.middleware.js';
import { DrizzleBusinessRepository } from '../../infrastructure/database/drizzle/repositories/business.repository.js';
import { CloudinaryService } from '../../infrastructure/services/cloudinary.service.js';
import {
  BusinessProfileSchema,
  BusinessProfileUpdateSchema,
  DraftSaveSchema,
} from '@f-commerce/contracts';
import { NotFoundError } from '../../domain/errors.js';
import { getTenantId, runWithContext } from '../../infrastructure/database/drizzle/context.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

/**
 * Detect image type by inspecting magic bytes at the start of the buffer.
 * This is more reliable than trusting the Content-Type header, which is
 * client-controlled and can be spoofed.
 *
 * Returns the detected MIME type or null if the buffer doesn't match a
 * supported image format.
 */
function detectImageType(buffer: Buffer): string | null {
  // JPEG: starts with FF D8 FF (3 bytes minimum)
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: starts with 89 50 4E 47 0D 0A 1A 0A (8 bytes)
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // GIF: starts with "GIF87a" or "GIF89a" (6 bytes minimum)
  if (buffer.length >= 6) {
    const gif = buffer.toString('ascii', 0, 6);
    if (gif === 'GIF87a' || gif === 'GIF89a') {
      return 'image/gif';
    }
  }

  // WebP: RIFF....WEBP (12 bytes minimum, the 'WEBP' signature is at offset 8)
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

export const businessRouter = Router();

const businessRepository = new DrizzleBusinessRepository();
const cloudinaryService = new CloudinaryService();
const businessService = new BusinessService(businessRepository, cloudinaryService);

businessRouter.use(requireAuth);

// Onboarding gate: block access for incomplete businesses, except onboarding routes
businessRouter.use((req, res, next) => {
  // Exempt onboarding completion, draft, and logo upload endpoints
  if (req.path === '/onboarding' || req.path.startsWith('/onboarding/') || req.path === '/logo') {
    next();
    return;
  }

  // Use the x-business-id header (consistent with requireBusinessRole) so that
  // STAFF users with multiple memberships are evaluated against the business
  // they are actually targeting, not always memberships[0].
  const businessId = req.headers['x-business-id'] as string | undefined;
  if (!businessId) {
    res
      .status(400)
      .json({ error: 'Missing x-business-id header', message: 'Missing x-business-id header' });
    return;
  }

  const user = req.user as {
    userId: string;
    memberships: { businessId: string; role: 'OWNER' | 'STAFF' }[];
  };
  const membership = user?.memberships?.find((m) => m.businessId === businessId);

  // Reject callers who are not a member of the business they are targeting.
  // Without this, a non-member's request would run a DB lookup against a
  // business they have no relationship with, leaking its existence and
  // onboarding status via the response code.
  if (!membership) {
    res.status(403).json({
      error: 'Insufficient permissions',
      message: 'You are not a member of this business',
    });
    return;
  }

  // Run the DB lookup inside the tenant context so the query is isolated
  // even if the Business model later adopts the tenant plugin.
  runWithContext(
    {
      userId: user.userId,
      businessId,
      role: membership.role,
    },
    async () => {
      try {
        const business = await businessService.getBusiness(businessId);
        if (!business || !business.onboardingComplete) {
          res.status(403).json({
            error: 'Onboarding required',
            message: 'Please complete your business profile before accessing this resource',
          });
          return;
        }
        next();
      } catch {
        res
          .status(500)
          .json({ error: 'Internal server error', message: 'Failed to verify onboarding status' });
      }
    },
  );
});

businessRouter.get(
  '/me',
  requireBusinessRole(['OWNER', 'STAFF']),
  async (req: Request, res: Response) => {
    try {
      // Use tenant context businessId set by requireBusinessRole middleware
      const businessId = getTenantId();
      if (!businessId) {
        res.status(400).json({ error: 'No business context', message: 'Missing business context' });
        return;
      }

      const business = await businessService.getBusiness(businessId);
      if (!business) {
        res.status(404).json({ error: 'Business not found', message: 'Business not found' });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          name: business.name,
          currency: business.currency,
          logoUrl: business.logoUrl ?? null,
          address: business.address ?? null,
          onboardingComplete: business.onboardingComplete,
          onboardingDraft: business.onboardingDraft,
        },
        message: 'Business profile retrieved',
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
);

businessRouter.get(
  '/onboarding',
  requireBusinessRole(['OWNER']),
  async (req: Request, res: Response) => {
    try {
      const businessId = getTenantId();
      if (!businessId) {
        res.status(400).json({ error: 'No business context', message: 'Missing business context' });
        return;
      }

      const business = await businessService.getBusiness(businessId);
      if (!business) {
        res.status(404).json({ error: 'Business not found', message: 'Business not found' });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          name: business.name,
          currency: business.currency,
          logoUrl: business.logoUrl ?? null,
          address: business.address ?? null,
          onboardingComplete: business.onboardingComplete,
          onboardingDraft: business.onboardingDraft ?? null,
        },
        message: 'Onboarding state retrieved',
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
);

businessRouter.put('/me', requireBusinessRole(['OWNER']), async (req: Request, res: Response) => {
  try {
    const parsed = BusinessProfileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.format() });
      return;
    }

    // Use tenant context businessId set by requireBusinessRole middleware
    const businessId = getTenantId();
    if (!businessId) {
      res.status(400).json({ error: 'No business context', message: 'Missing business context' });
      return;
    }

    const business = await businessService.updateBusiness(businessId, parsed.data);
    if (!business) {
      res.status(404).json({ error: 'Business not found', message: 'Business not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        name: business.name,
        currency: business.currency,
        logoUrl: business.logoUrl ?? null,
        address: business.address ?? null,
        onboardingComplete: business.onboardingComplete,
      },
      message: 'Business profile updated',
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
});

businessRouter.post(
  '/logo',
  requireBusinessRole(['OWNER']),
  upload.single('image'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded', message: 'Please upload an image file' });
        return;
      }

      const maxSize = 5 * 1024 * 1024;
      if (req.file.size > maxSize) {
        res.status(400).json({ error: 'File too large', message: 'Maximum file size is 5MB' });
        return;
      }

      // Validate file by magic bytes (MIME type from header is attacker-controlled)
      const detectedType = detectImageType(req.file.buffer);
      if (!detectedType) {
        res.status(400).json({
          error: 'Invalid file type',
          message: 'Only JPEG, PNG, GIF, and WebP images are allowed',
        });
        return;
      }

      // Use tenant context businessId set by requireBusinessRole middleware
      const businessId = getTenantId();
      if (!businessId) {
        res.status(400).json({ error: 'No business context', message: 'Missing business context' });
        return;
      }

      const result = await businessService.uploadLogo(businessId, req.file.buffer);
      // Persist the logo URL to the business so it's available during onboarding
      await businessService.updateBusiness(businessId, { logoUrl: result.logoUrl });
      res.status(200).json({
        success: true,
        data: { logoUrl: result.logoUrl },
        message: 'Logo uploaded successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(502).json({ error: 'Cloudinary upload failed', message });
    }
  },
);

businessRouter.put(
  '/onboarding',
  requireBusinessRole(['OWNER']),
  async (req: Request, res: Response) => {
    try {
      const parsed = BusinessProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid input', details: parsed.error.format() });
        return;
      }

      // Use tenant context businessId set by requireBusinessRole middleware
      const businessId = getTenantId();
      if (!businessId) {
        res.status(400).json({ error: 'No business context', message: 'Missing business context' });
        return;
      }

      const { name, currency, address, logoUrl } = parsed.data;
      const business = await businessService.completeOnboarding(businessId, {
        name,
        currency,
        address,
        logoUrl,
      });

      if (!business) {
        res.status(404).json({ error: 'Business not found', message: 'Business not found' });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          name: business.name,
          currency: business.currency,
          logoUrl: business.logoUrl ?? null,
          address: business.address ?? null,
          onboardingComplete: business.onboardingComplete,
        },
        message: 'Onboarding completed',
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }
  },
);

businessRouter.put(
  '/onboarding/draft',
  requireBusinessRole(['OWNER']),
  async (req: Request, res: Response) => {
    try {
      const parsed = DraftSaveSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid input', details: parsed.error.format() });
        return;
      }

      const { field, value } = parsed.data;
      // Use tenant context businessId set by requireBusinessRole middleware
      const businessId = getTenantId();
      if (!businessId) {
        res.status(400).json({ error: 'No business context', message: 'Missing business context' });
        return;
      }

      await businessService.saveDraft(businessId, field, value);
      res.status(200).json({ success: true, message: 'Draft saved' });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
);
