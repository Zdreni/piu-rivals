import { TABS, type TabId } from '../../data/stats.ts';

// The selected level and tabs, kept in this browser so the view reopens where it was.
const UI_STATE_KEY = 'piu-rivals.rivals.uiState';

// The rivals column's tabs: your rivals, or the other players to add.
export type RivalTab = 'mine' | 'others';

export interface UiState {
  selectedLevel: string | null;
  selectedTab: TabId;
  rivalTab: RivalTab;
}

const DEFAULT_STATE: UiState = { selectedLevel: null, selectedTab: 'rivals-win', rivalTab: 'mine' };


export function readUiState(): UiState {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (! raw)
      return DEFAULT_STATE;

    const saved = JSON.parse(raw);
    return {
      selectedLevel: (typeof saved.selectedLevel === 'string'  ?  saved.selectedLevel  :  null),
      selectedTab: TABS.find((id)  =>  id === saved.selectedTab)  ??  DEFAULT_STATE.selectedTab,
      rivalTab: (saved.rivalTab === 'others'  ?  'others'  :  'mine'),
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
