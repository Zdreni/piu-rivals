import { type PointerEvent, useId, useLayoutEffect, useRef, useState } from 'react';
import type { LevelAverage } from '../../data/level_averages.ts';
import { formatNumber } from '../../util.ts';
import './score_graph.css';

// The score axis: lower averages are drawn on its bottom edge, the hover still tells them.
const MIN_GRAPH_SCORE = 900000;
const MAX_GRAPH_SCORE = 1000000;
const SCORE_GRID_STEP = 20000;
const GRAPH_HEIGHT_PX = 220;
const PLOT_MARGINS_PX = { top: 10, right: 12, bottom: 26, left: 42 };
// Level labels are left out in turn when each would get less room than this, counting down from the highest level, which
//  is always labelled.
const MIN_LEVEL_LABEL_WIDTH_PX = 22;
const POINT_RADIUS_PX = 3;
// The hover box keeps this far from the hovered level's line.
const HOVER_GAP_PX = 10;
// An average of fewer charts than this is less sure, so it's drawn fainter, in proportion to its chart count.
const MIN_OPAQUE_CHARTS = 5;

export interface GraphSeries {
  name: string;
  // Your series is drawn in green with its area filled, the other one's in red.
  isMine: boolean;
  levelAverages: Map<number, LevelAverage>;
}

const scoreLabel = (score: number)  =>  `${score / 1000}k`;

// A level's average on the graph, and how opaque it's drawn.
interface GraphPoint {
  x: number;
  y: number;
  opacity: number;
}

const scoreGridLines = Array.from({ length: (MAX_GRAPH_SCORE - MIN_GRAPH_SCORE) / SCORE_GRID_STEP + 1 },
  (_, i)  =>  MIN_GRAPH_SCORE + i * SCORE_GRID_STEP);


// A point for each of `levels` that `levelAverages` has; levels without one are left out, so the line joins the points
//  around them.
const graphPoints = (levels: number[], levelAverages: Map<number, LevelAverage>, pointAt: (index: number, score: number) => [number, number])  =>
  levels.flatMap((level, i): GraphPoint[]  => {
    const levelAverage = levelAverages.get(level);
    if (! levelAverage)
      return [];

    const [x, y] = pointAt(i, levelAverage.average);
    return [{ x, y, opacity: Math.min(1, levelAverage.chartCount / MIN_OPAQUE_CHARTS) }];
  });


const linePath = (points: GraphPoint[])  =>  points.map(({ x, y }, i)  =>  `${(i  ?  'L'  :  'M')}${x},${y}`).join('');

// The area between `points` and `bottomY`.
const areaPath = (points: GraphPoint[], bottomY: number)  =>
  `${linePath(points)}L${points.at(-1)!.x},${bottomY}L${points[0]!.x},${bottomY}Z`;


// The line through `points`, each segment fading from one end's opacity to the other's. `gradientIdPrefix` keeps its
//  segments' gradients apart from other lines'.
const renderLine = (points: GraphPoint[], gradientIdPrefix: string)  =>  points.slice(1).map((point, i)  => {
  const previous = points[i]!;
  const gradientId = `${gradientIdPrefix}-${point.x}`;
  return (
    <g key={point.x}>
      <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={previous.x} y1={previous.y} x2={point.x} y2={point.y}>
        <stop offset="0" stopOpacity={previous.opacity} />
        <stop offset="1" stopOpacity={point.opacity} />
      </linearGradient>
      <line className="score-graph-line" x1={previous.x} y1={previous.y} x2={point.x} y2={point.y} stroke={`url(#${gradientId})`} />
    </g>
  );
});


// A graph of the average best score at each of `levels` (one chart type's), one line for each of `seriesList`, with the
//  averages of a level shown on hover.
export function ScoreGraph({ title, levels, seriesList }: { title: string; levels: number[]; seriesList: GraphSeries[] }) {
  const gradientId = useId();
  const box = useRef<HTMLDivElement>(null);
  const [widthPx, setWidthPx] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const hoverBox = useRef<HTMLDivElement>(null);

  useLayoutEffect(()  => {
    const element = box.current!;
    setWidthPx(element.clientWidth);

    const resizeObserver = new ResizeObserver(()  =>  setWidthPx(element.clientWidth));
    resizeObserver.observe(element);
    return ()  =>  resizeObserver.disconnect();
  }, []);

  const plotWidth = Math.max(0, widthPx - PLOT_MARGINS_PX.left - PLOT_MARGINS_PX.right);
  const plotBottom = GRAPH_HEIGHT_PX - PLOT_MARGINS_PX.bottom;
  const levelWidth = plotWidth / Math.max(1, levels.length);
  const levelX = (index: number)  =>  PLOT_MARGINS_PX.left + (index + 0.5) * levelWidth;
  const scoreY = (score: number)  =>  PLOT_MARGINS_PX.top + (MAX_GRAPH_SCORE - Math.max(MIN_GRAPH_SCORE, Math.min(MAX_GRAPH_SCORE, score)))
    / (MAX_GRAPH_SCORE - MIN_GRAPH_SCORE) * (plotBottom - PLOT_MARGINS_PX.top);

  const pointAt = (index: number, score: number): [number, number]  =>  [levelX(index), scoreY(score)];
  const levelLabelStep = Math.ceil(MIN_LEVEL_LABEL_WIDTH_PX / Math.max(1, levelWidth));

  const hover = (event: PointerEvent<SVGSVGElement>)  => {
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left - PLOT_MARGINS_PX.left;
    setHoveredIndex(Math.max(0, Math.min(levels.length - 1, Math.floor(x / Math.max(1, levelWidth)))));
  };

  const hoveredLevel = (hoveredIndex === null  ?  null  :  levels[hoveredIndex]  ??  null);

  // The hover box goes beside the line, on the side with more room, and stays inside the graph where neither has
  //  enough (on phones).
  useLayoutEffect(()  => {
    const element = hoverBox.current;
    if (! element  ||  hoveredIndex === null)
      return;

    const lineX = levelX(hoveredIndex);
    const boxWidth = element.offsetWidth;
    const left = (lineX > widthPx / 2  ?  lineX - HOVER_GAP_PX - boxWidth  :  lineX + HOVER_GAP_PX);
    element.style.left = `${Math.max(0, Math.min(widthPx - boxWidth, left))}px`;
  }, [hoveredIndex, widthPx, levels.length]);

  return (
    <figure className="score-graph">
      <figcaption className="score-graph-title">{title}</figcaption>
      <div className="score-graph-box" ref={box}>
        {widthPx > 0  &&  (
          <svg width={widthPx} height={GRAPH_HEIGHT_PX} onPointerMove={hover} onPointerDown={hover} onPointerLeave={()  =>  setHoveredIndex(null)}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" className="score-graph-fill-top" />
                <stop offset="1" className="score-graph-fill-bottom" />
              </linearGradient>
            </defs>
            {scoreGridLines.map((score)  =>  (
              <g key={score}>
                <line className={(score === MIN_GRAPH_SCORE  ?  'score-graph-base'  :  'score-graph-grid')}
                  x1={PLOT_MARGINS_PX.left} x2={PLOT_MARGINS_PX.left + plotWidth} y1={scoreY(score)} y2={scoreY(score)} />
                <text className="score-graph-label" x={PLOT_MARGINS_PX.left - 6} y={scoreY(score)} textAnchor="end" dominantBaseline="middle">
                  {scoreLabel(score)}
                </text>
              </g>
            ))}
            {levels.map((level, i)  =>  (levels.length - 1 - i) % levelLabelStep === 0  &&  (
              <text key={level} className="score-graph-label" x={levelX(i)} y={GRAPH_HEIGHT_PX - 6} textAnchor="middle">{level}</text>
            ))}
            {hoveredIndex !== null  &&  (
              <line className="score-graph-crosshair" x1={levelX(hoveredIndex)} x2={levelX(hoveredIndex)} y1={PLOT_MARGINS_PX.top} y2={plotBottom} />
            )}
            {seriesList.map((series)  => {
              const points = graphPoints(levels, series.levelAverages, pointAt);
              const seriesClass = (series.isMine  ?  'mine'  :  'theirs');
              return (
                <g key={seriesClass} className={`score-graph-series ${seriesClass}`}>
                  {series.isMine  &&  points.length > 0  &&  <path fill={`url(#${gradientId})`} d={areaPath(points, plotBottom)} />}
                  {renderLine(points, `${gradientId}-${seriesClass}`)}
                  {points.map(({ x, y, opacity })  =>  (
                    <circle key={x} className="score-graph-point" cx={x} cy={y} r={POINT_RADIUS_PX} opacity={opacity} />
                  ))}
                </g>
              );
            })}
          </svg>
        )}
        {hoveredIndex !== null  &&  hoveredLevel !== null  &&  (
          <div className="score-graph-hover" ref={hoverBox}>
            <div className="score-graph-hover-level">Level {hoveredLevel}</div>
            {seriesList.map((series)  => {
              const levelAverage = series.levelAverages.get(hoveredLevel);
              return (
                <div key={String(series.isMine)} className="score-graph-hover-row">
                  <span className={`score-graph-swatch ${(series.isMine  ?  'mine'  :  'theirs')}`} />
                  <span className="score-graph-hover-name">{series.name}</span>
                  <span className="score-graph-hover-score">{(levelAverage  ?  formatNumber(Math.round(levelAverage.average))  :  '—')}</span>
                  <span className="score-graph-hover-count">
                    {(levelAverage  ?  `${levelAverage.chartCount} chart${(levelAverage.chartCount === 1  ?  ''  :  's')}`  :  'no charts')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </figure>
  );
}
