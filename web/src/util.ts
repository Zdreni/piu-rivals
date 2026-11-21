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


const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;


// "5 minutes ago", "3 hours ago", "4 days ago", "2 weeks ago", "5 months ago", "3 years ago", each unit used up to a
//  limit of its count (120 minutes, 48 hours, 14 days, 9 weeks, 24 months).
// A date without a time ("2026-10-01") is a local day, so it says "today" instead of minutes or hours.
export function formatTimeAgo(iso: string): string {
  if (DATE_ONLY.test(iso)) {
    // Date.parse reads a date alone as UTC midnight, so today's local date is compared at UTC midnight too.
    const now = new Date();
    const days = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.parse(iso)) / DAY_MS);
    return (days < 1  ?  'today'  :  daysAgo(days));
  }

  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / MINUTE_MS));
  if (minutes < 1)
    return 'just now';

  if (minutes < 120)
    return unitAgo(minutes, 'minute');

  if (minutes < 48 * 60)
    return unitAgo(Math.floor(minutes / 60), 'hour');

  return daysAgo(Math.floor(minutes / (24 * 60)));
}


const unitAgo = (count: number, unit: string)  =>  `${count} ${unit}${(count === 1  ?  ''  :  's')} ago`;


function daysAgo(days: number): string {
  if (days < 14)
    return unitAgo(days, 'day');

  if (days < 9 * 7)
    return unitAgo(Math.floor(days / 7), 'week');

  const months = Math.floor(days / 30.4375);
  if (months < 24)
    return unitAgo(months, 'month');

  return unitAgo(Math.floor(days / 365.25), 'year');
}


export const playerLabel = (player: { id: string; name: string | null })  =>  player.name  ||  player.id;
