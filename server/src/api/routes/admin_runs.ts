import type { ScrapeRun, ScrapeRunPlayer, ScrapeRunPlayerState, ScrapeRunResponse, ScrapeRunsResponse } from '@piu-rivals/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { type Kysely, sql } from 'kysely';
import { ensurePlayers, playerGuidsById, playerIdsByGuid } from '../../db/players.ts';
import type { Database } from '../../db/schema.ts';
import { parsePlayerId } from '../../scraper/player_id.ts';
import { joinOrQueueRun, queueRun } from '../../scraper/runs.ts';
import type { AppDeps } from '../app.ts';
import { requireAdmin, sessionUser } from '../auth.ts';
import { HttpError } from '../errors.ts';
import { playerSummary, toIso, toIsoOrNull } from '../mappers.ts';
import { IdParams } from './params.ts';

// Finished runs per page of the run list; the site asks for more pages by raising the limit.
const RUN_PAGE_SIZE = 50;
const MAX_RUN_LIMIT = 1000;
const ACTIVE_STATUSES = ['queued', 'running'] as const;


function runQuery(db: Kysely<Database>) {
  const failures = db.selectFrom('scrape_failures')
    .select(['scrape_run_id', sql<number>`COUNT(*)`.as('count')])
    .groupBy('scrape_run_id')
    .as('failures');

  return db.selectFrom('scrape_runs as r')
    .leftJoin('users as u', 'u.id', 'r.started_by_user_id')
    .leftJoin('players as p', 'p.id', 'r.current_player_id')
    .leftJoin(failures, 'failures.scrape_run_id', 'r.id')
    .selectAll('r')
    .select([
      'u.email as started_by', 'p.piuscores_guid as player_guid', 'p.name as player_name', 'p.pumbility as player_pumbility',
      'p.last_scraped_at as player_last_scraped_at', 'failures.count as failure_count',
    ]);
}


type RunRow = Awaited<ReturnType<ReturnType<typeof runQuery>['execute']>>[number];


// The API knows players by GUID; players deleted since the run are left out.
const toRun = (row: RunRow, guids: Map<number, string>): ScrapeRun => ({
  id: row.id,
  kind: row.kind,
  playerIds: row.player_ids?.flatMap((id) => guids.get(id)  ??  [])  ??  null,
  status: row.status,
  startedBy: row.started_by,
  createdAt: toIso(row.created_at),
  startedAt: toIsoOrNull(row.started_at),
  finishedAt: toIsoOrNull(row.finished_at),
  playersTotal: row.players_total,
  playersDone: row.players_done,
  currentPlayer: row.player_guid
    ? playerSummary({ piuscores_guid: row.player_guid, name: row.player_name, pumbility: row.player_pumbility, last_scraped_at: row.player_last_scraped_at })
    : null,
  sessionsAdded: row.sessions_added,
  playsAdded: row.plays_added,
  bestsImproved: row.bests_improved,
  cancelRequested: !! row.cancel_requested,
  failures: Number(row.failure_count  ??  0),
});


const runGuids = (db: Kysely<Database>, rows: RunRow[]) =>
  playerGuidsById(db, [...new Set(rows.flatMap((row) => row.player_ids  ??  []))]);


// When the latest "all players" run started, whatever became of it.
async function lastAllRunAt(db: Kysely<Database>): Promise<string | null> {
  const row = await db.selectFrom('scrape_runs').select('started_at').where('kind', '=', 'all').where('started_at', 'is not', null)
    .orderBy('started_at', 'desc').limit(1).executeTakeFirst();
  return toIsoOrNull(row?.started_at  ??  null);
}


// "current": the queued and running runs, in the order the worker takes them (the running one first).
// "previous": the finished ones (done, failed, cancelled, interrupted), the newest `limit` of them first.
async function loadRuns(db: Kysely<Database>, state: 'current' | 'previous', limit: number): Promise<ScrapeRunsResponse> {
  if (state === 'current') {
    const [rows, lastAll] = await Promise.all([
      runQuery(db).where('r.status', 'in', ACTIVE_STATUSES).orderBy('r.id').execute(),
      lastAllRunAt(db),
    ]);
    const guids = await runGuids(db, rows);
    return { runs: rows.map((row) => toRun(row, guids)), hasMore: false, total: rows.length, lastAllRunAt: lastAll };
  }

  const [rows, count, lastAll] = await Promise.all([
    runQuery(db).where('r.status', 'not in', ACTIVE_STATUSES).orderBy('r.id', 'desc').limit(limit + 1).execute(),
    db.selectFrom('scrape_runs').select(sql<number>`COUNT(*)`.as('total')).where('status', 'not in', ACTIVE_STATUSES)
      .executeTakeFirstOrThrow(),
    lastAllRunAt(db),
  ]);

  const shown = rows.slice(0, limit);
  const guids = await runGuids(db, shown);
  return { runs: shown.map((row) => toRun(row, guids)), hasMore: rows.length > limit, total: Number(count.total), lastAllRunAt: lastAll };
}


// The worker takes the players in order, so the first players_done of them are finished. Players
// deleted since are left out.
async function runPlayers(db: Kysely<Database>, row: RunRow, failedIds: Set<number | null>): Promise<ScrapeRunPlayer[]> {
  const ids = row.player_ids  ??  [];
  if (! ids.length)
    return [];

  const stored = await db.selectFrom('players').select(['id', 'piuscores_guid', 'name']).where('id', 'in', ids).execute();
  const players = new Map(stored.map((p) => [p.id, p]));
  const active = (ACTIVE_STATUSES as readonly string[]).includes(row.status);
  const stateOf = (id: number, index: number): ScrapeRunPlayerState => {
    if (failedIds.has(id))
      return 'failed';
    if (index < row.players_done)
      return 'done';
    if (row.status === 'running'  &&  id === row.current_player_id)
      return 'running';
    return active ? 'waiting' : 'skipped';
  };

  return ids.flatMap((id, index) => {
    const player = players.get(id);
    return player ? [{ id: player.piuscores_guid, name: player.name, state: stateOf(id, index) }] : [];
  });
}


async function runResponse(db: Kysely<Database>, runId: number): Promise<ScrapeRunResponse> {
  const row = await runQuery(db).where('r.id', '=', runId).executeTakeFirst();
  if (! row)
    throw new HttpError(404, 'Unknown scrape run');

  const failureList = await db.selectFrom('scrape_failures as f')
    .leftJoin('players as p', 'p.id', 'f.player_id')
    .select(['f.player_id', 'p.piuscores_guid', 'f.message', 'f.created_at'])
    .where('f.scrape_run_id', '=', runId)
    .orderBy('f.id')
    .execute();

  const [previous, next] = await Promise.all([
    db.selectFrom('scrape_runs').select('id').where('id', '<', runId).orderBy('id', 'desc').limit(1).executeTakeFirst(),
    db.selectFrom('scrape_runs').select('id').where('id', '>', runId).orderBy('id').limit(1).executeTakeFirst(),
  ]);

  return {
    run: toRun(row, await runGuids(db, [row])),
    players: await runPlayers(db, row, new Set(failureList.map((f) => f.player_id))),
    failureList: failureList.map((f) => ({ playerId: f.piuscores_guid, message: f.message, createdAt: toIso(f.created_at) })),
    previousRunId: previous?.id  ??  null,
    nextRunId: next?.id  ??  null,
  };
}


export const adminRunRoutes: FastifyPluginAsyncTypebox<AppDeps> = async (app, { db }) => {
  app.addHook('preHandler', requireAdmin);


  // "all" scrapes every stored player; "register" adds players (by GUID or piuscores link) and
  // scrapes them; "selected" and "rescan" work on stored players. Register and selected players join
  // an active register or selected run when there is one.
  app.post('/admin/scrape-runs', {
    schema: {
      body: Type.Object({
        kind: Type.Union([Type.Literal('all'), Type.Literal('selected'), Type.Literal('register'), Type.Literal('rescan')]),
        players: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 1000 })),
      }),
    },
  }, async (request): Promise<ScrapeRunResponse> => {
    const { kind, players } = request.body;
    const userId = sessionUser(request).id;
    let playerIds: number[] | null = null;
    if (kind !== 'all') {
      const parsed = (players  ??  []).map(parsePlayerId);
      if (! parsed.length  ||  parsed.includes(null))
        throw new HttpError(400, 'players must be player GUIDs or piuscores player links');

      const guids = [...new Set(parsed as string[])];
      if (kind === 'register') {
        // Registered players are stored right away, so a run that doesn't get to them (cancelled,
        // interrupted) still leaves them for the next "all" run, which takes never scraped players first.
        playerIds = await ensurePlayers(db, guids, userId);
      } else {
        const ids = await playerIdsByGuid(db, guids);
        const unknown = guids.filter((guid) => ! ids.has(guid));
        if (unknown.length)
          throw new HttpError(404, `Unknown players: ${unknown.join(', ')}`);

        playerIds = guids.map((guid) => ids.get(guid)!);
      }
    }

    const runId = kind === 'register'  ||  kind === 'selected'
      ? await joinOrQueueRun(db, kind, playerIds!, userId)
      : await queueRun(db, kind, playerIds, userId);
    return runResponse(db, runId);
  });


  // `state=current`: queued and running runs; `state=previous`: finished ones, newest first, `limit` of
  // them (more pages: a higher limit).
  app.get('/admin/scrape-runs', {
    schema: {
      querystring: Type.Object({
        state: Type.Union([Type.Literal('current'), Type.Literal('previous')]),
        limit: Type.Integer({ minimum: 1, maximum: MAX_RUN_LIMIT, default: RUN_PAGE_SIZE }),
      }),
    },
  }, async (request) => loadRuns(db, request.query.state, request.query.limit));


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
