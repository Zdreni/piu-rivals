import type { Chartboard, RivalResult } from './model.ts';
import type { CountBy } from './preferences.ts';

// "tie" is a result truly equal to yours; "hidden" a loss that the score cap alone turns into a tie, or a loss or
//  non-match on a snoozed chart (counted by charts: a chart you'd be inferior on without the cap, or a snoozed one).
export type Stat = 'lose' | 'unplayed' | 'win' | 'tie' | 'hidden';
export type Counts = Record<Stat, number>;
export type TabId = 'rivals-win' | 'not-played' | 'you-win' | 'tie' | 'hidden';

export const NO_COUNTS: Counts = { lose: 0, unplayed: 0, win: 0, tie: 0, hidden: 0 };

// The word for each stat, by the count by setting. Charts are never tied: a chart you're truly equal on is superior.
export const STAT_WORDS = {
  results: { lose: 'lost', unplayed: 'non-matched', win: 'won', tie: 'tied', hidden: 'hidden' },
  charts: { lose: 'inferior', unplayed: 'not played', win: 'superior', tie: 'tied', hidden: 'hidden' },
};

// Each tab is labelled with the word of its stat. "tie" is only a tab in the solo view.
export const TABS: TabId[] = ['rivals-win', 'not-played', 'you-win', 'tie', 'hidden'];

// The stat each tab counts.
export const TIER_STAT = { 'rivals-win': 'lose', 'not-played': 'unplayed', 'you-win': 'win', tie: 'tie', hidden: 'hidden' } as const;

// The tab of each stat.
const STAT_TAB: Record<Stat, TabId> = { lose: 'rivals-win', unplayed: 'not-played', win: 'you-win', tie: 'tie', hidden: 'hidden' };


// How a rival's result compares with yours, judged on the real scores. Only a loss is then checked against the
//  score cap: if the cap evens it out, it's hidden.
export function resultStat(rival: RivalResult): Stat {
  if (rival.realDelta === null  ||  rival.delta === null)
    return 'unplayed';

  if (rival.realDelta < 0)
    return (rival.delta < 0  ?  'lose'  :  'hidden');

  return (rival.realDelta === 0  ?  'tie'  :  'win');
}


// The one tab a chart goes to, judged on the real scores: inferior if any rival beats you, superior otherwise
//  (or, unless `treatTieAsWin`, tied if any rival is truly equal). Only an inferior chart is then checked
//  against the score cap: if the cap evens out every loss, it's hidden. Unplayed charts are np. A snoozed chart is
//  hidden, whatever its scores.
export function chartTier(chartboard: Chartboard, treatTieAsWin = true): TabId {
  if (chartboard.snoozedUntil !== null)
    return 'hidden';

  if (chartboard.unplayed)
    return 'not-played';

  const stats = chartboard.rivals.map(resultStat);
  if (stats.includes('lose'))
    return 'rivals-win';

  if (stats.includes('hidden'))
    return 'hidden';

  return ((! treatTieAsWin  &&  stats.includes('tie'))  ?  'tie'  :  'you-win');
}


export function tierCounts(chartboards: Chartboard[]): Counts {
  const counts = { ...NO_COUNTS };
  for (const chartboard of chartboards)
    counts[TIER_STAT[chartTier(chartboard)]]++;

  return counts;
}


// Each rival's results lost / non-matched / won, judged on the real scores, with none of the settings applied (a
//  true tie counts as won).
export function realCounts(chartboards: Chartboard[]): Map<string, Counts> {
  const stats = new Map<string, Counts>();
  for (const chartboard of chartboards) {
    for (const rival of chartboard.rivals) {
      let counts = stats.get(rival.playerId);
      if (! counts)
        stats.set(rival.playerId, counts = { ...NO_COUNTS });

      counts[rival.realDelta === null  ?  'unplayed'  :  rival.realDelta < 0  ?  'lose'  :  'win']++;
    }
  }

  return stats;
}


// The tab a rival's result in `chartboard` goes to, counted by results. On a snoozed chart, losses and non-matches are
//  hidden, as the score cap hides losses; wins and ties stay what they are. Ties are won with
//  `treatTieAsWin`; otherwise they get their own tab.
export function resultTab(chartboard: Chartboard, rival: RivalResult, treatTieAsWin = true): TabId {
  const stat = resultStat(rival);
  if (chartboard.snoozedUntil !== null  &&  (stat === 'lose'  ||  stat === 'unplayed'))
    return 'hidden';

  return ((stat === 'tie'  &&  treatTieAsWin)  ?  'you-win'  :  STAT_TAB[stat]);
}


// Like tierCounts, but counts rival results instead of charts, whatever the chart's tier. Ties are won with
//  `treatTieAsWin`; otherwise they're counted on their own.
export function resultCounts(chartboards: Chartboard[], treatTieAsWin = true): Counts {
  const counts = { ...NO_COUNTS };
  for (const chartboard of chartboards) {
    for (const rival of chartboard.rivals)
      counts[TIER_STAT[resultTab(chartboard, rival, treatTieAsWin)]]++;
  }

  return counts;
}


// Totals counted the `countBy` way.
export const countCharts = (chartboards: Chartboard[], countBy: CountBy, treatTieAsWin = true)  =>
  (countBy === 'charts'  ?  tierCounts(chartboards)  :  resultCounts(chartboards, treatTieAsWin));


// Both countings of a level.
export const levelStats = (chartboards: Chartboard[], treatTieAsWin = true)  =>  ({ charts: tierCounts(chartboards), results: resultCounts(chartboards, treatTieAsWin) });


export const levelType = (level: string)  =>  (level.match(/^[A-Za-z-]+/)  ??  [level])[0];

export const levelNum = (level: string)  =>  parseInt((level.match(/\d+/)  ??  ['0'])[0], 10);

// Singles and doubles get the two sides of the level bars; other chart types are listed below them.
export const SIDE_TYPES: Record<string, number> = { S: 0, D: 1 };


function compareLevels(a: string, b: string) {
  const ta = levelType(a), tb = levelType(b);
  return (SIDE_TYPES[ta]  ??  9) - (SIDE_TYPES[tb]  ??  9)
    ||  ta.localeCompare(tb)
    ||  levelNum(a) - levelNum(b);
}


export const sortedLevels = (chartboards: Chartboard[])  =>  [...new Set(chartboards.map((cb)  =>  cb.chartLabel))].sort(compareLevels);
