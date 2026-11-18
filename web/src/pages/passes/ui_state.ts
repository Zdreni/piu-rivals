// The Passes page's selected level and tab, kept in this browser so the page reopens where it was.
const UI_STATE_KEY = 'piu-rivals.passes.uiState';

export type PassesTab = 'played' | 'not-played';

export interface PassesUiState {
  selectedLevel: string | null;
  selectedTab: PassesTab;
}

const DEFAULT_STATE: PassesUiState = { selectedLevel: null, selectedTab: 'played' };


export function readPassesUiState(): PassesUiState {
  try {
    const rawState = localStorage.getItem(UI_STATE_KEY);
    if (! rawState)
      return DEFAULT_STATE;

    const savedState = JSON.parse(rawState);
    return {
      selectedLevel: (typeof savedState.selectedLevel === 'string'  ?  savedState.selectedLevel  :  null),
      selectedTab: (savedState.selectedTab === 'not-played'  ?  'not-played'  :  'played'),
    };
  } catch {
    return DEFAULT_STATE;
  }
}


export function savePassesUiState(state: PassesUiState) {
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
  } catch {
    // Kept for this visit only.
  }
}
