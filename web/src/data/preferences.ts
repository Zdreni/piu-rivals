import type { Preferences as StoredPreferences } from '@piu-rivals/shared';

// The Rivals view's settings, kept on the server as the user's preferences.
export const MIN_SCORE_CAP = 995000;
export const MAX_SCORE_CAP = 1000000;
export const SCORE_CAP_STEP = 1000;
export const MIN_NP_RIVALS = 1;
export const MAX_NP_RIVALS = 5;
// Charts are compared from the minimal level up to the maximal one; MAX_LEVEL is no upper limit. Until they're set,
// both follow your own scores (see autoLevels); with no scores yet, lower levels are left out, as in the old extension.
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 28;
export const DEFAULT_MIN_LEVEL = 10;
// The lowest level you have best scores on this many charts of is the automatic minimal level.
const AUTO_MIN_LEVEL_CHARTS = 3;
// What the lost / np / won stats count; the first is the default.
export const COUNT_BY_OPTIONS = ['results', 'charts'] as const;

export type CountBy = typeof COUNT_BY_OPTIONS[number];

export interface Preferences {
  // Scores at or above it compare as equal to it; MAX_SCORE_CAP is no cap.
  scoreCap: number;
  // Unplayed charts count as np only once this many shown rivals have played them.
  npMinimalRivals: number;
  countBy: CountBy;
  // Null until set: then they follow your scores.
  minLevel: number | null;
  maxLevel: number | null;
}

export type LevelRange = { minLevel: number; maxLevel: number };


export const clampScoreCap = (cap: number)  =>
  Math.min(MAX_SCORE_CAP, Math.max(MIN_SCORE_CAP, Math.round(cap / SCORE_CAP_STEP) * SCORE_CAP_STEP));

export const clampNpMinimalRivals = (count: number)  =>  Math.min(MAX_NP_RIVALS, Math.max(MIN_NP_RIVALS, Math.round(count)));

export const clampLevel = (level: number)  =>  Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)));

// Whether a chart's level is in the range; at MAX_LEVEL, higher levels are in too.
export const levelInRange = (level: number, { minLevel, maxLevel }: LevelRange)  =>
  level >= minLevel  &&  (maxLevel >= MAX_LEVEL  ||  level <= maxLevel);


// The level range that follows your scores (`playedLevels`, the level of each chart you have a best score on, singles
// and doubles alike): from the lowest level you have bests on at least AUTO_MIN_LEVEL_CHARTS charts of (or else the
// lowest you've played) up to one above the highest you've played.
export function autoLevels(playedLevels: number[]): LevelRange {
  if (! playedLevels.length)
    return { minLevel: DEFAULT_MIN_LEVEL, maxLevel: MAX_LEVEL };

  const counts = new Map<number, number>();
  for (const level of playedLevels)
    counts.set(level, (counts.get(level)  ??  0) + 1);

  const levels = [...counts.keys()].sort((a, b)  =>  a - b);
  const lowestLevel = levels[0]!, highestLevel = levels[levels.length - 1]!;
  const min = levels.find((level)  =>  counts.get(level)! >= AUTO_MIN_LEVEL_CHARTS)  ??  lowestLevel;
  return { minLevel: clampLevel(min), maxLevel: clampLevel(highestLevel + 1) };
}


// The settings' level range, with what isn't set following your scores. A range set upside down keeps its minimal
// level, unless only the maximal one is set.
export function resolveLevels({ minLevel, maxLevel }: Preferences, auto: LevelRange): LevelRange {
  const min = minLevel  ??  auto.minLevel, max = maxLevel  ??  auto.maxLevel;
  if (min <= max)
    return { minLevel: min, maxLevel: max };

  return (minLevel === null  ?  { minLevel: max, maxLevel: max }  :  { minLevel: min, maxLevel: min });
}


// Stored preferences are whatever a page saved, so anything missing or invalid falls back to its default.
export function parsePreferences(stored: StoredPreferences): Preferences {
  const { scoreCap, npMinimalRivals, countBy, minLevel, maxLevel } = stored;
  return {
    scoreCap: (typeof scoreCap === 'number'  ?  clampScoreCap(scoreCap)  :  MAX_SCORE_CAP),
    npMinimalRivals: (typeof npMinimalRivals === 'number'  ?  clampNpMinimalRivals(npMinimalRivals)  :  MIN_NP_RIVALS),
    countBy: COUNT_BY_OPTIONS.find((option)  =>  option === countBy)  ??  COUNT_BY_OPTIONS[0],
    minLevel: (typeof minLevel === 'number'  ?  clampLevel(minLevel)  :  null),
    maxLevel: (typeof maxLevel === 'number'  ?  clampLevel(maxLevel)  :  null),
  };
}
