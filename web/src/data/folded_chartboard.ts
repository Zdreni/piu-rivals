import type { Chartboard, RivalResult } from './model.ts';
import type { OpensFrom, RivalsFolding } from './rivals_folding.ts';

// A score in a chart's card: a rival's, or yours.
export type Entry = (RivalResult & { me?: false }) | { me: true; score: number };

// Rivals folded on one side of your score, by score, in their place in the list.
export interface RivalsFold {
  id: 'above' | 'below';
  rivals: Entry[];
  opensFrom: OpensFrom;
}

// One item of a card's list: a score, or a fold of rivals.
export type RivalsListItem = { entry: Entry } | { fold: RivalsFold };

// A chartboard as its card shows it: its scores and folds in order, best first, and how it colours them (see
//  RivalsFolding).
export interface FoldedChartboard {
  chartboard: Chartboard;
  items: RivalsListItem[];
  colorByRealDiff: boolean;
  dimWon: boolean;
  treatTieAsWin: boolean;
}

// How many rivals each of a card's folds has unfolded.
export type UnfoldedRivalCounts = Record<RivalsFold['id'], number>;

export const NO_UNFOLDED_RIVALS: UnfoldedRivalCounts = { above: 0, below: 0 };

// Each click on a fold lists this many more of its rivals.
export const SHOW_STEP = 10;


// `entries` with the `first` of them listed, the ones between folded, then the `last`. A single rival isn't
//  folded, since its button would take as much room as its row.
function foldBetween(entries: Entry[], first: number, last: number, id: RivalsFold['id'], opensFrom: OpensFrom): RivalsListItem[] {
  const foldedRivalCount = entries.length - first - last;
  if (foldedRivalCount < 2)
    return entries.map((entry)  =>  ({ entry }));

  return [
    ...entries.slice(0, first).map((entry)  =>  ({ entry })),
    { fold: { id, rivals: entries.slice(first, first + foldedRivalCount), opensFrom } },
    ...entries.slice(first + foldedRivalCount).map((entry)  =>  ({ entry })),
  ];
}


// `chartboard` with its rivals listed and folded by `folding`.
export function foldChartboard(chartboard: Chartboard, folding: RivalsFolding): FoldedChartboard {
  const entries: Entry[] = chartboard.rivals.filter((r)  =>  folding.isListed(chartboard, r));
  if (chartboard.mine !== null)
    entries.push({ me: true, score: chartboard.mine });

  entries.sort((a, b)  =>  b.score - a.score  ||  Number(!! b.me) - Number(!! a.me));

  // Without your score, every rival is above it.
  const myIndex = entries.findIndex((e)  =>  e.me);
  const aboveRivalCount = (myIndex === -1  ?  entries.length  :  myIndex);
  const { above, below } = folding;
  const items = [
    ...foldBetween(entries.slice(0, aboveRivalCount), above.highestCount, above.closestCount, 'above', above.opensFrom),
    ...entries.slice(aboveRivalCount, aboveRivalCount + 1).map((entry)  =>  ({ entry })),
    ...foldBetween(entries.slice(aboveRivalCount + 1), below.closestCount, below.lowestCount, 'below', below.opensFrom),
  ];

  return { chartboard, items, colorByRealDiff: folding.colorByRealDiff, dimWon: folding.dimWon, treatTieAsWin: folding.treatTieAsWin };
}


// `fold` with `unfoldedRivalCount` of its rivals unfolded from its `opensFrom` end: those rivals, and the ones still
//  folded. A single rival left isn't kept folded (see foldBetween).
export function unfold(fold: RivalsFold, unfoldedRivalCount: number) {
  const foldedRivalCount = fold.rivals.length - unfoldedRivalCount;
  if (foldedRivalCount < 2)
    return { shownRivals: fold.rivals, foldedRivals: [] };

  return (fold.opensFrom === 'top'
    ?  { shownRivals: fold.rivals.slice(0, unfoldedRivalCount), foldedRivals: fold.rivals.slice(unfoldedRivalCount) }
    :  { shownRivals: fold.rivals.slice(foldedRivalCount), foldedRivals: fold.rivals.slice(0, foldedRivalCount) });
}
