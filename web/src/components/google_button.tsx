import { useEffect, useRef, useState } from 'react';
import { errorText } from '../api.ts';
import { config } from '../config.ts';
import { useSession } from '../session.tsx';

// The parts of Google Identity Services (https://accounts.google.com/gsi/client) used here.
interface GoogleIdentity {
  accounts: {
    id: {
      initialize(options: { client_id: string; callback: (response: { credential: string }) => void }): void;
      renderButton(element: HTMLElement, options: Record<string, string | number>): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

let scriptLoad: Promise<GoogleIdentity> | null = null;


function loadGoogleIdentity(): Promise<GoogleIdentity> {
  scriptLoad  ??=  new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => (window.google ? resolve(window.google) : reject(new Error('Google sign-in failed to load')));
    script.onerror = () => {
      scriptLoad = null;
      reject(new Error('Google sign-in failed to load'));
    };

    document.head.appendChild(script);
  });

  return scriptLoad;
}


// Google's "Sign in with Google" button; the ID token it returns is checked by the server.
export function GoogleButton() {
  const { signIn } = useSession();
  const element = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleIdentity().then((google) => {
      if (cancelled  ||  ! element.current)
        return;

      google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: ({ credential }) => {
          setBusy(true);
          setError(null);
          signIn(credential)
            .catch((e) => setError(errorText(e)))
            .finally(() => setBusy(false));
        },
      });

      google.accounts.id.renderButton(element.current, { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill' });
    }, (e) => setError(errorText(e)));

    return () => {
      cancelled = true;
    };
  }, [signIn]);

  return (
    <div className="sign-in">
      <div ref={element} aria-busy={busy} />
      {busy  &&  <p className="muted">Signing in…</p>}
      {error  &&  <p className="error" role="alert">{error}</p>}
    </div>
  );
}
