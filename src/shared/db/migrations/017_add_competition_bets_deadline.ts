import { Knex } from 'knex';

/**
 * Add competition_bets_deadline to groups table.
 * This allows the group commissioner to set a deadline for competition-level
 * bets (top goalscorer, top assists, man of season, competition winner).
 * Users see a countdown and cannot place these bets after the deadline.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('groups', (t) => {
    t.timestamp('competition_bets_deadline', { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('groups', (t) => {
    t.dropColumn('competition_bets_deadline');
  });
}
