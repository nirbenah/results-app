import { Knex } from 'knex';
import { getDb } from '../../shared/db';

// ─── Row types ───

export interface GroupRow {
  id: string;
  name: string;
  commissioner_id: string;
  created_at: string;
}

export interface GroupMemberRow {
  id: string;
  group_id: string;
  user_id: string;
  role: 'commissioner' | 'member';
  joined_at: string;
}

export interface SeasonRow {
  id: string;
  group_id: string;
  competition_id: string;
  status: 'upcoming' | 'active' | 'finished';
  starts_at: string;
  ends_at: string;
  created_at: string;
}

export interface LeaderboardEntryRow {
  id: string;
  season_id: string;
  user_id: string;
  total_bets: number;
  wins: number;
  losses: number;
  current_streak: number;
  best_streak: number;
  win_rate: number;
  rank: number | null;
  updated_at: string | null;
}

export interface LeaderboardEntryWithUser extends LeaderboardEntryRow {
  username: string;
  avatar_url: string | null;
}

// ─── Groups ───

export async function insertGroup(
  data: { name: string; commissioner_id: string },
  trx?: Knex.Transaction
): Promise<GroupRow> {
  const conn = trx || getDb();
  const [row] = await conn('groups').insert(data).returning('*');
  return row;
}

export async function findGroupById(groupId: string): Promise<GroupRow | undefined> {
  return getDb()('groups').where('id', groupId).first();
}

export async function countGroupMembers(groupId: string): Promise<number> {
  const result = await getDb()('group_members')
    .where('group_id', groupId)
    .count('id as count')
    .first();
  return Number(result?.count ?? 0);
}

// ─── Group Members ───

export async function insertGroupMember(
  data: { group_id: string; user_id: string; role: 'commissioner' | 'member' },
  trx?: Knex.Transaction
): Promise<GroupMemberRow> {
  const conn = trx || getDb();
  const [row] = await conn('group_members').insert(data).returning('*');
  return row;
}

export async function findGroupMember(
  groupId: string,
  userId: string
): Promise<GroupMemberRow | undefined> {
  return getDb()('group_members')
    .where({ group_id: groupId, user_id: userId })
    .first();
}

export async function deleteGroupMember(
  groupId: string,
  userId: string
): Promise<number> {
  return getDb()('group_members')
    .where({ group_id: groupId, user_id: userId })
    .del();
}

export async function listGroupMemberUserIds(groupId: string): Promise<string[]> {
  const rows = await getDb()('group_members')
    .where('group_id', groupId)
    .select('user_id');
  return rows.map((r: { user_id: string }) => r.user_id);
}

// ─── Seasons ───

export async function insertSeason(
  data: {
    group_id: string;
    competition_id: string;
    status: string;
    starts_at: string;
    ends_at: string;
  },
  trx?: Knex.Transaction
): Promise<SeasonRow> {
  const conn = trx || getDb();
  const [row] = await conn('seasons').insert(data).returning('*');
  return row;
}

export async function findSeasonByGroupId(groupId: string): Promise<SeasonRow | undefined> {
  return getDb()('seasons').where('group_id', groupId).first();
}

export async function updateSeasonStatus(
  seasonId: string,
  status: string
): Promise<SeasonRow> {
  const [row] = await getDb()('seasons')
    .where('id', seasonId)
    .update({ status })
    .returning('*');
  return row;
}

// ─── Leaderboard Entries ───

export async function insertLeaderboardEntries(
  entries: Array<{ season_id: string; user_id: string }>,
  trx?: Knex.Transaction
): Promise<void> {
  const conn = trx || getDb();
  await conn('leaderboard_entries').insert(entries);
}

export async function findLeaderboardEntry(
  seasonId: string,
  userId: string
): Promise<LeaderboardEntryRow | undefined> {
  return getDb()('leaderboard_entries')
    .where({ season_id: seasonId, user_id: userId })
    .first();
}

export async function incrementTotalBets(
  seasonId: string,
  userId: string
): Promise<void> {
  await getDb()('leaderboard_entries')
    .where({ season_id: seasonId, user_id: userId })
    .increment('total_bets', 1)
    .update({ updated_at: getDb().fn.now() });
}

export async function applyBetSettlement(
  seasonId: string,
  userId: string,
  won: boolean,
  trx?: Knex.Transaction
): Promise<void> {
  const conn = trx || getDb();
  const entry = await conn('leaderboard_entries')
    .where({ season_id: seasonId, user_id: userId })
    .first();

  if (!entry) return;

  const wins = won ? entry.wins + 1 : entry.wins;
  const losses = won ? entry.losses : entry.losses + 1;
  const totalBets = wins + losses;
  const winRate = totalBets > 0 ? wins / totalBets : 0;
  const currentStreak = won ? entry.current_streak + 1 : 0;
  const bestStreak = Math.max(entry.best_streak, currentStreak);

  await conn('leaderboard_entries')
    .where({ season_id: seasonId, user_id: userId })
    .update({
      wins,
      losses,
      win_rate: winRate,
      current_streak: currentStreak,
      best_streak: bestStreak,
      updated_at: conn.fn.now(),
    });
}

export async function reRankLeaderboard(
  seasonId: string,
  trx?: Knex.Transaction
): Promise<void> {
  const conn = trx || getDb();
  await conn.raw(
    `UPDATE leaderboard_entries AS le
     SET rank = sub.new_rank
     FROM (
       SELECT id,
              ROW_NUMBER() OVER (ORDER BY win_rate DESC, best_streak DESC) AS new_rank
       FROM leaderboard_entries
       WHERE season_id = ?
     ) AS sub
     WHERE le.id = sub.id`,
    [seasonId]
  );
}

export async function getLeaderboard(
  seasonId: string
): Promise<LeaderboardEntryWithUser[]> {
  return getDb()('leaderboard_entries')
    .join('users', 'leaderboard_entries.user_id', 'users.id')
    .where('leaderboard_entries.season_id', seasonId)
    .orderBy('leaderboard_entries.rank', 'asc')
    .select(
      'leaderboard_entries.*',
      'users.username',
      'users.avatar_url'
    );
}

export async function getLeaderboardEntriesForRankChanges(
  seasonId: string,
  trx?: Knex.Transaction
): Promise<Array<{ user_id: string; rank: number | null }>> {
  const conn = trx || getDb();
  return conn('leaderboard_entries')
    .where('season_id', seasonId)
    .select('user_id', 'rank');
}

export async function getLeaderboardWithUsernames(
  seasonId: string
): Promise<Array<{ rank: number; user_id: string; username: string; win_rate: number; best_streak: number }>> {
  return getDb()('leaderboard_entries')
    .join('users', 'leaderboard_entries.user_id', 'users.id')
    .where('leaderboard_entries.season_id', seasonId)
    .orderBy('leaderboard_entries.rank', 'asc')
    .select(
      'leaderboard_entries.rank',
      'leaderboard_entries.user_id',
      'users.username',
      'leaderboard_entries.win_rate',
      'leaderboard_entries.best_streak'
    );
}
