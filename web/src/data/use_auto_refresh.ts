import { useEffect, useRef } from 'react';

// While the page is visible, scores and the rival list are loaded again every few minutes, and when the page
// comes back into view after a while.
const REFRESH_MS = 5 * 60 * 1000;
const RETURN_REFRESH_MS = 60 * 1000;


export function useAutoRefresh(refresh: () => void) {
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(()  => {
    let last = Date.now();

    const run = ()  => {
      last = Date.now();
      latest.current();
    };

    const timer = setInterval(()  => {
      if (document.visibilityState === 'visible')
        run();
    }, REFRESH_MS);

    const onVisibility = ()  => {
      if (document.visibilityState === 'visible'  &&  Date.now() - last > RETURN_REFRESH_MS)
        run();
    };

    document.addEventListener('visibilitychange', onVisibility);
    return ()  => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
