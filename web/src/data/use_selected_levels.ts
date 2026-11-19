import { useCallback, useState } from 'react';

// The levels selected on the Rivals and Passes pages, shared by both and kept in this browser.
const SELECTED_LEVELS_KEY = 'piu-rivals.selectedLevels';
// Where the one level selected was kept before several could be, read until the levels are first saved.
const SELECTED_LEVEL_KEY = 'piu-rivals.selectedLevel';


function readSelectedLevels(): string[] {
  try {
    const savedLevels = localStorage.getItem(SELECTED_LEVELS_KEY);
    if (savedLevels !== null) {
      const levels: unknown = JSON.parse(savedLevels);
      return (Array.isArray(levels)  ?  levels.filter((level): level is string  =>  typeof level === 'string')  :  []);
    }

    const oldLevel = localStorage.getItem(SELECTED_LEVEL_KEY);
    return ((oldLevel === null)  ?  []  :  [oldLevel]);
  } catch {
    return [];
  }
}


// The levels saved, and a function to select others.
// A page shows only the saved levels it has, or its first level if it has none of them, but doesn't save that, so that
//  the other page still opens on the levels saved.
export function useSelectedLevels(): { savedLevels: string[]; selectLevels: (levels: string[]) => void } {
  const [savedLevels, setSavedLevels] = useState(readSelectedLevels);
  const selectLevels = useCallback((levels: string[])  => {
    setSavedLevels(levels);
    try {
      localStorage.setItem(SELECTED_LEVELS_KEY, JSON.stringify(levels));
    } catch {
      // Kept for this visit only.
    }
  }, []);

  return { savedLevels, selectLevels };
}


// The levels shown out of `levels`, in their order: the saved ones, or the first.
export function shownLevels(savedLevels: string[], levels: string[]) {
  const savedShownLevels = levels.filter((level)  =>  savedLevels.includes(level));
  return (savedShownLevels.length  ?  savedShownLevels  :  levels.slice(0, 1));
}
