import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('seasons', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('group_id').notNullable().references('id').inTable('groups').unique(); // one season per group
    t.uuid('competition_id').notNullable().references('id').inTable('competitions');
    t.text('status').notNullable().defaultTo('upcoming');
    t.timestamp('starts_at', { useTz: true });
    t.timestamp('ends_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    t.check("status IN ('upcoming', 'active', 'finished')", undefined, 'seasons_status_check');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('seasons');
}
