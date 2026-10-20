import { config } from './config.ts';
import { createDatabase } from './db/database.ts';
import { claimNextRun, executeRun, markInterruptedRuns } from './scraper/runs.ts';

// The scrape worker: runs queued scrape runs one at a time. Started by pm2 next to the API.

const db = createDatabase();


for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    // A run in progress is marked interrupted on the next start; its stored sessions stay.
    console.log(`Worker stopping (${signal})`);
    process.exit(0);
  });
}


await markInterruptedRuns(db);
console.log('Worker started, waiting for scrape runs');

while (true) {
  const run = await claimNextRun(db);
  if (run)
    await executeRun(db, run);
  else
    await new Promise((resolve) => setTimeout(resolve, config.workerPollMs));
}
