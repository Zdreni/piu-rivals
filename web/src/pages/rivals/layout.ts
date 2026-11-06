import { type RefObject, useLayoutEffect, useState } from 'react';

// How a tab bar's tabs are laid out: on one line if they fit, otherwise stacked, their words over their counts, and
//  with short words if even that doesn't fit. Whether they fit can only be measured, so the bar is laid out each way
//  for a moment whenever its width or `deps` (its words and counts) change.
export type TabsFit = 'line' | 'stacked' | 'short';

export const tabsClass = (fit: TabsFit)  =>  ({ line: '', stacked: ' stacked', short: ' stacked short-words' })[fit];


export function useTabsFit(bar: RefObject<HTMLElement | null>, deps: unknown[]): TabsFit {
  const [fit, setFit] = useState<TabsFit>('line');

  useLayoutEffect(()  => {
    const element = bar.current;
    if (! element)
      return;

    const overflows = ()  =>  element.scrollWidth > element.clientWidth
      ||  [...element.children].some((tab)  =>  tab.scrollWidth > tab.clientWidth);

    const measure = ()  => {
      const was = element.className;
      element.classList.remove('stacked', 'short-words');
      element.classList.add('measuring');

      let nextFit: TabsFit = 'line';
      if (overflows()) {
        element.classList.add('stacked');
        nextFit = (overflows()  ?  'short'  :  'stacked');
      }

      element.className = was;
      setFit(nextFit);
    };

    // Stacking changes the bar's height only, so only its width is watched.
    let width = -1;
    const observer = new ResizeObserver(()  => {
      if (element.clientWidth !== width) {
        width = element.clientWidth;
        measure();
      }
    });
    measure();
    observer.observe(element);
    return ()  =>  observer.disconnect();
  }, deps);

  return fit;
}
