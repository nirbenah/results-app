/**
 * Wallet event subscribers.
 *
 * Reacts to domain events and creates wallet transactions.
 * All handlers are idempotent — they check reference_id
 * before inserting to guard against duplicate processing.
 */

import { getEventBus } from '../../shared/events';
import { EventEnvelope, EventNames, BetPlacedPayload, BetSettledPayload, SeasonFinishedPayload } from '../../shared/events/types';
import * as walletService from './service';

const DEFAULT_ENTRY_FEE = 100;
const DEFAULT_WIN_CREDIT = 200;

export function registerSubscribers(): void {
  const bus = getEventBus();

  /**
   * bet.placed — debit entry fee from the user's wallet.
   */
  bus.subscribe(
    EventNames.BET_PLACED,
    async (envelope: EventEnvelope) => {
      const payload = envelope.payload as BetPlacedPayload;

      try {
        await walletService.debitEntryFee(
          payload.user_id,
          payload.season_id,
          DEFAULT_ENTRY_FEE
        );
      } catch (err) {
        console.error(
          `[Wallet] Failed to debit entry fee for bet ${payload.bet_id}:`,
          err
        );
      }
    }
  );

  /**
   * bet.settled with outcome='won' — credit the user's wallet.
   */
  bus.subscribe(
    EventNames.BET_SETTLED,
    async (envelope: EventEnvelope) => {
      const payload = envelope.payload as BetSettledPayload;

      if (payload.outcome !== 'won') {
        return;
      }

      try {
        await walletService.creditWin(
          payload.user_id,
          payload.season_id,
          payload.bet_id,
          DEFAULT_WIN_CREDIT
        );
      } catch (err) {
        console.error(
          `[Wallet] Failed to credit win for bet ${payload.bet_id}:`,
          err
        );
      }
    }
  );

  /**
   * season.finished — distribute payouts to top 3 ranked users.
   */
  bus.subscribe(
    EventNames.SEASON_FINISHED,
    async (envelope: EventEnvelope) => {
      const payload = envelope.payload as SeasonFinishedPayload;

      const rankings = payload.final_standings.map((entry) => ({
        rank: entry.rank,
        user_id: entry.user_id,
      }));

      try {
        await walletService.distributePayout(payload.season_id, rankings);
      } catch (err) {
        console.error(
          `[Wallet] Failed to distribute payouts for season ${payload.season_id}:`,
          err
        );
      }
    }
  );
}
