import { byLeadWeight, byTargetWeight } from '../../storage.js';
import { chartKey, chartResultsItem, chartResultsItemStyles } from './chart_results_item.js';
import { chartTier, esc, TABS, TIER_STAT } from './common.js';

export const chartResultsStyles = `
  .score-content { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; }
  .tabs { display: flex; gap: 6px; padding: 10px 16px; border-bottom: 1px solid #2B4034; }
  .tab { background: #1C2B22; color: #9AB3A3; border: 1px solid #2B4034; border-radius: 6px;
         padding: 6px 12px; font: 500 14px/1.2 Roboto, Arial, sans-serif; cursor: pointer; }
  .tab:hover { color: #EAF5EC; }
  .tab[aria-selected="true"] { background: #2B4034; color: #EAF5EC; border-color: #4FE33F; }
  /* Room for three digits, so tabs keep their size as the counts change. */
  .tab-count { display: inline-block; min-width: 3ch; margin-left: 6px; opacity: .7; text-align: right;
               font-variant-numeric: tabular-nums; }
  .tab-count.rivals-win { color: #FF2A00; }
  .tab-count.not-played { color: #3FA9F5; }
  .tab-count.you-win { color: #4FE33F; }
  .dlg-body { overflow-y: auto; overflow-x: hidden; padding: 0 16px 12px; flex: 1;
              scrollbar-width: thin; scrollbar-color: #2B4034 transparent; }
  .dlg-body:hover { scrollbar-color: #3D5A49 transparent; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  th.col-chart { width: 56px; }
  th.col-player { width: 92px; } /* 80px of text + 12px padding */
  th.col-score { width: 70px; }
  th.col-diff { width: 70px; }
  .track { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  th { position: sticky; top: 0; z-index: 1; background: #14201A; color: #9AB3A3; font-weight: 500;
       text-align: left; padding: 8px 6px; border-bottom: 1px solid #2B4034; }
  td { padding: 4px 6px; vertical-align: top; overflow: hidden; text-overflow: ellipsis; }
  tr.alt > td:not(.track):not([rowspan]):not(.others) { background: rgba(255,255,255,.05); }
  tr.group td { border-top: 1px solid #2B4034; }
  tr.gap td { height: 8px; padding: 0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .empty { padding: 24px; text-align: center; color: #9AB3A3; }
  .tab[data-tab="hidden"] { margin-left: auto; }
  .tab-count.hidden { color: #8C2E1C; }
  td.group-title { padding: 14px 6px 6px; color: #A85044; font: 500 14px/1.2 Roboto, Arial, sans-serif;
                   border-bottom: 1px solid #3A1813; }
` + chartResultsItemStyles;


// The results column: tabs splitting the charts of the selected level, and their score table.
// `onSelectTab` gets the id of the clicked tab.
export function createChartResults(container, onSelectTab) {
  container.innerHTML = `
    <div class="tabs" role="tablist" aria-label="Score results"></div>
    <div class="dlg-body" role="tabpanel"></div>`;

  const tabs = container.querySelector('.tabs');
  const body = container.querySelector('.dlg-body');
  // Charts in the "Lost" and "Hidden" tabs whose rivals you beat are unrolled.
  const expandedCharts = new Set();
  let lastRender = null;

  tabs.addEventListener('click', (event) => {
    const tab = event.target.closest('.tab');
    if (tab)
      onSelectTab(tab.dataset.tab);
  });

  body.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-expand]');
    if (! button)
      return;

    expandedCharts.add(button.dataset.expand);
    if (lastRender)
      render(...lastRender);
  });

  // With `collapseWon`, rivals you beat are folded until their "show N others..." row is clicked.
  const tableRows = (charts, myName, collapseWon, colorByRealDiff = false) => charts.flatMap((chart, i) => {
    const chartTrs = chartResultsItem(chart, myName, {
      collapseWon: collapseWon  &&  ! expandedCharts.has(chartKey(chart)),
      colorByRealDiff,
    });

    return i === 0 ? chartTrs : ['<tr class="gap"><td colspan="5"></td></tr>', ...chartTrs];
  });

  // `levelCharts` are the charts of the selected level. `hiddenGroups` are its losses left out of the
  // "Lost" tab, as [{ label, charts }]; the "Hidden" tab lists them group by group.
  // `emptyMessage` replaces the per-tab message when there is nothing to show at all.
  // `results` ({ lose, unplayed, win, hidden }), when given, are the numbers the tabs show instead of their chart counts.
  function render(levelCharts, hiddenGroups, selectedTab, myName, emptyMessage, results) {
    lastRender = [levelCharts, hiddenGroups, selectedTab, myName, emptyMessage, results];

    const groups = hiddenGroups.filter(({ charts }) => charts.length);
    const tabCounts = Object.fromEntries(TABS.map(({ id }) => [
      id, id === 'hidden'
        ? groups.reduce((acc, { charts }) => acc + charts.length, 0)
        : levelCharts.filter((chart) => chartTier(chart) === id).length,
    ]));
    const tabNumber = (id) => (results ? results[TIER_STAT[id]] : tabCounts[id]);
    // The "Hidden" tab only shows up when there is something hidden; if it was open, "Lost" takes over.
    if (selectedTab === 'hidden'  &&  tabCounts.hidden === 0) {
      onSelectTab('rivals-win');
      return;
    }

    tabs.innerHTML = TABS.filter(({ id }) => id !== 'hidden'  ||  tabCounts.hidden).map(({ id, label }) =>
      `<button class="tab" type="button" role="tab" aria-selected="${id === selectedTab}" data-tab="${id}">`
      + `${label}<span class="tab-count ${id}">${tabNumber(id)}</span></button>`).join('');

    if (tabCounts[selectedTab] === 0) {
      const message = emptyMessage
        ?? `No ${TABS.find(({ id }) => id === selectedTab).label.toLowerCase()} charts at this level.`;
      body.innerHTML = `<div class="empty">${message}</div>`;
      return;
    }

    let rows;
    if (selectedTab === 'hidden') {
      // Each group starts with a title row. Diffs are coloured like in the "Theirs" tab, so capped ties show as losses.
      rows = groups.map(({ label, charts }) =>
        `<tr><td class="group-title" colspan="5">${esc(label)} · ${charts.length}</td></tr>`
        + tableRows(charts, myName, true, true).join('')).join('');
    } else {
      const visible = levelCharts.filter((chart) => chartTier(chart) === selectedTab);
      const byRivalCount = (a, b) => b.rivals.length - a.rivals.length  ||  a.track.localeCompare(b.track);
      visible.sort({ 'you-win': byLeadWeight, 'not-played': byRivalCount }[selectedTab]  ||  byTargetWeight);
      rows = tableRows(visible, myName, selectedTab === 'rivals-win').join('');
    }

    body.innerHTML = `<table>
      <thead><tr><th class="track">Track</th><th class="col-chart">Chart</th><th class="col-player">Player</th><th class="num col-score">Score</th><th class="num col-diff">Diff</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  return { render };
}
