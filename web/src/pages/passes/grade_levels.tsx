import type { MouseEvent } from 'react';
import { clickedSegmentIdOrNull, LevelChart, LevelSegment, type LevelSide } from '../../components/levels/level_chart.tsx';
import { type ChartGrade, isAboveCap } from '../../data/chart_grades.ts';
import { GRADE_GROUP_LABELS, GRADE_GROUPS, type GradeGroup } from '../../data/grade_groups.ts';
import type { LevelRange } from '../../data/preferences.ts';
import type { PassesTab } from './ui_state.ts';

// A bar's segments: the grade groups, with the scores above the score cap apart, after FPC.
type BarSegmentId = GradeGroup | 'above-cap';
type SegmentCounts = Record<BarSegmentId, number>;

const BAR_SEGMENT_IDS: BarSegmentId[] = ['fpc', 'above-cap', ...GRADE_GROUPS.filter((group)  =>  group !== 'fpc')];


// One level's bar, split by grade groups, the best next to the level number; scores above `scoreCap` get a segment
//  of their own. The not played segment grows with its count to the power of 1 / 1.5, as on the Rivals page.
// A click on the level already selected also passes `onSelect` the tab of the segment clicked.
function GradeLevelBar({ level, side, counts, scoreCap, selected, onSelect }: {
  level: string;
  side: LevelSide;
  counts: SegmentCounts;
  scoreCap: number;
  selected: boolean;
  onSelect: (level: string, tab: PassesTab | null) => void;
}) {
  const playedCount = BAR_SEGMENT_IDS.reduce((acc, id)  =>  acc + ((id === 'unplayed')  ?  0  :  counts[id]), 0);
  const segmentLabel = (id: BarSegmentId)  =>  ((id === 'above-cap')  ?  `${scoreCap / 1000}k+`  :  GRADE_GROUP_LABELS[id]);
  // The score cap's line only shows where it applies.
  const tip = BAR_SEGMENT_IDS.filter((id)  =>  id !== 'above-cap'  ||  counts[id])
    .map((id)  =>  `\n${segmentLabel(id)}: ${counts[id]}`).join('');

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
      title={`${level}: ${playedCount} of ${playedCount + counts.unplayed} played${tip}`}
      onClick={select}
    >
      <span className="level-segs">
        {BAR_SEGMENT_IDS.map((id)  =>  (
          <LevelSegment key={id} segmentId={id} className={`grade-${id}`} n={counts[id]}
            grow={((id === 'unplayed')  ?  counts[id] ** (1 / 1.5)  :  counts[id])} />
        ))}
      </span>
    </button>
  );
}


// The levels column of the Passes page: a bar per level, singles and doubles, split by grade groups.
export function GradeLevels({ chartGrades, levels, levelRange, scoreCap, selectedLevel, onSelect }: {
  chartGrades: ChartGrade[];
  levels: string[];
  levelRange: LevelRange;
  scoreCap: number;
  selectedLevel: string | null;
  onSelect: (level: string, tab: PassesTab | null) => void;
}) {
  const countsByLevel = new Map<string, SegmentCounts>();
  for (const chartGrade of chartGrades) {
    let counts = countsByLevel.get(chartGrade.chartLabel);
    if (! counts)
      countsByLevel.set(chartGrade.chartLabel, counts = Object.fromEntries(BAR_SEGMENT_IDS.map((id)  =>  [id, 0])) as SegmentCounts);

    counts[(isAboveCap(chartGrade, scoreCap)  ?  'above-cap'  :  chartGrade.gradeGroup)]++;
  }

  const renderBar = (level: string, side: LevelSide)  =>  (
    <GradeLevelBar key={level} level={level} side={side} counts={countsByLevel.get(level)!} scoreCap={scoreCap}
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
