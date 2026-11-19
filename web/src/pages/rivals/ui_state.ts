import { TABS, type TabId } from '../../data/stats.ts';

// The selected tabs, kept in this browser so the view reopens where it was.
const UI_STATE_KEY = 'piu-rivals.rivals.uiState';

// The Setup page's lists: your rivals, or the other players to add.
export type RivalTab = 'mine' | 'others';

// The Setup page's tabs: its two lists and the preferences.
export type SetupTab = RivalTab | 'preferences';

// `rivalTab` is the list last open, which stays so while the preferences are.
export interface UiState {
  selectedTab: TabId;
  rivalTab: RivalTab;
  preferencesAreOpen: boolean;
}

const DEFAULT_STATE: UiState = { selectedTab: 'rivals-win', rivalTab: 'mine', preferencesAreOpen: false };


export function readUiState(): UiState {
  try {
    const rawState = localStorage.getItem(UI_STATE_KEY);
    if (! rawState)
      return DEFAULT_STATE;

    const savedState = JSON.parse(rawState);
    return {
      selectedTab: TABS.find((id)  =>  id === savedState.selectedTab)  ??  DEFAULT_STATE.selectedTab,
      rivalTab: (savedState.rivalTab === 'others'  ?  'others'  :  'mine'),
      preferencesAreOpen: savedState.preferencesAreOpen === true,
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
