import { Fragment, type ReactNode } from 'react';
import { Delta, Score } from './format.tsx';
import { type ChartRow, displayName, type Judgments, type RivalResult } from './model.ts';
import { resultStat, type Stat } from './stats.ts';

// How many of the highest and of the lowest scores a card lists before folding the ones between.
export interface Keep {
  top: number;
  bottom: number;
}

type Entry = (RivalResult & { me?: false }) | { me: true; score: number };

// The row unrolled for your own score.
const ME = 'me';

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
// the day of its best score, and the rival's score when the row has no room for it.
export function ChartResultsItem({
  chart, myName, fold, foldedShown, keep, higherShown, colorByRealDiff, dimWon, markTies, scoreCap, onExpandFolded, onExpandHigher,
  unrolled, onUnroll,
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
  onExpandFolded: () => void;
  onExpandHigher: () => void;
  unrolled: string | null;
  onUnroll: (playerId: string | null) => void;
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

    const won = dimWon  &&  isWon(entry) ? 'won' : 'ahead';
    const isUnrolled = unrolled === entry.playerId;
    return (
      <Fragment key={entry.playerId}>
        <div className={`result ${won}${isUnrolled ? ' unrolled' : ''}`} onClick={toggler(entry.playerId)}>
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
    <section className="chart-card">
      <header className="chart-card-head">
        <span className="track" title={chart.trackTitle}>{chart.track}</span>
        <span className="chart-label">{chart.chart}</span>
      </header>
      {/* Without your score there are no diffs, so their columns are dropped. */}
      <div className={`chart-card-results${chart.mine === null ? ' no-diffs' : ''}`}>{rows}</div>
      {folded > 0  &&  (
        <button className="show-others" type="button" onClick={onExpandFolded}>...<FoldCount entries={hiddenBelow} count={folded} markTies={markTies} /> more...</button>
      )}
    </section>
  );
}
