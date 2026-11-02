import { useSyncExternalStore } from 'react';

// The mobile view of the score views (see score_views.css), where the Rivals page's levels and results are side by
//  side, and result rows unroll on a tap instead of opening their links.
export const MOBILE_VIEW = window.matchMedia('(max-width: 600px)');


const onMobileViewChange = (listener: () => void)  => {
  MOBILE_VIEW.addEventListener('change', listener);
  return ()  =>  MOBILE_VIEW.removeEventListener('change', listener);
};


// Whether the mobile view is on, kept up as the window resizes.
export const useMobileView = ()  =>  useSyncExternalStore(onMobileViewChange, ()  =>  MOBILE_VIEW.matches);

export const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
