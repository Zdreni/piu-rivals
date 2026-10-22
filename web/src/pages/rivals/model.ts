import type { BestResult, Chart } from '@piu-rivals/shared';
import { DEFAULT_MIN_LEVEL, type LevelRange, levelInRange, MAX_LEVEL, MAX_SCORE_CAP } from './preferences.ts';

// The level range when the settings don't apply.
export const DEFAULT_LEVELS: LevelRange = { minLevel: DEFAULT_MIN_LEVEL, maxLevel: MAX_LEVEL };

export interface Dates {
  bestScoreDate: string | null;
  lastTryDate: string | null;
}

// A rival's best score on a chart, compared with yours.
export interface RivalResult extends Dates {
  // The full name, with its "#1234" tag.
  player: string;
  playerId: string;
  score: number;
  // Positive = you're ahead. Null when you have no score. `delta` is capped by the score cap, `realDelta` is not.
  delta: number | null;
  realDelta: number | null;
}

export interface ChartRow {
  id: number;
  track: string;
  // Chart type and level, e.g. "D24".
  chart: string;
  mine: number | null;
  myDates: Dates;
  // Best score first.
  rivals: RivalResult[];
  unplayed: boolean;
  // How much the rivals beat you by: the sum of the square roots of the losses.
  weight: number;
}

// A player's best results by chart id.
export type PlayerBests = Map<number, BestResult>;


// Names carry a "#1234" tag suffix; it's left out when showing them.
export const displayName = (name: string) => name.replace(/\s*#\d{4}$/, '');


// Positive = you're ahead, same sign convention as PIU Scores. Scores above the cap compare as equal to it.
export const delta = (mine: number | null, theirs: number, cap = MAX_SCORE_CAP) =>
  (mine === null ? null : Math.min(mine, cap) - Math.min(theirs, cap));


export const targetWeight = (diffs: (number | null)[]) =>
  diffs.reduce<number>((acc, d) => acc + (d !== null  &&  d < 0 ? Math.sqrt(-d) : 0), 0);


export const byTargetWeight = (a: ChartRow, b: ChartRow) =>
  b.weight - a.weight  ||  Number(b.unplayed) - Number(a.unplayed)  ||  a.track.localeCompare(b.track);


export const leadWeight = (chart: ChartRow) =>
  chart.rivals.reduce((acc, rival) => acc + (rival.delta !== null  &&  rival.delta > 0 ? Math.sqrt(rival.delta) : 0), 0);


export const byLeadWeight = (a: ChartRow, b: ChartRow) => leadWeight(b) - leadWeight(a)  ||  a.track.localeCompare(b.track);


const dates = (best: BestResult | undefined): Dates =>
  ({ bestScoreDate: best?.bestPlayedOn  ??  null, lastTryDate: best?.lastPlayedOn  ??  null });


// Every chart in the `levels` range that at least one of `rivals` has a score on, with your score and theirs.
export function buildCharts(
  charts: Map<number, Chart>,
  bests: Map<string, PlayerBests>,
  ownPlayerId: string,
  rivals: { id: string; name: string }[],
  scoreCap: number,
  levels: LevelRange,
): ChartRow[] {
  const chartIds = new Set<number>();
  for (const rival of rivals) {
    for (const chartId of bests.get(rival.id)?.keys()  ??  [])
      chartIds.add(chartId);
  }

  const own = bests.get(ownPlayerId);
  const rows: ChartRow[] = [];
  for (const chartId of chartIds) {
    const chart = charts.get(chartId);
    if (! chart  ||  ! levelInRange(chart.level, levels))
      continue;

    const myBest = own?.get(chartId);
    const mine = myBest?.score  ??  null;
    const results = rivals.flatMap((rival): RivalResult[] => {
      const best = bests.get(rival.id)?.get(chartId);
      return best
        ? [{ player: rival.name, playerId: rival.id, score: best.score, ...dates(best),
          delta: delta(mine, best.score, scoreCap), realDelta: delta(mine, best.score) }]
        : [];
    }).sort((a, b) => b.score - a.score);

    rows.push({
      id: chartId,
      track: chart.songTitle,
      chart: `${chart.chartType}${chart.level}`,
      mine,
      myDates: dates(myBest),
      rivals: results,
      unplayed: mine === null,
      weight: targetWeight(results.map((rival) => rival.delta)),
    });
  }

  return rows;
}


// Returns the chart limited to rivals passing `keep`, or null when none remain.
export function withRivals(chart: ChartRow, keep: (rival: RivalResult) => boolean): ChartRow | null {
  const rivals = chart.rivals.filter(keep);
  if (rivals.length === chart.rivals.length)
    return chart;

  if (! rivals.length)
    return null;

  return { ...chart, rivals, weight: targetWeight(rivals.map((rival) => rival.delta)) };
}
