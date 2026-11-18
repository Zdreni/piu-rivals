import type { Chart } from '@piu-rivals/shared';
import { gradeGroup, type GradeGroup } from './grade_groups.ts';
import type { PlayerBests } from './model.ts';
import { type LevelRange, levelInRange } from './preferences.ts';

// A known chart with your best result on it, if any.
export interface ChartGrade {
  chartId: number;
  // The track's short name; `trackTitle` is its full one.
  track: string;
  trackTitle: string;
  // Chart type and level, e.g. "D24".
  chartLabel: string;
  // Null when you haven't played the chart.
  score: number | null;
  grade: string | null;
  passed: boolean;
  gradeGroup: GradeGroup;
  // The day you set your best score, if known.
  date: string | null;
  // How many of the compared rivals have a score on the chart.
  rivalCount: number;
}


// Every chart in the level range, known or with a best of yours. A chart of `myBests` is taken from `chartsOfBests`,
//  which has the latest short titles.
export function buildChartGrades(knownCharts: Map<number, Chart>, chartsOfBests: Map<number, Chart>, myBests: PlayerBests | undefined,
  rivalBests: PlayerBests[], levelRange: LevelRange): ChartGrade[] {
  const chartIds = new Set([...knownCharts.keys(), ...myBests?.keys()  ??  []]);
  const chartGrades: ChartGrade[] = [];
  for (const chartId of chartIds) {
    const chart = chartsOfBests.get(chartId)  ??  knownCharts.get(chartId);
    if (! chart  ||  ! levelInRange(chart.level, levelRange))
      continue;

    const best = myBests?.get(chartId);
    chartGrades.push({
      chartId,
      track: chart.songShortTitle,
      trackTitle: chart.songTitle,
      chartLabel: `${chart.chartType}${chart.level}`,
      score: best?.score  ??  null,
      grade: best?.grade  ??  null,
      passed: best?.passed  ??  false,
      gradeGroup: (best  ?  gradeGroup(best.grade, best.score, best.passed)  :  'unplayed'),
      date: best?.bestPlayedOn  ??  null,
      rivalCount: rivalBests.filter((bests)  =>  bests.has(chartId)).length,
    });
  }

  return chartGrades;
}


// Whether the chart's score is above the score cap, short of an FPC: it then matters as little as an FPC.
export const isAboveCap = (chartGrade: ChartGrade, scoreCap: number)  =>
  chartGrade.gradeGroup !== 'fpc'  &&  chartGrade.score !== null  &&  chartGrade.score > scoreCap;


// The worst score first, as better ones matter less.
export const byScore = (a: ChartGrade, b: ChartGrade)  =>  (a.score  ??  0) - (b.score  ??  0)  ||  a.track.localeCompare(b.track);


// The latest best first; those without a date last.
export const byNewestDate = (a: ChartGrade, b: ChartGrade)  =>  (b.date  ??  '').localeCompare(a.date  ??  '')  ||  a.track.localeCompare(b.track);


// The charts most rivals have played first.
export const byRivalCount = (a: ChartGrade, b: ChartGrade)  =>  b.rivalCount - a.rivalCount  ||  a.track.localeCompare(b.track);
