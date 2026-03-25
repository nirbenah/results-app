/**
 * Notify event subscribers.
 *
 * This module is purely reactive — it never initiates notifications
 * on its own. It listens for domain events and fans out through
 * the ChannelManager.
 */

import { getEventBus } from '../../shared/events';
import { getDb } from '../../shared/db';
import {
  EventEnvelope,
  EventNames,
  MatchStartedPayload,
  BetSettledPayload,
  StandingsUpdatedPayload,
} from '../../shared/events/types';
import { ChannelManager } from './channels';

export function registerSubscribers(channelManager: ChannelManager): void {
  const bus = getEventBus();

  /**
   * match.started — notify all members of groups that have this match's
   * competition linked via group_competitions.
   */
  bus.subscribe(
    EventNames.MATCH_STARTED,
    async (envelope: EventEnvelope) => {
      const payload = envelope.payload as MatchStartedPayload;
      const db = getDb();

      // Find the match to get competition_id
      const match = await db('matches').where({ id: payload.match_id }).first();
      if (!match) return;

      // Find all members of active groups linked to this competition
      const members = await db('group_competitions')
        .join('groups', 'groups.id', 'group_competitions.group_id')
        .join('group_members', 'group_members.group_id', 'groups.id')
        .where('group_competitions.competition_id', match.competition_id)
        .where('groups.status', 'active')
        .select('group_members.user_id')
        .distinct();

      const userIds = members.map((m: { user_id: string }) => m.user_id);

      await channelManager.sendToMany(
        userIds,
        'Match started',
        `${match.home_team} vs ${match.away_team} is now live!`
      );
    }
  );

  /**
   * bet.settled — notify the bet owner of the result.
   */
  bus.subscribe(
    EventNames.BET_SETTLED,
    async (envelope: EventEnvelope) => {
      const payload = envelope.payload as BetSettledPayload;

      const outcomeText =
        payload.outcome === 'won'
          ? `Your bet won! Payout: ${payload.payout} credits.`
          : payload.outcome === 'lost'
            ? 'Your bet lost.'
            : 'Your bet was voided.';

      await channelManager.sendAll(
        payload.user_id,
        'Bet settled',
        outcomeText
      );
    }
  );

  /**
   * group.standings_updated — notify users whose rank changed.
   */
  bus.subscribe(
    EventNames.GROUP_STANDINGS_UPDATED,
    async (envelope: EventEnvelope) => {
      const payload = envelope.payload as StandingsUpdatedPayload;

      for (const change of payload.rank_changes) {
        const direction = change.new_rank < change.old_rank ? 'up' : 'down';
        const arrow = direction === 'up' ? 'up' : 'down';

        await channelManager.sendAll(
          change.user_id,
          'Rank updated',
          `You moved ${arrow} from #${change.old_rank} to #${change.new_rank}`
        );
      }
    }
  );
}
