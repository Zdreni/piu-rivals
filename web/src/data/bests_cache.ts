import type { BestResult, Chart } from '@piu-rivals/shared';

// Best results kept in IndexedDB between visits, so a visit only downloads what changed since the last one.
// It's a cache of public scores, shared by everyone signed in on this browser; anything can be loaded again.
// A new DB_VERSION drops everything stored, e.g. after the stored shapes change.
const DB_NAME = 'piu-rivals-cache';
// 2: charts have songShortTitle. 5: bests have improvement (3 and 4 were only used in development).
// Never lowered: a browser that has a higher version can't open a lower one.
const DB_VERSION = 5;

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
const playerRange = (playerId: string)  =>  IDBKeyRange.bound([playerId, -Infinity], [playerId, Infinity]);


const request = <T>(req: IDBRequest<T>)  =>  new Promise<T>((resolve, reject)  => {
  req.onsuccess = ()  =>  resolve(req.result);
  req.onerror = ()  =>  reject(req.error);
});


const transactionDone = (tx: IDBTransaction)  =>  new Promise<void>((resolve, reject)  => {
  tx.oncomplete = ()  =>  resolve();
  tx.onerror = ()  =>  reject(tx.error);
  tx.onabort = ()  =>  reject(tx.error  ??  new Error('IndexedDB transaction aborted'));
});


// A new version waits for every tab to close the old one. A blocked open gets an event, but an open queued behind
// it gets none and would wait forever, so after OPEN_TIMEOUT_MS the scores are loaded without the cache.
const OPEN_TIMEOUT_MS = 3000;


function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject)  => {
    let settled = false;

    const fail = (error: unknown)  => {
      if (! settled) {
        settled = true;
        reject(error);
      }
    };

    const timer = setTimeout(()  =>  fail(new Error('IndexedDB took too long to open')), OPEN_TIMEOUT_MS);
    const openRequest = indexedDB.open(DB_NAME, DB_VERSION);
    openRequest.onupgradeneeded = ()  => {
      const db = openRequest.result;
      for (const name of [...db.objectStoreNames])
        db.deleteObjectStore(name);

      db.createObjectStore('charts', { keyPath: 'id' });
      db.createObjectStore('bests', { keyPath: ['playerId', 'chartId'] });
      db.createObjectStore('syncs', { keyPath: 'playerId' });
    };

    openRequest.onsuccess = ()  => {
      clearTimeout(timer);

      const db = openRequest.result;
      // Opened after the page gave up on it: closed, so it doesn't hold up other tabs.
      if (settled) {
        db.close();
        return;
      }

      // A tab opening a newer version shouldn't wait for this one.
      db.onversionchange = ()  =>  db.close();
      settled = true;
      resolve(db);
    };

    openRequest.onerror = ()  => {
      clearTimeout(timer);
      fail(openRequest.error);
    };

    openRequest.onblocked = ()  =>  fail(new Error('IndexedDB is blocked by another tab'));
  });
}


function indexedDbCache(db: IDBDatabase): BestsCache {
  return {
    async load(playerIds) {
      const tx = db.transaction(['charts', 'bests', 'syncs'], 'readonly');
      const [charts, bests, marks] = await Promise.all([
        request(tx.objectStore('charts').getAll() as IDBRequest<Chart[]>),
        Promise.all(playerIds.map((playerId)  =>  request(tx.objectStore('bests').getAll(playerRange(playerId)) as IDBRequest<BestResult[]>))),
        Promise.all(playerIds.map((playerId)  =>  request(tx.objectStore('syncs').get(playerId) as IDBRequest<SyncMark | undefined>))),
      ]);

      return { charts, bests: bests.flat(), marks: marks.filter((mark)  =>  mark !== undefined) };
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
  load: async ()  =>  ({ charts: [], bests: [], marks: [] }),
  save: async ()  =>  {},
  clear: async ()  =>  {},
};

let openedCache: Promise<BestsCache> | null = null;


export function openBestsCache(): Promise<BestsCache> {
  openedCache  ??=  openDatabase().then(indexedDbCache, (error)  => {
    console.warn('[piu-rivals] Scores are not cached between visits:', error);
    return noCache;
  });

  return openedCache;
}
