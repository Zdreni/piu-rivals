import { config } from './config.ts';
import { createDatabase } from './db/database.ts';
import { claimNextRun, executeRun, markInterruptedRuns } from './scraper/runs.ts';
import { queueScheduledRunIfDue } from './scraper/schedule.ts';

// The scrape worker: runs queued scrape runs one at a time, and queues scheduled ones when idle.
//  Started by pm2 next to the API.

const SCHEDULE_CHECK_MS = 60_000;

const db = createDatabase();


for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, ()  => {
    // A run in progress is marked interrupted on the next start; its stored sessions stay.
    console.log(`Worker stopping (${signal})`);
    process.exit(0);
  });
}


await markInterruptedRuns(db);
console.log('Worker started, waiting for scrape runs');

let scheduleCheckedAt = 0;
while (true) {
  const run = await claimNextRun(db);
  if (run) {
    await executeRun(db, run);
    continue;
  }

  if (Date.now() - scheduleCheckedAt >= SCHEDULE_CHECK_MS) {
    scheduleCheckedAt = Date.now();
    if (await queueScheduledRunIfDue(db))
      continue;
  }

  await new Promise((resolve)  =>  setTimeout(resolve, config.workerPollMs));
}
