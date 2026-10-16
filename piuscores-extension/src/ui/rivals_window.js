import {
  byTargetWeight, daysSince, loadCharts, loadPlayers, loadPreferences, targetWeight, withRivals,
} from '../storage.js';
import { chartResultsStyles, createChartResults } from './rivals/chart_results.js';
import { chartTier, levelStats, resultCounts, tierCounts } from './rivals/common.js';
import { chartsGroupsStyles, createChartsGroups, sortedLevels } from './rivals/charts_groups.js';
import { createRivalList, rivalListStyles } from './rivals/rivals_list.js';
import { readUiState, saveUiState } from './rivals/ui_state.js';
import { createWindowHeader, windowHeaderStyles } from './rivals/window_header.js';
import { buttonStack, uiRoot, useStyles } from './ui_host.js';

const windowStyles = `
  .overlay { position: fixed; inset: 0; z-index: 2147483646; background: rgba(0,0,0,.6);
             display: flex; align-items: center; justify-content: center;
             font: 20px/1.4 Roboto, Arial, sans-serif; color: #EAF5EC; }
  .overlay[hidden] { display: none; }
  .dialog { background: #14201A; border: 1px solid #2B4034; border-radius: 8px;
            width: min(1400px, calc(100vw - 32px)); height: 90vh;
            display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,.6); }
  .dlg-main { display: flex; flex: 1; min-height: 0; }
`;

const styles = windowStyles + windowHeaderStyles + rivalListStyles + chartsGroupsStyles + chartResultsStyles;


// The RIVALS button and the window it opens.
// `pagePlayerId` returns the player whose page is open, if any.
export function createRivalsWindow(exportTargets, pagePlayerId) {
  const state = readUiState();
  let showButton = null;
  let overlay = null;
  let header = null;
  let rivalList = null;
  let chartsGroups = null;
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
    overlay.hidden = ! state.isOpen;
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

    chartsGroups = createChartsGroups(overlay.querySelector('.filters'), (level) => {
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

    const [allCharts, { players, ownPlayerId, bestCounts }, preferences] =
      await Promise.all([loadCharts(), loadPlayers(), loadPreferences()]);

    const { hiddenRivals, tryCooldown, npMinimalRivals } = preferences;
    const hidden = new Set(hiddenRivals);
    // A solo rival is compared alone, whatever the stored selection says.
    const solo = rivalList.soloRival();
    const included = (playerId) => solo ? playerId === solo : ! hidden.has(playerId);

    // Lost charts tried within the try cooldown stay hidden until it passes; unknown dates never hide.
    const coolingDown = (chart) => {
      const days = daysSince(chart.myDates.lastTryDate);
      return chartTier(chart) === 'rivals-win'  &&  days !== null  &&  days < tryCooldown;
    };

    const shownCharts = allCharts
      .map((chart) => withRivals(chart, (rival) => included(rival.playerId)))
      .filter(Boolean)
      // Unplayed charts count as np only once enough shown rivals have played them.
      .filter((chart) => ! chart.unplayed  ||  chart.rivals.length >= npMinimalRivals);

    const charts = shownCharts.filter((chart) => ! coolingDown(chart));
    const coolingCharts = shownCharts.filter(coolingDown);

    // Charts a rival beats you on only by the uncapped score, so the score cap turns the loss into a draw.
    const isCapLoss = (chart) => chartTier(chart) !== 'rivals-win'
      &&  chart.rivals.some((rival) => rival.realDelta !== null  &&  rival.realDelta < 0);

    const capLosses = charts
      .filter(isCapLoss)
      .map((chart) => ({ ...chart, weight: targetWeight(chart.rivals.map((rival) => rival.realDelta)) }));

    const levels = sortedLevels(shownCharts);
    if (! levels.includes(state.selectedLevel)) {
      state.selectedLevel = levels[0] ?? null;
      saveUiState(state);
    }

    const { countBy } = preferences;
    const totals = countBy === 'charts' ? tierCounts(charts) : resultCounts(charts);
    header.render(players[ownPlayerId], totals, preferences);
    // In solo mode the solo rival's stats are the header's, with all the settings applied.
    rivalList.render(allCharts, players, ownPlayerId, hidden, bestCounts, solo ? totals : null, countBy);
    // The level bars count score-cap losses as hidden losses rather than wins.
    const barCharts = charts.filter((chart) => ! isCapLoss(chart));
    const hiddenCharts = [...coolingCharts, ...capLosses];
    chartsGroups.render(barCharts, hiddenCharts, state.selectedLevel, countBy);

    const emptyMessage = allCharts.length === 0
      ? 'No saved rival scores yet — grab them on a player\'s Sessions page.'
      : shownCharts.length === 0
        ? 'No charts for the selected rivals — check some rivals on the left.'
        : null;

    const atLevel = (chart) => chart.chart === state.selectedLevel;
    // Counted by results, the tabs show the selected level's bar numbers; by charts they count their own lists.
    const tabResults = countBy === 'results' ? levelStats(barCharts.filter(atLevel), hiddenCharts.filter(atLevel)).results : null;
    chartResults.render(
      charts.filter(atLevel),
      [
        { label: 'Try cooldown', charts: coolingCharts.filter(atLevel).sort(byTargetWeight) },
        { label: 'Score cap', charts: capLosses.filter(atLevel).sort(byTargetWeight) },
      ],
      state.selectedTab,
      players[ownPlayerId]?.name  ||  'You',
      emptyMessage,
      tabResults,
      preferences.scoreCap,
    );
  }

  function setOpen(isOpen) {
    state.isOpen = isOpen;
    saveUiState(state);
    ensure();
    overlay.hidden = ! isOpen;
    showButton.hidden = isOpen;
  }

  // Whenever the window opens on a player's page, that rival is focused in the list.
  function focusPagePlayer() {
    const playerId = pagePlayerId();
    if (playerId)
      rivalList.focus(playerId);
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
    if (! state.isOpen)
      return;

    focusPagePlayer();
    rerender();
  }

  return { initialize, render, isOpen: () => state.isOpen };
}
