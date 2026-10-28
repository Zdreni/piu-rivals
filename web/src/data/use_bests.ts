import type { BestResult, BestsResponse, Chart } from '@piu-rivals/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorText } from '../api.ts';
import { type CachedPlayers, openBestsCache } from './bests_cache.ts';
import type { PlayerBests } from './model.ts';

// Keeps the best results of the given players: first from the cache, then only what changed on the server.
// `/bests` takes up to 100 players per request.
const PLAYERS_PER_REQUEST = 50;

export interface Bests {
  charts: Map<number, Chart>;
  bests: Map<string, PlayerBests>;
  // Every player asked for has been loaded, from the cache or the server.
  ready: boolean;
  // Grows whenever `charts` or `bests` changed; they are changed in place.
  version: number;
  syncing: boolean;
  error: string | null;
  // Downloads what changed since the last sync.
  sync(): Promise<void>;
}

interface Store {
  charts: Map<number, Chart>;
  bests: Map<string, PlayerBests>;
  // serverTime of each player's last download.
  since: Map<string, string>;
  // Players whose cached rows were read already.
  fromCache: Set<string>;
}


const chunks = <T>(items: T[])  =>
  Array.from({ length: Math.ceil(items.length / PLAYERS_PER_REQUEST) }, (_, i)  =>
    items.slice(i * PLAYERS_PER_REQUEST, (i + 1) * PLAYERS_PER_REQUEST));


function merge(store: Store, charts: Chart[], bests: BestResult[]) {
  for (const chart of charts)
    store.charts.set(chart.id, chart);

  for (const best of bests) {
    let playerBests = store.bests.get(best.playerId);
    if (! playerBests)
      store.bests.set(best.playerId, playerBests = new Map());

    playerBests.set(best.chartId, best);
  }
}


async function persist(data: CachedPlayers) {
  try {
    await (await openBestsCache()).save(data);
  } catch (error) {
    console.warn('[piu-rivals] Unable to cache scores:', error);
  }
}


async function download(store: Store, playerIds: string[], since?: string) {
  const query = `players=${playerIds.join(',')}${(since  ?  `&since=${encodeURIComponent(since)}`  :  '')}`;
  const response = await api<BestsResponse>('GET', `/bests?${query}`);
  merge(store, response.charts, response.bests);
  for (const playerId of playerIds)
    store.since.set(playerId, response.serverTime);

  await persist({ charts: response.charts, bests: response.bests, marks: playerIds.map((playerId)  =>  ({ playerId, since: response.serverTime })) });
  // Players holding a different number of rows than the server missed a deletion, e.g. a rescan.
  return playerIds.filter((playerId)  =>  (store.bests.get(playerId)?.size  ??  0) !== (response.counts[playerId]  ??  0));
}


// `changed` runs whenever new rows were merged, so cached rows show while the server is asked.
async function syncPlayers(store: Store, playerIds: string[], changed: () => void) {
  const uncached = playerIds.filter((playerId)  =>  ! store.fromCache.has(playerId));
  if (uncached.length) {
    const cached = await (await openBestsCache()).load(uncached);
    merge(store, cached.charts, cached.bests);
    for (const { playerId, since } of cached.marks)
      store.since.set(playerId, since);

    for (const playerId of uncached)
      store.fromCache.add(playerId);

    changed();
  }

  const known = playerIds.filter((playerId)  =>  store.since.has(playerId));
  const fresh = playerIds.filter((playerId)  =>  ! store.since.has(playerId));
  const stale: string[] = [];
  // A chunk asks from its earliest sync; rows the others had already come again, which is harmless.
  for (const chunk of chunks(known)) {
    stale.push(...await download(store, chunk, chunk.map((playerId)  =>  store.since.get(playerId)!).sort()[0]));
    changed();
  }

  for (const chunk of chunks(fresh)) {
    await download(store, chunk);
    changed();
  }

  if (! stale.length)
    return;

  for (const playerId of stale) {
    store.bests.delete(playerId);
    store.since.delete(playerId);
  }

  await (await openBestsCache()).clear(stale).catch((error)  =>  console.warn('[piu-rivals] Unable to clear cached scores:', error));
  for (const chunk of chunks(stale)) {
    await download(store, chunk);
    changed();
  }
}


export function useBests(playerIds: string[]): Bests {
  const store = useRef<Store>({ charts: new Map(), bests: new Map(), since: new Map(), fromCache: new Set() });
  const wanted = useRef(playerIds);
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const [version, setVersion] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = [...playerIds].sort().join(',');
  wanted.current = playerIds;

  // One sync at a time; a sync asked for meanwhile runs once the current one is done, for the players wanted then.
  const sync = useCallback(async ()  => {
    if (running.current) {
      again.current = true;
      return running.current;
    }

    setSyncing(true);
    running.current = (async ()  => {
      do {
        again.current = false;
        try {
          await syncPlayers(store.current, wanted.current, ()  =>  setVersion((v)  =>  v + 1));
          setError(null);
        } catch (e) {
          setError(errorText(e));
        }
      } while (again.current);
    })();

    try {
      await running.current;
    } finally {
      running.current = null;
      setSyncing(false);
    }
  }, []);

  useEffect(()  => {
    void sync();
  }, [key, sync]);

  const { charts, bests, since } = store.current;
  return { charts, bests, ready: playerIds.every((playerId)  =>  since.has(playerId)), version, syncing, error, sync };
}
