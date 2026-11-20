// Scrolls a score view's list back to its top, as when other levels are picked: its own scrolling box (.dlg-body)
//  on wide screens, and the page back up to `main` where the page scrolls instead (on phones and tablets).
export function scrollToListTop(main: HTMLElement | null) {
  if (! main)
    return;

  for (const body of main.querySelectorAll<HTMLElement>('.dlg-body'))
    body.scrollTop = 0;

  const mainTop = main.getBoundingClientRect().top;
  if (mainTop < 0)
    window.scrollBy(0, mainTop);
}
