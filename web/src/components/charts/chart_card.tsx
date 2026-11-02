import type { SnoozeDays } from '@piu-rivals/shared';
import { type MouseEvent, type ReactNode, useState } from 'react';
import { timeLeft } from './format.tsx';
import { ResultItem } from './result_item.tsx';
import type { Chartboard } from '../../data/model.ts';
import { type Entry, type FoldedChartboard, SHOW_STEP, unfold, type UnfoldedRivalCounts } from '../../data/folded_chartboard.ts';
import { resultStat, type Stat } from '../../data/stats.ts';

// The row unrolled for your own score, and the header unrolled.
const ME = 'me';
const HEAD = 'head';

const SNOOZE_DAYS_OPTIONS: SnoozeDays[] = [1, 3, 7, 15];

const CHART_TYPES: Record<string, [string, string]> = { S: ['single', 'Single'], D: ['double', 'Double'] };


// A chart's label, e.g. "D24", as a ball of its type's colour with its level in it.
function ChartBall({ chartLabel }: { chartLabel: string }) {
  const [, type = '', level = chartLabel] = /^(\D*?)\s*(\d+)$/.exec(chartLabel)  ??  [];
  const [className, name] = CHART_TYPES[type]  ??  ['other', type];
  return <span className={`chart-label ${className}`} title={`${name} ${level}`}>{level}</span>;
}


// A card's header: the track and the chart, unrolled by a click, with snoozing when `canSnooze` and a close button
//  when `maximized`.
function CardHead({ chartboard, unrolled, canSnooze, snoozesCheckedAt, menuIsOpen, maximized, onToggle, onClose, onMenu, onSnooze, onWake }: {
  chartboard: Chartboard;
  unrolled: boolean;
  canSnooze: boolean;
  snoozesCheckedAt: number;
  menuIsOpen: boolean;
  maximized: boolean;
  onToggle?: () => void;
  onClose?: () => void;
  onMenu: () => void;
  onSnooze: (days: SnoozeDays) => void;
  onWake: () => void;
}) {
  const snoozeTimeLeft = (chartboard.snoozedUntil === null  ?  null  :  timeLeft(chartboard.snoozedUntil - snoozesCheckedAt));
  const more = snoozeTimeLeft !== null  ||  ((unrolled  ||  maximized)  &&  canSnooze);
  // The length picked in the menu, lit while the card fades out.
  const [pickedDays, setPickedDays] = useState<SnoozeDays | null>(null);
  const press = (action: () => void)  =>  (event: MouseEvent)  => {
    event.stopPropagation();
    action();
  };

  const toggleMenu = press(()  => {
    setPickedDays(null);
    onMenu();
  });

  const pick = (days: SnoozeDays)  =>  press(()  => {
    setPickedDays(days);
    onSnooze(days);
  });

  return (
    <header className={`chart-card-head${((unrolled  ||  maximized)  ?  ' unrolled'  :  '')}${(more  ?  ' more'  :  '')}${(menuIsOpen  ?  ' menu-open'  :  '')}${(maximized  ?  ' maximized'  :  '')}${(snoozeTimeLeft !== null  ?  ' snoozed'  :  '')}`}
      onClick={onToggle}>
      <div className="chart-card-title">
        <span className="track" title={chartboard.trackTitle}>{(unrolled  ||  maximized)  ?  chartboard.trackTitle  :  chartboard.track}</span>
        <span className="chart-slot"><ChartBall chartLabel={chartboard.chartLabel} /></span>
        {maximized  &&  (
          <button className="card-close" type="button" aria-label="Close" title="Close" onClick={press(()  =>  onClose?.())}>
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11" /></svg>
          </button>
        )}
      </div>
      {(snoozeTimeLeft !== null  ||  canSnooze)  &&  (
        <div className="chart-card-more">
          <div>
            {(snoozeTimeLeft === null  &&  maximized)
              ?  (
                <span className="snooze snooze-panel">
                  <span className="snooze-title">Snooze chart to Hidden</span>
                  <span className="snooze-lengths" role="group" aria-label="Snooze for">
                    {SNOOZE_DAYS_OPTIONS.map((days)  =>  (
                      <button key={days} type="button" title="Hide this chart for a while" onClick={pick(days)}>
                        {days === 1  ?  '1 day'  :  `${days} days`}
                      </button>
                    ))}
                  </span>
                </span>
              )
              :  snoozeTimeLeft === null
              ?  (
                <span className="snooze">
                  <span className="snooze-anchor">
                    <button className={`snooze-button snooze-toggle${(menuIsOpen  ?  ' on'  :  '')}`} type="button" aria-haspopup="menu"
                      aria-expanded={menuIsOpen} title="Hide this chart for a while" onClick={toggleMenu}>
                      Snooze…
                    </button>
                    {menuIsOpen  &&  (
                      <span className="snooze-menu" role="menu">
                        {SNOOZE_DAYS_OPTIONS.map((days)  =>  (
                          <button key={days} className={(pickedDays === days  ?  'picked'  :  undefined)} type="button" role="menuitem"
                            onClick={pick(days)}>
                            {days === 1  ?  '1 day'  :  `${days} days`}
                          </button>
                        ))}
                      </span>
                    )}
                  </span>
                </span>
              )
              :  (
                <span className="snooze snooze-panel wake">
                  <span className="snooze-title">Chart snoozed for {snoozeTimeLeft}</span>
                  <span className="snooze-lengths">
                    <button type="button" title="Show this chart again now" onClick={press(onWake)}>Wake now</button>
                  </span>
                </span>
              )}
            {! maximized  &&  snoozeTimeLeft === null  &&  <ChartBall chartLabel={chartboard.chartLabel} />}
          </div>
        </div>
      )}
    </header>
  );
}


// A fold button's count, e.g. "3", in the colour of the strongest result folded, e.g. red if any of them beats you,
//  with an "=" for ties. Ties get the tie colour unless `treatTieAsWin`.
const FOLD_TONES: [Stat, string, string][] = [
  ['lose', 'neg', ''], ['hidden', 'neg muted', ''], ['unplayed', 'blue', ''], ['win', 'pos', ''], ['tie', 'tie', '='],
];


function FoldCount({ entries, count, treatTieAsWin }: { entries: Entry[]; count: number; treatTieAsWin: boolean }) {
  const stats = new Set(entries.flatMap((e)  =>  (e.me  ?  []  :  [resultStat(e)])));
  const tone = FOLD_TONES.find(([stat])  =>  stats.has(stat));
  const className = ((tone  &&  (tone[0] !== 'tie'  ||  ! treatTieAsWin))  ?  tone[1]  :  undefined);
  return <span className={className}>{tone?.[2]}{count}</span>;
}


// One chart's card: its header (see CardHead), then `foldedChartboard`'s scores and folds, with `unfoldedRivalCounts` of each
//  fold's rivals unfolded. `unrolledRowId` is the unrolled row: a rival's id, "me" or "head". `showGain` shows how much your
//  best rose; `leaving`, the card fades out. With `onMaximize`, a click on the card only maximizes it.
export function ChartCard({
  foldedChartboard, myName, unfoldedRivalCounts, showGain = false, scoreCap, canSnooze, snoozesCheckedAt, menuIsOpen, leaving, maximized = false,
  onShow, unrolledRowId, onUnroll, onMenu, onSnooze, onWake, onMaximize, onClose,
}: {
  foldedChartboard: FoldedChartboard;
  myName: string;
  unfoldedRivalCounts: UnfoldedRivalCounts;
  showGain?: boolean;
  scoreCap: number;
  canSnooze: boolean;
  snoozesCheckedAt: number;
  menuIsOpen: boolean;
  leaving: boolean;
  maximized?: boolean;
  onShow: (unfoldedRivalCounts: UnfoldedRivalCounts) => void;
  unrolledRowId: string | null;
  onUnroll: (playerId: string | null) => void;
  onMenu: () => void;
  onSnooze: (days: SnoozeDays) => void;
  onWake: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
}) {
  const { chartboard, items, colorByRealDiff, dimWon, treatTieAsWin } = foldedChartboard;
  const toggler = (id: string)  =>  ()  =>  onUnroll((unrolledRowId === id  ?  null  :  id));

  const renderRow = (entry: Entry)  => {
    const id = (entry.me  ?  ME  :  entry.playerId);
    return (
      <ResultItem key={id} chartboard={chartboard} entry={entry} myName={myName} unrolled={unrolledRowId === id} colorByRealDiff={colorByRealDiff}
        dimWon={dimWon} treatTieAsWin={treatTieAsWin} showGain={showGain} scoreCap={scoreCap} onToggle={toggler(id)} />
    );
  };

  const rows: ReactNode[] = items.flatMap((item)  => {
    if ('entry' in item)
      return [renderRow(item.entry)];

    const { id, opensFrom } = item.fold;
    const { shownRivals, foldedRivals } = unfold(item.fold, unfoldedRivalCounts[id]);
    const button = foldedRivals.length > 0  &&  (
      <button key={id} className="show-others" type="button" onClick={()  =>  onShow({ ...unfoldedRivalCounts, [id]: unfoldedRivalCounts[id] + SHOW_STEP })}>
        ...<FoldCount entries={foldedRivals} count={foldedRivals.length} treatTieAsWin={treatTieAsWin} /> more...
      </button>
    );

    return (opensFrom === 'top'  ?  [...shownRivals.map(renderRow), button]  :  [button, ...shownRivals.map(renderRow)]);
  });

  return (
    <section className={`chart-card${(menuIsOpen  ?  ' snoozing'  :  '')}${(leaving  ?  ' leaving'  :  '')}${(maximized  ?  ' maximized'  :  '')}${(onMaximize  ?  ' maximizable'  :  '')}`}
      data-flip={(maximized  ?  undefined  :  `chart ${chartboard.id}`)}
      onClickCapture={onMaximize  &&  ((event)  => {
        // The header's buttons, e.g. Wake on a snoozed chart, do their own thing.
        if ((event.target as Element).closest('.snooze-button, .snooze-lengths'))
          return;

        event.preventDefault();
        event.stopPropagation();
        onMaximize();
      })}>
      <CardHead chartboard={chartboard} unrolled={unrolledRowId === HEAD} canSnooze={canSnooze} snoozesCheckedAt={snoozesCheckedAt} menuIsOpen={menuIsOpen} maximized={maximized}
        onToggle={(! maximized  ?  toggler(HEAD)  :  onClose)} onClose={onClose} onMenu={onMenu} onSnooze={onSnooze} onWake={onWake} />
      <div className="chart-card-body">
        <div className="chart-card-box">
          {/* Without your score there are no diffs, so their columns are dropped. */}
          <div className={`chart-card-results${(chartboard.mine === null  ?  ' no-diffs'  :  '')}`}>{rows}</div>
        </div>
      </div>
    </section>
  );
}
