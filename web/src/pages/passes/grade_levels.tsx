import { type LevelBarSelection, LevelBarButton, LevelChart, LevelSegment, type LevelSide } from '../../components/levels/level_chart.tsx';
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
  return `linear-gradient(${gradientDirection(side)}, ${colorStops.join(', ')})`;
}


const gradientDirection = (side: LevelSide)  =>  ((side === 'single')  ?  'to left'  :  'to right');


// One level's bar: the played charts coloured by their scores, then the not played ones: first those at least
//  `npMinimalRivals` rivals played, which grow with their count to the power of 1 / 1.25, then the others, which grow
//  to the power of 1 / 1.5, as on the Rivals page.
// The played count leaves out FPCs, which can't be improved.
function GradeLevelBar({ level, side, levelChartGrades, npMinimalRivals, selection }: {
  level: string;
  side: LevelSide;
  levelChartGrades: ChartGrade[];
  npMinimalRivals: number;
  selection: LevelBarSelection;
}) {
  const scores = levelChartGrades.flatMap((cg)  =>  ((cg.score === null)  ?  []  :  [cg.score]));
  const unplayedChartGrades = levelChartGrades.filter((cg)  =>  cg.score === null);
  const unplayedCount = unplayedChartGrades.length;
  const enoughRivalsCount = unplayedChartGrades.filter((cg)  =>  cg.rivalCount >= npMinimalRivals).length;
  const fewRivalsCount = unplayedCount - enoughRivalsCount;
  const fpcCount = levelChartGrades.filter((cg)  =>  cg.gradeGroup === 'fpc').length;
  const tip = GRADE_GROUPS.map((group)  =>  `\n${GRADE_GROUP_LABELS[group]}: ${levelChartGrades.filter((cg)  =>  cg.gradeGroup === group).length}`)
    .join('');
  const enoughRivalsTip = `\nNot played by ${npMinimalRivals}+ rivals: ${enoughRivalsCount}`;

  return (
    <LevelBarButton level={level} side={side} selection={selection} title={`${level}: ${scores.length} of ${levelChartGrades.length} played${tip}${enoughRivalsTip}`}>
      <LevelSegment segmentId="played" className="grade-played" n={scores.length}
        label={(scores.length - fpcCount)  ||  ''}
        style={(scores.length  ?  { background: scoresGradient(scores, side) }  :  {})} />
      <LevelSegment segmentId="unplayed" className="grade-unplayed" n={enoughRivalsCount} grow={enoughRivalsCount ** (1 / 1.25)} />
      <LevelSegment segmentId="unplayed-few" className="grade-unplayed few-rivals" n={fewRivalsCount} grow={fewRivalsCount ** (1 / 1.5)} />
    </LevelBarButton>
  );
}


// The levels column of the Passes page: a bar per level, singles and doubles, coloured by your scores.
// A click on a level already selected also passes `onSelect` the tab of the segment it was on.
export function GradeLevels({ chartGrades, levels, levelRange, npMinimalRivals, selectedLevels, onSelect }: {
  chartGrades: ChartGrade[];
  levels: string[];
  levelRange: LevelRange;
  npMinimalRivals: number;
  selectedLevels: string[];
  onSelect: (levels: string[], tab: PassesTab | null) => void;
}) {
  const chartGradesByLevel = new Map<string, ChartGrade[]>();
  for (const chartGrade of chartGrades) {
    const levelChartGrades = chartGradesByLevel.get(chartGrade.chartLabel);
    if (levelChartGrades)
      levelChartGrades.push(chartGrade);
    else
      chartGradesByLevel.set(chartGrade.chartLabel, [chartGrade]);
  }

  const renderBar = (level: string, side: LevelSide, selection: LevelBarSelection)  =>  (
    <GradeLevelBar key={level} level={level} side={side} levelChartGrades={chartGradesByLevel.get(level)  ??  []}
      npMinimalRivals={npMinimalRivals} selection={selection} />
  );

  const tabOfSegment = (segmentId: string | null)  =>  ((segmentId === null)  ?  null  :  segmentId.startsWith('unplayed')  ?  'not-played'  :  'played');

  return (
    <div className="filters">
      {/* A bar as tall as the tabs beside it, so the lines under them meet. */}
      <div className="level-top">
        <span className="level-range">Levels {levelRange.minLevel}–{levelRange.maxLevel}</span>
      </div>
      <LevelChart levels={levels} selectedLevels={selectedLevels} renderBar={renderBar}
        onSelect={(newSelectedLevels, segmentId)  =>  onSelect(newSelectedLevels, tabOfSegment(segmentId))} />
    </div>
  );
}
