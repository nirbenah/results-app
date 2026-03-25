import {
  EventEnvelope,
  EventNames,
  BetPlacedPayload,
  BetSettledPayload,
} from '../../shared/events';
import { getEventBus } from '../../shared/events';
import * as service from './service';

export function registerSubscribers(): void {
  const bus = getEventBus();

  bus.subscribe(
    EventNames.BET_PLACED,
    async (envelope: EventEnvelope) => {
      const payload = envelope.payload as BetPlacedPayload;
      await service.handleBetPlaced(
        payload.group_id,
        payload.user_id,
        envelope.correlation_id
      );
    }
  );

  bus.subscribe(
    EventNames.BET_SETTLED,
    async (envelope: EventEnvelope) => {
      const payload = envelope.payload as BetSettledPayload;

      // Void bets don't affect the leaderboard
      if (payload.outcome === 'void') return;

      const won = payload.outcome === 'won';
      await service.handleBetSettled(
        payload.group_id,
        payload.user_id,
        won,
        payload.payout,
        envelope.correlation_id
      );
    }
  );
}
