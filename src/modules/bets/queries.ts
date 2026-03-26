import { Knex } from 'knex';
import { getDb } from '../../shared/db';

// ─── Competitions ───

export interface CompetitionRow {
  id: string;
  name: string;
  sport: string;
  type: string;
  country: string | null;
  starts_at: string | null;
  ends_at: string | null;
}

export interface CompetitionFilters {
  sport?: string;
  country?: string;
  type?: string;
}

export async function findCompetitions(
  filters: CompetitionFilters
): Promise<CompetitionRow[]> {
  const qb = getDb()('competitions').select('*').where('published', true);
  if (filters.sport) qb.where('sport', filters.sport);
  if (filters.country) qb.where('country', filters.country);
  if (filters.type) qb.where('type', filters.type);
  return qb;
}

// ─── Matches ───

export interface MatchRow {
  id: string;
  competition_id: string;
  home_team: string;
  away_team: string;
  status: string;
  result: Record<string, unknown> | null;
  kickoff_at: string;
}

export interface MatchFilters {
  status?: string;
  from?: string;
  to?: string;
}

export async function findMatchesByCompetition(
  competitionId: string,
  filters: MatchFilters
): Promise<MatchRow[]> {
  const qb = getDb()('matches')
    .select('*')
    .where('competition_id', competitionId)
    .where('published', true)
    .orderBy('kickoff_at', 'asc');
  if (filters.status) qb.where('status', filters.status);
  if (filters.from) qb.where('kickoff_at', '>=', filters.from);
  if (filters.to) qb.where('kickoff_at', '<=', filters.to);
  return qb;
}

export async function findMatchById(matchId: string): Promise<MatchRow | undefined> {
  return getDb()('matches').where('id', matchId).first();
}

// ─── Markets & Options ───

export interface MarketOptionRow {
  id: string;
  market_id: string;
  player_id: string | null;
  label: string;
  outcome_key: string;
  odds: number | null;
  is_winner: boolean;
}

export interface MarketRow {
  id: string;
  match_id: string | null;
  competition_id: string | null;
  type: string;
  status: string;
  closes_at: string | null;
  settled_at: string | null;
}

export interface MarketWithOptions extends MarketRow {
  options: MarketOptionRow[];
}

export async function findMarketsByMatch(matchId: string): Promise<MarketWithOptions[]> {
  const markets: MarketRow[] = await getDb()('markets')
    .select('*')
    .where('match_id', matchId);
  return attachOptions(markets);
}

export async function findMarketsByCompetition(
  competitionId: string
): Promise<MarketWithOptions[]> {
  const markets: MarketRow[] = await getDb()('markets')
    .select('*')
    .where('competition_id', competitionId)
    .where('type', 'outright');
  return attachOptions(markets);
}

async function attachOptions(markets: MarketRow[]): Promise<MarketWithOptions[]> {
  if (markets.length === 0) return [];
  const marketIds = markets.map((m) => m.id);
  const options: MarketOptionRow[] = await getDb()('market_options')
    .select('*')
    .whereIn('market_id', marketIds);
  const optionsByMarket = new Map<string, MarketOptionRow[]>();
  for (const opt of options) {
    const list = optionsByMarket.get(opt.market_id) || [];
    list.push(opt);
    optionsByMarket.set(opt.market_id, list);
  }
  return markets.map((m) => ({
    ...m,
    options: optionsByMarket.get(m.id) || [],
  }));
}

export async function findMarketById(
  marketId: string,
  trx?: Knex.Transaction
): Promise<MarketRow | undefined> {
  return (trx || getDb())('markets').where('id', marketId).first();
}

export async function findMarketOptionById(
  optionId: string,
  trx?: Knex.Transaction
): Promise<MarketOptionRow | undefined> {
  return (trx || getDb())('market_options').where('id', optionId).first();
}

export async function findOpenMarketsByMatch(
  matchId: string,
  trx: Knex.Transaction
): Promise<MarketRow[]> {
  return trx('markets')
    .where('match_id', matchId)
    .whereIn('status', ['open', 'suspended']);
}

export async function findOptionsByMarket(
  marketId: string,
  trx: Knex.Transaction
): Promise<MarketOptionRow[]> {
  return trx('market_options').where('market_id', marketId);
}

export async function findPendingBetsByMarket(
  marketId: string,
  trx: Knex.Transaction
): Promise<BetRow[]> {
  return trx('bets')
    .join('market_options', 'market_options.id', 'bets.market_option_id')
    .where('market_options.market_id', marketId)
    .where('bets.status', 'pending')
    .select('bets.*');
}

// ─── Market creation ───

export async function insertMarket(
  data: {
    match_id?: string | null;
    competition_id?: string | null;
    type: string;
    status: string;
    closes_at?: string | null;
  },
  trx?: Knex.Transaction
): Promise<MarketRow> {
  const [row] = await (trx || getDb())('markets').insert(data).returning('*');
  return row;
}

export async function insertMarketOptions(
  options: Array<{
    market_id: string;
    label: string;
    outcome_key: string;
    player_id?: string | null;
    odds?: number | null;
  }>,
  trx?: Knex.Transaction
): Promise<MarketOptionRow[]> {
  return (trx || getDb())('market_options').insert(options).returning('*');
}

// ─── Market settlement updates ───

export async function setMarketSettled(
  marketId: string,
  trx: Knex.Transaction
): Promise<void> {
  await trx('markets')
    .where('id', marketId)
    .update({ status: 'settled', settled_at: trx.fn.now() });
}

export async function setOptionWinner(
  optionId: string,
  trx: Knex.Transaction
): Promise<void> {
  await trx('market_options').where('id', optionId).update({ is_winner: true });
}

// ─── Bets ───

export interface BetRow {
  id: string;
  user_id: string;
  group_id: string;
  market_option_id: string;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  status: string;
  placed_at: string;
  settled_at: string | null;
}

export async function findExistingBet(
  userId: string,
  groupId: string,
  marketOptionId: string,
  trx?: Knex.Transaction
): Promise<BetRow | undefined> {
  return (trx || getDb())('bets')
    .where('user_id', userId)
    .where('group_id', groupId)
    .where('market_option_id', marketOptionId)
    .first();
}

export async function insertBet(
  data: {
    user_id: string;
    group_id: string;
    market_option_id: string;
    predicted_home_score?: number | null;
    predicted_away_score?: number | null;
  },
  trx?: Knex.Transaction
): Promise<BetRow> {
  const [row] = await (trx || getDb())('bets').insert(data).returning('*');
  return row;
}

export async function updateBetStatus(
  betId: string,
  status: 'won' | 'lost' | 'void',
  trx: Knex.Transaction
): Promise<void> {
  await trx('bets')
    .where('id', betId)
    .update({ status, settled_at: trx.fn.now() });
}

export interface BetWithDetails {
  id: string;
  status: string;
  placed_at: string;
  settled_at: string | null;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  market_option_label: string;
  market_option_id: string;
  market_option_odds: number | null;
  market_id: string;
  market_type: string;
  market_status: string;
  home_team: string | null;
  away_team: string | null;
  home_score: number | null;
  away_score: number | null;
  match_status: string | null;
}

export async function findBetsByUserAndGroup(
  userId: string,
  groupId: string,
  status?: string
): Promise<BetWithDetails[]> {
  const qb = getDb()('bets')
    .join('market_options', 'market_options.id', 'bets.market_option_id')
    .join('markets', 'markets.id', 'market_options.market_id')
    .leftJoin('matches', 'matches.id', 'markets.match_id')
    .where('bets.user_id', userId)
    .where('bets.group_id', groupId)
    .select(
      'bets.id',
      'bets.status',
      'bets.placed_at',
      'bets.settled_at',
      'bets.predicted_home_score',
      'bets.predicted_away_score',
      'market_options.label as market_option_label',
      'market_options.id as market_option_id',
      'market_options.odds as market_option_odds',
      'markets.id as market_id',
      'markets.type as market_type',
      'markets.status as market_status',
      'matches.home_team',
      'matches.away_team',
      'matches.home_score',
      'matches.away_score',
      'matches.status as match_status'
    )
    .orderBy('bets.placed_at', 'desc');
  if (status) qb.where('bets.status', status);
  return qb;
}

// ─── Membership + Group check ───

export async function isGroupMember(
  userId: string,
  groupId: string
): Promise<boolean> {
  const row = await getDb()('group_members')
    .where('user_id', userId)
    .where('group_id', groupId)
    .first();
  return !!row;
}

export async function findGroupById(
  groupId: string
): Promise<{ id: string; scoring_format: string; status: string; allowed_bet_types: string[] } | undefined> {
  return getDb()('groups').where('id', groupId).select('id', 'scoring_format', 'status', 'allowed_bet_types').first();
}

/**
 * Check if a user already has a pending bet on ANY option in a given market (for a group).
 * Used to enforce one-bet-per-market rule.
 */
export async function findExistingBetOnMarket(
  userId: string,
  groupId: string,
  marketId: string
): Promise<BetRow | undefined> {
  return getDb()('bets')
    .join('market_options', 'market_options.id', 'bets.market_option_id')
    .where('bets.user_id', userId)
    .where('bets.group_id', groupId)
    .where('market_options.market_id', marketId)
    .where('bets.status', 'pending')
    .select('bets.*')
    .first();
}

/**
 * Check if a market's competition is linked to a group.
 */
export async function isMarketInGroup(
  marketOptionId: string,
  groupId: string
): Promise<boolean> {
  const option = await getDb()('market_options').where('id', marketOptionId).first();
  if (!option) return false;

  const market = await getDb()('markets').where('id', option.market_id).first();
  if (!market) return false;

  // Get the competition_id from the market or via the match
  let competitionId: string | null = market.competition_id;
  if (!competitionId && market.match_id) {
    const match = await getDb()('matches').where('id', market.match_id).first();
    competitionId = match?.competition_id ?? null;
  }
  if (!competitionId) return false;

  // Check if this competition is linked to the group
  const link = await getDb()('group_competitions')
    .where({ group_id: groupId, competition_id: competitionId })
    .first();
  return !!link;
}
