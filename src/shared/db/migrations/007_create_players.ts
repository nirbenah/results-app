import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('players', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('name').notNullable();
    t.text('team');
    t.text('position');
    t.text('sport').notNullable().defaultTo('football');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('players');
}
