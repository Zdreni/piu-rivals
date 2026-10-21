import type { Kysely } from 'kysely';
import type { Database } from './schema.ts';

// Players are stored under our own id; piuscores, and so the API, knows them by GUID.

type Db = Kysely<Database>;


// The ids of the players with these GUIDs; unknown GUIDs are left out.
export async function playerIdsByGuid(db: Db, guids: string[]): Promise<Map<string, number>> {
  if (! guids.length)
    return new Map();

  const rows = await db.selectFrom('players').select(['id', 'piuscores_guid']).where('piuscores_guid', 'in', guids).execute();
  return new Map(rows.map((row) => [row.piuscores_guid, row.id]));
}


// The GUIDs of the players with these ids; deleted players are left out.
export async function playerGuidsById(db: Db, ids: number[]): Promise<Map<number, string>> {
  if (! ids.length)
    return new Map();

  const rows = await db.selectFrom('players').select(['id', 'piuscores_guid']).where('id', 'in', ids).execute();
  return new Map(rows.map((row) => [row.id, row.piuscores_guid]));
}


// Creates the players that aren't stored yet, with only their GUID: the rest comes with their first
// scrape. Returns the players' ids, in the order of `guids`.
export async function ensurePlayers(db: Db, guids: string[], createdByUserId: number | null = null): Promise<number[]> {
  if (! guids.length)
    return [];

  await db.insertInto('players')
    .values(guids.map((guid) => ({ piuscores_guid: guid, created_by_user_id: createdByUserId })))
    .ignore()
    .execute();

  const ids = await playerIdsByGuid(db, guids);
  return guids.map((guid) => ids.get(guid)!);
}
