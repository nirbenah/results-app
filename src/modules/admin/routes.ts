/**
 * Admin routes — global admin manages competitions, matches, odds, scores, users.
 * All routes require admin role.
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

// POST /v1/admin/competitions — Create competition
router.post('/competitions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, type, sport, country, starts_at, ends_at } = req.body;
    if (!name || !type || !sport) {
      throw new BadRequestError('VALIDATION', 'name, type, and sport are required');
    }
    const [row] = await getDb()('competitions')
      .insert({ name, type, sport, country: country || null, starts_at: starts_at || null, ends_at: ends_at || null })
      .returning('*');
    res.status(201).json(row);
  } catch (err) { next(err); }
});

// GET /v1/admin/competitions — List all competitions
router.get('/competitions', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await getDb()('competitions').select('*').orderBy('created_at', 'desc');
    res.json({ competitions: rows });
  } catch (err) { next(err); }
});

// PUT /v1/admin/competitions/:id — Update competition
router.put('/competitions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, type, sport, country, starts_at, ends_at } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (sport !== undefined) updates.sport = sport;
    if (country !== undefined) updates.country = country;
    if (starts_at !== undefined) updates.starts_at = starts_at;
    if (ends_at !== undefined) updates.ends_at = ends_at;

    const [row] = await getDb()('competitions')
      .where('id', req.params.id)
      .update(updates)
      .returning('*');
    if (!row) throw new NotFoundError('Competition');
    res.json(row);
  } catch (err) { next(err); }
});

// DELETE /v1/admin/competitions/:id
router.delete('/competitions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await getDb()('competitions').where('id', req.params.id).del();
    if (!deleted) throw new NotFoundError('Competition');
    res.status(204).send();
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// MATCHES
// ════════════════════════════════════════════

// POST /v1/admin/matches — Create match
router.post('/matches', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { competition_id, home_team, away_team, kickoff_at } = req.body;
    if (!competition_id || !home_team || !away_team || !kickoff_at) {
      throw new BadRequestError('VALIDATION', 'competition_id, home_team, away_team, and kickoff_at are required');
    }

    const [match] = await getDb()('matches')
      .insert({ competition_id, home_team, away_team, status: 'scheduled', kickoff_at })
      .returning('*');

    // Auto-create match_outcome market with default odds
    const [market] = await getDb()('markets')
      .insert({ match_id: match.id, type: 'match_outcome', status: 'open', closes_at: kickoff_at })
      .returning('*');

    await getDb()('market_options').insert([
      { market_id: market.id, label: `${home_team} win`, outcome_key: 'home', odds: 2.0 },
      { market_id: market.id, label: 'Draw', outcome_key: 'draw', odds: 3.5 },
      { market_id: market.id, label: `${away_team} win`, outcome_key: 'away', odds: 3.0 },
    ]);

    res.status(201).json({ match, market_id: market.id });
  } catch (err) { next(err); }
});

// GET /v1/admin/matches — List matches (filterable)
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

// PUT /v1/admin/matches/:id — Update match (reschedule, change teams)
router.put('/matches/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { home_team, away_team, kickoff_at, status } = req.body;
    const updates: Record<string, unknown> = {};
    if (home_team !== undefined) updates.home_team = home_team;
    if (away_team !== undefined) updates.away_team = away_team;
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

// POST /v1/admin/matches/:matchId/finish — Settle match + all bets
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
// ODDS (Market Options)
// ════════════════════════════════════════════

// GET /v1/admin/matches/:matchId/markets — Get markets + options for a match
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

// PUT /v1/admin/market-options/:optionId — Update odds / label
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

// ════════════════════════════════════════════
// USERS
// ════════════════════════════════════════════

// GET /v1/admin/users — List all users
router.get('/users', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await getDb()('users')
      .select('id', 'username', 'email', 'role', 'avatar_url', 'created_at')
      .orderBy('created_at', 'desc');
    res.json({ users: rows });
  } catch (err) { next(err); }
});

// PUT /v1/admin/users/:id/role — Change user role
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

export default router;
