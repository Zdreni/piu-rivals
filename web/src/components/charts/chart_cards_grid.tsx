import { Fragment, type ReactNode, type Ref } from 'react';
import type { ChartRow } from '../../data/model.ts';

// A run of cards in the grid, under a title, or straight after the cards before it without one.
export interface ChartCardsGroup {
  key: string;
  title: string | null;
  // The title's own class, e.g. "day".
  className?: string;
  charts: ChartRow[];
  // Given, the title is a button that rolls the cards up or unrolls them, like a folder; rolled up, they aren't drawn.
  // Unrolled, the title stays at the top while the cards scroll under it.
  onToggle?: () => void;
  unrolled?: boolean;
  // A folder's note at the right end of its title, e.g. how many cards it holds.
  note?: string;
}


// The scrolling body of a score view: `emptyMessage` instead of the grid when given, otherwise a grid of the groups' cards,
// each drawn by `card`, under their titles, then `footer`. A `narrow` grid fits more of the narrower cards without
// diffs in a row. Titles have a data-flip key, like the cards, so they move along with them (see SelectedLevelCharts).
export function ChartCardsGrid({ ref, role, emptyMessage = null, narrow = false, groups, card, footer }: {
  ref?: Ref<HTMLDivElement>;
  role?: string;
  emptyMessage?: string | null;
  narrow?: boolean;
  groups: ChartCardsGroup[];
  card: (chart: ChartRow) => ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="dlg-body" role={role} ref={ref}>
      {emptyMessage !== null
        ?  <div className="empty">{emptyMessage}</div>
        :  (
          <div className={`chart-grid${(narrow  ?  ' narrow'  :  '')}`}>
            {groups.map(({ key, title, className, charts, onToggle, unrolled = true, note })  =>  {
              const titleClass = `group-title${(className  ?  ` ${className}`  :  '')}`;
              // A folder gets a box of its own, so its title sticks to the top only while its cards scroll under it.
              if (onToggle)
                return (
                  <div key={key} className="group-folder">
                    <h3 className={titleClass} data-flip={`group ${key}`}>
                      <button className={`group-toggle${(unrolled  ?  ' unrolled'  :  '')}`} type="button" aria-expanded={unrolled} onClick={onToggle}>
                        {title}
                        {note  &&  <span className="group-note">{note}</span>}
                      </button>
                    </h3>
                    {unrolled  &&  charts.map(card)}
                  </div>
                );

              return (
                <Fragment key={key}>
                  {title !== null  &&  <h3 className={titleClass} data-flip={`group ${key}`}>{title}</h3>}
                  {charts.map(card)}
                </Fragment>
              );
            })}
            {footer}
          </div>
        )}
    </div>
  );
}
