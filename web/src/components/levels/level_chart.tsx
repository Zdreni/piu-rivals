import { type CSSProperties, Fragment, type MouseEvent, type ReactNode } from 'react';
import { levelNum, levelType, SIDE_TYPES } from '../../data/stats.ts';

export type LevelSide = 'single' | 'double';


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


// The id of the segment a click on a level bar was on; null for a keyboard click (detail 0), which has none.
export const clickedSegmentIdOrNull = (event: MouseEvent<HTMLElement>)  =>
  ((event.detail > 0  &&  (event.target as HTMLElement).closest<HTMLElement>('[data-segment]')?.dataset.segment)  ||  null);


// The levels' bars, singles and doubles side by side with the level number between them, highest on top, and the
//  other chart types' levels below them; `renderBar` draws each bar.
export function LevelChart({ levels, selectedLevel, renderBar }: {
  levels: string[];
  selectedLevel: string | null;
  renderBar: (level: string, side: LevelSide) => ReactNode;
}) {
  const sideLevels = levels.filter((level)  =>  levelType(level) in SIDE_TYPES);
  const otherLevels = levels.filter((level)  =>  ! (levelType(level) in SIDE_TYPES));
  // Every level between the highest and lowest gets a row, so missing levels keep their place.
  const levelNums = sideLevels.map(levelNum);
  const minNum = Math.min(...levelNums), maxNum = Math.max(...levelNums);
  const nums = (sideLevels.length  ?  Array.from({ length: maxNum - minNum + 1 }, (_, i)  =>  maxNum - i)  :  []);
  const find = (type: string, num: number)  =>  sideLevels.find((level)  =>  levelType(level) === type  &&  levelNum(level) === num);
  const headOn = (type: string)  =>  ((selectedLevel !== null  &&  levelType(selectedLevel) === type)  ?  ' on'  :  '');

  const renderSideBar = (level: string | undefined, side: LevelSide)  =>
    (level  ?  renderBar(level, side)  :  <span className={`level-bar ${side} placeholder`} aria-hidden="true" />);

  return (
    <div className="level-scroll">
      <div className="level-chart" role="radiogroup" aria-label="Levels">
        <span className={`level-head single${headOn('S')}`}>Singles</span>
        <span />
        <span className={`level-head${headOn('D')}`}>Doubles</span>
        {nums.map((num)  => {
          const singleLevel = find('S', num), doubleLevel = find('D', num);
          const on = selectedLevel !== null  &&  (selectedLevel === singleLevel  ||  selectedLevel === doubleLevel);
          return (
            <Fragment key={num}>
              {renderSideBar(singleLevel, 'single')}
              <span className={`level-num${(on  ?  ' on'  :  '')}`}>{num}</span>
              {renderSideBar(doubleLevel, 'double')}
            </Fragment>
          );
        })}
        {otherLevels.map((level)  =>  (
          <div key={level} className="level-other">
            <span className={`level-num${(level === selectedLevel  ?  ' on'  :  '')}`}>{level}</span>
            {renderBar(level, 'double')}
          </div>
        ))}
      </div>
    </div>
  );
}
