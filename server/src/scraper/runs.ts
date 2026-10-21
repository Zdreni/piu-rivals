import { type Kysely, sql } from 'kysely';
import type { Database, ScrapeRun, ScrapeRunKind } from '../db/schema.ts';
import { SessionsBrowser } from './browser.ts';
import { scrapePlayer } from './scrape_player.ts';
import { databaseSink } from './sinks.ts';
import { ensurePlayer, resetPlayer } from './store.ts';

type Db = Kysely<Database>;

const now = sql<string>`CURRENT_TIMESTAMP`;


export async function queueRun(db: Db, kind: ScrapeRunKind, playerIds: string[] | null, userId: number | null = null) {
  const { insertId } = await db.insertInto('scrape_runs')
    .values({
      kind,
      player_ids: playerIds ? JSON.stringify(playerIds) : null,
      players_total: playerIds?.length  ??  0,
      started_by_user_id: userId,
    })
    .executeTakeFirstOrThrow();

  return Number(insertId);
}


// Runs that more players can join: they only scrape (a rescan first deletes the players' plays).
const JOINABLE_KINDS: readonly ScrapeRunKind[] = ['register', 'selected'];


// Adds the players to an active register or selected run, so players added one after another are
// scraped together, or queues a new run when there is none. A player still waiting in an active run
// (an "all" run too) isn't added twice. Locks the active runs, like takePlayer, so a run the worker
// is finishing either takes the players or is seen finished.
export async function joinOrQueueRun(db: Db, kind: 'register' | 'selected', playerIds: string[], userId: number | null = null) {
  return db.transaction().execute(async (trx) => {
    const runs = await trx.selectFrom('scrape_runs')
      .select(['id', 'kind', 'player_ids', 'players_done'])
      .where('status', 'in', ['queued', 'running'])
      .where('cancel_requested', '=', 0)
      .orderBy('id')
      .forUpdate()
      .execute();

    // A run's players from players_done on are being scraped or still to come.
    const waitingIn = (run: typeof runs[number]) => (run.player_ids  ??  []).slice(run.players_done);
    const waiting = new Set(runs.flatMap(waitingIn));
    const added = playerIds.filter((id) => ! waiting.has(id));
    if (! added.length)
      return runs.find((run) => waitingIn(run).some((id) => playerIds.includes(id)))!.id;

    const target = runs.find((run) => JOINABLE_KINDS.includes(run.kind));
    if (! target)
      return queueRun(trx, kind, added, userId);

    const ids = [...(target.player_ids  ??  []), ...added];
    await trx.updateTable('scrape_runs')
      .set({ player_ids: JSON.stringify(ids), players_total: ids.length })
      .where('id', '=', target.id)
      .execute();

    return target.id;
  });
}


// Runs left "running" by a worker that stopped (e.g. a restart) can't continue by themselves.
export async function markInterruptedRuns(db: Db) {
  await db.updateTable('scrape_runs')
    .set({ status: 'interrupted', finished_at: now, current_player_id: null })
    .where('status', '=', 'running')
    .execute();
}


export async function claimNextRun(db: Db): Promise<ScrapeRun | null> {
  const next = await db.selectFrom('scrape_runs').select('id').where('status', '=', 'queued').orderBy('id').executeTakeFirst();
  if (! next)
    return null;

  const { numUpdatedRows } = await db.updateTable('scrape_runs')
    .set({ status: 'running', started_at: now })
    .where('id', '=', next.id)
    .where('status', '=', 'queued')
    .executeTakeFirst();

  if (! numUpdatedRows)
    return null;

  return await db.selectFrom('scrape_runs').selectAll().where('id', '=', next.id).executeTakeFirst()  ??  null;
}


// "all" goes through every stored player, the longest unscraped first.
async function allPlayerIds(db: Db): Promise<string[]> {
  const players = await db.selectFrom('players')
    .select('id')
    .orderBy(sql`last_scraped_at IS NOT NULL`)
    .orderBy('last_scraped_at')
    .execute();

  return players.map((p) => p.id);
}


const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));


async function recordFailure(db: Db, runId: number, playerId: string | null, error: unknown) {
  console.error(`Run ${runId}${playerId ? `, player ${playerId}` : ''}:`, error);
  await db.insertInto('scrape_failures')
    .values({ scrape_run_id: runId, player_id: playerId, message: errorMessage(error).slice(0, 2000) })
    .execute();
}


type FinishedStatus = 'done' | 'failed' | 'cancelled';


async function finishRun(db: Db, runId: number, status: FinishedStatus) {
  await db.updateTable('scrape_runs')
    .set({ status, finished_at: now, current_player_id: null })
    .where('id', '=', runId)
    .execute();
}


// Makes the run's player at `index` its current one, or finishes the run when it has no more
// players or was asked to stop. The run's list can grow while it runs (see joinOrQueueRun), so it's
// read again each time, under the run's lock: a player added at the same time is either taken here
// or sees the run finished and goes to a new run.
export async function takePlayer(db: Db, runId: number, index: number): Promise<{ playerId: string } | { finished: FinishedStatus }> {
  return db.transaction().execute(async (trx) => {
    const run = await trx.selectFrom('scrape_runs')
      .select(['player_ids', 'cancel_requested'])
      .where('id', '=', runId)
      .forUpdate()
      .executeTakeFirstOrThrow();

    const playerId = run.player_ids?.[index];
    if (run.cancel_requested  ||  ! playerId) {
      const finished = run.cancel_requested ? 'cancelled' : 'done';
      await finishRun(trx, runId, finished);
      return { finished };
    }

    await trx.updateTable('scrape_runs').set({ current_player_id: playerId }).where('id', '=', runId).execute();
    return { playerId };
  });
}


// Works through the run's players, including ones added while it runs. A failing player is recorded
// and skipped; cancelling stops before the next player, after the current one's sessions are stored.
export async function executeRun(db: Db, run: ScrapeRun) {
  if (run.kind === 'all') {
    // An "all" run keeps the players it resolved to, so its page can list them.
    const playerIds = await allPlayerIds(db);
    await db.updateTable('scrape_runs')
      .set({ players_total: playerIds.length, player_ids: JSON.stringify(playerIds) })
      .where('id', '=', run.id)
      .execute();
  }

  console.log(`Run ${run.id} (${run.kind}) started`);
  let browser: SessionsBrowser | null = null;
  let status: FinishedStatus;
  try {
    browser = await SessionsBrowser.launch();
    for (let index = 0; ; index++) {
      const next = await takePlayer(db, run.id, index);
      if ('finished' in next) {
        status = next.finished;
        break;
      }

      const { playerId } = next;
      try {
        // A registered player can join a selected run too, so both make sure the player is stored.
        if (run.kind === 'register'  ||  run.kind === 'selected')
          await ensurePlayer(db, playerId, run.started_by_user_id);

        if (run.kind === 'rescan')
          await resetPlayer(db, playerId);

        const result = await scrapePlayer(browser, playerId, databaseSink(db, playerId, run.id), async (progress) => {
          await db.updateTable('scrape_runs')
            .set((eb) => ({
              sessions_added: eb('sessions_added', '+', 1),
              plays_added: eb('plays_added', '+', progress.playsAdded),
              bests_improved: eb('bests_improved', '+', progress.bestsImproved),
            }))
            .where('id', '=', run.id)
            .execute();
        });

        console.log(`Run ${run.id}: ${result.name  ??  playerId}: ${result.sessions} session(s), `
          + `${result.playsAdded} play(s), ${result.bestsImproved} best(s) improved`);
      } catch (error) {
        await recordFailure(db, run.id, playerId, error);
      }

      await db.updateTable('scrape_runs')
        .set((eb) => ({ players_done: eb('players_done', '+', 1) }))
        .where('id', '=', run.id)
        .execute();
    }
  } catch (error) {
    status = 'failed';
    await recordFailure(db, run.id, null, error);
    await finishRun(db, run.id, status);
  } finally {
    await browser?.close().catch(() => {});
  }

  console.log(`Run ${run.id}: ${status}`);
}
