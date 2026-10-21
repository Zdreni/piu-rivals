import type { AdminPlayersResponse } from '@piu-rivals/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { sql } from 'kysely';
import type { AppDeps } from '../app.ts';
import { requireAdmin } from '../auth.ts';
import { HttpError } from '../errors.ts';
import { playerSummary, toIso } from '../mappers.ts';
import { PlayerIdParams } from './params.ts';


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
};
