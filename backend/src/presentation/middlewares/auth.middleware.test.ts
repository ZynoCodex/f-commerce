import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireAuth, requireBusinessRole } from './auth.middleware.js';
import jwt from 'jsonwebtoken';
import { runWithContext } from '../../infrastructure/database/mongoose/context.js';
import { Request, Response, NextFunction } from 'express';

vi.mock('jsonwebtoken');
vi.mock('../../infrastructure/database/mongoose/context.js');

describe('Auth Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn();
    vi.clearAllMocks();
  });

  describe('requireAuth', () => {
    it('returns 401 if no auth header', () => {
      requireAuth(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing or invalid authorization header',
        message: 'Missing or invalid authorization header',
      });
    });

    it('returns 401 if token is invalid', () => {
      req.headers!.authorization = 'Bearer invalid';
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new Error();
      });

      requireAuth(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid or expired token',
        message: 'Invalid or expired token',
      });
    });

    it('calls next and sets user if token is valid', () => {
      req.headers!.authorization = 'Bearer valid';
      vi.mocked(jwt.verify).mockReturnValue({ userId: '123' } as never);

      requireAuth(req as Request, res as Response, next);
      expect(req.user).toEqual({ userId: '123' });
      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireBusinessRole', () => {
    it('returns 400 if no x-business-id header', () => {
      const middleware = requireBusinessRole(['OWNER']);
      middleware(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing x-business-id header',
        message: 'Missing x-business-id header',
      });
    });

    it('returns 401 if no user attached by requireAuth', () => {
      req.headers!['x-business-id'] = 'biz1';
      // Explicitly set user to undefined to simulate no auth
      (req as any).user = undefined;

      const middleware = requireBusinessRole(['OWNER']);
      middleware(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        message: 'Authentication required',
      });
    });

    it('returns 403 if user lacks access to business', () => {
      req.headers!['x-business-id'] = 'biz1';
      req.user = { userId: '123', memberships: [{ businessId: 'biz2', role: 'OWNER' }] };

      const middleware = requireBusinessRole(['OWNER']);
      middleware(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'You do not have access to this business',
        message: 'You do not have access to this business',
      });
    });

    it('returns 403 if user role is insufficient for OWNER role', () => {
      req.headers!['x-business-id'] = 'biz1';
      req.user = { userId: '123', memberships: [{ businessId: 'biz1', role: 'STAFF' }] };

      const middleware = requireBusinessRole(['OWNER']);
      middleware(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        message: 'You do not have permission to perform this action',
      });
    });

    it('allows STAFF user when role is allowed', () => {
      req.headers!['x-business-id'] = 'biz1';
      req.user = { userId: '123', memberships: [{ businessId: 'biz1', role: 'STAFF' }] };

      const middleware = requireBusinessRole(['OWNER', 'STAFF']);
      middleware(req as Request, res as Response, next);

      expect(runWithContext).toHaveBeenCalledWith(
        { userId: '123', businessId: 'biz1', role: 'STAFF' },
        expect.any(Function),
      );
      const callback = vi.mocked(runWithContext).mock.calls[0][1];
      callback();
      expect(next).toHaveBeenCalled();
    });

    it('sets context and calls next on success', () => {
      req.headers!['x-business-id'] = 'biz1';
      req.user = { userId: '123', memberships: [{ businessId: 'biz1', role: 'OWNER' }] };

      const middleware = requireBusinessRole(['OWNER']);
      middleware(req as Request, res as Response, next);

      expect(runWithContext).toHaveBeenCalledWith(
        { userId: '123', businessId: 'biz1', role: 'OWNER' },
        expect.any(Function),
      );

      // Simulate runWithContext callback
      const callback = vi.mocked(runWithContext).mock.calls[0][1];
      callback();
      expect(next).toHaveBeenCalled();
    });
  });
});
