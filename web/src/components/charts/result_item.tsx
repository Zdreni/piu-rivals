import { Delta, Gain, Score } from './format.tsx';
import { type ChartRow, displayName, type ResultStats, type RivalResult } from '../../data/model.ts';
import { resultStat } from '../../data/stats.ts';

// A score in a chart's card: a rival's, or yours.
export type Entry = (RivalResult & { me?: false }) | { me: true; score: number };

// Worst first, each count with its letters after it, e.g. "2m 0b 3gd 21gr 1850pf".
const RESULT_STATS: [Exclude<keyof ResultStats, 'maxCombo'>, string, string][] = [
  ['miss', 'm', 'Misses'], ['bad', 'b', 'Bads'], ['good', 'gd', 'Goods'], ['great', 'gr', 'Greats'], ['perfect', 'pf', 'Perfects'],
];


// A row's details, folded but for the unrolled row's, so they roll and unroll (see .result-details): the best score's
// result stats and max combo, e.g. "2m 0b 3gd 21gr 1850pf x800", and the day it was set, and the score itself, for rows
// that leave it out for lack of room (`score`).
function ResultDetails({ unrolled, resultStats, date, score }: {
  unrolled: boolean;
  resultStats: ResultStats | null;
  date: string | null;
  score: number | null;
}) {
  return (
    <div className={`result-details${(unrolled  ?  ' unrolled'  :  '')}`}>
      <div>
        <span className="result-info">
          {resultStats  &&  (
            <span className="result-stats">
              {RESULT_STATS.map(([key, letters, label])  =>  (
                <span key={key} className={`result-stat${(resultStats[key] === 0  ?  ' zero'  :  '')}`} title={label}>
                  <span className={key}>{resultStats[key]}</span><span className="result-stat-unit">{letters}</span>
                </span>
              ))}
              {resultStats.maxCombo !== null  &&  (
                <span className="result-stat" title="Max combo"><span className="result-stat-unit">x</span>{resultStats.maxCombo}</span>
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


// One score of `chart`'s card, as a row: the player and the score, then the rival's diff, or, with `showGain`, how much
// your best score rose over your previous one, if it did. With `colorByRealDiff`, the diff is coloured by the real diff
// instead of the capped one, and `markTies` colours the diffs of true ties. `dimWon` dims a rival you beat more than
// the others. A click on it calls `onToggle`, and `unrolled`, it unrolls the result stats and the day of its best score,
// and the rival's score when the row has no room for it.
export function ResultItem({ chart, entry, myName, unrolled, colorByRealDiff, dimWon, markTies, showGain, scoreCap, onToggle }: {
  chart: ChartRow;
  entry: Entry;
  myName: string;
  unrolled: boolean;
  colorByRealDiff: boolean;
  dimWon: boolean;
  markTies: boolean;
  showGain: boolean;
  scoreCap: number;
  onToggle: () => void;
}) {
  if (entry.me) {
    return (
      <>
        <div className={`result mine${(unrolled  ?  ' unrolled'  :  '')}`} onClick={onToggle}>
          <span className="result-player" title={myName}>{displayName(myName)}</span>
          <span className="num"><Score value={entry.score} /></span>
          {(showGain  &&  chart.myImprovement)  ?  <Gain value={chart.myImprovement} />  :  <span />}
        </div>
        <ResultDetails unrolled={unrolled} resultStats={chart.myResultStats} date={chart.myDate} score={null} />
      </>
    );
  }

  // A win is a win even when the score cap turns it into a tie.
  const won = ((dimWon  &&  resultStat(entry) === 'win')  ?  ' won'  :  '');
  return (
    <>
      <div className={`result${won}${(unrolled  ?  ' unrolled'  :  '')}`} onClick={onToggle}>
        <span className="result-player" title={entry.player}>{displayName(entry.player)}</span>
        <span className="num score"><Score value={entry.score} /></span>
        {chart.mine !== null  &&  <Delta value={entry.realDelta} outcome={(colorByRealDiff  ?  entry.realDelta  :  entry.delta)} cap={scoreCap} markTie={markTies} />}
      </div>
      <ResultDetails unrolled={unrolled} resultStats={entry.resultStats} date={entry.date} score={entry.score} />
    </>
  );
}
