import { TABS, type TabId } from './stats.ts';

// The selected level and tab, kept in this browser so the view reopens where it was.
const UI_STATE_KEY = 'piu-rivals.rivals.uiState';

export interface UiState {
  selectedLevel: string | null;
  selectedTab: TabId;
}

const DEFAULT_STATE: UiState = { selectedLevel: null, selectedTab: 'rivals-win' };


export function readUiState(): UiState {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (! raw)
      return DEFAULT_STATE;

    const saved = JSON.parse(raw);
    return {
      selectedLevel: typeof saved.selectedLevel === 'string' ? saved.selectedLevel : null,
      selectedTab: TABS.find((id) => id === saved.selectedTab)  ??  DEFAULT_STATE.selectedTab,
    };
  } catch {
    return DEFAULT_STATE;
  }
}


export function saveUiState(state: UiState) {
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
  } catch {
    // Kept for this visit only.
  }
}
