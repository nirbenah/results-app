/**
 * Seed script — populates the database with test data.
 * Run: npx ts-node src/shared/db/seed.ts
 *
 * Creates:
 * - 2 competitions (Premier League 24/25, Champions League 24/25)
 * - 6 matches (3 per competition)
 * - 10 players
 * - Markets + options with odds for each match
 */
import dotenv from 'dotenv';
dotenv.config();

import { getDb, closeDb } from './index';

async function seed() {
  const db = getDb();

  console.log('[Seed] Starting...');

  // Check if already seeded
  const existing = await db('competitions').first();
  if (existing) {
    console.log('[Seed] Data already exists, skipping.');
    await closeDb();
    return;
  }

  // ─── Competitions ───
  const [premierLeague] = await db('competitions')
    .insert({
      name: 'Premier League 2024/25',
      type: 'league',
      sport: 'football',
      country: 'England',
      starts_at: '2024-08-17T00:00:00Z',
      ends_at: '2025-05-25T00:00:00Z',
    })
    .returning('*');

  const [championsLeague] = await db('competitions')
    .insert({
      name: 'Champions League 2024/25',
      type: 'cup',
      sport: 'football',
      starts_at: '2024-09-17T00:00:00Z',
      ends_at: '2025-06-01T00:00:00Z',
    })
    .returning('*');

  console.log('[Seed] Competitions created');

  // ─── Players ───
  const playerData = [
    { name: 'Bukayo Saka', team: 'Arsenal', position: 'RW' },
    { name: 'Kai Havertz', team: 'Arsenal', position: 'CF' },
    { name: 'Mohamed Salah', team: 'Liverpool', position: 'RW' },
    { name: 'Erling Haaland', team: 'Manchester City', position: 'ST' },
    { name: 'Cole Palmer', team: 'Chelsea', position: 'AM' },
    { name: 'Bruno Fernandes', team: 'Manchester United', position: 'AM' },
    { name: 'Son Heung-min', team: 'Tottenham', position: 'LW' },
    { name: 'Ollie Watkins', team: 'Aston Villa', position: 'ST' },
    { name: 'Alexander Isak', team: 'Newcastle', position: 'ST' },
    { name: 'Phil Foden', team: 'Manchester City', position: 'AM' },
  ];

  const players = await db('players').insert(playerData).returning('*');
  console.log(`[Seed] ${players.length} players created`);

  // ─── Matches ───
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dayAfter = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const matchData = [
    // Premier League matches
    {
      competition_id: premierLeague.id,
      home_team: 'Arsenal',
      away_team: 'Chelsea',
      status: 'scheduled',
      kickoff_at: tomorrow.toISOString(),
    },
    {
      competition_id: premierLeague.id,
      home_team: 'Liverpool',
      away_team: 'Manchester City',
      status: 'scheduled',
      kickoff_at: dayAfter.toISOString(),
    },
    {
      competition_id: premierLeague.id,
      home_team: 'Tottenham',
      away_team: 'Manchester United',
      status: 'scheduled',
      kickoff_at: nextWeek.toISOString(),
    },
    // Champions League matches
    {
      competition_id: championsLeague.id,
      home_team: 'Arsenal',
      away_team: 'Barcelona',
      status: 'scheduled',
      kickoff_at: tomorrow.toISOString(),
    },
    {
      competition_id: championsLeague.id,
      home_team: 'Liverpool',
      away_team: 'Real Madrid',
      status: 'scheduled',
      kickoff_at: dayAfter.toISOString(),
    },
    {
      competition_id: championsLeague.id,
      home_team: 'Manchester City',
      away_team: 'Bayern Munich',
      status: 'scheduled',
      kickoff_at: nextWeek.toISOString(),
    },
  ];

  const matches = await db('matches').insert(matchData).returning('*');
  console.log(`[Seed] ${matches.length} matches created`);

  // ─── Markets + Options with odds for each match ───
  for (const match of matches) {
    // match_outcome market
    const [market] = await db('markets')
      .insert({
        match_id: match.id,
        type: 'match_outcome',
        status: 'open',
        closes_at: match.kickoff_at,
      })
      .returning('*');

    await db('market_options').insert([
      {
        market_id: market.id,
        label: `${match.home_team} win`,
        outcome_key: 'home',
        odds: 2.1,
      },
      {
        market_id: market.id,
        label: 'Draw',
        outcome_key: 'draw',
        odds: 3.4,
      },
      {
        market_id: market.id,
        label: `${match.away_team} win`,
        outcome_key: 'away',
        odds: 3.0,
      },
    ]);
  }

  console.log('[Seed] Markets and options created');

  // ─── Outright market for Premier League ───
  const [outrightMarket] = await db('markets')
    .insert({
      competition_id: premierLeague.id,
      type: 'outright',
      status: 'open',
      closes_at: '2025-05-25T00:00:00Z',
    })
    .returning('*');

  await db('market_options').insert([
    { market_id: outrightMarket.id, label: 'Arsenal', outcome_key: 'arsenal', odds: 2.5 },
    { market_id: outrightMarket.id, label: 'Liverpool', outcome_key: 'liverpool', odds: 3.0 },
    { market_id: outrightMarket.id, label: 'Manchester City', outcome_key: 'man_city', odds: 2.8 },
    { market_id: outrightMarket.id, label: 'Chelsea', outcome_key: 'chelsea', odds: 8.0 },
  ]);

  console.log('[Seed] Outright market created');

  // ─── Feature flags ───
  await db('feature_flags').insert([
    { name: 'in_match_betting', enabled: true, scope: 'global' },
    { name: 'player_stat_markets', enabled: true, scope: 'global' },
    { name: 'outright_markets', enabled: true, scope: 'global' },
  ]);

  console.log('[Seed] Feature flags created');
  console.log('[Seed] Done!');

  await closeDb();
}

seed().catch((err) => {
  console.error('[Seed] Failed:', err);
  process.exit(1);
});
