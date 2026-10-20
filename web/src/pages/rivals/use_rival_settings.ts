import type { MeResponse, PlayerSummary, Rival, RivalsResponse } from '@piu-rivals/shared';
import { useCallback, useMemo, useRef, useState } from 'react';
import { api, errorText } from '../../api.ts';
import { useSession } from '../../session.tsx';
import { parsePreferences, type Preferences } from './preferences.ts';

// The rival list and the Rivals view's settings. Every change shows at once and is saved in the background;
// when a save fails, the error is shown and the page goes back to what the server has.
export interface RivalSettings {
  rivals: Rival[];
  preferences: Preferences;
  error: string | null;
  changePreferences(changes: Partial<Preferences>): void;
  addRival(player: PlayerSummary): void;
  removeRival(playerId: string): void;
  setRivalHidden(playerId: string, hidden: boolean): void;
  // Loads the rival list (with fresh names and PUMBILITY) and settings again, unless a change is being saved.
  refresh(): Promise<void>;
}


export function useRivalSettings(): RivalSettings {
  const { me, updateMe } = useSession();
  const [error, setError] = useState<string | null>(null);
  // Preference changes not sent yet; only one request is on its way at a time, so they arrive in order.
  const unsent = useRef<Partial<Preferences>>({});
  const sending = useRef(false);
  const rivalRequests = useRef(0);
  const preferences = useMemo(() => parsePreferences(me?.preferences  ??  {}), [me?.preferences]);

  const busy = () => sending.current  ||  rivalRequests.current > 0  ||  Object.keys(unsent.current).length > 0;

  const load = useCallback(async () => {
    const fresh = await api<MeResponse>('GET', '/me');
    updateMe(() => fresh);
  }, [updateMe]);

  const refresh = useCallback(async () => {
    if (busy())
      return;

    try {
      const fresh = await api<MeResponse>('GET', '/me');
      // A change made while loading is newer than what came back.
      if (! busy())
        updateMe(() => fresh);
    } catch {
      // A background refresh; the next one tries again.
    }
  }, [updateMe]);

  const failed = useCallback(async (e: unknown) => {
    setError(errorText(e));
    await load().catch(() => {});
  }, [load]);

  const sendPreferences = useCallback(async () => {
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

  const changePreferences = useCallback((changes: Partial<Preferences>) => {
    updateMe((current) => ({ ...current, preferences: { ...current.preferences, ...changes } }));
    Object.assign(unsent.current, changes);
    void sendPreferences();
  }, [updateMe, sendPreferences]);

  // Shows `change` at once, then sends `request`. The server's rival list replaces the shown one only when no
  // other rival change is on its way, since that one may not be in it yet.
  const changeRivals = useCallback(async (change: (rivals: Rival[]) => Rival[], request: () => Promise<RivalsResponse>) => {
    updateMe((current) => ({ ...current, rivals: change(current.rivals) }));
    rivalRequests.current++;
    try {
      const { rivals } = await request();
      if (rivalRequests.current === 1)
        updateMe((current) => ({ ...current, rivals }));

      setError(null);
    } catch (e) {
      await failed(e);
    } finally {
      rivalRequests.current--;
    }
  }, [updateMe, failed]);

  const addRival = useCallback((player: PlayerSummary) => {
    void changeRivals(
      (rivals) => (rivals.some((rival) => rival.id === player.id) ? rivals : [...rivals, { ...player, hidden: false }]),
      () => api<RivalsResponse>('POST', '/me/rivals', { playerId: player.id }),
    );
  }, [changeRivals]);

  const removeRival = useCallback((playerId: string) => {
    void changeRivals(
      (rivals) => rivals.filter((rival) => rival.id !== playerId),
      () => api<RivalsResponse>('DELETE', `/me/rivals/${playerId}`),
    );
  }, [changeRivals]);

  const setRivalHidden = useCallback((playerId: string, hidden: boolean) => {
    void changeRivals(
      (rivals) => rivals.map((rival) => (rival.id === playerId ? { ...rival, hidden } : rival)),
      () => api<RivalsResponse>('PATCH', `/me/rivals/${playerId}`, { hidden }),
    );
  }, [changeRivals]);

  return {
    rivals: me?.rivals  ??  [], preferences, error, changePreferences, addRival, removeRival, setRivalHidden, refresh,
  };
}
