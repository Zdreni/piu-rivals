import type { MouseEvent } from 'react';
import { clickedSegmentIdOrNull, LevelChart, LevelSegment, type LevelSide } from '../../components/levels/level_chart.tsx';
import type { ChartGrade } from '../../data/chart_grades.ts';
import { GRADE_GROUP_LABELS, GRADE_GROUPS } from '../../data/grade_groups.ts';
import type { LevelRange } from '../../data/preferences.ts';
import { scoreColor } from '../../data/score_colors.ts';
import type { PassesTab } from './ui_state.ts';


// A gradient through the played charts' score colours, each at the middle of its share of the segment, the best
//  next to the level number.
function scoresGradient(scores: number[], side: LevelSide) {
  const sortedScores = [...scores].sort((a, b)  =>  b - a);
  const stops = sortedScores.map((score, i)  =>  `${scoreColor(score)} ${((i + .5) / sortedScores.length * 100).toFixed(1)}%`);
  // A gradient needs two stops.
  const colorStops = ((stops.length === 1)  ?  [stops[0], stops[0]]  :  stops);
  return `linear-gradient(${((side === 'single')  ?  'to left'  :  'to right')}, ${colorStops.join(', ')})`;
}


// One level's bar: the played charts coloured by their scores, then the not played ones, which grow with their count
//  to the power of 1 / 1.5, as on the Rivals page. The played count leaves out FPCs, which can't be improved.
// A click on the level already selected also passes `onSelect` the tab of the segment clicked.
function GradeLevelBar({ level, side, levelChartGrades, selected, onSelect }: {
  level: string;
  side: LevelSide;
  levelChartGrades: ChartGrade[];
  selected: boolean;
  onSelect: (level: string, tab: PassesTab | null) => void;
}) {
  const scores = levelChartGrades.flatMap((cg)  =>  ((cg.score === null)  ?  []  :  [cg.score]));
  const unplayedCount = levelChartGrades.length - scores.length;
  const fpcCount = levelChartGrades.filter((cg)  =>  cg.gradeGroup === 'fpc').length;
  const tip = GRADE_GROUPS.map((group)  =>  `\n${GRADE_GROUP_LABELS[group]}: ${levelChartGrades.filter((cg)  =>  cg.gradeGroup === group).length}`)
    .join('');

  const select = (event: MouseEvent<HTMLButtonElement>)  => {
    const segmentId = clickedSegmentIdOrNull(event);
    onSelect(level, ((selected  &&  segmentId)  ?  ((segmentId === 'unplayed')  ?  'not-played'  :  'played')  :  null));
  };

  return (
    <button
      className={`level-bar ${side}${(selected  ?  ' on'  :  '')}`}
      type="button"
      role="radio"
      aria-checked={selected}
      title={`${level}: ${scores.length} of ${levelChartGrades.length} played${tip}`}
      onClick={select}
    >
      <span className="level-segs">
        <LevelSegment segmentId="played" className="grade-played" n={scores.length}
          label={(scores.length - fpcCount)  ||  ''}
          style={(scores.length  ?  { background: scoresGradient(scores, side) }  :  {})} />
        <LevelSegment segmentId="unplayed" className="grade-unplayed" n={unplayedCount} grow={unplayedCount ** (1 / 1.5)} />
      </span>
    </button>
  );
}


// The levels column of the Passes page: a bar per level, singles and doubles, coloured by your scores.
export function GradeLevels({ chartGrades, levels, levelRange, selectedLevel, onSelect }: {
  chartGrades: ChartGrade[];
  levels: string[];
  levelRange: LevelRange;
  selectedLevel: string | null;
  onSelect: (level: string, tab: PassesTab | null) => void;
}) {
  const chartGradesByLevel = new Map<string, ChartGrade[]>();
  for (const chartGrade of chartGrades) {
    const levelChartGrades = chartGradesByLevel.get(chartGrade.chartLabel);
    if (levelChartGrades)
      levelChartGrades.push(chartGrade);
    else
      chartGradesByLevel.set(chartGrade.chartLabel, [chartGrade]);
  }

  const renderBar = (level: string, side: LevelSide)  =>  (
    <GradeLevelBar key={level} level={level} side={side} levelChartGrades={chartGradesByLevel.get(level)  ??  []}
      selected={level === selectedLevel} onSelect={onSelect} />
  );

  return (
    <div className="filters">
      {/* A bar as tall as the tabs beside it, so the lines under them meet. */}
      <div className="level-top">
        <span className="level-range">Levels {levelRange.minLevel}–{levelRange.maxLevel}</span>
      </div>
      <LevelChart levels={levels} selectedLevel={selectedLevel} renderBar={renderBar} />
    </div>
  );
}
