import type { ReactNode } from 'react';
import { Delta, Score } from './format.tsx';
import { type ChartRow, type Dates, displayName, type RivalResult } from './model.ts';

type Entry = (RivalResult & { me?: false }) | (Dates & { me: true; score: number });


// Score cell tooltip. The best score line is dropped when it was set on the last try.
const datesTitle = ({ bestScoreDate, lastTryDate }: Dates) =>
  (bestScoreDate  &&  bestScoreDate === lastTryDate
    ? `Last try: ${lastTryDate}`
    : `Best score: ${bestScoreDate  ||  'unknown'}\nLast try: ${lastTryDate  ||  'unknown'}`);


const rowClass = (i: number) => (i === 0 ? 'group alt' : i % 2 === 0 ? 'alt' : undefined);


// The table rows of one chart: you and its rivals by score, the track and chart spanning them all.
// With `collapseWon`, rivals you beat are folded into a "show N others..." row, which calls `onExpand`.
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
  const rowCount = list.length + (folded ? 1 : 0);

  const rows: ReactNode[] = list.map((entry, i) => {
    const head = i === 0  &&  (
      <>
        <td className="track" rowSpan={rowCount} title={chart.track}>{chart.track}</td>
        <td rowSpan={rowCount}><b>{chart.chart}</b></td>
      </>
    );

    if (entry.me) {
      return (
        <tr key="me" className={rowClass(i)}>
          {head}
          <td className="sm mine" title={myName}>{displayName(myName)}</td>
          <td className="sm num score mine" title={datesTitle(entry)}><Score value={entry.score} /></td>
          <td className="sm" />
        </tr>
      );
    }

    const won = entry.delta !== null  &&  entry.delta > 0 ? ' won' : ' ahead';
    return (
      <tr key={entry.playerId} className={rowClass(i)}>
        {head}
        <td className={`sm${won}`} title={entry.player}>
          <a className="player-link" href={`https://piuscores.arroweclip.se/Player/${encodeURIComponent(entry.playerId)}/Sessions`}
            target="_blank" rel="noreferrer">
            {displayName(entry.player)}
          </a>
        </td>
        <td className={`sm num score${won}`} title={datesTitle(entry)}><Score value={entry.score} /></td>
        <td className={`sm num${won}`}>
          <Delta value={entry.realDelta} outcome={colorByRealDiff ? entry.realDelta : entry.delta} cap={scoreCap} />
        </td>
      </tr>
    );
  });

  if (folded) {
    rows.push(
      <tr key="others" className={rowClass(list.length)}>
        <td className="sm others" colSpan={3}>
          <button className="show-others" type="button" onClick={onExpand}>...show {folded} other{folded === 1 ? '' : 's'}...</button>
        </td>
      </tr>,
    );
  }

  return <>{rows}</>;
}
