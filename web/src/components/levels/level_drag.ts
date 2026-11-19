import { type MouseEvent, type PointerEvent, useEffect, useRef, useState } from 'react';
import { levelNum, levelType } from '../../data/stats.ts';
import type { LevelSide } from './level_chart.tsx';

// How long a finger rests on a bar before a drag starts, and how far it may move before that, or it scrolls instead.
const LONG_PRESS_MS = 350;
const MAX_LONG_PRESS_MOVE_PX = 10;

// A place in the levels' grid: a level number's row, on the singles' or the doubles' side.
interface Cell {
  num: number;
  side: LevelSide;
}

interface Drag {
  chart: HTMLElement;
  x: number;
  y: number;
  timer: number;
  start: Cell;
  // The corner the pointer is at, and the levels in the rectangle, once the drag has started.
  end: Cell | null;
  levels: string[];
}


export const levelSide = (level: string): LevelSide  =>  ((levelType(level) === 'S')  ?  'single'  :  'double');


// The level of the bar `element` is in, if that bar is in `chart`.
function barLevelOrNull(element: Element | null, chart: HTMLElement) {
  const bar = element?.closest<HTMLElement>('[data-level]');
  return ((bar  &&  chart.contains(bar))  ?  bar.dataset.level!  :  null);
}


// The cell of `chart` at the point (`x`, `y`): the row of the level number beside it, the nearest one above or below
//  the rows, and the side of that number it's on, or `lastSide` over the number.
function cellAtOrNull(chart: HTMLElement, x: number, y: number, lastSide: LevelSide): Cell | null {
  const numCells = [...chart.querySelectorAll<HTMLElement>('[data-num]')];
  const rects = numCells.map((cell)  =>  cell.getBoundingClientRect());
  const rowIndex = rects.findIndex((rect)  =>  y < rect.bottom);
  const row = ((rowIndex === -1)  ?  rects.length - 1  :  rowIndex);
  const rect = rects[row];
  if (! rect)
    return null;

  const side = ((x < rect.left)  ?  'single'  :  (x > rect.right)  ?  'double'  :  lastSide);
  return { num: Number(numCells[row]!.dataset.num), side };
}


// The levels of `sideLevels` in the rectangle between cells `a` and `b`, both sides when they're on different ones.
const rectangleLevels = (sideLevels: string[], a: Cell, b: Cell)  =>  sideLevels.filter((level)  =>
  levelNum(level) >= Math.min(a.num, b.num)  &&  levelNum(level) <= Math.max(a.num, b.num)
  &&  (a.side !== b.side  ||  levelSide(level) === a.side));


// Selecting a rectangle of singles and doubles (`sideLevels`) by dragging from one bar to another: right away with a
//  mouse, and after a long press with a finger, so that a swipe right away still scrolls the levels. It ends with
//  `onDrag` and the rectangle's levels, in the order of `sideLevels`, and the click it may leave behind is dropped. A
//  mouse that stays on its bar is left to that bar's click. `draggedLevels` are the rectangle's levels so far, null
//  while there's no drag. `chartRef` and the handlers go on the levels' chart.
export function useLevelDrag(sideLevels: string[], onDrag: (draggedLevels: string[]) => void) {
  const [draggedLevels, setDraggedLevels] = useState<string[] | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const clickIsDropped = useRef(false);

  // Only a touchmove listener that isn't passive can stop the scrolling, and React's are.
  useEffect(()  => {
    const stopScroll = (event: TouchEvent)  => {
      if (dragRef.current?.end)
        event.preventDefault();
    };

    const chart = chartRef.current;
    chart?.addEventListener('touchmove', stopScroll, { passive: false });
    return ()  =>  chart?.removeEventListener('touchmove', stopScroll);
  }, []);

  const endDrag = ()  => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag)
      clearTimeout(drag.timer);

    return drag;
  };


  const extend = (drag: Drag, end: Cell)  => {
    drag.end = end;
    drag.levels = rectangleLevels(sideLevels, drag.start, end);
    setDraggedLevels(drag.levels);
  };


  const onPointerDown = (event: PointerEvent<HTMLElement>)  => {
    clickIsDropped.current = false;
    endDrag();

    const level = barLevelOrNull(event.target as Element, event.currentTarget);
    if (event.button !== 0  ||  ! level  ||  ! sideLevels.includes(level))
      return;

    const start = { num: levelNum(level), side: levelSide(level) };
    const drag: Drag = { chart: event.currentTarget, x: event.clientX, y: event.clientY, timer: 0, start, end: null, levels: [] };
    if (event.pointerType === 'touch') {
      drag.timer = window.setTimeout(()  => {
        if (dragRef.current !== drag)
          return;

        extend(drag, start);
        // Browsers without vibration, such as Safari, don't have the method.
        navigator.vibrate?.(15);
      }, LONG_PRESS_MS);
    }

    dragRef.current = drag;
  };


  const onPointerMove = (event: PointerEvent<HTMLElement>)  => {
    const drag = dragRef.current;
    if (! drag)
      return;

    if (! drag.end  &&  event.pointerType === 'touch') {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > MAX_LONG_PRESS_MOVE_PX)
        endDrag();

      return;
    }

    const lastCell = drag.end  ??  drag.start;
    const cell = cellAtOrNull(drag.chart, event.clientX, event.clientY, lastCell.side);
    if (! cell  ||  (cell.num === lastCell.num  &&  cell.side === lastCell.side))
      return;

    // A mouse keeps dragging outside the chart. Not before it leaves its bar, or the bar's click would go to the chart.
    if (! drag.end)
      drag.chart.setPointerCapture(event.pointerId);

    extend(drag, cell);
  };


  const onPointerUp = ()  => {
    const drag = endDrag();
    if (! drag?.end)
      return;

    clickIsDropped.current = true;
    setDraggedLevels(null);
    if (drag.levels.length)
      onDrag(drag.levels);
  };


  const onPointerCancel = ()  => {
    endDrag();
    setDraggedLevels(null);
  };


  // A long press would open the browser's menu for the bar.
  const onContextMenu = (event: MouseEvent<HTMLElement>)  => {
    if (dragRef.current)
      event.preventDefault();
  };


  const onClickCapture = (event: MouseEvent<HTMLElement>)  => {
    if (! clickIsDropped.current)
      return;

    clickIsDropped.current = false;
    event.stopPropagation();
  };

  return {
    draggedLevels,
    chartRef,
    dragHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu, onClickCapture },
  };
}
