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
  const userId = req.userId;
  if (!userId) {
    return next(new ForbiddenError('Authentication required'));
  }

  try {
    const user = await getDb()('users')
      .where('id', userId)
      .select('role')
      .first();

    if (!user || user.role !== 'admin') {
      return next(new ForbiddenError('Admin access required'));
    }

    next();
  } catch (err) {
    next(err);
  }
}
