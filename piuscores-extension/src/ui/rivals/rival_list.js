import { deletePlayer, displayName, loadPreferences, savePreferences } from '../../storage.js';
import { esc, fmt, statWords } from './common.js';

export const rivalListStyles = `
  .rival-list { width: 285px; flex-shrink: 0; font-weight: 400; overflow-y: auto; padding: 10px 16px 10px 8px;
                border-right: 1px solid #2B4034; scrollbar-width: thin; scrollbar-color: #2B4034 transparent; }
  .rival-list:hover { scrollbar-color: #3D5A49 transparent; }
  .rival { padding: 9px 6px; border-radius: 4px; }
  .rival:nth-child(even) { background: rgba(255,255,255,.05); }
  .rival:hover { background: rgba(79,227,63,.12); }
  .rival { cursor: pointer; }
  .rival.focused { background: rgba(79,227,63,.08); box-shadow: 0 0 0 1px #2B4034 inset; cursor: default; }
  .rival:not(.focused) .rival-links, .rival:not(.focused) .rival-scrap { display: none; }
  .rival-toggle { display: flex; align-items: center; gap: 8px; }
  .rival.focused .rival-toggle { cursor: pointer; }
  .rival input { accent-color: #4FE33F; margin: 0; flex-shrink: 0; width: 16px; height: 16px; cursor: pointer; }
  .rival-spacer { width: 16px; flex-shrink: 0; }
  .rival.me .rival-name, .rival.me .rival-pum { color: #FFC433; }
  .rival-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rival-pum { color: #9AB3A3; font-variant-numeric: tabular-nums; }
  .rival-links { display: flex; align-items: center; gap: 6px; margin: 6px 0 0; }
  .rival-stats { white-space: nowrap; color: #9AB3A3; }
  .rival-stats .blue { color: #3FA9F5; }
  .rival-link { background: rgba(0,0,0,.12); color: #9AB3A3; border: 1px solid #2B4034; border-radius: 4px; padding: 1px 8px;
                font-size: 13px; text-decoration: none; }
  .rival-link:hover { color: #4FE33F; border-color: #4FE33F; background: #14201A; }
  .rival-delete { margin-left: auto; font: inherit; font-size: 13px; cursor: pointer; }
  .rival-delete:hover { color: #FF5A5A; border-color: #FF5A5A; background: #2B1C1C; }
  .rival-scrap { margin: 2px 0 0; font-size: 13px; color: #8A9590; font-variant-numeric: tabular-nums; }
  .rival-counts, .rival-stats { margin-top: 3px; }
  .rival-counts { white-space: nowrap; }
  .rival-counts > span { color: #9AB3A3; }
  .rival-counts .zero { opacity: .4; }
  .rival.off .rival-name, .rival.off .rival-pum, .rival.off .rival-scrap { opacity: .45; }
  .rival-list .muted { color: #9AB3A3; }
`;

const scrapCount = (n, label) => `<span${n === 0 ? ' class="zero"' : ''}>${fmt(n)}</span> ${label}`;
const scrapLine = (scrapStats, best) =>
  `${scrapCount(scrapStats?.scores || 0, 'scores')} · ${scrapCount(best || 0, 'best')} · `
  + `${scrapCount(scrapStats?.sessions || 0, 'sessions')}`;


// The rivals column: toggles which rivals are compared, and lets you open or delete a rival.
// `onChange` re-renders the window after the stored rivals or their visibility changed.
export function createRivalList(container, onChange) {
  // Only the focused rival in the list shows its stats and buttons.
  let focusedRival = null;
  let pendingScroll = false;

  container.addEventListener('change', async (event) => {
    const box = event.target.closest('input[data-player]');
    if (!box) return;
    try {
      const hidden = new Set((await loadPreferences()).hiddenRivals);
      if (box.checked) hidden.delete(box.dataset.player);
      else hidden.add(box.dataset.player);
      await savePreferences({ hiddenRivals: [...hidden] });
      await onChange();
    } catch (error) {
      console.error('[piuscores] Unable to save rival selection', error);
    }
  });

  container.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-delete]');
    if (!button) {
      const rival = event.target.closest('.rival');
      if (!rival || event.target.closest('input, a')) return;
      // Clicking the header of the focused rival folds it back.
      const unfocus = rival.classList.contains('focused');
      if (unfocus && !event.target.closest('.rival-toggle')) return;
      focusedRival = unfocus ? null : rival.dataset.rival;
      for (const other of container.querySelectorAll('.rival')) {
        other.classList.toggle('focused', other.dataset.rival === focusedRival);
      }
      return;
    }
    const { delete: playerId, name, own } = button.dataset;
    const question = own
      ? 'Delete all your saved scores? Your player record is kept. This cannot be undone.'
      : `Delete ${name} and all their saved scores? This cannot be undone.`;
    if (!window.confirm(question)) return;
    try {
      await deletePlayer(playerId);
      await onChange();
    } catch (error) {
      console.error('[piuscores] Unable to delete player data', error);
    }
  });

  // Rivals (and you) are sorted by pumbility (highest first); those without one follow alphabetically.
  // Each rival shows how many of their charts you lose / haven't played / win.
  // Below the links: scores and sessions grabbed by the scrap button, and stored best scores.
  function render(charts, players, ownPlayerId, hidden, bestCounts) {
    const rivalStats = {};
    for (const chart of charts) {
      for (const rival of chart.rivals) {
        const counts = (rivalStats[rival.playerId] ||= { lose: 0, win: 0, unplayed: 0 });
        counts[rival.delta === null ? 'unplayed' : rival.delta < 0 ? 'lose' : 'win']++;
      }
    }
    const ids = new Set(Object.keys(players));
    for (const chart of charts) for (const rival of chart.rivals) ids.add(rival.playerId);
    if (ownPlayerId) ids.add(ownPlayerId);
    const rivals = [...ids].map((playerId) => ({
      playerId,
      name: displayName(players[playerId]?.name || playerId),
      pumbility: typeof players[playerId]?.pumbility === 'number' ? players[playerId].pumbility : null,
    }));
    rivals.sort((a, b) => (b.pumbility ?? -1) - (a.pumbility ?? -1)
      || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    container.innerHTML = rivals.length
      ? rivals.map(({ playerId, name, pumbility }) => {
        const me = playerId === ownPlayerId;
        const on = me || !hidden.has(playerId);
        const base = `https://piuscores.arroweclip.se/Player/${encodeURIComponent(playerId)}`;
        const toggle = me
          ? '<span class="rival-spacer"></span>'
          : `<input type="checkbox" data-player="${esc(playerId)}"${on ? ' checked' : ''}>`;
        const focused = playerId === focusedRival ? ' focused' : '';
        return `<div class="rival${on ? '' : ' off'}${me ? ' me' : ''}${focused}" data-rival="${esc(playerId)}">`
          + `<div class="rival-toggle" title="${esc(name)}">${toggle}`
          + `<span class="rival-name">${esc(name)}</span><span class="rival-pum">${fmt(pumbility)}</span></div>`
          + `<div class="rival-scrap"><div class="rival-counts" title="scraped scores · best scores · scraped sessions">${
            scrapLine(players[playerId]?.scrapStats, bestCounts[playerId])}</div>`
          + (me ? '' : `<div class="rival-stats" title="charts: losing / not played / best">${
            statWords(rivalStats[playerId] || { lose: 0, win: 0, unplayed: 0 }, ' · ')}</div>`)
          + '</div>'
          + `<div class="rival-links"><a class="rival-link" href="${base}">${me ? 'My page' : 'Rival'}</a>`
          + `<a class="rival-link" href="${base}/Sessions">Sessions</a>`
          + `<button class="rival-link rival-delete" type="button" data-delete="${esc(playerId)}" `
          + `data-name="${esc(name)}"${me ? ' data-own="1"' : ''} `
          + `title="${me ? 'Delete all your saved scores' : 'Delete this player and all their saved scores'}">Delete</button>`
          + '</div>'
          + '</div>';
      }).join('')
      : '<div class="muted">No rivals yet</div>';
    if (pendingScroll) {
      pendingScroll = false;
      const focused = container.querySelector('.rival.focused');
      if (focused) focused.scrollIntoView({ block: 'nearest' });
    }
  }

  // Focuses `playerId` on the next render, and scrolls it into view.
  function focus(playerId) {
    focusedRival = playerId;
    pendingScroll = true;
  }

  return { render, focus };
}
