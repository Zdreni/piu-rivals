import { loadCharts, loadPlayers, loadPreferences, withRivals } from '../storage.js';
import { chartResultsStyles, createChartResults } from './rivals/chart_results.js';
import { tierCounts } from './rivals/common.js';
import { createLevelChart, levelChartStyles, sortedLevels } from './rivals/level_chart.js';
import { createRivalList, rivalListStyles } from './rivals/rival_list.js';
import { readUiState, saveUiState } from './rivals/ui_state.js';
import { createWindowHeader, windowHeaderStyles } from './rivals/window_header.js';
import { buttonStack, uiRoot, useStyles } from './ui_host.js';

const windowStyles = `
  .overlay { position: fixed; inset: 0; z-index: 2147483646; background: rgba(0,0,0,.6);
             display: flex; align-items: center; justify-content: center;
             font: 20px/1.4 Roboto, Arial, sans-serif; color: #EAF5EC; }
  .overlay[hidden] { display: none; }
  .dialog { background: #14201A; border: 1px solid #2B4034; border-radius: 8px;
            width: min(1200px, calc(100vw - 32px)); height: 90vh;
            display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,.6); }
  .dlg-main { display: flex; flex: 1; min-height: 0; }
`;

const styles = windowStyles + windowHeaderStyles + rivalListStyles + levelChartStyles + chartResultsStyles;


// The RIVALS button and the window it opens.
// `pagePlayerId` returns the player whose page is open, if any.
export function createRivalsWindow(exportTargets, pagePlayerId) {
  const state = readUiState();
  let showButton = null;
  let overlay = null;
  let header = null;
  let rivalList = null;
  let levelChart = null;
  let chartResults = null;

  const rerender = () => render().catch((error) => console.error('[piuscores]', error));


  function ensure() {
    if (overlay) {
      uiRoot();
      return;
    }

    const root = useStyles('rivals', styles);
    showButton = document.createElement('button');
    showButton.className = 'btn show-scores';
    showButton.type = 'button';
    showButton.title = 'Show all saved rival scores';
    showButton.textContent = 'RIVALS';
    showButton.hidden = state.isOpen;
    showButton.addEventListener('click', () => open());
    buttonStack().appendChild(showButton);

    overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.hidden = !state.isOpen;
    overlay.innerHTML = `
      <div class="dialog" role="dialog" aria-label="Rival scores">
        <div class="dlg-head"></div>
        <div class="dlg-main">
          <div class="rival-list" aria-label="Rivals"></div>
          <div class="filters"></div>
          <div class="score-content"></div>
        </div>
      </div>`;
    root.appendChild(overlay);
    header = createWindowHeader(overlay.querySelector('.dlg-head'), {
      exportTargets,
      onChange: render,
      onCleared: () => {
        state.selectedLevel = null;
        state.selectedTab = 'rivals-win';
        return render();
      },
      onClose: () => close(),
    });
    rivalList = createRivalList(overlay.querySelector('.rival-list'), render);
    levelChart = createLevelChart(overlay.querySelector('.filters'), (level) => {
      state.selectedLevel = level;
      saveUiState(state);
      rerender();
    });
    chartResults = createChartResults(overlay.querySelector('.score-content'), (tab) => {
      state.selectedTab = tab;
      saveUiState(state);
      rerender();
    });
  }

  async function render() {
    ensure();
    const [allCharts, { players, ownPlayerId, bestCounts }, { hiddenRivals, scoreCap }] =
      await Promise.all([loadCharts(), loadPlayers(), loadPreferences()]);
    const hidden = new Set(hiddenRivals);
    const charts = allCharts
      .map((chart) => withRivals(chart, (rival) => !hidden.has(rival.playerId)))
      .filter(Boolean);
    const levels = sortedLevels(charts);
    if (!levels.includes(state.selectedLevel)) {
      state.selectedLevel = levels[0] ?? null;
      saveUiState(state);
    }

    header.render(players[ownPlayerId], tierCounts(charts), scoreCap);
    rivalList.render(allCharts, players, ownPlayerId, hidden, bestCounts);
    levelChart.render(charts, state.selectedLevel);

    const emptyMessage = allCharts.length === 0
      ? 'No saved rival scores yet — grab them on a player\'s Sessions page.'
      : charts.length === 0
        ? 'No charts for the selected rivals — check some rivals on the left.'
        : null;
    chartResults.render(
      charts.filter((chart) => chart.chart === state.selectedLevel),
      state.selectedTab,
      players[ownPlayerId]?.name || 'You',
      emptyMessage,
    );
  }

  function setOpen(isOpen) {
    state.isOpen = isOpen;
    saveUiState(state);
    ensure();
    overlay.hidden = !isOpen;
    showButton.hidden = isOpen;
  }

  // Whenever the window opens on a player's page, that rival is focused in the list.
  function focusPagePlayer() {
    const playerId = pagePlayerId();
    if (playerId) rivalList.focus(playerId);
  }

  function open() {
    setOpen(true);
    focusPagePlayer();
    rerender();
  }

  function close() {
    setOpen(false);
  }

  function initialize() {
    ensure();
    if (!state.isOpen) return;
    focusPagePlayer();
    rerender();
  }

  return { initialize, render, isOpen: () => state.isOpen };
}
