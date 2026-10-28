import type {
  ChartPreference, ChartPreferencesResponse, MeResponse, PlayerSummary, Rival, RivalsResponse, SnoozeDays,
} from '@piu-rivals/shared';
import { useCallback, useMemo, useRef, useState } from 'react';
import { api, errorText } from '../api.ts';
import { useSession } from '../session.tsx';
import { parsePreferences, type Preferences } from './preferences.ts';

// How long a snooze lasts, as the server works it out; shown until the server's time comes back.
const snoozeMs = (days: SnoozeDays)  =>  ((days - 1) * 24 + 12) * 3600_000;


// The rival list, the Rivals view's settings and the snoozed charts. Every change shows at once and is saved in the
// background; when a save fails, the error is shown and the page goes back to what the server has.
export interface RivalSettings {
  rivals: Rival[];
  preferences: Preferences;
  error: string | null;
  changePreferences(changes: Partial<Preferences>): void;
  addRival(player: PlayerSummary): void;
  removeRival(playerId: string): void;
  setRivalHidden(playerId: string, hidden: boolean): void;
  // When each snoozed chart wakes, in ms since epoch, by chart id; a snooze may have expired since.
  snoozes: Map<number, number>;
  // Snoozes the chart for that many days from now, or wakes it (null).
  snooze(chartId: number, days: SnoozeDays | null): void;
  // Loads the rival list (with fresh names and PUMBILITY) and settings again, unless a change is being saved.
  refresh(): Promise<void>;
}


// `onServerRivals` is given each rival list that comes from the server and replaces the shown one: after a change, a
// refresh or a failed save.
export function useRivalSettings(onServerRivals?: (rivals: Rival[]) => void): RivalSettings {
  const { me, updateMe } = useSession();
  const [error, setError] = useState<string | null>(null);
  const serverRivalsListener = useRef(onServerRivals);
  serverRivalsListener.current = onServerRivals;
  // Preference changes not sent yet; only one request is on its way at a time, so they arrive in order.
  const unsent = useRef<Partial<Preferences>>({});
  const sending = useRef(false);
  const rivalRequests = useRef(0);
  const chartRequests = useRef(0);
  const preferences = useMemo(()  =>  parsePreferences(me?.preferences  ??  {}), [me?.preferences]);
  const chartPreferences = me?.chartPreferences;
  const snoozes = useMemo(()  =>  new Map((chartPreferences  ??  []).flatMap(({ chartId, snoozedUntil })  =>
    (snoozedUntil  ?  [[chartId, Date.parse(snoozedUntil)] as const]  :  []))), [chartPreferences]);

  const busy = ()  =>  sending.current  ||  rivalRequests.current > 0  ||  chartRequests.current > 0  ||  Object.keys(unsent.current).length > 0;

  const load = useCallback(async ()  => {
    const fresh = await api<MeResponse>('GET', '/me');
    updateMe(()  =>  fresh);
    serverRivalsListener.current?.(fresh.rivals);
  }, [updateMe]);

  const refresh = useCallback(async ()  => {
    if (busy())
      return;

    try {
      const fresh = await api<MeResponse>('GET', '/me');
      // A change made while loading is newer than what came back.
      if (! busy()) {
        updateMe(()  =>  fresh);
        serverRivalsListener.current?.(fresh.rivals);
      }
    } catch {
      // A background refresh; the next one tries again.
    }
  }, [updateMe]);

  const failed = useCallback(async (e: unknown)  => {
    setError(errorText(e));
    await load().catch(()  =>  {});
  }, [load]);

  const sendPreferences = useCallback(async ()  => {
    if (sending.current  ||  ! Object.keys(unsent.current).length)
      return;

    const changes = unsent.current;
    unsent.current = {};
    sending.current = true;
    try {
      await api('PATCH', '/me/preferences', { changes });
      setError(null);
    } catch (e) {
      unsent.current = {};
      await failed(e);
    } finally {
      sending.current = false;
    }

    await sendPreferences();
  }, [failed]);

  const changePreferences = useCallback((changes: Partial<Preferences>)  => {
    updateMe((current)  =>  ({ ...current, preferences: { ...current.preferences, ...changes } }));
    Object.assign(unsent.current, changes);
    void sendPreferences();
  }, [updateMe, sendPreferences]);

  // Shows `change` at once, then sends `request`. The server's rival list replaces the shown one only when no
  // other rival change is on its way, since that one may not be in it yet.
  const changeRivals = useCallback(async (change: (rivals: Rival[]) => Rival[], request: () => Promise<RivalsResponse>)  => {
    updateMe((current)  =>  ({ ...current, rivals: change(current.rivals) }));
    rivalRequests.current++;
    try {
      const { rivals } = await request();
      if (rivalRequests.current === 1) {
        updateMe((current)  =>  ({ ...current, rivals }));
        serverRivalsListener.current?.(rivals);
      }

      setError(null);
    } catch (e) {
      await failed(e);
    } finally {
      rivalRequests.current--;
    }
  }, [updateMe, failed]);

  const addRival = useCallback((player: PlayerSummary)  => {
    void changeRivals(
      (rivals)  =>  (rivals.some((r)  =>  r.id === player.id)  ?  rivals  :  [...rivals, { ...player, hidden: false }]),
      ()  =>  api<RivalsResponse>('POST', '/me/rivals', { playerId: player.id }),
    );
  }, [changeRivals]);

  const removeRival = useCallback((playerId: string)  => {
    void changeRivals(
      (rivals)  =>  rivals.filter((r)  =>  r.id !== playerId),
      ()  =>  api<RivalsResponse>('DELETE', `/me/rivals/${playerId}`),
    );
  }, [changeRivals]);

  const setRivalHidden = useCallback((playerId: string, hidden: boolean)  => {
    void changeRivals(
      (rivals)  =>  rivals.map((r)  =>  (r.id === playerId  ?  { ...r, hidden }  :  r)),
      ()  =>  api<RivalsResponse>('PATCH', `/me/rivals/${playerId}`, { hidden }),
    );
  }, [changeRivals]);

  // Like a rival change: shown at once, and the server's list replaces it only when no other chart change is on its way.
  const sendSnooze = useCallback(async (chartId: number, days: SnoozeDays | null)  => {
    const change = (prefs: ChartPreference[])  => {
      const rest = prefs.filter((pref)  =>  pref.chartId !== chartId);
      return (days === null  ?  rest  :  [...rest, { chartId, snoozedUntil: new Date(Date.now() + snoozeMs(days)).toISOString() }]);
    };

    updateMe((current)  =>  ({ ...current, chartPreferences: change(current.chartPreferences  ??  []) }));
    chartRequests.current++;
    try {
      const { chartPreferences } = await api<ChartPreferencesResponse>('PATCH', `/me/chart-preferences/${chartId}`, { snoozeDays: days });
      if (chartRequests.current === 1)
        updateMe((current)  =>  ({ ...current, chartPreferences }));

      setError(null);
    } catch (e) {
      await failed(e);
    } finally {
      chartRequests.current--;
    }
  }, [updateMe, failed]);

  const snooze = useCallback((chartId: number, days: SnoozeDays | null)  =>  void sendSnooze(chartId, days), [sendSnooze]);

  return {
    rivals: me?.rivals  ??  [], preferences, error, changePreferences, addRival, removeRival, setRivalHidden, refresh, snoozes, snooze,
  };
}
