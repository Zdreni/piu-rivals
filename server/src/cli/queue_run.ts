import { createDatabase } from '../db/database.ts';
import { ensurePlayers, playerIdsByGuid } from '../db/players.ts';
import type { ScrapeRunKind } from '../db/schema.ts';
import { parsePlayerId } from '../scraper/player_id.ts';
import { queueRun } from '../scraper/runs.ts';

// Queues a scrape run for the worker, until the admin panel can do it:
//   npm run queue -- all
//   npm run queue -- register|selected|rescan <player GUID or link> [...]

const [kind, ...rest] = process.argv.slice(2);
const kinds: ScrapeRunKind[] = ['all', 'selected', 'register', 'rescan'];
const guids = rest.map(parsePlayerId);
if (! kinds.includes(kind as ScrapeRunKind)  ||  (kind === 'all') !== (rest.length === 0)  ||  guids.includes(null)) {
  console.error('Usage: npm run queue -- all | register|selected|rescan <player GUID or link> [...]');
  process.exit(1);
}

const db = createDatabase();
let playerIds: number[] | null = null;
if (kind === 'register') {
  playerIds = await ensurePlayers(db, guids as string[]);
} else if (kind !== 'all') {
  const ids = await playerIdsByGuid(db, guids as string[]);
  const unknown = (guids as string[]).filter((guid) => ! ids.has(guid));
  if (unknown.length) {
    console.error(`Unknown players: ${unknown.join(', ')}`);
    await db.destroy();
    process.exit(1);
  }

  playerIds = (guids as string[]).map((guid) => ids.get(guid)!);
}

const runId = await queueRun(db, kind as ScrapeRunKind, playerIds);
console.log(`Queued scrape run ${runId}`);
await db.destroy();
