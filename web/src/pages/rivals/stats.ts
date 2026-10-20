import type { ChartRow, RivalResult } from './model.ts';

export type Stat = 'lose' | 'unplayed' | 'win';
export type Counts = Record<Stat, number>;
export type LevelCounts = Counts & { hidden: number };
export type TabId = 'rivals-win' | 'not-played' | 'you-win' | 'hidden';

// The word for each stat, by the count by setting.
export const STAT_WORDS = {
  results: { lose: 'lost', unplayed: 'non-matched', win: 'won', hidden: 'hidden' },
  charts: { lose: 'inferior', unplayed: 'not played', win: 'superior', hidden: 'hidden' },
};

// Each tab is labelled with the word of its stat. "hidden" holds losses hidden by the score cap; it's never a chartTier.
export const TABS: TabId[] = ['rivals-win', 'not-played', 'you-win', 'hidden'];

// The stat each tab counts.
export const TIER_STAT = { 'rivals-win': 'lose', 'not-played': 'unplayed', 'you-win': 'win', hidden: 'hidden' } as const;


export const chartTier = (chart: ChartRow): Exclude<TabId, 'hidden'> =>
  (chart.weight > 0 ? 'rivals-win' : chart.unplayed ? 'not-played' : 'you-win');


export function tierCounts(charts: ChartRow[]): Counts {
  const counts = { lose: 0, win: 0, unplayed: 0 };
  for (const chart of charts)
    counts[TIER_STAT[chartTier(chart)]]++;

  return counts;
}


// Like tierCounts, but counts rival results instead of charts, whatever the chart's tier: on played charts
// every rival either beats you or you beat them (draws count as neither), and on np charts every rival result is np.
// `diff` picks the difference to judge by, e.g. the uncapped one.
export function resultCounts(charts: ChartRow[], diff = (rival: RivalResult) => rival.delta): Counts {
  const counts = { lose: 0, win: 0, unplayed: 0 };
  for (const chart of charts) {
    for (const rival of chart.rivals) {
      const d = diff(rival);
      if (d !== 0)
        counts[d === null ? 'unplayed' : d < 0 ? 'lose' : 'win']++;
    }
  }

  return counts;
}


// Both countings of a level. `hiddenCharts` are its losses hidden by the score cap. They are judged uncapped,
// so score-cap losses count as hidden losses, while the rivals you beat on them still count as yours.
export function levelStats(charts: ChartRow[], hiddenCharts: ChartRow[]): { charts: LevelCounts; results: LevelCounts } {
  const shown = resultCounts(charts);
  const hidden = resultCounts(hiddenCharts, (rival) => rival.realDelta);
  return {
    charts: { ...tierCounts(charts), hidden: hiddenCharts.length },
    results: { lose: shown.lose, unplayed: shown.unplayed, win: shown.win + hidden.win, hidden: hidden.lose },
  };
}


export const levelType = (level: string) => (level.match(/^[A-Za-z-]+/)  ??  [level])[0];

export const levelNum = (level: string) => parseInt((level.match(/\d+/)  ??  ['0'])[0], 10);

// Singles and doubles get the two sides of the level bars; other chart types are listed below them.
export const SIDE_TYPES: Record<string, number> = { S: 0, D: 1 };


function compareLevels(a: string, b: string) {
  const ta = levelType(a), tb = levelType(b);
  return (SIDE_TYPES[ta]  ??  9) - (SIDE_TYPES[tb]  ??  9)
    ||  ta.localeCompare(tb)
    ||  levelNum(a) - levelNum(b);
}


export const sortedLevels = (charts: ChartRow[]) => [...new Set(charts.map((chart) => chart.chart))].sort(compareLevels);
