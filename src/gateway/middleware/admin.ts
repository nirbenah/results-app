/**
 * Admin authorization middleware.
 * Requires the user to have role='admin' in the users table.
 * Must be placed AFTER the authenticate middleware.
 */

import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../../shared/errors';
import { getDb } from '../../shared/db';

export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  // Always check the REAL user (not impersonated) for admin access
  const realId = req.realUserId || req.userId;
  if (!realId) {
    return next(new ForbiddenError('Authentication required'));
  }

  try {
    const user = await getDb()('users')
      .where('id', realId)
      .select('role')
      .first();

    if (!user || user.role !== 'admin') {
      return next(new ForbiddenError('Admin access required'));
    }

    // Admin routes always operate as the real admin, not the impersonated user
    req.userId = realId;

    next();
  } catch (err) {
    next(err);
  }
}
