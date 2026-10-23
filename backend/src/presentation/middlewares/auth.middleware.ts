import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../infrastructure/config.js';
import { runWithContext } from '../../infrastructure/database/drizzle/context.js';

interface JwtPayload {
  userId: string;
  memberships: { businessId: string; role: 'OWNER' | 'STAFF' }[];
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Missing or invalid authorization header',
      message: 'Missing or invalid authorization header',
    });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    if (typeof decoded.userId !== 'string' || decoded.userId.trim() === '') {
      res
        .status(401)
        .json({ error: 'Invalid or expired token', message: 'Invalid or expired token' });
      return;
    }
    req.user = decoded;
    next();
  } catch {
    res
      .status(401)
      .json({ error: 'Invalid or expired token', message: 'Invalid or expired token' });
  }
}

export function requireBusinessRole(allowedRoles: ('OWNER' | 'STAFF')[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // The businessId could come from a header, a param, or a query string.
    // For this design, let's assume it is passed in the headers as 'x-business-id'
    const businessId = req.headers['x-business-id'] as string;

    if (!businessId) {
      res
        .status(400)
        .json({ error: 'Missing x-business-id header', message: 'Missing x-business-id header' });
      return;
    }

    const user = req.user;
    if (!user) {
      res
        .status(401)
        .json({ error: 'Authentication required', message: 'Authentication required' });
      return;
    }

    const membership = user.memberships.find((m) => m.businessId === businessId);
    if (!membership) {
      res.status(403).json({
        error: 'You do not have access to this business',
        message: 'You do not have access to this business',
      });
      return;
    }

    if (!allowedRoles.includes(membership.role)) {
      res.status(403).json({
        error: 'Insufficient permissions',
        message: 'You do not have permission to perform this action',
      });
      return;
    }

    // Set the tenant context carried through AsyncLocalStorage
    runWithContext({ userId: user.userId, businessId, role: membership.role }, () => {
      next();
    });
  };
}
