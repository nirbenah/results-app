/**
 * Migration 014 — Teams, published flags, match events, external IDs
 *
 * - Creates `teams` table (competition-scoped)
 * - Adds `home_team_id`, `away_team_id` to matches (nullable for backcompat)
 * - Adds `team_id`, `photo_url`, `external_id` to players
 * - Adds `published`, `external_id`, `logo_url`, `created_at` to competitions
 * - Adds `published`, `external_id` to matches
 * - Adds `question`, `subtype` to markets
 * - Backfills teams from existing match data
 */
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ─── 1. Create teams table ───
  await knex.schema.createTable('teams', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('competition_id').notNullable().references('id').inTable('competitions').onDelete('CASCADE');
    t.text('name').notNullable();
    t.text('short_name');
    t.text('photo_url');
    t.text('external_id');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.unique(['competition_id', 'name']);
    t.index('competition_id');
  });

  // ─── 2. Alter competitions: add published, external_id, logo_url, created_at ───
  const hasPublished = await knex.schema.hasColumn('competitions', 'published');
  if (!hasPublished) {
    await knex.schema.alterTable('competitions', (t) => {
      t.boolean('published').notNullable().defaultTo(false);
      t.text('external_id');
      t.text('logo_url');
      t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    });
  }

  // ─── 3. Alter matches: add team FKs, published, external_id ───
  await knex.schema.alterTable('matches', (t) => {
    t.uuid('home_team_id').references('id').inTable('teams');
    t.uuid('away_team_id').references('id').inTable('teams');
    t.boolean('published').notNullable().defaultTo(false);
    t.text('external_id');
    t.index('home_team_id');
    t.index('away_team_id');
  });

  // ─── 4. Alter players: add team_id FK, photo_url, external_id ───
  const hasTeamId = await knex.schema.hasColumn('players', 'team_id');
  if (!hasTeamId) {
    await knex.schema.alterTable('players', (t) => {
      t.uuid('team_id').references('id').inTable('teams');
      t.text('photo_url');
      t.text('external_id');
    });
  }

  // ─── 5. Alter markets: add question, subtype ───
  await knex.schema.alterTable('markets', (t) => {
    t.text('question');   // human-readable for events/outrights
    t.text('subtype');    // 'winner', 'top_goalscorer', 'top_assists', 'man_of_season', etc.
  });

  // ─── 6. Backfill: create teams from existing match data ───
  const matches = await knex('matches').select('id', 'competition_id', 'home_team', 'away_team');

  // Collect unique team names per competition
  const teamMap = new Map<string, Set<string>>();
  for (const m of matches) {
    const key = m.competition_id;
    if (!teamMap.has(key)) teamMap.set(key, new Set());
    teamMap.get(key)!.add(m.home_team);
    teamMap.get(key)!.add(m.away_team);
  }

  // Insert teams and build a lookup
  const teamLookup = new Map<string, string>(); // "compId:teamName" -> teamId
  for (const [compId, teamNames] of teamMap.entries()) {
    for (const name of teamNames) {
      const existing = await knex('teams')
        .where({ competition_id: compId, name })
        .first();
      if (existing) {
        teamLookup.set(`${compId}:${name}`, existing.id);
      } else {
        const [row] = await knex('teams')
          .insert({ competition_id: compId, name })
          .returning('*');
        teamLookup.set(`${compId}:${name}`, row.id);
      }
    }
  }

  // Update matches with team IDs
  for (const m of matches) {
    const homeId = teamLookup.get(`${m.competition_id}:${m.home_team}`);
    const awayId = teamLookup.get(`${m.competition_id}:${m.away_team}`);
    if (homeId && awayId) {
      await knex('matches')
        .where('id', m.id)
        .update({ home_team_id: homeId, away_team_id: awayId });
    }
  }

  // Backfill players with team_id from matching team name
  const players = await knex('players').select('id', 'team');
  for (const p of players) {
    if (!p.team) continue;
    // Find team by name (first match across any competition)
    const team = await knex('teams').where('name', p.team).first();
    if (team) {
      await knex('players').where('id', p.id).update({ team_id: team.id });
    }
  }

  // ─── 7. Publish existing competitions and matches (seed data) ───
  await knex('competitions').update({ published: true });
  await knex('matches').update({ published: true });
}

export async function down(knex: Knex): Promise<void> {
  // Remove new columns from markets
  await knex.schema.alterTable('markets', (t) => {
    t.dropColumn('question');
    t.dropColumn('subtype');
  });

  // Remove new columns from players
  const hasTeamId = await knex.schema.hasColumn('players', 'team_id');
  if (hasTeamId) {
    await knex.schema.alterTable('players', (t) => {
      t.dropColumn('team_id');
      t.dropColumn('photo_url');
      t.dropColumn('external_id');
    });
  }

  // Remove new columns from matches
  await knex.schema.alterTable('matches', (t) => {
    t.dropColumn('home_team_id');
    t.dropColumn('away_team_id');
    t.dropColumn('published');
    t.dropColumn('external_id');
  });

  // Remove new columns from competitions
  const hasPublished = await knex.schema.hasColumn('competitions', 'published');
  if (hasPublished) {
    await knex.schema.alterTable('competitions', (t) => {
      t.dropColumn('published');
      t.dropColumn('external_id');
      t.dropColumn('logo_url');
      t.dropColumn('created_at');
    });
  }

  // Drop teams table
  await knex.schema.dropTableIfExists('teams');
}
