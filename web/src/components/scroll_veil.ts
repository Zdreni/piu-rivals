import { type Ref, type RefCallback, useCallback } from 'react';


// Gives `ref` the box, whichever kind of ref it is.
function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function')
    ref(value);
  else if (ref)
    ref.current = value;
}


// The fade starts under the title stuck to the box's top, if any: it covers what scrolls under it already.
function stuckTitleHeight(box: HTMLElement, stickyTitleSelector: string | null) {
  if (! stickyTitleSelector)
    return 0;

  const boxTop = box.getBoundingClientRect().top;
  for (const title of box.querySelectorAll(stickyTitleSelector)) {
    const { top, height } = title.getBoundingClientRect();
    if (Math.abs(top - boxTop) < 1)
      return height;
  }

  return 0;
}


// Marks the scrolling `box` with whether there's more to scroll to above and below what's in view, so its content fades
//  out at its top and bottom then (see .scroll-veil in styles.css), until the returned function is called.
//  `stickyTitleSelector` names titles that stick to its top.
export function watchScrollVeil(box: HTMLElement, stickyTitleSelector: string | null) {
  box.classList.add('scroll-veil');

  const markScrollEdges = ()  => {
    box.classList.toggle('more-above', box.scrollTop > 1);
    box.classList.toggle('more-below', box.scrollTop + box.clientHeight < box.scrollHeight - 1);
    box.style.setProperty('--veil-top', `${stuckTitleHeight(box, stickyTitleSelector)}px`);
  };

  // Unrolled rows, cards coming and going and another tab's content all change how much there is to scroll.
  const resizeObserver = new ResizeObserver(markScrollEdges);
  const observeContent = ()  => {
    resizeObserver.disconnect();
    resizeObserver.observe(box);
    for (const child of box.children)
      resizeObserver.observe(child);

    markScrollEdges();
  };

  const mutationObserver = new MutationObserver(observeContent);
  observeContent();
  mutationObserver.observe(box, { childList: true });
  box.addEventListener('scroll', markScrollEdges, { passive: true });
  return ()  => {
    box.removeEventListener('scroll', markScrollEdges);
    resizeObserver.disconnect();
    mutationObserver.disconnect();
  };
}


// A ref for a scrolling box, which watches it as watchScrollVeil does; `ref` is given the box too.
export function useScrollVeil<T extends HTMLElement>(stickyTitleSelector: string | null, ref?: Ref<T>): RefCallback<T> {
  return useCallback((box: T | null)  => {
    setRef(ref, box);
    if (! box)
      return;

    const stopWatching = watchScrollVeil(box, stickyTitleSelector);
    return ()  => {
      stopWatching();
      setRef(ref, null);
    };
  }, [stickyTitleSelector, ref]);
}


// As watchScrollVeil, for the page itself where it scrolls (on phones and tablets, or long pages), marking `app`: the
//  page can't be masked, so its veils are drawn over it (see .app.more-above and .app.more-below in styles.css). A
//  folder's title stuck to the window's top is marked .stuck, for the veil to go under it.
export function watchPageScrollVeil(app: HTMLElement) {
  const markScrollEdges = ()  => {
    const root = document.documentElement;
    app.classList.toggle('more-above', root.scrollTop > 1);
    app.classList.toggle('more-below', root.scrollTop + root.clientHeight < root.scrollHeight - 1);
    for (const title of app.querySelectorAll('.group-folder > .group-title'))
      title.classList.toggle('stuck', root.scrollTop > 1  &&  Math.abs(title.getBoundingClientRect().top) < 1);
  };

  const resizeObserver = new ResizeObserver(markScrollEdges);
  resizeObserver.observe(app);
  window.addEventListener('scroll', markScrollEdges, { passive: true });
  window.addEventListener('resize', markScrollEdges);
  markScrollEdges();
  return ()  => {
    window.removeEventListener('scroll', markScrollEdges);
    window.removeEventListener('resize', markScrollEdges);
    resizeObserver.disconnect();
  };
}
