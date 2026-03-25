/**
 * Wallet HTTP routes.
 *
 * GET /v1/wallet — returns current balance and recent transactions.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../../shared/errors';
import * as walletService from './service';

// Extend Express Request to include userId / correlationId
interface AuthenticatedRequest extends Request {
  userId?: string;
  correlationId?: string;
}

const router = Router();

/**
 * GET /wallet
 * Returns the authenticated user's balance and recent transactions.
 */
router.get(
  '/wallet',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId;
      if (!userId) {
        throw new UnauthorizedError();
      }

      const [balance, transactions] = await Promise.all([
        walletService.getBalance(userId),
        walletService.getTransactions(userId, 20),
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
