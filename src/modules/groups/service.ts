import { getDb } from '../../shared/db';
import { publishEvent } from '../../shared/events/publish';
import {
  EventNames,
  StandingsUpdatedPayload,
  SeasonFinishedPayload,
} from '../../shared/events/types';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
} from '../../shared/errors';
import * as queries from './queries';

// ─── Groups ───

export async function createGroup(
  userId: string,
  name: string,
  correlationId?: string
) {
  const trx = await getDb().transaction();
  try {
    const group = await queries.insertGroup(
      { name, commissioner_id: userId },
      trx
    );
    await queries.insertGroupMember(
      { group_id: group.id, user_id: userId, role: 'commissioner' },
      trx
    );
    await trx.commit();
    return { id: group.id, name: group.name, commissioner_id: group.commissioner_id };
  } catch (err) {
    await trx.rollback();
    throw err;
  }
}

export async function getGroup(groupId: string) {
  const group = await queries.findGroupById(groupId);
  if (!group) throw new NotFoundError('Group');

  const memberCount = await queries.countGroupMembers(groupId);
  const season = await queries.findSeasonByGroupId(groupId);

  const result: Record<string, unknown> = {
    id: group.id,
    name: group.name,
    commissioner_id: group.commissioner_id,
    member_count: memberCount,
  };

  if (season) {
    // Fetch competition name
    const competition = await getDb()('competitions')
      .where('id', season.competition_id)
      .select('name')
      .first();

    result.season = {
      id: season.id,
      status: season.status,
      competition: { name: competition?.name ?? null },
    };
  } else {
    result.season = null;
  }

  return result;
}

// ─── Members ───

async function assertCommissioner(groupId: string, userId: string): Promise<void> {
  const group = await queries.findGroupById(groupId);
  if (!group) throw new NotFoundError('Group');
  if (group.commissioner_id !== userId) {
    throw new ForbiddenError('Only the commissioner can perform this action');
  }
}

export async function addMember(
  groupId: string,
  requesterId: string,
  targetUserId: string,
  correlationId?: string
) {
  await assertCommissioner(groupId, requesterId);

  const existing = await queries.findGroupMember(groupId, targetUserId);
  if (existing) {
    throw new ConflictError('ALREADY_MEMBER', 'User is already a member of this group');
  }

  const member = await queries.insertGroupMember({
    group_id: groupId,
    user_id: targetUserId,
    role: 'member',
  });

  // If there's an active or upcoming season, create a leaderboard entry
  const season = await queries.findSeasonByGroupId(groupId);
  if (season && season.status !== 'finished') {
    await queries.insertLeaderboardEntries([
      { season_id: season.id, user_id: targetUserId },
    ]);
  }

  return { group_id: member.group_id, user_id: member.user_id, role: member.role };
}

export async function removeMember(
  groupId: string,
  requesterId: string,
  targetUserId: string,
  correlationId?: string
) {
  await assertCommissioner(groupId, requesterId);

  const member = await queries.findGroupMember(groupId, targetUserId);
  if (!member) throw new NotFoundError('Member');

  if (member.role === 'commissioner') {
    throw new BadRequestError(
      'CANNOT_REMOVE_COMMISSIONER',
      'Cannot remove the commissioner from the group'
    );
  }

  await queries.deleteGroupMember(groupId, targetUserId);
}

// ─── Seasons ───

export async function startSeason(
  groupId: string,
  requesterId: string,
  data: { competition_id: string; starts_at: string; ends_at: string },
  correlationId?: string
) {
  await assertCommissioner(groupId, requesterId);

  const existingSeason = await queries.findSeasonByGroupId(groupId);
  if (existingSeason) {
    throw new ConflictError('SEASON_EXISTS', 'Group already has a season');
  }

  const trx = await getDb().transaction();
  try {
    const season = await queries.insertSeason(
      {
        group_id: groupId,
        competition_id: data.competition_id,
        status: 'upcoming',
        starts_at: data.starts_at,
        ends_at: data.ends_at,
      },
      trx
    );

    const memberIds = await queries.listGroupMemberUserIds(groupId);
    const entries = memberIds.map((user_id) => ({
      season_id: season.id,
      user_id,
    }));

    if (entries.length > 0) {
      await queries.insertLeaderboardEntries(entries, trx);
    }

    await trx.commit();

    return {
      id: season.id,
      group_id: season.group_id,
      competition_id: season.competition_id,
      status: season.status,
    };
  } catch (err) {
    await trx.rollback();
    throw err;
  }
}

export async function updateSeasonStatus(
  groupId: string,
  requesterId: string,
  newStatus: 'active' | 'finished',
  correlationId?: string
) {
  await assertCommissioner(groupId, requesterId);

  const season = await queries.findSeasonByGroupId(groupId);
  if (!season) throw new NotFoundError('Season');

  // Validate status transitions
  if (newStatus === 'active' && season.status !== 'upcoming') {
    throw new BadRequestError(
      'INVALID_TRANSITION',
      'Can only activate an upcoming season'
    );
  }
  if (newStatus === 'finished' && season.status !== 'active') {
    throw new BadRequestError(
      'INVALID_TRANSITION',
      'Can only finish an active season'
    );
  }

  const updated = await queries.updateSeasonStatus(season.id, newStatus);

  if (newStatus === 'finished') {
    const standings = await queries.getLeaderboardWithUsernames(season.id);

    const payload: SeasonFinishedPayload = {
      season_id: season.id,
      group_id: groupId,
      final_standings: standings.map((s) => ({
        rank: s.rank,
        user_id: s.user_id,
        username: s.username,
        win_rate: Number(s.win_rate),
        best_streak: s.best_streak,
      })),
    };

    await publishEvent(EventNames.SEASON_FINISHED, payload, correlationId);
  }

  return { id: updated.id, status: updated.status };
}

// ─── Leaderboard ───

export async function getLeaderboard(groupId: string) {
  const season = await queries.findSeasonByGroupId(groupId);
  if (!season) throw new NotFoundError('Season');

  const entries = await queries.getLeaderboard(season.id);

  return {
    season_id: season.id,
    updated_at: entries.length > 0 ? entries[0].updated_at : null,
    entries: entries.map((e) => ({
      rank: e.rank,
      user: {
        id: e.user_id,
        username: e.username,
        avatar_url: e.avatar_url,
      },
      total_bets: e.total_bets,
      wins: e.wins,
      losses: e.losses,
      win_rate: Number(e.win_rate),
      current_streak: e.current_streak,
      best_streak: e.best_streak,
    })),
  };
}

// ─── Leaderboard update (called by subscribers) ───

export async function handleBetPlaced(
  seasonId: string,
  userId: string,
  correlationId?: string
): Promise<void> {
  await queries.incrementTotalBets(seasonId, userId);
  await queries.reRankLeaderboard(seasonId);
}

export async function handleBetSettled(
  seasonId: string,
  userId: string,
  groupId: string,
  won: boolean,
  correlationId?: string
): Promise<void> {
  const trx = await getDb().transaction();
  try {
    // Capture old ranks before update
    const oldEntries = await queries.getLeaderboardEntriesForRankChanges(seasonId, trx);
    const oldRankMap = new Map(
      oldEntries.map((e) => [e.user_id, e.rank ?? 0])
    );

    // Apply settlement
    await queries.applyBetSettlement(seasonId, userId, won, trx);

    // Re-rank
    await queries.reRankLeaderboard(seasonId, trx);

    await trx.commit();

    // Compute rank changes and publish standings update
    const newEntries = await queries.getLeaderboardWithUsernames(seasonId);

    const rankChanges: Array<{ user_id: string; old_rank: number; new_rank: number }> = [];
    for (const entry of newEntries) {
      const oldRank = oldRankMap.get(entry.user_id) ?? 0;
      if (oldRank !== entry.rank) {
        rankChanges.push({
          user_id: entry.user_id,
          old_rank: oldRank,
          new_rank: entry.rank,
        });
      }
    }

    const topEntries = newEntries.slice(0, 10).map((e) => ({
      rank: e.rank,
      user_id: e.user_id,
      username: e.username,
      win_rate: Number(e.win_rate),
    }));

    const payload: StandingsUpdatedPayload = {
      season_id: seasonId,
      group_id: groupId,
      top_entries: topEntries,
      rank_changes: rankChanges,
    };

    await publishEvent(EventNames.GROUP_STANDINGS_UPDATED, payload, correlationId);
  } catch (err) {
    await trx.rollback();
    throw err;
  }
}
