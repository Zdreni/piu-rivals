import type { BestsResponse, Chart, PlayersResponse } from '@piu-rivals/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { sql } from 'kysely';
import type { AppDeps } from '../app.ts';
import { requireUser } from '../auth.ts';
import { HttpError } from '../errors.ts';
import { playerSummary, playerSummaryColumns, toIso } from '../mappers.ts';
import { GUID } from './params.ts';

const MAX_BEST_PLAYERS = 100;
const GUID_RE = new RegExp(GUID.pattern!);


// ISO time → DATETIME(3) string in UTC, as stored.
function sinceValue(since: string): string {
  const time = new Date(since);
  if (Number.isNaN(time.getTime()))
    throw new HttpError(400, 'since must be an ISO time');

  return time.toISOString().slice(0, 23).replace('T', ' ');
}


export const dataRoutes: FastifyPluginAsyncTypebox<AppDeps> = async (app, { db }) => {
  app.addHook('preHandler', requireUser);


  app.get('/players', async (): Promise<PlayersResponse> => {
    const counts = db.selectFrom('best_results')
      .select(['player_id', sql<number>`COUNT(*)`.as('charts'), sql<number>`SUM(tries)`.as('plays')])
      .groupBy('player_id')
      .as('counts');

    const rows = await db.selectFrom('players')
      .leftJoin(counts, 'counts.player_id', 'players.id')
      .select([...playerSummaryColumns, 'counts.charts', 'counts.plays'])
      .orderBy('players.name')
      .execute();

    return {
      players: rows.map((row) => ({ ...playerSummary(row), plays: Number(row.plays  ??  0), charts: Number(row.charts  ??  0) })),
    };
  });


  // Best results of the given players. With `since` (a serverTime from an earlier response), only
  // rows changed at or after it; a row may then come again, which is harmless to merge. Deleted rows
  // (a rescan, a deleted player) never come as changes; `counts` lets the site notice them.
  app.get('/bests', {
    schema: { querystring: Type.Object({ players: Type.String({ minLength: 1 }), since: Type.Optional(Type.String()) }) },
  }, async (request): Promise<BestsResponse> => {
    const playerIds = [...new Set(request.query.players.split(',').map((id) => id.trim().toLowerCase()))];
    if (playerIds.length > MAX_BEST_PLAYERS  ||  ! playerIds.every((id) => GUID_RE.test(id)))
      throw new HttpError(400, `players must be up to ${MAX_BEST_PLAYERS} comma-separated player GUIDs`);

    const since = request.query.since ? sinceValue(request.query.since) : null;
    // Read before the query, so a change written meanwhile is picked up next time.
    const { rows: [now] } = await sql<{ now: string }>`SELECT CURRENT_TIMESTAMP(3) AS now`.execute(db);

    let query = db.selectFrom('best_results as b')
      .innerJoin('plays as p', 'p.id', 'b.play_id')
      .innerJoin('charts as c', 'c.id', 'b.chart_id')
      .select([
        'b.player_id', 'b.chart_id', 'b.score', 'b.passed', 'b.best_played_on', 'b.last_played_on', 'b.tries',
        'b.updated_at', 'p.grade', 'p.plate', 'p.perfect', 'p.great', 'p.good', 'p.bad', 'p.miss', 'p.max_combo',
        'c.song_key', 'c.song_title', 'c.chart_type', 'c.level',
      ])
      .where('b.player_id', 'in', playerIds);

    if (since)
      query = query.where('b.updated_at', '>=', since);

    const rows = await query.execute();
    const countRows = await db.selectFrom('best_results')
      .select(['player_id', (eb) => eb.fn.countAll<number>().as('count')])
      .where('player_id', 'in', playerIds)
      .groupBy('player_id')
      .execute();

    const counts = Object.fromEntries(playerIds.map((playerId) => [playerId, 0]));
    for (const row of countRows)
      counts[row.player_id] = Number(row.count);

    const charts = new Map<number, Chart>();
    for (const row of rows) {
      charts.set(row.chart_id, {
        id: row.chart_id, songKey: row.song_key, songTitle: row.song_title, chartType: row.chart_type, level: row.level,
      });
    }

    return {
      serverTime: toIso(now!.now),
      charts: [...charts.values()],
      bests: rows.map((row) => ({
        playerId: row.player_id,
        chartId: row.chart_id,
        score: row.score,
        passed: !! row.passed,
        grade: row.grade,
        plate: row.plate,
        perfect: row.perfect,
        great: row.great,
        good: row.good,
        bad: row.bad,
        miss: row.miss,
        maxCombo: row.max_combo,
        bestPlayedOn: row.best_played_on,
        lastPlayedOn: row.last_played_on,
        tries: row.tries,
        updatedAt: toIso(row.updated_at),
      })),
      counts,
    };
  });
};
