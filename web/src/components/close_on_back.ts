import { useEffect } from 'react';

// How many overlays are open (see useCloseOnBack).
let openOverlayCount = 0;


// The back button (on phones, mostly) closes an overlay rather than leaving the page: opening it adds a step to the
//  browser's history, which closing it any other way takes back.
export function useCloseOnBack(close: { current: () => void }) {
  useEffect(()  => {
    openOverlayCount++;
    if (! window.history.state?.maximized)
      window.history.pushState({ ...window.history.state, maximized: true }, '');

    const back = ()  =>  close.current();
    window.addEventListener('popstate', back);
    return ()  => {
      openOverlayCount--;
      window.removeEventListener('popstate', back);
      // A moment later, so an overlay opened again at once (as React's strict mode does) keeps its step.
      window.setTimeout(()  =>  openOverlayCount === 0  &&  window.history.state?.maximized  &&  window.history.back());
    };
  }, []);
}
