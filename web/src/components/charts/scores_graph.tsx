import { type CSSProperties, useId, useLayoutEffect, useRef, useState } from 'react';
import type { Entry } from '../../data/folded_chartboard.ts';
import type { GraphScoreSpans } from '../../data/graph_spans.ts';
import { lossPointsRedShare, lossRedShare } from '../../data/loss_red.ts';
import './scores_graph.css';

// The plot's units: x and y both go from 0 to 100, stretched to the graph's box, with this much room kept at the top
//  and bottom for the line's width.
const PLOT_SIZE = 100;
const PLOT_PAD_Y = 8;
const DOT_RADIUS_PX = 3;


// A chart's scores, from the lowest on the left to the highest on the right, each with a dot. A line up to yours
//  splits them: the rivals you beat or tie are dimmed, the ones who beat you red, the redder the more rivals beat you
//  (by scores capped at `scoreCap`), and each dot the more it's ahead of yours. Without your score, they're all red.
//  Above the cap, the area is neutral, and the red is paler.
// With `scoreSpans`, the height is shared with the other cards' graphs (see GraphScoreSpans); scores below its reach
//  are drawn on the bottom edge.
export function ScoresGraph({ entries, scoreCap, scoreSpans }: { entries: Entry[]; scoreCap: number; scoreSpans: GraphScoreSpans | null }) {
  const clipId = useId();
  const svg = useRef<SVGSVGElement>(null);
  const [widthPx, setWidthPx] = useState(0);

  useLayoutEffect(()  => {
    const element = svg.current!;
    setWidthPx(element.clientWidth);

    const resizeObserver = new ResizeObserver(()  =>  setWidthPx(element.clientWidth));
    resizeObserver.observe(element);
    return ()  =>  resizeObserver.disconnect();
  }, []);

  // Rivals tied with you are listed after you, so they come before you here.
  const ascendingEntries = [...entries].reverse();
  const scores = ascendingEntries.map((e)  =>  e.score);
  const lowest = Math.min(...scores);
  const scoreRange = Math.max(...scores) - lowest;
  const pointX = (index: number)  =>  (scores.length === 1  ?  PLOT_SIZE / 2  :  index / (scores.length - 1) * PLOT_SIZE);
  const myScore = ascendingEntries.find((e)  =>  e.me)?.score  ??  null;
  const top = PLOT_PAD_Y, bottom = PLOT_SIZE - PLOT_PAD_Y;
  // All scores equal, they're drawn across the middle.
  const ownPointY = (score: number)  =>  (scoreRange === 0  ?  PLOT_SIZE / 2  :  bottom - (score - lowest) / scoreRange * (bottom - top));

  const pointY = (score: number)  => {
    if (! scoreSpans  ||  myScore === null  ||  scoreSpans.above + scoreSpans.below === 0)
      return ownPointY(score);

    const myY = top + scoreSpans.above / (scoreSpans.above + scoreSpans.below) * (bottom - top);
    return (score >= myScore
      ?  myY - (score - myScore) / Math.max(1, scoreSpans.above) * (myY - top)
      :  Math.min(bottom, myY + (myScore - score) / Math.max(1, scoreSpans.below) * (bottom - myY)));
  };

  // A score alone gets a short flat line.
  const line = (scores.length === 1
    ?  `M${PLOT_SIZE / 2 - 4},${pointY(lowest)}h8`
    :  `M${scores.map((score, i)  =>  `${pointX(i)},${pointY(score)}`).join('L')}`);

  // The areas reach past the outer dots by their radius, in the plot's units.
  const dotRadius = (widthPx > 0  ?  DOT_RADIUS_PX * PLOT_SIZE / widthPx  :  0);
  const area = (scores.length === 1
    ?  ''
    :  `M${-dotRadius},${pointY(lowest)}${line.replace('M', 'L')}h${dotRadius}V${PLOT_SIZE}H${-dotRadius}Z`);

  const myIndex = ascendingEntries.findIndex((e)  =>  e.me);
  const myX = (myIndex === -1  ?  -dotRadius  :  pointX(myIndex));
  const lossCount = ascendingEntries.filter((e)  =>  ! e.me  &&  (e.delta === null  ||  e.delta < 0)).length;
  // Where the line rises over the score cap, between the last score under it and the first above.
  const cappedIndex = scores.findIndex((score)  =>  score > scoreCap);
  const capX = (cappedIndex === -1
    ?  PLOT_SIZE + dotRadius
    :  cappedIndex === 0
      ?  -dotRadius
      :  pointX(cappedIndex - 1) + (scoreCap - scores[cappedIndex - 1]!) / (scores[cappedIndex]! - scores[cappedIndex - 1]!)
        * (pointX(cappedIndex) - pointX(cappedIndex - 1)));

  const dotClass = (entry: Entry, index: number)  =>
    (entry.me
      ?  'dot mine'
      :  (myIndex === -1  ||  index > myIndex)
        ?  `dot above${(entry.score > scoreCap  ?  ' capped'  :  '')}`
        :  'dot below');

  // A rival's dot is as red as they're ahead of you, by scores capped (see lossPointsRedShare).
  const dotStyle = (entry: Entry): CSSProperties  =>  ({
    strokeWidth: 2 * DOT_RADIUS_PX,
    ...((! entry.me  &&  entry.delta !== null)  ?  { '--dot-red-share': lossPointsRedShare(Math.max(0, -entry.delta)) }  :  {}),
  });

  // The area's or the line's part (`shape`) between `fromX` and `toX`; none when that's empty.
  const renderPart = (shape: 'area' | 'line', className: string, fromX: number, toX: number)  =>  toX > fromX  &&  (
    <g className={className} clipPath={`url(#${clipId}-${shape}-${className.replace(' ', '-')})`}>
      <clipPath id={`${clipId}-${shape}-${className.replace(' ', '-')}`}><rect x={fromX} y={0} width={toX - fromX} height={PLOT_SIZE} /></clipPath>
      <path className={shape} d={(shape === 'area'  ?  area  :  line)} />
    </g>
  );

  return (
    <div className="scores-graph" style={{ '--red-share': lossRedShare(lossCount) } as CSSProperties}>
      <svg ref={svg} viewBox={`0 0 ${PLOT_SIZE} ${PLOT_SIZE}`} preserveAspectRatio="none" aria-hidden="true">
        {renderPart('area', 'below', -dotRadius, Math.min(myX, capX))}
        {renderPart('area', 'above', myX, capX)}
        {renderPart('area', 'capped', capX, PLOT_SIZE + dotRadius)}
        {renderPart('line', 'below', -dotRadius, myX)}
        {renderPart('line', 'above', myX, capX)}
        {renderPart('line', 'above capped', Math.max(myX, capX), PLOT_SIZE + dotRadius)}
        {myIndex !== -1  &&  <line className="mine" x1={myX} x2={myX} y1={pointY(scores[myIndex]!)} y2={PLOT_SIZE} />}
        {ascendingEntries.map((entry, i)  =>  (
          <path key={(entry.me  ?  'me'  :  entry.playerId)} className={dotClass(entry, i)} d={`M${pointX(i)},${pointY(entry.score)}h0`}
            style={dotStyle(entry)} />
        ))}
      </svg>
    </div>
  );
}
