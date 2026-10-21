import { Fragment, useEffect, useState } from 'react';
import { ChartResultsItem } from './chart_results_item.tsx';
import { byLeadWeight, byTargetWeight, type ChartRow } from './model.ts';
import type { CountBy } from './preferences.ts';
import { chartTier, resultCounts, type Stat, STAT_WORDS, TABS, type TabId, TIER_STAT } from './stats.ts';

export interface HiddenGroup {
  label: string;
  charts: ChartRow[];
}


const capitalized = (word: string) => word[0]!.toUpperCase() + word.slice(1);

// Unplayed and lost charts list only this many lowest scores until expanded.
const KEEP_LOWEST = 6;
// Each click on a fold button lists this many more of its scores.
const SHOW_STEP = 10;

const byRivalCount = (a: ChartRow, b: ChartRow) => b.rivals.length - a.rivals.length  ||  a.track.localeCompare(b.track);


// The results column: tabs splitting the charts of the selected level, and a grid of their cards.
// `levelCharts` are the charts of the selected level, each in the tab of its tier by `countBy`. `hiddenGroups` are
// its charts in the "Hidden" tab, which lists them group by group. `emptyMessage` replaces the per-tab message when
// there is nothing to show at all. Counted by results, the tabs show the level's result counts instead of their
// chart counts. `ties` (the solo view) adds a "Tied" tab and colours the true ties. `scoreCap` is named in the
// tooltip of diffs that the cap turns into ties.
export function ChartResults({ levelCharts, hiddenGroups, selectedTab, myName, emptyMessage, countBy, ties, scoreCap, onSelectTab }: {
  levelCharts: ChartRow[];
  hiddenGroups: HiddenGroup[];
  selectedTab: TabId;
  myName: string;
  emptyMessage: string | null;
  countBy: CountBy;
  ties: boolean;
  scoreCap: number;
  onSelectTab: (tab: TabId) => void;
}) {
  // By chart, how many of its folded rivals, and of its scores above the lowest ones, were shown.
  const [shownFolded, setShownFolded] = useState<Map<number, number>>(new Map());
  const [shownHigher, setShownHigher] = useState<Map<number, number>>(new Map());
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
  // Tabs are named after what their numbers count.
  const tabWord = (id: TabId) => STAT_WORDS[countBy][TIER_STAT[id]];

  // Rivals whose result is one of `fold`, or above the `keepLowest` lowest scores, are folded; each click on their
  // button shows SHOW_STEP more.
  const cards = (charts: ChartRow[], fold: Stat[], colorByRealDiff = false, keepLowest: number | null = null) => charts.map((chart) => (
    <ChartResultsItem
      key={chart.id}
      chart={chart}
      myName={myName}
      fold={fold}
      foldedShown={shownFolded.get(chart.id)  ??  0}
      keepLowest={keepLowest}
      higherShown={shownHigher.get(chart.id)  ??  0}
      colorByRealDiff={colorByRealDiff}
      markTies={ties}
      scoreCap={scoreCap}
      onExpandFolded={() => setShownFolded(showMore(shownFolded, chart.id))}
      onExpandHigher={() => setShownHigher(showMore(shownHigher, chart.id))}
    />
  ));

  let body;
  if (tabCounts[tab] === 0) {
    body = <div className="empty">{emptyMessage  ??  `No ${STAT_WORDS.charts[TIER_STAT[tab]]} charts at this level.`}</div>;
  } else {
    let content;
    if (tab === 'hidden') {
      // Each group starts with a title. Diffs are coloured like in the "Inferior" tab, so capped ties show as losses.
      content = groups.map(({ label, charts }) => (
        <Fragment key={label}>
          <h3 className="group-title">{label} · {charts.length}</h3>
          {cards(charts, ['win', 'tie'], true)}
        </Fragment>
      ));
    } else {
      const visible = levelCharts.filter((chart) => chartTier(chart, ties) === tab);
      visible.sort({ 'you-win': byLeadWeight, 'not-played': byRivalCount, 'rivals-win': byTargetWeight, tie: byRivalCount }[tab]);
      // Lost charts fold the rivals you beat or truly tie with; tied ones only those you beat. Lost and unplayed ones
      // also fold all but the lowest scores.
      content = cards(visible, tab === 'rivals-win' ? ['win', 'tie'] : tab === 'tie' ? ['win'] : [], false,
        tab === 'not-played'  ||  tab === 'rivals-win' ? KEEP_LOWEST : null);
    }

    body = <div className="chart-grid">{content}</div>;
  }

  return (
    <div className="score-content">
      <div className="tabs" role="tablist" aria-label="Score results">
        {tabs.map((id) => (
          <button key={id} className="tab" type="button" role="tab" aria-selected={id === tab} data-tab={id} onClick={() => onSelectTab(id)}>
            {capitalized(tabWord(id))}<span className={`tab-count ${id}`}>{tabNumber(id)}</span>
          </button>
        ))}
      </div>
      <div className="dlg-body" role="tabpanel">{body}</div>
    </div>
  );
}
