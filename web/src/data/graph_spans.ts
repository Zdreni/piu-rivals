import { type FoldedChartboard, listedEntries } from './folded_chartboard.ts';

// How far, in points, the cards' score graphs reach above your score and below it, so your score is at one height on
//  all of them and their heights compare.
export interface GraphScoreSpans {
  above: number;
  below: number;
}

// The share of the lowest results under yours that the graphs leave below their bottom edge, so a few far behind
//  don't flatten the rest.
const DROPPED_LOW_SHARE = 0.05;


// The spans of the graphs of `foldedChartboards` (see GraphScoreSpans), from the cards with your score.
export function graphScoreSpans(foldedChartboards: FoldedChartboard[]): GraphScoreSpans {
  const abovePoints: number[] = [];
  const belowPoints: number[] = [];
  for (const foldedChartboard of foldedChartboards) {
    const { mine } = foldedChartboard.chartboard;
    if (mine === null)
      continue;

    for (const entry of listedEntries(foldedChartboard)) {
      if (! entry.me)
        (entry.score > mine  ?  abovePoints  :  belowPoints).push(Math.abs(entry.score - mine));
    }
  }

  belowPoints.sort((a, b)  =>  a - b);
  const keptBelowPoints = belowPoints.slice(0, belowPoints.length - Math.floor(belowPoints.length * DROPPED_LOW_SHARE));
  return { above: Math.max(0, ...abovePoints), below: Math.max(0, ...keptBelowPoints) };
}
