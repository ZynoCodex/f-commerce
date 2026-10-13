import { Request, Response, Router } from 'express';
import { AuthService } from '../../application/services/auth.service.js';
import { requireAuth, requireBusinessRole } from '../middlewares/auth.middleware.js';
import { config } from '../../infrastructure/config.js';
import {
  RegisterSchema,
  LoginSchema,
  OAuthLoginSchema,
  InviteStaffSchema,
} from '@f-commerce/contracts';
import { MongooseAuthRepository } from '../../infrastructure/database/mongoose/repositories/auth.repository.js';
import {
  DuplicateEmailError,
  UnauthorizedError,
  ConflictError,
  NotFoundError,
} from '../../domain/errors.js';

export const authRouter = Router();

// Instantiate repository and service (simple DI for now)
const authRepository = new MongooseAuthRepository();
const authService = new AuthService(authRepository);

authRouter.post(
  '/invite',
  requireAuth,
  requireBusinessRole(['OWNER']),
  async (req: Request, res: Response) => {
    try {
      const parsed = InviteStaffSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid input', details: parsed.error.format() });
        return;
      }
      const { email, role } = parsed.data;

      const businessId = req.headers['x-business-id'] as string;
      await authService.inviteStaff(email, role, businessId);

      res.status(200).json({ success: true, message: 'User invited successfully' });
    } catch (error) {
      if (error instanceof ConflictError) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }
  },
);

authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.format() });
      return;
    }
    const { email, password, name, businessName } = parsed.data;
    const tokens = await authService.register(email, password, name, businessName);

    // Extract businessId from the access token payload
    let businessId: string | undefined;
    try {
      const payload = tokens.accessToken.split('.')[1];
      if (payload) {
        businessId = JSON.parse(Buffer.from(payload, 'base64').toString()).memberships?.[0]?.businessId;
      }
    } catch {
      // Token decode failed, leave businessId undefined
    }

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    res.status(201).json({ accessToken: tokens.accessToken, businessId });
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      res.status(409).json({ error: error.message });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.format() });
      return;
    }
    const { email, password } = parsed.data;
    const tokens = await authService.login(email, password);

    // Extract businessId from the access token payload
    let businessId: string | undefined;
    try {
      const payload = tokens.accessToken.split('.')[1];
      if (payload) {
        businessId = JSON.parse(Buffer.from(payload, 'base64').toString()).memberships?.[0]?.businessId;
      }
    } catch {
      // Token decode failed, leave businessId undefined
    }

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    res.status(200).json({ accessToken: tokens.accessToken, businessId });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      res.status(401).json({ error: error.message });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
});

authRouter.post('/oauth/:provider', async (req: Request, res: Response) => {
  try {
    if (config.NODE_ENV === 'production') {
      res.status(501).json({ error: 'OAuth mock login is disabled in production' });
      return;
    }

    const provider = req.params.provider as string;
    const parsed = OAuthLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.format() });
      return;
    }
    const { email, name, providerId } = parsed.data;

    const tokens = await authService.oauthLogin(email, name, provider, providerId);

    // Extract businessId from the access token payload
    let businessId: string | undefined;
    try {
      const payload = tokens.accessToken.split('.')[1];
      if (payload) {
        businessId = JSON.parse(Buffer.from(payload, 'base64').toString()).memberships?.[0]?.businessId;
      }
    } catch {
      // Token decode failed, leave businessId undefined
    }

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    res.status(200).json({ accessToken: tokens.accessToken, businessId });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      res.status(401).json({ error: error.message });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
});

authRouter.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      res.status(400).json({ error: 'No refresh token provided' });
      return;
    }

    const tokens = await authService.refresh(refreshToken);
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    res.status(200).json({ accessToken: tokens.accessToken });
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof NotFoundError) {
      res.status(401).json({ error: error.message });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
});

authRouter.post('/logout', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await authService.logout(refreshToken);
      res.clearCookie('refreshToken');
    }
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const profile = await authService.getProfile(userId);
    res.status(200).json(profile);
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
});
