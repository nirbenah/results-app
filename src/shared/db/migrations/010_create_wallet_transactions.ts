import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('wallet_transactions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users');
    t.uuid('season_id').references('id').inTable('seasons');
    t.text('type').notNullable();
    t.integer('amount').notNullable();
    t.text('direction').notNullable();
    t.uuid('reference_id');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    t.check(
      "type IN ('entry_fee', 'bet_win', 'season_payout', 'refund')",
      undefined,
      'wallet_tx_type_check'
    );
    t.check('amount > 0', undefined, 'wallet_tx_amount_check');
    t.check(
      "direction IN ('debit', 'credit')",
      undefined,
      'wallet_tx_direction_check'
    );
  });

  await knex.raw('CREATE INDEX ON wallet_transactions (user_id, created_at DESC)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('wallet_transactions');
}
