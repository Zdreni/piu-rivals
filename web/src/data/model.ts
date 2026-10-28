import type { BestResult, Chart } from '@piu-rivals/shared';
import { DEFAULT_MIN_LEVEL, type LevelRange, levelInRange, MAX_LEVEL, MAX_SCORE_CAP } from './preferences.ts';

// The level range when the settings don't apply.
export const DEFAULT_LEVELS: LevelRange = { minLevel: DEFAULT_MIN_LEVEL, maxLevel: MAX_LEVEL };

// The judgment counts of a best score, and its max combo if known; null when its play has no counts (some older
// imports).
export interface Judgments {
  perfect: number;
  great: number;
  good: number;
  bad: number;
  miss: number;
  maxCombo: number | null;
}

export const judgments = (best: BestResult): Judgments | null  =>
  ((best.perfect === null  ||  best.great === null  ||  best.good === null  ||  best.bad === null  ||  best.miss === null)
    ?  null
    :  { perfect: best.perfect, great: best.great, good: best.good, bad: best.bad, miss: best.miss, maxCombo: best.maxCombo });

// A rival's best score on a chart, compared with yours.
export interface RivalResult {
  // The full name, with its "#1234" tag.
  player: string;
  playerId: string;
  score: number;
  // The day the best score was set, if known.
  date: string | null;
  judgments: Judgments | null;
  // Positive = you're ahead. Null when you have no score. `delta` is capped by the score cap, `realDelta` is not.
  delta: number | null;
  realDelta: number | null;
}

export interface ChartRow {
  id: number;
  // The track's short name; `trackTitle` is its full one.
  track: string;
  trackTitle: string;
  // Chart type and level, e.g. "D24".
  chart: string;
  mine: number | null;
  // The day you set your best score, if known, and its judgments.
  myDate: string | null;
  myJudgments: Judgments | null;
  // How much your best score rose over your previous one; null for your first score on the chart.
  myImprovement: number | null;
  // Best score first.
  rivals: RivalResult[];
  unplayed: boolean;
  // How much the rivals beat you by: the sum of the square roots of the losses.
  weight: number;
  // When the chart wakes, in ms since epoch, while you have it snoozed: until then it's hidden, whatever its scores.
  snoozedUntil: number | null;
}

// A player's best results by chart id.
export type PlayerBests = Map<number, BestResult>;


// Names carry a "#1234" tag suffix; it's left out when showing them.
export const displayName = (name: string)  =>  name.replace(/\s*#\d{4}$/, '');


// Positive = you're ahead, same sign convention as PIU Scores. Scores above the cap compare as equal to it.
export const delta = (mine: number | null, theirs: number, cap = MAX_SCORE_CAP)  =>
  (mine === null  ?  null  :  Math.min(mine, cap) - Math.min(theirs, cap));


export const targetWeight = (diffs: (number | null)[])  =>
  diffs.reduce<number>((acc, d)  =>  acc + ((d !== null  &&  d < 0)  ?  Math.sqrt(-d)  :  0), 0);


export const byTargetWeight = (a: ChartRow, b: ChartRow)  =>
  b.weight - a.weight  ||  Number(b.unplayed) - Number(a.unplayed)  ||  a.track.localeCompare(b.track);


export const leadWeight = (chart: ChartRow)  =>
  chart.rivals.reduce((acc, r)  =>  acc + ((r.delta !== null  &&  r.delta > 0)  ?  Math.sqrt(r.delta)  :  0), 0);


export const byLeadWeight = (a: ChartRow, b: ChartRow)  =>  leadWeight(b) - leadWeight(a)  ||  a.track.localeCompare(b.track);




// Every chart in the `levels` range that at least one of `rivals` has a score on, with your score and theirs. With
// `ownCharts`, also the ones only you have a score on.
export function buildCharts(
  charts: Map<number, Chart>,
  bests: Map<string, PlayerBests>,
  ownPlayerId: string,
  rivals: { id: string; name: string }[],
  scoreCap: number,
  levels: LevelRange,
  ownCharts = false,
): ChartRow[] {
  const ownBests = bests.get(ownPlayerId);
  const chartIds = new Set<number>((ownCharts  ?  ownBests?.keys()  :  []));
  for (const rival of rivals) {
    for (const chartId of bests.get(rival.id)?.keys()  ??  [])
      chartIds.add(chartId);
  }

  const rows: ChartRow[] = [];
  for (const chartId of chartIds) {
    const chart = charts.get(chartId);
    if (! chart  ||  ! levelInRange(chart.level, levels))
      continue;

    const myBest = ownBests?.get(chartId);
    const mine = myBest?.score  ??  null;
    const rivalResults = rivals.flatMap((rival): RivalResult[]  => {
      const best = bests.get(rival.id)?.get(chartId);
      return (best
        ?  [{ player: rival.name, playerId: rival.id, score: best.score, date: best.bestPlayedOn, judgments: judgments(best),
          delta: delta(mine, best.score, scoreCap), realDelta: delta(mine, best.score) }]
        :  []);
    }).sort((a, b)  =>  b.score - a.score);

    rows.push({
      id: chartId,
      track: chart.songShortTitle,
      trackTitle: chart.songTitle,
      chart: `${chart.chartType}${chart.level}`,
      mine,
      myDate: myBest?.bestPlayedOn  ??  null,
      myJudgments: (myBest  ?  judgments(myBest)  :  null),
      myImprovement: myBest?.improvement  ??  null,
      rivals: rivalResults,
      unplayed: mine === null,
      weight: targetWeight(rivalResults.map((r)  =>  r.delta)),
      snoozedUntil: null,
    });
  }

  return rows;
}


// Returns the chart limited to rivals passing `keep`, or null when none remain.
export function withRivalsOrNull(chart: ChartRow, keep: (rival: RivalResult) => boolean): ChartRow | null {
  const rivals = chart.rivals.filter(keep);
  if (rivals.length === chart.rivals.length)
    return chart;

  if (! rivals.length)
    return null;

  return { ...chart, rivals, weight: targetWeight(rivals.map((r)  =>  r.delta)) };
}
