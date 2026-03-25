/**
 * Wallet HTTP routes.
 *
 * GET /v1/wallet?group_id=... — returns current balance and recent transactions for a group.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { BadRequestError, UnauthorizedError } from '../../shared/errors';
import * as walletService from './service';

const router = Router();

/**
 * GET /wallet?group_id=<uuid>
 * Returns the authenticated user's balance and recent transactions for a specific group.
 */
router.get(
  '/wallet',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId;
      if (!userId) {
        throw new UnauthorizedError();
      }

      const groupId = req.query.group_id as string | undefined;
      if (!groupId) {
        throw new BadRequestError('VALIDATION', 'group_id query parameter is required');
      }

      const [balance, transactions] = await Promise.all([
        walletService.getBalance(userId, groupId),
        walletService.getTransactions(userId, groupId, 20),
      ]);

      res.json({
        balance,
        transactions: transactions.map((tx) => ({
          type: tx.type,
          amount: tx.amount,
          direction: tx.direction,
          created_at: tx.created_at,
        })),
      });
    } catch (err) {
      next(err);
    }
  }
);

export { router };
