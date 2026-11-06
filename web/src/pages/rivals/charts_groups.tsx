import type { CSSProperties } from 'react';
import type { SidePanel } from './side_panel_control.ts';
import type { Chartboard } from '../../data/model.ts';
import type { CountBy } from '../../data/preferences.ts';
import { type Counts, levelNum, levelStats, levelType, SIDE_TYPES, sortedLevels, STAT_WORDS } from '../../data/stats.ts';

type Stats = Record<string, { charts: Counts; results: Counts }>;


const plural = (n: number, word: string)  =>  `${n} ${word}${(n === 1  ?  ''  :  's')}`;


// One level's bar, split by results, wins next to the level number. The not played segment grows with its count to
//  the power of 1 / 1.5, so many unplayed charts don't crowd out the rest.
function LevelBar({ level, side, stats, countBy, treatTieAsWin, selected, heat, onSelect }: {
  level: string | undefined;
  side: 'single' | 'double';
  stats: Stats;
  countBy: CountBy;
  treatTieAsWin: boolean;
  selected: boolean;
  heat: (n: number) => string;
  onSelect: (level: string) => void;
}) {
  if (! level)
    return <span className={`level-bar ${side} placeholder`} aria-hidden="true" />;

  const { charts: byCharts, results: byResults } = stats[level]!;
  const counts = stats[level]![countBy];
  // Narrow bars still need room for their labels, so a labelled segment never gets less than its label, plus a little
  //  padding; any segment gets at least 5% of the bar. Bars that hide their labels size them in % of the bar with
  //  --digit and --label-pad.
  // The hidden segment's count is only in its tooltip, which shows both countings. Charts are never tied.
  const labelWidth = (label: number | string)  =>
    (String(label).length  ?  `${String(label).length} * var(--digit, 1ch) + 2 * min(var(--label-pad, 6px), 5%)`  :  '0px');

  const renderSegment = (className: string, n: number, label: number | string = n, style: CSSProperties = {}, grow = n)  =>
    (n  ?  <span className={className} style={{ flexGrow: grow, minWidth: `calc(max(5%, ${labelWidth(label)}) + var(--overlap))`, ...style }}>
      {label}
    </span>  :  null);

  const tipLine = (stat: keyof Counts)  =>  `\n${plural(byCharts[stat], `${STAT_WORDS.charts[stat]} chart`)}`
    + ` / ${plural(byResults[stat], `${STAT_WORDS.results[stat]} result`)}`;

  const tieLine = (treatTieAsWin  ?  ''  :  `\n${plural(byResults.tie, `${STAT_WORDS.results.tie} result`)}`);

  return (
    <button
      className={`level-bar ${side}${(selected  ?  ' on'  :  '')}`}
      type="button"
      role="radio"
      aria-checked={selected}
      title={`${level}:${tipLine('lose')}${tipLine('hidden')}${tipLine('unplayed')}${tieLine}${tipLine('win')}`}
      onClick={()  =>  onSelect(level)}
    >
      <span className="level-segs">
        {renderSegment('win', counts.win)}
        {! treatTieAsWin  &&  renderSegment('tie', counts.tie)}
        {renderSegment('unplayed', counts.unplayed, counts.unplayed, {}, counts.unplayed ** (1 / 1.5))}
        {renderSegment('hidden-loss', counts.hidden, '')}
        {renderSegment('lose', counts.lose, counts.lose, { '--heat': heat(counts.lose) } as CSSProperties)}
      </span>
    </button>
  );
}


// The levels column: a bar per level, singles and doubles, split by results. Its top bar's buttons slide `sidePanel`
//  in and out.
export function ChartsGroups({ chartboards, selectedLevel, countBy, treatTieAsWin, sidePanel, onSelect, onToggleSide }: {
  chartboards: Chartboard[];
  selectedLevel: string | null;
  countBy: CountBy;
  treatTieAsWin: boolean;
  sidePanel: SidePanel | null;
  onSelect: (level: string) => void;
  onToggleSide: (panel: SidePanel) => void;
}) {
  const levels = sortedLevels(chartboards);
  const stats: Stats = {};
  for (const level of levels)
    stats[level] = levelStats(chartboards.filter((cb)  =>  cb.chartLabel === level), treatTieAsWin);

  // A level's heat grows with the square of its losses, relative to the level with the most.
  const maxLose = Math.max(1, ...levels.map((level)  =>  stats[level]![countBy].lose));
  const heat = (n: number)  =>  ((n / maxLose) ** 2).toFixed(3);

  const sideLevels = levels.filter((level)  =>  levelType(level) in SIDE_TYPES);
  const otherLevels = levels.filter((level)  =>  ! (levelType(level) in SIDE_TYPES));
  // Every level between the highest and lowest gets a row, highest on top, so missing levels keep their place.
  const levelNums = sideLevels.map(levelNum);
  const minNum = Math.min(...levelNums), maxNum = Math.max(...levelNums);
  const nums = (sideLevels.length  ?  Array.from({ length: maxNum - minNum + 1 }, (_, i)  =>  maxNum - i)  :  []);
  const find = (type: string, num: number)  =>  sideLevels.find((level)  =>  levelType(level) === type  &&  levelNum(level) === num);
  const headOn = (type: string)  =>  ((selectedLevel !== null  &&  levelType(selectedLevel) === type)  ?  ' on'  :  '');
  const bar = { stats, countBy, treatTieAsWin: treatTieAsWin  ||  countBy !== 'results', heat, onSelect };

  return (
    <div className="filters">
      {/* A bar as tall as the results' tabs, which stays put while the levels below it scroll. */}
      <div className="level-top">
        <button className={`panel-toggle${(sidePanel === 'rivals'  ?  ' on'  :  '')}`} type="button"
          aria-expanded={sidePanel === 'rivals'} onClick={()  =>  onToggleSide('rivals')}>
          <svg viewBox="0 0 8 12" aria-hidden="true"><path d={(sidePanel === 'rivals'  ?  'M6 1 1 6l5 5'  :  'M2 1l5 5-5 5')} /></svg>
          Rivals
        </button>
        <button className={`panel-toggle prefs-toggle${(sidePanel === 'preferences'  ?  ' on'  :  '')}`} type="button"
          aria-label="Preferences" title="Preferences" aria-expanded={sidePanel === 'preferences'} onClick={()  =>  onToggleSide('preferences')}>
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
          {nums.map((num)  => {
            const singleLevel = find('S', num), doubleLevel = find('D', num);
            const on = selectedLevel !== null  &&  (selectedLevel === singleLevel  ||  selectedLevel === doubleLevel);
            return [
              <LevelBar key={`S${num}`} level={singleLevel} side="single" selected={singleLevel === selectedLevel} {...bar} />,
              <span key={num} className={`level-num${(on  ?  ' on'  :  '')}`}>{num}</span>,
              <LevelBar key={`D${num}`} level={doubleLevel} side="double" selected={doubleLevel === selectedLevel} {...bar} />,
            ];
          })}
          {otherLevels.map((level)  =>  (
            <div key={level} className="level-other">
              <span className={`level-num${(level === selectedLevel  ?  ' on'  :  '')}`}>{level}</span>
              <LevelBar level={level} side="double" selected={level === selectedLevel} {...bar} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
