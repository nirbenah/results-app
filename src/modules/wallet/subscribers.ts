/**
 * Wallet event subscribers.
 *
 * Reacts to domain events and creates wallet transactions.
 */

import { getEventBus } from '../../shared/events';
import {
  EventEnvelope,
  EventNames,
  BetPlacedPayload,
  BetSettledPayload,
  MemberJoinedPayload,
} from '../../shared/events/types';
import * as walletService from './service';

export function registerSubscribers(): void {
  const bus = getEventBus();

  /**
   * member.joined — credit initial balance (1000 credits) for betting-format groups.
   */
  bus.subscribe(
    EventNames.MEMBER_JOINED,
    async (envelope: EventEnvelope) => {
      const payload = envelope.payload as MemberJoinedPayload;

      if (payload.scoring_format !== 'betting') {
        return;
      }

      try {
        await walletService.creditInitialBalance(payload.user_id, payload.group_id);
        console.log(`[Wallet] Credited initial balance for user ${payload.user_id} in group ${payload.group_id}`);
      } catch (err) {
        console.error(
          `[Wallet] Failed to credit initial balance for user ${payload.user_id}:`,
          err
        );
      }
    }
  );

  /**
   * bet.placed — debit entry fee and credit participation bonus.
   */
  bus.subscribe(
    EventNames.BET_PLACED,
    async (envelope: EventEnvelope) => {
      const payload = envelope.payload as BetPlacedPayload;

      try {
        await walletService.debitEntryFee(
          payload.user_id,
          payload.group_id,
          payload.bet_id
        );
      } catch (err) {
        console.error(
          `[Wallet] Failed to debit entry fee for bet ${payload.bet_id}:`,
          err
        );
      }

      try {
        await walletService.creditParticipationBonus(
          payload.user_id,
          payload.group_id,
          payload.bet_id
        );
      } catch (err) {
        console.error(
          `[Wallet] Failed to credit participation bonus for bet ${payload.bet_id}:`,
          err
        );
      }
    }
  );

  /**
   * bet.settled with outcome='won' — credit the user's wallet with payout (stake × odds).
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
          payload.group_id,
          payload.bet_id,
          payload.payout
        );
      } catch (err) {
        console.error(
          `[Wallet] Failed to credit win for bet ${payload.bet_id}:`,
          err
        );
      }
    }
  );
}
