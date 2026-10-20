import type { PlayerSummary, User } from '@piurivals/shared';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.ts';

// Converts database rows to API responses.

// DATETIME strings are UTC, "YYYY-MM-DD HH:MM:SS[.mmm]".
export const toIso = (value: string) => new Date(`${value.replace(' ', 'T')}Z`).toISOString();

export const toIsoOrNull = (value: string | null) => (value === null ? null : toIso(value));


export function playerSummary(row: { id: string; name: string | null; pumbility: number | null; last_scraped_at: string | null }):
  PlayerSummary {
  return { id: row.id, name: row.name, pumbility: row.pumbility, lastScrapedAt: toIsoOrNull(row.last_scraped_at) };
}


export const playerSummaryColumns = ['players.id', 'players.name', 'players.pumbility', 'players.last_scraped_at'] as const;


export async function loadUsers(db: Kysely<Database>, userIds?: number[]) {
  let query = db.selectFrom('users')
    .leftJoin('players', 'players.id', 'users.player_id')
    .select([
      'users.id as user_id', 'users.email', 'users.display_name', 'users.is_admin', 'users.created_at',
      'users.last_login_at', 'players.id', 'players.name', 'players.pumbility', 'players.last_scraped_at',
    ])
    .orderBy('users.email');

  if (userIds)
    query = query.where('users.id', 'in', userIds.length ? userIds : [-1]);

  const rows = await query.execute();
  return rows.map((row) => ({
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
      isAdmin: !! row.is_admin,
      player: row.id ? playerSummary({ ...row, id: row.id }) : null,
    } satisfies User,
    createdAt: toIso(row.created_at),
    lastLoginAt: toIsoOrNull(row.last_login_at),
  }));
}


export async function loadUser(db: Kysely<Database>, userId: number): Promise<User | null> {
  return (await loadUsers(db, [userId]))[0]?.user  ??  null;
}
