/**
 * Wallet event subscribers.
 *
 * Reacts to domain events and creates wallet transactions.
 * Descriptions include match/event info for rich display.
 */

import { getEventBus } from '../../shared/events';
import {
  EventEnvelope,
  EventNames,
  BetPlacedPayload,
  BetSettledPayload,
  MemberJoinedPayload,
} from '../../shared/events/types';
import { getDb } from '../../shared/db';
import * as walletService from './service';

/**
 * Build a human-readable description for a bet transaction.
 * e.g., "Arsenal vs Chelsea — match outcome" or "Who scores first? — event"
 */
async function getBetDescription(betId: string, marketType: string): Promise<string> {
  try {
    const db = getDb();
    const bet = await db('bets')
      .join('market_options', 'market_options.id', 'bets.market_option_id')
      .join('markets', 'markets.id', 'market_options.market_id')
      .leftJoin('matches', 'matches.id', 'markets.match_id')
      .where('bets.id', betId)
      .select(
        'matches.home_team',
        'matches.away_team',
        'markets.question',
        'markets.type as market_type',
        'market_options.label as option_label'
      )
      .first();

    if (!bet) return marketType;

    if (bet.home_team && bet.away_team) {
      const typeLabel = bet.market_type === 'in_match_event'
        ? (bet.question || 'event')
        : bet.market_type.replace(/_/g, ' ');
      return `${bet.home_team} vs ${bet.away_team} — ${typeLabel}`;
    }
    if (bet.question) return bet.question;
    return bet.option_label || marketType;
  } catch {
    return marketType;
  }
}

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
   * bet.placed — no wallet transactions at placement time.
   * For betting format: debit/credit happens at settlement.
   * For points format: no wallet transactions at all.
   */
  bus.subscribe(
    EventNames.BET_PLACED,
    async (_envelope: EventEnvelope) => {
      // No wallet transactions at bet placement.
      // Betting format: stake is debited at settlement (loss) or winnings credited (win).
      // Points format: no wallet transactions.
    }
  );

  /**
   * bet.settled — handle wallet transactions at settlement time.
   * Betting format: credit wins (stake × odds), debit losses (stake of 100).
   * Points format: no wallet transactions (points handled elsewhere).
   */
  bus.subscribe(
    EventNames.BET_SETTLED,
    async (envelope: EventEnvelope) => {
      const payload = envelope.payload as BetSettledPayload;

      // Look up the group's scoring_format
      const db = getDb();
      const group = await db('groups').where('id', payload.group_id).select('scoring_format').first();
      const scoringFormat = group?.scoring_format || 'betting';

      // Points format: no wallet transactions
      if (scoringFormat === 'points') {
        return;
      }

      // Betting format
      const description = await getBetDescription(payload.bet_id, payload.market_type);

      if (payload.outcome === 'won') {
        try {
          await walletService.creditWin(
            payload.user_id,
            payload.group_id,
            payload.bet_id,
            payload.payout,
            `Won: ${description}`
          );
        } catch (err) {
          console.error(
            `[Wallet] Failed to credit win for bet ${payload.bet_id}:`,
            err
          );
        }
      } else if (payload.outcome === 'lost') {
        try {
          await walletService.debitStake(
            payload.user_id,
            payload.group_id,
            payload.bet_id,
            100,
            `Lost: ${description}`
          );
        } catch (err) {
          console.error(
            `[Wallet] Failed to debit loss for bet ${payload.bet_id}:`,
            err
          );
        }
      }
    }
  );
}
