import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.ts';
import type { ScrapeSink } from './scrape_player.ts';
import { loadPlayer, playerCheckpoint, savePlayerInfo, skipSession, storeSession } from './store.ts';


export function databaseSink(db: Kysely<Database>, playerId: number): ScrapeSink {
  return {
    async checkpoint() {
      const player = await loadPlayer(db, playerId);
      if (! player)
        throw new Error(`Player ${playerId} is not stored`);

      return playerCheckpoint(player);
    },

    savePlayerInfo: (name, pumbility)  =>  savePlayerInfo(db, playerId, name, pumbility),

    storeSession: (session)  =>  storeSession(db, { playerId, ...session }),

    skipSession: (session)  =>  skipSession(db, { playerId, ...session }),
  };
}


// Stores nothing: every session is new, and each Phoenix 2 one is printed.
export function dryRunSink(): ScrapeSink {
  return {
    checkpoint: async ()  =>  ({ latest: null, anchor: null }),

    async savePlayerInfo(name, pumbility) {
      console.log(`Player ${name  ??  '(no name)'}, PUMBILITY ${pumbility  ??  'unknown'}`);
    },

    async storeSession({ card, date, plays }) {
      console.log(`  ${card.timestamp} (${date  ??  'no date'}) ${card.title}: ${plays.length} plays`);
      for (const p of plays) {
        const resultStats = [p.perfect, p.great, p.good, p.bad, p.miss].map((n)  =>  n  ??  '-').join('/');
        console.log(`    ${p.chartType}${p.level} ${p.songTitle}: ${p.score} ${p.grade  ??  ''}${(p.passed  ?  ''  :  ' (broken)')}`
          + `${(p.plate  ?  ` ${p.plate}`  :  '')}`
          + ` ${resultStats} x${p.maxCombo  ??  '-'}`);
      }

      return { playsAdded: plays.length, bestsImproved: 0 };
    },

    skipSession: async ()  =>  {},
  };
}
