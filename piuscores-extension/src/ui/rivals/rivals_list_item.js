import { esc, fmt, statWords } from './common.js';

export const rivalListItemStyles = `
  .rival { padding: 9px 6px; border-radius: 4px; position: relative; }
  .rival.faded::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
                        background: rgba(20,32,26,.8); }
  .rival:nth-child(even) { background: rgba(255,255,255,.05); }
  .rival:hover { background: rgba(79,227,63,.12); }
  .rival { cursor: pointer; }
  .rival.focused { background: rgba(79,227,63,.08); box-shadow: 0 0 0 1px #2B4034 inset; cursor: default; }
  .rival:not(.focused) .rival-links, .rival:not(.focused) .rival-scrap { display: none; }
  .rival-toggle { display: flex; align-items: center; gap: 8px; font-size: 17px; }
  .rival.focused .rival-toggle { cursor: pointer; }
  .rival input { appearance: none; margin: 0; flex-shrink: 0; width: 16px; height: 16px; cursor: pointer;
                 background: #3A4540; border: 1px solid #56635C; border-radius: 3px; display: grid; place-content: center; }
  .rival input:hover { border-color: #7A8A81; }
  .rival input:checked { background: #A9AFAC; border-color: #A9AFAC; }
  .rival input:checked::after { content: ''; width: 4px; height: 8px; margin-top: -2px;
                                border: solid #0F1A14; border-width: 0 2px 2px 0; transform: rotate(45deg); }
  .rival input[data-player] { position: relative; display: block; width: 28px; height: 16px; border-radius: 8px;
                              transition: background .15s, border-color .15s; }
  .rival input[data-player]::after { content: ''; position: absolute; top: 1px; left: 1px; width: 12px; height: 12px;
                                     margin: 0; border: 0; border-radius: 50%; background: #9AA59F; transform: none;
                                     transition: left .15s, background .15s; }
  .rival input[data-player]:checked::after { left: 13px; background: #0F1A14; }
  .rival-spacer { width: 28px; flex-shrink: 0; }
  .rival.me .rival-name, .rival.me .rival-pum { color: #FFC433; }
  .rival-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rival-pum { color: #9AB3A3; font-variant-numeric: tabular-nums; }
  .rival-visit { display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0; color: #8A9590;
                 font-size: 13px; font-variant-numeric: tabular-nums; text-decoration: none; }
  .rival-visit:hover { color: #4FE33F; }
  .rival-visit svg { width: 13px; height: 13px; }
  .rival-links { display: flex; align-items: center; gap: 6px; margin: 6px 0 0; }
  .rival-stats { white-space: nowrap; color: #9AB3A3; }
  .rival-stats .blue { color: #3FA9F5; }
  .rival-link { background: rgba(0,0,0,.12); color: #9AB3A3; border: 1px solid #2B4034; border-radius: 4px; padding: 1px 8px;
                font-size: 13px; text-decoration: none; }
  .rival-link:hover { color: #4FE33F; border-color: #4FE33F; background: #14201A; }
  .rival-solo { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
  .rival-solo:hover { color: #3FA9F5; border-color: #3FA9F5; background: #14201A; }
  .rival .rival-solo input { width: 12px; height: 12px; }
  .rival .rival-solo input:checked { background: #3FA9F5; border-color: #3FA9F5; }
  .rival .rival-solo input:checked::after { width: 3px; height: 6px; margin-top: -1px; }
  .rival-delete { margin-left: auto; font: inherit; font-size: 13px; cursor: pointer; }
  .rival-delete:hover { color: #FF5A5A; border-color: #FF5A5A; background: #2B1C1C; }
  .rival-scrap { margin: 2px 0 0; font-size: 13px; color: #8A9590; font-variant-numeric: tabular-nums; }
  .rival-counts, .rival-stats { margin-top: 3px; }
  .rival-counts { white-space: nowrap; }
  .rival-counts > span { color: #9AB3A3; }
  .rival-counts .zero { opacity: .4; }
  .rival.off .rival-name, .rival.off .rival-pum, .rival.off .rival-visit, .rival.off .rival-scrap { opacity: .45; }
`;

const scrapCount = (n, label) => `<span${n === 0 ? ' class="zero"' : ''}>${fmt(n)}</span> ${label}`;


const scrapLine = (scrapStats, best) =>
  `${scrapCount(scrapStats?.scores  ||  0, 'scores')} · ${scrapCount(best  ||  0, 'best')} · `
  + `${scrapCount(scrapStats?.sessions  ||  0, 'sessions')}`;


const statsTip = 'Results against this rival: lost / non-matched / won, judged on the real scores, '
  + 'without the score cap and try cooldown filters';

const statsSoloTip = 'Solo: the same counts as in the header, with the score cap, try cooldown and NP min rivals applied';


const clockIcon = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">'
  + '<circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.5 1.5"/></svg>';


// Calendar days since the player's Sessions page was last visited: shown from 3 days on,
// or with "?" when no visit is stored.
// Clicking it opens that Sessions page.
function visitBadge(visitedAt, href) {
  if (typeof visitedAt !== 'number') {
    return `<a class="rival-visit" href="${href}" title="Sessions page never visited">${clockIcon}?</a>`;
  }

  const visited = new Date(visitedAt);
  const now = new Date();
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate())
    - new Date(visited.getFullYear(), visited.getMonth(), visited.getDate())) / 86400000);
  if (days < 3)
    return '';

  return `<a class="rival-visit" href="${href}" title="Sessions page last visited ${esc(visited.toLocaleString())}">`
    + `${clockIcon}${days}d</a>`;
}


// One rival row: the visibility toggle, name, last visit and PUMBILITY, then (while focused) the
// scrap counts, the charts you lose / haven't played / win against them, and their links.
// `player` is the stored player record; `me` marks your own row, `on` a rival checked for the stats,
// `solo` the solo rival, `faded` everyone else left out while a rival is solo (covered with a fader).
export function rivalListItem({ playerId, name, pumbility }, player, { me, on, solo, faded, focused, stats, statsWords, best }) {
  const base = `https://piuscores.arroweclip.se/Player/${encodeURIComponent(playerId)}`;
  const toggle = me
    ? '<span class="rival-spacer"></span>'
    : `<input type="checkbox" data-player="${esc(playerId)}"${on ? ' checked' : ''}>`;

  return `<div class="rival${on  ||  solo ? '' : ' off'}${faded ? ' faded' : ''}${me ? ' me' : ''}${focused ? ' focused' : ''}" data-rival="${esc(playerId)}">`
    + `<div class="rival-toggle" title="${esc(name)}">${toggle}`
    + `<span class="rival-name">${esc(name)}</span>${visitBadge(player?.sessionsVisitedAt, `${base}/Sessions`)}`
    + `<span class="rival-pum">${fmt(pumbility)}</span></div>`
    + `<div class="rival-scrap"><div class="rival-counts" title="scraped scores · best scores · scraped sessions">${
      scrapLine(player?.scrapStats, best)}</div>`
    + (me ? '' : `<div class="rival-stats" title="${solo ? statsSoloTip : statsTip}">${statWords(stats, ' · ', statsWords)}</div>`)
    + '</div>'
    + '<div class="rival-links">'
    + (me
      ? `<a class="rival-link" href="${base}">My page</a>`
      : '<label class="rival-link rival-solo" title="Compare only you and this rival">'
        + `<input type="checkbox" data-solo="${esc(playerId)}"${solo ? ' checked' : ''}>Solo</label>`)
    + `<a class="rival-link" href="${base}/Sessions">Sessions</a>`
    + `<button class="rival-link rival-delete" type="button" data-delete="${esc(playerId)}" `
    + `data-name="${esc(name)}"${me ? ' data-own="1"' : ''} `
    + `title="${me ? 'Delete all your saved scores' : 'Delete this player and all their saved scores'}">Delete</button>`
    + '</div>'
    + '</div>';
}
