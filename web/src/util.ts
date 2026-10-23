import { type DependencyList, useCallback, useEffect, useState } from 'react';
import { errorText } from './api.ts';

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  reload(): Promise<void>;
}


// Loads data when `deps` change; reload() loads it again, keeping the old data meanwhile.
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(load, deps);

  const reload = useCallback(async () => {
    try {
      setData(await run());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [run]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, reload };
}


export const formatNumber = (value: number | null | undefined) =>
  (value === null  ||  value === undefined ? '—' : value.toLocaleString('en-US'));


export function formatTime(iso: string | null | undefined): string {
  if (! iso)
    return '—';

  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' });
}


// "3 min ago", "2 h ago", or the date for older times.
export function formatAgo(iso: string | null | undefined): string {
  if (! iso)
    return 'never';

  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1)
    return 'just now';

  if (minutes < 60)
    return `${minutes} min ago`;

  if (minutes < 48 * 60)
    return `${Math.round(minutes / 60)} h ago`;

  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}


export const playerLabel = (player: { id: string; name: string | null }) => player.name  ||  player.id;
