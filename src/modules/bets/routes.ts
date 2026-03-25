import { Router, Request, Response, NextFunction } from 'express';
import * as queries from './queries';
import * as service from './service';
import { BadRequestError } from '../../shared/errors';

const router = Router();

// Augment Express Request with auth fields
interface AuthRequest extends Request {
  userId?: string;
  correlationId?: string;
}

// ─── GET /v1/competitions ───

router.get('/competitions', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { sport, country, type } = req.query as Record<string, string | undefined>;
    const rows = await queries.findCompetitions({ sport, country, type });
    const competitions = rows.map((c) => ({
      id: c.id,
      name: c.name,
      sport: c.sport,
    }));
    res.json({ competitions });
  } catch (err) {
    next(err);
  }
});

// ─── GET /v1/competitions/:competitionId/matches ───

router.get(
  '/competitions/:competitionId/matches',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const competitionId = req.params.competitionId as string;
      const { status, from, to } = req.query as Record<string, string | undefined>;
      const rows = await queries.findMatchesByCompetition(competitionId, { status, from, to });
      const matches = rows.map((m) => ({
        id: m.id,
        home_team: m.home_team,
        away_team: m.away_team,
        status: m.status,
        kickoff_at: m.kickoff_at,
      }));
      res.json({ matches });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /v1/matches/:matchId/markets ───

router.get(
  '/matches/:matchId/markets',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const matchId = req.params.matchId as string;
      const markets = await queries.findMarketsByMatch(matchId);
      res.json({
        markets: markets.map(formatMarket),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /v1/competitions/:competitionId/markets ───

router.get(
  '/competitions/:competitionId/markets',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const competitionId = req.params.competitionId as string;
      const markets = await queries.findMarketsByCompetition(competitionId);
      res.json({
        markets: markets.map(formatMarket),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /v1/bets ───

router.post('/bets', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId;
    if (!userId) {
      throw new BadRequestError('AUTH_REQUIRED', 'Authentication is required');
    }

    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) {
      throw new BadRequestError('MISSING_HEADER', 'Idempotency-Key header is required');
    }

    const { season_id, market_option_id } = req.body;
    if (!season_id || !market_option_id) {
      throw new BadRequestError('VALIDATION', 'season_id and market_option_id are required');
    }

    const result = await service.placeBet({
      userId,
      seasonId: season_id,
      marketOptionId: market_option_id,
      correlationId: req.correlationId,
    });

    const responseBody = {
      id: result.bet.id,
      status: result.bet.status,
      market_option: {
        id: result.marketOption.id,
        label: result.marketOption.label,
      },
      placed_at: result.bet.placed_at,
    };

    // Return 200 for idempotent duplicate, 201 for new bet
    res.status(result.isExisting ? 200 : 201).json(responseBody);
  } catch (err) {
    next(err);
  }
});

// ─── GET /v1/bets ───

router.get('/bets', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId;
    if (!userId) {
      throw new BadRequestError('AUTH_REQUIRED', 'Authentication is required');
    }

    const { season_id, status } = req.query as Record<string, string | undefined>;
    if (!season_id) {
      throw new BadRequestError('VALIDATION', 'season_id query parameter is required');
    }

    const rows = await queries.findBetsByUserAndSeason(userId, season_id, status);

    const bets = rows.map((b) => ({
      id: b.id,
      status: b.status,
      market_option: {
        label: b.market_option_label,
      },
      market: {
        type: b.market_type,
        match: b.home_team
          ? { home_team: b.home_team, away_team: b.away_team }
          : null,
      },
      placed_at: b.placed_at,
      settled_at: b.settled_at,
    }));

    res.json({ bets });
  } catch (err) {
    next(err);
  }
});

// ─── POST /v1/admin/matches/:matchId/finish — Settle a match ───

router.post(
  '/admin/matches/:matchId/finish',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const matchId = req.params.matchId as string;
      const { home_score, away_score } = req.body;

      if (home_score == null || away_score == null) {
        throw new BadRequestError('VALIDATION', 'home_score and away_score are required');
      }

      const db = (await import('../../shared/db')).getDb();

      // Get the match
      const match = await db('matches').where({ id: matchId }).first();
      if (!match) {
        throw new BadRequestError('NOT_FOUND', 'Match not found');
      }

      // Determine outcome
      const outcome: 'home' | 'draw' | 'away' =
        home_score > away_score ? 'home' : home_score < away_score ? 'away' : 'draw';

      // Update match status and result
      await db('matches').where({ id: matchId }).update({
        status: 'finished',
        result: JSON.stringify({ home_score, away_score, outcome }),
      });

      // Publish match.finished and let the settlement engine handle everything
      const { publishEvent } = await import('../../shared/events/publish');
      const { EventNames } = await import('../../shared/events/types');

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
    } catch (err) {
      next(err);
    }
  }
);

// ─── Helpers ───

function formatMarket(m: queries.MarketWithOptions) {
  return {
    id: m.id,
    type: m.type,
    status: m.status,
    closes_at: m.closes_at,
    options: m.options.map((o) => ({
      id: o.id,
      label: o.label,
      outcome_key: o.outcome_key,
      ...(o.player_id ? { player: o.player_id } : {}),
    })),
  };
}

export default router;
