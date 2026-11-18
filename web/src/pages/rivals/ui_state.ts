import { TABS, type TabId } from '../../data/stats.ts';

// The selected tabs, kept in this browser so the view reopens where it was.
const UI_STATE_KEY = 'piu-rivals.rivals.uiState';

// The rivals column's tabs: your rivals, or the other players to add.
export type RivalTab = 'mine' | 'others';

export interface UiState {
  selectedTab: TabId;
  rivalTab: RivalTab;
}

const DEFAULT_STATE: UiState = { selectedTab: 'rivals-win', rivalTab: 'mine' };


export function readUiState(): UiState {
  try {
    const rawState = localStorage.getItem(UI_STATE_KEY);
    if (! rawState)
      return DEFAULT_STATE;

    const savedState = JSON.parse(rawState);
    return {
      selectedTab: TABS.find((id)  =>  id === savedState.selectedTab)  ??  DEFAULT_STATE.selectedTab,
      rivalTab: (savedState.rivalTab === 'others'  ?  'others'  :  'mine'),
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
