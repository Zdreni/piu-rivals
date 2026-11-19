import type { CSSProperties } from 'react';
import type { SidePanel } from './side_panel_control.ts';
import type { Chartboard } from '../../data/model.ts';
import type { CountBy } from '../../data/preferences.ts';
import { CHART_OUTCOME_LABELS, type Counts, levelStats, RESULT_OUTCOME_LABELS, sortedLevels, TAB_BY_OUTCOME, type TabId } from '../../data/stats.ts';
import { type LevelBarSelection, LevelBarButton, LevelChart, LevelSegment, type LevelSide } from '../../components/levels/level_chart.tsx';

type Stats = Record<string, { charts: Counts; results: Counts }>;


const plural = (n: number, word: string)  =>  `${n} ${word}${(n === 1  ?  ''  :  's')}`;


// One level's bar, split by results, wins next to the level number.
function LevelBar({ level, side, stats, countBy, treatTieAsWin, selection, heat }: {
  level: string;
  side: LevelSide;
  stats: Stats;
  countBy: CountBy;
  treatTieAsWin: boolean;
  selection: LevelBarSelection;
  heat: (n: number) => string;
}) {
  const { charts: byCharts, results: byResults } = stats[level]!;
  const counts = stats[level]![countBy];
  // The hidden segment's count is only in its tooltip, which shows both countings. Charts are never tied.
  const tipLine = (outcome: keyof Counts)  =>  `\n${plural(byCharts[outcome], `${CHART_OUTCOME_LABELS[outcome]} chart`)}`
    + ` / ${plural(byResults[outcome], `${RESULT_OUTCOME_LABELS[outcome]} result`)}`;

  const tieLine = (treatTieAsWin  ?  ''  :  `\n${plural(byResults.tie, `${RESULT_OUTCOME_LABELS.tie} result`)}`);

  return (
    <LevelBarButton level={level} side={side} selection={selection}
      title={`${level}:${tipLine('lose')}${tipLine('hidden')}${tieLine}${tipLine('win')}`}>
      <LevelSegment segmentId="win" className="win" n={counts.win} />
      {! treatTieAsWin  &&  <LevelSegment segmentId="tie" className="tie" n={counts.tie} />}
      <LevelSegment segmentId="hidden" className="hidden-loss" n={counts.hidden} label="" />
      <LevelSegment segmentId="lose" className="lose" n={counts.lose} style={{ '--heat': heat(counts.lose) } as CSSProperties} />
    </LevelBarButton>
  );
}


// The levels column: a bar per level, singles and doubles, split by results. Its top bar's buttons slide `sidePanel`
//  in and out.
// A click on a level already selected also passes `onSelect` the tab of the segment it was on.
export function ChartsGroups({ chartboards, selectedLevels, countBy, treatTieAsWin, sidePanel, onSelect, onToggleSide }: {
  chartboards: Chartboard[];
  selectedLevels: string[];
  countBy: CountBy;
  treatTieAsWin: boolean;
  sidePanel: SidePanel | null;
  onSelect: (levels: string[], tab: TabId | null) => void;
  onToggleSide: (panel: SidePanel) => void;
}) {
  const levels = sortedLevels(chartboards);
  const stats: Stats = {};
  for (const level of levels)
    stats[level] = levelStats(chartboards.filter((cb)  =>  cb.chartLabel === level), treatTieAsWin);

  // A level's heat grows with the square of its losses, relative to the level with the most.
  const maxLose = Math.max(1, ...levels.map((level)  =>  stats[level]![countBy].lose));
  const heat = (n: number)  =>  ((n / maxLose) ** 2).toFixed(3);

  const renderBar = (level: string, side: LevelSide, selection: LevelBarSelection)  =>  (
    <LevelBar key={level} level={level} side={side} selection={selection} stats={stats} countBy={countBy}
      treatTieAsWin={treatTieAsWin  ||  countBy !== 'results'} heat={heat} />
  );

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
      <LevelChart levels={levels} selectedLevels={selectedLevels} renderBar={renderBar}
        onSelect={(newSelectedLevels, segmentId)  =>  onSelect(newSelectedLevels, (segmentId  ?  TAB_BY_OUTCOME[segmentId as keyof Counts]  :  null))} />
    </div>
  );
}
