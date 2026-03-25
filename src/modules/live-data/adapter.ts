/**
 * Sports data provider adapter interface and mock implementation.
 *
 * ISportsDataAdapter defines the contract that real providers
 * (SportRadar, API-Football, etc.) must implement.
 * MockSportsAdapter returns deterministic dummy data for development.
 */

// ─── External data shapes (normalised to our domain) ───

export interface ExternalMatch {
  external_id: string;
  competition_id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string; // ISO-8601
  status: 'scheduled' | 'live' | 'finished' | 'cancelled';
}

export interface ExternalMatchResult {
  external_id: string;
  home_score: number;
  away_score: number;
  outcome: 'home' | 'draw' | 'away';
}

export interface ExternalMatchEvent {
  event_type: 'goal' | 'yellow_card' | 'red_card' | 'penalty';
  minute: number;
  player_id: string | null;
  team: 'home' | 'away';
  detail: Record<string, unknown>;
}

// ─── Adapter interface ───

export interface ISportsDataAdapter {
  /** Fetch scheduled/live matches for a competition on a given date. */
  getMatches(competitionId: string, date: string): Promise<ExternalMatch[]>;

  /** Fetch the final result of a single match. */
  getMatchResult(matchId: string): Promise<ExternalMatchResult>;

  /** Fetch in-game events (goals, cards, etc.) for a match. */
  getMatchEvents(matchId: string): Promise<ExternalMatchEvent[]>;
}

// ─── Mock adapter (swap for real provider in production) ───

export class MockSportsAdapter implements ISportsDataAdapter {
  async getMatches(competitionId: string, date: string): Promise<ExternalMatch[]> {
    return [
      {
        external_id: 'mock-match-001',
        competition_id: competitionId,
        home_team: 'FC Mock United',
        away_team: 'Mock City',
        kickoff_at: `${date}T15:00:00Z`,
        status: 'scheduled',
      },
      {
        external_id: 'mock-match-002',
        competition_id: competitionId,
        home_team: 'Mock Athletic',
        away_team: 'Real Mockdrid',
        kickoff_at: `${date}T17:30:00Z`,
        status: 'scheduled',
      },
    ];
  }

  async getMatchResult(matchId: string): Promise<ExternalMatchResult> {
    return {
      external_id: matchId,
      home_score: 2,
      away_score: 1,
      outcome: 'home',
    };
  }

  async getMatchEvents(matchId: string): Promise<ExternalMatchEvent[]> {
    return [
      {
        event_type: 'goal',
        minute: 23,
        player_id: 'player-001',
        team: 'home',
        detail: { assist_player_id: 'player-003' },
      },
      {
        event_type: 'yellow_card',
        minute: 45,
        player_id: 'player-010',
        team: 'away',
        detail: {},
      },
      {
        event_type: 'goal',
        minute: 67,
        player_id: 'player-007',
        team: 'home',
        detail: {},
      },
      {
        event_type: 'goal',
        minute: 78,
        player_id: 'player-011',
        team: 'away',
        detail: {},
      },
    ];
  }
}
