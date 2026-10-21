import { createDatabase } from '../db/database.ts';
import type { ScrapeRunKind } from '../db/schema.ts';
import { parsePlayerId } from '../scraper/player_id.ts';
import { queueRun } from '../scraper/runs.ts';
import { ensurePlayers } from '../scraper/store.ts';

// Queues a scrape run for the worker, until the admin panel can do it:
//   npm run queue -- all
//   npm run queue -- register|selected|rescan <player GUID or link> [...]

const [kind, ...rest] = process.argv.slice(2);
const kinds: ScrapeRunKind[] = ['all', 'selected', 'register', 'rescan'];
const playerIds = rest.map(parsePlayerId);
if (! kinds.includes(kind as ScrapeRunKind)  ||  (kind === 'all') !== (rest.length === 0)  ||  playerIds.includes(null)) {
  console.error('Usage: npm run queue -- all | register|selected|rescan <player GUID or link> [...]');
  process.exit(1);
}

const db = createDatabase();
if (kind === 'register')
  await ensurePlayers(db, playerIds as string[]);

const runId = await queueRun(db, kind as ScrapeRunKind, kind === 'all' ? null : playerIds as string[]);
console.log(`Queued scrape run ${runId}`);
await db.destroy();
