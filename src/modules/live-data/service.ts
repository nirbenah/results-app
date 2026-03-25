/**
 * Live-data service — polls the sports data adapter and publishes
 * domain events that the rest of the system reacts to.
 *
 * Stateless: all persistent state lives in the DB. The service
 * reads from the adapter, upserts into `matches`, and fires events.
 */

import { getDb } from '../../shared/db';
import { publishEvent } from '../../shared/events/publish';
import {
  EventNames,
  MatchScheduledPayload,
  MatchStartedPayload,
  MatchEventOccurredPayload,
  MatchFinishedPayload,
} from '../../shared/events/types';
import { ISportsDataAdapter, ExternalMatch } from './adapter';
import { NotFoundError } from '../../shared/errors';

export class LiveDataService {
  constructor(private readonly adapter: ISportsDataAdapter) {}

  /**
   * Pull the latest schedule from the provider, upsert matches
   * into the DB, and publish match.scheduled for any new ones.
   */
  async syncScheduledMatches(competitionId: string, date?: string): Promise<void> {
    const targetDate = date ?? new Date().toISOString().slice(0, 10);
    const externalMatches = await this.adapter.getMatches(competitionId, targetDate);

    const db = getDb();

    for (const ext of externalMatches) {
      const existing = await db('matches')
        .where({ id: ext.external_id })
        .first();

      if (!existing) {
        await db('matches').insert({
          id: ext.external_id,
          competition_id: ext.competition_id,
          home_team: ext.home_team,
          away_team: ext.away_team,
          kickoff_at: ext.kickoff_at,
          status: 'scheduled',
        });

        await publishEvent<MatchScheduledPayload>(EventNames.MATCH_SCHEDULED, {
          match_id: ext.external_id,
          competition_id: ext.competition_id,
          home_team: ext.home_team,
          away_team: ext.away_team,
          kickoff_at: ext.kickoff_at,
        });
      }
    }
  }

  /**
   * Fetch the result + events for a finished match, update the DB row,
   * and publish the appropriate domain events.
   */
  async processMatchResult(matchId: string): Promise<void> {
    const db = getDb();

    const match = await db('matches').where({ id: matchId }).first();
    if (!match) {
      throw new NotFoundError('Match');
    }

    // If already finished, skip re-processing
    if (match.status === 'finished') {
      return;
    }

    // If the match was still scheduled, publish match.started first
    if (match.status === 'scheduled') {
      await db('matches').where({ id: matchId }).update({ status: 'live' });

      await publishEvent<MatchStartedPayload>(EventNames.MATCH_STARTED, {
        match_id: matchId,
        kickoff_at: match.kickoff_at,
      });
    }

    // Fetch events from the provider
    const externalEvents = await this.adapter.getMatchEvents(matchId);

    for (const evt of externalEvents) {
      await publishEvent<MatchEventOccurredPayload>(EventNames.MATCH_EVENT_OCCURRED, {
        match_id: matchId,
        event_type: evt.event_type,
        minute: evt.minute,
        player_id: evt.player_id,
        team: evt.team,
        detail: evt.detail,
      });
    }

    // Fetch final result
    const result = await this.adapter.getMatchResult(matchId);

    await db('matches').where({ id: matchId }).update({
      status: 'finished',
      result: JSON.stringify({
        home_score: result.home_score,
        away_score: result.away_score,
        outcome: result.outcome,
      }),
    });

    await publishEvent<MatchFinishedPayload>(EventNames.MATCH_FINISHED, {
      match_id: matchId,
      competition_id: match.competition_id,
      result: {
        home_score: result.home_score,
        away_score: result.away_score,
        outcome: result.outcome,
      },
      events: externalEvents.map((e) => ({
        type: e.event_type,
        minute: e.minute,
        team: e.team,
        player_id: e.player_id,
      })),
    });
  }
}
