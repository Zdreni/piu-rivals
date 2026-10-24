import type { SnoozeDays } from '@piu-rivals/shared';
import { Fragment, type MouseEvent, type ReactNode, useState } from 'react';
import { Delta, Score, timeLeft } from './format.tsx';
import { type ChartRow, displayName, type Judgments, type RivalResult } from './model.ts';
import { resultStat, type Stat } from './stats.ts';

// How many of the highest and of the lowest scores a card lists before folding the ones between.
export interface Keep {
  top: number;
  bottom: number;
}

type Entry = (RivalResult & { me?: false }) | { me: true; score: number };

// The row unrolled for your own score, and the header unrolled.
const ME = 'me';
const HEAD = 'head';

const SNOOZE_DAYS: SnoozeDays[] = [1, 3, 7];

// Worst first, each count with its letters after it, e.g. "2m 0b 3gd 21gr 1850pf".
const JUDGMENTS: [Exclude<keyof Judgments, 'maxCombo'>, string, string][] = [
  ['miss', 'm', 'Misses'], ['bad', 'b', 'Bads'], ['good', 'gd', 'Goods'], ['great', 'gr', 'Greats'], ['perfect', 'pf', 'Perfects'],
];


// A row's details, folded but for the unrolled row's, so they roll and unroll (see .result-details): the best score's
// judgments and max combo, e.g. "2m 0b 3gd 21gr 1850pf x800", and the day it was set, and the score itself, for rows
// that leave it out for lack of room (`score`).
function ResultDetails({ unrolled, judgments, date, score }: {
  unrolled: boolean;
  judgments: Judgments | null;
  date: string | null;
  score: number | null;
}) {
  return (
    <div className={`result-details${unrolled ? ' unrolled' : ''}`}>
      <div>
        <span className="result-info">
          {judgments  &&  (
            <span className="result-judgments">
              {JUDGMENTS.map(([key, letters, label]) => (
                <span key={key} className={`judgment${judgments[key] === 0 ? ' zero' : ''}`} title={label}>
                  <span className={key}>{judgments[key]}</span><span className="judgment-unit">{letters}</span>
                </span>
              ))}
              {judgments.maxCombo !== null  &&  (
                <span className="judgment" title="Max combo"><span className="judgment-unit">x</span>{judgments.maxCombo}</span>
              )}
            </span>
          )}
          <span className="result-date">{date}</span>
        </span>
        {score !== null  &&  <span className="num result-details-score"><Score value={score} /></span>}
      </div>
    </div>
  );
}




// A card's header: the track's short name and the chart. A click unrolls it: the track's full name across the card,
// then, with `canSnooze`, a "Snooze..." button (see .chart-card-more), with the chart on the right. The button calls
// `onMenu`, and with `menuOpen` it's red, with a menu of 1, 3 and 7 days under it, which call `onSnooze`. A snoozed
// chart's header always has that line, with how long it's snoozed for and a button to wake it.
function CardHead({ chart, unrolled, canSnooze, now, menuOpen, onToggle, onMenu, onSnooze, onWake }: {
  chart: ChartRow;
  unrolled: boolean;
  canSnooze: boolean;
  now: number;
  menuOpen: boolean;
  onToggle: () => void;
  onMenu: () => void;
  onSnooze: (days: SnoozeDays) => void;
  onWake: () => void;
}) {
  const left = chart.snoozedUntil === null ? null : timeLeft(chart.snoozedUntil - now);
  const more = left !== null  ||  (unrolled  &&  canSnooze);
  // The length picked in the menu, lit while the card fades out.
  const [picked, setPicked] = useState<SnoozeDays | null>(null);
  const press = (action: () => void) => (event: MouseEvent) => {
    event.stopPropagation();
    action();
  };
  const toggleMenu = press(() => {
    setPicked(null);
    onMenu();
  });
  const pick = (days: SnoozeDays) => press(() => {
    setPicked(days);
    onSnooze(days);
  });

  return (
    <header className={`chart-card-head${unrolled ? ' unrolled' : ''}${more ? ' more' : ''}${menuOpen ? ' menu-open' : ''}`} onClick={onToggle}>
      <div className="chart-card-title">
        <span className="track" title={chart.trackTitle}>{unrolled ? chart.trackTitle : chart.track}</span>
        <span className="chart-label">{chart.chart}</span>
      </div>
      {(left !== null  ||  canSnooze)  &&  (
        <div className="chart-card-more">
          <div>
            {left === null
              ? (
                <span className="snooze">
                  <span className="snooze-anchor">
                    <button className={`snooze-button snooze-toggle${menuOpen ? ' on' : ''}`} type="button" aria-haspopup="menu"
                      aria-expanded={menuOpen} title="Hide this chart for a while" onClick={toggleMenu}>
                      Snooze…
                    </button>
                    {menuOpen  &&  (
                      <span className="snooze-menu" role="menu">
                        {SNOOZE_DAYS.map((days) => (
                          <button key={days} className={picked === days ? 'picked' : undefined} type="button" role="menuitem"
                            onClick={pick(days)}>
                            {days === 1 ? '1 day' : `${days} days`}
                          </button>
                        ))}
                      </span>
                    )}
                  </span>
                </span>
              )
              : (
                <span className="snooze">
                  Snoozed for {left}
                  <button className="snooze-button" type="button" title="Show this chart again now" onClick={press(onWake)}>Wake</button>
                </span>
              )}
            <span className="chart-label">{chart.chart}</span>
          </div>
        </div>
      )}
    </header>
  );
}


// A fold button's count, e.g. "↑3", with the arrow and colour of the strongest result folded, e.g. red if any of
// them beats you. Ties get the tie colour only with `markTies`.
// Drawn rather than typed: font arrows sit at different heights in every font, while these span the digits exactly.
const arrow = (d: string) => <svg className="fold-arrow" viewBox="0 0 6 9" aria-hidden="true"><path d={d} /></svg>;
const up = arrow('M3 8.5V.5M.5 3L3 .5 5.5 3');
const down = arrow('M3 .5v8M.5 6L3 8.5 5.5 6');
const FOLD_TONES: [Stat, string, ReactNode][] = [
  ['lose', 'neg', up], ['hidden', 'neg muted', up], ['unplayed', 'blue', ''], ['win', 'pos', down], ['tie', 'tie', '='],
];

function FoldCount({ entries, count, markTies }: { entries: Entry[]; count: number; markTies: boolean }) {
  const stats = new Set(entries.flatMap((entry) => (entry.me ? [] : [resultStat(entry)])));
  const tone = FOLD_TONES.find(([stat]) => stats.has(stat));
  const className = tone  &&  (tone[0] !== 'tie'  ||  markTies) ? tone[1] : undefined;
  return <span className={className}>{tone?.[2]}{count}</span>;
}


// One chart's card: the track and chart in its header, then you and its rivals by score, with each rival's diff.
// Rivals whose result is one of `fold` (e.g. won), when 2 or more, are folded into a "N more..." button, which
// calls `onExpandFolded`; `foldedShown` of them, highest first, are listed anyway. With `keep`, only its `top` highest
// and `bottom` lowest of the other scores are listed, the ones between (when 2 or more) folded into a "N more..."
// button, which calls `onExpandHigher`; `higherShown` of them, highest first, are listed above the button anyway.
// With `colorByRealDiff`, the diff is coloured by the real diff instead of the capped one. `markTies` colours the
// diffs of true ties. `dimWon` dims the rivals you beat more than the others.
// A click on a row calls `onUnroll`, and the `unrolled` row (a rival's id, or "me" for yours) unrolls the judgments and
// the day of its best score, and the rival's score when the row has no room for it. A click on the header unrolls it
// ("head"), with the snooze button when `canSnooze`, whose menu (`menuOpen`, toggled by `onMenu`) calls `onSnooze`;
// `now` counts down a snoozed chart's time left. While the menu is open, the card is dimmed; `leaving`, it fades out.
// Wake calls `onWake`.
export function ChartResultsItem({
  chart, myName, fold, foldedShown, keep, higherShown, colorByRealDiff, dimWon, markTies, scoreCap, canSnooze, now, menuOpen,
  leaving, onExpandFolded,
  onExpandHigher, unrolled, onUnroll, onMenu, onSnooze, onWake,
}: {
  chart: ChartRow;
  myName: string;
  fold: Stat[];
  foldedShown: number;
  keep: Keep | null;
  higherShown: number;
  colorByRealDiff: boolean;
  dimWon: boolean;
  markTies: boolean;
  scoreCap: number;
  canSnooze: boolean;
  now: number;
  menuOpen: boolean;
  leaving: boolean;
  onExpandFolded: () => void;
  onExpandHigher: () => void;
  unrolled: string | null;
  onUnroll: (playerId: string | null) => void;
  onMenu: () => void;
  onSnooze: (days: SnoozeDays) => void;
  onWake: () => void;
}) {
  const all: Entry[] = [...chart.rivals];
  if (chart.mine !== null)
    all.push({ me: true, score: chart.mine });

  all.sort((a, b) => b.score - a.score  ||  Number(!! b.me) - Number(!! a.me));

  // A win is a win even when the score cap turns it into a tie.
  const isWon = (entry: Entry) => ! entry.me  &&  resultStat(entry) === 'win';
  const isFolded = (entry: Entry) => ! entry.me  &&  fold.includes(resultStat(entry));
  // A single folded or higher score is shown rather than folded.
  const foldable = all.filter(isFolded);
  const lower = foldable.length - foldedShown;
  const folded = lower >= 2 ? lower : 0;
  const hiddenBelow = foldable.slice(foldable.length - folded);
  const kept = all.filter((entry) => ! isFolded(entry));
  const firstHidden = (keep?.top  ??  0) + higherShown;
  const higher = keep === null ? 0 : kept.length - firstHidden - keep.bottom;
  const above = higher >= 2 ? higher : 0;
  // The rivals you don't fold are the top of the list, so the ones after the shown highest are hidden.
  const hiddenAbove = kept.slice(firstHidden, firstHidden + above);
  const hidden = new Set([...hiddenAbove, ...hiddenBelow]);
  const list = all.filter((entry) => ! hidden.has(entry));

  const toggler = (id: string) => () => onUnroll(unrolled === id ? null : id);

  // One node per score, so the "more" button for the higher ones goes in by its place in `list`.
  const rows: ReactNode[] = list.map((entry) => {
    if (entry.me) {
      const isUnrolled = unrolled === ME;
      return (
        <Fragment key={ME}>
          <div className={`result mine${isUnrolled ? ' unrolled' : ''}`} onClick={toggler(ME)}>
            <span className="result-player" title={myName}>{displayName(myName)}</span>
            <span className="num"><Score value={entry.score} /></span>
            <span />
          </div>
          <ResultDetails unrolled={isUnrolled} judgments={chart.myJudgments} date={chart.myDate} score={null} />
        </Fragment>
      );
    }

    const won = dimWon  &&  isWon(entry) ? ' won' : '';
    const isUnrolled = unrolled === entry.playerId;
    return (
      <Fragment key={entry.playerId}>
        <div className={`result${won}${isUnrolled ? ' unrolled' : ''}`} onClick={toggler(entry.playerId)}>
          <span className="result-player" title={entry.player}>{displayName(entry.player)}</span>
          <span className="num score"><Score value={entry.score} /></span>
          {chart.mine !== null  &&  <Delta value={entry.realDelta} outcome={colorByRealDiff ? entry.realDelta : entry.delta} cap={scoreCap} markTie={markTies} />}
        </div>
        <ResultDetails unrolled={isUnrolled} judgments={entry.judgments} date={entry.date} score={entry.score} />
      </Fragment>
    );
  });

  if (above > 0) {
    rows.splice(firstHidden, 0, (
      <button key="higher" className="show-others top" type="button" onClick={onExpandHigher}>
        ...<FoldCount entries={hiddenAbove} count={above} markTies={markTies} /> more...
      </button>
    ));
  }

  return (
    <section className={`chart-card${menuOpen ? ' snoozing' : ''}${leaving ? ' leaving' : ''}`} data-flip={`chart ${chart.id}`}>
      <CardHead chart={chart} unrolled={unrolled === HEAD} canSnooze={canSnooze} now={now} menuOpen={menuOpen}
        onToggle={toggler(HEAD)} onMenu={onMenu} onSnooze={onSnooze} onWake={onWake} />
      <div className="chart-card-body">
        <div className="chart-card-box">
          {/* Without your score there are no diffs, so their columns are dropped. */}
          <div className={`chart-card-results${chart.mine === null ? ' no-diffs' : ''}`}>{rows}</div>
          {folded > 0  &&  (
            <button className="show-others" type="button" onClick={onExpandFolded}>...<FoldCount entries={hiddenBelow} count={folded} markTies={markTies} /> more...</button>
          )}
        </div>
      </div>
    </section>
  );
}
