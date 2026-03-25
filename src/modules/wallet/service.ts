/**
 * Wallet service — business logic for virtual credit balances.
 *
 * All mutations are append-only inserts into wallet_transactions.
 */

import { getDb } from '../../shared/db';
import { BadRequestError } from '../../shared/errors';
import * as queries from './queries';

const DEFAULT_ENTRY_FEE = 100;
const DEFAULT_WIN_CREDIT = 200;

/**
 * Get the current balance for a user.
 */
export async function getBalance(userId: string): Promise<number> {
  return queries.getBalance(userId);
}

/**
 * Get recent transactions for a user.
 */
export async function getTransactions(
  userId: string,
  limit = 20
): Promise<queries.WalletTransaction[]> {
  return queries.getTransactions(userId, limit);
}

/**
 * Credit a user's wallet after winning a bet.
 */
export async function creditWin(
  userId: string,
  seasonId: string,
  betId: string,
  amount: number = DEFAULT_WIN_CREDIT
): Promise<queries.WalletTransaction> {
  return queries.insertTransaction({
    user_id: userId,
    season_id: seasonId,
    type: 'bet_win',
    amount,
    direction: 'credit',
    reference_id: betId,
  });
}

/**
 * Debit a user's wallet when they place a bet (entry fee).
 * Validates sufficient balance before inserting.
 */
export async function debitEntryFee(
  userId: string,
  seasonId: string,
  amount: number = DEFAULT_ENTRY_FEE
): Promise<queries.WalletTransaction> {
  const db = getDb();

  return db.transaction(async (trx) => {
    const balance = await queries.getBalance(userId, trx);

    if (balance < amount) {
      throw new BadRequestError(
        'INSUFFICIENT_BALANCE',
        `Insufficient balance: have ${balance}, need ${amount}`
      );
    }

    return queries.insertTransaction(
      {
        user_id: userId,
        season_id: seasonId,
        type: 'entry_fee',
        amount,
        direction: 'debit',
      },
      trx
    );
  });
}

/**
 * Distribute season-end payouts to the top 3 ranked users.
 *
 * Payout split:
 *   1st place — 50% of pool
 *   2nd place — 30% of pool
 *   3rd place — 20% of pool
 */
export async function distributePayout(
  seasonId: string,
  rankings: Array<{ rank: number; user_id: string }>
): Promise<void> {
  const db = getDb();

  // Calculate the total pool: sum of all debits for the season
  const poolResult = await db('wallet_transactions')
    .where({ season_id: seasonId, direction: 'debit' })
    .sum('amount as total')
    .first();

  const pool = Number(poolResult?.total ?? 0);
  if (pool === 0) return;

  const splits: Record<number, number> = {
    1: 0.5,
    2: 0.3,
    3: 0.2,
  };

  const top3 = rankings.filter((r) => r.rank >= 1 && r.rank <= 3);

  for (const entry of top3) {
    const share = splits[entry.rank];
    if (!share) continue;

    const payout = Math.floor(pool * share);
    if (payout <= 0) continue;

    await queries.insertTransaction({
      user_id: entry.user_id,
      season_id: seasonId,
      type: 'season_payout',
      amount: payout,
      direction: 'credit',
      reference_id: seasonId,
    });
  }
}
