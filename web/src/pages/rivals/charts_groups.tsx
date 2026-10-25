import type { CSSProperties } from 'react';
import type { SidePanel } from './layout.ts';
import type { ChartRow } from './model.ts';
import type { CountBy } from './preferences.ts';
import { type Counts, levelNum, levelStats, levelType, SIDE_TYPES, sortedLevels, STAT_WORDS } from './stats.ts';

type Stats = Record<string, { charts: Counts; results: Counts }>;


const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;


// One bar, split by the share of wins / ties / not played / hidden / losses. Wins sit next to the level number and
// losses at the outer end, so singles grow to the left and doubles to the right. Ties get a segment only with
// `showTies`. The not played segment grows with its count to the power of 1 / 1.5, so many unplayed charts don't
// crowd out the rest.
function LevelBar({ level, side, stats, countBy, showTies, selected, heat, onSelect }: {
  level: string | undefined;
  side: 'single' | 'double';
  stats: Stats;
  countBy: CountBy;
  showTies: boolean;
  selected: boolean;
  heat: (n: number) => string;
  onSelect: (level: string) => void;
}) {
  if (! level)
    return <span className={`level-bar ${side} placeholder`} aria-hidden="true" />;

  const { charts: byCharts, results: byResults } = stats[level]!;
  const counts = stats[level]![countBy];
  // The hidden segment has no number; its count is in the tooltip, which shows both countings. Charts are never tied.
  // A segment shows at least 5% of the bar and never less than its label with 5% of the bar, up to 6px, on either side,
  // so narrow bars keep room for their labels; digits are 1ch each. Unlabeled segments need only their 5%.
  // CSS can size the labels in % of the bar with --digit and --label-pad, for bars that hide them.
  const labelWidth = (label: number | string) =>
    (String(label).length ? `${String(label).length} * var(--digit, 1ch) + 2 * min(var(--label-pad, 6px), 5%)` : '0px');
  const part = (className: string, n: number, label: number | string = n, style: CSSProperties = {}, grow = n) =>
    (n ? <span className={className} style={{ flexGrow: grow, minWidth: `calc(max(5%, ${labelWidth(label)}) + var(--overlap))`, ...style }}>
      {label}
    </span> : null);

  const tipLine = (stat: keyof Counts) => `\n${plural(byCharts[stat], `${STAT_WORDS.charts[stat]} chart`)}`
    + ` / ${plural(byResults[stat], `${STAT_WORDS.results[stat]} result`)}`;
  const tieLine = showTies ? `\n${plural(byResults.tie, `${STAT_WORDS.results.tie} result`)}` : '';

  return (
    <button
      className={`level-bar ${side}${selected ? ' on' : ''}`}
      type="button"
      role="radio"
      aria-checked={selected}
      title={`${level}:${tipLine('lose')}${tipLine('hidden')}${tipLine('unplayed')}${tieLine}${tipLine('win')}`}
      onClick={() => onSelect(level)}
    >
      <span className="level-segs">
        {part('win', counts.win)}
        {showTies  &&  part('tie', counts.tie)}
        {part('unplayed', counts.unplayed, counts.unplayed, {}, counts.unplayed ** (1 / 1.5))}
        {part('hidden-loss', counts.hidden, '')}
        {part('lose', counts.lose, counts.lose, { '--heat': heat(counts.lose) } as CSSProperties)}
      </span>
    </button>
  );
}


// The levels column: one bar per chart level, singles on the left and doubles on the right.
// What the score cap hides gets its own dark segment. `countBy` picks what sizes and labels the segments;
// `showTies` gives ties their own segment (counted by results). The top bar's buttons slide the
// rivals or the preferences in from the left (`sidePanel`, the one that's in) and out again.
export function ChartsGroups({ charts, selectedLevel, countBy, showTies, sidePanel, onSelect, onToggleSide }: {
  charts: ChartRow[];
  selectedLevel: string | null;
  countBy: CountBy;
  showTies: boolean;
  sidePanel: SidePanel | null;
  onSelect: (level: string) => void;
  onToggleSide: (panel: SidePanel) => void;
}) {
  const levels = sortedLevels(charts);
  const stats: Stats = {};
  for (const level of levels)
    stats[level] = levelStats(charts.filter((chart) => chart.chart === level));

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
  const bar = { stats, countBy, showTies: showTies  &&  countBy === 'results', heat, onSelect };

  return (
    <div className="filters">
      {/* A bar as tall as the results' tabs, which stays put while the levels below it scroll. */}
      <div className="level-top">
        <button className={`panel-toggle${sidePanel === 'rivals' ? ' on' : ''}`} type="button"
          aria-expanded={sidePanel === 'rivals'} onClick={() => onToggleSide('rivals')}>
          <svg viewBox="0 0 8 12" aria-hidden="true"><path d={sidePanel === 'rivals' ? 'M6 1 1 6l5 5' : 'M2 1l5 5-5 5'} /></svg>
          Rivals
        </button>
        <button className={`panel-toggle prefs-toggle${sidePanel === 'preferences' ? ' on' : ''}`} type="button"
          aria-label="Preferences" title="Preferences" aria-expanded={sidePanel === 'preferences'} onClick={() => onToggleSide('preferences')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h12" />
            <circle cx="16" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
          </svg>
        </button>
      </div>
      <div className="level-scroll">
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
    </div>
  );
}
