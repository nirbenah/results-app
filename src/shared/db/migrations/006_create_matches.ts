import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('matches', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('competition_id').notNullable().references('id').inTable('competitions');
    t.text('home_team').notNullable();
    t.text('away_team').notNullable();
    t.text('status').notNullable().defaultTo('scheduled');
    t.jsonb('result');
    t.timestamp('kickoff_at', { useTz: true }).notNullable();

    t.check(
      "status IN ('scheduled', 'live', 'finished', 'cancelled')",
      undefined,
      'matches_status_check'
    );
  });

  await knex.raw('CREATE INDEX ON matches (competition_id, kickoff_at)');
  await knex.raw("CREATE INDEX ON matches (status) WHERE status IN ('scheduled', 'live')");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('matches');
}
