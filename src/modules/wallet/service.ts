/**
 * Wallet service — business logic for virtual credit balances.
 * All mutations are append-only inserts into wallet_transactions.
 * All balances are per-group.
 */

import { getDb } from '../../shared/db';
import { BadRequestError } from '../../shared/errors';
import * as queries from './queries';

const BET_STAKE = 100;
const INITIAL_BALANCE = 1000;
const PARTICIPATION_BONUS = 20;

/**
 * Get the current balance for a user in a group.
 */
export async function getBalance(userId: string, groupId: string): Promise<number> {
  return queries.getBalance(userId, groupId);
}

/**
 * Get recent transactions for a user in a group.
 */
export async function getTransactions(
  userId: string,
  groupId: string,
  limit = 20
): Promise<queries.WalletTransaction[]> {
  return queries.getTransactions(userId, groupId, limit);
}

/**
 * Credit initial balance (1000 credits) when a user joins a betting-format group.
 */
export async function creditInitialBalance(
  userId: string,
  groupId: string
): Promise<queries.WalletTransaction> {
  return queries.insertTransaction({
    user_id: userId,
    group_id: groupId,
    type: 'initial_balance',
    amount: INITIAL_BALANCE,
    direction: 'credit',
  });
}

/**
 * Credit participation bonus (20 credits) for placing a bet.
 */
export async function creditParticipationBonus(
  userId: string,
  groupId: string,
  betId: string
): Promise<queries.WalletTransaction> {
  return queries.insertTransaction({
    user_id: userId,
    group_id: groupId,
    type: 'participation_bonus',
    amount: PARTICIPATION_BONUS,
    direction: 'credit',
    reference_id: betId,
  });
}

/**
 * Debit entry fee when placing a bet (100 credits).
 * Validates sufficient balance before inserting.
 */
export async function debitEntryFee(
  userId: string,
  groupId: string,
  betId?: string
): Promise<queries.WalletTransaction> {
  const db = getDb();

  return db.transaction(async (trx) => {
    const balance = await queries.getBalance(userId, groupId, trx);

    if (balance < BET_STAKE) {
      throw new BadRequestError(
        'INSUFFICIENT_BALANCE',
        `Insufficient balance: have ${balance}, need ${BET_STAKE}`
      );
    }

    return queries.insertTransaction(
      {
        user_id: userId,
        group_id: groupId,
        type: 'entry_fee',
        amount: BET_STAKE,
        direction: 'debit',
        reference_id: betId,
      },
      trx
    );
  });
}

/**
 * Credit a user's wallet after winning a bet.
 * Payout = stake × odds.
 */
export async function creditWin(
  userId: string,
  groupId: string,
  betId: string,
  payout: number
): Promise<queries.WalletTransaction> {
  return queries.insertTransaction({
    user_id: userId,
    group_id: groupId,
    type: 'bet_win',
    amount: payout,
    direction: 'credit',
    reference_id: betId,
  });
}
