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

  const reload = useCallback(async ()  => {
    try {
      setData(await run());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [run]);

  useEffect(()  => {
    void reload();
  }, [reload]);

  return { data, error, reload };
}


export const formatNumber = (value: number | null | undefined)  =>
  ((value === null  ||  value === undefined)  ?  '—'  :  value.toLocaleString('en-US'));


// With `withoutYear`, the year shows only for times of an earlier year.
export function formatTime(iso: string | null | undefined, options: { withoutYear?: boolean } = {}): string {
  if (! iso)
    return '—';

  const time = new Date(iso);
  if (options.withoutYear  &&  time.getFullYear() === new Date().getFullYear()) {
    return time.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
  }

  return time.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' });
}


// The time between two ISO times: "0m 45s", "12m 03s", "1h 05m 03s"; "—" without both.
export function formatDuration(from: string | null | undefined, to: string | null | undefined): string {
  if (! from  ||  ! to)
    return '—';

  const seconds = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const twoDigits = (n: number)  =>  String(n).padStart(2, '0');
  const rest = `${twoDigits(minutes % 60)}m ${twoDigits(seconds % 60)}s`;
  return (minutes < 60  ?  `${minutes}m ${twoDigits(seconds % 60)}s`  :  `${Math.floor(minutes / 60)}h ${rest}`);
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


export const playerLabel = (player: { id: string; name: string | null })  =>  player.name  ||  player.id;
