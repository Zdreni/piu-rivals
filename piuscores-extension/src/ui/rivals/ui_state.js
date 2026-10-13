import { TABS } from './common.js';

// Kept per tab, so the window reopens where it was after navigating to another page.
const UI_STATE_KEY = 'piuscores.rivalScores.uiState';
const DEFAULT_STATE = { isOpen: false, selectedLevel: null, selectedTab: 'rivals-win' };


export function readUiState() {
  try {
    const raw = sessionStorage.getItem(UI_STATE_KEY);
    if (!raw) return { ...DEFAULT_STATE };

    const saved = JSON.parse(raw);
    return {
      isOpen: saved.isOpen === true,
      selectedLevel: typeof saved.selectedLevel === 'string' ? saved.selectedLevel : null,
      selectedTab: TABS.some(({ id }) => id === saved.selectedTab) ? saved.selectedTab : DEFAULT_STATE.selectedTab,
    };
  } catch (error) {
    console.error('[piuscores] Unable to restore rival scores window state', error);
    return { ...DEFAULT_STATE };
  }
}


export function saveUiState({ isOpen, selectedLevel, selectedTab }) {
  try {
    sessionStorage.setItem(UI_STATE_KEY, JSON.stringify({ isOpen, selectedLevel, selectedTab }));
  } catch (error) {
    console.error('[piuscores] Unable to save rival scores window state', error);
  }
}
