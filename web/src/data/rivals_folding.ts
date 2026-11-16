import type { Chartboard, RivalResult } from './model.ts';
import type { CountBy } from './preferences.ts';
import { resultOutcome, resultTab, type Outcome, type TabId } from './stats.ts';

// Which end of a fold a click on it shows first.
export type OpensFrom = 'top' | 'bottom';

// How a chart's card lists its rivals around your score. Without your score, all of them count as above it.
export interface RivalsFolding {
  isListed: (chartboard: Chartboard, rival: RivalResult) => boolean;
  above: { highestCount: number; closestCount: number; opensFrom: OpensFrom };
  below: { closestCount: number; lowestCount: number; opensFrom: OpensFrom };
  colorByRealDiff: boolean;
  dimmedOutcomes: Outcome[];
  treatTieAsWin: boolean;
}

export const ALL = Infinity;

// How many rival scores a card lists, besides yours, until it's expanded.
const LISTED_RIVAL_COUNTS = {
  desktop: { unplayed: 6, played: 6 },
  mobile: { unplayed: 4, played: 3 },
};

// History cards list the rivals closest to your score, mostly those still above it.
const HISTORY_LISTED_RIVAL_COUNTS = { above: 3, below: 1 };

// The results a lost or won card folds besides its tab's own, so it still shows how many rivals are on the other
//  side of your score. A won card folds those who beat you only without the score cap too, as they're above you on
//  the expanded card.
const FOLDED_OUTCOMES: Partial<Record<TabId, Outcome[]>> = { 'rivals-win': ['win', 'tie'], 'you-win': ['lose', 'hidden'] };

const isAnyRival = ()  =>  true;

const LIST_ALL_BELOW: RivalsFolding['below'] = { closestCount: ALL, lowestCount: ALL, opensFrom: 'top' };


// The results a card of the tab's charts dims: those you beat or tie, but on the tabs that are about them.
const DIMMED_OUTCOMES: Partial<Record<TabId, Outcome[]>> = { 'you-win': [], tie: ['win'] };


// How a card of the tab's charts colours its scores (see RivalsFolding).
const cardColors = (tab: TabId, treatTieAsWin: boolean)  =>  ({
  colorByRealDiff: tab === 'hidden',
  dimmedOutcomes: DIMMED_OUTCOMES[tab]  ??  ['win', 'tie'],
  treatTieAsWin,
});


// How many rivals a card lists on each side of your score (see rivalsFolding), with `listedRivalCounts` its counts on this screen.
function listedSides(tab: TabId, listedRivalCounts: typeof LISTED_RIVAL_COUNTS.desktop, maximized: boolean)
  : Pick<RivalsFolding, 'above' | 'below'> {
  if (tab === 'rivals-win'  ||  tab === 'hidden') {
    return {
      above: { highestCount: (maximized  ?  ALL  :  listedRivalCounts.played), closestCount: 0, opensFrom: 'top' },
      below: { closestCount: 0, lowestCount: 0, opensFrom: 'top' },
    };
  }

  if (tab === 'you-win') {
    return {
      above: { highestCount: 0, closestCount: 0, opensFrom: 'bottom' },
      below: { closestCount: (maximized  ?  ALL  :  listedRivalCounts.played), lowestCount: 0, opensFrom: 'top' },
    };
  }

  if (tab === 'not-played') {
    return { above: { highestCount: 0, closestCount: (maximized  ?  ALL  :  listedRivalCounts.unplayed), opensFrom: 'top' }, below: LIST_ALL_BELOW };
  }

  return { above: { highestCount: ALL, closestCount: ALL, opensFrom: 'top' }, below: LIST_ALL_BELOW };
}


// How a card of the tab's charts lists and folds its rivals. Lost and won cards also fold the other side's results
//  (see FOLDED_OUTCOMES); counted by results, other cards list only their tab's results.
// `maximized`, a card lists all its chart's rivals, folding only the other side's.
export function rivalsFolding(tab: TabId, { countBy, treatTieAsWin, inMobileView, maximized }: {
  countBy: CountBy;
  treatTieAsWin: boolean;
  inMobileView: boolean;
  maximized: boolean;
}): RivalsFolding {
  const foldedOutcomes = FOLDED_OUTCOMES[tab];
  const isListed = ((maximized  ||  (countBy === 'charts'  &&  ! foldedOutcomes))
    ?  isAnyRival
    :  (chartboard: Chartboard, rival: RivalResult)  =>  resultTab(chartboard, rival, treatTieAsWin) === tab  ||  !! foldedOutcomes?.includes(resultOutcome(rival)));

  const listedRivalCounts = LISTED_RIVAL_COUNTS[(inMobileView  ?  'mobile'  :  'desktop')];
  return { isListed, ...listedSides(tab, listedRivalCounts, maximized), ...cardColors(tab, treatTieAsWin) };
}


// How a History card of a chart of the `tier` lists its rivals: those closest to your score (see
//  HISTORY_LISTED_RIVAL_COUNTS), whatever their results, coloured like in its tab.
export function historyRivalsFolding(tier: TabId): RivalsFolding {
  return {
    isListed: isAnyRival,
    above: { highestCount: 0, closestCount: HISTORY_LISTED_RIVAL_COUNTS.above, opensFrom: 'bottom' },
    below: { closestCount: HISTORY_LISTED_RIVAL_COUNTS.below, lowestCount: 0, opensFrom: 'top' },
    ...cardColors(tier, true),
  };
}
