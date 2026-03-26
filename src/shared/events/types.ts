/**
 * Event envelope — matches EVENTS.md spec.
 * Every event published through the bus uses this wrapper.
 */
export interface EventEnvelope<T = unknown> {
  event: string;
  version: string;
  timestamp: string;
  correlation_id: string;
  payload: T;
}

// ─── Live Data / Admin events ───

export interface MatchScheduledPayload {
  match_id: string;
  competition_id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
}

export interface MatchStartedPayload {
  match_id: string;
  kickoff_at: string;
}

export interface MatchEventOccurredPayload {
  match_id: string;
  event_type: 'goal' | 'yellow_card' | 'red_card' | 'penalty';
  minute: number;
  player_id: string | null;
  team: 'home' | 'away';
  detail: Record<string, unknown>;
}

export interface MatchFinishedPayload {
  match_id: string;
  competition_id: string;
  result: {
    home_score: number;
    away_score: number;
    outcome: 'home' | 'draw' | 'away';
  };
  events: Array<{
    type: string;
    minute: number;
    team: 'home' | 'away';
    player_id: string | null;
  }>;
}

// ─── Bets Service events ───

export interface BetPlacedPayload {
  bet_id: string;
  user_id: string;
  group_id: string;
  market_option_id: string;
  market_type: string;
  stake: number;
  odds: number | null;
  scoring_format: string;
}

export interface BetSettledPayload {
  bet_id: string;
  user_id: string;
  group_id: string;
  market_option_id: string;
  market_type: string;
  outcome: 'won' | 'lost' | 'void';
  payout: number;
}

export interface MarketSettledPayload {
  market_id: string;
  match_id: string | null;
  competition_id: string | null;
  market_type: string;
  winning_outcome_key: string;
}

// ─── Groups Service events ───

export interface StandingsUpdatedPayload {
  group_id: string;
  top_entries: Array<{
    rank: number;
    user_id: string;
    username: string;
    balance: number;
  }>;
  rank_changes: Array<{
    user_id: string;
    old_rank: number;
    new_rank: number;
  }>;
}

// ─── Member events ───

export interface MemberJoinedPayload {
  group_id: string;
  user_id: string;
  scoring_format: string;
}

// ─── Event name constants ───

export const EventNames = {
  MATCH_SCHEDULED: 'match.scheduled',
  MATCH_STARTED: 'match.started',
  MATCH_EVENT_OCCURRED: 'match.event_occurred',
  MATCH_FINISHED: 'match.finished',
  BET_PLACED: 'bet.placed',
  BET_SETTLED: 'bet.settled',
  MARKET_SETTLED: 'market.settled',
  GROUP_STANDINGS_UPDATED: 'group.standings_updated',
  MEMBER_JOINED: 'member.joined',
} as const;
