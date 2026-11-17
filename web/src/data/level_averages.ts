import type { Chart } from '@piu-rivals/shared';
import type { PlayerBests } from './model.ts';
import { type LevelRange, levelInRange } from './preferences.ts';

// A player's average best score on the charts of one level they have a score on.
export interface LevelAverage {
  average: number;
  chartCount: number;
}


// The player's average best score at each level of `chartType` ("S", "D") in `levelRange`, by level. Real scores, with no
//  score cap; broken plays count too.
export function levelAverages(charts: Map<number, Chart>, playerBests: PlayerBests | undefined, chartType: string,
  levelRange: LevelRange): Map<number, LevelAverage> {
  const sums = new Map<number, { total: number; chartCount: number }>();
  for (const best of playerBests?.values()  ??  []) {
    const chart = charts.get(best.chartId);
    if (! chart  ||  chart.chartType !== chartType  ||  ! levelInRange(chart.level, levelRange))
      continue;

    const sum = sums.get(chart.level)  ??  { total: 0, chartCount: 0 };
    sum.total += best.score;
    sum.chartCount++;
    sums.set(chart.level, sum);
  }

  return new Map([...sums].map(([level, { total, chartCount }])  =>  [level, { average: total / chartCount, chartCount }]));
}


// Every level from the lowest to the highest any of `levelAveragesList` has, gaps included.
export function graphLevels(levelAveragesList: Map<number, LevelAverage>[]): number[] {
  const levels = levelAveragesList.flatMap((averages)  =>  [...averages.keys()]);
  if (! levels.length)
    return [];

  const lowestLevel = Math.min(...levels);
  return Array.from({ length: Math.max(...levels) - lowestLevel + 1 }, (_, i)  =>  lowestLevel + i);
}
