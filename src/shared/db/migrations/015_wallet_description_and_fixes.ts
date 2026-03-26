/**
 * Migration 015 — Add description to wallet_transactions for richer display
 */
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add description column to wallet_transactions
  await knex.schema.alterTable('wallet_transactions', (t) => {
    t.text('description'); // e.g., "Arsenal vs Chelsea — match outcome"
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('wallet_transactions', (t) => {
    t.dropColumn('description');
  });
}
