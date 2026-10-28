import { createDatabase } from '../db/database.ts';
import { ensurePlayers } from '../db/players.ts';
import { SessionsBrowser } from '../scraper/browser.ts';
import { parsePlayerId } from '../scraper/player_id.ts';
import { scrapePlayer } from '../scraper/scrape_player.ts';
import { databaseSink, dryRunSink } from '../scraper/sinks.ts';

// Scrapes one player right away, without a scrape run, for testing:
//   npm run scrape -- <player GUID or piuscores link> [--dry-run]
// --dry-run prints every Phoenix 2 session and play instead of storing them, and needs no database.

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const playerId = parsePlayerId(args.find((arg)  =>  ! arg.startsWith('--'))  ||  '');
if (! playerId) {
  console.error('Usage: npm run scrape -- <player GUID or piuscores link> [--dry-run]');
  process.exit(1);
}

const db = (dryRun  ?  null  :  createDatabase());
const browser = await SessionsBrowser.launch();
try {
  const sink = (db  ?  databaseSink(db, (await ensurePlayers(db, [playerId]))[0]!)  :  dryRunSink());
  const result = await scrapePlayer(browser, playerId, sink, (progress)  => {
    if (db) {
      console.log(`  ${progress.index + 1}/${progress.total} ${progress.card.timestamp}${(progress.grown  ?  ' (grown)'  :  '')}: `
        + `${progress.playsAdded} play(s) added, ${progress.bestsImproved} best(s) improved`);
    }
  });

  console.log(`${result.name  ??  playerId}: ${result.sessions} session(s), ${result.playsAdded} play(s), `
    + `${result.bestsImproved} best(s) improved`);
} finally {
  await browser.close();
  await db?.destroy();
}
