import type { ChartPreference, PlayerSummary, Preferences, Rival, User } from '@piu-rivals/shared';
import { type Kysely, sql } from 'kysely';
import type { Database } from '../db/schema.ts';

// Converts database rows to API responses.

// DATETIME strings are UTC, "YYYY-MM-DD HH:MM:SS[.mmm]".
export const toIso = (value: string)  =>  new Date(`${value.replace(' ', 'T')}Z`).toISOString();

export const toIsoOrNull = (value: string | null)  =>  (value === null  ?  null  :  toIso(value));


// The API knows players by their piuscores GUID.
export function playerSummary(row: {
  piuscores_guid: string; name: string | null; pumbility: number | null; last_scraped_at: string | null;
}): PlayerSummary {
  return { id: row.piuscores_guid, name: row.name, pumbility: row.pumbility, lastScrapedAt: toIsoOrNull(row.last_scraped_at) };
}


// The name the site shows: the one an admin set, or else the scraped one.
export const playerName = (table: 'players' | 'p' = 'players')  =>
  sql<string | null>`COALESCE(${sql.ref(`${table}.display_name`)}, ${sql.ref(`${table}.name`)})`;


export const playerSummaryColumns = [
  'players.piuscores_guid', playerName().as('name'), 'players.pumbility', 'players.last_scraped_at',
] as const;


export async function loadUsers(db: Kysely<Database>, userIds?: number[]) {
  let query = db.selectFrom('users')
    .leftJoin('players', 'players.id', 'users.player_id')
    .select([
      'users.id as user_id', 'users.email', 'users.display_name', 'users.is_admin', 'users.created_at',
      'users.last_login_at', 'users.last_seen_at', ...playerSummaryColumns,
    ])
    .orderBy('users.email');

  if (userIds)
    query = query.where('users.id', 'in', (userIds.length  ?  userIds  :  [-1]));

  const rows = await query.execute();
  return rows.map((row)  =>  ({
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
      isAdmin: !! row.is_admin,
      player: (row.piuscores_guid  ?  playerSummary({ ...row, piuscores_guid: row.piuscores_guid })  :  null),
    } satisfies User,
    createdAt: toIso(row.created_at),
    lastLoginAt: toIsoOrNull(row.last_login_at),
    lastSeenAt: toIsoOrNull(row.last_seen_at),
  }));
}


export async function loadUser(db: Kysely<Database>, userId: number): Promise<User | null> {
  return (await loadUsers(db, [userId]))[0]?.user  ??  null;
}


export async function loadRivals(db: Kysely<Database>, userId: number): Promise<Rival[]> {
  const rows = await db.selectFrom('user_rivals')
    .innerJoin('players', 'players.id', 'user_rivals.player_id')
    .select([...playerSummaryColumns, 'user_rivals.hidden'])
    .where('user_rivals.user_id', '=', userId)
    .orderBy(playerName())
    .execute();

  return rows.map((row)  =>  ({ ...playerSummary(row), hidden: !! row.hidden }));
}


export async function loadPreferences(db: Kysely<Database>, userId: number): Promise<Preferences> {
  const row = await db.selectFrom('user_preferences').select('data').where('user_id', '=', userId).executeTakeFirst();
  return row?.data  ??  {};
}


// The user's chart settings that are in force; expired snoozes are left out.
export async function loadChartPreferences(db: Kysely<Database>, userId: number): Promise<ChartPreference[]> {
  const rows = await db.selectFrom('user_chart_preferences')
    .select(['chart_id', 'snoozed_until'])
    .where('user_id', '=', userId)
    .where('snoozed_until', '>', sql<string>`CURRENT_TIMESTAMP`)
    .orderBy('chart_id')
    .execute();

  return rows.map((row)  =>  ({ chartId: row.chart_id, snoozedUntil: (row.snoozed_until === null  ?  null  :  toIso(row.snoozed_until)) }));
}
