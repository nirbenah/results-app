import { Knex } from 'knex';
import { getDb } from '../../shared/db';

// ─── Row types ───

export interface GroupRow {
  id: string;
  name: string;
  commissioner_id: string;
  scoring_format: 'points' | 'betting';
  allowed_bet_types: string[];
  status: 'active' | 'finished';
  created_at: string;
}

export interface GroupMemberRow {
  id: string;
  group_id: string;
  user_id: string;
  role: 'commissioner' | 'member';
  joined_at: string;
}

export interface GroupCompetitionRow {
  id: string;
  group_id: string;
  competition_id: string;
  added_at: string;
}

export interface LeaderboardEntryRow {
  id: string;
  group_id: string;
  user_id: string;
  total_bets: number;
  wins: number;
  losses: number;
  points: number;
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
  data: {
    name: string;
    commissioner_id: string;
    scoring_format: string;
    allowed_bet_types: string[];
  },
  trx?: Knex.Transaction
): Promise<GroupRow> {
  const conn = trx || getDb();
  const [row] = await conn('groups')
    .insert({
      name: data.name,
      commissioner_id: data.commissioner_id,
      scoring_format: data.scoring_format,
      allowed_bet_types: data.allowed_bet_types,
    })
    .returning('*');
  return row;
}

export async function findGroupById(groupId: string): Promise<GroupRow | undefined> {
  return getDb()('groups').where('id', groupId).first();
}

export async function updateGroupStatus(groupId: string, status: string): Promise<GroupRow> {
  const [row] = await getDb()('groups')
    .where('id', groupId)
    .update({ status })
    .returning('*');
  return row;
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

// ─── Group Competitions ───

export async function insertGroupCompetition(
  data: { group_id: string; competition_id: string },
  trx?: Knex.Transaction
): Promise<GroupCompetitionRow> {
  const conn = trx || getDb();
  const [row] = await conn('group_competitions').insert(data).returning('*');
  return row;
}

export async function deleteGroupCompetition(
  groupId: string,
  competitionId: string
): Promise<number> {
  return getDb()('group_competitions')
    .where({ group_id: groupId, competition_id: competitionId })
    .del();
}

export async function findGroupCompetitions(
  groupId: string
): Promise<Array<{ id: string; name: string; competition_id: string }>> {
  return getDb()('group_competitions')
    .join('competitions', 'group_competitions.competition_id', 'competitions.id')
    .where('group_competitions.group_id', groupId)
    .select(
      'competitions.id',
      'competitions.name',
      'group_competitions.competition_id'
    );
}

export async function findGroupCompetitionIds(groupId: string): Promise<string[]> {
  const rows = await getDb()('group_competitions')
    .where('group_id', groupId)
    .select('competition_id');
  return rows.map((r: { competition_id: string }) => r.competition_id);
}

// ─── Leaderboard Entries ───

export async function insertLeaderboardEntries(
  entries: Array<{ group_id: string; user_id: string }>,
  trx?: Knex.Transaction
): Promise<void> {
  const conn = trx || getDb();
  await conn('leaderboard_entries').insert(entries);
}

export async function findLeaderboardEntry(
  groupId: string,
  userId: string
): Promise<LeaderboardEntryRow | undefined> {
  return getDb()('leaderboard_entries')
    .where({ group_id: groupId, user_id: userId })
    .first();
}

export async function incrementTotalBets(
  groupId: string,
  userId: string
): Promise<void> {
  await getDb()('leaderboard_entries')
    .where({ group_id: groupId, user_id: userId })
    .increment('total_bets', 1)
    .update({ updated_at: getDb().fn.now() });
}

export async function applyBetSettlement(
  groupId: string,
  userId: string,
  won: boolean,
  trx?: Knex.Transaction
): Promise<void> {
  const conn = trx || getDb();
  const entry = await conn('leaderboard_entries')
    .where({ group_id: groupId, user_id: userId })
    .first();

  if (!entry) return;

  const wins = won ? entry.wins + 1 : entry.wins;
  const losses = won ? entry.losses : entry.losses + 1;
  const totalBets = wins + losses;
  const winRate = totalBets > 0 ? wins / totalBets : 0;
  const currentStreak = won ? entry.current_streak + 1 : 0;
  const bestStreak = Math.max(entry.best_streak, currentStreak);

  await conn('leaderboard_entries')
    .where({ group_id: groupId, user_id: userId })
    .update({
      wins,
      losses,
      win_rate: winRate,
      current_streak: currentStreak,
      best_streak: bestStreak,
      updated_at: conn.fn.now(),
    });
}

export async function addPoints(
  groupId: string,
  userId: string,
  pointsToAdd: number,
  trx?: Knex.Transaction
): Promise<void> {
  const conn = trx || getDb();
  await conn('leaderboard_entries')
    .where({ group_id: groupId, user_id: userId })
    .increment('points', pointsToAdd)
    .update({ updated_at: conn.fn.now() });
}

export async function reRankLeaderboard(
  groupId: string,
  scoringFormat: 'points' | 'betting' = 'betting',
  trx?: Knex.Transaction
): Promise<void> {
  const conn = trx || getDb();
  const orderBy = scoringFormat === 'points'
    ? 'ORDER BY points DESC, best_streak DESC'
    : 'ORDER BY win_rate DESC, best_streak DESC';

  await conn.raw(
    `UPDATE leaderboard_entries AS le
     SET rank = sub.new_rank
     FROM (
       SELECT id,
              ROW_NUMBER() OVER (${orderBy}) AS new_rank
       FROM leaderboard_entries
       WHERE group_id = ?
     ) AS sub
     WHERE le.id = sub.id`,
    [groupId]
  );
}

export async function getLeaderboard(
  groupId: string
): Promise<LeaderboardEntryWithUser[]> {
  return getDb()('leaderboard_entries')
    .join('users', 'leaderboard_entries.user_id', 'users.id')
    .where('leaderboard_entries.group_id', groupId)
    .orderBy('leaderboard_entries.rank', 'asc')
    .select(
      'leaderboard_entries.*',
      'users.username',
      'users.avatar_url'
    );
}

export async function getLeaderboardEntriesForRankChanges(
  groupId: string,
  trx?: Knex.Transaction
): Promise<Array<{ user_id: string; rank: number | null }>> {
  const conn = trx || getDb();
  return conn('leaderboard_entries')
    .where('group_id', groupId)
    .select('user_id', 'rank');
}

export async function getLeaderboardWithUsernames(
  groupId: string
): Promise<Array<{ rank: number; user_id: string; username: string; win_rate: number; best_streak: number; points: number }>> {
  return getDb()('leaderboard_entries')
    .join('users', 'leaderboard_entries.user_id', 'users.id')
    .where('leaderboard_entries.group_id', groupId)
    .orderBy('leaderboard_entries.rank', 'asc')
    .select(
      'leaderboard_entries.rank',
      'leaderboard_entries.user_id',
      'users.username',
      'leaderboard_entries.win_rate',
      'leaderboard_entries.best_streak',
      'leaderboard_entries.points'
    );
}

export async function isGroupMember(
  userId: string,
  groupId: string
): Promise<boolean> {
  const row = await getDb()('group_members')
    .where({ group_id: groupId, user_id: userId })
    .first();
  return !!row;
}
