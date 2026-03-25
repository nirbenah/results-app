import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('markets', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('match_id').references('id').inTable('matches');
    t.uuid('competition_id').references('id').inTable('competitions');
    t.text('type').notNullable();
    t.text('status').notNullable().defaultTo('open');
    t.timestamp('closes_at', { useTz: true });
    t.timestamp('settled_at', { useTz: true });

    t.check(
      "type IN ('match_outcome', 'in_match_event', 'player_stat', 'outright')",
      undefined,
      'markets_type_check'
    );
    t.check(
      "status IN ('open', 'suspended', 'settled', 'voided')",
      undefined,
      'markets_status_check'
    );
    // Exactly one of match_id or competition_id must be set
    t.check(
      '(match_id IS NULL) != (competition_id IS NULL)',
      undefined,
      'markets_scope_check'
    );
  });

  await knex.schema.createTable('market_options', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('market_id').notNullable().references('id').inTable('markets').onDelete('CASCADE');
    t.uuid('player_id').references('id').inTable('players');
    t.text('label').notNullable();
    t.text('outcome_key').notNullable();
    t.boolean('is_winner').notNullable().defaultTo(false);
  });

  // Market indexes
  await knex.raw('CREATE INDEX ON markets (match_id, status)');
  await knex.raw("CREATE INDEX ON markets (status) WHERE status = 'open'");
  await knex.raw("CREATE INDEX ON markets (competition_id) WHERE type = 'outright'");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('market_options');
  await knex.schema.dropTableIfExists('markets');
}
