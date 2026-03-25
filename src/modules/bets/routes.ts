import { Router, Request, Response, NextFunction } from 'express';
import * as queries from './queries';
import * as service from './service';
import { BadRequestError } from '../../shared/errors';

const router = Router();

// ─── GET /v1/competitions ───

router.get('/competitions', async (req: Request, res: Response, next: NextFunction) => {
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
  async (req: Request, res: Response, next: NextFunction) => {
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
  async (req: Request, res: Response, next: NextFunction) => {
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
  async (req: Request, res: Response, next: NextFunction) => {
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

router.post('/bets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId;
    if (!userId) {
      throw new BadRequestError('AUTH_REQUIRED', 'Authentication is required');
    }

    const { group_id, market_option_id, predicted_home_score, predicted_away_score } = req.body;
    if (!group_id || !market_option_id) {
      throw new BadRequestError('VALIDATION', 'group_id and market_option_id are required');
    }

    const result = await service.placeBet({
      userId,
      groupId: group_id,
      marketOptionId: market_option_id,
      predictedHomeScore: predicted_home_score,
      predictedAwayScore: predicted_away_score,
      correlationId: req.correlationId,
    });

    const responseBody = {
      id: result.bet.id,
      status: result.bet.status,
      market_option: {
        id: result.marketOption.id,
        label: result.marketOption.label,
        odds: result.marketOption.odds,
      },
      placed_at: result.bet.placed_at,
    };

    res.status(result.isExisting ? 200 : 201).json(responseBody);
  } catch (err) {
    next(err);
  }
});

// ─── GET /v1/bets ───

router.get('/bets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId;
    if (!userId) {
      throw new BadRequestError('AUTH_REQUIRED', 'Authentication is required');
    }

    const { group_id, status } = req.query as Record<string, string | undefined>;
    if (!group_id) {
      throw new BadRequestError('VALIDATION', 'group_id query parameter is required');
    }

    const rows = await queries.findBetsByUserAndGroup(userId, group_id, status);

    const bets = rows.map((b) => ({
      id: b.id,
      status: b.status,
      market_option: {
        label: b.market_option_label,
        odds: b.market_option_odds,
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
      odds: o.odds,
      ...(o.player_id ? { player: o.player_id } : {}),
    })),
  };
}

export default router;
