import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('bets', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users');
    t.uuid('season_id').notNullable().references('id').inTable('seasons');
    t.uuid('market_option_id').notNullable().references('id').inTable('market_options');
    t.text('status').notNullable().defaultTo('pending');
    t.timestamp('placed_at', { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp('settled_at', { useTz: true });

    t.unique(['user_id', 'market_option_id']); // one bet per option per user
    t.check(
      "status IN ('pending', 'won', 'lost', 'void')",
      undefined,
      'bets_status_check'
    );
  });

  // Bet indexes
  await knex.raw('CREATE INDEX ON bets (user_id, season_id)');
  await knex.raw('CREATE INDEX ON bets (market_option_id, status)');
  await knex.raw("CREATE INDEX ON bets (status) WHERE status = 'pending'");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('bets');
}
