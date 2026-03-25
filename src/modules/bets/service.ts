import { getDb } from '../../shared/db';
import { publishEvent } from '../../shared/events/publish';
import { EventNames } from '../../shared/events/types';
import type {
  BetPlacedPayload,
  BetSettledPayload,
  MarketSettledPayload,
  MatchFinishedPayload,
} from '../../shared/events/types';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors';
import * as queries from './queries';

// ─── Bet Placement ───

export interface PlaceBetParams {
  userId: string;
  seasonId: string;
  marketOptionId: string;
  correlationId?: string;
}

export interface PlaceBetResult {
  bet: queries.BetRow;
  marketOption: queries.MarketOptionRow;
  isExisting: boolean;
}

export async function placeBet(params: PlaceBetParams): Promise<PlaceBetResult> {
  const { userId, seasonId, marketOptionId, correlationId } = params;

  // Check for existing bet (idempotency via UNIQUE(user_id, market_option_id))
  const existingBet = await queries.findExistingBet(userId, marketOptionId);
  if (existingBet) {
    const option = await queries.findMarketOptionById(marketOptionId);
    return { bet: existingBet, marketOption: option!, isExisting: true };
  }

  // Validate season and membership
  const season = await queries.findSeasonById(seasonId);
  if (!season) throw new NotFoundError('Season');

  const isMember = await queries.isGroupMember(userId, season.group_id);
  if (!isMember) throw new ForbiddenError('You are not a member of this season\'s group');

  // Validate market option and market status
  const option = await queries.findMarketOptionById(marketOptionId);
  if (!option) throw new NotFoundError('Market option');

  const market = await queries.findMarketById(option.market_id);
  if (!market) throw new NotFoundError('Market');

  if (market.status !== 'open') {
    throw new BadRequestError('MARKET_CLOSED', 'Market is not open for betting');
  }

  if (market.closes_at && new Date(market.closes_at) <= new Date()) {
    throw new BadRequestError('MARKET_CLOSED', 'Market has passed its closing time');
  }

  // Insert the bet
  const bet = await queries.insertBet({
    user_id: userId,
    season_id: seasonId,
    market_option_id: marketOptionId,
  });

  // Publish bet.placed event
  const payload: BetPlacedPayload = {
    bet_id: bet.id,
    user_id: userId,
    season_id: seasonId,
    group_id: season.group_id,
    market_option_id: marketOptionId,
    market_type: market.type,
  };
  await publishEvent(EventNames.BET_PLACED, payload, correlationId);

  return { bet, marketOption: option, isExisting: false };
}

// ─── Settlement Engine ───

/**
 * Settle all open/suspended markets for a finished match.
 * Each market is settled atomically within its own transaction.
 */
export async function settleMatchMarkets(
  matchFinished: MatchFinishedPayload,
  correlationId?: string
): Promise<void> {
  const db = getDb();
  const { match_id, result } = matchFinished;

  // Get all unsettled markets for this match (outside transaction for the list)
  const marketsToSettle = await db('markets')
    .where('match_id', match_id)
    .whereIn('status', ['open', 'suspended']);

  for (const market of marketsToSettle) {
    await settleMarket(market, result, correlationId);
  }
}

async function settleMarket(
  market: queries.MarketRow,
  result: MatchFinishedPayload['result'],
  correlationId?: string
): Promise<void> {
  const db = getDb();

  await db.transaction(async (trx) => {
    // Determine winning outcome key based on market type and result
    const winningOutcomeKey = determineWinningOutcome(market.type, result);

    // Get all options for this market
    const options = await queries.findOptionsByMarket(market.id, trx);

    // Mark winning option(s)
    const winningOptionIds = new Set<string>();
    for (const option of options) {
      if (option.outcome_key === winningOutcomeKey) {
        await queries.setOptionWinner(option.id, trx);
        winningOptionIds.add(option.id);
      }
    }

    // Settle the market
    await queries.setMarketSettled(market.id, trx);

    // Settle all pending bets on this market
    const pendingBets = await queries.findPendingBetsByMarket(market.id, trx);

    for (const bet of pendingBets) {
      const outcome = winningOptionIds.has(bet.market_option_id) ? 'won' : 'lost';
      await queries.updateBetStatus(bet.id, outcome, trx);

      // We need season -> group_id for the event payload.
      // Fetch it inside the transaction to stay consistent.
      const season = await trx('seasons').where('id', bet.season_id).first();

      const betSettledPayload: BetSettledPayload = {
        bet_id: bet.id,
        user_id: bet.user_id,
        season_id: bet.season_id,
        group_id: season?.group_id ?? '',
        market_option_id: bet.market_option_id,
        market_type: market.type,
        outcome,
      };
      await publishEvent(EventNames.BET_SETTLED, betSettledPayload, correlationId);
    }

    // Publish market.settled
    const marketSettledPayload: MarketSettledPayload = {
      market_id: market.id,
      match_id: market.match_id,
      competition_id: market.competition_id,
      market_type: market.type,
      winning_outcome_key: winningOutcomeKey,
    };
    await publishEvent(EventNames.MARKET_SETTLED, marketSettledPayload, correlationId);
  });
}

function determineWinningOutcome(
  marketType: string,
  result: MatchFinishedPayload['result']
): string {
  switch (marketType) {
    case 'match_outcome':
      return result.outcome; // 'home' | 'draw' | 'away'
    default:
      // For other market types, fall back to the match outcome.
      // More specific market types (player_stat, in_match_event) would
      // need richer logic based on the events array in the payload.
      return result.outcome;
  }
}

// ─── Auto-create match_outcome market ───

export interface CreateMatchMarketParams {
  matchId: string;
  competitionId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  correlationId?: string;
}

export async function createMatchOutcomeMarket(
  params: CreateMatchMarketParams
): Promise<void> {
  const { matchId, homeTeam, awayTeam, kickoffAt } = params;

  const market = await queries.insertMarket({
    match_id: matchId,
    competition_id: null,
    type: 'match_outcome',
    status: 'open',
    closes_at: kickoffAt, // market closes at kickoff
  });

  await queries.insertMarketOptions([
    { market_id: market.id, label: homeTeam, outcome_key: 'home' },
    { market_id: market.id, label: 'Draw', outcome_key: 'draw' },
    { market_id: market.id, label: awayTeam, outcome_key: 'away' },
  ]);
}
