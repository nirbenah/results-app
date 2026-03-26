import { Knex } from 'knex';

/**
 * Add goals and assists columns to players table
 * so the admin can track player stats and the Information panel can display them.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('players', (t) => {
    t.integer('goals').notNullable().defaultTo(0);
    t.integer('assists').notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('players', (t) => {
    t.dropColumn('goals');
    t.dropColumn('assists');
  });
}
