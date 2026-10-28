import type { AdminPlayersResponse, PlayerSummary } from '@piu-rivals/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { sql } from 'kysely';
import type { AppDeps } from '../app.ts';
import { requireAdmin } from '../auth.ts';
import { HttpError } from '../errors.ts';
import { playerName, playerSummary, playerSummaryColumns, toIso } from '../mappers.ts';
import { PlayerIdParams } from './params.ts';


export const adminPlayerRoutes: FastifyPluginAsyncTypebox<AppDeps> = async (app, { db })  => {
  app.addHook('preHandler', requireAdmin);


  app.get('/admin/players', async (): Promise<AdminPlayersResponse>  => {
    const counts = db.selectFrom('best_results')
      .select(['player_id', sql<number>`COUNT(*)`.as('charts'), sql<number>`SUM(tries)`.as('plays')])
      .groupBy('player_id')
      .as('counts');

    const rows = await db.selectFrom('players')
      .leftJoin(counts, 'counts.player_id', 'players.id')
      .select([
        ...playerSummaryColumns, 'players.id as db_id', 'players.name as scraped_name', 'players.created_at', 'players.last_session_timestamp',
        'counts.charts', 'counts.plays',
      ])
      .orderBy(playerName())
      .execute();

    return {
      players: rows.map((row)  =>  ({
        ...playerSummary(row),
        dbId: row.db_id,
        scrapedName: row.scraped_name,
        createdAt: toIso(row.created_at),
        plays: Number(row.plays  ??  0),
        charts: Number(row.charts  ??  0),
        lastSessionTimestamp: row.last_session_timestamp,
      })),
    };
  });


  // The name shown on the site. Empty, or the scraped name, shows the scraped name, following it if it changes.
  app.patch('/admin/players/:id', {
    schema: { params: PlayerIdParams, body: Type.Object({ displayName: Type.Union([Type.String({ maxLength: 100 }), Type.Null()]) }) },
  }, async (request): Promise<{ player: PlayerSummary }>  => {
    const guid = request.params.id.toLowerCase();
    const player = await db.selectFrom('players').select('name').where('piuscores_guid', '=', guid).executeTakeFirst();
    if (! player)
      throw new HttpError(404, 'Unknown player');

    const name = request.body.displayName?.trim()  ||  null;
    await db.updateTable('players')
      .set({ display_name: (name === player.name  ?  null  :  name) })
      .where('piuscores_guid', '=', guid)
      .execute();

    const row = await db.selectFrom('players').select(playerSummaryColumns).where('piuscores_guid', '=', guid).executeTakeFirstOrThrow();
    return { player: playerSummary(row) };
  });


  // Deletes the player with their plays and best results; users and rival lists lose them.
  app.delete('/admin/players/:id', { schema: { params: PlayerIdParams } }, async (request)  => {
    const { numDeletedRows } = await db.deleteFrom('players').where('piuscores_guid', '=', request.params.id.toLowerCase()).executeTakeFirst();
    if (! numDeletedRows)
      throw new HttpError(404, 'Unknown player');

    return { ok: true };
  });
};
