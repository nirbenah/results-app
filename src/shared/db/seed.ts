/**
 * Seed script — populates the database with test data.
 * Run: npx ts-node src/shared/db/seed.ts
 *
 * Creates:
 * - 2 competitions with teams and players
 * - 6 matches with match_outcome markets
 * - Competition special markets (top goalscorer, outright winner)
 * - All data is published by default (for testing)
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
      published: true,
    })
    .returning('*');

  const [championsLeague] = await db('competitions')
    .insert({
      name: 'Champions League 2024/25',
      type: 'cup',
      sport: 'football',
      starts_at: '2024-09-17T00:00:00Z',
      ends_at: '2025-06-01T00:00:00Z',
      published: true,
    })
    .returning('*');

  console.log('[Seed] Competitions created');

  // ─── Teams ───
  const plTeamNames = ['Arsenal', 'Chelsea', 'Liverpool', 'Manchester City', 'Tottenham', 'Manchester United', 'Newcastle', 'Aston Villa'];
  const plTeams: Record<string, { id: string; name: string }> = {};
  for (const name of plTeamNames) {
    const [row] = await db('teams')
      .insert({ competition_id: premierLeague.id, name })
      .returning('*');
    plTeams[name] = row;
  }

  const clTeamNames = ['Arsenal', 'Liverpool', 'Manchester City', 'Barcelona', 'Real Madrid', 'Bayern Munich'];
  const clTeams: Record<string, { id: string; name: string }> = {};
  for (const name of clTeamNames) {
    const [row] = await db('teams')
      .insert({ competition_id: championsLeague.id, name })
      .returning('*');
    clTeams[name] = row;
  }

  console.log('[Seed] Teams created');

  // ─── Players (linked to PL teams) ───
  const playerData = [
    { name: 'Bukayo Saka', team_id: plTeams['Arsenal'].id, position: 'RW', goals: 12, assists: 10 },
    { name: 'Kai Havertz', team_id: plTeams['Arsenal'].id, position: 'CF', goals: 9, assists: 4 },
    { name: 'Mohamed Salah', team_id: plTeams['Liverpool'].id, position: 'RW', goals: 17, assists: 11 },
    { name: 'Erling Haaland', team_id: plTeams['Manchester City'].id, position: 'ST', goals: 22, assists: 3 },
    { name: 'Cole Palmer', team_id: plTeams['Chelsea'].id, position: 'AM', goals: 15, assists: 8 },
    { name: 'Bruno Fernandes', team_id: plTeams['Manchester United'].id, position: 'AM', goals: 7, assists: 9 },
    { name: 'Son Heung-min', team_id: plTeams['Tottenham'].id, position: 'LW', goals: 11, assists: 6 },
    { name: 'Ollie Watkins', team_id: plTeams['Aston Villa'].id, position: 'ST', goals: 13, assists: 7 },
    { name: 'Alexander Isak', team_id: plTeams['Newcastle'].id, position: 'ST', goals: 16, assists: 4 },
    { name: 'Phil Foden', team_id: plTeams['Manchester City'].id, position: 'AM', goals: 8, assists: 7 },
  ];

  const players = await db('players').insert(playerData).returning('*');
  console.log(`[Seed] ${players.length} players created`);

  // ─── Matches ───
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dayAfter = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const matchData = [
    {
      competition_id: premierLeague.id,
      home_team: 'Arsenal', away_team: 'Chelsea',
      home_team_id: plTeams['Arsenal'].id, away_team_id: plTeams['Chelsea'].id,
      status: 'scheduled', kickoff_at: tomorrow.toISOString(), published: true,
    },
    {
      competition_id: premierLeague.id,
      home_team: 'Liverpool', away_team: 'Manchester City',
      home_team_id: plTeams['Liverpool'].id, away_team_id: plTeams['Manchester City'].id,
      status: 'scheduled', kickoff_at: dayAfter.toISOString(), published: true,
    },
    {
      competition_id: premierLeague.id,
      home_team: 'Tottenham', away_team: 'Manchester United',
      home_team_id: plTeams['Tottenham'].id, away_team_id: plTeams['Manchester United'].id,
      status: 'scheduled', kickoff_at: nextWeek.toISOString(), published: true,
    },
    {
      competition_id: championsLeague.id,
      home_team: 'Arsenal', away_team: 'Barcelona',
      home_team_id: clTeams['Arsenal'].id, away_team_id: clTeams['Barcelona'].id,
      status: 'scheduled', kickoff_at: tomorrow.toISOString(), published: true,
    },
    {
      competition_id: championsLeague.id,
      home_team: 'Liverpool', away_team: 'Real Madrid',
      home_team_id: clTeams['Liverpool'].id, away_team_id: clTeams['Real Madrid'].id,
      status: 'scheduled', kickoff_at: dayAfter.toISOString(), published: true,
    },
    {
      competition_id: championsLeague.id,
      home_team: 'Manchester City', away_team: 'Bayern Munich',
      home_team_id: clTeams['Manchester City'].id, away_team_id: clTeams['Bayern Munich'].id,
      status: 'scheduled', kickoff_at: nextWeek.toISOString(), published: true,
    },
  ];

  const matches = await db('matches').insert(matchData).returning('*');
  console.log(`[Seed] ${matches.length} matches created`);

  // ─── Markets + Options with odds for each match ───
  for (const match of matches) {
    const [market] = await db('markets')
      .insert({
        match_id: match.id,
        type: 'match_outcome',
        status: 'open',
        closes_at: match.kickoff_at,
      })
      .returning('*');

    await db('market_options').insert([
      { market_id: market.id, label: `${match.home_team} win`, outcome_key: 'home', odds: 2.1 },
      { market_id: market.id, label: 'Draw', outcome_key: 'draw', odds: 3.4 },
      { market_id: market.id, label: `${match.away_team} win`, outcome_key: 'away', odds: 3.0 },
    ]);
  }
  console.log('[Seed] Match markets created');

  // ─── Competition outright markets ───
  // PL Winner
  const [plWinner] = await db('markets')
    .insert({
      competition_id: premierLeague.id,
      type: 'outright',
      subtype: 'winner',
      question: 'Who will win Premier League 2024/25?',
      status: 'open',
      closes_at: '2025-05-25T00:00:00Z',
    })
    .returning('*');

  await db('market_options').insert([
    { market_id: plWinner.id, label: 'Arsenal', outcome_key: plTeams['Arsenal'].id, odds: 2.5 },
    { market_id: plWinner.id, label: 'Liverpool', outcome_key: plTeams['Liverpool'].id, odds: 3.0 },
    { market_id: plWinner.id, label: 'Manchester City', outcome_key: plTeams['Manchester City'].id, odds: 2.8 },
    { market_id: plWinner.id, label: 'Chelsea', outcome_key: plTeams['Chelsea'].id, odds: 8.0 },
  ]);

  // PL Top Goalscorer
  const [plTopScorer] = await db('markets')
    .insert({
      competition_id: premierLeague.id,
      type: 'outright',
      subtype: 'top_goalscorer',
      question: 'Top goalscorer of Premier League 2024/25?',
      status: 'open',
      closes_at: '2025-05-25T00:00:00Z',
    })
    .returning('*');

  const scorerOptions = players.slice(0, 6).map((p) => ({
    market_id: plTopScorer.id,
    label: p.name,
    outcome_key: p.id,
    player_id: p.id,
    odds: null,
  }));
  await db('market_options').insert(scorerOptions);

  console.log('[Seed] Competition outright markets created');

  // ─── Sample match event (in-match question) ───
  const firstMatch = matches[0];
  const [eventMarket] = await db('markets')
    .insert({
      match_id: firstMatch.id,
      type: 'in_match_event',
      question: 'Who scores first?',
      status: 'open',
      closes_at: firstMatch.kickoff_at,
    })
    .returning('*');

  await db('market_options').insert([
    { market_id: eventMarket.id, label: `${firstMatch.home_team} player`, outcome_key: 'home_scores_first', odds: 1.8 },
    { market_id: eventMarket.id, label: `${firstMatch.away_team} player`, outcome_key: 'away_scores_first', odds: 2.2 },
    { market_id: eventMarket.id, label: 'No goals', outcome_key: 'no_goals', odds: 8.0 },
  ]);

  console.log('[Seed] Match event market created');

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
