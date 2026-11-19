import type { CSSProperties } from 'react';
import { lossRedShare } from '../../data/loss_red.ts';
import type { Chartboard } from '../../data/model.ts';
import type { CountBy, LevelRange } from '../../data/preferences.ts';
import { CHART_OUTCOME_LABELS, type Counts, levelStats, RESULT_OUTCOME_LABELS, sortedLevels, TAB_BY_OUTCOME, type TabId } from '../../data/stats.ts';
import { type LevelBarSelection, LevelBarButton, LevelChart, LevelSegment, type LevelSide } from '../../components/levels/level_chart.tsx';

type Stats = Record<string, { charts: Counts; results: Counts }>;


const plural = (n: number, word: string)  =>  `${n} ${word}${(n === 1  ?  ''  :  's')}`;


// One level's bar, split by results, wins next to the level number.
function LevelBar({ level, side, stats, countBy, treatTieAsWin, selection }: {
  level: string;
  side: LevelSide;
  stats: Stats;
  countBy: CountBy;
  treatTieAsWin: boolean;
  selection: LevelBarSelection;
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
      <LevelSegment segmentId="lose" className="lose" n={counts.lose} style={{ '--red-share': lossRedShare(counts.lose) } as CSSProperties} />
    </LevelBarButton>
  );
}


// The levels column: a bar per level, singles and doubles, split by results, under `levelRange`.
// A click on a level already selected also passes `onSelect` the tab of the segment it was on.
export function ChartsGroups({ chartboards, selectedLevels, countBy, treatTieAsWin, levelRange, onSelect }: {
  chartboards: Chartboard[];
  selectedLevels: string[];
  countBy: CountBy;
  treatTieAsWin: boolean;
  levelRange: LevelRange;
  onSelect: (levels: string[], tab: TabId | null) => void;
}) {
  const levels = sortedLevels(chartboards);
  const stats: Stats = {};
  for (const level of levels)
    stats[level] = levelStats(chartboards.filter((cb)  =>  cb.chartLabel === level), treatTieAsWin);

  const renderBar = (level: string, side: LevelSide, selection: LevelBarSelection)  =>  (
    <LevelBar key={level} level={level} side={side} selection={selection} stats={stats} countBy={countBy}
      treatTieAsWin={treatTieAsWin  ||  countBy !== 'results'} />
  );

  return (
    <div className="filters">
      {/* A bar as tall as the results' tabs, which stays put while the levels below it scroll. */}
      <div className="level-top">
        <span className="level-range">Levels {levelRange.minLevel}–{levelRange.maxLevel}</span>
      </div>
      <LevelChart levels={levels} selectedLevels={selectedLevels} renderBar={renderBar}
        onSelect={(newSelectedLevels, segmentId)  =>  onSelect(newSelectedLevels, (segmentId  ?  TAB_BY_OUTCOME[segmentId as keyof Counts]  :  null))} />
    </div>
  );
}
