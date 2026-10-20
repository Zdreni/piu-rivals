import type { Preferences as StoredPreferences } from '@piu-rivals/shared';

// The Rivals view's settings, kept on the server as the user's preferences.
export const MIN_SCORE_CAP = 995000;
export const MAX_SCORE_CAP = 1000000;
export const SCORE_CAP_STEP = 1000;
export const MIN_NP_RIVALS = 1;
export const MAX_NP_RIVALS = 5;
// What the lost / np / won stats count; the first is the default.
export const COUNT_BY_OPTIONS = ['results', 'charts'] as const;

export type CountBy = typeof COUNT_BY_OPTIONS[number];

export interface Preferences {
  // Scores at or above it compare as equal to it; MAX_SCORE_CAP is no cap.
  scoreCap: number;
  // Unplayed charts count as np only once this many shown rivals have played them.
  npMinimalRivals: number;
  countBy: CountBy;
}


export const clampScoreCap = (cap: number) =>
  Math.min(MAX_SCORE_CAP, Math.max(MIN_SCORE_CAP, Math.round(cap / SCORE_CAP_STEP) * SCORE_CAP_STEP));

export const clampNpMinimalRivals = (count: number) => Math.min(MAX_NP_RIVALS, Math.max(MIN_NP_RIVALS, Math.round(count)));


// Stored preferences are whatever a page saved, so anything missing or invalid falls back to its default.
export function parsePreferences(stored: StoredPreferences): Preferences {
  const { scoreCap, npMinimalRivals, countBy } = stored;
  return {
    scoreCap: typeof scoreCap === 'number' ? clampScoreCap(scoreCap) : MAX_SCORE_CAP,
    npMinimalRivals: typeof npMinimalRivals === 'number' ? clampNpMinimalRivals(npMinimalRivals) : MIN_NP_RIVALS,
    countBy: COUNT_BY_OPTIONS.find((option) => option === countBy)  ??  COUNT_BY_OPTIONS[0],
  };
}
