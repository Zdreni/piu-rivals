import type { CSSProperties } from 'react';
import type { ChartRow } from './model.ts';
import type { CountBy } from './preferences.ts';
import { type LevelCounts, levelNum, levelStats, levelType, SIDE_TYPES, sortedLevels, STAT_WORDS } from './stats.ts';

type Stats = Record<string, { charts: LevelCounts; results: LevelCounts }>;


const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;


// One bar, split by the share of wins / not played / hidden losses / losses. Wins sit next to the level number and
// losses at the outer end, so singles grow to the left and doubles to the right.
function LevelBar({ level, side, stats, countBy, selected, heat, onSelect }: {
  level: string | undefined;
  side: 'single' | 'double';
  stats: Stats;
  countBy: CountBy;
  selected: boolean;
  heat: (n: number) => string;
  onSelect: (level: string) => void;
}) {
  if (! level)
    return <span className={`level-bar ${side} placeholder`} aria-hidden="true" />;

  const { charts: byCharts, results: byResults } = stats[level]!;
  const counts = stats[level]![countBy];
  // The hidden-losses segment has no number; its count is in the tooltip, which shows both countings.
  const part = (className: string, n: number, label: number | string = n, style: CSSProperties = {}) =>
    (n ? <span className={className} style={{ flexGrow: n, ...style }}>{label}</span> : null);

  const tipLine = (stat: keyof LevelCounts) => `\n${plural(byCharts[stat], `${STAT_WORDS.charts[stat]} chart`)}`
    + ` / ${plural(byResults[stat], `${STAT_WORDS.results[stat]} result`)}`;

  return (
    <button
      className={`level-bar ${side}${selected ? ' on' : ''}`}
      type="button"
      role="radio"
      aria-checked={selected}
      title={`${level}:${tipLine('lose')}${tipLine('hidden')}${tipLine('unplayed')}${tipLine('win')}`}
      onClick={() => onSelect(level)}
    >
      <span className="level-segs">
        {part('win', counts.win)}
        {part('unplayed', counts.unplayed)}
        {part('hidden-loss', counts.hidden, '')}
        {part('lose', counts.lose, counts.lose, { '--heat': heat(counts.lose) } as CSSProperties)}
      </span>
    </button>
  );
}


// The levels column: one bar per chart level, singles on the left and doubles on the right.
// `hiddenCharts` are the losses hidden by the score cap; they get their own dark segment.
// `countBy` picks what sizes and labels the segments.
export function ChartsGroups({ charts, hiddenCharts, selectedLevel, countBy, onSelect }: {
  charts: ChartRow[];
  hiddenCharts: ChartRow[];
  selectedLevel: string | null;
  countBy: CountBy;
  onSelect: (level: string) => void;
}) {
  const levels = sortedLevels([...charts, ...hiddenCharts]);
  const stats: Stats = {};
  for (const level of levels) {
    const atLevel = (chart: ChartRow) => chart.chart === level;
    stats[level] = levelStats(charts.filter(atLevel), hiddenCharts.filter(atLevel));
  }

  // A level's heat grows with the square of its losses, relative to the level with the most.
  const maxLose = Math.max(1, ...levels.map((level) => stats[level]![countBy].lose));
  const heat = (n: number) => ((n / maxLose) ** 2).toFixed(3);

  const sideLevels = levels.filter((level) => levelType(level) in SIDE_TYPES);
  const otherLevels = levels.filter((level) => ! (levelType(level) in SIDE_TYPES));
  // Every level between the highest and lowest gets a row, highest on top, so missing levels keep their place.
  const levelNums = sideLevels.map(levelNum);
  const minNum = Math.min(...levelNums), maxNum = Math.max(...levelNums);
  const nums = sideLevels.length ? Array.from({ length: maxNum - minNum + 1 }, (_, i) => maxNum - i) : [];
  const find = (type: string, num: number) => sideLevels.find((level) => levelType(level) === type  &&  levelNum(level) === num);
  const headOn = (type: string) => (selectedLevel !== null  &&  levelType(selectedLevel) === type ? ' on' : '');
  const bar = { stats, countBy, heat, onSelect };

  return (
    <div className="filters">
      <div className="level-chart" role="radiogroup" aria-label="Levels">
        <span className={`level-head single${headOn('S')}`}>Singles</span>
        <span />
        <span className={`level-head${headOn('D')}`}>Doubles</span>
        {nums.map((num) => {
          const single = find('S', num), double = find('D', num);
          const on = selectedLevel !== null  &&  (selectedLevel === single  ||  selectedLevel === double);
          return [
            <LevelBar key={`S${num}`} level={single} side="single" selected={single === selectedLevel} {...bar} />,
            <span key={num} className={`level-num${on ? ' on' : ''}`}>{num}</span>,
            <LevelBar key={`D${num}`} level={double} side="double" selected={double === selectedLevel} {...bar} />,
          ];
        })}
        {otherLevels.map((level) => (
          <div key={level} className="level-other">
            <span className={`level-num${level === selectedLevel ? ' on' : ''}`}>{level}</span>
            <LevelBar level={level} side="double" selected={level === selectedLevel} {...bar} />
          </div>
        ))}
      </div>
    </div>
  );
}
