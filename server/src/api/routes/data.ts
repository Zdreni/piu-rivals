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


  // Only players with scraped results, and a name or PUMBILITY, are listed.
  app.get('/players', async (): Promise<PlayersResponse> => {
    const counts = db.selectFrom('best_results')
      .select(['player_id', sql<number>`COUNT(*)`.as('charts'), sql<number>`SUM(tries)`.as('plays')])
      .groupBy('player_id')
      .as('counts');

    const rows = await db.selectFrom('players')
      .innerJoin(counts, 'counts.player_id', 'players.id')
      .select([...playerSummaryColumns, 'counts.charts', 'counts.plays'])
      .where((eb) => eb.or([eb('players.name', 'is not', null), eb('players.pumbility', 'is not', null)]))
      .orderBy('players.name')
      .execute();

    return {
      players: rows.map((row) => ({ ...playerSummary(row), plays: Number(row.plays), charts: Number(row.charts) })),
    };
  });


  // Best results of the given players. With `since` (a serverTime from an earlier response), only
  // rows changed at or after it; a row may then come again, which is harmless to merge. Deleted rows
  // (a rescan, a deleted player) never come as changes; `counts` lets the site notice them.
  app.get('/bests', {
    schema: { querystring: Type.Object({ players: Type.String({ minLength: 1 }), since: Type.Optional(Type.String()) }) },
  }, async (request): Promise<BestsResponse> => {
    const guids = [...new Set(request.query.players.split(',').map((id) => id.trim().toLowerCase()))];
    if (guids.length > MAX_BEST_PLAYERS  ||  ! guids.every((id) => GUID_RE.test(id)))
      throw new HttpError(400, `players must be up to ${MAX_BEST_PLAYERS} comma-separated player GUIDs`);

    const since = request.query.since ? sinceValue(request.query.since) : null;
    // Read before the query, so a change written meanwhile is picked up next time.
    const { rows: [now] } = await sql<{ now: string }>`SELECT CURRENT_TIMESTAMP(3) AS now`.execute(db);

    let query = db.selectFrom('best_results as b')
      .innerJoin('players as pl', 'pl.id', 'b.player_id')
      .innerJoin('plays as p', 'p.id', 'b.play_id')
      .innerJoin('charts as c', 'c.id', 'b.chart_id')
      .select([
        'pl.piuscores_guid', 'b.chart_id', 'b.last_played_on', 'b.tries', 'b.updated_at',
        'p.score', 'p.passed', 'p.played_on', 'p.grade', 'p.plate', 'p.perfect', 'p.great', 'p.good', 'p.bad', 'p.miss', 'p.max_combo',
        'c.song_key', 'c.song_title', 'c.chart_type', 'c.level',
      ])
      .where('pl.piuscores_guid', 'in', guids);

    if (since)
      query = query.where('b.updated_at', '>=', since);

    const rows = await query.execute();
    const countRows = await db.selectFrom('best_results as b')
      .innerJoin('players as pl', 'pl.id', 'b.player_id')
      .select(['pl.piuscores_guid', (eb) => eb.fn.countAll<number>().as('count')])
      .where('pl.piuscores_guid', 'in', guids)
      .groupBy('pl.piuscores_guid')
      .execute();

    const counts = Object.fromEntries(guids.map((guid) => [guid, 0]));
    for (const row of countRows)
      counts[row.piuscores_guid] = Number(row.count);

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
        playerId: row.piuscores_guid,
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
        bestPlayedOn: row.played_on,
        lastPlayedOn: row.last_played_on,
        tries: row.tries,
        updatedAt: toIso(row.updated_at),
      })),
      counts,
    };
  });
};
