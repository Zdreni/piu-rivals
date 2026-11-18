import type { Chart, ChartsResponse } from '@piu-rivals/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorText } from '../api.ts';
import { openBestsCache } from './bests_cache.ts';

export interface KnownCharts {
  charts: Map<number, Chart>;
  // The charts were downloaded once on this page.
  ready: boolean;
  // Grows whenever `charts` changed; it's changed in place.
  version: number;
  error: string | null;
  // Downloads the charts added since the last sync.
  sync(): Promise<void>;
}


// Every chart a registered player has a score on: first from the cache, then only those added since. A short title
//  changed later comes with `/bests` (see useBests), which caches it in the same store; on this page it shows from
//  the next visit.
export function useKnownCharts(): KnownCharts {
  const charts = useRef(new Map<number, Chart>());
  const lastKnownChartId = useRef<number | null>(null);
  const cacheWasRead = useRef(false);
  const runningSync = useRef<Promise<void> | null>(null);
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncOnce = async ()  => {
    const cache = await openBestsCache();
    if (! cacheWasRead.current) {
      cacheWasRead.current = true;

      const cachedCharts = await cache.loadCharts();
      for (const chart of cachedCharts.charts)
        charts.current.set(chart.id, chart);

      lastKnownChartId.current = cachedCharts.lastKnownChartId;
      setVersion((v)  =>  v + 1);
    }

    const query = (lastKnownChartId.current === null  ?  ''  :  `?afterId=${lastKnownChartId.current}`);
    const response = await api<ChartsResponse>('GET', `/charts${query}`);
    for (const chart of response.charts)
      charts.current.set(chart.id, chart);

    lastKnownChartId.current = Math.max(lastKnownChartId.current  ??  0, ...response.charts.map((c)  =>  c.id));
    await cache.saveKnownCharts({ charts: response.charts, lastKnownChartId: lastKnownChartId.current })
      .catch((e)  =>  console.warn('[piu-rivals] Unable to cache charts:', e));

    setReady(true);
    if (response.charts.length)
      setVersion((v)  =>  v + 1);
  };

  // One sync at a time; one asked for meanwhile is the same one.
  const sync = useCallback(async ()  => {
    runningSync.current  ??=  syncOnce()
      .then(()  =>  setError(null), (e)  =>  setError(errorText(e)))
      .finally(()  => {
        runningSync.current = null;
      });

    return runningSync.current;
  }, []);

  useEffect(()  => {
    void sync();
  }, [sync]);

  return { charts: charts.current, ready, version, error, sync };
}
