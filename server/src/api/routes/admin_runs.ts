import type { ScrapeRun, ScrapeRunResponse, ScrapeRunsResponse } from '@piu-rivals/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { type Kysely, sql } from 'kysely';
import type { Database } from '../../db/schema.ts';
import { parsePlayerId } from '../../scraper/player_id.ts';
import { queueRun } from '../../scraper/runs.ts';
import type { AppDeps } from '../app.ts';
import { requireAdmin, sessionUser } from '../auth.ts';
import { HttpError } from '../errors.ts';
import { playerSummary, toIso, toIsoOrNull } from '../mappers.ts';
import { IdParams } from './params.ts';

const RUN_LIST_LIMIT = 50;


async function loadRuns(db: Kysely<Database>, runId?: number): Promise<ScrapeRun[]> {
  const failures = db.selectFrom('scrape_failures')
    .select(['scrape_run_id', sql<number>`COUNT(*)`.as('count')])
    .groupBy('scrape_run_id')
    .as('failures');

  let query = db.selectFrom('scrape_runs as r')
    .leftJoin('users as u', 'u.id', 'r.started_by_user_id')
    .leftJoin('players as p', 'p.id', 'r.current_player_id')
    .leftJoin(failures, 'failures.scrape_run_id', 'r.id')
    .selectAll('r')
    .select([
      'u.email as started_by', 'p.id as player_id', 'p.name as player_name', 'p.pumbility as player_pumbility',
      'p.last_scraped_at as player_last_scraped_at', 'failures.count as failure_count',
    ])
    .orderBy('r.id', 'desc')
    .limit(RUN_LIST_LIMIT);

  if (runId)
    query = query.where('r.id', '=', runId);

  return (await query.execute()).map((row) => ({
    id: row.id,
    kind: row.kind,
    playerIds: row.player_ids,
    status: row.status,
    startedBy: row.started_by,
    createdAt: toIso(row.created_at),
    startedAt: toIsoOrNull(row.started_at),
    finishedAt: toIsoOrNull(row.finished_at),
    playersTotal: row.players_total,
    playersDone: row.players_done,
    currentPlayer: row.player_id
      ? playerSummary({ id: row.player_id, name: row.player_name, pumbility: row.player_pumbility, last_scraped_at: row.player_last_scraped_at })
      : null,
    sessionsAdded: row.sessions_added,
    playsAdded: row.plays_added,
    bestsImproved: row.bests_improved,
    cancelRequested: !! row.cancel_requested,
    failures: Number(row.failure_count  ??  0),
  }));
}


async function runResponse(db: Kysely<Database>, runId: number): Promise<ScrapeRunResponse> {
  const [run] = await loadRuns(db, runId);
  if (! run)
    throw new HttpError(404, 'Unknown scrape run');

  const failureList = await db.selectFrom('scrape_failures')
    .select(['player_id', 'message', 'created_at'])
    .where('scrape_run_id', '=', runId)
    .orderBy('id')
    .execute();

  return {
    run,
    failureList: failureList.map((f) => ({ playerId: f.player_id, message: f.message, createdAt: toIso(f.created_at) })),
  };
}


export const adminRunRoutes: FastifyPluginAsyncTypebox<AppDeps> = async (app, { db }) => {
  app.addHook('preHandler', requireAdmin);


  // "all" scrapes every stored player; "register" adds players (by GUID or piuscores link) and
  // scrapes them; "selected" and "rescan" work on stored players.
  app.post('/admin/scrape-runs', {
    schema: {
      body: Type.Object({
        kind: Type.Union([Type.Literal('all'), Type.Literal('selected'), Type.Literal('register'), Type.Literal('rescan')]),
        players: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 1000 })),
      }),
    },
  }, async (request): Promise<ScrapeRunResponse> => {
    const { kind, players } = request.body;
    let playerIds: string[] | null = null;
    if (kind !== 'all') {
      const parsed = (players  ??  []).map(parsePlayerId);
      if (! parsed.length  ||  parsed.includes(null))
        throw new HttpError(400, 'players must be player GUIDs or piuscores player links');

      playerIds = [...new Set(parsed as string[])];
      if (kind !== 'register') {
        const known = (await db.selectFrom('players').select('id').where('id', 'in', playerIds).execute()).map((p) => p.id);
        const unknown = playerIds.filter((id) => ! known.includes(id));
        if (unknown.length)
          throw new HttpError(404, `Unknown players: ${unknown.join(', ')}`);
      }
    }

    const runId = await queueRun(db, kind, playerIds, sessionUser(request).id);
    return runResponse(db, runId);
  });


  app.get('/admin/scrape-runs', async (): Promise<ScrapeRunsResponse> => ({ runs: await loadRuns(db) }));


  app.get('/admin/scrape-runs/:id', { schema: { params: IdParams } }, async (request) => runResponse(db, request.params.id));


  // A queued run is cancelled right away; a running one stops after its current player.
  app.post('/admin/scrape-runs/:id/cancel', { schema: { params: IdParams } }, async (request) => {
    const { id } = request.params;
    const run = await db.selectFrom('scrape_runs').select('status').where('id', '=', id).executeTakeFirst();
    if (! run)
      throw new HttpError(404, 'Unknown scrape run');

    if (run.status === 'queued') {
      await db.updateTable('scrape_runs')
        .set({ status: 'cancelled', finished_at: sql<string>`CURRENT_TIMESTAMP` })
        .where('id', '=', id)
        .where('status', '=', 'queued')
        .execute();
    } else if (run.status === 'running') {
      await db.updateTable('scrape_runs').set({ cancel_requested: 1 }).where('id', '=', id).execute();
    } else {
      throw new HttpError(409, `The run is already ${run.status}`);
    }

    return runResponse(db, id);
  });
};
