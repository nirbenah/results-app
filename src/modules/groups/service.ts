import { getDb } from '../../shared/db';
import { publishEvent } from '../../shared/events/publish';
import {
  EventNames,
  StandingsUpdatedPayload,
  MemberJoinedPayload,
} from '../../shared/events/types';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
} from '../../shared/errors';
import * as queries from './queries';

// ─── My Groups ───

export async function listMyGroups(userId: string) {
  const groups = await queries.findGroupsByUserId(userId);
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    commissioner_id: g.commissioner_id,
    scoring_format: g.scoring_format,
    status: g.status,
    role: g.role,
    member_count: g.member_count,
  }));
}

// ─── Groups ───

export async function createGroup(
  userId: string,
  data: {
    name: string;
    scoring_format?: string;
    allowed_bet_types?: string[];
    competition_ids?: string[];
  },
  correlationId?: string
) {
  const trx = await getDb().transaction();
  try {
    const group = await queries.insertGroup(
      {
        name: data.name,
        commissioner_id: userId,
        scoring_format: data.scoring_format || 'betting',
        allowed_bet_types: data.allowed_bet_types || ['match_outcome'],
      },
      trx
    );

    // Commissioner is a member
    await queries.insertGroupMember(
      { group_id: group.id, user_id: userId, role: 'commissioner' },
      trx
    );

    // Create leaderboard entry for commissioner
    await queries.insertLeaderboardEntries(
      [{ group_id: group.id, user_id: userId }],
      trx
    );

    // Link competitions
    if (data.competition_ids && data.competition_ids.length > 0) {
      for (const compId of data.competition_ids) {
        await queries.insertGroupCompetition(
          { group_id: group.id, competition_id: compId },
          trx
        );
      }
    }

    await trx.commit();

    // Publish member.joined so wallet can give initial balance
    const memberPayload: MemberJoinedPayload = {
      group_id: group.id,
      user_id: userId,
      scoring_format: group.scoring_format,
    };
    await publishEvent(EventNames.MEMBER_JOINED, memberPayload, correlationId);

    return {
      id: group.id,
      name: group.name,
      commissioner_id: group.commissioner_id,
      scoring_format: group.scoring_format,
    };
  } catch (err) {
    await trx.rollback();
    throw err;
  }
}

export async function getGroup(groupId: string) {
  const group = await queries.findGroupById(groupId);
  if (!group) throw new NotFoundError('Group');

  const memberCount = await queries.countGroupMembers(groupId);
  const competitions = await queries.findGroupCompetitions(groupId);

  return {
    id: group.id,
    name: group.name,
    commissioner_id: group.commissioner_id,
    scoring_format: group.scoring_format,
    allowed_bet_types: group.allowed_bet_types,
    status: group.status,
    member_count: memberCount,
    competitions: competitions.map((c) => ({ id: c.id, name: c.name })),
  };
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

  // Create leaderboard entry
  await queries.insertLeaderboardEntries([
    { group_id: groupId, user_id: targetUserId },
  ]);

  // Publish member.joined so wallet can give initial balance
  const group = await queries.findGroupById(groupId);
  const payload: MemberJoinedPayload = {
    group_id: groupId,
    user_id: targetUserId,
    scoring_format: group?.scoring_format || 'betting',
  };
  await publishEvent(EventNames.MEMBER_JOINED, payload, correlationId);

  return { group_id: member.group_id, user_id: member.user_id, role: member.role };
}

export async function joinGroup(
  groupId: string,
  userId: string,
  correlationId?: string
) {
  const group = await queries.findGroupById(groupId);
  if (!group) throw new NotFoundError('Group');

  const existing = await queries.findGroupMember(groupId, userId);
  if (existing) {
    throw new ConflictError('ALREADY_MEMBER', 'You are already a member of this group');
  }

  const member = await queries.insertGroupMember({
    group_id: groupId,
    user_id: userId,
    role: 'member',
  });

  // Create leaderboard entry
  await queries.insertLeaderboardEntries([
    { group_id: groupId, user_id: userId },
  ]);

  // Publish member.joined so wallet can give initial balance
  const payload: MemberJoinedPayload = {
    group_id: groupId,
    user_id: userId,
    scoring_format: group.scoring_format,
  };
  await publishEvent(EventNames.MEMBER_JOINED, payload, correlationId);

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

// ─── Competitions ───

export async function addCompetition(
  groupId: string,
  requesterId: string,
  competitionId: string,
  correlationId?: string
) {
  await assertCommissioner(groupId, requesterId);

  const row = await queries.insertGroupCompetition({
    group_id: groupId,
    competition_id: competitionId,
  });

  const competitions = await queries.findGroupCompetitions(groupId);
  const added = competitions.find((c) => c.competition_id === competitionId);

  return {
    group_id: groupId,
    competition_id: competitionId,
    competition_name: added?.name ?? null,
  };
}

export async function removeCompetition(
  groupId: string,
  requesterId: string,
  competitionId: string,
  correlationId?: string
) {
  await assertCommissioner(groupId, requesterId);
  await queries.deleteGroupCompetition(groupId, competitionId);
}

// ─── Leaderboard ───

export async function getLeaderboard(groupId: string) {
  const group = await queries.findGroupById(groupId);
  if (!group) throw new NotFoundError('Group');

  const entries = await queries.getLeaderboard(groupId);

  // Fetch wallet balance for each entry (for betting format display)
  const db = getDb();
  const enriched = [];
  for (const e of entries) {
    let balance = 0;
    if (group.scoring_format === 'betting') {
      const result = await db('wallet_transactions')
        .where({ user_id: e.user_id, group_id: groupId })
        .select(
          db.raw(`
            COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END), 0)
            AS balance
          `)
        )
        .first();
      balance = Number(result?.balance ?? 0);
    }

    enriched.push({
      rank: e.rank,
      user: {
        id: e.user_id,
        username: e.username,
        avatar_url: e.avatar_url,
      },
      total_bets: e.total_bets,
      wins: e.wins,
      losses: e.losses,
      points: e.points,
      balance,
      win_rate: Number(e.win_rate),
      current_streak: e.current_streak,
      best_streak: e.best_streak,
    });
  }

  return {
    group_id: groupId,
    scoring_format: group.scoring_format,
    entries: enriched,
  };
}

// ─── Leaderboard update (called by subscribers) ───

export async function handleBetPlaced(
  groupId: string,
  userId: string,
  correlationId?: string
): Promise<void> {
  await queries.incrementTotalBets(groupId, userId);
  const group = await queries.findGroupById(groupId);
  await queries.reRankLeaderboard(groupId, group?.scoring_format);
}

export async function handleBetSettled(
  groupId: string,
  userId: string,
  won: boolean,
  payout: number,
  correlationId?: string
): Promise<void> {
  const trx = await getDb().transaction();
  try {
    // Capture old ranks before update
    const oldEntries = await queries.getLeaderboardEntriesForRankChanges(groupId, trx);
    const oldRankMap = new Map(
      oldEntries.map((e) => [e.user_id, e.rank ?? 0])
    );

    // Apply settlement
    await queries.applyBetSettlement(groupId, userId, won, trx);

    // Fetch group for scoring format
    const group = await trx('groups').where('id', groupId).first();
    const scoringFormat = group?.scoring_format || 'betting';

    // For points-format groups, add points from the payout field
    if (scoringFormat === 'points' && payout > 0) {
      await queries.addPoints(groupId, userId, payout, trx);
    }

    // Re-rank
    await queries.reRankLeaderboard(groupId, scoringFormat as 'points' | 'betting', trx);

    await trx.commit();

    // Compute rank changes and publish standings update
    const newEntries = await queries.getLeaderboardWithUsernames(groupId);

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
      balance: 0, // TODO: fetch from wallet when needed
    }));

    const payload: StandingsUpdatedPayload = {
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
