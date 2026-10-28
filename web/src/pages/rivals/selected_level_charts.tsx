import type { SnoozeDays } from '@piu-rivals/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChartCard, NONE_SHOWN, type ShownRows, tabFolding, useKeeps } from '../../components/charts/chart_card.tsx';
import { ChartCardsGrid, type ChartCardsGroup } from '../../components/charts/chart_cards_grid.tsx';
import { ChartCardMaximized } from '../../components/charts/chart_card_maximized.tsx';
import { REDUCED_MOTION } from '../../components/media.ts';
import { tabsClass, useTabsFit } from './layout.ts';
import { byLeadWeight, byTargetWeight, type ChartRow } from '../../data/model.ts';
import type { CountBy } from '../../data/preferences.ts';
import { chartTier, resultCounts, STAT_WORDS, TABS, type TabId, TIER_STAT } from '../../data/stats.ts';

export interface HiddenGroup {
  label: string;
  charts: ChartRow[];
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

const byRivalCount = (a: ChartRow, b: ChartRow)  =>  b.rivals.length - a.rivals.length  ||  a.track.localeCompare(b.track);


// The results column: tabs splitting the charts of the selected level, and a grid of their cards.
// `levelCharts` are the charts of the selected level, each in the tab of its tier by `countBy`. `hiddenGroups` are
// its charts in the "Hidden" tab, which lists them group by group. `emptyMessage` replaces the per-tab message when
// there is nothing to show at all. Counted by results, the tabs show the level's result counts instead of their
// chart counts. `ties` (the solo view) adds a "Tied" tab and colours the true ties. `scoreCap` is named in the
// tooltip of diffs that the cap turns into ties. The "Snooze..." button in a card's unrolled header opens a menu of
// lengths, and dims the card; a length snoozes its chart with `onSnooze`, and a click anywhere else only closes it.
// Wake calls `onSnooze` at once. Either way the card fades out first, and the others move into its place. `now` counts down
// the time snoozed charts have left.
// A click on a card maximizes it (see ChartCardMaximized), so its header doesn't unroll here, nor its Snooze... menu
// open; a snooze or a wake there closes it, and the card behind fades out. A card stays maximized only while its
// chart is listed in the open tab. The tab a snoozed or woken chart goes into splashes once it's there.
export function SelectedLevelCharts({
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
  // By chart, how many of its folded scores were shown (see ChartCard).
  const [shownRowsByChart, setShownRowsByChart] = useState<Map<number, ShownRows>>(new Map());
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
  // closes with it, so the length picked stays lit while the card fades.
  const leave = (chartId: number, days: SnoozeDays | null)  => {
    const send = ()  => {
      if (! REDUCED_MOTION.matches)
        movedFrom.current = flipRects(bodyRef.current);

      setLeavingChartId(null);
      setUnrolledRowId(null);
      setMenu(null);
      onSnooze(chartId, days);

      // A woken chart goes into the tab of its scores.
      const chart = [...levelCharts, ...hiddenGroups.flatMap(({ charts })  =>  charts)].find(({ id })  =>  id === chartId);
      const into = (days !== null  ?  'hidden'  :  chart  &&  chartTier({ ...chart, snoozedUntil: null }, ties));
      if (into)
        setFlash((previousFlash)  =>  ({ tab: into, n: (previousFlash?.n  ??  0) + 1 }));
    };

    if (REDUCED_MOTION.matches) {
      send();
      return;
    }

    setLeavingChartId(chartId);
    window.setTimeout(send, LEAVE_MS);
  };

  // While a snooze menu is open, a click anywhere but in it, or on its button, does nothing else than close it: it's
  // caught on the window, before the page sees it. Escape closes it too.
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

  const keep = useKeeps();
  const groups = hiddenGroups.filter(({ charts })  =>  charts.length);
  const tabCounts = Object.fromEntries(TABS.map((id)  =>  [
    id, id === 'hidden'
      ?  groups.reduce((acc, { charts })  =>  acc + charts.length, 0)
      :  levelCharts.filter((c)  =>  chartTier(c, ties) === id).length,
  ])) as Record<TabId, number>;

  // The "Hidden" tab only shows up when there is something hidden, and "Tied" only in the solo view;
  // if a missing one was open, "Lost" takes over.
  const tabs = TABS.filter((id)  =>  (id !== 'hidden'  ||  tabCounts.hidden)  &&  (id !== 'tie'  ||  ties));
  const tabGone = ! tabs.includes(selectedTab);
  const tab = (tabGone  ?  'rivals-win'  :  selectedTab);

  useEffect(()  => {
    if (tabGone)
      onSelectTab('rivals-win');
  }, [tabGone, onSelectTab]);

  const results = (countBy === 'results'  ?  resultCounts(levelCharts)  :  null);
  const tabNumber = (id: TabId)  =>  (results  ?  results[TIER_STAT[id]]  :  tabCounts[id]);
  const tabBar = useRef<HTMLDivElement>(null);
  const tabsFit = useTabsFit(tabBar, [tabs.map((id)  =>  `${id} ${tabNumber(id)}`).join()]);
  // Tabs are named after what their numbers count.
  const tabWord = (id: TabId)  =>  STAT_WORDS[countBy][TIER_STAT[id]];

  // Charts in the "Hidden" tab are hidden already.
  const canSnooze = tab !== 'hidden';
  const folding = tabFolding(tab, keep);
  const card = (chart: ChartRow)  =>  (
    <ChartCard
      key={chart.id}
      chart={chart}
      myName={myName}
      folding={folding}
      shownRows={shownRowsByChart.get(chart.id)  ??  NONE_SHOWN}
      onShow={(more)  =>  setShownRowsByChart(new Map(shownRowsByChart).set(chart.id, more))}
      markTies={ties}
      scoreCap={scoreCap}
      now={now}
      unrolledRowId={(unrolledRowId?.startsWith(`${chart.id} `)  ?  unrolledRowId.slice(`${chart.id} `.length)  :  null)}
      onUnroll={(playerId)  =>  setUnrolledRowId((playerId === null  ?  null  :  `${chart.id} ${playerId}`))}
      canSnooze={canSnooze}
      menuOpen={menu === chart.id}
      onMenu={()  =>  setMenu((menu === chart.id  ?  null  :  chart.id))}
      onSnooze={(days)  =>  leave(chart.id, days)}
      // A wake needs no undo: the card goes back to its tab at once.
      leaving={leavingChartId === chart.id}
      onWake={()  =>  leave(chart.id, null)}
      onMaximize={()  => {
        setMenu(null);
        setMaximizedChartId(chart.id);
      }}
    />
  );

  // The "Hidden" tab lists its charts group by group, each under a title.
  let listedGroups: ChartCardsGroup[];
  if (tab === 'hidden') {
    listedGroups = groups.map(({ label, charts })  =>  ({ key: label, title: `${label} · ${charts.length}`, charts }));
  } else {
    const visibleCharts = levelCharts.filter((c)  =>  chartTier(c, ties) === tab);
    visibleCharts.sort({ 'you-win': byLeadWeight, 'not-played': byRivalCount, 'rivals-win': byTargetWeight, tie: byRivalCount }[tab]);
    listedGroups = [{ key: tab, title: null, charts: visibleCharts }];
  }

  // A card stays maximized only while its chart is listed in the open tab.
  const maximizedChart = listedGroups.flatMap(({ charts })  =>  charts).find((c)  =>  c.id === maximizedChartId);

  useEffect(()  => {
    if (maximizedChartId !== null  &&  ! maximizedChart)
      setMaximizedChartId(null);
  }, [maximizedChartId, maximizedChart]);

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
        emptyMessage={(tabCounts[tab] === 0  ?  emptyMessage  ??  `No ${STAT_WORDS.charts[TIER_STAT[tab]]} charts at this level.`  :  null)}
        // Unplayed charts have no diffs, so their cards are narrower and more fit in a row.
        narrow={tab === 'not-played'}
        groups={listedGroups}
        card={card}
      />
      {maximizedChart  &&  (
        <ChartCardMaximized
          key={maximizedChart.id}
          chart={maximizedChart}
          myName={myName}
          folding={folding}
          markTies={ties}
          scoreCap={scoreCap}
          canSnooze={canSnooze}
          now={now}
          source={()  =>  bodyRef.current?.querySelector<HTMLElement>(`[data-flip="chart ${maximizedChart.id}"]`)  ??  null}
          onClose={()  =>  setMaximizedChartId(null)}
          onSnooze={(days)  =>  leave(maximizedChart.id, days)}
        />
      )}
    </div>
  );
}
