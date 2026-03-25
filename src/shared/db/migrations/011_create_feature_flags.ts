import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('feature_flags', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('name').notNullable().unique();
    t.boolean('enabled').notNullable().defaultTo(false);
    t.text('scope').notNullable().defaultTo('global');
    t.uuid('scope_id');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    t.check("scope IN ('global', 'group')", undefined, 'feature_flags_scope_check');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('feature_flags');
}
