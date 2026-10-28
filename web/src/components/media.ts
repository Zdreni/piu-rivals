import { useSyncExternalStore } from 'react';

// The phone layout of the score views (see score_views.css), where the Rivals page's levels and results are side by
// side, and result rows unroll on a tap instead of opening their links.
export const PHONE = window.matchMedia('(max-width: 600px)');


const onPhoneChange = (listener: () => void)  => {
  PHONE.addEventListener('change', listener);
  return ()  =>  PHONE.removeEventListener('change', listener);
};


// Whether the phone layout is on, kept up as the window resizes.
export const usePhone = ()  =>  useSyncExternalStore(onPhoneChange, ()  =>  PHONE.matches);

export const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
