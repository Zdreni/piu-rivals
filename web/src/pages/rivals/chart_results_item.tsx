import type { ReactNode } from 'react';
import { Delta, Score } from './format.tsx';
import { type ChartRow, type Dates, displayName, type RivalResult } from './model.ts';
import { resultStat, type Stat } from './stats.ts';

// How many of the highest and of the lowest scores a card lists before folding the ones between.
export interface Keep {
  top: number;
  bottom: number;
}

type Entry = (RivalResult & { me?: false }) | (Dates & { me: true; score: number });


// Score tooltip. The best score line is dropped when it was set on the last try.
const datesTitle = ({ bestScoreDate, lastTryDate }: Dates) =>
  (bestScoreDate  &&  bestScoreDate === lastTryDate
    ? `Last try: ${lastTryDate}`
    : `Best score: ${bestScoreDate  ||  'unknown'}\nLast try: ${lastTryDate  ||  'unknown'}`);


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
export function ChartResultsItem({
  chart, myName, fold, foldedShown, keep, higherShown, colorByRealDiff, dimWon, markTies, scoreCap, onExpandFolded, onExpandHigher,
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
}) {
  const all: Entry[] = [...chart.rivals];
  if (chart.mine !== null)
    all.push({ me: true, score: chart.mine, ...chart.myDates });

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

  const rows: ReactNode[] = list.map((entry) => {
    if (entry.me) {
      return (
        <div key="me" className="result mine">
          <span className="result-player" title={myName}>{displayName(myName)}</span>
          <span className="num" title={datesTitle(entry)}><Score value={entry.score} /></span>
          <span />
        </div>
      );
    }

    const won = dimWon  &&  isWon(entry) ? 'won' : 'ahead';
    return (
      <div key={entry.playerId} className={`result ${won}`}>
        <a className="result-player player-link" title={entry.player}
          href={`https://piuscores.arroweclip.se/Player/${encodeURIComponent(entry.playerId)}/Sessions`} target="_blank" rel="noreferrer">
          {displayName(entry.player)}
        </a>
        <span className="num score" title={datesTitle(entry)}><Score value={entry.score} /></span>
        {chart.mine !== null  &&  <Delta value={entry.realDelta} outcome={colorByRealDiff ? entry.realDelta : entry.delta} cap={scoreCap} markTie={markTies} />}
      </div>
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
        <span className="track" title={chart.track}>{chart.track}</span>
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
