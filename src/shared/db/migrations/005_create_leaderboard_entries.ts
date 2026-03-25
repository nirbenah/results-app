import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('leaderboard_entries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('season_id').notNullable().references('id').inTable('seasons');
    t.uuid('user_id').notNullable().references('id').inTable('users');
    t.integer('total_bets').notNullable().defaultTo(0);
    t.integer('wins').notNullable().defaultTo(0);
    t.integer('losses').notNullable().defaultTo(0);
    t.integer('current_streak').notNullable().defaultTo(0);
    t.integer('best_streak').notNullable().defaultTo(0);
    t.decimal('win_rate', 5, 4).notNullable().defaultTo(0);
    t.integer('rank');
    t.timestamp('updated_at', { useTz: true });

    t.unique(['season_id', 'user_id']);
  });

  // Leaderboard read indexes
  await knex.raw('CREATE INDEX ON leaderboard_entries (season_id, rank)');
  await knex.raw('CREATE INDEX ON leaderboard_entries (season_id, win_rate DESC, best_streak DESC)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('leaderboard_entries');
}
