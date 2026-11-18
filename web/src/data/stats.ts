import type { Chartboard, RivalResult } from './model.ts';
import type { CountBy } from './preferences.ts';

// "tie" is a result truly equal to yours; "hidden" a loss that the score cap alone turns into a tie, or a loss or
//  non-match on a snoozed chart (counted by charts: a chart you'd be inferior on without the cap, or a snoozed one).
export type Outcome = 'lose' | 'unplayed' | 'win' | 'tie' | 'hidden';
export type Counts = Record<Outcome, number>;
export type TabId = 'rivals-win' | 'not-played' | 'you-win' | 'tie' | 'hidden';

export const NO_COUNTS: Counts = { lose: 0, unplayed: 0, win: 0, tie: 0, hidden: 0 };

// The label of each outcome of a rival's result, and of a chart. Charts are never tied: a chart you're truly equal on
//  is superior.
export const RESULT_OUTCOME_LABELS = { lose: 'lost', unplayed: 'non-matched', win: 'won', tie: 'tied', hidden: 'hidden' };
export const CHART_OUTCOME_LABELS = { lose: 'inferior', unplayed: 'not played', win: 'superior', tie: 'tied', hidden: 'hidden' };

// Each tab is labelled with its outcome's label. "tie" is only a tab in the solo view.
export const TABS: TabId[] = ['rivals-win', 'not-played', 'you-win', 'tie', 'hidden'];

// The outcome each tab counts.
export const OUTCOME_BY_TAB = { 'rivals-win': 'lose', 'not-played': 'unplayed', 'you-win': 'win', tie: 'tie', hidden: 'hidden' } as const;

// The tab of each outcome.
export const TAB_BY_OUTCOME: Record<Outcome, TabId> = { lose: 'rivals-win', unplayed: 'not-played', win: 'you-win', tie: 'tie', hidden: 'hidden' };


// How a rival's result compares with yours, judged on the real scores. Only a loss is then checked against the
//  score cap: if the cap evens it out, it's hidden.
export function resultOutcome(rival: RivalResult): Outcome {
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
export function chartTier(chartboard: Chartboard, treatTieAsWin: boolean): TabId {
  if (chartboard.snoozedUntil !== null)
    return 'hidden';

  if (chartboard.unplayed)
    return 'not-played';

  const outcomes = chartboard.rivals.map(resultOutcome);
  if (outcomes.includes('lose'))
    return 'rivals-win';

  if (outcomes.includes('hidden'))
    return 'hidden';

  return ((! treatTieAsWin  &&  outcomes.includes('tie'))  ?  'tie'  :  'you-win');
}


export function tierCounts(chartboards: Chartboard[]): Counts {
  const counts = { ...NO_COUNTS };
  for (const chartboard of chartboards)
    counts[OUTCOME_BY_TAB[chartTier(chartboard, true)]]++;

  return counts;
}


// Each player's results in `chartboards` by outcome (see resultOutcome).
export function playerCounts(chartboards: Chartboard[]): Map<string, Counts> {
  const stats = new Map<string, Counts>();
  for (const chartboard of chartboards) {
    for (const rival of chartboard.rivals) {
      let counts = stats.get(rival.playerId);
      if (! counts)
        stats.set(rival.playerId, counts = { ...NO_COUNTS });

      counts[resultOutcome(rival)]++;
    }
  }

  return stats;
}


// The tab a rival's result in `chartboard` goes to, counted by results. On a snoozed chart, losses and non-matches are
//  hidden, as the score cap hides losses; wins and ties stay what they are. Ties are won with
//  `treatTieAsWin`; otherwise they get their own tab.
export function resultTab(chartboard: Chartboard, rival: RivalResult, treatTieAsWin: boolean): TabId {
  const outcome = resultOutcome(rival);
  if (chartboard.snoozedUntil !== null  &&  (outcome === 'lose'  ||  outcome === 'unplayed'))
    return 'hidden';

  return ((outcome === 'tie'  &&  treatTieAsWin)  ?  'you-win'  :  TAB_BY_OUTCOME[outcome]);
}


// Like tierCounts, but counts rival results instead of charts, whatever the chart's tier. Ties are won with
//  `treatTieAsWin`; otherwise they're counted on their own.
export function resultCounts(chartboards: Chartboard[], treatTieAsWin: boolean): Counts {
  const counts = { ...NO_COUNTS };
  for (const chartboard of chartboards) {
    for (const rival of chartboard.rivals)
      counts[OUTCOME_BY_TAB[resultTab(chartboard, rival, treatTieAsWin)]]++;
  }

  return counts;
}


// Totals counted the `countBy` way.
export const countCharts = (chartboards: Chartboard[], countBy: CountBy, treatTieAsWin: boolean)  =>
  (countBy === 'charts'  ?  tierCounts(chartboards)  :  resultCounts(chartboards, treatTieAsWin));


// Both countings of a level.
export const levelStats = (chartboards: Chartboard[], treatTieAsWin: boolean)  =>  ({ charts: tierCounts(chartboards), results: resultCounts(chartboards, treatTieAsWin) });


export const levelType = (level: string)  =>  (level.match(/^[A-Za-z-]+/)  ??  [level])[0];

export const levelNum = (level: string)  =>  parseInt((level.match(/\d+/)  ??  ['0'])[0], 10);

// Singles and doubles get the two sides of the level bars; other chart types are listed below them.
export const SIDE_TYPES: Record<string, number> = { S: 0, D: 1 };


export function compareLevels(a: string, b: string) {
  const ta = levelType(a), tb = levelType(b);
  return (SIDE_TYPES[ta]  ??  9) - (SIDE_TYPES[tb]  ??  9)
    ||  ta.localeCompare(tb)
    ||  levelNum(a) - levelNum(b);
}


export const sortedLevels = (chartboards: Chartboard[])  =>  [...new Set(chartboards.map((cb)  =>  cb.chartLabel))].sort(compareLevels);
