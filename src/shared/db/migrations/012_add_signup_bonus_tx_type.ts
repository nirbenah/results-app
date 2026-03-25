import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Drop the old check constraint and add the updated one with signup_bonus
  await knex.raw('ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_tx_type_check');
  await knex.raw(`
    ALTER TABLE wallet_transactions
    ADD CONSTRAINT wallet_tx_type_check
    CHECK (type IN ('entry_fee', 'bet_win', 'season_payout', 'refund', 'signup_bonus'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_tx_type_check');
  await knex.raw(`
    ALTER TABLE wallet_transactions
    ADD CONSTRAINT wallet_tx_type_check
    CHECK (type IN ('entry_fee', 'bet_win', 'season_payout', 'refund'))
  `);
}
