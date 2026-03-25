import { getEventBus } from '../../shared/events/event-bus';
import { EventNames } from '../../shared/events/types';
import type {
  EventEnvelope,
  MatchScheduledPayload,
  MatchFinishedPayload,
} from '../../shared/events/types';
import * as service from './service';

/**
 * Register all event subscribers for the Bets module.
 * Called once at application startup.
 */
export function registerSubscribers(): void {
  const bus = getEventBus();

  // ─── match.scheduled → auto-create match_outcome market ───
  bus.subscribe(
    EventNames.MATCH_SCHEDULED,
    async (envelope: EventEnvelope) => {
      const payload = envelope.payload as MatchScheduledPayload;

      await service.createMatchOutcomeMarket({
        matchId: payload.match_id,
        competitionId: payload.competition_id,
        homeTeam: payload.home_team,
        awayTeam: payload.away_team,
        kickoffAt: payload.kickoff_at,
        correlationId: envelope.correlation_id,
      });

      console.log(
        `[Bets] Created match_outcome market for match ${payload.match_id}`
      );
    }
  );

  // ─── match.finished → settle all match markets and bets ───
  bus.subscribe(
    EventNames.MATCH_FINISHED,
    async (envelope: EventEnvelope) => {
      const payload = envelope.payload as MatchFinishedPayload;

      await service.settleMatchMarkets(payload, envelope.correlation_id);

      console.log(
        `[Bets] Settled markets for match ${payload.match_id}`
      );
    }
  );

  // ─── match.event_occurred → settle relevant in-match bets ───
  // Placeholder: in-match event settlement would require market-type-specific
  // logic (e.g. "first goal scorer" markets). The infrastructure is in place
  // for this to be added as new market types are supported.
  bus.subscribe(
    EventNames.MATCH_EVENT_OCCURRED,
    async (_envelope: EventEnvelope) => {
      // Future: settle in_match_event markets based on event type
    }
  );
}
