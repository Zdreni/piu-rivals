import { type MouseEvent, useEffect, useRef, useState } from 'react';
import { MOBILE_VIEW } from '../../components/media.ts';

// The panels that wait off the left edge until the levels' top bar slides one in.
export type SidePanel = 'rivals' | 'preferences';


// Whether the rivals or the preferences (`sidePanel`) are slid in, with `toggleSide` for the top bar's buttons and
//  `closeSideOnLevels` for clicks on the levels. `sidePanel` stays as it was while the panel slides out, so it doesn't
//  go blank on the way.
export function useSidePanel() {
  const [sidePanelIsOpen, setSidePanelIsOpen] = useState(false);
  const [sidePanel, setSidePanel] = useState<SidePanel>('rivals');

  // The back button slides a side panel out rather than leaving the page: sliding one in adds a step to the browser's
  //  history, which sliding it out any other way takes back. A maximized card opened over it adds its own step on top
  //  (see ChartCardMaximized), and going back from that one leaves the panel in.
  const sidePanelIsOpenRef = useRef(sidePanelIsOpen);
  sidePanelIsOpenRef.current = sidePanelIsOpen;

  useEffect(()  => {
    if (! sidePanelIsOpen)
      return;

    if (! window.history.state?.sidePanelIsOpen)
      window.history.pushState({ ...window.history.state, sidePanelIsOpen: true }, '');

    const back = ()  =>  ! window.history.state?.sidePanelIsOpen  &&  setSidePanelIsOpen(false);
    window.addEventListener('popstate', back);
    return ()  => {
      window.removeEventListener('popstate', back);
      // A moment later, so a panel slid in again at once (as React's strict mode does) keeps its step.
      window.setTimeout(()  =>  ! sidePanelIsOpenRef.current  &&  window.history.state?.sidePanelIsOpen  &&  window.history.back());
    };
  }, [sidePanelIsOpen]);

  // On phones, while a side panel is in, a tap on the levels (but on their top bar's buttons) slides it out; a tap on a
  //  bar selects its level too.
  const closeSideOnLevels = (event: MouseEvent)  => {
    const target = event.target as Element;
    if (! sidePanelIsOpen  ||  ! MOBILE_VIEW.matches  ||  ! target.closest('.filters')  ||  target.closest('.panel-toggle'))
      return;

    if (! target.closest('.level-bar')) {
      event.preventDefault();
      event.stopPropagation();
    }

    toggleSide(sidePanel);
  };

  // The other panel's button swaps the panels in place.
  const toggleSide = (panel: SidePanel)  => {
    if (sidePanelIsOpen  &&  panel !== sidePanel) {
      setSidePanel(panel);
      return;
    }

    if (sidePanelIsOpen) {
      setSidePanelIsOpen(false);
      return;
    }

    if (panel === sidePanel) {
      setSidePanelIsOpen(true);
      return;
    }

    // The other panel takes the last one's place off the edge first, and slides in from there once it's laid out.
    setSidePanel(panel);
    requestAnimationFrame(()  =>  requestAnimationFrame(()  =>  setSidePanelIsOpen(true)));
  };

  return { sidePanel, sidePanelIsOpen, toggleSide, closeSideOnLevels };
}
