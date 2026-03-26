/**
 * Admin routes — global admin manages competitions, teams, players, matches,
 * markets, odds, scores, users. All routes require admin role.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../gateway';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import { getDb } from '../../shared/db';
import { publishEvent } from '../../shared/events/publish';
import { EventNames } from '../../shared/events/types';

const router = Router();

// All admin routes require admin auth
router.use(requireAdmin);

// ════════════════════════════════════════════
// COMPETITIONS
// ════════════════════════════════════════════

router.post('/competitions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, type, sport, country, starts_at, ends_at, logo_url, external_id } = req.body;
    if (!name || !type || !sport) {
      throw new BadRequestError('VALIDATION', 'name, type, and sport are required');
    }
    const [row] = await getDb()('competitions')
      .insert({
        name, type, sport,
        country: country || null,
        starts_at: starts_at || null,
        ends_at: ends_at || null,
        logo_url: logo_url || null,
        external_id: external_id || null,
        published: false,
      })
      .returning('*');
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.get('/competitions', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await getDb()('competitions').select('*').orderBy('created_at', 'desc');
    res.json({ competitions: rows });
  } catch (err) { next(err); }
});

router.put('/competitions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, type, sport, country, starts_at, ends_at, logo_url, external_id } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (sport !== undefined) updates.sport = sport;
    if (country !== undefined) updates.country = country;
    if (starts_at !== undefined) updates.starts_at = starts_at;
    if (ends_at !== undefined) updates.ends_at = ends_at;
    if (logo_url !== undefined) updates.logo_url = logo_url;
    if (external_id !== undefined) updates.external_id = external_id;

    const [row] = await getDb()('competitions')
      .where('id', req.params.id)
      .update(updates)
      .returning('*');
    if (!row) throw new NotFoundError('Competition');
    res.json(row);
  } catch (err) { next(err); }
});

router.delete('/competitions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await getDb()('competitions').where('id', req.params.id).del();
    if (!deleted) throw new NotFoundError('Competition');
    res.status(204).send();
  } catch (err) { next(err); }
});

// Publish competition (makes it visible to users)
router.put('/competitions/:id/publish', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [row] = await getDb()('competitions')
      .where('id', req.params.id)
      .update({ published: true })
      .returning('*');
    if (!row) throw new NotFoundError('Competition');
    res.json(row);
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// TEAMS
// ════════════════════════════════════════════

router.post('/teams', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { competition_id, name, short_name, photo_url, external_id } = req.body;
    if (!competition_id || !name) {
      throw new BadRequestError('VALIDATION', 'competition_id and name are required');
    }
    const [row] = await getDb()('teams')
      .insert({ competition_id, name, short_name: short_name || null, photo_url: photo_url || null, external_id: external_id || null })
      .returning('*');
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.get('/competitions/:competitionId/teams', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await getDb()('teams')
      .where('competition_id', req.params.competitionId)
      .select('*')
      .orderBy('name', 'asc');
    res.json({ teams: rows });
  } catch (err) { next(err); }
});

router.put('/teams/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, short_name, photo_url, external_id } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (short_name !== undefined) updates.short_name = short_name;
    if (photo_url !== undefined) updates.photo_url = photo_url;
    if (external_id !== undefined) updates.external_id = external_id;

    const [row] = await getDb()('teams')
      .where('id', req.params.id)
      .update(updates)
      .returning('*');
    if (!row) throw new NotFoundError('Team');
    res.json(row);
  } catch (err) { next(err); }
});

router.delete('/teams/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await getDb()('teams').where('id', req.params.id).del();
    if (!deleted) throw new NotFoundError('Team');
    res.status(204).send();
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// PLAYERS
// ════════════════════════════════════════════

router.post('/players', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, team_id, position, photo_url, external_id, sport } = req.body;
    if (!name) {
      throw new BadRequestError('VALIDATION', 'name is required');
    }
    const [row] = await getDb()('players')
      .insert({
        name,
        team_id: team_id || null,
        team: null, // legacy column
        position: position || null,
        photo_url: photo_url || null,
        external_id: external_id || null,
        sport: sport || 'football',
      })
      .returning('*');
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.get('/teams/:teamId/players', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await getDb()('players')
      .where('team_id', req.params.teamId)
      .select('*')
      .orderBy('name', 'asc');
    res.json({ players: rows });
  } catch (err) { next(err); }
});

router.put('/players/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, team_id, position, photo_url, external_id } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (team_id !== undefined) updates.team_id = team_id;
    if (position !== undefined) updates.position = position;
    if (photo_url !== undefined) updates.photo_url = photo_url;
    if (external_id !== undefined) updates.external_id = external_id;

    const [row] = await getDb()('players')
      .where('id', req.params.id)
      .update(updates)
      .returning('*');
    if (!row) throw new NotFoundError('Player');
    res.json(row);
  } catch (err) { next(err); }
});

router.delete('/players/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await getDb()('players').where('id', req.params.id).del();
    if (!deleted) throw new NotFoundError('Player');
    res.status(204).send();
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// MATCHES
// ════════════════════════════════════════════

// Create match — accepts team IDs or team names
router.post('/matches', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { competition_id, home_team, away_team, home_team_id, away_team_id, kickoff_at } = req.body;
    if (!competition_id || !kickoff_at) {
      throw new BadRequestError('VALIDATION', 'competition_id and kickoff_at are required');
    }

    let homeTeamName = home_team;
    let awayTeamName = away_team;
    let homeId = home_team_id || null;
    let awayId = away_team_id || null;

    // If team IDs provided, look up names
    if (homeId) {
      const t = await getDb()('teams').where('id', homeId).first();
      if (!t) throw new NotFoundError('Home team');
      homeTeamName = t.name;
    }
    if (awayId) {
      const t = await getDb()('teams').where('id', awayId).first();
      if (!t) throw new NotFoundError('Away team');
      awayTeamName = t.name;
    }

    if (!homeTeamName || !awayTeamName) {
      throw new BadRequestError('VALIDATION', 'Team names or team IDs are required');
    }

    const [match] = await getDb()('matches')
      .insert({
        competition_id,
        home_team: homeTeamName,
        away_team: awayTeamName,
        home_team_id: homeId,
        away_team_id: awayId,
        status: 'scheduled',
        kickoff_at,
        published: false,
      })
      .returning('*');

    // Auto-create match_outcome market with default odds
    const [market] = await getDb()('markets')
      .insert({ match_id: match.id, type: 'match_outcome', status: 'open', closes_at: kickoff_at })
      .returning('*');

    await getDb()('market_options').insert([
      { market_id: market.id, label: `${homeTeamName} win`, outcome_key: 'home', odds: 2.0 },
      { market_id: market.id, label: 'Draw', outcome_key: 'draw', odds: 3.5 },
      { market_id: market.id, label: `${awayTeamName} win`, outcome_key: 'away', odds: 3.0 },
    ]);

    res.status(201).json({ match, market_id: market.id });
  } catch (err) { next(err); }
});

router.get('/matches', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { competition_id, status } = req.query as Record<string, string | undefined>;
    const qb = getDb()('matches').select('*').orderBy('kickoff_at', 'asc');
    if (competition_id) qb.where('competition_id', competition_id);
    if (status) qb.where('status', status);
    const rows = await qb;
    res.json({ matches: rows });
  } catch (err) { next(err); }
});

router.put('/matches/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { home_team, away_team, home_team_id, away_team_id, kickoff_at, status } = req.body;
    const updates: Record<string, unknown> = {};
    if (home_team !== undefined) updates.home_team = home_team;
    if (away_team !== undefined) updates.away_team = away_team;
    if (home_team_id !== undefined) updates.home_team_id = home_team_id;
    if (away_team_id !== undefined) updates.away_team_id = away_team_id;
    if (kickoff_at !== undefined) updates.kickoff_at = kickoff_at;
    if (status !== undefined) updates.status = status;

    const [row] = await getDb()('matches')
      .where('id', req.params.id)
      .update(updates)
      .returning('*');
    if (!row) throw new NotFoundError('Match');
    res.json(row);
  } catch (err) { next(err); }
});

// Publish match (makes it visible to users)
router.put('/matches/:id/publish', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [row] = await getDb()('matches')
      .where('id', req.params.id)
      .update({ published: true })
      .returning('*');
    if (!row) throw new NotFoundError('Match');
    res.json(row);
  } catch (err) { next(err); }
});

// Settle match + all bets
router.post('/matches/:matchId/finish', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const matchId = req.params.matchId;
    const { home_score, away_score } = req.body;

    if (home_score == null || away_score == null) {
      throw new BadRequestError('VALIDATION', 'home_score and away_score are required');
    }

    const db = getDb();
    const match = await db('matches').where({ id: matchId }).first();
    if (!match) throw new NotFoundError('Match');

    const outcome: 'home' | 'draw' | 'away' =
      home_score > away_score ? 'home' : home_score < away_score ? 'away' : 'draw';

    await db('matches').where({ id: matchId }).update({
      status: 'finished',
      result: JSON.stringify({ home_score, away_score, outcome }),
    });

    await publishEvent(EventNames.MATCH_FINISHED, {
      match_id: matchId,
      competition_id: match.competition_id,
      result: { home_score, away_score, outcome },
      events: [],
    }, req.correlationId);

    res.json({
      match_id: matchId,
      home_team: match.home_team,
      away_team: match.away_team,
      home_score,
      away_score,
      outcome,
      message: 'Match settled. All bets resolved.',
    });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// MATCH EVENTS (In-match questions)
// ════════════════════════════════════════════

// Create an in-match event market (question + options)
router.post('/matches/:matchId/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const matchId = req.params.matchId;
    const { question, options, closes_at } = req.body;

    if (!question || !options || !Array.isArray(options) || options.length < 2) {
      throw new BadRequestError('VALIDATION', 'question and at least 2 options are required');
    }

    const match = await getDb()('matches').where('id', matchId).first();
    if (!match) throw new NotFoundError('Match');

    const [market] = await getDb()('markets')
      .insert({
        match_id: matchId,
        type: 'in_match_event',
        question,
        status: 'open',
        closes_at: closes_at || match.kickoff_at,
      })
      .returning('*');

    const optionRows = options.map((o: { label: string; outcome_key: string; odds?: number; player_id?: string }) => ({
      market_id: market.id,
      label: o.label,
      outcome_key: o.outcome_key,
      odds: o.odds || null,
      player_id: o.player_id || null,
    }));

    const insertedOptions = await getDb()('market_options').insert(optionRows).returning('*');

    res.status(201).json({ market, options: insertedOptions });
  } catch (err) { next(err); }
});

// List match event markets
router.get('/matches/:matchId/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const markets = await getDb()('markets')
      .where('match_id', req.params.matchId)
      .where('type', 'in_match_event')
      .select('*');

    const marketIds = markets.map((m: { id: string }) => m.id);
    const options = marketIds.length > 0
      ? await getDb()('market_options').whereIn('market_id', marketIds).select('*')
      : [];

    const result = markets.map((m: Record<string, unknown>) => ({
      ...m,
      options: options.filter((o: { market_id: string }) => o.market_id === m.id),
    }));
    res.json({ events: result });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// COMPETITION MARKETS (Special bets: outright)
// ════════════════════════════════════════════

// Create competition-level outright market (top_goalscorer, top_assists, man_of_season, winner)
router.post('/competitions/:competitionId/markets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const competitionId = req.params.competitionId;
    const { subtype, question, options } = req.body;

    if (!subtype) {
      throw new BadRequestError('VALIDATION', 'subtype is required (winner, top_goalscorer, top_assists, man_of_season)');
    }

    const comp = await getDb()('competitions').where('id', competitionId).first();
    if (!comp) throw new NotFoundError('Competition');

    const questionText = question || getDefaultQuestion(subtype, comp.name);

    const [market] = await getDb()('markets')
      .insert({
        competition_id: competitionId,
        type: 'outright',
        subtype,
        question: questionText,
        status: 'open',
        closes_at: comp.ends_at || null,
      })
      .returning('*');

    let insertedOptions: unknown[] = [];
    if (options && options.length > 0) {
      // Manual options
      const optionRows = options.map((o: { label: string; outcome_key: string; odds?: number; player_id?: string }) => ({
        market_id: market.id,
        label: o.label,
        outcome_key: o.outcome_key,
        odds: o.odds || null,
        player_id: o.player_id || null,
      }));
      insertedOptions = await getDb()('market_options').insert(optionRows).returning('*');
    } else if (subtype === 'winner') {
      // Auto-populate from competition teams
      const teams = await getDb()('teams').where('competition_id', competitionId).orderBy('name');
      if (teams.length > 0) {
        const optionRows = teams.map((t: { id: string; name: string }) => ({
          market_id: market.id,
          label: t.name,
          outcome_key: t.id,
          odds: null,
        }));
        insertedOptions = await getDb()('market_options').insert(optionRows).returning('*');
      }
    } else if (['top_goalscorer', 'top_assists', 'man_of_season'].includes(subtype)) {
      // Auto-populate from competition players
      const players = await getDb()('players')
        .join('teams', 'teams.id', 'players.team_id')
        .where('teams.competition_id', competitionId)
        .select('players.*')
        .orderBy('players.name');
      if (players.length > 0) {
        const optionRows = players.map((p: { id: string; name: string }) => ({
          market_id: market.id,
          label: p.name,
          outcome_key: p.id,
          player_id: p.id,
          odds: null,
        }));
        insertedOptions = await getDb()('market_options').insert(optionRows).returning('*');
      }
    }

    res.status(201).json({ market, options: insertedOptions });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// MARKET MANAGEMENT
// ════════════════════════════════════════════

// Get all markets + options for a match
router.get('/matches/:matchId/markets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const markets = await getDb()('markets').where('match_id', req.params.matchId).select('*');
    const marketIds = markets.map((m: { id: string }) => m.id);
    const options = marketIds.length > 0
      ? await getDb()('market_options').whereIn('market_id', marketIds).select('*')
      : [];

    const result = markets.map((m: Record<string, unknown>) => ({
      ...m,
      options: options.filter((o: { market_id: string }) => o.market_id === m.id),
    }));
    res.json({ markets: result });
  } catch (err) { next(err); }
});

// Update market option (odds, label)
router.put('/market-options/:optionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { odds, label } = req.body;
    const updates: Record<string, unknown> = {};
    if (odds !== undefined) updates.odds = odds;
    if (label !== undefined) updates.label = label;

    const [row] = await getDb()('market_options')
      .where('id', req.params.optionId)
      .update(updates)
      .returning('*');
    if (!row) throw new NotFoundError('Market option');
    res.json(row);
  } catch (err) { next(err); }
});

// Manually settle a market (for events, outrights)
router.post('/markets/:marketId/settle', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const marketId = req.params.marketId;
    const { winning_option_id } = req.body;

    if (!winning_option_id) {
      throw new BadRequestError('VALIDATION', 'winning_option_id is required');
    }

    const db = getDb();
    const market = await db('markets').where('id', marketId).first();
    if (!market) throw new NotFoundError('Market');

    // Mark the winning option
    await db('market_options')
      .where('id', winning_option_id)
      .update({ is_winner: true });

    // Update market status
    await db('markets')
      .where('id', marketId)
      .update({ status: 'settled', settled_at: db.fn.now() });

    // Settle all pending bets on this market
    const options = await db('market_options').where('market_id', marketId);
    const pendingBets = await db('bets')
      .join('market_options', 'market_options.id', 'bets.market_option_id')
      .where('market_options.market_id', marketId)
      .where('bets.status', 'pending')
      .select('bets.*');

    for (const bet of pendingBets) {
      const outcome = bet.market_option_id === winning_option_id ? 'won' : 'lost';
      await db('bets')
        .where('id', bet.id)
        .update({ status: outcome, settled_at: db.fn.now() });

      const betOption = options.find((o: { id: string }) => o.id === bet.market_option_id);
      const odds = betOption?.odds ?? 2.0;
      const payout = outcome === 'won' ? Math.floor(100 * (odds || 2.0)) : 0;

      await publishEvent(EventNames.BET_SETTLED, {
        bet_id: bet.id,
        user_id: bet.user_id,
        group_id: bet.group_id,
        market_option_id: bet.market_option_id,
        market_type: market.type,
        outcome,
        payout,
      }, req.correlationId);
    }

    await publishEvent(EventNames.MARKET_SETTLED, {
      market_id: marketId,
      match_id: market.match_id,
      competition_id: market.competition_id,
      market_type: market.type,
      winning_outcome_key: winning_option_id,
    }, req.correlationId);

    res.json({ message: `Market settled. ${pendingBets.length} bets resolved.`, winning_option_id });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// USERS
// ════════════════════════════════════════════

router.get('/users', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await getDb()('users')
      .select('id', 'username', 'email', 'role', 'avatar_url', 'created_at')
      .orderBy('created_at', 'desc');
    res.json({ users: rows });
  } catch (err) { next(err); }
});

router.put('/users/:id/role', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role } = req.body;
    if (!role || !['user', 'admin'].includes(role)) {
      throw new BadRequestError('VALIDATION', 'role must be "user" or "admin"');
    }
    const [row] = await getDb()('users')
      .where('id', req.params.id)
      .update({ role })
      .returning(['id', 'username', 'email', 'role']);
    if (!row) throw new NotFoundError('User');
    res.json(row);
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// ADMIN OVERVIEW — Groups, Bets, Match Bets
// ════════════════════════════════════════════

// All groups with member count
router.get('/groups', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const groups = await getDb()('groups')
      .select('groups.*')
      .count('group_members.id as member_count')
      .leftJoin('group_members', 'group_members.group_id', 'groups.id')
      .groupBy('groups.id')
      .orderBy('groups.created_at', 'desc');
    res.json({ groups });
  } catch (err) { next(err); }
});

// Group members with wallet balances
router.get('/groups/:groupId/members', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const members = await db('group_members')
      .join('users', 'users.id', 'group_members.user_id')
      .where('group_members.group_id', req.params.groupId)
      .select(
        'users.id', 'users.username', 'users.email', 'users.avatar_url',
        'group_members.role', 'group_members.joined_at'
      );

    // Get balances for each member
    for (const m of members) {
      const credits = await db('wallet_transactions')
        .where({ user_id: m.id, group_id: req.params.groupId, direction: 'credit' })
        .sum('amount as total')
        .first();
      const debits = await db('wallet_transactions')
        .where({ user_id: m.id, group_id: req.params.groupId, direction: 'debit' })
        .sum('amount as total')
        .first();
      (m as Record<string, unknown>).balance = (Number(credits?.total) || 0) - (Number(debits?.total) || 0);
    }

    res.json({ members });
  } catch (err) { next(err); }
});

// All bets (filterable)
router.get('/bets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { group_id, user_id, match_id, status } = req.query as Record<string, string | undefined>;
    const qb = getDb()('bets')
      .join('users', 'users.id', 'bets.user_id')
      .join('market_options', 'market_options.id', 'bets.market_option_id')
      .join('markets', 'markets.id', 'market_options.market_id')
      .leftJoin('matches', 'matches.id', 'markets.match_id')
      .select(
        'bets.*',
        'users.username',
        'market_options.label as option_label',
        'market_options.odds',
        'markets.type as market_type',
        'markets.question',
        'matches.home_team',
        'matches.away_team',
        'matches.status as match_status'
      )
      .orderBy('bets.placed_at', 'desc')
      .limit(100);

    if (group_id) qb.where('bets.group_id', group_id);
    if (user_id) qb.where('bets.user_id', user_id);
    if (match_id) qb.where('markets.match_id', match_id);
    if (status) qb.where('bets.status', status);

    const rows = await qb;
    res.json({ bets: rows });
  } catch (err) { next(err); }
});

// Bets on a specific match (who bet on what)
router.get('/matches/:matchId/bets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await getDb()('bets')
      .join('users', 'users.id', 'bets.user_id')
      .join('market_options', 'market_options.id', 'bets.market_option_id')
      .join('markets', 'markets.id', 'market_options.market_id')
      .where('markets.match_id', req.params.matchId)
      .select(
        'bets.*',
        'users.username',
        'market_options.label as option_label',
        'market_options.odds',
        'markets.type as market_type',
        'markets.question'
      )
      .orderBy('bets.placed_at', 'desc');
    res.json({ bets: rows });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════

function getDefaultQuestion(subtype: string, competitionName: string): string {
  switch (subtype) {
    case 'winner': return `Who will win ${competitionName}?`;
    case 'top_goalscorer': return `Top goalscorer of ${competitionName}?`;
    case 'top_assists': return `Top assists in ${competitionName}?`;
    case 'man_of_season': return `Man of the season in ${competitionName}?`;
    default: return `${subtype} — ${competitionName}`;
  }
}

export default router;
