import { deletePlayer, displayName, loadPreferences, savePreferences } from '../../storage.js';
import { rivalListItem, rivalListItemStyles } from './rivals_list_item.js';

export const rivalListStyles = `
  .rival-list { width: 285px; flex-shrink: 0; font-weight: 400; overflow-y: auto; padding: 10px 16px 10px 8px;
                border-right: 1px solid #2B4034; scrollbar-width: thin; scrollbar-color: #2B4034 transparent; }
  .rival-list:hover { scrollbar-color: #3D5A49 transparent; }
  .rival-list .muted { color: #9AB3A3; }
` + rivalListItemStyles;


// The rivals column: toggles which rivals are compared, and lets you open or delete a rival.
// `onChange` re-renders the window after the stored rivals or their visibility changed.
export function createRivalList(container, onChange) {
  // Only the focused rival in the list shows its stats and buttons.
  let focusedRival = null;
  let pendingScroll = false;

  container.addEventListener('change', async (event) => {
    const box = event.target.closest('input[data-player]');
    if (! box)
      return;

    try {
      const hidden = new Set((await loadPreferences()).hiddenRivals);
      if (box.checked)
        hidden.delete(box.dataset.player);
      else
        hidden.add(box.dataset.player);

      await savePreferences({ hiddenRivals: [...hidden] });
      await onChange();
    } catch (error) {
      console.error('[piuscores] Unable to save rival selection', error);
    }
  });

  container.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-delete]');
    if (! button) {
      const rival = event.target.closest('.rival');
      if (! rival  ||  event.target.closest('input, a'))
        return;

      // Clicking the header of the focused rival folds it back.
      const unfocus = rival.classList.contains('focused');
      if (unfocus  &&  ! event.target.closest('.rival-toggle'))
        return;

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
    if (! window.confirm(question))
      return;

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
    for (const chart of charts)
      for (const rival of chart.rivals)
        ids.add(rival.playerId);

    if (ownPlayerId)
      ids.add(ownPlayerId);

    const rivals = [...ids].map((playerId) => ({
      playerId,
      name: displayName(players[playerId]?.name  ||  playerId),
      pumbility: typeof players[playerId]?.pumbility === 'number' ? players[playerId].pumbility : null,
    }));
    rivals.sort((a, b) => (b.pumbility ?? -1) - (a.pumbility ?? -1)
      ||  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    container.innerHTML = rivals.length
      ? rivals.map((rival) => {
        const me = rival.playerId === ownPlayerId;
        return rivalListItem(rival, players[rival.playerId], {
          me,
          on: me  ||  ! hidden.has(rival.playerId),
          focused: rival.playerId === focusedRival,
          stats: rivalStats[rival.playerId]  ||  { lose: 0, win: 0, unplayed: 0 },
          best: bestCounts[rival.playerId],
        });
      }).join('')
      : '<div class="muted">No rivals yet</div>';

    if (pendingScroll) {
      pendingScroll = false;

      const focused = container.querySelector('.rival.focused');
      if (focused)
        focused.scrollIntoView({ block: 'nearest' });
    }
  }

  // Focuses `playerId` on the next render, and scrolls it into view.
  function focus(playerId) {
    focusedRival = playerId;
    pendingScroll = true;
  }

  return { render, focus };
}
