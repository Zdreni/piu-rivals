import type { SnoozeDays } from '@piu-rivals/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChartCard } from './chart_card.tsx';
import { REDUCED_MOTION, useMobileView } from '../media.ts';
import { type FoldedChartboard, NO_UNFOLDED_RIVALS, type UnfoldedRivalCounts } from '../../data/folded_chartboard.ts';

// A maximized card grows out of its card this long, and shrinks back into it this long, as the page dims and brightens.
const GROW_MS = 260;
const SHRINK_MS = 200;
const BACKDROP_CLEAR = 'rgba(8,12,10,0)';

// Wider than phones, a maximized card keeps this far from the window's top and bottom.
const IN_PLACE_MARGIN_PX = 16;

// The transform that puts a card laid out at `to` over `from`, scaled to its size (from its top left corner, see
//  .card-overlay).
const transformFrom = (from: DOMRect, to: DOMRect)  =>
  `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;

// The clip that shows only the part of a card laid out at `to` that is over `from` (with .card-overlay's corners).
const clipFrom = (from: DOMRect, to: DOMRect)  =>
  `inset(${Math.max(0, from.top - to.top)}px ${Math.max(0, to.right - from.right)}px ${Math.max(0, to.bottom - from.bottom)}px ${Math.max(0, from.left - to.left)}px round 8px)`;

const CLIP_NONE = 'inset(0 round 8px)';

// How many maximized cards are open (see their back button step).
let openCardCount = 0;


// A chart's card maximized over the page: it grows out of its card in the grid (`source`), and shrinks back into it
//  before `onClose` is called. A snooze or a wake closes it too, then calls `onSnooze` (with null days for a wake).
export function ChartCardMaximized({ foldedChartboard, myName, scoreCap, canSnooze, snoozesCheckedAt, source, onClose, onSnooze }: {
  foldedChartboard: FoldedChartboard;
  myName: string;
  scoreCap: number;
  canSnooze: boolean;
  snoozesCheckedAt: number;
  source: () => HTMLElement | null;
  onClose: () => void;
  onSnooze: (days: SnoozeDays | null) => void;
}) {
  const [unrolledRowId, setUnrolledRowId] = useState<string | null>(null);
  const [unfoldedRivalCounts, setUnfoldedRivalCounts] = useState<UnfoldedRivalCounts>(NO_UNFOLDED_RIVALS);
  const inMobileView = useMobileView();
  const overlayRef = useRef<HTMLDivElement>(null);
  // Set while it shrinks back, so it isn't closed twice.
  const shrinking = useRef(false);
  const latestOnClose = useRef(onClose);
  latestOnClose.current = onClose;

  // The maximized card, and where its card in the grid is, which it grows from and shrinks back to: on phones the
  //  whole card, wider only its results' box, as wide as it's drawn, from the header's top down.
  const measureGrowth = ()  => {
    const overlay = overlayRef.current;
    const card = overlay?.firstElementChild as HTMLElement | null | undefined;
    const from = source();
    const box = from?.querySelector('.chart-card-box')?.getBoundingClientRect();
    if (! overlay  ||  ! card  ||  ! from  ||  ! box)
      return null;

    const cardRect = from.getBoundingClientRect();
    return { overlay, card, from: (inMobileView  ?  cardRect  :  new DOMRect(box.left, cardRect.top, box.width, box.bottom - cardRect.top)) };
  };

  useLayoutEffect(()  => {
    const body = overlayRef.current?.querySelector<HTMLElement>('.chart-card-body');
    const myRow = body?.querySelector('.result.mine')?.getBoundingClientRect();
    if (body  &&  myRow)
      body.scrollTop += myRow.top - body.getBoundingClientRect().top - (body.clientHeight - myRow.height) / 2;

    const grow = measureGrowth();
    if (! grow)
      return;

    const { overlay, card, from } = grow;
    if (! inMobileView) {
      overlay.style.setProperty('--card-left', `${from.left}px`);
      overlay.style.setProperty('--card-width', `${from.width}px`);

      const cardTop = Math.min(from.top, window.innerHeight - IN_PLACE_MARGIN_PX - card.offsetHeight);
      overlay.style.setProperty('--card-top', `${Math.max(IN_PLACE_MARGIN_PX, cardTop)}px`);
    }

    if (REDUCED_MOTION.matches)
      return;

    // Wider than phones, where it's over its card, it unrolls out of it; on phones it's faded in from its card, which
    //  stays under it, as it leaves it.
    if (! inMobileView) {
      card.animate([{ clipPath: clipFrom(from, card.getBoundingClientRect()) }, { clipPath: CLIP_NONE }],
        { duration: GROW_MS, easing: 'ease-out' });
    } else {
      card.animate([{ transform: transformFrom(from, card.getBoundingClientRect()) }, { transform: 'none' }],
        { duration: GROW_MS, easing: 'cubic-bezier(.2, .8, .2, 1)' });
      card.animate([{ opacity: 0 }, { opacity: 1, offset: .4 }, { opacity: 1 }], { duration: GROW_MS });
    }

    overlay.animate({ backgroundColor: [BACKDROP_CLEAR, getComputedStyle(overlay).backgroundColor] }, { duration: GROW_MS });

    // Run again (as React does in development), it measures the card where it's laid out, not where it's growing from.
    return ()  =>  [card, overlay].forEach((element)  =>  element.getAnimations().forEach((animation)  =>  animation.cancel()));
  }, []);

  // Marks its results' box with whether there are more results above and below what's scrolled into view, which
  //  fade out at its edges then.
  useEffect(()  => {
    const body = overlayRef.current?.querySelector<HTMLElement>('.chart-card-body');
    if (! body)
      return;

    const markScrollEdges = ()  => {
      body.classList.toggle('more-above', body.scrollTop > 1);
      body.classList.toggle('more-below', body.scrollTop + body.clientHeight < body.scrollHeight - 1);
    };

    markScrollEdges();
    body.addEventListener('scroll', markScrollEdges, { passive: true });

    // Unfolding rivals or unrolling rows changes how much there is to scroll.
    const resizeObserver = new ResizeObserver(markScrollEdges);
    resizeObserver.observe(body);
    if (body.firstElementChild)
      resizeObserver.observe(body.firstElementChild);

    return ()  => {
      body.removeEventListener('scroll', markScrollEdges);
      resizeObserver.disconnect();
    };
  }, []);

  // Shrinks it back into its card, then closes it and calls `then`.
  const close = useRef((then?: () => void)  =>  {});
  close.current = (then?: () => void)  => {
    if (shrinking.current)
      return;

    const finish = ()  => {
      shrinking.current = false;
      onClose();
      then?.();
    };

    const grow = (REDUCED_MOTION.matches  ?  null  :  measureGrowth());
    if (! grow) {
      finish();
      return;
    }

    shrinking.current = true;

    const { overlay, card, from } = grow;
    // Measured where it's laid out, even if it's still growing.
    card.getAnimations().forEach((animation)  =>  animation.cancel());
    overlay.getAnimations().forEach((animation)  =>  animation.cancel());

    // Wider than phones it rolls back up into its card.
    const to = card.getBoundingClientRect();
    card.animate((inMobileView  ?  [{ transform: 'none' }, { transform: transformFrom(from, to) }]  :  [{ clipPath: CLIP_NONE }, { clipPath: clipFrom(from, to) }]),
      { duration: SHRINK_MS, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'forwards' });
    // Faded out into its card once it's nearly there.
    card.animate([{ opacity: 1 }, { opacity: 1, offset: .3 }, { opacity: 0 }], { duration: SHRINK_MS, fill: 'forwards' });
    overlay.animate({ backgroundColor: [getComputedStyle(overlay).backgroundColor, BACKDROP_CLEAR] }, { duration: SHRINK_MS, fill: 'forwards' })
      .finished.then(finish, finish);
  };

  useEffect(()  => {
    const escape = (event: KeyboardEvent)  =>  event.key === 'Escape'  &&  close.current();
    const resize = ()  =>  latestOnClose.current();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    window.addEventListener('keydown', escape);
    window.addEventListener('resize', resize);
    return ()  => {
      root.style.overflow = overflow;
      window.removeEventListener('keydown', escape);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // The back button (on phones, mostly) closes it rather than leaving the page: opening it adds a step to the
  //  browser's history, which closing it any other way takes back.
  useEffect(()  => {
    openCardCount++;
    if (! window.history.state?.maximized)
      window.history.pushState({ ...window.history.state, maximized: true }, '');

    const back = ()  =>  close.current();
    window.addEventListener('popstate', back);
    return ()  => {
      openCardCount--;
      window.removeEventListener('popstate', back);
      // A moment later, so a card opened again at once (as React's strict mode does) keeps its step.
      window.setTimeout(()  =>  openCardCount === 0  &&  window.history.state?.maximized  &&  window.history.back());
    };
  }, []);

  // Out of the panels, which slide by transforms and so would hold a fixed overlay inside them.
  return createPortal(
    <div className={`rivals card-overlay${(inMobileView  ?  ''  :  ' in-place')}`} ref={overlayRef} role="dialog" aria-modal="true" aria-label={foldedChartboard.chartboard.trackTitle}
      onClick={(event)  =>  event.target === event.currentTarget  &&  close.current()}>
      <ChartCard
        foldedChartboard={foldedChartboard}
        myName={myName}
        unfoldedRivalCounts={unfoldedRivalCounts}
        onShow={setUnfoldedRivalCounts}
        scoreCap={scoreCap}
        canSnooze={canSnooze}
        snoozesCheckedAt={snoozesCheckedAt}
        menuIsOpen={false}
        leaving={false}
        maximized
        unrolledRowId={unrolledRowId}
        onUnroll={setUnrolledRowId}
        onMenu={()  =>  {}}
        onSnooze={(days)  =>  close.current(()  =>  onSnooze(days))}
        onWake={()  =>  close.current(()  =>  onSnooze(null))}
        onClose={()  =>  close.current()}
      />
    </div>,
    document.body,
  );
}
