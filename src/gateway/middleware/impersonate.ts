/**
 * Admin impersonation middleware.
 * If the request has an X-Impersonate-User header and the caller is admin,
 * swap req.userId to the target user so the entire app behaves as that user.
 * req.realUserId always holds the original (admin) identity.
 *
 * Must be placed AFTER the authenticate middleware.
 */

import { Request, Response, NextFunction } from 'express';
import { getDb } from '../../shared/db';

export async function impersonate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  // Always store the real caller
  req.realUserId = req.userId;

  const targetUserId = req.headers['x-impersonate-user'] as string | undefined;
  if (!targetUserId || !req.userId) {
    return next();
  }

  try {
    // Verify the caller is admin
    const caller = await getDb()('users')
      .where('id', req.userId)
      .select('role')
      .first();

    if (!caller || caller.role !== 'admin') {
      // Not admin — ignore the header silently
      return next();
    }

    // Verify target user exists
    const target = await getDb()('users')
      .where('id', targetUserId)
      .select('id')
      .first();

    if (!target) {
      // Target user doesn't exist — ignore
      return next();
    }

    // Swap identity
    req.userId = targetUserId;
    next();
  } catch (err) {
    next(err);
  }
}
