import { type ExpressionBuilder, type Kysely, sql } from 'kysely';
import { config } from '../config.ts';
import type { Database } from '../db/schema.ts';
import { queueRun } from './runs.ts';

// Scheduled runs: the worker scrapes every player about every SCRAPE_INTERVAL_HOURS by itself.
// A player is due once their last complete scrape is that old. A run that leaves players unscraped
//  (failed, interrupted, cancelled, or failing players) is therefore followed by one for those players
//  only, SCRAPE_RETRY_HOURS after it ended.

type Db = Kysely<Database>;

// Players last scraped this much less than the interval ago join a run that's due anyway, so the
//  players scraped near the end of the previous run don't split off into a small run of their own.
const DUE_MARGIN_HOURS = 2;
// A player failing in this many scheduled runs since their last complete scrape is left out, until a
//  run started by an admin scrapes them (e.g. a rescan of a broken checkpoint).
const MAX_SCHEDULED_FAILURES = 3;

const hoursAgo = (hours: number)  =>  sql<string>`CURRENT_TIMESTAMP - INTERVAL ${Math.round(hours * 60)} MINUTE`;


const scheduledFailureCount = (eb: ExpressionBuilder<Database, 'players'>)  =>
  eb.selectFrom('scrape_failures as f')
    .innerJoin('scrape_runs as r', 'r.id', 'f.scrape_run_id')
    .select(eb.fn.countAll<number>().as('count'))
    .whereRef('f.player_id', '=', 'players.id')
    .where('r.kind', '=', 'scheduled')
    .where((eb)  =>  eb.or([
      eb('players.last_scraped_at', 'is', null),
      eb('f.created_at', '>', eb.ref('players.last_scraped_at')),
    ]));


// The players a scheduled run would scrape now, the longest unscraped first, with whether any of them
//  is due at all.
async function duePlayers(db: Db) {
  const intervalHours = config.scrapeIntervalHours;
  const players = await db.selectFrom('players')
    .select('id')
    .select(sql<number>`last_scraped_at IS NULL OR last_scraped_at < ${hoursAgo(intervalHours)}`.as('is_due'))
    .where((eb)  =>  eb.or([
      eb('last_scraped_at', 'is', null),
      eb('last_scraped_at', '<', hoursAgo(Math.max(0, intervalHours - DUE_MARGIN_HOURS))),
    ]))
    .where((eb)  =>  eb(scheduledFailureCount(eb), '<', MAX_SCHEDULED_FAILURES))
    .orderBy(sql`last_scraped_at IS NOT NULL`)
    .orderBy('last_scraped_at')
    .execute();

  return { playerIds: players.map((p)  =>  p.id), areDue: players.some((p)  =>  !! Number(p.is_due)) };
}


// Queues a scheduled run when players are due, the worker is idle, and no scheduled run ended in the
//  last SCRAPE_RETRY_HOURS. Returns the run's id, or null when none was queued.
export async function queueScheduledRunIfDue(db: Db): Promise<number | null> {
  if (config.scrapeIntervalHours <= 0)
    return null;

  const blockingRun = await db.selectFrom('scrape_runs')
    .select('id')
    .where((eb)  =>  eb.or([
      eb('status', 'in', ['queued', 'running']),
      eb.and([eb('kind', '=', 'scheduled'), eb('finished_at', '>', hoursAgo(config.scrapeRetryHours))]),
    ]))
    .limit(1)
    .executeTakeFirst();

  if (blockingRun)
    return null;

  const { playerIds, areDue } = await duePlayers(db);
  if (! areDue)
    return null;

  const runId = await queueRun(db, 'scheduled', playerIds);
  console.log(`Queued scheduled run ${runId} for ${playerIds.length} player(s)`);
  return runId;
}
