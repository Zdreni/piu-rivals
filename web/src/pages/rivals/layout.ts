import { type RefObject, useLayoutEffect, useState } from 'react';

// The panels that wait off the left edge until the levels' top bar slides one in.
export type SidePanel = 'rivals' | 'preferences';


// How a tab bar's tabs are laid out: on one line as on wide screens, if they fit, each in the room it gets there;
// otherwise stacked as on phones, their words over their counts (see .stacked in tabs.css), and with their short
// words if even then they don't fit (.short-words). They are measured laid out each way for a moment, whenever the
// bar's width or `deps` (its words and counts) change.
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
