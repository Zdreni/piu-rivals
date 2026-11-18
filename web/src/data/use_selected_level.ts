import { useCallback, useState } from 'react';

// The level selected on the Rivals and Passes pages, shared by both and kept in this browser.
const SELECTED_LEVEL_KEY = 'piu-rivals.selectedLevel';


function readSelectedLevel(): string | null {
  try {
    return localStorage.getItem(SELECTED_LEVEL_KEY);
  } catch {
    return null;
  }
}


// The level saved, and a function to select another one.
// A page whose levels don't include the saved one shows its first level instead, but doesn't save it, so that the
//  other page still opens on the saved level.
export function useSelectedLevel(): { savedLevel: string | null; selectLevel: (level: string) => void } {
  const [savedLevel, setSavedLevel] = useState(readSelectedLevel);
  const selectLevel = useCallback((level: string)  => {
    setSavedLevel(level);
    try {
      localStorage.setItem(SELECTED_LEVEL_KEY, level);
    } catch {
      // Kept for this visit only.
    }
  }, []);

  return { savedLevel, selectLevel };
}


// The level shown out of `levels`: the saved one, or the first.
export const shownLevel = (savedLevel: string | null, levels: string[])  =>  (
  (savedLevel !== null  &&  levels.includes(savedLevel))  ?  savedLevel  :  levels[0]  ??  null
);
