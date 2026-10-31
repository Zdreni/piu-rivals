import { byLeadWeight, byTargetWeight, type ChartRow, withRivalsOrNull } from './model.ts';
import type { CountBy } from './preferences.ts';
import { chartTier, resultTab, type TabId } from './stats.ts';

const byRivalCount = (a: ChartRow, b: ChartRow)  =>  b.rivals.length - a.rivals.length  ||  a.track.localeCompare(b.track);

// How each tab's charts are sorted.
const TAB_ORDER = { 'you-win': byLeadWeight, 'not-played': byRivalCount, 'rivals-win': byTargetWeight, tie: byRivalCount };


// The charts of a tab other than "Hidden", in its order. Counted by charts, each chart is in the tab of its tier;
// counted by results, a chart is in each tab one of its results goes to, with only those results. `ties` (the solo
// view) gives ties a tab of their own.
export function tabCharts(charts: ChartRow[], tab: Exclude<TabId, 'hidden'>, countBy: CountBy, ties: boolean) {
  const listed = (countBy === 'charts'
    ?  charts.filter((c)  =>  chartTier(c, ties) === tab)
    :  charts
      .map((c)  =>  withRivalsOrNull(c, (r)  =>  resultTab(c, r, ties) === tab))
      .filter((c): c is ChartRow  =>  c !== null));

  return listed.sort(TAB_ORDER[tab]);
}
