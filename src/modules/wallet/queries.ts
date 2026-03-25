/**
 * Wallet DB queries — all operations on the wallet_transactions table.
 *
 * APPEND ONLY: rows are never updated or deleted.
 * Balance = SUM(credits) - SUM(debits).
 */

import { Knex } from 'knex';
import { getDb } from '../../shared/db';

export type TransactionType = 'entry_fee' | 'bet_win' | 'season_payout' | 'refund' | 'signup_bonus';
export type TransactionDirection = 'debit' | 'credit';

export interface WalletTransaction {
  id: string;
  user_id: string;
  season_id: string | null;
  type: TransactionType;
  amount: number;
  direction: TransactionDirection;
  reference_id: string | null;
  created_at: string;
}

/**
 * Calculate the current balance for a user.
 * Balance = SUM of credit amounts - SUM of debit amounts.
 */
export async function getBalance(userId: string, trx?: Knex): Promise<number> {
  const db = trx ?? getDb();

  const result = await db('wallet_transactions')
    .where({ user_id: userId })
    .select(
      db.raw(`
        COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END), 0)
        -
        COALESCE(SUM(CASE WHEN direction = 'debit'  THEN amount ELSE 0 END), 0)
        AS balance
      `)
    )
    .first();

  return Number(result?.balance ?? 0);
}

/**
 * Return the N most recent transactions for a user, newest first.
 */
export async function getTransactions(
  userId: string,
  limit = 20,
  trx?: Knex
): Promise<WalletTransaction[]> {
  const db = trx ?? getDb();

  return db('wallet_transactions')
    .where({ user_id: userId })
    .orderBy('created_at', 'desc')
    .limit(limit);
}

/**
 * Insert a new transaction row. Returns the created row.
 */
export async function insertTransaction(
  tx: {
    user_id: string;
    season_id?: string | null;
    type: TransactionType;
    amount: number;
    direction: TransactionDirection;
    reference_id?: string | null;
  },
  trx?: Knex
): Promise<WalletTransaction> {
  const db = trx ?? getDb();

  const [row] = await db('wallet_transactions')
    .insert({
      user_id: tx.user_id,
      season_id: tx.season_id ?? null,
      type: tx.type,
      amount: tx.amount,
      direction: tx.direction,
      reference_id: tx.reference_id ?? null,
    })
    .returning('*');

  return row;
}
