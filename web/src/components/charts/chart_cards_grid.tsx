import { Fragment, type ReactNode, type Ref } from 'react';
import type { ChartRow } from '../../data/model.ts';

// A run of cards in the grid, under a title, or straight after the cards before it without one.
export interface ChartCardsGroup {
  key: string;
  title: string | null;
  // The title's own class, e.g. "day".
  className?: string;
  charts: ChartRow[];
}


// The scrolling body of a score view: `empty` instead of the grid when given, otherwise a grid of the groups' cards,
// each drawn by `card`, under their titles, then `footer`. A `narrow` grid fits more of the narrower cards without
// diffs in a row. Titles have a data-flip key, like the cards, so they move along with them (see SelectedLevelCharts).
export function ChartCardsGrid({ ref, role, empty = null, narrow = false, groups, card, footer }: {
  ref?: Ref<HTMLDivElement>;
  role?: string;
  empty?: string | null;
  narrow?: boolean;
  groups: ChartCardsGroup[];
  card: (chart: ChartRow) => ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="dlg-body" role={role} ref={ref}>
      {empty !== null
        ?  <div className="empty">{empty}</div>
        :  (
          <div className={`chart-grid${(narrow  ?  ' narrow'  :  '')}`}>
            {groups.map(({ key, title, className, charts })  =>  (
              <Fragment key={key}>
                {title !== null  &&  <h3 className={`group-title${(className  ?  ` ${className}`  :  '')}`} data-flip={`group ${key}`}>{title}</h3>}
                {charts.map(card)}
              </Fragment>
            ))}
            {footer}
          </div>
        )}
    </div>
  );
}
