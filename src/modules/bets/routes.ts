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

    const bets = rows.map((b) => {
      // Compute winning option for match_outcome markets
      let winningOption: string | null = null;
      if (b.match_status === 'finished' && b.home_score !== null && b.away_score !== null && b.market_type === 'match_outcome') {
        if (b.home_score > b.away_score) winningOption = b.home_team || 'Home';
        else if (b.away_score > b.home_score) winningOption = b.away_team || 'Away';
        else winningOption = 'Draw';
      }

      return {
        id: b.id,
        status: b.status,
        predicted_home_score: b.predicted_home_score,
        predicted_away_score: b.predicted_away_score,
        market_option: {
          label: b.market_option_label,
          odds: b.market_option_odds,
        },
        market: {
          type: b.market_type,
          status: b.market_status,
          winning_option: winningOption,
          match: b.home_team
            ? {
                home_team: b.home_team,
                away_team: b.away_team,
                home_score: b.home_score,
                away_score: b.away_score,
                status: b.match_status,
              }
            : null,
        },
        placed_at: b.placed_at,
        settled_at: b.settled_at,
      };
    });

    res.json({ bets });
  } catch (err) {
    next(err);
  }
});

// ─── GET /v1/competitions/:id/teams (public) ───

router.get(
  '/competitions/:competitionId/teams',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await (await import('../../shared/db')).getDb()('teams')
        .where('competition_id', req.params.competitionId)
        .select('id', 'name', 'short_name', 'photo_url')
        .orderBy('name', 'asc');
      res.json({ teams: rows });
    } catch (err) { next(err); }
  }
);

// ─── GET /v1/teams/:id/players (public) ───

router.get(
  '/teams/:teamId/players',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await (await import('../../shared/db')).getDb()('players')
        .where('team_id', req.params.teamId)
        .select('id', 'name', 'position', 'photo_url')
        .orderBy('name', 'asc');
      res.json({ players: rows });
    } catch (err) { next(err); }
  }
);

// ─── GET /v1/matches/:matchId/events (public — in-match event markets) ───

router.get(
  '/matches/:matchId/events',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = (await import('../../shared/db')).getDb();
      const markets = await db('markets')
        .where('match_id', req.params.matchId)
        .where('type', 'in_match_event')
        .select('*');

      const marketIds = markets.map((m: { id: string }) => m.id);
      const options = marketIds.length > 0
        ? await db('market_options').whereIn('market_id', marketIds).select('*')
        : [];

      const events = markets.map((m: Record<string, unknown>) => ({
        ...m,
        options: options
          .filter((o: { market_id: string }) => o.market_id === m.id)
          .map((o: Record<string, unknown>) => ({
            id: o.id, label: o.label, outcome_key: o.outcome_key, odds: o.odds,
          })),
      }));
      res.json({ events });
    } catch (err) { next(err); }
  }
);

// ─── GET /v1/users/:userId/bets?group_id=... — View another user's bet history ───

router.get('/users/:userId/bets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const viewerId = req.userId;
    const targetUserId = req.params.userId;
    const { group_id } = req.query as Record<string, string | undefined>;

    if (!viewerId) throw new BadRequestError('AUTH_REQUIRED', 'Authentication is required');
    if (!group_id) throw new BadRequestError('VALIDATION', 'group_id query parameter is required');

    // Both must be in the same group
    const db = (await import('../../shared/db')).getDb();
    const viewerMember = await db('group_members').where({ user_id: viewerId, group_id }).first();
    if (!viewerMember) throw new BadRequestError('NOT_MEMBER', 'You are not a member of this group');

    const targetMember = await db('group_members').where({ user_id: targetUserId, group_id }).first();
    if (!targetMember) throw new BadRequestError('NOT_MEMBER', 'User is not a member of this group');

    const isSelf = viewerId === targetUserId;

    // Get bets with full details
    let qb = db('bets')
      .join('market_options', 'market_options.id', 'bets.market_option_id')
      .join('markets', 'markets.id', 'market_options.market_id')
      .leftJoin('matches', 'matches.id', 'markets.match_id')
      .where('bets.user_id', targetUserId)
      .where('bets.group_id', group_id)
      .select(
        'bets.id', 'bets.status', 'bets.placed_at', 'bets.settled_at',
        'bets.predicted_home_score', 'bets.predicted_away_score',
        'market_options.label as option_label',
        'market_options.odds',
        'markets.type as market_type',
        'markets.question',
        'matches.home_team', 'matches.away_team',
        'matches.status as match_status'
      )
      .orderBy('bets.placed_at', 'desc');

    if (!isSelf) {
      // Hide bets on unplayed matches (only show finished/live match bets + outrights)
      qb = qb.where(function() {
        this.whereNull('markets.match_id') // outright / competition bets — always visible
          .orWhereIn('matches.status', ['finished', 'live', 'cancelled']);
      });
    }

    const rows = await qb;

    const bets = rows.map((b: Record<string, unknown>) => ({
      id: b.id,
      status: b.status,
      option_label: b.option_label,
      odds: b.odds,
      market_type: b.market_type,
      question: b.question,
      match: b.home_team ? { home_team: b.home_team, away_team: b.away_team, status: b.match_status } : null,
      predicted_score: b.predicted_home_score != null ? `${b.predicted_home_score}-${b.predicted_away_score}` : null,
      placed_at: b.placed_at,
      settled_at: b.settled_at,
    }));

    res.json({ bets });
  } catch (err) { next(err); }
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
