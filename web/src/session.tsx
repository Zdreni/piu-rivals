import type { LoginResponse, MeResponse } from '@piu-rivals/shared';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, SIGNED_OUT_EVENT, storedToken, storeToken } from './api.ts';

interface Session {
  status: 'loading' | 'signed-out' | 'signed-in';
  me: MeResponse | null;
  signIn(idToken: string): Promise<void>;
  signOut(): Promise<void>;
  reload(): Promise<void>;
}

const SessionContext = createContext<Session | null>(null);


export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<Session['status']>(storedToken() ? 'loading' : 'signed-out');

  const reload = useCallback(async () => {
    if (! storedToken()) {
      setMe(null);
      setStatus('signed-out');
      return;
    }

    try {
      setMe(await api<MeResponse>('GET', '/me'));
      setStatus('signed-in');
    } catch {
      // A refused session is cleared by api(); an unreachable server keeps it for the next try.
      setMe(null);
      setStatus('signed-out');
    }
  }, []);

  const signIn = useCallback(async (idToken: string) => {
    const login = await api<LoginResponse>('POST', '/auth/google', { idToken });
    storeToken(login.token);
    await reload();
  }, [reload]);

  const signOut = useCallback(async () => {
    await api('POST', '/auth/logout').catch(() => {});
    storeToken(null);
    setMe(null);
    setStatus('signed-out');
  }, []);

  useEffect(() => {
    void reload();

    const onSignedOut = () => {
      setMe(null);
      setStatus('signed-out');
    };

    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, [reload]);

  return (
    <SessionContext.Provider value={{ status, me, signIn, signOut, reload }}>
      {children}
    </SessionContext.Provider>
  );
}


export function useSession(): Session {
  const session = useContext(SessionContext);
  if (! session)
    throw new Error('useSession() outside SessionProvider');

  return session;
}
