import type { BestResult, Chart } from '@piu-rivals/shared';

// Best results kept in IndexedDB between visits, so a visit only downloads what changed since the last one.
// It's a cache of public scores, shared by everyone signed in on this browser; anything can be loaded again.
// A new DB_VERSION drops everything stored, e.g. after the stored shapes change.
const DB_NAME = 'piu-rivals-cache';
const DB_VERSION = 1;

// When the player's best results were last downloaded: a serverTime to pass as `since` next time.
export interface SyncMark {
  playerId: string;
  since: string;
}

export interface CachedPlayers {
  charts: Chart[];
  bests: BestResult[];
  marks: SyncMark[];
}

export interface BestsCache {
  load(playerIds: string[]): Promise<CachedPlayers>;
  save(data: CachedPlayers): Promise<void>;
  // Drops the players' best results and sync marks.
  clear(playerIds: string[]): Promise<void>;
}

// Best results are keyed by [playerId, chartId], so one player's are a key range.
const playerRange = (playerId: string) => IDBKeyRange.bound([playerId, -Infinity], [playerId, Infinity]);


const request = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});


const transactionDone = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error  ??  new Error('IndexedDB transaction aborted'));
});


function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      for (const name of [...db.objectStoreNames])
        db.deleteObjectStore(name);

      db.createObjectStore('charts', { keyPath: 'id' });
      db.createObjectStore('bests', { keyPath: ['playerId', 'chartId'] });
      db.createObjectStore('syncs', { keyPath: 'playerId' });
    };

    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
  });
}


function indexedDbCache(db: IDBDatabase): BestsCache {
  return {
    async load(playerIds) {
      const tx = db.transaction(['charts', 'bests', 'syncs'], 'readonly');
      const [charts, bests, marks] = await Promise.all([
        request(tx.objectStore('charts').getAll() as IDBRequest<Chart[]>),
        Promise.all(playerIds.map((playerId) => request(tx.objectStore('bests').getAll(playerRange(playerId)) as IDBRequest<BestResult[]>))),
        Promise.all(playerIds.map((playerId) => request(tx.objectStore('syncs').get(playerId) as IDBRequest<SyncMark | undefined>))),
      ]);

      return { charts, bests: bests.flat(), marks: marks.filter((mark) => mark !== undefined) };
    },

    async save({ charts, bests, marks }) {
      const tx = db.transaction(['charts', 'bests', 'syncs'], 'readwrite');
      for (const chart of charts)
        tx.objectStore('charts').put(chart);

      for (const best of bests)
        tx.objectStore('bests').put(best);

      for (const mark of marks)
        tx.objectStore('syncs').put(mark);

      await transactionDone(tx);
    },

    async clear(playerIds) {
      const tx = db.transaction(['bests', 'syncs'], 'readwrite');
      for (const playerId of playerIds) {
        tx.objectStore('bests').delete(playerRange(playerId));
        tx.objectStore('syncs').delete(playerId);
      }

      await transactionDone(tx);
    },
  };
}


// Without IndexedDB (private windows, blocked site data) nothing is kept between visits.
const noCache: BestsCache = {
  load: async () => ({ charts: [], bests: [], marks: [] }),
  save: async () => {},
  clear: async () => {},
};

let opened: Promise<BestsCache> | null = null;


export function openBestsCache(): Promise<BestsCache> {
  opened  ??=  openDatabase().then(indexedDbCache, (error) => {
    console.warn('[piu-rivals] Scores are not cached between visits:', error);
    return noCache;
  });

  return opened;
}
