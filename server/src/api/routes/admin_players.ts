import type { AdminPlayersResponse, ImportPlayersResponse } from '@piu-rivals/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { sql } from 'kysely';
import { parsePlayerId } from '../../scraper/player_id.ts';
import type { AppDeps } from '../app.ts';
import { requireAdmin } from '../auth.ts';
import { HttpError } from '../errors.ts';
import { playerSummary, toIso } from '../mappers.ts';
import { PlayerIdParams } from './params.ts';

// The old extension's storage: { players: { "<GUID>": { name, pumbility, ... } } }, or just the inner object.
const OldPlayer = Type.Object({ name: Type.Optional(Type.String()), pumbility: Type.Optional(Type.Number()) });
const ImportBody = Type.Union([
  Type.Object({ players: Type.Record(Type.String(), OldPlayer) }),
  Type.Record(Type.String(), OldPlayer),
]);


export const adminPlayerRoutes: FastifyPluginAsyncTypebox<AppDeps> = async (app, { db }) => {
  app.addHook('preHandler', requireAdmin);


  app.get('/admin/players', async (): Promise<AdminPlayersResponse> => {
    const counts = db.selectFrom('best_results')
      .select(['player_id', sql<number>`COUNT(*)`.as('charts'), sql<number>`SUM(tries)`.as('plays')])
      .groupBy('player_id')
      .as('counts');

    const rows = await db.selectFrom('players')
      .leftJoin(counts, 'counts.player_id', 'players.id')
      .select([
        'players.id', 'players.name', 'players.pumbility', 'players.last_scraped_at', 'players.created_at',
        'players.last_session_timestamp', 'counts.charts', 'counts.plays',
      ])
      .orderBy('players.name')
      .execute();

    return {
      players: rows.map((row) => ({
        ...playerSummary(row),
        createdAt: toIso(row.created_at),
        plays: Number(row.plays  ??  0),
        charts: Number(row.charts  ??  0),
        lastSessionTimestamp: row.last_session_timestamp,
      })),
    };
  });


  // Deletes the player with their plays and best results; users and rival lists lose them.
  app.delete('/admin/players/:id', { schema: { params: PlayerIdParams } }, async (request) => {
    const { numDeletedRows } = await db.deleteFrom('players').where('id', '=', request.params.id.toLowerCase()).executeTakeFirst();
    if (! numDeletedRows)
      throw new HttpError(404, 'Unknown player');

    return { ok: true };
  });


  // Adds players exported from the old extension. Stored players keep their name, and keep the
  // higher PUMBILITY. Imported players have no scores until they're scraped.
  app.post('/admin/players/import', { schema: { body: ImportBody } }, async (request): Promise<ImportPlayersResponse> => {
    const body = request.body;
    const entries = Object.entries('players' in body  &&  typeof body.players === 'object' ? body.players : body);
    const players = entries.map(([key, value]) => ({ id: parsePlayerId(key), ...(value as { name?: string; pumbility?: number }) }));
    const invalid = players.filter((player) => ! player.id).length;
    if (invalid)
      throw new HttpError(400, `${invalid} key(s) are not player GUIDs`);

    const ids = players.map((player) => player.id!);
    const stored = new Set(ids.length
      ? (await db.selectFrom('players').select('id').where('id', 'in', ids).execute()).map((row) => row.id)
      : []);

    for (const player of players) {
      const name = player.name?.trim().slice(0, 100)  ||  null;
      const pumbility = typeof player.pumbility === 'number' ? Math.round(player.pumbility) : null;
      await db.insertInto('players')
        .values({ id: player.id!, name, pumbility })
        .onDuplicateKeyUpdate({
          name: sql<string>`COALESCE(name, VALUES(name))`,
          pumbility: sql<number>`NULLIF(GREATEST(COALESCE(pumbility, 0), COALESCE(VALUES(pumbility), 0)), 0)`,
        })
        .execute();
    }

    return { added: ids.filter((id) => ! stored.has(id)).length, existing: stored.size };
  });
};
