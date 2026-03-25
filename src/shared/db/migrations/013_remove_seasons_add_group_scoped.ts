import { Knex } from 'knex';

/**
 * Major refactor: remove seasons concept, make everything group-scoped.
 *
 * - groups gets scoring_format, allowed_bet_types, status
 * - users gets role (user/admin)
 * - New group_competitions join table (replaces seasons.competition_id)
 * - bets: season_id → group_id, add predicted scores
 * - wallet_transactions: season_id → group_id, new transaction types
 * - leaderboard_entries: season_id → group_id, add points
 * - market_options gets odds
 * - Drop seasons table
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Add new columns to groups
  await knex.schema.alterTable('groups', (t) => {
    t.text('scoring_format').notNullable().defaultTo('betting');
    t.specificType('allowed_bet_types', 'text[]').notNullable().defaultTo('{match_outcome}');
    t.text('status').notNullable().defaultTo('active');
  });
  await knex.raw(`
    ALTER TABLE groups ADD CONSTRAINT groups_scoring_format_check
      CHECK (scoring_format IN ('points', 'betting'))
  `);
  await knex.raw(`
    ALTER TABLE groups ADD CONSTRAINT groups_status_check
      CHECK (status IN ('active', 'finished'))
  `);

  // 2. Add role to users
  await knex.schema.alterTable('users', (t) => {
    t.text('role').notNullable().defaultTo('user');
  });
  await knex.raw(`
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('user', 'admin'))
  `);

  // 3. Create group_competitions table
  await knex.schema.createTable('group_competitions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('group_id').notNullable().references('id').inTable('groups').onDelete('CASCADE');
    t.uuid('competition_id').notNullable().references('id').inTable('competitions');
    t.timestamp('added_at', { useTz: true }).defaultTo(knex.fn.now());
    t.unique(['group_id', 'competition_id']);
  });
  await knex.raw('CREATE INDEX ON group_competitions (group_id)');
  await knex.raw('CREATE INDEX ON group_competitions (competition_id)');

  // 4. Migrate seasons data into group_competitions
  await knex.raw(`
    INSERT INTO group_competitions (group_id, competition_id)
    SELECT group_id, competition_id FROM seasons
    ON CONFLICT DO NOTHING
  `);

  // 5. Add odds to market_options
  await knex.schema.alterTable('market_options', (t) => {
    t.decimal('odds', 5, 2).nullable();
  });

  // 6. Alter bets: add group_id, populate from seasons, drop season_id
  await knex.schema.alterTable('bets', (t) => {
    t.uuid('group_id').nullable().references('id').inTable('groups');
    t.integer('predicted_home_score').nullable();
    t.integer('predicted_away_score').nullable();
  });
  // Populate group_id from seasons
  await knex.raw(`
    UPDATE bets SET group_id = seasons.group_id
    FROM seasons WHERE bets.season_id = seasons.id
  `);
  // For any bets without a valid season (shouldn't happen, but safety)
  await knex.raw(`DELETE FROM bets WHERE group_id IS NULL`);
  // Drop old unique constraint and create new one
  await knex.raw(`ALTER TABLE bets DROP CONSTRAINT IF EXISTS bets_user_id_market_option_id_unique`);
  await knex.raw(`ALTER TABLE bets ADD CONSTRAINT bets_user_group_option_unique UNIQUE (user_id, group_id, market_option_id)`);
  // Drop old indexes
  await knex.raw(`DROP INDEX IF EXISTS bets_user_id_season_id_index`);
  // Make group_id NOT NULL and drop season_id
  await knex.raw(`ALTER TABLE bets ALTER COLUMN group_id SET NOT NULL`);
  await knex.schema.alterTable('bets', (t) => {
    t.dropColumn('season_id');
  });
  // New indexes
  await knex.raw('CREATE INDEX ON bets (user_id, group_id)');
  await knex.raw('CREATE INDEX ON bets (group_id, market_option_id)');

  // 7. Alter wallet_transactions: add group_id, new types, drop season_id
  await knex.schema.alterTable('wallet_transactions', (t) => {
    t.uuid('group_id').nullable().references('id').inTable('groups');
  });
  // Populate group_id from seasons
  await knex.raw(`
    UPDATE wallet_transactions SET group_id = seasons.group_id
    FROM seasons WHERE wallet_transactions.season_id = seasons.id
  `);
  // Delete signup_bonus rows (no longer used — initial_balance is per-group)
  await knex.raw(`DELETE FROM wallet_transactions WHERE type = 'signup_bonus'`);
  // Delete any remaining rows without group_id
  await knex.raw(`DELETE FROM wallet_transactions WHERE group_id IS NULL`);
  // Update type constraint
  await knex.raw(`ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check`);
  await knex.raw(`ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_tx_type_check`);
  await knex.raw(`
    ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
      CHECK (type IN ('initial_balance', 'entry_fee', 'bet_win', 'participation_bonus', 'refund'))
  `);
  // Make group_id NOT NULL, drop season_id
  await knex.raw(`ALTER TABLE wallet_transactions ALTER COLUMN group_id SET NOT NULL`);
  await knex.raw(`DROP INDEX IF EXISTS wallet_transactions_user_id_created_at_desc_index`);
  await knex.schema.alterTable('wallet_transactions', (t) => {
    t.dropColumn('season_id');
  });
  await knex.raw('CREATE INDEX ON wallet_transactions (user_id, group_id, created_at DESC)');

  // 8. Alter leaderboard_entries: add group_id + points, drop season_id
  await knex.schema.alterTable('leaderboard_entries', (t) => {
    t.uuid('group_id').nullable().references('id').inTable('groups');
    t.integer('points').notNullable().defaultTo(0);
  });
  await knex.raw(`
    UPDATE leaderboard_entries SET group_id = seasons.group_id
    FROM seasons WHERE leaderboard_entries.season_id = seasons.id
  `);
  await knex.raw(`DELETE FROM leaderboard_entries WHERE group_id IS NULL`);
  // Drop old constraints and indexes
  await knex.raw(`ALTER TABLE leaderboard_entries DROP CONSTRAINT IF EXISTS leaderboard_entries_season_id_user_id_unique`);
  await knex.raw(`DROP INDEX IF EXISTS leaderboard_entries_season_id_rank_index`);
  await knex.raw(`DROP INDEX IF EXISTS leaderboard_entries_season_id_win_rate_desc_best_streak_desc_index`);
  // New constraint and indexes
  await knex.raw(`ALTER TABLE leaderboard_entries ALTER COLUMN group_id SET NOT NULL`);
  await knex.raw(`ALTER TABLE leaderboard_entries ADD CONSTRAINT leaderboard_entries_group_user_unique UNIQUE (group_id, user_id)`);
  await knex.schema.alterTable('leaderboard_entries', (t) => {
    t.dropColumn('season_id');
  });
  await knex.raw('CREATE INDEX ON leaderboard_entries (group_id, rank)');
  await knex.raw('CREATE INDEX ON leaderboard_entries (group_id, points DESC)');

  // 9. Drop seasons table (all references removed)
  await knex.schema.dropTableIfExists('seasons');
}

export async function down(knex: Knex): Promise<void> {
  // Recreate seasons table
  await knex.schema.createTable('seasons', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('group_id').notNullable().references('id').inTable('groups').unique();
    t.uuid('competition_id').notNullable().references('id').inTable('competitions');
    t.text('status').notNullable().defaultTo('upcoming');
    t.timestamp('starts_at', { useTz: true });
    t.timestamp('ends_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Re-add season_id columns, drop group_id columns (data loss expected on rollback)
  await knex.schema.alterTable('leaderboard_entries', (t) => {
    t.dropColumn('points');
    t.dropColumn('group_id');
    t.uuid('season_id').nullable().references('id').inTable('seasons');
  });

  await knex.schema.alterTable('wallet_transactions', (t) => {
    t.dropColumn('group_id');
    t.uuid('season_id').nullable().references('id').inTable('seasons');
  });

  await knex.schema.alterTable('bets', (t) => {
    t.dropColumn('predicted_home_score');
    t.dropColumn('predicted_away_score');
    t.dropColumn('group_id');
    t.uuid('season_id').nullable().references('id').inTable('seasons');
  });

  await knex.schema.alterTable('market_options', (t) => {
    t.dropColumn('odds');
  });

  await knex.schema.dropTableIfExists('group_competitions');

  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('role');
  });

  await knex.schema.alterTable('groups', (t) => {
    t.dropColumn('scoring_format');
    t.dropColumn('allowed_bet_types');
    t.dropColumn('status');
  });
}
