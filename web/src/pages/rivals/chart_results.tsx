import type { SnoozeDays } from '@piu-rivals/shared';
import { Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { ChartResultsItem, type Keep } from './chart_results_item.tsx';
import { PHONE, tabsClass, useTabsFit } from './layout.ts';
import { byLeadWeight, byTargetWeight, type ChartRow } from './model.ts';
import type { CountBy } from './preferences.ts';
import { chartTier, resultCounts, type Stat, STAT_WORDS, TABS, type TabId, TIER_STAT } from './stats.ts';

export interface HiddenGroup {
  label: string;
  charts: ChartRow[];
}


const capitalized = (word: string) => word[0]!.toUpperCase() + word.slice(1);
// Tab words on phones.
const SHORT_WORDS: Record<string, string> = { 'non-matched': 'NP', 'not played': 'NP', inferior: 'Inf', superior: 'Sup', hidden: 'Hid' };

// Cards list this many rival scores, besides yours, until expanded: unplayed ones the lowest, lost and hidden ones
// the biggest losses, won ones the closest below yours. Phones keep fewer.
const keeps = (rivals: number) => ({
  unplayed: { top: 0, bottom: rivals } as Keep,
  lost: { top: rivals, bottom: 1 } as Keep,
  won: { top: 1 + rivals, bottom: 0 } as Keep,
});
const KEEP_DESKTOP = keeps(6);
const KEEP_PHONE = keeps(4);
const onPhoneChange = (listener: () => void) => {
  PHONE.addEventListener('change', listener);
  return () => PHONE.removeEventListener('change', listener);
};

type Keeps = ReturnType<typeof keeps>;

const usePhone = () => useSyncExternalStore(onPhoneChange, () => PHONE.matches);

// How many rival scores cards keep listed, by result, on this screen.
export const useKeeps = () => (usePhone() ? KEEP_PHONE : KEEP_DESKTOP);

export interface Folding {
  fold: Stat[];
  colorByRealDiff: boolean;
  keep: Keep | null;
  dimWon: boolean;
}

// How a card of the tab's charts folds its scores. Lost charts fold the rivals you beat or truly tie with; tied ones
// only those you beat. Lost, unplayed and won ones also fold the scores between the kept ones. Hidden ones fold like
// lost ones, with diffs coloured by the real scores, so capped ties show as losses. Only won charts don't dim the
// rivals you beat, since they are their point.
export const tabFolding = (tab: TabId, keep: Keeps): Folding => (tab === 'hidden'
  ? { fold: ['win', 'tie'], colorByRealDiff: true, keep: keep.lost, dimWon: true }
  : {
    fold: tab === 'rivals-win' ? ['win', 'tie'] : tab === 'tie' ? ['win'] : [],
    colorByRealDiff: false,
    keep: { 'not-played': keep.unplayed, 'rivals-win': keep.lost, 'you-win': keep.won, tie: null }[tab],
    dimWon: tab !== 'you-win',
  });
// A maximized card lists this many of the rivals who beat you, the highest ones, and of the rivals you beat, the closest
// ones; unplayed, it lists as many of the lowest scores as both.
const MAXIMIZED_ABOVE = 10;
const MAXIMIZED_BELOW = 2;
// Each click on a fold button lists this many more of its scores.
const SHOW_STEP = 10;

// A card snoozed or woken fades out this long, then the cards and group titles after it move into its place.
const LEAVE_MS = 200;
const MOVE_MS = 300;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
// A maximized card grows out of its card this long, and shrinks back into it this long, as the page dims and brightens.
const GROW_MS = 260;
const SHRINK_MS = 200;
const BACKDROP_CLEAR = 'rgba(8,12,10,0)';

// Wider than phones, a maximized card keeps this far from the window's top and bottom.
const IN_PLACE_MARGIN_PX = 16;

// The transform that puts a card laid out at `to` over `from`, scaled to its size (from its top left corner, see
// .card-overlay).
const transformFrom = (from: DOMRect, to: DOMRect) =>
  `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;

// Where each card and group title in `container` is, by its data-flip key.
const flipRects = (container: HTMLElement | null) =>
  new Map([...container?.querySelectorAll<HTMLElement>('[data-flip]')  ??  []].map((el) => [el.dataset.flip!, el.getBoundingClientRect()]));

const byRivalCount = (a: ChartRow, b: ChartRow) => b.rivals.length - a.rivals.length  ||  a.track.localeCompare(b.track);


// The results column: tabs splitting the charts of the selected level, and a grid of their cards.
// `levelCharts` are the charts of the selected level, each in the tab of its tier by `countBy`. `hiddenGroups` are
// its charts in the "Hidden" tab, which lists them group by group. `emptyMessage` replaces the per-tab message when
// there is nothing to show at all. Counted by results, the tabs show the level's result counts instead of their
// chart counts. `ties` (the solo view) adds a "Tied" tab and colours the true ties. `scoreCap` is named in the
// tooltip of diffs that the cap turns into ties. The "Snooze..." button in a card's unrolled header opens a menu of
// lengths, and dims the card; a length snoozes its chart with `onSnooze`, and a click anywhere else only closes it.
// Wake calls `onSnooze` at once. Either way the card fades out first, and the others move into its place. `now` counts down
// the time snoozed charts have left.
// A click on a card maximizes it, so its header doesn't unroll here, nor its Snooze... menu open: it opens over the
// page, as wide as the screen on phones and centred on wider ones, with more of its rivals' scores (see MAXIMIZED_ABOVE)
// and their diffs, its header unrolled and the snooze lengths in a row. A click outside it, its close button or Escape closes it;
// a snooze or a wake closes it too, and the card behind fades out; so does a resize, at once. It grows out of its card
// in the grid, and shrinks back into it; wider than phones, it keeps its card's width and place, and only gets longer. The tab a snoozed or woken chart goes into splashes once it's there.
export function ChartResults({
  levelCharts, hiddenGroups, selectedTab, myName, emptyMessage, countBy, ties, scoreCap, now, onSelectTab, onSnooze,
}: {
  levelCharts: ChartRow[];
  hiddenGroups: HiddenGroup[];
  selectedTab: TabId;
  myName: string;
  emptyMessage: string | null;
  countBy: CountBy;
  ties: boolean;
  scoreCap: number;
  now: number;
  onSelectTab: (tab: TabId) => void;
  onSnooze: (chartId: number, days: SnoozeDays | null) => void;
}) {
  // By chart, how many of its folded rivals, and of its scores above the lowest ones, were shown.
  const [shownFolded, setShownFolded] = useState<Map<number, number>>(new Map());
  const [shownHigher, setShownHigher] = useState<Map<number, number>>(new Map());
  // The one result row or card header unrolled, as `${chart id} ${player id}` (or "me" for yours, "head" for the header).
  const [unrolled, setUnrolled] = useState<string | null>(null);
  // The chart whose snooze menu is open. Another level starts without it.
  const [menu, setMenu] = useState<number | null>(null);
  // The card fading out before its chart is snoozed or woken.
  const [leaving, setLeaving] = useState<number | null>(null);
  // The tab a chart just went into, snoozed or woken, which splashes (see .tab-flash); `n` restarts the splash.
  const [flash, setFlash] = useState<{ tab: TabId; n: number } | null>(null);
  // The chart whose card is maximized, and what's unrolled and shown in it, kept apart from its card in
  // the grid and cleared each time it opens: the row unrolled, and how many of its folded and higher scores were shown.
  const [maximized, setMaximized] = useState<number | null>(null);
  const [bigUnrolled, setBigUnrolled] = useState<string | null>(null);
  const [bigShown, setBigShown] = useState({ folded: 0, higher: 0 });
  const phone = usePhone();
  const overlayRef = useRef<HTMLDivElement>(null);
  // Set while the maximized card shrinks back, so it isn't closed twice.
  const shrinking = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Where the cards and group titles were before a card left, so they move from there into their new places.
  const movedFrom = useRef<Map<string, DOMRect> | null>(null);

  useLayoutEffect(() => {
    const from = movedFrom.current;
    if (! from)
      return;

    movedFrom.current = null;
    for (const el of bodyRef.current?.querySelectorAll<HTMLElement>('[data-flip]')  ??  []) {
      const old = from.get(el.dataset.flip!);
      if (! old)
        continue;

      const now = el.getBoundingClientRect();
      const dx = old.left - now.left, dy = old.top - now.top;
      if (dx  ||  dy)
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: MOVE_MS, easing: 'ease' });
    }
  });

  // Snoozes (days) or wakes (null) the chart once its card has faded out; the header rolls back and the snooze menu
  // closes with it, so the length picked stays lit while the card fades.
  const leave = (chartId: number, days: SnoozeDays | null) => {
    const send = () => {
      if (! REDUCED_MOTION.matches)
        movedFrom.current = flipRects(bodyRef.current);

      setLeaving(null);
      setUnrolled(null);
      setMenu(null);
      onSnooze(chartId, days);
      // A woken chart goes into the tab of its scores.
      const chart = [...levelCharts, ...hiddenGroups.flatMap(({ charts }) => charts)].find(({ id }) => id === chartId);
      const into = days !== null ? 'hidden' : chart  &&  chartTier({ ...chart, snoozedUntil: null }, ties);
      if (into)
        setFlash((last) => ({ tab: into, n: (last?.n  ??  0) + 1 }));
    };

    if (REDUCED_MOTION.matches) {
      send();
      return;
    }

    setLeaving(chartId);
    window.setTimeout(send, LEAVE_MS);
  };

  // While a snooze menu is open, a click anywhere but in it, or on its button, does nothing else than close it: it's
  // caught on the window, before the page sees it. Escape closes it too.
  useEffect(() => {
    if (menu === null)
      return;

    const close = (event: globalThis.MouseEvent) => {
      if ((event.target as Element).closest?.('.snooze-menu, .snooze-toggle'))
        return;

      event.preventDefault();
      event.stopPropagation();
      setMenu(null);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape'  &&  setMenu(null);

    window.addEventListener('click', close, true);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('click', close, true);
      window.removeEventListener('keydown', escape);
    };
  }, [menu]);

  // While a card is maximized, the page behind it doesn't scroll, and Escape closes it.
  useEffect(() => {
    if (maximized === null)
      return;

    const escape = (event: KeyboardEvent) => event.key === 'Escape'  &&  closeMaximized.current();
    // Its place is its card's, measured once.
    const resize = () => setMaximized(null);
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    window.addEventListener('keydown', escape);
    window.addEventListener('resize', resize);
    return () => {
      root.style.overflow = overflow;
      window.removeEventListener('keydown', escape);
      window.removeEventListener('resize', resize);
    };
  }, [maximized]);

  // The back button (on phones, mostly) closes a maximized card rather than leaving the page: opening it adds a step
  // to the browser's history, which closing it any other way takes back.
  const open = maximized !== null;
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (! open)
      return;

    if (! window.history.state?.maximized)
      window.history.pushState({ ...window.history.state, maximized: true }, '');
    const back = () => closeMaximized.current();
    window.addEventListener('popstate', back);
    return () => {
      window.removeEventListener('popstate', back);
      // A moment later, so a card opened again at once (as React's strict mode does) keeps its step.
      window.setTimeout(() => ! openRef.current  &&  window.history.state?.maximized  &&  window.history.back());
    };
  }, [open]);

  const keep = useKeeps();
  const showMore = (shown: Map<number, number>, chartId: number) =>
    new Map(shown).set(chartId, (shown.get(chartId)  ??  0) + SHOW_STEP);
  const groups = hiddenGroups.filter(({ charts }) => charts.length);
  const tabCounts = Object.fromEntries(TABS.map((id) => [
    id, id === 'hidden'
      ? groups.reduce((acc, { charts }) => acc + charts.length, 0)
      : levelCharts.filter((chart) => chartTier(chart, ties) === id).length,
  ])) as Record<TabId, number>;

  // The "Hidden" tab only shows up when there is something hidden, and "Tied" only in the solo view;
  // if a missing one was open, "Lost" takes over.
  const tabs = TABS.filter((id) => (id !== 'hidden'  ||  tabCounts.hidden)  &&  (id !== 'tie'  ||  ties));
  const tabGone = ! tabs.includes(selectedTab);
  const tab = tabGone ? 'rivals-win' : selectedTab;

  useEffect(() => {
    if (tabGone)
      onSelectTab('rivals-win');
  }, [tabGone, onSelectTab]);

  const results = countBy === 'results' ? resultCounts(levelCharts) : null;
  const tabNumber = (id: TabId) => (results ? results[TIER_STAT[id]] : tabCounts[id]);
  const tabBar = useRef<HTMLDivElement>(null);
  const tabsFit = useTabsFit(tabBar, [tabs.map((id) => `${id} ${tabNumber(id)}`).join()]);
  // Tabs are named after what their numbers count.
  const tabWord = (id: TabId) => STAT_WORDS[countBy][TIER_STAT[id]];

  // The charts listed in the open tab, with how their cards fold, so the maximized one is found among them.
  const listed: [ChartRow, Folding][] = [];
  // Rivals whose result is one of `fold`, or between the scores kept by `keep`, are folded; each click on their
  // button shows SHOW_STEP more. A maximized card folds the rivals you beat (and, but in the solo view, tie with) past
  // the closest MAXIMIZED_BELOW, and those who beat you past the highest MAXIMIZED_ABOVE.
  const card = (chart: ChartRow, { fold, colorByRealDiff, keep, dimWon }: Folding, big = false) => {
    const unrolledHere = big ? bigUnrolled : unrolled?.startsWith(`${chart.id} `) ? unrolled.slice(`${chart.id} `.length) : null;
    return (
      <ChartResultsItem
        key={chart.id}
        chart={chart}
        myName={myName}
        fold={! big ? fold : ties ? ['win'] : ['win', 'tie']}
        foldedShown={big ? MAXIMIZED_BELOW + bigShown.folded : shownFolded.get(chart.id)  ??  0}
        keep={! big ? keep : chart.mine === null ? { top: 0, bottom: MAXIMIZED_ABOVE + MAXIMIZED_BELOW } : { top: MAXIMIZED_ABOVE, bottom: 1 }}
        higherShown={big ? bigShown.higher : shownHigher.get(chart.id)  ??  0}
        colorByRealDiff={colorByRealDiff}
        dimWon={dimWon}
        markTies={ties}
        scoreCap={scoreCap}
        now={now}
        onExpandFolded={() => (big ? setBigShown({ ...bigShown, folded: bigShown.folded + SHOW_STEP })
          : setShownFolded(showMore(shownFolded, chart.id)))}
        onExpandHigher={() => (big ? setBigShown({ ...bigShown, higher: bigShown.higher + SHOW_STEP })
          : setShownHigher(showMore(shownHigher, chart.id)))}
        unrolled={unrolledHere}
        onUnroll={(playerId) => (big ? setBigUnrolled(playerId) : setUnrolled(playerId === null ? null : `${chart.id} ${playerId}`))}
        // Charts in the "Hidden" tab are hidden already.
        canSnooze={tab !== 'hidden'}
        menuOpen={! big  &&  menu === chart.id}
        onMenu={() => setMenu(menu === chart.id ? null : chart.id)}
        onSnooze={(days) => (big ? closeMaximized.current(() => leave(chart.id, days)) : leave(chart.id, days))}
        // A wake needs no undo: the card goes back to its tab at once.
        leaving={! big  &&  leaving === chart.id}
        onWake={() => (big ? closeMaximized.current(() => leave(chart.id, null)) : leave(chart.id, null))}
        maximized={big}
        onMaximize={! big ? () => {
          setMenu(null);
          setBigUnrolled(null);
          setBigShown({ folded: 0, higher: 0 });
          setMaximized(chart.id);
        } : undefined}
        onClose={() => closeMaximized.current()}
      />
    );
  };
  const cards = (charts: ChartRow[], folding: Folding) => charts.map((chart) => {
    listed.push([chart, folding]);
    return card(chart, folding);
  });

  let body;
  if (tabCounts[tab] === 0) {
    body = <div className="empty">{emptyMessage  ??  `No ${STAT_WORDS.charts[TIER_STAT[tab]]} charts at this level.`}</div>;
  } else {
    let content;
    if (tab === 'hidden') {
      // Each group starts with a title.
      content = groups.map(({ label, charts }) => (
        <Fragment key={label}>
          <h3 className="group-title" data-flip={`group ${label}`}>{label} · {charts.length}</h3>
          {cards(charts, tabFolding('hidden', keep))}
        </Fragment>
      ));
    } else {
      const visible = levelCharts.filter((chart) => chartTier(chart, ties) === tab);
      visible.sort({ 'you-win': byLeadWeight, 'not-played': byRivalCount, 'rivals-win': byTargetWeight, tie: byRivalCount }[tab]);
      content = cards(visible, tabFolding(tab, keep));
    }

    // Unplayed charts have no diffs, so their cards are narrower and more fit in a row.
    body = <div className={`chart-grid${tab === 'not-played' ? ' narrow' : ''}`}>{content}</div>;
  }

  // A card stays maximized only while its chart is listed in the open tab.
  const big = listed.find(([chart]) => chart.id === maximized);
  useEffect(() => {
    if (maximized !== null  &&  ! big)
      setMaximized(null);
  }, [maximized, big]);

  // The maximized card, and where its card in the grid is, which it grows from and shrinks back to: on phones the
  // whole card, wider only its results' box, as wide as it's drawn, from the header's top down.
  const growing = () => {
    const overlay = overlayRef.current;
    const card = overlay?.firstElementChild as HTMLElement | null | undefined;
    const source = bodyRef.current?.querySelector<HTMLElement>(`[data-flip="chart ${maximized}"]`);
    const box = source?.querySelector('.chart-card-box')?.getBoundingClientRect();
    if (! overlay  ||  ! card  ||  ! source  ||  ! box)
      return null;

    const whole = source.getBoundingClientRect();
    return { overlay, card, from: phone ? whole : new DOMRect(box.left, whole.top, box.width, box.bottom - whole.top) };
  };

  const bigId = big?.[0].id;
  useLayoutEffect(() => {
    shrinking.current = false;
    const grow = bigId === undefined ? null : growing();
    if (! grow)
      return;

    const { overlay, card, from } = grow;
    if (! phone) {
      overlay.style.setProperty('--card-left', `${from.left}px`);
      overlay.style.setProperty('--card-width', `${from.width}px`);
      const top = Math.min(from.top, window.innerHeight - IN_PLACE_MARGIN_PX - card.offsetHeight);
      overlay.style.setProperty('--card-top', `${Math.max(IN_PLACE_MARGIN_PX, top)}px`);
    }
    if (REDUCED_MOTION.matches)
      return;

    card.animate([{ transform: transformFrom(from, card.getBoundingClientRect()) }, { transform: 'none' }],
      { duration: GROW_MS, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    // Faded in from its card, which stays under it, as it leaves it.
    card.animate([{ opacity: 0 }, { opacity: 1, offset: .4 }, { opacity: 1 }], { duration: GROW_MS });
    overlay.animate({ backgroundColor: [BACKDROP_CLEAR, getComputedStyle(overlay).backgroundColor] }, { duration: GROW_MS });
  }, [bigId]);

  // Shrinks the maximized card back into its card, then closes it and calls `then`.
  const closeMaximized = useRef((then?: () => void) => {});
  closeMaximized.current = (then?: () => void) => {
    if (shrinking.current)
      return;

    const done = () => {
      shrinking.current = false;
      setMaximized(null);
      then?.();
    };
    const grow = REDUCED_MOTION.matches ? null : growing();
    if (! grow) {
      done();
      return;
    }

    shrinking.current = true;
    const { overlay, card, from } = grow;
    // Measured where it's laid out, even if it's still growing.
    card.getAnimations().forEach((animation) => animation.cancel());
    overlay.getAnimations().forEach((animation) => animation.cancel());
    card.animate([{ transform: 'none' }, { transform: transformFrom(from, card.getBoundingClientRect()) }],
      { duration: SHRINK_MS, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'forwards' });
    // Faded out into its card once it's nearly there.
    card.animate([{ opacity: 1 }, { opacity: 1, offset: .3 }, { opacity: 0 }], { duration: SHRINK_MS, fill: 'forwards' });
    overlay.animate({ backgroundColor: [getComputedStyle(overlay).backgroundColor, BACKDROP_CLEAR] }, { duration: SHRINK_MS, fill: 'forwards' })
      .finished.then(done, done);
  };

  return (
    <div className="score-content">
      <div className={`tabs${tabsClass(tabsFit)}`} ref={tabBar} role="tablist" aria-label="Score results">
        {tabs.map((id) => (
          <button key={id} className="tab" type="button" role="tab" aria-selected={id === tab} data-tab={id} onClick={() => onSelectTab(id)}>
            {/* On phones, and wherever stacked tabs don't fit their words, the longer words are shortened, e.g. "Non-matched" to "NP". */}
            <span className="tab-word">{capitalized(tabWord(id))}</span>
            <span className="tab-word short">{SHORT_WORDS[tabWord(id)]  ??  capitalized(tabWord(id))}</span>
            <span className={`tab-count ${id}`}>{tabNumber(id)}</span>
            {flash?.tab === id  &&  <span key={flash.n} className="tab-flash" aria-hidden="true" onAnimationEnd={() => setFlash(null)} />}
          </button>
        ))}
      </div>
      <div className="dlg-body" role="tabpanel" ref={bodyRef}>{body}</div>
      {/* Out of the panels, which slide by transforms and so would hold a fixed overlay inside them. */}
      {big  &&  createPortal(
        <div className={`rivals card-overlay${phone ? '' : ' in-place'}`} ref={overlayRef} role="dialog" aria-modal="true" aria-label={big[0].trackTitle}
          onClick={(event) => event.target === event.currentTarget  &&  closeMaximized.current()}>
          {card(big[0], big[1], true)}
        </div>,
        document.body,
      )}
    </div>
  );
}
