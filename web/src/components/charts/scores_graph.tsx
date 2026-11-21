import { type CSSProperties, type PointerEvent, useId, useLayoutEffect, useRef, useState } from 'react';
import { Score } from './format.tsx';
import type { Entry } from '../../data/folded_chartboard.ts';
import { dotXs, MAX_SCORE } from '../../data/graph_dot_xs.ts';
import { lossPointsRedShare, lossRedShare } from '../../data/loss_red.ts';
import { displayName } from '../../data/model.ts';
import './scores_graph.css';

// The plot's units: x and y both go from 0 to 100, stretched to the graph's box, with this much room kept at the top
//  and bottom for the line's width.
const PLOT_SIZE = 100;
const PLOT_PAD_Y = 8;
const DOT_RADIUS_PX = 3;
const MY_SCORE_FRAME_GAP_PX = 6;


// A chart's scores, from the lowest on the left to the highest on the right, each with a dot, placed by dotXs. A line
//  up to yours splits them: the rivals you beat or tie are dimmed, the ones who beat you red, the redder the more
//  rivals beat you (by scores capped at `scoreCap`), and each dot the more it's ahead of yours. Without your score,
//  they're all red. Above the cap, the area is neutral, and the red is paler.
// The height goes from the lowest score at the bottom up to a MAX_SCORE result at the top, marked by a dashed line.
// Your score is framed at the bottom over your line, kept inside the graph, in thousands rounded down, so 999,638
//  doesn't show as 1000k.
// Under a mouse, the score nearest to it is marked with its player's name (`myName` for yours) instead.
export function ScoresGraph({ entries, myName, scoreCap }: {
  entries: Entry[];
  myName: string;
  scoreCap: number;
}) {
  const clipId = useId();
  const svg = useRef<SVGSVGElement>(null);
  const myScoreFrame = useRef<HTMLDivElement>(null);
  const [sizePx, setSizePx] = useState({ width: 0, height: 0, left: 0 });
  const [myScoreFrameSizePx, setMyScoreFrameSizePx] = useState({ width: 0, height: 0 });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useLayoutEffect(()  => {
    const element = svg.current!;
    const measure = ()  =>  setSizePx({
      width: element.clientWidth,
      height: element.clientHeight,
      left: parseFloat(getComputedStyle(element.parentElement!).paddingLeft),
    });

    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(element);
    return ()  =>  resizeObserver.disconnect();
  }, []);

  // Hidden under a mouse, it keeps the last size.
  useLayoutEffect(()  => {
    const frame = myScoreFrame.current;
    if (! frame)
      return;

    const width = frame.offsetWidth, height = frame.offsetHeight;
    setMyScoreFrameSizePx((size)  =>  ((size.width === width  &&  size.height === height)  ?  size  :  { width, height }));
  });

  // Rivals tied with you are listed after you, so they come before you here.
  const ascendingEntries = [...entries].reverse();
  const scores = ascendingEntries.map((e)  =>  e.score);
  const lowest = Math.min(...scores);
  const myIndex = ascendingEntries.findIndex((e)  =>  e.me);
  // Unmeasured yet, before the first paint, they're all put in the middle.
  const pointXs = (sizePx.width === 0
    ?  scores.map(()  =>  PLOT_SIZE / 2)
    :  dotXs(scores, myIndex, sizePx.width).map((x)  =>  x * PLOT_SIZE / sizePx.width));

  const pointX = (index: number)  =>  pointXs[index]!;
  // With your score framed, the lowest dots are kept above the frame, so it covers none of them.
  const framedBottomPad = (myScoreFrameSizePx.height + DOT_RADIUS_PX + MY_SCORE_FRAME_GAP_PX) / sizePx.height * PLOT_SIZE;
  const top = PLOT_PAD_Y;
  const bottom = PLOT_SIZE - ((myIndex !== -1  &&  sizePx.height > 0)  ?  framedBottomPad  :  PLOT_PAD_Y);
  // All scores at MAX_SCORE, they're drawn along the top.
  const pointY = (score: number)  =>  (lowest === MAX_SCORE  ?  top  :  top + (MAX_SCORE - score) / (MAX_SCORE - lowest) * (bottom - top));

  // A score alone gets a short flat line.
  const line = (scores.length === 1
    ?  `M${PLOT_SIZE / 2 - 4},${pointY(lowest)}h8`
    :  `M${scores.map((score, i)  =>  `${pointX(i)},${pointY(score)}`).join('L')}`);

  // The areas reach past the outer dots by their radius, in the plot's units.
  const dotRadius = (sizePx.width > 0  ?  DOT_RADIUS_PX * PLOT_SIZE / sizePx.width  :  0);
  const area = (scores.length === 1
    ?  ''
    :  `M${pointX(0) - dotRadius},${pointY(lowest)}${line.replace('M', 'L')}h${dotRadius}V${PLOT_SIZE}H${pointX(0) - dotRadius}Z`);

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

  // Touches leave it to the card's click.
  const hover = (event: PointerEvent)  => {
    if (event.pointerType !== 'mouse')
      return;

    const box = svg.current!.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width * PLOT_SIZE;
    const distances = pointXs.map((dotX)  =>  Math.abs(dotX - x));
    setHoveredIndex(distances.indexOf(Math.min(...distances)));
  };

  // Centered on your line, but within the graph's padding box.
  const myScoreFrameLeftPx = Math.min(Math.max(0, sizePx.left + myX / PLOT_SIZE * sizePx.width - myScoreFrameSizePx.width / 2),
    2 * sizePx.left + sizePx.width - myScoreFrameSizePx.width);

  const hoveredEntry = (hoveredIndex === null  ?  undefined  :  ascendingEntries[hoveredIndex]);
  const myScoreIsFramed = (myIndex !== -1  &&  ! hoveredEntry);
  // Your line ends 1px inside the frame's top border, so none of it shows below the frame where its edge falls between
  //  pixels.
  const myLineBottom = ((myScoreIsFramed  &&  sizePx.height > 0)
    ?  PLOT_SIZE - (myScoreFrameSizePx.height - 1) / sizePx.height * PLOT_SIZE
    :  PLOT_SIZE);

  const hoveredX = (hoveredIndex === null  ?  0  :  pointX(hoveredIndex));

  return (
    <div className="scores-graph" style={{ '--red-share': lossRedShare(lossCount) } as CSSProperties} onPointerMove={hover}
      onPointerLeave={()  =>  setHoveredIndex(null)}>
      <svg ref={svg} viewBox={`0 0 ${PLOT_SIZE} ${PLOT_SIZE}`} preserveAspectRatio="none" aria-hidden="true">
        <line className="bound" x1={0} x2={PLOT_SIZE} y1={top} y2={top} />
        {renderPart('area', 'below', -dotRadius, Math.min(myX, capX))}
        {renderPart('area', 'above', myX, capX)}
        {renderPart('area', 'capped', capX, PLOT_SIZE + dotRadius)}
        {renderPart('line', 'below', -dotRadius, myX)}
        {renderPart('line', 'above', myX, capX)}
        {renderPart('line', 'above capped', Math.max(myX, capX), PLOT_SIZE + dotRadius)}
        {myIndex !== -1  &&  <line className="mine" x1={myX} x2={myX} y1={pointY(scores[myIndex]!)}
          y2={Math.max(pointY(scores[myIndex]!), myLineBottom)} />}
        {hoveredEntry  &&  <line className="hovered" x1={hoveredX} x2={hoveredX} y1={pointY(hoveredEntry.score)} y2={PLOT_SIZE} />}
        {ascendingEntries.map((entry, i)  =>  (
          <path key={(entry.me  ?  'me'  :  entry.playerId)} className={dotClass(entry, i)} d={`M${pointX(i)},${pointY(entry.score)}h0`}
            style={dotStyle(entry)} />
        ))}
        {hoveredEntry  &&  (
          <path className="hovered-dot" d={`M${hoveredX},${pointY(hoveredEntry.score)}h0`} style={{ strokeWidth: 2 * DOT_RADIUS_PX + 2 }} />
        )}
      </svg>
      {myScoreIsFramed  &&  (
        <div ref={myScoreFrame} className="my-score" style={{ left: myScoreFrameLeftPx }}>
          {Math.floor(scores[myIndex]! / 1000)}<span className="my-score-tail">k</span>
        </div>
      )}
      {/* Shifted left by as much of its width as it's far along, so it stays inside the graph; at the bottom when the
           score is high, so it doesn't hide its dot. */}
      {hoveredEntry  &&  (
        <div className={`hovered-score${(pointY(hoveredEntry.score) < PLOT_SIZE / 2  ?  ' at-bottom'  :  '')}`} style={{ '--hovered-share': hoveredX / PLOT_SIZE } as CSSProperties}>
          <span className="hovered-player">{displayName((hoveredEntry.me  ?  myName  :  hoveredEntry.player))}</span>
          <span><Score value={hoveredEntry.score} tailClass="tail-dim" /></span>
        </div>
      )}
    </div>
  );
}
