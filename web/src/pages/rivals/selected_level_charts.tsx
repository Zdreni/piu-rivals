import type { SnoozeDays } from '@piu-rivals/shared';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChartCard } from '../../components/charts/chart_card.tsx';
import { ChartCardsGrid, type ChartCardsGroup } from '../../components/charts/chart_cards_grid.tsx';
import { ChartCardMaximized } from '../../components/charts/chart_card_maximized.tsx';
import { REDUCED_MOTION, useMobileView } from '../../components/media.ts';
import { tabsClass, useTabsFit } from './layout.ts';
import type { Chartboard } from '../../data/model.ts';
import type { CountBy } from '../../data/preferences.ts';
import { foldChartboard, type FoldedChartboard, NO_UNFOLDED_RIVALS, type UnfoldedRivalCounts } from '../../data/folded_chartboard.ts';
import { rivalsFolding } from '../../data/rivals_folding.ts';
import { chartTier, STAT_WORDS, TABS, type TabId, TIER_STAT } from '../../data/stats.ts';
import { tabChartboards } from '../../data/tab_charts.ts';

export interface HiddenGroup {
  label: string;
  chartboards: Chartboard[];
}


const capitalize = (word: string)  =>  word[0]!.toUpperCase() + word.slice(1);
// Tab words on phones.
const SHORT_WORDS: Record<string, string> = { 'non-matched': 'NP', 'not played': 'NP', inferior: 'Inf', superior: 'Sup', hidden: 'Hid' };

// A card snoozed or woken fades out this long, then the cards and group titles after it move into its place.
const LEAVE_MS = 200;
const MOVE_MS = 300;

// Where each card and group title in `container` is, by its data-flip key.
const flipRects = (container: HTMLElement | null)  =>
  new Map([...container?.querySelectorAll<HTMLElement>('[data-flip]')  ??  []].map((el)  =>  [el.dataset.flip!, el.getBoundingClientRect()]));


// The results column: the selected level's charts (`levelChartboards`) in tabs, as a grid of cards, with snoozing
//  (`onSnooze`, with null days for a wake) and maximizing. Counted by results, a chart is in each tab one of its results
//  goes to. `hiddenGroups` are the Hidden tab's charts, by group; `emptyMessage` replaces the tab's message when there's
//  nothing at all.
export function SelectedLevelCharts({
  levelChartboards, hiddenGroups, selectedTab, myName, emptyMessage, countBy, treatTieAsWin, scoreCap, snoozesCheckedAt, onSelectTab, onSnooze,
}: {
  levelChartboards: Chartboard[];
  hiddenGroups: HiddenGroup[];
  selectedTab: TabId;
  myName: string;
  emptyMessage: string | null;
  countBy: CountBy;
  treatTieAsWin: boolean;
  scoreCap: number;
  snoozesCheckedAt: number;
  onSelectTab: (tab: TabId) => void;
  onSnooze: (chartId: number, days: SnoozeDays | null) => void;
}) {
  // By chart, how many of its folded scores were shown (see ChartCard).
  const [unfoldedRivalCountsByChart, setUnfoldedRivalCountsByChart] = useState<Map<number, UnfoldedRivalCounts>>(new Map());
  // The one result row or card header unrolled, as `${chart id} ${player id}` (or "me" for yours, "head" for the header).
  const [unrolledRowId, setUnrolledRowId] = useState<string | null>(null);
  // The chart whose snooze menu is open. Another level starts without it.
  const [menu, setMenu] = useState<number | null>(null);
  // The card fading out before its chart is snoozed or woken.
  const [leavingChartId, setLeavingChartId] = useState<number | null>(null);
  // The tab a chart just went into, snoozed or woken, which splashes (see .tab-flash); `n` restarts the splash.
  const [flash, setFlash] = useState<{ tab: TabId; n: number } | null>(null);
  // The chart whose card is maximized.
  const [maximizedChartId, setMaximizedChartId] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Where the cards and group titles were before a card left, so they move from there into their new places.
  const movedFrom = useRef<Map<string, DOMRect> | null>(null);

  useLayoutEffect(()  => {
    const from = movedFrom.current;
    if (! from)
      return;

    movedFrom.current = null;
    for (const el of bodyRef.current?.querySelectorAll<HTMLElement>('[data-flip]')  ??  []) {
      const oldRect = from.get(el.dataset.flip!);
      if (! oldRect)
        continue;

      const newRect = el.getBoundingClientRect();
      const dx = oldRect.left - newRect.left, dy = oldRect.top - newRect.top;
      if (dx  ||  dy)
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: MOVE_MS, easing: 'ease' });
    }
  });

  // Snoozes (days) or wakes (null) the chart once its card has faded out; the header rolls back and the snooze menu
  //  closes with it, so the length picked stays lit while the card fades.
  const leave = (chartId: number, days: SnoozeDays | null)  => {
    const send = ()  => {
      if (! REDUCED_MOTION.matches)
        movedFrom.current = flipRects(bodyRef.current);

      setLeavingChartId(null);
      setUnrolledRowId(null);
      setMenu(null);
      onSnooze(chartId, days);

      // A woken chart goes into the tab of its scores.
      const chartboard = [...levelChartboards, ...hiddenGroups.flatMap(({ chartboards })  =>  chartboards)].find(({ id })  =>  id === chartId);
      const into = (days !== null  ?  'hidden'  :  chartboard  &&  chartTier({ ...chartboard, snoozedUntil: null }, treatTieAsWin));
      if (into)
        setFlash((previousFlash)  =>  ({ tab: into, n: (previousFlash?.n  ??  0) + 1 }));
    };

    // Counted by results, a chart woken in "Won" or "Tied" stays there, so its card doesn't fade out.
    if (REDUCED_MOTION.matches  ||  (days === null  &&  tab !== 'hidden'  &&  ! canSnooze)) {
      send();
      return;
    }

    setLeavingChartId(chartId);
    window.setTimeout(send, LEAVE_MS);
  };

  // While a snooze menu is open, a click anywhere but in it, or on its button, does nothing else than close it: it's
  //  caught on the window, before the page sees it. Escape closes it too.
  useEffect(()  => {
    if (menu === null)
      return;

    const close = (event: globalThis.MouseEvent)  => {
      if ((event.target as Element).closest?.('.snooze-menu, .snooze-toggle'))
        return;

      event.preventDefault();
      event.stopPropagation();
      setMenu(null);
    };

    const escape = (event: KeyboardEvent)  =>  event.key === 'Escape'  &&  setMenu(null);

    window.addEventListener('click', close, true);
    window.addEventListener('keydown', escape);
    return ()  => {
      window.removeEventListener('click', close, true);
      window.removeEventListener('keydown', escape);
    };
  }, [menu]);

  const inMobileView = useMobileView();
  const { groups, chartboardsByTab, tabCounts } = useMemo(()  => {
    const groups = hiddenGroups.filter(({ chartboards })  =>  chartboards.length);
    const chartboardsByTab = Object.fromEntries(TABS.map((id)  =>  [
      id, (id === 'hidden'  ?  groups.flatMap(({ chartboards })  =>  chartboards)  :  tabChartboards(levelChartboards, id, countBy, treatTieAsWin)),
    ])) as Record<TabId, Chartboard[]>;

    const tabCounts = Object.fromEntries(TABS.map((id)  =>  [id, chartboardsByTab[id].length])) as Record<TabId, number>;
    return { groups, chartboardsByTab, tabCounts };
  }, [levelChartboards, hiddenGroups, countBy, treatTieAsWin]);

  // The "Hidden" tab only shows up when there is something hidden, and "Tied" only when ties aren't treated as wins;
  //  if a missing one was open, "Lost" takes over.
  const tabs = TABS.filter((id)  =>  (id !== 'hidden'  ||  tabCounts.hidden)  &&  (id !== 'tie'  ||  ! treatTieAsWin));
  const tabGone = ! tabs.includes(selectedTab);
  const tab = (tabGone  ?  'rivals-win'  :  selectedTab);

  useEffect(()  => {
    if (tabGone)
      onSelectTab('rivals-win');
  }, [tabGone, onSelectTab]);

  const tabNumber = (id: TabId)  =>  (countBy === 'results'
    ?  chartboardsByTab[id].reduce((acc, cb)  =>  acc + cb.rivals.length, 0)
    :  tabCounts[id]);
  const tabBar = useRef<HTMLDivElement>(null);
  const tabsFit = useTabsFit(tabBar, [tabs.map((id)  =>  `${id} ${tabNumber(id)}`).join()]);
  // Tabs are named after what their numbers count.
  const tabWord = (id: TabId)  =>  STAT_WORDS[countBy][TIER_STAT[id]];

  // Charts in the "Hidden" tab are hidden already. Counted by results, a snooze hides only losses and non-matches,
  //  so it isn't offered where it would leave the card in place.
  const canSnooze = tab !== 'hidden'  &&  (countBy === 'charts'  ||  tab === 'rivals-win'  ||  tab === 'not-played');
  // The open tab's cards, folded once it's opened. Counted by results, a tab's charts have only its results, so the
  //  cards are folded from the full chartboards, to list the rivals they need (see rivalsFolding).
  const listedGroups = useMemo(()  => {
    const fullChartboards = new Map(levelChartboards.map((cb)  =>  [cb.id, cb]));
    const folding = rivalsFolding(tab, { countBy, treatTieAsWin, inMobileView });
    const fold = (chartboards: Chartboard[])  =>  chartboards.map((cb)  =>  foldChartboard(fullChartboards.get(cb.id)  ??  cb, folding));
    // The "Hidden" tab lists its charts group by group, each under a title.
    return (tab === 'hidden'
      ?  groups.map(({ label, chartboards }): ChartCardsGroup  =>  ({ key: label, title: `${label} · ${chartboards.length}`, foldedChartboards: fold(chartboards) }))
      :  [{ key: tab, title: null, foldedChartboards: fold(chartboardsByTab[tab]) }]);
  }, [levelChartboards, groups, chartboardsByTab, tab, countBy, treatTieAsWin, inMobileView]);

  const renderCard = (foldedChartboard: FoldedChartboard)  => {
    const chartId = foldedChartboard.chartboard.id;
    return (
      <ChartCard
        key={chartId}
        foldedChartboard={foldedChartboard}
        myName={myName}
        unfoldedRivalCounts={unfoldedRivalCountsByChart.get(chartId)  ??  NO_UNFOLDED_RIVALS}
        onShow={(counts)  =>  setUnfoldedRivalCountsByChart(new Map(unfoldedRivalCountsByChart).set(chartId, counts))}
        scoreCap={scoreCap}
        snoozesCheckedAt={snoozesCheckedAt}
        unrolledRowId={(unrolledRowId?.startsWith(`${chartId} `)  ?  unrolledRowId.slice(`${chartId} `.length)  :  null)}
        onUnroll={(playerId)  =>  setUnrolledRowId((playerId === null  ?  null  :  `${chartId} ${playerId}`))}
        canSnooze={canSnooze}
        menuIsOpen={menu === chartId}
        onMenu={()  =>  setMenu((menu === chartId  ?  null  :  chartId))}
        onSnooze={(days)  =>  leave(chartId, days)}
        // A wake needs no undo: the card goes back to its tab at once.
        leaving={leavingChartId === chartId}
        onWake={()  =>  leave(chartId, null)}
        onMaximize={()  => {
          setMenu(null);
          setMaximizedChartId(chartId);
        }}
      />
    );
  };

  // A card stays maximized only while its chart is listed in the open tab. Maximized, it lists all the chart's rivals.
  const maximizedChartboard = listedGroups.flatMap(({ foldedChartboards })  =>  foldedChartboards)
    .find(({ chartboard })  =>  chartboard.id === maximizedChartId)?.chartboard;

  const maximizedFoldedChartboard = useMemo(
    ()  =>  maximizedChartboard  &&  foldChartboard(maximizedChartboard, rivalsFolding(tab, { countBy, treatTieAsWin, inMobileView, maximized: true })),
    [maximizedChartboard, tab, countBy, treatTieAsWin, inMobileView],
  );

  useEffect(()  => {
    if (maximizedChartId !== null  &&  ! maximizedChartboard)
      setMaximizedChartId(null);
  }, [maximizedChartId, maximizedChartboard]);

  return (
    <div className="score-content">
      <div className={`tabs${tabsClass(tabsFit)}`} ref={tabBar} role="tablist" aria-label="Score results">
        {tabs.map((id)  =>  (
          <button key={id} className="tab" type="button" role="tab" aria-selected={id === tab} data-tab={id} onClick={()  =>  onSelectTab(id)}>
            {/* On phones, and wherever stacked tabs don't fit their words, the longer words are shortened, e.g. "Non-matched" to "NP". */}
            <span className="tab-word">{capitalize(tabWord(id))}</span>
            <span className="tab-word short">{SHORT_WORDS[tabWord(id)]  ??  capitalize(tabWord(id))}</span>
            <span className={`tab-count ${id}`}>{tabNumber(id)}</span>
            {flash?.tab === id  &&  <span key={flash.n} className="tab-flash" aria-hidden="true" onAnimationEnd={()  =>  setFlash(null)} />}
          </button>
        ))}
      </div>
      <ChartCardsGrid
        ref={bodyRef}
        role="tabpanel"
        emptyMessage={(tabCounts[tab] === 0  ?  emptyMessage  ??  `No ${tabWord(tab)} ${countBy} at this level.`  :  null)}
        // Unplayed charts have no diffs, so their cards are narrower and more fit in a row.
        narrow={tab === 'not-played'}
        groups={listedGroups}
        renderCard={renderCard}
      />
      {maximizedChartboard  &&  maximizedFoldedChartboard  &&  (
        <ChartCardMaximized
          key={maximizedChartboard.id}
          foldedChartboard={maximizedFoldedChartboard}
          myName={myName}
          scoreCap={scoreCap}
          canSnooze={canSnooze}
          snoozesCheckedAt={snoozesCheckedAt}
          source={()  =>  bodyRef.current?.querySelector<HTMLElement>(`[data-flip="chart ${maximizedChartboard.id}"]`)  ??  null}
          onClose={()  =>  setMaximizedChartId(null)}
          onSnooze={(days)  =>  leave(maximizedChartboard.id, days)}
        />
      )}
    </div>
  );
}
