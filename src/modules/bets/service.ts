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

// ─── Constants ───

const BET_STAKE = 100;

// Points scoring: exact=3, correct diff=2, correct winner=1
const POINTS_EXACT = 3;
const POINTS_DIFF = 2;
const POINTS_WINNER = 1;

// ─── Bet Placement ───

export interface PlaceBetParams {
  userId: string;
  groupId: string;
  marketOptionId: string;
  predictedHomeScore?: number | null;
  predictedAwayScore?: number | null;
  correlationId?: string;
}

export interface PlaceBetResult {
  bet: queries.BetRow;
  marketOption: queries.MarketOptionRow;
  isExisting: boolean;
}

export async function placeBet(params: PlaceBetParams): Promise<PlaceBetResult> {
  const { userId, groupId, marketOptionId, predictedHomeScore, predictedAwayScore, correlationId } = params;

  // Check for existing bet on same option
  const existingBet = await queries.findExistingBet(userId, groupId, marketOptionId);
  if (existingBet) {
    // If score prediction changed, update it
    if (predictedHomeScore != null && predictedAwayScore != null &&
        (existingBet.predicted_home_score !== predictedHomeScore || existingBet.predicted_away_score !== predictedAwayScore)) {
      const db = getDb();
      await db('bets').where('id', existingBet.id).update({
        predicted_home_score: predictedHomeScore,
        predicted_away_score: predictedAwayScore,
      });
      existingBet.predicted_home_score = predictedHomeScore;
      existingBet.predicted_away_score = predictedAwayScore;
    }
    const option = await queries.findMarketOptionById(marketOptionId);
    return { bet: existingBet, marketOption: option!, isExisting: true };
  }

  // Validate group exists and is active
  const group = await queries.findGroupById(groupId);
  if (!group) throw new NotFoundError('Group');
  if (group.status !== 'active') throw new BadRequestError('GROUP_NOT_ACTIVE', 'Group is not active');

  // Validate membership
  const isMember = await queries.isGroupMember(userId, groupId);
  if (!isMember) throw new ForbiddenError('You are not a member of this group');

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

  // For outright (competition-level) markets, also check group's competition_bets_deadline
  if (market.type === 'outright' && market.competition_id) {
    const fullGroup = await queries.findFullGroupById(groupId);
    if (fullGroup?.competition_bets_deadline && new Date(fullGroup.competition_bets_deadline) <= new Date()) {
      throw new BadRequestError('COMP_BETS_CLOSED', 'The deadline for competition bets in this group has passed');
    }
  }

  // Validate the market's competition is linked to this group
  const inGroup = await queries.isMarketInGroup(marketOptionId, groupId);
  if (!inGroup) {
    throw new BadRequestError('COMPETITION_NOT_IN_GROUP', 'This competition is not part of your group');
  }

  // Validate allowed bet types for this group
  if (group.allowed_bet_types && group.allowed_bet_types.length > 0) {
    // For outright markets, check the subtype (winner → competition_winner, etc.)
    let betTypeKey = market.type;
    if (market.type === 'outright' && market.subtype) {
      const subtypeMap: Record<string, string> = {
        winner: 'competition_winner',
        top_goalscorer: 'top_goalscorer',
        top_assists: 'top_assists',
        man_of_season: 'man_of_season',
      };
      betTypeKey = subtypeMap[market.subtype] || market.type;
    }
    if (!group.allowed_bet_types.includes(betTypeKey)) {
      throw new BadRequestError('BET_TYPE_NOT_ALLOWED', `This group does not allow ${betTypeKey.replace(/_/g, ' ')} bets`);
    }
  }

  // ONE BET PER MARKET per user per group — check if user already bet on another option in this market
  const existingMarketBet = await queries.findExistingBetOnMarket(userId, groupId, option.market_id);
  if (existingMarketBet) {
    // User is changing their bet — void the old one (no refund needed since no upfront debit)
    const db = getDb();
    await db('bets')
      .where('id', existingMarketBet.id)
      .update({ status: 'void', settled_at: db.fn.now() });
  }

  // Insert the bet
  const bet = await queries.insertBet({
    user_id: userId,
    group_id: groupId,
    market_option_id: marketOptionId,
    predicted_home_score: predictedHomeScore ?? null,
    predicted_away_score: predictedAwayScore ?? null,
  });

  // Publish bet.placed event
  const payload: BetPlacedPayload = {
    bet_id: bet.id,
    user_id: userId,
    group_id: groupId,
    market_option_id: marketOptionId,
    market_type: market.type,
    stake: BET_STAKE,
    odds: option.odds ?? null,
    scoring_format: group.scoring_format,
  };
  await publishEvent(EventNames.BET_PLACED, payload, correlationId);

  return { bet, marketOption: option, isExisting: false };
}

// ─── Settlement Engine ───

export async function settleMatchMarkets(
  matchFinished: MatchFinishedPayload,
  correlationId?: string
): Promise<void> {
  const db = getDb();
  const { match_id, result } = matchFinished;

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
    const winningOutcomeKey = determineWinningOutcome(market.type, result);

    const options = await queries.findOptionsByMarket(market.id, trx);

    const winningOptionIds = new Set<string>();
    for (const option of options) {
      if (option.outcome_key === winningOutcomeKey) {
        await queries.setOptionWinner(option.id, trx);
        winningOptionIds.add(option.id);
      }
    }

    await queries.setMarketSettled(market.id, trx);

    const pendingBets = await queries.findPendingBetsByMarket(market.id, trx);

    for (const bet of pendingBets) {
      // Look up the group's scoring format
      const group = await queries.findGroupById(bet.group_id);
      const scoringFormat = group?.scoring_format || 'betting';

      if (scoringFormat === 'points') {
        // Points format: calculate points from predicted vs actual score
        const points = calculateScorePoints(
          bet.predicted_home_score,
          bet.predicted_away_score,
          result.home_score,
          result.away_score
        );
        const outcome = points > 0 ? 'won' : 'lost';
        await queries.updateBetStatus(bet.id, outcome, trx);

        const betSettledPayload: BetSettledPayload = {
          bet_id: bet.id,
          user_id: bet.user_id,
          group_id: bet.group_id,
          market_option_id: bet.market_option_id,
          market_type: market.type,
          outcome,
          payout: points, // for points format, payout = points earned
        };
        await publishEvent(EventNames.BET_SETTLED, betSettledPayload, correlationId);
      } else {
        // Betting format: stake × odds
        const outcome = winningOptionIds.has(bet.market_option_id) ? 'won' : 'lost';
        await queries.updateBetStatus(bet.id, outcome, trx);

        const betOption = options.find((o) => o.id === bet.market_option_id);
        const odds = betOption?.odds ?? 2.0;
        const payout = outcome === 'won' ? Math.floor(BET_STAKE * (odds || 2.0)) : 0;

        const betSettledPayload: BetSettledPayload = {
          bet_id: bet.id,
          user_id: bet.user_id,
          group_id: bet.group_id,
          market_option_id: bet.market_option_id,
          market_type: market.type,
          outcome,
          payout,
        };
        await publishEvent(EventNames.BET_SETTLED, betSettledPayload, correlationId);
      }
    }

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

/**
 * Calculate points for a score prediction.
 * - Exact score: 3 points
 * - Correct goal difference: 2 points
 * - Correct winner: 1 point
 * - Wrong: 0 points
 */
function calculateScorePoints(
  predictedHome: number | null,
  predictedAway: number | null,
  actualHome: number,
  actualAway: number
): number {
  if (predictedHome == null || predictedAway == null) return 0;

  // Exact score match
  if (predictedHome === actualHome && predictedAway === actualAway) {
    return POINTS_EXACT;
  }

  const predictedDiff = predictedHome - predictedAway;
  const actualDiff = actualHome - actualAway;

  // Correct goal difference
  if (predictedDiff === actualDiff) {
    return POINTS_DIFF;
  }

  // Correct winner (or both predicted draw and actual draw)
  const predictedOutcome = predictedHome > predictedAway ? 'home' : predictedHome < predictedAway ? 'away' : 'draw';
  const actualOutcome = actualHome > actualAway ? 'home' : actualHome < actualAway ? 'away' : 'draw';

  if (predictedOutcome === actualOutcome) {
    return POINTS_WINNER;
  }

  return 0;
}

function determineWinningOutcome(
  marketType: string,
  result: MatchFinishedPayload['result']
): string {
  switch (marketType) {
    case 'match_outcome':
      return result.outcome;
    default:
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
    closes_at: kickoffAt,
  });

  await queries.insertMarketOptions([
    { market_id: market.id, label: homeTeam, outcome_key: 'home' },
    { market_id: market.id, label: 'Draw', outcome_key: 'draw' },
    { market_id: market.id, label: awayTeam, outcome_key: 'away' },
  ]);
}
