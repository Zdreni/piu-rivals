// Tries have no time or ID of their own, so a try is told apart only by its stats.

export interface TryStats {
  chartId: number;
  score: number;
  passed: boolean;
  perfect: number | null;
  great: number | null;
  good: number | null;
  bad: number | null;
  miss: number | null;
  maxCombo: number | null;
}

export const tryKey = (t: TryStats)  =>
  [t.chartId, t.score, t.passed, t.perfect, t.great, t.good, t.bad, t.miss, t.maxCombo].join('|');


// A grown session holds the tries stored from it before, plus new ones. Returns the tries of
// `scanned` that aren't stored yet, counting identical tries: a try stored twice and scanned
// three times adds one.
export function newTries<T extends TryStats>(stored: TryStats[], scanned: T[]): T[] {
  const remaining = new Map<string, number>();
  for (const t of stored)
    remaining.set(tryKey(t), (remaining.get(tryKey(t))  ??  0) + 1);

  return scanned.filter((t)  => {
    const left = remaining.get(tryKey(t))  ??  0;
    if (left === 0)
      return true;

    remaining.set(tryKey(t), left - 1);
    return false;
  });
}
