import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { sql } from 'kysely';
import { config } from '../src/config.ts';
import { createDatabase } from '../src/db/database.ts';
import { migrateToLatest } from '../src/db/migrations/index.ts';
import { ensurePlayers } from '../src/db/players.ts';
import { queueRun } from '../src/scraper/runs.ts';
import { queueScheduledRunIfDue } from '../src/scraper/schedule.ts';

// Runs against the same database as the API test, which it EMPTIES too: set TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;
const skip = (url  ?  false  :  'TEST_DATABASE_URL is not set');

const db = (url  ?  createDatabase(url)  :  null!);


const guid = (n: number)  =>  `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;


async function setScrapedHoursAgo(playerId: number, hours: number | null) {
  await db.updateTable('players')
    .set({ last_scraped_at: (hours === null  ?  null  :  sql<string>`CURRENT_TIMESTAMP - INTERVAL ${hours} HOUR`) })
    .where('id', '=', playerId)
    .execute();
}


async function addScheduledFailures(playerId: number, hoursAgo: number, count: number) {
  for (let i = 0; i < count; i++) {
    const runId = await queueRun(db, 'scheduled', [playerId]);
    await db.updateTable('scrape_runs')
      .set({ status: 'done', finished_at: sql<string>`CURRENT_TIMESTAMP - INTERVAL 30 DAY` })
      .where('id', '=', runId)
      .execute();
    await db.insertInto('scrape_failures')
      .values({ scrape_run_id: runId, player_id: playerId, message: 'Failed', created_at: sql<string>`CURRENT_TIMESTAMP - INTERVAL ${hoursAgo} HOUR` })
      .execute();
  }
}


const finishRun = (runId: number, hoursAgo: number)  =>
  db.updateTable('scrape_runs')
    .set({ status: 'failed', finished_at: sql<string>`CURRENT_TIMESTAMP - INTERVAL ${hoursAgo} HOUR` })
    .where('id', '=', runId)
    .execute();


const runPlayerIds = async (runId: number)  =>
  (await db.selectFrom('scrape_runs').select('player_ids').where('id', '=', runId).executeTakeFirstOrThrow()).player_ids;


before(async ()  => {
  if (! url)
    return;

  const { error } = await migrateToLatest(db);
  if (error)
    throw error;

  await sql`SET FOREIGN_KEY_CHECKS = 0`.execute(db);
  for (const table of ['scrape_failures', 'scrape_runs', 'users', 'players'])
    await sql`TRUNCATE TABLE ${sql.table(table)}`.execute(db);

  await sql`SET FOREIGN_KEY_CHECKS = 1`.execute(db);
});


after(async ()  => {
  config.scrapeIntervalHours = 12;
  await db?.destroy();
});


test('scheduled runs take due players, retry the ones left, and leave out failing ones', { skip }, async ()  => {
  config.scrapeIntervalHours = 12;
  config.scrapeRetryHours = 2;
  const [neverScraped, overdue, nearlyDue, fresh, failing, failedBefore] = await ensurePlayers(db, [1, 2, 3, 4, 5, 6].map(guid));
  await setScrapedHoursAgo(overdue!, 13);
  await setScrapedHoursAgo(nearlyDue!, 11);
  await setScrapedHoursAgo(fresh!, 1);
  await setScrapedHoursAgo(failing!, 13);
  await addScheduledFailures(failing!, 5, 3);
  // Failures before the last complete scrape don't count.
  await setScrapedHoursAgo(failedBefore!, 14);
  await addScheduledFailures(failedBefore!, 20, 3);

  config.scrapeIntervalHours = 0;
  assert.equal(await queueScheduledRunIfDue(db), null);

  // Players within the margin join; the longest unscraped come first.
  config.scrapeIntervalHours = 12;
  const runId = await queueScheduledRunIfDue(db);
  assert.ok(runId);
  assert.deepEqual(await runPlayerIds(runId), [neverScraped, failedBefore, overdue, nearlyDue]);

  // Not while a run is queued, nor within the retry wait after a scheduled run ended.
  assert.equal(await queueScheduledRunIfDue(db), null);
  await finishRun(runId, 1);
  assert.equal(await queueScheduledRunIfDue(db), null);

  // The players the run didn't scrape are retried after it.
  await finishRun(runId, 3);
  await setScrapedHoursAgo(neverScraped!, 2);
  await setScrapedHoursAgo(failedBefore!, 2);
  const retryRunId = await queueScheduledRunIfDue(db);
  assert.ok(retryRunId);
  assert.deepEqual(await runPlayerIds(retryRunId), [overdue, nearlyDue]);
  await finishRun(retryRunId, 3);

  // Players only within the margin aren't due by themselves.
  await setScrapedHoursAgo(overdue!, 2);
  assert.equal(await queueScheduledRunIfDue(db), null);
});
