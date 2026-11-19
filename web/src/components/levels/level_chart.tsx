import { type CSSProperties, Fragment, type MouseEvent, type ReactNode } from 'react';
import { levelNum, levelType, SIDE_TYPES } from '../../data/stats.ts';
import { levelSide, useLevelDrag } from './level_drag.ts';
import { useScrollVeil } from '../scroll_veil.ts';

export type LevelSide = 'single' | 'double';
// A bar is selected once its level's content is shown, and pending while a drag's rectangle has it but hasn't ended.
export type LevelBarSelection = 'selected' | 'pending' | null;


// Narrow bars still need room for their labels, so a labelled segment never gets less than its label, plus a little
//  padding; any segment gets at least 5% of the bar. Bars that hide their labels size them in % of the bar with
//  --digit and --label-pad.
const labelWidth = (label: number | string)  =>
  (String(label).length  ?  `${String(label).length} * var(--digit, 1ch) + 2 * min(var(--label-pad, 6px), 5%)`  :  '0px');


// A level bar's segment of `n` charts or results, sized by `grow` (`n` unless given); none when `n` is 0.
export function LevelSegment({ segmentId, className, n, label = n, style = {}, grow = n }: {
  segmentId: string;
  className: string;
  n: number;
  label?: number | string;
  style?: CSSProperties;
  grow?: number;
}) {
  if (! n)
    return null;

  return (
    <span className={className} data-segment={segmentId} style={{ flexGrow: grow, minWidth: `calc(max(5%, ${labelWidth(label)}) + var(--overlap))`, ...style }}>
      {label}
    </span>
  );
}


// A level's bar, its segments (see LevelSegment) as `children`. LevelChart handles its clicks.
export function LevelBarButton({ level, side, selection, title, children }: {
  level: string;
  side: LevelSide;
  selection: LevelBarSelection;
  title: string;
  children: ReactNode;
}) {
  return (
    <button className={`level-bar ${side}${(selection  ?  ` ${selection}`  :  '')}`} type="button" aria-pressed={selection === 'selected'}
      data-level={level} title={title}>
      <span className="level-segs">{children}</span>
    </button>
  );
}


// The id of the segment a click on a level bar was on; null for a keyboard click (detail 0), which has none.
const clickedSegmentIdOrNull = (event: MouseEvent<HTMLElement>)  =>
  ((event.detail > 0  &&  (event.target as HTMLElement).closest<HTMLElement>('[data-segment]')?.dataset.segment)  ||  null);


// Where a frame around the singles and doubles `framedLevels` goes in the levels' grid, whose top row, under the
//  heads, is level `maxNum`: from the highest level's row to the lowest's, over the sides they're on.
function frameStyleOrNull(framedLevels: string[], maxNum: number): CSSProperties | null {
  if (! framedLevels.length)
    return null;

  const nums = framedLevels.map(levelNum);
  const sides = new Set(framedLevels.map(levelSide));
  return {
    gridRow: `${maxNum - Math.max(...nums) + 2} / ${maxNum - Math.min(...nums) + 3}`,
    // Placed absolutely, a frame given only its first line would stretch to the chart's edge.
    gridColumn: ((sides.size > 1)  ?  '1 / 4'  :  sides.has('single')  ?  '1 / 2'  :  '3 / 4'),
  };
}


// The levels' bars, singles and doubles side by side with the level number between them, highest on top, and the
//  other chart types' levels below them; `renderBar` draws each bar with a LevelBarButton.
// A click selects one level, and a drag a rectangle of singles and doubles (see useLevelDrag), framed as a whole. A
//  click on a level already selected also passes `onSelect` the id of the segment it was on.
export function LevelChart({ levels, selectedLevels, renderBar, onSelect }: {
  levels: string[];
  selectedLevels: string[];
  renderBar: (level: string, side: LevelSide, selection: LevelBarSelection) => ReactNode;
  onSelect: (levels: string[], segmentId: string | null) => void;
}) {
  const sideLevels = levels.filter((level)  =>  levelType(level) in SIDE_TYPES);
  const { draggedLevels, chartRef, dragHandlers } = useLevelDrag(sideLevels, (levelsDragged)  =>  onSelect(levelsDragged, null));
  const shownSelectedLevels = draggedLevels  ??  selectedLevels;
  const isSelected = (level: string | undefined)  =>  level !== undefined  &&  shownSelectedLevels.includes(level);
  // While a drag is on, only the levels it has are shown, not those selected.
  const barSelection = (level: string)  =>
    (draggedLevels  ?  (draggedLevels.includes(level)  ?  'pending'  :  null)  :  selectedLevels.includes(level)  ?  'selected'  :  null);

  const otherLevels = levels.filter((level)  =>  ! (levelType(level) in SIDE_TYPES));
  // Every level between the highest and lowest gets a row, so missing levels keep their place.
  const levelNums = sideLevels.map(levelNum);
  const minNum = Math.min(...levelNums), maxNum = Math.max(...levelNums);
  const nums = (sideLevels.length  ?  Array.from({ length: maxNum - minNum + 1 }, (_, i)  =>  maxNum - i)  :  []);
  const find = (type: string, num: number)  =>  sideLevels.find((level)  =>  levelType(level) === type  &&  levelNum(level) === num);
  const headOn = (type: string)  =>  (shownSelectedLevels.some((level)  =>  levelType(level) === type)  ?  ' on'  :  '');

  const renderSideBar = (level: string | undefined, side: LevelSide)  =>
    (level  ?  renderBar(level, side, barSelection(level))  :  <span className={`level-bar ${side} placeholder`} aria-hidden="true" />);

  const select = (event: MouseEvent<HTMLElement>)  => {
    const level = (event.target as HTMLElement).closest<HTMLElement>('[data-level]')?.dataset.level;
    if (level)
      onSelect([level], (selectedLevels.includes(level)  ?  clickedSegmentIdOrNull(event)  :  null));
  };

  const selectedFrameStyle = (draggedLevels  ?  null  :  frameStyleOrNull(selectedLevels.filter((level)  =>  sideLevels.includes(level)), maxNum));
  const draggedFrameStyle = (draggedLevels  ?  frameStyleOrNull(draggedLevels, maxNum)  :  null);

  const veilRef = useScrollVeil<HTMLDivElement>(null);
  return (
    <div className="level-scroll" ref={veilRef}>
      <div className="level-chart" role="group" aria-label="Levels" ref={chartRef} onClick={select} {...dragHandlers}>
        <span className={`level-head single${headOn('S')}`}>Singles</span>
        <span />
        <span className={`level-head${headOn('D')}`}>Doubles</span>
        {nums.map((num)  => {
          const singleLevel = find('S', num), doubleLevel = find('D', num);
          return (
            <Fragment key={num}>
              {renderSideBar(singleLevel, 'single')}
              <span className={`level-num${((isSelected(singleLevel)  ||  isSelected(doubleLevel))  ?  ' on'  :  '')}`} data-num={num}>{num}</span>
              {renderSideBar(doubleLevel, 'double')}
            </Fragment>
          );
        })}
        {otherLevels.map((level)  =>  (
          <div key={level} className="level-other">
            <span className={`level-num${(isSelected(level)  ?  ' on'  :  '')}`}>{level}</span>
            {renderBar(level, 'double', barSelection(level))}
          </div>
        ))}
        {selectedFrameStyle  &&  <span className="level-frame" style={selectedFrameStyle} aria-hidden="true" />}
        {draggedFrameStyle  &&  <span className="level-frame pending" style={draggedFrameStyle} aria-hidden="true" />}
      </div>
    </div>
  );
}
