import { Delta, ScoreGain, Score } from './format.tsx';
import { type Chartboard, displayName, type ResultStats } from '../../data/model.ts';
import type { Entry } from '../../data/folded_chartboard.ts';
import { resultStat } from '../../data/stats.ts';

// Lowest tier first, each count with its letters after it, e.g. "2m 0b 3gd 21gr 1850pf".
const RESULT_STATS: [Exclude<keyof ResultStats, 'maxCombo'>, string, string][] = [
  ['miss', 'm', 'Misses'], ['bad', 'b', 'Bads'], ['good', 'gd', 'Goods'], ['great', 'gr', 'Greats'], ['perfect', 'pf', 'Perfects'],
];


// A row's details, shown when it's unrolled: the result stats, the day of the best score,
//  and the score itself when the row has no room for it (`score`).
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


// One score on the card of `chartboard`: the player, the score and the rival's diff, or with `showGain`, how much your best rose.
// `unrolled`, it shows the score's details. The colouring flags are RivalsFolding's.
export function ResultItem({ chartboard, entry, myName, unrolled, colorByRealDiff, dimWon, treatTieAsWin, showGain, scoreCap, onToggle }: {
  chartboard: Chartboard;
  entry: Entry;
  myName: string;
  unrolled: boolean;
  colorByRealDiff: boolean;
  dimWon: boolean;
  treatTieAsWin: boolean;
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
          {(showGain  &&  chartboard.myImprovement)  ?  <ScoreGain value={chartboard.myImprovement} />  :  <span />}
        </div>
        <ResultDetails unrolled={unrolled} resultStats={chartboard.myResultStats} date={chartboard.myDate} score={null} />
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
        {chartboard.mine !== null  &&  <Delta value={entry.realDelta} outcome={(colorByRealDiff  ?  entry.realDelta  :  entry.delta)} scoreCap={scoreCap} markTie={! treatTieAsWin} />}
      </div>
      <ResultDetails unrolled={unrolled} resultStats={entry.resultStats} date={entry.date} score={entry.score} />
    </>
  );
}
