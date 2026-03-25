import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('groups', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('name').notNullable();
    t.uuid('commissioner_id').notNullable().references('id').inTable('users');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('group_members', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('group_id').notNullable().references('id').inTable('groups').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users');
    t.text('role').notNullable();
    t.timestamp('joined_at', { useTz: true }).defaultTo(knex.fn.now());

    t.unique(['group_id', 'user_id']);
    t.check("role IN ('commissioner', 'member')", undefined, 'group_members_role_check');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('group_members');
  await knex.schema.dropTableIfExists('groups');
}
