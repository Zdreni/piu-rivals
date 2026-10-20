import { Fragment, useEffect, useState } from 'react';
import { ChartResultsItem } from './chart_results_item.tsx';
import { byLeadWeight, byTargetWeight, type ChartRow } from './model.ts';
import { chartTier, type LevelCounts, STAT_WORDS, TABS, type TabId, TIER_STAT } from './stats.ts';

export interface HiddenGroup {
  label: string;
  charts: ChartRow[];
}


const capitalized = (word: string) => word[0]!.toUpperCase() + word.slice(1);

const byRivalCount = (a: ChartRow, b: ChartRow) => b.rivals.length - a.rivals.length  ||  a.track.localeCompare(b.track);


// The results column: tabs splitting the charts of the selected level, and their score table.
// `levelCharts` are the charts of the selected level. `hiddenGroups` are its losses left out of the "Lost" tab;
// the "Hidden" tab lists them group by group. `emptyMessage` replaces the per-tab message when there is nothing
// to show at all. `results`, when given, are the numbers the tabs show instead of their chart counts.
// `scoreCap` is named in the tooltip of diffs that the cap turns into ties.
export function ChartResults({ levelCharts, hiddenGroups, selectedTab, myName, emptyMessage, results, scoreCap, onSelectTab }: {
  levelCharts: ChartRow[];
  hiddenGroups: HiddenGroup[];
  selectedTab: TabId;
  myName: string;
  emptyMessage: string | null;
  results: LevelCounts | null;
  scoreCap: number;
  onSelectTab: (tab: TabId) => void;
}) {
  // Charts in the "Lost" and "Hidden" tabs whose rivals you beat are unrolled.
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const groups = hiddenGroups.filter(({ charts }) => charts.length);
  const tabCounts = Object.fromEntries(TABS.map((id) => [
    id, id === 'hidden'
      ? groups.reduce((acc, { charts }) => acc + charts.length, 0)
      : levelCharts.filter((chart) => chartTier(chart) === id).length,
  ])) as Record<TabId, number>;

  // The "Hidden" tab only shows up when there is something hidden; if it was open, "Lost" takes over.
  const hiddenGone = selectedTab === 'hidden'  &&  tabCounts.hidden === 0;
  const tab = hiddenGone ? 'rivals-win' : selectedTab;

  useEffect(() => {
    if (hiddenGone)
      onSelectTab('rivals-win');
  }, [hiddenGone, onSelectTab]);

  const tabNumber = (id: TabId) => (results ? results[TIER_STAT[id]] : tabCounts[id]);
  // Tabs are named after what their numbers count.
  const tabWord = (id: TabId) => STAT_WORDS[results ? 'results' : 'charts'][TIER_STAT[id]];

  // With `collapseWon`, rivals you beat are folded until their "show N others..." row is clicked.
  const tableRows = (charts: ChartRow[], collapseWon: boolean, colorByRealDiff = false) => charts.map((chart, i) => (
    <Fragment key={chart.id}>
      {i > 0  &&  <tr className="gap"><td colSpan={5} /></tr>}
      <ChartResultsItem
        chart={chart}
        myName={myName}
        collapseWon={collapseWon  &&  ! expanded.has(chart.id)}
        colorByRealDiff={colorByRealDiff}
        scoreCap={scoreCap}
        onExpand={() => setExpanded(new Set(expanded).add(chart.id))}
      />
    </Fragment>
  ));

  let body;
  if (tabCounts[tab] === 0) {
    body = <div className="empty">{emptyMessage  ??  `No ${STAT_WORDS.charts[TIER_STAT[tab]]} charts at this level.`}</div>;
  } else {
    let rows;
    if (tab === 'hidden') {
      // Each group starts with a title row. Diffs are coloured like in the "Inferior" tab, so capped ties show as losses.
      rows = groups.map(({ label, charts }) => (
        <Fragment key={label}>
          <tr><td className="group-title" colSpan={5}>{label} · {charts.length}</td></tr>
          {tableRows(charts, true, true)}
        </Fragment>
      ));
    } else {
      const visible = levelCharts.filter((chart) => chartTier(chart) === tab);
      visible.sort({ 'you-win': byLeadWeight, 'not-played': byRivalCount, 'rivals-win': byTargetWeight }[tab]);
      rows = tableRows(visible, tab === 'rivals-win');
    }

    body = (
      <table>
        <thead>
          <tr>
            <th className="track">Track</th>
            <th className="col-chart">Chart</th>
            <th className="col-player">Player</th>
            <th className="num col-score">Score</th>
            <th className="num col-diff">Diff</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    );
  }

  return (
    <div className="score-content">
      <div className="tabs" role="tablist" aria-label="Score results">
        {TABS.filter((id) => id !== 'hidden'  ||  tabCounts.hidden).map((id) => (
          <button key={id} className="tab" type="button" role="tab" aria-selected={id === tab} data-tab={id} onClick={() => onSelectTab(id)}>
            {capitalized(tabWord(id))}<span className={`tab-count ${id}`}>{tabNumber(id)}</span>
          </button>
        ))}
      </div>
      <div className="dlg-body" role="tabpanel">{body}</div>
    </div>
  );
}
