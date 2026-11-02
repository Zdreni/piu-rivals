import { byLeadWeight, byTargetWeight, type Chartboard, withRivalsOrNull } from './model.ts';
import type { CountBy } from './preferences.ts';
import { chartTier, resultTab, type TabId } from './stats.ts';

const byRivalCount = (a: Chartboard, b: Chartboard)  =>  b.rivals.length - a.rivals.length  ||  a.track.localeCompare(b.track);

// How each tab's charts are sorted.
const TAB_ORDER = { 'you-win': byLeadWeight, 'not-played': byRivalCount, 'rivals-win': byTargetWeight, tie: byRivalCount };


// The charts of a tab other than "Hidden", in its order. Counted by charts, each chart is in the tab of its tier;
//  counted by results, a chart is in each tab one of its results goes to, with only those results. Unless
//  `treatTieAsWin`, ties get a tab of their own.
export function tabChartboards(chartboards: Chartboard[], tab: Exclude<TabId, 'hidden'>, countBy: CountBy, treatTieAsWin: boolean) {
  const listed = (countBy === 'charts'
    ?  chartboards.filter((cb)  =>  chartTier(cb, treatTieAsWin) === tab)
    :  chartboards
      .map((cb)  =>  withRivalsOrNull(cb, (r)  =>  resultTab(cb, r, treatTieAsWin) === tab))
      .filter((cb): cb is Chartboard  =>  cb !== null));

  return listed.sort(TAB_ORDER[tab]);
}
