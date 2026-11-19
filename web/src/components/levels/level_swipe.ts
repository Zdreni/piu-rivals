import { type MouseEvent, type PointerEvent, useEffect, useRef, useState } from 'react';

// How long a finger rests on a bar before a swipe starts, and how far it may move before that, or it scrolls instead.
const LONG_PRESS_MS = 350;
const MAX_LONG_PRESS_MOVE_PX = 10;


// The level of the bar `element` is in, if that bar is in `chart`.
function barLevelOrNull(element: Element | null, chart: HTMLElement) {
  const bar = element?.closest<HTMLElement>('[data-level]');
  return ((bar  &&  chart.contains(bar))  ?  bar.dataset.level!  :  null);
}


// Selecting levels by swiping a finger over their bars. A swipe starts with a long press on a bar, so that a swipe
//  right away still scrolls the levels; from then on the finger doesn't scroll. It ends with `onSwipe` and the levels
//  it passed over, in the order of `levels`, and the click it may leave behind is dropped. `swipedLevels` are the levels
//  passed over so far, null while there's no swipe. `chartRef` and the handlers go on the levels' chart.
export function useLevelSwipe(levels: string[], onSwipe: (swipedLevels: string[]) => void) {
  const [swipedLevels, setSwipedLevels] = useState<string[] | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  // The finger on a bar: where it went down, and the levels swiped once the long press is over (null until then).
  const pressRef = useRef<{ chart: HTMLElement; x: number; y: number; timer: number; levels: string[] | null } | null>(null);
  const clickIsDropped = useRef(false);

  // Only a touchmove listener that isn't passive can stop the scrolling, and React's are.
  useEffect(()  => {
    const stopScroll = (event: TouchEvent)  => {
      if (pressRef.current?.levels)
        event.preventDefault();
    };

    const chart = chartRef.current;
    chart?.addEventListener('touchmove', stopScroll, { passive: false });
    return ()  =>  chart?.removeEventListener('touchmove', stopScroll);
  }, []);

  const endPress = ()  => {
    const press = pressRef.current;
    pressRef.current = null;
    if (press)
      clearTimeout(press.timer);

    return press;
  };


  const onPointerDown = (event: PointerEvent<HTMLElement>)  => {
    clickIsDropped.current = false;
    endPress();

    const level = barLevelOrNull(event.target as Element, event.currentTarget);
    if (event.pointerType !== 'touch'  ||  ! level)
      return;

    const timer = window.setTimeout(()  => {
      if (! pressRef.current)
        return;

      pressRef.current.levels = [level];
      setSwipedLevels([level]);
      // Browsers without vibration, such as Safari, don't have the method.
      navigator.vibrate?.(15);
    }, LONG_PRESS_MS);

    pressRef.current = { chart: event.currentTarget, x: event.clientX, y: event.clientY, timer, levels: null };
  };


  const onPointerMove = (event: PointerEvent<HTMLElement>)  => {
    const press = pressRef.current;
    if (! press)
      return;

    if (! press.levels) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > MAX_LONG_PRESS_MOVE_PX)
        endPress();

      return;
    }

    // The finger's pointer stays on the bar it started on, so the bar under it is looked up.
    const level = barLevelOrNull(document.elementFromPoint(event.clientX, event.clientY), press.chart);
    if (! level  ||  press.levels.includes(level))
      return;

    press.levels = [...press.levels, level];
    setSwipedLevels(press.levels);
  };


  const onPointerUp = ()  => {
    const press = endPress();
    if (! press?.levels)
      return;

    const pressLevels = press.levels;
    clickIsDropped.current = true;
    setSwipedLevels(null);
    onSwipe(levels.filter((level)  =>  pressLevels.includes(level)));
  };


  const onPointerCancel = ()  => {
    endPress();
    setSwipedLevels(null);
  };


  // A long press would open the browser's menu for the bar.
  const onContextMenu = (event: MouseEvent<HTMLElement>)  => {
    if (pressRef.current)
      event.preventDefault();
  };


  const onClickCapture = (event: MouseEvent<HTMLElement>)  => {
    if (! clickIsDropped.current)
      return;

    clickIsDropped.current = false;
    event.stopPropagation();
  };

  return {
    swipedLevels,
    chartRef,
    swipeHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu, onClickCapture },
  };
}
