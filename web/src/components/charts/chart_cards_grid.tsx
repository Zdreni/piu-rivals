import { Fragment, type ReactNode, type Ref } from 'react';
import type { FoldedChartboard } from '../../data/folded_chartboard.ts';
import { useScrollVeil } from '../scroll_veil.ts';

// A run of cards in the grid, under a title, or straight after the cards before it without one.
export interface ChartCardsGroup {
  key: string;
  title: string | null;
  // The title's own class, e.g. "day".
  className?: string;
  foldedChartboards: FoldedChartboard[];
  // Given, the title is a button that rolls the cards up or unrolls them, like a folder; rolled up, they aren't drawn.
  //  Unrolled, the title stays at the top while the cards scroll under it.
  folder?: { unrolled: boolean; onToggle: () => void };
  // A folder's note at the right end of its title, e.g. how many cards it holds.
  note?: string;
}


// The scrolling body of a score view: a grid of the groups' cards under their titles, or `emptyMessage`.
// Titles have a data-flip key like the cards, so they move along with them (see SelectedLevelCharts).
export function ChartCardsGrid({ ref, role, emptyMessage, groups, renderCard, footer }: {
  ref?: Ref<HTMLDivElement>;
  role?: string;
  emptyMessage: string | null;
  groups: ChartCardsGroup[];
  renderCard: (foldedChartboard: FoldedChartboard) => ReactNode;
  footer?: ReactNode;
}) {
  const veilRef = useScrollVeil('.group-folder > .group-title', ref);
  return (
    <div className="dlg-body" role={role} ref={veilRef}>
      {emptyMessage !== null
        ?  <div className="empty">{emptyMessage}</div>
        :  (
          <div className="chart-grid">
            {groups.map(({ key, title, className, foldedChartboards, folder, note })  =>  {
              const titleClass = `group-title${(className  ?  ` ${className}`  :  '')}`;
              // A folder gets a box of its own, so its title sticks to the top only while its cards scroll under it.
              if (folder)
                return (
                  <div key={key} className="group-folder">
                    <h3 className={titleClass} data-flip={`group ${key}`}>
                      <button className={`group-toggle${(folder.unrolled  ?  ' unrolled'  :  '')}`} type="button" aria-expanded={folder.unrolled} onClick={folder.onToggle}>
                        {title}
                        {note  &&  <span className="group-note">{note}</span>}
                      </button>
                    </h3>
                    {folder.unrolled  &&  foldedChartboards.map(renderCard)}
                  </div>
                );

              return (
                <Fragment key={key}>
                  {title !== null  &&  <h3 className={titleClass} data-flip={`group ${key}`}>{title}</h3>}
                  {foldedChartboards.map(renderCard)}
                </Fragment>
              );
            })}
            {footer}
          </div>
        )}
    </div>
  );
}
