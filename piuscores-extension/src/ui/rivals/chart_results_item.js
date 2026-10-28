import { displayName } from '../../storage.js';
import { esc, fmtDelta, fmtScore } from './common.js';

export const chartResultsItemStyles = `
  .mine { color: #FFC433; }
  td.sm { font-size: 16px; vertical-align: baseline; }
  td.score { color: #9AB3A3; }
  .tail { font-size: .75em; opacity: .6; }
  .tail-dim { opacity: .7; }
  td.score.mine { color: #C9A44A; }
  .won { opacity: .4; }
  .ahead { opacity: .8; }
  .player-link { color: inherit; text-decoration: none; }
  .player-link:hover { color: #4FE33F; }
  td.others { text-align: right; padding: 4px 6px 6px; }
  .show-others { background: none; color: #9AB3A3; opacity: .6; border: none; padding: 3px 12px;
                 font: 500 13px/1.4 Roboto, Arial, sans-serif; cursor: pointer; }
  .show-others:hover { color: #4FE33F; opacity: 1; }
`;


// Identifies a chart among the results; the "show N others..." button carries it.
export const chartKey = (chart)  =>  `${chart.track}|${chart.chart}`;


// Score cell tooltip; dates are missing for scores stored before they were tracked.
// The best score line is dropped when it was set on the last try.
const datesTitle = ({ bestScoreDate, lastTryDate })  =>
  ((bestScoreDate  &&  bestScoreDate === lastTryDate)
    ?  `Last try: ${lastTryDate}`
    :  `Best score: ${bestScoreDate  ||  'unknown'}
Last try: ${lastTryDate  ||  'unknown'}`);


const rowStart = (i)  =>  (i === 0  ?  '<tr class="group alt">'  :  i % 2 === 0  ?  '<tr class="alt">'  :  '<tr>');


// The table rows of one chart: you and its rivals by score, the track and chart spanning them all.
// With `collapseWon`, rivals you beat are folded into a "show N others..." row.
// With `colorByRealDiff`, the diff is coloured by the real diff instead of the capped one.
export function chartResultsItem(chart, myName, { collapseWon, colorByRealDiff, scoreCap }) {
  const all = [...chart.rivals];
  if (chart.mine !== null)
    all.push({ player: 'You', score: chart.mine, me: true, ...chart.myDates });

  all.sort((a, b)  =>  b.score - a.score  ||  (b.me  ?  1  :  0) - (a.me  ?  1  :  0));

  const isWon = (rival)  =>  ! rival.me  &&  rival.delta !== null  &&  rival.delta > 0;
  const folded = (collapseWon  ?  all.filter(isWon).length  :  0);
  const list = (folded  ?  all.filter((rival)  =>  ! isWon(rival))  :  all);
  const rowCount = list.length + (folded  ?  1  :  0);

  const rows = list.map((rival, i)  => {
    const head = (i === 0
      ?  `<td class="track" rowspan="${rowCount}" title="${esc(chart.track)}">${esc(chart.track)}</td>
         <td rowspan="${rowCount}"><b>${esc(chart.chart)}</b></td>`
      :  '');

    const tr = rowStart(i);
    if (rival.me) {
      return `${tr}${head}<td class="sm mine" title="${esc(myName)}">${esc(displayName(myName))}</td><td class="sm num score mine" title="${esc(datesTitle(rival))}">${fmtScore(rival.score)}</td><td class="sm"></td></tr>`;
    }

    const won = ((rival.delta !== null  &&  rival.delta > 0)  ?  ' won'  :  ' ahead');
    const playerId = rival.playerId;
    const name = (playerId
      ?  `<a class="player-link" href="https://piuscores.arroweclip.se/Player/${encodeURIComponent(playerId)}/Sessions">${esc(displayName(rival.player))}</a>`
      :  esc(displayName(rival.player)));
    return `${tr}${head}<td class="sm${won}" title="${esc(rival.player)}">${name}</td><td class="sm num score${won}" title="${esc(datesTitle(rival))}">${fmtScore(rival.score)}</td><td class="sm num${won}">${fmtDelta(rival.realDelta, (colorByRealDiff  ?  rival.realDelta  :  rival.delta), scoreCap)}</td></tr>`;
  });

  if (folded) {
    rows.push(`${rowStart(list.length)}<td class="sm others" colspan="3"><button class="show-others" type="button" `
      + `data-expand="${esc(chartKey(chart))}">...show ${folded} other${(folded === 1  ?  ''  :  's')}...</button></td></tr>`);
  }

  return rows;
}
