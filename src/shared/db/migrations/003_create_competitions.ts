import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('competitions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('name').notNullable();
    t.text('type').notNullable();
    t.text('sport').notNullable().defaultTo('football');
    t.text('country');
    t.timestamp('starts_at', { useTz: true });
    t.timestamp('ends_at', { useTz: true });

    t.check("type IN ('league', 'cup', 'tournament')", undefined, 'competitions_type_check');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('competitions');
}
