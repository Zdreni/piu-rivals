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
    .values({ kind, player_ids: playerIds ? JSON.stringify(playerIds) : null, started_by_user_id: userId })
    .executeTakeFirstOrThrow();

  return Number(insertId);
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
async function runPlayerIds(db: Db, run: ScrapeRun): Promise<string[]> {
  if (run.kind !== 'all')
    return run.player_ids  ??  [];

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


async function cancelRequested(db: Db, runId: number) {
  const run = await db.selectFrom('scrape_runs').select('cancel_requested').where('id', '=', runId).executeTakeFirst();
  return !! run?.cancel_requested;
}


// Works through the run's players. A failing player is recorded and skipped; cancelling stops
// before the next player, after the current one's sessions are stored.
export async function executeRun(db: Db, run: ScrapeRun) {
  const playerIds = await runPlayerIds(db, run);
  await db.updateTable('scrape_runs').set({ players_total: playerIds.length }).where('id', '=', run.id).execute();
  console.log(`Run ${run.id} (${run.kind}): ${playerIds.length} player(s)`);

  let browser: SessionsBrowser | null = null;
  let status: 'done' | 'failed' | 'cancelled' = 'done';
  try {
    browser = await SessionsBrowser.launch();
    for (const playerId of playerIds) {
      if (await cancelRequested(db, run.id)) {
        status = 'cancelled';
        break;
      }

      await db.updateTable('scrape_runs').set({ current_player_id: playerId }).where('id', '=', run.id).execute();
      try {
        if (run.kind === 'register')
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
  } finally {
    await browser?.close().catch(() => {});
  }

  await db.updateTable('scrape_runs')
    .set({ status, finished_at: now, current_player_id: null })
    .where('id', '=', run.id)
    .execute();

  console.log(`Run ${run.id}: ${status}`);
}
