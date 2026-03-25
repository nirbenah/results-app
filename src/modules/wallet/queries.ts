/**
 * Wallet DB queries — all operations on the wallet_transactions table.
 *
 * APPEND ONLY: rows are never updated or deleted.
 * Balance = SUM(credits) - SUM(debits) per user per group.
 */

import { Knex } from 'knex';
import { getDb } from '../../shared/db';

export type TransactionType = 'initial_balance' | 'entry_fee' | 'bet_win' | 'participation_bonus' | 'refund';
export type TransactionDirection = 'debit' | 'credit';

export interface WalletTransaction {
  id: string;
  user_id: string;
  group_id: string;
  type: TransactionType;
  amount: number;
  direction: TransactionDirection;
  reference_id: string | null;
  created_at: string;
}

/**
 * Calculate the current balance for a user in a specific group.
 */
export async function getBalance(userId: string, groupId: string, trx?: Knex): Promise<number> {
  const db = trx ?? getDb();

  const result = await db('wallet_transactions')
    .where({ user_id: userId, group_id: groupId })
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
 * Return the N most recent transactions for a user in a group, newest first.
 */
export async function getTransactions(
  userId: string,
  groupId: string,
  limit = 20,
  trx?: Knex
): Promise<WalletTransaction[]> {
  const db = trx ?? getDb();

  return db('wallet_transactions')
    .where({ user_id: userId, group_id: groupId })
    .orderBy('created_at', 'desc')
    .limit(limit);
}

/**
 * Insert a new transaction row. Returns the created row.
 */
export async function insertTransaction(
  tx: {
    user_id: string;
    group_id: string;
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
      group_id: tx.group_id,
      type: tx.type,
      amount: tx.amount,
      direction: tx.direction,
      reference_id: tx.reference_id ?? null,
    })
    .returning('*');

  return row;
}
