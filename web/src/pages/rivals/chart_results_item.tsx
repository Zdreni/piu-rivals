import type { ReactNode } from 'react';
import { Delta, Score } from './format.tsx';
import { type ChartRow, type Dates, displayName, type RivalResult } from './model.ts';

type Entry = (RivalResult & { me?: false }) | (Dates & { me: true; score: number });


// Score tooltip. The best score line is dropped when it was set on the last try.
const datesTitle = ({ bestScoreDate, lastTryDate }: Dates) =>
  (bestScoreDate  &&  bestScoreDate === lastTryDate
    ? `Last try: ${lastTryDate}`
    : `Best score: ${bestScoreDate  ||  'unknown'}\nLast try: ${lastTryDate  ||  'unknown'}`);


// One chart's card: the track and chart in its header, then you and its rivals by score, with each rival's diff.
// With `collapseWon`, rivals you beat are folded into a "show N others..." button, which calls `onExpand`.
// With `colorByRealDiff`, the diff is coloured by the real diff instead of the capped one.
export function ChartResultsItem({ chart, myName, collapseWon, colorByRealDiff, scoreCap, onExpand }: {
  chart: ChartRow;
  myName: string;
  collapseWon: boolean;
  colorByRealDiff: boolean;
  scoreCap: number;
  onExpand: () => void;
}) {
  const all: Entry[] = [...chart.rivals];
  if (chart.mine !== null)
    all.push({ me: true, score: chart.mine, ...chart.myDates });

  all.sort((a, b) => b.score - a.score  ||  Number(!! b.me) - Number(!! a.me));

  const isWon = (entry: Entry) => ! entry.me  &&  entry.delta !== null  &&  entry.delta > 0;
  const folded = collapseWon ? all.filter(isWon).length : 0;
  const list = folded ? all.filter((entry) => ! isWon(entry)) : all;

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

    const won = entry.delta !== null  &&  entry.delta > 0 ? 'won' : 'ahead';
    return (
      <div key={entry.playerId} className={`result ${won}`}>
        <a className="result-player player-link" title={entry.player}
          href={`https://piuscores.arroweclip.se/Player/${encodeURIComponent(entry.playerId)}/Sessions`} target="_blank" rel="noreferrer">
          {displayName(entry.player)}
        </a>
        <span className="num score" title={datesTitle(entry)}><Score value={entry.score} /></span>
        <span className="num">
          <Delta value={entry.realDelta} outcome={colorByRealDiff ? entry.realDelta : entry.delta} cap={scoreCap} />
        </span>
      </div>
    );
  });

  return (
    <section className="chart-card">
      <header className="chart-card-head">
        <span className="track" title={chart.track}>{chart.track}</span>
        <span className="chart-label">{chart.chart}</span>
      </header>
      <div className="chart-card-results">{rows}</div>
      {folded > 0  &&  (
        <button className="show-others" type="button" onClick={onExpand}>...show {folded} other{folded === 1 ? '' : 's'}...</button>
      )}
    </section>
  );
}
